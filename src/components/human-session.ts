import { TURNSTILE_ACTION, isVerificationRequired } from '#/validation/human'

type Turnstile = {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined
  reset(widgetId: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const EXPIRY_MARGIN_MS = 60_000

let scriptPromise: Promise<Turnstile> | undefined

function loadTurnstile(): Promise<Turnstile> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error('Turnstile failed to load.'))
    script.onerror = () => {
      scriptPromise = undefined
      reject(new Error('Turnstile failed to load.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

type Waiter = { resolve: () => void; reject: (error: Error) => void }

/**
 * Server calls go through `run`. It waits until the visitor is verified, and
 * if the server says the session has expired, verifies again and retries once.
 */
export class HumanSession {
  #verify: (token: string) => Promise<{ verified: boolean; expiresAt?: number }>
  #turnstile: Turnstile | undefined
  #widgetId: string | undefined
  #expiresAt = 0
  // True while a token or its check is on the way, so anyone waiting will get an answer.
  #busy = true
  #unavailable = false
  #waiters: Waiter[] = []
  // Stops a slow mount from finishing after the widget was removed.
  #generation = 0

  constructor(
    verify: (token: string) => Promise<{ verified: boolean; expiresAt?: number }>,
  ) {
    this.#verify = verify
  }

  async mount(container: HTMLElement, siteKey: string): Promise<void> {
    const generation = ++this.#generation
    if (!siteKey) {
      this.#fail(new Error('Turnstile is not configured.'), true)
      return
    }
    try {
      this.#turnstile = await loadTurnstile()
    } catch (error) {
      this.#fail(toError(error), true)
      return
    }
    if (generation !== this.#generation) return

    this.#busy = true
    this.#unavailable = false
    this.#widgetId = this.#turnstile.render(container, {
      sitekey: siteKey,
      action: TURNSTILE_ACTION,
      appearance: 'interaction-only',
      theme: 'dark',
      size: 'flexible',
      callback: (token: string) => void this.#exchange(token),
      'error-callback': () => this.#fail(new Error('Turnstile could not verify this browser.')),
      'timeout-callback': () => this.#fail(new Error('Turnstile timed out.')),
    })
  }

  unmount(): void {
    this.#generation++
    if (this.#turnstile && this.#widgetId) this.#turnstile.remove(this.#widgetId)
    this.#widgetId = undefined
  }

  async run<T>(request: () => Promise<T>): Promise<T> {
    await this.#ensure()
    try {
      return await request()
    } catch (error) {
      if (!isVerificationRequired(error)) throw error
      this.#expiresAt = 0
      await this.#ensure()
      return request()
    }
  }

  #ensure(): Promise<void> {
    if (Date.now() < this.#expiresAt - EXPIRY_MARGIN_MS) return Promise.resolve()
    if (this.#unavailable) return Promise.reject(new Error('Verification is unavailable.'))

    const session = new Promise<void>((resolve, reject) =>
      this.#waiters.push({ resolve, reject }),
    )
    // Ask for a new token unless one is already on its way.
    if (!this.#busy && this.#turnstile && this.#widgetId) {
      this.#busy = true
      this.#turnstile.reset(this.#widgetId)
    }
    return session
  }

  async #exchange(token: string): Promise<void> {
    this.#busy = true
    try {
      const result = await this.#verify(token)
      if (!result.verified || !result.expiresAt) throw new Error('Verification failed.')
      this.#expiresAt = result.expiresAt
      this.#busy = false
      this.#settle()
    } catch (error) {
      this.#fail(toError(error))
    }
  }

  #fail(error: Error, permanent = false): void {
    this.#busy = false
    if (permanent) this.#unavailable = true
    this.#settle(error)
  }

  #settle(error?: Error): void {
    for (const waiter of this.#waiters.splice(0)) {
      if (error) waiter.reject(error)
      else waiter.resolve()
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
