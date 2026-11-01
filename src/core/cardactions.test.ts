import {describe, expect, it} from 'vitest'
import {HISTORY_LIMIT, createStage, publicView, reduce, type Action} from './engine'
import {builtinTemplate} from './template'
import type {Stage} from './types'

let clock = 1
const act = (s: Stage, a: Action, actor = 'h', isHost = actor === 'h') => reduce(s, a, actor, isHost, clock++)
const fields = (what: string) => ({who: 'студенты', situation: 'вечером', what})

// Этап на шаге склейки с n карточками от разных участников
function atMerge(n: number): Stage {
  let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', settings: {calibration: false, evolve: false, timePreset: 'none', cardLimit: 5}, now: clock})
  for (const p of ['a', 'b']) s = act(s, {type: 'hello', name: p}, p, false)
  s = act(s, {type: 'phase.next'})
  for (let i = 1; i <= n; i++) s = act(s, {type: 'card.upsert', id: `c${i}`, fields: fields(`Проблема номер ${i} мешает учиться`)}, i % 2 ? 'a' : 'b', false)
  return act(s, {type: 'phase.next'})
}

describe('card actions', () => {
  it('edit keeps history, restore brings the old text back', () => {
    let s = atMerge(2)
    expect(() => act(s, {type: 'card.edit', id: 'c1', fields: fields('x')}, 'a', false)).toThrow('организатор')
    s = act(s, {type: 'card.edit', id: 'c1', fields: fields('Негде стирать одежду вечером в общежитии')})
    const c = s.cards.find(x => x.id === 'c1')!
    expect(c.history).toHaveLength(1)
    expect(c.history![0].fields.what).toBe('Проблема номер 1 мешает учиться')
    // та же формулировка — без новой версии
    s = act(s, {type: 'card.edit', id: 'c1', fields: fields('Негде стирать одежду вечером в общежитии')})
    expect(s.cards[0].history).toHaveLength(1)
    s = act(s, {type: 'card.restore', id: 'c1', at: c.history![0].at})
    expect(s.cards[0].fields.what).toBe('Проблема номер 1 мешает учиться')
    expect(s.cards[0].history!.map(v => v.fields.what)).toEqual(['Негде стирать одежду вечером в общежитии'])
    expect(publicView(s, clock).cards[0].history).toHaveLength(1)
    for (let i = 0; i < 8; i++) s = act(s, {type: 'card.edit', id: 'c1', fields: fields(`Версия номер ${i} формулировки`)})
    expect(s.cards[0].history).toHaveLength(HISTORY_LIMIT)
  })

  it('duplicate makes an authorless copy next to the card', () => {
    let s = atMerge(2)
    s = act(s, {type: 'card.duplicate', id: 'c1', newId: 'd1'})
    expect(s.cards.map(c => c.id)).toEqual(['c1', 'd1', 'c2'])
    expect(s.cards[1].authorIds).toEqual([])
    expect(s.cards[1].fields).toEqual(s.cards[0].fields)
  })

  it('pinned card survives the shortlist and follows a merge', () => {
    // 9 карточек после склейки: без закрепления c9 не прошла бы отбор (максимум 7)
    let s = atMerge(10)
    s = act(s, {type: 'card.pin', id: 'c10', on: true})
    s = act(s, {type: 'merge', into: 'c9', from: 'c10'})
    expect(s.pinned).toEqual(['c9'])
    s = act(s, {type: 'phase.next'}) // критерии
    s = act(s, {type: 'phase.next'}) // отбор
    expect(s.phase).toBe('shortlist')
    for (const p of ['a', 'b']) s = act(s, {type: 'approve.submit', cardIds: ['c1', 'c2']}, p, false)
    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('rate')
    expect(s.finalists).toContain('c9')
    expect(s.finalists).toHaveLength(8)
    expect(() => act(s, {type: 'card.pin', id: 'c1', on: true})).toThrow()
  })

  it('carry mark is public after generation', () => {
    let s = atMerge(2)
    s = act(s, {type: 'card.carry', id: 'c2', on: true})
    expect(publicView(s, clock).carry).toEqual(['c2'])
    s = act(s, {type: 'card.carry', id: 'c2', on: false})
    expect(publicView(s, clock).carry).toEqual([])
  })

  it('return for rework: only the author edits, once, with history', () => {
    let s = atMerge(2)
    expect(() => act(s, {type: 'card.upsert', id: 'c1', fields: fields('Поправка без возврата')}, 'a', false)).toThrow('генерации')
    s = act(s, {type: 'card.return', id: 'c1', note: 'Уточните, кто именно'})
    expect(publicView(s, clock).returned).toEqual({c1: 'Уточните, кто именно'})
    expect(() => act(s, {type: 'card.upsert', id: 'c1', fields: fields('Чужая правка карточки')}, 'b', false)).toThrow('не ваша')
    s = act(s, {type: 'card.upsert', id: 'c1', fields: {...fields('Негде стирать вечером'), who: 'первокурсники в общежитии'}}, 'a', false)
    expect(s.cards[0].fields.who).toBe('первокурсники в общежитии')
    expect(s.cards[0].history).toHaveLength(1)
    expect(publicView(s, clock).returned).toEqual({})
    expect(() => act(s, {type: 'card.upsert', id: 'c1', fields: fields('Ещё раз')}, 'a', false)).toThrow('генерации')
    s = act(s, {type: 'card.duplicate', id: 'c1', newId: 'd1'})
    expect(() => act(s, {type: 'card.return', id: 'd1', note: ''})).toThrow('нет автора')
  })
})
