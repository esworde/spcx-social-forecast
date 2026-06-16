# SPCX Social Forecast

A small social prediction sketch for `NASDAQ: SPCX`.

The app shows recent SPCX market data, lets people draw a freehand forecast through December 31, 2026, and saves one immutable forecast per username. Submitted forecasts are drawn back over the same chart as a faint crowd layer, with username search/highlight.

Built as a compact side project for [ardoedo.it](https://ardoedo.it/).

## Features

- Recent SPCX open/latest chart
- Freehand mouse/touch forecast drawing
- Monthly checkpoint markers through December 2026
- One forecast per username
- Username search and highlight
- Dense canvas rendering for large forecast crowds
- Configurable hard cap on total forecast submissions
- Local SQLite development
- Cloudflare D1-ready production database
- Cloudflare R2 forecast snapshots for viral read traffic
- Cloudflare Worker rate limiting for forecast submissions
- Cloudflare Cron-ready market refresh every 2 hours

## Stack

- Next.js
- React
- TypeScript
- SQLite locally via `better-sqlite3`
- Cloudflare Workers/OpenNext for deployment
- Cloudflare D1 for production storage
- Cloudflare R2 for immutable forecast chunks
- Cloudflare Workers Rate Limiting binding for submit protection
- Alpha Vantage for cached daily market data

## Local Development

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
MARKET_SYMBOL=SPCX
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is taken:

```bash
npm run dev -- --port 3002
```

## Verification

```bash
npm test
npm run typecheck
npm run build
```

## Cloudflare Deployment

Create a D1 database:

```bash
npx wrangler d1 create spcx-forecast-db
```

If you recreate the database, copy the printed `database_id` into `wrangler.jsonc`:

```jsonc
"database_id": "replace-with-d1-database-id"
```

Apply migrations:

```bash
npx wrangler d1 migrations apply spcx-forecast-db --local
npx wrangler d1 migrations apply spcx-forecast-db --remote
```

Enable R2 in the Cloudflare dashboard, then create the forecast snapshot bucket:

```bash
npx wrangler r2 bucket create spcx-forecast-snapshots
```

Set the Alpha Vantage secret:

```bash
npx wrangler secret put ALPHA_VANTAGE_API_KEY
```

Build for Cloudflare:

```bash
npm run cf:build
```

Deploy:

```bash
npm run cf:deploy
```

The Worker is configured with a cron trigger in `wrangler.jsonc`:

```jsonc
"crons": ["* * * * *", "0 */2 * * *"]
```

That exports forecast chunks to R2 every minute and refreshes cached market data every 2 hours.
Public forecast traffic reads directly from D1 while the crowd is small, then switches to R2 snapshots once the configured direct-read threshold is exceeded:

```jsonc
"DIRECT_FORECAST_READ_LIMIT": "2000"
```

The Worker also has a rate limiting binding for `POST /api/forecasts`:

```jsonc
"limit": 10,
"period": 60
```

That allows 10 submissions per minute per client IP before returning `429`.

Forecast submissions also stop once `MAX_FORECASTS` is reached. Production is configured at:

```jsonc
"MAX_FORECASTS": "100000"
```

When the cap is reached, `POST /api/forecasts` returns `503` and no new rows are written.

## Notes

- `.env.local`, local SQLite data, build output, and OpenNext output are ignored by git.
- `wrangler.jsonc` contains the production Worker, D1, R2, cron, and custom-domain configuration.
- This is a toy prediction game, not financial advice.
