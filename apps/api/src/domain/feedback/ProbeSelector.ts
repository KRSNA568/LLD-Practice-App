import type { CriterionResult, Probe } from '@lld/contracts'

/**
 * Chooses which probes to put to the learner in the defend stage.
 *
 * Probes are authored per problem, not generated, and *selected by the findings*.
 * A probe with `triggerWhen: { abstraction-use, maxScore: 2 }` is asked only of a
 * learner whose design scored 2 or below there — and `{{class}}` in its text is
 * replaced with the class that finding cited, so the question is about *their*
 * `ParkingLotManager`, not a hypothetical one.
 *
 * Deterministic on purpose. Generating probes with an LLM would produce sharper
 * questions some of the time and hallucinated ones the rest; authored probes
 * targeted by real findings are sharp every time and cannot cite a class that does
 * not exist.
 */

export const MAX_PROBES = 3

export type SelectedProbe = Probe & {
  /** True when a finding triggered this probe, as opposed to it being a default. */
  triggered: boolean
  /** The class name substituted into the prompt, if any. */
  aboutClass: string | null
}

export function selectProbes(probes: readonly Probe[], findings: readonly CriterionResult[]): SelectedProbe[] {
  const byCriterion = new Map(findings.map((f) => [f.criterionId, f]))

  const triggered: SelectedProbe[] = []
  const defaults: SelectedProbe[] = []
  const untriggered: SelectedProbe[] = []

  for (const probe of probes) {
    const trigger = probe.triggerWhen
    const finding = trigger ? byCriterion.get(trigger.criterionId) : undefined

    if (trigger) {
      if (!finding || finding.score > trigger.maxScore) {
        // Its trigger did not fire, but it is still a fair question about this
        // problem — a strong design deserves three questions too, and a probe
        // whose class slot is empty falls back to "your design".
        const cited = finding?.evidence.find((e) => e.kind === 'class')
        const aboutClass = cited && cited.kind === 'class' ? cited.name : null
        untriggered.push({ ...probe, prompt: fill(probe.prompt, aboutClass), triggered: false, aboutClass })
        continue
      }
      const cited = finding.evidence.find((e) => e.kind === 'class')
      const aboutClass = cited && cited.kind === 'class' ? cited.name : null
      triggered.push({ ...probe, prompt: fill(probe.prompt, aboutClass), triggered: true, aboutClass })
    } else {
      defaults.push({ ...probe, prompt: fill(probe.prompt, null), triggered: false, aboutClass: null })
    }
  }

  // Triggered probes first — they are about something the learner actually did.
  // Worst-scoring finding first among those, so the most important question is asked
  // even if only one is.
  triggered.sort((a, b) => {
    const sa = byCriterion.get(a.triggerWhen!.criterionId)?.score ?? 4
    const sb = byCriterion.get(b.triggerWhen!.criterionId)?.score ?? 4
    return sa - sb
  })

  // Triggered, then the authored defaults, then whatever is left — up to three.
  return [...triggered, ...defaults, ...untriggered].slice(0, MAX_PROBES)
}

/**
 * A probe written around `{{class}}` still has to read as a sentence when the
 * finding cited nothing. "Which method in your design changes" is the fallback.
 */
function fill(prompt: string, className: string | null): string {
  return prompt.replace(/\{\{class\}\}/g, className ?? 'your design')
}
