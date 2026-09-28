import { useEffect } from 'react'

const DISMISS_AFTER_MS = 5000

export function Toast({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  useEffect(() => {
    if (!message) return
    const timeout = setTimeout(onDismiss, DISMISS_AFTER_MS)
    return () => clearTimeout(timeout)
  }, [message, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-10 flex justify-center px-4"
    >
      {message && (
        <p className="rounded-xl bg-neutral-800 px-4 py-3 text-sm text-neutral-100 shadow-lg shadow-black/40 ring-1 ring-white/10">
          {message}
        </p>
      )}
    </div>
  )
}
