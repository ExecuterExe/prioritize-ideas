// Паспорт задания: единая точка отсчёта для команды и проверка соответствия результата.

export interface Passport {
  sourceText?: string      // текст задания от преподавателя целиком
  result: string           // что нужно получить
  task: string             // какую задачу решаем
  audience: string         // для кого
  constraints: string[]    // ограничения
  mustHave: string[]       // обязательно в результате
  forbidden: string[]      // нельзя или нежелательно
  teacherCriteria: string[] // как оценит преподаватель
}

export type ComplianceValue = 'ok' | 'partly' | 'fail'

// Ключ пункта проверки: must:<n> или forbid:<n>
export type ComplianceItem = `must:${number}` | `forbid:${number}`

export const EMPTY_PASSPORT: Passport = {result: '', task: '', audience: '', constraints: [], mustHave: [], forbidden: [], teacherCriteria: []}

export function passportFilled(p?: Passport): boolean {
  if (!p) return false
  return !!(p.result || p.task || p.audience || p.constraints.length || p.mustHave.length || p.forbidden.length || p.teacherCriteria.length)
}

export function complianceItems(p?: Passport): {key: ComplianceItem; text: string; kind: 'must' | 'forbid'}[] {
  if (!p) return []
  return [
    ...p.mustHave.map((text, i) => ({key: `must:${i}` as ComplianceItem, text, kind: 'must' as const})),
    ...p.forbidden.map((text, i) => ({key: `forbid:${i}` as ComplianceItem, text, kind: 'forbid' as const}))
  ]
}

// Что в выбранной карточке противоречит заданию или ещё не проверено
export function complianceIssues(p: Passport | undefined, marks: Record<string, ComplianceValue> | undefined) {
  const items = complianceItems(p)
  const fails = items.filter(i => marks?.[i.key] === 'fail')
  const partly = items.filter(i => marks?.[i.key] === 'partly')
  const unchecked = items.filter(i => !marks?.[i.key])
  return {items, fails, partly, unchecked}
}

// ——— Разбор текста задания (по ключевым словам, без ИИ) ———

type Section = 'constraints' | 'mustHave' | 'forbidden' | 'teacherCriteria' | 'result' | 'task' | 'audience'

const HEADINGS: [RegExp, Section][] = [
  [/(критери|оценива|оценк|баллы)/i, 'teacherCriteria'],
  [/(запрещ|нельзя|не допуска|нежелател|не должн)/i, 'forbidden'],
  [/(обязательн|должн[аоы]? (быть|содержать|включать)|требовани|необходимо)/i, 'mustHave'],
  [/(огранич|услови|рамк|бюджет|срок)/i, 'constraints'],
  [/(результат|на выходе|итог|сдать|продукт работы)/i, 'result'],
  [/(для кого|аудитори|пользовател|целев)/i, 'audience'],
  [/(задач|цель|задани|тема)/i, 'task']
]

const BULLET = /^\s*(?:[-–—•*·▪●]|\d+[.)]|[a-zа-я][.)])\s+/i

function clean(line: string): string {
  return line.replace(BULLET, '').replace(/\s+/g, ' ').trim().replace(/[;,.]$/, '')
}

// Строка — заголовок раздела, если она короткая, без маркера и совпадает с ключевым словом
function headingOf(line: string): Section | null {
  const t = line.trim()
  if (!t || BULLET.test(t) || t.length > 60) return null
  // Заголовок — строка с двоеточием на конце или совсем короткая («Ограничения», «Нельзя»)
  if (!/[:：]\s*$/.test(t) && t.split(/\s+/).length > 3) return null
  const body = t.replace(/[:：]\s*$/, '')
  for (const [re, sec] of HEADINGS) if (re.test(body)) return sec
  return null
}

export function parsePassport(text: string): Passport {
  const p: Passport = {...EMPTY_PASSPORT, constraints: [], mustHave: [], forbidden: [], teacherCriteria: [], sourceText: text.trim()}
  let section: Section | null = null
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    // «Заголовок: значение» в одной строке
    const inline = line.match(/^([^:]{2,40}):\s*(.+)$/)
    if (inline && !BULLET.test(line)) {
      const sec = headingOf(inline[1])
      if (sec) {
        section = sec
        addTo(p, sec, inline[2])
        continue
      }
    }
    const h = headingOf(line)
    if (h) { section = h; continue }
    if (section) addTo(p, section, line)
    else if (!p.task) p.task = clean(line)
  }
  return p
}

function addTo(p: Passport, sec: Section, value: string) {
  // Перечисление через «;» внутри строки — несколько пунктов
  const parts = value.split(/\s*;\s*/).map(clean).filter(Boolean)
  if (sec === 'result' || sec === 'task' || sec === 'audience') {
    const text = parts.join('; ')
    p[sec] = p[sec] ? `${p[sec]}; ${text}` : text
    return
  }
  for (const x of parts) if (!p[sec].includes(x)) p[sec].push(x.slice(0, 200))
}

export function passportMarkdown(p: Passport): string {
  const L: string[] = ['## Задание', '']
  if (p.task) L.push(`**Задача:** ${p.task}`)
  if (p.result) L.push(`**Нужно получить:** ${p.result}`)
  if (p.audience) L.push(`**Для кого:** ${p.audience}`)
  const list = (title: string, xs: string[]) => { if (xs.length) L.push('', `**${title}:**`, ...xs.map(x => `- ${x}`)) }
  list('Ограничения', p.constraints)
  list('Обязательно в результате', p.mustHave)
  list('Нельзя', p.forbidden)
  list('Как оценит преподаватель', p.teacherCriteria)
  return L.join('\n')
}
