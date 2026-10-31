// «Кто что делает»: задачи к следующему занятию — эксперименты, меры против рисков и свои.
import type {Assumption, Experiment} from './assume'

export interface Task {
  id: string
  title: string
  ownerId?: string
  deadline?: string // YYYY-MM-DD
  done: boolean
  source?: 'risk' | 'manual'
  authorId: string
  createdAt: number
}

export interface PlanItem {
  key: string
  kind: 'experiment' | 'task'
  title: string
  ownerId?: string
  deadline?: string
  done: boolean
  overdue: boolean
  refId: string
}

// Перегрузка: больше стольких открытых задач на человека
export const OVERLOAD = 3

export function todayISO(now = new Date()): string {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 10)
}

// Единый список: эксперименты (готово — когда есть вывод) и обычные задачи
export function planItems(tasks: Task[], experiments: Experiment[], assumptions: Assumption[], today = todayISO()): PlanItem[] {
  const exp: PlanItem[] = experiments.map(e => {
    const a = assumptions.find(x => x.id === e.assumptionId)
    const done = !!e.verdict
    return {
      key: `e:${e.id}`, kind: 'experiment', refId: e.id, title: `🔬 Проверить: ${a?.text ?? 'предположение'}`,
      ownerId: e.ownerId, deadline: e.deadline, done, overdue: !done && !!e.deadline && e.deadline < today
    }
  })
  const own: PlanItem[] = tasks.map(t => ({
    key: `t:${t.id}`, kind: 'task', refId: t.id, title: `${t.source === 'risk' ? '🧯 ' : ''}${t.title}`,
    ownerId: t.ownerId, deadline: t.deadline, done: t.done, overdue: !t.done && !!t.deadline && t.deadline < today
  }))
  return [...exp, ...own].sort((a, b) => Number(a.done) - Number(b.done) || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
}

export interface PersonPlan {
  ownerId: string | null
  items: PlanItem[]
  open: number
  overloaded: boolean
}

export function planByPerson(items: PlanItem[], people: {id: string}[]): PersonPlan[] {
  const ids = [...people.map(p => p.id), null]
  return ids.map(ownerId => {
    const mine = items.filter(i => (i.ownerId ?? null) === ownerId || (ownerId === null && i.ownerId && !people.some(p => p.id === i.ownerId)))
    const open = mine.filter(i => !i.done).length
    return {ownerId, items: mine, open, overloaded: ownerId !== null && open > OVERLOAD}
  }).filter(p => p.items.length || p.ownerId !== null)
}

// Текст для чата команды: по людям, со сроками; выполненное не показываем
export function planText(plan: PersonPlan[], nameOf: (id: string) => string, title: string): string {
  const L = [`📋 ${title} — кто что делает`, '']
  for (const p of plan) {
    const open = p.items.filter(i => !i.done)
    if (!open.length) continue
    L.push(`${p.ownerId ? nameOf(p.ownerId) : 'Без ответственного'}:`)
    for (const i of open) {
      const d = i.deadline ? ` — до ${i.deadline.split('-').reverse().slice(0, 2).join('.')}${i.overdue ? ' ⏰ просрочено' : ''}` : ''
      L.push(`• ${i.title}${d}`)
    }
    L.push('')
  }
  if (L.length === 2) L.push('Открытых задач нет 🎉')
  return L.join('\n').trim()
}
