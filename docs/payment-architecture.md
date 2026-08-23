# Payment Architecture

## Flow

1. User submits or boosts a project with a whole-USDT target.
2. Server validates the bid, normalizes the URL, checks duplicates, and creates a `payment_orders` row before showing payment instructions.
3. Server creates a unique payable amount by adding a deterministic fractional suffix within the token decimal precision. Leaderboard credit remains the requested whole-USDT bid.
4. User pays USDT to the configured public receiving address.
5. The checkout polls `/api/payment-orders/[publicId]` for server status.
6. The payment worker and the manual transaction-hash endpoint both call the same `PaymentVerifier` adapter.
7. The repository records evidence, marks confirmed payments, and calls `credit_payment_order_atomic`.
8. The database function locks the order and project, verifies the order is not already credited, inserts one immutable bid, updates the project total and ranking timestamp, marks the order credited, and writes an activity event in one transaction.

## Attribution Strategy

All customers currently pay to a shared receiving address per network. Matching therefore uses:

- network
- exact USDT contract or mint
- receiver address
- unique exact token amount
- optional expected sender
- payment time window
- transaction success/finality
- unique `(network, tx_hash)` constraints

Late or ambiguous matches go to `manual_review`; they are not silently credited.

## Verifier Adapters

- `TronUsdtVerifier` checks TRC20 Transfer logs from the solidity endpoint.
- `EvmUsdtVerifier` checks ERC20/BEP20 Transfer logs from transaction receipts.
- `SolanaUsdtVerifier` checks finalized SPL token balance deltas for the configured receiver owner or token account.

Business logic never parses chain-specific logs directly.

## Worker

Production can run either:

- Vercel Cron calling `POST /api/internal/payment-worker` with `Authorization: Bearer $CRON_SECRET`.
- A persistent worker importing `worker/payment-monitor.ts`.

Multiple workers are safe only because final crediting is locked and idempotent in PostgreSQL.

## Production Guardrails

- Mainnet checkout is disabled by default in `.env.example`.
- Production requires Supabase service credentials and RPC URLs.
- BSC checkout is blocked in production until the BEP20 USDT source is explicitly approved.
- There is no wallet connection requirement, no signing key, no hot wallet, no withdrawals, and no browser-side crediting path.
