// Адаптивный тайминг: сэкономленное время переходит на следующий шаг, при опоздании —
// предложение, что сократить (только по нажатию ведущего, без молчаливых изменений).
import type {Phase, Settings, Stage} from './types'

export const TIMINGS: Record<'express' | 'standard', Partial<Record<Phase, number>>> = {
  express: {lobby: 1, steps: 2, generate: 4, merge: 2, criteria: 2, shortlist: 1, rate: 4, results: 3, rate2: 2, decide: 2},
  standard: {lobby: 2, steps: 4, generate: 8, evolve: 7, merge: 4, criteria: 5, calibrate: 2, shortlist: 2, rate: 7, results: 6, rate2: 3, decide: 5}
}

export const CARRY_LIMIT = 10 * 60_000
export const OVERRUN = 3 * 60_000

export function phaseMinutes(s: Settings, phase: Phase): number {
  return s.timePreset === 'none' ? 0 : TIMINGS[s.timePreset][phase] ?? 0
}

// Сколько миллисекунд запаса переносим: остаток прошлого шага, не больше 10 минут
export function carryOver(prevDeadline: number | undefined, now: number): number {
  if (!prevDeadline || prevDeadline <= now) return 0
  return Math.min(prevDeadline - now, CARRY_LIMIT)
}

// Сколько минут осталось на всю сессию по плану: текущий шаг + следующие
export function minutesLeft(s: Stage, flow: Phase[], now: number): number | null {
  if (s.settings.timePreset === 'none') return null
  const i = flow.indexOf(s.phase === 'rate2' ? 'results' : s.phase)
  const cur = s.deadline ? (s.deadline - now) / 60_000 : 0
  const rest = flow.slice(i + 1).reduce((a, p) => a + phaseMinutes(s.settings, p), 0)
  return Math.round(cur + rest)
}

export interface Shortening {
  patch: Partial<Settings>
  minutes: number
  what: string[]
  overMinutes: number
}

// Шаг затянулся больше чем на 3 минуты — предлагаем выключить необязательные шаги впереди
export function shortenSuggestion(s: Stage, flow: Phase[], now: number): Shortening | undefined {
  if (!s.deadline || now - s.deadline < OVERRUN) return undefined
  const ahead = flow.slice(flow.indexOf(s.phase) + 1)
  const patch: Partial<Settings> = {}
  const what: string[] = []
  let minutes = 0
  if (s.settings.evolve && ahead.includes('evolve')) { patch.evolve = false; what.push('«Развитие»'); minutes += phaseMinutes(s.settings, 'evolve') }
  if (s.settings.calibration && ahead.includes('calibrate')) { patch.calibration = false; what.push('калибровку'); minutes += phaseMinutes(s.settings, 'calibrate') }
  // Второй раунд запускается из результатов — пока мы до них не дошли, его можно выключить
  if (s.settings.secondRound && !s.round2Done && ahead.includes('results')) { patch.secondRound = false; what.push('второй раунд'); minutes += phaseMinutes(s.settings, 'rate2') }
  if (!what.length) return undefined
  return {patch, minutes, what, overMinutes: Math.floor((now - s.deadline) / 60_000)}
}
