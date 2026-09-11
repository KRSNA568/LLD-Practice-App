# Research Note

## 1. The learner problem

LLD practice is easy to start and almost impossible to finish. A learner designs a Parking Lot,
produces eight classes and some arrows, and then hits a wall that has nothing to do with effort:
**there is no way to find out whether it is any good.**

A LeetCode solution is either accepted or it is not — the test suite is the oracle. An LLD solution
has no oracle. Ten competent engineers produce ten defensible designs for the same brief. So the
learner falls back on one of three things, and all three fail:

| What learners actually do | Why it fails |
|---|---|
| Compare against a reference solution found online | Punishes legitimate divergence. Teaches *the design I saw*, not the reasoning behind it. |
| Self-assess against SOLID | Requires already having the judgement they are trying to build. *"Is it clean?"* is unfalsifiable for a beginner. |
| Ask an LLM "is this a good design?" | Fluent, confident, inconsistent. Ask twice, get two verdicts, no way to tell which is right. |

Because there is no feedback signal there is **no loop**: the learner cannot tell whether attempt
five is better than attempt one, so nothing accumulates.

## 2. What exists today

**Problem banks** — [awesome-low-level-design](https://github.com/ashishps1/awesome-low-level-design),
[kumaransg/LLD](https://github.com/kumaransg/LLD) — cover the canonical set, tiered, with worked
solutions. Content is abundant and free. **Content is not the bottleneck.**

**Interview-prep sites** — [Hello Interview](https://www.hellointerview.com/learn/low-level-design/in-a-hurry/introduction),
[InterviewBit](https://www.interviewbit.com/low-level-design-interview-questions/),
[DesignGurus](https://www.designgurus.io/answers/detail/how-do-i-prepare-for-low-level-system-design)
— teach an approach and show theirs. Read-then-recognise. No submission, so nothing to give feedback on.

**Practice platforms with AI review** — this category moved in the last year and is now the bar.
[AlgoMaster](https://algomaster.io/practice/low-level-design) (by the author of the
awesome-low-level-design repo) runs *read the contract → implement → run → submit* with a **dual
gate**: hidden tests must pass, *then* an AI design review scores rubric dimensions — encapsulation,
rule placement, structure — with the rubric visible before coding and every submission archived.
[Low Level Design Mastery](https://www.lowleveldesignmastery.com/) does pick → diagram → code → AI
feedback. [workat.tech](https://workat.tech/machine-coding/) and [codezym](https://codezym.com/)
run timed machine-coding rounds, the format the actual Flipkart/Uber/Swiggy interview uses.

**What none of them do**: run the design against a scenario, change the requirements *after*
submission and measure what breaks, make the learner defend a decision, or watch for the same
weakness across problems. Every one of them grades a static artifact.

## 3. What the research says

### 3.1 Novices fail at *connection*, not concepts

Thomasson, Ratcliffe & Thomas, [*Identifying Novice Difficulties in Object Oriented Design*](https://users.aber.ac.uk/ltt/RESEARCH/fp099-thomasson.pdf)
(ITiCSE 2006) analysed 180 novice class designs:

| Fault | Share of designs |
|---|---|
| A class declared but integrated into nothing | **97%** — 2.15 per design on average |
| An attribute in the wrong class (cohesion) | 73% |
| A reference to a class never defined | 28% |
| Identified 5 of the 7 suitable classes | only 14% of first-timers |

Their explanation: *"students know that they need a class to model a concept but cannot figure out
how to integrate the class into their designs… the fact that classes interact must be demonstrated
early."* The #1 fault is a failure to *run the design in your head*. The classic cure is CRC-card
role-play ([Beck & Cunningham, OOPSLA 1989](https://c2.com/doc/oopsla89/paper.html)): pick up the
card, play the object, execute a scenario — *"found successful in teaching novice programmers the
concepts of objects."*

### 3.2 Design-for-change is the criterion, and interviewers test it with follow-ups

Parnas (1972) defines a module as something that hides *a design decision likely to change*, and
notes the principle *"takes at least a semester of practice"*. Every interview guide converges on
the same test: *"interviewers test whether your implementation is extensible through follow-ups —
if adding one small requirement forces a rewrite, the initial design was too rigid"*
([machine-coding guide](https://www.lowleveldesignmastery.com/blog/machine-coding-round/));
*"Can the design be extended without rewriting everything?"* (Hello Interview). The interview is
not *show me a design*; it is *show me a design, now here is a change*.

### 3.3 Judgement is built by comparing and defending, not by receiving scores

- **Contrasting cases.** Schwartz & Bransford, [*A Time for Telling*](http://aaalab.stanford.edu/assets/papers/earlier/A_time_for_telling.pdf)
  (1998): students who compared cases *before* instruction transferred to novel problems better than
  every other condition, while scoring the same on fact tests. Comparison creates the readiness to
  learn from what comes next.
- **Erroneous examples.** Finding and fixing errors in worked solutions *"prepare students better
  for problem solving in comparison to worked examples"* and build reflection
  ([Große & Renkl](https://mrbartonmaths.com/resourcesnew/8.%20Research/Explicit%20Instruction/Worked%20examples%20with%20mistakes.pdf);
  [Adams et al.](https://link.springer.com/article/10.1007/s40593-015-0064-x)).
- **Oral defence.** Georgia Tech's [Socratic Mind](https://socraticmind.com/) — AI questioning that
  makes students *"explain, justify, and defend"* — shows statistically significant gains across
  5,000+ students at GT and UCSD, strongest for lower-achieving students.
- **Comparative judgement.** [Adaptive Comparative Judgement](https://www.tandfonline.com/doi/abs/10.1080/0969594X.2012.665354)
  reaches reliability above 0.80 from pairwise *which is better* decisions alone — *"considerably
  higher than practicable operational marking."*

### 3.4 LLM graders are good at nodes, weak at edges, and better at pairs than points

- Two 2025–26 studies grading UML class diagrams against TAs ([Twente](https://research.utwente.nl/en/publications/toward-automated-uml-diagram-assessment-comparing-llm-generated-s/);
  [*Beyond Grading Accuracy*](https://arxiv.org/html/2603.16357v2), 92 diagrams, 40-point rubric):
  ρ ≈ 0.76–0.80 overall, but **97.5% accuracy identifying classes, 84.7% on associations, 82.7% on
  multiplicities, 55–60% on late-introduced entities**, and five of six models were systematically
  *harsher* than the TAs.
- LLM-as-judge work agrees that pairwise verdicts track humans more reliably than absolute scores; a
  4.1 versus 4.0 is inside the judge's own variance.
- [*Rubric Is All You Need*](https://arxiv.org/pdf/2503.23989) (ICER 2025): question-specific
  rubrics beat open judgement.

## 4. The gaps

1. **Content is solved; evaluation is not** — and *AI rubric review* is now what everyone ships.
2. **Nobody evaluates behaviour.** Every tool grades structure. The most common novice fault is
   invisible in structure and obvious the moment you try to run a scenario through the design.
3. **Nobody evaluates change.** Extensibility is either an LLM opinion or a human interviewer's
   follow-up. It is measurable: freeze the design, reveal a change, diff.
4. **Feedback is not anchored** and does not accumulate. *"Coupling 6/10"* is unfalsifiable; nothing
   watches across attempts.
5. **Structural judgements are handed to the evaluator least suited to them.** The research says
   LLMs read prose well and count edges badly.

## 5. Product direction

**Stress-test the design; do not grade the artifact.** One attempt runs the practice loop three
times, and each pass produces a different *kind* of evidence:

| Stage | The learner… | Evidence | Who judges |
|---|---|---|---|
| **Design** | declares classes, responsibilities, relationships, and the decisions they rejected | structure, rationale | measured; AI reads the rationale |
| **Run** | walks three scenarios through the design, step by `Class ▸ method` step | behaviour | measured |
| **Change** | is shown a requirement change *only after* the design is frozen, and revises | v1 → v2 diff — blast radius | measured |
| **Defend** | answers up to three probes chosen from their own findings | reasoning | AI reads, every citation verified |

Before the first attempt at a problem, an optional **critique** warm-up: two designs, one question
(*"weekend pricing arrives — click the class that lets this design absorb it"*), one click. That is
contrasting cases and erroneous examples in one mechanic, with no evaluator at all.

**AI reads; math measures.** Six of eight rubric criteria are decided from the design graph, the
walkthrough and the diff. The LLM gets the two that need reading. Every finding cites a position in
the learner's own submission, and a criterion that keeps failing across problems is surfaced and
used to choose the next problem.

**Deliberately not built:** a reference-solution library (teaches imitation), a code sandbox
(measures coding fluency, and AlgoMaster already does it well), LLM-generated probes (authored probes
triggered by findings give the same targeting with zero hallucination risk).

## Sources

- [ashishps1/awesome-low-level-design](https://github.com/ashishps1/awesome-low-level-design) · [kumaransg/LLD](https://github.com/kumaransg/LLD) — problem set
- [AlgoMaster LLD practice](https://algomaster.io/practice/low-level-design) · [Low Level Design Mastery](https://www.lowleveldesignmastery.com/) · [workat.tech](https://workat.tech/machine-coding/) · [codezym](https://codezym.com/) — current practice platforms
- [Hello Interview](https://www.hellointerview.com/learn/low-level-design/in-a-hurry/introduction) · [InterviewBit](https://www.interviewbit.com/low-level-design-interview-questions/) · [DesignGurus](https://www.designgurus.io/answers/detail/how-do-i-prepare-for-low-level-system-design) · [machine-coding round guide](https://www.lowleveldesignmastery.com/blog/machine-coding-round/) — what interviewers test
- [Thomasson, Ratcliffe & Thomas, ITiCSE 2006](https://users.aber.ac.uk/ltt/RESEARCH/fp099-thomasson.pdf) — novice design faults, n=180
- [Beck & Cunningham, OOPSLA 1989](https://c2.com/doc/oopsla89/paper.html) — CRC cards and scenario role-play
- Parnas, *On the Criteria To Be Used in Decomposing Systems into Modules*, CACM 1972 — information hiding
- [Schwartz & Bransford, *A Time for Telling*, 1998](http://aaalab.stanford.edu/assets/papers/earlier/A_time_for_telling.pdf) — contrasting cases
- [Große & Renkl](https://mrbartonmaths.com/resourcesnew/8.%20Research/Explicit%20Instruction/Worked%20examples%20with%20mistakes.pdf) · [Adams et al., IJAIED 2014](https://link.springer.com/article/10.1007/s40593-015-0064-x) — erroneous examples
- [Socratic Mind, Georgia Tech](https://socraticmind.com/) · [ACM L@S 2024](https://dl.acm.org/doi/pdf/10.1145/3657604.3664661) — AI oral assessment
- [Pollitt, *The method of Adaptive Comparative Judgement*, 2012](https://www.tandfonline.com/doi/abs/10.1080/0969594X.2012.665354) — comparative judgement reliability
- [Twente, LLM vs TA grading of UML](https://research.utwente.nl/en/publications/toward-automated-uml-diagram-assessment-comparing-llm-generated-s/) · [*Beyond Grading Accuracy*, 2026](https://arxiv.org/html/2603.16357v2) — where LLM graders are weak
- [*Rubric Is All You Need*, ICER 2025](https://arxiv.org/pdf/2503.23989) — question-specific rubrics
