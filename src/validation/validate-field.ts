import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { runJev } from '#/server/jev'
import { checkField, todayUtc } from '#/server/rules'
import { parseFieldCheckRequest } from './request'
import { limitJevRequests } from './verify-human'

export const validateField = createServerFn({ method: 'POST' })
  .middleware([limitJevRequests])
  .validator(parseFieldCheckRequest)
  .handler(({ data }) =>
    checkField(
      (request) => runJev(env.AI, request),
      data.field,
      data.values,
      todayUtc(),
    ),
  )
