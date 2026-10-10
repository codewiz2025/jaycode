import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "../../../../db/index.js";
import { emailVerifications } from "../../../../db/schema.js";
import { MAX_ATTEMPTS, codeMatches, currentUser } from "../../../lib/email-verification";

export const Route = createFileRoute("/api/auth/verify-code")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { user, reason } = await currentUser(request);
        if (!user) return Response.json({ error: "Not signed in", reason }, { status: 401 });

        const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
        const code = typeof body?.code === "string" ? body.code.trim() : "";
        if (!/^\d{6}$/.test(code)) {
          return Response.json({ error: "Enter the 6-digit code." }, { status: 400 });
        }

        const [row] = await db
          .select()
          .from(emailVerifications)
          .where(eq(emailVerifications.userId, user.id))
          .limit(1);

        if (row?.verifiedAt) return Response.json({ verified: true });
        if (!row?.codeHash || !row.codeExpiresAt || row.codeExpiresAt.getTime() < Date.now()) {
          return Response.json(
            { error: "That code has expired. Request a new one." },
            { status: 400 },
          );
        }
        if (row.attempts >= MAX_ATTEMPTS) {
          return Response.json(
            { error: "Too many wrong attempts. Request a new code." },
            { status: 429 },
          );
        }

        if (!codeMatches(user.id, code, row.codeHash)) {
          await db
            .update(emailVerifications)
            .set({ attempts: row.attempts + 1 })
            .where(eq(emailVerifications.userId, user.id));
          return Response.json({ error: "Incorrect code. Please try again." }, { status: 400 });
        }

        await db
          .update(emailVerifications)
          .set({ verifiedAt: new Date(), codeHash: null, codeExpiresAt: null, attempts: 0 })
          .where(eq(emailVerifications.userId, user.id));

        return Response.json({ verified: true });
      },
    },
  },
});
