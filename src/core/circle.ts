// «Круг» — равное участие: сервис ведёт очередь, у каждого своё время, можно пропустить
// или написать вместо слов. «Парковка» — мысли не по теме шага, без авторов, разбираются в конце.

export interface Circle {
  order: string[] // очередь участников
  idx: number // кто говорит сейчас
  seconds: number // время на одного
  turnStartedAt: number
  open: boolean
  skipped: string[]
  notes: string[] // письменные реплики вместо выступления, без имён
}

export type ParkTarget = 'next' | 'task' | 'assumption' | 'drop'

export interface ParkItem {
  id: string
  text: string
  at: number
  to?: ParkTarget // куда разложил ведущий; нет — ещё не разобрано
}

export const CIRCLE_SECONDS = [60, 90, 120]
export const PARK_LIMIT = 60

export const PARK_LABEL: Record<ParkTarget, string> = {
  next: '➡️ в следующий этап',
  task: '📋 в задачи',
  assumption: '🎯 в предположения',
  drop: '🗑 не нужно'
}

// Очередь начинается не всегда с одного и того же человека — сдвиг от времени старта
export function circleOrder(ids: string[], now: number): string[] {
  if (!ids.length) return []
  const shift = Math.floor(now / 1000) % ids.length
  return [...ids.slice(shift), ...ids.slice(0, shift)]
}

export function currentSpeaker(c?: Circle): string | undefined {
  return c?.open ? c.order[c.idx] : undefined
}

// Через сколько человек моя очередь (0 — говорю сейчас; undefined — уже высказался или не в круге)
export function turnsUntil(c: Circle | undefined, pid: string): number | undefined {
  if (!c?.open) return undefined
  const i = c.order.indexOf(pid)
  return i < c.idx ? undefined : i - c.idx
}

export function secondsLeft(c: Circle, now: number): number {
  return Math.round(c.seconds - (now - c.turnStartedAt) / 1000)
}

// Следующий говорящий; круг закрывается после последнего
export function advance(c: Circle, now: number): Circle {
  const idx = c.idx + 1
  return {...c, idx, turnStartedAt: now, open: idx < c.order.length}
}
