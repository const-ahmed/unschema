import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { JEV_MODEL } from '#/server/jev'
import { checkField, todayUtc } from '#/server/rules'
import { parseFieldCheckRequest } from './request'

/**
 * The browser only sends the field name and the values its rule needs. The
 * rule and the AI binding never leave the server.
 */
export const validateField = createServerFn({ method: 'POST' })
  .validator(parseFieldCheckRequest)
  .handler(({ data }) =>
    checkField(
      (request) => env.AI.run(JEV_MODEL, request),
      data.field,
      data.values,
      todayUtc(),
    ),
  )
