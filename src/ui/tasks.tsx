// «Кто что делает»: задачи к следующему занятию по людям, с экспортом в чат команды.
import {useState} from 'preact/hooks'
import type {Action, PublicView} from '../core/engine'
import {OVERLOAD, planByPerson, planItems, planText, type PlanItem} from '../core/tasks'
import {lsGet, lsSet} from '../store/db'
import {Avatar, ErrorLine, PhaseIntro} from './common'
import {toast} from './toast'

type Send = (a: Action) => Promise<string | null>
const newId = () => Math.random().toString(36).slice(2, 12)

function useOwn(key: string): [Set<string>, (id: string) => void] {
  const [ids, setIds] = useState<string[]>(() => lsGet<string[]>(key, []))
  return [new Set(ids), (id: string) => setIds(prev => { const next = [...prev, id]; lsSet(key, next); return next })]
}

export function buildPlan(view: PublicView) {
  const people = view.participants.filter(p => p.active)
  const items = planItems(view.tasks, view.experiments, view.assumptions)
  return {people, items, plan: planByPerson(items, people)}
}

export function planForChat(view: PublicView, title: string): string {
  const {plan} = buildPlan(view)
  return planText(plan, id => view.participants.find(p => p.id === id)?.name ?? 'участник', title)
}

export function TasksPanel({view, send, pid, isHost, title}: {view: PublicView; send: Send; pid: string; isHost: boolean; title: string}) {
  const [own, addOwn] = useOwn(`pi:owntasks:${view.projectId}:${pid}`)
  const {people, items, plan} = buildPlan(view)
  const open = items.filter(i => !i.done)
  const overdue = open.filter(i => i.overdue)
  const overloaded = plan.filter(p => p.overloaded)
  const name = (id: string) => view.participants.find(p => p.id === id)?.name ?? 'участник'
  const canEdit = (i: PlanItem) => i.kind === 'task' && (isHost || own.has(i.refId))
  const canTick = (i: PlanItem) => i.kind === 'task' && (canEdit(i) || i.ownerId === pid)
  const run = async (a: Action) => { const r = await send(a); if (r) toast(r, 'error'); return r }
  const copy = async () => {
    try { await navigator.clipboard.writeText(planForChat(view, title)); toast('Список скопирован — вставьте в чат команды') } catch { toast('Не удалось скопировать', 'error') }
  }
  return (
    <div class="stack">
      <PhaseIntro emoji="📋" title="Кто что делает">Задачи к следующему занятию: эксперименты, меры против рисков и свои. Скопируйте список в чат — он доживёт до следующей пары.</PhaseIntro>
      <div class="card row between">
        <div class="row" style={{gap: 6}}>
          <span class="chip accent">Открыто: {open.length}</span>
          {overdue.length > 0 && <span class="chip bad">⏰ Просрочено: {overdue.length}</span>}
          {overloaded.length > 0 && <span class="chip warn">⚠️ Перегружены: {overloaded.map(p => name(p.ownerId!)).join(', ')}</span>}
        </div>
        <button class="small primary" onClick={copy}>📤 Скопировать для чата</button>
      </div>

      <AddTask view={view} onAdd={async (t, o, d) => {
        const id = newId()
        const r = await run({type: 'task.add', id, title: t, ownerId: o || undefined, deadline: d || undefined, source: 'manual'})
        if (!r) { addOwn(id); toast('Задача добавлена') }
        return r
      }} />

      {plan.map(p => (
        <div class={`card stack person ${p.overloaded ? 'overloaded' : ''}`} key={p.ownerId ?? 'none'}>
          <div class="row between">
            <div class="row" style={{gap: 10}}>
              {p.ownerId ? <Avatar name={name(p.ownerId)} size={34} /> : <span class="avatar-none">?</span>}
              <b>{p.ownerId ? name(p.ownerId) : 'Без ответственного'}</b>
            </div>
            <div class="row" style={{gap: 4}}>
              <span class="chip">{p.open} {p.open === 1 ? 'задача' : p.open >= 2 && p.open <= 4 ? 'задачи' : 'задач'}</span>
              {p.overloaded && <span class="chip warn" title={`Больше ${OVERLOAD} открытых задач`}>⚠️ перегружен</span>}
            </div>
          </div>
          {p.items.length === 0 && <div class="tiny muted">Пока ничего — можно взять задачу из «Без ответственного».</div>}
          {p.items.map(i => (
            <div class={`row task-row ${i.done ? 'done' : ''}`} key={i.key} style={{flexWrap: 'nowrap', alignItems: 'flex-start'}}>
              {i.kind === 'task'
                ? <input type="checkbox" class="task-check" checked={i.done} disabled={!canTick(i)} aria-label="Выполнено"
                    onChange={e => run({type: 'task.update', id: i.refId, patch: {done: (e.target as HTMLInputElement).checked}})} />
                : <span class="task-check exp" title="Эксперимент закрывается результатом во вкладке «Предположения»">{i.done ? '✅' : '🔬'}</span>}
              <div style={{flex: 1, minWidth: 0}}>
                <div class="small" style={{fontWeight: 600}}>{i.title}</div>
                <div class="row" style={{gap: 4, marginTop: 2}}>
                  {i.deadline && <span class={`chip ${i.overdue ? 'bad' : ''}`}>{i.overdue ? '⏰ ' : '📅 '}{new Date(i.deadline).toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'})}</span>}
                  {i.kind === 'experiment' && !i.done && <span class="tiny muted">результат — во вкладке «Предположения»</span>}
                </div>
              </div>
              {canEdit(i) && (
                <span class="row" style={{gap: 2, flexWrap: 'nowrap'}}>
                  <select class="small-select" value={i.ownerId ?? ''} title="Ответственный" onChange={e => run({type: 'task.update', id: i.refId, patch: {ownerId: (e.target as HTMLSelectElement).value || undefined}})}>
                    <option value="">— кто? —</option>
                    {people.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <button class="ghost icon-btn small danger" aria-label="Удалить задачу" onClick={() => run({type: 'task.delete', id: i.refId})}>✕</button>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function AddTask({view, onAdd}: {view: PublicView; onAdd: (title: string, owner: string, deadline: string) => Promise<string | null>}) {
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('')
  const [deadline, setDeadline] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <form class="card stack" onSubmit={async e => {
      e.preventDefault()
      if (!title.trim()) return
      const r = await onAdd(title, owner, deadline)
      setErr(r)
      if (!r) { setTitle(''); setDeadline('') }
    }}>
      <input type="text" value={title} maxLength={200} placeholder="Новая задача: например, сделать макет главного экрана" onInput={e => setTitle((e.target as HTMLInputElement).value)} />
      <div class="row">
        <select style={{flex: 1, minWidth: 140}} value={owner} onChange={e => setOwner((e.target as HTMLSelectElement).value)}>
          <option value="">— кто сделает? —</option>
          {view.participants.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" style={{width: 'auto'}} value={deadline} onInput={e => setDeadline((e.target as HTMLInputElement).value)} aria-label="Срок" />
        <button class="primary small" disabled={!title.trim()}>+ Задача</button>
      </div>
      <ErrorLine msg={err} />
    </form>
  )
}
