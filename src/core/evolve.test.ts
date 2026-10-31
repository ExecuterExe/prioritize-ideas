import {describe, expect, it} from 'vitest'
import {ancestors, assignEvolve, treeDepths, wordDiff} from './evolve'
import {createStage, participantKey, phaseFlow, publicView, reduce} from './engine'
import {builtinTemplate} from './template'

describe('assignEvolve', () => {
  for (const n of [2, 3, 4, 5, 6, 8]) {
    it(`never gives own cards and spreads load evenly for ${n} people`, () => {
      const people = Array.from({length: n}, (_, i) => `p${i}`)
      const cards = people.flatMap(p => [{id: `${p}a`, authorIds: [p]}, {id: `${p}b`, authorIds: [p]}])
      const a = assignEvolve(cards, people)
      const load = new Map<string, number>()
      for (const p of people) {
        expect(a[p]).toHaveLength(2)
        expect(new Set(a[p]).size).toBe(2)
        for (const id of a[p]) {
          expect(id.startsWith(p)).toBe(false)
          load.set(id, (load.get(id) ?? 0) + 1)
        }
      }
      const loads = cards.map(c => load.get(c.id) ?? 0)
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1)
    })
  }
  it('gives fewer cards when there are not enough foreign ones', () => {
    expect(assignEvolve([{id: 'x', authorIds: ['a']}], ['a', 'b'])).toEqual({a: [], b: ['x']})
  })
})

describe('tree and diff', () => {
  const cards = [
    {id: 'A'}, {id: 'B'},
    {id: 'C', parents: [{id: 'A', kind: 'develop' as const}]},
    {id: 'D', parents: [{id: 'C', kind: 'combine' as const}, {id: 'B', kind: 'combine' as const}]}
  ]
  it('computes depth and ancestors', () => {
    const d = treeDepths(cards)
    expect([d.get('A'), d.get('B'), d.get('C'), d.get('D')]).toEqual([0, 0, 1, 2])
    expect([...ancestors('D', cards)].sort()).toEqual(['A', 'B', 'C'])
  })
  it('diffs words', () => {
    const parts = wordDiff('бронь аудиторий через бот', 'бронь аудиторий через сайт и бот')
    expect(parts.filter(p => p.kind === 'add').map(p => p.text.trim()).join(' ')).toBe('сайт и')
    expect(parts.some(p => p.kind === 'del')).toBe(false)
  })
})

describe('evolve phase in engine', () => {
  const setup = () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', settings: {timePreset: 'none', calibration: false}, now: 1})
    for (const [pid, tok] of [['a', 'tok-a'], ['b', 'tok-b'], ['c', 'tok-c']]) s = reduce(s, {type: 'hello', name: pid, token: tok}, pid, false, 2)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 3)
    const f = (what: string) => ({who: 'студенты', situation: 'вечером', what})
    s = reduce(s, {type: 'card.upsert', id: 'ca', fields: f('Негде стирать вещи вечером')}, 'a', false, 4)
    s = reduce(s, {type: 'card.upsert', id: 'cb', fields: f('Нет расписания пересдач заранее')}, 'b', false, 5)
    s = reduce(s, {type: 'card.upsert', id: 'cc', fields: f('Шумно готовиться к экзаменам')}, 'c', false, 6)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 7)
    return s
  }

  it('enters evolve and assigns foreign cards by opaque keys', () => {
    const s = setup()
    expect(s.phase).toBe('evolve')
    expect(phaseFlow(s)).toContain('evolve')
    const v = publicView(s, 8)
    expect(Object.keys(v.evolveAssign!)).not.toContain('a')
    const keyA = participantKey(s.participants.find(p => p.id === 'a')!)
    expect(v.evolveAssign![keyA]).not.toContain('ca')
    expect(JSON.stringify(v)).not.toContain('tok-a')
    expect(v.cards.map(c => c.num)).toEqual([1, 2, 3])
  })

  it('develops and combines with limits and permissions', () => {
    let s = setup()
    const f = {who: 'студенты', situation: 'в сессию', what: 'Не знают, когда пересдача, и пропускают её'}
    expect(() => reduce(s, {type: 'card.develop', id: 'n0', parentId: 'ca', fields: f}, 'a', false, 9)).toThrow('чужие')
    s = reduce(s, {type: 'card.develop', id: 'n1', parentId: 'cb', fields: f}, 'a', false, 10)
    expect(s.cards.find(c => c.id === 'n1')!.parents).toEqual([{id: 'cb', kind: 'develop'}])
    expect(() => reduce(s, {type: 'card.combine', id: 'n2', parentIds: ['cb'], fields: f}, 'a', false, 11)).toThrow('две')
    s = reduce(s, {type: 'card.combine', id: 'n2', parentIds: ['cb', 'cc'], fields: f}, 'a', false, 12)
    expect(() => reduce(s, {type: 'card.develop', id: 'n3', parentId: 'cc', fields: f}, 'a', false, 13)).toThrow('Не больше')
    // свою новую версию можно поправить на этом шаге
    s = reduce(s, {type: 'card.upsert', id: 'n1', fields: {...f, what: 'Пропускают пересдачи из-за путаницы в расписании'}}, 'a', false, 14)
    expect(() => reduce(s, {type: 'card.upsert', id: 'ca', fields: f}, 'a', false, 15)).toThrow('генерации')
    s = reduce(s, {type: 'evolve.done'}, 'a', false, 16)
    expect(publicView(s, 17).progress.a).toBe(true)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 18)
    expect(s.phase).toBe('merge')
    expect(publicView(s, 19).cards.find(c => c.id === 'n2')!.parents).toHaveLength(2)
  })

  it('evolve is skipped in express and with a single participant', () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', settings: {timePreset: 'express'}, now: 1})
    expect(s.settings.evolve).toBe(false)
    s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', settings: {timePreset: 'none'}, now: 1})
    s = reduce(s, {type: 'hello', name: 'a'}, 'a', false, 2)
    expect(phaseFlow(s)).not.toContain('evolve')
  })
})
