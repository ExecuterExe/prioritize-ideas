// Уверенность: насколько участники уверены в своих оценках, и как меняется мнение до и после обсуждения.
// Высокая оценка при низкой уверенности — признак нехватки информации, а не убеждённости.

export interface ConfMark {
  raterId: string
  cardId: string
  value: number // 1–5
}

export interface PulseAnswer {
  cardId: string
  conf: number // 1–5
}

export interface Pulse {
  before: Record<string, PulseAnswer>
  after: Record<string, PulseAnswer>
}

export type ConfFlag = 'shaky' | 'firm'

export const SHAKY_SCORE = 70 // оценка в процентах, выше которой низкая уверенность настораживает

export function validConf(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

export function confidenceByCard(marks: ConfMark[]): Record<string, {avg: number; n: number}> {
  const out: Record<string, {sum: number; n: number}> = {}
  for (const m of marks) {
    const o = (out[m.cardId] ??= {sum: 0, n: 0})
    o.sum += m.value
    o.n++
  }
  return Object.fromEntries(Object.entries(out).map(([id, o]) => [id, {avg: Math.round((o.sum / o.n) * 10) / 10, n: o.n}]))
}

// «Оценили высоко, но не уверены» или «уверенно»; без отметок — ничего
export function confFlag(score: number | null, conf?: {avg: number; n: number}): ConfFlag | null {
  if (!conf || conf.n === 0) return null
  if (score !== null && score >= SHAKY_SCORE && conf.avg < 3) return 'shaky'
  if (conf.avg >= 4) return 'firm'
  return null
}

export interface BeforeAfter {
  pairs: number // ответили и до, и после
  changed: number // из них поменяли вариант
  confBefore: number | null
  confAfter: number | null
  support: {cardId: string; before: number; after: number}[] // сколько человек считали вариант лучшим
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

export function beforeAfter(p: Pulse): BeforeAfter {
  const both = Object.keys(p.after).filter(id => p.before[id])
  const ids = [...new Set([...Object.values(p.before), ...Object.values(p.after)].map(a => a.cardId))]
  return {
    pairs: both.length,
    changed: both.filter(id => p.before[id].cardId !== p.after[id].cardId).length,
    confBefore: mean(both.map(id => p.before[id].conf)),
    confAfter: mean(both.map(id => p.after[id].conf)),
    support: ids.map(cardId => ({
      cardId,
      before: Object.values(p.before).filter(a => a.cardId === cardId).length,
      after: Object.values(p.after).filter(a => a.cardId === cardId).length
    })).sort((a, b) => b.after - a.after || b.before - a.before)
  }
}
