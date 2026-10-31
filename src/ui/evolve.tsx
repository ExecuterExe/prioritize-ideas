// Шаг «Развитие» у участника: назначенные чужие карточки — развить или объединить.
// И дерево происхождения со сравнением версий для результатов.
import {useMemo, useState} from 'preact/hooks'
import type {Action, PublicCard, PublicView} from '../core/engine'
import {EVOLVE_LIMIT, ancestors, treeDepths, wordDiff} from '../core/evolve'
import {asText, cardTitle, validateCard, type FieldValue} from '../core/template'
import {BASIS_LABEL, type Basis} from '../core/types'
import {lsGet, lsSet} from '../store/db'
import {CardForm} from './cardform'
import {CardBody, ErrorLine, PhaseIntro, Waiting} from './common'
import {toast} from './toast'

type Send = (a: Action) => Promise<string | null>
const newId = () => Math.random().toString(36).slice(2, 12)

interface Draft {
  kind: 'develop' | 'combine'
  parentIds: string[]
  fields: Record<string, FieldValue>
  basis?: Basis
  editId?: string
}

export function EvolveStep({view, send, pid, assignKey, storeKey}: {view: PublicView; send: Send; pid: string; assignKey: string; storeKey: string}) {
  const key = `${storeKey}:evolved`
  const [mine, setMine] = useState<string[]>(() => lsGet<string[]>(key, []))
  const remember = (id: string) => setMine(prev => { const next = [...prev, id]; lsSet(key, next); return next })
  const forget = (id: string) => setMine(prev => { const next = prev.filter(x => x !== id); lsSet(key, next); return next })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [again, setAgain] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const tpl = view.template
  const byId = (id: string) => view.cards.find(c => c.id === id)
  const assigned = (view.evolveAssign?.[assignKey] ?? []).map(byId).filter(Boolean) as PublicCard[]
  const myNew = view.cards.filter(c => mine.includes(c.id))
  const others = view.cards.filter(c => !assigned.includes(c) && !mine.includes(c.id) && !c.parents?.length)
  const limitReached = myNew.length >= EVOLVE_LIMIT
  const done = view.progress[pid]

  if (done && !again) return <Waiting view={view} title="Готово — спасибо за идеи" onEdit={() => setAgain(true)} editLabel="Вернуться к развитию" />

  const start = (kind: Draft['kind'], c: PublicCard) => {
    setDraft({kind, parentIds: [c.id], fields: {...c.fields}})
    setFormKey(k => k + 1)
    setErr(null)
  }
  const check = draft ? validateCard(tpl, draft.fields) : null
  const ready = !!draft && check!.errors.length === 0 && (!tpl.askBasis || !!draft.basis) && (draft.kind === 'develop' || draft.parentIds.length === 2)

  const save = async () => {
    if (!draft) return
    const fields = validateCard(tpl, draft.fields).values
    if (draft.editId) {
      const r = await send({type: 'card.upsert', id: draft.editId, fields, basis: draft.basis})
      setErr(r)
      if (!r) { setDraft(null); toast('Версия обновлена') }
      return
    }
    const id = newId()
    const r = draft.kind === 'develop'
      ? await send({type: 'card.develop', id, parentId: draft.parentIds[0], fields, basis: draft.basis})
      : await send({type: 'card.combine', id, parentIds: draft.parentIds, fields, basis: draft.basis})
    setErr(r)
    if (!r) { remember(id); setDraft(null); toast(draft.kind === 'develop' ? 'Новая версия добавлена 🌱' : 'Идеи объединены 🔗') }
  }

  const CardWithActions = ({c}: {c: PublicCard}) => (
    <div class="card stack">
      <div class="row" style={{gap: 8, alignItems: 'flex-start', flexWrap: 'nowrap'}}>
        <span class="rank">№{c.num}</span>
        <div style={{flex: 1, minWidth: 0}}><CardBody tpl={tpl} card={c} full refOptions={view.refOptions} /></div>
      </div>
      {!limitReached && !draft && (
        <div class="row">
          <button class="small primary" onClick={() => start('develop', c)}>🌱 Развить</button>
          <button class="small" onClick={() => start('combine', c)}>🔗 Объединить с…</button>
        </div>
      )}
    </div>
  )

  return (
    <div class="stack">
      <PhaseIntro emoji="🌱" title="Развиваем чужие идеи">
        Вам достались чужие карточки. Улучшите идею или объедините две в одну — до {EVOLVE_LIMIT} новых версий. Исходные карточки остаются.
      </PhaseIntro>

      {draft && (
        <div class="card stack evolve-editor">
          <b>{draft.editId ? 'Правка вашей версии' : draft.kind === 'develop' ? `🌱 Развитие №${byId(draft.parentIds[0])?.num}` : '🔗 Объединение'}</b>
          {draft.kind === 'combine' && !draft.editId && (
            <label class="field"><span>С какой карточкой объединяем</span>
              <select value={draft.parentIds[1] ?? ''} onChange={e => {
                const v = (e.target as HTMLSelectElement).value
                setDraft({...draft, parentIds: v ? [draft.parentIds[0], v] : [draft.parentIds[0]]})
              }}>
                <option value="">— выберите вторую карточку —</option>
                {view.cards.filter(c => c.id !== draft.parentIds[0]).map(c => <option key={c.id} value={c.id}>№{c.num} {cardTitle(tpl, c.fields)}</option>)}
              </select>
            </label>
          )}
          {draft.kind === 'combine' && draft.parentIds[1] && (
            <div class="note small"><b>Вторая идея №{byId(draft.parentIds[1])?.num}:</b> {tpl.fields.map(f => asText(byId(draft.parentIds[1])?.fields[f.key])).filter(Boolean).join(' · ')}</div>
          )}
          <div class="tiny muted">Поля заполнены текстом исходной карточки — перепишите их так, чтобы идея стала сильнее.</div>
          <CardForm key={formKey} tpl={tpl} values={draft.fields} refOptions={view.refOptions}
            onChange={(k, v) => setDraft(d => (d ? {...d, fields: {...d.fields, [k]: v}} : d))} />
          {tpl.askBasis && (
            <div class="row">
              {(Object.keys(BASIS_LABEL) as Basis[]).map(b => (
                <button key={b} type="button" class={`small ${draft.basis === b ? 'selected' : ''}`} onClick={() => setDraft(d => (d ? {...d, basis: b} : d))}>{BASIS_LABEL[b]}</button>
              ))}
            </div>
          )}
          <ErrorLine msg={err} />
          <div class="row">
            <button class="primary" disabled={!ready} onClick={save}>{draft.editId ? 'Сохранить' : 'Добавить версию'}</button>
            <button class="ghost" onClick={() => { setDraft(null); setErr(null) }}>Отмена</button>
          </div>
          {!ready && <div class="tiny muted">{draft.kind === 'combine' && draft.parentIds.length < 2 ? 'Выберите вторую карточку.' : check?.errors[0] ?? 'Отметьте, откуда это известно.'}</div>}
        </div>
      )}

      {myNew.length > 0 && (
        <div class="stack">
          <b>Ваши новые версии ({myNew.length} из {EVOLVE_LIMIT})</b>
          {myNew.map(c => (
            <div class="card row between" key={c.id}>
              <div style={{minWidth: 0}}>
                <div style={{fontWeight: 700}}>{cardTitle(tpl, c.fields)}</div>
                <div class="tiny muted">{originLabel(c, view)}</div>
              </div>
              <div class="row">
                <button class="small" onClick={() => { setDraft({kind: c.parents?.[0]?.kind ?? 'develop', parentIds: c.parents?.map(p => p.id) ?? [], fields: {...c.fields}, editId: c.id}); setFormKey(k => k + 1) }}>Изменить</button>
                <button class="small ghost danger" onClick={async () => { const r = await send({type: 'card.delete', id: c.id}); if (!r) { forget(c.id); toast('Версия удалена', 'info') } else toast(r, 'error') }}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {assigned.length > 0
        ? <><b>Вам достались</b>{assigned.map(c => <CardWithActions key={c.id} c={c} />)}</>
        : <div class="card small muted">Назначенных карточек не нашлось — развивайте любые из списка ниже.</div>}

      {others.length > 0 && (
        <details class="more" open={showAll || assigned.length === 0} onToggle={e => setShowAll((e.target as HTMLDetailsElement).open)}>
          <summary>Остальные карточки ({others.length})</summary>
          <div class="stack" style={{marginTop: 8}}>{others.map(c => <CardWithActions key={c.id} c={c} />)}</div>
        </details>
      )}

      <button class="primary" style={{alignSelf: 'flex-start'}} onClick={async () => { const r = await send({type: 'evolve.done'}); if (r) toast(r, 'error'); else setAgain(false) }}>
        {myNew.length ? 'Готово' : 'Пропустить — мне нечего добавить'}
      </button>
    </div>
  )
}

export function originLabel(c: PublicCard, view: PublicView): string {
  if (!c.parents?.length) return ''
  const nums = c.parents.map(p => `№${view.cards.find(x => x.id === p.id)?.num ?? '?'}`)
  return c.parents[0].kind === 'combine' ? `сочетание ${nums.join(' + ')}` : `развитие ${nums[0]}`
}

// ——— Дерево происхождения ———

export function GenealogyTree({view}: {view: PublicView}) {
  const cards = view.cards
  const involved = useMemo(() => {
    const set = new Set<string>()
    for (const c of cards) if (c.parents?.length) { set.add(c.id); c.parents.forEach(p => set.add(p.id)) }
    return cards.filter(c => set.has(c.id))
  }, [cards])
  const [sel, setSel] = useState<string | null>(null)
  if (!involved.length) return null
  const depths = treeDepths(involved)
  const maxD = Math.max(...involved.map(c => depths.get(c.id) ?? 0))
  const cols = Array.from({length: maxD + 1}, (_, d) => involved.filter(c => depths.get(c.id) === d))
  const W = 190, H = 58, GX = 50, GY = 14
  const pos = new Map<string, {x: number; y: number}>()
  cols.forEach((col, d) => col.forEach((c, i) => pos.set(c.id, {x: d * (W + GX), y: i * (H + GY)})))
  const width = cols.length * (W + GX) - GX
  const height = Math.max(...cols.map(col => col.length)) * (H + GY) - GY
  const leader = view.results?.cards[0]?.cardId
  const lineage = leader ? new Set([leader, ...ancestors(leader, cards)]) : new Set<string>()
  const score = (id: string) => view.results?.cards.find(r => r.cardId === id)?.score
  const selected = cards.find(c => c.id === sel)
  return (
    <div class="card stack">
      <h3 style={{margin: 0}}>🌳 Откуда выросли идеи</h3>
      <div class="tiny muted">Слева — исходные карточки, правее — развития и объединения. Подсвечен путь к лидеру. Нажмите на карточку-версию, чтобы сравнить с исходной.</div>
      <div class="tree-scroll">
        <svg class="tree" viewBox={`-4 -4 ${width + 8} ${height + 8}`} width={width + 8} height={height + 8} role="img" aria-label="Дерево происхождения идей">
          {involved.flatMap(c => (c.parents ?? []).map(p => {
            const a = pos.get(p.id), b = pos.get(c.id)
            if (!a || !b) return null
            const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2
            const on = lineage.has(c.id) && lineage.has(p.id)
            return <path key={`${p.id}-${c.id}`} class={`edge ${p.kind} ${on ? 'on' : ''}`} d={`M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2},${y2}`} />
          }))}
          {involved.map(c => {
            const p = pos.get(c.id)!
            const s = score(c.id)
            const title = cardTitle(view.template, c.fields)
            return (
              <g key={c.id} class={`node ${lineage.has(c.id) ? 'on' : ''} ${c.id === leader ? 'lead' : ''} ${sel === c.id ? 'sel' : ''}`}
                transform={`translate(${p.x},${p.y})`} onClick={() => setSel(sel === c.id ? null : c.id)} style={{cursor: c.parents?.length ? 'pointer' : 'default'}}>
                <rect width={W} height={H} rx={12} />
                <text x={10} y={20} class="n-num">№{c.num}{c.id === leader ? ' 🏆' : ''}</text>
                {s != null && <text x={W - 10} y={20} text-anchor="end" class="n-score">{s}</text>}
                <text x={10} y={42} class="n-title">{title.length > 26 ? `${title.slice(0, 25)}…` : title}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div class="row tiny muted"><span>── развитие</span><span>- - - объединение</span></div>
      {selected?.parents?.length ? <VersionCompare child={selected} view={view} /> : null}
    </div>
  )
}

function VersionCompare({child, view}: {child: PublicCard; view: PublicView}) {
  const tpl = view.template
  const textFields = tpl.fields.filter(f => f.type === 'text' || f.type === 'longtext')
  return (
    <div class="stack compare">
      <b>№{child.num} — {originLabel(child, view)}</b>
      {child.parents!.map(p => {
        const parent = view.cards.find(c => c.id === p.id)
        if (!parent) return null
        return (
          <div key={p.id} class="stack" style={{gap: 6}}>
            <div class="tiny muted">Что изменилось относительно №{parent.num}:</div>
            {textFields.map(f => {
              const a = asText(parent.fields[f.key]), b = asText(child.fields[f.key])
              if (a === b) return null
              const parts = wordDiff(a, b)
              const same = parts.filter(x => x.kind === 'same').reduce((n, x) => n + x.text.trim().length, 0)
              // Если переписано почти всё, пословная подсветка нечитаема — показываем «было → стало»
              if (same < Math.max(a.length, b.length) * 0.4) {
                return (
                  <div key={f.key} class="small">
                    <span class="muted">{f.label}: </span>
                    <span class="diff-del">{a || '—'}</span> → <span class="diff-add">{b || '—'}</span>
                  </div>
                )
              }
              return (
                <div key={f.key} class="small">
                  <span class="muted">{f.label}: </span>
                  {parts.map((part, i) => <span key={i} class={`diff-${part.kind}`}>{part.text}</span>)}
                </div>
              )
            })}
            {textFields.every(f => asText(parent.fields[f.key]) === asText(child.fields[f.key])) && <div class="tiny muted">Текст не менялся</div>}
          </div>
        )
      })}
    </div>
  )
}
