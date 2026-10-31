// Паспорт задания: редактор (организатор), просмотр и кнопка «📋 Задание» (все).
import {useState} from 'preact/hooks'
import {createPortal} from 'preact/compat'
import {
  EMPTY_PASSPORT, complianceIssues, complianceItems, parsePassport, passportFilled,
  type ComplianceValue, type Passport
} from '../core/passport'
import {toast} from './toast'

export function PassportEditor({value, onChange}: {value: Passport; onChange: (p: Passport) => void}) {
  const [paste, setPaste] = useState(value.sourceText ?? '')
  const set = (patch: Partial<Passport>) => onChange({...value, ...patch})
  const lines = (xs: string[]) => xs.join('\n')
  const toList = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)
  const parse = () => {
    const p = parsePassport(paste)
    const merged: Passport = {
      ...p,
      // Уже заполненное вручную не затираем
      result: value.result || p.result, task: value.task || p.task, audience: value.audience || p.audience,
      constraints: value.constraints.length ? value.constraints : p.constraints,
      mustHave: value.mustHave.length ? value.mustHave : p.mustHave,
      forbidden: value.forbidden.length ? value.forbidden : p.forbidden,
      teacherCriteria: value.teacherCriteria.length ? value.teacherCriteria : p.teacherCriteria
    }
    onChange(merged)
    const n = merged.constraints.length + merged.mustHave.length + merged.forbidden.length + merged.teacherCriteria.length
    toast(n ? `Разобрано пунктов: ${n} — проверьте поля ниже` : 'Пункты не нашлись — заполните поля вручную', n ? 'ok' : 'info')
  }
  return (
    <div class="stack">
      <label class="field"><span>Текст задания от преподавателя</span>
        <textarea value={paste} placeholder="Вставьте задание целиком: «Ограничения: …», «Обязательно: …», «Критерии оценки: …»" style={{minHeight: 110}}
          onInput={e => setPaste((e.target as HTMLTextAreaElement).value)} />
      </label>
      <button type="button" class="small" style={{alignSelf: 'flex-start'}} disabled={!paste.trim()} onClick={parse}>✨ Разобрать по разделам</button>
      <label class="field"><span>Какую задачу решаем</span><input type="text" value={value.task} maxLength={300} onInput={e => set({task: (e.target as HTMLInputElement).value})} /></label>
      <label class="field"><span>Что нужно получить в результате</span><input type="text" value={value.result} maxLength={300} onInput={e => set({result: (e.target as HTMLInputElement).value})} /></label>
      <label class="field"><span>Для кого</span><input type="text" value={value.audience} maxLength={200} onInput={e => set({audience: (e.target as HTMLInputElement).value})} /></label>
      <div class="grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'}}>
        <label class="field"><span>Ограничения — по строке</span><textarea value={lines(value.constraints)} placeholder="Цифровой формат" onInput={e => set({constraints: toList((e.target as HTMLTextAreaElement).value)})} /></label>
        <label class="field"><span>Обязательно в результате</span><textarea value={lines(value.mustHave)} placeholder="Способ проверки спроса" onInput={e => set({mustHave: toList((e.target as HTMLTextAreaElement).value)})} /></label>
        <label class="field"><span>Нельзя / нежелательно</span><textarea value={lines(value.forbidden)} placeholder="Сбор персональных данных" onInput={e => set({forbidden: toList((e.target as HTMLTextAreaElement).value)})} /></label>
        <label class="field"><span>Как оценит преподаватель</span><textarea value={lines(value.teacherCriteria)} placeholder="Актуальность проблемы" onInput={e => set({teacherCriteria: toList((e.target as HTMLTextAreaElement).value)})} /></label>
      </div>
    </div>
  )
}

export function PassportView({p}: {p: Passport}) {
  const list = (title: string, xs: string[], icon: string) => xs.length > 0 && (
    <div>
      <div class="small" style={{fontWeight: 800, marginBottom: 4}}>{title}</div>
      <ul class="plist">{xs.map(x => <li key={x}><span aria-hidden="true">{icon}</span>{x}</li>)}</ul>
    </div>
  )
  return (
    <div class="stack passport">
      {p.task && <div><div class="tiny muted">Задача</div><b>{p.task}</b></div>}
      {p.result && <div><div class="tiny muted">Нужно получить</div>{p.result}</div>}
      {p.audience && <div><div class="tiny muted">Для кого</div>{p.audience}</div>}
      {list('Ограничения', p.constraints, '⛓')}
      {list('Обязательно в результате', p.mustHave, '✅')}
      {list('Нельзя', p.forbidden, '🚫')}
      {list('Как оценит преподаватель', p.teacherCriteria, '🎓')}
    </div>
  )
}

// Кнопка в верхней панели: открывает задание поверх экрана
export function PassportButton({p, onEdit}: {p?: Passport; onEdit?: () => void}) {
  const [open, setOpen] = useState(false)
  if (!passportFilled(p) && !onEdit) return null
  return (
    <>
      <button class="ghost icon-btn small no-print" title="Задание" aria-label="Задание" onClick={() => setOpen(true)}>📋</button>
      {/* Окно — в корень страницы: верхняя панель с размытием «запирает» внутри себя fixed-элементы */}
      {open && createPortal(
        <div class="sheet-backdrop" onClick={() => setOpen(false)}>
          <div class="sheet" role="dialog" aria-label="Задание" onClick={e => e.stopPropagation()}>
            <div class="row between">
              <h2 style={{margin: 0}}>📋 Задание</h2>
              <button class="ghost icon-btn" aria-label="Закрыть" onClick={() => setOpen(false)}>✕</button>
            </div>
            {passportFilled(p) ? <PassportView p={p!} /> : <p class="muted">Паспорт задания пока не заполнен.</p>}
            {onEdit && <button class="small" style={{alignSelf: 'flex-start'}} onClick={() => { setOpen(false); onEdit() }}>Изменить задание</button>}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function PassportEditSheet({value, onSave, onClose}: {value?: Passport; onSave: (p: Passport) => void; onClose: () => void}) {
  const [draft, setDraft] = useState<Passport>(value ?? {...EMPTY_PASSPORT})
  return createPortal(
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet wide" role="dialog" aria-label="Изменить задание" onClick={e => e.stopPropagation()}>
        <div class="row between">
          <h2 style={{margin: 0}}>📋 Паспорт задания</h2>
          <button class="ghost icon-btn" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>
        <PassportEditor value={draft} onChange={setDraft} />
        <div class="row">
          <button class="primary" onClick={() => { onSave(draft); onClose() }}>Сохранить и показать команде</button>
          <button class="ghost" onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const MARKS: {v: ComplianceValue; label: string}[] = [
  {v: 'ok', label: '✅ Да'},
  {v: 'partly', label: '⚠️ Частично'},
  {v: 'fail', label: '❌ Нет'}
]

// Проверка соответствия выбранной карточки заданию (шаг «Решение»)
export function ComplianceCheck({p, marks, onSet, readOnly}: {
  p?: Passport; marks?: Record<string, ComplianceValue>; onSet?: (item: string, v: ComplianceValue | null) => void; readOnly?: boolean
}) {
  const items = complianceItems(p)
  if (!items.length) return null
  const {fails, unchecked} = complianceIssues(p, marks)
  return (
    <div class="compliance stack">
      <div class="small" style={{fontWeight: 800}}>Соответствие заданию</div>
      {items.map(i => (
        <div class="row between compliance-row" key={i.key}>
          <span class="small">{i.kind === 'must' ? 'Есть ли: ' : 'Не нарушено: '}{i.text}</span>
          {readOnly
            ? <span class="small">{MARKS.find(m => m.v === marks?.[i.key])?.label ?? '—'}</span>
            : (
              <span class="row" style={{gap: 4}}>
                {MARKS.map(m => (
                  <button key={m.v} type="button" class={`small ${marks?.[i.key] === m.v ? 'selected' : ''}`}
                    onClick={() => onSet?.(i.key, marks?.[i.key] === m.v ? null : m.v)}>{m.label}</button>
                ))}
              </span>
            )}
        </div>
      ))}
      {fails.length > 0 && <div class="error small">Выбранное противоречит заданию: {fails.map(f => `«${f.text}»`).join(', ')}</div>}
      {!readOnly && !fails.length && unchecked.length > 0 && <div class="tiny muted">Не проверено пунктов: {unchecked.length}</div>}
    </div>
  )
}
