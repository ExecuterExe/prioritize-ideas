// MVP-доска: компоненты продукта по корзинам «MVP / 2.0 / потом» с проверкой зависимостей и бюджета.
import type {CardResult} from './math'
import type {Criterion} from './types'

export type Bucket = 'mvp' | 'v2' | 'later'

export interface Board {
  buckets: Record<string, Bucket>
  deps: Record<string, string[]>
  budget: number // сколько «очков сложности» команда потянет в MVP
}

export const BUCKET_LABEL: Record<Bucket, string> = {mvp: '🚀 MVP', v2: '🧩 Версия 2.0', later: '🕒 Потом'}
export const DEFAULT_BUDGET = 10

export const COMPONENT_TYPES = ['Функция', 'Интерфейс', 'Данные', 'Интеграция', 'Внешний участник']

export interface ComponentScore {
  value: number | null
  effort: number | null
}

export function componentScores(results: CardResult[], criteria: Criterion[]): Record<string, ComponentScore> {
  const id = (key: string) => criteria.find(c => c.fromLibrary === key && c.approved)?.id
  const v = id('comp-value'), e = id('comp-effort')
  const out: Record<string, ComponentScore> = {}
  for (const r of results) {
    out[r.cardId] = {
      value: r.perCriterion.find(p => p.criterionId === v)?.mean ?? null,
      effort: r.perCriterion.find(p => p.criterionId === e)?.mean ?? null
    }
  }
  return out
}

// Подсказка раскладки: ценное и несложное — в MVP, ценное — в 2.0, остальное — потом
export function suggestBuckets(scores: Record<string, ComponentScore>): Record<string, Bucket> {
  const out: Record<string, Bucket> = {}
  for (const [id, s] of Object.entries(scores)) {
    if (s.value == null) { out[id] = 'v2'; continue }
    if (s.value >= 3.5 && (s.effort ?? 3) <= 3.5) out[id] = 'mvp'
    else if (s.value >= 3) out[id] = 'v2'
    else out[id] = 'later'
  }
  return out
}

export interface BoardCheck {
  mvpEffort: number
  overBudget: boolean
  brokenDeps: {cardId: string; missing: string[]}[]
  cycles: string[][]
  emptyMvp: boolean
}

export function checkBoard(b: Board, scores: Record<string, ComponentScore>): BoardCheck {
  const mvp = Object.keys(b.buckets).filter(id => b.buckets[id] === 'mvp')
  const mvpEffort = Math.round(mvp.reduce((a, id) => a + (scores[id]?.effort ?? 3), 0) * 10) / 10
  // Компонент MVP зависит от того, что в MVP не попало — MVP не соберётся
  const brokenDeps = mvp
    .map(id => ({cardId: id, missing: (b.deps[id] ?? []).filter(d => b.buckets[d] && b.buckets[d] !== 'mvp')}))
    .filter(x => x.missing.length)
  return {mvpEffort, overBudget: mvpEffort > b.budget, brokenDeps, cycles: findCycles(b.deps), emptyMvp: mvp.length === 0}
}

// Циклические зависимости (A зависит от B, B от A) — подсказка, что компоненты стоит объединить
export function findCycles(deps: Record<string, string[]>): string[][] {
  const out: string[][] = []
  const seen = new Set<string>()
  const key = (cyc: string[]) => [...cyc].sort().join('|')
  const walk = (start: string, node: string, path: string[]) => {
    for (const next of deps[node] ?? []) {
      if (next === start) {
        const k = key(path)
        if (!seen.has(k)) { seen.add(k); out.push([...path]) }
      } else if (!path.includes(next) && path.length < 8) walk(start, next, [...path, next])
    }
  }
  for (const id of Object.keys(deps)) walk(id, id, [id])
  return out
}

// Всё, от чего компонент зависит (с учётом цепочек) — чтобы перенести в MVP одним действием
export function dependencyClosure(id: string, deps: Record<string, string[]>): string[] {
  const out = new Set<string>()
  const stack = [...(deps[id] ?? [])]
  while (stack.length) {
    const x = stack.pop()!
    if (out.has(x) || x === id) continue
    out.add(x)
    stack.push(...(deps[x] ?? []))
  }
  return [...out]
}
