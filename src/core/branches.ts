// Ветки: команда делится на две подгруппы, каждая развивает своё направление в одном этапе
// (одна комната — один этап). Генерация — по веткам, оценка — общая и слепая, итог — сравнение лидеров.
import type {CardResult, Results} from './math'
import type {Card, Criterion} from './types'
import type {FieldValue} from './template'

export interface Branch {
  id: string // 'A' | 'B'
  title: string
  source?: string // направление ветки: из чего исходит подгруппа
  sourceFields?: Record<string, FieldValue>
}

export const BRANCH_IDS = ['A', 'B']

export function makeBranches(list: {title: string; source?: string; sourceFields?: Record<string, FieldValue>}[]): Branch[] {
  return list.slice(0, BRANCH_IDS.length).map((b, i) => ({
    id: BRANCH_IDS[i], title: b.title.trim().slice(0, 120) || `Ветка ${BRANCH_IDS[i]}`,
    source: b.source?.trim().slice(0, 400) || undefined, sourceFields: b.sourceFields
  }))
}

// Самая малочисленная ветка (при равенстве — первая)
export function smallestBranch(branches: Branch[], branchOf: Record<string, string>, active: string[]): string {
  const count = (id: string) => active.filter(p => branchOf[p] === id).length
  return [...branches].sort((a, b) => count(a.id) - count(b.id))[0].id
}

// Раскладываем тех, кто ещё не выбрал ветку, — поровну
export function autoAssign(branches: Branch[], branchOf: Record<string, string>, active: string[]): Record<string, string> {
  const next = {...branchOf}
  for (const p of active) if (!next[p] || !branches.some(b => b.id === next[p])) next[p] = smallestBranch(branches, next, active.filter(x => next[x]))
  return next
}

export interface BranchSummary {
  branch: Branch
  people: number
  cards: number
  leader?: CardResult
  avgByCriterion: {criterionId: string; value: number | null}[]
  disputed: number
}

// Сравнение веток: лидер каждой (лучшее место в общем рейтинге), его средние по критериям, споры
export function compareBranches(branches: Branch[], cards: Pick<Card, 'id' | 'branchId'>[], branchOf: Record<string, string>, res: Results | undefined, criteria: Criterion[]): BranchSummary[] {
  return branches.map(b => {
    const ids = new Set(cards.filter(c => c.branchId === b.id).map(c => c.id))
    const mine = res?.cards.filter(r => ids.has(r.cardId)) ?? []
    const leader = mine.filter(r => r.score !== null).sort((x, y) => x.rank - y.rank)[0]
    return {
      branch: b,
      people: Object.values(branchOf).filter(v => v === b.id).length,
      cards: ids.size,
      leader,
      avgByCriterion: criteria.filter(c => c.approved).map(c => ({criterionId: c.id, value: leader?.perCriterion.find(p => p.criterionId === c.id)?.mean ?? null})),
      disputed: mine.filter(r => r.disputed).length
    }
  })
}
