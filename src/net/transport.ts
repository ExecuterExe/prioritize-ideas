// Транспорт — «почтовый ящик» комнаты: всё, что отправлено, получают все остальные.
// Шифрование, нарезка на части и протокол — уровнем выше (session.ts).

export type TransportStatus = 'online' | 'degraded' | 'offline'

export interface Transport {
  connect(): Promise<void>
  send(content: string): void
  onMessage(cb: (content: string) => void): void
  onStatus(cb: () => void): void
  status(): TransportStatus
  close(): void
}

// Для тестов: транспорт в памяти, общий «эфир» по имени комнаты
const air = new Map<string, Set<MemoryTransport>>()

export class MemoryTransport implements Transport {
  private handlers: ((c: string) => void)[] = []
  constructor(private room: string, private opts: {dropRate?: number} = {}) {}
  async connect() {
    if (!air.has(this.room)) air.set(this.room, new Set())
    air.get(this.room)!.add(this)
  }
  send(content: string) {
    for (const t of air.get(this.room) ?? []) {
      if (t === this) continue
      if (this.opts.dropRate && Math.random() < this.opts.dropRate) continue
      setTimeout(() => t.handlers.forEach(h => h(content)), Math.random() * 20)
    }
  }
  onMessage(cb: (c: string) => void) { this.handlers.push(cb) }
  onStatus() {}
  status(): TransportStatus { return 'online' }
  close() { air.get(this.room)?.delete(this) }
}
