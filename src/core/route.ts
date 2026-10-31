// «Что дальше?»: смена пути без потери данных. Каждый вариант — новый этап в том же проекте
// (старый этап со всеми оценками остаётся), плюс запись в маршрут проекта.
import {computeResults} from './math'
import {realCards} from './engine'
import {asText, builtinTemplate, cardSubtitle, cardTitle, type FieldValue, type StageTemplate} from './template'
import type {AssumptionCategory} from './assume'
import type {Card, Criterion, Stage} from './types'

export type PathChoice = 'continue' | 'reformulate' | 'another' | 'ideas' | 'journey' | 'rerate' | 'assume'

export interface PathStep {
  stageId: string
  fromStageId: string
  choice: PathChoice
  at: number
}

export const CHOICE_LABEL: Record<PathChoice, string> = {
  continue: 'дальше по пути',
  reformulate: '↩ переформулировка',
  another: '🔄 другие варианты',
  ideas: '💡 идеи для выбранного',
  journey: '🗺 путь пользователя',
  rerate: '🔁 переоценка',
  assume: '🎯 проверка предположений'
}

export interface BranchOption {
  choice: PathChoice
  emoji: string
  title: string
  hint: string
}

export interface BranchPlan {
  template: StageTemplate
  title: string
  sourceProblem?: string
  sourceFields?: Record<string, FieldValue>
  seedCards?: Record<string, FieldValue>[]
  seedCriteria?: Criterion[]
  persona?: string
}

const LIST_LIMIT = 8

// Карточки в порядке результата: сначала оценённые по рангу, затем остальные
export function rankedCards(stage: Stage): Card[] {
  const cards = realCards(stage)
  const ranks = new Map<string, number>()
  if (stage.finalists.length && stage.ratings.length) {
    for (const r of computeResults(stage).cards) ranks.set(r.cardId, r.rank)
  }
  return [...cards].sort((a, b) => (ranks.get(a.id) ?? 1e9) - (ranks.get(b.id) ?? 1e9))
}

// Карточка, от которой идём дальше: выбранная командой, иначе лидер оценки
export function focusCard(stage: Stage): Card | undefined {
  const chosen = stage.decisions.find(d => d.status === 'chosen')
  const c = chosen && stage.cards.find(x => x.id === chosen.cardId)
  if (c) return c
  return stage.finalists.length && stage.ratings.length ? rankedCards(stage)[0] : undefined
}

function label(tpl: StageTemplate, c: Card): string {
  const sub = cardSubtitle(tpl, c.fields)
  return `${cardTitle(tpl, c.fields)}${sub ? ` (${sub})` : ''}`
}

function listOf(stage: Stage): string {
  return rankedCards(stage).slice(0, LIST_LIMIT).map(c => cardTitle(stage.template, c.fields)).join('; ')
}

// Какие варианты имеют смысл для этого этапа
export function branchOptions(stage: Stage): BranchOption[] {
  const kind = stage.template.kind
  const mode = stage.template.mode
  const hasCards = realCards(stage).length > 0
  const focus = focusCard(stage)
  const noun = kind === 'problem' ? 'проблему' : kind === 'idea' ? 'идею' : 'вариант'
  const out: BranchOption[] = []
  if (mode !== 'journey' && mode !== 'board' && hasCards) {
    out.push({choice: 'reformulate', emoji: '↩', title: `Переформулировать ${noun}`, hint: 'Новый этап того же типа; прошлые формулировки — у всех перед глазами'})
    out.push({choice: 'another', emoji: '🔄', title: kind === 'problem' ? 'Найти другую проблему' : kind === 'idea' ? 'Придумать другие идеи' : 'Найти другие варианты', hint: 'Чистый лист; уже рассмотренное показано, чтобы не повторяться'})
  }
  if (kind === 'problem' && focus) out.push({choice: 'ideas', emoji: '💡', title: 'Идеи для этой проблемы', hint: `Генерация идей для «${cardTitle(stage.template, focus.fields)}»`})
  if (mode !== 'journey') out.push({choice: 'journey', emoji: '🗺', title: 'Исследовать путь пользователя', hint: 'Карта пути: где человеку больнее всего. Барьеры потом станут проблемами'})
  if (focus) out.push({choice: 'assume', emoji: '🎯', title: 'Проверить предположения', hint: 'Что должно быть правдой, чтобы лидер сработал. Без нового этапа'})
  return out
}

export function planBranch(stage: Stage, choice: PathChoice): BranchPlan | undefined {
  const tpl = stage.template
  const focus = focusCard(stage)
  switch (choice) {
    case 'reformulate':
      return {
        template: tpl, title: `${tpl.name}: переформулировка`,
        sourceProblem: `Переформулируем точнее. Прошлые формулировки: ${listOf(stage)}`
      }
    case 'another':
      return {
        template: tpl, title: `${tpl.name}: новые варианты`,
        sourceProblem: `Уже рассматривали — ищем другое: ${listOf(stage)}`
      }
    case 'ideas': {
      const idea = builtinTemplate('idea')
      if (!idea || !focus || tpl.kind !== 'problem') return undefined
      return {template: idea, title: idea.name, sourceProblem: label(tpl, focus), sourceFields: focus.fields}
    }
    case 'journey': {
      const j = builtinTemplate('journey')
      if (!j) return undefined
      return {template: j, title: j.name, persona: focus ? asText(focus.fields.who) : undefined, sourceProblem: focus ? label(tpl, focus) : undefined}
    }
    case 'rerate': {
      const cards = realCards(stage)
      if (!cards.length) return undefined
      return {
        template: tpl, title: `${stage.title}: переоценка`,
        seedCards: cards.map(c => c.fields), seedCriteria: stage.criteria.filter(c => c.approved),
        sourceProblem: stage.sourceProblem, sourceFields: stage.sourceFields
      }
    }
    default:
      return undefined
  }
}

// Заготовка предположения из лидера: что должно быть правдой
export function leaderAssumption(stage: Stage): {text: string; category: AssumptionCategory; cardId: string; title: string} | undefined {
  const c = focusCard(stage)
  if (!c) return undefined
  const t = cardTitle(stage.template, c.fields)
  const kind = stage.template.kind
  const text = kind === 'problem'
    ? `Проблема «${t}» действительно мешает людям, и они хотят её решить`
    : kind === 'idea'
      ? `Пользователи захотят пользоваться решением «${t}»`
      : `«${t}» сработает так, как мы ожидаем`
  return {text, category: kind === 'problem' || kind === 'idea' ? 'desirability' : 'feasibility', cardId: c.id, title: t}
}

// Цепочка для главной и отчёта: этапы по порядку с тем, как к ним пришли
export function routeChain(stages: Pick<Stage, 'id' | 'template' | 'title'>[], path: PathStep[] = []): string[] {
  return stages.map((s, i) => {
    const step = path.find(p => p.stageId === s.id)
    const how = i > 0 && step && step.choice !== 'continue' ? `${CHOICE_LABEL[step.choice]}: ` : ''
    return `${how}${s.template.emoji} ${s.title}`
  })
}
