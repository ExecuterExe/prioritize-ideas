// Стартовая библиотека критериев и шаблоны карточек.
import type {Criterion, Tag} from './types'
import type {TemplateKind} from './template'

export interface LibraryCriterion {
  key: string
  for: 'problem' | 'idea' | 'risk'
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
  {key: 'probability', for: 'risk', name: 'Вероятность', tag: 'value',
    question: 'Насколько вероятно, что так и случится?',
    anchors: {1: 'Почти невозможно', 3: 'Может случиться', 5: 'Скорее всего случится'}},
  {key: 'damage', for: 'risk', name: 'Ущерб', tag: 'value',
    question: 'Насколько это навредит проекту, если случится?',
    anchors: {1: 'Мелкая неприятность', 3: 'Придётся заметно переделывать', 5: 'Проект закроется'}},
  {key: 'money', for: 'idea', name: 'Монетизация', tag: 'value',
    question: 'Понятно ли, кто и за что заплатит?',
    anchors: {1: 'Непонятно, кто заплатит', 3: 'Есть идея модели', 5: 'Понятно кто, за что и сколько'}}
]

// Библиотека критериев для вида шаблона: у «другого» доступны все
export function libraryFor(kind: TemplateKind): LibraryCriterion[] {
  return kind === 'other' ? LIBRARY.filter(l => l.for !== 'risk') : LIBRARY.filter(l => l.for === kind)
}

export function fromLibrary(key: string, id: string): Criterion {
  const c = LIBRARY.find(l => l.key === key)!
  return {
    id, name: c.name, question: c.question, anchors: {...c.anchors}, weight: 1,
    inverted: !!c.inverted, tag: c.tag, fromLibrary: c.key, approved: true
  }
}
