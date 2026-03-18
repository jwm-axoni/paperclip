#!/usr/bin/env node

/**
 * External Cost → Paperclip Sync
 *
 * Polls external service APIs (OpenRouter, Apify, Apollo) for usage data
 * and records cost events in Paperclip's unified cost dashboard.
 *
 * Usage:
 *   node scripts/cost-sync.mjs              # Sync all providers
 *   node scripts/cost-sync.mjs openrouter   # Sync only OpenRouter
 *   node scripts/cost-sync.mjs apify        # Sync only Apify
 *   node scripts/cost-sync.mjs apollo       # Sync only Apollo
 *
 * State is tracked in ~/.openclaw/cost-sync-state.json to avoid duplicate entries.
 *
 * Environment (read from ~/.openclaw/.env):
 *   ENV_VARS_OPENROUTER_API_KEY  — OpenRouter API key
 *   APIFY_API_KEY                — Apify API token
 *   APOLLO_API_KEY               — Apollo API key
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PAPERCLIP_API = process.env.PAPERCLIP_API || "http://127.0.0.1:3100/api";
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || "e3e9f256-1c17-461c-8078-38a9d2b842a9";
const ENV_FILE = process.env.OPENCLAW_ENV || `${process.env.HOME}/.openclaw/.env`;
const STATE_FILE = process.env.COST_SYNC_STATE || `${process.env.HOME}/.openclaw/cost-sync-state.json`;

// ── Env loader ──

async function loadEnv() {
  const raw = await readFile(ENV_FILE, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

// ── State management ──

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveState(state) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Paperclip API helpers ──

async function paperclipApi(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${PAPERCLIP_API}${path}`, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Paperclip ${method} ${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getAgentMap() {
  const agents = await paperclipApi("GET", `/companies/${COMPANY_ID}/agents`);
  const byOpenclawName = new Map();
  for (const a of agents) {
    const name = a.metadata?.openclawName || a.name.toLowerCase();
    byOpenclawName.set(name, a);
  }
  return byOpenclawName;
}

async function postCostEvent(event) {
  return paperclipApi("POST", `/companies/${COMPANY_ID}/cost-events`, event);
}

// ── OpenRouter Sync ──
// Uses the auth/key endpoint for daily spend tracking.
// Records the daily delta as a cost event attributed to the "orion" agent (system-level).

async function syncOpenRouter(env, state, agentMap) {
  const key = env.ENV_VARS_OPENROUTER_API_KEY;
  if (!key) {
    console.log("  ⚠ OpenRouter: no API key found (ENV_VARS_OPENROUTER_API_KEY)");
    return 0;
  }

  console.log("  → OpenRouter: fetching usage...");

  const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.log(`  ✗ OpenRouter: API returned ${res.status}`);
    return 0;
  }

  const { data } = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  const usageDailyUsd = data.usage_daily || 0;
  const usageMonthlyUsd = data.usage_monthly || 0;

  // Track daily spend delta
  const prevDaily = state.openrouter?.lastDailyUsd || 0;
  const prevDate = state.openrouter?.lastDate || "";
  const prevMonthly = state.openrouter?.lastMonthlyUsd || 0;

  let deltaUsd = 0;
  if (prevDate === today) {
    // Same day — compute delta from last check
    deltaUsd = usageDailyUsd - prevDaily;
  } else {
    // New day — record full daily amount
    deltaUsd = usageDailyUsd;
  }

  // Update state
  state.openrouter = {
    lastDate: today,
    lastDailyUsd: usageDailyUsd,
    lastMonthlyUsd: usageMonthlyUsd,
    lastSyncAt: new Date().toISOString(),
  };

  if (deltaUsd <= 0) {
    console.log(`  ✓ OpenRouter: no new spend (daily: $${usageDailyUsd.toFixed(4)}, monthly: $${usageMonthlyUsd.toFixed(2)})`);
    return 0;
  }

  // Attribute to Orion as system-level LLM cost
  const orion = agentMap.get("orion");
  if (!orion) {
    console.log("  ✗ OpenRouter: orion agent not found in Paperclip");
    return 0;
  }

  const costCents = Math.round(deltaUsd * 100);
  if (costCents <= 0) {
    console.log(`  ✓ OpenRouter: delta too small ($${deltaUsd.toFixed(4)})`);
    return 0;
  }

  await postCostEvent({
    agentId: orion.id,
    provider: "openrouter",
    model: "aggregate",
    costCents,
    occurredAt: new Date().toISOString(),
  });

  console.log(`  ✓ OpenRouter: recorded $${deltaUsd.toFixed(4)} (${costCents}¢) → ${orion.name}`);
  return 1;
}

// ── Apify Sync ──
// Fetches recent actor runs and records each as a cost event.
// Maps runs to agents based on the actor being used.

// Map known Apify actor IDs to OpenClaw agent names
const APIFY_ACTOR_AGENT_MAP = {
  // Default mapping — most Apify runs come from prospector/outbound/ivy
  // We'll refine this based on actual actor names
};

function guessAgentForApifyRun(run) {
  // Use the actor name/title or meta to guess which agent triggered it
  const actorName = (run.actorName || run.actId || "").toLowerCase();
  const origin = run.meta?.origin || "";

  // Social media scrapers → ivy
  if (actorName.includes("instagram") || actorName.includes("facebook") ||
      actorName.includes("linkedin") || actorName.includes("twitter") ||
      actorName.includes("tiktok")) {
    return "ivy";
  }
  // Google Maps, company search → prospector
  if (actorName.includes("google") || actorName.includes("maps") ||
      actorName.includes("company") || actorName.includes("website")) {
    return "prospector";
  }
  // Email finders, enrichment → outbound
  if (actorName.includes("email") || actorName.includes("enrich") ||
      actorName.includes("apollo") || actorName.includes("hunter")) {
    return "outbound";
  }
  // Default to prospector for unknown actors
  return "prospector";
}

async function syncApify(env, state, agentMap) {
  const token = env.APIFY_API_KEY;
  if (!token) {
    console.log("  ⚠ Apify: no API key found (APIFY_API_KEY)");
    return 0;
  }

  console.log("  → Apify: fetching recent runs...");

  // Fetch last synced timestamp
  const lastSync = state.apify?.lastRunFinishedAt || "2026-01-01T00:00:00.000Z";

  // Fetch actor runs, most recent first
  const res = await fetch(
    `https://api.apify.com/v2/actor-runs?token=${token}&limit=100&desc=true`,
  );
  if (!res.ok) {
    console.log(`  ✗ Apify: API returned ${res.status}`);
    return 0;
  }

  const { data } = await res.json();
  const runs = data.items || [];

  // Also fetch actor details so we can map by name
  const actorCache = new Map();
  async function getActorName(actId) {
    if (actorCache.has(actId)) return actorCache.get(actId);
    try {
      const actRes = await fetch(`https://api.apify.com/v2/acts/${actId}?token=${token}`);
      if (actRes.ok) {
        const actData = await actRes.json();
        const name = actData.data?.name || actId;
        actorCache.set(actId, name);
        return name;
      }
    } catch { /* ignore */ }
    actorCache.set(actId, actId);
    return actId;
  }

  // Filter to runs completed after our last sync
  const newRuns = runs.filter(
    (r) => r.finishedAt && r.finishedAt > lastSync && r.status === "SUCCEEDED",
  );

  if (newRuns.length === 0) {
    console.log(`  ✓ Apify: no new completed runs since ${lastSync.slice(0, 19)}`);
    return 0;
  }

  let recorded = 0;
  let latestFinish = lastSync;

  for (const run of newRuns) {
    const costUsd = run.usageTotalUsd || 0;
    if (costUsd <= 0) continue;

    const actorName = await getActorName(run.actId);
    const agentName = guessAgentForApifyRun({ ...run, actorName });
    const agent = agentMap.get(agentName);

    if (!agent) {
      console.log(`  ⚠ Apify: agent '${agentName}' not found, skipping run ${run.id}`);
      continue;
    }

    const costCents = Math.max(1, Math.round(costUsd * 100));

    await postCostEvent({
      agentId: agent.id,
      provider: "apify",
      model: actorName,
      costCents,
      occurredAt: run.finishedAt,
    });

    recorded++;
    if (run.finishedAt > latestFinish) latestFinish = run.finishedAt;
    console.log(`  ✓ Apify: ${actorName} run → $${costUsd.toFixed(4)} (${costCents}¢) → ${agent.name}`);
  }

  state.apify = {
    lastRunFinishedAt: latestFinish,
    lastSyncAt: new Date().toISOString(),
    totalRunsSynced: (state.apify?.totalRunsSynced || 0) + recorded,
  };

  console.log(`  ✓ Apify: recorded ${recorded} of ${newRuns.length} new runs`);
  return recorded;
}

// ── Apollo Sync ──
// Apollo doesn't expose dollar costs via API. We track daily API call consumption
// and estimate credit costs based on Apollo's published pricing.
// Credit costs: ~$0.01 per enrichment credit (varies by plan).

const APOLLO_CREDIT_COST_USD = 0.01; // Approximate cost per credit

async function syncApollo(env, state, agentMap) {
  const key = env.APOLLO_API_KEY;
  if (!key) {
    console.log("  ⚠ Apollo: no API key found (APOLLO_API_KEY)");
    return 0;
  }

  console.log("  → Apollo: fetching usage stats...");

  const res = await fetch("https://api.apollo.io/api/v1/usage_stats/api_usage_stats", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    console.log(`  ✗ Apollo: API returned ${res.status}`);
    return 0;
  }

  const usageData = await res.json();
  const today = new Date().toISOString().slice(0, 10);

  // Sum up daily consumed calls across credit-consuming endpoints
  const creditEndpoints = [
    '["api/v1/contacts", "search"]',
    '["api/v1/contacts", "intelligent_fuzzy_search"]',
    '["api/v1/contacts", "match"]',
    '["api/v1/contacts", "bulk_match"]',
  ];

  let totalConsumedToday = 0;
  for (const endpoint of creditEndpoints) {
    const stats = usageData[endpoint];
    if (stats?.day?.consumed) {
      totalConsumedToday += stats.day.consumed;
    }
  }

  // Compare with last recorded value
  const prevConsumed = state.apollo?.lastDayConsumed || 0;
  const prevDate = state.apollo?.lastDate || "";

  let deltaCredits = 0;
  if (prevDate === today) {
    deltaCredits = totalConsumedToday - prevConsumed;
  } else {
    deltaCredits = totalConsumedToday;
  }

  state.apollo = {
    lastDate: today,
    lastDayConsumed: totalConsumedToday,
    lastSyncAt: new Date().toISOString(),
  };

  if (deltaCredits <= 0) {
    console.log(`  ✓ Apollo: no new credit consumption (today: ${totalConsumedToday} calls)`);
    return 0;
  }

  // Attribute to outbound agent (primary Apollo user)
  const outbound = agentMap.get("outbound");
  if (!outbound) {
    console.log("  ✗ Apollo: outbound agent not found in Paperclip");
    return 0;
  }

  const costUsd = deltaCredits * APOLLO_CREDIT_COST_USD;
  const costCents = Math.max(1, Math.round(costUsd * 100));

  await postCostEvent({
    agentId: outbound.id,
    provider: "apollo",
    model: "api-credits",
    costCents,
    occurredAt: new Date().toISOString(),
  });

  console.log(`  ✓ Apollo: ${deltaCredits} credits → $${costUsd.toFixed(4)} (${costCents}¢) → ${outbound.name}`);
  return 1;
}

// ── Main ──

const PROVIDERS = { openrouter: syncOpenRouter, apify: syncApify, apollo: syncApollo };

async function main() {
  const target = process.argv[2]; // Optional: specific provider
  const providers = target
    ? { [target]: PROVIDERS[target] }
    : PROVIDERS;

  if (target && !PROVIDERS[target]) {
    console.error(`Unknown provider: ${target}`);
    console.error(`Available: ${Object.keys(PROVIDERS).join(", ")}`);
    process.exit(1);
  }

  console.log("=== External Cost → Paperclip Sync ===\n");

  const env = await loadEnv();
  const state = await loadState();
  const agentMap = await getAgentMap();

  console.log(`Agents: ${agentMap.size} registered`);
  console.log(`Providers: ${Object.keys(providers).join(", ")}\n`);

  let totalRecorded = 0;

  for (const [name, syncFn] of Object.entries(providers)) {
    try {
      const count = await syncFn(env, state, agentMap);
      totalRecorded += count;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  await saveState(state);
  console.log(`\nDone. ${totalRecorded} cost event(s) recorded.`);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
