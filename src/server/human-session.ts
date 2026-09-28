/**
 * A session cookie looks like `v1.<expiry>.<id>.<signature>`. The signature
 * is made from the rest using `SESSION_SECRET`, so a cookie can't be made or
 * changed without it. Expiry is checked here, so editing the cookie can't
 * keep an old session alive.
 */
import '@tanstack/react-start/server-only'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const SESSION_VERSION = 'v1'
export const SESSION_TTL_SECONDS = 30 * 60
/** Shorter secrets are treated as missing. */
export const MIN_SESSION_SECRET_LENGTH = 32

const encoder = new TextEncoder()
const keys = new Map<string, Promise<CryptoKey>>()

/** The token must also have been issued for this site and this form's action. */
export async function verifyTurnstileToken({
  token,
  secret,
  remoteIp,
  hostname,
  action,
}: {
  token: string
  secret: string
  remoteIp: string | undefined
  hostname: string
  action: string
}): Promise<boolean> {
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      console.error('Turnstile Siteverify failed', response.status)
      return false
    }
    const outcome: {
      success?: boolean
      hostname?: string
      action?: string
      'error-codes'?: string[]
    } = await response.json()
    if (!outcome.success) {
      console.warn('Turnstile rejected a token', outcome['error-codes'])
      return false
    }
    return outcome.hostname === hostname && outcome.action === action
  } catch (error) {
    console.error('Turnstile Siteverify request failed', error)
    return false
  }
}

export async function createSession(
  secret: string,
  now = Date.now(),
): Promise<{ value: string; expiresAt: number }> {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)))
  const payload = `${SESSION_VERSION}.${expiresAt}.${nonce}`
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(secret),
    encoder.encode(payload),
  )
  return {
    value: `${payload}.${toBase64Url(new Uint8Array(signature))}`,
    expiresAt: expiresAt * 1000,
  }
}

/** Returns the session's random ID if the cookie is genuine and hasn't expired. */
export async function verifySession(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<string | null> {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const [version, expiresAtText, nonce, signatureText] = parts as [
    string,
    string,
    string,
    string,
  ]
  if (version !== SESSION_VERSION || !/^\d{1,12}$/.test(expiresAtText)) {
    return null
  }

  const nowSeconds = Math.floor(now / 1000)
  const expiresAt = Number(expiresAtText)
  if (expiresAt <= nowSeconds || expiresAt > nowSeconds + SESSION_TTL_SECONDS) {
    return null
  }

  const signature = fromBase64Url(signatureText)
  if (!signature) return null
  // `verify` takes the same time whether or not the signature matches, so
  // timing can't give it away.
  const genuine = await crypto.subtle.verify(
    'HMAC',
    await signingKey(secret),
    signature,
    encoder.encode(`${version}.${expiresAtText}.${nonce}`),
  )
  return genuine ? nonce : null
}

function signingKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
    keys.set(secret, key)
  }
  return key
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}
