// Движок этапа: действия участников и организатора, переходы между шагами,
// публичное («слепое») представление для рассылки.
import type {
  Arg, Basis, Card, Criterion, Decision, DecisionStatus, Participant, Phase, Score, Settings, Stage, StageType, Tag
} from './types'
import {fromLibrary} from './library'
import {builtinTemplate, cardTitle, validateCard, type FieldValue, type StageTemplate} from './template'
import type {ComplianceValue, Passport} from './passport'
import {autoVerdict, roundAverages, type Assumption, type AssumptionCategory, type AssumptionStatus, type Experiment, type ExperimentMethod, type ThresholdKind} from './assume'
import {approvalQuota, calibrationSpread, computeResults, pickFinalists, type Results} from './math'
import {criterionReady} from './lint'

export const uid = (n = 10) => {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
}

export const DEFAULT_SETTINGS: Settings = {
  anonymous: true, cardLimit: 3, excludeAuthor: false, calibration: true, secondRound: true, timePreset: 'standard'
}

// Минуты на шаг по сценарию (раздел 3 PLAN.md)
export const TIMINGS: Record<'express' | 'standard', Partial<Record<Phase, number>>> = {
  express: {lobby: 1, generate: 4, merge: 2, criteria: 2, shortlist: 1, rate: 4, results: 3, rate2: 2, decide: 2},
  standard: {lobby: 2, generate: 8, merge: 4, criteria: 5, calibrate: 2, shortlist: 2, rate: 7, results: 6, rate2: 3, decide: 5}
}

export function createStage(opts: {
  projectId: string; template: StageTemplate; title: string; settings?: Partial<Settings>
  sourceProblem?: string; sourceFields?: Record<string, FieldValue>; refOptions?: {id: string; title: string}[]
  passport?: Passport; assumptions?: Assumption[]; experiments?: Experiment[]; now: number
}): Stage {
  const settings = {...DEFAULT_SETTINGS, ...opts.settings}
  if (settings.timePreset === 'express') { settings.calibration = false; settings.secondRound = false }
  return {
    id: uid(), projectId: opts.projectId, type: opts.template.id, template: structuredClone(opts.template), title: opts.title,
    sourceProblem: opts.sourceProblem, sourceFields: opts.sourceFields, refOptions: opts.refOptions,
    passport: opts.passport ? structuredClone(opts.passport) : undefined, compliance: {},
    assumptions: structuredClone(opts.assumptions ?? []), experiments: structuredClone(opts.experiments ?? []),
    settings, phase: 'lobby', phaseStartedAt: opts.now, deadline: deadlineFor(settings, 'lobby', opts.now),
    participants: [], cards: [], criteria: [], calibration: [], approvals: [], finalists: [], ratings: [], bases: [],
    submitted: {}, args: [], decisions: [], mergeSuggestions: [], calibRevealed: false,
    disputedForRound2: [], round2Done: false, version: 1, createdAt: opts.now
  }
}

function deadlineFor(s: Settings, phase: Phase, now: number): number | undefined {
  if (s.timePreset === 'none') return undefined
  const m = TIMINGS[s.timePreset][phase]
  return m ? now + m * 60_000 : undefined
}

// Авторы карточки вместе с авторами склеенных в неё карточек
export function cardAuthors(c: Card): string[] {
  return [...new Set([...c.authorIds, ...c.mergedFrom.flatMap(m => m.authorIds)])]
}

// Старые этапы (до конструктора) хранили только тип «problem» / «idea»
export function migrateStage(s: Stage): Stage {
  if (s.template) return s
  const t = builtinTemplate(s.type) ?? builtinTemplate('problem')!
  return {...s, template: structuredClone(t)}
}

export function cardLabel(s: Stage, cardId: string): string {
  const c = s.cards.find(x => x.id === cardId)
  return c ? cardTitle(s.template, c.fields) : cardId
}

export function realCards(stage: Stage): Card[] {
  return stage.cards.filter(c => !c.sample)
}

// Порядок шагов с учётом настроек
export function phaseFlow(stage: Stage): Phase[] {
  const f: Phase[] = ['lobby', 'generate', 'merge', 'criteria']
  if (stage.settings.calibration) f.push('calibrate')
  if (realCards(stage).length > 6) f.push('shortlist')
  f.push('rate', 'results', 'decide', 'summary')
  return f
}

export function activeParticipants(stage: Stage): Participant[] {
  return stage.participants.filter(p => p.active)
}

export function submittedCount(stage: Stage, phase: Phase = stage.phase): number {
  const ids = new Set(activeParticipants(stage).map(p => p.id))
  return (stage.submitted[phase] ?? []).filter(id => ids.has(id)).length
}

// ——— Действия ———

export type Action =
  // участники
  | {type: 'hello'; name: string}
  | {type: 'card.upsert'; id: string; fields: Record<string, FieldValue>; basis?: Basis}
  | {type: 'card.delete'; id: string}
  | {type: 'merge.suggest'; a: string; b: string}
  | {type: 'criterion.propose'; name: string; question: string; anchors: {1: string; 3?: string; 5: string}; tag?: Tag; libraryKey?: string}
  | {type: 'calib.submit'; ratings: {criterionId: string; value: Score | null}[]}
  | {type: 'approve.submit'; cardIds: string[]}
  | {type: 'rate.submit'; round: 1 | 2; ratings: {cardId: string; criterionId: string; value: Score | null}[]; bases: {cardId: string; basis: Basis}[]}
  | {type: 'arg.add'; cardId: string; side: 'pro' | 'con'; text: string}
  // организатор
  | {type: 'phase.next'}
  | {type: 'phase.back'}
  | {type: 'deadline.extend'; minutes: number}
  | {type: 'merge'; into: string; from: string}
  | {type: 'unmerge'; id: string; childId: string}
  | {type: 'suggestion.dismiss'; a: string; b: string}
  | {type: 'criterion.addLibrary'; key: string}
  | {type: 'criterion.update'; id: string; patch: Partial<Omit<Criterion, 'id'>>}
  | {type: 'criterion.remove'; id: string}
  | {type: 'criterion.addCustom'}
  | {type: 'settings.update'; patch: Partial<Settings>}
  | {type: 'participant.setActive'; id: string; active: boolean}
  | {type: 'participant.add'; id: string; name: string}
  | {type: 'participant.rename'; id: string; name: string}
  | {type: 'calib.reveal'}
  | {type: 'round2.start'}
  | {type: 'decision.set'; cardId: string; status: DecisionStatus | null; reason?: string}
  | {type: 'passport.update'; passport: Passport}
  | {type: 'compliance.set'; cardId: string; item: string; value: ComplianceValue | null}
  | {type: 'criterion.addFromPassport'; text: string}
  | {type: 'assumption.add'; id: string; text: string; category: AssumptionCategory; linkedCardId?: string; linkedTitle?: string}
  | {type: 'assumption.update'; id: string; patch: Partial<Pick<Assumption, 'text' | 'category' | 'importance' | 'evidence' | 'status' | 'proof' | 'proofLink' | 'linkedCardId' | 'linkedTitle'>>}
  | {type: 'assumption.delete'; id: string}
  | {type: 'round.open'; ids?: string[]}
  | {type: 'round.submit'; votes: {assumptionId: string; importance: number; evidence: number}[]}
  | {type: 'round.reveal'}
  | {type: 'round.close'}
  | {type: 'experiment.add'; id: string; assumptionId: string; method: ExperimentMethod; audience: string; sampleN: number; metric: string; thresholdKind: ThresholdKind; threshold: number; deadline?: string; ownerId?: string}
  | {type: 'experiment.update'; id: string; patch: Partial<Pick<Experiment, 'method' | 'audience' | 'sampleN' | 'metric' | 'thresholdKind' | 'threshold' | 'deadline' | 'ownerId' | 'note'>>}
  | {type: 'experiment.result'; id: string; resultN: number; resultHits: number; note?: string; override?: AssumptionStatus; reason?: string}
  | {type: 'experiment.delete'; id: string}

export const HOST_ONLY = new Set<Action['type']>([
  'phase.next', 'phase.back', 'deadline.extend', 'merge', 'unmerge', 'suggestion.dismiss', 'criterion.addLibrary',
  'criterion.update', 'criterion.remove', 'criterion.addCustom', 'settings.update', 'participant.setActive',
  'participant.add', 'participant.rename', 'calib.reveal', 'round2.start', 'decision.set',
  'passport.update', 'compliance.set', 'criterion.addFromPassport', 'round.open', 'round.reveal', 'round.close'
])

export class ActionError extends Error {}

const fail = (msg: string): never => { throw new ActionError(msg) }

function markSubmitted(s: Stage, phase: Phase, pid: string) {
  const list = s.submitted[phase] ?? []
  if (!list.includes(pid)) s.submitted[phase] = [...list, pid]
}

function ensureParticipant(s: Stage, pid: string, name: string, now: number) {
  const p = s.participants.find(x => x.id === pid)
  if (p) { p.lastSeen = now; p.active = true; if (name.trim()) p.name = name.trim().slice(0, 40); return }
  s.participants.push({
    id: pid, name: name.trim().slice(0, 40) || 'Без имени', alias: `Участник ${s.participants.length + 1}`,
    joinedAt: now, active: true, lastSeen: now
  })
}

const SCORES = new Set([1, 2, 3, 4, 5])
const validScore = (v: unknown) => v === null || SCORES.has(v as number)

function enterPhase(s: Stage, phase: Phase, now: number) {
  s.phase = phase
  s.phaseStartedAt = now
  s.deadline = deadlineFor(s.settings, phase, now)
  if (phase === 'criteria' && s.criteria.length === 0) {
    s.criteria = s.template.defaultCriteria.map(k => fromLibrary(k, uid()))
  }
  if (phase === 'calibrate') {
    s.calibrationCardId = realCards(s)[0]?.id
    s.calibration = []
    s.calibRevealed = false
    s.submitted.calibrate = []
  }
  if (phase === 'rate' && s.finalists.length === 0) s.finalists = realCards(s).map(c => c.id)
}

function leavePhase(s: Stage, from: Phase) {
  if (from === 'shortlist') s.finalists = pickFinalists(realCards(s).map(c => c.id), s.approvals)
  if (from === 'criteria') {
    // Неготовые свои критерии (без описаний 1 и 5) не попадают в оценку
    s.criteria = s.criteria.filter(c => c.approved && criterionReady(c))
  }
}

export function reduce(stage: Stage, action: Action, actor: string, isHost: boolean, now: number): Stage {
  if (HOST_ONLY.has(action.type) && !isHost) fail('Только организатор может это сделать')
  const s: Stage = structuredClone(stage)
  const me = s.participants.find(p => p.id === actor)
  if (me) me.lastSeen = now

  switch (action.type) {
    case 'hello':
      ensureParticipant(s, actor, action.name, now)
      break

    case 'participant.add':
      ensureParticipant(s, action.id, action.name, now)
      break

    case 'participant.rename': {
      const p = s.participants.find(x => x.id === action.id) ?? fail('Нет такого участника')
      p.name = action.name.trim().slice(0, 40) || p.name
      break
    }

    case 'card.upsert': {
      if (!me) fail('Сначала войдите в комнату')
      if (s.phase !== 'generate' && s.phase !== 'lobby') fail('Добавлять карточки можно только на шаге генерации')
      const existing = s.cards.find(c => c.id === action.id)
      const {values: fields, errors} = validateCard(s.template, action.fields ?? {})
      if (errors.length) fail(errors[0])
      if (existing) {
        if (!existing.authorIds.includes(actor)) fail('Это не ваша карточка')
        existing.fields = fields
        existing.basis = action.basis
      } else {
        const mine = s.cards.filter(c => c.authorIds.includes(actor)).length
        if (mine >= s.settings.cardLimit) fail(`Лимит — ${s.settings.cardLimit} карточки на человека`)
        s.cards.push({id: action.id, authorIds: [actor], fields, basis: action.basis, mergedFrom: [], createdAt: now})
      }
      break
    }

    case 'card.delete': {
      if (s.phase !== 'generate' && s.phase !== 'lobby') fail('Удалять карточки можно только на шаге генерации')
      const c = s.cards.find(x => x.id === action.id)
      if (c && (c.authorIds.includes(actor) || isHost)) s.cards = s.cards.filter(x => x !== c)
      break
    }

    case 'merge.suggest':
      if (s.phase !== 'merge') fail('Предлагать склейку можно только на шаге склейки')
      if (action.a !== action.b && !s.mergeSuggestions.some(m => [m.a, m.b].sort().join() === [action.a, action.b].sort().join())) {
        s.mergeSuggestions.push({a: action.a, b: action.b, by: actor})
      }
      break

    case 'suggestion.dismiss':
      s.mergeSuggestions = s.mergeSuggestions.filter(m => !(m.a === action.a && m.b === action.b))
      break

    case 'merge': {
      if (s.phase !== 'merge') fail('Склеивать можно только на шаге склейки')
      if (action.into === action.from) break
      const into = s.cards.find(c => c.id === action.into) ?? fail('Карточка не найдена')
      const from = s.cards.find(c => c.id === action.from) ?? fail('Карточка не найдена')
      into.mergedFrom.push({...from, mergedFrom: []}, ...from.mergedFrom)
      s.cards = s.cards.filter(c => c !== from)
      s.mergeSuggestions = s.mergeSuggestions.filter(m => m.a !== from.id && m.b !== from.id)
      break
    }

    case 'unmerge': {
      if (s.phase !== 'merge') fail('Разделять можно только на шаге склейки')
      const card = s.cards.find(c => c.id === action.id) ?? fail('Карточка не найдена')
      const child = card.mergedFrom.find(c => c.id === action.childId) ?? fail('Нет такой склеенной карточки')
      card.mergedFrom = card.mergedFrom.filter(c => c !== child)
      s.cards.push({...child, mergedFrom: []})
      break
    }

    case 'criterion.propose': {
      if (!me) fail('Сначала войдите в комнату')
      if (s.phase !== 'criteria') fail('Предлагать критерии можно только на шаге критериев')
      if (action.libraryKey) {
        if (s.criteria.some(c => c.fromLibrary === action.libraryKey)) break
        s.criteria.push({...fromLibrary(action.libraryKey, uid()), approved: false, proposedBy: actor})
      } else {
        const anchors = {1: String(action.anchors[1] ?? '').slice(0, 200), 3: action.anchors[3] ? String(action.anchors[3]).slice(0, 200) : undefined, 5: String(action.anchors[5] ?? '').slice(0, 200)}
        s.criteria.push({
          id: uid(), name: action.name.slice(0, 60), question: action.question.slice(0, 200), anchors,
          weight: 1, inverted: false, tag: action.tag, approved: false, proposedBy: actor
        })
      }
      break
    }

    case 'criterion.addLibrary':
      if (!s.criteria.some(c => c.fromLibrary === action.key)) s.criteria.push(fromLibrary(action.key, uid()))
      else s.criteria.find(c => c.fromLibrary === action.key)!.approved = true
      break

    case 'criterion.addCustom':
      s.criteria.push({id: uid(), name: '', question: '', anchors: {1: '', 5: ''}, weight: 1, inverted: false, approved: true})
      break

    case 'criterion.update': {
      if (phaseIndex(s, s.phase) > phaseIndex(s, 'criteria') && 'inverted' in action.patch) fail('Направление нельзя менять после начала оценки')
      const c = s.criteria.find(x => x.id === action.id) ?? fail('Критерий не найден')
      Object.assign(c, action.patch)
      break
    }

    case 'criterion.remove':
      s.criteria = s.criteria.filter(c => c.id !== action.id)
      s.ratings = s.ratings.filter(r => r.criterionId !== action.id)
      break

    case 'settings.update':
      s.settings = {...s.settings, ...action.patch}
      if (action.patch.timePreset) s.deadline = deadlineFor(s.settings, s.phase, now)
      break

    case 'participant.setActive': {
      const p = s.participants.find(x => x.id === action.id) ?? fail('Нет такого участника')
      p.active = action.active
      break
    }

    case 'calib.submit':
      if (!me) fail('Сначала войдите в комнату')
      if (s.phase !== 'calibrate') fail('Сейчас не калибровка')
      if (!action.ratings.every(r => validScore(r.value))) fail('Неверная оценка')
      s.calibration = s.calibration.filter(r => r.raterId !== actor)
        .concat(action.ratings.map(r => ({raterId: actor, cardId: s.calibrationCardId ?? '', criterionId: r.criterionId, value: r.value, round: 1 as const})))
      markSubmitted(s, 'calibrate', actor)
      break

    case 'calib.reveal':
      s.calibRevealed = true
      break

    case 'approve.submit': {
      if (!me) fail('Сначала войдите в комнату')
      if (s.phase !== 'shortlist') fail('Сейчас не отбор')
      const quota = approvalQuota(realCards(s).length)
      const ids = [...new Set(action.cardIds)].filter(id => s.cards.some(c => c.id === id))
      if (ids.length > quota) fail(`Можно отметить не больше ${quota}`)
      s.approvals = s.approvals.filter(a => a.raterId !== actor).concat({raterId: actor, cardIds: ids})
      markSubmitted(s, 'shortlist', actor)
      break
    }

    case 'rate.submit': {
      if (!me) fail('Сначала войдите в комнату')
      const phase: Phase = action.round === 2 ? 'rate2' : 'rate'
      if (s.phase !== phase) fail('Сейчас не оценка')
      const cardIds = action.round === 2 ? s.disputedForRound2 : s.finalists
      const crits = s.criteria.filter(c => c.approved)
      const need = cardIds.length * crits.length
      const valid = action.ratings.filter(r => cardIds.includes(r.cardId) && crits.some(c => c.id === r.criterionId) && validScore(r.value))
      const uniq = new Map(valid.map(r => [`${r.cardId}|${r.criterionId}`, r]))
      if (uniq.size < need) fail('Заполните все оценки')
      s.ratings = s.ratings.filter(r => !(r.raterId === actor && r.round === action.round))
        .concat([...uniq.values()].map(r => ({raterId: actor, cardId: r.cardId, criterionId: r.criterionId, value: r.value, round: action.round})))
      if (action.round === 1) {
        s.bases = s.bases.filter(b => b.raterId !== actor)
          .concat(action.bases.filter(b => cardIds.includes(b.cardId)).map(b => ({raterId: actor, cardId: b.cardId, basis: b.basis})))
      }
      markSubmitted(s, phase, actor)
      break
    }

    case 'arg.add': {
      if (!me) fail('Сначала войдите в комнату')
      if (!['results', 'rate2', 'decide'].includes(s.phase)) fail('Аргументы добавляются на шаге результатов')
      const text = action.text.trim().slice(0, 300)
      if (!text) fail('Пустой аргумент')
      const arg: Arg = {id: uid(), cardId: action.cardId, side: action.side, text, createdAt: now}
      s.args.push(arg)
      break
    }

    case 'round2.start': {
      if (s.phase !== 'results') fail('Второй раунд запускается из результатов')
      if (s.round2Done) fail('Второй раунд уже был')
      const res = computeResults(s)
      s.disputedForRound2 = res.cards.filter(c => c.disputed).map(c => c.cardId)
      if (!s.disputedForRound2.length) fail('Спорных карточек нет')
      s.submitted.rate2 = []
      enterPhase(s, 'rate2', now)
      break
    }

    case 'decision.set': {
      const rest = s.decisions.filter(d => d.cardId !== action.cardId)
      if (action.status) {
        const d: Decision = {cardId: action.cardId, status: action.status}
        if (action.reason?.trim()) d.reason = action.reason.trim().slice(0, 300)
        rest.push(d)
      }
      s.decisions = rest
      break
    }

    case 'passport.update': {
      const p = action.passport
      const list = (xs: unknown) => (Array.isArray(xs) ? xs.map(x => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 20) : [])
      s.passport = {
        sourceText: p.sourceText ? String(p.sourceText).slice(0, 4000) : undefined,
        result: String(p.result ?? '').slice(0, 300), task: String(p.task ?? '').slice(0, 300), audience: String(p.audience ?? '').slice(0, 200),
        constraints: list(p.constraints), mustHave: list(p.mustHave), forbidden: list(p.forbidden), teacherCriteria: list(p.teacherCriteria)
      }
      break
    }

    case 'compliance.set': {
      if (!/^(must|forbid):\d+$/.test(action.item)) fail('Неизвестный пункт задания')
      const marks = {...(s.compliance?.[action.cardId] ?? {})}
      if (action.value) marks[action.item] = action.value
      else delete marks[action.item]
      s.compliance = {...(s.compliance ?? {}), [action.cardId]: marks}
      break
    }

    case 'criterion.addFromPassport': {
      const text = action.text.trim().slice(0, 120)
      if (!text) fail('Пустое условие')
      const name = `Соответствие: ${text}`.slice(0, 60)
      if (s.criteria.some(c => c.name === name)) break
      s.criteria.push({
        id: uid(), name, question: `Насколько карточка выполняет условие задания «${text}»?`,
        anchors: {1: 'Нарушает условие', 3: 'Выполняет частично', 5: 'Полностью выполняет'},
        weight: 1, inverted: false, approved: true
      })
      break
    }

    case 'assumption.add': {
      if (!me && !isHost) fail('Сначала войдите в комнату')
      const text = action.text.trim().slice(0, 300)
      if (!text) fail('Сформулируйте предположение')
      if (!CATEGORIES.includes(action.category)) fail('Неизвестная категория')
      const list = s.assumptions ?? []
      if (list.length >= 80) fail('Предположений слишком много — удалите лишние')
      if (list.some(a => a.id === action.id)) break
      s.assumptions = [...list, {
        id: action.id.slice(0, 20), text, category: action.category, status: 'untested', authorId: actor, createdAt: now,
        linkedCardId: action.linkedCardId?.slice(0, 40), linkedTitle: action.linkedTitle?.slice(0, 200)
      }]
      break
    }

    case 'assumption.update': {
      const a = (s.assumptions ?? []).find(x => x.id === action.id) ?? fail('Предположение не найдено')
      if (!isHost && a.authorId !== actor) fail('Изменять может автор или организатор')
      const p = action.patch
      if (p.text !== undefined) a.text = String(p.text).trim().slice(0, 300) || a.text
      if (p.category && CATEGORIES.includes(p.category)) a.category = p.category
      if (p.importance !== undefined) a.importance = clampScale(p.importance)
      if (p.evidence !== undefined) a.evidence = clampScale(p.evidence)
      if (p.status && STATUSES.includes(p.status)) a.status = p.status
      if (p.proof !== undefined) a.proof = String(p.proof).slice(0, 400) || undefined
      if (p.proofLink !== undefined) a.proofLink = String(p.proofLink).slice(0, 500) || undefined
      if (p.linkedCardId !== undefined) { a.linkedCardId = p.linkedCardId || undefined; a.linkedTitle = p.linkedTitle?.slice(0, 200) }
      break
    }

    case 'assumption.delete': {
      const a = (s.assumptions ?? []).find(x => x.id === action.id)
      if (!a) break
      if (!isHost && a.authorId !== actor) fail('Удалять может автор или организатор')
      s.assumptions = (s.assumptions ?? []).filter(x => x !== a)
      s.experiments = (s.experiments ?? []).filter(e => e.assumptionId !== a.id)
      break
    }

    case 'round.open': {
      const list = s.assumptions ?? []
      const ids = (action.ids ?? list.filter(a => a.status !== 'confirmed' && a.status !== 'refuted').map(a => a.id))
        .filter(id => list.some(a => a.id === id))
      if (!ids.length) fail('Нет предположений для оценки')
      s.assumptionRound = {open: true, revealed: false, ids, votes: [], submitted: []}
      break
    }

    case 'round.submit': {
      if (!me) fail('Сначала войдите в комнату')
      const r = s.assumptionRound
      if (!r || !r.open) fail('Сейчас нет оценки предположений')
      if (!r) break
      const votes = action.votes.filter(v => r.ids.includes(v.assumptionId))
        .map(v => ({raterId: actor, assumptionId: v.assumptionId, importance: clampScale(v.importance)!, evidence: clampScale(v.evidence)!}))
      if (votes.some(v => !v.importance || !v.evidence) || new Set(votes.map(v => v.assumptionId)).size < r.ids.length) fail('Оцените все предположения')
      r.votes = r.votes.filter(v => v.raterId !== actor).concat(votes)
      if (!r.submitted.includes(actor)) r.submitted.push(actor)
      break
    }

    case 'round.reveal': {
      const r = s.assumptionRound ?? fail('Оценка не запущена')
      if (!r.votes.length) fail('Пока никто не отправил оценки')
      const avg = roundAverages(r)
      for (const a of s.assumptions ?? []) {
        const x = avg[a.id]
        if (x) { a.importance = x.importance; a.evidence = x.evidence }
      }
      r.open = false
      r.revealed = true
      break
    }

    case 'round.close':
      s.assumptionRound = undefined
      break

    case 'experiment.add': {
      if (!me && !isHost) fail('Сначала войдите в комнату')
      const a = (s.assumptions ?? []).find(x => x.id === action.assumptionId) ?? fail('Сначала выберите предположение')
      if ((s.experiments ?? []).some(e => e.id === action.id)) break
      const e = cleanExperiment({...action, authorId: actor, createdAt: now} as Experiment)
      s.experiments = [...(s.experiments ?? []), e]
      if (a.status === 'untested') a.status = 'testing'
      break
    }

    case 'experiment.update': {
      const e = (s.experiments ?? []).find(x => x.id === action.id) ?? fail('Эксперимент не найден')
      if (!isHost && e.authorId !== actor && e.ownerId !== actor) fail('Изменять может автор, ответственный или организатор')
      Object.assign(e, cleanExperiment({...e, ...action.patch}))
      break
    }

    case 'experiment.result': {
      const e = (s.experiments ?? []).find(x => x.id === action.id) ?? fail('Эксперимент не найден')
      if (!isHost && e.authorId !== actor && e.ownerId !== actor) fail('Результат вносит автор, ответственный или организатор')
      const n = Math.round(Number(action.resultN)), hits = Math.round(Number(action.resultHits))
      if (!(n > 0) || !(hits >= 0) || (e.thresholdKind === 'percent' && hits > n)) fail('Проверьте числа: «из скольких» больше нуля, «сколько подтвердили» не больше общего')
      e.resultN = n
      e.resultHits = hits
      e.note = action.note?.slice(0, 400) || e.note
      const auto = autoVerdict(e)
      if (action.override && action.override !== auto) {
        if (!action.reason?.trim()) fail('Объясните, почему вывод отличается от автоматического')
        e.verdict = action.override
        e.manualReason = (action.reason ?? '').trim().slice(0, 300)
      } else {
        e.verdict = auto ?? undefined
        e.manualReason = undefined
      }
      const a = (s.assumptions ?? []).find(x => x.id === e.assumptionId)
      if (a && e.verdict) {
        a.status = e.verdict
        a.proof = `${METHOD_NAMES[e.method]}: ${hits} из ${n}${e.note ? ` — ${e.note}` : ''}`
      }
      break
    }

    case 'experiment.delete': {
      const e = (s.experiments ?? []).find(x => x.id === action.id)
      if (!e) break
      if (!isHost && e.authorId !== actor) fail('Удалять может автор или организатор')
      s.experiments = (s.experiments ?? []).filter(x => x !== e)
      break
    }

    case 'deadline.extend':
      s.deadline = Math.max(s.deadline ?? now, now) + action.minutes * 60_000
      break

    case 'phase.next': {
      if (s.phase === 'rate2') {
        s.round2Done = true
        enterPhase(s, 'results', now)
        break
      }
      const err = canAdvance(s)
      if (err) fail(err)
      const flow = phaseFlow(s)
      const i = flow.indexOf(s.phase)
      if (i < 0 || i === flow.length - 1) break
      leavePhase(s, s.phase)
      enterPhase(s, flow[i + 1], now)
      break
    }

    case 'phase.back': {
      if (!canGoBack(s)) fail('Назад нельзя: оценка уже началась')
      if (s.phase === 'rate2') { enterPhase(s, 'results', now); break }
      const flow = phaseFlow(s)
      const i = flow.indexOf(s.phase)
      if (i > 0) {
        if (s.phase === 'shortlist' || flow[i - 1] === 'shortlist') s.finalists = []
        enterPhase(s, flow[i - 1], now)
      }
      break
    }
  }
  s.version = stage.version + 1
  return s
}

function phaseIndex(s: Stage, p: Phase): number {
  const order: Phase[] = ['lobby', 'generate', 'merge', 'criteria', 'calibrate', 'shortlist', 'rate', 'results', 'rate2', 'decide', 'summary']
  return order.indexOf(p)
}

const CATEGORIES: AssumptionCategory[] = ['desirability', 'feasibility', 'viability']
const STATUSES: AssumptionStatus[] = ['untested', 'testing', 'confirmed', 'partly', 'refuted', 'insufficient']
const METHOD_NAMES: Record<ExperimentMethod, string> = {survey: 'Опрос', interview: 'Интервью', landing: 'Лендинг', prototype: 'Прототип', observation: 'Наблюдение', competitors: 'Анализ конкурентов'}

function clampScale(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n * 10) / 10)) : undefined
}

function cleanExperiment(e: Experiment): Experiment {
  if (!(e.method in METHOD_NAMES)) fail('Неизвестный метод')
  const sampleN = Math.round(Number(e.sampleN))
  const threshold = Number(e.threshold)
  if (!(sampleN > 0)) fail('Укажите, сколько людей планируете опросить')
  if (!(threshold > 0)) fail('Укажите порог успеха')
  if (e.thresholdKind === 'percent' && threshold > 100) fail('Порог в процентах — не больше 100')
  return {
    ...e, id: String(e.id).slice(0, 20), audience: String(e.audience ?? '').slice(0, 200), metric: String(e.metric ?? '').slice(0, 200),
    sampleN, threshold, thresholdKind: e.thresholdKind === 'count' ? 'count' : 'percent',
    deadline: e.deadline && /^\d{4}-\d{2}-\d{2}$/.test(e.deadline) ? e.deadline : undefined,
    ownerId: e.ownerId?.slice(0, 40) || undefined
  }
}

export function canGoBack(s: Stage): boolean {
  return ['generate', 'merge', 'criteria', 'calibrate', 'shortlist', 'decide', 'summary', 'rate2'].includes(s.phase)
}

// Причина, по которой нельзя идти дальше (или null)
export function canAdvance(s: Stage): string | null {
  switch (s.phase) {
    case 'lobby': return s.participants.length ? null : 'Нужен хотя бы один участник'
    case 'generate': return realCards(s).length ? null : 'Нет ни одной карточки'
    case 'criteria': {
      const ok = s.criteria.filter(c => c.approved && criterionReady(c))
      return ok.length ? null : 'Нужен хотя бы один утверждённый критерий с описаниями для 1 и 5'
    }
    case 'rate': return submittedCount(s) >= Math.max(1, Math.ceil(activeParticipants(s).length / 2))
      ? null : 'Отправили оценки меньше половины участников'
    case 'decide': return s.decisions.some(d => d.status === 'chosen') ? null : 'Отметьте хотя бы одну карточку как выбранную'
    default: return null
  }
}

// ——— Публичное представление (одно для всех, без чужих оценок до раскрытия) ———

export interface PublicCard {
  id: string
  fields: Record<string, FieldValue>
  authorIds?: string[]
  authorAliases?: string[]
  mergedTexts: Record<string, FieldValue>[]
  mergedIds: string[]
}

export interface PublicView {
  stageId: string
  projectId: string
  type: StageType
  template: StageTemplate
  sourceFields?: Record<string, FieldValue>
  refOptions?: {id: string; title: string}[]
  passport?: Passport
  compliance: Record<string, Record<string, ComplianceValue>>
  assumptions: Assumption[]
  experiments: Experiment[]
  round?: {open: boolean; revealed: boolean; ids: string[]; submitted: string[]; averages?: ReturnType<typeof roundAverages>}
  title: string
  sourceProblem?: string
  settings: Settings
  phase: Phase
  flow: Phase[]
  deadline?: number
  hostTime: number
  version: number
  participants: {id: string; name: string; alias: string; active: boolean}[]
  cardCounts: Record<string, number>
  cards: PublicCard[]
  calibrationCard?: PublicCard
  criteria: Criterion[]
  finalists: string[]
  approvalCounts?: Record<string, number>
  approvalQuota: number
  calibration?: {criterionId: string; values: number[]; wide: boolean}[]
  results?: Results
  args: Arg[]
  decisions: Decision[]
  mergeSuggestions: {a: string; b: string}[]
  disputedForRound2: string[]
  round2Done: boolean
  progress: Record<string, boolean>
  progressPhase: Phase
  canGoBack: boolean
  advanceBlock: string | null
}

const AFTER_REVEAL: Phase[] = ['results', 'rate2', 'decide', 'summary']

export function publicView(s: Stage, now: number): PublicView {
  const alias = (id: string) => s.participants.find(p => p.id === id)?.alias ?? '?'
  const toPublic = (c: Card): PublicCard => ({
    id: c.id,
    fields: c.fields,
    ...(s.settings.anonymous ? {} : {authorIds: cardAuthors(c), authorAliases: cardAuthors(c).map(alias)}),
    mergedTexts: c.mergedFrom.map(m => m.fields),
    mergedIds: c.mergedFrom.map(m => m.id)
  })
  // Во время генерации чужие карточки скрыты — видно только их количество
  const hideCards = s.phase === 'lobby' || s.phase === 'generate'
  const cardCounts: Record<string, number> = {}
  for (const c of s.cards) for (const a of c.authorIds) cardCounts[a] = (cardCounts[a] ?? 0) + 1
  const submitted = new Set(s.submitted[s.phase] ?? [])
  const progress = Object.fromEntries(s.participants.map(p => [p.id, submitted.has(p.id)]))
  const calibCard = s.cards.find(c => c.id === s.calibrationCardId)
  return {
    stageId: s.id, projectId: s.projectId, type: s.type, template: s.template, sourceFields: s.sourceFields, refOptions: s.refOptions,
    passport: s.passport, compliance: s.compliance ?? {},
    // Авторство предположений скрыто при анонимности; оценки раунда наружу не уходят — только средние после раскрытия
    assumptions: (s.assumptions ?? []).map(a => (s.settings.anonymous ? {...a, authorId: ''} : a)),
    experiments: (s.experiments ?? []).map(e => (s.settings.anonymous ? {...e, authorId: ''} : e)),
    round: s.assumptionRound && {
      open: s.assumptionRound.open, revealed: s.assumptionRound.revealed, ids: s.assumptionRound.ids,
      submitted: s.assumptionRound.submitted,
      averages: s.assumptionRound.revealed ? roundAverages(s.assumptionRound) : undefined
    },
    title: s.title, sourceProblem: s.sourceProblem,
    settings: s.settings, phase: s.phase, flow: phaseFlow(s), deadline: s.deadline, hostTime: now, version: s.version,
    participants: s.participants.map(p => ({id: p.id, name: p.name, alias: p.alias, active: p.active})),
    cardCounts,
    cards: hideCards ? [] : s.cards.map(toPublic),
    calibrationCard: calibCard ? toPublic(calibCard) : undefined,
    criteria: s.criteria,
    finalists: s.finalists,
    approvalCounts: phaseIndex(s, s.phase) > phaseIndex(s, 'shortlist')
      ? Object.fromEntries(s.cards.map(c => [c.id, s.approvals.filter(a => a.cardIds.includes(c.id)).length]))
      : undefined,
    approvalQuota: approvalQuota(realCards(s).length),
    calibration: s.phase === 'calibrate' && (s.calibRevealed || submittedCount(s) >= activeParticipants(s).length && s.calibration.length > 0)
      ? calibrationSpread(s) : undefined,
    results: AFTER_REVEAL.includes(s.phase) ? computeResults(s) : undefined,
    args: s.args,
    decisions: s.decisions,
    mergeSuggestions: s.mergeSuggestions.map(({a, b}) => ({a, b})),
    disputedForRound2: s.disputedForRound2,
    round2Done: s.round2Done,
    progress,
    progressPhase: s.phase,
    canGoBack: canGoBack(s),
    advanceBlock: s.phase === 'rate2' ? null : canAdvance(s)
  }
}
