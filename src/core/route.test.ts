import {describe, expect, it} from 'vitest'
import {createStage, reduce, type Action} from './engine'
import {builtinTemplate} from './template'
import {branchOptions, focusCard, leaderAssumption, planBranch, rankedCards, routeChain} from './route'
import type {Score, Stage} from './types'

const HOST = 'host'
let clock = 1_000
const act = (s: Stage, a: Action, actor = HOST, isHost = actor === HOST) => reduce(s, a, actor, isHost, clock++)

// Этап «Проблема», доведённый до результатов: c2 обгоняет c1
function rated(): Stage {
  let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 'Проблема', settings: {calibration: false, evolve: false, timePreset: 'none'}, now: clock})
  for (const p of ['a', 'b', 'c']) s = act(s, {type: 'hello', name: p}, p, false)
  s = act(s, {type: 'phase.next'})
  s = act(s, {type: 'card.upsert', id: 'c1', fields: {who: 'первокурсники', situation: 'вечером', what: 'Негде стирать одежду'}}, 'a', false)
  s = act(s, {type: 'card.upsert', id: 'c2', fields: {who: 'заочники', situation: 'на сессии', what: 'Не знают расписание пересдач'}}, 'b', false)
  s = act(s, {type: 'phase.next'})
  s = act(s, {type: 'phase.next'})
  s = act(s, {type: 'phase.next'})
  const crit = s.criteria.map(c => c.id)
  for (const who of ['a', 'b', 'c']) {
    s = act(s, {type: 'rate.submit', round: 1, ratings: crit.flatMap(cr => [{cardId: 'c1', criterionId: cr, value: 2 as Score}, {cardId: 'c2', criterionId: cr, value: 5 as Score}]), bases: []}, who, false)
  }
  return act(s, {type: 'phase.next'})
}

describe('route', () => {
  it('focus is the leader until the team chooses', () => {
    let s = rated()
    expect(s.phase).toBe('results')
    expect(rankedCards(s).map(c => c.id)).toEqual(['c2', 'c1'])
    expect(focusCard(s)!.id).toBe('c2')
    s = act(s, {type: 'phase.next'})
    s = act(s, {type: 'decision.set', cardId: 'c1', status: 'chosen', reason: 'ближе нам'})
    expect(focusCard(s)!.id).toBe('c1')
  })

  it('offers problem branches and plans them from the leader', () => {
    const s = rated()
    expect(branchOptions(s).map(o => o.choice)).toEqual(['reformulate', 'another', 'ideas', 'journey', 'assume'])
    const ideas = planBranch(s, 'ideas')!
    expect(ideas.template.id).toBe('idea')
    expect(ideas.sourceProblem).toContain('Не знают расписание пересдач')
    expect(ideas.sourceFields?.who).toBe('заочники')
    expect(planBranch(s, 'another')!.sourceProblem).toMatch(/Уже рассматривали.*пересдач.*стирать/)
    expect(planBranch(s, 'journey')!.persona).toBe('заочники')
    expect(leaderAssumption(s)!.category).toBe('desirability')
  })

  it('rerate keeps cards and criteria and starts a working stage', () => {
    const s = rated()
    const plan = planBranch(s, 'rerate')!
    let n = createStage({projectId: 'p', template: plan.template, title: plan.title, seedCards: plan.seedCards, seedCriteria: plan.seedCriteria, settings: {calibration: false, evolve: false, timePreset: 'none'}, now: clock})
    expect(n.cards).toHaveLength(2)
    expect(n.criteria.map(c => c.id)).toEqual(s.criteria.filter(c => c.approved).map(c => c.id))
    // исходный этап не тронут
    expect(s.ratings.length).toBeGreaterThan(0)
    n = act(n, {type: 'hello', name: 'a'}, 'a', false)
    n = act(n, {type: 'phase.next'})
    expect(n.phase).toBe('generate')
  })

  it('no idea branch before rating, chain labels', () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 'П', now: 1})
    expect(branchOptions(s).map(o => o.choice)).toEqual(['journey'])
    s = {...s, id: 's1'}
    const chain = routeChain([s, {...s, id: 's2', title: 'П2'}], [{stageId: 's2', fromStageId: 's1', choice: 'reformulate', at: 1}])
    expect(chain).toEqual(['🧩 П', '↩ переформулировка: 🧩 П2'])
  })
})
