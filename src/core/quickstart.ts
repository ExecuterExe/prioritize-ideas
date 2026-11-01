// Быстрый старт: цели вместо методов. Каждая цель — маршрут через уже существующие этапы.
import type {Settings, Toolset} from './types'
import type {Workflow} from './template'

export type Tool = 'assume' | 'tasks'

export interface Goal {
  id: string
  emoji: string
  name: string
  description: string
  // Пустой маршрут — «свободная сессия», тип этапа выбирается при запуске
  steps: string[]
  // Что спросить у ведущего одной строкой (контекст для участников)
  contextLabel?: string
  // Инструменты, которые нужны цели с самого начала
  tools?: Tool[]
}

export const GOALS: Goal[] = [
  {id: 'find-problem', emoji: '🔍', name: 'Найти проблему', description: 'Команда ищет проблему для будущего продукта', steps: ['problem']},
  {id: 'pick-idea', emoji: '💡', name: 'Придумать и выбрать идею', description: 'Проблема уже определена — нужны идеи решения', steps: ['idea'], contextLabel: 'Какую проблему решаем'},
  {id: 'problem-to-idea', emoji: '🧭', name: 'От проблемы к решению', description: 'Сначала выбрать проблему, затем идею', steps: ['problem', 'idea']},
  {id: 'check-hypothesis', emoji: '🧪', name: 'Проверить гипотезу', description: 'Идея есть, но неизвестно, жизнеспособна ли она', steps: ['hypothesis'], contextLabel: 'Какую идею проверяем', tools: ['assume']},
  {id: 'free', emoji: '🎲', name: 'Свободная сессия', description: 'Один этап — тип выберете сами', steps: []}
]

// Типы этапов, доступные в свободной сессии без захода в полный режим
export const FREE_TEMPLATES = ['problem', 'idea', 'hypothesis', 'premortem', 'journey', 'mvp']

export const QUICK_SETTINGS: Partial<Settings> = {
  timePreset: 'standard', anonymous: true, cardLimit: 3, excludeAuthor: false,
  calibration: false, secondRound: true, evolve: false, tools: 'quick', beforeAfter: false
}

export const FULL_SETTINGS: Partial<Settings> = {
  timePreset: 'standard', anonymous: true, cardLimit: 3, excludeAuthor: false,
  calibration: true, secondRound: true, evolve: true, tools: 'full', beforeAfter: true
}

export function goalWorkflow(g: Goal, freeTemplate?: string): Workflow {
  return {id: `goal:${g.id}`, name: `${g.emoji} ${g.name}`, description: g.description, steps: g.steps.length ? [...g.steps] : [freeTemplate ?? 'problem']}
}

export function goalOf(w?: Workflow): Goal | undefined {
  return w?.id.startsWith('goal:') ? GOALS.find(g => `goal:${g.id}` === w.id) : undefined
}

// Какие вкладки видны. В быстром режиме инструмент виден, если он нужен цели
// или в нём уже есть данные — собранное никогда не прячем.
export function visibleTools(tools: Toolset | undefined, state: {assumptions: number; tasks: number; roundOpen?: boolean}, goal?: Goal): Record<Tool, boolean> {
  if (tools !== 'quick') return {assume: true, tasks: true}
  return {
    assume: state.assumptions > 0 || !!state.roundOpen || !!goal?.tools?.includes('assume'),
    tasks: state.tasks > 0 || !!goal?.tools?.includes('tasks')
  }
}
