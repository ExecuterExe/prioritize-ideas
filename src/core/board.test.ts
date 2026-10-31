import {describe, expect, it} from 'vitest'
import {checkBoard, dependencyClosure, findCycles, suggestBuckets} from './board'
import {createStage, phaseFlow, publicView, reduce} from './engine'
import {builtinTemplate} from './template'
import type {Score} from './types'

describe('MVP board logic', () => {
  it('suggests buckets by value and effort', () => {
    expect(suggestBuckets({
      a: {value: 4.5, effort: 2}, b: {value: 4.5, effort: 5}, c: {value: 2, effort: 1}, d: {value: null, effort: null}
    })).toEqual({a: 'mvp', b: 'v2', c: 'later', d: 'v2'})
  })

  it('finds broken dependencies, budget overflow and cycles', () => {
    const scores = {a: {value: 5, effort: 4}, b: {value: 4, effort: 4}, c: {value: 3, effort: 3}}
    const chk = checkBoard({buckets: {a: 'mvp', b: 'mvp', c: 'v2'}, deps: {a: ['c'], b: ['a']}, budget: 6}, scores)
    expect(chk.mvpEffort).toBe(8)
    expect(chk.overBudget).toBe(true)
    expect(chk.brokenDeps).toEqual([{cardId: 'a', missing: ['c']}])
    expect(findCycles({a: ['b'], b: ['a']})).toHaveLength(1)
    expect(dependencyClosure('a', {a: ['b'], b: ['c'], c: []}).sort()).toEqual(['b', 'c'])
  })
})

describe('MVP board stage', () => {
  it('rates all components and opens the board with suggestions', () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('mvp')!, title: 'MVP', settings: {timePreset: 'none'}, now: 1})
    for (const p of ['a', 'b']) s = reduce(s, {type: 'hello', name: p}, p, false, 2)
    expect(phaseFlow(s)).toEqual(['lobby', 'generate', 'merge', 'criteria', 'rate', 'results', 'board', 'summary'])
    s = reduce(s, {type: 'phase.next'}, 'h', true, 3)
    const comps = [['q', 'Очередь на машины', 'Функция'], ['n', 'Уведомление в чат', 'Интеграция'], ['s', 'Статистика загрузки', 'Данные']]
    comps.forEach(([id, name, type], i) => { s = reduce(s, {type: 'card.upsert', id, fields: {name, type}}, i % 2 ? 'b' : 'a', false, 4 + i) })
    expect(() => reduce(s, {type: 'card.upsert', id: 'x', fields: {name: 'Без типа'}}, 'b', false, 9)).toThrow('Что это')
    s = reduce(s, {type: 'phase.next'}, 'h', true, 10)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 11)
    expect(s.criteria.map(c => c.fromLibrary)).toEqual(['comp-value', 'comp-effort'])
    s = reduce(s, {type: 'phase.next'}, 'h', true, 12)
    expect(s.phase).toBe('rate')
    expect(s.finalists).toEqual(['q', 'n', 's'])
    const [val, eff] = s.criteria.map(c => c.id)
    const rate = (who: string, v: Record<string, [Score, Score]>) => reduce(s, {type: 'rate.submit', round: 1, bases: [],
      ratings: Object.entries(v).flatMap(([id, [x, y]]) => [{cardId: id, criterionId: val, value: x}, {cardId: id, criterionId: eff, value: y}])}, who, false, 13)
    s = rate('a', {q: [5, 2], n: [4, 3], s: [2, 4]})
    s = rate('b', {q: [5, 3], n: [2, 2], s: [2, 5]}) // n: ценность 3 — в «Версию 2.0»
    s = reduce(s, {type: 'phase.next'}, 'h', true, 14)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 15)
    expect(s.phase).toBe('board')
    expect(s.board!.buckets).toEqual({q: 'mvp', n: 'v2', s: 'later'})
    expect(() => reduce(s, {type: 'board.move', cardIds: ['n'], bucket: 'mvp'}, 'a', false, 16)).toThrow('организатор')
    s = reduce(s, {type: 'board.deps', cardId: 'q', deps: ['n', 'q']}, 'h', true, 16)
    expect(s.board!.deps.q).toEqual(['n'])
    let v = publicView(s, 17)
    expect(v.board!.check.brokenDeps).toEqual([{cardId: 'q', missing: ['n']}])
    s = reduce(s, {type: 'board.move', cardIds: ['n'], bucket: 'mvp'}, 'h', true, 18)
    s = reduce(s, {type: 'board.budget', budget: 4}, 'h', true, 19)
    v = publicView(s, 20)
    expect(v.board!.check.brokenDeps).toEqual([])
    expect(v.board!.check.mvpEffort).toBe(5)
    expect(v.board!.check.overBudget).toBe(true)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 21)
    expect(s.phase).toBe('summary')
  })
})
