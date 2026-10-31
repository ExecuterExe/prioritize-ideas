// Реестр предположений, слепая оценка «важность × доказанность» и эксперименты.
import {useMemo, useState} from 'preact/hooks'
import {
  CATEGORY_LABEL, CATEGORY_SHORT, METHOD_LABEL, QUADRANT_LABEL, STATUS_ICON, STATUS_LABEL, autoVerdict, experimentValue,
  marginNote, quadrant, type Assumption, type AssumptionCategory, type AssumptionStatus, type Experiment, type ExperimentMethod
} from '../core/assume'
import type {Action, PublicView} from '../core/engine'
import {cardTitle} from '../core/template'
import {lsGet, lsSet} from '../store/db'
import {ErrorLine, PhaseIntro, Waiting} from './common'
import {toast} from './toast'

type Send = (a: Action) => Promise<string | null>
const newId = () => Math.random().toString(36).slice(2, 12)

// Свои предположения и эксперименты участник узнаёт по id, которые сам создал (авторство скрыто)
function useOwn(key: string): [Set<string>, (id: string) => void] {
  const [ids, setIds] = useState<string[]>(() => lsGet<string[]>(key, []))
  const add = (id: string) => setIds(prev => { const next = [...prev, id]; lsSet(key, next); return next })
  return [new Set(ids), add]
}

export function AssumptionsPanel({view, send, pid, isHost, single}: {view: PublicView; send: Send; pid: string; isHost: boolean; single?: boolean}) {
  const [own, addOwn] = useOwn(`pi:own:${view.projectId}:${pid}`)
  const canEdit = (authorId: string, id: string) => isHost || own.has(id) || authorId === pid
  const list = view.assumptions
  const num = (id: string) => list.findIndex(a => a.id === id) + 1
  const round = view.round
  const myRoundDone = round?.submitted.includes(pid)
  const [roundAgain, setRoundAgain] = useState(false)
  const [expFor, setExpFor] = useState<string | null>(null)

  const cards = useMemo(() => [
    ...view.cards.map(c => ({id: c.id, title: `${view.template.emoji} ${cardTitle(view.template, c.fields)}`})),
    ...(view.refOptions ?? [])
  ], [view.cards, view.refOptions, view.template])

  return (
    <div class="stack">
      <PhaseIntro emoji="🎯" title="Что мы предполагаем?">
        Запишите то, во что команда верит, но не проверила. Важное и недоказанное проверяем первым.
      </PhaseIntro>

      {round?.open && (!myRoundDone || roundAgain) && (
        <RoundForm view={view} send={send} onDone={() => setRoundAgain(false)} />
      )}
      {round?.open && myRoundDone && !roundAgain && !isHost && (
        <Waiting view={{...view, progress: Object.fromEntries(view.participants.map(p => [p.id, round.submitted.includes(p.id)]))}}
          title="Оценки предположений отправлены" onEdit={() => setRoundAgain(true)} editLabel="Изменить оценки" />
      )}
      {isHost && <RoundControl view={view} send={send} single={single} />}

      <AddAssumption cards={cards} send={send} onAdded={addOwn} />

      {list.some(a => a.importance != null && a.evidence != null) && <AssumptionMap list={list} />}

      {list.length === 0 && <div class="card muted small">Пока пусто. Начните с предположений, на которых держится выбранная идея: «люди готовы платить», «проблема возникает часто», «мы успеем сделать прототип».</div>}
      <div class="stack stagger">
        {list.map(a => (
          <AssumptionCard key={a.id} a={a} n={num(a.id)} view={view} send={send} editable={canEdit(a.authorId, a.id)} isHost={isHost}
            onExperiment={() => setExpFor(expFor === a.id ? null : a.id)} expOpen={expFor === a.id}
            onExpAdded={id => { addOwn(id); setExpFor(null) }} />
        ))}
      </div>

      {view.experiments.length > 0 && (
        <>
          <h3 style={{margin: '8px 0 0'}}>🔬 Эксперименты</h3>
          {view.experiments.map(e => (
            <ExperimentCard key={e.id} e={e} a={list.find(x => x.id === e.assumptionId)} n={num(e.assumptionId)} view={view} send={send}
              editable={isHost || own.has(e.id) || e.ownerId === pid} />
          ))}
        </>
      )}
    </div>
  )
}

function AddAssumption({cards, send, onAdded}: {cards: {id: string; title: string}[]; send: Send; onAdded: (id: string) => void}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [cat, setCat] = useState<AssumptionCategory>('desirability')
  const [link, setLink] = useState('')
  const [err, setErr] = useState<string | null>(null)
  if (!open) return <button style={{alignSelf: 'flex-start'}} onClick={() => setOpen(true)}>+ Предположение</button>
  const submit = async () => {
    const id = newId()
    const c = cards.find(x => x.id === link)
    const r = await send({type: 'assumption.add', id, text, category: cat, linkedCardId: link || undefined, linkedTitle: c?.title})
    setErr(r)
    if (!r) { onAdded(id); setText(''); setLink(''); setOpen(false); toast('Предположение записано') }
  }
  return (
    <div class="card stack">
      <label class="field"><span>Во что мы верим, но не проверили?</span>
        <textarea value={text} maxLength={300} placeholder="Например: студенты готовы платить 199 ₽ в месяц" onInput={e => setText((e.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="field"><span>О чём это</span>
        <div class="row">
          {(Object.keys(CATEGORY_LABEL) as AssumptionCategory[]).map(k => (
            <button key={k} type="button" class={`small ${cat === k ? 'selected' : ''}`} title={CATEGORY_LABEL[k]} onClick={() => setCat(k)}>{CATEGORY_SHORT[k]}</button>
          ))}
        </div>
        <div class="tiny muted" style={{marginTop: 4}}>{CATEGORY_LABEL[cat]}</div>
      </div>
      {cards.length > 0 && (
        <label class="field"><span>На какой карточке держится (необязательно)</span>
          <select value={link} onChange={e => setLink((e.target as HTMLSelectElement).value)}>
            <option value="">— ни на какой —</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
      )}
      <ErrorLine msg={err} />
      <div class="row">
        <button class="primary" disabled={!text.trim()} onClick={submit}>Записать</button>
        <button class="ghost" onClick={() => setOpen(false)}>Отмена</button>
      </div>
    </div>
  )
}

function StatusChip({s}: {s: AssumptionStatus}) {
  const cls = s === 'confirmed' ? 'ok' : s === 'refuted' ? 'bad' : s === 'partly' || s === 'insufficient' ? 'warn' : s === 'testing' ? 'accent' : ''
  return <span class={`chip ${cls}`}>{STATUS_ICON[s]} {STATUS_LABEL[s]}</span>
}

function MiniScale({value, onChange, label}: {value?: number; onChange: (v: number) => void; label: string}) {
  return (
    <span class="row" style={{gap: 3}} title={label}>
      <span class="tiny muted" style={{minWidth: 84}}>{label}</span>
      {[1, 2, 3, 4, 5].map(v => (
        <button key={v} type="button" class={`mini sc${v} ${value != null && Math.round(value) === v ? 'on' : ''}`} onClick={() => onChange(v)}>{v}</button>
      ))}
    </span>
  )
}

function AssumptionCard({a, n, view, send, editable, isHost, onExperiment, expOpen, onExpAdded}: {
  a: Assumption; n: number; view: PublicView; send: Send; editable: boolean; isHost: boolean
  onExperiment: () => void; expOpen: boolean; onExpAdded: (id: string) => void
}) {
  const q = quadrant(a)
  const exps = view.experiments.filter(e => e.assumptionId === a.id)
  const upd = (patch: Record<string, unknown>) =>
    send({type: 'assumption.update', id: a.id, patch} as Action).then(r => { if (r) toast(r, 'error') })
  return (
    <div class={`card stack assumption ${q === 'leap' ? 'leap' : ''}`}>
      <div class="row" style={{alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10}}>
        <span class="rank">{n}</span>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontWeight: 700}}>{a.text}</div>
          <div class="row" style={{gap: 6, marginTop: 6}}>
            <StatusChip s={a.status} />
            <span class="chip">{CATEGORY_SHORT[a.category]}</span>
            {a.linkedTitle && <span class="chip accent" title="На этой карточке держится предположение">🔗 {a.linkedTitle}</span>}
          </div>
        </div>
      </div>
      {q && <div class="small" style={{fontWeight: 700}}>{QUADRANT_LABEL[q]}<span class="muted" style={{fontWeight: 400}}> · важность {a.importance} · доказанность {a.evidence}</span></div>}
      {isHost && view.round == null && (
        <div class="stack" style={{gap: 4}}>
          <MiniScale label="Важность" value={a.importance} onChange={v => upd({importance: v})} />
          <MiniScale label="Доказанность" value={a.evidence} onChange={v => upd({evidence: v})} />
        </div>
      )}
      {a.proof && <div class="small">📎 {a.proof}{a.proofLink && <> · <a href={a.proofLink} target="_blank" rel="noopener noreferrer">источник</a></>}</div>}
      <div class="row">
        {exps.length === 0 && (a.status === 'untested' || a.status === 'testing') && <button class="small primary" onClick={onExperiment}>{expOpen ? 'Свернуть' : '🔬 Как проверим?'}</button>}
        {exps.length > 0 && <span class="tiny muted">Экспериментов: {exps.length}</span>}
        {editable && exps.length > 0 && <button class="small ghost" onClick={onExperiment}>+ ещё эксперимент</button>}
        {editable && (
          <select class="small-select" value={a.status} onChange={e => upd({status: (e.target as HTMLSelectElement).value})} title="Статус вручную">
            {(Object.keys(STATUS_LABEL) as AssumptionStatus[]).map(s => <option key={s} value={s}>{STATUS_ICON[s]} {STATUS_LABEL[s]}</option>)}
          </select>
        )}
        {editable && <button class="small ghost danger" onClick={async () => { if (confirm('Удалить предположение и его эксперименты?')) { const r = await send({type: 'assumption.delete', id: a.id}); if (r) toast(r, 'error') } }}>Удалить</button>}
      </div>
      {expOpen && <ExperimentForm a={a} view={view} send={send} onAdded={onExpAdded} />}
    </div>
  )
}

function ExperimentForm({a, view, send, onAdded}: {a: Assumption; view: PublicView; send: Send; onAdded: (id: string) => void}) {
  const [method, setMethod] = useState<ExperimentMethod>('survey')
  const [audience, setAudience] = useState('')
  const [sampleN, setSampleN] = useState('30')
  const [metric, setMetric] = useState('')
  const [kind, setKind] = useState<'percent' | 'count'>('percent')
  const [threshold, setThreshold] = useState('40')
  const [deadline, setDeadline] = useState('')
  const [owner, setOwner] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const note = marginNote({thresholdKind: kind, threshold: Number(threshold), sampleN: Number(sampleN)})
  const submit = async () => {
    const id = newId()
    const r = await send({
      type: 'experiment.add', id, assumptionId: a.id, method, audience, sampleN: Number(sampleN), metric,
      thresholdKind: kind, threshold: Number(String(threshold).replace(',', '.')), deadline: deadline || undefined, ownerId: owner || undefined
    })
    setErr(r)
    if (!r) { onAdded(id); toast('Эксперимент запланирован') }
  }
  return (
    <div class="test-card stack">
      <div class="small" style={{fontWeight: 800}}>🔬 Тест-карточка: «{a.text}»</div>
      <div class="row">
        {(Object.keys(METHOD_LABEL) as ExperimentMethod[]).map(m => <button key={m} type="button" class={`small ${method === m ? 'selected' : ''}`} onClick={() => setMethod(m)}>{METHOD_LABEL[m]}</button>)}
      </div>
      <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'}}>
        <label class="field"><span>Кого</span><input type="text" value={audience} placeholder="студенты 1–2 курса" onInput={e => setAudience((e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Сколько человек</span><input type="text" inputMode="numeric" value={sampleN} onInput={e => setSampleN((e.target as HTMLInputElement).value)} /></label>
      </div>
      <label class="field"><span>Что считаем (метрика)</span><input type="text" value={metric} placeholder="сколько сталкивались с проблемой за месяц" onInput={e => setMetric((e.target as HTMLInputElement).value)} /></label>
      <div class="field"><span>Порог успеха — считаем подтверждённым, если</span>
        <div class="row">
          <input type="text" inputMode="decimal" style={{width: 90}} value={threshold} onInput={e => setThreshold((e.target as HTMLInputElement).value)} />
          <button type="button" class={`small ${kind === 'percent' ? 'selected' : ''}`} onClick={() => setKind('percent')}>% и больше</button>
          <button type="button" class={`small ${kind === 'count' ? 'selected' : ''}`} onClick={() => setKind('count')}>человек и больше</button>
        </div>
      </div>
      {note && <div class="tiny muted">💡 {note} Чем больше выборка, тем увереннее вывод.</div>}
      <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'}}>
        <label class="field"><span>Срок</span><input type="date" value={deadline} onInput={e => setDeadline((e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Ответственный</span>
          <select value={owner} onChange={e => setOwner((e.target as HTMLSelectElement).value)}>
            <option value="">— не назначен —</option>
            {view.participants.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <ErrorLine msg={err} />
      <button class="primary" style={{alignSelf: 'flex-start'}} onClick={submit}>Запланировать</button>
    </div>
  )
}

function ExperimentCard({e, a, n, view, send, editable}: {e: Experiment; a?: Assumption; n: number; view: PublicView; send: Send; editable: boolean}) {
  const [resN, setResN] = useState(String(e.resultN ?? e.sampleN))
  const [hits, setHits] = useState(e.resultHits != null ? String(e.resultHits) : '')
  const [override, setOverride] = useState<AssumptionStatus | ''>('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [editing, setEditing] = useState(e.resultHits == null)
  const owner = view.participants.find(p => p.id === e.ownerId)?.name
  const preview = hits !== '' ? autoVerdict({...e, resultN: Number(resN), resultHits: Number(hits)}) : null
  const value = e.resultHits != null ? experimentValue(e) : null
  const note = marginNote(e)
  const overdue = e.deadline && !e.verdict && e.deadline < new Date().toISOString().slice(0, 10)
  const save = async () => {
    const r = await send({type: 'experiment.result', id: e.id, resultN: Number(resN), resultHits: Number(hits), override: override || undefined, reason: reason || undefined})
    setErr(r)
    if (!r) { setEditing(false); toast('Результат записан, статус предположения обновлён') }
  }
  return (
    <div class="card stack test-card-view">
      <div class="row between" style={{alignItems: 'flex-start'}}>
        <div style={{minWidth: 0}}>
          <div class="tiny muted">Проверяем №{n}</div>
          <b>{a?.text ?? 'Предположение удалено'}</b>
        </div>
        {e.verdict ? <StatusChip s={e.verdict} /> : <span class={`chip ${overdue ? 'bad' : 'accent'}`}>{overdue ? '⏰ Срок прошёл' : '🔬 Идёт'}</span>}
      </div>
      <div class="small">
        {METHOD_LABEL[e.method]}{e.audience ? ` · ${e.audience}` : ''} · N = {e.sampleN}
        {e.metric && <> · {e.metric}</>}
        <> · успех: {e.thresholdKind === 'percent' ? `≥ ${e.threshold}%` : `≥ ${e.threshold} чел.`}</>
      </div>
      <div class="tiny muted">{owner ? `Ответственный: ${owner}` : 'Ответственный не назначен'}{e.deadline ? ` · срок ${new Date(e.deadline).toLocaleDateString('ru-RU')}` : ''}</div>
      {e.resultHits != null && !editing && (
        <div class="small">
          Факт: <b>{e.resultHits} из {e.resultN}</b>{value != null && e.thresholdKind === 'percent' ? ` (${Math.round(value)}%)` : ''}
          {e.manualReason && <div class="tiny muted">Вывод изменён вручную: {e.manualReason}</div>}
          {note && <div class="tiny muted">💡 {note}</div>}
        </div>
      )}
      {editable && editing && (
        <div class="stack">
          <div class="row">
            <label class="row small">Ответили <input type="text" inputMode="numeric" style={{width: 70}} value={resN} onInput={x => setResN((x.target as HTMLInputElement).value)} /></label>
            <label class="row small">из них подтвердили <input type="text" inputMode="numeric" style={{width: 70}} value={hits} onInput={x => setHits((x.target as HTMLInputElement).value)} /></label>
          </div>
          {preview && <div class="small">Автоматический вывод: <StatusChip s={preview} /></div>}
          {preview && (
            <details class="more"><summary>Не согласны с выводом?</summary>
              <div class="stack" style={{marginTop: 6}}>
                <select value={override} onChange={x => setOverride((x.target as HTMLSelectElement).value as AssumptionStatus | '')}>
                  <option value="">— оставить автоматический —</option>
                  {(['confirmed', 'partly', 'refuted', 'insufficient'] as AssumptionStatus[]).map(s => <option key={s} value={s}>{STATUS_ICON[s]} {STATUS_LABEL[s]}</option>)}
                </select>
                {override && <input type="text" value={reason} placeholder="Почему? (обязательно)" onInput={x => setReason((x.target as HTMLInputElement).value)} />}
              </div>
            </details>
          )}
          <ErrorLine msg={err} />
          <button class="primary small" style={{alignSelf: 'flex-start'}} disabled={hits === ''} onClick={save}>Записать результат</button>
        </div>
      )}
      {editable && !editing && <button class="small ghost" style={{alignSelf: 'flex-start'}} onClick={() => setEditing(true)}>Изменить результат</button>}
    </div>
  )
}

// Карта «важность × доказанность»: левый верх — прыжок веры
function AssumptionMap({list}: {list: Assumption[]}) {
  const pts = list.map((a, i) => ({a, n: i + 1})).filter(x => x.a.importance != null && x.a.evidence != null)
  const W = 420, H = 300, P = 40
  const sx = (v: number) => P + ((v - 1) / 4) * (W - 2 * P)
  const sy = (v: number) => H - P - ((v - 1) / 4) * (H - 2 * P)
  // Совпадающие точки слегка разводим, чтобы номера не слипались
  const seen = new Map<string, number>()
  return (
    <div class="card">
      <h3>Карта предположений</h3>
      <div class="matrix">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Важность и доказанность предположений">
          <rect class="q-leap" x={P} y={P} width={(W - 2 * P) / 2} height={(H - 2 * P) / 2} />
          <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="none" />
          <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} stroke-dasharray="4 4" />
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke-dasharray="4 4" />
          <text x={P + 6} y={P + 16} class="q-title">🎯 прыжок веры</text>
          <text x={W - P - 6} y={P + 16} text-anchor="end" class="q-title">🧱 опора</text>
          <text x={W / 2} y={H - 10} text-anchor="middle">доказанность →</text>
          <text x={12} y={H / 2} text-anchor="middle" transform={`rotate(-90 12 ${H / 2})`}>важность →</text>
          {pts.map(({a, n}) => {
            const k = `${a.importance}|${a.evidence}`
            const dup = seen.get(k) ?? 0
            seen.set(k, dup + 1)
            const x = sx(a.evidence!) + dup * 10, y = sy(a.importance!) - dup * 10
            return (
              <g key={a.id}>
                <circle class={`pt ${a.status === 'refuted' ? 'pt-bad' : a.status === 'confirmed' ? 'pt-ok' : ''}`} cx={x} cy={y} r={13} />
                <text class="pt-label" x={x} y={y + 4} text-anchor="middle">{n}</text>
              </g>
            )
          })}
        </svg>
        <div class="tiny muted">Номер — предположение из списка ниже. Левый верхний угол — важно, но не доказано: проверяйте это первым.</div>
      </div>
    </div>
  )
}

function RoundForm({view, send, onDone}: {view: PublicView; send: Send; onDone: () => void}) {
  const ids = view.round!.ids
  const [vals, setVals] = useState<Record<string, {importance?: number; evidence?: number}>>({})
  const [err, setErr] = useState<string | null>(null)
  const complete = ids.every(id => vals[id]?.importance && vals[id]?.evidence)
  const set = (id: string, k: 'importance' | 'evidence', v: number) => setVals(p => ({...p, [id]: {...p[id], [k]: v}}))
  return (
    <div class="card stack round-card">
      <b>🙈 Оцените предположения вслепую</b>
      <div class="tiny muted">Важность: насколько всё рушится, если это неверно. Доказанность: насколько это уже подтверждено фактами.</div>
      {ids.map(id => {
        const a = view.assumptions.find(x => x.id === id)
        if (!a) return null
        return (
          <div key={id} class="stack" style={{gap: 6, paddingTop: 8, borderTop: '1px dashed var(--border)'}}>
            <div class="small" style={{fontWeight: 700}}>{a.text}</div>
            <MiniScale label="Важность" value={vals[id]?.importance} onChange={v => set(id, 'importance', v)} />
            <MiniScale label="Доказанность" value={vals[id]?.evidence} onChange={v => set(id, 'evidence', v)} />
          </div>
        )
      })}
      <ErrorLine msg={err} />
      <button class="primary" disabled={!complete} onClick={async () => {
        const r = await send({type: 'round.submit', votes: ids.map(id => ({assumptionId: id, importance: vals[id].importance!, evidence: vals[id].evidence!}))})
        setErr(r)
        if (!r) { toast('Оценки отправлены'); onDone() }
      }}>Отправить</button>
    </div>
  )
}

function RoundControl({view, send, single}: {view: PublicView; send: Send; single?: boolean}) {
  const r = view.round
  const active = view.participants.filter(p => p.active)
  if (!r) {
    if (single || view.assumptions.length < 2) return null
    return (
      <div class="card row between">
        <div class="small">Пусть команда оценит важность и доказанность вслепую — так меньше влияния самого уверенного.</div>
        <button class="small primary" onClick={async () => { const e = await send({type: 'round.open'}); if (e) toast(e, 'error') }}>🙈 Оценить вслепую</button>
      </div>
    )
  }
  return (
    <div class="card stack round-card">
      {r.open
        ? <>
          <div class="row between"><b>🙈 Идёт слепая оценка: готовы {r.submitted.length} из {active.length}</b>
            <button class="small primary" disabled={!r.submitted.length} onClick={async () => { const e = await send({type: 'round.reveal'}); if (e) toast(e, 'error') }}>Раскрыть</button>
          </div>
          <div class="tiny muted">Участники видят форму оценки у себя. Средние откроются после «Раскрыть».</div>
        </>
        : <div class="row between">
          <b>Оценки раскрыты — средние перенесены в карту</b>
          <button class="small" onClick={() => send({type: 'round.close'})}>Готово</button>
        </div>}
      {r.revealed && r.averages && (
        <div class="small stack" style={{gap: 2}}>
          {Object.entries(r.averages).filter(([, x]) => x.spreadI >= 3 || x.spreadE >= 3).map(([id]) => (
            <div key={id}>⚡ Спорно: «{view.assumptions.find(a => a.id === id)?.text}» — обсудите, почему оценки разошлись</div>
          ))}
        </div>
      )}
    </div>
  )
}
