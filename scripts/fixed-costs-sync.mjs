#!/usr/bin/env node

/**
 * Fixed monthly subscriptions → Paperclip cost events.
 *
 * Records daily prorated subscription costs once per day so Paperclip's
 * dashboard reflects fixed spend alongside usage-based costs.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const PAPERCLIP_API = process.env.PAPERCLIP_API || "http://127.0.0.1:3100/api";
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || "e3e9f256-1c17-461c-8078-38a9d2b842a9";
const STATE_FILE =
  process.env.FIXED_COST_SYNC_STATE || `${process.env.HOME}/.openclaw/fixed-costs-sync-state.json`;
const DEFAULT_TZ = process.env.FIXED_COST_SYNC_TZ || "America/New_York";

const FIXED_COSTS = [
  {
    name: "Claude Code",
    provider: "anthropic",
    model: "claude-code-subscription",
    costCents: 667,
    agentOpenclawName: "orion",
  },
  {
    name: "Apify",
    provider: "apify",
    model: "subscription-plan",
    costCents: 97,
    agentOpenclawName: "ivy",
  },
  {
    name: "Apollo",
    provider: "apollo",
    model: "subscription-plan",
    costCents: 333,
    agentOpenclawName: "outbound",
  },
  {
    name: "ChatGPT Business",
    provider: "openai",
    model: "chatgpt-business-2-users",
    costCents: 200,
    agentOpenclawName: "orion",
  },
];

function getDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function getEventKey(definition) {
  return `${definition.provider}:${definition.model}:${definition.agentOpenclawName}`;
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { days: {} };
  }
}

async function saveState(state) {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function paperclipApi(method, path, body) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${PAPERCLIP_API}${path}`, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Paperclip ${method} ${path} → ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function getAgentMap() {
  const agents = await paperclipApi("GET", `/companies/${COMPANY_ID}/agents`);
  const agentMap = new Map();

  for (const agent of agents) {
    const key = agent.metadata?.openclawName || agent.name.toLowerCase();
    agentMap.set(key, agent);
  }

  return agentMap;
}

async function postCostEvent(event) {
  return paperclipApi("POST", `/companies/${COMPANY_ID}/cost-events`, event);
}

async function main() {
  console.log("=== Fixed Subscription Costs → Paperclip Sync ===\n");

  const state = await loadState();
  const agentMap = await getAgentMap();
  const dateKey = getDateKey();
  const dayState = state.days[dateKey] || { recorded: [] };
  const recorded = new Set(dayState.recorded);

  let created = 0;

  for (const fixedCost of FIXED_COSTS) {
    const eventKey = getEventKey(fixedCost);
    if (recorded.has(eventKey)) {
      console.log(`  ✓ ${fixedCost.name}: already recorded for ${dateKey}`);
      continue;
    }

    const agent = agentMap.get(fixedCost.agentOpenclawName);
    if (!agent) {
      throw new Error(`Agent '${fixedCost.agentOpenclawName}' not found in Paperclip`);
    }

    await postCostEvent({
      agentId: agent.id,
      provider: fixedCost.provider,
      model: fixedCost.model,
      billingCode: "fixed-monthly-subscription",
      costCents: fixedCost.costCents,
      occurredAt: new Date().toISOString(),
    });

    recorded.add(eventKey);
    state.days[dateKey] = {
      recorded: [...recorded],
      lastSyncAt: new Date().toISOString(),
    };
    await saveState(state);

    console.log(
      `  ✓ ${fixedCost.name}: recorded ${fixedCost.costCents}¢ → ${agent.name} (${fixedCost.provider}/${fixedCost.model})`,
    );
    created += 1;
  }

  console.log(`\nDone. ${created} fixed cost event(s) recorded for ${dateKey}.`);
}

main().catch((error) => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});
