// Шифрование сообщений (AES-GCM 256) и сжатие. Ключ живёт только в части ссылки после «#».

export function toB64u(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64u(str: string): Uint8Array {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4))
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

export function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return a
}

export async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function sha256hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('')
}

const canCompress = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

// Формат: 1 байт флага (0 — без сжатия, 1 — deflate-raw) + iv(12) + шифротекст
export async function seal(key: CryptoKey, obj: unknown): Promise<string> {
  let data: Uint8Array = new TextEncoder().encode(JSON.stringify(obj))
  let flag = 0
  if (canCompress && data.length > 512) {
    data = await pipe(data, new CompressionStream('deflate-raw'))
    flag = 1
  }
  const iv = randomBytes(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: iv as BufferSource}, key, data as BufferSource))
  const out = new Uint8Array(1 + 12 + ct.length)
  out[0] = flag
  out.set(iv, 1)
  out.set(ct, 13)
  return toB64u(out)
}

export async function open<T>(key: CryptoKey, text: string): Promise<T> {
  const buf = fromB64u(text)
  const iv = buf.slice(1, 13)
  let data: Uint8Array = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, buf.slice(13)))
  if (buf[0] === 1) data = await pipe(data, new DecompressionStream('deflate-raw'))
  return JSON.parse(new TextDecoder().decode(data))
}
