import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "../../../../db/index.js";
import { emailVerifications } from "../../../../db/schema.js";
import { currentUser } from "../../../lib/email-verification";

export const Route = createFileRoute("/api/auth/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user, reason } = await currentUser(request);
        if (!user) return Response.json({ error: "Not signed in", reason }, { status: 401 });

        const [row] = await db
          .select()
          .from(emailVerifications)
          .where(eq(emailVerifications.userId, user.id))
          .limit(1);

        return Response.json(
          {
            verified: Boolean(row?.verifiedAt),
            codeSent: Boolean(row?.codeHash || row?.verifiedAt),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
