// «⚔️ Атакуем лидера»: ведущий запускает и подводит итог, участники пишут возражения и отмечают сильные.
import {useState} from 'preact/hooks'
import type {Action, PublicView} from '../core/engine'
import {uid} from '../core/engine'
import {ATTACK_LIMIT, ATTACK_PROMPTS} from '../core/attack'
import {cardTitle} from '../core/template'
import {lsGet, lsSet} from '../store/db'
import {Avatar, ErrorLine} from './common'
import {toast} from './toast'

type Host = (a: Action) => string | null
type Send = (a: Action) => Promise<string | null>

const title = (view: PublicView, id: string) => {
  const c = view.cards.find(x => x.id === id)
  return c ? cardTitle(view.template, c.fields) : '?'
}

// ——— Ведущий ———

export function AttackHost({view, host, onSingle}: {view: PublicView; host: Host; onSingle?: (pid: string) => void}) {
  const a = view.attack
  const people = view.participants.filter(p => p.active)
  const run = (x: Action, ok?: string) => { const r = host(x); if (r) toast(r, 'error'); else if (ok) toast(ok) }
  if (!a) return null
  const step = a.step === 'write' ? 'Тихо пишем возражения' : a.step === 'vote' ? 'Отмечаем, что реально влияет' : 'Итог'
  return (
    <div class="card stack attack no-print">
      <div class="row between">
        <span><b>⚔️ Атакуем лидера:</b> «{title(view, a.targetId)}»</span>
        <span class="chip">{step}</span>
      </div>
      {a.step !== 'done' && (
        <div class="pulse-people">
          {people.map(p => {
            const done = a.step === 'write' ? (a.written[p.id] ?? 0) > 0 : a.marked.includes(p.id)
            return (
              <button key={p.id} class={`pulse-person vote-person ${done ? 'done' : 'working'}`} title={p.name} disabled={!onSingle} onClick={() => onSingle?.(p.id)}>
                <Avatar name={p.name} size={30} dim={!done} />
                <span class="pulse-mark">{a.step === 'write' ? a.written[p.id] ?? 0 : done ? '✓' : '…'}</span>
                {onSingle && <span class="tiny">{p.name}</span>}
              </button>
            )
          })}
        </div>
      )}
      {a.step === 'write' && (
        <>
          <div class="tiny muted">Каждый пишет до {ATTACK_LIMIT} возражений, не видя чужих. Это не pre-mortem: проверяем конкретный вариант до решения.</div>
          <div class="row"><button class="primary small" onClick={() => run({type: 'attack.reveal'})}>Раскрыть возражения</button><button class="ghost small" onClick={() => run({type: 'attack.cancel'})}>Отменить</button></div>
        </>
      )}
      {a.step === 'vote' && (
        <>
          {a.objections.map(o => <div class="note small" key={o.id}>✋ {o.text}</div>)}
          <div class="tiny muted">Каждый отмечает, какие возражения реально влияют на выбор. Отметки скрыты до итога.</div>
          <div class="row"><button class="primary small" disabled={!a.marked.length} onClick={() => run({type: 'attack.finish'})}>Подвести итог</button></div>
        </>
      )}
      {a.step === 'done' && a.results && (
        <>
          {a.results.map(r => (
            <div class={`objection ${r.strong ? 'strong' : ''}`} key={r.id}>
              <span class="small">{r.strong ? '🔥' : '·'} {r.text}</span>
              <span class="row" style={{gap: 4}}>
                <span class="chip">{r.votes}</span>
                <button class="small ghost" title="Сделать предположением для проверки"
                  onClick={() => run({type: 'assumption.add', id: uid(), text: `Это возражение не подтвердится: ${r.text}`, category: 'viability', linkedCardId: a.targetId, linkedTitle: `${view.template.emoji} ${title(view, a.targetId)}`}, 'Добавлено в «🎯 Предположения»')}>🎯</button>
              </span>
            </div>
          ))}
          <div class="tiny muted">🔥 — отметила хотя бы половина команды. Учтите их в решении или превратите в предположения для проверки.</div>
          <div class="row"><button class="ghost small" onClick={() => run({type: 'attack.cancel'})}>Закрыть атаку</button></div>
        </>
      )}
    </div>
  )
}

// ——— Участник ———

export function AttackPhone({view, pid, send}: {view: PublicView; pid: string; send: Send}) {
  const a = view.attack
  const key = `pi:attack:${view.stageId}:${a?.targetId}:${pid}`
  const [mine, setMine] = useState<{id: string; text: string}[]>(() => lsGet(key, []))
  const [text, setText] = useState('')
  const [marks, setMarks] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  if (!a) return null
  const head = <b>⚔️ Атакуем лидера: «{title(view, a.targetId)}»</b>
  if (a.step === 'write') {
    const add = async () => {
      const id = uid()
      const r = await send({type: 'attack.add', id, text})
      setErr(r)
      if (!r) { const next = [...mine, {id, text: text.trim()}]; setMine(next); lsSet(key, next); setText('') }
    }
    const remove = async (id: string) => {
      const r = await send({type: 'attack.remove', id})
      if (!r) { const next = mine.filter(x => x.id !== id); setMine(next); lsSet(key, next) }
    }
    return (
      <div class="card stack attack">
        {head}
        <div class="tiny muted">Молча, не советуясь: что может не сработать? Подсказки:</div>
        <ul class="tiny muted" style={{margin: 0, paddingLeft: 18}}>{ATTACK_PROMPTS.map(p => <li key={p}>{p}</li>)}</ul>
        {mine.map(o => <div class="row between note small" key={o.id}><span>✋ {o.text}</span><button class="ghost small" aria-label="Удалить" onClick={() => remove(o.id)}>✕</button></div>)}
        {mine.length < ATTACK_LIMIT && (
          <>
            <textarea rows={2} maxLength={300} value={text} placeholder="Ваше возражение (анонимно)" onInput={e => setText((e.target as HTMLTextAreaElement).value)} />
            <div><button class="primary small" disabled={!text.trim()} onClick={add}>Добавить возражение</button></div>
          </>
        )}
        <ErrorLine msg={err} />
      </div>
    )
  }
  if (a.step === 'vote') {
    const done = a.marked.includes(pid)
    return (
      <div class="card stack attack">
        {head}
        <div class="small">Какие возражения <b>реально влияют</b> на выбор? Отметьте любые — или ни одного.</div>
        {a.objections.map(o => (
          <label class="check" key={o.id}>
            <input type="checkbox" checked={marks.includes(o.id)} onChange={() => setMarks(m => (m.includes(o.id) ? m.filter(x => x !== o.id) : [...m, o.id]))} />
            <span class="small">{o.text}</span>
          </label>
        ))}
        <div class="row">
          <button class="primary small" onClick={async () => { const r = await send({type: 'attack.mark', ids: marks}); setErr(r); if (!r) toast('Отметки приняты — итог откроется у всех разом') }}>{done ? 'Изменить отметки' : 'Отправить'}</button>
          {done && <span class="chip ok">✓ отправлено</span>}
        </div>
        <ErrorLine msg={err} />
      </div>
    )
  }
  return (
    <div class="card stack attack">
      {head}
      {a.results?.map(r => <div class={`objection ${r.strong ? 'strong' : ''}`} key={r.id}><span class="small">{r.strong ? '🔥' : '·'} {r.text}</span><span class="chip">{r.votes}</span></div>)}
    </div>
  )
}
