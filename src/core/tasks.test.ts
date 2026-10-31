import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce} from './engine'
import {planByPerson, planItems, planText, todayISO, type Task} from './tasks'
import {builtinTemplate} from './template'
import type {Assumption, Experiment} from './assume'

const task = (id: string, p: Partial<Task>): Task => ({id, title: id, done: false, authorId: 'h', createdAt: 0, ...p})

describe('plan', () => {
  const assumptions: Assumption[] = [{id: 'x', text: 'Студенты готовы платить', category: 'viability', status: 'testing', authorId: 'h', createdAt: 0}]
  const experiments: Experiment[] = [{id: 'e', assumptionId: 'x', method: 'survey', audience: '', sampleN: 30, metric: '', thresholdKind: 'percent', threshold: 40, ownerId: 'a', deadline: '2026-11-01', authorId: 'h', createdAt: 0}]

  it('merges experiments and tasks, marks overdue', () => {
    const items = planItems([task('t1', {ownerId: 'a', deadline: '2026-10-20'}), task('t2', {ownerId: 'b', done: true})], experiments, assumptions, '2026-10-31')
    expect(items.map(i => i.key)).toEqual(['t:t1', 'e:e', 't:t2'])
    expect(items.find(i => i.key === 't:t1')!.overdue).toBe(true)
    expect(items.find(i => i.key === 'e:e')!.title).toContain('Студенты готовы платить')
  })

  it('groups by person, flags overload and unassigned', () => {
    const items = planItems([1, 2, 3, 4].map(n => task(`a${n}`, {ownerId: 'a'})).concat(task('free', {})), [], [], '2026-10-31')
    const plan = planByPerson(items, [{id: 'a'}, {id: 'b'}])
    expect(plan.find(p => p.ownerId === 'a')!.overloaded).toBe(true)
    expect(plan.find(p => p.ownerId === 'b')!.items).toEqual([])
    expect(plan.find(p => p.ownerId === null)!.items.map(i => i.refId)).toEqual(['free'])
  })

  it('renders chat text without done items', () => {
    const items = planItems([task('Сделать опрос', {ownerId: 'a', deadline: '2026-11-03'}), task('Готово', {ownerId: 'a', done: true})], [], [], '2026-10-31')
    const txt = planText(planByPerson(items, [{id: 'a'}]), () => 'Аня', 'Проект')
    expect(txt).toContain('Аня:\n• Сделать опрос — до 03.11')
    expect(txt).not.toContain('Готово')
    expect(planText([], () => '', 'П')).toContain('нет')
  })

  it('today is a date string', () => {
    expect(todayISO(new Date(2026, 9, 31, 23, 30))).toBe('2026-10-31')
  })
})

describe('tasks in engine', () => {
  it('permissions: owner can only tick done', () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('idea')!, title: 't', now: 1})
    for (const p of ['a', 'b']) s = reduce(s, {type: 'hello', name: p}, p, false, 2)
    s = reduce(s, {type: 'task.add', id: 't', title: 'Опросить 10 человек', ownerId: 'b', deadline: '2026-11-03'}, 'a', false, 3)
    s = reduce(s, {type: 'task.add', id: 'bad', title: 'С кривой датой', deadline: '03.11.2026'}, 'a', false, 4)
    expect(s.tasks!.find(t => t.id === 'bad')!.deadline).toBeUndefined()
    expect(() => reduce(s, {type: 'task.update', id: 't', patch: {title: 'Чужая правка'}}, 'b', false, 5)).toThrow('автор')
    s = reduce(s, {type: 'task.update', id: 't', patch: {done: true}}, 'b', false, 6)
    expect(s.tasks!.find(t => t.id === 't')!.done).toBe(true)
    expect(() => reduce(s, {type: 'task.delete', id: 't'}, 'b', false, 7)).toThrow('автор')
    s = reduce(s, {type: 'task.delete', id: 't'}, 'h', true, 8)
    expect(publicView(s, 9).tasks.map(t => t.id)).toEqual(['bad'])
    expect(publicView(s, 9).tasks[0].authorId).toBe('')
  })
})
