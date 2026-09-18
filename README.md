# Deliberate — an LLD practice loop

Practice Low-Level Design and get feedback that **points at your own design**, not at a reference
solution you were supposed to have guessed. Then the requirements change, and you find out how much
of your design survives.

```
  warm up            design + run              change                  defend
  ─────────          ────────────              ──────                  ──────
  two designs,       classes, relations,       a requirement you       three questions
  one question,      decisions — then walk     did not see coming;     chosen from what
  click the class    three scenarios           revise; the blast       the review found
  that decides it    through the design        radius is measured      in your design
```

- **[RESEARCH.md](RESEARCH.md)** — the learner problem, what exists, what the research says, the gaps
- **[DESIGN.md](DESIGN.md)** — the class model, the evaluation approach, both change tests, trade-offs
- **[AI_USAGE.md](AI_USAGE.md)** — where AI helped, and the ten times judgement had to overrule it

## Running it

Node 20+ and Postgres 14+ (`brew install postgresql@16` on a Mac). **No API key needed**; a free one
makes the AI half real.

```bash
npm install
createdb lld_practice && createdb lld_practice_test
cp apps/api/.env.example apps/api/.env       # set DATABASE_URL to your Postgres user
npm run seed     # applies the migrations, validates every content file, seeds the demo learner
npm run dev      # API on :4000, web on :3000
```

The schema is a migration history (`apps/api/prisma/migrations`), never a `db push`: a schema change
is `npm run db:migrate:new -- <name>` in `apps/api`, and a fresh database gets `npm run db:migrate`.
`npm run db:backup` writes a compressed dump to `apps/api/backups/`; `npm run db:restore <dump> <db>`
brings one back — the restore was performed once against a real dump and matched byte for byte.

Open **http://localhost:3000**. The interface is the Claude Design mockups in
`ui-mockups-for-learning-platform/` implemented on the real data; [REDESIGN.md](REDESIGN.md) records
every place a drawn element met a feature that did not exist. It asks for a name first — that is the whole sign-in: attempts are
kept under the name, there is no password, and **Switch** behind the gear hands the keyboard to the
next person. It exists so several people can share one instance (the validity study needs that);
real accounts come later. Six places on the rail: **Critique** (the warm-ups), **Dashboard**,
**Learn** (the catalogue), **Concepts** (the curriculum map with your standing on each idea),
**Progress** (every criterion, time on stages, the habit worth breaking), **History** (every attempt).

With no key set, the two read criteria (*edge cases*, *reasoning*) are scored by a deterministic
heuristic that parses the same prompt the real model would see, so the whole loop works on a fresh
clone. To have a real model read them, put **one** key in `apps/api/.env.local` (gitignored; the
API loads it at startup):

| Provider | Free tier | Put in `apps/api/.env.local` | Default model |
|---|---|---|---|
| **Groq** (recommended) | 8k tokens/min per model, no card | `GROQ_API_KEY=gsk_…` | `openai/gpt-oss-120b` scores; `gpt-oss-20b` mentors |
| Gemini AI Studio | ~250 requests/day | `GEMINI_API_KEY=…` | `gemini-2.5-flash` |
| OpenRouter | ~50 requests/day | `OPENROUTER_API_KEY=…` | `meta-llama/llama-3.3-70b-instruct:free` |
| Ollama (local) | unlimited | `LLD_LLM_PROVIDER=ollama` | `llama3.1` |
| Anthropic | paid | `ANTHROPIC_API_KEY=sk-ant-…` | `claude-opus-5` |

Groq's free tier is also capped at 200k tokens/day per model on top of the 8k tokens/minute
limit above. A full attempt (design + change + defend, mentor notes, follow-ups, one lesson) was
measured at 15–18k tokens: about 40% on the scorer, 60% on the mentor. That makes the mentor model
the binding constraint at roughly 19 full attempts a day, and the per-minute limit means one
learner at a time. The measurement is in [FINDINGS-01.md](FINDINGS-01.md) §5.

`LLD_LLM_PROVIDER` picks explicitly when more than one key is present; `LLD_LLM_MODEL` overrides
the model; `LLD_FORCE_STUB=1` keeps the heuristic regardless. The startup log and `/api/health`
say which one is live. Every provider except Anthropic goes through one OpenAI-compatible adapter,
so a new one is a row in a table.

```bash
npx tsx apps/api/scripts/live-llm.ts god-class defend   # exercise the live provider end to end
npx tsx apps/api/scripts/export-study.ts                 # scores.csv + attempts.csv — every score, timing and token
npx tsx apps/api/scripts/reset-study.ts                  # dry run; --learner <name> --yes or --all --yes to clear
npx tsx apps/api/scripts/analyse-study.ts --in study-export   # the protocol's separation and activation analysis
npx tsx apps/api/scripts/simulated-study.ts              # the six sessions with a model in each chair (see FINDINGS-02)
npx tsx apps/api/scripts/rescore-study.ts --in study-sim # re-run the measured checks on stored designs
```

Scripts and `curl` without an `x-learner-id` header act as the demo learner; the export excludes
that learner unless asked. [STUDY_PROTOCOL.md](STUDY_PROTOCOL.md) is the six-person study these
two scripts exist for.

```bash
npm test         # 266 tests, including a calibration suite over 26 gold designs across 8 problems
npm run typecheck
```

`/api/health` reports the database round-trip, the queue depth, the last evaluation and the version,
and answers 503 when the database is unreachable. The API logs one JSON line per request and per
error (`LLD_LOG=pretty` for a terminal). `npm run canary` in `apps/api` runs one real attempt against
an instance (`--url https://…/api`, `--full` for all three stages) and exits non-zero if the loop is
broken — the thing to put on a schedule.

If you have a SQLite database from before Phase 3, `apps/api/scripts/import-sqlite-json.ts` is the
one-off that carried its rows across.

## Try this first

About ten minutes, and it shows every part of the product:

1. Open **Critique** on the rail and pick **Parking Lot**. Three pairs of designs, one question each —
   click the class that decides it, submit, and read the paragraph that appears. That paragraph is the point.
2. Click the **Parking Lot** card to start the attempt. Submit a deliberately bad design: one class `ParkingLotManager` whose
   responsibility is *"Handles parking, pricing, exit, payment and ticket generation"* with methods
   `park, exit, calculateFee, findSpot`, plus `Spot`, `Vehicle`, `Ticket`. In **Run it**, walk every
   scenario with `ParkingLotManager` on every step and let *"nothing suitable is free"* end as
   *Succeeds*.
3. The report names the god class and **quotes your sentence back with a count**, tells you pricing
   has no seam and is living inside that class, and shows that one class performs 100% of every
   scenario while the refusal scenario ends as if nothing went wrong. Click any evidence chip — it
   highlights the exact row, or the exact walkthrough step. A few seconds later **your mentor's note**
   appears above the cards. Click **Learn the concept behind this** on *Use of abstraction*.
4. **Continue.** The requirements change — EV charging spots billed per kWh. Your design is prefilled.
   Absorb it the lazy way: add an `isElectric` attribute to `Spot` and a `calculateKwhFee` method to
   the manager. Watch the blast-radius counter. Submit.
5. *Handling change* scores **1** and names the flag. **Continue** again: three questions, each about
   *your* `ParkingLotManager`. Answer the first one lazily — *"calculateFee gets a branch"* — and
   watch the interviewer come back with a follow-up about what you did not say. Reply. *Reasoning*
   is scored from the whole exchange, with the quote it relied on as evidence.
6. **Try again.** The form opens with your revision. Add `PricingStrategy` as an `interface`,
   `HourlyPricing` implementing it, point `ParkingLot` at the interface, spread the walkthrough steps,
   end the refusal scenario as *Refused*. This attempt is dealt a *different* change — reserved spots
   for pass holders. Absorb it with a new `ReservedFirstAllocator` implementing `SpotAllocator` and
   touch nothing else. *Handling change* scores **4**.

To see the failure path: `LLD_STUB_FAIL=1 npm run dev`, then submit. The AI half dies, the five
measured findings still arrive, and the report says so honestly rather than showing an error page.

## What it does

| | |
|---|---|
| **Submission** | A guided form in three facets: structure (classes, relationships), behaviour (scenario walkthroughs — a CRC-card role-play as a list), rationale (decisions with the alternative rejected). |
| **Change** | After the design is frozen and reviewed, a requirement change is revealed. You revise. The diff is the evidence. |
| **Evaluation** | Eight criteria, one owner each. **Six measured** from the class graph, the walkthroughs and the diff. **Two read** by an LLM — the two that need reading. |
| **Feedback** | Every finding cites a class, relationship, assumption, decision, walkthrough step or quote **in your submission**, verified to exist before you see it. |
| **Defend** | Up to three probes, chosen by what the review found and worded around your own class names — each a short interview: your answer, one follow-up from the AI interviewer that presses on the weakest part of it, your reply. *Reasoning* is read from the whole exchange. |
| **Mentor** | After each stage, an AI note over the findings — the one thing that matters most, in your class names. On any card, *why does this matter here?*; on any low one, a two-minute lesson on the concept behind it, illustrated with your own classes. Every sentence is checked against your design before you see it. |
| **Coach** | On the dashboard and progress page: what you keep doing across problems, why it is worth breaking, what to look for next — over the deterministic next-problem choice. |
| **Honesty** | Measured findings and AI findings are visually distinct. Missing criteria are absent, never zero. The mentor's note is visibly AI and says why it can be trusted. |
| **History** | Per-criterion trend across stages, a callout when the same criterion keeps failing, and a next problem chosen to exercise it. |
| **Curriculum** | 22 concepts in five tiers. Your standing on each is folded from the criteria that produce evidence about it — no separate grading. The dashboard shows your path; the map shows what depends on what and where to practise it. |

## Key decisions

Full reasoning in [DESIGN.md](DESIGN.md); the short version:

1. **Stress-test the design, don't grade the artifact.** Running it and changing it are where design
   quality shows, and both can be measured.
2. **AI reads; math measures.** LLM graders identify classes well and count relationships badly, so
   nothing graph-shaped is ever sent to the model.
3. **Extensibility is a diff, not an opinion.** A new class behind a seam that already existed, one
   wiring touch: 4. A flag on an existing class: 1. The report names the flag.
4. **Evidence is a type, not a convention.** `EvidenceRef` is a union over positions in a design, so a
   finding *cannot be written* without pointing at something.
5. **One owner per criterion, at one stage.** Twelve overlapping criteria once made one god class read
   as four problems.
6. **The change stays hidden** until the design is frozen and reviewed. Tested, because it is the point.
7. **Calibration is a gate.** Thirteen gold designs with expected bands; an evaluator change that
   moves one outside its band fails the build. This found four real flaws before any learner did.
8. **Rubric and prompt versions are pinned forever.** v1 scores compare with v1, v2 with v2, never
   across.

## Layout

```
apps/api/src/
  domain/          pure — no framework, no I/O. The product is legible from here alone.
    design/        DesignGraph · DesignDiff · Walkthrough
    feedback/      ScoreAggregator · RecurringWeakness · ProbeSelector · NextProblem · ConceptMastery
    attempt/       AttemptStateMachine
  submission/      SubmissionParser port  ← a new capture format plugs in here, declaring its facets
  evaluation/      Evaluator port         ← a new evaluator plugs in here
    rules/checks/  one file per measured check, each declaring its stage and facets
    llm/           prompt with band anchors, providers, EvidenceGroundingValidator
  coach/           the mentor: prose grounding, prompts, Reviewer, LessonWriter, Explainer,
                   Dialogue, Coach, NoteStore (content-addressed cache)
  app/             PracticeService — stages, submissions, critique, next problem; CoachService
  infra/           prisma · queue · content loader
apps/web/          Next.js · Tailwind · Framer Motion
packages/contracts/  shared types and zod schemas
content/           problems (scenarios, hidden changes, probes, gold designs, critique pairs),
                   rubric, concept graph — data, not code
tests/             148 tests: state machine, parser, every check, grounding, diff, walkthrough,
                   probes, next problem, calibration, and the full three-stage loop end to end
```

## Limitations

Stated plainly, with the full list in [DESIGN.md §11](DESIGN.md):

- **Not every catalogued problem is playable.** Instrumenting one to this depth — scenarios, hidden
  changes, probes, three gold designs, critique pairs, calibration bands — is hours of authoring by
  hand. `apps/api/scripts/author-problem.ts` drafts one with the model and gates it with the
  evaluator (the strong design is repaired from its own findings until it clears par); a person then
  reviews the draft and promotes it. See `content/PROVENANCE.md` for what the reviewer catches that
  the gate cannot.
- **No auth.** `learnerId` is threaded through every layer, but everyone is `learner-demo`.
- **The stub evaluator is a heuristic, not a model.** Good enough to demo and calibrate; not a
  substitute for the real thing on the two read criteria.
- **Requirement coverage matches vocabulary**, by authored keyword. It catches "you forgot fees"; it
  does not judge how well fees were handled — the other criteria do.
- **The diff cannot see intent.** A rename looks like a removal and an addition; the rationale box is
  where you say so.
- **Recurring weakness needs three attempts**, so the next-problem recommendation follows the authored
  path until then.
