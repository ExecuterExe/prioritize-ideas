import {describe, expect, it} from 'vitest'
import {FREE_TEMPLATES, GOALS, QUICK_SETTINGS, goalOf, goalWorkflow, visibleTools} from './quickstart'
import {BUILTIN_TEMPLATES} from './template'
import {createStage, publicView, reduce} from './engine'

describe('quick start', () => {
  it('every goal step and free template exists', () => {
    const ids = new Set(BUILTIN_TEMPLATES.map(t => t.id))
    for (const g of GOALS) for (const s of g.steps) expect(ids.has(s)).toBe(true)
    for (const t of FREE_TEMPLATES) expect(ids.has(t)).toBe(true)
  })

  it('goal becomes a workflow and back', () => {
    const g = GOALS.find(x => x.id === 'problem-to-idea')!
    const w = goalWorkflow(g)
    expect(w.steps).toEqual(['problem', 'idea'])
    expect(goalOf(w)).toBe(g)
    expect(goalWorkflow(GOALS.find(x => x.id === 'free')!, 'mvp').steps).toEqual(['mvp'])
    expect(goalOf({id: 'classic', name: '', description: '', steps: []})).toBeUndefined()
  })

  it('quick mode hides tools only while they are empty', () => {
    expect(visibleTools(undefined, {assumptions: 0, tasks: 0})).toEqual({assume: true, tasks: true})
    expect(visibleTools('quick', {assumptions: 0, tasks: 0})).toEqual({assume: false, tasks: false})
    expect(visibleTools('quick', {assumptions: 2, tasks: 0})).toEqual({assume: true, tasks: false})
    expect(visibleTools('quick', {assumptions: 0, tasks: 0, roundOpen: true}).assume).toBe(true)
    expect(visibleTools('quick', {assumptions: 0, tasks: 0}, GOALS.find(g => g.id === 'check-hypothesis')).assume).toBe(true)
  })

  it('quick settings reach participants and switch to full keeps data', () => {
    let s = createStage({projectId: 'p', template: BUILTIN_TEMPLATES[0], title: 't', settings: QUICK_SETTINGS, now: 1})
    expect(s.settings.calibration).toBe(false)
    expect(publicView(s, 2).settings.tools).toBe('quick')
    s = reduce(s, {type: 'hello', name: 'a'}, 'a', false, 2)
    s = reduce(s, {type: 'task.add', id: 't', title: 'Опрос'}, 'a', false, 3)
    s = reduce(s, {type: 'settings.update', patch: {tools: 'full'}}, 'h', true, 4)
    expect(s.settings.tools).toBe('full')
    expect(s.tasks!.map(t => t.id)).toEqual(['t'])
  })
})
