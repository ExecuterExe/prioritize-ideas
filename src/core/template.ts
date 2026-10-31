// Конструктор: шаблоны карточек и этапов, проверка значений полей, сценарии-цепочки.
// Встроенные «Проблема» и «Идея» — тоже шаблоны: старые проекты работают как раньше.

export type FieldType = 'text' | 'longtext' | 'number' | 'percent' | 'select' | 'multiselect'
  | 'checkbox' | 'date' | 'scale' | 'link' | 'cardref'

export type FieldValue = string | number | boolean | string[] | null

export interface ShowIf {
  field: string
  equals?: string
  notEmpty?: boolean
}

export interface FieldDef {
  key: string
  label: string
  hint?: string
  type: FieldType
  required: boolean
  options?: string[]
  min?: number
  max?: number
  showIf?: ShowIf
  prefill?: string // ключ поля карточки из предыдущего этапа
}

export type LintRule =
  | {rule: 'solution-words'; fields: string[]}
  | {rule: 'vague-who'; field: string}
  | {rule: 'min-length'; field: string; n: number; text: string}

// Вид шаблона определяет библиотеку критериев и проверки критериев
export type TemplateKind = 'problem' | 'idea' | 'risk' | 'journey' | 'other'

export interface StageTemplate {
  id: string
  name: string
  emoji: string
  kind: TemplateKind
  fields: FieldDef[]
  titleField: string
  subtitleFields: string[]
  askBasis: boolean
  lint: LintRule[]
  defaultCriteria: string[]
  matrixAxes?: [string, string] // ключи критериев из библиотеки
  intro?: string
  mode?: 'decide' | 'journey' // режим этапа: сбор и оценка или карта пути
  builtin?: boolean
  updatedAt?: number
}

export interface Workflow {
  id: string
  name: string
  description: string
  steps: string[] // id шаблонов
  builtin?: boolean
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Короткий текст',
  longtext: 'Длинный текст',
  number: 'Число',
  percent: 'Процент',
  select: 'Выбор одного',
  multiselect: 'Выбор нескольких',
  checkbox: 'Флажок «да/нет»',
  date: 'Дата',
  scale: 'Шкала 1–5',
  link: 'Ссылка',
  cardref: 'Связь с карточкой'
}

const SHORT = 200, LONG = 600

// ——— Встроенные шаблоны ———

// Категории причин провала (pre-mortem) и связь с видами предположений
export const RISK_CATEGORIES = [
  'Проблема оказалась незначительной', 'Люди не стали менять привычки', 'Не хватило ресурсов',
  'Технология не заработала', 'Появился сильный конкурент', 'Не сошлась экономика', 'Другое'
]

export const BUILTIN_TEMPLATES: StageTemplate[] = [
  {
    id: 'problem', name: 'Проблема', emoji: '🧩', kind: 'problem', builtin: true, askBasis: true,
    fields: [
      {key: 'who', label: 'Кто сталкивается', hint: 'студенты-первокурсники, живущие в общежитии', type: 'text', required: true},
      {key: 'situation', label: 'В какой ситуации', hint: 'когда нужно…', type: 'text', required: true},
      {key: 'what', label: 'Что мешает', hint: 'суть проблемы в 1–2 предложениях', type: 'longtext', required: true},
      {key: 'effect', label: 'К чему приводит', hint: 'последствие', type: 'text', required: false}
    ],
    titleField: 'what', subtitleFields: ['who', 'situation'],
    lint: [
      {rule: 'solution-words', fields: ['what', 'situation']},
      {rule: 'min-length', field: 'what', n: 25, text: 'Опишите, что мешает, конкретнее'},
      {rule: 'vague-who', field: 'who'}
    ],
    defaultCriteria: ['pain', 'frequency', 'reach'],
    matrixAxes: ['frequency', 'pain']
  },
  {
    id: 'idea', name: 'Идея', emoji: '💡', kind: 'idea', builtin: true, askBasis: true,
    fields: [
      {key: 'title', label: 'Название', hint: '2–5 слов', type: 'text', required: true},
      {key: 'essence', label: 'Суть', hint: 'что это, 1–2 предложения', type: 'longtext', required: true},
      {key: 'who', label: 'Для кого', hint: 'кто будет пользоваться', type: 'text', required: true, prefill: 'who'},
      {key: 'how', label: 'Как решает проблему', hint: 'механизм', type: 'longtext', required: true},
      {key: 'alternatives', label: 'Чем пользуются сейчас', hint: 'существующие альтернативы', type: 'text', required: false}
    ],
    titleField: 'title', subtitleFields: ['essence'],
    lint: [
      {rule: 'min-length', field: 'essence', n: 20, text: 'Раскройте суть идеи подробнее'},
      {rule: 'vague-who', field: 'who'}
    ],
    defaultCriteria: ['novelty', 'feasibility', 'user-value'],
    matrixAxes: ['feasibility', 'novelty']
  },
  {
    id: 'hypothesis', name: 'Продуктовая гипотеза', emoji: '🧪', kind: 'other', builtin: true, askBasis: false,
    intro: 'Сформулируйте гипотезу: что сделаем и что ожидаем от пользователей.',
    fields: [
      {key: 'if', label: 'Если мы…', hint: 'внедрим определённое решение', type: 'longtext', required: true},
      {key: 'then', label: 'То пользователи…', hint: 'начнут чаще пользоваться продуктом', type: 'longtext', required: true},
      {key: 'change', label: 'Ожидаемое изменение', hint: '15', type: 'percent', required: false},
      {key: 'confidence', label: 'Уверенность', type: 'select', required: true, options: ['Низкая', 'Средняя', 'Высокая']},
      {key: 'basis', label: 'Основание', type: 'select', required: true, options: ['Опыт', 'Наблюдение', 'Данные', 'Догадка']},
      {key: 'source', label: 'Источник данных', hint: 'https://…', type: 'link', required: false, showIf: {field: 'basis', equals: 'Данные'}},
      {key: 'check', label: 'Как проверим?', hint: 'опрос, прототип, лендинг…', type: 'longtext', required: true}
    ],
    titleField: 'if', subtitleFields: ['then'],
    lint: [{rule: 'min-length', field: 'then', n: 15, text: 'Опишите ожидаемое поведение пользователей конкретнее'}],
    defaultCriteria: ['user-value', 'hypothesis', 'feasibility']
  },
  {
    id: 'premortem', name: 'Причина провала', emoji: '🪦', kind: 'risk', builtin: true, askBasis: false,
    intro: 'Прошло 6 месяцев. Наш продукт закрылся. Почему это случилось?',
    fields: [
      {key: 'what', label: 'Что пошло не так', hint: 'студенты попробовали и вернулись к чату в Telegram', type: 'longtext', required: true},
      {key: 'category', label: 'Почему по сути', type: 'select', required: true, options: RISK_CATEGORIES},
      {key: 'signal', label: 'Ранний сигнал', hint: 'что мы заметили бы заранее', type: 'text', required: false}
    ],
    titleField: 'what', subtitleFields: ['category'],
    lint: [{rule: 'min-length', field: 'what', n: 20, text: 'Опишите сценарий провала конкретнее: кто, что сделал, почему'}],
    defaultCriteria: ['probability', 'damage'],
    matrixAxes: ['probability', 'damage']
  },
  {
    id: 'journey', name: 'Карта пути пользователя', emoji: '🗺️', kind: 'journey', mode: 'journey', builtin: true, askBasis: false,
    intro: 'Найдите, в какой момент жизни пользователя возникает боль.',
    fields: [{key: 'what', label: 'Что мешает на этом шаге', hint: 'все машины заняты, а узнать заранее нельзя', type: 'longtext', required: true}],
    titleField: 'what', subtitleFields: [], lint: [], defaultCriteria: []
  },
  {
    id: 'trend', name: 'Тренд', emoji: '📈', kind: 'other', builtin: true, askBasis: true,
    intro: 'Какие изменения в мире или технологиях создают новые возможности?',
    fields: [
      {key: 'trend', label: 'Тренд', hint: 'что меняется', type: 'text', required: true},
      {key: 'evidence', label: 'Признаки', hint: 'где это уже видно', type: 'longtext', required: true},
      {key: 'link', label: 'Ссылка', hint: 'https://…', type: 'link', required: false},
      {key: 'who', label: 'Кого затрагивает', type: 'text', required: false}
    ],
    titleField: 'trend', subtitleFields: ['evidence'],
    lint: [],
    defaultCriteria: ['scale', 'closeness', 'verifiable']
  }
]

export const BUILTIN_WORKFLOWS: Workflow[] = [
  {id: 'classic', name: 'Классика', description: 'Выбрать проблему, затем идею решения', steps: ['problem', 'idea'], builtin: true},
  {id: 'hypotheses', name: 'От гипотез', description: 'Идея уже есть — сформулировать и выбрать гипотезы', steps: ['idea', 'hypothesis'], builtin: true},
  {id: 'sprint-lite', name: 'Sprint-lite: от пути пользователя', description: 'Карта пути → барьеры становятся проблемами → идея', steps: ['journey', 'problem', 'idea'], builtin: true},
  {id: 'classic-premortem', name: 'Классика + pre-mortem', description: 'Проблема → идея → «почему мы провалились»', steps: ['problem', 'idea', 'premortem'], builtin: true},
  {id: 'concept-check', name: 'Проверка концепции', description: 'Концепция уже выбрана — найти, что может её погубить', steps: ['premortem'], builtin: true},
  {id: 'trends', name: 'От трендов', description: 'Тренд → проблема → идея', steps: ['trend', 'problem', 'idea'], builtin: true},
  {id: 'problem-only', name: 'Только проблема', description: 'Один этап — выбрать проблему', steps: ['problem'], builtin: true}
]

export function builtinTemplate(id: string): StageTemplate | undefined {
  return BUILTIN_TEMPLATES.find(t => t.id === id)
}

// ——— Значения полей ———

export function isEmpty(v: FieldValue | undefined): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

export function isVisible(f: FieldDef, values: Record<string, FieldValue>): boolean {
  if (!f.showIf) return true
  const v = values[f.showIf.field]
  if (f.showIf.equals !== undefined) return Array.isArray(v) ? v.includes(f.showIf.equals) : String(v ?? '') === f.showIf.equals
  if (f.showIf.notEmpty) return !isEmpty(v)
  return true
}

export function formatValue(f: FieldDef | undefined, v: FieldValue | undefined): string {
  if (isEmpty(v)) return ''
  if (!f) return Array.isArray(v) ? v.join(', ') : String(v)
  switch (f.type) {
    case 'checkbox': return v ? 'да' : 'нет'
    case 'percent': return `${v}%`
    case 'multiselect': return (v as string[]).join(', ')
    case 'date': {
      const d = new Date(String(v))
      return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('ru-RU')
    }
    case 'scale': return `${v} из 5`
    default: return String(v)
  }
}

export function asText(v: FieldValue | undefined): string {
  if (isEmpty(v)) return ''
  return Array.isArray(v) ? v.join(', ') : String(v)
}

// Очистка и проверка одного значения. Возвращает [значение, ошибка]
export function cleanValue(f: FieldDef, raw: unknown): [FieldValue, string | null] {
  if (raw === undefined || raw === null || raw === '') return [null, null]
  switch (f.type) {
    case 'text':
    case 'longtext':
      return [String(raw).slice(0, f.type === 'text' ? SHORT : LONG), null]
    case 'number':
    case 'percent': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'))
      if (!Number.isFinite(n)) return [null, `«${f.label}»: нужно число`]
      const min = f.type === 'percent' ? Math.max(f.min ?? 0, -1000) : f.min
      const max = f.type === 'percent' ? Math.min(f.max ?? 1000, 1000) : f.max
      if (min !== undefined && n < min) return [n, `«${f.label}»: не меньше ${min}`]
      if (max !== undefined && n > max) return [n, `«${f.label}»: не больше ${max}`]
      return [n, null]
    }
    case 'select':
      return f.options?.includes(String(raw)) ? [String(raw), null] : [null, `«${f.label}»: выберите вариант из списка`]
    case 'multiselect': {
      const arr = Array.isArray(raw) ? raw.map(String) : []
      const bad = arr.filter(x => !f.options?.includes(x))
      if (bad.length) return [null, `«${f.label}»: неизвестный вариант`]
      return [[...new Set(arr)], null]
    }
    case 'checkbox':
      return [raw === true || raw === 'true', null]
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? [String(raw), null] : [null, `«${f.label}»: неверная дата`]
    case 'scale': {
      const n = Number(raw)
      return [1, 2, 3, 4, 5].includes(n) ? [n, null] : [null, `«${f.label}»: оценка от 1 до 5`]
    }
    case 'link': {
      const s = String(raw).trim().slice(0, 500)
      return /^https?:\/\/\S+$/i.test(s) ? [s, null] : [s, `«${f.label}»: ссылка должна начинаться с http:// или https://`]
    }
    case 'cardref':
      return [String(raw).slice(0, 40), null]
  }
}

// Проверка всей карточки: очищенные значения и список ошибок (пустой — можно отправлять)
export function validateCard(t: StageTemplate, raw: Record<string, unknown>): {values: Record<string, FieldValue>; errors: string[]} {
  const values: Record<string, FieldValue> = {}
  const errors: string[] = []
  for (const f of t.fields) {
    values[f.key] = cleanValue(f, raw[f.key])[0]
  }
  for (const f of t.fields) {
    if (!isVisible(f, values)) { values[f.key] = null; continue }
    const [, err] = cleanValue(f, raw[f.key])
    if (err) errors.push(err)
    else if (f.required && isEmpty(values[f.key]) && f.type !== 'checkbox') errors.push(`Заполните «${f.label}»`)
  }
  return {values, errors}
}

export function cardTitle(t: StageTemplate, fields: Record<string, FieldValue>): string {
  return asText(fields[t.titleField]) || asText(fields[t.fields[0]?.key]) || 'Без названия'
}

export function cardSubtitle(t: StageTemplate, fields: Record<string, FieldValue>): string {
  return t.subtitleFields.map(k => formatValue(t.fields.find(f => f.key === k), fields[k])).filter(Boolean).join(' · ')
}

// Подстановка значений из выбранной карточки предыдущего этапа
export function prefillValues(t: StageTemplate, source?: Record<string, FieldValue>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {}
  if (!source) return out
  for (const f of t.fields) if (f.prefill && !isEmpty(source[f.prefill])) out[f.key] = source[f.prefill]
  return out
}

// ——— Подсказки-проверки (без ИИ) ———

const SOLUTION_WORDS = /(приложени|сервис|платформ|сайт|бот\b|создать|сделать|разработать|внедрить)/i
const VAGUE_WHO = /^(люди|все|студенты|человек|пользователи|молодёжь|молодежь)$/i

export function lintCard(t: StageTemplate, fields: Record<string, FieldValue>): string[] {
  const hints: string[] = []
  for (const r of t.lint) {
    if (r.rule === 'solution-words') {
      if (SOLUTION_WORDS.test(r.fields.map(k => asText(fields[k])).join(' '))) hints.push('Похоже на решение. Какая проблема за ним стоит?')
    } else if (r.rule === 'vague-who') {
      const who = asText(fields[r.field]).trim()
      if (who && VAGUE_WHO.test(who)) hints.push('Уточните, какие именно люди')
    } else if (r.rule === 'min-length') {
      const s = asText(fields[r.field]).trim()
      if (s && s.length < r.n) hints.push(r.text)
    }
  }
  return hints
}

// ——— Проверки самого шаблона (в редакторе) ———

export function lintTemplate(t: StageTemplate): {errors: string[]; hints: string[]} {
  const errors: string[] = [], hints: string[] = []
  if (!t.name.trim()) errors.push('Дайте шаблону название')
  if (!t.fields.length) errors.push('Добавьте хотя бы одно поле')
  const keys = new Set<string>()
  for (const f of t.fields) {
    if (!f.label.trim()) errors.push('У каждого поля должно быть название')
    if (keys.has(f.key)) errors.push(`Повторяется ключ поля «${f.key}»`)
    keys.add(f.key)
    if ((f.type === 'select' || f.type === 'multiselect') && (f.options?.filter(Boolean).length ?? 0) < 2) errors.push(`«${f.label || 'поле'}»: нужно минимум 2 варианта`)
    if (f.showIf && !t.fields.some(x => x.key === f.showIf!.field && x !== f)) errors.push(`«${f.label}»: условие ссылается на удалённое поле`)
  }
  const title = t.fields.find(f => f.key === t.titleField)
  if (!title) errors.push('Выберите, какое поле — заголовок карточки')
  else if (!['text', 'longtext'].includes(title.type)) hints.push('Заголовком лучше сделать текстовое поле')
  const required = t.fields.filter(f => f.required).length
  if (required > 6) hints.push(`Обязательных полей ${required}: на телефоне это несколько экранов. Оставьте до 5`)
  if (t.fields.length > 9) hints.push('Полей много — участники устанут. Уберите второстепенные')
  return {errors, hints}
}

export function blankTemplate(id: string): StageTemplate {
  return {
    id, name: '', emoji: '📝', kind: 'other', askBasis: true,
    fields: [{key: 'f1', label: 'Название', hint: '', type: 'text', required: true}],
    titleField: 'f1', subtitleFields: [], lint: [], defaultCriteria: ['user-value', 'feasibility'], updatedAt: Date.now()
  }
}
