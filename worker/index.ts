import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomToken, sha256Base64Url } from "./crypto";
import {
  allItems,
  authorizeUrl,
  exchangeCode,
  firstItem,
  loadProfile,
  lsApi,
  publicItem,
  OAUTH_CALLBACK_PATH,
  redirectUri,
} from "./lightspeed";
import { clearSession, readSession, writeSession } from "./session";
import type { Env, LightspeedItem, SessionData } from "./types";

const UPC_RE = /^\d{12}$/;

type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>();

app.get("/api/me", async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return c.json({
    name: session.name,
    shopName: session.shopName,
    email: session.email,
  });
});

app.get("/api/auth/login", async (c) => {
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = await sha256Base64Url(verifier);
  const secure = new URL(c.req.url).protocol === "https:";

  setCookie(c, "oauth_state", state, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  setCookie(c, "oauth_verifier", verifier, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });

  return c.redirect(
    authorizeUrl({
      clientId: c.env.LIGHTSPEED_CLIENT_ID,
      redirectUri: redirectUri(c),
      state,
      codeChallenge: challenge,
    }),
  );
});

app.get(OAUTH_CALLBACK_PATH, async (c) => {
  const error = c.req.query("error");
  if (error) {
    return c.redirect(`/?error=${encodeURIComponent(error)}`);
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = getCookie(c, "oauth_state");
  const verifier = getCookie(c, "oauth_verifier");
  deleteCookie(c, "oauth_state", { path: "/" });
  deleteCookie(c, "oauth_verifier", { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return c.redirect("/?error=invalid_oauth_state");
  }

  try {
    const tokens = await exchangeCode(
      c.env,
      code,
      redirectUri(c),
      verifier,
    );
    const profile = await loadProfile(tokens.access_token);
    await writeSession(c, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpires: Date.now() + tokens.expires_in * 1000,
      ...profile,
    });
    return c.redirect("/");
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return c.redirect(`/?error=${encodeURIComponent(message)}`);
  }
});

app.post("/api/auth/logout", async (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

app.get("/api/items", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const sku = c.req.query("sku")?.trim();
  if (!sku) return c.json({ error: "SKU is required" }, 400);

  const response = await lsApi(
    c,
    session,
    `/Item.json?systemSku=${encodeURIComponent(sku)}`,
  );
  const payload = await readJson(response);
  if (!response.ok) {
    return c.json({ error: apiError(payload, response.statusText) }, 502);
  }

  const item = firstItem(payload);
  if (!item) return c.json({ error: "Item not found" }, 404);
  return c.json({ item: publicItem(item) });
});

app.put("/api/items/:itemId", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const itemId = c.req.param("itemId");
  const body = await c.req.json<{ upc?: string }>().catch(() => null);
  const upc = normalizeUpc(body?.upc ?? "");
  if (!upc) {
    return c.json({ error: "UPC must be 12 digits" }, 400);
  }

  const dupResponse = await lsApi(
    c,
    session,
    `/Item.json?upc=${encodeURIComponent(upc)}`,
  );
  const dupPayload = await readJson(dupResponse);
  if (dupResponse.ok) {
    const clash = allItems(dupPayload).find((item) => item.itemID !== itemId);
    if (clash) {
      return c.json(
        {
          error: `UPC already used by ${clash.description} (${clash.systemSku})`,
        },
        409,
      );
    }
  }

  const response = await lsApi(c, session, `/Item/${itemId}.json`, {
    method: "PUT",
    body: JSON.stringify({ upc }),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    return c.json({ error: apiError(payload, response.statusText) }, 502);
  }

  const item = firstItem(payload);
  if (!item) return c.json({ error: "Item not found" }, 404);
  return c.json({ item: publicItem(item) });
});

async function requireSession(
  c: ContextWithEnv,
): Promise<SessionData | Response> {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  return session;
}

type ContextWithEnv = Parameters<typeof readSession>[0];

type ItemResponse = { Item?: LightspeedItem | LightspeedItem[] };

async function readJson(response: Response): Promise<ItemResponse> {
  return (await response.json()) as ItemResponse;
}

function apiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = record.message ?? record.error;
    if (typeof message === "string") return message;
  }
  return fallback;
}

export function normalizeUpc(value: string): string | null {
  const digits = value.replaceAll(/\D/g, "");
  if (UPC_RE.test(digits)) return digits;
  if (digits.length === 13 && digits.startsWith("0") && UPC_RE.test(digits.slice(1))) {
    return digits.slice(1);
  }
  return null;
}

export default app;
