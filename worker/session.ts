import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { seal, unseal } from "./crypto";
import type { Env, SessionData } from "./types";

const COOKIE = "mr_session";
const MAX_AGE = 60 * 60 * 24 * 30;

type AppContext = Context<{ Bindings: Env }>;

function cookieOpts(c: AppContext) {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE,
  } as const;
}

export async function readSession(c: AppContext): Promise<SessionData | null> {
  const raw = getCookie(c, COOKIE);
  if (!raw) return null;
  return unseal<SessionData>(raw, c.env.AUTH_SECRET);
}

export async function writeSession(c: AppContext, session: SessionData) {
  setCookie(c, COOKIE, await seal(session, c.env.AUTH_SECRET), cookieOpts(c));
}

export function clearSession(c: AppContext) {
  deleteCookie(c, COOKIE, { path: "/" });
}
