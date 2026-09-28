import { createMiddleware, createServerFn } from '@tanstack/react-start'
import {
  getCookie,
  getRequestHeader,
  getRequestUrl,
  setCookie,
} from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import {
  MIN_SESSION_SECRET_LENGTH,
  SESSION_TTL_SECONDS,
  createSession,
  verifySession,
  verifyTurnstileToken,
} from '#/server/human-session'
import { RATE_LIMITED, TURNSTILE_ACTION, VERIFICATION_REQUIRED } from './human'
import { parseHumanVerificationRequest } from './request'

type Variable = 'TURNSTILE_SITE_KEY' | 'TURNSTILE_SECRET' | 'SESSION_SECRET'

/** Read by name, so this works even if the generated types don't list them. */
function readVariable(name: Variable): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function sessionSecret(): string | undefined {
  const secret = readVariable('SESSION_SECRET')
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    console.error(
      `SESSION_SECRET must be set to at least ${MIN_SESSION_SECRET_LENGTH} characters.`,
    )
    return undefined
  }
  return secret
}

/**
 * On HTTPS the cookie is only sent over secure connections, and the `__Host-`
 * name stops other subdomains setting it. Local development uses plain HTTP,
 * so neither applies there.
 */
function sessionCookie() {
  const secure = getRequestUrl().protocol === 'https:'
  return {
    name: secure ? '__Host-unschema_session' : 'unschema_session',
    options: {
      httpOnly: true,
      secure,
      sameSite: 'strict' as const,
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    },
  }
}

/** The site key is public, so it's safe to send to the browser. */
export const getTurnstileSiteKey = createServerFn({ method: 'GET' }).handler(
  () => readVariable('TURNSTILE_SITE_KEY') ?? '',
)

export const verifyHuman = createServerFn({ method: 'POST' })
  .validator(parseHumanVerificationRequest)
  .handler(async ({ data }) => {
    const turnstileSecret = readVariable('TURNSTILE_SECRET')
    const signingSecret = sessionSecret()
    if (!turnstileSecret || !signingSecret) {
      if (!turnstileSecret) console.error('TURNSTILE_SECRET is not set.')
      return { verified: false as const }
    }

    const verified = await verifyTurnstileToken({
      token: data.token,
      secret: turnstileSecret,
      remoteIp: getRequestHeader('cf-connecting-ip'),
      hostname: getRequestUrl().hostname,
      action: TURNSTILE_ACTION,
    })
    if (!verified) return { verified: false as const }

    const session = await createSession(signingSecret)
    const cookie = sessionCookie()
    setCookie(cookie.name, session.value, cookie.options)
    return { verified: true as const, expiresAt: session.expiresAt }
  })

/**
 * Rejects requests without a valid session before any other code runs, so
 * unverified requests never reach Jev.
 */
export const requireHuman = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const secret = sessionSecret()
    const sessionId =
      secret === undefined
        ? null
        : await verifySession(getCookie(sessionCookie().name), secret)
    if (!sessionId) {
      throw new Error(VERIFICATION_REQUIRED)
    }
    return next({ context: { sessionId } })
  },
)

/**
 * Allows each verified visitor 30 Jev requests a minute (see `ratelimits` in
 * wrangler.jsonc), shared by live checks and submits. The limit is tied to
 * the ID inside the signed cookie, so visitors can't pick their own.
 */
export const limitJevRequests = createMiddleware({ type: 'function' })
  .middleware([requireHuman])
  .server(async ({ next, context }) => {
    const limiter = (env as unknown as { JEV_RATE_LIMITER?: RateLimit }).JEV_RATE_LIMITER
    if (!limiter) {
      console.error('The JEV_RATE_LIMITER binding is missing.')
      throw new Error(RATE_LIMITED)
    }
    const { success } = await limiter.limit({ key: `jev:${context.sessionId}` })
    if (!success) {
      throw new Error(RATE_LIMITED)
    }
    return next()
  })
