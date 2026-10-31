// Шаг «Развитие»: каждому по кругу достаются чужие карточки — развить или объединить.
// Плюс дерево происхождения и сравнение версий по словам.

export const EVOLVE_PER_PERSON = 2  // сколько чужих карточек назначаем каждому
export const EVOLVE_LIMIT = 2       // сколько новых версий может создать один человек

export type ParentKind = 'develop' | 'combine'

export interface ParentLink {
  id: string
  kind: ParentKind
}

// Назначение: свои карточки не попадаются; каждая карточка достаётся как можно большему
// числу разных людей поровну (минимум нагрузки на карточку, затем по кругу со сдвигом).
export function assignEvolve(cards: {id: string; authorIds: string[]}[], people: string[], per = EVOLVE_PER_PERSON): Record<string, string[]> {
  const load = new Map(cards.map(c => [c.id, 0]))
  const out: Record<string, string[]> = {}
  people.forEach((p, pi) => {
    const pool = cards.filter(c => !c.authorIds.includes(p))
    const picked: string[] = []
    for (let k = 0; k < per && picked.length < pool.length; k++) {
      const candidates = pool.filter(c => !picked.includes(c.id))
      const min = Math.min(...candidates.map(c => load.get(c.id)!))
      const least = candidates.filter(c => load.get(c.id) === min)
      // Сдвиг по номеру человека, чтобы соседи не получали одинаковые карточки
      const choice = least[(pi + k) % least.length]
      picked.push(choice.id)
      load.set(choice.id, load.get(choice.id)! + 1)
    }
    out[p] = picked
  })
  // Выравнивание: пока разница нагрузки больше 1 — переназначаем перегруженную карточку на недогруженную
  const authorOf = new Map(cards.map(c => [c.id, c.authorIds]))
  for (let guard = 0; guard < 200; guard++) {
    const ids = cards.map(c => c.id)
    const maxL = Math.max(...ids.map(id => load.get(id)!)), minL = Math.min(...ids.map(id => load.get(id)!))
    if (maxL - minL <= 1) break
    let moved = false
    for (const hi of ids.filter(id => load.get(id) === maxL)) {
      for (const lo of ids.filter(id => load.get(id) === minL)) {
        const p = people.find(x => out[x].includes(hi) && !out[x].includes(lo) && !authorOf.get(lo)!.includes(x))
        if (!p) continue
        out[p] = out[p].map(id => (id === hi ? lo : id))
        load.set(hi, maxL - 1)
        load.set(lo, minL + 1)
        moved = true
        break
      }
      if (moved) break
    }
    if (!moved) break
  }
  return out
}

// Непрозрачный ключ назначения: по нему нельзя понять, кому что досталось,
// а значит и вычислить автора по тому, кому карточка «не досталась»
export function hashKey(token: string): string {
  let h = 2166136261
  for (const ch of token) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  let h2 = 5381
  for (const ch of token) h2 = Math.imul(h2, 33) ^ ch.charCodeAt(0)
  return (h >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

// ——— Дерево происхождения ———

export interface TreeNode {
  id: string
  depth: number
  parents: ParentLink[]
}

// Глубина: исходные карточки — 0, развитие — на 1 глубже самого глубокого родителя
export function treeDepths(cards: {id: string; parents?: ParentLink[]}[]): Map<string, number> {
  const byId = new Map(cards.map(c => [c.id, c]))
  const memo = new Map<string, number>()
  const depth = (id: string, guard: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!
    const c = byId.get(id)
    if (!c?.parents?.length || guard.has(id)) { memo.set(id, 0); return 0 }
    guard.add(id)
    const d = 1 + Math.max(...c.parents.map(p => (byId.has(p.id) ? depth(p.id, guard) : 0)))
    memo.set(id, d)
    return d
  }
  for (const c of cards) depth(c.id, new Set())
  return memo
}

// Все предки карточки (для подсветки «откуда вырос победитель»)
export function ancestors(id: string, cards: {id: string; parents?: ParentLink[]}[]): Set<string> {
  const byId = new Map(cards.map(c => [c.id, c]))
  const out = new Set<string>()
  const walk = (x: string) => {
    for (const p of byId.get(x)?.parents ?? []) {
      if (!out.has(p.id)) { out.add(p.id); walk(p.id) }
    }
  }
  walk(id)
  return out
}

// ——— Сравнение версий по словам (LCS) ———

export type DiffPart = {text: string; kind: 'same' | 'add' | 'del'}

export function wordDiff(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean)
  if (A.length * B.length > 40000) return [{text: a, kind: 'del'}, {text: b, kind: 'add'}]
  const dp = Array.from({length: A.length + 1}, () => new Array<number>(B.length + 1).fill(0))
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffPart[] = []
  const push = (text: string, kind: DiffPart['kind']) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({text, kind})
  }
  let i = 0, j = 0
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { push(A[i], 'same'); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push(A[i], 'del'); i++ }
    else { push(B[j], 'add'); j++ }
  }
  while (i < A.length) push(A[i++], 'del')
  while (j < B.length) push(B[j++], 'add')
  return out
}
