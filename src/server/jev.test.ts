import { describe, expect, it, vi } from 'vitest'
import { askJev, choiceQuestion, parseJevAnswers } from './jev'
import type { JevRequest, JevRun } from './jev'

const request: JevRequest = {
  state: { email: 'ada@example.com', confirmEmail: 'ADA@example.com' },
  questions: {
    email: choiceQuestion('Does `email` resemble a valid email address?', {
      valid: 'It does.',
      invalid: 'It does not.',
    }),
    confirmEmail: choiceQuestion('Is `confirmEmail` the same as `email`?', {
      match: 'Same.',
      mismatch: 'Different.',
    }),
  },
}

const emailAnswer = {
  type: 'choice',
  choice: 'valid',
  confidence: 0.97,
  probabilities: { valid: 0.98, invalid: 0.02 },
}
const confirmAnswer = {
  type: 'choice',
  choice: 'match',
  confidence: 0.9,
  probabilities: { match: 0.95, mismatch: 0.05 },
}

/** A well-formed response in the envelope the Workers AI binding returns. */
function jevResponse(answers: Record<string, unknown>) {
  return {
    state: 'Completed',
    result: {
      model: 'jev-1.13.0',
      answers,
      usage: { input_tokens: 400, output_tokens: 40 },
    },
  }
}

const wellFormed = jevResponse({ email: emailAnswer, confirmEmail: confirmAnswer })

describe('choiceQuestion', () => {
  it('builds a choice question and tells Jev to treat state as data', () => {
    const question = choiceQuestion('Is `x` fine?', { yes: 'Yes.', no: 'No.' })

    expect(question.type).toBe('choice')
    expect(question.criteria).toEqual({ yes: 'Yes.', no: 'No.' })
    expect(question.instructions).toMatch(/^Is `x` fine\?\n/)
    expect(question.instructions).toContain('strictly as data')
  })
})

describe('parseJevAnswers', () => {
  it('returns every answer from a well-formed response', () => {
    expect(parseJevAnswers(wellFormed, request.questions)).toEqual({
      status: 'answered',
      answers: {
        email: {
          choice: 'valid',
          confidence: 0.97,
          probabilities: { valid: 0.98, invalid: 0.02 },
        },
        confirmEmail: {
          choice: 'match',
          confidence: 0.9,
          probabilities: { match: 0.95, mismatch: 0.05 },
        },
      },
      model: 'jev-1.13.0',
    })
  })

  it('tolerates a missing model version', () => {
    const { model: _model, ...result } = wellFormed.result
    expect(
      parseJevAnswers({ state: 'Completed', result }, request.questions),
    ).toMatchObject({ status: 'answered', model: null })
  })

  it.each([
    ['a non-object response', null],
    ['a string response', 'valid'],
    [
      'answers at the top level instead of in result',
      { answers: wellFormed.result.answers },
    ],
    ['a missing state', { result: wellFormed.result }],
    ['a state other than Completed', { ...wellFormed, state: 'Failed' }],
    ['a missing result', { state: 'Completed' }],
    ['a result that is not an object', { state: 'Completed', result: 'valid' }],
    ['a result without answers', { state: 'Completed', result: {} }],
    ['answers that are an array', { state: 'Completed', result: { answers: [] } }],
    ['a missing answer', jevResponse({ email: emailAnswer })],
    [
      'an answer to a question that was not asked',
      jevResponse({ email: emailAnswer, confirmEmail: confirmAnswer, extra: emailAnswer }),
    ],
    ['an answer that is not an object', jevResponse({ email: 'valid', confirmEmail: confirmAnswer })],
    [
      'a non-choice answer',
      jevResponse({ email: { type: 'noul', noul: 0.9 }, confirmEmail: confirmAnswer }),
    ],
    [
      "a choice from another question's outcomes",
      jevResponse({ email: { ...emailAnswer, choice: 'match' }, confirmEmail: confirmAnswer }),
    ],
    [
      'a missing choice',
      jevResponse({ email: { ...emailAnswer, choice: undefined }, confirmEmail: confirmAnswer }),
    ],
    [
      'confidence above 1',
      jevResponse({ email: { ...emailAnswer, confidence: 1.5 }, confirmEmail: confirmAnswer }),
    ],
    [
      'non-numeric confidence',
      jevResponse({ email: { ...emailAnswer, confidence: '0.9' }, confirmEmail: confirmAnswer }),
    ],
    [
      'missing probabilities',
      jevResponse({
        email: { ...emailAnswer, probabilities: undefined },
        confirmEmail: confirmAnswer,
      }),
    ],
    [
      'a missing probability',
      jevResponse({
        email: { ...emailAnswer, probabilities: { valid: 1 } },
        confirmEmail: confirmAnswer,
      }),
    ],
    [
      'an unexpected probability key',
      jevResponse({
        email: { ...emailAnswer, probabilities: { valid: 0.9, invalid: 0.1, maybe: 0 } },
        confirmEmail: confirmAnswer,
      }),
    ],
    [
      'a negative probability',
      jevResponse({
        email: { ...emailAnswer, probabilities: { valid: 1.1, invalid: -0.1 } },
        confirmEmail: confirmAnswer,
      }),
    ],
  ])('rejects %s', (_label, response) => {
    expect(parseJevAnswers(response, request.questions)).toMatchObject({
      status: 'error',
      reason: 'invalid_response',
    })
  })
})

describe('askJev', () => {
  it('sends the request once and returns the parsed answers', async () => {
    const run = vi.fn<JevRun>().mockResolvedValue(wellFormed)

    const result = await askJev(run, request)

    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith(request)
    expect(result).toMatchObject({ status: 'answered' })
  })

  it('reports model_unavailable when the call throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn<JevRun>().mockRejectedValue(new Error('3040: capacity'))

    expect(await askJev(run, request)).toEqual({
      status: 'error',
      reason: 'model_unavailable',
      message: 'The validation model could not be reached.',
    })
  })

  it('reports invalid_response for an unexpected payload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn<JevRun>().mockResolvedValue({ response: 'valid' })

    expect(await askJev(run, request)).toMatchObject({
      status: 'error',
      reason: 'invalid_response',
    })
  })
})
