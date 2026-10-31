// Проверки критериев на правилах (без ИИ). Не блокируют, а советуют.
// Проверки карточек — в template.ts (lintCard).
import type {Criterion} from './types'
import type {TemplateKind} from './template'
import {LIBRARY} from './library'

// Группы близких по смыслу слов: два критерия из одной группы, скорее всего, дублируют друг друга
const SYNONYMS: string[][] = [
  ['актуальн', 'востребован', 'важн', 'значим'],
  ['бол', 'остр', 'серьёзн', 'серьезн'],
  ['частот', 'регулярн', 'как часто'],
  ['лёгк', 'легк', 'реализуем', 'сложн', 'трудоёмк', 'трудоемк'],
  ['масштаб', 'охват', 'количество люд', 'сколько люд'],
  ['нов', 'оригинальн', 'уникальн', 'инновацион'],
  ['монетиз', 'деньг', 'заработ', 'окупаем']
]

const FEASIBILITY_WORDS = /(реализуем|лёгкость|легкость|сложность|трудоёмк|трудоемк|стоимость разработки)/i

export function lintCriteria(type: TemplateKind, criteria: Criterion[]): string[] {
  const hints: string[] = []
  const list = criteria.filter(c => c.approved)
  if (list.length > 5) hints.push(`Критериев ${list.length}: оценка займёт много времени. Оставьте 3–4`)
  if (list.length === 0) hints.push('Добавьте хотя бы один критерий')
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].name.toLowerCase(), b = list[j].name.toLowerCase()
      if (SYNONYMS.some(g => g.some(w => a.includes(w)) && g.some(w => b.includes(w)))) {
        hints.push(`«${list[i].name}» и «${list[j].name}» могут измерять одно и то же`)
      }
    }
  }
  if (type === 'problem') {
    for (const c of list) {
      const lib = c.fromLibrary && LIBRARY.find(l => l.key === c.fromLibrary)
      if (lib && lib.for === 'idea') hints.push(`«${c.name}» подходит для идей, а не для проблем`)
      else if (!lib && FEASIBILITY_WORDS.test(c.name)) hints.push(`«${c.name}» оценивает решение, а не проблему`)
    }
  }
  if (type === 'idea') {
    const hasN = list.some(c => c.tag === 'novelty'), hasF = list.some(c => c.tag === 'feasibility')
    if (!hasN || !hasF) hints.push('Добавьте пару «новизна» + «реализуемость» — для матрицы 2×2')
  }
  return hints
}

export function criterionReady(c: Pick<Criterion, 'name' | 'anchors'>): boolean {
  return !!c.name.trim() && !!c.anchors[1]?.trim() && !!c.anchors[5]?.trim()
}
