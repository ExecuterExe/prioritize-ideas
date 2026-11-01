// Регламент принятия решения: как команда договаривается после оценки.
// Голоса слепые до раскрытия; после — только итоги, без имён.

export type Rule = 'score' | 'majority' | 'consent' | 'consensus' | 'ranking' | 'owner'
export type Stance = 'support' | 'live' | 'object'

export type Ballot =
  | {kind: 'pick'; cardId: string} // большинство, решение ответственного
  | {kind: 'stance'; stance: Stance; reason?: string} // согласие, консенсус
  | {kind: 'rank'; order: string[]} // ранжирование

export interface Vote {
  rule: Exclude<Rule, 'score'>
  candidates: string[] // финалисты по порядку оценки
  candidateId?: string // за что голосуем при согласии / консенсусе
  ownerId?: string // кто решает при «решении ответственного»
  open: boolean
  ballots: Record<string, Ballot> // участник → голос (наружу до раскрытия не уходит)
  outcome?: VoteOutcome
}

export interface VoteOutcome {
  winnerId?: string // принятый вариант; нет — решение не принято
  tie?: string[] // ничья между вариантами
  counts?: Record<string, number> // голоса или баллы Борда
  stances?: Record<Stance, number>
  objections?: string[] // причины возражений, без имён
  cast: number
  note: string // одной строкой для решения и отчёта
}

export const RULES: {id: Rule; emoji: string; name: string; hint: string}[] = [
  {id: 'score', emoji: '📊', name: 'По оценке', hint: 'Выбираете сами, опираясь на рейтинг — как раньше'},
  {id: 'majority', emoji: '✋', name: 'Большинство', hint: 'Каждый отдаёт один голос; побеждает набравший больше всех'},
  {id: 'consent', emoji: '🤝', name: 'Согласие без возражений', hint: 'Можно предпочитать другое, но принципиально против — никто. Быстрее консенсуса'},
  {id: 'consensus', emoji: '💯', name: 'Консенсус', hint: 'Все поддерживают. Строже всего — подходит для важных решений'},
  {id: 'ranking', emoji: '🔢', name: 'Ранжирование', hint: 'Каждый расставляет варианты по местам; считаем баллы (метод Борда)'},
  {id: 'owner', emoji: '🧑‍⚖️', name: 'Решение ответственного', hint: 'Команда обсуждает, выбор делает назначенный участник'}
]

export const STANCE_LABEL: Record<Stance, string> = {
  support: '👍 Поддерживаю',
  live: '🤷 Могу с этим жить',
  object: '✋ Возражаю'
}

export function ruleName(r: Rule): string {
  return RULES.find(x => x.id === r)?.name ?? r
}

// Проверка голоса под правило; возвращает текст ошибки или null
export function ballotError(v: Vote, b: Ballot): string | null {
  switch (v.rule) {
    case 'majority':
    case 'owner':
      return b.kind === 'pick' && v.candidates.includes(b.cardId) ? null : 'Выберите один вариант'
    case 'consent':
    case 'consensus':
      if (b.kind !== 'stance' || !['support', 'live', 'object'].includes(b.stance)) return 'Выберите позицию'
      return b.stance === 'object' && !b.reason?.trim() ? 'Напишите, почему возражаете — это главное для обсуждения' : null
    case 'ranking': {
      if (b.kind !== 'rank') return 'Расставьте варианты'
      const same = b.order.length === v.candidates.length && v.candidates.every(c => b.order.includes(c))
      return same ? null : 'Расставьте все варианты по местам'
    }
  }
}

// 1 балл, 2 балла, 5 баллов
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${w}`
}

function top(counts: Record<string, number>, order: string[]): {winnerId?: string; tie?: string[]} {
  const max = Math.max(0, ...Object.values(counts))
  const best = order.filter(id => (counts[id] ?? 0) === max && max > 0)
  return best.length === 1 ? {winnerId: best[0]} : best.length > 1 ? {tie: best} : {}
}

export function countVote(v: Vote, title: (id: string) => string = id => id): VoteOutcome {
  const ballots = Object.values(v.ballots)
  const cast = ballots.length
  switch (v.rule) {
    case 'majority': {
      const counts: Record<string, number> = {}
      for (const b of ballots) if (b.kind === 'pick') counts[b.cardId] = (counts[b.cardId] ?? 0) + 1
      const t = top(counts, v.candidates)
      const note = t.winnerId
        ? `Большинство: «${title(t.winnerId)}» — ${counts[t.winnerId]} из ${cast}`
        : t.tie ? `Большинство: ничья (${t.tie.map(title).join(' / ')}) — нужно обсудить или переголосовать` : 'Большинство: голосов нет'
      return {...t, counts, cast, note}
    }
    case 'ranking': {
      // Борда: первое место — n−1 балл, последнее — 0
      const n = v.candidates.length
      const counts: Record<string, number> = Object.fromEntries(v.candidates.map(c => [c, 0]))
      for (const b of ballots) if (b.kind === 'rank') b.order.forEach((id, i) => { counts[id] = (counts[id] ?? 0) + (n - 1 - i) })
      const t = top(counts, v.candidates)
      const note = t.winnerId
        ? `Ранжирование: «${title(t.winnerId)}» — ${plural(counts[t.winnerId], 'балл', 'балла', 'баллов')} (${plural(cast, 'голос', 'голоса', 'голосов')})`
        : t.tie ? `Ранжирование: ничья (${t.tie.map(title).join(' / ')})` : 'Ранжирование: голосов нет'
      return {...t, counts, cast, note}
    }
    case 'consent':
    case 'consensus': {
      const stances: Record<Stance, number> = {support: 0, live: 0, object: 0}
      const objections: string[] = []
      for (const b of ballots) if (b.kind === 'stance') { stances[b.stance]++; if (b.stance === 'object' && b.reason) objections.push(b.reason) }
      const ok = cast > 0 && (v.rule === 'consent' ? stances.object === 0 : stances.support === cast)
      const what = v.candidateId ? `«${title(v.candidateId)}»` : 'вариант'
      const note = v.rule === 'consent'
        ? ok ? `Согласие без возражений: ${what} принят (👍 ${stances.support}, 🤷 ${stances.live})` : `Согласие: ${what} не принят — возражений ${stances.object}`
        : ok ? `Консенсус: ${what} поддержали все (${cast})` : `Консенсуса нет: 👍 ${stances.support} из ${cast}`
      return {winnerId: ok ? v.candidateId : undefined, stances, objections, cast, note}
    }
    case 'owner': {
      const b = v.ownerId ? v.ballots[v.ownerId] : undefined
      const winnerId = b?.kind === 'pick' ? b.cardId : undefined
      return {winnerId, cast, note: winnerId ? `Решение ответственного: «${title(winnerId)}»` : 'Ответственный ещё не выбрал'}
    }
  }
}
