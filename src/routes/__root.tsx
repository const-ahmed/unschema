import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TURNSTILE_SCRIPT_URL } from '#/components/human-session'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#17181f' },
      { title: 'Unschema' },
      {
        name: 'description',
        content: 'Natural-language semantic form validation with Jev.',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://challenges.cloudflare.com' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
    scripts: [{ src: TURNSTILE_SCRIPT_URL, async: true }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
