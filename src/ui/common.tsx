import {useEffect, useState} from 'preact/hooks'
import qrcode from 'qrcode-generator'
import type {PublicCard, PublicView} from '../core/engine'
import {cardSubtitle, cardTitle, formatValue, type FieldDef, type StageTemplate} from '../core/template'
import type {CardResult} from '../core/math'
import {PHASE_LABEL, type Criterion, type Phase} from '../core/types'

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`
  return `${n} ${many}`
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function Timer({deadline, offset = 0}: {deadline?: number; offset?: number}) {
  const now = useNow()
  if (!deadline) return null
  const left = Math.round((deadline - (now + offset)) / 1000)
  const abs = Math.abs(left)
  const text = `${left < 0 ? '−' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  return <span class={`timer ${left < 0 ? 'over' : left <= 60 ? 'low' : ''}`} title="Осталось времени на шаг">{text}</span>
}

const STEP_ORDER: Phase[] = ['lobby', 'generate', 'evolve', 'merge', 'criteria', 'calibrate', 'shortlist', 'rate', 'results', 'decide', 'summary']

// Тонкая линия прогресса вместо ряда из десяти «таблеток»
export function PhaseSteps({view}: {view: PublicView}) {
  const flow = STEP_ORDER.filter(p => view.flow.includes(p))
  const cur = view.phase === 'rate2' ? 'results' : view.phase
  const idx = flow.indexOf(cur)
  return (
    <div class="progress" aria-label={`Шаг ${idx + 1} из ${flow.length}`} title={flow.map((p, i) => `${i + 1}. ${PHASE_LABEL[p]}`).join(' · ')}>
      {flow.map((p, i) => <i key={p} class={i < idx ? 'done' : i === idx ? 'on' : ''} />)}
    </div>
  )
}

export function stepLabel(view: PublicView): string {
  const flow = STEP_ORDER.filter(p => view.flow.includes(p))
  const cur = view.phase === 'rate2' ? 'results' : view.phase
  return `Шаг ${flow.indexOf(cur) + 1} из ${flow.length}`
}

// Короткое «что делать сейчас» в начале каждого шага
export function PhaseIntro({title, children, emoji}: {title: string; emoji?: string; children?: preact.ComponentChildren}) {
  return (
    <div class="intro">
      {emoji && <div class="intro-emoji" aria-hidden="true">{emoji}</div>}
      <div>
        <h2>{title}</h2>
        {children && <p class="muted">{children}</p>}
      </div>
    </div>
  )
}

const AVATAR_HUES = [262, 280, 245, 160, 170, 300, 225, 145]

export function Avatar({name, done, size = 36, dim}: {name: string; done?: boolean; size?: number; dim?: boolean}) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = AVATAR_HUES[h % AVATAR_HUES.length]
  const letters = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <span class={`avatar ${done ? 'done' : ''} ${dim ? 'dim' : ''}`} title={name}
      style={{'--h': hue, width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.38}px`} as preact.JSX.CSSProperties}>
      {letters}
      {done && <span class="avatar-check">✓</span>}
    </span>
  )
}

export function Avatars({people, doneIds, showNames = true}: {people: {id: string; name: string}[]; doneIds?: Set<string> | Record<string, boolean>; showNames?: boolean}) {
  const isDone = (id: string) => doneIds instanceof Set ? doneIds.has(id) : !!doneIds?.[id]
  return (
    <div class="avatars">
      {people.map(p => (
        <span class="avatar-item" key={p.id}>
          <Avatar name={p.name} done={doneIds ? isDone(p.id) : undefined} dim={doneIds ? !isDone(p.id) : false} />
          {showNames && <span class="avatar-name">{p.name}</span>}
        </span>
      ))}
    </div>
  )
}

export function Ring({value, total, size = 44}: {value: number; total: number; size?: number}) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r
  const frac = total ? Math.min(1, value / total) : 0
  return (
    <span class="ring" style={{width: `${size}px`, height: `${size}px`}} title={`${value} из ${total}`}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} class="ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} class="ring-fg" stroke-dasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{value}/{total}</b>
    </span>
  )
}

// Число «набегает» от 0 до значения
export function CountUp({value, ms = 900}: {value: number; ms?: number}) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{v}</>
}

// Экран «готово, ждём остальных»
export function Waiting({view, title, onEdit, editLabel = 'Изменить ответы'}: {view: PublicView; title: string; onEdit?: () => void; editLabel?: string}) {
  const active = view.participants.filter(p => p.active)
  const done = active.filter(p => view.progress[p.id]).length
  return (
    <div class="card waiting">
      <div class="waiting-check" aria-hidden="true">✓</div>
      <h2>{title}</h2>
      <p class="muted">{done < active.length ? `Ждём остальных — готовы ${done} из ${active.length}` : 'Все готовы — организатор вот-вот откроет следующий шаг'}</p>
      <Avatars people={active} doneIds={view.progress} />
      {onEdit && <button class="ghost small" onClick={onEdit}>{editLabel}</button>}
    </div>
  )
}

export function CardBody({tpl, card, full = false, refOptions}: {tpl: StageTemplate; card: PublicCard; full?: boolean; refOptions?: {id: string; title: string}[]}) {
  const show = (f: FieldDef) => {
    const v = card.fields[f.key]
    if (f.type === 'cardref') return refOptions?.find(o => o.id === v)?.title ?? formatValue(f, v)
    return formatValue(f, v)
  }
  return (
    <div>
      <div style={{fontWeight: 600}}>{cardTitle(tpl, card.fields)}</div>
      {card.parents?.length ? <div class="tiny" style={{color: 'var(--mint-deep)', fontWeight: 700}}>{card.parents[0].kind === 'combine' ? '🔗 объединение идей' : '🌱 развитие идеи'}</div> : null}
      {!full && <div class="muted small">{cardSubtitle(tpl, card.fields)}</div>}
      {full && (
        <div class="small stack" style={{marginTop: 6}}>
          {tpl.fields.filter(f => f.key !== tpl.titleField && show(f)).map(f => (
            <div key={f.key}>
              <span class="muted">{f.label}: </span>
              {f.type === 'link' ? <a href={String(card.fields[f.key])} target="_blank" rel="noopener noreferrer">{show(f)}</a> : show(f)}
            </div>
          ))}
        </div>
      )}
      {card.mergedTexts.length > 0 && (
        <details class="small" style={{marginTop: 6}}>
          <summary class="muted">Склеено: ещё {card.mergedTexts.length}</summary>
          {card.mergedTexts.map((t, i) => <div key={i} style={{marginTop: 4}}>• {cardTitle(tpl, t)} <span class="muted">{cardSubtitle(tpl, t)}</span></div>)}
        </details>
      )}
      {card.authorAliases && <div class="tiny muted" style={{marginTop: 4}}>Авторы: {card.authorAliases.join(', ')}</div>}
    </div>
  )
}

export function ScoreButtons({value, onChange, disabled}: {value: number | null | undefined; onChange: (v: 1 | 2 | 3 | 4 | 5 | null) => void; disabled?: boolean}) {
  return (
    <div>
      <div class="scores">
        {([1, 2, 3, 4, 5] as const).map(v => (
          <button key={v} type="button" disabled={disabled} class={`sc${v} ${value === v ? 'on' : ''}`} onClick={() => onChange(v)} aria-pressed={value === v}>{v}</button>
        ))}
      </div>
      <div class="scale-bar" />
      <button type="button" disabled={disabled} class={`small ghost ${value === null ? 'selected' : ''}`} style={{marginTop: 4}} onClick={() => onChange(null)}>
        Не могу оценить
      </button>
    </div>
  )
}

export function Anchors({c}: {c: Criterion}) {
  return (
    <div class="anchors">
      <div>1 — {c.anchors[1]}</div>
      <div>{c.anchors[3] ? `3 — ${c.anchors[3]}` : ''}</div>
      <div>5 — {c.anchors[5]}</div>
    </div>
  )
}

// Вместо трёх колонок описаний — одна строка: что значит выбранная оценка
export function AnchorLine({c, value}: {c: Criterion; value: number | null | undefined}) {
  let text: string
  if (value === null) text = 'Не могу оценить — эта оценка не войдёт в расчёт'
  else if (value === 1 || value === 3 || value === 5) text = c.anchors[value] ? `${value} — ${c.anchors[value]}` : ''
  else if (value === 2) text = `Между «${c.anchors[1]}» и «${c.anchors[3] ?? c.anchors[5]}»`
  else if (value === 4) text = `Между «${c.anchors[3] ?? c.anchors[1]}» и «${c.anchors[5]}»`
  else text = `1 — ${c.anchors[1]} · 5 — ${c.anchors[5]}`
  return <div class={`anchor-line ${value != null ? `sc${value} picked` : ''}`}>{text}</div>
}

export function Dist({values}: {values: number[]}) {
  const counts = [1, 2, 3, 4, 5].map(v => values.filter(x => x === v).length)
  return (
    <div>
      <div class="dist">
        {counts.map((n, i) => <div class="col" key={i}>{Array.from({length: n}, (_, j) => <span class={`pip sc${i + 1}`} key={j} />)}</div>)}
      </div>
      <div class="dist-axis">{[1, 2, 3, 4, 5].map(v => <span key={v}>{v}</span>)}</div>
    </div>
  )
}

export function Badges({r}: {r: CardResult}) {
  return (
    <span class="row" style={{gap: 4}}>
      {r.consensus && <span class="chip ok" title="Оценки близки, балл высокий">🤝 Согласие</span>}
      {r.disputed && <span class="chip warn" title="Оценки сильно расходятся — обсудите, почему">⚡ Спорно</span>}
      {r.gem && <span class="chip gem" title="Не в топ-2, но лучшая по новизне или с сильными сторонниками">💎 Скрытый бриллиант</span>}
      {r.guess && <span class="chip bad" title="Больше половины оценок основаны на догадке — проверьте опросом">🎲 На догадках</span>}
      {r.lowData && <span class="chip" title="Меньше двух оценок по одному из критериев">мало оценок</span>}
      {r.tie && <span class="chip accent" title="Разница с соседней карточкой не больше 2 баллов">ничья</span>}
    </span>
  )
}

export function Matrix({view, xId, yId}: {view: PublicView; xId: string; yId: string}) {
  const res = view.results
  if (!res) return null
  const cx = view.criteria.find(c => c.id === xId), cy = view.criteria.find(c => c.id === yId)
  if (!cx || !cy) return null
  const W = 420, H = 300, P = 40
  const sx = (v: number) => P + ((v - 1) / 4) * (W - 2 * P)
  const sy = (v: number) => H - P - ((v - 1) / 4) * (H - 2 * P)
  const pts = res.cards.map(r => {
    const x = r.perCriterion.find(p => p.criterionId === xId)?.mean
    const y = r.perCriterion.find(p => p.criterionId === yId)?.mean
    return x != null && y != null ? {rank: r.rank, x, y} : null
  }).filter(Boolean) as {rank: number; x: number; y: number}[]
  return (
    <div class="matrix">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Матрица ${cx.name} × ${cy.name}`}>
        <defs>
          <linearGradient id="ptgrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="var(--s1)" />
            <stop offset="100%" stop-color="var(--s5)" />
          </linearGradient>
        </defs>
        <rect class="q-good" x={W / 2} y={P} width={W / 2 - P} height={H / 2 - P} />
        <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="none" />
        <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} stroke-dasharray="4 4" />
        <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke-dasharray="4 4" />
        <text x={W / 2} y={H - 10} text-anchor="middle">{cx.name} →</text>
        <text x={12} y={H / 2} text-anchor="middle" transform={`rotate(-90 12 ${H / 2})`}>{cy.name} →</text>
        {pts.map(p => (
          <g key={p.rank}>
            <circle class="pt" cx={sx(p.x)} cy={sy(p.y)} r={13} />
            <text class="pt-label" x={sx(p.x)} y={sy(p.y) + 4} text-anchor="middle" style={{fill: 'var(--accent-ink)'}}>{p.rank}</text>
          </g>
        ))}
      </svg>
      <div class="tiny muted">Номер точки — место в рейтинге. Зелёная четверть — сильные по обеим осям. Оценки уже с учётом направления критерия.</div>
    </div>
  )
}

export function QR({text}: {text: string}) {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  return <div class="qr" dangerouslySetInnerHTML={{__html: q.createSvgTag({cellSize: 6, margin: 2, scalable: true})}} />
}

export function ErrorLine({msg}: {msg: string | null}) {
  return msg ? <div class="error" role="alert">{msg}</div> : null
}
