import { useForm } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import {
  CHECK_INPUTS,
  EMPTY_PROFILE,
  checkValues,
  fieldsToCheck,
  hasEmptyRequiredField,
  isBlank,
  isCheckedField,
  isOptional,
  isVisible,
} from '#/validation/profile'
import type { CheckResult, CheckedField, ProfileValues } from '#/validation/profile'
import { LiveCheckTracker } from '#/validation/live-checks'
import { submitProfile } from '#/validation/submit-profile'
import { validateField } from '#/validation/validate-field'
import { verifyHuman } from '#/validation/verify-human'
import { RATE_LIMITED, isRateLimited } from '#/validation/human'
import { liveChecksThenFinalCheck } from '#/validation/validation-logic'
import {
  FeedbackText,
  FormField,
  fieldFeedback,
  inputClassName,
} from './FormField'
import type { FieldFeedback } from './FormField'
import { HumanSession } from './human-session'
import { Toast } from './Toast'

const CHECK_DEBOUNCE_MS = 600

const REQUIRED_MESSAGE = 'Required.'
const LIVE_UNAVAILABLE = "Couldn't check right now."
const FINAL_UNAVAILABLE = "Couldn't check. Try again."
const LIVE_RATE_LIMITED = 'Too many checks for now.'
const SUBMIT_RATE_LIMITED = 'Too many requests. Please wait a minute and try again.'
const SUCCESS_MESSAGE = 'Everything checks out. Your details passed validation.'

/** Kept apart from errors: positive feedback, or a check that couldn't run. */
type Notices = Partial<Record<CheckedField, FieldFeedback>>

type SubmitResponse = Awaited<ReturnType<typeof submitProfile>>

const required = ({ value }: { value: string }) =>
  isBlank(value) ? REQUIRED_MESSAGE : undefined

/**
 * Contact preference decides whether Phone shows, so anything that reads Phone
 * depends on it too.
 */
function dependenciesOf(field: CheckedField): (keyof ProfileValues)[] {
  const inputs: (keyof ProfileValues)[] = CHECK_INPUTS[field].filter(
    (input) => input !== field,
  )
  return inputs.includes('phone') ? [...inputs, 'contactPreference'] : inputs
}

function dependentsOf(name: keyof ProfileValues): CheckedField[] {
  return (Object.keys(CHECK_INPUTS) as CheckedField[]).filter((field) =>
    dependenciesOf(field).includes(name),
  )
}

function liveNotice(result: CheckResult): FieldFeedback | undefined {
  if (result.status === 'unavailable') {
    return { tone: 'neutral', text: LIVE_UNAVAILABLE }
  }
  if (result.status === 'valid' && result.feedback) {
    return { tone: 'positive', text: result.feedback }
  }
  return undefined
}

export function ProfileForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [notices, setNotices] = useState<Notices>({})
  const [toast, setToast] = useState<string | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const [liveChecks] = useState(() => new LiveCheckTracker())
  const [human] = useState(
    () => new HumanSession((token) => verifyHuman({ data: { token } })),
  )
  const turnstileRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (turnstileRef.current) void human.mount(turnstileRef.current, turnstileSiteKey)
    return () => human.unmount()
  }, [human, turnstileSiteKey])
  // Jev requests running per field. Tracked here because, in our testing with
  // TanStack Form 1.33.5, `isValidating` was only reliable for a field's first
  // check.
  const [checking, setChecking] = useState<Partial<Record<CheckedField, number>>>(
    {},
  )
  const isChecking = (field: CheckedField) => (checking[field] ?? 0) > 0
  const trackChecking = (field: CheckedField, change: 1 | -1) =>
    setChecking((previous) => ({
      ...previous,
      [field]: (previous[field] ?? 0) + change,
    }))

  const setNotice = (field: CheckedField, notice?: FieldFeedback) =>
    setNotices((previous) => {
      const next = { ...previous }
      if (notice) next[field] = notice
      else delete next[field]
      return next
    })

  const form = useForm({
    defaultValues: EMPTY_PROFILE,
    validationLogic: liveChecksThenFinalCheck,
    // Let Submit always run, so empty-field messages show even while other
    // fields have errors or checks running.
    canSubmitWhenInvalid: true,
    listeners: {
      // Not `onChangeListenTo`: in our testing with @tanstack/form-core 1.33.5,
      // it could leave the field that triggered a recheck stuck on
      // `isValidating`. Editing also ends the final check's hold, so live
      // checks start again.
      onChange: ({ fieldApi, formApi }) => {
        const dependents = dependentsOf(fieldApi.name)
        liveChecks.resume(
          isCheckedField(fieldApi.name) ? [fieldApi.name, ...dependents] : dependents,
        )
        for (const field of dependents) {
          void formApi.validateField(field, 'change')
        }
      },
    },
    validators: {
      onSubmitAsync: async ({ value, signal }) => {
        const fields = fieldsToCheck(value)
        let rateLimited = false
        const response = await human
          .run(() =>
            submitProfile({
              data: {
                ...value,
                // Hidden fields are never sent.
                phone: isVisible('phone', value.contactPreference) ? value.phone : '',
              },
              signal,
            }),
          )
          .catch((error): SubmitResponse => {
            rateLimited = isRateLimited(error)
            return { valid: false, results: {} }
          })

        // Not a validation failure: nothing was checked, so no field errors are
        // shown, and live checks resume until the visitor submits again.
        if (rateLimited) {
          liveChecks.reset()
          setToast(SUBMIT_RATE_LIMITED)
          return { form: RATE_LIMITED, fields: {} }
        }

        const errors: Partial<Record<CheckedField, string>> = {}
        const nextNotices: Notices = {}
        for (const field of fields) {
          const result: CheckResult = response.results[field] ?? {
            status: 'unavailable',
          }
          if (result.status === 'invalid') {
            errors[field] = result.message
          } else if (result.status === 'unavailable') {
            errors[field] = FINAL_UNAVAILABLE
          } else if (result.feedback) {
            nextNotices[field] = { tone: 'positive', text: result.feedback }
          }
        }
        setNotices(nextNotices)
        return response.valid ? undefined : { fields: errors }
      },
    },
    onSubmit: ({ formApi }) => {
      liveChecks.reset()
      formApi.reset()
      setNotices({})
      setToast(SUCCESS_MESSAGE)
    },
  })

  const liveCheck =
    (field: CheckedField) =>
    async ({ fieldApi, signal }: { fieldApi: AnyFieldApi; signal: AbortSignal }) => {
      // Returning the current error leaves the field as it is.
      const ignore = () => fieldApi.state.meta.errorMap.onChange
      const values = checkValues(field, form.state.values)
      if (values[field] === undefined) {
        setNotice(field)
        return undefined
      }
      // The final result stands until this field, or one it reads, is edited.
      if (liveChecks.isSettled(field)) {
        return ignore()
      }

      const check = liveChecks.start(field, values, signal)
      trackChecking(field, 1)
      let rateLimited = false
      const result = await human
        .run(() => validateField({ data: { field, values }, signal: check.signal }))
        .catch((error): CheckResult => {
          rateLimited = isRateLimited(error)
          return { status: 'unavailable' }
        })
        .finally(() => {
          trackChecking(field, -1)
          liveChecks.finish(check)
        })
      if (!liveChecks.canApply(check, checkValues(field, form.state.values))) {
        return ignore()
      }
      // This isn't a result: show a notice, and check again on the next edit or submit.
      if (rateLimited) {
        setNotice(field, { tone: 'neutral', text: LIVE_RATE_LIMITED })
        return undefined
      }

      setNotice(field, liveNotice(result))
      return result.status === 'invalid' ? result.message : undefined
    }

  const validatorsFor = (field: CheckedField) => ({
    onChangeAsyncDebounceMs: CHECK_DEBOUNCE_MS,
    onChangeAsync: liveCheck(field),
    onSubmit: isOptional(field) ? undefined : required,
  })

  /**
   * Jev can be wrong, so a live rejection shouldn't block submitting. Once
   * every required field is filled, running live checks are cancelled, live
   * errors are cleared, and the final check always runs.
   */
  const submit = () => {
    if (form.state.isSubmitting) return
    const { values } = form.state
    if (!hasEmptyRequiredField(values)) {
      const fields = fieldsToCheck(values)
      liveChecks.beginSubmission(fields)
      for (const field of fields) {
        form.setFieldMeta(field, (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onChange: undefined },
        }))
      }
    }
    void form.handleSubmit()
  }

  const textField = (
    name: CheckedField,
    label: string,
    input: InputHTMLAttributes<HTMLInputElement>,
    className?: string,
  ) => (
    <form.Field name={name} validators={validatorsFor(name)}>
      {(field) => (
        <FormField
          id={field.name}
          label={label}
          className={className}
          feedback={fieldFeedback(field, notices[name], isChecking(name))}
        >
          {(aria) => <TextInput field={field} {...input} {...aria} />}
        </FormField>
      )}
    </form.Field>
  )

  return (
    <>
      <form
        noValidate
        aria-labelledby="profile-title"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="min-h-0 w-full max-w-xl overflow-y-auto rounded-2xl bg-neutral-900/70 p-4 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur-xl short:p-3 tall:p-8 low:max-w-3xl"
      >
        <h1
          id="profile-title"
          className="mb-4 font-display text-2xl font-normal tracking-tight text-white short:mb-1 short:text-lg tall:mb-6 tall:text-3xl low:mb-1 low:text-base"
        >
          unschema
        </h1>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 short:gap-y-1 tall:gap-y-3 sm:gap-x-4 low:grid-cols-4">
          {textField('firstName', 'First name', { autoComplete: 'given-name' })}
          {textField('lastName', 'Last name (optional)', {
            autoComplete: 'family-name',
            'aria-required': false,
          })}
          {textField('dateOfBirth', 'Date of birth', {
            type: 'date',
            autoComplete: 'bday',
            className: 'appearance-none [&::-webkit-date-and-time-value]:text-left',
          })}

          <form.Field name="contactPreference">
            {(field) => {
              const feedback = fieldFeedback(field)
              return (
                <fieldset aria-describedby={`${field.name}-feedback`} className="min-w-0">
                  <legend className="mb-1 text-xs text-neutral-400 sm:text-sm">
                    Contact preference
                  </legend>
                  <div className="grid h-10 grid-cols-2 gap-1 rounded-lg bg-white/5 p-1 ring-1 ring-white/10 short:h-9 tall:h-11 has-[[aria-invalid=true]]:ring-rose-400/70">
                    {(['email', 'phone'] as const).map((option) => (
                      <label
                        key={option}
                        className="flex cursor-pointer items-center justify-center rounded-md text-sm text-neutral-400 ring-inset transition hover:text-white has-checked:text-white has-checked:ring-1 has-checked:ring-zinc-300 has-focus-visible:outline-2 has-focus-visible:outline-zinc-400"
                      >
                        <input
                          type="radio"
                          name={field.name}
                          value={option}
                          checked={field.state.value === option}
                          onChange={() => field.handleChange(option)}
                          onBlur={field.handleBlur}
                          aria-invalid={feedback?.tone === 'error'}
                          className="sr-only"
                        />
                        {option === 'email' ? 'Email' : 'Phone'}
                      </label>
                    ))}
                  </div>
                  <FeedbackText id={`${field.name}-feedback`} feedback={feedback} />
                </fieldset>
              )
            }}
          </form.Field>

          {textField('email', 'Email', { type: 'email', autoComplete: 'email' })}
          {textField('confirmEmail', 'Confirm email', {
            type: 'email',
            autoComplete: 'email',
          })}

          <form.Subscribe selector={(state) => state.values.contactPreference}>
            {(contactPreference) =>
              isVisible('phone', contactPreference) &&
              textField('phone', 'Phone', { type: 'tel', autoComplete: 'tel' }, 'col-span-2')
            }
          </form.Subscribe>

          <form.Field name="bio" validators={validatorsFor('bio')}>
            {(field) => (
              <FormField
                id={field.name}
                label="Write a short personal introduction that tells us something about yourself."
                className="col-span-2 low:col-span-4"
                feedback={fieldFeedback(field, notices.bio, isChecking('bio'))}
              >
                {(aria) => (
                  <textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-required
                    className={`${inputClassName} h-20 resize-none py-2 short:h-13 tall:h-28 low:h-10`}
                    {...aria}
                  />
                )}
              </FormField>
            )}
          </form.Field>
        </div>

        <div ref={turnstileRef} className="flex justify-center" />

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-4 h-11 w-full rounded-xl bg-zinc-100 font-medium text-zinc-900 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-wait disabled:opacity-70 short:mt-1 short:h-10 tall:mt-6 tall:h-12 low:mt-1 low:h-9"
            >
              {isSubmitting ? 'Checking…' : 'Submit'}
            </button>
          )}
        </form.Subscribe>
      </form>

      <Toast message={toast} onDismiss={dismissToast} />
    </>
  )
}

function TextInput({
  field,
  className = '',
  ...props
}: { field: AnyFieldApi } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      id={field.name}
      name={field.name}
      value={field.state.value}
      onChange={(event) => field.handleChange(event.target.value)}
      onBlur={field.handleBlur}
      aria-required
      className={`${inputClassName} h-10 short:h-9 tall:h-11 ${className}`}
      {...props}
    />
  )
}
