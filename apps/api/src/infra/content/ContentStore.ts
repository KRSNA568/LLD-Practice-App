import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  conceptGraphSchema,
  problemSchema,
  type Concept,
  type Problem,
  type ProblemSummary,
  type PublicProblem,
  type Rubric,
} from '@lld/contracts'

/**
 * Loads problems and rubrics from `content/`.
 *
 * Content is versioned data, not code: adding a problem is dropping in a JSON file,
 * never a deploy. Everything is read once at boot and validated against the schema
 * on the way in, so a malformed problem fails loudly at startup rather than halfway
 * through some learner's evaluation.
 */

const CONTENT_ROOT = new URL('../../../../../content/', import.meta.url)

type CatalogEntry = {
  id: string
  tier: number
  minutes: number
  title: string
  domain: string
  conceptTags: string[]
  detailFile?: string
}

function read<T>(relative: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, CONTENT_ROOT)), 'utf8')) as T
}

export class ContentStore {
  private readonly problems = new Map<string, Problem>()
  private readonly rubrics = new Map<string, Rubric>()
  private readonly order: string[] = []
  private concepts: Concept[] = []

  private constructor() {}

  static load(): ContentStore {
    const store = new ContentStore()

    const rubric = read<Rubric>('rubrics/lld-core.json')
    store.rubrics.set(rubric.id, rubric)

    const graph = conceptGraphSchema.safeParse(read<unknown>('concepts/concept-graph.json'))
    if (!graph.success) throw new Error(`content/concepts/concept-graph.json is invalid: ${graph.error.message}`)
    store.concepts = graph.data.concepts
    const known = new Set(store.concepts.map((c) => c.id))
    for (const criterion of rubric.criteria) {
      for (const id of criterion.conceptIds) {
        if (!known.has(id)) throw new Error(`rubric criterion ${criterion.id} names unknown concept "${id}"`)
      }
    }

    const catalog = read<{ problems: CatalogEntry[] }>('problems/catalog.json')

    for (const entry of catalog.problems) {
      const file = entry.detailFile ?? `${entry.id}.json`
      const path = new URL(`problems/${file}`, CONTENT_ROOT)

      // Only fully instrumented problems are playable. The rest of the catalogue is
      // real content waiting on its requirements, variation points, scenarios and
      // hidden change — listing them as startable would promise a practice loop the
      // evaluator cannot actually deliver.
      if (!existsSync(fileURLToPath(path))) continue

      const parsed = problemSchema.safeParse(read<unknown>(`problems/${file}`))
      if (!parsed.success) {
        throw new Error(
          `content/problems/${file} is not a valid problem: ${parsed.error.issues
            .map((i) => `${i.path.join('.')} ${i.message}`)
            .join('; ')}`,
        )
      }

      ContentStore.assertCoherent(parsed.data, file)
      store.problems.set(parsed.data.id, parsed.data)
      store.order.push(parsed.data.id)
    }

    if (store.problems.size === 0) {
      throw new Error('No playable problems found in content/problems')
    }
    return store
  }

  /**
   * Cross-field checks the schema cannot express. A critique pair that points at a
   * gold design that does not exist, or an answer naming a class that design does
   * not contain, is a content bug that should fail at boot, not in front of a learner.
   */
  private static assertCoherent(problem: Problem, file: string): void {
    const fail = (msg: string): never => {
      throw new Error(`content/problems/${file}: ${msg}`)
    }
    if (problem.hiddenChanges.length === 0) fail('has no hidden change — the change stage cannot run')
    if (problem.scenarios.length === 0) fail('has no scenarios — the behaviour criterion cannot be scored')

    const scenarioIds = new Set(problem.scenarios.map((s) => s.id))
    for (const [label, design] of Object.entries(problem.goldDesigns)) {
      for (const w of design.walkthroughs) {
        if (!scenarioIds.has(w.scenarioId)) fail(`gold design "${label}" walks unknown scenario "${w.scenarioId}"`)
      }
    }

    for (const pair of problem.critiquePairs) {
      for (const side of [pair.left, pair.right]) {
        if (!problem.goldDesigns[side]) fail(`critique pair "${pair.id}" references missing gold design "${side}"`)
      }
      if (pair.answer.design !== pair.left && pair.answer.design !== pair.right) {
        fail(`critique pair "${pair.id}" answer names a design that is not in the pair`)
      }
      const design = problem.goldDesigns[pair.answer.design]!
      if (!design.classes.some((c) => c.name.toLowerCase() === pair.answer.className.toLowerCase())) {
        fail(`critique pair "${pair.id}" answer names class "${pair.answer.className}" which "${pair.answer.design}" does not contain`)
      }
    }

    for (const entry of problem.calibrationSet) {
      if (!problem.goldDesigns[entry.designId]) fail(`calibration entry "${entry.label}" references missing gold design "${entry.designId}"`)
    }
  }

  listConcepts(): Concept[] {
    return this.concepts
  }

  listProblems(): Problem[] {
    return this.order.map((id) => this.problems.get(id)!)
  }

  getProblem(id: string): Problem | undefined {
    return this.problems.get(id)
  }

  getRubric(id: string): Rubric | undefined {
    return this.rubrics.get(id)
  }

  /** The rubric a given problem pins. Scores are only comparable within one version. */
  rubricFor(problem: Problem): Rubric {
    const rubric = this.getRubric(problem.rubricId)
    if (!rubric) throw new Error(`Problem ${problem.id} references unknown rubric ${problem.rubricId}`)
    if (rubric.version !== problem.rubricVersion) {
      throw new Error(
        `Problem ${problem.id} pins rubric ${rubric.id}@${problem.rubricVersion} but ${rubric.version} is loaded. ` +
          `Bump the problem or restore the pinned rubric — mixing versions silently makes past scores incomparable.`,
      )
    }
    return rubric
  }

  /**
   * What the web app may see before the design is frozen. The hidden change stays
   * hidden, probes are chosen later, and critique answers are never on the wire.
   */
  toPublic(problem: Problem): PublicProblem {
    const { hiddenChanges, probes, goldDesigns, critiquePairs, calibrationSet, ...rest } = problem
    return {
      ...rest,
      hiddenChangeCount: hiddenChanges.length,
      critiquePairCount: critiquePairs.length,
    }
  }

  toSummary(
    problem: Problem,
    attemptCount: number,
    bestOverall: number | null,
    critiquesCorrect: number,
  ): ProblemSummary {
    return {
      id: problem.id,
      title: problem.title,
      tier: problem.tier,
      minutes: problem.minutes,
      domain: problem.domain,
      conceptTags: problem.conceptTags,
      attemptCount,
      bestOverall,
      critiquePairCount: problem.critiquePairs.length,
      critiquesCorrect,
    }
  }
}
