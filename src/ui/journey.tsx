// Карта пути пользователя: экраны участника и организатора, кривая эмоций, итог.
import {useEffect, useState} from 'preact/hooks'
import type {Action, PublicView} from '../core/engine'
import {BARRIER_LIMIT, EMOTIONS, lowestStep, type EmotionStat} from '../core/journey'
import {asText} from '../core/template'
import {lsGet, lsSet} from '../store/db'
import {Avatars, ErrorLine, PhaseIntro, Waiting} from './common'
import {toast} from './toast'

type Send = (a: Action) => Promise<string | null>
const newId = () => Math.random().toString(36).slice(2, 12)

// ——— Участник ———

export function JourneyParticipant({view, send, pid, storeKey}: {view: PublicView; send: Send; pid: string; storeKey: string}) {
  const j = view.journey!
  switch (view.phase) {
    case 'steps': return <StepsPropose view={view} send={send} />
    case 'generate': return <Barriers view={view} send={send} pid={pid} storeKey={storeKey} />
    case 'shortlist': return <Vote view={view} send={send} pid={pid} storeKey={storeKey} />
    case 'summary': return <JourneySummary view={view} />
    default:
      return <div class="card"><b>🗺️ Карта пути</b><p class="muted small" style={{marginTop: 6}}>Персона: {j.persona || 'уточнит организатор'}</p></div>
  }
}

function StepsPropose({view, send}: {view: PublicView; send: Send}) {
  const j = view.journey!
  const [title, setTitle] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div class="stack">
      <PhaseIntro emoji="🗺️" title="Из каких шагов состоит путь?">
        {j.persona ? `Персона: ${j.persona}. ` : ''}Предложите шаги — организатор соберёт из них 4–7 по порядку.
      </PhaseIntro>
      <StepsLine view={view} />
      <form class="card row" onSubmit={async e => {
        e.preventDefault()
        if (!title.trim()) return
        const r = await send({type: 'step.propose', id: newId(), title})
        setErr(r)
        if (!r) { setTitle(''); toast('Шаг предложен') }
      }}>
        <input type="text" style={{flex: 1, minWidth: 160}} value={title} maxLength={80} placeholder="Например: ищет свободную стиральную машину" onInput={e => setTitle((e.target as HTMLInputElement).value)} />
        <button class="primary" disabled={!title.trim()}>Предложить</button>
      </form>
      <ErrorLine msg={err} />
      {j.proposals.length > 0 && <div class="small muted">Уже предложили: {j.proposals.map(p => p.title).join(' · ')}</div>}
    </div>
  )
}

export function StepsLine({view}: {view: PublicView}) {
  const steps = view.journey!.steps
  if (!steps.length) return <div class="card small muted">Шагов пока нет.</div>
  return (
    <div class="steps-line">
      {steps.map((s, i) => (
        <div class="step-chip" key={s.id}><span class="step-n">{i + 1}</span>{s.title}</div>
      ))}
    </div>
  )
}

interface MyBarrier { id: string; stepId: string; text: string; sent: boolean }

function Barriers({view, send, pid, storeKey}: {view: PublicView; send: Send; pid: string; storeKey: string}) {
  const j = view.journey!
  const key = `${storeKey}:journey`
  const [mine, setMine] = useState<{barriers: MyBarrier[]; emotions: Record<string, number>}>(() => lsGet(key, {barriers: [], emotions: {}}))
  const save = (next: typeof mine) => { setMine(next); lsSet(key, next) }
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [again, setAgain] = useState(false)
  const done = view.progress[pid]
  if (done && !again) return <Waiting view={view} title="Спасибо!" onEdit={() => setAgain(true)} editLabel="Дописать ещё" />

  const setEmotion = async (stepId: string, value: number) => {
    save({...mine, emotions: {...mine.emotions, [stepId]: value}})
    const r = await send({type: 'emotion.set', stepId, value})
    if (r) toast(r, 'error')
  }
  const addBarrier = async (stepId: string) => {
    const text = (drafts[stepId] ?? '').trim()
    if (!text) return
    const id = newId()
    const r = await send({type: 'card.upsert', id, fields: {what: text}, stepId})
    if (r) { toast(r, 'error'); return }
    save({...mine, barriers: [...mine.barriers, {id, stepId, text, sent: true}]})
    setDrafts({...drafts, [stepId]: ''})
  }
  const removeBarrier = async (b: MyBarrier) => {
    const r = await send({type: 'card.delete', id: b.id})
    if (r) { toast(r, 'error'); return }
    save({...mine, barriers: mine.barriers.filter(x => x.id !== b.id)})
  }
  const left = BARRIER_LIMIT - mine.barriers.length
  return (
    <div class="stack">
      <PhaseIntro emoji="🧗" title="Где больно на этом пути?">
        По каждому шагу отметьте, каково человеку, и запишите, что мешает. Чужие ответы скрыты.
      </PhaseIntro>
      {j.persona && <div class="note small"><b>Персона:</b> {j.persona}</div>}
      {j.steps.map((s, i) => (
        <div class="card stack journey-step" key={s.id}>
          <div class="row" style={{gap: 8}}><span class="step-n">{i + 1}</span><b>{s.title}</b></div>
          <div class="row emotions" role="radiogroup" aria-label="Каково на этом шаге">
            {EMOTIONS.map(e => (
              <button key={e.v} type="button" class={`emo ${mine.emotions[s.id] === e.v ? 'on' : ''}`} title={e.label} aria-pressed={mine.emotions[s.id] === e.v}
                onClick={() => setEmotion(s.id, e.v)}>{e.face}</button>
            ))}
          </div>
          {mine.barriers.filter(b => b.stepId === s.id).map(b => (
            <div class="row between barrier" key={b.id}>
              <span class="small">• {b.text}</span>
              <button class="ghost small danger" onClick={() => removeBarrier(b)} aria-label="Удалить">✕</button>
            </div>
          ))}
          {left > 0 && (
            <form class="row" onSubmit={e => { e.preventDefault(); void addBarrier(s.id) }}>
              <input type="text" style={{flex: 1, minWidth: 150}} maxLength={300} placeholder="Что мешает на этом шаге?" value={drafts[s.id] ?? ''}
                onInput={e => setDrafts({...drafts, [s.id]: (e.target as HTMLInputElement).value})} />
              <button class="small" disabled={!(drafts[s.id] ?? '').trim()}>+ Барьер</button>
            </form>
          )}
        </div>
      ))}
      <div class="tiny muted">Барьеров: {mine.barriers.length} из {BARRIER_LIMIT}</div>
      <button class="primary" style={{alignSelf: 'flex-start'}} onClick={async () => { const r = await send({type: 'journey.done'}); if (r) toast(r, 'error'); else setAgain(false) }}>Готово</button>
    </div>
  )
}

function Vote({view, send, pid, storeKey}: {view: PublicView; send: Send; pid: string; storeKey: string}) {
  const j = view.journey!
  const quota = 3
  const key = `${storeKey}:jvote`
  const [chosen, setChosen] = useState<string[]>(() => lsGet<string[]>(key, []))
  const [again, setAgain] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (view.progress[pid] && !again) return <Waiting view={view} title="Голос учтён" onEdit={() => setAgain(true)} editLabel="Изменить выбор" />
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter(x => x !== id) : chosen.length < quota ? [...chosen, id] : chosen
    setChosen(next)
    lsSet(key, next)
  }
  return (
    <div class="stack">
      <PhaseIntro emoji="🎯" title={`Отметьте до ${quota} самых болезненных барьеров`}>Отметки других скрыты. Самые больные станут проблемами.</PhaseIntro>
      {j.stats && <EmotionCurve view={view} />}
      {j.steps.map((s, i) => {
        const cards = view.cards.filter(c => c.stepId === s.id)
        if (!cards.length) return null
        return (
          <div class="stack" key={s.id} style={{gap: 8}}>
            <div class="row" style={{gap: 8}}><span class="step-n">{i + 1}</span><b class="small">{s.title}</b></div>
            {cards.map(c => (
              <button key={c.id} class={`card choice-card ${chosen.includes(c.id) ? 'selected' : ''}`} onClick={() => toggle(c.id)}>
                <span class="small">{chosen.includes(c.id) ? '✓ ' : ''}{asText(c.fields.what)}</span>
              </button>
            ))}
          </div>
        )
      })}
      <ErrorLine msg={err} />
      <button class="primary" style={{alignSelf: 'flex-start'}} disabled={!chosen.length} onClick={async () => {
        const r = await send({type: 'approve.submit', cardIds: chosen})
        setErr(r)
        if (!r) { setAgain(false); toast('Голос учтён') }
      }}>Отправить ({chosen.length} из {quota})</button>
    </div>
  )
}

// ——— Организатор ———

export function JourneyHost({view, host}: {view: PublicView; host: (a: Action) => string | null}) {
  const j = view.journey!
  const [title, setTitle] = useState('')
  const [persona, setPersona] = useState(j.persona)
  const run = (a: Action) => { const r = host(a); if (r) toast(r, 'error'); return r }
  // Персона сохраняется сама через полсекунды после ввода — не зависим от ухода фокуса
  useEffect(() => {
    if (persona === j.persona) return
    const t = setTimeout(() => run({type: 'journey.persona', persona}), 500)
    return () => clearTimeout(t)
  }, [persona])
  if (view.phase === 'lobby') {
    return (
      <div class="card stack">
        <b>🗺️ Чей путь разбираем?</b>
        <input type="text" value={persona} maxLength={200} placeholder="Первокурсник, который живёт в общежитии и готовится к первой сессии"
          onInput={e => setPersona((e.target as HTMLInputElement).value)} />
        <div class="tiny muted">Чем конкретнее персона и ситуация, тем точнее барьеры.</div>
      </div>
    )
  }
  if (view.phase === 'steps') {
    return (
      <div class="stack">
        <PhaseIntro emoji="🗺️" title="Собираем шаги пути">Возьмите предложения команды или добавьте свои — 4–7 шагов по порядку.</PhaseIntro>
        <div class="card stack">
          <label class="field"><span>Персона</span>
            <input type="text" value={persona} maxLength={200} onInput={e => setPersona((e.target as HTMLInputElement).value)} />
          </label>
        </div>
        {j.proposals.length > 0 && (
          <div class="card stack">
            <b>Предложения команды</b>
            <div class="row">{j.proposals.map(p => <button key={p.id} class="small" onClick={() => run({type: 'step.add', id: p.id, title: p.title})}>+ {p.title}</button>)}</div>
          </div>
        )}
        <div class="card stack">
          <b>Шаги ({j.steps.length})</b>
          {j.steps.map((s, i) => (
            <div class="row" key={s.id} style={{flexWrap: 'nowrap'}}>
              <span class="step-n">{i + 1}</span>
              <input type="text" defaultValue={s.title} maxLength={80} style={{flex: 1}} onBlur={e => { const v = (e.target as HTMLInputElement).value; if (v !== s.title) run({type: 'step.update', id: s.id, title: v}) }} />
              <button class="ghost icon-btn small" disabled={i === 0} onClick={() => run({type: 'step.update', id: s.id, move: -1})}>↑</button>
              <button class="ghost icon-btn small" disabled={i === j.steps.length - 1} onClick={() => run({type: 'step.update', id: s.id, move: 1})}>↓</button>
              <button class="ghost icon-btn small danger" onClick={() => run({type: 'step.remove', id: s.id})}>✕</button>
            </div>
          ))}
          <form class="row" onSubmit={e => { e.preventDefault(); if (title.trim() && !run({type: 'step.add', id: newId(), title})) setTitle('') }}>
            <input type="text" style={{flex: 1}} value={title} maxLength={80} placeholder="Новый шаг" onInput={e => setTitle((e.target as HTMLInputElement).value)} />
            <button class="small" disabled={!title.trim()}>+ Шаг</button>
          </form>
        </div>
      </div>
    )
  }
  if (view.phase === 'generate' || view.phase === 'shortlist') {
    const active = view.participants.filter(p => p.active)
    return (
      <div class="stack">
        {view.phase === 'generate'
          ? <PhaseIntro emoji="🧗" title="Барьеры и эмоции">Каждый по шагам отмечает, каково человеку, и пишет, что мешает. Ответы скрыты.</PhaseIntro>
          : <PhaseIntro emoji="🎯" title="Самое больное">Каждый отмечает до 3 барьеров. Кривая эмоций уже открыта.</PhaseIntro>}
        <StepsLine view={view} />
        {view.phase === 'shortlist' && <EmotionCurve view={view} />}
        <div class="card stack">
          <b>{active.filter(p => view.progress[p.id]).length === active.length ? 'Все готовы 🎉' : `Готовы ${active.filter(p => view.progress[p.id]).length} из ${active.length}`}</b>
          <Avatars people={active} doneIds={view.progress} />
          {view.phase === 'generate' && <div class="tiny muted">Барьеров записано: {Object.values(view.cardCounts).reduce((a, b) => a + b, 0)}</div>}
        </div>
      </div>
    )
  }
  return <JourneySummary view={view} />
}

// ——— Итог и кривая ———

export function EmotionCurve({view}: {view: PublicView}) {
  const j = view.journey!
  const stats = j.stats ?? {}
  const steps = j.steps
  if (!steps.length || !Object.keys(stats).length) return null
  const W = Math.max(320, steps.length * 110), H = 190, PX = 40, PY = 24
  const x = (i: number) => PX + (steps.length === 1 ? 0 : (i / (steps.length - 1)) * (W - 2 * PX))
  const y = (v: number) => PY + ((2 - v) / 4) * (H - 2 * PY - 30)
  const pts = steps.map((s, i) => ({s, i, st: stats[s.id] as EmotionStat | undefined})).filter(p => p.st)
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.st!.avg)}`).join(' ')
  const band = pts.length > 1
    ? pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.st!.max)}`).join(' ') + ' ' + [...pts].reverse().map(p => `L${x(p.i)},${y(p.st!.min)}`).join(' ') + ' Z'
    : ''
  const low = lowestStep({persona: j.persona, steps, proposals: [], emotions: []}, stats as Record<string, EmotionStat>)
  const face = (v: number) => EMOTIONS.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a)).face
  return (
    <div class="card stack">
      <b>Кривая эмоций</b>
      <div class="tree-scroll">
        <svg class="curve" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Средние эмоции по шагам пути">
          <line x1={PX - 10} x2={W - PX + 10} y1={y(0)} y2={y(0)} class="zero" />
          {band && <path d={band} class="band" />}
          <path d={line} class="line" />
          {pts.map(p => (
            <g key={p.s.id}>
              <circle cx={x(p.i)} cy={y(p.st!.avg)} r={14} class={`dot-e ${low?.id === p.s.id ? 'low' : ''}`} />
              <text x={x(p.i)} y={y(p.st!.avg) + 5} text-anchor="middle" class="face">{face(p.st!.avg)}</text>
            </g>
          ))}
          {steps.map((s, i) => (
            <text key={s.id} x={x(i)} y={H - 8} text-anchor="middle" class="lbl">{i + 1}. {s.title.length > 14 ? `${s.title.slice(0, 13)}…` : s.title}</text>
          ))}
        </svg>
      </div>
      {low && <div class="small">Тяжелее всего: <b>{low.title}</b> (в среднем {stats[low.id].avg > 0 ? '+' : ''}{stats[low.id].avg})</div>}
      <div class="tiny muted">Полоса — разброс ответов: широкая значит команда ощущает шаг по-разному.</div>
    </div>
  )
}

export function journeyRanking(view: PublicView) {
  const counts = view.approvalCounts ?? {}
  return view.cards
    .map(c => ({c, votes: counts[c.id] ?? 0, step: view.journey!.steps.find(s => s.id === c.stepId)}))
    .sort((a, b) => b.votes - a.votes)
}

export function JourneySummary({view, extra}: {view: PublicView; extra?: preact.ComponentChildren}) {
  const j = view.journey!
  const ranking = journeyRanking(view)
  return (
    <div class="stack">
      <PhaseIntro emoji="🗺️" title="Где больнее всего">{j.persona ? `Путь: ${j.persona}.` : ''} Самые болезненные барьеры можно сразу превратить в проблемы следующего этапа.</PhaseIntro>
      <StepsLine view={view} />
      <EmotionCurve view={view} />
      <div class="card stack">
        <b>Самые болезненные барьеры</b>
        {ranking.map(({c, votes, step}, i) => (
          <div class="row between" key={c.id} style={{alignItems: 'flex-start'}}>
            <div style={{minWidth: 0}}>
              <span class={`rank ${i === 0 && votes ? 'top' : ''}`} style={{marginRight: 8}}>{i + 1}</span>
              <span class="small">{asText(c.fields.what)}</span>
              {step && <div class="tiny muted" style={{marginLeft: 42}}>шаг: {step.title}</div>}
            </div>
            <span class="chip">{votes} {votes === 1 ? 'голос' : votes >= 2 && votes <= 4 ? 'голоса' : 'голосов'}</span>
          </div>
        ))}
      </div>
      {extra}
    </div>
  )
}

export function journeyMarkdown(view: PublicView, projectTitle: string): string {
  const j = view.journey!
  const L = [`# ${projectTitle} — карта пути`, '', `**Персона:** ${j.persona || '—'}`, '', '## Шаги и эмоции', '']
  j.steps.forEach((s, i) => {
    const st = j.stats?.[s.id]
    L.push(`${i + 1}. ${s.title}${st ? ` — среднее ${st.avg > 0 ? '+' : ''}${st.avg} (от ${st.min} до ${st.max})` : ''}`)
  })
  L.push('', '## Самые болезненные барьеры', '')
  for (const {c, votes, step} of journeyRanking(view)) L.push(`- ${asText(c.fields.what)} — ${votes} гол.${step ? ` (шаг: ${step.title})` : ''}`)
  return L.join('\n')
}
