// Протокол поверх транспорта: шифрование, нарезка на части, подтверждения, повторы.
// Организатор — источник истины; участники отправляют действия и получают общее состояние.
import {signal} from '@preact/signals'
import {ActionError, publicView, reduce, type Action, type PublicView} from '../core/engine'
import type {Stage} from '../core/types'
import {open, seal} from './crypto'
import type {Transport, TransportStatus} from './transport'

type Msg =
  | {k: 'act'; from: string; seq: number; a: Action}
  | {k: 'ack'; to: string; seq: number; err?: string; ver?: number}
  | {k: 'state'; v: PublicView}
  | {k: 'sync'; from: string}

const CHUNK = 9000

class Channel {
  private parts = new Map<string, {n: number; got: Map<number, string>; at: number}>()
  private handlers: ((m: Msg) => void)[] = []

  constructor(private t: Transport, private key: CryptoKey) {
    t.onMessage(c => this.receive(c))
  }

  async send(m: Msg) {
    const sealed = await seal(this.key, m)
    const mid = Math.random().toString(36).slice(2, 10)
    const n = Math.ceil(sealed.length / CHUNK)
    for (let i = 0; i < n; i++) this.t.send(`${mid}|${i}|${n}|${sealed.slice(i * CHUNK, (i + 1) * CHUNK)}`)
  }

  onMessage(cb: (m: Msg) => void) { this.handlers.push(cb) }

  private async receive(content: string) {
    const [mid, is, ns, ...rest] = content.split('|')
    const i = Number(is), n = Number(ns)
    if (!mid || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > 64) return
    const body = rest.join('|')
    let sealed = body
    if (n > 1) {
      const now = Date.now()
      for (const [k, v] of this.parts) if (now - v.at > 60_000) this.parts.delete(k)
      const entry = this.parts.get(mid) ?? {n, got: new Map(), at: now}
      entry.got.set(i, body)
      this.parts.set(mid, entry)
      if (entry.got.size < n) return
      this.parts.delete(mid)
      sealed = Array.from({length: n}, (_, j) => entry.got.get(j)).join('')
    }
    let m: Msg
    try { m = await open<Msg>(this.key, sealed) } catch { return } // чужая комната или битое сообщение
    this.handlers.forEach(h => h(m))
  }
}

export class HostSession {
  readonly stage = signal<Stage>(null as unknown as Stage)
  readonly view = signal<PublicView>(null as unknown as PublicView)
  readonly netStatus = signal<TransportStatus>('offline')
  private channel?: Channel
  private acks = new Map<string, Msg>()
  private broadcastTimer?: ReturnType<typeof setTimeout>
  private heartbeat?: ReturnType<typeof setInterval>
  private repeatTimer?: ReturnType<typeof setTimeout>

  constructor(stage: Stage, private onChange: (s: Stage) => void, private transport?: Transport, key?: CryptoKey) {
    this.set(stage)
    if (transport && key) {
      this.channel = new Channel(transport, key)
      this.channel.onMessage(m => this.receive(m))
      transport.onStatus(() => { this.netStatus.value = transport.status() })
    }
  }

  async start() {
    if (!this.transport) return
    await this.transport.connect()
    this.netStatus.value = this.transport.status()
    this.heartbeat = setInterval(() => this.broadcastNow(), 12_000)
    this.broadcastNow()
  }

  private set(s: Stage) {
    this.stage.value = s
    this.view.value = publicView(s, Date.now())
  }

  // Действие с ноутбука (организатор или локальный участник в режиме «Один экран»)
  dispatch(a: Action, actor: string, isHost = true): string | null {
    try {
      const next = reduce(this.stage.value, a, actor, isHost, Date.now())
      this.set(next)
      this.onChange(next)
      this.scheduleBroadcast()
      return null
    } catch (e) {
      if (e instanceof ActionError) return e.message
      throw e
    }
  }

  replaceStage(s: Stage) {
    this.set(s)
    this.scheduleBroadcast()
  }

  private receive(m: Msg) {
    if (m.k === 'sync') { this.scheduleBroadcast(50); return }
    if (m.k !== 'act') return
    const id = `${m.from}:${m.seq}`
    const cached = this.acks.get(id)
    if (cached) { void this.channel!.send(cached); return }
    let err: string | undefined
    try {
      const next = reduce(this.stage.value, m.a, m.from, false, Date.now())
      this.set(next)
      this.onChange(next)
    } catch (e) {
      err = e instanceof Error ? e.message : 'Ошибка'
    }
    const ack: Msg = {k: 'ack', to: m.from, seq: m.seq, ver: this.stage.value.version, ...(err ? {err} : {})}
    this.acks.set(id, ack)
    if (this.acks.size > 2000) this.acks.delete(this.acks.keys().next().value!)
    void this.channel!.send(ack)
    this.scheduleBroadcast()
  }

  private scheduleBroadcast(delay = 300) {
    if (!this.channel || this.broadcastTimer) return
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = undefined
      this.broadcastNow()
      // Повтор через 1,5 с: публичные релеи иногда теряют отдельные сообщения
      clearTimeout(this.repeatTimer)
      this.repeatTimer = setTimeout(() => this.broadcastNow(), 1500)
    }, delay)
  }

  broadcastNow() {
    if (!this.channel) return
    const v = publicView(this.stage.value, Date.now())
    this.view.value = v
    void this.channel.send({k: 'state', v})
  }

  close() {
    clearInterval(this.heartbeat)
    clearTimeout(this.broadcastTimer)
    clearTimeout(this.repeatTimer)
    this.transport?.close()
  }
}

interface Pending {
  msg: Msg
  tries: number
  timer?: ReturnType<typeof setTimeout>
  resolve: (err: string | null) => void
}

export class ClientSession {
  readonly view = signal<PublicView | null>(null)
  readonly netStatus = signal<TransportStatus>('offline')
  readonly hostSeen = signal<number>(0)
  readonly pendingCount = signal(0)
  offset = 0
  private channel: Channel
  private counter = 0
  private pending = new Map<number, Pending>()
  private syncTimer?: ReturnType<typeof setInterval>
  private onVisible = () => { if (document.visibilityState === 'visible') this.requestSync() }

  constructor(readonly pid: string, private transport: Transport, key: CryptoKey) {
    this.channel = new Channel(transport, key)
    this.channel.onMessage(m => this.receive(m))
    transport.onStatus(() => {
      const before = this.netStatus.value
      this.netStatus.value = transport.status()
      if (before === 'offline' && this.netStatus.value !== 'offline') this.requestSync()
    })
  }

  private name = ''
  private token?: string
  private lastHello = 0

  async start(name: string, token?: string) {
    this.name = name
    this.token = token
    this.lastHello = Date.now()
    await this.transport.connect()
    this.netStatus.value = this.transport.status()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible)
    // Пока нет состояния — просим его раз в 4 секунды; потом раз в 20 секунд для проверки связи
    this.syncTimer = setInterval(() => {
      if (!this.view.value || Date.now() - this.hostSeen.value > 20_000) this.requestSync()
    }, 4000)
    this.requestSync()
    return this.send({type: 'hello', name, token})
  }

  requestSync() { void this.channel.send({k: 'sync', from: this.pid}) }

  // Резолвится null при успехе или текстом ошибки
  send(a: Action): Promise<string | null> {
    // seq растёт и после перезагрузки страницы: основан на времени
    const seq = Date.now() * 100 + (this.counter++ % 100)
    const msg: Msg = {k: 'act', from: this.pid, seq, a}
    return new Promise(resolve => {
      const p: Pending = {msg, tries: 0, resolve}
      this.pending.set(seq, p)
      this.pendingCount.value = this.pending.size
      this.attempt(seq)
    })
  }

  private attempt(seq: number) {
    const p = this.pending.get(seq)
    if (!p) return
    if (p.tries >= 8) {
      this.finish(seq, 'Нет связи с организатором. Проверьте интернет и попробуйте ещё раз')
      return
    }
    p.tries++
    void this.channel.send(p.msg)
    p.timer = setTimeout(() => this.attempt(seq), 2500 + p.tries * 500)
  }

  private finish(seq: number, err: string | null) {
    const p = this.pending.get(seq)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(seq)
    this.pendingCount.value = this.pending.size
    p.resolve(err)
  }

  private receive(m: Msg) {
    if (m.k === 'ack' && m.to === this.pid) {
      this.hostSeen.value = Date.now()
      this.finish(m.seq, m.err ?? null)
      // Подтверждение пришло, а состояние отстаёт — значит, рассылка потерялась
      if (m.ver && (this.view.value?.version ?? 0) < m.ver - 1) this.requestSync()
    } else if (m.k === 'state') {
      this.hostSeen.value = Date.now()
      const cur = this.view.value
      if (!cur || cur.stageId !== m.v.stageId || m.v.version >= cur.version) {
        this.offset = m.v.hostTime - Date.now()
        this.view.value = m.v
      }
      // Организатор начал новый этап (или потерял нас) — входим заново
      if (this.name && !m.v.participants.some(p => p.id === this.pid) && Date.now() - this.lastHello > 5000) {
        this.lastHello = Date.now()
        void this.send({type: 'hello', name: this.name, token: this.token})
      }
    }
  }

  close() {
    clearInterval(this.syncTimer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible)
    this.transport.close()
  }
}
