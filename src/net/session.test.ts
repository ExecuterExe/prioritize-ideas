import {describe, expect, it} from 'vitest'
import {createStage} from '../core/engine'
import {importKey, randomBytes} from './crypto'
import {ClientSession, HostSession} from './session'
import {MemoryTransport} from './transport'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('session over lossy transport', () => {
  it('participants join, submit cards and receive blind state', async () => {
    const key = await importKey(randomBytes(32))
    const stage = createStage({projectId: 'p', type: 'problem', title: 't', settings: {timePreset: 'none'}, now: Date.now()})
    const host = new HostSession(stage, () => {}, new MemoryTransport('room1', {dropRate: 0.3}), key)
    await host.start()
    const clients = ['a', 'b', 'c'].map(id => new ClientSession(id, new MemoryTransport('room1', {dropRate: 0.3}), key))
    const errs = await Promise.all(clients.map((c, i) => c.start(`Имя ${i}`)))
    expect(errs).toEqual([null, null, null])
    expect(host.stage.value.participants.map(p => p.id).sort()).toEqual(['a', 'b', 'c'])
    expect(host.dispatch({type: 'phase.next'}, 'host')).toBeNull()
    const big = 'очень длинный текст '.repeat(25)
    const r = await clients[0].send({type: 'card.upsert', id: 'k1', fields: {who: 'x', situation: 'y', what: big}})
    expect(r).toBeNull()
    // повтор того же действия не создаёт дубль
    expect(host.stage.value.cards).toHaveLength(1)
    const bad = await clients[1].send({type: 'phase.next'})
    expect(bad).toContain('организатор')
    // Ждём, пока при потерях до всех дойдёт актуальное состояние (повтор рассылки, синхронизация)
    // (до 20 с: в худшем случае состояние приходит с плановым обновлением раз в 12 с)
    const synced = () => clients.every(c => c.view.value?.version === host.stage.value.version)
    for (let t = 0; t < 80 && !synced(); t++) await wait(250)
    for (const c of clients) {
      expect(c.view.value?.phase).toBe('generate')
      expect(c.view.value?.cards).toHaveLength(0)
      expect(c.view.value?.cardCounts.a).toBe(1)
    }
    host.close(); clients.forEach(c => c.close())
  }, 60_000)

  it('wrong key cannot read the room', async () => {
    const key = await importKey(randomBytes(32))
    const other = await importKey(randomBytes(32))
    const host = new HostSession(createStage({projectId: 'p', type: 'idea', title: 't', now: Date.now()}), () => {}, new MemoryTransport('room2'), key)
    await host.start()
    const intruder = new ClientSession('x', new MemoryTransport('room2'), other)
    void intruder.start('x')
    await wait(800)
    expect(intruder.view.value).toBeNull()
    expect(host.stage.value.participants).toHaveLength(0)
    host.close(); intruder.close()
  })
})
