import {describe, expect, it} from 'vitest'
import {createStage, migrateStage, publicView, reduce} from './engine'
import {
  blankTemplate, builtinTemplate, cardSubtitle, cardTitle, cleanValue, formatValue, isVisible, lintTemplate,
  prefillValues, validateCard, type FieldDef, type StageTemplate
} from './template'
import type {Stage} from './types'

const hyp = builtinTemplate('hypothesis')!

describe('field values', () => {
  const f = (type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({key: 'x', label: 'Поле', type, required: false, ...extra})

  it('cleans each type', () => {
    expect(cleanValue(f('number'), '12,5')).toEqual([12.5, null])
    expect(cleanValue(f('number'), 'abc')[1]).toContain('число')
    expect(cleanValue(f('percent'), 2000)[1]).toContain('не больше')
    expect(cleanValue(f('select', {options: ['А', 'Б']}), 'В')[1]).toContain('вариант')
    expect(cleanValue(f('multiselect', {options: ['А', 'Б']}), ['А', 'А', 'Б'])).toEqual([['А', 'Б'], null])
    expect(cleanValue(f('checkbox'), true)).toEqual([true, null])
    expect(cleanValue(f('date'), '2026-11-02')).toEqual(['2026-11-02', null])
    expect(cleanValue(f('date'), '02.11.2026')[1]).toContain('дата')
    expect(cleanValue(f('scale'), 6)[1]).toContain('1 до 5')
    expect(cleanValue(f('link'), 'ya.ru')[1]).toContain('http')
    expect(cleanValue(f('text'), 'a'.repeat(500))[0]).toHaveLength(200)
    expect(cleanValue(f('text'), '')).toEqual([null, null])
  })

  it('formats values', () => {
    expect(formatValue(f('percent'), 15)).toBe('15%')
    expect(formatValue(f('checkbox'), false)).toBe('нет')
    expect(formatValue(f('multiselect'), ['А', 'Б'])).toBe('А, Б')
  })
})

describe('validateCard', () => {
  it('requires visible required fields only', () => {
    const base = {if: 'добавим напоминания', then: 'будут чаще открывать', confidence: 'Средняя', check: 'опрос 20 человек'}
    expect(validateCard(hyp, {...base, basis: 'Опыт'}).errors).toEqual([])
    expect(validateCard(hyp, {...base}).errors[0]).toContain('Основание')
    // «Источник» показывается только при основании «Данные» — иначе значение сбрасывается
    const hidden = validateCard(hyp, {...base, basis: 'Опыт', source: 'https://x.ru'})
    expect(hidden.values.source).toBeNull()
    const shown = validateCard(hyp, {...base, basis: 'Данные', source: 'не ссылка'})
    expect(shown.errors[0]).toContain('http')
  })

  it('showIf works for equals and notEmpty', () => {
    const fd: FieldDef = {key: 'b', label: 'Б', type: 'text', required: false, showIf: {field: 'a', notEmpty: true}}
    expect(isVisible(fd, {a: ''})).toBe(false)
    expect(isVisible(fd, {a: 'x'})).toBe(true)
  })
})

describe('titles and prefill', () => {
  it('title and subtitle come from template', () => {
    const t = builtinTemplate('problem')!
    expect(cardTitle(t, {what: 'Нет прачечной', who: 'первокурсники', situation: 'вечером'})).toBe('Нет прачечной')
    expect(cardSubtitle(t, {what: 'x', who: 'первокурсники', situation: 'вечером'})).toBe('первокурсники · вечером')
  })
  it('idea prefills «Для кого» from the chosen problem', () => {
    expect(prefillValues(builtinTemplate('idea')!, {who: 'первокурсники', what: 'x'})).toEqual({who: 'первокурсники'})
  })
})

describe('template lint', () => {
  it('catches broken templates', () => {
    const t: StageTemplate = {...blankTemplate('t1'), name: 'Тест'}
    expect(lintTemplate(t).errors).toEqual([])
    const bad: StageTemplate = {
      ...t, titleField: 'nope',
      fields: [...t.fields, {key: 'c', label: 'Выбор', type: 'select', required: false, options: ['один']},
        {key: 'd', label: 'Условное', type: 'text', required: false, showIf: {field: 'gone', notEmpty: true}}]
    }
    const errs = lintTemplate(bad).errors.join(' | ')
    expect(errs).toContain('заголовок')
    expect(errs).toContain('2 варианта')
    expect(errs).toContain('удалённое поле')
  })
})

describe('engine with templates', () => {
  it('migrates old stages without a template', () => {
    const old = {...createStage({projectId: 'p', template: builtinTemplate('idea')!, title: 't', now: 1}), template: undefined} as unknown as Stage
    expect(migrateStage({...old, type: 'idea'}).template.id).toBe('idea')
    expect(migrateStage({...old, type: 'problem'}).template.fields.map(f => f.key)).toContain('what')
  })

  it('custom hypothesis template runs through generate with validation', () => {
    let s = createStage({projectId: 'p', template: hyp, title: 'Гипотезы', settings: {timePreset: 'none', calibration: false}, now: 1})
    s = reduce(s, {type: 'hello', name: 'Аня'}, 'a', false, 2)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 3)
    expect(() => reduce(s, {type: 'card.upsert', id: 'c1', fields: {if: 'x'}}, 'a', false, 4)).toThrow('Заполните')
    s = reduce(s, {type: 'card.upsert', id: 'c1', fields: {if: 'добавим push', then: 'вернутся через неделю', confidence: 'Высокая', basis: 'Данные', source: 'https://t.me/x', check: 'A/B', change: '15'}}, 'a', false, 5)
    expect(s.cards[0].fields.change).toBe(15)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 6)
    s = reduce(s, {type: 'phase.next'}, 'h', true, 7)
    expect(s.phase).toBe('criteria')
    expect(s.criteria.map(c => c.fromLibrary)).toEqual(['user-value', 'hypothesis', 'feasibility'])
    expect(publicView(s, 8).template.name).toBe('Продуктовая гипотеза')
  })

  it('stage keeps its own copy of the template', () => {
    const t = {...blankTemplate('mine'), name: 'Мой'}
    const s = createStage({projectId: 'p', template: t, title: 't', now: 1})
    t.name = 'Переименован'
    expect(s.template.name).toBe('Мой')
  })
})
