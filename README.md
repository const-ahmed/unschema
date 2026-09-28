# Unschema

Unschema's form validation is written in plain English and decided by Jev, instead of by a schema library like Zod.

Unschema is a profile form where every rule is checked by [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), TypeSafe's (type one) structured evaluation model on Cloudflare Workers AI.

## What it demonstrates

| Rule Type          | Example                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Format             | The email looks like a valid address.                                                        |
| Numeric comparison | The person is 18 to 120 years old, given today's date.                                       |
| Plausibility       | The name could be a person's name (any script or culture; "Mickey Mouse" passes).            |
| Cross-field        | Confirm email matches Email                                                                  |
| Conditional        | Phone # field is shown and required only when chosen as the contact method.                  |
| Graded feedback    | The bio gets one of five verdicts, from "Please write a meaningful introduction" to "Great". |

A rule is a question plus the answers Jev can choose from:

```ts
confirmEmail: {
  instructions: 'Is `confirmEmail` the same email address as `email`, ignoring differences in letter case?',
  outcomes: {
    match: valid('They are the same, ignoring letter case.'),
    mismatch: invalid('They are different.', "Emails don't match."),
  },
},
```

## How it works

- **While typing,** each field is checked about 600ms after the user stops, with one Jev call. Fields that depend on others are rechecked too; for example, the bio is rechecked when the name changes.
- **On submit,** the server re-checks every field in a single Jev call. That result is final, even if a live check disagreed, and late live results are ignored.
- **Unschema does not persist form submissions.** A successful submit shows a message and resets the form.

Design choices:

- **Rules stay on the server.** The browser only sends a field name and the values that rule needs.
- **User input is treated as data.** It never goes into Jev's instructions, and Jev is told to ignore any instructions inside it.
- **Jev's answer is the decision.** There are no probability cut-offs.
- **Jev's responses are checked, not trusted.** Anything unexpected is reported as "couldn't check".

## Stack

|           |                                                                                         |
| --------- | --------------------------------------------------------------------------------------- |
| Framework | [TanStack Start](https://tanstack.com/start) (React), server functions for the Jev calls |
| Forms     | [TanStack Form](https://tanstack.com/form)                                              |
| Styling   | Tailwind CSS                                                                            |
| Hosting   | Cloudflare Workers, via `@cloudflare/vite-plugin`                                       |
| AI        | Cloudflare Workers AI, model `typesafe/jev`                                             |
| Tooling   | TypeScript, Vite, Vitest, pnpm, Node.js                                                 |

## Project structure

```
src/
  components/ProfileForm.tsx   the form: state, live checks, submit, layout
  server/rules.ts              the validation rules, in plain English
  server/jev.ts                calls Jev and checks its responses
  validation/profile.ts        fields, what's required or visible, what each rule reads
  validation/live-checks.ts    stops late live results overwriting the final check
  validation/validate-field.ts server function: live check
  validation/submit-profile.ts server function: final check
scripts/jev-smoke.ts           one real Jev call, run by hand
```

## Getting started

You need Node 24.21.0 or later (see `.nvmrc`), pnpm 12.6.0 (`corepack enable` picks it up from `package.json`), and a Cloudflare account with Workers AI.

The app runs locally, but Workers AI has no local mode: every Jev check runs on Cloudflare, so the dev server needs Cloudflare credentials to start.

```sh
pnpm install
pnpm wrangler whoami  # check whether you're already signed in
pnpm wrangler login   # only if you aren't
pnpm dev              # http://localhost:3000
```

Instead of logging in, you can set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, which suits shells without a browser.

Each check is a real Workers AI request and may incur usage charges on your Cloudflare account.

## Scripts

| Command           | Does                                                        |
| ----------------- | ----------------------------------------------------------- |
| `pnpm dev`        | Runs the app locally on the Workers runtime                 |
| `pnpm test`       | Unit tests, with Jev faked: no network, no cost             |
| `pnpm typecheck`  | Type-checks the project                                     |
| `pnpm smoke:jev`  | Makes one real Jev call to confirm access                   |
| `pnpm build`      | Production build into `dist/`                               |
| `pnpm deploy`     | Builds and deploys to Cloudflare                            |
| `pnpm cf-typegen` | Regenerates Cloudflare types after editing `wrangler.jsonc` |

The unit tests cover Jev's request and response handling, every rule's outcomes, the request guards, and the race between live and final checks.

## Deployment

`pnpm deploy` publishes a single Worker named `unschema`. A custom domain can be added to it in Cloudflare.

Each check is a billed request, so add rate limiting (and ideally a bot check such as Cloudflare Turnstile) before making the site public.
