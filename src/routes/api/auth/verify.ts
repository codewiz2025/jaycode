import { createFileRoute } from "@tanstack/react-router";

import { db } from "../../../../db/index.js";
import { emailVerifications } from "../../../../db/schema.js";
import { readToken } from "../../../lib/email-verification";

export const Route = createFileRoute("/api/auth/verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const data = readToken(url.searchParams.get("token") ?? "");
        const redirect = (status: string) =>
          new Response(null, { status: 302, headers: { Location: `/?email=${status}` } });

        if (!data) return redirect("invalid");

        await db
          .insert(emailVerifications)
          .values({ userId: data.uid, email: data.email, verifiedAt: new Date() })
          .onConflictDoUpdate({
            target: emailVerifications.userId,
            set: { email: data.email, verifiedAt: new Date() },
          });

        return redirect("verified");
      },
    },
  },
});
