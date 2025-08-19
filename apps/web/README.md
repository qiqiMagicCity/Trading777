This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Data Format Note

When working with sample data such as `public/trades.json`, **short** positions and
trades must use negative `qty` values. For example, a short position of 80 shares of
AMZN should appear as `"qty": -80`. This ensures short exposure is represented
consistently across the application.

Trades missing a valid `date` are treated as having occurred **after** all
correctly timestamped trades. Their relative order is preserved, ensuring FIFO
and metrics calculations remain deterministic even when some records have
malformed or empty dates.

## Getting Started

Copy the repository root `env.example` file to `.env` and fill in the required API keys before running the application.

### Environment Variables

The price services expect the following variables to be defined in `.env` or your Vercel project settings:

- `NEXT_PUBLIC_FINNHUB_TOKEN` – Finnhub API token
- `NEXT_PUBLIC_TIINGO_TOKEN` – Tiingo API token

If these tokens are missing, external price lookups are skipped to prevent build and deployment failures.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project currently uses system fonts to avoid external font dependencies during builds.

## Freeze date for debugging

To debug against a fixed market snapshot, set `NEXT_PUBLIC_FREEZE_DATE` in your `.env` file to the last Friday's date (e.g. `2024-05-17`). When this variable is present the app serves that day's closing prices instead of live quotes. Remove the variable to resume live pricing.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
