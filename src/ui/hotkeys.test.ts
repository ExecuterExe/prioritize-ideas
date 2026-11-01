import {describe, expect, it} from 'vitest'
import {keyAction} from './hotkeys'

const k = (key: string, code = '', mods: Partial<{ctrlKey: boolean; altKey: boolean; metaKey: boolean}> = {}) =>
  ({key, code, ctrlKey: false, altKey: false, metaKey: false, ...mods})

describe('hotkeys', () => {
  it('maps keys in both layouts and ignores typing and modifiers', () => {
    expect(keyAction(k('ArrowRight'), false)).toBe('next')
    expect(keyAction(k('к', 'KeyR'), false)).toBe('reveal') // русская раскладка
    expect(keyAction(k('n', 'KeyN'), false)).toBe('whatNext')
    expect(keyAction(k('+', 'Equal'), false)).toBe('extend')
    expect(keyAction(k('?', 'Slash'), false)).toBe('help')
    expect(keyAction(k(',', 'Slash'), false)).toBe('help') // «?» в русской раскладке — Shift+«,»
    expect(keyAction(k('ArrowRight'), true)).toBeNull()
    expect(keyAction(k('r', 'KeyR', {ctrlKey: true}), false)).toBeNull()
    expect(keyAction(k('x', 'KeyX'), false)).toBeNull()
  })
})
