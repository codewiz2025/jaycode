import { getUser } from "@netlify/identity";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "../../../../db/index.js";
import { emailVerifications } from "../../../../db/schema.js";
import {
  RESEND_COOLDOWN_MS,
  createToken,
  sendVerificationEmail,
} from "../../../lib/email-verification";

export const Route = createFileRoute("/api/auth/send-verification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getUser();
        if (!user?.id || !user.email) return new Response("Unauthorized", { status: 401 });

        const [existing] = await db
          .select()
          .from(emailVerifications)
          .where(eq(emailVerifications.userId, user.id))
          .limit(1);

        if (existing?.verifiedAt) return Response.json({ verified: true });

        if (existing?.lastSentAt) {
          const wait = existing.lastSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
          if (wait > 0) {
            return Response.json(
              { error: `Please wait ${Math.ceil(wait / 1000)}s before requesting another email.` },
              { status: 429 },
            );
          }
        }

        const origin = new URL(request.url).origin;
        const link = `${origin}/api/auth/verify?token=${encodeURIComponent(
          createToken(user.id, user.email),
        )}`;

        try {
          await sendVerificationEmail({
            to: user.email,
            ...(user.name ? { name: user.name } : {}),
            link,
          });
        } catch (error) {
          console.error(error);
          return Response.json({ error: "Could not send the email. Try again." }, { status: 502 });
        }

        await db
          .insert(emailVerifications)
          .values({ userId: user.id, email: user.email, lastSentAt: new Date() })
          .onConflictDoUpdate({
            target: emailVerifications.userId,
            set: { email: user.email, lastSentAt: new Date() },
          });

        return Response.json({ sent: true });
      },
    },
  },
});
