# Build Plan — finalized

Companion to [PRODUCT_PLAN.md](PRODUCT_PLAN.md). That document is strategy: what to validate, what
could kill this, what to measure. **This is the locked build queue.** No conditionals, no options.
Each phase is a unit I execute end to end, ending in an artifact you can read or a thing you can do.

**How this is ordered.** Not by what is most obvious to build next, but by a single test:
*is this work correct no matter how validation turns out?* Phases 1 and 2 pass that test, so they
start now. Phases 3 onward are bets on the answer being yes, so they wait for it.

**What gates what.** The build track is **not** blocked on your six open questions in PRODUCT_PLAN
§Open questions. The research track is. Phases 1 and 2 need nothing from you but a go-ahead.

**Status key:** ⬜ not started · 🟦 in progress · ✅ done

| # | Phase | Ends with | Needs from you | Size | Status |
|---|---|---|---|---|---|
| 1 | Evidence without asking anyone | [FINDINGS-01.md](FINDINGS-01.md) | Nothing | 1 session | ✅ |
| 2 | Make the study runnable | Six sessions you can run | Nothing | 1 session | ⬜ |
| 3 | Reachable | A link you can send | Go-ahead after the study | 1 session | ⬜ |
| 4 | Safe for strangers | Closed beta can open | Go-ahead | 2 sessions | ⬜ |
| 5 | Confidence and content | Changes stop being scary | Paid inference budget | continuous | ⬜ |

---

## Phase 1 — Evidence without asking anyone ✅

**Why this is first.** PRODUCT_PLAN puts validity ahead of everything, and every validity study
looked like it needed recruiting. One does not. **V4, adversarial resistance, is pure engineering**
and answers a real question about the product: *can someone score well without designing well?*
I can produce that evidence alone, today, with no participants and no deployment. It also becomes a
permanent test suite, so it is validation and infrastructure in the same work.

**Tasks**

1. **Adversarial corpus** in `tests/evaluation/Adversarial.test.ts`, roughly twenty hostile
   submissions built on the existing fixtures, each asserting what the engine should do:
   - responsibilities stuffed with the requirement vocabulary
   - classes named exactly after requirement keywords, doing nothing
   - a gold design pasted in from a *different* problem
   - an empty design carrying a rich, plausible rationale
   - a walkthrough that resolves against real methods but describes nonsense
   - a change-stage revision that renames classes and absorbs nothing
   - a defend answer that name-drops the right classes while saying nothing
   - **a design produced by asking a model to fill the form**, which is the case with a real policy
     decision attached
2. **Cost per attempt, measured.** Run two full attempts against the live Groq configuration and
   read `Evaluation.inputTokens` / `outputTokens`, split by stage and by evaluator versus mentor.
   The columns already exist. No more estimating from memory.
3. **Calibration as a merge gate.** Coverage is already complete, every playable problem has
   entries matching its gold designs. What is missing is that nothing *enforces* it. Wire the suite
   so a change that moves a gold design out of its band fails the build.

**Deliverable:** `FINDINGS-01.md` — what can be gamed, what cannot, what an attempt costs, and the
policy question the model-filled form raises. This is the first page of Phase 0 evidence, and it
costs nothing but my time.

**Done when:** the corpus runs in CI, and you can read what the engine is and is not resistant to.

**Done, 16 Sept 2026.** Fifteen adversarial tests, two attempts costed, an empty-design scoring
defect fixed, and the gate wired. Three decisions raised in FINDINGS-01 §8; one of them (mentor token
persistence) is recommended for Phase 2.

---

## Phase 2 — Make the study runnable ⬜

**Why second.** The six-person senior-versus-junior study is the cheapest falsification of the core
claim, and today it is impossible: six people on one instance share the identity `learner-demo` and
read each other's attempts, and there is no way to get scores out as data.

**Tasks**

1. **Learner identity, no auth.** First visit asks a name, creates or finds a `Learner`, stores the
   id client-side, sends it on every request. No passwords, no sessions table. Deliberately
   disposable: Phase 4 replaces it and this code gets deleted.
   Lands in `routes.ts`, one header in `apps/web/lib/api.ts`, a first-run prompt in the web shell.
2. **Thread and assert `learnerId`.** The ten attempt-addressed routes resolve by `attemptId` alone.
   Six `PracticeService` methods and four `CoachService` methods take a `learnerId` and assert it,
   returning not-found rather than forbidden so ids cannot be probed. **This closes the IDOR as a
   side effect of work the study needs anyway.**
3. **Study export.** One command emits a CSV: one row per criterion per stage per attempt, with
   learner, problem, scores, evaluator id, rubric and prompt version, tokens and timings. No schema
   change needed. Attempt, submission and evaluation timestamps already derive time per stage, and
   an attempt with no submission is an abandon.
4. **Clean-run tooling.** A reset script so each session starts known, and a seed that stops
   creating the demo learner once real ones exist.
5. **`STUDY_PROTOCOL.md`.** The 45-minute session shape, what you say, what you must not say,
   consent wording, and the analysis to run on the CSV. Without it, six sessions produce
   impressions instead of data.

**Tests:** an ownership matrix proving every attempt-addressed route returns not-found for a
non-owner; export shape and timing derivation; existing suite green.

**Done when:** two learners on one instance cannot see each other's work, and one command produces
the study CSV.

**Not in this phase:** real auth, deployment, Postgres.

---

## Phase 3 — Reachable ⬜

**Gate: the study came back positive.** If senior and junior designs do not separate, this phase is
wasted and the rubric work in PRODUCT_PLAN §3 happens instead.

**Tasks:** Postgres with real migration history, and a restore actually performed once rather than
documented; API and web deployed with secrets held properly; health check and error tracking; a
synthetic full attempt on a schedule so you learn it is broken before a learner tells you.

**Done when:** you can send a link, and you find out within minutes when it breaks.

**Not in this phase:** scaling. One small instance is right for this stage.

---

## Phase 4 — Safe for strangers ⬜

**Gate: you have decided to open a closed beta.** These are the things that are fine with people you
know and not fine with people you do not. Invited friendlies still count as strangers here.

**Tasks:** real accounts replacing the Phase 2 stand-in; prompt-injection defence, since learner
strings reach the mentor prompt unlabelled and the grounding filter cannot catch an injected claim
that names only real classes; per-learner token budget and rate limits, because one scripted user
can burn the LLM budget in an hour; privacy work, meaning export, delete, retention, and a plain
page saying what is sent to which model.

**Done when:** a hostile user costs you a rate-limit error rather than a bill or a breach.

---

## Phase 5 — Confidence and content ⬜

Runs continuously alongside 3 and 4 rather than after them.

**Confidence:** one end-to-end browser test covering a full attempt including a refresh mid-stage;
a cost-regression test asserting tokens per attempt stays under a ceiling; an accessibility pass for
keyboard-only completion and contrast in both themes.

**Content:** the two drafts blocked on Groq's daily cap, then the remaining ten; the review lessons
written down as a checklist covering off-world seams, over-broad change vocabulary, exemplar leakage
and vague hub classes; a concept coverage map so problems fill holes deliberately rather than in
catalogue order; problem versioning, the way rubrics and prompts already are.

**Needs from you:** a small paid-inference budget. The free tier authored four problems and stopped
for the day. Authoring is the one place paid inference pays for itself immediately.

---

## The honest summary

Phases 1 and 2 are roughly two sessions and need nothing from you but a go-ahead. They produce the
first real evidence this product has ever had and leave the codebase genuinely multi-user. Phase 3
onward is a bet on the study, and there is no version of this where making that bet before reading
the study is the right call.

**Say "start phase 1" and I begin.**
