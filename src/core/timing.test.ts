import {describe, expect, it} from 'vitest'
import {createStage, phaseFlow, publicView, reduce} from './engine'
import {builtinTemplate} from './template'
import {CARRY_LIMIT, carryOver, minutesLeft, shortenSuggestion} from './timing'

const MIN = 60_000

function stage(now: number) {
  let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', settings: {timePreset: 'standard', evolve: true, calibration: true, secondRound: true}, now})
  for (const p of ['a', 'b']) s = reduce(s, {type: 'hello', name: p}, p, false, now)
  return s
}

describe('timing', () => {
  it('carry is capped and never negative', () => {
    expect(carryOver(undefined, 0)).toBe(0)
    expect(carryOver(1000, 2000)).toBe(0)
    expect(carryOver(30 * MIN, 0)).toBe(CARRY_LIMIT)
  })

  it('finishing early moves the rest to the next step', () => {
    let s = stage(0)
    expect(s.deadline).toBe(2 * MIN)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 30_000) // лобби за 30 с вместо 2 минут
    expect(s.phase).toBe('generate')
    expect(s.carried).toBe(90_000)
    expect(s.deadline).toBe(30_000 + 8 * MIN + 90_000)
    expect(publicView(s, 30_000).carried).toBe(90_000)
    // назад — без переноса
    s = reduce(s, {type: 'phase.back'}, 'h', true, 40_000)
    expect(s.carried).toBeUndefined()
  })

  it('overrun suggests switching off optional steps ahead', () => {
    let s = stage(0)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 2 * MIN)
    for (const [p, id] of [['a', 'x'], ['b', 'y']]) s = reduce(s, {type: 'card.upsert', id, fields: {who: 'студенты', situation: 'вечером', what: `Проблема номер ${id} мешает учиться`}}, p, false, 3 * MIN)
    const flow = phaseFlow(s)
    expect(shortenSuggestion(s, flow, s.deadline! + MIN)).toBeUndefined()
    const sug = shortenSuggestion(s, flow, s.deadline! + 4 * MIN)!
    expect(sug.patch).toEqual({evolve: false, calibration: false, secondRound: false})
    expect(sug.minutes).toBe(7 + 2 + 3)
    expect(sug.overMinutes).toBe(4)
    s = reduce(s, {type: 'settings.update', patch: sug.patch}, 'h', true, s.deadline! + 4 * MIN)
    expect(phaseFlow(s)).not.toContain('calibrate')
    expect(shortenSuggestion(s, phaseFlow(s), s.deadline! + 4 * MIN)).toBeUndefined()
  })

  it('minutes left counts current and following steps', () => {
    const s = stage(0)
    expect(minutesLeft(s, phaseFlow(s), 0)).toBe(2 + 8 + 4 + 5 + 2 + 7 + 6 + 5)
  })

  it('host screen flag is host-only and public', () => {
    let s = stage(0)
    expect(() => reduce(s, {type: 'session.hostScreen', on: true}, 'a', false, 1)).toThrow()
    s = reduce(s, {type: 'session.hostScreen', on: true}, 'h', true, 1)
    expect(publicView(s, 1).hostScreen).toBe(true)
    s = reduce(s, {type: 'session.hostScreen', on: false}, 'h', true, 2)
    expect(publicView(s, 2).hostScreen).toBe(false)
  })
})
