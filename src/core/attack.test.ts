import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce, type Action} from './engine'
import {builtinTemplate} from './template'
import type {Score, Stage} from './types'

let clock = 1
const act = (s: Stage, a: Action, actor = 'h', isHost = actor === 'h') => reduce(s, a, actor, isHost, clock++)

function atResults(): Stage {
  let s = createStage({projectId: 'p', template: builtinTemplate('idea')!, title: 'И', settings: {calibration: false, evolve: false, timePreset: 'none'}, now: clock})
  for (const p of ['a', 'b', 'c']) s = act(s, {type: 'hello', name: p}, p, false)
  s = act(s, {type: 'phase.next'})
  const idea = (t: string) => ({title: t, essence: `Сервис ${t}`, who: 'студенты', how: `Через бота ${t}`})
  s = act(s, {type: 'card.upsert', id: 'k1', fields: idea('Бот прачечной')}, 'a', false)
  s = act(s, {type: 'card.upsert', id: 'k2', fields: idea('Карта машинок')}, 'b', false)
  s = act(s, {type: 'phase.next'}); s = act(s, {type: 'phase.next'}); s = act(s, {type: 'phase.next'})
  const crit = s.criteria.map(c => c.id)
  for (const p of ['a', 'b', 'c']) s = act(s, {type: 'rate.submit', round: 1, ratings: crit.flatMap(cr => [{cardId: 'k1', criterionId: cr, value: 5 as Score}, {cardId: 'k2', criterionId: cr, value: 3 as Score}]), bases: []}, p, false)
  return act(s, {type: 'phase.next'})
}

describe('attack the leader', () => {
  it('blind writing, anonymous reveal, blind marks, results by votes', () => {
    let s = atResults()
    expect(() => act(s, {type: 'attack.start', targetId: 'k1'}, 'a', false)).toThrow('организатор')
    s = act(s, {type: 'attack.start', targetId: 'k1'})
    s = act(s, {type: 'attack.add', id: 'o1', text: 'Коменданты не дадут доступ к машинкам'}, 'a', false)
    s = act(s, {type: 'attack.add', id: 'o2', text: 'Студенты не будут ставить ещё одно приложение'}, 'b', false)
    s = act(s, {type: 'attack.add', id: 'o3', text: 'Машинки и так свободны по утрам'}, 'c', false)
    let v = publicView(s, clock)
    expect(v.attack!.objections).toEqual([])
    expect(v.attack!.written).toMatchObject({a: 1, b: 1, c: 1})
    expect(JSON.stringify(v.attack)).not.toContain('Коменданты')
    s = act(s, {type: 'attack.add', id: 'o4', text: 'Второе от c'}, 'c', false)
    s = act(s, {type: 'attack.add', id: 'o5', text: 'Третье от c'}, 'c', false)
    expect(() => act(s, {type: 'attack.add', id: 'o6', text: 'Четвёртое'}, 'c', false)).toThrow('Не больше 3')
    s = act(s, {type: 'attack.reveal'})
    v = publicView(s, clock)
    expect(v.attack!.objections).toHaveLength(5)
    expect(JSON.stringify(v.attack)).not.toMatch(/authorId/)
    expect(() => act(s, {type: 'attack.add', id: 'o7', text: 'Поздно'}, 'a', false)).toThrow('до раскрытия')
    s = act(s, {type: 'attack.mark', ids: ['o1', 'o2']}, 'a', false)
    s = act(s, {type: 'attack.mark', ids: ['o1']}, 'b', false)
    s = act(s, {type: 'attack.mark', ids: ['o3', 'nope']}, 'c', false)
    expect(publicView(s, clock).attack!.results).toBeUndefined()
    expect(publicView(s, clock).attack!.marked.sort()).toEqual(['a', 'b', 'c'])
    s = act(s, {type: 'attack.finish'})
    const r = publicView(s, clock).attack!.results!
    expect(r[0]).toMatchObject({id: 'o1', votes: 2, strong: true})
    expect(r.find(x => x.id === 'o3')).toMatchObject({votes: 1, strong: false})
  })
})
