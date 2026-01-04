#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

// Types
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

function getWorkPath(): string {
  const workDir = findWorkDir();
  if (!workDir) {
    console.error("Error: No .work directory found. Run 'work init' first.");
    process.exit(1);
  }
  return join(workDir, "work.jsonl");
}

function readWork(): WorkItem[] {
  const path = getWorkPath();
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line));
}

function writeWork(items: WorkItem[]): void {
  const path = getWorkPath();
  const content = items.map((i) => JSON.stringify(i)).join("\n");
  writeFileSync(path, content ? content + "\n" : "");
}

function nextId(items: WorkItem[]): string {
  if (items.length === 0) return "001";
  const maxId = Math.max(...items.map((i) => parseInt(i.id, 10)));
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

// Commands
const commands: Record<string, (args: string[]) => void> = {
  init: () => {
    const workDir = join(process.cwd(), ".work");
    if (existsSync(workDir)) {
      console.log(".work directory already exists");
      return;
    }
    mkdirSync(workDir, { recursive: true });
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

    const items = readWork();
    const item: WorkItem = {
      id: nextId(items),
      title,
      status: "open",
      priority: priorityFlag ? parseInt(priorityFlag) : 2,
      type: typeFlag || "task",
      created: now(),
      updated: now(),
    };
    items.push(item);
    writeWork(items);
    console.log(`Created ${item.id}: ${item.title}`);
  },

  list: (args) => {
    const items = readWork();
    const statusFilter = args.find((a) => a.startsWith("--status="))?.split("=")[1];
    
    let filtered = items;
    if (statusFilter) {
      filtered = items.filter((i) => i.status === statusFilter);
    } else {
      // Default: show non-closed
      filtered = items.filter((i) => i.status !== "closed");
    }

    if (filtered.length === 0) {
      console.log("No work items found");
      return;
    }

    // Sort by priority, then by id
    filtered.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    filtered.forEach((i) => console.log(formatWork(i)));
  },

  show: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: work show <id>");
      process.exit(1);
    }

    const items = readWork();
    const item = items.find((i) => i.id === id.padStart(3, "0"));
    if (!item) {
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

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
  },

  start: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: work start <id>");
      process.exit(1);
    }

    const items = readWork();
    const item = items.find((i) => i.id === id.padStart(3, "0"));
    if (!item) {
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    item.status = "in_progress";
    item.updated = now();
    writeWork(items);
    console.log(`Started ${item.id}: ${item.title}`);
  },

  close: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: work close <id> [reason]");
      process.exit(1);
    }

    const items = readWork();
    const item = items.find((i) => i.id === id.padStart(3, "0"));
    if (!item) {
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    item.status = "closed";
    item.updated = now();
    if (args.length > 1) {
      item.closed_reason = args.slice(1).join(" ");
    }
    writeWork(items);
    console.log(`Closed ${item.id}: ${item.title}`);
  },

  reopen: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: work reopen <id>");
      process.exit(1);
    }

    const items = readWork();
    const item = items.find((i) => i.id === id.padStart(3, "0"));
    if (!item) {
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    item.status = "open";
    item.updated = now();
    delete item.closed_reason;
    writeWork(items);
    console.log(`Reopened ${item.id}: ${item.title}`);
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

    const items = readWork();
    const item = items.find((i) => i.id === id.padStart(3, "0"));
    if (!item) {
      console.error(`Work item ${id} not found`);
      process.exit(1);
    }

    switch (field) {
      case "title":
        item.title = value;
        break;
      case "priority":
        item.priority = parseInt(value, 10);
        break;
      case "type":
        item.type = value as WorkItem["type"];
        break;
      case "description":
        item.description = value;
        break;
      default:
        console.error(`Unknown field: ${field}`);
        process.exit(1);
    }

    item.updated = now();
    writeWork(items);
    console.log(`Updated ${item.id}`);
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
  help              Show this help

Status: open, in_progress, closed
Priority: 0 (critical) to 4 (backlog), default 2
Type: task, bug, feature`);
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
