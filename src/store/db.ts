// Хранение. Организатор: IndexedDB (проекты, этапы, черновики-снимки).
// Участник: localStorage (id, имя, черновики карточек и оценок).
import {createStore, del, get, keys, set} from 'idb-keyval'
import type {Project, Stage} from '../core/types'
import {uid} from '../core/engine'

export interface RoomInfo {
  roomId: string
  key: string
}

export interface StoredProject extends Project {
  rooms: Record<string, RoomInfo>
  hostPid: string
  hostName: string
  mode: 'network' | 'single'
}

const store = typeof indexedDB !== 'undefined' ? createStore('prioritize-ideas', 'projects') : undefined

export async function listProjects(): Promise<StoredProject[]> {
  if (!store) return []
  const ks = await keys(store)
  const all = await Promise.all(ks.map(k => get<StoredProject>(k, store)))
  return all.filter((p): p is StoredProject => !!p).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadProject(id: string): Promise<StoredProject | undefined> {
  return store ? get<StoredProject>(id, store) : undefined
}

export async function saveProject(p: StoredProject): Promise<void> {
  if (!store) return
  await set(p.id, {...p, updatedAt: Date.now()}, store)
}

export async function deleteProject(id: string): Promise<void> {
  if (store) await del(id, store)
}

// Записываем этап в проект; при смене шага — автоснимок (черновик)
export function withStage(p: StoredProject, s: Stage): StoredProject {
  const prev = p.stages.find(x => x.id === s.id)
  const stages = prev ? p.stages.map(x => (x.id === s.id ? s : x)) : [...p.stages, s]
  let snapshots = p.snapshots
  if (prev && prev.phase !== s.phase) {
    snapshots = [...snapshots, {id: uid(), at: Date.now(), phase: prev.phase, stage: prev}].slice(-60)
  }
  return {...p, stages, snapshots, updatedAt: Date.now()}
}

// ——— localStorage (с защитой: в приватном режиме может бросать) ———

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* хранилище недоступно */ }
}

export function downloadFile(name: string, text: string, type = 'application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], {type}))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
