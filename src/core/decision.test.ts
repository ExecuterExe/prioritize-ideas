import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce, type Action} from './engine'
import {builtinTemplate} from './template'
import {countVote, type Vote} from './decision'
import type {Score, Stage} from './types'

let clock = 1
const act = (s: Stage, a: Action, actor = 'h', isHost = actor === 'h') => reduce(s, a, actor, isHost, clock++)
const vote = (p: Partial<Vote>): Vote => ({rule: 'majority', candidates: ['x', 'y', 'z'], open: false, ballots: {}, ...p})

describe('decision rules (counting)', () => {
  it('majority: winner and tie', () => {
    expect(countVote(vote({ballots: {a: {kind: 'pick', cardId: 'x'}, b: {kind: 'pick', cardId: 'x'}, c: {kind: 'pick', cardId: 'y'}}})).winnerId).toBe('x')
    const tie = countVote(vote({ballots: {a: {kind: 'pick', cardId: 'x'}, b: {kind: 'pick', cardId: 'y'}}}))
    expect(tie.winnerId).toBeUndefined()
    expect(tie.tie).toEqual(['x', 'y'])
  })

  it('ranking uses Borda points', () => {
    const o = countVote(vote({rule: 'ranking', ballots: {
      a: {kind: 'rank', order: ['x', 'y', 'z']}, b: {kind: 'rank', order: ['y', 'x', 'z']}, c: {kind: 'rank', order: ['y', 'z', 'x']}
    }}))
    expect(o.counts).toEqual({x: 3, y: 5, z: 1})
    expect(o.winnerId).toBe('y')
  })

  it('consent passes without objections, consensus needs everyone', () => {
    const b = {a: {kind: 'stance' as const, stance: 'support' as const}, b: {kind: 'stance' as const, stance: 'live' as const}}
    expect(countVote(vote({rule: 'consent', candidateId: 'x', ballots: b})).winnerId).toBe('x')
    expect(countVote(vote({rule: 'consensus', candidateId: 'x', ballots: b})).winnerId).toBeUndefined()
    const obj = countVote(vote({rule: 'consent', candidateId: 'x', ballots: {...b, c: {kind: 'stance', stance: 'object', reason: 'Нет денег на сервер'}}}))
    expect(obj.winnerId).toBeUndefined()
    expect(obj.objections).toEqual(['Нет денег на сервер'])
  })
})

describe('decision vote in engine', () => {
  function atDecide(): Stage {
    let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 'П', settings: {calibration: false, evolve: false, timePreset: 'none'}, now: clock})
    for (const p of ['a', 'b', 'c']) s = act(s, {type: 'hello', name: p}, p, false)
    s = act(s, {type: 'phase.next'})
    s = act(s, {type: 'card.upsert', id: 'c1', fields: {who: 'первокурсники', situation: 'вечером', what: 'Негде стирать одежду'}}, 'a', false)
    s = act(s, {type: 'card.upsert', id: 'c2', fields: {who: 'заочники', situation: 'на сессии', what: 'Не знают расписание'}}, 'b', false)
    s = act(s, {type: 'phase.next'}); s = act(s, {type: 'phase.next'}); s = act(s, {type: 'phase.next'})
    const crit = s.criteria.map(c => c.id)
    for (const p of ['a', 'b', 'c']) s = act(s, {type: 'rate.submit', round: 1, ratings: crit.flatMap(cr => [{cardId: 'c1', criterionId: cr, value: 4 as Score}, {cardId: 'c2', criterionId: cr, value: 3 as Score}]), bases: []}, p, false)
    s = act(s, {type: 'phase.next'})
    return act(s, {type: 'phase.next'})
  }

  it('blind until reveal, winner becomes the chosen decision', () => {
    let s = atDecide()
    expect(s.phase).toBe('decide')
    expect(() => act(s, {type: 'vote.start', rule: 'majority'}, 'a', false)).toThrow('организатор')
    s = act(s, {type: 'vote.start', rule: 'majority'})
    s = act(s, {type: 'vote.cast', ballot: {kind: 'pick', cardId: 'c2'}}, 'a', false)
    s = act(s, {type: 'vote.cast', ballot: {kind: 'pick', cardId: 'c2'}}, 'b', false)
    s = act(s, {type: 'vote.cast', ballot: {kind: 'pick', cardId: 'c1'}}, 'c', false)
    expect(() => act(s, {type: 'vote.cast', ballot: {kind: 'pick', cardId: 'nope'}}, 'c', false)).toThrow('один вариант')
    const before = publicView(s, clock)
    expect(before.vote!.voted.sort()).toEqual(['a', 'b', 'c'])
    expect(JSON.stringify(before.vote)).not.toContain('ballots')
    expect(before.vote!.outcome).toBeUndefined()
    s = act(s, {type: 'vote.reveal'})
    expect(s.decisions).toEqual([{cardId: 'c2', status: 'chosen', reason: expect.stringContaining('2 из 3')}])
    expect(publicView(s, clock).vote!.outcome!.counts).toEqual({c2: 2, c1: 1})
    expect(() => act(s, {type: 'vote.cast', ballot: {kind: 'pick', cardId: 'c1'}}, 'a', false)).toThrow('закрыто')
  })

  it('owner decides alone; objection needs a reason', () => {
    let s = atDecide()
    s = act(s, {type: 'vote.start', rule: 'owner', ownerId: 'b'})
    expect(() => act(s, {type: 'vote.cast', ballot: {kind: 'pick', cardId: 'c1'}}, 'a', false)).toThrow('ответственный')
    s = act(s, {type: 'vote.cast', ballot: {kind: 'pick', cardId: 'c2'}}, 'b', false)
    s = act(s, {type: 'vote.reveal'})
    expect(s.decisions[0].cardId).toBe('c2')
    s = act(s, {type: 'vote.start', rule: 'consent', candidateId: 'c1'})
    expect(() => act(s, {type: 'vote.cast', ballot: {kind: 'stance', stance: 'object'}}, 'a', false)).toThrow('почему')
  })
})
