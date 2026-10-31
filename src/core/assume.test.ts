import {describe, expect, it} from 'vitest'
import {autoVerdict, marginNote, marginPP, quadrant, roundAverages, threatsFor, type Assumption} from './assume'
import {createStage, publicView, reduce} from './engine'
import {builtinTemplate} from './template'

describe('experiment verdict', () => {
  const base = {thresholdKind: 'percent' as const, threshold: 40, sampleN: 30}
  it('compares fact with threshold', () => {
    expect(autoVerdict({...base, resultN: 30, resultHits: 14})).toBe('confirmed') // 46.7% ≥ 40%
    expect(autoVerdict({...base, resultN: 30, resultHits: 10})).toBe('partly')    // 33% ≥ 30% (75% порога)
    expect(autoVerdict({...base, resultN: 30, resultHits: 5})).toBe('refuted')    // 16.7%
    expect(autoVerdict({...base, resultN: 12, resultHits: 12})).toBe('insufficient') // меньше половины выборки
    expect(autoVerdict({...base})).toBeNull()
  })
  it('works with counts', () => {
    expect(autoVerdict({thresholdKind: 'count', threshold: 12, sampleN: 30, resultN: 30, resultHits: 12})).toBe('confirmed')
    expect(autoVerdict({thresholdKind: 'count', threshold: 12, sampleN: 30, resultN: 30, resultHits: 9})).toBe('partly')
    expect(autoVerdict({thresholdKind: 'count', threshold: 12, sampleN: 30, resultN: 30, resultHits: 8})).toBe('refuted')
  })
  it('explains sampling error', () => {
    expect(marginPP(30)).toBe(18)
    expect(marginPP(0)).toBeNull()
    expect(marginNote({...base, resultN: 30, resultHits: 14})).toContain('не различимы')
    expect(marginNote({...base, sampleN: 400, resultN: 400, resultHits: 300})).toContain('больше погрешности')
  })
})

describe('assumption map', () => {
  it('classifies quadrants', () => {
    expect(quadrant({importance: 5, evidence: 1})).toBe('leap')
    expect(quadrant({importance: 4, evidence: 4})).toBe('known')
    expect(quadrant({importance: 1, evidence: 1})).toBe('later')
    expect(quadrant({importance: 2, evidence: 5})).toBe('minor')
    expect(quadrant({})).toBeNull()
  })
  it('averages blind votes', () => {
    const r = {open: false, revealed: true, ids: ['a', 'b'], submitted: [], votes: [
      {raterId: 'x', assumptionId: 'a', importance: 5, evidence: 1},
      {raterId: 'y', assumptionId: 'a', importance: 3, evidence: 2}
    ]}
    expect(roundAverages(r)).toEqual({a: {importance: 4, evidence: 1.5, n: 2, spreadI: 2, spreadE: 1}})
  })
  it('flags concepts that rest on refuted or untested assumptions', () => {
    const mk = (id: string, p: Partial<Assumption>): Assumption => ({id, text: id, category: 'desirability', status: 'untested', authorId: 'h', createdAt: 0, linkedCardId: 'c1', ...p})
    const t = threatsFor('c1', [mk('a', {status: 'refuted'}), mk('b', {importance: 5, evidence: 1}), mk('c', {linkedCardId: 'c2'})])
    expect(t.linked.map(a => a.id)).toEqual(['a', 'b'])
    expect(t.refuted.map(a => a.id)).toEqual(['a'])
    expect(t.leapUntested.map(a => a.id)).toEqual(['b'])
  })
})


describe('assumptions and experiments in engine', () => {
  const setup = () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('idea')!, title: 't', settings: {timePreset: 'none'}, now: 1})
    s = reduce(s, {type: 'hello', name: 'Аня'}, 'a', false, 2)
    s = reduce(s, {type: 'hello', name: 'Петя'}, 'b', false, 3)
    s = reduce(s, {type: 'hello', name: 'Орг'}, 'h', true, 4)
    s = reduce(s, {type: 'assumption.add', id: 'x1', text: 'Студенты готовы платить 199 ₽', category: 'viability', linkedCardId: 'c1'}, 'a', false, 5)
    s = reduce(s, {type: 'assumption.add', id: 'x2', text: 'Проблема возникает каждую неделю', category: 'desirability'}, 'b', false, 6)
    return s
  }

  it('only author or host can edit; anonymity hides authors', () => {
    let s = setup()
    expect(() => reduce(s, {type: 'assumption.update', id: 'x1', patch: {text: 'чужая правка'}}, 'b', false, 7)).toThrow('автор')
    s = reduce(s, {type: 'assumption.update', id: 'x1', patch: {text: 'Готовы платить 149 ₽'}}, 'a', false, 8)
    s = reduce(s, {type: 'assumption.update', id: 'x1', patch: {importance: 9}}, 'h', true, 9)
    expect(s.assumptions![0].importance).toBe(5)
    expect(publicView(s, 10).assumptions.every(a => a.authorId === '')).toBe(true)
  })

  it('blind round: votes hidden until reveal, then averages applied', () => {
    let s = setup()
    expect(() => reduce(s, {type: 'round.open'}, 'a', false, 7)).toThrow('организатор')
    s = reduce(s, {type: 'round.open'}, 'h', true, 7)
    expect(() => reduce(s, {type: 'round.submit', votes: [{assumptionId: 'x1', importance: 5, evidence: 1}]}, 'a', false, 8)).toThrow('Оцените все')
    s = reduce(s, {type: 'round.submit', votes: [{assumptionId: 'x1', importance: 5, evidence: 1}, {assumptionId: 'x2', importance: 2, evidence: 4}]}, 'a', false, 9)
    s = reduce(s, {type: 'round.submit', votes: [{assumptionId: 'x1', importance: 3, evidence: 2}, {assumptionId: 'x2', importance: 2, evidence: 4}]}, 'b', false, 10)
    const before = publicView(s, 11)
    expect(JSON.stringify(before)).not.toContain('"votes"')
    expect(before.round?.submitted).toEqual(['a', 'b'])
    expect(before.round?.averages).toBeUndefined()
    s = reduce(s, {type: 'round.reveal'}, 'h', true, 12)
    expect(s.assumptions!.find(a => a.id === 'x1')).toMatchObject({importance: 4, evidence: 1.5})
    expect(publicView(s, 13).round?.averages?.x1.n).toBe(2)
  })

  it('experiment result sets assumption status; override needs a reason', () => {
    let s = setup()
    s = reduce(s, {type: 'experiment.add', id: 'e1', assumptionId: 'x2', method: 'survey', audience: 'первокурсники', sampleN: 30, metric: 'доля', thresholdKind: 'percent', threshold: 40, ownerId: 'b'}, 'a', false, 7)
    expect(s.assumptions!.find(a => a.id === 'x2')!.status).toBe('testing')
    expect(() => reduce(s, {type: 'experiment.result', id: 'e1', resultN: 30, resultHits: 40}, 'b', false, 8)).toThrow('Проверьте числа')
    s = reduce(s, {type: 'experiment.result', id: 'e1', resultN: 30, resultHits: 14}, 'b', false, 9)
    expect(s.assumptions!.find(a => a.id === 'x2')).toMatchObject({status: 'confirmed', proof: 'Опрос: 14 из 30'})
    expect(() => reduce(s, {type: 'experiment.result', id: 'e1', resultN: 30, resultHits: 14, override: 'partly'}, 'h', true, 10)).toThrow('Объясните')
    s = reduce(s, {type: 'experiment.result', id: 'e1', resultN: 30, resultHits: 14, override: 'partly', reason: 'выборка из одной группы'}, 'h', true, 11)
    expect(s.assumptions!.find(a => a.id === 'x2')!.status).toBe('partly')
    expect(() => reduce(s, {type: 'experiment.result', id: 'e1', resultN: 30, resultHits: 1}, 'a', false, 12)).not.toThrow() // автор эксперимента
    s = reduce(s, {type: 'assumption.delete', id: 'x2'}, 'h', true, 13)
    expect(s.experiments).toEqual([])
  })
})
