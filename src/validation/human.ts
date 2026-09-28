export const VERIFICATION_REQUIRED = 'VERIFICATION_REQUIRED'

export const RATE_LIMITED = 'RATE_LIMITED'

export const TURNSTILE_ACTION = 'unschema-session'

export function isVerificationRequired(error: unknown): boolean {
  return error instanceof Error && error.message === VERIFICATION_REQUIRED
}

export function isRateLimited(error: unknown): boolean {
  return error instanceof Error && error.message === RATE_LIMITED
}
