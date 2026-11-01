// «Оценить работу сервиса»: не идею, а сам инструмент. Через 5–10 пар — основа для развития.
import {useState} from 'preact/hooks'
import type {StoredProject} from '../store/db'

export interface ServiceFeedback {
  at: number
  stageId: string
  stageTitle: string
  rating: number // 1–5
  slow: string // что тормозило
  helped: string // что помогло
  extra: string // что было лишним
}

export function FeedbackCard({stageTitle, onSave, onSkip}: {stageTitle: string; onSave: (f: Omit<ServiceFeedback, 'at' | 'stageId' | 'stageTitle'>) => void; onSkip: () => void}) {
  const [rating, setRating] = useState(0)
  const [slow, setSlow] = useState('')
  const [helped, setHelped] = useState('')
  const [extra, setExtra] = useState('')
  const area = (label: string, v: string, set: (x: string) => void, hint: string) => (
    <label class="field"><span>{label}</span><textarea rows={2} value={v} placeholder={hint} maxLength={500} onInput={e => set((e.target as HTMLTextAreaElement).value)} /></label>
  )
  return (
    <div class="card stack no-print feedback">
      <div class="row between"><h3 style={{margin: 0}}>📝 Как сработал сервис на «{stageTitle}»?</h3><button class="ghost small" onClick={onSkip}>Не сейчас</button></div>
      <div class="tiny muted">Это оценка инструмента, а не идеи. 30 секунд — и через несколько пар будет видно, что улучшать.</div>
      <div class="row" role="radiogroup" aria-label="Оценка сервиса">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} role="radio" aria-checked={rating === n} class={`small ${rating >= n ? 'selected' : ''}`} onClick={() => setRating(n)}>{n <= rating ? '★' : '☆'}</button>
        ))}
      </div>
      {area('Что тормозило или мешало', slow, setSlow, 'например: долго подключались, непонятно, куда жать')}
      {area('Что помогло', helped, setHelped, 'например: слепая оценка сняла споры')}
      {area('Что было лишним', extra, setExtra, 'например: калибровка не понадобилась')}
      <div><button class="primary" disabled={!rating} onClick={() => onSave({rating, slow: slow.trim(), helped: helped.trim(), extra: extra.trim()})}>Сохранить отзыв</button></div>
    </div>
  )
}

// Все отзывы по всем проектам — одним файлом для анализа
export function feedbackMarkdown(projects: StoredProject[]): string {
  const all = projects.flatMap(p => (p.feedback ?? []).map(f => ({p, f}))).sort((a, b) => a.f.at - b.f.at)
  const L = ['# Отзывы о работе сервиса', '']
  if (all.length) {
    const avg = all.reduce((a, x) => a + x.f.rating, 0) / all.length
    L.push(`Сессий с отзывом: ${all.length}, средняя оценка: ${avg.toFixed(1)} из 5`, '')
  }
  for (const {p, f} of all) {
    L.push(`## ${new Date(f.at).toLocaleDateString('ru-RU')} · ${p.title} · ${f.stageTitle} — ${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}`)
    if (f.slow) L.push(`- **Тормозило:** ${f.slow}`)
    if (f.helped) L.push(`- **Помогло:** ${f.helped}`)
    if (f.extra) L.push(`- **Лишнее:** ${f.extra}`)
    L.push('')
  }
  return L.join('\n')
}
