# USDT Network Sources

Reviewed on 2026-08-23. Re-check these before mainnet payment acceptance.

## Token Contracts And Mints

Primary source: Tether supported protocols: https://tether.to/en/supported-protocols/

Configured primary-verified values:

- TRON USDt: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`, 6 decimals.
- Ethereum USDt: `0xdAC17F958D2ee523a2206206994597C13D831ec7`, 6 decimals.
- Solana USDt: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`, 6 decimals.

BNB Smart Chain:

- Architectural support is implemented.
- The commonly referenced BEP20 token is `0x55d398326f99059fF775485246999027B3197955`, 18 decimals.
- Production checkout stays blocked unless `BSC_USDT_SOURCE_APPROVED=true` and the launch owner records the approval source. Tether's current supported-protocols page did not expose a BSC USDt contract in the visible source used for this build.

## Finality Policy Sources

- Ethereum proof-of-stake finality and finalized block semantics: https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/
- Ethereum JSON-RPC block parameter tags including `finalized`: https://ethereum.org/en/developers/docs/apis/json-rpc/
- TRON solidity confirmed transaction endpoint used by the adapter: https://developers.tron.network/reference/gettransactioninfobyid-1
- Solana RPC commitment and finalized transaction lookup: https://solana.com/docs/rpc
- BNB Chain finality and fast-finality behavior should be rechecked against BNB Chain docs before enabling BSC checkout: https://docs.bnbchain.org/

## Operational Notes

- Do not accept a network if the configured token address cannot be independently verified against official Tether or network-operated documentation.
- Do not expose RPC URLs or keys through `NEXT_PUBLIC_*`.
- Solana receiving should be validated operationally: if the supplied address is a wallet owner rather than an SPL token account, confirm the associated token account and monitor both owner and token-account balance deltas.
