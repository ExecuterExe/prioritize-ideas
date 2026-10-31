// Сценарии «что если»: пересчёт рейтинга при изменённых условиях без новых оценок.
import {effectiveRatings, toPercent} from './math'
import type {Criterion, Stage, Tag} from './types'

export type Fit = 'yes' | 'partly' | 'no'

export interface Scenario {
  id: string
  name: string
  description: string
  weights: Record<string, number>        // множитель веса критерия: 0 — не учитывать, 1 — как было, 2–3 — важнее
  question?: string                      // условие-проверка: «выдерживает ли карточка условие?»
  open: boolean                          // пока открыт — ответы скрыты
  answers: {raterId: string; cardId: string; fit: Fit}[]
  submitted: string[]
}

// Ответ «выдерживает ли условие» → множитель балла
export const FIT_MULT: Record<Fit, number> = {yes: 1, partly: 0.7, no: 0.3}
export const FIT_LABEL: Record<Fit, string> = {yes: '✅ Да', partly: '⚠️ Частично', no: '❌ Нет'}

// Готовые заготовки: веса задаются по меткам критериев
export const PRESETS: {key: string; name: string; description: string; tags: Partial<Record<Tag, number>>; question?: string}[] = [
  {key: 'budget', name: 'Бюджет урезали вдвое', description: 'Денег и ресурсов в два раза меньше', tags: {feasibility: 3}, question: 'Можно сделать вдвое дешевле без потери главного?'},
  {key: 'deadline', name: 'Срок — две недели', description: 'Прототип нужен очень быстро', tags: {feasibility: 3, testability: 2}},
  {key: 'value', name: 'Важна только польза', description: 'Преподаватель оценивает ценность для людей', tags: {value: 3, feasibility: 0}},
  {key: 'novel', name: 'Нужна оригинальность', description: 'Конкурс инновационных идей', tags: {novelty: 3}},
  {key: 'offline', name: 'Без интернета и приложений', description: 'Решение должно работать офлайн, без установки', tags: {}, question: 'Идея работает без интернета и без установки приложения?'}
]

export function presetWeights(criteria: Criterion[], tags: Partial<Record<Tag, number>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of criteria) if (c.tag && tags[c.tag] !== undefined) out[c.id] = tags[c.tag]!
  return out
}

// Множитель карточки по ответам «выдерживает ли условие»: среднее по ответившим
export function fitMultipliers(s: Scenario): Record<string, number> {
  const out: Record<string, number> = {}
  const byCard = new Map<string, number[]>()
  for (const a of s.answers) byCard.set(a.cardId, [...(byCard.get(a.cardId) ?? []), FIT_MULT[a.fit]])
  for (const [id, xs] of byCard) out[id] = xs.reduce((x, y) => x + y, 0) / xs.length
  return out
}

export interface ScenarioRow {
  cardId: string
  score: number | null
  rank: number
}

// Тот же расчёт, что и основной балл, но с другими весами и множителем условия
export function scenarioScores(stage: Stage, weights: Record<string, number>, mult: Record<string, number> = {}): ScenarioRow[] {
  const criteria = stage.criteria.filter(c => c.approved)
  const ratings = effectiveRatings(stage)
  const rows = stage.finalists.map(cardId => {
    const card = stage.cards.find(c => c.id === cardId)
    const authors = stage.settings.excludeAuthor && card ? new Set([...card.authorIds, ...card.mergedFrom.flatMap(m => m.authorIds)]) : new Set<string>()
    let num = 0, den = 0
    for (const c of criteria) {
      const w = c.weight * (weights[c.id] ?? 1)
      if (w <= 0) continue
      const vs = ratings.filter(r => r.cardId === cardId && r.criterionId === c.id && r.value !== null && !authors.has(r.raterId))
        .map(r => (c.inverted ? 6 - (r.value as number) : (r.value as number)))
      if (!vs.length) continue
      num += w * (vs.reduce((a, b) => a + b, 0) / vs.length)
      den += w
    }
    const base = den ? toPercent(num / den) : null
    const score = base === null ? null : Math.round(base * (mult[cardId] ?? 1))
    return {cardId, score}
  })
  const sorted = [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  return rows.map(r => ({...r, rank: sorted.indexOf(r) + 1}))
}

export interface Robustness {
  columns: {id: string; name: string; rows: ScenarioRow[]}[]
  firsts: Record<string, number>
  mostRobust?: string
  baseLeaderOnlyBase: boolean
}

// Таблица «карточка × сценарии» и вывод об устойчивости лидера
export function robustness(stage: Stage, scenarios: Scenario[]): Robustness {
  const columns = [
    {id: 'base', name: 'Исходно', rows: scenarioScores(stage, {})},
    ...scenarios.filter(s => !s.open).map(s => ({id: s.id, name: s.name, rows: scenarioScores(stage, s.weights, fitMultipliers(s))}))
  ]
  const firsts: Record<string, number> = {}
  for (const col of columns) {
    const top = col.rows.find(r => r.rank === 1 && r.score !== null)
    if (top) firsts[top.cardId] = (firsts[top.cardId] ?? 0) + 1
  }
  const mostRobust = Object.entries(firsts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const baseLeader = columns[0].rows.find(r => r.rank === 1)?.cardId
  const baseLeaderOnlyBase = columns.length > 1 && !!baseLeader && firsts[baseLeader] === 1
  return {columns, firsts, mostRobust, baseLeaderOnlyBase}
}
