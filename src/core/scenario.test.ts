import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce} from './engine'
import {fromLibrary} from './library'
import {fitMultipliers, presetWeights, robustness, scenarioScores, type Scenario} from './scenario'
import {builtinTemplate} from './template'
import type {Score, Stage} from './types'

// Две идеи: A — ценная, но сложная; B — попроще, но скромнее
function rated(): Stage {
  let s = createStage({projectId: 'p', template: builtinTemplate('idea')!, title: 't', settings: {timePreset: 'none'}, now: 1})
  for (const p of ['a', 'b']) s = reduce(s, {type: 'hello', name: p}, p, false, 2)
  const val = fromLibrary('user-value', 'val'), feas = fromLibrary('feasibility', 'feas')
  s = {...s, phase: 'rate', criteria: [val, feas], finalists: ['A', 'B'],
    cards: [{id: 'A', authorIds: ['a'], fields: {}, mergedFrom: [], createdAt: 0}, {id: 'B', authorIds: ['b'], fields: {}, mergedFrom: [], createdAt: 0}]}
  const rate = (who: string, A: [Score, Score], B: [Score, Score]) => reduce(s, {type: 'rate.submit', round: 1, bases: [], ratings: [
    {cardId: 'A', criterionId: 'val', value: A[0]}, {cardId: 'A', criterionId: 'feas', value: A[1]},
    {cardId: 'B', criterionId: 'val', value: B[0]}, {cardId: 'B', criterionId: 'feas', value: B[1]}
  ]}, who, false, 3)
  s = rate('a', [5, 3], [3, 5]) // A: 4,0 → 75; B: 3,75 → 69
  s = rate('b', [5, 3], [3, 4])
  return reduce(s, {type: 'phase.next'}, 'h', true, 4)
}

describe('what-if scenarios', () => {
  it('reweights criteria without new ratings', () => {
    const s = rated()
    const base = scenarioScores(s, {})
    expect(base.find(r => r.cardId === 'A')!.rank).toBe(1)
    const w = presetWeights(s.criteria, {feasibility: 3})
    expect(w).toEqual({feas: 3})
    const tight = scenarioScores(s, w)
    expect(tight.find(r => r.cardId === 'B')!.rank).toBe(1)
  })

  it('applies condition multipliers', () => {
    const sc: Scenario = {id: 'x', name: 'x', description: '', weights: {}, open: false, submitted: [], answers: [
      {raterId: 'a', cardId: 'A', fit: 'no'}, {raterId: 'b', cardId: 'A', fit: 'partly'}, {raterId: 'a', cardId: 'B', fit: 'yes'}
    ]}
    expect(fitMultipliers(sc)).toEqual({A: 0.5, B: 1})
  })

  it('robustness table finds the most robust card', () => {
    const s = rated()
    const sc = (id: string, weights: Record<string, number>): Scenario => ({id, name: id, description: '', weights, open: false, answers: [], submitted: []})
    const r = robustness(s, [sc('s1', {feas: 3}), sc('s2', {feas: 2})])
    expect(r.columns).toHaveLength(3)
    expect(r.mostRobust).toBe('B')
  })

  it('engine: host adds scenario, answers are blind until closed', () => {
    let s = rated()
    expect(() => reduce(s, {type: 'scenario.add', id: 'q', name: 'Офлайн', description: '', weights: {}, question: 'Работает без интернета?'}, 'a', false, 5)).toThrow('организатор')
    s = reduce(s, {type: 'scenario.add', id: 'q', name: 'Офлайн', description: '', weights: {}, question: 'Работает без интернета?'}, 'h', true, 5)
    expect(() => reduce(s, {type: 'scenario.answer', id: 'q', answers: {A: 'no'}}, 'a', false, 6)).toThrow('все')
    s = reduce(s, {type: 'scenario.answer', id: 'q', answers: {A: 'no', B: 'yes'}}, 'a', false, 6)
    const open = publicView(s, 7).scenarios[0]
    expect(open.open).toBe(true)
    expect(open.submitted).toEqual(['a'])
    expect(JSON.stringify(publicView(s, 7))).not.toContain('"fit"')
    s = reduce(s, {type: 'scenario.close', id: 'q'}, 'h', true, 8)
    const v = publicView(s, 9)
    expect(v.robustness?.columns.map(c => c.name)).toEqual(['Исходно', 'Офлайн'])
    expect(v.robustness?.columns[1].rows.find(r => r.cardId === 'B')!.rank).toBe(1)
    s = reduce(s, {type: 'scenario.remove', id: 'q'}, 'h', true, 10)
    expect(publicView(s, 11).scenarios).toEqual([])
  })
})
