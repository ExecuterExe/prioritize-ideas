// Pre-mortem: реестр рисков из результатов этапа «Причина провала».
import type {AssumptionCategory} from './assume'
import type {CardResult} from './math'
import type {Criterion, Decision} from './types'

// Критический риск: и вероятность, и ущерб в среднем не ниже порога
export const CRITICAL = 3.5

export interface RiskRow {
  cardId: string
  probability: number | null
  damage: number | null
  critical: boolean
  status?: Decision['status']
  mitigation?: string
}

function meanOf(r: CardResult, criteria: Criterion[], key: string): number | null {
  const c = criteria.find(x => x.fromLibrary === key && x.approved)
  if (!c) return null
  return r.perCriterion.find(p => p.criterionId === c.id)?.mean ?? null
}

export function riskRows(results: CardResult[], criteria: Criterion[], decisions: Decision[]): RiskRow[] {
  return results.map(r => {
    const probability = meanOf(r, criteria, 'probability')
    const damage = meanOf(r, criteria, 'damage')
    const d = decisions.find(x => x.cardId === r.cardId)
    return {
      cardId: r.cardId, probability, damage,
      critical: probability != null && damage != null && probability >= CRITICAL && damage >= CRITICAL,
      status: d?.status, mitigation: d?.reason
    }
  })
}

// Причина провала → какое скрытое предположение за ней стоит
export function riskToAssumptionCategory(category: string): AssumptionCategory {
  if (/незначительн|привычк/i.test(category)) return 'desirability'
  if (/ресурс|технолог/i.test(category)) return 'feasibility'
  return 'viability'
}

export function riskAssumptionText(what: string): string {
  return `Этого не случится: ${what.replace(/[.!]+$/, '')}`
}

// Подписи шага «Решение» для pre-mortem
export const RISK_STATUS_LABEL = {
  chosen: '🔥 Нужна мера',
  deferred: '👀 Следим',
  rejected: '✖ Неважно'
} as const
