// Полнота решения: не «хороша ли идея», а всё ли команда зафиксировала, чтобы его защитить.
// Плюс «слепые зоны» — что никто не оценивал. Только подсказки, ничего не блокируют.
import type {PublicView} from './engine'
import {asText} from './template'
import {passportFilled} from './passport'
import type {Tag} from './types'

export type CheckStatus = 'done' | 'unknown'

export interface CheckMark {
  status: CheckStatus
  text?: string
}

export interface CheckItem {
  key: string
  label: string
  hint: string
}

const AUDIENCE: CheckItem = {key: 'audience', label: 'Кто именно', hint: 'конкретная аудитория, а не «все студенты»'}
const EVIDENCE: CheckItem = {key: 'evidence', label: 'На чём основано', hint: 'опыт, наблюдение, данные — откуда мы знаем, что это правда'}
const VALUE: CheckItem = {key: 'value', label: 'Чем лучше существующего', hint: 'что люди используют сейчас и почему им станет лучше'}
const ALTERNATIVES: CheckItem = {key: 'alternatives', label: 'Почему не другие варианты', hint: 'причины, по которым отложили или отклонили остальные'}
const TO_CHECK: CheckItem = {key: 'toCheck', label: 'Что ещё проверить', hint: 'главное предположение или условие «пересмотрим, если…»'}

export function checklistFor(kind: string): CheckItem[] {
  switch (kind) {
    case 'problem': return [AUDIENCE, EVIDENCE, ALTERNATIVES, TO_CHECK]
    case 'idea': return [AUDIENCE, VALUE, ALTERNATIVES, TO_CHECK]
    case 'risk': case 'journey': return []
    default: return [ALTERNATIVES, TO_CHECK]
  }
}

type View = Pick<PublicView, 'template' | 'cards' | 'decisions' | 'results' | 'assumptions' | 'criteria' | 'passport' | 'compliance'> & {
  checks?: Record<string, CheckMark>
  revisit?: string
  vote?: PublicView['vote']
}

export function chosenIds(v: Pick<PublicView, 'decisions'>): string[] {
  return v.decisions.filter(d => d.status === 'chosen').map(d => d.cardId)
}

// Что сервис может подсказать сам — ведущему остаётся подтвердить
export function suggestion(v: View, key: string): string | undefined {
  const chosen = chosenIds(v).map(id => v.cards.find(c => c.id === id)).filter(c => !!c)
  switch (key) {
    case 'audience': {
      const who = chosen.map(c => asText(c!.fields.who)).filter(Boolean)
      return who.length ? who.join('; ') : undefined
    }
    case 'alternatives': {
      const reasons = v.decisions.filter(d => d.status !== 'chosen' && d.reason?.trim()).map(d => d.reason!.trim())
      if (v.vote?.outcome?.winnerId) reasons.unshift(v.vote.outcome.note)
      return reasons.length ? reasons.join('; ') : undefined
    }
    case 'toCheck': {
      const linked = v.assumptions.filter(a => chosenIds(v).includes(a.linkedCardId ?? '')).map(a => a.text)
      if (v.revisit?.trim()) linked.unshift(`Пересмотрим, если ${v.revisit.trim()}`)
      return linked.length ? linked.join('; ') : undefined
    }
  }
  return undefined
}

// Итоговый статус пункта: отметка ведущего, иначе «закрыт сам», если есть подсказка
export function checkState(v: View, item: CheckItem): {status: CheckStatus | 'open'; text?: string; auto: boolean} {
  const mark = v.checks?.[item.key]
  if (mark) return {status: mark.status, text: mark.text, auto: false}
  const s = suggestion(v, item.key)
  return s && (item.key === 'alternatives' || item.key === 'toCheck') ? {status: 'done', text: s, auto: true} : {status: 'open', text: s, auto: true}
}

export function openItems(v: View): CheckItem[] {
  if (!chosenIds(v).length) return []
  return checklistFor(v.template.kind).filter(i => checkState(v, i).status === 'open')
}

// ——— Слепые зоны ———

const TAG_QUESTION: Record<Tag, string> = {
  value: 'насколько это важно людям (боль, ценность)',
  feasibility: 'реализуемость — хватит ли сил и времени у команды',
  testability: 'проверяемость — сможем ли быстро проверить на людях',
  novelty: 'новизна — чем отличается от того, что уже есть'
}

const EXPECTED: Record<string, Tag[]> = {
  problem: ['value', 'testability', 'feasibility'],
  idea: ['value', 'feasibility', 'novelty', 'testability']
}

export function blindSpots(v: View): string[] {
  const out: string[] = []
  const kind = v.template.kind
  const crit = v.criteria.filter(c => c.approved)
  const tags = new Set(crit.map(c => c.tag).filter(Boolean))
  for (const t of EXPECTED[kind] ?? []) if (!tags.has(t)) out.push(`Никто не оценивал ${TAG_QUESTION[t]}`)
  if (kind === 'idea' && !crit.some(c => c.fromLibrary === 'money' || /плат|деньг|монетиз|доход/i.test(c.name))) {
    out.push('Не обсуждали, кто и за что готов платить')
  }
  const chosen = chosenIds(v)
  if (chosen.length && (kind === 'problem' || kind === 'idea')) {
    if (!v.assumptions.length) out.push('Не записано ни одного предположения — всё, что мы считаем правдой, пока не проверено')
    const guessed = chosen.filter(id => v.results?.cards.find(r => r.cardId === id)?.guess)
    if (guessed.length) out.push('Выбранный вариант команда оценила в основном по догадкам')
    if (passportFilled(v.passport) && chosen.some(id => !Object.keys(v.compliance[id] ?? {}).length)) out.push('Выбор не сверили с условиями задания')
  }
  return out
}
