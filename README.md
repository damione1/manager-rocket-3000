# Manager Rocket 3000

Lightspeed Retail (R-Series) helper for warehouse UPC updates. Scan the internal SKU, scan a 12-digit UPC, write it to the POS.

Hosted as a Cloudflare Worker (SPA + API). No container, no Google Cloud.

## UPC Rocket

1. Sign in with Lightspeed (`employee:inventory`).
2. Scan `systemSku` (Bluetooth scanner = keyboard + Enter).
3. Scan a UPC-A. 13-digit scans with a leading `0` are normalized to 12 digits.
4. The Worker refuses the write if that UPC already belongs to another item.

## Local

```sh
cp .dev.vars.example .dev.vars
# fill LIGHTSPEED_CLIENT_ID, LIGHTSPEED_CLIENT_SECRET, AUTH_SECRET
# AUTH_SECRET: openssl rand -base64 32
npm install
npm run dev
```

Lightspeed OAuth apps require HTTPS. Use a Cloudflare tunnel (`npx wrangler tunnel` / Vite plugin tunnel) or register `https://localhost:5173/api/auth/callback/lightspeed` if you terminate TLS locally. The production callback path matches the old NextAuth provider (`/api/auth/callback/lightspeed`).

## Lightspeed app

Register at [Lightspeed OAuth](https://cloud.lightspeedapp.com/oauth/register.php).

Redirect URL:

```
https://manager-rocket-3000.damiengoehrig.ca/api/auth/callback/lightspeed
```

Scope: `employee:inventory`.

OAuth still uses the original R-Series PHP endpoints (the app was registered against these):

- Authorize: `https://cloud.lightspeedapp.com/oauth/authorize.php`
- Token: `https://cloud.lightspeedapp.com/oauth/access_token.php`
- API: `https://api.lightspeedapp.com/API/V3`

## Deploy

GitHub Actions deploys to Cloudflare Workers on push to `master`.

Repo secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers deploy token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |
| `LIGHTSPEED_CLIENT_ID` | OAuth client |
| `LIGHTSPEED_CLIENT_SECRET` | OAuth secret |
| `AUTH_SECRET` | Encrypts the session cookie |

Manual:

```sh
npx wrangler secret put LIGHTSPEED_CLIENT_ID
npx wrangler secret put LIGHTSPEED_CLIENT_SECRET
npx wrangler secret put AUTH_SECRET
npm run deploy
```

## Stack

Vite + React 19 + Tailwind 4 on the client. Hono on a Cloudflare Worker for OAuth, session cookie, and Lightspeed proxy. Session is an encrypted httpOnly cookie — no database.
