# DINX

A shared budget tracker for two people. Expenses, income, expected bills and
savings — all organised around a budget cycle that runs **from the 25th to the
24th** rather than the calendar month.

Built as a mobile-first PWA: Next.js 15 · Supabase · Tailwind CSS v4 · Web Push,
deployed on Railway.

---

## What it does

| | |
|---|---|
| **Shared household** | Two people, one set of numbers. Invite your partner with an 8-character code. |
| **25th-to-25th cycles** | Configurable start day (1–28). Every screen is scoped to a cycle and you can step back through history. |
| **Log for either person** | Every entry records *who it's for* and *who logged it*, so you can add your partner's spend on their behalf. |
| **Payment methods** | Revolut, Lloyds, HSBC Credit and Cash are seeded. Each person picks their own default, pre-selected on the add form. Credit cards can carry a limit, so Budget can tell "paid the card off" apart from "have more to spend". |
| **Categories** | Fully editable, with optional per-cycle caps. Paste a whole list at once from Profile → Categories → *Paste a list*. |
| **Income & extras** | Income is split into salary vs. extra (bonus, freelance, refunds) and reported separately. |
| **Expected bills** | Add rent/utilities/subscriptions once; they reappear each cycle. Ticking one off writes a real expense *and* notifies your partner. |
| **Savings goals** | Targets with optional per-cycle contribution goals, deposits and withdrawals, running progress. |
| **Who owes who** | Shared costs are split by a configurable percentage; the dashboard shows the running balance between you. |
| **Insights & tips** | Stats → Tips reads your actual numbers — spending pace, category caps, savings rate, cycle-over-cycle movement — alongside evergreen habits. |
| **Smart budgeting** | Enter your combined income and a savings target; Budget works out a cap per category from your real spending, tracks pace through the cycle and tells you exactly what to ease off if you fall behind, and forecasts where your saving habits are heading — with AI-personalised recovery tips and UK / Isle of Man specific actions when `ANTHROPIC_API_KEY` is set. |
| **Live sync** | Supabase Realtime refreshes both phones the moment either of you writes something. |
| **Push notifications** | Your partner gets a push when you log an expense, add income, pay a bill or move savings. Each alert type is individually mutable. |

---

## 1 · Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates every
   table, the row-level-security policies, the realtime publication and the
   `create_household` / `join_household` functions.
3. Go to **Authentication → Providers → Email** and either:
   - turn **Confirm email** *off* for the quickest start, or
   - configure SMTP under **Project Settings → Auth** so confirmation emails
     actually send.
4. Under **Authentication → URL Configuration**, add your Railway URL to
   **Site URL** and **Redirect URLs** (e.g. `https://dinx.up.railway.app/**`).
5. Copy the three keys from **Project Settings → API**.

Every table is protected by RLS keyed on your household, so neither of you can
ever read another household's rows.

## 2 · Generate push keys (optional)

Skip this and the app works fine — you just won't get notifications.

```bash
npm run vapid
```

It prints the two `VAPID` values to paste into your environment.

## 3 · Environment variables

These are the **only** variables DINX reads. Set all of them on the Railway
service (Variables tab) and in a local `.env.local` for development.

| Variable | Required | Where it's used | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | browser + server | Supabase → Settings → API → *Project URL* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | browser + server | Supabase → Settings → API → *anon public* |
| `SUPABASE_SERVICE_ROLE_KEY` | for push | server only | Supabase → Settings → API → *service_role*. Lets DINX read your partner's push subscriptions. **Never expose this to the browser.** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | for push | browser + server | From `npm run vapid` |
| `VAPID_PRIVATE_KEY` | for push | server only | From `npm run vapid` |
| `VAPID_SUBJECT` | for push | server only | e.g. `mailto:you@example.com`. Defaults to `mailto:hello@dinx.app` |
| `ANTHROPIC_API_KEY` | no | server only | Powers the AI parts of statement import and Budget's recovery/forecast tips. Both features work without it — Budget falls back to its rule-based numbers, and import falls back to the deterministic parser. |
| `PORT` | no | server | Railway injects this automatically |

> **Build-time note:** anything prefixed `NEXT_PUBLIC_` is inlined into the
> client bundle *during the build*, not read at runtime. Railway passes service
> variables to the Docker build, and the `Dockerfile` declares them as `ARG`s —
> so set them **before** your first deploy. If you add or change a
> `NEXT_PUBLIC_*` value later, trigger a fresh deploy for it to take effect.

## 4 · Deploy to Railway

1. **New Project → Deploy from GitHub repo**, pick this repository.
2. Railway reads [`railway.json`](railway.json) and builds with the
   [`Dockerfile`](Dockerfile) — no build command to configure.
3. Add the variables from the table above.
4. Under **Settings → Networking**, generate a domain. Health checks hit
   `/api/health`.
5. Put that domain into Supabase's **Site URL** and **Redirect URLs** (step 1.4).

Push notifications require HTTPS, which Railway domains provide.

## 5 · Install on your phones

1. Open the deployed URL in **Safari (iOS)** or **Chrome (Android)**.
2. **Share → Add to Home Screen**.
3. Open DINX from the home-screen icon and tap **Enable** on the notifications
   card.

> iOS only delivers web push to apps that have been added to the home screen —
> notifications will not arrive in a normal Safari tab. iOS 16.4+ required.

## 6 · Pair with your partner

One of you creates the household during onboarding; the other signs up and
chooses **Join partner**, entering the code from **Profile → Invite your
partner**.

---

## Local development

```bash
npm install
cp .env.example .env.local     # fill in your Supabase keys
npm run dev                    # http://localhost:3000
```

Other scripts:

```bash
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint
npm run icons       # regenerate the PWA icons in public/icons
npm run vapid       # print a fresh VAPID key pair
```

---

## Project layout

```
src/
  app/
    (app)/            authenticated screens, wrapped in the app shell
      page.tsx          dashboard — outcome card, balance, shortcuts, recent
      transactions/     receipts, with search + category/person/account filters
      stats/            spending · savings · tips
      planned/          expected bills for the cycle
      savings/          goals, deposits and withdrawals
      budget/           income, savings target, adaptive pace + forecast
      profile/          identity, notifications, categories, accounts, cycle
    api/
      health/           Railway health check
      push/subscribe/   stores a device's push subscription
      push/test/        sends a test push to the household
    actions.ts        every database write, as server actions
    login/ onboarding/ auth/callback/
  components/         UI, all mobile-first
  lib/
    cycle.ts          the 25th-to-25th maths — the heart of the app
    data.ts           server-side queries, totals, settlement balance
    insights.ts       data-driven observations + the tips library
    budget.ts         rule-based budgeting: smart allocation, pace, forecast
    budget-ai.ts      optional AI layer over the same numbers, with caching
    budget-context.ts fetches + wires the two together for the page/actions
    push.ts           web-push dispatch, honouring per-person preferences
    supabase/         browser, server and service-role clients
supabase/schema.sql   tables, RLS, functions, realtime
supabase/migrations/  incremental SQL for existing projects (also folded into schema.sql)
scripts/              icon generator (no image dependencies)
```

## Design notes

The interface follows the reference mockup: a soft lavender page, white cards
with generous radii, one deep plum hero card, and coral as the single accent
used for the active state and the add button. Type never drops below 16px on
inputs (iOS zooms below that), tap targets are at least 44px, and every
horizontal list is a scrollable rail rather than a wrapping grid.
