import { describe, expect, it } from 'vitest'
import { LiveCheckTracker, sameValues } from './live-checks'
import type { CheckValues, CheckedField } from './profile'

const email: CheckValues = { email: 'ada@example.com' }
const bio: CheckValues = { bio: 'I write software.', email: 'ada@example.com' }
const neverAborted = () => new AbortController().signal

describe('LiveCheckTracker', () => {
  it('applies a result when nothing has changed', () => {
    const tracker = new LiveCheckTracker()
    const check = tracker.start('email', email, neverAborted())

    expect(tracker.canApply(check, { ...email })).toBe(true)
  })

  describe('when submission begins', () => {
    it('cancels every outstanding live request', () => {
      const tracker = new LiveCheckTracker()
      const first = tracker.start('email', email, neverAborted())
      const second = tracker.start('bio', bio, neverAborted())

      tracker.beginSubmission(['email', 'bio'])

      expect(first.signal.aborted).toBe(true)
      expect(second.signal.aborted).toBe(true)
    })

    it('ignores a response that arrives despite cancellation', () => {
      const tracker = new LiveCheckTracker()
      const check = tracker.start('email', email, neverAborted())

      tracker.beginSubmission(['email'])

      // The values are unchanged, so only the submission epoch rejects it.
      expect(tracker.canApply(check, { ...email })).toBe(false)
    })

    it('ignores the response after a failed submission', () => {
      const tracker = new LiveCheckTracker()
      const check = tracker.start('email', email, neverAborted())

      tracker.beginSubmission(['email'])
      // The final check failed: no reset, and the user has not edited anything.

      expect(tracker.canApply(check, { ...email })).toBe(false)
    })

    it('ignores the response after a successful submission resets the form', () => {
      const tracker = new LiveCheckTracker()
      const check = tracker.start('email', email, neverAborted())

      tracker.beginSubmission(['email'])
      tracker.reset()

      expect(tracker.canApply(check, { ...email })).toBe(false)
    })

    it('ignores an old response even if the user has already edited the field', () => {
      const tracker = new LiveCheckTracker()
      const check = tracker.start('email', email, neverAborted())

      tracker.beginSubmission(['email'])
      tracker.resume(['email'])

      expect(tracker.canApply(check, { ...email })).toBe(false)
    })

    it('does not cancel checks that have already finished', () => {
      const tracker = new LiveCheckTracker()
      const check = tracker.start('email', email, neverAborted())
      tracker.finish(check)

      tracker.beginSubmission(['email'])

      expect(check.signal.aborted).toBe(false)
    })
  })

  describe('final verdicts', () => {
    it('stand for the submitted fields, so no live check is needed', () => {
      const tracker = new LiveCheckTracker()

      tracker.beginSubmission(['email', 'bio'])

      expect(tracker.isSettled('email')).toBe(true)
      expect(tracker.isSettled('bio')).toBe(true)
      // Not submitted, for example a hidden phone number.
      expect(tracker.isSettled('phone')).toBe(false)
    })

    it('stop standing once the field is edited, and live checks resume', () => {
      const tracker = new LiveCheckTracker()
      tracker.beginSubmission(['email', 'bio'])

      tracker.resume(['email', 'bio'])

      expect(tracker.isSettled('email')).toBe(false)
      const check = tracker.start('email', { email: 'ada@example.org' }, neverAborted())
      expect(tracker.canApply(check, { email: 'ada@example.org' })).toBe(true)
    })

    it('stop standing only for the fields that were resumed', () => {
      const tracker = new LiveCheckTracker()
      tracker.beginSubmission(['firstName', 'email', 'bio'])

      tracker.resume(['email', 'bio'])

      expect(tracker.isSettled('firstName')).toBe(true)
    })

    it('are cleared when the form is reset', () => {
      const tracker = new LiveCheckTracker()
      tracker.beginSubmission(['email'])

      tracker.reset()

      expect(tracker.isSettled('email')).toBe(false)
    })

    it('are replaced by the next submission', () => {
      const tracker = new LiveCheckTracker()
      tracker.beginSubmission(['email', 'phone'])

      tracker.beginSubmission(['email'])

      expect(tracker.isSettled('phone')).toBe(false)
    })
  })

  describe('value changes', () => {
    it("rejects a result once the field's value has changed", () => {
      const tracker = new LiveCheckTracker()
      const check = tracker.start('email', email, neverAborted())

      expect(tracker.canApply(check, { email: 'ada@example.org' })).toBe(false)
    })

    it('rejects a result once a value the rule reads has changed', () => {
      const tracker = new LiveCheckTracker()
      const check = tracker.start('bio', bio, neverAborted())

      expect(tracker.canApply(check, { ...bio, email: 'grace@example.com' })).toBe(false)
    })

    it('rejects a result once a value the rule reads has been cleared or hidden', () => {
      const tracker = new LiveCheckTracker()
      const check = tracker.start('bio', bio, neverAborted())

      expect(tracker.canApply(check, { bio: bio.bio })).toBe(false)
    })
  })

  it("cancels the request when TanStack Form aborts the check", () => {
    const tracker = new LiveCheckTracker()
    const tanstack = new AbortController()
    const check = tracker.start('email', email, tanstack.signal)

    tanstack.abort()

    expect(check.signal.aborted).toBe(true)
  })

  it('starts already cancelled if TanStack Form has already aborted', () => {
    const tracker = new LiveCheckTracker()
    const tanstack = new AbortController()
    tanstack.abort()

    expect(tracker.start('email', email, tanstack.signal).signal.aborted).toBe(true)
  })

  it('handles a full race: live check, submission, late response, edit, new check', () => {
    const tracker = new LiveCheckTracker()
    const fields: CheckedField[] = ['email', 'bio']

    const before = tracker.start('email', email, neverAborted())
    tracker.beginSubmission(fields)
    // The debounced check that fires after submission is not sent at all.
    expect(tracker.isSettled('email')).toBe(true)
    // The earlier response arrives anyway and is ignored.
    tracker.finish(before)
    expect(tracker.canApply(before, email)).toBe(false)

    // The user edits the email: live validation resumes for it and its dependents.
    tracker.resume(['email', 'bio'])
    const after = tracker.start('email', { email: 'ada@example.org' }, neverAborted())
    expect(tracker.canApply(after, { email: 'ada@example.org' })).toBe(true)
  })
})

describe('sameValues', () => {
  it('compares the values each check reads', () => {
    expect(sameValues({ email: 'a' }, { email: 'a' })).toBe(true)
    expect(sameValues({ email: 'a' }, { email: 'b' })).toBe(false)
    expect(sameValues({ email: 'a' }, { email: 'a', bio: 'b' })).toBe(false)
    expect(sameValues({}, {})).toBe(true)
  })
})
