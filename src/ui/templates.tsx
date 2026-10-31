// Конструктор: библиотека шаблонов и редактор с живым предпросмотром «как на телефоне».
import {useEffect, useRef, useState} from 'preact/hooks'
import {uid} from '../core/engine'
import {libraryFor} from '../core/library'
import {
  BUILTIN_TEMPLATES, FIELD_TYPE_LABEL, blankTemplate, lintCard, lintTemplate, validateCard,
  type FieldDef, type FieldType, type FieldValue, type StageTemplate, type TemplateKind
} from '../core/template'
import {deleteTemplate, downloadFile, listTemplates, saveTemplate} from '../store/db'
import {CardForm} from './cardform'
import {ErrorLine, PhaseIntro} from './common'
import {toast} from './toast'

export function useTemplates(): [StageTemplate[], () => void] {
  const [mine, setMine] = useState<StageTemplate[]>([])
  const reload = () => { void listTemplates().then(setMine) }
  useEffect(reload, [])
  return [mine, reload]
}

export function allTemplates(mine: StageTemplate[]): StageTemplate[] {
  return [...BUILTIN_TEMPLATES, ...mine]
}

export function TemplatesPage({onBack}: {onBack: () => void}) {
  const [mine, reload] = useTemplates()
  const [editing, setEditing] = useState<StageTemplate | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (editing) {
    return <TemplateEditor initial={editing} onCancel={() => setEditing(null)}
      onSave={async t => { await saveTemplate(t); toast('Шаблон сохранён'); setEditing(null); reload() }} />
  }

  const copyOf = (t: StageTemplate): StageTemplate => ({...structuredClone(t), id: uid(), name: `${t.name} (копия)`, builtin: false})
  const importFile = async (f: File) => {
    try {
      const t = JSON.parse(await f.text()) as StageTemplate
      if (!t.name || !Array.isArray(t.fields)) throw new Error()
      if (lintTemplate(t).errors.length) throw new Error()
      await saveTemplate({...t, id: uid(), builtin: false})
      toast(`Шаблон «${t.name}» добавлен`)
      reload()
    } catch { setErr('Не удалось прочитать файл шаблона') }
  }

  return (
    <div class="narrow stack phase-enter">
      <button class="ghost small" style={{alignSelf: 'flex-start'}} onClick={onBack}>← К проектам</button>
      <PhaseIntro emoji="🧱" title="Шаблоны карточек">
        Шаблон задаёт, какие поля заполняют участники. Соберите свой или возьмите встроенный за основу.
      </PhaseIntro>
      <div class="row">
        <button class="primary" onClick={() => setEditing(blankTemplate(uid()))}>+ Новый шаблон</button>
        <button onClick={() => fileRef.current?.click()}>Открыть файл шаблона</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importFile(f) }} />
      </div>
      <ErrorLine msg={err} />
      {mine.length > 0 && <h3 style={{margin: '8px 0 0'}}>Мои шаблоны</h3>}
      {mine.map(t => (
        <div class="card row between" key={t.id}>
          <div style={{minWidth: 0}}><b>{t.emoji} {t.name}</b><div class="tiny muted">{t.fields.length} полей · {t.fields.filter(f => f.required).length} обязательных</div></div>
          <div class="row">
            <button class="small" onClick={() => setEditing(structuredClone(t))}>Изменить</button>
            <button class="small" onClick={() => downloadFile(`${t.name}.template.json`, JSON.stringify(t, null, 1))}>В файл</button>
            <button class="small danger" onClick={async () => { if (confirm(`Удалить шаблон «${t.name}»?`)) { await deleteTemplate(t.id); reload() } }}>Удалить</button>
          </div>
        </div>
      ))}
      <h3 style={{margin: '8px 0 0'}}>Встроенные</h3>
      {BUILTIN_TEMPLATES.map(t => (
        <div class="card row between" key={t.id}>
          <div style={{minWidth: 0}}><b>{t.emoji} {t.name}</b><div class="tiny muted">{t.fields.map(f => f.label).join(' · ')}</div></div>
          <button class="small" onClick={() => setEditing(copyOf(t))}>Взять за основу</button>
        </div>
      ))}
      <p class="tiny muted">Шаблоны хранятся в этом браузере. «В файл» — чтобы передать шаблон одногруппникам или преподавателю.</p>
    </div>
  )
}

// «Карта пути» — отдельный режим этапа, в своих шаблонах его не выбирают
const KIND_LABEL: Record<Exclude<TemplateKind, 'journey'>, string> = {problem: 'Проблемы', idea: 'Идеи', risk: 'Риски (вероятность, ущерб)', other: 'Другое (все критерии)'}
const TYPES = Object.keys(FIELD_TYPE_LABEL) as FieldType[]

export function TemplateEditor({initial, onSave, onCancel}: {initial: StageTemplate; onSave: (t: StageTemplate) => void; onCancel: () => void}) {
  const [t, setT] = useState<StageTemplate>(initial)
  const [preview, setPreview] = useState<Record<string, FieldValue>>({})
  const [open, setOpen] = useState<string | null>(t.fields[0]?.key ?? null)
  const check = lintTemplate(t)
  const set = (patch: Partial<StageTemplate>) => setT(prev => ({...prev, ...patch}))
  const setField = (key: string, patch: Partial<FieldDef>) => setT(prev => ({...prev, fields: prev.fields.map(f => (f.key === key ? {...f, ...patch} : f))}))
  const nextKey = () => { let i = t.fields.length + 1; while (t.fields.some(f => f.key === `f${i}`)) i++; return `f${i}` }
  const addField = () => {
    const key = nextKey()
    setT(prev => ({...prev, fields: [...prev.fields, {key, label: '', type: 'text', required: false}]}))
    setOpen(key)
  }
  const move = (i: number, d: -1 | 1) => setT(prev => {
    const fields = [...prev.fields]
    const j = i + d
    if (j < 0 || j >= fields.length) return prev
    ;[fields[i], fields[j]] = [fields[j], fields[i]]
    return {...prev, fields}
  })
  const remove = (key: string) => setT(prev => ({
    ...prev,
    fields: prev.fields.filter(f => f.key !== key).map(f => (f.showIf?.field === key ? {...f, showIf: undefined} : f)),
    subtitleFields: prev.subtitleFields.filter(k => k !== key),
    titleField: prev.titleField === key ? (prev.fields.find(f => f.key !== key)?.key ?? '') : prev.titleField
  }))
  const pv = validateCard(t, preview)
  const hints = lintCard(t, preview)
  const libForKind = libraryFor(t.kind)

  return (
    <div class="wrap stack phase-enter">
      <div class="row between">
        <button class="ghost small" onClick={onCancel}>← Назад без сохранения</button>
        <button class="primary" disabled={check.errors.length > 0} onClick={() => onSave(t)}>Сохранить шаблон</button>
      </div>
      <div class="editor-grid">
        <div class="stack">
          <div class="card stack">
            <div class="row" style={{flexWrap: 'nowrap'}}>
              <input type="text" style={{width: 64, textAlign: 'center', fontSize: '1.3rem'}} maxLength={4} value={t.emoji} onInput={e => set({emoji: (e.target as HTMLInputElement).value})} aria-label="Эмодзи" />
              <input type="text" placeholder="Название шаблона, например «Продуктовая гипотеза»" value={t.name} maxLength={60} onInput={e => set({name: (e.target as HTMLInputElement).value})} />
            </div>
            <label class="field"><span>Подсказка участникам (необязательно)</span>
              <input type="text" value={t.intro ?? ''} maxLength={160} placeholder="Что именно нужно придумать" onInput={e => set({intro: (e.target as HTMLInputElement).value || undefined})} />
            </label>
            <div class="row small">
              <label class="row">Критерии из библиотеки для:
                <select value={t.kind} onChange={e => set({kind: (e.target as HTMLSelectElement).value as TemplateKind})}>
                  {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <label class="check"><input type="checkbox" checked={t.askBasis} onChange={e => set({askBasis: (e.target as HTMLInputElement).checked})} />Спрашивать «откуда мы это знаем»</label>
            </div>
          </div>

          <h3 style={{margin: '4px 0 0'}}>Поля карточки</h3>
          {t.fields.map((f, i) => (
            <div class={`card stack field-card ${open === f.key ? 'open' : ''}`} key={f.key}>
              <div class="row" style={{flexWrap: 'nowrap'}}>
                <button class="ghost icon-btn small" title="Выше" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button class="ghost icon-btn small" title="Ниже" disabled={i === t.fields.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button class="ghost" style={{flex: 1, justifyContent: 'flex-start', minWidth: 0}} onClick={() => setOpen(open === f.key ? null : f.key)}>
                  <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {f.label || <span class="muted">Без названия</span>}{f.required ? ' *' : ''}
                  </span>
                  <span class="chip" style={{marginLeft: 'auto'}}>{FIELD_TYPE_LABEL[f.type]}</span>
                </button>
                <button class="ghost icon-btn small danger" title="Удалить поле" onClick={() => remove(f.key)}>✕</button>
              </div>
              {open === f.key && <FieldEditor f={f} all={t.fields} onChange={patch => setField(f.key, patch)} />}
            </div>
          ))}
          <button onClick={addField}>+ Поле</button>

          <div class="card stack">
            <h3>Как показывать карточку</h3>
            <label class="field"><span>Заголовок карточки</span>
              <select value={t.titleField} onChange={e => set({titleField: (e.target as HTMLSelectElement).value})}>
                {t.fields.map(f => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
              </select>
            </label>
            <div class="field"><span>Подзаголовок (в списках и результатах)</span>
              <div class="row">
                {t.fields.filter(f => f.key !== t.titleField).map(f => (
                  <button key={f.key} type="button" class={`small ${t.subtitleFields.includes(f.key) ? 'selected' : ''}`}
                    onClick={() => set({subtitleFields: t.subtitleFields.includes(f.key) ? t.subtitleFields.filter(k => k !== f.key) : [...t.subtitleFields, f.key]})}>
                    {f.label || f.key}
                  </button>
                ))}
              </div>
            </div>
            <div class="field"><span>Критерии по умолчанию</span>
              <div class="row">
                {libForKind.map(l => (
                  <button key={l.key} type="button" class={`small ${t.defaultCriteria.includes(l.key) ? 'selected' : ''}`}
                    onClick={() => set({defaultCriteria: t.defaultCriteria.includes(l.key) ? t.defaultCriteria.filter(k => k !== l.key) : [...t.defaultCriteria, l.key]})}>
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div class="preview-col">
          <div class="phone">
            <div class="phone-notch" />
            <div class="phone-screen stack">
              <div class="tiny muted">Так увидит участник</div>
              <h3 style={{margin: 0}}>{t.emoji} {t.name || 'Без названия'}</h3>
              {t.intro && <div class="small muted">{t.intro}</div>}
              <CardForm tpl={t} values={preview} onChange={(k, v) => setPreview(p => ({...p, [k]: v}))} />
              {t.askBasis && <div class="tiny muted">+ кнопки «Откуда мы это знаем?»</div>}
              {hints.map(h => <div class="hint" key={h}>💡 {h}</div>)}
              <div class={pv.errors.length ? 'tiny muted' : 'tiny'} style={pv.errors.length ? undefined : {color: 'var(--ok)', fontWeight: 700}}>
                {pv.errors.length ? `Проверка: ${pv.errors[0]}` : '✓ Карточку можно отправить'}
              </div>
            </div>
          </div>
          {check.errors.map(e => <div class="error small" key={e}>{e}</div>)}
          {check.hints.map(h => <div class="hint" key={h}>💡 {h}</div>)}
        </div>
      </div>
    </div>
  )
}

function FieldEditor({f, all, onChange}: {f: FieldDef; all: FieldDef[]; onChange: (p: Partial<FieldDef>) => void}) {
  const others = all.filter(x => x.key !== f.key)
  const cond = f.showIf ? others.find(x => x.key === f.showIf!.field) : undefined
  const hasOptions = f.type === 'select' || f.type === 'multiselect'
  return (
    <div class="stack">
      <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'}}>
        <label class="field"><span>Название</span><input type="text" value={f.label} maxLength={60} onInput={e => onChange({label: (e.target as HTMLInputElement).value})} /></label>
        <label class="field"><span>Тип</span>
          <select value={f.type} onChange={e => {
            const type = (e.target as HTMLSelectElement).value as FieldType
            onChange({type, options: (type === 'select' || type === 'multiselect') ? (f.options?.length ? f.options : ['Вариант 1', 'Вариант 2']) : undefined})
          }}>
            {TYPES.map(k => <option key={k} value={k}>{FIELD_TYPE_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      <label class="field"><span>Подсказка-пример</span><input type="text" value={f.hint ?? ''} maxLength={120} onInput={e => onChange({hint: (e.target as HTMLInputElement).value || undefined})} /></label>
      {hasOptions && (
        <label class="field"><span>Варианты — каждый с новой строки</span>
          <textarea value={(f.options ?? []).join('\n')} onInput={e => onChange({options: (e.target as HTMLTextAreaElement).value.split('\n').map(x => x.trim()).filter(Boolean)})} />
        </label>
      )}
      {(f.type === 'number' || f.type === 'percent') && (
        <div class="row">
          <label class="row small">Мин. <input type="text" inputMode="decimal" style={{width: 90}} value={f.min ?? ''} onInput={e => { const v = (e.target as HTMLInputElement).value; onChange({min: v === '' ? undefined : Number(v)}) }} /></label>
          <label class="row small">Макс. <input type="text" inputMode="decimal" style={{width: 90}} value={f.max ?? ''} onInput={e => { const v = (e.target as HTMLInputElement).value; onChange({max: v === '' ? undefined : Number(v)}) }} /></label>
        </div>
      )}
      <label class="check"><input type="checkbox" checked={f.required} onChange={e => onChange({required: (e.target as HTMLInputElement).checked})} />Обязательное</label>
      <details class="more" open={!!f.showIf || !!f.prefill}>
        <summary>Условие показа и подстановка</summary>
        <div class="stack" style={{marginTop: 8}}>
          <div class="row small">
            <span>Показывать, только если</span>
            <select value={f.showIf?.field ?? ''} onChange={e => {
              const field = (e.target as HTMLSelectElement).value
              onChange({showIf: field ? {field, notEmpty: true} : undefined})
            }}>
              <option value="">— всегда —</option>
              {others.map(o => <option key={o.key} value={o.key}>{o.label || o.key}</option>)}
            </select>
            {cond && (cond.options?.length
              ? (
                <select value={f.showIf?.equals ?? ''} onChange={e => {
                  const v = (e.target as HTMLSelectElement).value
                  onChange({showIf: v ? {field: cond.key, equals: v} : {field: cond.key, notEmpty: true}})
                }}>
                  <option value="">заполнено</option>
                  {cond.options.map(o => <option key={o} value={o}>= «{o}»</option>)}
                </select>
              )
              : <span class="muted">заполнено</span>)}
          </div>
          <label class="field"><span>Подставлять из поля карточки прошлого этапа (ключ поля, например who)</span>
            <input type="text" value={f.prefill ?? ''} maxLength={40} placeholder="who" onInput={e => onChange({prefill: (e.target as HTMLInputElement).value.trim() || undefined})} />
          </label>
        </div>
      </details>
    </div>
  )
}
