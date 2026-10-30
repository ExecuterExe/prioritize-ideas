import {useEffect, useState} from 'preact/hooks'
import qrcode from 'qrcode-generator'
import type {PublicCard, PublicView} from '../core/engine'
import {CARD_FIELDS, cardSubtitle, cardTitle} from '../core/library'
import type {CardResult} from '../core/math'
import {PHASE_LABEL, type Criterion, type Phase, type StageType} from '../core/types'

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
  return <span class={`timer ${left < 0 ? 'over' : left <= 60 ? 'low' : ''}`} title="Осталось времени на шаг">⏱ {text}</span>
}

const STEP_ORDER: Phase[] = ['lobby', 'generate', 'merge', 'criteria', 'calibrate', 'shortlist', 'rate', 'results', 'decide', 'summary']

export function PhaseSteps({view}: {view: PublicView}) {
  const flow = STEP_ORDER.filter(p => view.flow.includes(p))
  const cur = view.phase === 'rate2' ? 'results' : view.phase
  const idx = flow.indexOf(cur)
  return (
    <div class="steps" aria-label="Шаги">
      {flow.map((p, i) => <span key={p} class={i === idx ? 'on' : i < idx ? 'done' : ''}>{PHASE_LABEL[p]}</span>)}
    </div>
  )
}

export function CardBody({type, card, full = false}: {type: StageType; card: PublicCard; full?: boolean}) {
  const fields = CARD_FIELDS[type]
  return (
    <div>
      <div style={{fontWeight: 600}}>{cardTitle(type, card.fields)}</div>
      {!full && <div class="muted small">{cardSubtitle(type, card.fields)}</div>}
      {full && (
        <div class="small stack" style={{marginTop: 6}}>
          {fields.filter(f => card.fields[f.key] && !(type === 'problem' && f.key === 'what') && !(type === 'idea' && f.key === 'title')).map(f => (
            <div key={f.key}><span class="muted">{f.label}: </span>{card.fields[f.key]}</div>
          ))}
        </div>
      )}
      {card.mergedTexts.length > 0 && (
        <details class="small" style={{marginTop: 6}}>
          <summary class="muted">Склеено: ещё {card.mergedTexts.length}</summary>
          {card.mergedTexts.map((t, i) => <div key={i} style={{marginTop: 4}}>• {cardTitle(type, t)} <span class="muted">{cardSubtitle(type, t)}</span></div>)}
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
          <button key={v} type="button" disabled={disabled} class={value === v ? 'primary' : ''} onClick={() => onChange(v)} aria-pressed={value === v}>{v}</button>
        ))}
      </div>
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

export function Dist({values}: {values: number[]}) {
  const counts = [1, 2, 3, 4, 5].map(v => values.filter(x => x === v).length)
  return (
    <div>
      <div class="dist">
        {counts.map((n, i) => <div class="col" key={i}>{Array.from({length: n}, (_, j) => <span class="pip" key={j} />)}</div>)}
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
        <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} fill="none" />
        <line x1={W / 2} y1={P} x2={W / 2} y2={H - P} stroke-dasharray="4 4" />
        <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke-dasharray="4 4" />
        <text x={W / 2} y={H - 10} text-anchor="middle">{cx.name} →</text>
        <text x={12} y={H / 2} text-anchor="middle" transform={`rotate(-90 12 ${H / 2})`}>{cy.name} →</text>
        {pts.map(p => (
          <g key={p.rank}>
            <circle class="pt" cx={sx(p.x)} cy={sy(p.y)} r={11} />
            <text class="pt-label" x={sx(p.x)} y={sy(p.y) + 4} text-anchor="middle" style={{fill: 'var(--accent-ink)'}}>{p.rank}</text>
          </g>
        ))}
      </svg>
      <div class="tiny muted">Номер точки — место в рейтинге. Оценки уже с учётом направления критерия.</div>
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
