// Горячие клавиши ведущего: управлять сессией, не отвлекаясь от обсуждения.
import {useEffect, useRef} from 'preact/hooks'
import {createPortal} from 'preact/compat'

export interface HotkeyActions {
  next?: () => void
  back?: () => void
  extend?: () => void
  reveal?: () => void
  whatNext?: () => void
  screen?: () => void
  myVote?: () => void
  help: () => void
}

export const HOTKEYS: {keys: string; label: string}[] = [
  {keys: '→', label: 'Дальше'},
  {keys: '←', label: 'На шаг назад'},
  {keys: '+', label: 'Добавить 2 минуты'},
  {keys: 'R', label: 'Раскрыть оценки'},
  {keys: 'N', label: '«Что дальше?»'},
  {keys: 'P', label: 'Окно для проектора'},
  {keys: 'M', label: '«Мой голос»'},
  {keys: '?', label: 'Эта подсказка'}
]

// Клавиша → действие. Ввод текста и сочетания с Ctrl/Alt/⌘ не перехватываем.
export function keyAction(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'metaKey'>, typing: boolean): keyof HotkeyActions | null {
  if (typing || e.ctrlKey || e.altKey || e.metaKey) return null
  switch (e.key) {
    case 'ArrowRight': return 'next'
    case 'ArrowLeft': return 'back'
    case '+': case '=': return 'extend'
    case '?': return 'help'
  }
  // По физической клавише: работает и в русской раскладке
  switch (e.code) {
    case 'KeyR': return 'reveal'
    case 'KeyN': return 'whatNext'
    case 'KeyP': return 'screen'
    case 'KeyM': return 'myVote'
    case 'Slash': return e.key === '/' || e.key === '.' ? null : 'help'
  }
  return null
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function useHotkeys(enabled: boolean, actions: HotkeyActions) {
  const ref = useRef(actions)
  ref.current = actions
  useEffect(() => {
    if (!enabled) return
    const on = (e: KeyboardEvent) => {
      // Открыт лист или диалог — клавиши не трогаем
      if (document.querySelector('.sheet-backdrop')) return
      const k = keyAction(e, isTyping(e.target))
      const fn = k && ref.current[k]
      if (!fn) return
      e.preventDefault()
      fn()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [enabled])
}

export function HotkeyHelp({onClose}: {onClose: () => void}) {
  return createPortal(
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" role="dialog" aria-label="Горячие клавиши" onClick={e => e.stopPropagation()}>
        <div class="row between"><h2 style={{margin: 0}}>⌨️ Горячие клавиши</h2><button class="ghost icon-btn" aria-label="Закрыть" onClick={onClose}>✕</button></div>
        <table class="simple">
          <tbody>{HOTKEYS.map(h => <tr key={h.keys}><td><kbd>{h.keys}</kbd></td><td>{h.label}</td></tr>)}</tbody>
        </table>
        <div class="tiny muted">Работают на ноутбуке ведущего, когда курсор не в поле ввода. Буквы — в любой раскладке.</div>
      </div>
    </div>,
    document.body
  )
}
