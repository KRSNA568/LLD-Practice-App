# Build Plan — what gets written, in what order

Companion to [PRODUCT_PLAN.md](PRODUCT_PLAN.md). That document is strategy: what to validate, what
to measure, what to test, what could kill this. **This one is the engineering queue.** Each phase is
a unit of work I can execute end to end, ending in something you can see or decide with.

**Ordering principle:** a phase earns its place by unblocking the *next decision*, not by being the
next most obvious thing to build. Phase 1 exists because you cannot answer "is the score valid"
without it. Phase 3 exists because you cannot let strangers in without it. Nothing is built for
completeness.

**Status key:** ⬜ not started · 🟦 in progress · ✅ done

| # | Phase | Unblocks | Size | Status |
|---|---|---|---|---|
| 1 | Many learners, measurable | The six-person validity study | 1 session | ⬜ |
| 2 | Reachable | Unsupervised sessions, remote raters | 1 session | ⬜ |
| 3 | Safe for strangers | Closed beta | 2 sessions | ⬜ |
| 4 | Change without fear | Touching prompts or the rubric safely | 2 sessions | ⬜ |
| 5 | Content to twenty | Breadth, SEO surface | continuous | ⬜ |
| 6 | Beta mechanics | Running a cohort and learning from it | 1–2 sessions | ⬜ |

---

## Phase 1 — Many learners, measurable

**Unblocks:** the six-person senior-vs-junior study, which is the cheapest possible falsification of
the core claim. Today six people on one instance would share the identity `learner-demo` and read
each other's attempts, and there is no way to get their scores out as data.

**Work:**

1. **Learner identity without auth.** First visit asks for a name, creates or finds a `Learner`,
   stores the id client-side, sends it on every request. No passwords, no email, no sessions table.
   Deliberately throwaway: real auth replaces it in Phase 3 and this code gets deleted.
   Lands in `routes.ts` (a `POST /learners`, an identity middleware), `apps/web/lib/api.ts` (one
   header), and a first-run prompt in the web shell.
2. **Thread and assert `learnerId`.** The ten attempt-addressed routes resolve by `attemptId` alone
   today. Each of the six `PracticeService` methods and four `CoachService` methods that resolve an
   attempt takes a `learnerId` and asserts it against the row, returning a not-found rather than a
   forbidden so ids cannot be probed. **This closes the IDOR as a side effect of work you need
   anyway**, which is why it happens now rather than in Phase 3.
3. **Study export.** A script that emits one CSV row per criterion per stage per attempt: learner,
   problem, attempt number, stage, criterion, score, evaluator, rubric and prompt version, tokens,
   and the timings. No schema change needed. Attempt `createdAt`, Submission `submittedAt` and
   Evaluation `completedAt` already derive time-per-stage, and an attempt with no submission is an
   abandon.
4. **Clean-run tooling.** A reset script so each study session starts from a known state, and a
   seed that does not create the demo learner when a real one exists.
5. **Facilitator protocol.** A short `STUDY_PROTOCOL.md`: what you say, what you do not say, the
   45-minute session shape, consent wording, and the analysis to run on the CSV. Without this the
   six sessions produce impressions rather than data.

**Tests:** an ownership matrix asserting every attempt-addressed route returns not-found for a
non-owner; export shape and timing derivation; the existing suite stays green.

**Done when:** two learners on one instance cannot see each other's attempts, and a CSV of every
score lands from one command.

**Not in this phase:** real auth, deployment, Postgres, analytics.

---

## Phase 2 — Reachable

**Unblocks:** sessions you do not have to sit through, and raters in other cities. **Conditional:**
if the first six sessions are supervised over a screenshare, localhost is enough and this phase
waits. Do it when you want the seventh person to use it without you.

**Work:** Postgres with a real migration history and a restore that has actually been performed once,
not documented; API and web deployed with secrets held properly; a health check and error tracking;
a synthetic run of one full attempt on a schedule so you learn it is down before a learner tells you.

**Done when:** you can send someone a link, and you find out within minutes when it breaks.

**Not in this phase:** scaling. One small instance is correct for this stage.

---

## Phase 3 — Safe for strangers

**Unblocks:** closed beta. These are the things that are fine with people you know and not fine with
people you do not.

**Work:** real accounts replacing the Phase 1 stand-in; prompt-injection defence, since learner
strings reach the mentor prompt unlabelled today and the grounding filter cannot catch an injected
claim that names only real classes; a per-learner token budget and rate limits, because one scripted
user can burn the whole LLM budget in an hour; privacy work, meaning export, delete, a retention
policy and a plain page saying what gets sent to which model.

**Done when:** a hostile user costs you a rate-limit error rather than a bill or a breach.

---

## Phase 4 — Change without fear

**Unblocks:** touching a prompt or the rubric without silently invalidating every score already in
the database. This is insurance, and it becomes urgent the moment real learner data exists.

**Work:** the adversarial corpus from study V4 turned into a permanent suite, covering keyword
stuffing, a gold design pasted from a different problem, and a form filled in by a frontier model;
calibration extended so every playable problem has entries and the suite blocks merges; one
end-to-end browser test covering a full attempt including refresh mid-stage; a cost-regression test
asserting tokens per attempt stays under a ceiling; an accessibility pass for keyboard-only
completion and contrast in both themes.

**Done when:** a prompt change that breaks scoring or doubles spend fails in CI rather than in
production.

---

## Phase 5 — Content to twenty

**Unblocks:** breadth, and a page per problem that can rank in search. Runs in parallel with anything
once the calibration expansion in Phase 4 is in.

**Work:** finish the two drafts currently blocked on Groq's daily cap, then the remaining ten; turn
the review lessons into a written checklist covering off-world seams, over-broad change vocabulary,
exemplar leakage and vague hub classes; publish a concept coverage map so problems fill holes
deliberately rather than in catalogue order; version problems the way rubrics and prompts already are.

**Note:** authoring is the one place a paid model pays for itself immediately. The free tier produced
four problems and then stopped for the day.

**Done when:** twenty problems are playable and each one's gold designs sit inside their bands.

---

## Phase 6 — Beta mechanics

**Unblocks:** running a cohort and learning from it rather than guessing.

**Work:** invites and a waitlist; an onboarding path that gets a first-time learner to a completed
attempt, since activation is the metric that decides whether the loop is too long; in-product
feedback capture at the moment of confusion rather than a survey afterwards; an analytics view of
the funnel from signup to first full attempt to second attempt.

**Done when:** you can see activation and repeat rate without running a query by hand.

---

## If you are in a hurry

Phase 1, then run the study. Everything after Phase 1 is a bet on the answer being yes. There is no
version of this where building Phases 2 through 6 first is the right call, because the only outcome
that would make them worth having is the one you have not checked yet.
