// Регламент решения: ведущий выбирает правило, участники голосуют вслепую, итог раскрывается разом.
import {useState} from 'preact/hooks'
import type {Action, PublicView} from '../core/engine'
import {RULES, STANCE_LABEL, ruleName, type Ballot, type Rule, type Stance} from '../core/decision'
import {cardTitle} from '../core/template'
import {Avatar, ErrorLine} from './common'
import {toast} from './toast'

type Send = (a: Action) => Promise<string | null>

const title = (view: PublicView, id: string) => {
  const c = view.cards.find(x => x.id === id)
  return c ? cardTitle(view.template, c.fields) : '?'
}

// ——— Ведущий ———

export function VoteHost({view, host, voters, onSingleVote}: {
  view: PublicView; host: (a: Action) => string | null
  voters: {id: string; name: string}[]
  onSingleVote?: (pid: string) => void // один экран: голосует участник за ноутбуком
}) {
  const v = view.vote
  const finalists = view.results?.cards.map(r => r.cardId) ?? []
  const [rule, setRule] = useState<Rule>(v?.rule ?? 'score')
  const [candidate, setCandidate] = useState(finalists[0] ?? '')
  const [owner, setOwner] = useState(voters[0]?.id ?? '')
  const run = (a: Action) => { const r = host(a); if (r) toast(r, 'error'); return r }

  if (v?.open) {
    const expected = v.rule === 'owner' ? voters.filter(p => p.id === v.ownerId) : voters
    return (
      <div class="card stack vote-host">
        <div class="row between"><b>{RULES.find(r => r.id === v.rule)?.emoji} Голосуем: {ruleName(v.rule)}</b><span class="chip">{v.voted.length} из {expected.length}</span></div>
        {v.candidateId && <div class="small">На согласие вынесено: <b>«{title(view, v.candidateId)}»</b></div>}
        {v.ownerId && <div class="small">Решает: <b>{voters.find(p => p.id === v.ownerId)?.name ?? '—'}</b></div>}
        <div class="pulse-people">
          {expected.map(p => (
            <button key={p.id} class={`pulse-person vote-person ${v.voted.includes(p.id) ? 'done' : 'working'}`} title={p.name}
              onClick={() => onSingleVote?.(p.id)} disabled={!onSingleVote}>
              <Avatar name={p.name} size={30} dim={!v.voted.includes(p.id)} />
              <span class="pulse-mark">{v.voted.includes(p.id) ? '✓' : '…'}</span>
              {onSingleVote && <span class="tiny">{p.name}</span>}
            </button>
          ))}
        </div>
        {onSingleVote && <div class="tiny muted">Один экран: нажмите на имя — участник проголосует за ноутбуком, чужие голоса скрыты.</div>}
        <div class="row">
          <button class="primary" disabled={!v.voted.length} onClick={() => run({type: 'vote.reveal'})}>Раскрыть итог ✨</button>
          <button class="ghost" onClick={() => run({type: 'vote.cancel'})}>Отменить</button>
        </div>
      </div>
    )
  }

  return (
    <div class="card stack">
      {v?.outcome && <VoteOutcomeCard view={view} />}
      <b>{v?.outcome ? 'Проголосовать ещё раз или иначе' : 'Как принимаем решение?'}</b>
      <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))'}}>
        {RULES.map(r => (
          <button key={r.id} class={`choice-card ${rule === r.id ? 'selected' : ''}`} onClick={() => setRule(r.id)}>
            <b>{r.emoji} {r.name}</b><small>{r.hint}</small>
          </button>
        ))}
      </div>
      {(rule === 'consent' || rule === 'consensus') && (
        <label class="field"><span>Какой вариант выносим на {rule === 'consent' ? 'согласие' : 'консенсус'}</span>
          <select value={candidate} onChange={e => setCandidate((e.target as HTMLSelectElement).value)}>
            {finalists.map(id => <option key={id} value={id}>{title(view, id)}</option>)}
          </select>
        </label>
      )}
      {rule === 'owner' && (
        <label class="field"><span>Кто принимает решение</span>
          <select value={owner} onChange={e => setOwner((e.target as HTMLSelectElement).value)}>
            {voters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {rule !== 'score' && (
        <div><button class="primary" onClick={() => {
          if (!run({type: 'vote.start', rule, candidateId: candidate, ownerId: owner})) toast('Голосование началось — у всех на телефонах')
        }}>Начать голосование</button></div>
      )}
      {rule === 'score' && <div class="tiny muted">Отметьте выбранное ниже — рейтинг уже перед глазами.</div>}
    </div>
  )
}

export function VoteOutcomeCard({view}: {view: PublicView}) {
  const o = view.vote?.outcome
  if (!o || !view.vote) return null
  const v = view.vote
  const max = Math.max(1, ...Object.values(o.counts ?? {}))
  return (
    <div class={`card stack vote-outcome ${o.winnerId ? 'ok' : 'no'}`}>
      <b>{o.winnerId ? '✅' : '⚠️'} {o.note}</b>
      {o.counts && v.candidates.map(id => (
        <div class="branch-bar" key={id}>
          <span class="tiny">{title(view, id)}</span>
          <span class="bar"><i style={{width: `${((o.counts![id] ?? 0) / max) * 100}%`}} /></span>
          <span class="tiny">{o.counts![id] ?? 0}</span>
        </div>
      ))}
      {o.stances && <div class="row">{(Object.keys(STANCE_LABEL) as Stance[]).map(s => <span class="chip" key={s}>{STANCE_LABEL[s]}: {o.stances![s]}</span>)}</div>}
      {o.objections && o.objections.length > 0 && (
        <div class="stack" style={{gap: 4}}>
          <div class="small"><b>Возражения</b> — обсудите их: можно доработать вариант и проголосовать снова.</div>
          {o.objections.map((t, i) => <div class="note" key={i}>✋ {t}</div>)}
        </div>
      )}
      {o.tie && <div class="tiny muted">Ничья: обсудите эти варианты и переголосуйте или решите по рейтингу.</div>}
    </div>
  )
}

// ——— Участник ———

export function VoteBallot({view, pid, send}: {view: PublicView; pid: string; send: Send}) {
  const v = view.vote
  const [pick, setPick] = useState('')
  const [stance, setStance] = useState<Stance | null>(null)
  const [reason, setReason] = useState('')
  const [order, setOrder] = useState<string[]>(() => v?.candidates ?? [])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!v) return null
  if (!v.open) return v.outcome ? <VoteOutcomeCard view={view} /> : null
  if (v.rule === 'owner' && v.ownerId !== pid) {
    return <div class="card"><b>🧑‍⚖️ Решение принимает ответственный.</b> <span class="muted">Обсудите варианты — выбор появится здесь.</span></div>
  }
  const done = v.voted.includes(pid)
  const submit = async (ballot: Ballot) => {
    setBusy(true)
    const r = await send({type: 'vote.cast', ballot})
    setBusy(false)
    setErr(r)
    if (!r) toast(done ? 'Голос изменён' : 'Голос принят — итог откроется у всех одновременно')
  }
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }
  return (
    <div class="card stack vote-ballot">
      <div class="row between"><b>{RULES.find(r => r.id === v.rule)?.emoji} {ruleName(v.rule)}</b>{done && <span class="chip ok">✓ вы проголосовали</span>}</div>
      <div class="tiny muted">Голос тайный: видно только, кто уже проголосовал. Изменить можно до раскрытия.</div>

      {(v.rule === 'majority' || v.rule === 'owner') && (
        <div class="stack" style={{gap: 6}}>
          {v.candidates.map(id => (
            <button key={id} class={`choice-card ${pick === id ? 'selected' : ''}`} onClick={() => setPick(id)}><b>{title(view, id)}</b></button>
          ))}
          <div><button class="primary" disabled={!pick || busy} onClick={() => submit({kind: 'pick', cardId: pick})}>{v.rule === 'owner' ? 'Принять решение' : 'Отдать голос'}</button></div>
        </div>
      )}

      {(v.rule === 'consent' || v.rule === 'consensus') && v.candidateId && (
        <div class="stack" style={{gap: 6}}>
          <div>Предложено: <b>«{title(view, v.candidateId)}»</b></div>
          <div class="row">
            {(Object.keys(STANCE_LABEL) as Stance[]).map(s => (
              <button key={s} class={stance === s ? 'selected' : ''} onClick={() => setStance(s)}>{STANCE_LABEL[s]}</button>
            ))}
          </div>
          {stance === 'live' && <div class="tiny muted">Предпочли бы другое, но принципиальных возражений нет.</div>}
          {stance === 'object' && (
            <textarea rows={2} maxLength={300} value={reason} placeholder="Почему этот вариант не подходит? (анонимно)" onInput={e => setReason((e.target as HTMLTextAreaElement).value)} />
          )}
          <div><button class="primary" disabled={!stance || busy} onClick={() => submit({kind: 'stance', stance: stance!, reason})}>Отправить</button></div>
        </div>
      )}

      {v.rule === 'ranking' && (
        <div class="stack" style={{gap: 6}}>
          {order.map((id, i) => (
            <div class="row between rank-row" key={id}>
              <span><b>{i + 1}.</b> {title(view, id)}</span>
              <span class="row" style={{gap: 2}}>
                <button class="small ghost" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button class="small ghost" aria-label="Ниже" disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
              </span>
            </div>
          ))}
          <div><button class="primary" disabled={busy} onClick={() => submit({kind: 'rank', order})}>Отправить порядок</button></div>
        </div>
      )}
      <ErrorLine msg={err} />
    </div>
  )
}
