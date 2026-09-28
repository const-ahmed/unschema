import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { JEV_MODEL } from '#/server/jev'
import { checkProfile, todayUtc } from '#/server/rules'
import { parseProfileSubmission } from './request'

/**
 * Checks every field again in one Jev call, ignoring the browser's results.
 * Nothing is saved.
 */
export const submitProfile = createServerFn({ method: 'POST' })
  .validator(parseProfileSubmission)
  .handler(async ({ data }) => {
    const results = await checkProfile(
      (request) => env.AI.run(JEV_MODEL, request),
      data,
      todayUtc(),
    )
    return {
      valid: Object.values(results).every((result) => result.status === 'valid'),
      results,
    }
  })
