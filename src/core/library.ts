// Стартовая библиотека критериев и шаблоны карточек.
import type {Criterion, StageType, Tag} from './types'

export interface LibraryCriterion {
  key: string
  for: StageType
  name: string
  question: string
  anchors: {1: string; 3: string; 5: string}
  tag?: Tag
  inverted?: boolean
}

export const LIBRARY: LibraryCriterion[] = [
  {key: 'pain', for: 'problem', name: 'Боль', tag: 'value',
    question: 'Насколько сильно проблема мешает тому, кто с ней сталкивается?',
    anchors: {1: 'Лёгкое неудобство, легко игнорировать', 3: 'Заметно мешает, иногда ищут обходные пути', 5: 'Сильно мешает, активно ищут решение или тратят деньги/время'}},
  {key: 'frequency', for: 'problem', name: 'Частота', tag: 'value',
    question: 'Как часто люди сталкиваются с проблемой?',
    anchors: {1: 'Раз в год и реже', 3: 'Раз в месяц', 5: 'Каждый день или неделю'}},
  {key: 'scale', for: 'problem', name: 'Масштаб', tag: 'value',
    question: 'Сколько людей сталкивается с проблемой?',
    anchors: {1: 'Единицы людей', 3: 'Заметная группа (поток, факультет)', 5: 'Массово (все студенты города и шире)'}},
  {key: 'reach', for: 'problem', name: 'Доступность людей для опроса', tag: 'testability',
    question: 'Насколько легко найти и опросить этих людей?',
    anchors: {1: 'Не знаем, где найти', 3: 'Найдём с усилием (знакомые знакомых)', 5: 'Они рядом, можно опросить на этой неделе'}},
  {key: 'verifiable', for: 'problem', name: 'Проверяемость', tag: 'testability',
    question: 'Насколько просто проверить, что проблема действительно существует?',
    anchors: {1: 'Непонятно, как проверить', 3: 'Можно проверить опросом', 5: 'Проверим фактами или наблюдением быстро'}},
  {key: 'weak-alternatives', for: 'problem', name: 'Слабость текущих решений', tag: 'value',
    question: 'Насколько плохо проблему решают сейчас?',
    anchors: {1: 'Уже есть хорошие решения', 3: 'Решения есть, но с явными минусами', 5: 'Решений нет или все плохие'}},
  {key: 'closeness', for: 'problem', name: 'Близость команде', tag: 'feasibility',
    question: 'Насколько команда сама разбирается в этой проблеме?',
    anchors: {1: 'Никто в теме не разбирается', 3: 'Кто-то сталкивался', 5: 'Мы сами — целевая аудитория или эксперты'}},
  {key: 'novelty', for: 'idea', name: 'Новизна', tag: 'novelty',
    question: 'Насколько идея нова?',
    anchors: {1: 'Копия существующего', 3: 'Известное в новом контексте', 5: 'Аналогов не знаем'}},
  {key: 'feasibility', for: 'idea', name: 'Реализуемость за курс', tag: 'feasibility',
    question: 'Сможем ли мы сделать прототип за время курса?',
    anchors: {1: 'Нужны годы, деньги или команда профи', 3: 'Сложно, но MVP возможен', 5: 'Прототип за 1–2 недели'}},
  {key: 'user-value', for: 'idea', name: 'Ценность для пользователя', tag: 'value',
    question: 'Насколько идея помогает пользователю?',
    anchors: {1: '«Приятно, но не нужно»', 3: 'Заметно помогает', 5: 'Решает боль полностью'}},
  {key: 'difference', for: 'idea', name: 'Отличие от альтернатив', tag: 'novelty',
    question: 'Чем идея лучше того, чем пользуются сейчас?',
    anchors: {1: 'Не лучше текущих', 3: 'Лучше в одном аспекте', 5: 'Явно лучше по главному параметру'}},
  {key: 'hypothesis', for: 'idea', name: 'Проверяемость гипотезы', tag: 'testability',
    question: 'Насколько быстро можно проверить, что идея нужна?',
    anchors: {1: 'Не проверить без готового продукта', 3: 'Проверим опросом или макетом', 5: 'Проверим быстрым экспериментом на людях'}},
  {key: 'money', for: 'idea', name: 'Монетизация', tag: 'value',
    question: 'Понятно ли, кто и за что заплатит?',
    anchors: {1: 'Непонятно, кто заплатит', 3: 'Есть идея модели', 5: 'Понятно кто, за что и сколько'}}
]

export const DEFAULT_CRITERIA: Record<StageType, string[]> = {
  problem: ['pain', 'frequency', 'reach'],
  idea: ['novelty', 'feasibility', 'user-value']
}

export function fromLibrary(key: string, id: string): Criterion {
  const c = LIBRARY.find(l => l.key === key)!
  return {
    id, name: c.name, question: c.question, anchors: {...c.anchors}, weight: 1,
    inverted: !!c.inverted, tag: c.tag, fromLibrary: c.key, approved: true
  }
}

export interface FieldDef {
  key: string
  label: string
  hint: string
  required: boolean
  multiline?: boolean
}

export const CARD_FIELDS: Record<StageType, FieldDef[]> = {
  problem: [
    {key: 'who', label: 'Кто сталкивается', hint: 'студенты-первокурсники, живущие в общежитии', required: true},
    {key: 'situation', label: 'В какой ситуации', hint: 'когда нужно…', required: true},
    {key: 'what', label: 'Что мешает', hint: 'суть проблемы в 1–2 предложениях', required: true, multiline: true},
    {key: 'effect', label: 'К чему приводит', hint: 'последствие (необязательно)', required: false}
  ],
  idea: [
    {key: 'title', label: 'Название', hint: '2–5 слов', required: true},
    {key: 'essence', label: 'Суть', hint: 'что это, 1–2 предложения', required: true, multiline: true},
    {key: 'who', label: 'Для кого', hint: 'кто будет пользоваться', required: true},
    {key: 'how', label: 'Как решает проблему', hint: 'механизм', required: true, multiline: true},
    {key: 'alternatives', label: 'Чем пользуются сейчас', hint: 'существующие альтернативы (необязательно)', required: false}
  ]
}

export function cardTitle(type: StageType, fields: Record<string, string>): string {
  if (type === 'idea') return fields.title || fields.essence || 'Без названия'
  return fields.what || 'Без описания'
}

export function cardSubtitle(type: StageType, fields: Record<string, string>): string {
  if (type === 'idea') return fields.essence || ''
  return [fields.who, fields.situation].filter(Boolean).join(' · ')
}
