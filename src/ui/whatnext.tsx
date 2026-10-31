// «Что дальше?»: продолжить, свернуть на другой путь, вернуться или завершить — без потери собранного.
import {createPortal} from 'preact/compat'
import type {Action, PublicView} from '../core/engine'
import {uid} from '../core/engine'
import {BUILTIN_TEMPLATES} from '../core/template'
import {branchOptions, leaderAssumption, planBranch, routeChain, type PathChoice} from '../core/route'
import type {Stage} from '../core/types'
import {downloadFile, type StoredProject} from '../store/db'
import {buildMarkdown} from './results'
import {toast} from './toast'

function Option({emoji, title, hint, onClick, primary}: {emoji: string; title: string; hint: string; onClick: () => void; primary?: boolean}) {
  return (
    <button class={`next-option ${primary ? 'main' : ''}`} onClick={onClick}>
      <span class="next-emoji">{emoji}</span>
      <span><b>{title}</b><small>{hint}</small></span>
    </button>
  )
}

export function WhatNextSheet({view, stage, project, single, onClose, onContinue, onBranch, onAssume, onBack, onFinish, asHost, onExit}: {
  view: PublicView; stage: Stage; project: StoredProject; single: boolean
  onClose: () => void; onContinue: () => void; onBranch: (c: PathChoice) => void; onAssume: () => void
  onBack: () => void; onFinish: () => void; asHost: (a: Action) => Promise<string | null>; onExit: () => void
}) {
  const summary = view.phase === 'summary'
  const steps = project.workflow?.steps ?? []
  const nextTpl = BUILTIN_TEMPLATES.find(t => t.id === steps[steps.indexOf(view.template.id) + 1])
  const hasChosen = view.decisions.some(d => d.status === 'chosen')
  const cont = summary
    ? {title: nextTpl ? `Дальше по сценарию: ${nextTpl.emoji} ${nextTpl.name}` : 'Новый этап на основе выбранного', hint: hasChosen ? 'Выбранная карточка станет исходной для следующего этапа' : 'Можно выбрать тип этапа и исходную карточку'}
    : view.phase === 'results'
      ? {title: 'Обсудить и выбрать', hint: 'Перейти к решению: отметить выбранное, отложенное и отклонённое'}
      : {title: 'Зафиксировать итог', hint: 'Перейти к итогам этапа'}
  const options = branchOptions(stage)
  const rerate = !view.canGoBack && planBranch(stage, 'rerate')
  const route = routeChain(project.stages, project.path)
  const assume = async () => {
    const a = leaderAssumption(stage)
    if (a && !view.assumptions.some(x => x.linkedCardId === a.cardId)) {
      const r = await asHost({type: 'assumption.add', id: uid(), text: a.text, category: a.category, linkedCardId: a.cardId, linkedTitle: a.title})
      if (r) { toast(r, 'error'); return }
      toast('Добавлена заготовка предположения — уточните её вместе')
    }
    onAssume()
  }

  return createPortal(
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet wide" role="dialog" aria-label="Что дальше?" onClick={e => e.stopPropagation()}>
        <div class="row between">
          <h2 style={{margin: 0}}>Что будем делать дальше?</h2>
          <button class="ghost icon-btn" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>
        {route.length > 1 && <div class="tiny muted">Путь проекта: {route.join(' → ')}</div>}

        <div class="next-group">
          <div class="next-label">Продолжить</div>
          <Option emoji="➡️" title={cont.title} hint={cont.hint} onClick={onContinue} primary />
        </div>

        {options.length > 0 && (
          <div class="next-group">
            <div class="next-label">Выбрать другой путь <span class="muted">· собранное не пропадёт{single ? '' : ', телефоны перейдут сами'}</span></div>
            {options.map(o => (
              <Option key={o.choice} emoji={o.emoji} title={o.title} hint={o.hint} onClick={() => o.choice === 'assume' ? void assume() : onBranch(o.choice)} />
            ))}
          </div>
        )}

        <div class="next-group">
          <div class="next-label">Вернуться назад</div>
          {view.canGoBack && <Option emoji="↶" title="На шаг назад" hint="Пересмотреть формулировки или критерии" onClick={onBack} />}
          {rerate && <Option emoji="🔁" title="Переоценить заново" hint="Новый раунд с теми же карточками и критериями; прошлые оценки сохранятся" onClick={() => onBranch('rerate')} />}
        </div>

        <div class="next-group">
          <div class="next-label">Завершить</div>
          {summary
            ? (
              <div class="row">
                <button onClick={() => downloadFile(`${project.title} — ${view.template.name}.md`, buildMarkdown(view, project.title, route))}>📄 Скачать отчёт</button>
                <button onClick={() => downloadFile(`${project.title}.json`, JSON.stringify(project, null, 1))}>💾 Сохранить проект в файл</button>
                <button class="ghost" onClick={onExit}>К проектам</button>
              </div>
            )
            : <Option emoji="🏁" title="Перейти к итогам" hint="Сохранить результат и собрать отчёт" onClick={onFinish} />}
        </div>
      </div>
    </div>,
    document.body
  )
}
