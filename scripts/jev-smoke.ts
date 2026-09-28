/** One real, billed Jev call: `pnpm smoke:jev`. */
import { getPlatformProxy } from 'wrangler'
import { runJev } from '../src/server/jev.ts'
import { checkField, todayUtc } from '../src/server/rules.ts'

const { env, dispose } = await getPlatformProxy<Env>()

try {
  const result = await checkField(
    (request) => runJev(env.AI, request),
    'firstName',
    { firstName: 'Ada' },
    todayUtc(),
  )
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.status === 'unavailable' ? 1 : 0
} finally {
  await dispose()
}
