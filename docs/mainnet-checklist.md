# Mainnet Enablement Checklist

Do not enable production payment buttons until every item is complete.

- [ ] receiving address validation
- [ ] official USDT contract/mint validation
- [ ] RPC connectivity
- [ ] network finality configuration
- [ ] database migrations
- [ ] unique tx constraints
- [ ] idempotency tests
- [ ] duplicate credit tests
- [ ] payment expiry tests
- [ ] underpayment tests
- [ ] wrong-token tests
- [ ] wrong-network tests
- [ ] admin authentication
- [ ] rate limiting
- [ ] SSRF protection
- [ ] production demo endpoints disabled
- [ ] production seed/fake activity disabled
- [ ] monitoring enabled
- [ ] backup configured

Current blockers before mainnet:

- BSC USDt contract source requires explicit approval.
- Live RPC credentials are not configured in this workspace.
- Network-specific staging payments have not been executed.
- Legal terms, privacy text, and refund policy require review.
