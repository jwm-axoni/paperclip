import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { signals, opportunities } from "@paperclipai/db";

export function signalService(db: Db) {
  return {
    listSignals: async (
      companyId: string,
      opts?: {
        limit?: number;
        offset?: number;
        vertical?: string;
        severity?: string;
        processed?: boolean;
        source?: string;
      },
    ) => {
      const conditions: SQL[] = [eq(signals.companyId, companyId)];
      if (opts?.vertical) conditions.push(eq(signals.vertical, opts.vertical));
      if (opts?.severity) conditions.push(eq(signals.severity, opts.severity));
      if (opts?.processed !== undefined) conditions.push(eq(signals.processed, opts.processed));
      if (opts?.source) conditions.push(eq(signals.source, opts.source));

      return db
        .select()
        .from(signals)
        .where(and(...conditions))
        .orderBy(desc(signals.createdAt))
        .limit(opts?.limit ?? 50)
        .offset(opts?.offset ?? 0);
    },

    getSignalStats: async (companyId: string) => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(signals)
        .where(eq(signals.companyId, companyId));

      const [todayRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(signals)
        .where(and(eq(signals.companyId, companyId), gte(signals.createdAt, todayStart)));

      const [unprocessedRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(signals)
        .where(and(eq(signals.companyId, companyId), eq(signals.processed, false)));

      const recentRows = await db
        .select({ severity: signals.severity, source: signals.source })
        .from(signals)
        .where(eq(signals.companyId, companyId))
        .orderBy(desc(signals.createdAt))
        .limit(500);

      const bySeverity: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      for (const row of recentRows) {
        bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
        bySource[row.source] = (bySource[row.source] ?? 0) + 1;
      }

      return {
        total: Number(totalRow?.count ?? 0),
        today: Number(todayRow?.count ?? 0),
        unprocessed: Number(unprocessedRow?.count ?? 0),
        bySeverity,
        bySource,
      };
    },

    createSignal: async (data: {
      companyId: string;
      source: string;
      signalType: string;
      title: string;
      content?: string;
      url?: string;
      vertical?: string;
      geography?: string;
      severity?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const [row] = await db
        .insert(signals)
        .values({
          companyId: data.companyId,
          source: data.source,
          signalType: data.signalType,
          title: data.title,
          content: data.content ?? null,
          url: data.url ?? null,
          vertical: data.vertical ?? null,
          geography: data.geography ?? null,
          severity: data.severity ?? "normal",
          metadata: data.metadata ?? {},
        })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    },

    createSignalsBatch: async (
      rows: Array<{
        companyId: string;
        source: string;
        signalType: string;
        title: string;
        content?: string;
        url?: string;
        vertical?: string;
        geography?: string;
        severity?: string;
        metadata?: Record<string, unknown>;
      }>,
    ) => {
      if (rows.length === 0) return [];
      return db
        .insert(signals)
        .values(
          rows.map((r) => ({
            companyId: r.companyId,
            source: r.source,
            signalType: r.signalType,
            title: r.title,
            content: r.content ?? null,
            url: r.url ?? null,
            vertical: r.vertical ?? null,
            geography: r.geography ?? null,
            severity: r.severity ?? "normal",
            metadata: r.metadata ?? {},
          })),
        )
        .onConflictDoNothing()
        .returning();
    },

    markProcessed: async (companyId: string, signalIds: string[]) => {
      if (signalIds.length === 0) return 0;
      const rows = await db
        .update(signals)
        .set({ processed: true })
        .where(
          and(
            eq(signals.companyId, companyId),
            inArray(signals.id, signalIds),
          ),
        )
        .returning({ id: signals.id });
      return rows.length;
    },

    // ─── Opportunities ────────────────────────────────────────────────────

    listOpportunities: async (
      companyId: string,
      opts?: {
        limit?: number;
        offset?: number;
        status?: string;
        client?: string;
        urgency?: string;
      },
    ) => {
      const conditions: SQL[] = [eq(opportunities.companyId, companyId)];
      if (opts?.status) conditions.push(eq(opportunities.status, opts.status));
      if (opts?.client) conditions.push(eq(opportunities.clientName, opts.client));
      if (opts?.urgency) conditions.push(eq(opportunities.urgency, opts.urgency));

      return db
        .select()
        .from(opportunities)
        .where(and(...conditions))
        .orderBy(desc(opportunities.createdAt))
        .limit(opts?.limit ?? 50)
        .offset(opts?.offset ?? 0);
    },

    getOpportunityStats: async (companyId: string) => {
      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(eq(opportunities.companyId, companyId));

      const [pendingRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(and(eq(opportunities.companyId, companyId), eq(opportunities.status, "pending")));

      const [approvedRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(and(eq(opportunities.companyId, companyId), eq(opportunities.status, "approved")));

      const [executedRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(and(eq(opportunities.companyId, companyId), eq(opportunities.status, "executed")));

      const recentRows = await db
        .select({ opportunityType: opportunities.opportunityType, clientName: opportunities.clientName })
        .from(opportunities)
        .where(eq(opportunities.companyId, companyId))
        .orderBy(desc(opportunities.createdAt))
        .limit(200);

      const byType: Record<string, number> = {};
      const byClient: Record<string, number> = {};
      for (const row of recentRows) {
        byType[row.opportunityType] = (byType[row.opportunityType] ?? 0) + 1;
        if (row.clientName) byClient[row.clientName] = (byClient[row.clientName] ?? 0) + 1;
      }

      return {
        total: Number(totalRow?.count ?? 0),
        pending: Number(pendingRow?.count ?? 0),
        approved: Number(approvedRow?.count ?? 0),
        executed: Number(executedRow?.count ?? 0),
        byType,
        byClient,
      };
    },

    createOpportunity: async (data: {
      companyId: string;
      signalId?: string;
      clientName?: string;
      opportunityType: string;
      urgency?: string;
      brief: string;
      suggestedActions?: unknown[];
      assignedAgentId?: string;
    }) => {
      const [row] = await db
        .insert(opportunities)
        .values({
          companyId: data.companyId,
          signalId: data.signalId ?? null,
          clientName: data.clientName ?? null,
          opportunityType: data.opportunityType,
          urgency: data.urgency ?? "this_week",
          brief: data.brief,
          suggestedActions: data.suggestedActions ?? [],
          assignedAgentId: data.assignedAgentId ?? null,
        })
        .returning();
      return row!;
    },

    updateOpportunityStatus: async (companyId: string, opportunityId: string, status: string, approvedBy?: string) => {
      const updates: Record<string, unknown> = { status, updatedAt: new Date() };
      if (approvedBy) updates.approvedBy = approvedBy;
      if (status === "executed") updates.executedAt = new Date();

      const [row] = await db
        .update(opportunities)
        .set(updates)
        .where(and(eq(opportunities.id, opportunityId), eq(opportunities.companyId, companyId)))
        .returning();
      return row ?? null;
    },
  };
}
