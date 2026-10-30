// Сетевой тест (этап 0): какие Nostr-релеи доступны и доставляют поток эфемерных событий.
import {generateSecretKey, finalizeEvent} from 'nostr-tools/pure'

const RELAYS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.band',
  'wss://nostr.mom', 'wss://relay.snort.social', 'wss://offchain.pub', 'wss://nostr.wine',
  'wss://relay.nostr.net', 'wss://nostr-pub.wellorder.net', 'wss://relay.mostr.pub', 'wss://nostr.oxtr.dev'
]
const N = 60, KIND = 21059

function open(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); const t = setTimeout(() => { ws.close(); rej(new Error('timeout')) }, 6000)
    ws.onopen = () => { clearTimeout(t); res(ws) }; ws.onerror = () => { clearTimeout(t); rej(new Error('error')) }
  })
}

async function probe(url) {
  const t0 = Date.now()
  let a, b
  try { a = await open(url); b = await open(url) } catch (e) { return {url, ok: false, why: e.message} }
  const connectMs = Date.now() - t0
  const tag = Math.random().toString(36).slice(2)
  let got = 0, first = 0, notices = new Set()
  b.onmessage = m => { const d = JSON.parse(m.data); if (d[0] === 'EVENT') { got++; if (!first) first = Date.now() } }
  a.onmessage = m => { const d = JSON.parse(m.data); if (d[0] === 'OK' && !d[2]) notices.add(d[3]); if (d[0] === 'NOTICE' || d[0] === 'CLOSED') notices.add(String(d[1] ?? d[2])) }
  b.send(JSON.stringify(['REQ', 's', {kinds: [KIND], '#r': [tag]}]))
  await new Promise(r => setTimeout(r, 800))
  const sk = generateSecretKey(), pad = 'x'.repeat(1000), ts = Date.now()
  for (let i = 0; i < N; i++) {
    const ev = finalizeEvent({kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [['r', tag]], content: pad + i}, sk)
    a.send(JSON.stringify(['EVENT', ev])); await new Promise(r => setTimeout(r, 40))
  }
  await new Promise(r => setTimeout(r, 4000))
  a.close(); b.close()
  return {url, ok: got >= N * 0.95, connectMs, delivered: `${got}/${N}`, firstMs: first ? first - ts : null, notes: [...notices].slice(0, 2).join(' | ')}
}

const res = await Promise.all(RELAYS.map(probe))
console.table(res)
