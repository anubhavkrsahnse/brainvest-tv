# brAInvest — Stocks with brAIn

Automated, agentic AI investment dashboard for YouTube broadcasting.

> ⚠️ **For Educational Purposes Only. Not SEBI Registered. Not Financial Advice.**
> Every data point on screen cites its source (NSE, Yahoo Finance, IPO Watch, Google Sheets, Zerodha).

## Architecture

- **Frontend:** Vite + React, deployed on Cloudflare Pages (`pages.dev`)
- **Backend:** Python scripts run by GitHub Actions cron at **9:00 AM / 4:00 PM IST**
  (`30 3 * * 1-5` / `30 10 * * 1-5` UTC), which dump static JSON into `public/data/`
  and commit — that commit triggers the Cloudflare Pages rebuild
- **Auth:** Google OAuth token (Gmail read-only + Sheets read-only) stored as a repo secret

## Local development

```sh
npm install
npm run dev   # http://localhost:5173
```

The JSON in `public/data/` is sample data; the Actions runs overwrite it with live data.

## Required GitHub secrets

| Secret | What it is |
| --- | --- |
| `GOOGLE_OAUTH_TOKEN_JSON` | Authorized-user token JSON with `gmail.readonly` + `spreadsheets.readonly` scopes (generate once locally with `google-auth-oauthlib` InstalledAppFlow) |
| `ETF_SHEET_ID` | Spreadsheet ID of the public "Kaushik sir etf" Google Sheet |
| `SENDGRID_API_KEY` | SendGrid API key for the daily 4 PM IST email |
| `REPORT_TO_EMAIL` | Where the "No BS" daily report goes |

Set them with:

```sh
gh secret set GOOGLE_OAUTH_TOKEN_JSON < token.json
gh secret set ETF_SHEET_ID
gh secret set SENDGRID_API_KEY
gh secret set REPORT_TO_EMAIL
```

## Cloudflare Pages setup

Deploys go through `wrangler pages deploy dist --project-name=brainvest` — the
GitHub Actions `deploy` job runs it after every data refresh. It needs two more
repo secrets: `CLOUDFLARE_API_TOKEN` (create at dash.cloudflare.com → My Profile
→ API Tokens, "Cloudflare Pages — Edit" template) and `CLOUDFLARE_ACCOUNT_ID`.

## Password gate

The whole site (HTML, JS, and the JSON data) sits behind a server-side password
check in [functions/_middleware.js](functions/_middleware.js). The password is
the `DASHBOARD_PASSWORD` Pages secret — never in the repo. Change it with:

```sh
npx wrangler pages secret put DASHBOARD_PASSWORD --project-name brainvest
```

A correct login sets a signed, HttpOnly, 30-day cookie. If the secret is unset,
the gate is disabled (useful for local `wrangler pages dev`).

Note: the **repo** is public, so the committed sample/refresh JSON in
`public/data/` is visible on GitHub even though the site is gated.

## Data sources & caveats

- **US stocks / global signals:** Yahoo Finance via `yfinance`
- **IPO issue list & subscription:** NSE public API
- **GMP:** scraped from IPO Watch's public table — grey-market numbers are
  unofficial and indicative only; the UI labels them as such
- **ETF targets:** Google Sheet "Kaushik sir etf" · **Holdings:** Zerodha Kite
  contract-note emails parsed via Gmail API
- **17% tracker:** monthly milestone = (1.17)^(1/12) − 1 ≈ 1.32%
