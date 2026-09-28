import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { runJev } from '#/server/jev'
import { checkProfile, todayUtc } from '#/server/rules'
import { parseProfileSubmission } from './request'
import { limitJevRequests } from './verify-human'

/** The final check: every field again, in one Jev call. Nothing is saved. */
export const submitProfile = createServerFn({ method: 'POST' })
  .middleware([limitJevRequests])
  .validator(parseProfileSubmission)
  .handler(async ({ data }) => {
    const results = await checkProfile(
      (request) => runJev(env.AI, request),
      data,
      todayUtc(),
    )
    return {
      valid: Object.values(results).every((result) => result.status === 'valid'),
      results,
    }
  })
