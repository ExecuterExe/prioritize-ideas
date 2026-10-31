import {describe, expect, it} from 'vitest'
import {createStage, phaseFlow, reduce, canAdvance} from './engine'
import {computeResults} from './math'
import {riskAssumptionText, riskRows, riskToAssumptionCategory} from './risk'
import {builtinTemplate, validateCard} from './template'
import type {Score} from './types'

describe('pre-mortem', () => {
  const tpl = builtinTemplate('premortem')!

  it('template requires a category and has risk criteria', () => {
    expect(validateCard(tpl, {what: 'Студенты вернулись к чату в Telegram'}).errors[0]).toContain('Почему по сути')
    expect(validateCard(tpl, {what: 'Студенты вернулись к чату в Telegram', category: 'Люди не стали менять привычки'}).errors).toEqual([])
    expect(tpl.defaultCriteria).toEqual(['probability', 'damage'])
  })

  it('marks critical risks, skips evolve and allows finishing without critical risks', () => {
    let s = createStage({projectId: 'p', template: tpl, title: 't', settings: {timePreset: 'none', calibration: false, evolve: true}, now: 1})
    expect(s.settings.evolve).toBe(false)
    for (const p of ['a', 'b']) s = reduce(s, {type: 'hello', name: p}, p, false, 2)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 3)
    s = reduce(s, {type: 'card.upsert', id: 'r1', fields: {what: 'Никто не стал пользоваться очередью', category: 'Люди не стали менять привычки'}}, 'a', false, 4)
    s = reduce(s, {type: 'card.upsert', id: 'r2', fields: {what: 'Общежитие запретило датчики на машинах', category: 'Технология не заработала'}}, 'b', false, 5)
    expect(phaseFlow(s)).not.toContain('evolve')
    s = reduce(s, {type: 'phase.next'}, 'h', true, 6)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 7)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 8)
    expect(s.phase).toBe('rate')
    const [prob, dmg] = s.criteria.map(c => c.id)
    const rate = (who: string, r1: [Score, Score], r2: [Score, Score]) => reduce(s, {type: 'rate.submit', round: 1, ratings: [
      {cardId: 'r1', criterionId: prob, value: r1[0]}, {cardId: 'r1', criterionId: dmg, value: r1[1]},
      {cardId: 'r2', criterionId: prob, value: r2[0]}, {cardId: 'r2', criterionId: dmg, value: r2[1]}
    ], bases: []}, who, false, 9)
    s = rate('a', [4, 5], [2, 4])
    s = rate('b', [4, 4], [2, 3])
    s = reduce(s, {type: 'phase.next'}, 'h', true, 10)
    const rows = riskRows(computeResults(s).cards, s.criteria, s.decisions)
    expect(rows.find(r => r.cardId === 'r1')).toMatchObject({probability: 4, damage: 4.5, critical: true})
    expect(rows.find(r => r.cardId === 'r2')!.critical).toBe(false)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 11)
    expect(s.phase).toBe('decide')
    expect(canAdvance(s)).toBeNull()
  })

  it('maps failure reasons to assumptions', () => {
    expect(riskToAssumptionCategory('Люди не стали менять привычки')).toBe('desirability')
    expect(riskToAssumptionCategory('Не хватило ресурсов')).toBe('feasibility')
    expect(riskToAssumptionCategory('Появился сильный конкурент')).toBe('viability')
    expect(riskAssumptionText('Никто не стал пользоваться.')).toBe('Этого не случится: Никто не стал пользоваться')
  })
})
