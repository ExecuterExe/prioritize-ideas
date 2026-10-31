// Карта пользовательского пути: шаги → барьеры и эмоции → голосование «самое больное».

export interface JourneyStep {
  id: string
  title: string
}

export interface Journey {
  persona: string
  steps: JourneyStep[]
  proposals: {id: string; title: string}[]
  emotions: {raterId: string; stepId: string; value: number}[]
}

export const EMOTIONS: {v: number; face: string; label: string}[] = [
  {v: -2, face: '😣', label: 'очень плохо'},
  {v: -1, face: '🙁', label: 'неприятно'},
  {v: 0, face: '😐', label: 'нормально'},
  {v: 1, face: '🙂', label: 'приятно'},
  {v: 2, face: '😄', label: 'отлично'}
]

export const emptyJourney = (persona = ''): Journey => ({persona, steps: [], proposals: [], emotions: []})

// Барьеров у одного человека больше, чем обычных карточек: их пишут по каждому шагу
export const BARRIER_LIMIT = 8

export interface EmotionStat {
  avg: number
  n: number
  min: number
  max: number
}

export function emotionStats(j: Journey): Record<string, EmotionStat> {
  const out: Record<string, EmotionStat> = {}
  for (const s of j.steps) {
    const vs = j.emotions.filter(e => e.stepId === s.id).map(e => e.value)
    if (!vs.length) continue
    out[s.id] = {avg: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10, n: vs.length, min: Math.min(...vs), max: Math.max(...vs)}
  }
  return out
}

// Самый тяжёлый шаг — с наименьшей средней эмоцией
export function lowestStep(j: Journey, stats = emotionStats(j)): JourneyStep | undefined {
  return [...j.steps].filter(s => stats[s.id]).sort((a, b) => stats[a.id].avg - stats[b.id].avg)[0]
}

// Барьер → поля карточки проблемы для следующего этапа
export function barrierToProblem(persona: string, stepTitle: string, barrier: string): Record<string, string> {
  // Обязательное «Кто сталкивается» не оставляем пустым — команда уточнит на склейке
  return {who: persona.trim() || 'пользователь (уточните, кто именно)', situation: stepTitle, what: barrier}
}
