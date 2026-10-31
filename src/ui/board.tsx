// MVP-доска: корзины «MVP / 2.0 / потом», зависимости и бюджет сложности.
import {useState} from 'preact/hooks'
import {BUCKET_LABEL, dependencyClosure, type Bucket} from '../core/board'
import type {Action, PublicView} from '../core/engine'
import {asText, cardTitle} from '../core/template'
import {PhaseIntro} from './common'
import {toast} from './toast'

const BUCKETS: Bucket[] = ['mvp', 'v2', 'later']

export function BoardPanel({view, host}: {view: PublicView; host?: (a: Action) => string | null}) {
  const b = view.board
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<Bucket | null>(null)
  const [depsFor, setDepsFor] = useState<string | null>(null)
  if (!b) return null
  const run = (a: Action) => { const r = host?.(a); if (r) toast(r, 'error') }
  const title = (id: string) => { const c = view.cards.find(x => x.id === id); return c ? cardTitle(view.template, c.fields) : '?' }
  const chk = b.check
  const pct = Math.min(100, Math.round((chk.mvpEffort / b.budget) * 100))
  const editable = !!host
  return (
    <div class="stack">
      {editable
        ? <PhaseIntro emoji="🚀" title="Собираем MVP">Сервис разложил компоненты по ценности и сложности — поправьте. В MVP — минимум, который проверяет главную пользу.</PhaseIntro>
        : <PhaseIntro emoji="🚀" title="MVP-доска">Организатор раскладывает компоненты по корзинам — обсуждайте вслух.</PhaseIntro>}

      <div class="card stack">
        <div class="row between">
          <b>Сложность MVP: {chk.mvpEffort} из {b.budget} очков</b>
          {editable && (
            <label class="row small">Бюджет
              <input type="text" inputMode="decimal" style={{width: 70}} defaultValue={String(b.budget)}
                onChange={e => run({type: 'board.budget', budget: Number((e.target as HTMLInputElement).value.replace(',', '.'))})} />
            </label>
          )}
        </div>
        <div class={`bar budget ${chk.overBudget ? 'over' : ''}`}><i style={{width: `${pct}%`}} /></div>
        <div class="tiny muted">Очки — сумма средних оценок «Сложности» компонентов в MVP (1 — за вечер, 5 — месяц и больше).</div>
        {chk.overBudget && <div class="threat warn">⚠️ MVP слишком большой: {chk.mvpEffort} при бюджете {b.budget}. Перенесите что-то в «Версию 2.0».</div>}
        {chk.emptyMvp && <div class="threat warn">В MVP пока пусто — что минимально нужно, чтобы проверить главную пользу?</div>}
        {chk.brokenDeps.map(x => (
          <div class="threat bad row between" key={x.cardId}>
            <span>⛔ MVP не соберётся: «{title(x.cardId)}» зависит от {x.missing.map(m => `«${title(m)}»`).join(', ')}</span>
            {editable && <button class="small" onClick={() => run({type: 'board.move', cardIds: dependencyClosure(x.cardId, b.deps), bucket: 'mvp'})}>Добавить в MVP</button>}
          </div>
        ))}
        {chk.cycles.map(c => <div class="threat warn" key={c.join()}>🔁 Взаимная зависимость: {c.map(title).join(' ↔ ')} — может, это один компонент?</div>)}
      </div>

      <div class="board">
        {BUCKETS.map(bk => {
          const ids = Object.keys(b.buckets).filter(id => b.buckets[id] === bk && view.cards.some(c => c.id === id))
          return (
            <div key={bk} class={`bucket ${bk} ${over === bk ? 'drag-over' : ''}`}
              onDragOver={e => { if (editable) { e.preventDefault(); setOver(bk) } }} onDragLeave={() => setOver(null)}
              onDrop={e => { e.preventDefault(); if (drag) run({type: 'board.move', cardIds: [drag], bucket: bk}); setDrag(null); setOver(null) }}>
              <div class="bucket-head"><b>{BUCKET_LABEL[bk]}</b><span class="chip">{ids.length}</span></div>
              {ids.map(id => {
                const c = view.cards.find(x => x.id === id)!
                const sc = b.scores[id]
                const deps = b.deps[id] ?? []
                return (
                  <div class="card comp" key={id} draggable={editable} onDragStart={() => setDrag(id)} onDragEnd={() => setDrag(null)}>
                    <div style={{fontWeight: 700}}>{cardTitle(view.template, c.fields)}</div>
                    <div class="row" style={{gap: 4, marginTop: 4}}>
                      {c.fields.type ? <span class="chip">{asText(c.fields.type)}</span> : null}
                      <span class="chip ok" title="Ценность">💎 {sc?.value?.toFixed(1) ?? '—'}</span>
                      <span class="chip warn" title="Сложность">🏋️ {sc?.effort?.toFixed(1) ?? '—'}</span>
                    </div>
                    {deps.length > 0 && <div class="tiny muted" style={{marginTop: 4}}>Зависит от: {deps.map(title).join(', ')}</div>}
                    {editable && (
                      <div class="row" style={{gap: 4, marginTop: 6}}>
                        {BUCKETS.filter(x => x !== bk).map(x => (
                          <button key={x} class="small ghost" onClick={() => run({type: 'board.move', cardIds: [id], bucket: x})}>→ {BUCKET_LABEL[x].split(' ').slice(1).join(' ')}</button>
                        ))}
                        <button class="small ghost" onClick={() => setDepsFor(depsFor === id ? null : id)}>🔗 Зависит от…</button>
                      </div>
                    )}
                    {editable && depsFor === id && (
                      <div class="row" style={{gap: 4, marginTop: 6}}>
                        {view.cards.filter(x => x.id !== id).map(x => (
                          <button key={x.id} class={`small ${deps.includes(x.id) ? 'selected' : ''}`}
                            onClick={() => run({type: 'board.deps', cardId: id, deps: deps.includes(x.id) ? deps.filter(d => d !== x.id) : [...deps, x.id]})}>
                            {cardTitle(view.template, x.fields)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {!ids.length && <div class="tiny muted center" style={{padding: 12}}>{editable ? 'Перетащите сюда' : 'Пусто'}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function boardMarkdown(view: PublicView): string {
  const b = view.board
  if (!b) return ''
  const title = (id: string) => { const c = view.cards.find(x => x.id === id); return c ? cardTitle(view.template, c.fields) : id }
  const L = ['## MVP-доска', '', `Сложность MVP: ${b.check.mvpEffort} из ${b.budget} очков${b.check.overBudget ? ' — больше бюджета' : ''}.`, '']
  for (const bk of BUCKETS) {
    const ids = Object.keys(b.buckets).filter(id => b.buckets[id] === bk)
    L.push(`**${BUCKET_LABEL[bk]}**`)
    for (const id of ids) {
      const sc = b.scores[id]
      const deps = b.deps[id] ?? []
      L.push(`- ${title(id)} (ценность ${sc?.value?.toFixed(1) ?? '—'}, сложность ${sc?.effort?.toFixed(1) ?? '—'})${deps.length ? ` — зависит от: ${deps.map(title).join(', ')}` : ''}`)
    }
    if (!ids.length) L.push('- —')
    L.push('')
  }
  for (const x of b.check.brokenDeps) L.push(`⚠️ «${title(x.cardId)}» зависит от того, что не попало в MVP: ${x.missing.map(title).join(', ')}`)
  return L.join('\n') + '\n'
}
