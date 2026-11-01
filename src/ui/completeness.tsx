// Карточка «Полнота решения»: чек-лист перед итогами, «Пересмотрим, если…», слепые зоны.
import {useState} from 'preact/hooks'
import type {Action, PublicView} from '../core/engine'
import {uid} from '../core/engine'
import {blindSpots, checkState, checklistFor, chosenIds, type CheckItem} from '../core/completeness'
import {cardTitle} from '../core/template'
import {toast} from './toast'

type Host = (a: Action) => string | null

function CheckRow({view, item, host}: {view: PublicView; item: CheckItem; host: Host}) {
  const st = checkState(view, item)
  const [text, setText] = useState(st.text ?? '')
  const [open, setOpen] = useState(st.status === 'open')
  const run = (a: Action) => { const r = host(a); if (r) toast(r, 'error'); return r }
  const chip = st.status === 'done' ? <span class="chip ok">✓ {st.auto ? 'есть' : 'зафиксировано'}</span>
    : st.status === 'unknown' ? <span class="chip warn">🤷 пока не знаем</span>
      : <span class="chip bad">не закрыто</span>
  return (
    <div class="check-row stack">
      <div class="row between">
        <span><b>{item.label}</b> <span class="tiny muted">— {item.hint}</span></span>
        <span class="row" style={{gap: 4}}>{chip}{!open && <button class="small ghost" onClick={() => setOpen(true)}>Изменить</button>}</span>
      </div>
      {!open && st.text && <div class="small muted">{st.text}</div>}
      {open && (
        <>
          <textarea rows={2} maxLength={400} value={text} placeholder={item.hint} onInput={e => setText((e.target as HTMLTextAreaElement).value)} />
          <div class="row">
            <button class="small primary" disabled={!text.trim()} onClick={() => { if (!run({type: 'check.set', key: item.key, status: 'done', text})) setOpen(false) }}>✓ Зафиксировать</button>
            <button class="small" onClick={() => { if (!run({type: 'check.set', key: item.key, status: 'unknown', text})) setOpen(false) }}>🤷 Пока не знаем — осознанно</button>
            {view.checks[item.key] && <button class="small ghost" onClick={() => run({type: 'check.set', key: item.key, status: null})}>Сбросить</button>}
          </div>
        </>
      )}
    </div>
  )
}

export function CompletenessCard({view, host}: {view: PublicView; host: Host}) {
  const items = checklistFor(view.template.kind)
  const chosen = chosenIds(view)
  const [revisit, setRevisit] = useState(view.revisit ?? '')
  if (!items.length) return null
  if (!chosen.length) return <div class="card tiny muted">🧾 Когда отметите выбранное, здесь появится проверка полноты решения.</div>
  const states = items.map(i => checkState(view, i))
  const closed = states.filter(s => s.status !== 'open').length
  const spots = blindSpots(view)
  const leader = view.cards.find(c => c.id === chosen[0])
  const leaderTitle = leader ? cardTitle(view.template, leader.fields) : ''
  const toAssumption = () => {
    if (!revisit.trim() || !leader) return
    host({type: 'revisit.set', text: revisit})
    const r = host({type: 'assumption.add', id: uid(), text: `Выбор «${leaderTitle}» верен — пересмотрим, если ${revisit.trim()}`, category: 'desirability', linkedCardId: leader.id, linkedTitle: `${view.template.emoji} ${leaderTitle}`})
    if (r) toast(r, 'error'); else toast('Добавлено в «🎯 Предположения» — оформите там эксперимент с порогом')
  }
  return (
    <div class="card stack completeness">
      <div class="row between">
        <h3 style={{margin: 0}}>🧾 Полнота решения</h3>
        <span class={`chip ${closed === items.length ? 'ok' : 'warn'}`}>закрыто {closed} из {items.length}</span>
      </div>
      <div class="tiny muted">Не оценка идеи, а то, что понадобится на защите. Можно заполнить или честно отметить «пока не знаем».</div>
      {items.map(i => <CheckRow key={i.key} view={view} item={i} host={host} />)}
      <div class="stack" style={{gap: 6}}>
        <b>🔁 Пересмотрим, если…</b>
        <div class="tiny muted">Условие, при котором вернёмся к другому варианту. Так решение становится проверяемой гипотезой.</div>
        <input type="text" maxLength={300} value={revisit} placeholder="например: меньше 3 из 10 опрошенных подтвердят проблему"
          onInput={e => setRevisit((e.target as HTMLInputElement).value)}
          onBlur={() => { if (revisit.trim() !== (view.revisit ?? '')) host({type: 'revisit.set', text: revisit}) }} />
        <div><button class="small" disabled={!revisit.trim()} onClick={toAssumption}>🎯 Сделать предположением для проверки</button></div>
      </div>
      {spots.length > 0 && (
        <div class="stack blind-spots" style={{gap: 4}}>
          <b>🔦 Слепые зоны</b>
          {spots.map(t => <div class="small" key={t}>• {t}</div>)}
          <div class="tiny muted">Подсказка, а не запрет: иногда это осознанный выбор.</div>
        </div>
      )}
    </div>
  )
}

// Для отчёта
export function completenessMarkdown(view: PublicView): string[] {
  const items = checklistFor(view.template.kind)
  if (!items.length || !chosenIds(view).length) return []
  const L = ['## Полнота решения', '']
  for (const i of items) {
    const st = checkState(view, i)
    const mark = st.status === 'done' ? '✅' : st.status === 'unknown' ? '🤷 пока не знаем' : '⬜ не закрыто'
    L.push(`- **${i.label}:** ${mark}${st.text ? ` — ${st.text}` : ''}`)
  }
  if (view.revisit) L.push(`- **Пересмотрим, если:** ${view.revisit}`)
  const spots = blindSpots(view)
  if (spots.length) L.push('', '**Слепые зоны:**', ...spots.map(t => `- ${t}`))
  L.push('')
  return L
}
