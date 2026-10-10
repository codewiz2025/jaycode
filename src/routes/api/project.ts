import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "../../../db/index.js";
import { projects, type StoredProjectFile } from "../../../db/schema.js";
import { verifiedUser } from "../../lib/email-verification";

const allowedLanguages = new Set([
  "html",
  "css",
  "javascript",
  "python",
  "json",
  "markdown",
  "plaintext",
]);

function isStoredFile(value: unknown): value is StoredProjectFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file["id"] === "string" &&
    file["id"].length > 0 &&
    typeof file["name"] === "string" &&
    file["name"].length > 0 &&
    file["name"].length <= 500 &&
    typeof file["language"] === "string" &&
    allowedLanguages.has(file["language"]) &&
    typeof file["content"] === "string"
  );
}

// Signed in AND email confirmed.
const authenticatedUser = (request: Request) => verifiedUser(request);

export const Route = createFileRoute("/api/project")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.userId, user.id))
          .limit(1);

        return Response.json(
          project
            ? {
                id: project.id,
                name: project.name,
                files: project.files,
                updatedAt: project.updatedAt.toISOString(),
              }
            : null,
          { headers: { "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json().catch(() => null)) as {
          name?: unknown;
          files?: unknown;
        } | null;
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        const files = Array.isArray(body?.files) ? body.files : [];
        const totalSize = files.reduce(
          (size, file) =>
            size +
            (typeof (file as { content?: unknown })?.content === "string"
              ? (file as { content: string }).content.length
              : 0),
          0,
        );

        if (!name || name.length > 120 || !files.length || files.length > 200) {
          return new Response("Invalid project", { status: 400 });
        }
        if (!files.every(isStoredFile) || totalSize > 5_000_000) {
          return new Response("Project files are invalid or too large", { status: 400 });
        }

        const [project] = await db
          .insert(projects)
          .values({ userId: user.id, name, files })
          .onConflictDoUpdate({
            target: projects.userId,
            set: { name, files, updatedAt: new Date() },
          })
          .returning();

        if (!project) return new Response("Project could not be saved", { status: 500 });

        return Response.json({
          id: project.id,
          name: project.name,
          files: project.files,
          updatedAt: project.updatedAt.toISOString(),
        });
      },
    },
  },
});
