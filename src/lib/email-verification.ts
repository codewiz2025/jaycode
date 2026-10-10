import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { getUser } from "@netlify/identity";
import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { emailVerifications } from "../../db/schema.js";

export const CODE_TTL_MS = 10 * 60 * 1000; // codes are valid for 10 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000; // one email per minute per user
export const MAX_ATTEMPTS = 5;

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Resolve the signed-in Identity user for an API request. Uses the Identity SDK first and
 * falls back to asking the Identity endpoint directly with the `nf_jwt` cookie.
 */
export async function currentUser(
  request: Request,
): Promise<{ user: SessionUser; reason?: undefined } | { user: null; reason: string }> {
  try {
    const user = await getUser();
    if (user?.id) {
      return { user: { id: user.id, email: user.email ?? null, name: user.name ?? null } };
    }
  } catch (error) {
    console.error("getUser failed", error);
  }

  const match = /(?:^|;\s*)nf_jwt=([^;]*)/.exec(request.headers.get("cookie") ?? "");
  if (!match?.[1]) return { user: null, reason: "no-session-cookie" };

  try {
    const response = await fetch(new URL("/.netlify/identity/user", request.url), {
      headers: { Authorization: `Bearer ${decodeURIComponent(match[1])}` },
    });
    if (!response.ok) return { user: null, reason: `identity-${response.status}` };
    const data = (await response.json()) as {
      id?: string;
      email?: string;
      user_metadata?: { full_name?: string };
    };
    if (!data.id) return { user: null, reason: "identity-no-id" };
    return {
      user: { id: data.id, email: data.email ?? null, name: data.user_metadata?.full_name ?? null },
    };
  } catch (error) {
    console.error("identity lookup failed", error);
    return { user: null, reason: "identity-unreachable" };
  }
}

function secret(): string {
  const value = process.env["EMAIL_VERIFY_SECRET"] ?? process.env["RESEND_API_KEY"];
  if (!value) throw new Error("Set EMAIL_VERIFY_SECRET (or RESEND_API_KEY) in the environment.");
  return value;
}

export function hashCode(userId: string, code: string): string {
  return createHmac("sha256", secret()).update(`${userId}:${code}`).digest("hex");
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function codeMatches(userId: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(userId, code));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isVerified(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ verifiedAt: emailVerifications.verifiedAt })
    .from(emailVerifications)
    .where(eq(emailVerifications.userId, userId))
    .limit(1);
  return Boolean(row?.verifiedAt);
}

/** Signed-in AND email-confirmed user, or null. */
export async function verifiedUser(request: Request) {
  const { user } = await currentUser(request);
  if (!user) return null;
  return (await isVerified(user.id)) ? user : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function sendVerificationEmail(opts: {
  to: string;
  name: string | null;
  code: string;
}): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");

  const from = process.env["EMAIL_FROM"] ?? "JayCode <onboarding@resend.dev>";
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: `${opts.code} is your JayCode verification code`,
      html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#050816;color:#e6ecff;border-radius:12px">
        <h2 style="margin:0 0 12px;color:#fff">Jay<span style="color:#0b93ff">Code</span></h2>
        <p>${greeting}</p>
        <p>Enter this code to verify your email and open your cloud workspace:</p>
        <p style="margin:24px 0;font-size:34px;font-weight:700;letter-spacing:10px;color:#fff;background:#0b1230;border:1px solid #1d2a5c;border-radius:10px;padding:14px;text-align:center">${opts.code}</p>
        <p style="font-size:12px;color:#9aa8cc">This code expires in 10 minutes. If you didn't create a JayCode account, ignore this email.</p>
      </div>`,
      text: `Your JayCode verification code is ${opts.code}. It expires in 10 minutes.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend error ${response.status}: ${await response.text()}`);
  }
}
