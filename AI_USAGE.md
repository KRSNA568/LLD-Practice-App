# AI Usage

I used Claude (in Claude Code) throughout: scaffolding, the React components, the first draft of every
deterministic check, and the docs. That part is unremarkable and I would not claim credit for it.

What follows is the part worth reading — the decisions where the AI's output and my judgement
disagreed, and what happened. Entries 1–6 are from the first build; 7–10 are from the second pass,
where a research sweep changed what the product is. Most are rejections. The most useful ones are
cases where the AI was confidently wrong and something other than my own reading caught it.

---

## 1. Rejected: an event bus, an LLM gateway, and a mastery model — *my own over-scoping, at the AI's enthusiastic encouragement*

**What happened.** I asked for a product-grade architecture rather than a two-day MVP, and got one:
six modules with `dependency-cruiser`-enforced boundaries, an in-process event bus, an LLM gateway
with budget governance and model tiering, prompt versioning as a subsystem, a 20-concept mastery
model, a calibration flywheel, and 60 instrumented problems. It was a genuinely good design. I was
enthusiastic about it. We spent real time on it.

**Why I rejected it.** I went back to the brief and read it against the plan. Tab 2 §3 asks for
something *"very small — 3–5 problems, one practice flow, one submission model."* §11 says it would be
*less impressed by* "large feature lists with little working functionality" and wants *"a simple
architecture with clean domain boundaries."* §6 says explicitly: *"You do not need a sophisticated AI
pipeline."*

Every hour on an event bus is an hour not spent on the class model, which is the single
highest-weighted thing being assessed. The architecture was solving a problem I did not have.

**What I did instead.** Layered structure with exactly **two** ports — the two the brief says will
change. The ambition moved into [DESIGN.md §10](DESIGN.md), where it costs no build time and still
demonstrates the thinking. This is the decision I would defend hardest: the AI's instinct was good
product judgement applied to the wrong question, and the fix was re-reading the requirements rather
than arguing about design.

---

## 2. Rejected: `temperature: 0` — *the model wrote it from memory, and it would have 400'd in production*

**What happened.** The first draft of `LlmClient` had `temperature: number` on the request type, and
`LlmEvaluator` passed `temperature: 0` with a confident comment about reproducible judgement. This is
a very well-established pattern and looks completely correct.

**Why I rejected it.** Before writing the Anthropic adapter I made the model load the current API
reference instead of working from its training prior. Current Claude models **reject `temperature`
outright — it returns a 400.** The parameter was removed. Had I trusted the draft, the app would have
worked perfectly on the stub and failed the moment anyone set a real API key — the worst possible
failure shape, since the fallback path masks it.

**What I did instead.** Removed `temperature` from the port entirely and replaced it with `effort`.
The comment now says where consistency actually comes from: a fixed rubric, a constrained output
shape, and the grounding check. It never came from sampling settings.

**The general lesson:** the AI is most dangerous where it is most fluent. A well-known API shape that
changed recently is exactly where a confident wrong answer survives review, because it looks right to
me too. Reading the current docs is not optional.

---

## 3. Rejected: a 12-criterion rubric — *because one flaw looked like four problems*

**What the AI suggested.** Twelve criteria, drawn from the dimension list in the brief: requirement
understanding, class responsibilities, cohesion, coupling, encapsulation, interfaces, abstraction,
pattern use, extensibility, edge cases, testability, explanation.

**Why I rejected it.** I ran a god-class submission against a draft of it. `ParkingLotManager` lost
points under *responsibilities*, *cohesion*, *abstraction* and *extensibility* simultaneously. One
mistake produced four low scores, the overall average cratered, and there was no way for a learner to
tell that all four were the same sentence. Over-penalising is bad; **making a single fixable flaw look
like four unrelated ones is worse**, because it destroys the signal about what to do next.

**What I did instead.** Seven criteria, each owning distinct ground, with exactly one evaluator each.
The visible consequence is that requirement coverage now scores a god class *highly* — it does address
every requirement, just badly. That reads oddly at first glance and is the correct behaviour;
structure is three other criteria's job. It is documented as a limitation rather than papered over.

---

## 4. Accepted, then found broken by a test: the coupling check

**What the AI wrote.** `CouplingCheck` flagged a class as a hub when its in-degree was at least half
the class count. Reasonable, and it passed my read.

**How it failed.** I wrote a test asserting that a strong design beats a god-class design on every
structural criterion. It failed: both scored 4/4 on coupling. The reason is that the canonical god
class has only *four* classes, so no in-degree threshold can fire — there are not enough classes for
anything to look central. The single most common real failure mode was invisible to the check meant to
catch it.

**Then a second bug in the fix.** My first correction counted all edge kinds. That would have
penalised an interface for having five implementers — meaning the check would punish exactly the
abstraction the rubric rewards elsewhere. Two checks pulling in opposite directions is worse than one
weak check.

**What shipped.** Two hub shapes, with inheritance edges deliberately excluded from both: a
*depended-on* hub (in-degree, `uses`/`has-a` only) and a *coordinator* hub (one class holding ≥70% of
outgoing dependencies), which is the god-class star. Both bugs are pinned by tests in
`tests/evaluation/CouplingHubs.test.ts`.

**Why this one matters:** neither bug was findable by reading. The AI wrote plausible code, I approved
plausible code, and only an executable assertion about *product behaviour* — "a good design must beat
a bad one" — surfaced it. That is the argument for writing tests against outcomes rather than
implementations.

---

## 5. Rejected: pattern-name detection — *it would have taught the wrong thing*

**What the AI suggested.** A deterministic check awarding credit for recognised design patterns —
Strategy, Factory, Observer — detected from class names.

**Why I rejected it.** It rewards vocabulary rather than judgement, and it is trivially gamed: rename
`PricingRules` to `PricingStrategyFactory` and score higher for a worse design. The brief is direct
that it is unimpressed by *"design patterns added only to show pattern knowledge."* A check that
rewards pattern name-dropping would actively teach the habit the product should be correcting.

**What I did instead.** The inverse. `AbstractionCheck` asks whether there is a seam *where this
specific problem is known to change*, and — the part I am most pleased with — flags an abstraction
that exists but that **nothing implements**. A learner who declares `PricingStrategy` for show and
leaves the pricing inside a concrete class gets caught, where the pattern-detector would have
congratulated them.

---

## 6. Found by smoke-testing: a validation failure reported as our bug

**What the AI wrote.** Routes parse request bodies with `schema.parse(req.body)` and let the error
propagate to a shared handler. Clean, and it reads fine.

**How it failed.** While scripting an end-to-end run I used an idempotency key shorter than the
eight-character minimum. The API returned **500 INTERNAL** — reporting a server fault for a caller's
typo, and giving the client no way to see which field was wrong. The `ZodError` had simply fallen
through to the catch-all branch.

**What shipped.** The handler now maps `ZodError` to a 422 carrying per-field paths, the same shape
the submission parser already returns, so the workspace can mark the offending field either way.

**Why it is here:** this was found by driving the real HTTP surface with slightly wrong input, not by
reading code or running unit tests — both of which were green. Three different verification methods
each caught something the other two missed.

---

## 7. Rejected: "add more problems" — *the research said the loop was the wrong shape, not the wrong size*

**What happened.** After the first build I asked for a deeper research pass and a "new way". The
AI's first instinct, and mine, was to extend what existed: more instrumented problems, a mastery
model, a code sandbox. Bigger, not different.

**What the research said.** Thomasson, Ratcliffe & Thomas (ITiCSE 2006) found the #1 fault in 180
novice designs — present in **97%** of them — was a class integrated into nothing, and that novices
"cannot figure out how to integrate the class into their designs." Parnas defines a module by what it
hides from *change*. Two 2025–26 studies grading UML diagrams found LLMs at 97% on identifying
classes and 55–60% on late-introduced entities. AlgoMaster now ships code + hidden tests + AI design
review. None of that says "more problems". All of it says the evaluator was grading a static artifact
and the two things that define design quality — running it, and changing it — were not being
measured at all.

**What I did instead.** Rebuilt the loop as **design → run → change → defend**, with a walkthrough
facet, a hidden requirement change revealed after the design freezes, and extensibility scored from
the diff rather than by the LLM. Six of eight criteria are now measured. The AI wrote most of the
code; the shape came from reading papers, not from the model.

---

## 8. Rejected: LLM-judged extensibility, and LLM-generated probes — *the model offered judgement where counting works*

**What the AI suggested.** Keep `extensibility` as an LLM criterion (it reads the learner's description
of how they would handle change) and add an LLM step that *generates* the defend-stage questions from
the design.

**Why I rejected both.** A learner *describing* how they would handle a change is a claim; a learner
*revising the design* against a change they did not see coming is evidence. `DesignDiff` counts
classes added, classes reopened, whether the new class plugs into a seam that existed before, and
whether an `isElectric` flag appeared — every band of the criterion is a fact about the diff. For
probes: a generated question can cite a class that does not exist, and the grounding validator only
checks answers. Authored probes with `triggerWhen` conditions and a `{{class}}` placeholder are just
as targeted — *"Which method in ParkingLotManager changes?"* — and cannot hallucinate.

**What shipped.** `change-resilience` is deterministic; `ProbeSelector` is forty lines with no LLM in
it. The LLM reads two criteria, both prose. This is the decision the research most directly supports.

---

## 9. Found by calibration: four evaluator flaws, none visible in the unit tests

**What happened.** The calibration suite — 13 authored gold designs with expected score bands — was
listed as future work in v1. Wiring it produced nine mismatches on the first run. Five were bands I
had set too tight. **Four were real flaws** in checks that all had passing unit tests:

1. **Coverage accepted any shared word.** "vehicle" appears in five of six parking-lot requirements,
   so a design with a `Vehicle` class covered the *fee* requirement. Fix: authored `keywords` per
   requirement, matched by stem — the same instrumentation philosophy as `nameHints` on variation
   points. The god-class design dropped from 4 to 3 on coverage; the requirements-missed design from
   4 to 1, which is what it deserved.
2. **An enum could not be a seam.** `AbstractionCheck` only considered interfaces and abstract
   classes, so `LogLevel` as an enum read as a *missing* abstraction. Enums now carry weight when
   something holds or uses them.
3. **`PricingEngine` was flagged as vague.** "Engine" was on the vague-suffix list; an orchestrator
   with a domain in its name is not vague. Removed.
4. **`Car` was expected to act.** The behaviour check flagged value classes with no methods as
   unexercised. Only concrete classes that declare behaviour are now expected to take a turn.

**Why it is here:** the AI wrote all four checks and I reviewed all four. Every one looked right.
They were wrong in ways only running real designs through them exposed — which is the argument for
calibration as a gate, made by the gate itself.

---

## 10. The evaluator was right and my test was wrong

**What happened.** An integration test submitted a strong design, advanced to the change stage, and
revised it with an `EnergyPricing` class behind `PricingStrategy` — the textbook absorption of the EV
change. It scored **0**. I assumed a bug in `BlastRadiusCheck`.

**What was actually true.** Hidden changes rotate by attempt number so a second attempt at the same
problem meets a different change. This was attempt two. It had been dealt *reserved spots for pass
holders*, and the revision answered the EV change instead. Nothing in it owned "reserved" or "pass",
so the check correctly reported that the change had not been absorbed.

**What shipped.** The test now revises for the change it was actually given (`ReservedFirstAllocator`
behind `SpotAllocator`), scores 4, and carries a comment. The check did not change. I mention it
because the reflex on seeing a surprising score was to doubt the evaluator, and the evaluator was
the one paying attention.

---

## Where AI was straightforwardly good

Scaffolding, Tailwind and Framer Motion component work, the Prisma schema, and first drafts of the
checks — all faster than writing by hand and roughly as good. The `DesignGraph` cycle detection is
essentially as drafted, including the iterative DFS. Most of the prose in these docs is AI-drafted and
then cut hard.

The pattern across all five decisions above is the same, and it is the actual finding: **AI output was
strongest where it was verifiable and weakest where it was merely plausible.** Every problem worth
catching was caught by re-reading the requirements, reading the current API docs, or running a test —
never by reading the code more carefully.

## 11. The free-tier model got the evidence right and the schema wrong

**Where:** first live run of the evaluator against Groq (`openai/gpt-oss-120b`), after the
provider adapter landed.

**What happened:** on the defend stage the model returned a correct band score and a sensible
concern, then failed schema validation twice and the whole result was dropped — because one of
its three evidence references was a `prose` ref without its `quote`. The score was right; one
field in one citation was missing.

**Judgement call:** failing the whole result for one malformed reference punished the learner for
the model's formatting, which is the opposite of what the grounding rule is for. The evaluator now
strips malformed references *before* validation and reports them in the grounding drop list, so
the score survives and the omission is still visible. The same run found that Groq had retired
the Llama model I had assumed as the default; the model list is now checked against the provider,
and the default is what the free tier actually serves.

**Also:** a key had been pasted into the tracked `apps/api/.env`, which Prisma auto-loads — so the
deterministic test suite silently started calling the network. Key moved to the gitignored
`.env.local`; the integration suite now pins `LLD_FORCE_STUB=1` regardless of environment.

## 12. The mentor named a class that did not exist — once in three runs

**Where:** `apps/api/scripts/live-mentor.ts`, three live reviewer's notes from Groq on the
god-class design, printing what prose grounding kept and dropped.

**What happened:** the prompt tells the model to describe a suggested class in words rather than
name it. Two runs complied fully. One ended with *"Start by extracting the findSpot behavior into a
new class (e.g., SpotAllocator) and let ParkingLotManager depend on it"* — sound advice, and a
class this learner does not have. Grounding dropped that sentence; the three that survived were
all about `ParkingLotManager` and read as a complete note.

**Judgement call:** I considered letting suggested names through when framed as suggestions
("e.g."). Decided against it: the promise under *why trust this?* is *every class named here is
one you wrote*, and a rule with an exception is a rule the learner cannot rely on. The filter stays;
the model loses one sentence in three runs and the note is still good.

**Also found on the same run:** Groq's JSON mode failed outright on the longer lesson output
("Failed to generate JSON", a 400), which the adapter had been treating as the provider being
down. It now retries once in plain mode, since every caller parses defensively anyway. And the
free tier's per-minute token limit bit on the third run — a reminder that the mentor's calls sit
on the queue behind the scores, never in front of them.

## 13. The follow-up that never came: a reasoning model with no room to answer

**Where:** first live run of the Socratic defend on Groq, `scratchpad/dialogue.mjs`.

**What happened:** three probes, three answers, zero follow-ups — and the failure was silent,
because a follow-up that fails its own rules is *meant* to be silently not asked. Adding a log line
showed the real reason: `gpt-oss-20b returned no text content`. It is a reasoning model; with
`maxTokens: 200` it spent the whole budget thinking and returned an empty message. The next probe
then hit the free tier's per-minute token limit, which my own test scripts had just consumed.

**Judgement call:** two fixes, and a line I chose not to cross. The adapter now passes the caller's
`effort` through as Groq's `reasoning_effort`, opt-in per provider so an endpoint that does not
know the field is not broken by it; and the follow-up gets 700 tokens of room. For the rate limit,
the adapter waits out a reset it can see (`retry-after`, or Groq's `x-ratelimit-reset-tokens`), once,
up to 30 seconds — and the mentor moved to the small model, whose budget is separate. What I did
not do is make the client retry harder or hide the limit: a learner on a free tier should see
"the AI half was skipped" rather than a report that arrives a minute late for no stated reason.

**What the run showed once it worked:** *"If ParkingLotManager.findSpot returns null, how will the
caller determine whether the null means all motorcycle spots are taken or that the vehicle type is
unsupported?"* — 668 ms, grounded, and a better follow-up than the authored probe it followed.

## 14. The generator's teacher: the evaluator repaired the model's "strong" design

**Where:** `apps/api/scripts/author-problem.ts`, first run on `library-management`.

**What happened:** the model's first strong design scored 0 on class responsibilities, 1 on
abstraction use and 2 on behaviour — list-shaped responsibility sentences, interfaces nothing
implements, two classes no scenario touches. Exactly the three flaws I made by hand on the first
four problems, now made by the model in one go. Rather than edit the prompt until the model
happened to comply, the script feeds the evaluator's own findings back as the repair prompt; the
second round cleared par on every measured criterion.

**What the gate could not see, and a person had to:** a hidden change about *database storage* in
a problem whose constraints say *no persistence layer*; a probe about *reservations* in a problem
with no reservations requirement; a variation point ("catalog storage mechanism") that is
infrastructure, not the object model. All three are well-formed, coherent, and wrong. I replaced
the seam with *borrowing policy varies by member type*, the probe with one about the immutability
requirement that was actually there, and re-ran the gate. Then found that the seam's own name hint
(`policy`) also matched `FinePolicy` — an evaluator artefact the script surfaced by naming the
class it had matched. Tightened the hints. The model authors; the evaluator gates; the person
reads.

## 15. A generated problem found a hole in the measured check

**Where:** promoting `tic-tac-toe`, the second model-drafted problem, through the change stage.

**What happened:** I ran the strong design through Change with a deliberately *wrong* revision —
the change dealt was "make the board size configurable"; I added a computer player instead. It
scored **4**. Two reasons, both in `BlastRadiusCheck`: "was the change absorbed" looked for the
change's vocabulary anywhere in the revised design, and the strong design already said *grid* and
*size* in v1; and "seam reused" credited *any* abstraction the new class implemented, not one that
had anything to do with the change. Neither could fire on Parking Lot, whose EV change uses words
no first design contains — which is why 148 tests and a calibration suite never noticed.

**Judgement call:** absorption is now measured on the *delta* — classes added, classes reopened,
new assumptions, the rationale — and a 4 requires the added class (or the rationale explaining it)
to carry the change's vocabulary. The existing test that lets a learner name the class
`MeteredPricing` and say "bills per kWh" in the rationale still passes; the unrelated-seam case now
scores 0 with "none of them speaks to the requirement that changed". The generated problem was
worth more as a test of the evaluator than as content.
