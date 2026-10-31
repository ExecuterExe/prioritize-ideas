// Модель данных. Источник истины — объект Stage на ноутбуке организатора.

import type {FieldValue, StageTemplate} from './template'
import type {ComplianceValue, Passport} from './passport'
import type {Assumption, AssumptionRound, Experiment} from './assume'
import type {ParentLink} from './evolve'
import type {Journey} from './journey'
import type {Scenario} from './scenario'
import type {Board} from './board'
import type {Task} from './tasks'

// id шаблона этапа: 'problem', 'idea', 'hypothesis' или свой
export type StageType = string

export type Phase =
  | 'lobby' | 'steps' | 'generate' | 'evolve' | 'merge' | 'criteria' | 'calibrate' | 'shortlist'
  | 'rate' | 'results' | 'rate2' | 'decide' | 'board' | 'summary'

export type Tag = 'novelty' | 'feasibility' | 'value' | 'testability'

export type Basis = 'experience' | 'observed' | 'data' | 'guess'

export type Score = 1 | 2 | 3 | 4 | 5

export type TimePreset = 'express' | 'standard' | 'none'

export interface Settings {
  anonymous: boolean
  cardLimit: number
  excludeAuthor: boolean
  calibration: boolean
  secondRound: boolean
  evolve?: boolean
  timePreset: TimePreset
  // Быстрый режим прячет продвинутые инструменты в «Ещё инструменты»; нет поля — значит «всё видно»
  tools?: Toolset
}

export type Toolset = 'quick' | 'full'

export interface Participant {
  id: string
  name: string
  alias: string
  joinedAt: number
  active: boolean
  lastSeen: number
  token?: string // личный ключ участника, наружу не уходит
}

export interface Card {
  id: string
  authorIds: string[]
  fields: Record<string, FieldValue>
  basis?: Basis
  mergedFrom: Card[]
  createdAt: number
  sample?: boolean
  parents?: ParentLink[]
  stepId?: string // режим «Карта пути»: к какому шагу относится барьер
}

export interface Criterion {
  id: string
  name: string
  question: string
  anchors: {1: string; 3?: string; 5: string}
  weight: 1 | 2 | 3
  inverted: boolean
  tag?: Tag
  fromLibrary?: string
  proposedBy?: string
  approved: boolean
}

export interface Rating {
  raterId: string
  cardId: string
  criterionId: string
  value: Score | null
  round: 1 | 2
}

export interface BasisMark {
  raterId: string
  cardId: string
  basis: Basis
}

export interface Approval {
  raterId: string
  cardIds: string[]
}

export interface Arg {
  id: string
  cardId: string
  side: 'pro' | 'con'
  text: string
  createdAt: number
}

export type DecisionStatus = 'chosen' | 'deferred' | 'rejected'

export interface Decision {
  cardId: string
  status: DecisionStatus
  reason?: string
}

export interface MergeSuggestion {
  a: string
  b: string
  by: string
}

export interface Stage {
  id: string
  projectId: string
  type: StageType
  template: StageTemplate
  title: string
  sourceProblem?: string
  sourceFields?: Record<string, FieldValue>
  refOptions?: {id: string; title: string}[]
  passport?: Passport
  compliance?: Record<string, Record<string, ComplianceValue>>
  assumptions?: Assumption[]
  experiments?: Experiment[]
  assumptionRound?: AssumptionRound
  settings: Settings
  phase: Phase
  phaseStartedAt: number
  deadline?: number
  participants: Participant[]
  cards: Card[]
  criteria: Criterion[]
  calibration: Rating[]
  approvals: Approval[]
  finalists: string[]
  ratings: Rating[]
  bases: BasisMark[]
  submitted: Record<string, string[]>
  args: Arg[]
  decisions: Decision[]
  mergeSuggestions: MergeSuggestion[]
  calibrationCardId?: string
  calibRevealed: boolean
  disputedForRound2: string[]
  round2Done: boolean
  evolveAssign?: Record<string, string[]>
  journey?: Journey
  scenarios?: Scenario[]
  board?: Board
  tasks?: Task[]
  version: number
  createdAt: number
}

export interface Snapshot {
  id: string
  at: number
  phase: Phase
  stage: Stage
}

export interface Project {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  stages: Stage[]
  snapshots: Snapshot[]
}

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Подключение',
  steps: 'Шаги пути',
  generate: 'Тихая генерация',
  evolve: 'Развитие',
  merge: 'Склейка дублей',
  criteria: 'Критерии',
  calibrate: 'Калибровка',
  shortlist: 'Отбор',
  rate: 'Оценка',
  results: 'Результаты',
  rate2: 'Второй раунд',
  decide: 'Решение',
  board: 'MVP-доска',
  summary: 'Итог'
}

export const BASIS_LABEL: Record<Basis, string> = {
  experience: 'Сам сталкивался',
  observed: 'Видел у других',
  data: 'Есть данные',
  guess: 'Догадка'
}

export const TAG_LABEL: Record<Tag, string> = {
  novelty: 'новизна',
  feasibility: 'реализуемость',
  value: 'ценность',
  testability: 'проверяемость'
}
