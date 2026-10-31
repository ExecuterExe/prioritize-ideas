// Приложение организатора: проекты, создание этапа, пульт, режим «Один экран».
import {useEffect, useMemo, useRef, useState} from 'preact/hooks'
import {createStage, uid, type Action, type PublicView} from '../core/engine'
import {libraryFor} from '../core/library'
import {BUILTIN_TEMPLATES, BUILTIN_WORKFLOWS, cardSubtitle, cardTitle, isEmpty, type Workflow} from '../core/template'
import {lintCriteria, criterionReady} from '../core/lint'
import {PHASE_LABEL, TAG_LABEL, type Criterion, type Settings, type Stage, type Tag, type TimePreset} from '../core/types'
import {fromB64u, importKey, randomBytes, sha256hex, toB64u} from '../net/crypto'
import {NostrTransport, type RelayState} from '../net/nostr'
import {HostSession} from '../net/session'
import {deleteProject, downloadFile, listProjects, loadProject, lsGet, lsSet, saveProject, withStage, type StoredProject} from '../store/db'
import {Avatar, Avatars, CardBody, ErrorLine, PhaseIntro, PhaseSteps, QR, Ring, Timer, plural, stepLabel} from './common'
import {ParticipantStage} from './participant'
import {ResultsView, SummaryView} from './results'
import {toast} from './toast'
import {TemplatesPage, allTemplates, useTemplates} from './templates'
import {ComplianceCheck, PassportButton, PassportEditSheet, PassportEditor, PassportView} from './passport'
import {EMPTY_PASSPORT, passportFilled, type Passport} from '../core/passport'

declare const __SINGLE__: boolean

const OPEN_KEY = 'pi:host:open'

export function Brand() {
  return (
    <span class="brand">
      <span class="brand-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M5 19v-5M12 19V7M19 19v-9" /></svg>
      </span>
      Приоритизация идей
    </span>
  )
}

const BLIND_PHASES = new Set(['generate', 'calibrate', 'shortlist', 'rate', 'rate2'])

export function HostApp() {
  const [projects, setProjects] = useState<StoredProject[] | null>(null)
  // Открытая сессия запоминается: после случайной перезагрузки страницы возвращаемся в неё
  const resume = lsGet<{p: string; s: string} | null>(OPEN_KEY, null)
  const [openId, setOpenIdRaw] = useState<string | null>(resume?.p ?? null)
  const [stageId, setStageIdRaw] = useState<string | null>(resume?.s ?? null)
  const setOpenId = (v: string | null) => { openIdRef.current = v; setOpenIdRaw(v); if (!v) lsSet(OPEN_KEY, null) }
  const setStageId = (v: string | null) => {
    setStageIdRaw(v)
    lsSet(OPEN_KEY, v && openIdRef.current ? {p: openIdRef.current, s: v} : null)
  }
  const openIdRef = useRef<string | null>(openId)
  openIdRef.current = openId
  const [creating, setCreating] = useState<{project?: StoredProject; fromStageId?: string} | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const refresh = async () => setProjects(await listProjects())
  useEffect(() => { void refresh() }, [])

  if (openId && stageId) {
    return <StageScreen key={stageId} projectId={openId} stageId={stageId}
      onExit={() => { setOpenId(null); setStageId(null); void refresh() }}
      onNextStage={(p, fromStageId) => { setOpenId(null); setStageId(null); setCreating({project: p, fromStageId}) }} />
  }
  if (templatesOpen) return <TemplatesPage onBack={() => setTemplatesOpen(false)} />
  if (creating) {
    return <NewStage init={creating} onCancel={() => setCreating(null)} onCreated={(p, s) => { setCreating(null); setOpenId(p.id); setStageId(s.id) }} />
  }
  return <Home projects={projects} onOpen={(p, s) => { setOpenId(p.id); setStageId(s) }} onNew={() => setCreating({})}
    onNewStage={p => setCreating({project: p, fromStageId: p.stages.at(-1)?.id})} onChanged={refresh} onTemplates={() => setTemplatesOpen(true)} />
}

function Home({projects, onOpen, onNew, onNewStage, onChanged, onTemplates}: {
  projects: StoredProject[] | null
  onOpen: (p: StoredProject, stageId: string) => void
  onNew: () => void
  onNewStage: (p: StoredProject) => void
  onChanged: () => void
  onTemplates: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const importFile = async (f: File) => {
    try {
      const p = JSON.parse(await f.text()) as StoredProject
      if (!p.id || !Array.isArray(p.stages)) throw new Error()
      await saveProject({...p, rooms: p.rooms ?? {}, snapshots: p.snapshots ?? []})
      onChanged()
    } catch { setErr('Не удалось прочитать файл проекта') }
  }
  const restore = async (p: StoredProject, snapId: string) => {
    const snap = p.snapshots.find(s => s.id === snapId)
    if (!snap) return
    const copy: Stage = {...structuredClone(snap.stage), id: uid(), title: `${snap.stage.title} (из черновика)`, version: 1}
    const next = withStage(p, copy)
    await saveProject(next)
    onOpen(next, copy.id)
  }
  return (
    <div class="narrow stack">
      <div class="hero">
        <Brand />
        <h1>Выбираем проблему <span class="grad-text">командой, а не громким голосом</span></h1>
        <p class="muted">Каждый предлагает варианты молча, вы договариваетесь о критериях и оцениваете вслепую — а сервис показывает, где команда согласна, а где спорит.</p>
        <div class="features">
          <div class="feature"><i>🤫</i><div><b>Слепая оценка</b>Чужие оценки скрыты до раскрытия</div></div>
          <div class="feature"><i>⚡</i><div><b>Карта споров</b>Видно, где мнения расходятся</div></div>
          <div class="feature"><i>🧭</i><div><b>Lean Canvas</b>Итог — сразу в канвас</div></div>
        </div>
      </div>
      <div class="row">
        <button class="primary" onClick={onNew}>Новый проект</button>
        <button onClick={() => fileRef.current?.click()}>Открыть файл проекта</button>
        <button class="ghost" onClick={onTemplates}>🧱 Шаблоны карточек</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importFile(f) }} />
      </div>
      <ErrorLine msg={err} />
      {projects === null && <div class="muted">Загрузка…</div>}
      {projects?.length === 0 && <div class="card muted">Проектов пока нет.</div>}
      {projects?.map(p => (
        <div class="card stack project-card" key={p.id}>
          <div class="row between">
            <h2 style={{margin: 0}}>{p.title}</h2>
            <span class="tiny muted">{new Date(p.updatedAt).toLocaleString('ru-RU')}</span>
          </div>
          {p.workflow && <div class="tiny muted">Сценарий «{p.workflow.name}»</div>}
          {p.stages.map(s => (
            <div class="row between stage-row" key={s.id}>
              <div>
                <b>{s.template.emoji} {s.template.name}</b>: {s.title}
                <span class="chip" style={{marginLeft: 6}}>{PHASE_LABEL[s.phase]}</span>
              </div>
              <button class="small" onClick={() => onOpen(p, s.id)}>{s.phase === 'summary' ? 'Открыть' : 'Продолжить'}</button>
            </div>
          ))}
          <div class="row">
            <button class="small" onClick={() => onNewStage(p)}>+ Этап</button>
            <button class="small" onClick={() => downloadFile(`${p.title}.json`, JSON.stringify(p, null, 1))}>Сохранить в файл</button>
            <button class="small danger" onClick={async () => { if (confirm(`Удалить проект «${p.title}»? Это нельзя отменить.`)) { await deleteProject(p.id); onChanged() } }}>Удалить</button>
          </div>
          {p.snapshots.length > 0 && (
            <details>
              <summary class="small muted">Черновики ({p.snapshots.length})</summary>
              <div class="stack small" style={{marginTop: 6}}>
                {[...p.snapshots].reverse().map(sn => (
                  <div class="row between" key={sn.id}>
                    <span>{new Date(sn.at).toLocaleString('ru-RU')} · {sn.stage.title} · до шага «{PHASE_LABEL[sn.phase]}»</span>
                    <button class="small" onClick={() => restore(p, sn.id)}>Восстановить как новый этап</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ))}
      <p class="tiny muted">Данные хранятся только в этом браузере на этом ноутбуке. Сохраняйте важные проекты в файл.</p>
    </div>
  )
}

// Карточки прошлых этапов, на которые можно опереться: выбранные и отложенные
function priorCards(p?: StoredProject) {
  return (p?.stages ?? []).flatMap(st => st.decisions
    .filter(d => d.status === 'chosen' || d.status === 'deferred')
    .map(d => ({stage: st, card: st.cards.find(c => c.id === d.cardId)!, status: d.status}))
    .filter(x => x.card))
}

function NewStage({init, onCancel, onCreated}: {
  init: {project?: StoredProject; fromStageId?: string}
  onCancel: () => void
  onCreated: (p: StoredProject, s: Stage) => void
}) {
  const p = init.project
  const [mine] = useTemplates()
  const templates = allTemplates(mine)
  const [workflowId, setWorkflowId] = useState<string>(p?.workflow?.id ?? 'classic')
  const [custom, setCustom] = useState<string[]>([])
  // Следующий шаблон по сценарию проекта
  const nextInWorkflow = (() => {
    if (!p?.workflow) return undefined
    const last = p.stages.at(-1)?.template.id
    const i = last ? p.workflow.steps.indexOf(last) : -1
    return p.workflow.steps[i + 1]
  })()
  const [templateId, setTemplateId] = useState<string>(nextInWorkflow ?? p?.stages.at(-1)?.template.id ?? 'problem')
  const prior = priorCards(p)
  const fromStage = p?.stages.find(s => s.id === init.fromStageId)
  const defaultSource = prior.find(x => x.stage.id === fromStage?.id && x.status === 'chosen') ?? prior.find(x => x.status === 'chosen')
  const [sourceId, setSourceId] = useState<string>(defaultSource ? `${defaultSource.stage.id}:${defaultSource.card.id}` : '')
  const src = prior.find(x => `${x.stage.id}:${x.card.id}` === sourceId)
  const srcText = (x?: typeof src) => x ? `${cardTitle(x.stage.template, x.card.fields)}${cardSubtitle(x.stage.template, x.card.fields) ? ` (${cardSubtitle(x.stage.template, x.card.fields)})` : ''}` : ''
  const [sourceProblem, setSourceProblem] = useState(srcText(defaultSource))
  const [projectTitle, setProjectTitle] = useState(p?.title ?? '')
  const [title, setTitle] = useState('')
  const [hostName, setHostName] = useState(p?.hostName ?? '')
  const [mode, setMode] = useState<'network' | 'single'>(__SINGLE__ ? 'single' : p?.mode ?? 'network')
  const [settings, setSettings] = useState<Partial<Settings>>({timePreset: 'standard', anonymous: true, cardLimit: 3, excludeAuthor: false, calibration: true, secondRound: true})
  const [passport, setPassport] = useState<Passport>(p?.passport ?? {...EMPTY_PASSPORT})

  const workflow: Workflow | undefined = p
    ? p.workflow
    : workflowId === 'custom'
      ? {id: 'custom', name: 'Свой сценарий', description: '', steps: custom}
      : BUILTIN_WORKFLOWS.find(w => w.id === workflowId)
  const tplId = p ? templateId : workflow?.steps[0]
  const tpl = templates.find(t => t.id === tplId)
  const ok = projectTitle.trim() && hostName.trim() && !!tpl

  const create = async () => {
    if (!tpl) return
    const now = Date.now()
    const project: StoredProject = p ?? {
      id: uid(), title: projectTitle.trim(), createdAt: now, updatedAt: now, stages: [], snapshots: [], rooms: {},
      hostPid: uid(), hostName: hostName.trim(), mode, workflow: workflow ? structuredClone(workflow) : undefined,
      passport: passportFilled(passport) ? passport : undefined
    }
    const s = createStage({
      projectId: project.id, template: tpl, now, settings, passport: project.passport,
      title: title.trim() || tpl.name,
      sourceProblem: sourceProblem.trim() || undefined,
      sourceFields: src?.card.fields,
      refOptions: prior.map(x => ({id: x.card.id, title: `${x.stage.template.emoji} ${cardTitle(x.stage.template, x.card.fields)}`}))
    })
    let next = withStage({...project, title: projectTitle.trim(), hostName: hostName.trim(), mode}, s)
    // Одна комната на проект: участники остаются подключены и сами переходят в новый этап
    const prevRoom = Object.values(next.rooms).at(-1)
    if (mode === 'network') next = {...next, rooms: {...next.rooms, [s.id]: prevRoom ?? {roomId: toB64u(randomBytes(12)), key: toB64u(randomBytes(32))}}}
    await saveProject(next)
    onCreated(next, s)
  }
  const set = (patch: Partial<Settings>) => setSettings({...settings, ...patch})
  const tplName = (id: string) => { const t = templates.find(x => x.id === id); return t ? `${t.emoji} ${t.name}` : '?' }
  return (
    <div class="narrow stack phase-enter">
      <h1>{p ? 'Новый этап' : 'Новый проект'}</h1>
      {!p && (
        <div class="card stack">
          <label class="field"><span>Название проекта</span><input type="text" value={projectTitle} placeholder="Например: Инноватика, задание 1" onInput={e => setProjectTitle((e.target as HTMLInputElement).value)} /></label>
          <label class="field"><span>Ваше имя (вы тоже участник)</span><input type="text" value={hostName} onInput={e => setHostName((e.target as HTMLInputElement).value)} /></label>
        </div>
      )}
      {!p && (
        <div class="card stack">
          <h3>Сценарий работы</h3>
          <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))'}}>
            {BUILTIN_WORKFLOWS.map(w => (
              <button key={w.id} class={`choice-card ${workflowId === w.id ? 'selected' : ''}`} onClick={() => setWorkflowId(w.id)}>
                <b>{w.name}</b>
                <small>{w.steps.map(tplName).join(' → ')}</small>
                <small>{w.description}</small>
              </button>
            ))}
            <button class={`choice-card ${workflowId === 'custom' ? 'selected' : ''}`} onClick={() => setWorkflowId('custom')}>
              <b>Свой сценарий</b>
              <small>Соберите цепочку этапов из любых шаблонов</small>
            </button>
          </div>
          {workflowId === 'custom' && (
            <div class="stack">
              <div class="row">
                {custom.length === 0 && <span class="muted small">Добавьте этапы по порядку:</span>}
                {custom.map((id, i) => (
                  <span class="chip accent" key={i}>{i + 1}. {tplName(id)} <button class="ghost small" style={{minHeight: 0, padding: 0}} aria-label="Убрать" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>✕</button></span>
                ))}
              </div>
              <div class="row">
                {templates.map(t => <button class="small" key={t.id} onClick={() => setCustom([...custom, t.id])}>+ {t.emoji} {t.name}</button>)}
              </div>
            </div>
          )}
        </div>
      )}
      {p && (
        <div class="card stack">
          <h3>Шаблон этапа</h3>
          {nextInWorkflow && <div class="tiny muted">По сценарию «{p.workflow!.name}» дальше: {tplName(nextInWorkflow)}</div>}
          <div class="row">
            {templates.map(t => <button key={t.id} class={`small ${templateId === t.id ? 'selected' : ''}`} onClick={() => setTemplateId(t.id)}>{t.emoji} {t.name}</button>)}
          </div>
        </div>
      )}
      {!p && (
        <details class="card more" open={passportFilled(passport)}>
          <summary>📋 Паспорт задания (необязательно, но очень помогает)</summary>
          <div class="tiny muted" style={{margin: '6px 0 10px'}}>Команда увидит условия задания на всех шагах; ограничения можно сделать критериями, а на шаге «Решение» проверить соответствие.</div>
          <PassportEditor value={passport} onChange={setPassport} />
        </details>
      )}
      {tpl && (
        <div class="card stack">
          <div class="row between"><h3 style={{margin: 0}}>{p ? "Этап" : "Первый этап"}: {tpl.emoji} {tpl.name}</h3></div>
          <div class="tiny muted">Поля: {tpl.fields.map(f => f.label + (f.required ? '*' : '')).join(' · ')}</div>
          {prior.length > 0 && (
            <label class="field"><span>Исходим из карточки прошлого этапа</span>
              <select value={sourceId} onChange={e => {
                const v = (e.target as HTMLSelectElement).value
                setSourceId(v)
                setSourceProblem(srcText(prior.find(x => `${x.stage.id}:${x.card.id}` === v)))
              }}>
                <option value="">— без исходной карточки —</option>
                {prior.map(x => <option key={`${x.stage.id}:${x.card.id}`} value={`${x.stage.id}:${x.card.id}`}>{x.status === 'chosen' ? '✅' : '⏸'} {x.stage.template.emoji} {cardTitle(x.stage.template, x.card.fields)}</option>)}
              </select>
            </label>
          )}
          <label class="field"><span>Контекст для участников (необязательно)</span>
            <textarea value={sourceProblem} placeholder="Например: проблема, для которой ищем идеи" onInput={e => setSourceProblem((e.target as HTMLTextAreaElement).value)} />
          </label>
          {src && tpl.fields.some(f => f.prefill && !isEmpty(src.card.fields[f.prefill])) && (
            <div class="tiny muted">Подставится из исходной карточки: {tpl.fields.filter(f => f.prefill && !isEmpty(src.card.fields[f.prefill])).map(f => `«${f.label}»`).join(', ')}.</div>
          )}
          <label class="field"><span>Название этапа (необязательно)</span><input type="text" value={title} placeholder={tpl.name} onInput={e => setTitle((e.target as HTMLInputElement).value)} /></label>
        </div>
      )}
      <div class="card stack">
        <h3>Как работаем</h3>
        {!__SINGLE__ && (
          <div class="row">
            <button class={mode === 'network' ? 'selected' : ''} disabled={!!p} onClick={() => setMode('network')}>📱 С телефонов</button>
            <button class={mode === 'single' ? 'selected' : ''} disabled={!!p} onClick={() => setMode('single')}>💻 Один экран</button>
          </div>
        )}
        <div class="small muted">{mode === 'network'
          ? 'Участники заходят по QR-коду со своих телефонов. Нужен интернет.'
          : 'Все работают на этом ноутбуке по очереди; чужие оценки скрыты. Интернет не нужен.'}</div>
        <div>
          <div class="small" style={{fontWeight: 600, marginBottom: 4}}>Время</div>
          <div class="row">
            {([['express', 'Экспресс ≈20 мин'], ['standard', 'Стандарт ≈45 мин'], ['none', 'Без таймера']] as [TimePreset, string][]).map(([k, l]) => (
              <button key={k} class={settings.timePreset === k ? 'selected' : ''} onClick={() => set({timePreset: k})}>{l}</button>
            ))}
          </div>
          {settings.timePreset === 'express' && <div class="tiny muted">В «Экспрессе» нет калибровки и второго раунда.</div>}
        </div>
        <SettingsFields settings={settings as Settings} onChange={set} />
      </div>
      <div class="row">
        <button class="primary" disabled={!ok} onClick={create}>Создать</button>
        <button class="ghost" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  )
}

function SettingsFields({settings, onChange}: {settings: Settings; onChange: (p: Partial<Settings>) => void}) {
  const express = settings.timePreset === 'express'
  return (
    <div class="stack">
      <label class="check"><input type="checkbox" checked={settings.anonymous} onChange={e => onChange({anonymous: (e.target as HTMLInputElement).checked})} />Анонимные авторы карточек</label>
      <label class="check"><input type="checkbox" checked={settings.excludeAuthor} onChange={e => onChange({excludeAuthor: (e.target as HTMLInputElement).checked})} />Не учитывать оценку автора его же карточки</label>
      <label class="check"><input type="checkbox" checked={settings.calibration && !express} disabled={express} onChange={e => onChange({calibration: (e.target as HTMLInputElement).checked})} />Калибровка шкал (2 мин)</label>
      <label class="check"><input type="checkbox" checked={settings.secondRound && !express} disabled={express} onChange={e => onChange({secondRound: (e.target as HTMLInputElement).checked})} />Второй раунд по спорным</label>
      <label class="row small">Карточек на человека:
        <select style={{width: 'auto'}} value={settings.cardLimit} onChange={e => onChange({cardLimit: Number((e.target as HTMLSelectElement).value)})}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  )
}

// ——— Экран этапа ———

function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const req = async () => { try { lock = await navigator.wakeLock.request('screen') } catch { /* нет разрешения */ } }
    const onVis = () => { if (document.visibilityState === 'visible') void req() }
    void req()
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release() }
  }, [active])
}

function StageScreen({projectId, stageId, onExit, onNextStage}: {projectId: string; stageId: string; onExit: () => void; onNextStage: (p: StoredProject, fromStageId: string) => void}) {
  const [project, setProject] = useState<StoredProject | null>(null)
  const [session, setSession] = useState<HostSession | null>(null)
  const [transport, setTransport] = useState<NostrTransport | null>(null)
  const [joinUrl, setJoinUrl] = useState('')
  const projectRef = useRef<StoredProject | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    let sess: HostSession | null = null
    let cancelled = false
    ;(async () => {
      const p = await loadProject(projectId)
      if (cancelled) return
      const stage = p?.stages.find(s => s.id === stageId)
      if (!p || !stage) { onExit(); return }
      projectRef.current = p
      setProject(p)
      const persist = (s: Stage) => {
        projectRef.current = {...withStage(projectRef.current!, s), passport: s.passport ?? projectRef.current!.passport}
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => { void saveProject(projectRef.current!); setProject(projectRef.current) }, 300)
      }
      const room = p.rooms[stageId]
      if (p.mode === 'network' && room && !__SINGLE__) {
        const key = await importKey(fromB64u(room.key))
        const tag = (await sha256hex(`pi:${room.roomId}`)).slice(0, 16)
        const t = new NostrTransport(tag)
        sess = new HostSession(stage, persist, t, key)
        setTransport(t)
        const base = location.href.split('#')[0].split('?')[0]
        setJoinUrl(`${base}#j=${room.roomId}.${room.key}`)
        await sess.start()
      } else {
        sess = new HostSession(stage, persist)
      }
      if (cancelled) { sess.close(); return }
      // Организатор — тоже участник
      if (!stage.participants.some(x => x.id === p.hostPid)) sess.dispatch({type: 'hello', name: p.hostName}, p.hostPid)
      setSession(sess)
    })()
    return () => {
      cancelled = true
      sess?.close()
      if (projectRef.current) void saveProject(projectRef.current)
    }
  }, [projectId, stageId])

  useWakeLock(!!session)

  if (!project || !session) return <div class="wrap">Загрузка…</div>
  return <StageUI project={project} session={session} transport={transport} joinUrl={joinUrl} onExit={onExit} onNextStage={onNextStage} />
}

type Tab = 'panel' | 'me' | 'diag'

function StageUI({project, session, transport, joinUrl, onExit, onNextStage}: {
  project: StoredProject; session: HostSession; transport: NostrTransport | null; joinUrl: string
  onExit: () => void; onNextStage: (p: StoredProject, fromStageId: string) => void
}) {
  const view = session.view.value
  const stage = session.stage.value
  const single = project.mode === 'single' || __SINGLE__
  const [tab, setTab] = useState<Tab>('panel')
  const [projector, setProjector] = useState(false)
  const [editPassport, setEditPassport] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const hostPid = project.hostPid

  const host = (a: Action) => { const r = session.dispatch(a, hostPid, true); setErr(r); return r }
  const asParticipant = (pid: string) => (a: Action) => Promise.resolve(session.dispatch(a, pid, pid === hostPid))

  const active = stage.participants.filter(p => p.active)
  const submitted = active.filter(p => view.progress[p.id]).length
  const showsProgress = ['calibrate', 'shortlist', 'rate', 'rate2'].includes(view.phase)

  const next = () => {
    if ((view.phase === 'rate' || view.phase === 'rate2') && submitted < active.length &&
      !confirm(`Отправили ${submitted} из ${active.length}. Открыть результаты без остальных?`)) return
    if (view.phase === 'generate' && single === false) {
      const silent = active.filter(p => !view.cardCounts[p.id])
      if (silent.length && !confirm(`Без карточек: ${silent.map(p => p.name).join(', ')}. Идём дальше?`)) return
    }
    host({type: 'phase.next'})
  }

  const myTurn = !single && BLIND_PHASES.has(view.phase) && (view.phase === 'generate' ? !view.cardCounts[hostPid] : !view.progress[hostPid])

  return (
    <div class={projector ? 'projector' : ''}>
      <div class="topbar">
        <div class="inner bar-main">
          <button class="ghost icon-btn no-print" onClick={onExit} title="К проектам" aria-label="К проектам">←</button>
          <div style={{minWidth: 0}}>
            <div class="step-label">{stepLabel(view)} · {view.template.emoji} {view.template.name}</div>
            <div class="phase-title">{PHASE_LABEL[view.phase]}</div>
          </div>
          <span class="spacer" />
          <PassportButton p={view.passport} onEdit={() => setEditPassport(true)} />
          {view.deadline && (
            <span class="row" style={{gap: 4}}>
              <Timer deadline={view.deadline} />
              <button class="ghost icon-btn small no-print" title="Добавить 2 минуты" onClick={() => { host({type: 'deadline.extend', minutes: 2}); toast('+2 минуты', 'info') }}>+2</button>
            </span>
          )}
          {showsProgress && <Ring value={submitted} total={active.length} size={40} />}
          {!single && <span title={`Связь: ${session.netStatus.value === 'online' ? 'отличная' : session.netStatus.value === 'degraded' ? 'слабая' : 'нет'}`}><span class={`dot ${session.netStatus.value}`} /></span>}
          {view.canGoBack && <button class="ghost icon-btn no-print" title="Вернуться на шаг назад" aria-label="Назад" onClick={() => host({type: 'phase.back'})}>↶</button>}
          {view.advanceBlock && view.phase !== 'summary' && <span class="block-hint no-print">{view.advanceBlock}</span>}
          {view.phase !== 'summary' && (
            <button class="primary next-btn no-print" disabled={!!view.advanceBlock} onClick={next}>
              {view.phase === 'rate' || view.phase === 'rate2' ? 'Раскрыть ✨' : 'Дальше →'}
            </button>
          )}
        </div>
        <div class="inner bar-progress"><PhaseSteps view={view} /></div>
      </div>
      {editPassport && <PassportEditSheet value={view.passport} onClose={() => setEditPassport(false)}
        onSave={pp => { if (!host({type: 'passport.update', passport: pp})) toast('Задание обновлено у всех') }} />}
      <div class="wrap stack">
        <ErrorLine msg={err} />
        {!projector && (
          <div class="row between no-print">
            <div class="tabs">
              <button class={tab === 'panel' ? 'on' : ''} onClick={() => setTab('panel')}>{single ? 'Сессия' : 'Команда'}</button>
              {!single && <button class={tab === 'me' ? 'on' : ''} onClick={() => setTab('me')}>Мой голос{myTurn ? ' •' : ''}</button>}
              {!single && <button class={tab === 'diag' ? 'on' : ''} onClick={() => setTab('diag')}>Связь</button>}
            </div>
            <button class="ghost small" onClick={() => setProjector(true)} title="Крупный шрифт для проектора">⛶ Большой экран</button>
          </div>
        )}
        {projector && <button class="small ghost no-print" onClick={() => setProjector(false)}>Обычный режим</button>}
        {myTurn && tab === 'panel' && (
          <button class="note no-print" style={{justifyContent: 'flex-start', textAlign: 'left', border: 0, width: '100%', cursor: 'pointer', fontWeight: 600, borderRadius: 'var(--radius-sm)'}} onClick={() => setTab('me')}>
            Вы тоже участник — ваш ход во вкладке «Мой голос» →
          </button>
        )}
        <div class="phase-enter" key={`${view.phase}-${tab}`}>
          {tab === 'panel' && (single
            ? <SingleScreen view={view} stage={stage} host={host} asParticipant={asParticipant} project={project} onNextStage={onNextStage} />
            : <HostPanel view={view} stage={stage} host={host} joinUrl={joinUrl} project={project} projector={projector} onNextStage={onNextStage} />)}
          {tab === 'me' && !single && <ParticipantStage view={view} pid={hostPid} send={asParticipant(hostPid)} storeKey={`pi:me:${stage.id}:${hostPid}`} />}
          {tab === 'diag' && transport && <Diagnostics transport={transport} />}
        </div>
      </div>
    </div>
  )
}

function NextStageButton({project, view, onNextStage}: {project: StoredProject; view: PublicView; onNextStage: (p: StoredProject, fromStageId: string) => void}) {
  if (!view.decisions.some(d => d.status === 'chosen')) return null
  const steps = project.workflow?.steps ?? []
  const next = steps[steps.indexOf(view.template.id) + 1]
  const label = next ? `Дальше по сценарию: ${BUILTIN_TEMPLATES.find(t => t.id === next)?.name ?? 'следующий этап'} →` : 'Новый этап на основе выбранного →'
  return <button class="primary no-print" onClick={() => onNextStage(project, view.stageId)}>{label}</button>
}

function Progress({view, stage}: {view: PublicView; stage: Stage}) {
  const active = stage.participants.filter(p => p.active)
  const done = active.filter(p => view.progress[p.id]).length
  return (
    <div class="card stack">
      <div class="row between">
        <b>{done === active.length ? 'Все отправили 🎉' : `Готовы ${done} из ${active.length}`}</b>
        <span class="tiny muted">видно, кто отправил, но не что</span>
      </div>
      <Avatars people={active} doneIds={view.progress} />
    </div>
  )
}

function HostPanel({view, stage, host, joinUrl, project, projector, onNextStage}: {
  view: PublicView; stage: Stage; host: (a: Action) => string | null; joinUrl: string; project: StoredProject; projector: boolean
  onNextStage: (p: StoredProject, fromStageId: string) => void
}) {
  switch (view.phase) {
    case 'lobby':
      return (
        <div class="stack">
        <PhaseIntro emoji="👋" title="Собираем команду">Покажите QR-код или отправьте ссылку в чат. Когда все появятся — жмите «Дальше».</PhaseIntro>
        {passportFilled(view.passport) && <div class="card"><h3>📋 Задание</h3><PassportView p={view.passport!} /></div>}
        <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'}}>
          <div class="card stack center">
            <h2>Наведите камеру</h2>
            <div class="row" style={{justifyContent: 'center'}}><QR text={joinUrl} /></div>
            <CopyLink url={joinUrl} />
            <div class="tiny muted">Ключ шифрования — в части ссылки после «#». Отправляйте ссылку только своей команде.</div>
          </div>
          <div class="stack">
            <Participants stage={stage} host={host} />
            {!projector && <details class="card more"><summary>Настройки сессии</summary><div style={{marginTop: 8}}><SettingsFields settings={stage.settings} onChange={patch => host({type: 'settings.update', patch})} /></div></details>}
          </div>
        </div>
        </div>
      )
    case 'generate':
      return (
        <div class="stack">
          <PhaseIntro emoji="🤫" title="Тихо пишем">Каждый сам, без обсуждения. Чужие карточки откроются на следующем шаге.</PhaseIntro>
          <div class="card stack">
            <b>Карточек написано: {Object.values(view.cardCounts).reduce((a, b) => a + b, 0)}</b>
            <div class="avatars">
              {stage.participants.filter(p => p.active).map(p => (
                <span class="avatar-item" key={p.id}>
                  <Avatar name={p.name} dim={!view.cardCounts[p.id]} />
                  <span class="avatar-name">{p.name} · {view.cardCounts[p.id] ?? 0}</span>
                </span>
              ))}
            </div>
          </div>
          {!projector && <details class="card more"><summary>Опоздавшие — QR для входа</summary><div class="row" style={{justifyContent: 'center', marginTop: 8}}><div style={{width: 180}}><QR text={joinUrl} /></div></div></details>}
        </div>
      )
    case 'merge':
      return <MergePanel view={view} host={host} />
    case 'criteria':
      return <CriteriaPanel view={view} stage={stage} host={host} />
    case 'calibrate':
      return <CalibratePanel view={view} stage={stage} host={host} />
    case 'shortlist':
      return (
        <div class="stack">
          <PhaseIntro emoji="🎯" title="Быстрый отбор">Карточек много — каждый отмечает лучшие. Дальше пройдут 5 финалистов.</PhaseIntro>
          <Progress view={view} stage={stage} />
        </div>
      )
    case 'rate':
    case 'rate2':
      return (
        <div class="stack">
          {view.phase === 'rate2'
            ? <PhaseIntro emoji="🔁" title="Второй раунд">После обсуждения переоцениваем только спорные карточки.</PhaseIntro>
            : <PhaseIntro emoji="🙈" title="Оцениваем вслепую">Никто не видит чужих оценок. Когда все отправят — жмите «Раскрыть».</PhaseIntro>}
          <Progress view={view} stage={stage} />
        </div>
      )
    case 'results':
      return <ResultsPanel view={view} host={host} />
    case 'decide':
      return <DecidePanel view={view} host={host} />
    case 'summary':
      return <SummaryView view={view} projectTitle={project.title} extra={
        <div class="row no-print">
          <NextStageButton project={project} view={view} onNextStage={onNextStage} />
          <button onClick={() => downloadFile(`${project.title}.json`, JSON.stringify(project, null, 1))}>Сохранить проект в файл</button>
        </div>
      } />
  }
}

function CopyLink({url}: {url: string}) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(url); setOk(true) } catch { prompt('Скопируйте ссылку', url) } }}>
      {ok ? 'Ссылка скопирована ✓' : 'Скопировать ссылку для чата'}
    </button>
  )
}

function Participants({stage, host, compact}: {stage: Stage; host: (a: Action) => string | null; compact?: boolean}) {
  const now = Date.now()
  return (
    <div class="card stack">
      <b>В комнате: {stage.participants.filter(p => p.active).length}</b>
      {stage.participants.length === 0 && <div class="muted small">Пока никого — ждём первых.</div>}
      <Avatars people={stage.participants.filter(p => p.active)} />
      {!compact && stage.participants.length > 0 && (
      <details class="more"><summary>Управление участниками</summary>
      <div class="stack" style={{marginTop: 8}}>
        {stage.participants.map(p => (
          <div class="row between" key={p.id}>
            <span>
              <span class={`dot ${now - p.lastSeen < 60_000 ? 'online' : 'degraded'}`} /> {p.name} <span class="tiny muted">{p.alias}</span>
              {!p.active && <span class="chip" style={{marginLeft: 6}}>неактивен</span>}
            </span>
            {<button class="small" onClick={() => host({type: 'participant.setActive', id: p.id, active: !p.active})}>{p.active ? 'Убрать' : 'Вернуть'}</button>}
          </div>
        ))}
      </div>
      <div class="tiny muted" style={{marginTop: 6}}>«Убрать» — человек ушёл: его не ждём при подсчёте «все отправили».</div>
      </details>
      )}
    </div>
  )
}

function MergePanel({view, host}: {view: PublicView; host: (a: Action) => string | null}) {
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const title = (id: string) => { const c = view.cards.find(x => x.id === id); return c ? cardTitle(view.template, c.fields) : '?' }
  const merge = (into: string, from: string) => { host({type: 'merge', into, from}); setPick(null) }
  return (
    <div class="stack">
      <PhaseIntro emoji="🧩" title="Склеиваем дубли">Перетащите карточку на похожую — или «Склеить с…». Отменить можно до оценки.</PhaseIntro>
      {view.mergeSuggestions.length > 0 && (
        <div class="card stack">
          <h3>Участники предлагают склеить</h3>
          {view.mergeSuggestions.map(m => (
            <div class="row between" key={m.a + m.b}>
              <span class="small">«{title(m.a)}» + «{title(m.b)}»</span>
              <span class="row"><button class="small primary" onClick={() => merge(m.a, m.b)}>Склеить</button><button class="small" onClick={() => host({type: 'suggestion.dismiss', a: m.a, b: m.b})}>Нет</button></span>
            </div>
          ))}
        </div>
      )}
      <div class="grid">
        {view.cards.map(c => (
          <div key={c.id} class={`card merge-card ${over === c.id ? 'drag-over' : ''}`} draggable
            onDragStart={() => setDrag(c.id)} onDragEnd={() => { setDrag(null); setOver(null) }}
            onDragOver={e => { e.preventDefault(); if (drag && drag !== c.id) setOver(c.id) }}
            onDragLeave={() => setOver(null)}
            onDrop={e => { e.preventDefault(); if (drag && drag !== c.id) merge(c.id, drag); setOver(null) }}>
            <CardBody tpl={view.template} refOptions={view.refOptions} card={c} full />
            <div class="row" style={{marginTop: 8}}>
              {pick === null && <button class="small" onClick={() => setPick(c.id)}>Склеить с…</button>}
              {pick === c.id && <button class="small" onClick={() => setPick(null)}>Отмена</button>}
              {pick !== null && pick !== c.id && <button class="small primary" onClick={() => merge(c.id, pick)}>Сюда</button>}
              {c.mergedIds.map((id, i) => (
                <button key={id} class="small ghost" onClick={() => host({type: 'unmerge', id: c.id, childId: id})}>Разделить «{cardTitle(view.template, c.mergedTexts[i]).slice(0, 20)}…»</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div class="muted small">Итого: {plural(view.cards.length, 'карточка', 'карточки', 'карточек')}{view.cards.length > 6 ? ' — будет быстрый отбор до 5 финалистов' : ''}.</div>
    </div>
  )
}

function CriteriaPanel({view, stage, host}: {view: PublicView; stage: Stage; host: (a: Action) => string | null}) {
  const hints = lintCriteria(view.template.kind, view.criteria)
  const present = new Set(view.criteria.map(c => c.fromLibrary).filter(Boolean))
  const lib = libraryFor(view.template.kind).filter(l => !present.has(l.key))
  const name = (pid?: string) => stage.participants.find(p => p.id === pid)?.name
  return (
    <div class="stack">
      <PhaseIntro emoji="📏" title="По чему оцениваем">Утвердите 3–4 критерия. Предложения команды появляются здесь.</PhaseIntro>
      {view.passport && [...view.passport.constraints, ...view.passport.mustHave].length > 0 && (
        <div class="card stack">
          <b>Из задания</b>
          <div class="tiny muted">Сделайте условие критерием «Соответствие: …», если важно, чтобы карточки его выполняли.</div>
          {[...view.passport.constraints, ...view.passport.mustHave].map(t => {
            const added = view.criteria.some(c => c.name === `Соответствие: ${t}`.slice(0, 60))
            return (
              <div class="row between" key={t}>
                <span class="small">{t}</span>
                <button class="small" disabled={added} onClick={() => host({type: 'criterion.addFromPassport', text: t})}>{added ? 'Добавлен ✓' : 'Сделать критерием'}</button>
              </div>
            )
          })}
        </div>
      )}
      {hints.map(h => <div class="hint" key={h}>💡 {h}</div>)}
      {view.criteria.map(c => <CriterionEditor key={c.id} c={c} host={host} proposer={name(c.proposedBy)} />)}
      <div class="card">
        <h3>Добавить</h3>
        <div class="row">
          {lib.map(l => <button class="small" key={l.key} title={l.question} onClick={() => host({type: 'criterion.addLibrary', key: l.key})}>+ {l.name}</button>)}
          <button class="small" onClick={() => host({type: 'criterion.addCustom'})}>+ Свой критерий</button>
        </div>
      </div>
    </div>
  )
}

function CriterionEditor({c, host, proposer}: {c: Criterion; host: (a: Action) => string | null; proposer?: string}) {
  const upd = (patch: Partial<Criterion>) => host({type: 'criterion.update', id: c.id, patch})
  const ready = criterionReady(c)
  return (
    <div class="card stack" style={c.approved ? undefined : {opacity: .85, borderStyle: 'dashed'}}>
      <div class="row between">
        <div class="row">
          {c.approved ? <span class="chip ok">утверждён</span> : <span class="chip">предложение{proposer ? ` от ${proposer}` : ''}</span>}
          {!ready && <span class="chip warn">нет описаний 1 и 5</span>}
        </div>
        <div class="row">
          <button class={`small ${c.approved ? '' : 'primary'}`} onClick={() => upd({approved: !c.approved})}>{c.approved ? 'Снять' : 'Утвердить'}</button>
          <button class="small danger" onClick={() => host({type: 'criterion.remove', id: c.id})}>Удалить</button>
        </div>
      </div>
      <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'}}>
        <label class="field"><span>Название</span><input type="text" value={c.name} maxLength={60} onChange={e => upd({name: (e.target as HTMLInputElement).value})} /></label>
        <label class="field"><span>Вопрос</span><input type="text" value={c.question} maxLength={200} onChange={e => upd({question: (e.target as HTMLInputElement).value})} /></label>
      </div>
      <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'}}>
        {([1, 3, 5] as const).map(k => (
          <label class="field" key={k}><span>{k} — это…{k !== 3 ? ' *' : ''}</span>
            <input type="text" value={c.anchors[k] ?? ''} onChange={e => upd({anchors: {...c.anchors, [k]: (e.target as HTMLInputElement).value}})} />
          </label>
        ))}
      </div>
      <div class="row small">
        <label class="row">Вес
          <select style={{width: 'auto'}} value={c.weight} onChange={e => upd({weight: Number((e.target as HTMLSelectElement).value) as 1 | 2 | 3})}>
            <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
          </select>
        </label>
        <label class="row">Метка
          <select style={{width: 'auto'}} value={c.tag ?? ''} onChange={e => upd({tag: ((e.target as HTMLSelectElement).value || undefined) as Tag | undefined})}>
            <option value="">—</option>
            {(Object.keys(TAG_LABEL) as Tag[]).map(t => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}
          </select>
        </label>
        <label class="check"><input type="checkbox" checked={c.inverted} onChange={e => upd({inverted: (e.target as HTMLInputElement).checked})} />меньше — лучше</label>
      </div>
    </div>
  )
}

function CalibratePanel({view, stage, host}: {view: PublicView; stage: Stage; host: (a: Action) => string | null}) {
  return (
    <div class="stack">
      <PhaseIntro emoji="🎚️" title="Сверяем шкалы">Все оценивают одну пробную карточку — она не идёт в итог.</PhaseIntro>
      {view.calibrationCard && <div class="card"><CardBody tpl={view.template} refOptions={view.refOptions} card={view.calibrationCard} full /></div>}
      {!view.calibration && <Progress view={view} stage={stage} />}
      {!view.calibration && <button onClick={() => host({type: 'calib.reveal'})}>Показать разброс сейчас</button>}
      {view.calibration && view.calibration.map(r => {
        const c = view.criteria.find(x => x.id === r.criterionId)
        return c ? (
          <div class="card" key={r.criterionId}>
            <div class="row"><b>{c.name}</b>{r.wide ? <span class="chip warn">понимаем по-разному</span> : <span class="chip ok">одинаково</span>}<span class="small muted">оценки: {[...r.values].sort().join(', ') || '—'}</span></div>
            {r.wide && <div style={{marginTop: 8}}><div class="small">Обсудите, что значат 1/3/5, и поправьте описания:</div><CriterionEditor c={c} host={host} /></div>}
          </div>
        ) : null
      })}
    </div>
  )
}

function ResultsPanel({view, host}: {view: PublicView; host: (a: Action) => string | null}) {
  const disputed = view.results?.cards.filter(c => c.disputed).length ?? 0
  return (
    <div class="stack">
      {disputed > 0 && (
        <div class="card stack">
          <div><b>⚡ Спорных карточек: {disputed}.</b> Пусть по одному человеку из каждого «лагеря» скажет, почему так оценил (по 2 минуты на карточку). Аргументы можно записать анонимно.</div>
          {view.settings.secondRound && !view.round2Done && (
            <div><button class="primary" onClick={() => host({type: 'round2.start'})}>Второй раунд по спорным</button></div>
          )}
          {view.round2Done && <div class="small muted">Второй раунд проведён — показаны его оценки и изменение разброса.</div>}
        </div>
      )}
      <ResultsView view={view} canArgue={false} />
    </div>
  )
}

function DecidePanel({view, host}: {view: PublicView; host: (a: Action) => string | null}) {
  const res = view.results
  const [reasons, setReasons] = useState<Record<string, string>>({})
  if (!res) return null
  const leader = res.cards[0]?.cardId
  return (
    <div class="stack">
      <PhaseIntro emoji="🤝" title="Принимаем решение">Отметьте выбранное. Отложенному — причину, чтобы вернуться позже.</PhaseIntro>
      {res.cards.map(r => {
        const card = view.cards.find(c => c.id === r.cardId)
        if (!card) return null
        const d = view.decisions.find(x => x.cardId === r.cardId)
        const reason = reasons[r.cardId] ?? d?.reason ?? ''
        const set = (status: 'chosen' | 'deferred' | 'rejected' | null) => host({type: 'decision.set', cardId: r.cardId, status, reason})
        const needReason = (d?.status === 'deferred') || (d?.status === 'chosen' && r.cardId !== leader)
        return (
          <div class="card stack" key={r.cardId}>
            <div class="row between" style={{alignItems: 'flex-start'}}>
              <div style={{flex: 1}}><span class="chip">#{r.rank} · {r.score ?? '—'}</span> {r.gem && <span class="chip gem">💎</span>} {r.disputed && <span class="chip warn">⚡</span>}<div style={{marginTop: 4}}><CardBody tpl={view.template} refOptions={view.refOptions} card={card} /></div></div>
            </div>
            <div class="row">
              <button class={`small ${d?.status === 'chosen' ? 'primary' : ''}`} onClick={() => set(d?.status === 'chosen' ? null : 'chosen')}>✅ Выбрать</button>
              <button class={`small ${d?.status === 'deferred' ? 'selected' : ''}`} onClick={() => set(d?.status === 'deferred' ? null : 'deferred')}>⏸ Отложить</button>
              <button class={`small ${d?.status === 'rejected' ? 'selected' : ''}`} onClick={() => set(d?.status === 'rejected' ? null : 'rejected')}>✖ Отклонить</button>
            </div>
            {d && (
              <input type="text" placeholder={d.status === 'chosen' ? (r.cardId !== leader ? 'Почему выбрали не лидера? (одна строка)' : 'Почему выбрали (необязательно)') : d.status === 'deferred' ? 'Причина — когда вернуться? *' : 'Причина (необязательно)'}
                value={reason} onInput={e => setReasons({...reasons, [r.cardId]: (e.target as HTMLInputElement).value})}
                onBlur={() => host({type: 'decision.set', cardId: r.cardId, status: d.status, reason})} />
            )}
            {needReason && !reason.trim() && <div class="hint">Запишите причину — это поможет при защите и при возврате к варианту.</div>}
            {d?.status === 'chosen' && <ComplianceCheck p={view.passport} marks={view.compliance[r.cardId]}
              onSet={(item, v) => host({type: 'compliance.set', cardId: r.cardId, item, value: v})} />}
          </div>
        )
      })}
    </div>
  )
}

function Diagnostics({transport}: {transport: NostrTransport}) {
  const [states, setStates] = useState<RelayState[]>(transport.relayStates())
  useEffect(() => {
    const t = setInterval(() => setStates(transport.relayStates()), 1500)
    return () => clearInterval(t)
  }, [transport])
  const report = useMemo(() => states.map(s => `${s.url}: ${s.status}, отправлено ${s.sent}, получено ${s.received}${s.lastError ? `, ${s.lastError}` : ''}`).join('\n'), [states])
  return (
    <div class="card stack">
      <h3>Связь через релеи</h3>
      <p class="small muted">Сообщения зашифрованы и идут одновременно через несколько публичных релеев. Для работы достаточно одного 🟢.</p>
      <table class="simple">
        <thead><tr><th>Релей</th><th>Статус</th><th>Отправлено</th><th>Получено</th><th>Замечание</th></tr></thead>
        <tbody>{states.map(s => (
          <tr key={s.url}><td>{s.url.replace('wss://', '')}</td><td><span class={`dot ${s.status === 'open' ? 'online' : s.status === 'connecting' ? 'degraded' : 'offline'}`} /> {s.status}</td><td>{s.sent}</td><td>{s.received}</td><td class="small">{s.lastError ?? ''}</td></tr>
        ))}</tbody>
      </table>
      <button class="small" onClick={() => navigator.clipboard?.writeText(report)}>Скопировать отчёт</button>
    </div>
  )
}

// ——— Режим «Один экран» ———

function SingleScreen({view, stage, host, asParticipant, project, onNextStage}: {
  view: PublicView; stage: Stage; host: (a: Action) => string | null; asParticipant: (pid: string) => (a: Action) => Promise<string | null>; project: StoredProject; onNextStage: (p: StoredProject, fromStageId: string) => void
}) {
  const [current, setCurrent] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [newName, setNewName] = useState('')
  const blind = BLIND_PHASES.has(view.phase)
  const people = stage.participants.filter(p => p.active)

  useEffect(() => { setCurrent(null); setRevealed(false) }, [view.phase])

  if (view.phase === 'lobby') {
    return (
      <div class="stack">
        {passportFilled(view.passport) && <div class="card"><h3>📋 Задание</h3><PassportView p={view.passport!} /></div>}
        <div class="card stack">
          <h3>Кто участвует</h3>
          <div class="row">{stage.participants.map(p => <span class="chip" key={p.id}>{p.name}</span>)}</div>
          <form class="row" onSubmit={e => { e.preventDefault(); if (newName.trim()) { host({type: 'participant.add', id: uid(), name: newName}); setNewName('') } }}>
            <input type="text" style={{flex: 1}} placeholder="Имя участника" value={newName} onInput={e => setNewName((e.target as HTMLInputElement).value)} />
            <button disabled={!newName.trim()}>Добавить</button>
          </form>
        </div>
        <div class="card"><h3>Настройки</h3><SettingsFields settings={stage.settings} onChange={patch => host({type: 'settings.update', patch})} /></div>
      </div>
    )
  }

  if (!blind) {
    return <HostPanel view={view} stage={stage} host={host} joinUrl="" project={project} projector={false} onNextStage={onNextStage} />
  }

  // Слепые шаги: участники по очереди, с «шторкой» между ними
  const person = people.find(p => p.id === current)
  if (!person) {
    return (
      <div class="card stack">
        <h3>Кто сейчас за экраном?</h3>
        <div class="row">
          {people.map(p => (
            <button key={p.id} class={view.progress[p.id] || (view.phase === 'generate' && view.cardCounts[p.id]) ? 'selected' : ''} onClick={() => { setCurrent(p.id); setRevealed(false) }}>
              {view.progress[p.id] ? '✓ ' : ''}{p.name}
            </button>
          ))}
        </div>
        <div class="small muted">Передавайте ноутбук по очереди. Чужие ответы не видны.</div>
      </div>
    )
  }
  if (!revealed) {
    return (
      <div class="card curtain">
        <h2>Передайте ноутбук: {person.name}</h2>
        <button class="primary" onClick={() => setRevealed(true)}>Я {person.name}, начать</button>
        <button class="ghost" onClick={() => setCurrent(null)}>Выбрать другого</button>
      </div>
    )
  }
  return (
    <div class="stack">
      <div class="row between"><b>За экраном: {person.name}</b><button class="primary" onClick={() => setCurrent(null)}>Готово, передать следующему</button></div>
      <ParticipantStage view={view} pid={person.id} send={asParticipant(person.id)} storeKey={`pi:me:${stage.id}:${person.id}`} />
    </div>
  )
}
