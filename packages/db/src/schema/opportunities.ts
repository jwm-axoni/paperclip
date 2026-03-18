import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { signals } from "./signals.js";
import { agents } from "./agents.js";

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    signalId: uuid("signal_id").references(() => signals.id, { onDelete: "set null" }),
    clientName: text("client_name"),
    opportunityType: text("opportunity_type").notNull(),
    urgency: text("urgency").notNull().default("this_week"),
    brief: text("brief").notNull(),
    suggestedActions: jsonb("suggested_actions").$type<unknown[]>().default([]),
    status: text("status").notNull().default("pending"),
    approvedBy: text("approved_by"),
    assignedAgentId: uuid("assigned_agent_id").references(() => agents.id, { onDelete: "set null" }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("opportunities_company_status_idx").on(table.companyId, table.status),
    companyClientIdx: index("opportunities_company_client_idx").on(table.companyId, table.clientName),
    companyUrgencyIdx: index("opportunities_company_urgency_idx").on(table.companyId, table.urgency),
    companyCreatedAtIdx: index("opportunities_company_created_at_idx").on(table.companyId, table.createdAt),
    companyTypeIdx: index("opportunities_company_type_idx").on(table.companyId, table.opportunityType),
  }),
);
