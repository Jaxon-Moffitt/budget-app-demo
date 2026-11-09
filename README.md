# Budget (demo)

A runnable demo of a two-person envelope-budgeting app built with Expo (React Native) and Supabase. This copy runs entirely in the browser on made-up data: there's no server, no sign-in and no bank connection. Anything you change resets when you reload the page.

## What to try

- **Budget:** Ready to assign, envelope balances, and an overspent Gifts envelope. Tap it and cover it from Free to spend.
- **Transactions → To review:** three new bank rows waiting to be filed. Pick an envelope, split one across two envelopes, or make a rule from it.
- **Accounts:** checking, savings, a credit card, and an off-budget brokerage account.
- **Settings:** manage envelopes, categories and rules, and switch themes (including a custom color theme).

## How it works

The real app talks to Supabase (Postgres with row-level security, RPCs and triggers). Here, `src/lib/supabase.ts` returns an in-memory stand-in from `src/demo/db.ts`. It answers the same supabase-js queries the screens make: selects with joins, filters, inserts and updates, plus the database functions. It also mimics the database's rules, such as filing new transactions by the rules and refusing spending without an envelope. `src/demo/seed.ts` builds the sample household, with dates worked out from today so the data is never stale.

Everything else (screens, budget math in `src/domain/`, data hooks in `src/lib/`) is the app's own code.

## Run it

```sh
npm install
npm start          # dev server in the browser
npm test           # Jest
npm run typecheck
npm run lint
```

## Build and host

```sh
npm run build      # static site in dist/
```

`dist/` is a plain static site. Upload it to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3). Unknown paths should fall back to `index.html`.

To serve it from a subpath such as `/budget-demo/`, add `"experiments": { "baseUrl": "/budget-demo" }` to `app.json` before building. To embed it in a portfolio page, an iframe at phone width works well:

```html
<iframe src="https://your-host/budget-demo/" width="390" height="844" style="border:0;border-radius:24px"></iframe>
```
