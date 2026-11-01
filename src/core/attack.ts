// «⚔️ Атакуем лидера»: перед решением команда проверяет конкретного лидера с противоположных позиций.
// Сначала каждый молча пишет возражения, потом все вслепую отмечают, какие реально влияют на выбор.

export type AttackStep = 'write' | 'vote' | 'done'

export interface Objection {
  id: string
  text: string
  authorId: string // наружу не уходит
}

export interface Attack {
  targetId: string
  step: AttackStep
  objections: Objection[]
  marks: Record<string, string[]> // участник → какие возражения влияют (до итога наружу не уходит)
}

export const ATTACK_LIMIT = 3

export const ATTACK_PROMPTS = [
  'Что в этом варианте мы переоцениваем?',
  'При каких обстоятельствах он не сработает?',
  'Кто откажется от этого и почему?',
  'Что проще решает ту же задачу?',
  'Какой аргумент против — самый убедительный?'
]

export interface ObjectionResult {
  id: string
  text: string
  votes: number
  strong: boolean // отметила хотя бы половина проголосовавших
}

export function attackResults(a: Pick<Attack, 'objections' | 'marks'>): ObjectionResult[] {
  const voters = Object.keys(a.marks).length
  return a.objections
    .map(o => {
      const votes = Object.values(a.marks).filter(m => m.includes(o.id)).length
      return {id: o.id, text: o.text, votes, strong: voters > 0 && votes * 2 >= voters}
    })
    .sort((x, y) => y.votes - x.votes)
}
