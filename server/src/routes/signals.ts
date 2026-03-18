import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { signalService } from "../services/signals.js";
import { assertCompanyAccess } from "./authz.js";

export function signalRoutes(db: Db) {
  const router = Router();
  const svc = signalService(db);

  // ─── Signals ───────────────────────────────────────────────────────────

  router.get("/companies/:companyId/signals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const list = await svc.listSignals(companyId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      vertical: req.query.vertical as string | undefined,
      severity: req.query.severity as string | undefined,
      processed: req.query.processed === "true" ? true : req.query.processed === "false" ? false : undefined,
      source: req.query.source as string | undefined,
    });
    res.json(list);
  });

  router.get("/companies/:companyId/signals/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const stats = await svc.getSignalStats(companyId);
    res.json(stats);
  });

  router.post("/companies/:companyId/signals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body;

    if (Array.isArray(body)) {
      const rows = await svc.createSignalsBatch(
        body.map((item: Record<string, unknown>) => ({
          companyId,
          source: item.source as string,
          signalType: item.signal_type as string ?? item.signalType as string,
          title: item.title as string,
          content: item.content as string | undefined,
          url: item.url as string | undefined,
          vertical: item.vertical as string | undefined,
          geography: item.geography as string | undefined,
          severity: item.severity as string | undefined,
          metadata: item.metadata as Record<string, unknown> | undefined,
        })),
      );
      res.status(201).json({ inserted: rows.length, signals: rows });
    } else {
      const row = await svc.createSignal({
        companyId,
        source: body.source,
        signalType: body.signal_type ?? body.signalType,
        title: body.title,
        content: body.content,
        url: body.url,
        vertical: body.vertical,
        geography: body.geography,
        severity: body.severity,
        metadata: body.metadata,
      });
      if (row) {
        res.status(201).json(row);
      } else {
        res.status(200).json({ message: "Signal already exists (duplicate URL)" });
      }
    }
  });

  router.post("/companies/:companyId/signals/mark-processed", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: "ids must be an array of signal UUIDs" });
      return;
    }
    const count = await svc.markProcessed(companyId, ids);
    res.json({ processed: count });
  });

  // ─── Opportunities ────────────────────────────────────────────────────

  router.get("/companies/:companyId/opportunities", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const list = await svc.listOpportunities(companyId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      status: req.query.status as string | undefined,
      client: req.query.client as string | undefined,
      urgency: req.query.urgency as string | undefined,
    });
    res.json(list);
  });

  router.get("/companies/:companyId/opportunities/stats", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const stats = await svc.getOpportunityStats(companyId);
    res.json(stats);
  });

  router.post("/companies/:companyId/opportunities", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body;
    const row = await svc.createOpportunity({
      companyId,
      signalId: body.signal_id ?? body.signalId,
      clientName: body.client_name ?? body.clientName,
      opportunityType: body.opportunity_type ?? body.opportunityType,
      urgency: body.urgency,
      brief: body.brief,
      suggestedActions: body.suggested_actions ?? body.suggestedActions,
      assignedAgentId: body.assigned_agent_id ?? body.assignedAgentId,
    });
    res.status(201).json(row);
  });

  router.patch("/companies/:companyId/opportunities/:opportunityId/status", async (req, res) => {
    const companyId = req.params.companyId as string;
    const opportunityId = req.params.opportunityId as string;
    assertCompanyAccess(req, companyId);
    const { status, approved_by, approvedBy } = req.body;
    if (!status) {
      res.status(400).json({ error: "status is required" });
      return;
    }
    const row = await svc.updateOpportunityStatus(companyId, opportunityId, status, approved_by ?? approvedBy);
    if (!row) {
      res.status(404).json({ error: "Opportunity not found" });
      return;
    }
    res.json(row);
  });

  return router;
}
