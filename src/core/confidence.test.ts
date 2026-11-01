import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce, type Action} from './engine'
import {builtinTemplate} from './template'
import {beforeAfter, confFlag, confidenceByCard} from './confidence'
import type {Score, Stage} from './types'

let clock = 1
const act = (s: Stage, a: Action, actor = 'h', isHost = actor === 'h') => reduce(s, a, actor, isHost, clock++)

describe('confidence math', () => {
  it('averages and flags', () => {
    const c = confidenceByCard([{raterId: 'a', cardId: 'x', value: 2}, {raterId: 'b', cardId: 'x', value: 3}, {raterId: 'a', cardId: 'y', value: 5}])
    expect(c).toEqual({x: {avg: 2.5, n: 2}, y: {avg: 5, n: 1}})
    expect(confFlag(85, c.x)).toBe('shaky')
    expect(confFlag(40, c.x)).toBeNull()
    expect(confFlag(60, c.y)).toBe('firm')
    expect(confFlag(90, undefined)).toBeNull()
  })

  it('before/after: who changed their mind, confidence growth, support', () => {
    const r = beforeAfter({
      before: {a: {cardId: 'x', conf: 2}, b: {cardId: 'y', conf: 3}, c: {cardId: 'y', conf: 2}},
      after: {a: {cardId: 'y', conf: 4}, b: {cardId: 'y', conf: 4}}
    })
    expect(r).toMatchObject({pairs: 2, changed: 1, confBefore: 2.5, confAfter: 4})
    expect(r.support[0]).toEqual({cardId: 'y', before: 2, after: 2})
  })
})

describe('confidence in engine', () => {
  it('confidence is hidden until reveal; pulse answers only in their window', () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 'П', settings: {calibration: false, evolve: false, timePreset: 'none'}, now: clock})
    for (const p of ['a', 'b']) s = act(s, {type: 'hello', name: p}, p, false)
    s = act(s, {type: 'phase.next'})
    s = act(s, {type: 'card.upsert', id: 'c1', fields: {who: 'первокурсники', situation: 'вечером', what: 'Негде стирать'}}, 'a', false)
    s = act(s, {type: 'card.upsert', id: 'c2', fields: {who: 'заочники', situation: 'на сессии', what: 'Нет расписания'}}, 'b', false)
    expect(() => act(s, {type: 'pulse.answer', when: 'before', cardId: 'c1', conf: 3}, 'a', false)).toThrow('до начала оценки')
    s = act(s, {type: 'phase.next'})
    s = act(s, {type: 'pulse.answer', when: 'before', cardId: 'c1', conf: 2}, 'a', false)
    s = act(s, {type: 'pulse.answer', when: 'before', cardId: 'c2', conf: 3}, 'b', false)
    expect(() => act(s, {type: 'pulse.answer', when: 'after', cardId: 'c1', conf: 3}, 'a', false)).toThrow('после')
    s = act(s, {type: 'phase.next'}); s = act(s, {type: 'phase.next'})
    const crit = s.criteria.map(c => c.id)
    for (const p of ['a', 'b']) {
      s = act(s, {type: 'rate.submit', round: 1, ratings: crit.flatMap(cr => [{cardId: 'c1', criterionId: cr, value: 5 as Score}, {cardId: 'c2', criterionId: cr, value: 2 as Score}]), bases: [], confidence: [{cardId: 'c1', value: 2}, {cardId: 'c2', value: 9}]}, p, false)
    }
    expect(publicView(s, clock).confidence).toEqual({})
    s = act(s, {type: 'phase.next'})
    expect(publicView(s, clock).confidence).toEqual({c1: {avg: 2, n: 2}})
    s = act(s, {type: 'phase.next'})
    s = act(s, {type: 'pulse.answer', when: 'after', cardId: 'c1', conf: 4}, 'b', false)
    const v = publicView(s, clock)
    expect(v.pulse.before.sort()).toEqual(['a', 'b'])
    expect(v.pulse.summary).toMatchObject({pairs: 1, changed: 1})
    expect(JSON.stringify(v.pulse)).not.toContain('"conf"')
  })
})
