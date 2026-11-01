import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce, type Action} from './engine'
import {builtinTemplate} from './template'
import {autoAssign, compareBranches, makeBranches} from './branches'
import {branchOptions, planBranch, planFork} from './route'
import {computeResults} from './math'
import type {Score, Stage} from './types'

let clock = 1
const act = (s: Stage, a: Action, actor = 'h', isHost = actor === 'h') => reduce(s, a, actor, isHost, clock++)
const idea = (what: string) => ({title: what, essence: `Сервис: ${what}`, who: 'студенты', how: `Сделать так, чтобы ${what}`})

describe('branches', () => {
  it('auto-assign balances people', () => {
    const br = makeBranches([{title: 'Стирка'}, {title: 'Пересдачи'}])
    const map = autoAssign(br, {a: 'A'}, ['a', 'b', 'c', 'd'])
    expect(Object.values(map).filter(v => v === 'A')).toHaveLength(2)
    expect(Object.values(map).filter(v => v === 'B')).toHaveLength(2)
  })

  it('fork from a problem stage → idea stage with two directions', () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 'П', now: clock})
    for (const p of ['a', 'b']) s = act(s, {type: 'hello', name: p}, p, false)
    s = act(s, {type: 'phase.next'})
    s = act(s, {type: 'card.upsert', id: 'c1', fields: {who: 'первокурсники', situation: 'вечером', what: 'Негде стирать одежду'}}, 'a', false)
    s = act(s, {type: 'card.upsert', id: 'c2', fields: {who: 'заочники', situation: 'на сессии', what: 'Не знают расписание'}}, 'b', false)
    s = act(s, {type: 'phase.next'})
    expect(branchOptions(s).map(o => o.choice)).toContain('fork')
    const plan = planFork(s, ['c1', 'c2'])!
    expect(plan.template.id).toBe('idea')
    expect(plan.branches!.map(b => b.title)).toEqual(['Негде стирать одежду', 'Не знают расписание'])
    expect(planFork(s, ['c1', 'c1'])).toBeUndefined()
  })

  it('people write in their branch, rate together, leaders compared, combine planned', () => {
    let s = createStage({
      projectId: 'p', template: builtinTemplate('idea')!, title: 'И', now: clock,
      settings: {calibration: false, evolve: false, timePreset: 'none'},
      branches: [{title: 'Стирка', source: 'Негде стирать'}, {title: 'Пересдачи', source: 'Не знают расписание'}]
    })
    for (const p of ['a', 'b', 'c', 'd']) s = act(s, {type: 'hello', name: p}, p, false)
    s = act(s, {type: 'branch.join', branchId: 'B'}, 'a', false)
    expect(() => act(s, {type: 'branch.join', branchId: 'Z'}, 'b', false)).toThrow('Нет такой ветки')
    expect(() => act(s, {type: 'branch.assign', pid: 'b', branchId: 'A'}, 'c', false)).toThrow()
    s = act(s, {type: 'phase.next'})
    // остальные разложены поровну: B уже есть «a»
    expect(Object.values(s.branchOf!).filter(v => v === 'A')).toHaveLength(2)
    expect(publicView(s, clock).branchOf.a).toBe('B')
    const wrote: Record<string, string> = {}
    for (const p of ['a', 'b', 'c', 'd']) {
      s = act(s, {type: 'card.upsert', id: `k${p}`, fields: idea(`идея участника ${p} про общежитие`)}, p, false)
      wrote[`k${p}`] = s.branchOf![p]
    }
    for (const c of s.cards) expect(c.branchId).toBe(wrote[c.id])
    s = act(s, {type: 'phase.next'})
    expect(() => act(s, {type: 'branch.join', branchId: 'A'}, 'a', false)).toThrow('до конца генерации')
    s = act(s, {type: 'phase.next'})
    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('rate')
    const crit = s.criteria.map(c => c.id)
    // все оценивают все карточки; лучшая в ветке A — первая по списку
    for (const p of ['a', 'b', 'c', 'd']) {
      s = act(s, {type: 'rate.submit', round: 1, ratings: crit.flatMap(cr => s.finalists.map((id, i) => ({cardId: id, criterionId: cr, value: (5 - i) as Score}))), bases: []}, p, false)
    }
    s = act(s, {type: 'phase.next'})
    const cmp = compareBranches(s.branches!, s.cards, s.branchOf!, computeResults(s), s.criteria)
    expect(cmp.map(b => b.cards)).toEqual([2, 2])
    expect(cmp.every(b => b.leader)).toBe(true)
    expect(cmp[0].leader!.rank).not.toBe(cmp[1].leader!.rank)
    expect(branchOptions(s).map(o => o.choice)).toContain('combine')
    const comb = planBranch(s, 'combine')!
    expect(comb.seedCards).toHaveLength(2)
    expect(comb.settings).toEqual({evolve: true})
  })
})
