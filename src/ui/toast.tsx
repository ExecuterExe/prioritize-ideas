// Всплывающие подтверждения: «Отправлено ✓», ошибки и т. п.
import {signal} from '@preact/signals'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error' | 'info'
}

const toasts = signal<Toast[]>([])
let next = 1

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = next++
  toasts.value = [...toasts.value.slice(-2), {id, text, kind}]
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, kind === 'error' ? 5000 : 2600)
}

export function Toaster() {
  return (
    <div class="toaster" role="status" aria-live="polite">
      {toasts.value.map(t => (
        <div key={t.id} class={`toast ${t.kind}`}>
          <span class="toast-icon">{t.kind === 'ok' ? '✓' : t.kind === 'error' ? '!' : 'i'}</span>
          {t.text}
        </div>
      ))}
    </div>
  )
}
