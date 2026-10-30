import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce, type Action} from './engine'
import {approvalQuota, computeResults, isDisputed, median, pickFinalists, toPercent} from './math'
import {lintCard, lintCriteria} from './lint'
import {fromLibrary} from './library'
import type {Score, Stage} from './types'

const HOST = 'host'
let clock = 1_000_000
const act = (s: Stage, a: Action, actor = HOST, isHost = actor === HOST) => reduce(s, a, actor, isHost, clock++)

function stageWith(people: string[]) {
  let s = createStage({projectId: 'p', type: 'problem', title: 't', settings: {calibration: false, timePreset: 'none'}, now: clock})
  for (const p of people) s = act(s, {type: 'hello', name: p.toUpperCase()}, p, false)
  return s
}

describe('math', () => {
  it('median and percent', () => {
    expect(median([1, 5, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(toPercent(1)).toBe(0)
    expect(toPercent(5)).toBe(100)
    expect(toPercent(3)).toBe(50)
  })

  it('disputed: two camps', () => {
    expect(isDisputed([5, 5, 2, 2])).toBe(true)
    expect(isDisputed([4, 4, 4, 4])).toBe(false)
    expect(isDisputed([1, 5])).toBe(false) // мало оценок
    expect(isDisputed([3, 3, 4, 2])).toBe(false)
  })

  it('approval quota and finalists', () => {
    expect(approvalQuota(4)).toBe(2)
    expect(approvalQuota(9)).toBe(3)
    expect(approvalQuota(30)).toBe(5)
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const fin = pickFinalists(ids, [{cardIds: ['a', 'b', 'c']}, {cardIds: ['a', 'd', 'e']}, {cardIds: ['f', 'g', 'h']}])
    expect(fin[0]).toBe('a')
    expect(fin.length).toBeLessThanOrEqual(7)
    expect(pickFinalists(['a', 'b'], [])).toEqual(['a', 'b'])
  })
})

describe('full flow', () => {
  it('problem stage from lobby to summary with blind rating', () => {
    let s = stageWith(['a', 'b', 'c', 'd'])
    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('generate')
    s = act(s, {type: 'card.upsert', id: 'c1', fields: {who: 'первокурсники', situation: 'в общежитии', what: 'Не могут найти, где постирать вещи вечером'}}, 'a', false)
    s = act(s, {type: 'card.upsert', id: 'c2', fields: {who: 'студенты-заочники', situation: 'на сессии', what: 'Не знают расписание пересдач заранее'}}, 'b', false)
    s = act(s, {type: 'card.upsert', id: 'c3', fields: {who: 'первокурсники', situation: 'вечером', what: 'Негде стирать одежду в общежитии'}}, 'c', false)
    // чужие карточки скрыты во время генерации
    expect(publicView(s, clock).cards).toHaveLength(0)
    expect(publicView(s, clock).cardCounts.a).toBe(1)
    expect(() => act(s, {type: 'card.upsert', id: 'c2', fields: {what: 'x'}}, 'a', false)).toThrow()

    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('merge')
    s = act(s, {type: 'merge', into: 'c1', from: 'c3'})
    expect(s.cards).toHaveLength(2)
    expect(publicView(s, clock).cards[0].mergedTexts).toHaveLength(1)

    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('criteria')
    expect(s.criteria.length).toBe(3)
    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('rate') // калибровка выключена, карточек ≤ 6 — отбор пропущен
    expect(s.finalists).toEqual(['c1', 'c2'])

    const crit = s.criteria.map(c => c.id)
    const rate = (who: string, v1: Score, v2: Score) => act(s, {
      type: 'rate.submit', round: 1,
      ratings: crit.flatMap(cr => [{cardId: 'c1', criterionId: cr, value: v1}, {cardId: 'c2', criterionId: cr, value: v2}]),
      bases: [{cardId: 'c1', basis: 'experience'}, {cardId: 'c2', basis: 'guess'}]
    }, who, false)
    s = rate('a', 5, 2)
    // до раскрытия результатов нет, есть прогресс
    const v = publicView(s, clock)
    expect(v.results).toBeUndefined()
    expect(v.progress.a).toBe(true)
    expect(JSON.stringify(v)).not.toContain('"raterId"')
    s = rate('b', 5, 3)
    s = rate('c', 4, 1)
    expect(() => act(s, {type: 'rate.submit', round: 1, ratings: [], bases: []}, 'd', false)).toThrow('Заполните')
    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('results')
    const r = publicView(s, clock).results!
    expect(r.cards[0].cardId).toBe('c1')
    expect(r.cards[0].score).toBe(toPercent((5 + 5 + 4) / 3))
    expect(r.cards[1].guess).toBe(true)

    expect(() => act(s, {type: 'phase.back'})).toThrow()
    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('decide')
    expect(() => act(s, {type: 'phase.next'})).toThrow()
    s = act(s, {type: 'decision.set', cardId: 'c1', status: 'chosen', reason: 'больно и часто'})
    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('summary')
  })

  it('participants cannot do host actions', () => {
    const s = stageWith(['a'])
    expect(() => act(s, {type: 'phase.next'}, 'a', false)).toThrow('организатор')
  })

  it('card limit is enforced', () => {
    let s = stageWith(['a'])
    s = act(s, {type: 'settings.update', patch: {cardLimit: 1}})
    s = act(s, {type: 'phase.next'})
    s = act(s, {type: 'card.upsert', id: 'x', fields: {what: 'one'}}, 'a', false)
    expect(() => act(s, {type: 'card.upsert', id: 'y', fields: {what: 'two'}}, 'a', false)).toThrow('Лимит')
  })

  it('author exclusion and inverted criteria', () => {
    let s = stageWith(['a', 'b'])
    s = {...s, phase: 'rate', finalists: ['k'], cards: [{id: 'k', authorIds: ['a'], fields: {}, mergedFrom: [], createdAt: 0}],
      criteria: [{...fromLibrary('pain', 'p'), inverted: true}]}
    s = act(s, {type: 'rate.submit', round: 1, ratings: [{cardId: 'k', criterionId: 'p', value: 5}], bases: []}, 'a', false)
    s = act(s, {type: 'rate.submit', round: 1, ratings: [{cardId: 'k', criterionId: 'p', value: 2}], bases: []}, 'b', false)
    expect(computeResults(s).cards[0].score).toBe(toPercent((1 + 4) / 2))
    s = {...s, settings: {...s.settings, excludeAuthor: true}}
    expect(computeResults(s).cards[0].score).toBe(toPercent(4))
  })

  it('second round replaces disputed ratings', () => {
    let s = stageWith(['a', 'b', 'c', 'd'])
    s = {...s, phase: 'rate', finalists: ['k', 'm'],
      cards: [{id: 'k', authorIds: ['a'], fields: {}, mergedFrom: [], createdAt: 0}, {id: 'm', authorIds: ['b'], fields: {}, mergedFrom: [], createdAt: 0}],
      criteria: [fromLibrary('pain', 'p')]}
    const vals: Record<string, [Score, Score]> = {a: [5, 3], b: [5, 3], c: [1, 3], d: [1, 3]}
    for (const [who, [k, m]] of Object.entries(vals)) {
      s = act(s, {type: 'rate.submit', round: 1, ratings: [{cardId: 'k', criterionId: 'p', value: k}, {cardId: 'm', criterionId: 'p', value: m}], bases: []}, who, false)
    }
    s = act(s, {type: 'phase.next'})
    expect(computeResults(s).cards.find(c => c.cardId === 'k')!.disputed).toBe(true)
    s = act(s, {type: 'round2.start'})
    expect(s.phase).toBe('rate2')
    expect(s.disputedForRound2).toEqual(['k'])
    for (const who of ['a', 'b', 'c', 'd']) {
      s = act(s, {type: 'rate.submit', round: 2, ratings: [{cardId: 'k', criterionId: 'p', value: 4}], bases: []}, who, false)
    }
    s = act(s, {type: 'phase.next'})
    expect(s.phase).toBe('results')
    const k = computeResults(s).cards.find(c => c.cardId === 'k')!
    expect(k.disputed).toBe(false)
    expect(k.score).toBe(75)
  })
})

describe('lint', () => {
  it('flags solutions in problems', () => {
    expect(lintCard('problem', {what: 'Нужно сделать приложение для поиска прачечной'})[0]).toContain('решение')
    expect(lintCard('problem', {who: 'студенты', what: 'Не могут найти свободную прачечную вечером в общежитии'})).toContain('Уточните, какие именно люди')
  })
  it('flags duplicated criteria', () => {
    const a = {...fromLibrary('pain', '1'), name: 'Актуальность'}
    const b = {...fromLibrary('pain', '2'), name: 'Востребованность'}
    expect(lintCriteria('problem', [a, b]).join()).toContain('одно и то же')
  })
})
