// Пульт ведущего: кто здесь и кто готов, сколько времени осталось, что сократить, если опаздываем.
import type {Action, PublicView} from '../core/engine'
import {minutesLeft, shortenSuggestion} from '../core/timing'
import type {Stage} from '../core/types'
import {PRESENCE_TIMEOUT} from '../net/session'
import {Avatar, useNow} from './common'
import {toast} from './toast'

type Status = 'done' | 'working' | 'away' | 'here'

const STATUS: Record<Status, {icon: string; label: string}> = {
  done: {icon: '✓', label: 'отправил'},
  working: {icon: '✍️', label: 'работает'},
  away: {icon: '📴', label: 'пропал со связи'},
  here: {icon: '•', label: 'на связи'}
}

const WORK_PHASES = new Set(['generate', 'evolve', 'calibrate', 'shortlist', 'rate', 'rate2'])

export function personStatus(view: PublicView, pid: string, lastHeard: number | undefined, isHost: boolean, network: boolean, now: number): Status {
  const done = view.phase === 'generate' ? !!view.cardCounts[pid] : !!view.progress[pid]
  if (WORK_PHASES.has(view.phase) && done) return 'done'
  if (network && !isHost && (!lastHeard || now - lastHeard > PRESENCE_TIMEOUT)) return 'away'
  return WORK_PHASES.has(view.phase) ? 'working' : 'here'
}

export function Pulse({view, stage, host, hostPid, seen, network, onHostScreen}: {
  view: PublicView; stage: Stage; host: (a: Action) => string | null; hostPid: string
  seen: Record<string, number>; network: boolean; onHostScreen: () => void
}) {
  const now = useNow(5000)
  const people = stage.participants.filter(p => p.active)
  // Участник «слышен», если от него было сообщение или действие недавно
  const heard = (id: string) => Math.max(seen[id] ?? 0, stage.participants.find(p => p.id === id)?.lastSeen ?? 0)
  const statuses = people.map(p => ({p, st: personStatus(view, p.id, heard(p.id), p.id === hostPid, network, now)}))
  const away = statuses.filter(x => x.st === 'away')
  const done = statuses.filter(x => x.st === 'done').length
  const left = minutesLeft(stage, view.flow, now)
  const cut = shortenSuggestion(stage, view.flow, now)
  const stepIdx = view.flow.indexOf(view.phase === 'rate2' ? 'results' : view.phase)
  return (
    <div class="card pulse no-print">
      <div class="pulse-row">
        <div class="pulse-people">
          {statuses.map(({p, st}) => (
            <span class={`pulse-person ${st}`} key={p.id} title={`${p.name}: ${STATUS[st].label}`}>
              <Avatar name={p.name} size={28} dim={st === 'away'} />
              <span class="pulse-mark">{STATUS[st].icon}</span>
            </span>
          ))}
        </div>
        <div class="pulse-facts">
          {WORK_PHASES.has(view.phase) && <span class="chip">Готовы {done} из {people.length}</span>}
          {away.length > 0 && <span class="chip bad">📴 {away.map(x => x.p.name).join(', ')}</span>}
          <span class="chip">Шаг {stepIdx + 1} из {view.flow.length}</span>
          {left !== null && <span class="chip">≈ {Math.max(left, 0)} мин до конца</span>}
          {view.carried && <span class="chip ok" title="Прошлый шаг закончили раньше — остаток добавлен к этому">⏱ +{view.carried >= 60_000 ? `${Math.round(view.carried / 60_000)} мин` : `${Math.round(view.carried / 1000)} с`} запаса</span>}
        </div>
      </div>
      {cut && (
        <div class="pulse-alert">
          <span>⏰ Шаг затянулся на {cut.overMinutes} мин. Можно отключить {cut.what.join(', ')} — это сэкономит ≈{cut.minutes} мин.</span>
          <button class="small primary" onClick={() => { if (!host({type: 'settings.update', patch: cut.patch})) toast(`Сократили: −${cut.minutes} мин`) }}>Сократить</button>
        </div>
      )}
      {network && away.length > 0 && away.length >= Math.ceil((people.length - 1) / 2) && (
        <div class="pulse-alert">
          <span>Похоже, у части команды пропала связь. Можно продолжить на этом ноутбуке по очереди — всё собранное сохранится.</span>
          <button class="small" onClick={onHostScreen}>📴 Перейти на один экран</button>
        </div>
      )}
    </div>
  )
}

// ——— Проверка готовности (лобби): связь с каждым телефоном в обе стороны ———

export type LinkStatus = 'ok' | 'waiting' | 'lost'

export function linkStatus(pid: string, stageId: string, links: Record<string, string>, lastHeard: number | undefined, now: number): LinkStatus {
  const recent = !!lastHeard && now - lastHeard <= PRESENCE_TIMEOUT
  if (!recent) return lastHeard ? 'lost' : 'waiting'
  return links[pid] === stageId ? 'ok' : 'waiting'
}

const LINK: Record<LinkStatus, {icon: string; label: string}> = {
  ok: {icon: '✓', label: 'связь в обе стороны'},
  waiting: {icon: '⏳', label: 'ждём подтверждения'},
  lost: {icon: '📴', label: 'пропал со связи'}
}

export function ReadyCheck({view, stage, hostPid, links, seen, relays, storage}: {
  view: PublicView; stage: Stage; hostPid: string; links: Record<string, string>; seen: Record<string, number>
  relays: {open: number; total: number}; storage: boolean | null
}) {
  const now = useNow(2000)
  const phones = stage.participants.filter(p => p.active && p.id !== hostPid)
  const heard = (id: string) => Math.max(seen[id] ?? 0, stage.participants.find(p => p.id === id)?.lastSeen ?? 0)
  const rows = phones.map(p => ({p, st: linkStatus(p.id, view.stageId, links, heard(p.id), now)}))
  const ok = rows.filter(r => r.st === 'ok').length
  const item = (good: boolean | null, title: string, note: string) => (
    <div class="ready-item"><span class={`ready-mark ${good === null ? 'wait' : good ? 'ok' : 'bad'}`}>{good === null ? '…' : good ? '✓' : '!'}</span><b>{title}</b><span class="tiny muted">{note}</span></div>
  )
  return (
    <div class="card stack no-print">
      <div class="row between"><h3 style={{margin: 0}}>🩺 Проверка готовности</h3><span class={`chip ${phones.length && ok === phones.length ? 'ok' : ''}`}>{ok} из {phones.length} телефонов на связи</span></div>
      <div class="ready-grid">
        {item(storage, 'Сохранение на ноутбуке', storage === false ? 'браузер не даёт сохранять — сохраните проект в файл' : 'данные не потеряются при перезагрузке')}
        {item(relays.total ? relays.open > 0 : null, 'Ретрансляторы', `подключено ${relays.open} из ${relays.total}${relays.open === 0 ? ' — проверьте интернет' : ''}`)}
        {item(phones.length ? ok === phones.length : null, 'Обмен с телефонами', phones.length ? 'каждый телефон получил этап и ответил' : 'никто ещё не вошёл')}
      </div>
      {rows.length > 0 && (
        <div class="pulse-people">
          {rows.map(({p, st}) => (
            <span class={`pulse-person ${st === 'ok' ? 'done' : st === 'lost' ? 'away' : 'working'}`} key={p.id} title={`${p.name}: ${LINK[st].label}`}>
              <Avatar name={p.name} size={28} dim={st !== 'ok'} />
              <span class="pulse-mark">{LINK[st].icon}</span>
            </span>
          ))}
        </div>
      )}
      {rows.some(r => r.st !== 'ok') && <div class="tiny muted">⏳ — телефон вошёл, но ещё не подтвердил, что видит экран. Обычно это 2–5 секунд. Если дольше 20 секунд — пусть обновит страницу.</div>}
    </div>
  )
}
