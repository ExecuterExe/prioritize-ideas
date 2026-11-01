// Окно для проектора: второе окно на том же ноутбуке. Ведущий управляет из первого,
// это окно только показывает — ту же «слепую» картину, что видят телефоны. Связь между
// окнами — BroadcastChannel, без интернета.
import {useEffect, useState} from 'preact/hooks'
import type {PublicView} from '../core/engine'
import {cardTitle} from '../core/template'
import {Avatars, PhaseSteps, QR, Ring, Timer, phaseName, stepLabel} from './common'
import {ResultsView} from './results'
import {CircleScreen} from './circle'

const CHANNEL = 'pi-screen'

export type ScreenMsg =
  | {k: 'view'; view: PublicView; joinUrl: string; project: string}
  | {k: 'closed'}
  | {k: 'hello'}

export const screenSupported = typeof BroadcastChannel !== 'undefined'

export function screenUrl(): string {
  return `${location.href.split('#')[0].split('?')[0]}#screen`
}

export function openScreen() {
  window.open(screenUrl(), 'pi-screen', 'popup,width=1280,height=760')
}

// Ведущий: рассылает публичный вид при каждом изменении и по запросу нового окна
export function useScreenFeed(view: PublicView, joinUrl: string, project: string) {
  const [ch] = useState(() => screenSupported ? new BroadcastChannel(CHANNEL) : null)
  useEffect(() => {
    if (!ch) return
    const latest = {view, joinUrl, project}
    const send = () => ch.postMessage({k: 'view', ...latest} satisfies ScreenMsg)
    send()
    ch.onmessage = (e: MessageEvent<ScreenMsg>) => { if (e.data?.k === 'hello') send() }
  }, [ch, view, joinUrl, project])
  useEffect(() => () => { ch?.postMessage({k: 'closed'} satisfies ScreenMsg); ch?.close() }, [ch])
}

const BLIND = new Set(['evolve', 'calibrate', 'shortlist', 'rate', 'rate2', 'steps'])

export function ScreenApp() {
  const [data, setData] = useState<Extract<ScreenMsg, {k: 'view'}> | null>(null)
  useEffect(() => {
    if (!screenSupported) return
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (e: MessageEvent<ScreenMsg>) => {
      if (e.data?.k === 'view') setData(e.data)
      if (e.data?.k === 'closed') setData(null)
    }
    ch.postMessage({k: 'hello'} satisfies ScreenMsg)
    document.title = 'Экран для проектора'
    return () => ch.close()
  }, [])

  if (!data) {
    return (
      <div class="screen-app screen-wait">
        <h1>🖥 Экран для проектора</h1>
        <p class="muted">Ждём ноутбук ведущего: откройте сессию в первом окне. Это окно можно перетащить на проектор и развернуть на весь экран (F11).</p>
        {!screenSupported && <p class="muted">Этот браузер не умеет связывать окна — откройте сайт в Chrome или Edge.</p>}
      </div>
    )
  }
  const {view, joinUrl, project} = data
  return (
    <div class="screen-app">
      <header class="screen-head">
        <div>
          <div class="screen-kicker">{project} · {stepLabel(view)} · {view.template.emoji} {view.template.name}</div>
          <h1>{phaseName(view)}</h1>
        </div>
        <Timer deadline={view.deadline} offset={view.hostTime - Date.now()} />
      </header>
      <PhaseSteps view={view} />
      <main class="screen-body">
        <CircleScreen view={view} />
        <ScreenBody view={view} joinUrl={joinUrl} />
      </main>
    </div>
  )
}

function ScreenBody({view, joinUrl}: {view: PublicView; joinUrl: string}) {
  const people = view.participants.filter(p => p.active)
  if (view.hostScreen) {
    return <div class="screen-center"><h2>📴 Работаем на ноутбуке по очереди</h2><p class="muted">Подходите, когда позовут.</p></div>
  }
  if (view.phase === 'lobby') {
    return (
      <div class="screen-lobby">
        <div class="screen-qr">{joinUrl ? <QR text={joinUrl} /> : <div class="muted">Один экран — QR не нужен</div>}</div>
        <div class="stack">
          <h2>Наведите камеру телефона</h2>
          {view.sourceProblem && <div class="note"><b>Исходим из:</b> {view.sourceProblem}</div>}
          <div class="screen-count">В комнате: {people.length}</div>
          <Avatars people={people} />
        </div>
      </div>
    )
  }
  if (view.phase === 'generate') {
    const total = Object.values(view.cardCounts).reduce((a, b) => a + b, 0)
    const done: Record<string, boolean> = Object.fromEntries(people.map(p => [p.id, !!view.cardCounts[p.id]]))
    return (
      <div class="screen-center">
        <h2>🤫 Тихо пишем — каждый сам</h2>
        {view.sourceProblem && <div class="note"><b>Исходим из:</b> {view.sourceProblem}</div>}
        <div class="screen-big">{total}</div>
        <div class="muted">{total === 1 ? 'карточка' : total >= 2 && total <= 4 ? 'карточки' : 'карточек'} написано</div>
        <Avatars people={people} doneIds={done} />
      </div>
    )
  }
  if (BLIND.has(view.phase)) {
    const ready = people.filter(p => view.progress[p.id]).length
    return (
      <div class="screen-center">
        <h2>{view.phase === 'rate' || view.phase === 'rate2' ? '🙈 Оцениваем вслепую' : '⏳ Работаем на телефонах'}</h2>
        <Ring value={ready} total={people.length} size={160} />
        <div class="screen-count">Готовы {ready} из {people.length}</div>
        <Avatars people={people} doneIds={view.progress} />
      </div>
    )
  }
  if (view.phase === 'merge') {
    return (
      <div class="screen-grid">
        {view.cards.map(c => <div class="card screen-card" key={c.id}>{cardTitle(view.template, c.fields)}{c.mergedTexts?.length ? <span class="chip">+{c.mergedTexts.length}</span> : null}</div>)}
      </div>
    )
  }
  if (view.phase === 'criteria') {
    return (
      <div class="screen-grid">
        {view.criteria.map(c => (
          <div class="card screen-card" key={c.id}>
            <b>{c.name}</b>{c.weight > 1 && <span class="chip accent">×{c.weight}</span>}
            <div class="muted small">{c.question}</div>
          </div>
        ))}
      </div>
    )
  }
  if (view.results) return <ResultsView view={view} canArgue={false} />
  return <div class="screen-center"><h2>{phaseName(view)}</h2></div>
}
