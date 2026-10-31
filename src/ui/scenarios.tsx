// «Что если…»: сценарии с другими весами и условиями, таблица устойчивости.
import {useState} from 'preact/hooks'
import type {Action, PublicView} from '../core/engine'
import {FIT_LABEL, PRESETS, presetWeights, type Fit} from '../core/scenario'
import {cardTitle} from '../core/template'
import {ErrorLine} from './common'
import {toast} from './toast'

type Send = (a: Action) => Promise<string | null>
const newId = () => Math.random().toString(36).slice(2, 12)
const MULTS = [0, 1, 2, 3]

export function ScenariosPanel({view, send, isHost, pid}: {view: PublicView; send?: Send; isHost: boolean; pid?: string}) {
  const [custom, setCustom] = useState(false)
  if (!view.results || view.finalists.length < 2) return null
  const scenarios = view.scenarios
  if (!isHost && !scenarios.length) return null
  const crit = view.criteria.filter(c => c.approved)
  const add = async (name: string, description: string, weights: Record<string, number>, question?: string) => {
    const r = await send!({type: 'scenario.add', id: newId(), name, description, weights, question})
    toast(r ?? `Сценарий «${name}» добавлен`, r ? 'error' : 'ok')
    return r
  }
  // Заготовка годится, если меняет хотя бы один вес или задаёт условие
  const presets = PRESETS.filter(p => p.question || Object.keys(presetWeights(crit, p.tags)).length)
    .filter(p => !scenarios.some(s => s.name === p.name))
  return (
    <div class="card stack scenarios">
      <div>
        <h3 style={{margin: 0}}>🔀 Что если…</h3>
        <div class="tiny muted">Проверяем устойчивость выбора: как изменится рейтинг, если поменяются условия. Новые оценки не нужны — пересчитываем уже собранные.</div>
      </div>

      {scenarios.filter(s => s.open).map(s => (
        <OpenQuestion key={s.id} view={view} s={s} send={send} isHost={isHost} pid={pid} />
      ))}

      {view.robustness && view.robustness.columns.length > 1 && <RobustnessTable view={view} />}

      {isHost && scenarios.length > 0 && (
        <div class="row">
          {scenarios.map(s => (
            <span class="chip accent" key={s.id}>{s.name}
              <button class="ghost small" style={{minHeight: 0, padding: '0 0 0 4px'}} aria-label="Удалить сценарий" onClick={() => send!({type: 'scenario.remove', id: s.id})}>✕</button>
            </span>
          ))}
        </div>
      )}

      {isHost && send && (
        <div class="stack">
          {presets.length > 0 && (
            <div class="row">
              {presets.map(p => (
                <button key={p.key} class="small" title={p.description} onClick={() => add(p.name, p.description, presetWeights(crit, p.tags), p.question)}>+ {p.name}</button>
              ))}
            </div>
          )}
          {!custom ? <button class="small ghost" style={{alignSelf: 'flex-start'}} onClick={() => setCustom(true)}>+ Свой сценарий</button>
            : <CustomScenario view={view} onAdd={async (n, d, w, q) => { const r = await add(n, d, w, q); if (!r) setCustom(false); return r }} onCancel={() => setCustom(false)} />}
        </div>
      )}
    </div>
  )
}

function CustomScenario({view, onAdd, onCancel}: {view: PublicView; onAdd: (n: string, d: string, w: Record<string, number>, q?: string) => Promise<string | null>; onCancel: () => void}) {
  const crit = view.criteria.filter(c => c.approved)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [question, setQuestion] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div class="test-card stack">
      <label class="field"><span>Что изменилось</span><input type="text" value={name} maxLength={60} placeholder="Например: делаем только для заочников" onInput={e => setName((e.target as HTMLInputElement).value)} /></label>
      <label class="field"><span>Пояснение (необязательно)</span><input type="text" value={desc} maxLength={200} onInput={e => setDesc((e.target as HTMLInputElement).value)} /></label>
      <div class="field"><span>Насколько важен каждый критерий в этом сценарии</span>
        <div class="stack" style={{gap: 6}}>
          {crit.map(c => (
            <div class="row" key={c.id}>
              <span class="small" style={{minWidth: 150}}>{c.name}</span>
              {MULTS.map(m => (
                <button key={m} type="button" class={`small ${(weights[c.id] ?? 1) === m ? 'selected' : ''}`} onClick={() => setWeights({...weights, [c.id]: m})}>
                  {m === 0 ? 'не важен' : `×${m}`}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <label class="field"><span>Условие-проверка (необязательно)</span>
        <input type="text" value={question} maxLength={200} placeholder="Идея работает без установки приложения?" onInput={e => setQuestion((e.target as HTMLInputElement).value)} />
      </label>
      <div class="tiny muted">С условием каждый вслепую ответит про финалистов «выдерживает / частично / нет», и баллы умножатся на 1 / 0,7 / 0,3.</div>
      <ErrorLine msg={err} />
      <div class="row">
        <button class="primary" disabled={!name.trim()} onClick={async () => {
          const w = Object.fromEntries(Object.entries(weights).filter(([, v]) => v !== 1))
          setErr(await onAdd(name, desc, w, question || undefined))
        }}>Добавить</button>
        <button class="ghost" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  )
}

function OpenQuestion({view, s, send, isHost, pid}: {view: PublicView; s: PublicView['scenarios'][number]; send?: Send; isHost: boolean; pid?: string}) {
  const [ans, setAns] = useState<Record<string, Fit>>({})
  const [again, setAgain] = useState(false)
  const done = !!pid && s.submitted.includes(pid)
  const active = view.participants.filter(p => p.active)
  const complete = view.finalists.every(id => ans[id])
  return (
    <div class="round-card card stack">
      <b>❓ {s.name}: {s.question}</b>
      {(!done || again) && send && pid ? (
        <>
          <div class="tiny muted">Ответьте сами — ответы других скрыты до пересчёта.</div>
          {view.finalists.map(id => {
            const c = view.cards.find(x => x.id === id)
            if (!c) return null
            return (
              <div class="stack" key={id} style={{gap: 6, paddingTop: 6, borderTop: '1px dashed var(--border)'}}>
                <span class="small" style={{fontWeight: 700}}>{cardTitle(view.template, c.fields)}</span>
                <div class="row" style={{gap: 4}}>
                  {(Object.keys(FIT_LABEL) as Fit[]).map(f => (
                    <button key={f} type="button" class={`small ${ans[id] === f ? 'selected' : ''}`} onClick={() => setAns({...ans, [id]: f})}>{FIT_LABEL[f]}</button>
                  ))}
                </div>
              </div>
            )
          })}
          <button class="primary small" style={{alignSelf: 'flex-start'}} disabled={!complete} onClick={async () => {
            const r = await send({type: 'scenario.answer', id: s.id, answers: ans})
            toast(r ?? 'Ответ учтён', r ? 'error' : 'ok')
            if (!r) setAgain(false)
          }}>Ответить</button>
        </>
      ) : (
        <div class="small">✓ Ваш ответ учтён{!isHost && <> · <button class="ghost small" onClick={() => setAgain(true)}>изменить</button></>}</div>
      )}
      {isHost && (
        <div class="row between">
          <span class="small">Ответили {s.submitted.length} из {active.length}</span>
          <button class="small primary" disabled={!s.submitted.length} onClick={async () => { const r = await send!({type: 'scenario.close', id: s.id}); if (r) toast(r, 'error') }}>Закрыть и пересчитать</button>
        </div>
      )}
    </div>
  )
}

function RobustnessTable({view}: {view: PublicView}) {
  const rb = view.robustness!
  const title = (id: string) => { const c = view.cards.find(x => x.id === id); return c ? cardTitle(view.template, c.fields) : id }
  const ids = rb.columns[0].rows.slice().sort((a, b) => a.rank - b.rank).map(r => r.cardId)
  const total = rb.columns.length
  return (
    <div class="stack">
      <div class="tree-scroll">
        <table class="simple robust">
          <thead><tr><th>Карточка</th>{rb.columns.map(c => <th key={c.id}>{c.name}</th>)}</tr></thead>
          <tbody>{ids.map(id => (
            <tr key={id}>
              <td class="small">{title(id)}</td>
              {rb.columns.map(c => {
                const r = c.rows.find(x => x.cardId === id)
                return <td key={c.id} class={r?.rank === 1 ? 'top-cell' : ''}>{r?.score == null ? '—' : <><b>{r.rank}</b><span class="muted"> · {r.score}</span></>}</td>
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {rb.mostRobust && (
        <div class="note small">
          🛡 Самая устойчивая: <b>{title(rb.mostRobust)}</b> — первая в {rb.firsts[rb.mostRobust]} из {total} вариантов условий.
          {rb.baseLeaderOnlyBase && rb.mostRobust !== rb.columns[0].rows.find(r => r.rank === 1)?.cardId &&
            <> Исходный лидер «{title(rb.columns[0].rows.find(r => r.rank === 1)!.cardId)}» первый только при исходных условиях.</>}
        </div>
      )}
    </div>
  )
}

export function scenariosMarkdown(view: PublicView): string {
  const rb = view.robustness
  if (!rb || rb.columns.length < 2) return ''
  const title = (id: string) => { const c = view.cards.find(x => x.id === id); return c ? cardTitle(view.template, c.fields) : id }
  const L = ['## Что если…', '', `| Карточка | ${rb.columns.map(c => c.name).join(' | ')} |`, `| --- |${' --- |'.repeat(rb.columns.length)}`]
  for (const r of rb.columns[0].rows.slice().sort((a, b) => a.rank - b.rank)) {
    L.push(`| ${title(r.cardId)} | ${rb.columns.map(c => { const x = c.rows.find(y => y.cardId === r.cardId); return x?.score == null ? '—' : `${x.rank} (${x.score})` }).join(' | ')} |`)
  }
  if (rb.mostRobust) L.push('', `Самая устойчивая: **${title(rb.mostRobust)}** — первая в ${rb.firsts[rb.mostRobust]} из ${rb.columns.length} вариантов условий.`)
  for (const s of view.scenarios) if (s.question) L.push(`- «${s.name}»: ${s.question}`)
  return L.join('\n') + '\n'
}
