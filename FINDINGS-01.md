# Findings 01 — Can the engine be gamed, and what does an attempt cost?

**Phase 1 of [BUILD_PLAN.md](BUILD_PLAN.md).** Written 16 Sept 2026. Everything here was measured
on this codebase; nothing is estimated. Where a number is n=1, it says so.

**What this answers.** Two of the questions the product plan said had to be answered before anything
else was built, and which turned out to need no participants: study V4 (adversarial resistance) and
the cost model's first input. A third thing came out of doing it: a scoring defect, now fixed.

---

## 1. The short version

- **Every individual criterion can be gamed on its own. The composite cannot.** Coverage, class
  responsibilities and coupling each award full marks to designs that deserve none; every attack
  that beats one of them is caught by behaviour or abstraction-use. The rubric holds because it is
  eight criteria, not because any one is hard to fool.
- **A form filled in by a model scores 1.8 out of 4.** The strongest free-tier model, given exactly
  what a learner sees and told "make it a good design — this is graded", produced a plausible
  15-class design with a real dependency cycle, no pricing seam, and a walkthrough step calling a
  constructor as if it were a method. The engine did not detect AI. It measured structure, and the
  structure was bad. Risk 4 in the product plan ("learners will fill the form with a chatbot") is
  smaller than assumed, with caveats in §4.
- **An empty submission scored 4 on two criteria and was told "every class describes a single
  job".** Fixed. Criteria that measure the absence of a fault now score 0 when there is nothing to
  be faulty. Calibration is unaffected.
- **A full attempt costs 15–18k tokens.** About 40% on the scoring model, 60% on the mentor model.
  The change stage costs zero LLM tokens. On Groq's free tier the mentor model is the binding
  constraint at roughly 19 full attempts per day, not the 10 the plan assumed.
- **No tokens were persisted anywhere.** The plan said the evaluator's columns already existed and
  were filled; they existed and were never filled. Corrected and fixed in Phase 2 — see §6.

Fifteen adversarial tests now run on every push, alongside calibration, as the merge gate.

---

## 2. The attacks, and what happened

Each row is a hostile design in `tests/evaluation/Adversarial.test.ts`. "Hole" means the attack
works against that criterion and the test pins it so it cannot silently widen. "Defence" means the
engine caught it.

| Attack | Target | Result | Why |
|---|---|---|---|
| Six classes named after the requirement keywords, doing nothing | requirement-coverage | **Hole: scores 4** | Coverage asks "is this addressed somewhere", not "is it addressed well". DESIGN.md §12 says so |
| …same design, whole rubric | composite | **Defence** | No seam at any variation point (abstraction 0–1), no scenario walked (behaviour 0). Composite well below the gold design |
| Three meaningless classes, every requirement restated in the assumptions | requirement-coverage | **Hole: scores 3+** | Assumptions are searched on purpose — "persistence is out of scope" is a legitimate answer. The cost is that restating the brief reads as coverage |
| …same design | class-responsibilities, coupling-cohesion | **Hole: both score 4** | Structural. See §3 |
| The vending-machine gold design submitted to the parking-lot problem | requirement-coverage | **Defence, mostly: scores 2** | Authored keywords stop it scoring higher. Generic commerce words (charge, price, type) still leak two requirements across problems |
| One class doing everything, named `Orchestrator` to dodge the vague-suffix rule, one-clause responsibility | class-responsibilities | **Hole: evaded** | Both of GodClassCheck's signals are starved by design |
| …same design | behaviour, abstraction-use | **Defence** | The walkthrough is where it shows: one class performs every step. And nothing sits behind any variation point |
| Interfaces named after every variation-point hint, implemented by nobody | abstraction-use | **Defence: ≤2, named** | The relationship rows expose it. The finding names the inert interface |
| A walkthrough whose every step lands on a real class and real method, in nonsense order | behaviour | **Hole: scores 3+** | Order is not judged; existence and distribution are. DESIGN.md §12. Judging order needs a model of causality the form does not capture |
| A change-stage revision that renames a class and absorbs nothing | change-resilience | **Defence: ≤1** | Blast radius measures the delta, and the delta carries none of the change's vocabulary |
| A design written by a model from the public problem | composite | **Defence: 1.8** | §4 |
| An empty design | everything | **Was a defect, now 0 across the board** | §3 |
| Relationships naming classes that do not exist | coupling-cohesion | **Defence: ≤2** | Dangling edges are the heaviest-weighted fault |

**The pattern.** Coverage, responsibilities and coupling are *absence-of-fault* criteria: they look
for something wrong and award full marks when they do not find it. Behaviour and abstraction-use are
*presence-of-substance* criteria: they award marks only for something that is there. The first kind
is gameable by emptiness and by vocabulary; the second kind is not. Every successful defence above
is a presence criterion catching what an absence criterion missed.

---

## 3. The structural finding, and the one fix

**Absence-of-fault criteria reward emptiness.** Three classes named `Lot`, `Thing` and `Record`,
with two relationships and no responsibilities to speak of, score 4 on class-responsibilities
(no single class is overloaded) and 4 on coupling-cohesion (no orphans, cycles or dangling edges).
Neither statement is false. Both are useless.

The extreme case was indefensible: a submission with **no classes at all** scored 4 on both, and the
report said *"Every class describes a single job. The graph holds together."* Nothing in the form's
schema prevents an empty submission. That is fixed in this phase: both checks now return 0 with an
honest concern ("there are no classes in this design, so there is nothing to judge here yet") when
the graph is empty. The calibration suite passes unchanged, because every gold design has classes.

The general case is **not** fixed, and deliberately so. Making fault-absence criteria require
evidence of substance is a rubric change: it would move scores for real learners, it needs
calibration against the gold designs, and it needs a definition of "substance" that does not just
become another keyword match. It is the right change to make. It should be made with the expert
study's data in hand, not before. **Decision needed:** whether to take it on as part of Phase 0's
rubric work, or accept that the composite already handles it and leave it.

---

## 4. The model-filled form

**Method.** `apps/api/scripts/model-fill-form.ts` gives the evaluator model (`groq:openai/gpt-oss-120b`)
the public problem exactly as a learner sees it — brief, constraints, requirements, scenarios — plus
the form's JSON shape, and the instruction *"Make it a good design — this is graded."* It does not
see the rubric, the variation points, the hidden changes or the gold designs. The output is saved as
`tests/fixtures/model-filled-parking-lot.json` and pinned by a test.

**Result.**

| | Model-filled | Gold "strong" |
|---|---|---|
| requirement-coverage | 3 | 4 |
| class-responsibilities | 2 | 4 |
| coupling-cohesion | 1 | 4 |
| abstraction-use | 1 | 4 |
| behaviour | 2 | 4 |
| **composite** | **1.80** | **4.00** |

The findings against it are correct, not artefacts: a dependency cycle between `ParkingLot` and
`EntryGate`; pricing handled by a concrete `RatePolicy` class with no interface behind it; `Ticket`
carrying three responsibilities; a walkthrough step calling `Ticket.<init>`, which is a constructor
and not a declared method; and the refusal requirement never addressed. A senior engineer reading
this design would raise the same points.

**What this does and does not show.**

- It does **not** show the engine detects AI. It shows that a plausible design written from a
  brief, in one shot, makes the exact mistakes the engine measures. Plausibility and quality are
  different things, and the engine measures the second.
- It is **n=1**: one model, one prompt, one problem, one sample. Different models and a rubric-aware
  prompt would do better. This is a first data point, not a result.
- It does not test the **iterative** attack: paste the report's findings back to the model, resubmit,
  repeat. That attack would probably work — and a learner who does it is reading specific structural
  feedback and acting on it, which is not obviously different from learning. The defend stage, which
  is a dialogue about the learner's own choices, is the natural place that distinction shows up.
- **Implication for Risk 4:** downgrade from "certain, medium impact" to "plausible, needs the
  iterative test". Do not build detection. Build the defend stage well.

---

## 5. What an attempt costs

**Method.** `LLD_LLM_LOG_USAGE=1` makes the adapter print one JSON line per model call with token
counts. Two full attempts were run over HTTP against the live Groq configuration — one with the gold
design, one with the god-class design — exercising every path a learner touches: evaluator per
stage, mentor note per stage, a follow-up question per probe, one explanation, one lesson, and the
coach note on the dashboard.

**Per path, per attempt.**

| Path | Model | Calls | Tokens (in + out) |
|---|---|---|---|
| Evaluator, design stage (edge-cases) | 120b | 1 | 2.0–3.1k |
| Evaluator, change stage | — | **0** | **0** — blast radius is fully measured |
| Evaluator, defend stage (reasoning) | 120b | 1 | 3.4–4.6k |
| Mentor note, one per stage | 20b | 3 | 3.8–6.0k |
| Follow-up question, per probe | 20b | 3–6 | 2.1–4.1k |
| Explain a finding | 20b | 1 | 1.0–1.5k |
| Micro-lesson (fresh, not cached) | 20b | 0–1 | ~1.1k |
| Coach note | 20b | 1 | ~0.8k |
| **Full attempt** | | **10–13** | **15.1k–18.1k** |

**Split by model:** 5.4–7.7k on the scoring model, 9.7–10.4k on the mentor model. Roughly 40/60.
The majority of tokens are already on the cheaper model, which is the routing the plan hoped for.

**Three things worth knowing.**

1. **Follow-ups can cost double.** The god-class run made six follow-up calls for three probes,
   not three: when the small model's first attempt is not a valid grounded question, the dialogue
   module retries once. That is the right behaviour and it is the most variable line in the budget.
2. **The cache is real.** The lesson for the god-class design on `abstraction-use` had been written
   in an earlier session, and cost zero tokens to serve again. Content-addressing on the design
   means a re-opened report, and a resubmitted identical design, are free.
3. **The free-tier ceiling, corrected.** Groq allows 200k tokens per day per model. At ~7.7k per
   attempt the scoring model allows ~26 attempts a day; at ~10.4k the mentor model allows ~19. The
   mentor is the binding constraint, and 19 is the number — the plan's "roughly 10" was a guess and
   was low. The 8k-per-minute limit is also real: two learners finishing the defend stage in the
   same minute would exceed it on the scoring model. **Concurrency on the free tier is one learner.**

**Pricing.** Deliberately not in this document. Token counts are stable; prices are not, and a
remembered price becomes a wrong margin in a pricing deck. Multiply the table by the current
published rate for whichever provider is on the table at the time of the decision.

---

## 6. No tokens were recorded anywhere — and this section originally said otherwise

**Correction, 16 Sept, Phase 2.** The first version of this section said the evaluator writes
`inputTokens` and `outputTokens` to the `Evaluation` row and only the mentor was unrecorded. That
was taken from the schema comment ("populated when a real provider ran"), not from the write path.
The write path did not exist: 45 evaluations in the database, zero with tokens. The columns had
been promised and never filled. The mentor half was also unrecorded, as stated.

So at the time of §5's measurement, the log line added in this phase was the *only* record of
cost anywhere, and everything in §5 rests on it.

**Fixed in Phase 2:** the LLM evaluator now reports what its last run cost (retries summed, reset
before the early return for stages with nothing to judge — the first version leaked the design
stage's figure into the change row), the pipeline sums across evaluators, the `Evaluation` row is
written, and `AiNote` and `DialogueTurn` gained columns filled from what the modules already
received. The study export carries all of it, split evaluator / mentor. Zero means measured free
(the stub); null means nothing reported, which are different facts and stay different.

---

## 7. What changed in the codebase

- `tests/evaluation/Adversarial.test.ts` — fifteen tests, the corpus above, holes labelled.
- `tests/fixtures/model-filled-parking-lot.json` — the model's design, for the pinned comparison.
- `apps/api/scripts/model-fill-form.ts` — regenerates it; run again with a different model or
  problem to extend the sample.
- `GodClassCheck`, `CouplingCheck` — score 0 with an honest concern on an empty graph.
- `OpenAiCompatibleLlmClient` — opt-in usage log line, `LLD_LLM_LOG_USAGE=1`.
- `npm run gate` — calibration + adversarial + typecheck, about a second. `.githooks/pre-push` runs
  it; `npm install` wires the hook. `.github/workflows/ci.yml` runs it, then the full suite, for
  when a remote exists.

**Suite:** 235 tests. Calibration unchanged at 26.

---

## 8. Decisions this raises

1. **Fault-absence criteria** (§3): fix now as rubric work, or accept the composite as the defence?
   My recommendation is to wait for the expert-agreement study — it will say whether these criteria
   are the ones experts disagree with, which is the real question.
2. **The iterative model attack** (§4): worth testing before the study, or after? It is one
   afternoon and a few thousand tokens. I would do it before, because if it works trivially it
   changes what the defend stage has to carry.
3. **Mentor token persistence** (§6): fold into Phase 2 as recommended, or leave for Phase 5?
