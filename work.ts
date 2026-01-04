#!/usr/bin/env bun

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { Database } from "bun:sqlite";

// Types
interface LogEntry {
  time: string;
  agent?: string;
  text: string;
}

interface WorkItem {
  id: string;
  title: string;
  status: "open" | "in_progress" | "closed";
  priority: number;
  type: "task" | "bug" | "feature";
  created: string;
  updated: string;
  description?: string;
  blocked_by?: string[];
  labels?: string[];
  closed_reason?: string;
  log?: LogEntry[];
}

// Find .work directory by walking up from cwd
function findWorkDir(): string | null {
  let dir = process.cwd();
  while (dir !== "/") {
    const workPath = join(dir, ".work");
    if (existsSync(workPath)) {
      return workPath;
    }
    dir = resolve(dir, "..");
  }
  return null;
}

function getWorkDir(): string {
  const workDir = findWorkDir();
  if (!workDir) {
    console.error("Error: No .work directory found. Run 'work init' first.");
    process.exit(1);
  }
  return workDir;
}

function getDb(): Database {
  const workDir = getWorkDir();
  const dbPath = join(workDir, "work.db");
  const db = new Database(dbPath);
  
  // Initialize schema if needed
  db.run(`
    CREATE TABLE IF NOT EXISTS work (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority INTEGER NOT NULL DEFAULT 2,
      type TEXT NOT NULL DEFAULT 'task',
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      description TEXT,
      blocked_by TEXT,
      labels TEXT,
      closed_reason TEXT,
      log TEXT
    )
  `);
  
  return db;
}

function rowToWorkItem(row: any): WorkItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    type: row.type,
    created: row.created,
    updated: row.updated,
    description: row.description || undefined,
    blocked_by: row.blocked_by ? JSON.parse(row.blocked_by) : undefined,
    labels: row.labels ? JSON.parse(row.labels) : undefined,
    closed_reason: row.closed_reason || undefined,
    log: row.log ? JSON.parse(row.log) : undefined,
  };
}

function exportToJsonl(db: Database): void {
  const workDir = getWorkDir();
  const jsonlPath = join(workDir, "work.jsonl");
  
  const rows = db.query("SELECT * FROM work ORDER BY CAST(id AS INTEGER)").all();
  const items = rows.map(rowToWorkItem);
  const content = items.map((i) => JSON.stringify(i)).join("\n");
  writeFileSync(jsonlPath, content ? content + "\n" : "");
}

function nextId(db: Database): string {
  const row = db.query("SELECT MAX(CAST(id AS INTEGER)) as maxId FROM work").get() as any;
  const maxId = row?.maxId || 0;
  return String(maxId + 1).padStart(3, "0");
}

function now(): string {
  return new Date().toISOString();
}

function formatWork(item: WorkItem, verbose = false): string {
  const statusIcon =
    item.status === "closed" ? "✓" : item.status === "in_progress" ? "▶" : "○";
  const priorityStr = `P${item.priority}`;
  const line = `${statusIcon} ${item.id} [${priorityStr}] ${item.title}`;
  
  if (verbose && item.description) {
    return `${line}\n   ${item.description}`;
  }
  return line;
}

function padId(id: string): string {
  return id.padStart(3, "0");
}

// Commands
const commands: Record<string, (args: string[]) => void> = {
  init: () => {
    const workDir = join(process.cwd(), ".work");
    if (existsSync(workDir)) {
      console.log(".work directory already exists");
      return;
    }
    mkdirSync(workDir, { recursive: true });
    
    // Create empty DB
    const db = new Database(join(workDir, "work.db"));
    db.run(`
      CREATE TABLE IF NOT EXISTS work (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        priority INTEGER NOT NULL DEFAULT 2,
        type TEXT NOT NULL DEFAULT 'task',
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        description TEXT,
        blocked_by TEXT,
        labels TEXT,
        closed_reason TEXT,
        log TEXT
      )
    `);
    db.close();
    
    // Create empty JSONL
    writeFileSync(join(workDir, "work.jsonl"), "");
    console.log("Initialized .work directory");
  },

  add: (args) => {
    const typeFlag = args.find((a) => a.startsWith("--type="))?.split("=")[1];
    const priorityFlag = args.find((a) => a.startsWith("--priority="))?.split("=")[1];
    const titleParts = args.filter((a) => !a.startsWith("--"));
    const title = titleParts.join(" ");
    
    if (!title) {
      console.error("Usage: work add <title> [--type=task|bug|feature] [--priority=0-4]");
      process.exit(1);
    }

    const db = getDb();
    const id = nextId(db);
    const timestamp = now();
    
    db.run(
      `INSERT INTO work (id, title, status, priority, type, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, "open", priorityFlag ? parseInt(priorityFlag) : 2, typeFlag || "task", timestamp, timestamp]
    );
    
    exportToJsonl(db);
    db.close();
    console.log(`Created ${id}: ${title}`);
  },

  list: (args) => {
    const db = getDb();
    const statusFilter = args.find((a) => a.startsWith("--status="))?.split("=")[1];
    
    let query = "SELECT * FROM work";
    let params: string[] = [];
    
    if (statusFilter) {
      query += " WHERE status = ?";
      params.push(statusFilter);
    } else {
      query += " WHERE status != 'closed'";
    }
    query += " ORDER BY priority, CAST(id AS INTEGER)";
    
    const rows = db.query(query).all(...params);
    db.close();
    
    if (rows.length === 0) {
      console.log("No work items found");
      return;
    }

    rows.map(rowToWorkItem).forEach((i) => console.log(formatWork(i)));
  },

  show: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: work show <id>");
      process.exit(1);
    }

    const db = getDb();
    const row = db.query("SELECT * FROM work WHERE id = ?").get(padId(id)) as any;
    db.close();
    
    if (!row) {
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    const item = rowToWorkItem(row);
    console.log(`ID:       ${item.id}`);
    console.log(`Title:    ${item.title}`);
    console.log(`Status:   ${item.status}`);
    console.log(`Priority: P${item.priority}`);
    console.log(`Type:     ${item.type}`);
    console.log(`Created:  ${item.created}`);
    console.log(`Updated:  ${item.updated}`);
    if (item.description) console.log(`\n${item.description}`);
    if (item.blocked_by?.length) console.log(`Blocked by: ${item.blocked_by.join(", ")}`);
    if (item.labels?.length) console.log(`Labels: ${item.labels.join(", ")}`);
    if (item.closed_reason) console.log(`Closed: ${item.closed_reason}`);
    if (item.log?.length) {
      console.log(`\nLog:`);
      item.log.forEach((entry) => {
        const agent = entry.agent ? `[${entry.agent}] ` : "";
        const time = new Date(entry.time).toLocaleString();
        console.log(`  ${time} ${agent}${entry.text}`);
      });
    }
  },

  start: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: work start <id>");
      process.exit(1);
    }

    const db = getDb();
    const row = db.query("SELECT * FROM work WHERE id = ?").get(padId(id)) as any;
    if (!row) {
      db.close();
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    db.run("UPDATE work SET status = ?, updated = ? WHERE id = ?", ["in_progress", now(), padId(id)]);
    exportToJsonl(db);
    db.close();
    console.log(`Started ${padId(id)}: ${row.title}`);
  },

  close: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: work close <id> [reason]");
      process.exit(1);
    }

    const db = getDb();
    const row = db.query("SELECT * FROM work WHERE id = ?").get(padId(id)) as any;
    if (!row) {
      db.close();
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    const reason = args.length > 1 ? args.slice(1).join(" ") : null;
    db.run("UPDATE work SET status = ?, updated = ?, closed_reason = ? WHERE id = ?", 
      ["closed", now(), reason, padId(id)]);
    exportToJsonl(db);
    db.close();
    console.log(`Closed ${padId(id)}: ${row.title}`);
  },

  reopen: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: work reopen <id>");
      process.exit(1);
    }

    const db = getDb();
    const row = db.query("SELECT * FROM work WHERE id = ?").get(padId(id)) as any;
    if (!row) {
      db.close();
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    db.run("UPDATE work SET status = ?, updated = ?, closed_reason = NULL WHERE id = ?", 
      ["open", now(), padId(id)]);
    exportToJsonl(db);
    db.close();
    console.log(`Reopened ${padId(id)}: ${row.title}`);
  },

  log: (args) => {
    const id = args[0];
    const agentFlag = args.find((a) => a.startsWith("--agent="))?.split("=")[1];
    const textParts = args.slice(1).filter((a) => !a.startsWith("--"));
    const message = textParts.join(" ");

    if (!id || !message) {
      console.error("Usage: work log <id> <message> [--agent=name]");
      process.exit(1);
    }

    const db = getDb();
    const row = db.query("SELECT * FROM work WHERE id = ?").get(padId(id)) as any;
    if (!row) {
      db.close();
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    const entry: LogEntry = {
      time: now(),
      text: message,
    };
    if (agentFlag) {
      entry.agent = agentFlag;
    }

    const existingLog = row.log ? JSON.parse(row.log) : [];
    existingLog.push(entry);
    
    db.run("UPDATE work SET log = ?, updated = ? WHERE id = ?", 
      [JSON.stringify(existingLog), now(), padId(id)]);
    exportToJsonl(db);
    db.close();
    console.log(`Logged to ${padId(id)}`);
  },

  block: (args) => {
    const id = args[0];
    const blockerId = args[1];
    
    if (!id || !blockerId) {
      console.error("Usage: work block <id> <blocker-id>");
      console.error("  Marks <id> as blocked by <blocker-id>");
      process.exit(1);
    }

    const db = getDb();
    const row = db.query("SELECT * FROM work WHERE id = ?").get(padId(id)) as any;
    if (!row) {
      db.close();
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }
    
    const blockerRow = db.query("SELECT * FROM work WHERE id = ?").get(padId(blockerId)) as any;
    if (!blockerRow) {
      db.close();
      console.error(`Blocker work item ${blockerId} not found`);
      process.exit(1);
    }

    const blockedBy: string[] = row.blocked_by ? JSON.parse(row.blocked_by) : [];
    const paddedBlockerId = padId(blockerId);
    
    if (blockedBy.includes(paddedBlockerId)) {
      db.close();
      console.log(`${padId(id)} is already blocked by ${paddedBlockerId}`);
      return;
    }
    
    blockedBy.push(paddedBlockerId);
    db.run("UPDATE work SET blocked_by = ?, updated = ? WHERE id = ?", 
      [JSON.stringify(blockedBy), now(), padId(id)]);
    exportToJsonl(db);
    db.close();
    console.log(`${padId(id)} is now blocked by ${paddedBlockerId}`);
  },

  unblock: (args) => {
    const id = args[0];
    const blockerId = args[1];
    
    if (!id || !blockerId) {
      console.error("Usage: work unblock <id> <blocker-id>");
      console.error("  Removes <blocker-id> from blockers of <id>");
      process.exit(1);
    }

    const db = getDb();
    const row = db.query("SELECT * FROM work WHERE id = ?").get(padId(id)) as any;
    if (!row) {
      db.close();
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    const blockedBy: string[] = row.blocked_by ? JSON.parse(row.blocked_by) : [];
    const paddedBlockerId = padId(blockerId);
    const idx = blockedBy.indexOf(paddedBlockerId);
    
    if (idx === -1) {
      db.close();
      console.log(`${padId(id)} is not blocked by ${paddedBlockerId}`);
      return;
    }
    
    blockedBy.splice(idx, 1);
    db.run("UPDATE work SET blocked_by = ?, updated = ? WHERE id = ?", 
      [blockedBy.length ? JSON.stringify(blockedBy) : null, now(), padId(id)]);
    exportToJsonl(db);
    db.close();
    console.log(`Removed ${paddedBlockerId} from blockers of ${padId(id)}`);
  },

  ready: (args) => {
    const db = getDb();
    
    // Get all non-closed items
    const rows = db.query("SELECT * FROM work WHERE status != 'closed' ORDER BY priority, CAST(id AS INTEGER)").all();
    
    // Get all closed item IDs for checking blockers
    const closedIds = new Set(
      (db.query("SELECT id FROM work WHERE status = 'closed'").all() as any[]).map(r => r.id)
    );
    
    db.close();
    
    // Filter to items with no open blockers
    const readyItems = rows.map(rowToWorkItem).filter(item => {
      if (!item.blocked_by?.length) return true;
      // Ready if all blockers are closed
      return item.blocked_by.every(blockerId => closedIds.has(blockerId));
    });
    
    if (readyItems.length === 0) {
      console.log("No ready work items");
      return;
    }

    console.log("Ready to work on:");
    readyItems.forEach((i) => console.log(formatWork(i)));
  },

  blocked: (args) => {
    const db = getDb();
    
    // Get all non-closed items with blockers
    const rows = db.query("SELECT * FROM work WHERE status != 'closed' AND blocked_by IS NOT NULL ORDER BY priority, CAST(id AS INTEGER)").all();
    
    // Get all closed item IDs
    const closedIds = new Set(
      (db.query("SELECT id FROM work WHERE status = 'closed'").all() as any[]).map(r => r.id)
    );
    
    db.close();
    
    // Filter to items with at least one open blocker
    const blockedItems = rows.map(rowToWorkItem).filter(item => {
      if (!item.blocked_by?.length) return false;
      // Blocked if any blocker is still open
      return item.blocked_by.some(blockerId => !closedIds.has(blockerId));
    });
    
    if (blockedItems.length === 0) {
      console.log("No blocked work items");
      return;
    }

    console.log("Blocked items:");
    blockedItems.forEach((item) => {
      const openBlockers = item.blocked_by!.filter(id => !closedIds.has(id));
      console.log(`${formatWork(item)} [blocked by: ${openBlockers.join(", ")}]`);
    });
  },

  edit: (args) => {
    const id = args[0];
    const field = args[1];
    const value = args.slice(2).join(" ");

    if (!id || !field || !value) {
      console.error("Usage: work edit <id> <field> <value>");
      console.error("Fields: title, priority, type, description");
      process.exit(1);
    }

    const db = getDb();
    const row = db.query("SELECT * FROM work WHERE id = ?").get(padId(id)) as any;
    if (!row) {
      db.close();
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    const validFields = ["title", "priority", "type", "description"];
    if (!validFields.includes(field)) {
      db.close();
      console.error(`Unknown field: ${field}`);
      process.exit(1);
    }

    const sqlValue = field === "priority" ? parseInt(value, 10) : value;
    db.run(`UPDATE work SET ${field} = ?, updated = ? WHERE id = ?`, [sqlValue, now(), padId(id)]);
    exportToJsonl(db);
    db.close();
    console.log(`Updated ${padId(id)}`);
  },

  import: () => {
    const workDir = getWorkDir();
    const jsonlPath = join(workDir, "work.jsonl");
    
    if (!existsSync(jsonlPath)) {
      console.error("No work.jsonl file found");
      process.exit(1);
    }
    
    const content = require("fs").readFileSync(jsonlPath, "utf-8").trim();
    if (!content) {
      console.log("No items to import");
      return;
    }
    
    const items: WorkItem[] = content.split("\n").map((line: string) => JSON.parse(line));
    const db = getDb();
    
    // Clear existing data and insert from JSONL
    db.run("DELETE FROM work");
    
    const stmt = db.prepare(`
      INSERT INTO work (id, title, status, priority, type, created, updated, description, blocked_by, labels, closed_reason, log)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const item of items) {
      stmt.run(
        item.id,
        item.title,
        item.status,
        item.priority,
        item.type,
        item.created,
        item.updated,
        item.description || null,
        item.blocked_by ? JSON.stringify(item.blocked_by) : null,
        item.labels ? JSON.stringify(item.labels) : null,
        item.closed_reason || null,
        item.log ? JSON.stringify(item.log) : null
      );
    }
    
    db.close();
    console.log(`Imported ${items.length} work items from JSONL`);
  },

  export: () => {
    const db = getDb();
    exportToJsonl(db);
    db.close();
    console.log("Exported work items to JSONL");
  },

  help: () => {
    console.log(`superagent-work - Minimal work tracker

Commands:
  init              Initialize .work in current directory
  add <title>       Create a new work item
  list [--status=X] List work items (default: non-closed)
  show <id>         Show work item details
  start <id>        Mark work item as in_progress
  close <id> [why]  Close a work item
  reopen <id>       Reopen a closed work item
  edit <id> <field> <value>  Edit work item field
  log <id> <message>  Add a log entry
  block <id> <blocker-id>   Mark id as blocked by blocker-id
  unblock <id> <blocker-id> Remove blocker from id
  ready             List items ready to work on (no open blockers)
  blocked           List items that are blocked
  import            Import from JSONL to DB (after git pull)
  export            Export DB to JSONL (before git commit)
  help              Show this help

Status: open, in_progress, closed
Priority: 0 (critical) to 4 (backlog), default 2
Type: task, bug, feature

Storage: SQLite (.work/work.db) with auto-export to JSONL (.work/work.jsonl)`);
  },
};

// Main
const [cmd, ...args] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  commands.help([]);
} else if (commands[cmd]) {
  commands[cmd](args);
} else {
  console.error(`Unknown command: ${cmd}`);
  console.error("Run 'work help' for usage");
  process.exit(1);
}
