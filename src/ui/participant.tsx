// Экран участника. Используется на телефоне, в «Моём голосе» организатора и в режиме «Один экран».
import {useEffect, useMemo, useState} from 'preact/hooks'
import type {Action, PublicCard, PublicView} from '../core/engine'
import {libraryFor} from '../core/library'
import {cardTitle, lintCard, prefillValues, validateCard, type FieldValue} from '../core/template'
import {BASIS_LABEL, type Basis, type Score} from '../core/types'
import {lsGet, lsSet} from '../store/db'
import {AnchorLine, Anchors, Avatars, CardBody, ErrorLine, PhaseIntro, ScoreButtons, Waiting, plural} from './common'
import {toast} from './toast'
import {CardForm} from './cardform'
import {EvolveStep} from './evolve'
import {BoardPanel} from './board'
import {JourneyParticipant} from './journey'
import {hashKey} from '../core/evolve'
import {ResultsView, SummaryView} from './results'
import {PassportView} from './passport'
import {passportFilled} from '../core/passport'

export type Send = (a: Action) => Promise<string | null>

interface Props {
  view: PublicView
  pid: string
  send: Send
  storeKey: string // ключ localStorage для черновиков этого участника
  assignKey?: string // непрозрачный ключ назначений на шаге «Развитие»
}

interface LocalCard {
  id: string
  fields: Record<string, FieldValue>
  basis?: Basis
  sent: boolean
}

interface Local {
  cards: LocalCard[]
  ratings: Record<string, Score | null> // `${round}|${cardId}|${criterionId}`
  bases: Record<string, Basis>
  approvals: string[]
  calib: Record<string, Score | null>
}

const EMPTY: Local = {cards: [], ratings: {}, bases: {}, approvals: [], calib: {}}

function useLocal(key: string): [Local, (f: (l: Local) => Local) => void] {
  const [l, setL] = useState<Local>(() => ({...EMPTY, ...lsGet<Partial<Local>>(key, {})}))
  useEffect(() => { setL({...EMPTY, ...lsGet<Partial<Local>>(key, {})}) }, [key])
  const update = (f: (l: Local) => Local) => setL(prev => {
    const next = f(prev)
    lsSet(key, next)
    return next
  })
  return [l, update]
}

const newId = () => Math.random().toString(36).slice(2, 12)

export function ParticipantStage({view, pid, send, storeKey, assignKey}: Props) {
  const [local, update] = useLocal(storeKey)
  const myCardIds = useMemo(() => new Set(local.cards.map(c => c.id)), [local.cards])
  const isMine = (c: PublicCard) => myCardIds.has(c.id) || c.mergedIds.some(id => myCardIds.has(id))
  const me = view.participants.find(p => p.id === pid)

  if (!me) return <div class="card">Подключаемся к комнате…</div>
  if (!me.active) return <div class="card">Организатор отметил вас как неактивного. Попросите вернуть вас в сессию.</div>

  if (view.template.mode === 'journey' && view.phase !== 'lobby') return <JourneyParticipant view={view} send={send} pid={pid} storeKey={storeKey} />
  switch (view.phase) {
    case 'lobby':
      return (
        <div class="stack">
          <PhaseIntro emoji="👋" title={`Привет, ${me.name}!`}>Вы в комнате. Как только все соберутся, организатор начнёт.</PhaseIntro>
          {passportFilled(view.passport) && <div class="card"><h3>📋 Задание</h3><PassportView p={view.passport!} /><div class="tiny muted" style={{marginTop: 8}}>Задание всегда под рукой — кнопка 📋 вверху экрана.</div></div>}
          <div class="card stack">
            <b>Уже здесь</b>
            <Avatars people={view.participants.filter(p => p.active)} />
          </div>
          <div class="card small muted">Сначала каждый молча пишет свои варианты, потом выбираем критерии и оцениваем вслепую — чужие оценки откроются только в конце.</div>
        </div>
      )
    case 'evolve':
      return <EvolveStep view={view} send={send} pid={pid} assignKey={assignKey ?? hashKey(pid)} storeKey={storeKey} />
    case 'generate':
      return <Generate view={view} local={local} update={update} send={send} pid={pid} />
    case 'merge':
      return <MergeView view={view} send={send} isMine={isMine} />
    case 'criteria':
      return <CriteriaPropose view={view} send={send} />
    case 'calibrate':
      return <Calibrate view={view} local={local} update={update} send={send} pid={pid} />
    case 'shortlist':
      return <Shortlist view={view} local={local} update={update} send={send} pid={pid} isMine={isMine} />
    case 'rate':
    case 'rate2':
      return <Rate view={view} local={local} update={update} send={send} pid={pid} round={view.phase === 'rate2' ? 2 : 1} isMine={isMine} />
    case 'results':
    case 'decide':
      return (
        <div class="stack">
          {view.phase === 'results'
            ? <PhaseIntro emoji="✨" title="Результаты открыты">У спорных ⚡ и «бриллиантов» 💎 можно анонимно добавить аргумент.</PhaseIntro>
            : <PhaseIntro emoji="🤝" title="Команда решает">Организатор отмечает выбранное — следите за значками.</PhaseIntro>}
          <ResultsView view={view} send={send} canArgue pid={pid} />
        </div>
      )
    case 'board':
      return <BoardPanel view={view} />
    case 'summary':
      return <SummaryView view={view} projectTitle={view.title} />
  }
}

type StepProps = {view: PublicView; local: Local; update: (f: (l: Local) => Local) => void; send: Send; pid: string}

function Generate({view, local, update, send}: StepProps) {
  const tpl = view.template
  const [editing, setEditing] = useState<LocalCard | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const limit = view.settings.cardLimit
  const sentCount = local.cards.filter(c => c.sent).length
  const unsent = local.cards.filter(c => !c.sent)

  // Новая карточка сразу получает подстановку из выбранной карточки прошлого этапа
  const blank = (): LocalCard => ({id: newId(), fields: prefillValues(tpl, view.sourceFields), sent: false})
  const draft = editing ?? blank()
  // Обновляем от предыдущего состояния: при автозаполнении несколько полей меняются подряд
  const setField = (k: string, v: FieldValue) => setEditing(prev => {
    const d = prev ?? blank()
    return {...d, fields: {...d.fields, [k]: v}}
  })
  const hints = lintCard(tpl, draft.fields)
  const check = validateCard(tpl, draft.fields)
  const canSave = check.errors.length === 0 && (!tpl.askBasis || !!draft.basis)

  // Повторная отправка карточек, которые не дошли (например, после обрыва связи)
  useEffect(() => {
    if (!unsent.length) return
    let stop = false
    ;(async () => {
      for (const c of unsent) {
        if (stop) return
        const r = await send({type: 'card.upsert', id: c.id, fields: c.fields, basis: c.basis})
        if (!r) update(l => ({...l, cards: l.cards.map(x => (x.id === c.id ? {...x, sent: true} : x))}))
      }
    })()
    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsent.length])

  const save = async () => {
    if (!editing) return
    const card = {...editing, fields: validateCard(tpl, editing.fields).values, sent: false}
    update(l => ({...l, cards: l.cards.some(c => c.id === card.id) ? l.cards.map(c => (c.id === card.id ? card : c)) : [...l.cards, card]}))
    setBusy(true)
    const r = await send({type: 'card.upsert', id: card.id, fields: card.fields, basis: card.basis})
    setBusy(false)
    setErr(r)
    if (!r) {
      update(l => ({...l, cards: l.cards.map(c => (c.id === card.id ? {...c, sent: true} : c))}))
      setEditing(null)
      setFormKey(k => k + 1)
      toast('Карточка отправлена')
    } else if (r.startsWith('Лимит')) {
      update(l => ({...l, cards: l.cards.filter(c => c.id !== card.id || c.sent)}))
    }
  }

  const remove = async (c: LocalCard) => {
    const r = await send({type: 'card.delete', id: c.id})
    if (!r) { update(l => ({...l, cards: l.cards.filter(x => x.id !== c.id)})); toast('Карточка удалена', 'info') }
    setErr(r)
  }

  const others = Object.entries(view.cardCounts).reduce((a, [, n]) => a + n, 0) - sentCount
  return (
    <div class="stack">
      <PhaseIntro emoji="🤫" title={`${tpl.emoji} ${tpl.name}: ваши карточки`}>
        {tpl.intro ? `${tpl.intro} ` : ''}Пишите сами, не советуясь. До {plural(limit, 'карточки', 'карточек', 'карточек')}.
      </PhaseIntro>
      {view.sourceProblem && <div class="note"><b>Исходим из:</b> {view.sourceProblem}</div>}
      <div class="stagger stack">
      {local.cards.map(c => (
        <div class="card" key={c.id}>
          <div class="row between">
            <div style={{flex: 1}}><b>{cardTitle(view.template, c.fields)}</b></div>
            <span class={`chip ${c.sent ? 'ok' : 'warn'}`}>{c.sent ? 'отправлено' : 'отправляется…'}</span>
          </div>
          <div class="row" style={{marginTop: 8}}>
            <button class="small" onClick={() => { setEditing(c); setFormKey(k => k + 1) }}>Изменить</button>
            <button class="small danger" onClick={() => remove(c)}>Удалить</button>
          </div>
        </div>
      ))}
      </div>
      {!editing && local.cards.length >= limit && (
        <div class="card waiting">
          <div class="waiting-check" aria-hidden="true">✓</div>
          <h2>Все карточки написаны</h2>
          <p class="muted">Можно поправить их, пока идёт этот шаг.</p>
        </div>
      )}
      {(editing || local.cards.length < limit) && (
        <div class="card stack">
          <h3>{editing && local.cards.some(c => c.id === editing.id) ? 'Редактирование' : `Новая карточка (${local.cards.length + 1} из ${limit})`}</h3>
          <CardForm key={formKey} tpl={tpl} values={draft.fields} onChange={setField} refOptions={view.refOptions} />
          {tpl.askBasis && (
          <div>
            <div class="small" style={{fontWeight: 700, marginBottom: 6}}>Откуда мы это знаем?</div>
            <div class="row">
              {(Object.keys(BASIS_LABEL) as Basis[]).map(b => (
                <button key={b} type="button" class={`small ${draft.basis === b ? 'selected' : ''}`}
                  onClick={() => setEditing(prev => ({...(prev ?? blank()), basis: b}))}>{BASIS_LABEL[b]}</button>
              ))}
            </div>
          </div>
          )}
          {hints.map(h => <div class="hint" key={h}>💡 {h}</div>)}
          <ErrorLine msg={err} />
          <div class="row">
            <button class="primary" disabled={!canSave || busy} onClick={save}>{busy ? 'Отправляем…' : 'Сохранить карточку'}</button>
            {editing && <button class="ghost" onClick={() => { setEditing(null); setErr(null); setFormKey(k => k + 1) }}>Отмена</button>}
          </div>
          {!canSave && editing && <div class="tiny muted">{check.errors[0] ?? 'Отметьте, откуда это известно.'}</div>}
        </div>
      )}
      <div class="muted small">У остальных уже {plural(Math.max(0, others), 'карточка', 'карточки', 'карточек')}.</div>
    </div>
  )
}

function MergeView({view, send, isMine}: {view: PublicView; send: Send; isMine: (c: PublicCard) => boolean}) {
  const [pick, setPick] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const suggest = async (a: string, b: string) => {
    const r = await send({type: 'merge.suggest', a, b})
    if (r) setMsg(r)
    else toast('Предложение отправлено организатору')
    setPick(null)
  }
  return (
    <div class="stack">
      <PhaseIntro emoji="🧩" title="Все карточки команды">Видите две об одном и том же? Нажмите «Похожа» на обеих — организатор склеит.</PhaseIntro>
      {msg && <div class="error">{msg}</div>}
      {view.cards.map(c => (
        <div class="card" key={c.id} style={pick === c.id ? {outline: '2px solid var(--accent)'} : undefined}>
          <div class="row between" style={{alignItems: 'flex-start'}}>
            <div style={{flex: 1}}><CardBody tpl={view.template} refOptions={view.refOptions} card={c} full /></div>
            {isMine(c) && <span class="chip accent">ваша</span>}
          </div>
          <div style={{marginTop: 8}}>
            {pick === null && <button class="small" onClick={() => setPick(c.id)}>Похожа на другую…</button>}
            {pick === c.id && <button class="small" onClick={() => setPick(null)}>Отмена</button>}
            {pick !== null && pick !== c.id && <button class="small primary" onClick={() => suggest(pick, c.id)}>Это одно и то же</button>}
          </div>
        </div>
      ))}
    </div>
  )
}

function CriteriaPropose({view, send}: {view: PublicView; send: Send}) {
  const [err, setErr] = useState<string | null>(null)
  const [custom, setCustom] = useState({name: '', question: '', a1: '', a3: '', a5: ''})
  const [open, setOpen] = useState(false)
  const present = new Set(view.criteria.map(c => c.fromLibrary).filter(Boolean))
  const lib = libraryFor(view.template.kind).filter(l => !present.has(l.key))
  const propose = async (a: Action) => {
    const r = await send(a)
    setErr(r)
    if (!r) toast('Критерий предложен')
    return r
  }
  return (
    <div class="stack">
      <PhaseIntro emoji="📏" title="По чему оцениваем">Предложите критерий — организатор утвердит итоговый список.</PhaseIntro>
      <div class="card">
        <h3>Текущие критерии</h3>
        {view.criteria.map(c => (
          <div key={c.id} style={{padding: '8px 0', borderBottom: '1px solid var(--border)'}}>
            <div class="row"><b>{c.name || 'Без названия'}</b>
              {c.approved ? <span class="chip ok">утверждён</span> : <span class="chip">предложен</span>}
              {c.weight > 1 && <span class="chip">вес {c.weight}</span>}
              {c.inverted && <span class="chip">меньше — лучше</span>}
            </div>
            {c.question && <div class="small muted">{c.question}</div>}
            {c.anchors[1] && <Anchors c={c} />}
          </div>
        ))}
      </div>
      {lib.length > 0 && (
        <div class="card">
          <h3>Предложить из библиотеки</h3>
          <div class="stack">
            {lib.map(l => (
              <div class="row between" key={l.key}>
                <div style={{flex: 1, minWidth: 180}}><b>{l.name}</b><div class="small muted">{l.question}</div></div>
                <button class="small" onClick={() => propose({type: 'criterion.propose', libraryKey: l.key, name: l.name, question: l.question, anchors: l.anchors})}>Предложить</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div class="card stack">
        {!open ? <button onClick={() => setOpen(true)}>Предложить свой критерий</button> : (
          <>
            <h3>Свой критерий</h3>
            <label class="field"><span>Название *</span><input type="text" value={custom.name} maxLength={60} onInput={e => setCustom({...custom, name: (e.target as HTMLInputElement).value})} /></label>
            <label class="field"><span>Вопрос</span><input type="text" placeholder="Насколько…?" value={custom.question} maxLength={200} onInput={e => setCustom({...custom, question: (e.target as HTMLInputElement).value})} /></label>
            <label class="field"><span>Что значит 1 *</span><input type="text" value={custom.a1} onInput={e => setCustom({...custom, a1: (e.target as HTMLInputElement).value})} /></label>
            <label class="field"><span>Что значит 3</span><input type="text" value={custom.a3} onInput={e => setCustom({...custom, a3: (e.target as HTMLInputElement).value})} /></label>
            <label class="field"><span>Что значит 5 *</span><input type="text" value={custom.a5} onInput={e => setCustom({...custom, a5: (e.target as HTMLInputElement).value})} /></label>
            <div class="tiny muted">Описания 1 и 5 обязательны: без них все понимают шкалу по-разному.</div>
            <button class="primary" disabled={!custom.name.trim() || !custom.a1.trim() || !custom.a5.trim()} onClick={async () => {
              const r = await propose({type: 'criterion.propose', name: custom.name, question: custom.question, anchors: {1: custom.a1, 3: custom.a3 || undefined, 5: custom.a5}})
              if (!r) { setCustom({name: '', question: '', a1: '', a3: '', a5: ''}); setOpen(false) }
            }}>Предложить</button>
          </>
        )}
      </div>
      <ErrorLine msg={err} />
    </div>
  )
}

function Calibrate({view, local, update, send, pid}: StepProps) {
  const crit = view.criteria.filter(c => c.approved)
  const [err, setErr] = useState<string | null>(null)
  const done = view.progress[pid]
  const [again, setAgain] = useState(false)
  const complete = crit.every(c => c.id in local.calib)
  if (!view.calibrationCard) return <div class="card">Нет карточки для калибровки.</div>
  return (
    <div class="stack">
      <PhaseIntro emoji="🎚️" title="Сверяем шкалы">Оцените пробную карточку — это не идёт в итог.</PhaseIntro>
      <div class="card"><CardBody tpl={view.template} refOptions={view.refOptions} card={view.calibrationCard} full /></div>
      {view.calibration ? (
        <div class="card stack">
          <h3>Как оценили все</h3>
          {view.calibration.map(r => {
            const c = crit.find(x => x.id === r.criterionId)
            return c ? (
              <div key={r.criterionId}>
                <div class="row"><b>{c.name}</b>{r.wide ? <span class="chip warn">понимаем по-разному</span> : <span class="chip ok">понимаем одинаково</span>}</div>
                <div class="small muted">Оценки: {r.values.sort().join(', ') || '—'}</div>
                {r.wide && <div class="small">Перечитайте описания 1/3/5 — организатор может их поправить.</div>}
              </div>
            ) : null
          })}
        </div>
      ) : done && !again ? (
        <Waiting view={view} title="Спасибо!" onEdit={() => setAgain(true)} />
      ) : (
        <>
          {crit.map(c => (
            <div class="card" key={c.id}>
              <b>{c.name}</b>
              <div class="small muted" style={{marginBottom: 6}}>{c.question}</div>
              <ScoreButtons value={local.calib[c.id]} onChange={v => update(l => ({...l, calib: {...l.calib, [c.id]: v}}))} />
              <AnchorLine c={c} value={local.calib[c.id]} />
            </div>
          ))}
          <ErrorLine msg={err} />
          <button class="primary" disabled={!complete} onClick={async () => {
            const r = await send({type: 'calib.submit', ratings: crit.map(c => ({criterionId: c.id, value: local.calib[c.id] ?? null}))})
            setErr(r)
            if (!r) { setAgain(false); toast('Отправлено') }
          }}>Отправить</button>
        </>
      )}
    </div>
  )
}

function Shortlist({view, local, update, send, pid, isMine}: StepProps & {isMine: (c: PublicCard) => boolean}) {
  const quota = view.approvalQuota
  const [err, setErr] = useState<string | null>(null)
  const chosen = local.approvals.filter(id => view.cards.some(c => c.id === id))
  const [again, setAgain] = useState(false)
  const toggle = (id: string) => update(l => {
    const has = l.approvals.includes(id)
    if (!has && chosen.length >= quota) return l
    return {...l, approvals: has ? l.approvals.filter(x => x !== id) : [...l.approvals, id]}
  })
  if (view.progress[pid] && !again) return <Waiting view={view} title="Отметки отправлены" onEdit={() => setAgain(true)} editLabel="Изменить выбор" />
  return (
    <div class="stack">
      <PhaseIntro emoji="🎯" title={`Отметьте до ${quota} лучших`}>Отметки других скрыты. Дальше пройдут 5 финалистов.</PhaseIntro>
      {view.cards.map(c => (
        <div class="card" key={c.id} onClick={() => toggle(c.id)} style={{cursor: 'pointer', ...(chosen.includes(c.id) ? {outline: '2px solid var(--accent)'} : {})}}>
          <div class="row between" style={{alignItems: 'flex-start'}}>
            <div style={{flex: 1}}><CardBody tpl={view.template} refOptions={view.refOptions} card={c} /></div>
            <div class="row">{isMine(c) && <span class="chip accent">ваша</span>}<span class="chip">{chosen.includes(c.id) ? '✓ отмечено' : 'отметить'}</span></div>
          </div>
        </div>
      ))}
      <ErrorLine msg={err} />
      <button class="primary" disabled={!chosen.length} onClick={async () => {
        const r = await send({type: 'approve.submit', cardIds: chosen})
        setErr(r)
        if (!r) { setAgain(false); toast('Отметки отправлены') }
      }}>
        Отправить ({chosen.length} из {quota})
      </button>
    </div>
  )
}

// Свой случайный порядок карточек у каждого участника, чтобы порядок не влиял на оценки
function shuffled<T>(xs: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    const j = h % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function Rate({view, local, update, send, pid, round, isMine}: StepProps & {round: 1 | 2; isMine: (c: PublicCard) => boolean}) {
  const crit = view.criteria.filter(c => c.approved)
  const ids = round === 2 ? view.disputedForRound2 : view.finalists
  const cards = useMemo(() => shuffled(ids, pid + round).map(id => view.cards.find(c => c.id === id)).filter(Boolean) as PublicCard[], [ids.join(), pid, round, view.cards])
  const [i, setI] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const key = (cardId: string, critId: string) => `${round}|${cardId}|${critId}`
  const filled = (cardId: string) => crit.every(c => key(cardId, c.id) in local.ratings)
  const complete = cards.every(c => filled(c.id))
  const done = view.progress[pid]
  const [again, setAgain] = useState(false)
  const card = cards[Math.min(i, cards.length - 1)]
  if (!card) return <div class="card">Нет карточек для оценки.</div>

  const submit = async () => {
    setBusy(true)
    const r = await send({
      type: 'rate.submit', round,
      ratings: cards.flatMap(c => crit.map(cr => ({cardId: c.id, criterionId: cr.id, value: local.ratings[key(c.id, cr.id)] ?? null}))),
      bases: round === 1 ? cards.filter(c => local.bases[c.id]).map(c => ({cardId: c.id, basis: local.bases[c.id]})) : []
    })
    setBusy(false)
    setErr(r)
    if (!r) { setAgain(false); toast('Оценки отправлены') }
  }

  if (done && !again) return <Waiting view={view} title="Оценки отправлены" onEdit={() => setAgain(true)} editLabel="Изменить оценки" />

  return (
    <div class="stack">
      {round === 2
        ? <PhaseIntro emoji="🔁" title="Второй раунд">Переоцените спорные карточки — уже после обсуждения.</PhaseIntro>
        : <PhaseIntro emoji="🙈" title="Оцените вслепую">Сами, не советуясь. Чужие оценки скрыты до раскрытия.</PhaseIntro>}
      <div class="row between">
        <span class="small muted">Карточка {i + 1} из {cards.length}</span>
        <div class="row" style={{gap: 4}}>
          {cards.map((c, j) => (
            <button key={c.id} class={`small ${j === i ? 'primary' : filled(c.id) ? 'selected' : ''}`} style={{minWidth: 36, padding: 0}} onClick={() => setI(j)}>{j + 1}</button>
          ))}
        </div>
      </div>
      <div class="card">
        <div class="row between" style={{alignItems: 'flex-start'}}>
          <div style={{flex: 1}}><CardBody tpl={view.template} refOptions={view.refOptions} card={card} full /></div>
          {isMine(card) && <span class="chip accent">ваша</span>}
        </div>
      </div>
      {crit.map(c => (
        <div class="card" key={c.id}>
          <div class="row"><b>{c.name}</b>{c.inverted && <span class="chip">меньше — лучше</span>}</div>
          {c.question && <div class="small muted" style={{marginBottom: 6}}>{c.question}</div>}
          <ScoreButtons value={local.ratings[key(card.id, c.id)]} onChange={v => update(l => ({...l, ratings: {...l.ratings, [key(card.id, c.id)]: v}}))} />
          <AnchorLine c={c} value={local.ratings[key(card.id, c.id)]} />
        </div>
      ))}
      {round === 1 && (
        <div class="card">
          <div class="small" style={{fontWeight: 600, marginBottom: 4}}>На чём основана ваша оценка?</div>
          <div class="row">
            {(Object.keys(BASIS_LABEL) as Basis[]).map(b => (
              <button key={b} class={`small ${local.bases[card.id] === b ? 'selected' : ''}`} onClick={() => update(l => ({...l, bases: {...l.bases, [card.id]: b}}))}>{BASIS_LABEL[b]}</button>
            ))}
          </div>
        </div>
      )}
      <div class="row">
        <button disabled={i === 0} onClick={() => setI(i - 1)}>← Назад</button>
        {i < cards.length - 1 && <button class="primary" onClick={() => setI(i + 1)}>Дальше →</button>}
        <span class="spacer" />
        {(i === cards.length - 1 || complete) && (
          <button class="primary" disabled={!complete || busy} onClick={submit}>{busy ? 'Отправляем…' : 'Отправить оценки'}</button>
        )}
      </div>
      {!complete && <div class="tiny muted">Чтобы отправить, заполните все критерии у всех карточек (можно «Не могу оценить»).</div>}
      <ErrorLine msg={err} />
    </div>
  )
}
