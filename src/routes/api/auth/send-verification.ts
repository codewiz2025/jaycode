import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "../../../../db/index.js";
import { emailVerifications } from "../../../../db/schema.js";
import {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  currentUser,
  generateCode,
  hashCode,
  sendVerificationEmail,
} from "../../../lib/email-verification";

export const Route = createFileRoute("/api/auth/send-verification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { user, reason } = await currentUser(request);
        if (!user?.email) return Response.json({ error: "Not signed in", reason }, { status: 401 });

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
              { error: `Please wait ${Math.ceil(wait / 1000)}s before requesting another code.` },
              { status: 429 },
            );
          }
        }

        const code = generateCode();
        try {
          await sendVerificationEmail({ to: user.email, name: user.name, code });
        } catch (error) {
          console.error(error);
          return Response.json({ error: "Could not send the email. Try again." }, { status: 502 });
        }

        const fields = {
          email: user.email,
          lastSentAt: new Date(),
          codeHash: hashCode(user.id, code),
          codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
          attempts: 0,
        };
        await db
          .insert(emailVerifications)
          .values({ userId: user.id, ...fields })
          .onConflictDoUpdate({ target: emailVerifications.userId, set: fields });

        return Response.json({ sent: true });
      },
    },
  },
});
