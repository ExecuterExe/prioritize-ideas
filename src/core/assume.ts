// Реестр предположений и эксперименты: отделяем мнение команды от проверенных фактов.

export type AssumptionCategory = 'desirability' | 'feasibility' | 'viability'
export type AssumptionStatus = 'untested' | 'testing' | 'confirmed' | 'partly' | 'refuted' | 'insufficient'

export interface Assumption {
  id: string
  text: string
  category: AssumptionCategory
  linkedCardId?: string
  linkedTitle?: string
  importance?: number   // 1–5: насколько концепция рушится, если это неверно
  evidence?: number     // 1–5: насколько уже подтверждено
  status: AssumptionStatus
  proof?: string
  proofLink?: string
  authorId: string
  createdAt: number
}

export type ExperimentMethod = 'survey' | 'interview' | 'landing' | 'prototype' | 'observation' | 'competitors'
export type ThresholdKind = 'percent' | 'count'

export interface Experiment {
  id: string
  assumptionId: string
  method: ExperimentMethod
  audience: string
  sampleN: number
  metric: string
  thresholdKind: ThresholdKind
  threshold: number
  deadline?: string
  ownerId?: string
  resultN?: number
  resultHits?: number
  verdict?: AssumptionStatus
  manualReason?: string
  note?: string
  authorId: string
  createdAt: number
}

export interface AssumptionVote {
  raterId: string
  assumptionId: string
  importance: number
  evidence: number
}

export interface AssumptionRound {
  open: boolean
  revealed: boolean
  ids: string[]
  votes: AssumptionVote[]
  submitted: string[]
}

export const CATEGORY_LABEL: Record<AssumptionCategory, string> = {
  desirability: 'Желательность — нужно ли людям',
  feasibility: 'Реализуемость — сможем ли сделать',
  viability: 'Жизнеспособность — окупится ли'
}

export const CATEGORY_SHORT: Record<AssumptionCategory, string> = {
  desirability: 'Нужно людям?', feasibility: 'Сделаем?', viability: 'Окупится?'
}

export const STATUS_LABEL: Record<AssumptionStatus, string> = {
  untested: 'Не проверено',
  testing: 'Проверяется',
  confirmed: 'Подтверждено',
  partly: 'Частично',
  refuted: 'Опровергнуто',
  insufficient: 'Мало данных'
}

export const STATUS_ICON: Record<AssumptionStatus, string> = {
  untested: '❔', testing: '🔬', confirmed: '✅', partly: '⚠️', refuted: '⛔', insufficient: '🤷'
}

export const METHOD_LABEL: Record<ExperimentMethod, string> = {
  survey: 'Опрос', interview: 'Интервью', landing: 'Лендинг', prototype: 'Прототип', observation: 'Наблюдение', competitors: 'Анализ конкурентов'
}

// ——— Вердикт эксперимента ———

// Доля «частично»: от 75% порога включительно
export const PARTLY_SHARE = 0.75

export function experimentValue(e: Pick<Experiment, 'thresholdKind' | 'resultN' | 'resultHits'>): number | null {
  if (e.resultHits == null) return null
  if (e.thresholdKind === 'count') return e.resultHits
  if (!e.resultN) return null
  return (e.resultHits / e.resultN) * 100
}

export function autoVerdict(e: Pick<Experiment, 'thresholdKind' | 'threshold' | 'sampleN' | 'resultN' | 'resultHits'>): AssumptionStatus | null {
  if (e.resultN == null || e.resultHits == null) return null
  if (e.sampleN > 0 && e.resultN < e.sampleN / 2) return 'insufficient'
  const v = experimentValue(e)
  if (v == null || !(e.threshold > 0)) return null
  if (v >= e.threshold) return 'confirmed'
  if (v >= e.threshold * PARTLY_SHARE) return 'partly'
  return 'refuted'
}

// Примерная погрешность доли (95%) в процентных пунктах: ±98/√N
export function marginPP(n: number): number | null {
  if (!(n > 0)) return null
  return Math.round(98 / Math.sqrt(n))
}

// Объяснение без статистики: различимы ли факт и порог при такой выборке
export function marginNote(e: Pick<Experiment, 'thresholdKind' | 'threshold' | 'resultN' | 'resultHits' | 'sampleN'>): string | null {
  const n = e.resultN ?? e.sampleN
  const m = marginPP(n)
  if (m == null || e.thresholdKind !== 'percent') return null
  const v = experimentValue(e)
  const base = `При ${n} ответах погрешность около ±${m} п.п.`
  if (v == null) return base
  return Math.abs(v - e.threshold) <= m
    ? `${base} — ${Math.round(v)}% и порог ${e.threshold}% статистически не различимы, вывод предварительный`
    : `${base} — разница с порогом больше погрешности`
}

// ——— Карта предположений ———

export type Quadrant = 'leap' | 'known' | 'minor' | 'later'

// Важно и не доказано — «прыжок веры», проверять первым
export function quadrant(a: Pick<Assumption, 'importance' | 'evidence'>): Quadrant | null {
  if (a.importance == null || a.evidence == null) return null
  const important = a.importance >= 3, proven = a.evidence >= 3
  if (important && !proven) return 'leap'
  if (important && proven) return 'known'
  if (!important && !proven) return 'later'
  return 'minor'
}

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  leap: '🎯 Прыжок веры — проверять первым',
  known: '🧱 Опора — важно и уже подтверждено',
  later: '🕒 Потом — неважно и не доказано',
  minor: '💤 Неважно — можно не тратить время'
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// Средние по слепому раунду
export function roundAverages(r: AssumptionRound): Record<string, {importance: number; evidence: number; n: number; spreadI: number; spreadE: number}> {
  const out: Record<string, {importance: number; evidence: number; n: number; spreadI: number; spreadE: number}> = {}
  for (const id of r.ids) {
    const vs = r.votes.filter(v => v.assumptionId === id)
    if (!vs.length) continue
    const I = vs.map(v => v.importance), E = vs.map(v => v.evidence)
    out[id] = {
      importance: Math.round(avg(I) * 10) / 10, evidence: Math.round(avg(E) * 10) / 10, n: vs.length,
      spreadI: Math.max(...I) - Math.min(...I), spreadE: Math.max(...E) - Math.min(...E)
    }
  }
  return out
}

// ——— Угроза для концепции ———

export function threatsFor(cardId: string, list: Assumption[]) {
  const linked = list.filter(a => a.linkedCardId === cardId)
  return {
    linked,
    refuted: linked.filter(a => a.status === 'refuted'),
    leapUntested: linked.filter(a => quadrant(a) === 'leap' && (a.status === 'untested' || a.status === 'testing'))
  }
}
