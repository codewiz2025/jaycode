import { createHmac, timingSafeEqual } from "node:crypto";

import { getUser } from "@netlify/identity";
import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { emailVerifications } from "../../db/schema.js";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // links are valid for 24 hours
export const RESEND_COOLDOWN_MS = 60 * 1000; // one email per minute per user

function secret(): string {
  const value = process.env["EMAIL_VERIFY_SECRET"] ?? process.env["RESEND_API_KEY"];
  if (!value) throw new Error("Set EMAIL_VERIFY_SECRET (or RESEND_API_KEY) in the environment.");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createToken(userId: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, email, exp: Date.now() + TOKEN_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string): { uid: string; email: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: unknown;
      email?: unknown;
      exp?: unknown;
    };
    if (typeof data.uid !== "string" || typeof data.email !== "string") return null;
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { uid: data.uid, email: data.email };
  } catch {
    return null;
  }
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
export async function verifiedUser() {
  const user = await getUser();
  if (!user?.id) return null;
  return (await isVerified(user.id)) ? user : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function sendVerificationEmail(opts: {
  to: string;
  name?: string;
  link: string;
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
      subject: "Confirm your JayCode email",
      html: `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#050816;color:#e6ecff;border-radius:12px">
        <h2 style="margin:0 0 12px;color:#fff">Jay<span style="color:#0b93ff">Code</span></h2>
        <p>${greeting}</p>
        <p>Confirm your email address to open your cloud workspace.</p>
        <p style="margin:24px 0"><a href="${opts.link}" style="background:#0b93ff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Confirm email</a></p>
        <p style="font-size:12px;color:#9aa8cc">This link expires in 24 hours. If the button doesn't work, paste this into your browser:<br>${opts.link}</p>
        <p style="font-size:12px;color:#9aa8cc">If you didn't create a JayCode account, ignore this email.</p>
      </div>`,
      text: `Confirm your JayCode email: ${opts.link}\n\nThis link expires in 24 hours.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend error ${response.status}: ${await response.text()}`);
  }
}
