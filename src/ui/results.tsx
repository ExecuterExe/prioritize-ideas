// Результаты, итог и экспорт — общие для организатора и участников.
import {useState} from 'preact/hooks'
import type {PublicView} from '../core/engine'
import {asText, cardSubtitle, cardTitle, formatValue} from '../core/template'
import {Badges, CardBody, CountUp, Dist, Matrix} from './common'
import {ComplianceCheck} from './passport'
import {complianceItems, passportFilled, passportMarkdown} from '../core/passport'
import {CATEGORY_SHORT, METHOD_LABEL, STATUS_ICON, STATUS_LABEL, threatsFor} from '../core/assume'
import {toast} from './toast'
import {GenealogyTree, originLabel} from './evolve'
import {RISK_STATUS_LABEL, riskRows} from '../core/risk'
import {ScenariosPanel, scenariosMarkdown} from './scenarios'
import {BoardPanel, boardMarkdown} from './board'
import {planForChat} from './tasks'
import type {Action} from '../core/engine'

type Send = (a: Action) => Promise<string | null>

function defaultAxes(view: PublicView): [string, string] | null {
  const crit = view.criteria.filter(c => c.approved)
  if (crit.length < 2) return null
  const axes = view.template.matrixAxes
  if (axes) {
    const x = crit.find(c => c.fromLibrary === axes[0]), y = crit.find(c => c.fromLibrary === axes[1])
    if (x && y) return [x.id, y.id]
  }
  const x = crit.find(c => c.tag === 'feasibility'), y = crit.find(c => c.tag === 'novelty')
  if (x && y) return [x.id, y.id]
  return [crit[0].id, crit[1].id]
}

export function ResultsView({view, send, canArgue, isHost = false, pid}: {view: PublicView; send?: Send; canArgue: boolean; isHost?: boolean; pid?: string}) {
  const res = view.results
  const [axes, setAxes] = useState<[string, string] | null>(() => defaultAxes(view))
  if (!res) return null
  const crit = view.criteria.filter(c => c.approved)
  const cardById = (id: string) => view.cards.find(c => c.id === id)
  const leader = res.cards[0]
  const leaderCard = leader && cardById(leader.cardId)
  const critical = new Set(view.template.kind === 'risk' ? riskRows(res.cards, view.criteria, view.decisions).filter(x => x.critical).map(x => x.cardId) : [])
  return (
    <div class="stack stagger">
      {leader && leaderCard && leader.score !== null && (
        <div class="card leader">
          <div class="row between" style={{alignItems: 'flex-start', position: 'relative', zIndex: 1}}>
            <div style={{flex: 1, minWidth: 200}}>
              <div class="leader-kicker">{view.template.kind === 'risk' ? '🔥 Самый опасный сценарий' : '🏆 Лидер команды'}</div>
              <h2 style={{margin: '8px 0 4px', fontSize: '1.35rem'}}>{cardTitle(view.template, leaderCard.fields)}</h2>
              <div class="small">{cardSubtitle(view.template, leaderCard.fields)}</div>
              {leaderCard.parents?.length ? <div class="small" style={{marginTop: 4}}>🌱 Выросла из чужих идей: {originLabel(leaderCard, view)}</div> : null}
            </div>
            <div class="score-big"><CountUp value={leader.score} /></div>
          </div>
          {res.leaderStable !== null && (
            <div class="small" style={{marginTop: 12, position: 'relative', zIndex: 1}}>{res.leaderStable ? '✅ ' : '⚠️ '}{res.stabilityNote}</div>
          )}
        </div>
      )}
      {res.cards.map(r => {
        const card = cardById(r.cardId)
        if (!card) return null
        const decision = view.decisions.find(d => d.cardId === r.cardId)
        return (
          <div class="card" key={r.cardId}>
            <div class="row" style={{alignItems: 'flex-start', gap: 12, flexWrap: 'nowrap'}}>
              <span class={`rank ${r.rank === 1 ? 'top' : ''}`}>{r.rank}</span>
              <div style={{flex: 1, minWidth: 0}}>
                <CardBody tpl={view.template} refOptions={view.refOptions} card={card} />
                <div class="row" style={{gap: 6, marginTop: 6}}>
                  {decision?.status === 'chosen' && <span class="chip ok">{view.template.kind === 'risk' ? RISK_STATUS_LABEL.chosen : '✅ Выбрано'}</span>}
                  {decision?.status === 'deferred' && <span class="chip warn">{view.template.kind === 'risk' ? RISK_STATUS_LABEL.deferred : '⏸ Отложено'}</span>}
                  {decision?.status === 'rejected' && <span class="chip bad">{view.template.kind === 'risk' ? RISK_STATUS_LABEL.rejected : '✖ Отклонено'}</span>}
                  <Badges r={r} />
                  {critical.has(r.cardId) && <span class="chip bad" title="Вероятность и ущерб — в среднем 3,5 и выше">🔥 Критический риск</span>}
                  {send && r.guess && <AssumeButton view={view} cardId={r.cardId} send={send} />}
                </div>
              </div>
              <div class="score-big" style={{fontSize: '1.8rem'}}>{r.score === null ? '—' : <CountUp value={r.score} />}</div>
            </div>
            <div class="bar" style={{margin: '12px 0 4px'}}><i style={{width: `${r.score ?? 0}%`}} /></div>
            <details class="more" open={r.disputed}>
              <summary>Оценки по критериям</summary>
              <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginTop: 8}}>
                {crit.map(c => {
                  const p = r.perCriterion.find(x => x.criterionId === c.id)
                  const shift = p?.prevRange != null && p.range != null ? ` · разброс ${p.prevRange} → ${p.range}` : ''
                  return (
                    <div key={c.id}>
                      <div class="small" style={{fontWeight: 700}}>{c.name} {p?.disputed && <span title="спорно">⚡</span>}</div>
                      <Dist values={p?.values ?? []} />
                      <div class="tiny muted">среднее {p?.mean?.toFixed(1) ?? '—'}{shift}</div>
                    </div>
                  )
                })}
              </div>
              <div class="tiny muted" style={{marginTop: 8}}>
                Как считается: средние по критериям × веса → шкала 0–100.
                {crit.map(c => {
                  const p = r.perCriterion.find(x => x.criterionId === c.id)
                  return ` ${c.name}: ${p?.mean?.toFixed(2) ?? '—'}×${c.weight}${c.inverted ? ' (обратный)' : ''}.`
                }).join('')}
                {r.guessShare > 0 ? ` Оценок «на догадке»: ${Math.round(r.guessShare * 100)}%.` : ''}
              </div>
            </details>
            <Args view={view} cardId={r.cardId} send={send} canArgue={canArgue && (r.disputed || r.gem)} />
          </div>
        )
      })}
      <ScenariosPanel view={view} send={send} isHost={isHost} pid={pid} />
      <GenealogyTree view={view} />
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
  L.push(`# ${projectTitle} — ${view.template.name}`, '')
  if (view.sourceProblem) L.push(`**Исходим из:** ${view.sourceProblem}`, '')
  if (passportFilled(view.passport)) L.push(passportMarkdown(view.passport!), '')
  L.push(`Участников: ${view.participants.filter(p => p.active).length}. Критерии: ${crit.map(c => `${c.name}${c.weight > 1 ? ` (вес ${c.weight})` : ''}`).join(', ')}.`, '')
  const title = (id: string) => {
    const c = view.cards.find(x => x.id === id)
    return c ? cardTitle(view.template, c.fields) : id
  }
  const sub = (id: string) => {
    const c = view.cards.find(x => x.id === id)
    return c ? cardSubtitle(view.template, c.fields) : ''
  }
  const chosen = view.decisions.filter(d => d.status === 'chosen')
  if (chosen.length) {
    L.push('## Выбрано', '')
    for (const d of chosen) {
      L.push(`- **${title(d.cardId)}**${sub(d.cardId) ? ` — ${sub(d.cardId)}` : ''}${d.reason ? `  \n  Почему: ${d.reason}` : ''}`)
      const c = view.cards.find(x => x.id === d.cardId)
      if (c) for (const f of view.template.fields) {
        const v = formatValue(f, c.fields[f.key])
        if (v && f.key !== view.template.titleField) L.push(`  - ${f.label}: ${v}`)
      }
    }
    L.push('')
  }
  if (view.assumptions.length) {
    L.push('## Предположения', '', '| № | Предположение | О чём | Важность | Доказанность | Статус | Основание |', '| --- | --- | --- | --- | --- | --- | --- |')
    view.assumptions.forEach((a, i) => L.push(`| ${i + 1} | ${a.text} | ${CATEGORY_SHORT[a.category]} | ${a.importance ?? '—'} | ${a.evidence ?? '—'} | ${STATUS_ICON[a.status]} ${STATUS_LABEL[a.status]} | ${a.proof ?? ''} |`))
    L.push('')
  }
  if (view.experiments.length) {
    L.push('## Эксперименты', '')
    for (const e of view.experiments) {
      const a = view.assumptions.find(x => x.id === e.assumptionId)
      const owner = view.participants.find(p => p.id === e.ownerId)?.name
      L.push(`- **${a?.text ?? '?'}** — ${METHOD_LABEL[e.method]}, N=${e.sampleN}, успех ${e.thresholdKind === 'percent' ? `≥ ${e.threshold}%` : `≥ ${e.threshold} чел.`}${owner ? `, отв. ${owner}` : ''}${e.deadline ? `, срок ${e.deadline}` : ''}${e.resultHits != null ? ` → факт ${e.resultHits} из ${e.resultN}: ${e.verdict ? STATUS_LABEL[e.verdict] : '—'}` : ''}`)
    }
    L.push('')
  }
  if (view.template.kind === 'risk' && res) {
    const rows = riskRows(res.cards, view.criteria, view.decisions)
    L.push('## Реестр рисков', '', '| Сценарий провала | Вероятность | Ущерб | Статус | Мера |', '| --- | --- | --- | --- | --- |')
    for (const x of rows) {
      const st = x.status ? RISK_STATUS_LABEL[x.status] : '—'
      L.push(`| ${x.critical ? '🔥 ' : ''}${title(x.cardId)} | ${x.probability?.toFixed(1) ?? '—'} | ${x.damage?.toFixed(1) ?? '—'} | ${st} | ${x.mitigation ?? ''} |`)
    }
    L.push('')
  }
  const sc = scenariosMarkdown(view)
  if (sc) L.push(sc)
  const bm = boardMarkdown(view)
  if (bm) L.push(bm)
  // Первые две строки текста для чата — заголовок и пустая строка, в отчёте у раздела свой заголовок
  if (view.tasks.length || view.experiments.length) L.push('## Кто что делает', '', ...planForChat(view, projectTitle).split('\n').slice(2), '')
  const items = complianceItems(view.passport)
  if (items.length && chosen.length) {
    L.push('## Соответствие заданию', '')
    const mark = {ok: '✅', partly: '⚠️', fail: '❌'} as const
    for (const d of chosen) {
      L.push(`**${title(d.cardId)}**`)
      for (const i of items) {
        const v = view.compliance[d.cardId]?.[i.key]
        L.push(`- ${v ? mark[v] : '—'} ${i.kind === 'must' ? 'Есть' : 'Не нарушено'}: ${i.text}`)
      }
      L.push('')
    }
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

// Lean Canvas — только для встроенных видов «проблема» и «идея»
export function buildLeanCanvas(view: PublicView): string | null {
  if (view.template.kind !== 'problem' && view.template.kind !== 'idea') return null
  const t = (v: unknown) => asText(v as never)
  const pick = (status: 'chosen' | 'deferred') => view.decisions.filter(d => d.status === status)
    .map(d => view.cards.find(c => c.id === d.cardId)).filter(Boolean) as PublicView['cards']
  const chosen = pick('chosen'), deferred = pick('deferred').slice(0, 2)
  const L: string[] = []
  if (view.template.kind === 'problem') {
    L.push('ПРОБЛЕМА (Problem)')
    for (const c of [...chosen, ...deferred]) L.push(`• ${t(c.fields.what)}${c.fields.situation ? ` (${t(c.fields.situation)})` : ''}${c.fields.effect ? ` → ${t(c.fields.effect)}` : ''}`)
    L.push('', 'СЕГМЕНТЫ ПОТРЕБИТЕЛЕЙ (Customer Segments)')
    for (const w of [...new Set(chosen.map(c => t(c.fields.who)).filter(Boolean))]) L.push(`• ${w}`)
    L.push('', 'СУЩЕСТВУЮЩИЕ АЛЬТЕРНАТИВЫ (Existing Alternatives)', '• заполните на этапе «Идея»')
  } else {
    L.push('ПРОБЛЕМА (Problem)', `• ${view.sourceProblem ?? '—'}`)
    L.push('', 'СЕГМЕНТЫ ПОТРЕБИТЕЛЕЙ (Customer Segments)')
    for (const w of [...new Set(chosen.map(c => t(c.fields.who)).filter(Boolean))]) L.push(`• ${w}`)
    L.push('', 'РЕШЕНИЕ (Solution)')
    for (const c of chosen) L.push(`• ${t(c.fields.title)}: ${t(c.fields.essence)}`)
    L.push('', 'УНИКАЛЬНОЕ ЦЕННОСТНОЕ ПРЕДЛОЖЕНИЕ (UVP) — черновик')
    for (const c of chosen) if (c.fields.how) L.push(`• ${t(c.fields.how)}`)
    L.push('', 'СУЩЕСТВУЮЩИЕ АЛЬТЕРНАТИВЫ (Existing Alternatives)')
    const alts = [...new Set(view.cards.map(c => t(c.fields.alternatives)).filter(Boolean))]
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
      {view.template.kind === 'risk' && view.results && <RiskRegister view={view} />}
      {view.board && <BoardPanel view={view} />}
      {chosen.length > 0 && (
      <div class="card">
        <h2>Итог</h2>
        {chosen.map(d => {
          const c = view.cards.find(x => x.id === d.cardId)
          return c ? (
            <div key={d.cardId} class="card stack" style={{background: 'var(--ok-soft)'}}>
              <CardBody tpl={view.template} refOptions={view.refOptions} card={c} full />
              {d.reason && <div class="small">Почему: {d.reason}</div>}
              <ThreatNote view={view} cardId={d.cardId} />
              <ComplianceCheck p={view.passport} marks={view.compliance[d.cardId]} readOnly />
            </div>
          ) : null
        })}
      </div>
      )}
      {lean && (
      <div class="card">
        <div class="row between"><h3>Для Lean Canvas</h3><button class="small" onClick={() => copy(lean, 'Текст для Lean Canvas скопирован')}>Скопировать</button></div>
        <pre class="export">{lean}</pre>
      </div>
      )}
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

// Записать карточку «на догадках» как предположение — уточнить формулировку можно во вкладке «Предположения»
function AssumeButton({view, cardId, send}: {view: PublicView; cardId: string; send: Send}) {
  const done = view.assumptions.some(a => a.linkedCardId === cardId)
  if (done) return <span class="chip accent">🎯 в предположениях</span>
  const card = view.cards.find(c => c.id === cardId)
  const title = card ? cardTitle(view.template, card.fields) : ''
  return (
    <button class="small ghost" onClick={async () => {
      const r = await send({type: 'assumption.add', id: Math.random().toString(36).slice(2, 12), text: `Это действительно так: «${title}»`, category: 'desirability', linkedCardId: cardId, linkedTitle: `${view.template.emoji} ${title}`})
      toast(r ?? 'Записано в предположения — уточните формулировку там', r ? 'error' : 'ok')
    }}>🎯 Записать как предположение</button>
  )
}

// Предупреждения для выбранной концепции: на чём она держится
export function ThreatNote({view, cardId}: {view: PublicView; cardId: string}) {
  const t = threatsFor(cardId, view.assumptions)
  if (!t.linked.length) return null
  return (
    <div class="stack" style={{gap: 6}}>
      {t.refuted.length > 0 && <div class="threat bad">⛔ Под угрозой: опровергнуто {t.refuted.map(a => `«${a.text}»`).join(', ')}</div>}
      {t.leapUntested.length > 0 && <div class="threat warn">🎯 Держится на непроверенном важном: {t.leapUntested.map(a => `«${a.text}»`).join(', ')}</div>}
      <div class="tiny muted">Предположения: {t.linked.map(a => `${STATUS_ICON[a.status]} ${a.text}`).join(' · ')}</div>
    </div>
  )
}

function RiskRegister({view}: {view: PublicView}) {
  const rows = riskRows(view.results!.cards, view.criteria, view.decisions)
  const title = (id: string) => { const c = view.cards.find(x => x.id === id); return c ? cardTitle(view.template, c.fields) : id }
  return (
    <div class="card stack">
      <h2>🧯 Реестр рисков</h2>
      <div class="tiny muted">🔥 — критический: и вероятность, и ущерб в среднем 3,5 и выше.</div>
      <table class="simple">
        <thead><tr><th>Сценарий провала</th><th>Вероятн.</th><th>Ущерб</th><th>Что делаем</th></tr></thead>
        <tbody>{rows.map(x => (
          <tr key={x.cardId}>
            <td>{x.critical ? '🔥 ' : ''}{title(x.cardId)}</td>
            <td>{x.probability?.toFixed(1) ?? '—'}</td>
            <td>{x.damage?.toFixed(1) ?? '—'}</td>
            <td>{x.status ? RISK_STATUS_LABEL[x.status] : <span class="muted">не решено</span>}{x.mitigation ? <div class="small">{x.mitigation}</div> : null}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
