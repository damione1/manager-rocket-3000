import type { Context } from "hono";
import { writeSession } from "./session";
import type { Env, LightspeedItem, PublicItem, SessionData } from "./types";

const API = "https://api.lightspeedapp.com/API/V3";
const TOKEN_URL = "https://cloud.lightspeedapp.com/auth/oauth/token";
const AUTHORIZE_URL = "https://cloud.lightspeedapp.com/auth/oauth/authorize";
const SCOPE = "employee:inventory";

type AppContext = Context<{ Bindings: Env }>;

type TokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
};

type ItemPayload = {
  Item?: LightspeedItem | LightspeedItem[];
};

export function publicItem(item: LightspeedItem): PublicItem {
  return {
    itemID: item.itemID,
    systemSku: item.systemSku,
    description: item.description,
    upc: item.upc ?? "",
    customSku: item.customSku ?? "",
    manufacturerSku: item.manufacturerSku ?? "",
  };
}

export function firstItem(payload: ItemPayload): LightspeedItem | null {
  const item = payload.Item;
  if (!item) return null;
  return Array.isArray(item) ? (item[0] ?? null) : item;
}

export function allItems(payload: ItemPayload): LightspeedItem[] {
  const item = payload.Item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function redirectUri(c: AppContext): string {
  return new URL("/api/auth/callback", c.req.url).toString();
}

export async function exchangeCode(
  env: Env,
  code: string,
  redirect: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  return tokenRequest(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
    code_verifier: codeVerifier,
  });
}

export async function refreshTokens(
  env: Env,
  refreshToken: string,
): Promise<TokenResponse> {
  return tokenRequest(env, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function tokenRequest(
  env: Env,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.LIGHTSPEED_CLIENT_ID,
      client_secret: env.LIGHTSPEED_CLIENT_SECRET,
      ...body,
    }),
  });
  const json: unknown = await response.json();
  if (!response.ok) {
    throw new Error(errorMessage(json, response.statusText));
  }
  return json as TokenResponse;
}

export async function loadProfile(
  accessToken: string,
): Promise<Pick<SessionData, "accountId" | "name" | "shopName" | "email">> {
  const session = await lsGet<{
    systemCustomerID?: string;
    systemCustomerName?: string;
    systemUserLogin?: string;
    Employee?: { firstName?: string; lastName?: string };
  }>(accessToken, `${API}/Session.json`);

  const account = await lsGet<{
    Account?: { accountID?: string; name?: string } | Array<{ accountID?: string; name?: string }>;
  }>(accessToken, `${API}/Account.json`);

  const accounts = account.Account;
  const firstAccount = Array.isArray(accounts) ? accounts[0] : accounts;
  const accountId = firstAccount?.accountID ?? session.systemCustomerID;
  if (!accountId) throw new Error("Could not resolve Lightspeed account ID");

  const firstName = session.Employee?.firstName ?? "";
  const lastName = session.Employee?.lastName ?? "";

  return {
    accountId,
    name: `${firstName} ${lastName}`.trim() || session.systemUserLogin || "Employee",
    shopName: firstAccount?.name ?? session.systemCustomerName ?? "",
    email: session.systemUserLogin ?? "",
  };
}

export async function lsApi(
  c: AppContext,
  session: SessionData,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${API}/Account/${session.accountId}${path}`;
  let accessToken = session.accessToken;

  if (Date.now() >= session.accessTokenExpires - 30_000) {
    accessToken = await rotate(c, session);
  }

  let response = await fetch(url, withAuth(init, accessToken));
  if (response.status === 401) {
    accessToken = await rotate(c, session);
    response = await fetch(url, withAuth(init, accessToken));
  }
  return response;
}

async function rotate(c: AppContext, session: SessionData): Promise<string> {
  const tokens = await refreshTokens(c.env, session.refreshToken);
  session.accessToken = tokens.access_token;
  session.refreshToken = tokens.refresh_token ?? session.refreshToken;
  session.accessTokenExpires = Date.now() + tokens.expires_in * 1000;
  await writeSession(c, session);
  return session.accessToken;
}

function withAuth(init: RequestInit, accessToken: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");
  return { ...init, headers };
}

async function lsGet<T>(accessToken: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const json: unknown = await response.json();
  if (!response.ok) {
    throw new Error(errorMessage(json, response.statusText));
  }
  return json as T;
}

function errorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const key of ["error_description", "hint", "message", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value) return value;
    }
  }
  return fallback;
}
