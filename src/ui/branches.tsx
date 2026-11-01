// Ветки: выбор на телефоне, раскладка у ведущего, сравнение лидеров после раскрытия.
import type {Action, PublicView} from '../core/engine'
import {compareBranches} from '../core/branches'
import {cardTitle} from '../core/template'
import {toPercent} from '../core/math'
import {Avatar} from './common'
import {toast} from './toast'

export function BranchPicker({view, pid, send}: {view: PublicView; pid: string; send: (a: Action) => Promise<string | null>}) {
  if (!view.branches) return null
  const mine = view.branchOf[pid]
  const count = (id: string) => Object.values(view.branchOf).filter(v => v === id).length
  return (
    <div class="card stack">
      <b>⑂ Команда делится на две ветки — выберите свою</b>
      <div class="branch-grid">
        {view.branches.map(b => (
          <button key={b.id} class={`branch-choice ${mine === b.id ? 'selected' : ''}`}
            onClick={async () => { const r = await send({type: 'branch.join', branchId: b.id}); if (r) toast(r, 'error') }}>
            <span class="branch-tag">{b.id}</span>
            <b>{b.title}</b>
            {b.source && b.source !== b.title && <small>{b.source}</small>}
            <small>{count(b.id)} чел.{mine === b.id ? ' · вы здесь' : ''}</small>
          </button>
        ))}
      </div>
      {!mine && <div class="tiny muted">Не выберете — сервис разложит команду поровну.</div>}
    </div>
  )
}

// Подсказка на шаге генерации: о чём пишет ваша ветка
export function MyBranchNote({view, pid}: {view: PublicView; pid: string}) {
  const b = view.branches?.find(x => x.id === view.branchOf[pid])
  if (!b) return null
  return <div class="note"><span class="branch-tag">{b.id}</span> <b>Ваша ветка:</b> {b.source ?? b.title}</div>
}

export function BranchBoard({view, host}: {view: PublicView; host: (a: Action) => string | null}) {
  if (!view.branches) return null
  const people = view.participants.filter(p => p.active)
  return (
    <div class="card stack">
      <div class="row between"><b>⑂ Раскладка по веткам</b><span class="tiny muted">кто не выбрал — разложим поровну на старте</span></div>
      <div class="branch-grid">
        {view.branches.map(b => (
          <div class="branch-col" key={b.id}>
            <div><span class="branch-tag">{b.id}</span> <b>{b.title}</b></div>
            {people.filter(p => view.branchOf[p.id] === b.id).map(p => (
              <div class="row between" key={p.id}>
                <span class="row" style={{gap: 6}}><Avatar name={p.name} size={26} /> {p.name}</span>
                <button class="small ghost" title="Перевести в другую ветку"
                  onClick={() => { const other = view.branches!.find(x => x.id !== b.id)!; const r = host({type: 'branch.assign', pid: p.id, branchId: other.id}); if (r) toast(r, 'error') }}>⇄</button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {people.some(p => !view.branchOf[p.id]) && (
        <div class="tiny muted">Пока без ветки: {people.filter(p => !view.branchOf[p.id]).map(p => p.name).join(', ')}</div>
      )}
    </div>
  )
}

export function BranchCompare({view}: {view: PublicView}) {
  if (!view.branches || !view.results) return null
  const crit = view.criteria.filter(c => c.approved)
  const rows = compareBranches(view.branches, view.cards, view.branchOf, view.results, view.criteria)
  const best = rows.filter(r => r.leader).sort((a, b) => a.leader!.rank - b.leader!.rank)[0]
  return (
    <div class="card stack">
      <h3 style={{margin: 0}}>⑂ Сравнение веток</h3>
      <div class="branch-grid">
        {rows.map(r => {
          const card = r.leader && view.cards.find(c => c.id === r.leader!.cardId)
          return (
            <div class={`branch-col ${best === r ? 'best' : ''}`} key={r.branch.id}>
              <div><span class="branch-tag">{r.branch.id}</span> <b>{r.branch.title}</b></div>
              <div class="tiny muted">{r.people} чел. · {r.cards} карт.{r.disputed ? ` · спорных: ${r.disputed}` : ''}</div>
              {card && r.leader?.score != null
                ? (
                  <>
                    <div class="row between"><b>{cardTitle(view.template, card.fields)}</b><span class="chip accent">{r.leader.score} · №{r.leader.rank}</span></div>
                    {crit.map(c => {
                      const v = r.avgByCriterion.find(x => x.criterionId === c.id)?.value
                      return (
                        <div class="branch-bar" key={c.id}>
                          <span class="tiny">{c.name}</span>
                          <span class="bar"><i style={{width: `${v == null ? 0 : toPercent(v)}%`}} /></span>
                          <span class="tiny">{v == null ? '—' : v.toFixed(1)}</span>
                        </div>
                      )
                    })}
                  </>
                )
                : <div class="tiny muted">Карточки ветки не попали в оценку</div>}
            </div>
          )
        })}
      </div>
      <div class="tiny muted">Оценивали все вместе и вслепую — ветки сравниваются честно. Объединить лучшее можно через «Что дальше?».</div>
    </div>
  )
}
