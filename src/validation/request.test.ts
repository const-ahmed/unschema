import { describe, expect, it } from 'vitest'
import {
  MAX_VALUE_LENGTH,
  parseFieldCheckRequest,
  parseProfileSubmission,
} from './request'
import type { FieldCheckRequest, ProfileSubmission } from './request'

// The guards accept untrusted input at runtime; tests pass malformed shapes on purpose.
const asCheck = (input: unknown) => input as FieldCheckRequest
const asSubmission = (input: unknown) => input as ProfileSubmission

describe('parseFieldCheckRequest', () => {
  it('keeps only the values the check reads, trimmed', () => {
    expect(
      parseFieldCheckRequest({
        field: 'confirmEmail',
        values: { confirmEmail: ' a@b.co ', email: 'a@b.co', bio: 'unrelated' },
      }),
    ).toEqual({
      field: 'confirmEmail',
      values: { confirmEmail: 'a@b.co', email: 'a@b.co' },
    })
  })

  it.each([
    ['a non-object', 'hello'],
    ['null', null],
    ['an unknown field', { field: 'password', values: { password: 'x' } }],
    ['an inherited property name', { field: 'toString', values: {} }],
    ['contactPreference, which Jev does not check', { field: 'contactPreference', values: {} }],
    ['missing values', { field: 'email' }],
    ['a missing checked value', { field: 'confirmEmail', values: { email: 'a@b.co' } }],
    ['a non-string value', { field: 'email', values: { email: 42 } }],
    ['an empty value', { field: 'email', values: { email: '   ' } }],
    ['an overlong value', { field: 'bio', values: { bio: 'a'.repeat(MAX_VALUE_LENGTH + 1) } }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseFieldCheckRequest(asCheck(input))).toThrow(TypeError)
  })
})

describe('parseProfileSubmission', () => {
  const submission = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1990-12-10',
    contactPreference: 'email',
    email: 'ada@example.com',
    confirmEmail: 'ada@example.com',
    phone: '',
    bio: 'I write software.',
  }

  it('accepts a submission and drops a hidden phone number', () => {
    expect(parseProfileSubmission(asSubmission({ ...submission, phone: '0770' }))).toEqual(
      submission,
    )
  })

  it('accepts an empty or missing last name, which is optional', () => {
    expect(parseProfileSubmission(asSubmission({ ...submission, lastName: '  ' })).lastName).toBe('')
    expect(
      parseProfileSubmission(asSubmission({ ...submission, lastName: undefined })).lastName,
    ).toBe('')
  })

  it('still guards a provided last name', () => {
    expect(() =>
      parseProfileSubmission(asSubmission({ ...submission, lastName: 42 })),
    ).toThrow(TypeError)
  })

  it('requires the phone number when phone is the contact method', () => {
    const phone = { ...submission, contactPreference: 'phone' }
    expect(() => parseProfileSubmission(asSubmission(phone))).toThrow(TypeError)
    expect(
      parseProfileSubmission(asSubmission({ ...phone, phone: '07700 900123' })).phone,
    ).toBe('07700 900123')
  })

  it.each([
    ['no contact preference', { ...submission, contactPreference: '' }],
    ['an unknown contact preference', { ...submission, contactPreference: 'post' }],
    ['an empty visible field', { ...submission, bio: ' ' }],
    ['a missing required field', { ...submission, firstName: undefined }],
    ['an overlong value', { ...submission, bio: 'a'.repeat(MAX_VALUE_LENGTH + 1) }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseProfileSubmission(asSubmission(input))).toThrow(TypeError)
  })
})
