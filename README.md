# OK Finance

An executive financial dashboard for Stripe, Mercury, Google Cloud, and Cloudflare. Server-rendered HTML, htmx, and a local Node.js data service. Includes deterministic sample data, a unified ledger, cash-flow charts, proportional Sankey diagrams, and interactive node views.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm install
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. One Node server serves the UI, HTML fragments, assets, and API. Development watches source files and rebuilds/restarts the server; refresh the browser after an edit. Restart after editing `.env`. Set `DEV_PORT` to change the development port, or `API_PORT` for production (default 4174).

```sh
npm run build        # Type-check/compile server templates and copy browser assets
npm start            # Production UI and API at http://127.0.0.1:4174
npm test             # Financial model, adapters, CSV, persistence and HTTP tests
```

Browser tests are also provided in `tests/e2e`; run `npx playwright install chromium` once and `npm run test:e2e`. The API test uses port 4189 and an isolated temporary directory. API and browser tests use isolated temporary ledgers and disable provider credentials. Tests never use your credentials or mutate your real ledger.

## UI architecture

The browser receives rendered HTML rather than the full ledger. Navigation, search, filters, pagination, dialogs, import previews, and mutations use htmx requests. The server reuses the financial model and adapter/persistence code. View parameters live in the URL, so reloads and back/forward navigation retain the selected view. HTML responses use `no-store`, and htmx history caching is disabled to keep financial records and CSV uploads out of local history snapshots.

Server templates are in `server/views.tsx`, `server/charts.tsx`, and `server/dropdown.tsx`. JSX is compiled to an escaping HTML renderer in `server/html.js`; it has no React runtime, hooks, virtual DOM, or browser component lifecycle. `src/browser.js` handles themes, keyboard/menu/dialog behavior, CSV file reading, SVG tooltips and zoom, and responsive chart sizing. `npm run build` creates server templates and locally served assets in `dist`; htmx is served locally. JSON `/api` routes remain available for existing consumers.

## Connect your stack

Use **Integrations → Set up integration** for setup instructions, status, CSV template downloads, and imports. Credentials belong in `.env`, never in the browser or a `VITE_` variable. Use read-only credentials. Restart the server after changes, then select **Sync configured sources**. Merely configuring a key never marks a provider successfully synced.

| Source | Connection | What is imported |
| --- | --- | --- |
| Stripe | `STRIPE_SECRET_KEY` with Balance read access | Balance transactions from the last 365 days, with gross credits, refunds and fees separated; payouts excluded as internal transfers |
| Mercury | `MERCURY_API_TOKEN`, read-only | Transaction history from the last 365 days, cursor paginated; posted dates preferred, pending entries excluded, possible Stripe/internal settlements flagged for review |
| Google Cloud | `GCP_BILLING_PROJECT`, `GCP_BILLING_TABLE`, `GCP_BILLING_LOCATION`, Google ADC | Standard/detailed BigQuery billing export, daily costs and credits as separate entries; NUMERIC aggregation before rounding each daily total to minor units; maximum 1 GB scanned per query |
| Cloudflare | `CLOUDFLARE_API_TOKEN` with access to user billing history | Charge/credit/refund history; unknown billing item types excluded pending review; last 365 days |

All four sources support the normalized CSV import route. Provider-native CSVs must first be mapped to the downloaded template. Supabase is outside the v1 integration scope. Bank payments to Supabase remain ordinary cash expenses.

GCP needs a configured billing export and Application Default Credentials. Supply `GOOGLE_APPLICATION_CREDENTIALS` with a local service-account JSON path, or use an existing ADC login. Grant BigQuery data read access on the billing dataset and job creation access on the query project. The query may incur BigQuery charges within the 1 GB scan cap. Credentials are never returned by the API. Cloudflare billing access may depend on account role; permission failures remain visible in Integrations.

## Financial model

- **Cash activity** combines Stripe balance activity and Mercury bank payments. Provider fees are separate debits. Positive is credit, negative is debit.
- **Cloud billing** is separate: GCP accrued usage and Cloudflare billing records. It is not added to cash spending, because a bank payment may settle the same invoice.
- Transfers, pending entries and review entries do not contribute to totals or diagrams. Identify settlements between your own accounts in transaction details. Mercury entries mentioning Stripe or internal transfers are held for review, not assumed to be income. Other ownership relationships cannot be inferred; review your ledger.
- A verified classification persists across imports and syncs. Pending provider transactions cannot be marked posted in the UI. Unknown Cloudflare billing types must be corrected via a verified CSV import; they are not treated as costs automatically.
- Currencies remain separate. Supported currencies: USD, EUR, GBP, CAD, AUD, CHF, SGD, NZD. Unsupported currencies fail the whole source sync/import rather than being mis-scaled or discarded. No FX conversion is performed.
- Amounts are integer minor units, dates are UTC. Comparisons use an equally long preceding period. GCP exports can lag and are accrued usage rather than settled invoices.
- Cash retention is net movement divided by credits, **not profit margin**. Net movement is **not bank balance**. No account balance or runway is fabricated.
- Sankey and node views describe period allocations, not traced bank settlements. The widths of Sankey ribbons are proportional to amounts. `Net retained` is the period surplus; `Funding gap` balances outflows above inflows without inventing a funding source. Cloud billing uses `Net billing cost` and `Net billing credit` for the balancing amounts, without implying a cash funding need.
- Only successfully imported/synced data is included. A complete-looking chart does not prove all accounts, months, or transactions are covered. Prior-period comparisons may reflect incomplete source coverage.

## CSV import

Download a source-specific template from its integration dialog. Required columns:

```csv
id,source,date,amount,currency,description,category,kind,basis,status,counterparty
invoice-123,cloudflare,2026-09-22,-49.00,USD,Pro plan,Cloudflare,debit,accrual,posted,Cloudflare
```

- `amount`: signed decimal in **currency units**, at most two decimals. No currency symbols, grouping separators or exponent notation.
- `kind`: `credit`, `debit`, `transfer`; sign must match credit/debit.
- `basis`: `cash` for Stripe/Mercury, `accrual` for GCP/Cloudflare.
- `status`: `posted`, `pending`, `review`.
- `id`: stable provider transaction or invoice-line ID. Re-importing a source + ID updates the same record. Reusing a different ID for the same payment can duplicate it. When mixing imports and APIs, use the provider's exact API IDs; choose one source of ingestion per record.
- Maximum 2 MB / 10,000 records. Quoted commas, multiline fields, CRLF, UTF-8 BOM and escaped quotes are supported. Invalid rows reject the entire import with an error; preview does not write data.

Imports are explicitly previewed before saving. Reports export every record in the selected date/source/currency/basis view, including transfers and pending entries with their status. Text formula prefixes are escaped for spreadsheet safety. Demo data never enters the live store.

## Storage, privacy and limitations

The local ledger is stored in `.data/ledger.json` with restrictive permissions and atomic writes. Mutations are serialized. Sync is manually initiated and serialized; failed providers retain their previous data, with an error shown in the UI. Successful re-syncs replace the provider-owned records inside the refreshed date window (so failed/cancelled Mercury transactions do not remain in totals), while retaining previously synced older history. Old records outside the provider query window are historical snapshots and are not reverified by that sync. Imported records use source + ID upserts. Back up `.data/ledger.json` before major changes.

`.env`, `.data`, dependency directories, and build artifacts are git-ignored. The server binds only to loopback and rejects unknown Host and cross-origin requests. There is **no multi-user authentication or hosted deployment**: add authentication, authorization, encrypted persistent storage and operational controls before exposing it to a network. All browser assets, including htmx and icons, are served locally. The UI uses system fonts.

Live-provider authentication and account-specific data shapes must be verified with your actual credentials. Included adapter tests use fixtures; they do not claim a successful connection to your accounts.

## Provider references

- [Stripe balance transactions](https://docs.stripe.com/api/balance_transactions/list)
- [Mercury transaction history](https://docs.mercury.com/reference/listtransactions)
- [GCP billing export](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery) and [cost/credit queries](https://docs.cloud.google.com/billing/docs/how-to/bq-examples)
- [Cloudflare billing history](https://developers.cloudflare.com/api/resources/user/subresources/billing/subresources/history/methods/list/)
