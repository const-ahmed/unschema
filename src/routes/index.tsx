import { createFileRoute } from '@tanstack/react-router'
import { ProfileForm } from '#/components/ProfileForm'
import { getTurnstileSiteKey } from '#/validation/verify-human'

export const Route = createFileRoute('/')({
  loader: () => getTurnstileSiteKey(),
  component: Home,
})

const LINKS = [
  { label: 'X', href: 'https://x.com/4hmedh4ss4n' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/ahmedahassan1' },
  { label: 'GitHub', href: 'https://github.com/const-ahmed/unschema' },
]

function Home() {
  const turnstileSiteKey = Route.useLoaderData()
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 p-3 short:gap-1 short:px-2 short:py-1 tall:p-6">
      <ProfileForm turnstileSiteKey={turnstileSiteKey} />
      <nav aria-label="Links">
        <ul className="flex gap-5 text-sm leading-5 text-neutral-500 short:text-xs short:leading-4">
          {LINKS.map(({ label, href }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded transition hover:text-neutral-200 focus-visible:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  )
}
