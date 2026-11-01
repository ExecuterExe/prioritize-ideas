// Быстрые действия ведущего прямо на карточке: уточнить, история, закрепить, дублировать, взять дальше.
import {useRef, useState} from 'preact/hooks'
import {createPortal} from 'preact/compat'
import type {Action, PublicCard, PublicView} from '../core/engine'
import {uid} from '../core/engine'
import {cardTitle, validateCard, type FieldValue} from '../core/template'
import {CardForm} from './cardform'
import {ErrorLine} from './common'
import {FieldDiff} from './evolve'
import {toast} from './toast'

type Host = (a: Action) => string | null

export function CardMarks({view, card, onHistory}: {view: PublicView; card: PublicCard; onHistory?: () => void}) {
  const pinned = view.pinned.includes(card.id)
  const carry = view.carry.includes(card.id)
  const edits = card.history?.length ?? 0
  const branch = view.branches?.find(b => b.id === card.branchId)
  if (!pinned && !carry && !edits && !branch) return null
  return (
    <div class="row" style={{gap: 4}}>
      {branch && <span class="chip" title={branch.title}><span class="branch-tag">{branch.id}</span> {branch.title.slice(0, 24)}</span>}
      {pinned && <span class="chip accent" title="Точно идёт в оценку">📌 закреплено</span>}
      {carry && <span class="chip ok" title="Можно взять исходной в следующем этапе">↗ в следующий этап</span>}
      {edits > 0 && <button class="chip chip-btn" onClick={onHistory} title="Посмотреть прошлые формулировки">✏️ изменено · было так</button>}
    </div>
  )
}

export function CardMenu({view, card, host, onHistory, onEdit}: {view: PublicView; card: PublicCard; host: Host; onHistory: () => void; onEdit: () => void}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const close = () => ref.current?.removeAttribute('open')
  const pinned = view.pinned.includes(card.id)
  const carry = view.carry.includes(card.id)
  const run = (a: Action, ok: string) => { close(); const r = host(a); if (r) toast(r, 'error'); else toast(ok) }
  return (
    <details class="menu card-menu" ref={ref}>
      <summary aria-label="Действия с карточкой" title="Действия с карточкой">⋯</summary>
      <div class="menu-panel">
        <button class="ghost small" onClick={() => { close(); onEdit() }}>✏️ Уточнить формулировку</button>
        {(card.history?.length ?? 0) > 0 && <button class="ghost small" onClick={() => { close(); onHistory() }}>🕘 История ({card.history!.length})</button>}
        <button class="ghost small" onClick={() => run({type: 'card.pin', id: card.id, on: !pinned}, pinned ? 'Откреплено' : 'Закреплено: точно пойдёт в оценку')}>{pinned ? '📌 Открепить' : '📌 Закрепить — точно в оценку'}</button>
        {view.phase === 'merge' && <button class="ghost small" onClick={() => run({type: 'card.duplicate', id: card.id, newId: uid()}, 'Копия добавлена рядом — уточните её')}>⧉ Дублировать как вариант</button>}
        <button class="ghost small" onClick={() => run({type: 'card.carry', id: card.id, on: !carry}, carry ? 'Убрано из следующего этапа' : 'Можно будет взять исходной в следующем этапе')}>{carry ? '↗ Не брать в следующий этап' : '↗ Взять в следующий этап'}</button>
      </div>
    </details>
  )
}

function Sheet({title, onClose, children}: {title: string; onClose: () => void; children: preact.ComponentChildren}) {
  return createPortal(
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet wide" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div class="row between"><h2 style={{margin: 0}}>{title}</h2><button class="ghost icon-btn" aria-label="Закрыть" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>,
    document.body
  )
}

export function EditCardSheet({view, card, host, onClose}: {view: PublicView; card: PublicCard; host: Host; onClose: () => void}) {
  const [values, setValues] = useState<Record<string, FieldValue>>(() => structuredClone(card.fields))
  const [err, setErr] = useState<string | null>(null)
  const save = () => {
    const {errors} = validateCard(view.template, values)
    if (errors.length) { setErr(errors[0]); return }
    const r = host({type: 'card.edit', id: card.id, fields: values})
    if (r) { setErr(r); return }
    toast('Формулировка обновлена — прошлая сохранена в истории')
    onClose()
  }
  return (
    <Sheet title="Уточнить формулировку" onClose={onClose}>
      <div class="tiny muted">Правки после обсуждения. Прошлый вариант сохранится — его можно вернуть.</div>
      <CardForm tpl={view.template} values={values} refOptions={view.refOptions} onChange={(k, v) => setValues(prev => ({...prev, [k]: v}))} />
      <ErrorLine msg={err} />
      <div class="row"><button class="primary" onClick={save}>Сохранить</button><button class="ghost" onClick={onClose}>Отмена</button></div>
    </Sheet>
  )
}

export function HistorySheet({view, card, host, onClose}: {view: PublicView; card: PublicCard; host: Host; onClose: () => void}) {
  const versions = [...(card.history ?? [])].reverse()
  return (
    <Sheet title={`История: ${cardTitle(view.template, card.fields)}`} onClose={onClose}>
      {versions.length === 0 && <div class="muted">Правок пока не было.</div>}
      {versions.map(v => (
        <div class="card stack" key={v.at}>
          <div class="row between">
            <span class="tiny muted">{new Date(v.at).toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'})} · было → сейчас</span>
            <button class="small" onClick={() => { const r = host({type: 'card.restore', id: card.id, at: v.at}); if (r) toast(r, 'error'); else { toast('Вернули прошлую формулировку'); onClose() } }}>↩ Вернуть эту</button>
          </div>
          <FieldDiff tpl={view.template} before={v.fields} after={card.fields} />
        </div>
      ))}
    </Sheet>
  )
}
