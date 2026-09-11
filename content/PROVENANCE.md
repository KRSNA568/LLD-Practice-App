# Content Provenance

## Where the problem statements came from

The 60 problem *titles* in `problems/catalog.json` are drawn from the commonly circulated body of
LLD / machine-coding interview questions. These are industry folklore — the same set appears across
dozens of public repositories, blogs and interview-prep sites, in the same way "implement an LRU
cache" or "design a parking lot" belongs to no one.

Sources surveyed to establish the canonical set and its rough difficulty ordering:

| Source | Used for |
|---|---|
| [ashishps1/awesome-low-level-design](https://github.com/ashishps1/awesome-low-level-design) | Core problem set and its easy/medium/hard tiering (Parking Lot, Vending Machine, ATM, Elevator, Splitwise, Chess, Snake & Ladder, Ride-Sharing, Food Delivery, Music Streaming, Auction, Hotel, Airline, Course Registration, CricInfo, Stock Brokerage, Traffic Signal, Logging Framework, Task Management, Digital Wallet, LRU Cache, Pub/Sub, Tic Tac Toe, Car Rental, Restaurant, Concert Booking, Library, Stack Overflow, Coffee Machine, LinkedIn, Social Network, Online Shopping) |
| [kumaransg/LLD](https://github.com/kumaransg/LLD) | Company-attributed machine-coding rounds — Cricket Dashboard (Udaan), Event Calendar (Flipkart), Food Ordering (Flipkart), Stock Exchange (Navi), Property Listing (ClearTrip), Ledger (Navi), LeetCode-like platform (Flipkart); plus Chat, Dropbox, Google Docs, Zoom, Tinder, Crypto Exchange |
| [workat.tech machine coding](https://workat.tech/machine-coding/) | Machine-coding round framing and time-boxing conventions |
| [InterviewBit LLD questions](https://www.interviewbit.com/low-level-design-interview-questions/) | Cross-check on commonly asked set |
| [Flipkart machine coding rounds writeup](https://medium.com/@prashant558908/flipkart-low-level-design-interview-questions-from-recent-machine-coding-rounds-976f106f6368) | Billing/discounts and food-order command-style problems |
| [codezym.com](https://codezym.com/) | Confirmation that pattern-oriented LLD practice is an existing category |
| [Microsoft Learn — Dangers of Violating SOLID](https://learn.microsoft.com/en-us/archive/msdn-magazine/2014/may/csharp-best-practices-dangers-of-violating-solid-principles-in-csharp), [devleader SOLID violations](https://www.devleader.ca/2026/06/16/solid-violations-c-how-to-recognize-and-fix-each-one), [Devonblog SRP in the wild](https://devonblog.com/software-development/solid-violations-in-the-wild-the-single-responsibility-principle/) | Canonical violation shapes used to author the drill bank — `*Manager` god classes, fat interfaces forcing stub methods, `new Concrete()` inside high-level classes, subtype overrides that throw |

**No text was copied.** Every brief, requirement, variation point and change scenario in this
catalogue is written fresh. What was taken from public sources is the *set of problem names* and
their approximate difficulty — which is not ownable and not where the value is.

## Where the value actually is

A problem statement is a commodity. What makes a problem *practisable* is the instrumentation
around it, none of which exists in any public source:

- `requirements[]` with `keywords` — authored vocabulary per requirement, so coverage is checked
  against what *this* requirement is about rather than words shared across the whole brief
- `variationPoints[]` — the seams a good design must have; powers the "missing abstraction" check
- `scenarios[]` with `mustInvolve` and `expectsFailurePath` — what the learner walks through the
  design, and which walks must end in a refusal
- `hiddenChanges[]` with `mustIntroduce` and `expectedSeam` — the requirement change revealed only
  after the design is frozen; the diff against it is how extensibility is measured
- `probes[]` with `triggerWhen` — the defend-stage questions, selected by what the evaluator found
- `goldDesigns` — three or four full designs per problem, used by the critique warm-up and the
  calibration suite, so content and tests cannot drift apart
- `critiquePairs[]` — two gold designs, one question, one authored answer and a paragraph of telling
- `calibrationSet[]` — expected score bands per gold design; `tests/evaluation/Calibration.test.ts`
  fails if any evaluator change moves a score outside its band

That last one is the publication gate. A problem where a strong submission and a god-class submission
score the same is a problem whose instrumentation is wrong — and it does not ship.

## Pedagogical sources behind the loop

The shape of the loop — design, run, change, defend, with a critique warm-up — comes from the
research summarised in `RESEARCH.md §3`:

| Source | What it contributed |
|---|---|
| Thomasson, Ratcliffe & Thomas, *Identifying Novice Difficulties in Object Oriented Design*, ITiCSE 2006 | The 97% non-referenced-class finding that motivates the Run stage |
| Beck & Cunningham, *A Laboratory for Teaching Object-Oriented Thinking*, OOPSLA 1989 | CRC cards and scenario role-play — the walkthrough is this as a list |
| Parnas, *On the Criteria To Be Used in Decomposing Systems into Modules*, CACM 1972 | Design-for-change as the criterion; the hidden change measures it |
| Schwartz & Bransford, *A Time for Telling*, 1998 | Contrasting cases before instruction — the critique warm-up and its "telling" |
| Große & Renkl; Adams et al. — erroneous examples | Finding the flaw in a worked solution as a learning mechanic |
| Georgia Tech *Socratic Mind* | AI oral defence of one's own answers — the defend stage |
| Pollitt, *Adaptive Comparative Judgement*, 2012 | Pairwise judgement as a reliable assessment primitive — the future of the critique board |
| Twente 2025; *Beyond Grading Accuracy* 2026 — LLM grading of UML | Where LLM graders are weak, and so what is never sent to the model |

## Why 20 and not 60

The first cut of this catalogue held 60 problems. It was trimmed to 20 on purpose.

Catalogue size is set by **concept-graph coverage**, not by volume. The mastery model will not report
a trend on a concept until it has at least three independent observations, so the real requirement is
*every concept exercised by ≥3 problems* — which 20 satisfies (see `conceptCoverage` in
`catalog.json`).

Beyond that, each problem costs roughly 2–3 hours to instrument properly, almost all of it in writing
the calibration set. Sixty shallow problems is a demo. Twenty calibrated ones is a system. The
trigger to add problem 21 is a concept dropping below the floor of 3, or a new domain worth covering
— never the count itself.

## What the canonical violation shapes are used for

The SOLID sources above were surveyed to establish the recurring violation shapes real learners
produce — `*Manager` god classes, fat interfaces forcing stubbed methods, type-switches, `new
Concrete()` inside high-level classes, overrides that throw, flag-based state. These are encoded in
each problem's `commonFailureModes[]`, which is what lets the rule analyzer name a failure precisely
rather than describing it vaguely.
