import {describe, expect, it} from 'vitest'
import {canAdvance, createStage, phaseFlow, publicView, reduce} from './engine'
import {barrierToProblem, emotionStats, lowestStep} from './journey'
import {builtinTemplate} from './template'

const tpl = builtinTemplate('journey')!

function setup() {
  let s = createStage({projectId: 'p', template: tpl, title: 'Путь', persona: 'Первокурсник в общежитии', settings: {timePreset: 'none'}, now: 1})
  for (const p of ['a', 'b']) s = reduce(s, {type: 'hello', name: p}, p, false, 2)
  return s
}

describe('journey mode', () => {
  it('has its own flow without evolve and calibration', () => {
    const s = setup()
    expect(phaseFlow(s)).toEqual(['lobby', 'steps', 'generate', 'shortlist', 'summary'])
    expect(s.settings.evolve).toBe(false)
    expect(s.journey?.persona).toBe('Первокурсник в общежитии')
  })

  it('steps: proposals, host adds, reorders and removes', () => {
    let s = setup()
    s = reduce(s, {type: 'phase.next'}, 'h', true, 3)
    expect(s.phase).toBe('steps')
    s = reduce(s, {type: 'step.propose', id: 'p1', title: 'Узнаёт о сессии'}, 'a', false, 4)
    s = reduce(s, {type: 'step.propose', id: 'p2', title: 'узнаёт о сессии'}, 'b', false, 5)
    expect(s.journey!.proposals).toHaveLength(1)
    expect(() => reduce(s, {type: 'step.add', id: 's1', title: 'x'}, 'a', false, 6)).toThrow('организатор')
    expect(canAdvance(s)).toContain('2 шага')
    s = reduce(s, {type: 'step.add', id: 's1', title: 'Узнаёт о сессии'}, 'h', true, 6)
    s = reduce(s, {type: 'step.add', id: 's2', title: 'Готовится вечером'}, 'h', true, 7)
    s = reduce(s, {type: 'step.add', id: 's3', title: 'Сдаёт экзамен'}, 'h', true, 8)
    expect(s.journey!.proposals).toHaveLength(0)
    s = reduce(s, {type: 'step.update', id: 's3', move: -1}, 'h', true, 9)
    expect(s.journey!.steps.map(x => x.id)).toEqual(['s1', 's3', 's2'])
    s = reduce(s, {type: 'step.remove', id: 's1'}, 'h', true, 10)
    expect(canAdvance(s)).toBeNull()
  })

  it('barriers need a step; emotions are blind until the vote', () => {
    let s = setup()
    s = reduce(s, {type: 'phase.next'}, 'h', true, 3)
    s = reduce(s, {type: 'step.add', id: 's1', title: 'Стирка вечером'}, 'h', true, 4)
    s = reduce(s, {type: 'step.add', id: 's2', title: 'Подготовка'}, 'h', true, 5)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 6)
    expect(s.phase).toBe('generate')
    expect(() => reduce(s, {type: 'card.upsert', id: 'b0', fields: {what: 'Все машины заняты'}}, 'a', false, 7)).toThrow('шаг')
    s = reduce(s, {type: 'card.upsert', id: 'b1', fields: {what: 'Все машины заняты, а узнать заранее нельзя'}, stepId: 's1'}, 'a', false, 7)
    s = reduce(s, {type: 'card.upsert', id: 'b2', fields: {what: 'Шумно, нет места'}, stepId: 's2'}, 'b', false, 8)
    s = reduce(s, {type: 'emotion.set', stepId: 's1', value: -2}, 'a', false, 9)
    s = reduce(s, {type: 'emotion.set', stepId: 's1', value: -1}, 'b', false, 10)
    s = reduce(s, {type: 'emotion.set', stepId: 's2', value: 1}, 'b', false, 11)
    expect(() => reduce(s, {type: 'emotion.set', stepId: 's2', value: 5}, 'a', false, 12)).toThrow()
    const during = publicView(s, 13)
    expect(during.journey?.stats).toBeUndefined()
    expect(JSON.stringify(during)).not.toContain('"emotions"')
    expect(during.cards).toHaveLength(0)
    s = reduce(s, {type: 'journey.done'}, 'a', false, 14)
    expect(publicView(s, 15).progress.a).toBe(true)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 16)
    expect(s.phase).toBe('shortlist')
    const v = publicView(s, 17)
    expect(v.journey?.stats?.s1).toEqual({avg: -1.5, n: 2, min: -2, max: -1})
    expect(v.cards.find(c => c.id === 'b1')?.stepId).toBe('s1')
    s = reduce(s, {type: 'approve.submit', cardIds: ['b1']}, 'a', false, 18)
    s = reduce(s, {type: 'approve.submit', cardIds: ['b1', 'b2']}, 'b', false, 19)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 20)
    expect(s.phase).toBe('summary')
    expect(publicView(s, 21).approvalCounts).toMatchObject({b1: 2, b2: 1})
    expect(lowestStep(s.journey!)?.id).toBe('s1')
    expect(emotionStats(s.journey!).s2.avg).toBe(1)
  })

  it('barriers become problem cards of the next stage', () => {
    const fields = barrierToProblem('Первокурсник', 'Стирка вечером', 'Все машины заняты')
    const s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 'Проблемы', seedCards: [fields], now: 1})
    expect(s.cards).toHaveLength(1)
    expect(s.cards[0]).toMatchObject({authorIds: [], fields: {who: 'Первокурсник', situation: 'Стирка вечером', what: 'Все машины заняты'}})
  })
})
