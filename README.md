# Manager Rocket 3000

Warehouse helper for Lightspeed Retail (R-Series). Live: https://manager-rocket-3000.damiengoehrig.ca

**UPC Rocket** — sign in as a Lightspeed employee (`employee:inventory`), scan the internal `systemSku`, scan a UPC-A, write it on the item. 13-digit scans that start with `0` are stored as 12 digits. A UPC already used by another item is rejected.

Bluetooth scanner = keyboard + Enter.

## Local

```sh
cp .dev.vars.example .dev.vars
# LIGHTSPEED_CLIENT_ID, LIGHTSPEED_CLIENT_SECRET, AUTH_SECRET (openssl rand -base64 32)
npm install
npm run dev
```

OAuth callback: `https://manager-rocket-3000.damiengoehrig.ca/api/auth/callback/lightspeed`

Lightspeed login needs HTTPS. Tunnel or local TLS if you are not hitting production.

## Deploy

Push to `master`. Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `LIGHTSPEED_CLIENT_ID`, `LIGHTSPEED_CLIENT_SECRET`, `AUTH_SECRET`.
