# LLD Practice Platform — Product Plan

**Status:** working document. Written 13 Sept 2026, when the codebase stopped being a take-home
and became a product.
**Owner:** Krishna Mahajan.
**Rule for this document:** every claim here is either measured, or marked as a hypothesis with the
study that would settle it. No number in this plan is decorative.

---

## 0. Where we actually are

An honest inventory, because the plan below only makes sense against it.

| Area | State | Notes |
|---|---|---|
| Practice loop (design → run → change → defend) | **Built, tested** | Three stages, one attempt, 220 passing tests |
| Evaluation engine | **Built** | 6 criteria measured from the design graph / walkthrough / diff, 2 read by an LLM, every finding cites a position in the learner's own submission |
| Calibration gate | **Built** | 23 gold designs across 8 problems, each pinned to an expected band |
| Mentor layer | **Built** | Review note, micro-lessons, Socratic defend dialogue, explain-a-finding, cross-problem coach — all grounded to the learner's own class names, cached, absent rather than faked on failure |
| Content pipeline | **Built** | Model drafts, the evaluator gates, a human reviews. 8 of 20 catalogued problems playable |
| Web app | **Built** | 9 pages: dashboard, learn, concepts, progress, practice, report, critique, history |
| **Accounts** | **Missing** | Everyone is `learner-demo`. No signup, no login, no session |
| **Authorization** | **Partial — and the gap is a hole** | Collection routes (progress, history, critique, problem list) *are* scoped by learner and query correctly. But all **10 attempt-addressed routes** (`/attempts/:id/...` — submit, draft, advance, retry, notes, lessons, explain, defend turn) resolve by `attemptId` alone, and not one service method behind them accepts a `learnerId`. Harmless with one demo user; an IDOR the day there are two |
| **Database** | **Demo-grade** | SQLite, single file, no migration history, no backup |
| **Job queue** | **Demo-grade** | In-process. The seam is drawn correctly; nothing has been pulled through it |
| **LLM supply** | **Demo-grade** | Groq free tier: 8k tokens/minute and 200k/day per model. That is roughly 10 full attempts per day. A product cannot run on it |
| Deploy, CI, monitoring, payments, email, analytics, legal | **Missing** | Nothing runs anywhere but localhost |
| E2E, load, accessibility, security tests | **Missing** | The 220 tests are unit, integration and calibration only |

**The honest summary:** the hard, differentiated part is built and the ordinary part is not. That is
an unusual and good position, because the ordinary part is known work and the differentiated part
is the thing that could have failed.

---

## 1. The thesis, and the one claim that has to be true

Everyone in this market ships "an AI reviews your design." The bet here is the opposite:
**AI reads, explains, asks and generates. Math measures.** Six of eight criteria never touch a
language model, and no AI output can move a score.

That buys three things a competitor cannot copy cheaply: scores that are stable across runs,
feedback anchored to a position in the learner's own submission, and a **change stage** — freeze the
design, reveal a requirement change, measure the blast radius — which as far as the research note
found, nobody else measures at all.

All of it rests on one claim:

> **A design this engine scores 4 on a criterion is a design a senior engineer would also call good,
> and practising against these scores makes a learner better at designs they have never seen.**

If that claim is false, the product is a toy with good typography. **Phase 0 exists to test it before
a rupee is spent on anything else.** Nothing in Phases 1–5 matters if Phase 0 fails.

---

## 2. Metrics, and the point at which we stop

Set now, so they cannot be rationalised later.

| Metric | Definition | Target | Measured from |
|---|---|---|---|
| **Validity** | Spearman correlation, engine score vs. blinded expert mean, per criterion | ρ ≥ 0.6, and **≥ the expert-vs-expert correlation** | Study V1 |
| **Transfer** | Band improvement on a held-out problem after 5 attempts, vs. control | ≥ +0.5 bands, p < 0.05 | Study V3 |
| **Activation** | Signups completing a full attempt (all three stages) within 48h | ≥ 40% | Product analytics |
| **Repeat** | Learners starting a 2nd attempt within 7 days | ≥ 30% | Product analytics |
| **W4 retention** | Active in week 4 | ≥ 20% | Product analytics |
| **Free → paid** | Conversion of activated free users | ≥ 4% | Billing |
| **COGS per attempt** | LLM spend per completed attempt | ≤ 15% of blended revenue per attempt | Token columns already stored on `Evaluation` |

**Kill criteria.** If V1 fails (engine disagrees with experts more than experts disagree with each
other), stop and fix the rubric — do not build accounts. If V3 fails, the product is a measurement
tool, not a teaching tool, and the positioning must change before launch. If activation is under 20%
in closed beta, the loop is too long and the fix is product, not marketing.

---

## 3. Phase 0 — Prove the score means something (4–6 weeks, blocks everything)

Five studies. Each states the question, the method, the sample, the bar, and what we do when it fails.

### V1 — Expert agreement (construct validity) — *the critical one*

- **Question:** does the engine agree with senior engineers, and is its disagreement smaller than
  theirs with each other?
- **Method:** assemble 30 designs spanning quality (existing gold designs, beta submissions, a few
  deliberately mediocre). 6–8 raters with 5+ years and real interview experience score each design
  on the same 8 criteria, blind to the engine and to each other. Randomise order.
- **Instrument:** the rubric as the learner sees it, plus a one-line anchor per band. Ship it as a
  simple rating page reusing the existing report renderer.
- **Analysis:** per-criterion Spearman ρ (engine vs expert mean); Krippendorff's α across experts as
  the human baseline; a Bland–Altman style plot of where the engine is biased high or low.
- **Bar:** ρ ≥ 0.6 per criterion, and engine-vs-human ≥ human-vs-human on at least 6 of 8.
- **If it fails:** the disagreement is diagnostic, not fatal. Per-criterion: recalibrate bands,
  tighten a check, or demote the criterion from scored to observational. `coupling-cohesion` and
  `abstraction-use` are the most likely to need work.
- **Cost:** the largest line item in Phase 0. Budget for paid rater time; ₹2–4k per rater per hour
  is realistic, ~4 hours each.

### V2 — Discriminant validity (1 week, do this first, it is cheap)

- **Question:** does the engine separate designs by the experience of who wrote them?
- **Method:** 10 engineers, 5 junior (0–2y) and 5 senior (6y+), same problem, same time box.
- **Bar:** senior mean ≥ 1 full band above junior on the composite, no overlap of interquartile ranges.
- **Why first:** it is the cheapest possible falsification. If the engine cannot tell a senior from a
  junior, V1 is a waste of money.

### V3 — Learning gain (6 weeks, runs through closed beta)

- **Question:** does using this make people better at problems they have not seen?
- **Method:** pre/post with a control arm. All participants do a baseline problem. Treatment does 5
  practice attempts with full feedback; control does the same 5 problems with only a reference
  reading (no scoring, no mentor). Both then do a **held-out transfer problem** neither has seen.
- **Bar:** treatment improves ≥ 0.5 bands more than control on the transfer problem.
- **Confound to control:** repeat exposure to the *same* problem inflates scores. Transfer problem
  must be a different domain, and its calibration must be pinned before the study starts.
- **If it fails:** the loop measures but does not teach. Likely cause is the mentor layer being too
  thin at the point of failure — the fix is instructional, not architectural.

### V4 — Adversarial resistance (1 week, engineering)

- **Question:** can a learner score well without designing well?
- **Method:** build a corpus of ~20 hostile submissions and assert the engine's response:
  keyword-stuffed responsibilities, classes named exactly after the requirement vocabulary,
  a copy-pasted gold design from a *different* problem, an empty design with a rich rationale,
  a walkthrough that resolves but is nonsense, and **a design generated by asking a frontier model
  to fill the form**.
- **Bar:** the first five score ≤ 1. The last one is the interesting case and needs a policy decision
  (see §10, Risk 4) — measure it before deciding.
- **This corpus becomes a permanent test suite** (testing level L4).

### V5 — Mentor truthfulness audit (1 week)

- **Question:** grounding checks that every class named is real. Nothing checks that what is said
  about it is *true*.
- **Method:** sample 100 generated mentor notes, lessons and follow-up questions across problems.
  Two reviewers rate each: accurate / vague-but-harmless / **wrong**.
- **Bar:** wrong < 2%. Vague is acceptable; wrong is not, because a confident false statement from a
  "mentor" is worse than silence — and silence is already the designed fallback.
- **If it fails:** tighten prompts, lower the sentence-survival threshold, or route the mentor to a
  stronger model. Cost of a stronger mentor model is small; this is the right place to spend.

---

## 4. Phase 1 — Prove someone wants it (runs in parallel with Phase 0)

Phase 0 asks "does it work." This asks "does anyone care." They are independent and must not be
sequenced.

### D1 — 20 problem interviews

Target the hypothesised ICP (see open questions): engineers with 3–8 years, preparing for SDE-2/SDE-3
or equivalent, where LLD is an explicit interview round. 30 minutes, no demo in the first 20.
Ask about the last time they prepared, what they actually did, what they paid for, what they
abandoned and why. **Do not describe the product until the end.** Record the words they use for the
problem — that vocabulary is the landing page copy.

### D2 — Landing page smoke test with a price ladder

One page, the real positioning ("your design is measured, not vibed"), a 40-second demo video of the
change stage, and an email capture. Three traffic slices see three prices. Measure click-to-price
and capture rate, not opinions. Budget ₹15–25k of paid traffic; run 2 weeks.

### D3 — Competitive teardown

Build a matrix against the named alternatives from RESEARCH.md and the current market:
DesignGurus, InterviewReady, Educative, AlgoMaster, Exponent, YouTube/free content, and
"just use ChatGPT." Columns: what they measure, whether feedback is anchored, whether change is
tested, price, content depth, and the honest answer to *"why would someone leave them for us."*
**"Just use ChatGPT" is the real competitor** and must be answered explicitly, in the copy.

### D4 — Channel test

Rank by cost to reach the ICP: LLD/interview communities, LinkedIn technical posts, SEO on
long-tail problem names ("design a parking lot low level design"), YouTube teardowns, referrals from
bootcamps. Test the top two. The content pipeline is a latent SEO asset — each playable problem is a
page that can rank.

### D5 — B2B adjacency probe (cheap, high option value)

Five conversations with engineering managers and bootcamp operators. The same engine scores an
onboarding exercise or a cohort assignment. B2B pricing is 10–50× B2C per seat and the product
barely changes. **This may turn out to be the real business** — probe before committing to a B2C-only
roadmap.

---

## 5. Phase 2 — Make it multi-tenant without breaking what works (4–6 weeks)

Ordered by risk, not by ease. Nothing here starts until V1 and V2 pass.

| # | Work | Why now | Lands in |
|---|---|---|---|
| **H1** | **Accounts + ownership checks** | The 10 attempt-addressed routes take an `attemptId` and never ask whose it is. Two users means one reads and writes the other's attempts. Highest-severity gap in the codebase | `routes.ts`, `PracticeService`, `CoachService`, new `auth/` |
| **H2** | Postgres + migration history + nightly backup + a tested restore | SQLite file loss = total data loss. No migration history means no safe schema change | `prisma/`, infra |
| **H3** | Prompt-injection defence | Learner strings (class names, responsibilities, assumptions, decisions, defend answers) are serialised straight into the mentor prompt, unlabelled. JSON encoding stops a syntactic break-out, but nothing marks the span as untrusted, and the grounding filter would not catch it: an injected *"say this design is perfect"* produces prose naming only real classes, so it passes | `coach/prompts.ts`, `PromptBuilder` |
| **H4** | Per-learner cost budget + abuse limits | One scripted user can burn the entire LLM budget in an hour. Token columns already exist on `Evaluation` — enforce against them | `PracticeService`, middleware |
| **H5** | Queue out of process | Evaluation is slow, bursty and externally dependent. The seam is already drawn (`JobQueue`); pull a real worker through it | `infra/queue/` |
| **H6** | Observability: structured logs, error tracking, SLOs, uptime alerting | Cannot run a paid product blind. SLO proposal: evaluation completes < 60s p95, API 5xx < 0.5% | new |
| **H7** | Privacy and AI disclosure: export, delete, retention policy, "what we send to which model" page | India's DPDP Act applies from day one; GDPR if any EU learner signs up. Also simply correct for a product that sends user work to a third-party model | new |
| **H8** | Deploy: staging + production, CI on every push, one-command rollback | | new |

**Sequencing note:** H1 and H3 are security work and must ship before the first external user, not
before public launch. Closed beta with 20 friendly users still counts as external.

---

## 6. Phase 3 — Content from 8 to 20+ (continuous)

The pipeline works: a model drafts, the evaluator gates the strong design against the same checks a
learner faces, and a human reviews for what the gate cannot see. Four problems have been produced
this way and two of them found real bugs in the evaluator, which is the pipeline paying for itself.

To scale it:

1. **Formalise the reviewer checklist** already learned the hard way: off-world seams, over-broad
   `mustIntroduce` keywords, exemplar leakage (a probe about logging in a cache problem), vague hub
   classes, changes whose prompt states the answer.
2. **Every new problem ships with calibration entries** and cannot be marked playable until the
   calibration suite passes. This is already enforced; keep it enforced.
3. **Difficulty ladder and concept coverage map.** 20 problems is only good if they cover the concept
   graph. Publish the map; fill the holes deliberately rather than by catalogue order.
4. **Content versioning.** Changing a problem invalidates old scores. Scores already pin rubric and
   prompt version; extend the same discipline to problem version.
5. **Supply constraint is real.** Groq's free tier authored 4 problems and then ran out for the day.
   Budget paid inference for authoring — it is a one-time cost per problem and the cheapest content
   in the business.

---

## 7. Phase 4 — Economics (2 weeks, before pricing is announced)

The instrumentation already exists: `Evaluation.inputTokens` and `Evaluation.outputTokens` are
stored per stage. Nothing needs to be built to start measuring.

1. **Measure** tokens per completed attempt across the beta cohort, split by stage and by mentor vs
   evaluator. Current estimate is 15–20k tokens per full attempt; confirm it.
2. **Price it** against current published rates for each candidate provider, **fetched at decision
   time**. Do not plan against remembered prices — they move, and a stale number here becomes a
   wrong margin in a pricing deck.
3. **Route by role.** Scoring needs the strong model; mentor prose does not. This split already
   exists in the code (`resolveLlmClient(env, role)`) and is the main lever on COGS.
4. **Cache harder.** `AiNote` already makes a re-opened report free. Measure the hit rate.
5. **Decide the free tier** from the measured number: how many attempts can a free user have before
   they cost more than they are worth as a funnel input.
6. **Provider risk:** a single provider is a single point of failure for the paid product. The
   adapter is already provider-agnostic (Groq, Gemini, OpenRouter, Ollama, Anthropic) — keep a
   tested second provider configured, not just supported.

---

## 8. Phase 5 — Beta to launch

| Gate | Cohort | Entry condition | Exit condition |
|---|---|---|---|
| **Alpha** | 5 hand-picked, watched over a call | V2 passed | Each completes a full attempt without help; no P0 bugs |
| **Closed beta** | 20–30, invite only | H1, H3 shipped; V1 passed | Activation ≥ 40%; V5 audit clean; V3 study running |
| **Open beta** | 200, waitlist | H2, H4–H8 shipped; 12+ problems | Repeat rate ≥ 30%; COGS measured; W4 ≥ 20% |
| **Paid launch** | Public | V3 result in hand; pricing set from D2 + Phase 4 | — |

Run a **UAT script** at each gate: the same 12-step scripted journey through signup, critique warm-up,
full attempt, report, lesson, second problem, progress page, on desktop and on a phone.

---

## 9. The testing plan

What exists is strong at the bottom of the pyramid and empty at the top. Levels marked **new** are
the gap.

| # | Level | Catches | Tool | Gate |
|---|---|---|---|---|
| L1 | Domain unit | Rule logic, scoring maths, mastery windows | Vitest — **220 passing** | Every push |
| L2 | Contract | Shape drift between API and web | zod schemas in `packages/contracts` — **partial**, needs round-trip tests | Every push |
| L3 | **Calibration** | Evaluator drift — the regression test that matters most. Gold designs must stay inside their bands | Vitest — **23 designs, 8 problems** | Every push; **blocks merge** |
| L4 | Evaluator reliability — **new** | Gaming, determinism, version pinning. Built from the V4 adversarial corpus | Vitest | Every push |
| L5 | Integration / API | Route wiring, persistence, queue, idempotency | Vitest + supertest — **exists** | Every push |
| L6 | **Security — new** | IDOR matrix (every route × wrong owner), prompt-injection corpus, secret scanning, dependency audit | Vitest + `gitleaks` + `npm audit` | Every push; **blocks merge** |
| L7 | **E2E browser — new** | The whole loop as a human does it, including autosave, refresh mid-stage, back button, mobile width | Playwright | Pre-merge on main; nightly full suite |
| L8 | **Accessibility — new** | Keyboard-only completion, contrast in both themes, screen-reader labels on the design form | `axe-core` + manual keyboard pass | Nightly |
| L9 | **Load / performance — new** | Queue depth under 50 concurrent submissions; p95 evaluation latency; DB contention | k6 | Pre-release |
| L10 | Resilience / chaos | Provider 429, 5xx, timeout, malformed JSON, empty completion → degrades to a partial report, never a crash or a fake | Vitest with a fake fetch — **partly exists**, extend to the mentor paths | Every push |
| L11 | **Cost regression — new** | A prompt change that doubles token spend. Assert tokens per attempt stays under a ceiling | Vitest against recorded usage | Every push |
| L12 | **Data — new** | Migration up and down on a copy of production; a restore drill that is actually performed, not documented | Script + quarterly drill | Pre-release + quarterly |
| L13 | **UAT script — new** | What automation cannot: does it feel like a teacher | Human, scripted, 12 steps | Every gate in §8 |
| L14 | **Production monitoring — new** | Synthetic canary running one full attempt hourly against production; alert on evaluation failure rate, LLM error rate, p95 latency | Uptime + synthetic | Continuous |

**Two testing principles specific to this product:**

1. **The calibration suite is the crown jewel.** It is the only thing standing between a prompt tweak
   and silently invalidating every score in the database. It must block merges, and every new problem
   must add to it.
2. **Test the degradation, not just the success.** The design promise is that the AI half can vanish
   and the learner still gets a real report. That promise needs a test for every AI-touching path,
   not just the two evaluator criteria that have one today.

---

## 10. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Scores do not match expert judgement** | Medium | Fatal | Phase 0 V1/V2 before any other spend. Demote criteria that fail rather than defend them |
| 2 | **IDOR on attempt-addressed routes** | Certain, today | Severe | H1, before the first external user. The fix is mechanical: thread `learnerId` into the 6 service methods that resolve an attempt, and assert it |
| 3 | **Prompt injection through learner-supplied design text** | High | Severe (mentor says whatever an attacker wants, in the product's voice) | H3: delimit and label untrusted spans, never let learner text reach the system prompt, keep the grounding filter as a second line |
| 4 | **Learners fill the form with a frontier model's answer** | Certain | Medium — corrodes the learning claim, not the product | Measure in V4 first. Policy options: accept it (their loss, like copying homework), or add a defend-stage signal, since a dialogue is much harder to fake than a form. **Do not build detection theatre** |
| 5 | **LLM supply and cost** | High | High | Phase 4 routing + a second tested provider. Free tier cannot survive launch |
| 6 | **Content IP** — problems resemble real interview questions | Medium | Medium | Problems are generated and reviewed, not scraped. Keep `PROVENANCE.md` current; it is the defence |
| 7 | **Single-founder bandwidth** | Certain | High | The phase gates exist to stop parallel work. Phase 0 and 1 run together because one is research spend and the other is interviews; everything else is serial |
| 8 | **Market is crowded and cheap** | High | High | D3 must answer "why leave DesignGurus" in one sentence. If it cannot, the B2B path (D5) is the better business |

---

## 11. What I am deliberately not recommending

- **A code sandbox.** Measures coding fluency; AlgoMaster does it well; it is a different product.
- **Reference solutions.** Teaches imitation, and the critique warm-up already delivers contrasting
  cases without handing over an answer.
- **Letting an LLM score the measured six.** It is the whole differentiator. Do not trade it for
  coverage.
- **Certificates or a credential** before V1 and V3 pass. Selling a signal that is not validated is
  the fastest way to lose the one thing this product has.
- **A mobile app.** The design form is a desktop activity. Make the web responsive, stop there.
- **More problems before validity.** 8 problems whose scores mean something beat 20 that do not.

---

## 12. The next ten actions

1. Run **V2** (senior vs junior, 10 engineers, one problem). Cheapest possible falsification of the
   core claim. **This week.**
2. Close the **IDOR** (H1) even before accounts exist — the check is the same code either way.
   Concretely: `getAttempt`, `saveDraft`, `submit`, `advance`, `loadContext`/`loadDefend`, and the
   four `CoachService` entry points take a `learnerId` and assert it against the row.
3. Write the **V4 adversarial corpus** as tests. It is a day's work and it is permanent.
4. Stand up the **landing page + price ladder** (D2) so traffic accumulates while Phase 0 runs.
5. Book **6 of the 20 problem interviews** (D1).
6. Measure **tokens per attempt** from the data already in the database; there is no reason to guess.
7. Add **Playwright** and one E2E test covering a full attempt. One test now beats a suite later.
8. Move the DB to **Postgres with migration history** before there is data worth losing.
9. Recruit the **V1 expert panel** (6–8 raters) — the long-lead item, start now.
10. Decide the **ICP and the market** (below), because D1 through D4 cannot be run against a
    hypothesis this vague.

---

## Open questions — these need your answer, not my guess

1. **ICP.** Interview preparation (3–8 year engineers), university/bootcamp, or corporate onboarding?
   The product barely changes; the go-to-market changes completely.
2. **Market.** India-first, US, or global-English? Affects price point by roughly 5×, and which
   privacy regime applies on day one.
3. **B2C or B2B.** D5 exists because B2B may be the better business with the same engine. Willing to
   probe it, or committed to B2C?
4. **Budget for Phase 0.** The expert panel is the main cost and the main de-risking. What is
   available?
5. **Your time.** Full-time or evenings? The phase gates assume roughly one focused day per weekday;
   they stretch linearly, they do not reorder.
6. **Timeline pressure.** Is there a date this must be live by, and why? A real external date changes
   which risks are acceptable.
