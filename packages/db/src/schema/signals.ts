import { pgTable, uuid, text, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    source: text("source").notNull(),
    signalType: text("signal_type").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    url: text("url"),
    vertical: text("vertical"),
    geography: text("geography"),
    severity: text("severity").notNull().default("normal"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    processed: boolean("processed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProcessedIdx: index("signals_company_processed_idx").on(table.companyId, table.processed),
    companyCreatedAtIdx: index("signals_company_created_at_idx").on(table.companyId, table.createdAt),
    companySourceIdx: index("signals_company_source_idx").on(table.companyId, table.source),
    companyVerticalIdx: index("signals_company_vertical_idx").on(table.companyId, table.vertical),
    companySeverityIdx: index("signals_company_severity_idx").on(table.companyId, table.severity),
    urlDedup: uniqueIndex("signals_url_dedup").on(table.companyId, table.url),
  }),
);
