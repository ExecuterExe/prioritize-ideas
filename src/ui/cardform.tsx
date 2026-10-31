// Форма карточки по шаблону: каждое поле рисуется по своему типу.
// Используется у участника и в предпросмотре редактора шаблонов.
import {useState} from 'preact/hooks'
import {isEmpty, isVisible, type FieldDef, type FieldValue, type StageTemplate} from '../core/template'

interface Props {
  tpl: StageTemplate
  values: Record<string, FieldValue>
  onChange: (key: string, value: FieldValue) => void
  refOptions?: {id: string; title: string}[]
  disabled?: boolean
}

export function CardForm({tpl, values, onChange, refOptions = [], disabled}: Props) {
  const [showOptional, setShowOptional] = useState(false)
  const visible = tpl.fields.filter(f => isVisible(f, values))
  const shown = visible.filter(f => f.required || showOptional || !isEmpty(values[f.key]) || f.showIf)
  const hidden = visible.filter(f => !shown.includes(f))
  return (
    <div class="stack">
      {shown.map(f => <Field key={f.key} f={f} value={values[f.key]} onChange={v => onChange(f.key, v)} refOptions={refOptions} disabled={disabled} />)}
      {hidden.length > 0 && (
        <button type="button" class="ghost small" style={{alignSelf: 'flex-start'}} onClick={() => setShowOptional(true)}>
          + {hidden.map(f => f.label.toLowerCase()).join(', ')}
        </button>
      )}
    </div>
  )
}

function Field({f, value, onChange, refOptions, disabled}: {f: FieldDef; value: FieldValue | undefined; onChange: (v: FieldValue) => void; refOptions: {id: string; title: string}[]; disabled?: boolean}) {
  const label = <span>{f.label}{f.required ? ' *' : ''}</span>
  const str = value === null || value === undefined ? '' : String(value)
  const onText = (e: Event) => onChange((e.target as HTMLInputElement).value)
  switch (f.type) {
    case 'text':
      return <label class="field">{label}<input type="text" placeholder={f.hint} value={str} maxLength={200} disabled={disabled} onInput={onText} /></label>
    case 'longtext':
      return <label class="field">{label}<textarea placeholder={f.hint} value={str} maxLength={600} disabled={disabled} onInput={onText} /></label>
    case 'link':
      return <label class="field">{label}<input type="url" inputMode="url" placeholder={f.hint || 'https://…'} value={str} disabled={disabled} onInput={onText} /></label>
    case 'number':
    case 'percent':
      return (
        <label class="field">{label}
          <span class="row" style={{flexWrap: 'nowrap'}}>
            <input type="text" inputMode="decimal" placeholder={f.hint} value={str} disabled={disabled} style={{maxWidth: 180}}
              onInput={onText} />
            {f.type === 'percent' && <b class="muted">%</b>}
          </span>
        </label>
      )
    case 'date':
      return <label class="field">{label}<input type="date" value={str} disabled={disabled} style={{maxWidth: 220}} onInput={onText} /></label>
    case 'checkbox':
      return (
        <label class="check switch">
          <input type="checkbox" checked={value === true} disabled={disabled} onChange={e => onChange((e.target as HTMLInputElement).checked)} />
          <span>{f.label}</span>
        </label>
      )
    case 'select': {
      const opts = f.options ?? []
      if (opts.length <= 5) {
        return (
          <div class="field">{label}
            <div class="row">
              {opts.map(o => <button type="button" key={o} disabled={disabled} class={`small ${value === o ? 'selected' : ''}`} onClick={() => onChange(value === o ? null : o)}>{o}</button>)}
            </div>
          </div>
        )
      }
      return (
        <label class="field">{label}
          <select value={str} disabled={disabled} onChange={e => onChange((e.target as HTMLSelectElement).value || null)}>
            <option value="">— выберите —</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      )
    }
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : []
      return (
        <div class="field">{label}
          <div class="row">
            {(f.options ?? []).map(o => (
              <button type="button" key={o} disabled={disabled} class={`small ${arr.includes(o) ? 'selected' : ''}`}
                onClick={() => onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])}>{arr.includes(o) ? '✓ ' : ''}{o}</button>
            ))}
          </div>
        </div>
      )
    }
    case 'scale':
      return (
        <div class="field">{label}
          <div class="scores">
            {[1, 2, 3, 4, 5].map(v => <button type="button" key={v} disabled={disabled} class={`sc${v} ${value === v ? 'on' : ''}`} onClick={() => onChange(value === v ? null : v)}>{v}</button>)}
          </div>
          {f.hint && <div class="anchor-line">{f.hint}</div>}
        </div>
      )
    case 'cardref':
      return (
        <label class="field">{label}
          <select value={str} disabled={disabled} onChange={e => onChange((e.target as HTMLSelectElement).value || null)}>
            <option value="">{refOptions.length ? '— выберите карточку —' : 'нет карточек из прошлых этапов'}</option>
            {refOptions.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </label>
      )
  }
}
