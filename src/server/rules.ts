/** Jev's chosen outcome is the decision; there are no probability cut-offs. */
import '@tanstack/react-start/server-only'
import { askJev, choiceQuestion } from './jev.ts'
import type { JevRequest, JevRun } from './jev.ts'
import { checkValues, fieldsToCheck } from '../validation/profile.ts'
import type {
  CheckResult,
  CheckValues,
  CheckedField,
  ProfileValues,
} from '../validation/profile.ts'

type Outcome = { when: string } & (
  | { valid: true; feedback?: string }
  | { valid: false; message: string }
)

type Rule = {
  instructions: string
  /** Adds today's UTC date (YYYY-MM-DD) to `state` as `today`. */
  usesToday?: true
  outcomes: Record<string, Outcome>
}

const valid = (when: string, feedback?: string): Outcome => ({
  when,
  valid: true,
  feedback,
})
const invalid = (when: string, message: string): Outcome => ({
  when,
  valid: false,
  message,
})

export const RULES: Record<CheckedField, Rule> = {
  firstName: {
    instructions:
      "Is `firstName` a plausible first name for a person? It may be the person's only name.",
    outcomes: {
      plausible: valid(
        "It could be a person's first name. Unfamiliar names, any script, accents, hyphens, apostrophes and long names are all plausible. Whether it is this person's real name does not matter.",
      ),
      implausible: invalid(
        "It is clearly not a person's name, such as keyboard mashing, numbers, an email address or a sentence.",
        "Doesn't look like a name.",
      ),
    },
  },
  lastName: {
    instructions: 'Is `lastName` a plausible last name for a person?',
    outcomes: {
      plausible: valid(
        "It could be a person's last name. Unfamiliar names, any script, accents, hyphens, apostrophes, name particles, multiple family names and long names are all plausible. Whether it is this person's real name does not matter.",
      ),
      implausible: invalid(
        "It is clearly not a person's name, such as keyboard mashing, numbers, an email address or a sentence.",
        "Doesn't look like a name.",
      ),
    },
  },
  dateOfBirth: {
    instructions:
      'Given the date of birth `dateOfBirth` and today\'s date `today`, is the person between 18 and 120 years old, inclusive?',
    usesToday: true,
    outcomes: {
      in_range: valid('The person is between 18 and 120 years old, inclusive.'),
      out_of_range: invalid(
        'The person is younger than 18 or older than 120.',
        'Must be aged 18 to 120.',
      ),
    },
  },
  email: {
    instructions: 'Does `email` resemble a valid email address?',
    outcomes: {
      valid: valid('It resembles a valid email address.'),
      invalid: invalid(
        'It does not resemble a valid email address.',
        'Enter a valid email.',
      ),
    },
  },
  confirmEmail: {
    instructions:
      'Is `confirmEmail` the same email address as `email`, ignoring differences in letter case?',
    outcomes: {
      match: valid('They are the same, ignoring letter case.'),
      mismatch: invalid(
        'They are different.',
        "Emails don't match.",
      ),
    },
  },
  phone: {
    instructions:
      'Is `phone` a plausible phone number? Local and international formats are both acceptable, and a country code is optional.',
    outcomes: {
      plausible: valid('It is a plausible phone number.'),
      implausible: invalid(
        'It is not a plausible phone number.',
        'Enter a valid phone number.',
      ),
    },
  },
  bio: {
    instructions:
      'Classify `bio`, the answer to "Write a short personal introduction that tells us something about yourself." Any other values in `state` are details already entered in other form fields; repeating them does not count as a new personal detail. Do not judge truthfulness, personality or writing quality, and accept concise introductions that are meaningful.',
    outcomes: {
      meaningless: invalid(
        'Gibberish, placeholder text, or content unrelated to a personal introduction.',
        'Please write a meaningful introduction.',
      ),
      too_brief: invalid(
        'An introduction containing little beyond a name or greeting.',
        'Add a little more detail.',
      ),
      too_vague: invalid(
        'Personal information that is too vague.',
        'Be more specific.',
      ),
      good: valid(
        'At least one meaningful personal detail not already provided in another form field.',
        'Good',
      ),
      great: valid(
        'Several specific personal details not already provided in other form fields.',
        'Great',
      ),
    },
  },
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function buildRulesRequest(
  fields: readonly CheckedField[],
  values: CheckValues,
  today: string,
): JevRequest {
  const state: Record<string, string> = { ...values }
  if (fields.some((field) => RULES[field].usesToday)) {
    state.today = today
  }

  const questions: JevRequest['questions'] = {}
  for (const field of fields) {
    const { instructions, outcomes } = RULES[field]
    const criteria = Object.fromEntries(
      Object.entries(outcomes).map(([key, outcome]) => [key, outcome.when]),
    )
    questions[field] = choiceQuestion(instructions, criteria)
  }
  return { state, questions }
}

/** If Jev fails or answers oddly, every field is marked unavailable. */
export async function checkFields(
  run: JevRun,
  fields: readonly CheckedField[],
  values: CheckValues,
  today: string,
): Promise<Partial<Record<CheckedField, CheckResult>>> {
  const response = await askJev(run, buildRulesRequest(fields, values, today))

  const results: Partial<Record<CheckedField, CheckResult>> = {}
  for (const field of fields) {
    if (response.status === 'error') {
      results[field] = { status: 'unavailable' }
      continue
    }
    const outcome = RULES[field].outcomes[response.answers[field].choice]
    results[field] = outcome.valid
      ? { status: 'valid', feedback: outcome.feedback }
      : { status: 'invalid', message: outcome.message }
  }
  return results
}

export async function checkField(
  run: JevRun,
  field: CheckedField,
  values: CheckValues,
  today: string,
): Promise<CheckResult> {
  const results = await checkFields(run, [field], values, today)
  return results[field]!
}

export async function checkProfile(
  run: JevRun,
  values: ProfileValues,
  today: string,
): Promise<Partial<Record<CheckedField, CheckResult>>> {
  const fields = fieldsToCheck(values)
  const state: CheckValues = {}
  for (const field of fields) {
    Object.assign(state, checkValues(field, values))
  }
  return checkFields(run, fields, state, today)
}
