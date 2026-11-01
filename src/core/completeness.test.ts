import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce, type Action} from './engine'
import {builtinTemplate} from './template'
import {blindSpots, checkState, checklistFor, openItems} from './completeness'
import type {Score, Stage} from './types'

let clock = 1
const act = (s: Stage, a: Action, actor = 'h', isHost = actor === 'h') => reduce(s, a, actor, isHost, clock++)

function decided(): Stage {
  let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 'П', settings: {calibration: false, evolve: false, timePreset: 'none'}, now: clock})
  for (const p of ['a', 'b']) s = act(s, {type: 'hello', name: p}, p, false)
  s = act(s, {type: 'phase.next'})
  s = act(s, {type: 'card.upsert', id: 'c1', fields: {who: 'первокурсники в общежитии', situation: 'вечером', what: 'Негде стирать одежду'}, basis: 'guess'}, 'a', false)
  s = act(s, {type: 'card.upsert', id: 'c2', fields: {who: 'заочники', situation: 'на сессии', what: 'Не знают расписание'}}, 'b', false)
  s = act(s, {type: 'phase.next'}); s = act(s, {type: 'phase.next'})
  // Оставляем один критерий — «боль»: остальные аспекты станут слепыми зонами
  for (const c of s.criteria.slice(1)) s = act(s, {type: 'criterion.remove', id: c.id})
  s = act(s, {type: 'phase.next'})
  const crit = s.criteria.map(c => c.id)
  for (const p of ['a', 'b']) s = act(s, {type: 'rate.submit', round: 1, ratings: crit.flatMap(cr => [{cardId: 'c1', criterionId: cr, value: 5 as Score}, {cardId: 'c2', criterionId: cr, value: 2 as Score}]), bases: [{cardId: 'c1', basis: 'guess'}, {cardId: 'c2', basis: 'guess'}]}, p, false)
  s = act(s, {type: 'phase.next'}); s = act(s, {type: 'phase.next'})
  return act(s, {type: 'decision.set', cardId: 'c1', status: 'chosen'})
}

describe('completeness', () => {
  it('checklist depends on stage type', () => {
    expect(checklistFor('problem').map(i => i.key)).toEqual(['audience', 'evidence', 'alternatives', 'toCheck'])
    expect(checklistFor('risk')).toEqual([])
  })

  it('suggests, closes on reasons and revisit, accepts conscious «unknown»', () => {
    let s = decided()
    let v = publicView(s, clock)
    expect(checkState(v, {key: 'audience', label: '', hint: ''})).toMatchObject({status: 'open', text: 'первокурсники в общежитии'})
    expect(openItems(v).map(i => i.key)).toEqual(['audience', 'evidence', 'alternatives', 'toCheck'])
    s = act(s, {type: 'decision.set', cardId: 'c2', status: 'deferred', reason: 'заочников трудно опросить'})
    s = act(s, {type: 'revisit.set', text: 'меньше 3 из 10 подтвердят проблему'})
    s = act(s, {type: 'check.set', key: 'audience', status: 'done', text: 'первокурсники общежития №3'})
    s = act(s, {type: 'check.set', key: 'evidence', status: 'unknown'})
    v = publicView(s, clock)
    expect(openItems(v)).toEqual([])
    expect(checkState(v, {key: 'toCheck', label: '', hint: ''}).text).toContain('Пересмотрим, если меньше 3 из 10')
    expect(() => act(s, {type: 'revisit.set', text: 'x'}, 'a', false)).toThrow('организатор')
  })

  it('blind spots: missing aspects, no assumptions, guesses', () => {
    const spots = blindSpots(publicView(decided(), clock))
    expect(spots.some(t => t.includes('проверяемость'))).toBe(true)
    expect(spots.some(t => t.includes('реализуемость'))).toBe(true)
    expect(spots.some(t => t.includes('ни одного предположения'))).toBe(true)
    expect(spots.some(t => t.includes('по догадкам'))).toBe(true)
  })
})
