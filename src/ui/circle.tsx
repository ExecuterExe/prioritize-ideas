// «🎤 Круг» и «🅿 Парковка»: интерфейс ведущего, участника и проектора.
import {useState} from 'preact/hooks'
import {createPortal} from 'preact/compat'
import type {Action, PublicView} from '../core/engine'
import {uid} from '../core/engine'
import {CIRCLE_SECONDS, PARK_LABEL, currentSpeaker, secondsLeft, turnsUntil, type ParkTarget} from '../core/circle'
import {Avatar, useNow} from './common'
import {toast} from './toast'

type Host = (a: Action) => string | null
type Send = (a: Action) => Promise<string | null>

const nameOf = (view: PublicView, id?: string) => view.participants.find(p => p.id === id)?.name ?? '—'
const clock = (s: number) => `${s < 0 ? '−' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`

export const CIRCLE_PHASES = ['merge', 'criteria', 'results', 'decide', 'board', 'summary']

// ——— Ведущий ———

export function CircleHost({view, host}: {view: PublicView; host: Host}) {
  const now = useNow(1000)
  const c = view.circle
  const [secs, setSecs] = useState(90)
  const run = (a: Action) => { const r = host(a); if (r) toast(r, 'error') }
  if (!c?.open) {
    return (
      <div class="card row between circle-start no-print">
        <span><b>🎤 Круг</b> <span class="tiny muted">каждый по очереди, у каждого своё время</span></span>
        <span class="row" style={{gap: 4}}>
          {CIRCLE_SECONDS.map(s => <button key={s} class={`small ${secs === s ? 'selected' : ''}`} onClick={() => setSecs(s)}>{s / 60 >= 1 && s % 60 === 0 ? `${s / 60} мин` : `${s} с`}</button>)}
          <button class="small primary" onClick={() => run({type: 'circle.start', seconds: secs})}>Начать круг</button>
        </span>
        {c && c.notes.length > 0 && <CircleNotes notes={c.notes} />}
      </div>
    )
  }
  const speaker = currentSpeaker(c)
  // Ноутбук ведущего — источник времени, поэтому без поправки
  const left = secondsLeft(c, now)
  const next = c.order[c.idx + 1]
  return (
    <div class="card stack circle-live no-print">
      <div class="row between">
        <span class="row" style={{gap: 10}}><Avatar name={nameOf(view, speaker)} size={40} /><span><div class="tiny muted">🎤 Говорит · {c.idx + 1} из {c.order.length}</div><b class="circle-name">{nameOf(view, speaker)}</b></span></span>
        <span class={`timer ${left < 0 ? 'over' : left <= 15 ? 'low' : ''}`}>{clock(left)}</span>
      </div>
      {next && <div class="tiny muted">Следующий: {nameOf(view, next)}</div>}
      <div class="row">
        <button class="primary small" onClick={() => run({type: 'circle.next'})}>{next ? 'Следующий →' : 'Завершить круг'}</button>
        <button class="small" onClick={() => run({type: 'circle.pass'})}>Пропускает</button>
        <button class="ghost small" onClick={() => run({type: 'circle.stop'})}>Остановить</button>
      </div>
      {c.notes.length > 0 && <CircleNotes notes={c.notes} />}
    </div>
  )
}

function CircleNotes({notes}: {notes: string[]}) {
  return (
    <div class="stack" style={{gap: 4, width: '100%'}}>
      <div class="tiny muted">Написали вместо слов:</div>
      {notes.map((t, i) => <div class="note small" key={i}>✍️ {t}</div>)}
    </div>
  )
}

// ——— Участник ———

export function CircleBanner({view, pid, send, offset = 0}: {view: PublicView; pid: string; send: Send; offset?: number}) {
  const now = useNow(1000)
  const c = view.circle
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  if (!c?.open) return null
  const until = turnsUntil(c, pid)
  const speaker = currentSpeaker(c)
  const left = secondsLeft(c, now + offset)
  const run = async (a: Action) => { const r = await send(a); if (r) toast(r, 'error'); else { setWriting(false); setText('') } }
  if (until === 0) {
    return (
      <div class="card stack circle-me">
        <div class="row between"><b>🎤 Ваша очередь</b><span class={`timer ${left < 0 ? 'over' : left <= 15 ? 'low' : ''}`}>{clock(left)}</span></div>
        <div class="small muted">Скажите, что думаете. Можно пропустить или написать вместо слов — анонимно.</div>
        {writing
          ? (
            <>
              <textarea rows={3} maxLength={400} value={text} placeholder="Ваша мысль" onInput={e => setText((e.target as HTMLTextAreaElement).value)} />
              <div class="row"><button class="primary small" disabled={!text.trim()} onClick={() => run({type: 'circle.note', text})}>Отправить</button><button class="ghost small" onClick={() => setWriting(false)}>Назад</button></div>
            </>
          )
          : <div class="row"><button class="small" onClick={() => setWriting(true)}>✍️ Написать вместо слов</button><button class="ghost small" onClick={() => run({type: 'circle.pass'})}>Пропустить</button></div>}
      </div>
    )
  }
  return (
    <div class="sync-line warn circle-wait">🎤 Говорит {nameOf(view, speaker)}{until !== undefined ? ` · вы через ${until}` : ''}</div>
  )
}

// ——— Проектор ———

export function CircleScreen({view}: {view: PublicView}) {
  const now = useNow(1000)
  const c = view.circle
  if (!c?.open) return null
  // Окно проектора открыто на том же ноутбуке — часы общие
  const left = secondsLeft(c, now)
  const next = c.order[c.idx + 1]
  return (
    <div class="screen-circle">
      <div class="screen-kicker">🎤 Круг · {c.idx + 1} из {c.order.length}</div>
      <div class="screen-big" style={{fontSize: '4rem'}}>{nameOf(view, currentSpeaker(c))}</div>
      <div class={`timer ${left < 0 ? 'over' : left <= 15 ? 'low' : ''}`} style={{fontSize: '2.4rem'}}>{clock(left)}</div>
      {next && <div class="muted">Следующий: {nameOf(view, next)}</div>}
    </div>
  )
}

// ——— Парковка ———

export function ParkButton({view, send}: {view: PublicView; send: Send}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const count = view.parking.filter(p => !p.to).length
  const add = async () => {
    const r = await send({type: 'park.add', id: uid(), text})
    if (r) toast(r, 'error'); else { toast('🅿 Мысль в парковке — разберём в конце этапа'); setText(''); setOpen(false) }
  }
  return (
    <>
      <button class="ghost icon-btn small" title="Парковка мыслей" aria-label="Парковка мыслей" onClick={() => setOpen(true)}>🅿{count ? <span class="badge">{count}</span> : null}</button>
      {open && createPortal(
        <div class="sheet-backdrop" onClick={() => setOpen(false)}>
          <div class="sheet" role="dialog" aria-label="Парковка мыслей" onClick={e => e.stopPropagation()}>
            <div class="row between"><h2 style={{margin: 0}}>🅿 Парковка мыслей</h2><button class="ghost icon-btn" aria-label="Закрыть" onClick={() => setOpen(false)}>✕</button></div>
            <div class="tiny muted">Интересно, но не по теме этого шага? Запишите — без имени — и вернёмся в конце.</div>
            <textarea rows={3} maxLength={300} value={text} placeholder="например: а как на этом зарабатывать?" onInput={e => setText((e.target as HTMLTextAreaElement).value)} />
            <div><button class="primary" disabled={!text.trim()} onClick={add}>В парковку</button></div>
            {view.parking.length > 0 && (
              <div class="stack" style={{gap: 4}}>
                <b class="small">Уже в парковке</b>
                {view.parking.map(p => <div class="small" key={p.id}>• {p.text}{p.to ? <span class="muted"> — {PARK_LABEL[p.to]}</span> : ''}</div>)}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function ParkingCard({view, host}: {view: PublicView; host: Host}) {
  if (!view.parking.length) return null
  const open = view.parking.filter(p => !p.to).length
  const set = (id: string, to: ParkTarget | null) => { const r = host({type: 'park.resolve', id, to}); if (r) toast(r, 'error') }
  return (
    <div class="card stack parking no-print">
      <div class="row between"><h3 style={{margin: 0}}>🅿 Парковка мыслей</h3><span class={`chip ${open ? 'warn' : 'ok'}`}>{open ? `не разобрано: ${open}` : 'всё разобрано'}</span></div>
      {view.parking.map(p => (
        <div class="park-row" key={p.id}>
          <div class="small">{p.text}</div>
          <div class="row" style={{gap: 4}}>
            {(Object.keys(PARK_LABEL) as ParkTarget[]).map(t => (
              <button key={t} class={`small ${p.to === t ? 'selected' : 'ghost'}`} onClick={() => set(p.id, p.to === t ? null : t)}>{PARK_LABEL[t]}</button>
            ))}
          </div>
        </div>
      ))}
      <div class="tiny muted">«В следующий этап» — мысль появится в парковке нового этапа. «В задачи» и «в предположения» — сразу в соответствующие вкладки.</div>
    </div>
  )
}
