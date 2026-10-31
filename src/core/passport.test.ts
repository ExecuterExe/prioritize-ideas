import {describe, expect, it} from 'vitest'
import {createStage, publicView, reduce} from './engine'
import {complianceIssues, parsePassport, passportFilled, type Passport} from './passport'
import {builtinTemplate} from './template'

const TEACHER_TEXT = `Задание 1. Придумать цифровой продукт для студентов
Цель: разработать концепцию продукта, решающего реальную проблему студентов.
Для кого: студенты 1–2 курса

Ограничения:
- Цифровой формат
- Бюджет MVP до 100 000 ₽
- Первичная проверка за 2 недели

Обязательный результат:
1. Проблема и аудитория
2. Концепция решения
3. Способ проверки спроса

Нельзя:
• копировать существующие сервисы; использовать персональные данные

Критерии оценки:
— актуальность проблемы
— проработка проверки`

describe('parsePassport', () => {
  const p = parsePassport(TEACHER_TEXT)
  it('splits teacher text into sections', () => {
    expect(p.task).toContain('цифровой продукт')
    expect(p.audience).toBe('студенты 1–2 курса')
    expect(p.constraints).toEqual(['Цифровой формат', 'Бюджет MVP до 100 000 ₽', 'Первичная проверка за 2 недели'])
    expect(p.mustHave).toEqual(['Проблема и аудитория', 'Концепция решения', 'Способ проверки спроса'])
    expect(p.forbidden).toEqual(['копировать существующие сервисы', 'использовать персональные данные'])
    expect(p.teacherCriteria).toEqual(['актуальность проблемы', 'проработка проверки'])
    expect(p.sourceText).toContain('Задание 1')
  })
  it('detects empty passport', () => {
    expect(passportFilled(parsePassport(''))).toBe(false)
    expect(passportFilled(p)).toBe(true)
  })
})

describe('passport in engine', () => {
  const passport: Passport = {result: 'Концепция', task: 'Продукт для студентов', audience: '', constraints: ['Цифровой формат'], mustHave: ['Проблема', 'Способ проверки'], forbidden: ['Персональные данные'], teacherCriteria: []}

  it('is copied into the stage and visible to participants', () => {
    const s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', passport, now: 1})
    passport.task = 'изменено снаружи'
    expect(publicView(s, 2).passport?.task).toBe('Продукт для студентов')
  })

  it('host updates passport, adds criterion from constraint, marks compliance', () => {
    let s = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', passport, now: 1})
    expect(() => reduce(s, {type: 'passport.update', passport}, 'a', false, 2)).toThrow('организатор')
    s = reduce(s, {type: 'passport.update', passport: {...passport, constraints: ['Цифровой формат', '  ', 'Без бюджета']}}, 'h', true, 3)
    expect(s.passport?.constraints).toEqual(['Цифровой формат', 'Без бюджета'])
    s = reduce(s, {type: 'criterion.addFromPassport', text: 'Цифровой формат'}, 'h', true, 4)
    s = reduce(s, {type: 'criterion.addFromPassport', text: 'Цифровой формат'}, 'h', true, 5)
    expect(s.criteria.filter(c => c.name.startsWith('Соответствие')).length).toBe(1)
    expect(s.criteria[0].anchors[1]).toBe('Нарушает условие')
    s = reduce(s, {type: 'compliance.set', cardId: 'c1', item: 'must:0', value: 'ok'}, 'h', true, 6)
    s = reduce(s, {type: 'compliance.set', cardId: 'c1', item: 'forbid:0', value: 'fail'}, 'h', true, 7)
    expect(() => reduce(s, {type: 'compliance.set', cardId: 'c1', item: 'x:1', value: 'ok'}, 'h', true, 8)).toThrow()
    const issues = complianceIssues(s.passport, s.compliance?.c1)
    expect(issues.fails.map(i => i.text)).toEqual(['Персональные данные'])
    expect(issues.unchecked.map(i => i.text)).toEqual(['Способ проверки'])
    s = reduce(s, {type: 'compliance.set', cardId: 'c1', item: 'forbid:0', value: null}, 'h', true, 9)
    expect(s.compliance?.c1['forbid:0']).toBeUndefined()
  })
})
