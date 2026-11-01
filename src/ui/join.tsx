// Приложение участника: вход по ссылке из QR-кода (#j=<roomId>.<key>).
import {visibleTools} from '../core/quickstart'
import {useEffect, useState} from 'preact/hooks'
import {uid} from '../core/engine'
import {fromB64u, importKey, sha256hex} from '../net/crypto'
import {NostrTransport} from '../net/nostr'
import {ClientSession} from '../net/session'
import {lsGet, lsSet} from '../store/db'
import {ErrorLine, PhaseSteps, Timer, phaseName} from './common'
import {ParticipantStage} from './participant'
import {Brand} from './host'
import {PassportButton} from './passport'
import {hashKey} from '../core/evolve'
import {AssumptionsPanel} from './assumptions'
import {TasksPanel} from './tasks'
import {createPortal} from 'preact/compat'
import {toast} from './toast'

// Строка состояния: сохранено ли всё и дошло ли до ведущего
function SyncStatus({pending, offline}: {pending: number; offline: boolean}) {
  const [cls, text] = offline
    ? ['bad', `📴 Нет связи — всё сохранено на телефоне${pending ? `, ждёт отправки: ${pending}` : ''}. Отправим сами`]
    : pending
      ? ['warn', `⏳ Отправляем: ${pending}`]
      : ['ok', '✓ Всё сохранено и отправлено']
  return <div class={`sync-line ${cls}`} role="status">{text}</div>
}

export function JoinApp({roomId, secret}: {roomId: string; secret: string}) {
  const pidKey = `pi:pid:${roomId}`
  const nameKey = 'pi:name'
  const [pid] = useState(() => {
    const p = lsGet<string>(pidKey, '') || uid()
    lsSet(pidKey, p)
    return p
  })
  // Личный ключ: по нему участник находит свои назначения, а другие не могут связать их с ним
  const [token] = useState(() => {
    const t = lsGet<string>(`pi:tok:${roomId}`, '') || uid(14)
    lsSet(`pi:tok:${roomId}`, t)
    return t
  })
  const [name, setName] = useState(() => lsGet<string>(nameKey, ''))
  const [joined, setJoined] = useState(() => lsGet<boolean>(`pi:joined:${roomId}`, false))
  const [session, setSession] = useState<ClientSession | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [assumeOpen, setAssumeOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)

  useEffect(() => {
    if (!joined) return
    let s: ClientSession | null = null
    let cancelled = false
    ;(async () => {
      try {
        const k = await importKey(fromB64u(secret))
        const tag = (await sha256hex(`pi:${roomId}`)).slice(0, 16)
        s = new ClientSession(pid, new NostrTransport(tag), k)
        if (cancelled) return
        setSession(s)
        // Личный ключ: по нему участник находит свои назначения, а другие не могут связать их с ним
        const r = await s.start(name, token)
        if (r) setErr(r)
      } catch (e) {
        setErr('Ссылка повреждена или браузер слишком старый. Попробуйте открыть её в Chrome или Safari.')
        console.error(e)
      }
    })()
    return () => { cancelled = true; s?.close() }
  }, [joined])

  if (!joined) {
    return (
      <div class="narrow stack">
        <div class="hero">
          <Brand />
          <h1>Вход <span class="grad-text">в комнату</span></h1>
          <p class="muted">Здесь вы молча предложите свои варианты и оцените чужие — вслепую.</p>
        </div>
        <div class="card stack">
          <label class="field"><span>Как вас зовут?</span>
            <input type="text" value={name} maxLength={40} autoFocus onInput={e => setName((e.target as HTMLInputElement).value)} />
          </label>
          <div class="tiny muted">Имя видят участники команды. Авторство карточек и ваши оценки скрыты.</div>
          <button class="primary" disabled={!name.trim()} onClick={() => { lsSet(nameKey, name.trim()); lsSet(`pi:joined:${roomId}`, true); setJoined(true) }}>Войти</button>
        </div>
      </div>
    )
  }

  const view = session?.view.value
  const net = session?.netStatus.value ?? 'offline'
  // Связь с организатором восстановилась — старая ошибка «нет связи» больше не актуальна
  const hostSeen = session?.hostSeen.value ?? 0
  useEffect(() => { if (hostSeen) setErr(null) }, [hostSeen])
  const stale = session && Date.now() - session.hostSeen.value > 25_000
  // Досланное после обрыва связи — короткое подтверждение
  const late = session?.lateDelivered.value ?? 0
  useEffect(() => { if (late) toast('Связь вернулась — всё отправлено ✓') }, [late])
  const lateErr = session?.lateError.value
  useEffect(() => { if (lateErr) toast(lateErr, 'error') }, [lateErr])
  const tools = view && visibleTools(view.settings.tools, {assumptions: view.assumptions.length, tasks: view.tasks.length, roundOpen: view.round?.open})
  return (
    <div>
      <div class="topbar">
        <div class="inner">
          <div style={{minWidth: 0, flex: 1}}>
            <div class="tiny muted">{view ? `${view.title}` : 'Подключение…'}</div>
            <div class="phase-title">{view ? phaseName(view) : 'Ищем организатора…'}</div>
          </div>
          {view && <PassportButton p={view.passport} />}
          {view && tools?.tasks && <button class="ghost icon-btn small" title="Кто что делает" aria-label="Задачи" onClick={() => setTasksOpen(true)}>✅</button>}
          {view && tools?.assume && <button class="ghost icon-btn small" title="Предположения" aria-label="Предположения" onClick={() => setAssumeOpen(true)}>🎯</button>}
          {view && <Timer deadline={view.deadline} offset={session!.offset} />}
          <span title="Связь"><span class={`dot ${stale ? 'degraded' : net}`} /></span>
        </div>
        {view && <div class="inner" style={{paddingTop: 0}}><PhaseSteps view={view} /></div>}
      </div>
      <div class="narrow stack">
        <ErrorLine msg={err} />
        {session && view && <SyncStatus pending={session.pendingCount.value} offline={net === 'offline' || !!stale} />}
        {stale && view && <div class="hint">Связь с организатором прервалась — переподключаемся. Ваши черновики сохранены на телефоне.</div>}
        {!view && (
          <div class="card stack">
            <div>Подключаемся к комнате…</div>
            <div class="small muted">Если это длится больше 20 секунд: проверьте, что ноутбук организатора открыт на экране сессии и у обоих есть интернет.</div>
          </div>
        )}
        {view?.round?.open && !view.round.submitted.includes(pid) && (
          <button class="note" style={{justifyContent: 'flex-start', border: 0, width: '100%', fontWeight: 700, borderRadius: 'var(--radius-sm)'}} onClick={() => setAssumeOpen(true)}>🙈 Организатор просит оценить предположения — открыть →</button>
        )}
        {tasksOpen && view && session && createPortal(
          <div class="sheet-backdrop" onClick={() => setTasksOpen(false)}>
            <div class="sheet wide" role="dialog" aria-label="Кто что делает" onClick={e => e.stopPropagation()}>
              <div class="row between"><h2 style={{margin: 0}}>✅ Задачи</h2><button class="ghost icon-btn" aria-label="Закрыть" onClick={() => setTasksOpen(false)}>✕</button></div>
              <TasksPanel view={view} send={a => session.send(a)} pid={pid} isHost={false} title={view.title} />
            </div>
          </div>,
          document.body
        )}
        {assumeOpen && view && session && createPortal(
          <div class="sheet-backdrop" onClick={() => setAssumeOpen(false)}>
            <div class="sheet wide" role="dialog" aria-label="Предположения" onClick={e => e.stopPropagation()}>
              <div class="row between"><h2 style={{margin: 0}}>🎯 Предположения</h2><button class="ghost icon-btn" aria-label="Закрыть" onClick={() => setAssumeOpen(false)}>✕</button></div>
              <AssumptionsPanel view={view} send={a => session.send(a)} pid={pid} isHost={false} />
            </div>
          </div>,
          document.body
        )}
        {view?.hostScreen && (
          <div class="card stack center">
            <h2>📴 Сессия на экране ведущего</h2>
            <div class="muted">Связь подвела, поэтому команда продолжает на ноутбуке организатора по очереди. Подойдите, когда позовут. Ваши черновики сохранены — когда телефоны вернут, экран оживёт сам.</div>
          </div>
        )}
        {view && session && !view.hostScreen && <ParticipantStage view={view} pid={pid} send={a => session.send(a)} storeKey={`pi:me:${view.stageId}:${pid}`} assignKey={hashKey(token)} late={session.lastLate.value} />}
      </div>
    </div>
  )
}
