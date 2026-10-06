# payz-settlement

Settlement address configuration and transaction verification. The package exposes a Payz settlement interface, with the current implementation verifying USDC transfers on Ethereum.

## Local development

Use Node.js 22 or later and pnpm 10. This package depends on `payz-core`; keep the separate repositories in a shared pnpm workspace:

```sh
mkdir -p payz-settlement-development/repos
cd payz-settlement-development
git clone https://github.com/payz-world/payz-core.git repos/payz-core
git clone https://github.com/payz-world/payz-settlement.git repos/payz-settlement
cp repos/payz-settlement/development/package.json .
cp repos/payz-settlement/development/pnpm-workspace.yaml .
pnpm install
pnpm --filter payz-settlement typecheck
```

When using this package alongside other Payz services, add both checkouts to their existing pnpm workspace instead of creating another workspace. The package exports TypeScript source and is intended for server-side consumers, not as a standalone HTTP server.

## Exports

- `payz-settlement/provider`: the settlement provider and configuration check.
- `payz-settlement/verification`: USDC output-transfer verification.
- `payz-settlement/wallet`: derivation of the settlement address from configured wallet credentials.

The current implementation verifies Ethereum mainnet USDC transfers. It requires three confirmations and an exact received amount before returning `verified`. The modules do not submit transactions.

## Configuration

Copy `.env.example` to a local environment file and replace its placeholders:

- `PAYZ_ETHEREUM_RPC_URL`: an HTTP or HTTPS Ethereum RPC endpoint.
- `PLATFORM_WALLET_KEY`: the server-side wallet key used to derive the settlement address.

Load these variables through the consuming application's environment setup. Do not expose wallet keys in a browser or commit credentials. Typechecking does not require credentials or RPC access. For local checks, use mocked RPC responses and test-only credentials; never point tests at production.

Without valid configuration, the provider reports that it is not configured. Verification returns a status and confirmation count; callers must handle `pending`, `unavailable`, `reverted`, and `insufficient` as well as `verified`.

## License

Licensed under [Apache-2.0](LICENSE).
