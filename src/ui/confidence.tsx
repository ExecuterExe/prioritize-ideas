// Уверенность: ползунок при оценке, вопрос «до и после», итоговая карточка.
import {useState} from 'preact/hooks'
import type {Action, PublicView} from '../core/engine'
import {confFlag} from '../core/confidence'
import {cardTitle} from '../core/template'
import {lsGet, lsSet} from '../store/db'
import {ErrorLine} from './common'
import {toast} from './toast'

type Send = (a: Action) => Promise<string | null>

export const CONF_LABEL = ['', 'наугад', 'скорее нет', 'так себе', 'довольно', 'уверен']

export function ConfButtons({value, onChange}: {value?: number; onChange: (v: number) => void}) {
  return (
    <div class="row conf-row" role="radiogroup" aria-label="Уверенность">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} role="radio" aria-checked={value === n} class={`small ${value === n ? 'selected' : ''}`} onClick={() => onChange(n)} title={CONF_LABEL[n]}>{n}</button>
      ))}
      {value ? <span class="tiny muted">{CONF_LABEL[value]}</span> : null}
    </div>
  )
}

export function ConfChip({view, cardId, score}: {view: PublicView; cardId: string; score: number | null}) {
  const c = view.confidence[cardId]
  const flag = confFlag(score, c)
  if (!c) return null
  if (flag === 'shaky') return <span class="chip warn" title={`Средняя уверенность ${c.avg} из 5 — высокая оценка может быть от нехватки информации`}>🤔 высоко, но не уверены · {c.avg}</span>
  if (flag === 'firm') return <span class="chip ok" title="Команда уверена в своих оценках">💪 уверенно · {c.avg}</span>
  return <span class="chip" title="Средняя уверенность в оценках">уверенность {c.avg}</span>
}

// Вопрос «какой вариант сейчас лучший и насколько уверены» — до оценки и после решения
export function PulseQuestion({view, pid, send, when}: {view: PublicView; pid: string; send: Send; when: 'before' | 'after'}) {
  const key = `pi:pulse:${view.stageId}:${pid}:${when}`
  const saved = lsGet<{cardId: string; conf: number} | null>(key, null)
  const [cardId, setCardId] = useState(saved?.cardId ?? '')
  const [conf, setConf] = useState<number | undefined>(saved?.conf)
  const [editing, setEditing] = useState(!saved)
  const [err, setErr] = useState<string | null>(null)
  if (view.settings.beforeAfter === false || !view.cards.length) return null
  const answered = (when === 'before' ? view.pulse.before : view.pulse.after).includes(pid)
  if (answered && !editing) {
    return <div class="sync-line ok">✓ Ответ «{when === 'before' ? 'до' : 'после'}» записан{saved ? ` · ${cardTitle(view.template, view.cards.find(c => c.id === saved.cardId)?.fields ?? {})}` : ''} <button class="ghost small" onClick={() => setEditing(true)}>изменить</button></div>
  }
  const submit = async () => {
    const r = await send({type: 'pulse.answer', when, cardId, conf: conf!})
    setErr(r)
    if (!r) { lsSet(key, {cardId, conf}); setEditing(false); toast('Спасибо! Ответ анонимный') }
  }
  return (
    <div class="card stack pulse-q">
      <b>{when === 'before' ? '🧭 Пока до оценки: какой вариант кажется лучшим?' : '🧭 А теперь, после обсуждения: какой вариант лучший?'}</b>
      <div class="tiny muted">Анонимно. В итогах увидим, как изменились мнения и уверенность команды.</div>
      <select value={cardId} onChange={e => setCardId((e.target as HTMLSelectElement).value)}>
        <option value="">— выберите —</option>
        {view.cards.map(c => <option key={c.id} value={c.id}>{cardTitle(view.template, c.fields)}</option>)}
      </select>
      <div class="small">Насколько уверены?</div>
      <ConfButtons value={conf} onChange={setConf} />
      <div><button class="primary small" disabled={!cardId || !conf} onClick={submit}>Ответить</button></div>
      <ErrorLine msg={err} />
    </div>
  )
}

export function BeforeAfterCard({view}: {view: PublicView}) {
  const s = view.pulse.summary
  if (!s) return null
  const title = (id: string) => cardTitle(view.template, view.cards.find(c => c.id === id)?.fields ?? {})
  return (
    <div class="card stack">
      <h3 style={{margin: 0}}>🧭 До и после обсуждения</h3>
      <div class="row">
        <span class="chip">ответили дважды: {s.pairs}</span>
        <span class="chip accent">поменяли мнение: {s.changed}</span>
        {s.confBefore !== null && <span class="chip">уверенность: {s.confBefore} → {s.confAfter}</span>}
      </div>
      {s.support.map(x => (
        <div class="branch-bar" key={x.cardId}>
          <span class="tiny">{title(x.cardId)}</span>
          <span class="tiny muted">было {x.before}</span>
          <span class="tiny"><b>стало {x.after}</b>{x.after > x.before ? ' ↑' : x.after < x.before ? ' ↓' : ''}</span>
        </div>
      ))}
      <div class="tiny muted">Без имён. Рост поддержки после обсуждения — сигнал, что аргументы сработали.</div>
    </div>
  )
}

export function beforeAfterMarkdown(view: PublicView): string[] {
  const s = view.pulse.summary
  if (!s) return []
  const title = (id: string) => cardTitle(view.template, view.cards.find(c => c.id === id)?.fields ?? {})
  return [
    '## До и после обсуждения', '',
    `Ответили дважды: ${s.pairs}, поменяли мнение: ${s.changed}${s.confBefore !== null ? `, уверенность ${s.confBefore} → ${s.confAfter}` : ''}`,
    ...s.support.map(x => `- ${title(x.cardId)}: было ${x.before}, стало ${x.after}`), ''
  ]
}
