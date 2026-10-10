import { getUser } from "@netlify/identity";
import { createFileRoute } from "@tanstack/react-router";

import { isVerified } from "../../../lib/email-verification";

export const Route = createFileRoute("/api/auth/status")({
  server: {
    handlers: {
      GET: async () => {
        const user = await getUser();
        if (!user?.id) return new Response("Unauthorized", { status: 401 });
        return Response.json(
          { verified: await isVerified(user.id) },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
