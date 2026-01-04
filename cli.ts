#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

// Types
interface Issue {
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

// Find .issues directory by walking up from cwd
function findIssuesDir(): string | null {
  let dir = process.cwd();
  while (dir !== "/") {
    const issuesPath = join(dir, ".issues");
    if (existsSync(issuesPath)) {
      return issuesPath;
    }
    dir = resolve(dir, "..");
  }
  return null;
}

function getIssuesPath(): string {
  const issuesDir = findIssuesDir();
  if (!issuesDir) {
    console.error("Error: No .issues directory found. Run 'si init' first.");
    process.exit(1);
  }
  return join(issuesDir, "issues.jsonl");
}

function readIssues(): Issue[] {
  const path = getIssuesPath();
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line));
}

function writeIssues(issues: Issue[]): void {
  const path = getIssuesPath();
  const content = issues.map((i) => JSON.stringify(i)).join("\n");
  writeFileSync(path, content ? content + "\n" : "");
}

function nextId(issues: Issue[]): string {
  if (issues.length === 0) return "001";
  const maxId = Math.max(...issues.map((i) => parseInt(i.id, 10)));
  return String(maxId + 1).padStart(3, "0");
}

function now(): string {
  return new Date().toISOString();
}

function formatIssue(issue: Issue, verbose = false): string {
  const statusIcon =
    issue.status === "closed" ? "✓" : issue.status === "in_progress" ? "▶" : "○";
  const priorityStr = `P${issue.priority}`;
  const line = `${statusIcon} ${issue.id} [${priorityStr}] ${issue.title}`;
  
  if (verbose && issue.description) {
    return `${line}\n   ${issue.description}`;
  }
  return line;
}

// Commands
const commands: Record<string, (args: string[]) => void> = {
  init: () => {
    const issuesDir = join(process.cwd(), ".issues");
    if (existsSync(issuesDir)) {
      console.log(".issues directory already exists");
      return;
    }
    mkdirSync(issuesDir, { recursive: true });
    writeFileSync(join(issuesDir, "issues.jsonl"), "");
    console.log("Initialized .issues directory");
  },

  add: (args) => {
    const title = args.join(" ");
    if (!title) {
      console.error("Usage: si add <title>");
      process.exit(1);
    }

    const issues = readIssues();
    const issue: Issue = {
      id: nextId(issues),
      title,
      status: "open",
      priority: 2,
      type: "task",
      created: now(),
      updated: now(),
    };
    issues.push(issue);
    writeIssues(issues);
    console.log(`Created issue ${issue.id}: ${issue.title}`);
  },

  list: (args) => {
    const issues = readIssues();
    const statusFilter = args.find((a) => a.startsWith("--status="))?.split("=")[1];
    
    let filtered = issues;
    if (statusFilter) {
      filtered = issues.filter((i) => i.status === statusFilter);
    } else {
      // Default: show non-closed
      filtered = issues.filter((i) => i.status !== "closed");
    }

    if (filtered.length === 0) {
      console.log("No issues found");
      return;
    }

    // Sort by priority, then by id
    filtered.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    filtered.forEach((i) => console.log(formatIssue(i)));
  },

  show: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: si show <id>");
      process.exit(1);
    }

    const issues = readIssues();
    const issue = issues.find((i) => i.id === id.padStart(3, "0"));
    if (!issue) {
      console.error(`Issue ${id} not found`);
      process.exit(1);
    }

    console.log(`ID:       ${issue.id}`);
    console.log(`Title:    ${issue.title}`);
    console.log(`Status:   ${issue.status}`);
    console.log(`Priority: P${issue.priority}`);
    console.log(`Type:     ${issue.type}`);
    console.log(`Created:  ${issue.created}`);
    console.log(`Updated:  ${issue.updated}`);
    if (issue.description) console.log(`\n${issue.description}`);
    if (issue.blocked_by?.length) console.log(`Blocked by: ${issue.blocked_by.join(", ")}`);
    if (issue.labels?.length) console.log(`Labels: ${issue.labels.join(", ")}`);
    if (issue.closed_reason) console.log(`Closed: ${issue.closed_reason}`);
  },

  start: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: si start <id>");
      process.exit(1);
    }

    const issues = readIssues();
    const issue = issues.find((i) => i.id === id.padStart(3, "0"));
    if (!issue) {
      console.error(`Issue ${id} not found`);
      process.exit(1);
    }

    issue.status = "in_progress";
    issue.updated = now();
    writeIssues(issues);
    console.log(`Started issue ${issue.id}: ${issue.title}`);
  },

  close: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: si close <id> [reason]");
      process.exit(1);
    }

    const issues = readIssues();
    const issue = issues.find((i) => i.id === id.padStart(3, "0"));
    if (!issue) {
      console.error(`Issue ${id} not found`);
      process.exit(1);
    }

    issue.status = "closed";
    issue.updated = now();
    if (args.length > 1) {
      issue.closed_reason = args.slice(1).join(" ");
    }
    writeIssues(issues);
    console.log(`Closed issue ${issue.id}: ${issue.title}`);
  },

  reopen: (args) => {
    const id = args[0];
    if (!id) {
      console.error("Usage: si reopen <id>");
      process.exit(1);
    }

    const issues = readIssues();
    const issue = issues.find((i) => i.id === id.padStart(3, "0"));
    if (!issue) {
      console.error(`Issue ${id} not found`);
      process.exit(1);
    }

    issue.status = "open";
    issue.updated = now();
    delete issue.closed_reason;
    writeIssues(issues);
    console.log(`Reopened issue ${issue.id}: ${issue.title}`);
  },

  edit: (args) => {
    const id = args[0];
    const field = args[1];
    const value = args.slice(2).join(" ");

    if (!id || !field || !value) {
      console.error("Usage: si edit <id> <field> <value>");
      console.error("Fields: title, priority, type, description");
      process.exit(1);
    }

    const issues = readIssues();
    const issue = issues.find((i) => i.id === id.padStart(3, "0"));
    if (!issue) {
      console.error(`Issue ${id} not found`);
      process.exit(1);
    }

    switch (field) {
      case "title":
        issue.title = value;
        break;
      case "priority":
        issue.priority = parseInt(value, 10);
        break;
      case "type":
        issue.type = value as Issue["type"];
        break;
      case "description":
        issue.description = value;
        break;
      default:
        console.error(`Unknown field: ${field}`);
        process.exit(1);
    }

    issue.updated = now();
    writeIssues(issues);
    console.log(`Updated issue ${issue.id}`);
  },

  help: () => {
    console.log(`superagent-issues (si) - Minimal issue tracker

Commands:
  init              Initialize .issues in current directory
  add <title>       Create a new issue
  list [--status=X] List issues (default: non-closed)
  show <id>         Show issue details
  start <id>        Mark issue as in_progress
  close <id> [why]  Close an issue
  reopen <id>       Reopen a closed issue
  edit <id> <field> <value>  Edit issue field
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
  console.error("Run 'si help' for usage");
  process.exit(1);
}
