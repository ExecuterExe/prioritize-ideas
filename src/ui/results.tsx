// Результаты, итог и экспорт — общие для организатора и участников.
import {useState} from 'preact/hooks'
import type {PublicView} from '../core/engine'
import {cardSubtitle, cardTitle} from '../core/library'
import {Badges, CardBody, Dist, Matrix} from './common'
import type {Action} from '../core/engine'

type Send = (a: Action) => Promise<string | null>

function defaultAxes(view: PublicView): [string, string] | null {
  const crit = view.criteria.filter(c => c.approved)
  if (crit.length < 2) return null
  if (view.type === 'idea') {
    const x = crit.find(c => c.tag === 'feasibility'), y = crit.find(c => c.tag === 'novelty')
    if (x && y) return [x.id, y.id]
  } else {
    const y = crit.find(c => c.fromLibrary === 'pain'), x = crit.find(c => c.fromLibrary === 'frequency')
    if (x && y) return [x.id, y.id]
  }
  return [crit[0].id, crit[1].id]
}

export function ResultsView({view, send, canArgue}: {view: PublicView; send?: Send; canArgue: boolean}) {
  const res = view.results
  const [axes, setAxes] = useState<[string, string] | null>(() => defaultAxes(view))
  if (!res) return null
  const crit = view.criteria.filter(c => c.approved)
  const cardById = (id: string) => view.cards.find(c => c.id === id)
  return (
    <div class="stack">
      {res.leaderStable !== null && (
        <div class={res.leaderStable ? 'note' : 'hint'}>{res.leaderStable ? '✅ ' : '⚠️ '}{res.stabilityNote}</div>
      )}
      {res.cards.map(r => {
        const card = cardById(r.cardId)
        if (!card) return null
        const decision = view.decisions.find(d => d.cardId === r.cardId)
        return (
          <div class="card" key={r.cardId}>
            <div class="row between" style={{alignItems: 'flex-start'}}>
              <div style={{flex: 1, minWidth: 200}}>
                <div class="row" style={{gap: 6}}>
                  <span class="chip">#{r.rank}</span>
                  {decision?.status === 'chosen' && <span class="chip ok">✅ Выбрано</span>}
                  {decision?.status === 'deferred' && <span class="chip warn">⏸ Отложено</span>}
                  {decision?.status === 'rejected' && <span class="chip bad">✖ Отклонено</span>}
                  <Badges r={r} />
                </div>
                <div style={{marginTop: 6}}><CardBody type={view.type} card={card} /></div>
              </div>
              <details class="no-print" style={{textAlign: 'right'}}>
                <summary class="score-big" style={{cursor: 'pointer', listStyle: 'none'}} title="Нажмите, чтобы увидеть расчёт">{r.score ?? '—'}</summary>
                <div class="small muted" style={{textAlign: 'left', maxWidth: 280}}>
                  Балл = средние по критериям × веса, переведено в 0–100.<br />
                  {crit.map(c => {
                    const p = r.perCriterion.find(x => x.criterionId === c.id)
                    return <div key={c.id}>{c.name}: {p?.mean?.toFixed(2) ?? '—'} × {c.weight}{c.inverted ? ' (обратный)' : ''}</div>
                  })}
                </div>
              </details>
            </div>
            <div class="bar" style={{margin: '8px 0'}}><i style={{width: `${r.score ?? 0}%`}} /></div>
            <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))'}}>
              {crit.map(c => {
                const p = r.perCriterion.find(x => x.criterionId === c.id)
                const shift = p?.prevRange != null && p.range != null ? ` · разброс ${p.prevRange} → ${p.range}` : ''
                return (
                  <div key={c.id}>
                    <div class="small" style={{fontWeight: 600}}>{c.name} {p?.disputed && <span title="спорно">⚡</span>}</div>
                    <Dist values={p?.values ?? []} />
                    <div class="tiny muted">среднее {p?.mean?.toFixed(1) ?? '—'} · медиана {p?.median ?? '—'}{shift}</div>
                  </div>
                )
              })}
            </div>
            {r.guessShare > 0 && <div class="tiny muted" style={{marginTop: 6}}>Оценок «на догадке»: {Math.round(r.guessShare * 100)}%</div>}
            <Args view={view} cardId={r.cardId} send={send} canArgue={canArgue && (r.disputed || r.gem)} />
          </div>
        )
      })}
      {axes && (
        <div class="card">
          <h3>Матрица 2×2</h3>
          <div class="row small" style={{marginBottom: 8}}>
            <span>По горизонтали</span>
            <select style={{width: 'auto'}} value={axes[0]} onChange={e => setAxes([(e.target as HTMLSelectElement).value, axes[1]])}>
              {crit.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span>по вертикали</span>
            <select style={{width: 'auto'}} value={axes[1]} onChange={e => setAxes([axes[0], (e.target as HTMLSelectElement).value])}>
              {crit.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Matrix view={view} xId={axes[0]} yId={axes[1]} />
        </div>
      )}
    </div>
  )
}

function Args({view, cardId, send, canArgue}: {view: PublicView; cardId: string; send?: Send; canArgue: boolean}) {
  const args = view.args.filter(a => a.cardId === cardId)
  const [text, setText] = useState('')
  const [side, setSide] = useState<'pro' | 'con'>('pro')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!args.length && !canArgue) return null
  return (
    <div style={{marginTop: 10}}>
      {args.length > 0 && (
        <div class="small stack" style={{marginBottom: 8}}>
          {args.map(a => <div key={a.id}>{a.side === 'pro' ? '👍' : '👎'} {a.text}</div>)}
        </div>
      )}
      {canArgue && send && (
        <form class="row no-print" onSubmit={async e => {
          e.preventDefault()
          if (!text.trim()) return
          setBusy(true)
          const r = await send({type: 'arg.add', cardId, side, text})
          setBusy(false)
          setErr(r)
          if (!r) setText('')
        }}>
          <select style={{width: 'auto'}} value={side} onChange={e => setSide((e.target as HTMLSelectElement).value as 'pro' | 'con')}>
            <option value="pro">👍 За</option>
            <option value="con">👎 Против</option>
          </select>
          <input type="text" style={{flex: 1, minWidth: 160}} placeholder="Анонимный аргумент" value={text} maxLength={300}
            onInput={e => setText((e.target as HTMLInputElement).value)} />
          <button disabled={busy || !text.trim()}>Добавить</button>
          {err && <div class="error" style={{width: '100%'}}>{err}</div>}
        </form>
      )}
    </div>
  )
}

// ——— Экспорт ———

export function buildMarkdown(view: PublicView, projectTitle: string): string {
  const res = view.results
  const L: string[] = []
  const crit = view.criteria.filter(c => c.approved)
  L.push(`# ${projectTitle} — ${view.type === 'problem' ? 'выбор проблемы' : 'выбор идеи'}`, '')
  if (view.sourceProblem) L.push(`**Исходная проблема:** ${view.sourceProblem}`, '')
  L.push(`Участников: ${view.participants.filter(p => p.active).length}. Критерии: ${crit.map(c => `${c.name}${c.weight > 1 ? ` (вес ${c.weight})` : ''}`).join(', ')}.`, '')
  const title = (id: string) => {
    const c = view.cards.find(x => x.id === id)
    return c ? cardTitle(view.type, c.fields) : id
  }
  const sub = (id: string) => {
    const c = view.cards.find(x => x.id === id)
    return c ? cardSubtitle(view.type, c.fields) : ''
  }
  const chosen = view.decisions.filter(d => d.status === 'chosen')
  if (chosen.length) {
    L.push('## Выбрано', '')
    for (const d of chosen) L.push(`- **${title(d.cardId)}** — ${sub(d.cardId)}${d.reason ? `  \n  Почему: ${d.reason}` : ''}`)
    L.push('')
  }
  if (res) {
    L.push('## Рейтинг', '', '| # | Карточка | Балл | ' + crit.map(c => c.name).join(' | ') + ' | Отметки |', '|' + ' --- |'.repeat(4 + crit.length))
    for (const r of res.cards) {
      const marks = [r.consensus && 'согласие', r.disputed && 'спорно', r.gem && 'бриллиант', r.guess && 'на догадках'].filter(Boolean).join(', ')
      L.push(`| ${r.rank} | ${title(r.cardId)} | ${r.score ?? '—'} | ${crit.map(c => r.perCriterion.find(p => p.criterionId === c.id)?.mean?.toFixed(1) ?? '—').join(' | ')} | ${marks} |`)
    }
    L.push('', res.stabilityNote, '')
  }
  const deferred = view.decisions.filter(d => d.status === 'deferred')
  if (deferred.length) {
    L.push('## Отложено (вернуться позже)', '')
    for (const d of deferred) L.push(`- ${title(d.cardId)}${d.reason ? ` — ${d.reason}` : ''}`)
    L.push('')
  }
  const rejected = view.decisions.filter(d => d.status === 'rejected')
  if (rejected.length) {
    L.push('## Отклонено', '')
    for (const d of rejected) L.push(`- ${title(d.cardId)}${d.reason ? ` — ${d.reason}` : ''}`)
    L.push('')
  }
  if (view.args.length) {
    L.push('## Аргументы', '')
    for (const a of view.args) L.push(`- ${a.side === 'pro' ? 'За' : 'Против'} «${title(a.cardId)}»: ${a.text}`)
    L.push('')
  }
  return L.join('\n')
}

export function buildLeanCanvas(view: PublicView): string {
  const pick = (status: 'chosen' | 'deferred') => view.decisions.filter(d => d.status === status)
    .map(d => view.cards.find(c => c.id === d.cardId)).filter(Boolean) as PublicView['cards']
  const chosen = pick('chosen'), deferred = pick('deferred').slice(0, 2)
  const L: string[] = []
  if (view.type === 'problem') {
    L.push('ПРОБЛЕМА (Problem)')
    for (const c of [...chosen, ...deferred]) L.push(`• ${c.fields.what}${c.fields.situation ? ` (${c.fields.situation})` : ''}${c.fields.effect ? ` → ${c.fields.effect}` : ''}`)
    L.push('', 'СЕГМЕНТЫ ПОТРЕБИТЕЛЕЙ (Customer Segments)')
    for (const w of [...new Set(chosen.map(c => c.fields.who).filter(Boolean))]) L.push(`• ${w}`)
    L.push('', 'СУЩЕСТВУЮЩИЕ АЛЬТЕРНАТИВЫ (Existing Alternatives)', '• заполните на этапе «Идея»')
  } else {
    L.push('ПРОБЛЕМА (Problem)', `• ${view.sourceProblem ?? '—'}`)
    L.push('', 'СЕГМЕНТЫ ПОТРЕБИТЕЛЕЙ (Customer Segments)')
    for (const w of [...new Set(chosen.map(c => c.fields.who).filter(Boolean))]) L.push(`• ${w}`)
    L.push('', 'РЕШЕНИЕ (Solution)')
    for (const c of chosen) L.push(`• ${c.fields.title}: ${c.fields.essence}`)
    L.push('', 'УНИКАЛЬНОЕ ЦЕННОСТНОЕ ПРЕДЛОЖЕНИЕ (UVP) — черновик')
    for (const c of chosen) if (c.fields.how) L.push(`• ${c.fields.how}`)
    L.push('', 'СУЩЕСТВУЮЩИЕ АЛЬТЕРНАТИВЫ (Existing Alternatives)')
    const alts = [...new Set(view.cards.map(c => c.fields.alternatives).filter(Boolean))]
    for (const a of alts) L.push(`• ${a}`)
    if (!alts.length) L.push('• —')
  }
  L.push('', 'КЛЮЧЕВЫЕ МЕТРИКИ, КАНАЛЫ, ДОХОДЫ, ИЗДЕРЖКИ, СКРЫТОЕ ПРЕИМУЩЕСТВО', '• заполните вместе с командой')
  return L.join('\n')
}

export function SummaryView({view, projectTitle, extra}: {view: PublicView; projectTitle: string; extra?: preact.ComponentChildren}) {
  const md = buildMarkdown(view, projectTitle)
  const lean = buildLeanCanvas(view)
  const [copied, setCopied] = useState('')
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what) } catch { setCopied('Не удалось скопировать — выделите текст вручную') }
  }
  const chosen = view.decisions.filter(d => d.status === 'chosen')
  return (
    <div class="stack">
      <div class="card">
        <h2>Итог</h2>
        {chosen.map(d => {
          const c = view.cards.find(x => x.id === d.cardId)
          return c ? <div key={d.cardId} class="card" style={{background: 'var(--ok-soft)'}}><CardBody type={view.type} card={c} full />{d.reason && <div class="small" style={{marginTop: 6}}>Почему: {d.reason}</div>}</div> : null
        })}
      </div>
      <div class="card">
        <div class="row between"><h3>Для Lean Canvas</h3><button class="small" onClick={() => copy(lean, 'Текст для Lean Canvas скопирован')}>Скопировать</button></div>
        <pre class="export">{lean}</pre>
      </div>
      <div class="card no-print">
        <div class="row between"><h3>Отчёт (Markdown)</h3>
          <div class="row">
            <button class="small" onClick={() => copy(md, 'Отчёт скопирован')}>Скопировать</button>
            <button class="small" onClick={() => window.print()}>Печать / PDF</button>
          </div>
        </div>
        <pre class="export">{md}</pre>
      </div>
      {copied && <div class="note">{copied}</div>}
      {extra}
      <ResultsView view={view} canArgue={false} />
    </div>
  )
}
