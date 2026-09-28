import type { AnyFieldApi } from '@tanstack/react-form'
import type { ReactNode } from 'react'

export type FieldFeedback = {
  tone: 'error' | 'positive' | 'neutral' | 'pending'
  text: string
}

export function fieldFeedback(
  field: AnyFieldApi,
  notice?: FieldFeedback,
  checking = false,
): FieldFeedback | undefined {
  if (checking) {
    return { tone: 'pending', text: 'Checking…' }
  }
  const error = field.state.meta.errors.find(
    (item): item is string => typeof item === 'string',
  )
  if (error) {
    return { tone: 'error', text: error }
  }
  return notice
}

type ControlProps = {
  'aria-describedby': string
  'aria-invalid': boolean
}

const TONE_CLASSES: Record<FieldFeedback['tone'], string> = {
  error: 'text-rose-400',
  positive: 'text-emerald-400',
  neutral: 'text-neutral-400',
  pending: 'text-neutral-400',
}

export function FormField({
  id,
  label,
  feedback,
  className = '',
  children,
}: {
  id: string
  label: string
  feedback?: FieldFeedback
  className?: string
  children: (props: ControlProps) => ReactNode
}) {
  const feedbackId = `${id}-feedback`

  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <label htmlFor={id} className="mb-1 text-xs text-neutral-400 sm:text-sm">
        {label}
      </label>
      {children({
        'aria-describedby': feedbackId,
        'aria-invalid': feedback?.tone === 'error',
      })}
      <FeedbackText id={feedbackId} feedback={feedback} />
    </div>
  )
}

export function FeedbackText({
  id,
  feedback,
}: {
  id: string
  feedback?: FieldFeedback
}) {
  return (
    <p
      id={id}
      aria-live="polite"
      className={`min-h-4 pt-0.5 text-xs leading-4 sm:text-sm sm:leading-5 ${feedback ? TONE_CLASSES[feedback.tone] : ''}`}
    >
      {feedback?.text}
    </p>
  )
}

export const inputClassName =
  'w-full min-w-0 rounded-lg bg-white/5 px-3 text-base text-neutral-100 ring-1 ring-white/10 outline-none transition placeholder:text-neutral-500 focus-visible:ring-2 focus-visible:ring-zinc-400 aria-invalid:ring-rose-400/70'
