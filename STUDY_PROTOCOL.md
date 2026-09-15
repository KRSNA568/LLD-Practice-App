# Study protocol — does the engine tell a senior from a junior?

**What this is.** The facilitator's script for study V2 in [PRODUCT_PLAN.md](PRODUCT_PLAN.md):
six engineers, three with six or more years and three with two or fewer, each doing one problem,
and the question of whether the scores separate them. It is the cheapest thing that could kill the
product, which is why it runs first.

**What it is not.** Six people is a smoke test, not a study. It cannot give a correlation worth
quoting. It can tell you whether the full expert-agreement study is worth paying for, and it will
show you six people meeting the product cold, which is usability data you cannot get any other way.

---

## Before the first session

1. **Pick the problem.** Parking Lot. Everyone does the same one; it is the most calibrated and its
   change stage has been walked most.
2. **Start clean.** From the repo root:
   ```bash
   npx tsx apps/api/scripts/reset-study.ts            # see what is there
   npx tsx apps/api/scripts/reset-study.ts --all --yes # if you want it gone
   ```
   Your own test attempts count as noise in the export. Clear them or note their learner names.
3. **Run the app** with the real model, not the stub — the mentor notes are part of what they see:
   ```bash
   npm run dev
   ```
   Check `http://localhost:4000/api/health` says `groq`, not `stub`.
4. **Budget the model.** Groq's free tier allows roughly nineteen full attempts a day and one
   learner at a time. Six sessions across two days is fine. Six in one afternoon is fine. Two at
   once is not.
5. **Decide how they reach it.** Screen-share with you driving is simplest and gives you the most:
   you watch. If they drive on their own machine, they need the URL and nothing else — the
   first-visit prompt asks their name and that is the whole setup.

## The session — 45 minutes

| Minutes | What happens | What you do |
|---|---|---|
| 0–3 | Welcome, consent (below), what this is | Read the framing aloud. Do not describe the product. |
| 3–5 | They enter a name at the prompt | Use a code: **S1, S2, S3** for senior, **J1, J2, J3** for junior. The export keys on it. |
| 5–35 | Design → run → change → defend | **Silence.** Take notes (below). Answer only "how do I…" questions about the interface, never about design. |
| 35–42 | They read the report | Silence. Watch where their eyes go and what they click. |
| 42–45 | Three questions | Ask, do not lead. Write the answers down verbatim. |

**The framing, read aloud:**

> "This is a design exercise. You'll be given a problem and asked to sketch the classes, walk a
> few scenarios through them, and then something will change. There's no right answer and I'm not
> grading you — I'm testing whether the tool's feedback is any good. Think out loud if you like.
> I'll stay quiet unless you get stuck on the interface itself."

**Consent, read aloud, then confirm they agree:**

> "Your design and your answers are stored under the code name you're about to enter, not your
> real name. I'll use the scores to check whether the tool measures what it claims to. I won't
> share your design outside this. You can stop at any point. Okay?"

**The three questions at the end:**

1. "Was there a moment the feedback told you something you didn't already know about your design?"
2. "Was there a finding you thought was wrong?" — *this one matters most; write it down exactly.*
3. "If a friend were preparing for a design interview, would you tell them about this? Why or why not?"

## What not to say

- Do not explain what a criterion means. If they ask "what does coupling mean here?", say "what
  do you think it means?" and write down what they say.
- Do not hint at the hidden change. Do not say "think about extensibility."
- Do not say "good" or "interesting" during the attempt. Say "mm" or nothing.
- Do not describe the product until after question 3. Then you can.

## Notes to take during the attempt

One line each, with the minute:

- Where they hesitated for more than thirty seconds, and on what.
- Anything they said out loud about the interface ("where do I…", "what does this button…").
- The first thing they did on the report page. The first evidence chip they clicked.
- Any time they disagreed with the tool out loud.
- Whether they abandoned a stage, and which.

These notes are the usability half of the session and they do not come out of the export.

---

## After the last session — the analysis

```bash
npx tsx apps/api/scripts/export-study.ts --out-dir study-1
```

Two files. `scores.csv` is one row per criterion per stage per attempt; `attempts.csv` is one row
per attempt with timings and cost. The columns the analysis uses:

**Separation** (the actual question). From `scores.csv`, take the design stage only, and the five
measured criteria: `requirement-coverage`, `class-responsibilities`, `coupling-cohesion`,
`abstraction-use`, `behaviour`. For each learner, the mean of those five is their composite.
Three senior composites, three junior composites.

- **Passes** if every senior composite is above every junior composite — no overlap at all. With
  three and three, that is the only result that means anything.
- **Inconclusive** if they overlap by one. Look at *which* criteria separate and which do not;
  that is what the full study needs to know.
- **Fails** if senior and junior are indistinguishable. Stop. The rubric needs work before anyone
  else touches this.

Then the same for `change-resilience` (change stage) on its own. It is the criterion nobody else
measures, and it should separate harder than the design ones if the product's thesis is right.

**The finding they thought was wrong.** For every answer to question 2, find the row in
`scores.csv` and read the concern in the report. Decide honestly whether the tool or the engineer
was right. Every case where a senior engineer was right and the tool was wrong is a rubric bug,
and worth more than the separation result.

**Activation, from `attempts.csv`.** `stagesSubmitted` out of three, and `abandoned`. If anyone
did not finish, `secondsDesigning` and the notes say where. Six people who all finish is a good
sign; two who quit at the change stage is a product finding, not a participant problem.

**Time and cost, from `attempts.csv`.** `secondsDesigning` + `secondsRevising` +
`secondsDefending` is the real attempt length against the 30 minutes budgeted. The token columns
are what six real attempts cost — the first cost figures from people rather than scripts.

## What to do with the result

| Result | Next |
|---|---|
| Separates cleanly | Recruit the expert panel for V1. Start Phase 3 of the build plan. |
| Inconclusive | Run six more before deciding. Cheap now that the setup exists. |
| Does not separate | Do not build anything. Read every "the tool was wrong" note. The rubric work in PRODUCT_PLAN §3 starts here. |
