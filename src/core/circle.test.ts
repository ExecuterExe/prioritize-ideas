import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce, type Action} from './engine'
import {builtinTemplate} from './template'
import {circleOrder, secondsLeft, turnsUntil} from './circle'
import type {Stage} from './types'

let clock = 1000
const act = (s: Stage, a: Action, actor = 'h', isHost = actor === 'h') => reduce(s, a, actor, isHost, clock++)

function atMerge(): Stage {
  let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 'П', settings: {timePreset: 'none', evolve: false}, now: clock})
  for (const p of ['a', 'b', 'c']) s = act(s, {type: 'hello', name: p}, p, false)
  s = act(s, {type: 'phase.next'})
  s = act(s, {type: 'card.upsert', id: 'k', fields: {who: 'студенты', situation: 'вечером', what: 'Негде стирать'}}, 'a', false)
  return act(s, {type: 'phase.next'})
}

describe('circle', () => {
  it('order rotates and turns are counted', () => {
    expect(circleOrder(['a', 'b', 'c'], 1000)).toEqual(['b', 'c', 'a'])
    const c = {order: ['a', 'b', 'c'], idx: 1, seconds: 60, turnStartedAt: 0, open: true, skipped: [], notes: []}
    expect(turnsUntil(c, 'a')).toBeUndefined()
    expect(turnsUntil(c, 'c')).toBe(1)
    expect(secondsLeft(c, 15_000)).toBe(45)
  })

  it('speaker passes or writes instead; others cannot; closes after last', () => {
    let s = atMerge()
    expect(() => act(s, {type: 'circle.start', seconds: 90}, 'a', false)).toThrow('организатор')
    s = act(s, {type: 'circle.start', seconds: 90})
    const order = s.circle!.order
    const other = order[1]
    expect(() => act(s, {type: 'circle.pass'}, other, false)).toThrow('не ваша')
    s = act(s, {type: 'circle.note', text: 'Мне кажется, это про всех первокурсников'}, order[0], false)
    s = act(s, {type: 'circle.pass'}, order[1], false)
    expect(s.circle!.skipped).toEqual([order[1]])
    s = act(s, {type: 'circle.next'})
    expect(s.circle!.open).toBe(false)
    expect(publicView(s, clock).circle!.notes).toEqual(['Мне кажется, это про всех первокурсников'])
  })

  it('circle closes when the step changes', () => {
    let s = atMerge()
    s = act(s, {type: 'circle.start', seconds: 60})
    s = act(s, {type: 'phase.next'})
    expect(s.circle!.open).toBe(false)
  })
})

describe('parking', () => {
  it('anonymous thoughts are sorted into tasks, assumptions and the next stage', () => {
    let s = atMerge()
    s = act(s, {type: 'park.add', id: 'p1', text: 'Как на этом зарабатывать?'}, 'b', false)
    s = act(s, {type: 'park.add', id: 'p2', text: 'Спросить комендантов общежитий'}, 'c', false)
    s = act(s, {type: 'park.add', id: 'p3', text: 'Студенты готовы ждать 10 минут'}, 'a', false)
    const v = publicView(s, clock)
    expect(v.parking.map(p => p.text)).toHaveLength(3)
    expect(JSON.stringify(v.parking)).not.toMatch(/"b"|"c"/)
    expect(() => act(s, {type: 'park.resolve', id: 'p1', to: 'next'}, 'a', false)).toThrow('организатор')
    s = act(s, {type: 'park.resolve', id: 'p1', to: 'next'})
    s = act(s, {type: 'park.resolve', id: 'p2', to: 'task'})
    s = act(s, {type: 'park.resolve', id: 'p3', to: 'assumption'})
    expect(s.tasks!.map(t => t.title)).toContain('Спросить комендантов общежитий')
    expect(s.assumptions!.map(a => a.text)).toContain('Студенты готовы ждать 10 минут')
    // повторный клик не дублирует
    s = act(s, {type: 'park.resolve', id: 'p2', to: 'task'})
    expect(s.tasks!.filter(t => t.title === 'Спросить комендантов общежитий')).toHaveLength(1)
    const next = createStage({projectId: 'p', template: builtinTemplate('idea')!, title: 'И', now: clock, parking: s.parking!.filter(p => p.to === 'next').map(p => p.text)})
    expect(next.parking!.map(p => p.text)).toEqual(['Как на этом зарабатывать?'])
  })
})
