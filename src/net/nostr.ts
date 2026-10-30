// Транспорт через публичные Nostr-релеи: эфемерные события (не хранятся на релее),
// отправка сразу в несколько релеев, получатель отбрасывает дубли.
import {finalizeEvent, generateSecretKey} from 'nostr-tools/pure'
import type {Transport, TransportStatus} from './transport'

// Проверено сетевым тестом 30.10.2026 (scripts/probe-result-home-2026-10-30.txt)
export const DEFAULT_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://relay.nostr.net',
  'wss://nostr.mom'
]

const KIND = 21059
const SEND_GAP_MS = 120

export interface RelayState {
  url: string
  status: 'connecting' | 'open' | 'closed'
  sent: number
  received: number
  lastError?: string
}

class RelayConn {
  ws?: WebSocket
  state: RelayState
  private queue: string[] = []
  private timer?: ReturnType<typeof setTimeout>
  private retry = 0
  private closed = false

  constructor(url: string, private tag: string, private onEvent: (id: string, content: string) => void, private onChange: () => void) {
    this.state = {url, status: 'connecting', sent: 0, received: 0}
    this.connect()
  }

  private connect() {
    if (this.closed) return
    this.state.status = 'connecting'
    this.onChange()
    let ws: WebSocket
    try { ws = new WebSocket(this.state.url) } catch (e) { this.scheduleReconnect(String(e)); return }
    this.ws = ws
    const openTimeout = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) ws.close() }, 8000)
    ws.onopen = () => {
      clearTimeout(openTimeout)
      this.retry = 0
      this.state.status = 'open'
      this.state.lastError = undefined
      ws.send(JSON.stringify(['REQ', 'pi', {kinds: [KIND], '#r': [this.tag], since: Math.floor(Date.now() / 1000) - 30}]))
      this.onChange()
      this.flush()
    }
    ws.onmessage = m => {
      let d: unknown[]
      try { d = JSON.parse(String(m.data)) } catch { return }
      if (d[0] === 'EVENT' && d[2] && typeof d[2] === 'object') {
        const ev = d[2] as {id: string; content: string}
        this.state.received++
        this.onEvent(ev.id, ev.content)
      } else if (d[0] === 'OK' && d[2] === false) {
        this.state.lastError = String(d[3])
        this.onChange()
      } else if (d[0] === 'NOTICE' || d[0] === 'CLOSED') {
        this.state.lastError = String(d[d.length - 1])
        this.onChange()
      }
    }
    ws.onclose = () => { clearTimeout(openTimeout); this.scheduleReconnect() }
    ws.onerror = () => { this.state.lastError = 'ошибка соединения' }
  }

  private scheduleReconnect(err?: string) {
    if (err) this.state.lastError = err
    this.state.status = 'closed'
    this.onChange()
    if (this.closed) return
    const delay = Math.min(15000, 500 * 2 ** this.retry++)
    setTimeout(() => this.connect(), delay)
  }

  reconnectNow() {
    if (this.closed) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.retry = 0
    this.connect()
  }

  send(raw: string) {
    this.queue.push(raw)
    if (this.queue.length > 200) this.queue.shift()
    this.flush()
  }

  // Не чаще одного события в SEND_GAP_MS: публичные релеи ограничивают частоту
  private flush() {
    if (this.timer || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const next = this.queue.shift()
    if (!next) return
    this.ws.send(next)
    this.state.sent++
    this.timer = setTimeout(() => { this.timer = undefined; this.flush() }, SEND_GAP_MS)
  }

  close() {
    this.closed = true
    this.ws?.close()
  }
}

export class NostrTransport implements Transport {
  private conns: RelayConn[] = []
  private seen = new Set<string>()
  private handlers: ((content: string) => void)[] = []
  private statusHandlers: (() => void)[] = []
  private sk = generateSecretKey()
  private onVisible = () => { if (document.visibilityState === 'visible') this.conns.forEach(c => c.reconnectNow()) }
  private onOnline = () => this.conns.forEach(c => c.reconnectNow())

  constructor(private tag: string, private relays: string[] = DEFAULT_RELAYS) {}

  async connect() {
    this.conns = this.relays.map(url => new RelayConn(url, this.tag, (id, content) => this.handle(id, content), () => this.statusHandlers.forEach(h => h())))
    document.addEventListener('visibilitychange', this.onVisible)
    window.addEventListener('online', this.onOnline)
  }

  private handle(id: string, content: string) {
    if (this.seen.has(id)) return
    this.seen.add(id)
    if (this.seen.size > 5000) this.seen = new Set([...this.seen].slice(-2000))
    this.handlers.forEach(h => h(content))
  }

  send(content: string) {
    const ev = finalizeEvent({kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [['r', this.tag]], content}, this.sk)
    // своё событие считаем уже увиденным, чтобы не обработать эхо
    this.seen.add(ev.id)
    const raw = JSON.stringify(['EVENT', ev])
    this.conns.forEach(c => c.send(raw))
  }

  onMessage(cb: (content: string) => void) { this.handlers.push(cb) }
  onStatus(cb: () => void) { this.statusHandlers.push(cb) }

  status(): TransportStatus {
    const open = this.conns.filter(c => c.state.status === 'open').length
    return open >= 2 ? 'online' : open === 1 ? 'degraded' : 'offline'
  }

  relayStates(): RelayState[] { return this.conns.map(c => ({...c.state})) }

  close() {
    this.conns.forEach(c => c.close())
    document.removeEventListener('visibilitychange', this.onVisible)
    window.removeEventListener('online', this.onOnline)
  }
}
