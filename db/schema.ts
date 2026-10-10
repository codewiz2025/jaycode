import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export interface StoredProjectFile {
  id: string;
  name: string;
  language: "html" | "css" | "javascript" | "python" | "json" | "markdown" | "plaintext";
  content: string;
}

export const projects = pgTable("projects", {
  id: uuid().defaultRandom().primaryKey(),
  userId: text("user_id").notNull().unique(),
  name: text().notNull(),
  files: jsonb().$type<StoredProjectFile[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const emailVerifications = pgTable("email_verifications", {
  userId: text("user_id").primaryKey(),
  email: text().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
