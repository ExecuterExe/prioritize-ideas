// Расчёт результатов. Все правила — раздел 4 PLAN.md. Только чистые функции.
import type {Criterion, Rating, Stage} from './types'

export interface CriterionResult {
  criterionId: string
  values: number[]
  mean: number | null
  median: number | null
  sd: number | null
  range: number | null
  disputed: boolean
  prevRange?: number | null
}

export interface CardResult {
  cardId: string
  score: number | null
  rank: number
  perCriterion: CriterionResult[]
  disputed: boolean
  consensus: boolean
  gem: boolean
  guess: boolean
  guessShare: number
  lowData: boolean
  tie: boolean
}

export interface Results {
  cards: CardResult[]
  leaderStable: boolean | null
  stabilityNote: string
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = avg(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length)
}

// Спорность: n ≥ 3, (размах ≥ 3 или есть ≤2 и ≥4) и SD ≥ 1.2
export function isDisputed(values: number[]): boolean {
  if (values.length < 3) return false
  const range = Math.max(...values) - Math.min(...values)
  const camps = values.some(v => v <= 2) && values.some(v => v >= 4)
  return (range >= 3 || camps) && (stdev(values) ?? 0) >= 1.2
}

export function toPercent(s: number): number {
  return Math.round(((s - 1) / 4) * 100)
}

// Оценки, которые идут в расчёт: 2-й раунд заменяет 1-й по переоценённым карточкам
export function effectiveRatings(stage: Stage): Rating[] {
  const r2 = new Set(stage.round2Done ? stage.disputedForRound2 : [])
  return stage.ratings.filter(r => (r2.has(r.cardId) ? r.round === 2 : r.round === 1))
}

interface CalcInput {
  cardIds: string[]
  criteria: Criterion[]
  ratings: Rating[]
  authorsOf: (cardId: string) => string[]
  excludeAuthor: boolean
}

function scoreCards(inp: CalcInput) {
  const out = new Map<string, {score: number | null; per: CriterionResult[]; lowData: boolean}>()
  for (const cardId of inp.cardIds) {
    const authors = inp.excludeAuthor ? new Set(inp.authorsOf(cardId)) : new Set<string>()
    let num = 0, den = 0, lowData = false
    const per: CriterionResult[] = inp.criteria.map(c => {
      const values = inp.ratings
        .filter(r => r.cardId === cardId && r.criterionId === c.id && r.value !== null && !authors.has(r.raterId))
        .map(r => r.value as number)
        .sort((a, b) => a - b) // порядок не должен выдавать, кто как голосовал
      const adj = values.map(v => (c.inverted ? 6 - v : v))
      const mean = adj.length ? avg(adj) : null
      if (adj.length < 2) lowData = true
      if (mean !== null) { num += c.weight * mean; den += c.weight }
      return {
        criterionId: c.id, values, mean, median: median(adj), sd: stdev(adj),
        range: values.length ? Math.max(...values) - Math.min(...values) : null,
        disputed: isDisputed(values)
      }
    })
    out.set(cardId, {score: den ? toPercent(num / den) : null, per, lowData})
  }
  return out
}

function leaderOf(scores: Map<string, {score: number | null}>): string | null {
  let best: string | null = null, bestScore = -1
  for (const [id, s] of scores) if (s.score !== null && s.score > bestScore) { best = id; bestScore = s.score }
  return best
}

export function computeResults(stage: Stage): Results {
  const cardIds = stage.finalists
  const criteria = stage.criteria.filter(c => c.approved)
  const ratings = effectiveRatings(stage)
  const authorsOf = (id: string) => {
    const c = stage.cards.find(x => x.id === id)
    return c ? [...c.authorIds, ...c.mergedFrom.flatMap(m => m.authorIds)] : []
  }
  const base = {cardIds, criteria, ratings, authorsOf, excludeAuthor: stage.settings.excludeAuthor}
  const scored = scoreCards(base)

  const approvalsCount = (id: string) => stage.approvals.filter(a => a.cardIds.includes(id)).length
  const disputedCount = (id: string) => scored.get(id)!.per.filter((p, i) => p.disputed && criteria[i].weight >= 1).length

  // Ранжирование с разрешением ничьих: меньше спорных → больше отметок на отборе
  const order = [...cardIds].sort((a, b) => {
    const sa = scored.get(a)!.score ?? -1, sb = scored.get(b)!.score ?? -1
    if (Math.abs(sa - sb) > 2) return sb - sa
    const d = disputedCount(a) - disputedCount(b)
    if (d) return d
    const ap = approvalsCount(b) - approvalsCount(a)
    if (ap) return ap
    return sb - sa
  })

  const noveltyCrit = criteria.filter(c => c.tag === 'novelty')
  const noveltyMean = (id: string) => {
    const per = scored.get(id)!.per.filter(p => noveltyCrit.some(c => c.id === p.criterionId) && p.mean !== null)
    return per.length ? avg(per.map(p => p.mean!)) : null
  }
  const bestNovelty = Math.max(-1, ...cardIds.map(id => noveltyMean(id) ?? -1))

  const r2 = new Set(stage.round2Done ? stage.disputedForRound2 : [])
  const cards: CardResult[] = order.map((cardId, idx) => {
    const s = scored.get(cardId)!
    if (r2.has(cardId)) for (const p of s.per) p.prevRange = round2Shift(stage, cardId, p.criterionId).before
    const disputed = s.per.some(p => p.disputed)
    const marks = stage.bases.filter(b => b.cardId === cardId)
    const guessShare = marks.length ? marks.filter(b => b.basis === 'guess').length / marks.length : 0
    const valueFives = criteria
      .filter(c => c.tag === 'value')
      .some(c => ratings.filter(r => r.cardId === cardId && r.criterionId === c.id && r.value === 5).length >= 2)
    const nm = noveltyMean(cardId)
    const gem = idx >= 2 && s.score !== null &&
      ((nm !== null && nm === bestNovelty && noveltyCrit.length > 0) || (valueFives && disputed))
    const prev = order[idx - 1], next = order[idx + 1]
    const near = (o?: string) => o !== undefined && s.score !== null &&
      Math.abs((scored.get(o)!.score ?? -100) - s.score) <= 2
    return {
      cardId, score: s.score, rank: idx + 1, perCriterion: s.per, disputed,
      consensus: s.score !== null && s.score >= 70 && !disputed,
      gem, guess: guessShare > 0.5, guessShare, lowData: s.lowData,
      tie: near(prev) || near(next)
    }
  })

  // Устойчивость лидера: без каждого критерия и без каждого участника
  let leaderStable: boolean | null = null, stabilityNote = ''
  const leader = cards[0]?.score !== null ? cards[0]?.cardId : undefined
  if (leader && cardIds.length > 1) {
    leaderStable = true
    for (const c of criteria) {
      if (criteria.length < 2) break
      const alt = leaderOf(scoreCards({...base, criteria: criteria.filter(x => x !== c)}))
      if (alt && alt !== leader) { leaderStable = false; stabilityNote = `Без критерия «${c.name}» лидером становится другая карточка`; break }
    }
    if (leaderStable) {
      const raters = [...new Set(ratings.map(r => r.raterId))]
      for (const p of raters) {
        if (raters.length < 3) break
        const alt = leaderOf(scoreCards({...base, ratings: ratings.filter(r => r.raterId !== p)}))
        if (alt && alt !== leader) {
          leaderStable = false
          // Кого именно — не говорим: иначе по результату можно вычислить чужие оценки
          stabilityNote = 'Лидер держится на оценках одного участника: без них первое место у другой карточки'
          break
        }
      }
    }
    if (leaderStable) stabilityNote = 'Лидер не меняется, если убрать любой критерий или любого участника'
  }
  return {cards, leaderStable, stabilityNote}
}

// Отбор: сколько карточек может отметить каждый
export function approvalQuota(n: number): number {
  return Math.min(5, Math.max(2, Math.ceil(n / 3)))
}

// Финалисты по отметкам: топ-5, ничья на границе — включаем, но не больше 7
export function pickFinalists(cardIds: string[], approvals: {cardIds: string[]}[]): string[] {
  if (cardIds.length <= 6) return [...cardIds]
  const count = new Map(cardIds.map(id => [id, 0]))
  for (const a of approvals) for (const id of a.cardIds) if (count.has(id)) count.set(id, count.get(id)! + 1)
  const sorted = [...cardIds].sort((a, b) => count.get(b)! - count.get(a)!)
  const border = count.get(sorted[4])!
  const res = sorted.filter((id, i) => i < 5 || count.get(id) === border)
  return res.slice(0, 7)
}

// Калибровка: критерии, где разброс больше 2 баллов
export function calibrationSpread(stage: Stage): {criterionId: string; values: number[]; wide: boolean}[] {
  return stage.criteria.filter(c => c.approved).map(c => {
    const values = stage.calibration.filter(r => r.criterionId === c.id && r.value !== null).map(r => r.value as number).sort((a, b) => a - b)
    const wide = values.length >= 2 && Math.max(...values) - Math.min(...values) > 2
    return {criterionId: c.id, values, wide}
  })
}

// Сдвиг разброса после второго раунда
export function round2Shift(stage: Stage, cardId: string, criterionId: string): {before: number | null; after: number | null} {
  const range = (round: 1 | 2) => {
    const v = stage.ratings.filter(r => r.cardId === cardId && r.criterionId === criterionId && r.round === round && r.value !== null).map(r => r.value as number)
    return v.length ? Math.max(...v) - Math.min(...v) : null
  }
  return {before: range(1), after: range(2)}
}
