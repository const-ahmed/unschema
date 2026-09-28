/**
 * One live Jev call, to confirm Cloudflare access and the response shape.
 *
 *   pnpm smoke:jev
 *
 * This makes one real, billed Workers AI request. It requires `wrangler login`
 * (or CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID). It uses the remote `AI`
 * binding from wrangler.jsonc and the same rule code as the app.
 * Unit tests never call this.
 */
import { getPlatformProxy } from 'wrangler'
import { JEV_MODEL } from '../src/server/jev.ts'
import { checkField, todayUtc } from '../src/server/rules.ts'

const { env, dispose } = await getPlatformProxy<Env>()

try {
  const result = await checkField(
    (request) => env.AI.run(JEV_MODEL, request),
    'firstName',
    { firstName: 'Ada' },
    todayUtc(),
  )
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.status === 'unavailable' ? 1 : 0
} finally {
  await dispose()
}
