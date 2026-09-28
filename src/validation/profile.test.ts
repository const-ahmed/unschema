import { describe, expect, it } from 'vitest'
import { EMPTY_PROFILE, fieldsToCheck, hasEmptyRequiredField } from './profile'
import type { ProfileValues } from './profile'

const complete: ProfileValues = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-12-10',
  contactPreference: 'email',
  email: 'ada@example.com',
  confirmEmail: 'ada@example.com',
  phone: '',
  bio: 'I write software.',
}

describe('hasEmptyRequiredField', () => {
  it('is false when every visible field is filled', () => {
    expect(hasEmptyRequiredField(complete)).toBe(false)
  })

  it('is true for an empty form', () => {
    expect(hasEmptyRequiredField(EMPTY_PROFILE)).toBe(true)
  })

  it('treats whitespace as empty', () => {
    expect(hasEmptyRequiredField({ ...complete, bio: '   ' })).toBe(true)
  })

  it('does not require the last name, which is optional', () => {
    expect(hasEmptyRequiredField({ ...complete, lastName: '' })).toBe(false)
  })

  it('requires the first name', () => {
    expect(hasEmptyRequiredField({ ...complete, firstName: '' })).toBe(true)
  })

  it('ignores the phone number while it is hidden', () => {
    expect(hasEmptyRequiredField({ ...complete, contactPreference: 'email' })).toBe(false)
  })

  it('requires the phone number when phone is the contact method', () => {
    const phone = { ...complete, contactPreference: 'phone' } as const
    expect(hasEmptyRequiredField(phone)).toBe(true)
    expect(hasEmptyRequiredField({ ...phone, phone: '07700 900123' })).toBe(false)
  })
})

describe('fieldsToCheck', () => {
  it('checks every visible field', () => {
    expect(fieldsToCheck(complete)).toEqual([
      'firstName',
      'lastName',
      'dateOfBirth',
      'email',
      'confirmEmail',
      'bio',
    ])
  })

  it('skips an empty last name', () => {
    expect(fieldsToCheck({ ...complete, lastName: ' ' })).not.toContain('lastName')
  })

  it('includes the phone number only when phone is the contact method', () => {
    expect(fieldsToCheck(complete)).not.toContain('phone')
    expect(fieldsToCheck({ ...complete, contactPreference: 'phone' })).toContain('phone')
  })
})
