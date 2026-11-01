import {describe, expect, it} from 'vitest'
import {createStage} from '../core/engine'
import {builtinTemplate} from '../core/template'
import {importKey, randomBytes} from './crypto'
import {ClientSession, HostSession, OFFLINE_QUEUED} from './session'
import {MemoryTransport} from './transport'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('session over lossy transport (20% потерь)', () => {
  it('participants join, submit cards and receive blind state', async () => {
    const key = await importKey(randomBytes(32))
    const stage = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', settings: {timePreset: 'none'}, now: Date.now()})
    const host = new HostSession(stage, () => {}, new MemoryTransport('room1', {dropRate: 0.2}), key)
    await host.start()
    const clients = ['a', 'b', 'c'].map(id => new ClientSession(id, new MemoryTransport('room1', {dropRate: 0.2}), key))
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
    // (до 45 с: при потерях состояние может прийти только с плановым обновлением раз в 12 с)
    const synced = () => clients.every(c => c.view.value?.version === host.stage.value.version)
    for (let t = 0; t < 180 && !synced(); t++) await wait(250)
    for (const c of clients) {
      expect(c.view.value?.phase).toBe('generate')
      expect(c.view.value?.cards).toHaveLength(0)
      expect(c.view.value?.cardCounts.a).toBe(1)
    }
    host.close(); clients.forEach(c => c.close())
  }, 120_000)

  it('outage: action is queued and delivered after the link returns; two-way link confirmed', async () => {
    const key = await importKey(randomBytes(32))
    const stage = createStage({projectId: 'p', template: builtinTemplate('problem')!, title: 't', settings: {timePreset: 'none'}, now: Date.now()})
    const host = new HostSession(stage, () => {}, new MemoryTransport('room3'), key)
    await host.start()
    const net = new MemoryTransport('room3')
    const client = new ClientSession('a', net, key, {tries: 2})
    expect(await client.start('Аня')).toBeNull()
    for (let t = 0; t < 40 && host.links.value.a !== stage.id; t++) await wait(100)
    expect(host.links.value.a).toBe(stage.id)
    expect(host.dispatch({type: 'phase.next'}, 'host')).toBeNull()
    for (let t = 0; t < 40 && client.view.value?.phase !== 'generate'; t++) await wait(100)
    net.opts.down = true
    const r = await client.send({type: 'card.upsert', id: 'k1', fields: {who: 'студенты', situation: 'вечером', what: 'Негде стирать одежду'}})
    expect(r).toBe(OFFLINE_QUEUED)
    expect(client.pendingCount.value).toBe(1)
    expect(host.stage.value.cards).toHaveLength(0)
    net.opts.down = false
    client.flush()
    for (let t = 0; t < 80 && client.pendingCount.value > 0; t++) await wait(100)
    expect(host.stage.value.cards.map(c => c.id)).toEqual(['k1'])
    expect(client.pendingCount.value).toBe(0)
    expect(client.lateDelivered.value).toBe(1)
    host.close(); client.close()
  }, 60_000)

  it('wrong key cannot read the room', async () => {
    const key = await importKey(randomBytes(32))
    const other = await importKey(randomBytes(32))
    const host = new HostSession(createStage({projectId: 'p', template: builtinTemplate('idea')!, title: 't', now: Date.now()}), () => {}, new MemoryTransport('room2'), key)
    await host.start()
    const intruder = new ClientSession('x', new MemoryTransport('room2'), other)
    void intruder.start('x')
    await wait(800)
    expect(intruder.view.value).toBeNull()
    expect(host.stage.value.participants).toHaveLength(0)
    host.close(); intruder.close()
  })
})
