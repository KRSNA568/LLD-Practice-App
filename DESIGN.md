# Design Note

## 1. The bet

**Stress-test the design; do not grade the artifact.**

Every LLD tool grades a static submission. But a design's quality is *defined* by two things a static
artifact cannot show: what happens when you run a scenario through it, and what happens when the
requirements change. Both can be measured rather than judged. So one attempt here runs the practice
loop three times — **design, change, defend** — and each pass produces a different kind of evidence.

Everything else follows from the older promise, which still holds: feedback is only useful if it
**points at something in the learner's own design.** No reference solution, because ten good engineers
write ten different designs. No score out of a hundred, because nobody can defend the difference
between 71 and 74. A rubric, with every finding citing a class, a relationship, a walkthrough step, a
decision or a quote the learner actually wrote — checked before they ever see it.

## 2. Scope

**Built:** four instrumented problems · one submission format with three facets (structure, behaviour,
rationale) · eight rubric criteria, six measured and two read · a three-stage attempt with the same
lifecycle guarantees at every stage · a critique warm-up · report with clickable evidence and a
before/after diff · history with recurring-weakness detection and a next-problem recommendation · a
calibration suite of 13 gold designs that gates every evaluator change.

**Deliberately not built:** authentication, multi-tenancy, a code sandbox, a diagram editor, LLM-generated
probes, learner-versus-learner comparison, a problem-authoring UI. §10 says which of these come next
and why the seams are already in place.

## 3. The loop

```
  CRITIQUE (optional)     DESIGN + RUN            CHANGE                 DEFEND
  two designs, one        classes, relations,     requirements shift,    ≤3 probes drawn from
  question, click the     decisions — then walk   revise the design —    your own findings,
  deciding class          3 scenarios through it  blast radius measured  answer in prose
  ─────────────────       ─────────────────────   ──────────────────     ─────────────────
  measured (authored)     measured + 1 read       measured               read
```

The brief's loop — *choose → design → submit → feedback → review → try again* — is preserved exactly.
It now runs up to three times inside one attempt, and the learner can stop after any pass with a
complete report for the passes done. A full run takes about 40 minutes; a second attempt at the same
problem opens prefilled from where the last one *ended* — the revision, not the original — and is
dealt a different hidden change.

| Stage | The learner produces | Evidence | Who scores it |
|---|---|---|---|
| **Design** | classes, relationships, assumptions, decision records | structure, rationale | four measured criteria + one read |
| **Run** | per scenario, an ordered list of `Class ▸ method` steps and an outcome | behaviour | measured |
| **Change** | the design revised against a change revealed only after v1 froze, plus a rationale | the v1 → v2 diff | measured |
| **Defend** | answers to probes chosen by what the evaluator found | reasoning | read, every citation verified |

The critique warm-up sits before the first attempt: two authored designs, a question about change,
one click on the class that decides it, then a paragraph of *telling*. No evaluator runs. It exists
because contrasting cases prepare a learner to learn from what comes next (RESEARCH.md §3.3).

## 4. The class model

`apps/api/src/domain/` is pure — no framework imports, no I/O. A reviewer can read the product there.

| Type | Owns | Depends on | What will change |
|---|---|---|---|
| `Problem` | Brief, requirements with **keywords**, **variation points**, **scenarios**, **hidden changes**, **probes**, **gold designs**, critique pairs, calibration bands | nothing | Constantly — it is content in `content/problems/*.json`, never code |
| `DesignModel` | The canonical design in three facets: structure (classes, relationships), behaviour (**walkthroughs**), rationale (**decisions**, trade-offs) | nothing | Only if a new capture format needs a field it cannot express |
| `DesignGraph` | Structural queries — orphans, cycles, implementers, canonical names, fingerprint | `DesignModel` | New queries as checks are added |
| `Walkthrough` | Resolves each step to a declared class and method; finds unexercised classes and the dominant one | `DesignGraph` | When behaviour checks get smarter |
| `DesignDiff` | What changed between two designs: added, removed, modified (by field), seams reused, blast radius | `DesignModel` | Rarely; it is a set difference |
| `Attempt` + `AttemptStateMachine` | Which transitions are legal; **`Stage`** is a second axis on top | nothing | Rarely — the table is small and new states are rows |
| `Submission` | One stage's frozen payload, fingerprint, idempotency key | `Stage` | Never |
| `Rubric` / `Criterion` | What is judged, by whom, **at which stage**, with band descriptors and anchors | nothing | Versioned content — §8 |
| `CriterionResult` | One finding: criterion, stage, score, **evidence**, concern, suggestion, confidence | `EvidenceRef` | Stable; every evaluator meets it |
| `Evaluator` | *Port.* Declares the criteria it can judge | `EvaluationContext` | Change Test B — §7 |
| `DesignCheck` | One measured question; declares its **stage** and the **facets** it needs | `EvaluationContext` | Adding one is adding a file |
| `SubmissionParser` | *Port.* Turns one capture format into a `DesignModel` and declares which **facets** it can supply | — | Change Test A — §7 |
| `ProbeSelector` | Picks ≤3 authored probes triggered by the findings, substituting the cited class into the prompt | `CriterionResult`, `Probe` | When probes become generated |
| `RecurringWeakness` · `NextProblem` | A criterion that keeps failing; the problem that exercises it | `Rubric`, `Problem` | When mastery becomes concept-level |

### The three abstractions that earn their place

**`EvidenceRef`** is a discriminated union over *positions in a design*, not free text:

```ts
type EvidenceRef =
  | { kind: 'class';        name: string }
  | { kind: 'relationship'; from: string; to: string }
  | { kind: 'assumption';   index: number }
  | { kind: 'decision';     index: number }
  | { kind: 'step';         scenarioId: string; index: number }
  | { kind: 'prose';        field: 'tradeoffs' | 'rationale' | 'answer'; probeId?: string; quote: string }
```

Because it is structural, the UI can highlight *step 3 of the exit scenario*, the grounding validator
can verify that step exists, and a finding cannot be written without pointing at something. The two
new kinds, `step` and `decision`, are what let behaviour and rationale findings be as precise as
structural ones.

**Facets.** A `DesignModel` has three facets, and every `DesignCheck` declares which it reads. When a
future capture format cannot supply one — a class diagram has no walkthroughs — the checks that need
it are *omitted*, never scored zero. This is the sensible place for the variation the brief asks for,
and it is exercised in tests today.

**`Stage` as an axis, not a second state machine.** `DRAFT → SUBMITTED → EVALUATING → COMPLETED |
COMPLETED_PARTIAL | FAILED` runs once *per stage*. `Attempt.stage` advances only from a completed
stage, seeding the next draft. Persist-before-evaluate, idempotency, fingerprinting and retry are
written once and reused three times; nothing about them had to know stages exist.

### Abstractions deliberately not added

- **No repository interface over Prisma.** The domain is already pure; a port with one implementation
  that will never be swapped is indirection with nothing behind it. `PracticeService` says so.
- **No event bus.** A direct call plus a job queue does the job at this size.
- **No generated probes.** Authored probes selected by findings give the same targeting with zero
  hallucination risk. Generation is a later `ProbeSource`, not a missing feature.
- **No mastery model.** `NextProblem` gets the product effect in forty lines (§10 has the rest).

## 5. Why a structured form — and what "Run it" adds

The brief asks for the *smallest* format that gives enough evidence.

| Format | What it proves | Why not now |
|---|---|---|
| Free text | Reasoning | Nothing is checkable; evaluation collapses to "ask the AI" |
| **Structured form** ✅ | Decomposition, responsibilities, relationships, behaviour, reasoning | Chosen |
| Code | Implementation, real coupling | A sandbox eats the budget and measures coding fluency; AlgoMaster already does this well |
| Diagram | Structure | A canvas is expensive; hand-drawn semantics are ambiguous; **and it cannot capture behaviour** |

**The form is a class diagram captured as a table** — class rows are nodes, relationship rows are
edges. The one-sentence cap on `responsibility` is a teaching device: a learner who cannot describe a
class without stacking "and"s has found their own god class before any evaluator runs.

**The Run section is a CRC-card role-play captured as a list.** The research finding that reshaped
this product is that the single most common novice fault — a class integrated into nothing, in 97% of
180 designs — is invisible in a class list and obvious the moment you try to execute a scenario
against it. So the learner walks three authored scenarios through their own design, step by
`Class ▸ method` step, ending each with *succeeds / refused / errors*. The editor teaches before the
evaluator does: a step naming a method the class does not declare is highlighted as you type, and a
chip strip shows which classes have not yet had a turn.

**Decisions** are the third facet: what was chosen, what was rejected, why. The alternative is the
part that matters; it is what a reviewer engages with and what the defend stage probes.

## 6. Evaluation

### AI reads; math measures

| Criterion | Stage | Owner | How |
|---|---|---|---|
| Requirement coverage | design | measured | Authored keywords per requirement, matched by stem against names, members, assumptions |
| Class responsibilities | design | measured | Clause and verb counts on the one-sentence responsibility; vague name × high degree |
| Coupling & cohesion | design | measured | Orphans, cycles, dangling references, coordinator hubs (inheritance edges excluded) |
| Use of abstraction | design | measured | A seam at each declared variation point, and whether it carries weight — implementers for an interface, users for an enum |
| **Behaviour** | design | measured | Every step lands on a declared class *and* method; failure scenarios end in refusal; no class dominates; no class idle |
| **Change resilience** | change | measured | The v1 → v2 diff — see the bands below |
| Edge cases | design | read | Assumptions plus whether the refusal path was actually traced |
| Reasoning | defend | read | Decisions, change rationale, probe answers |

Six of eight are decided from the graph, the walkthroughs and the diff. The two that go to the LLM are
the two that need *reading*. The research reason is specific: LLM graders identify classes at 97%
accuracy, associations at 85%, and late-introduced entities at 55–60%. They read prose well and count
edges badly, so they are never asked to count.

Each criterion has exactly **one** owner at exactly **one** stage. An earlier draft had twelve
overlapping criteria and one god class lost points under four of them.

### Change resilience — extensibility measured, not judged

The learner froze a design without knowing what would change. The change is revealed, they revise,
and `DesignDiff` compares the two:

| Band | What the diff shows |
|---|---|
| 4 | A new class plugged into an abstraction that **already existed**; at most one existing class touched to wire it in |
| 3 | A new class, but two or more existing classes reopened — or it extends a concrete class rather than a seam |
| 2 | No class added; the change absorbed by editing what already worked |
| 1 | As 2, plus a flag (`isElectric`), a type field or a branchy method added to an existing class — the finding names it |
| 0 | No revision, or nothing in the revised design owns the new vocabulary (`kwh`, `charging`…) |

This is what an interviewer's follow-up question measures, counted. "Seam reused" specifically
requires the abstraction to have existed *before* the change: adding an interface and its
implementation together is a refactor, not open-closed. Renames show as a removal plus an addition,
and the report says so rather than guessing.

### Behaviour — the design has to run

`WalkthroughCheck` resolves every step against the declared classes and methods. Three questions, in
order of cost: do the steps land on real members; does every scenario that should end in a refusal
actually end in one; is the work spread across the design or piled onto one class. That last one is
the god class seen from the behavioural side — a class with a modest responsibility sentence that
performs every step of every scenario is a god class that wrote a good sentence.

### Probes — questions from the learner's own findings

Probes are authored per problem with an optional trigger: *ask this if `abstraction-use` scored ≤ 2*.
`{{class}}` in the prompt is replaced with the class that finding cited, so the question is about
*their* `ParkingLotManager`. Triggered probes come first, worst finding first, capped at three, and
the selection is deterministic — the same findings always produce the same questions. The LLM reads
the answers against the authored `goodSignal`/`badSignal` and the band anchors.

### Keeping the LLM honest

1. **Constrained prompt** — fixed rubric, a *contrasting anchor per band* (models score more
   consistently against an example than a descriptor), the exact list of citable class names, required
   JSON. Never "is this a good design?".
2. **Schema validation** — one retry, then the criterion is *omitted*. A missing criterion is honest; an
   invented one is not.
3. **`EvidenceGroundingValidator`** — every citation is checked: a class against the graph, a step
   against the walkthrough it names, a decision against the recorded decisions, an answer quote against
   the answer to *that* probe. Invented references are dropped and confidence falls with them.

The stub client that runs with no API key applies the same contract: it parses the same prompt, is
graded by the same grounding, and is deterministic — which is what makes the calibration suite a real
test rather than a smoke test.

### Calibration as a publication gate

Every problem ships gold designs — 13 across the four problems — with an expected band per criterion.
`tests/evaluation/Calibration.test.ts` runs each through the real pipeline and fails if any score lands
outside its band, and separately asserts that *strong* beats every other gold design on every problem.
Building this found four real evaluator flaws before any learner did: coverage that let a `Vehicle`
class satisfy the fee requirement, an abstraction check that could not accept an enum as a seam, a
vague-name rule that penalised `PricingEngine`, and a behaviour check that expected `Car` to act. The
gold designs also drive the critique warm-up, so content and tests cannot drift apart.

## 7. The two change tests, answered

**A — "today text, later a class diagram."** A diagram parser is a new `SubmissionParser` producing the
same `DesignModel`, declaring `facets: ['structure']`. Every check that reads behaviour is omitted for
those submissions; the rubric, the report and the history screen never learn which format was used.
The test *"omits a check whose facet the capture format could not supply"* pins this.

**B — "today one evaluator, later a rule-based one or human review."** Both already exist and neither
knows about the other. `EvaluationPipeline` takes `readonly Evaluator[]`; human review is one more
entry. Adding the two new measured criteria in v2 was two new `DesignCheck` files — the pipeline,
service and report did not change.

## 8. Failure, timing and versioning

```
                 ┌──────────── per stage ─────────────┐
DRAFT ──submit──► SUBMITTED ──dequeue──► EVALUATING ──┬──► COMPLETED ────────┐
                                                      ├──► COMPLETED_PARTIAL ┤──advance──► next stage (DRAFT)
                                                      └──► FAILED ──retry──► SUBMITTED
```

- **Persist before evaluate.** Each stage's `Submission` is written and fingerprinted *before* anything
  is queued. An evaluator failure at defend leaves both earlier reports intact and the stage retryable.
- **Never block the learner.** Evaluation runs through `InProcessQueue` (retry ×2, backoff).
- **Partial degradation is a first-class state.** `COMPLETED_PARTIAL` shows the measured findings with
  a banner; missing criteria are *absent*, never zero. "AI unavailable" is derived per completed stage
  from what actually came back, so a criterion whose stage has not happened yet is never blamed on the
  AI.
- **The change stays hidden.** It is dealt at `startAttempt` and absent from the wire until the design
  stage has been evaluated — tested, because it is the whole point.
- **Idempotency** is per `(attempt, stage)`; a stale tab submitting to a stage the attempt has left is
  refused with `409 WRONG_STAGE`.
- **Rubric and prompt versions are pinned onto every evaluation.** v2 bumped both; v1 scores are still
  comparable with each other and never with v2.

## 9. If it grew

Extract the evaluation worker first — the only slow, bursty, externally-dependent component. The
`JobQueue` port already draws that boundary. Second, an LLM gateway keyed by (prompt version, rubric
version, design fingerprint), because two learners submitting the same gold-ish design should cost one
call. Neither is worth building at four problems and one learner.

## 10. Where this goes next

**Learner-versus-learner comparative judgement.** Adaptive Comparative Judgement reaches reliability
above 0.8 from pairwise "which is better" decisions. With more than one learner, the critique board
becomes a place to judge peers' anonymised designs on one criterion — which both builds the judge's
taste and produces the calibration signal the evaluator needs. The critique pairs are the
single-player version of this.

**Code as a second capture format.** An AST gives *facts* where a form gives *claims*: whether
`ParkingLot` really depends on the interface or constructs `HourlyPricing` directly. The gap between
the declared design and the code is the most interesting feedback of all, and it needs both — which
is why `SubmissionParser` declares facets rather than a boolean.

**Generated probes as a `ProbeSource`.** Authored probes are sharp and safe. A generated source would
be a second implementation behind the same selection, with the grounding validator applied to the
question as well as the answer.

## 11. The mentor: where AI reads and where it counts

The evaluator's rule — *AI reads; math measures* — was written for scoring. The mentor extends it
to everything else a good reviewer does across the table: synthesise, explain, teach. None of it
touches a score. `apps/api/src/coach/` is a separate module with its own prompt version
(`COACH_PROMPT_VERSION`), its own cache, and one dependency on the evaluator: it reads the same
`EvaluationContext` and the results the evaluators produced.

| Surface | What the model does | Grounded how | When it runs |
|---|---|---|---|
| **Reviewer's note** | 3–5 sentences over one stage: the finding that matters most, why here, what first | per sentence — any sentence naming a class the learner did not write is dropped; < 2 survivors → no note | after each stage's evaluation lands, on the queue |
| **Micro-lesson** | the authored concept (`plain`, `tell`) explained through the learner's own classes, with a before/after | body and both halves of the example, same rule | on request, criteria scored ≤ 2 only |
| **Explain this finding** | on any card, measured or read: why it matters for this problem, what goes wrong later, the smallest move — in the learner's classes | per sentence, same rule; < 2 survivors → nothing | on request, cached by (design, score, concern) |
| **Coach across problems** | 2–3 sentences over the progress page: the habit the numbers show, why break it, what to look for in the next problem | may name only criteria and problems the prompt listed; anything else → no note | on read of progress, cached by the numbers it is about |
| **Socratic follow-up** | after the learner's first answer to a probe, one question that presses on the weakest part of it | must be a question, ≤ 60 words, no verdict phrases, names only classes in the design or the probe; else retried once, then not asked | during Defend, per probe, at most once |

**Defend is a dialogue, not a form.** Georgia Tech's *Socratic Mind* is the strongest evidence in
the research for any single mechanic here: being made to explain and justify, with follow-ups,
produced significant learning gains across 5,000+ students. The shape is fixed at two learner
turns per probe — answer, follow-up, reply — so it stays an interview rather than a chat, and the
turn limit is enforced server-side. The mentor's turns live in `DialogueTurn`, never in the
client, so a refresh loses nothing and a mentor question cannot be forged. On submit, the dialogue
*is* the answer: the learner's turns joined become `response` (what `reasoning` is scored on) and
the full exchange rides along as `transcript`, which the prompt shows as context. The prompt version
moved to 2.1.0 for that, and the pin caught it in the integration test before anyone did.

**Two models, one provider.** Groq's free tier is 8,000 tokens per minute *per model*. Judgement
stays on the large model; notes, lessons and follow-ups run on the small one in a separate budget
(`resolveLlmClient(env, 'mentor')`). That split is also the right one on merit: scoring needs the
best reader available; a follow-up needs to be fast.

**Grounding for prose** is coarser than for evidence. A citation resolves or it does not; a sentence
can only be checked for the identifiers it names — anything in backticks or CamelCase. So the rule
is per sentence: name something the learner never wrote and the sentence goes. The model is told
to describe a suggested class in words ("a component that owns pricing") rather than name it, and
in practice it complies; when it does not, the sentence is removed before the learner sees it and
the UI says so in one line under *why trust this?*

**Caching is content-addressed.** `AiNote.key` is a hash of (kind, prompt version, the inputs the
prompt was built from — the design, the scores and concerns). The same design re-opened costs
nothing; the same design resubmitted costs nothing; a prompt change regenerates everything. A model
failure is not cached, so an unavailable provider today does not become an empty note forever.

**Failure is absence.** The mentor hangs off `PracticeService.onEvaluated`, a callback rather than a
dependency, so the practice loop knows nothing about it and a coach failure can never change an
attempt's state. The report shows a skeleton for 25 seconds, then nothing — never a placeholder
pretending to be a note. The stub client answers both prompts with templates over the lowest
finding, so a clone with no key still shows the shape of the feature, labelled *stand-in*.

**Concept mastery** closes the loop between the mentor and the curriculum. Every criterion names the
concepts it produces evidence about; `ConceptMastery` folds the last five attempts' scores into a
standing per concept (`new` / `developing` / `solid`, with the evidence count shown), and the
Concepts page and dashboard read that — nothing is graded a second time. Loading the concept graph
at boot and checking the rubric against it found two concepts the rubric named that the graph lacked.

## 12. Limitations

- **Requirement coverage matches vocabulary.** Authored keywords stop `Vehicle` from covering the fee
  requirement, but a class named `FeeThing` that does nothing still counts. Coverage asks *"is this
  addressed somewhere"*; whether it is addressed well is the other seven criteria's job.
- **The diff cannot see intent.** A rename reads as remove + add; the report says so and the rationale
  box exists partly for that reason.
- **The stub is a heuristic.** With no API key, `edge-cases` and `reasoning` come from keyword rules
  over the same prompt the real model sees, and the mentor's note is a template over the lowest
  finding. It separates strong from weak reliably enough to demo and to calibrate, and does not
  pretend to be a language model — the UI labels it a stand-in.
- **Prose grounding checks names, not claims.** A sentence that names only real classes can still
  say something wrong about them. Evidence grounding is exact; prose grounding is a filter.
- **Walkthrough checks trust the walkthrough.** A learner can write steps that resolve and still be
  wrong about the order. Order is not judged; existence and distribution are.
- **Four problems, one learner.** Sixteen more are catalogued but not instrumented to v2 depth; there
  is no auth, so everyone is `learner-demo`.
- **Recurring weakness needs three attempts**, so the next-problem recommendation falls back to the
  authored path until then.
