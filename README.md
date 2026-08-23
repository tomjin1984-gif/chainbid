# chain.bid

Production-oriented Crypto/Web3 USDT bidding leaderboard.

Users submit a project, choose a whole-USDT total bid, create a payment order, send exactly the unique USDT amount, and only enter or move up the leaderboard after server-side blockchain verification and atomic crediting.

## What Is Implemented

- Homepage leaderboard with category filters, boost targets, and credited activity.
- Project submission and existing-listing boost flow.
- Duplicate listing detection through normalized canonical listing keys.
- USDT checkout with exact payable amount, QR code, copy controls, status polling, and manual transaction-hash verification.
- Project detail pages with bid and rank history.
- Protected admin dashboard for projects, payment states, manual review counts, networks, and activity.
- Rules, terms, privacy, robots, sitemap, canonical, OpenGraph, and Twitter metadata.
- PostgreSQL/Supabase schema and migration.
- Payment verifier adapters for TRON, Ethereum, BNB Smart Chain, and Solana.
- Payment worker entry point for cron or persistent worker execution.
- Domain tests for bid validation, ranking, URL normalization, SSRF blocking, amount attribution, under/overpayment, and idempotent crediting.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

The local app renders fictional development listings when Supabase credentials are absent. Production requires Supabase service credentials and verified RPC configuration.

## Environment

Copy `.env.example` and fill deployment-specific values. Do not commit real secrets.

Mainnet payment buttons are disabled by default:

```text
PAYMENTS_TRON_ENABLED=false
PAYMENTS_ETHEREUM_ENABLED=false
PAYMENTS_BSC_ENABLED=false
PAYMENTS_SOLANA_ENABLED=false
```

Set them to `true` only after completing `docs/mainnet-checklist.md`.

## Database

Apply `supabase/migrations/0001_initial.sql` to Supabase/PostgreSQL.

The critical production function is `credit_payment_order_atomic(order_public_id text)`. It locks the payment order and project, enforces one credit per order, relies on unique transaction constraints, inserts an immutable bid record, updates project ranking fields, marks the order credited, and writes activity inside one database transaction.

## Payment Architecture

Read `docs/payment-architecture.md` for the payment flow, verifier boundaries, shared-address attribution strategy, worker design, and production guardrails.

Read `docs/usdt-network-sources.md` for token-contract and finality source notes. Re-verify every contract/mint and finality policy before mainnet.

## Worker

Vercel Cron can call:

```text
POST /api/internal/payment-worker
Authorization: Bearer $CRON_SECRET
```

A persistent worker can import `worker/payment-monitor.ts`.

## Mainnet Blockers

- RPC credentials are not configured in this workspace.
- Staging transactions have not been executed on all supported networks.
- BSC USDt source approval is required before production checkout.
- Legal terms, privacy text, and refund policy still require review.
- Monitoring, backups, and operational alerts are not configured in this workspace.
