#!/usr/bin/env node

/**
 * OpenClaw → Paperclip Agent Bridge
 *
 * Registers all OpenClaw agents in Paperclip and syncs their live status
 * from the OpenClaw gateway WebSocket.
 *
 * Usage:
 *   node scripts/openclaw-sync.mjs register   # One-time: create agents + org chart
 *   node scripts/openclaw-sync.mjs sync       # Periodic: update agent statuses from gateway
 *   node scripts/openclaw-sync.mjs            # Default: sync
 */

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Resolve ws from the server package where it's a direct dependency
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRequire = createRequire(resolve(__dirname, "../server/package.json"));
const WebSocket = serverRequire("ws");

const PAPERCLIP_API = process.env.PAPERCLIP_API || "http://127.0.0.1:3100/api";
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID || "e3e9f256-1c17-461c-8078-38a9d2b842a9";
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || `${process.env.HOME}/.openclaw/openclaw.json`;
const OPENCLAW_GATEWAY = process.env.OPENCLAW_GATEWAY || "ws://127.0.0.1:18789";

// ── Agent Definitions ──
// Maps OpenClaw agent names to Paperclip schema fields.
// reportsToName is resolved to UUID after creation.
const AGENT_DEFS = [
  {
    name: "Orion",
    openclawName: "orion",
    role: "cto",
    title: "Executive AI — CTO/Advisor",
    icon: "terminal",
    capabilities: "Strategic planning, system architecture, project management, Telegram bot interface",
    department: "Executive",
    reportsToName: null,
  },
  {
    name: "Aida",
    openclawName: "aida",
    role: "pm",
    title: "Operations Lead",
    icon: "brain",
    capabilities: "Primary Slack assistant, task management, scheduling, client communications",
    department: "Operations",
    reportsToName: "Orion",
  },
  {
    name: "Lizzy",
    openclawName: "lizzy",
    role: "general",
    title: "DM & Slack Assistant",
    icon: "message-square",
    capabilities: "Direct messages, Slack DM handling, quick responses",
    department: "Operations",
    reportsToName: "Aida",
  },
  {
    name: "Artemis",
    openclawName: "artemis",
    role: "general",
    title: "Channel Mention Handler",
    icon: "zap",
    capabilities: "Slack channel mention responses, #ai-artemis channel monitoring",
    department: "Operations",
    reportsToName: "Aida",
  },
  {
    name: "Coolio",
    openclawName: "coolio",
    role: "general",
    title: "Slack Workspace Agent",
    icon: "bot",
    capabilities: "Slack workspace management, automated workflows",
    department: "Operations",
    reportsToName: "Aida",
  },
  {
    name: "Outbound",
    openclawName: "outbound",
    role: "general",
    title: "Sales Lead — Prospecting",
    icon: "target",
    capabilities: "Sales outreach, lead generation, cold outreach automation",
    department: "Sales",
    reportsToName: "Orion",
  },
  {
    name: "Prospector",
    openclawName: "prospector",
    role: "researcher",
    title: "Lead Qualification Researcher",
    icon: "search",
    capabilities: "Lead research, prospect qualification, company intel gathering",
    department: "Sales",
    reportsToName: "Outbound",
  },
  {
    name: "Qualifier",
    openclawName: "qualifier",
    role: "general",
    title: "Inquiry Qualification",
    icon: "eye",
    capabilities: "Inbound inquiry assessment, lead scoring, qualification routing",
    department: "Sales",
    reportsToName: "Outbound",
  },
  {
    name: "Ivy",
    openclawName: "ivy",
    role: "cmo",
    title: "Social Media Engagement",
    icon: "sparkles",
    capabilities: "Social media engagement, content scheduling, LinkedIn/Instagram management",
    department: "Marketing",
    reportsToName: "Orion",
  },
];

// ── Helpers ──

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${PAPERCLIP_API}${path}`, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getExistingAgents() {
  return api("GET", `/companies/${COMPANY_ID}/agents`);
}

// ── Register Command ──

async function registerAgents() {
  console.log("=== OpenClaw → Paperclip Agent Registration ===\n");

  const existing = await getExistingAgents();
  const existingByName = new Map(existing.map((a) => [a.name, a]));

  if (existing.length > 0) {
    console.log(`Found ${existing.length} existing agents: ${existing.map((a) => a.name).join(", ")}`);
  }

  // Track created/found agent IDs by name for reportsTo resolution
  const agentIdByName = new Map();
  for (const a of existing) {
    agentIdByName.set(a.name, a.id);
  }

  // First pass: create agents without reportsTo (since we need IDs first)
  for (const def of AGENT_DEFS) {
    if (existingByName.has(def.name)) {
      console.log(`  ✓ ${def.name} already exists (${existingByName.get(def.name).id})`);
      continue;
    }

    const payload = {
      name: def.name,
      role: def.role,
      title: def.title,
      icon: def.icon,
      capabilities: def.capabilities,
      metadata: {
        openclawName: def.openclawName,
        department: def.department,
      },
    };

    const agent = await api("POST", `/companies/${COMPANY_ID}/agents`, payload);
    agentIdByName.set(def.name, agent.id);
    console.log(`  + Created ${def.name} (${agent.id})`);
  }

  // Second pass: set reportsTo relationships
  console.log("\nSetting org hierarchy...");
  for (const def of AGENT_DEFS) {
    if (!def.reportsToName) continue;

    const agentId = agentIdByName.get(def.name);
    const reportsToId = agentIdByName.get(def.reportsToName);

    if (!agentId || !reportsToId) {
      console.log(`  ✗ Cannot set ${def.name} → ${def.reportsToName} (missing IDs)`);
      continue;
    }

    // Check if already set correctly
    const currentAgent = existingByName.get(def.name);
    if (currentAgent?.reportsTo === reportsToId) {
      console.log(`  ✓ ${def.name} → ${def.reportsToName} (already set)`);
      continue;
    }

    await api("PATCH", `/agents/${agentId}`, { reportsTo: reportsToId });
    console.log(`  → ${def.name} reports to ${def.reportsToName}`);
  }

  // Verify
  console.log("\n=== Verification ===");
  const final = await getExistingAgents();
  console.log(`Total agents: ${final.length}`);
  for (const a of final) {
    const parentName = a.reportsTo
      ? final.find((p) => p.id === a.reportsTo)?.name || "?"
      : "(top-level)";
    console.log(`  ${a.name} [${a.role}] → ${parentName} | status: ${a.status}`);
  }

  // Fetch and display org tree
  const org = await api("GET", `/companies/${COMPANY_ID}/org`);
  console.log("\n=== Org Tree ===");
  printOrgTree(org, 0);
}

function printOrgTree(nodes, depth) {
  for (const node of nodes) {
    const indent = "  ".repeat(depth);
    console.log(`${indent}${node.name} [${node.role}] (${node.status})`);
    if (node.reports?.length > 0) {
      printOrgTree(node.reports, depth + 1);
    }
  }
}

// ── Sync Command ──

const OPENCLAW_SESSIONS_DIR = process.env.OPENCLAW_SESSIONS_DIR || `${process.env.HOME}/.openclaw/agents`;
// Agents active within this window are "active", otherwise "idle"
const ACTIVE_THRESHOLD_MIN = 5;

async function getAgentSessionActivity(agentName) {
  const sessionsDir = `${OPENCLAW_SESSIONS_DIR}/${agentName}/sessions`;
  try {
    const { statSync, readdirSync } = await import("node:fs");
    const files = readdirSync(sessionsDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    if (jsonlFiles.length === 0) return { lastActive: null, ageMin: Infinity };

    let newest = 0;
    for (const file of jsonlFiles) {
      const stat = statSync(`${sessionsDir}/${file}`);
      if (stat.mtimeMs > newest) newest = stat.mtimeMs;
    }
    const ageMin = (Date.now() - newest) / 60000;
    return { lastActive: new Date(newest), ageMin };
  } catch {
    return { lastActive: null, ageMin: Infinity };
  }
}

async function syncStatuses() {
  console.log("=== OpenClaw → Paperclip Status Sync ===\n");

  // Check gateway health
  try {
    const res = await fetch(`${OPENCLAW_GATEWAY.replace("ws://", "http://").replace("wss://", "https://")}/health`);
    const health = await res.json();
    console.log(`Gateway: ${health.status} (${health.ok ? "online" : "offline"})`);
  } catch {
    console.log("Gateway: unreachable");
  }

  // Get agents from Paperclip
  const agents = await getExistingAgents();
  const agentMap = new Map();
  for (const a of agents) {
    const openclawName = a.metadata?.openclawName || a.name.toLowerCase();
    agentMap.set(openclawName, a);
  }

  // Determine status from session file timestamps
  const raw = await readFile(OPENCLAW_CONFIG, "utf8");
  const config = JSON.parse(raw);
  const configAgents = config.agents?.list || [];
  let updated = 0;

  for (const configAgent of configAgents) {
    const name = configAgent.name || configAgent.id;
    const agent = agentMap.get(name);
    if (!agent) {
      console.log(`  ? ${name}: not in Paperclip`);
      continue;
    }

    const activity = await getAgentSessionActivity(name);
    let targetStatus;

    if (activity.lastActive === null) {
      targetStatus = "idle"; // No sessions — agent exists but hasn't run
    } else if (activity.ageMin <= ACTIVE_THRESHOLD_MIN) {
      targetStatus = "active"; // Recent activity within threshold
    } else {
      targetStatus = "idle"; // Has run before but not recently active
    }

    const ageLabel = activity.lastActive
      ? activity.ageMin < 1
        ? "just now"
        : `${Math.round(activity.ageMin)}min ago`
      : "never";

    if (agent.status !== targetStatus) {
      try {
        await api("PATCH", `/agents/${agent.id}`, { status: targetStatus });
        console.log(`  ↻ ${agent.name}: ${agent.status} → ${targetStatus} (last: ${ageLabel})`);
        updated++;
      } catch (err) {
        console.error(`  ✗ ${agent.name}: failed — ${err.message}`);
      }
    } else {
      console.log(`  ✓ ${agent.name}: ${targetStatus} (last: ${ageLabel})`);
    }
  }

  console.log(`\nSync complete. ${updated} status change${updated !== 1 ? "s" : ""}.`);
}

function mapGatewayStatus(gatewayStatus) {
  // Map OpenClaw gateway statuses to Paperclip's AGENT_STATUSES
  const mapping = {
    running: "active",
    active: "active",
    idle: "idle",
    connected: "idle",
    disconnected: "paused",
    error: "idle", // Don't mark as terminated for transient errors
    stopped: "paused",
    offline: "paused",
  };
  return mapping[gatewayStatus] || "idle";
}

async function loadGatewayToken() {
  try {
    const raw = await readFile(OPENCLAW_CONFIG, "utf8");
    const config = JSON.parse(raw);
    return config.env?.vars?.OPENCLAW_GATEWAY_TOKEN || null;
  } catch {
    return null;
  }
}

function queryGateway() {
  return new Promise(async (resolve, reject) => {
    const token = await loadGatewayToken();
    const ws = new WebSocket(OPENCLAW_GATEWAY);
    let authenticated = false;
    const requestId = crypto.randomUUID();

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Gateway timeout (10s)"));
    }, 5000);

    ws.on("open", () => {
      // Wait for connect.challenge event
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // Step 1: Handle connect.challenge — send connect request with auth
        if (msg.type === "event" && msg.event === "connect.challenge") {
          const connectReq = {
            type: "req",
            id: "connect-" + requestId,
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "gateway-client",
                version: "1.0.0",
                platform: process.platform,
                mode: "backend",
              },
              role: "operator",
              scopes: ["operator.admin", "operator.read"],
              auth: token ? { token } : undefined,
            },
          };
          ws.send(JSON.stringify(connectReq));
          return;
        }

        // Step 2: Handle connect response
        if (msg.type === "res" && msg.id === "connect-" + requestId) {
          if (!msg.ok) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error(`Gateway auth failed: ${JSON.stringify(msg.error)}`));
            return;
          }
          authenticated = true;
          // Now send node.list
          ws.send(
            JSON.stringify({
              type: "req",
              id: "nodelist-" + requestId,
              method: "node.list",
              params: {},
            }),
          );
          return;
        }

        // Step 3: Handle node.list response
        if (msg.type === "res" && msg.id === "nodelist-" + requestId) {
          clearTimeout(timeout);
          ws.close();
          if (!msg.ok) {
            reject(new Error(`node.list failed: ${JSON.stringify(msg.error)}`));
          } else {
            resolve(msg.payload || []);
          }
          return;
        }
      } catch (err) {
        clearTimeout(timeout);
        ws.close();
        reject(err);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("close", (code, reason) => {
      clearTimeout(timeout);
      if (!authenticated) {
        reject(new Error(`Gateway closed before auth (${code}): ${reason}`));
      }
    });
  });
}

// ── Main ──

const command = process.argv[2] || "sync";

try {
  if (command === "register") {
    await registerAgents();
  } else if (command === "sync") {
    await syncStatuses();
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Usage: node scripts/openclaw-sync.mjs [register|sync]");
    process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
