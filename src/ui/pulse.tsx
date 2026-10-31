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
