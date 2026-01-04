#!/usr/bin/env bun

/**
 * Migration script: beads -> superagent-issues
 * 
 * Reads beads export from /tmp/beads-export.json and converts to our format.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: number;
  issue_type: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
}

interface Issue {
  id: string;
  title: string;
  status: "open" | "in_progress" | "closed";
  priority: number;
  type: "task" | "bug" | "feature";
  created: string;
  updated: string;
  description?: string;
  closed_reason?: string;
  beads_id?: string;
}

function mapStatus(beadsStatus: string): Issue["status"] {
  switch (beadsStatus) {
    case "open": return "open";
    case "in_progress": return "in_progress";
    case "closed": return "closed";
    default: return "open";
  }
}

function mapType(beadsType: string): Issue["type"] {
  switch (beadsType) {
    case "bug": return "bug";
    case "feature": return "feature";
    default: return "task";
  }
}

function convertIssue(bead: BeadsIssue, newId: string): Issue {
  const issue: Issue = {
    id: newId,
    title: bead.title,
    status: mapStatus(bead.status),
    priority: bead.priority,
    type: mapType(bead.issue_type),
    created: bead.created_at,
    updated: bead.updated_at,
    beads_id: bead.id,
  };

  if (bead.description) issue.description = bead.description;
  if (bead.close_reason) issue.closed_reason = bead.close_reason;

  return issue;
}

function main() {
  console.log("Reading beads export from /tmp/beads-export.json...");
  const beadsIssues: BeadsIssue[] = JSON.parse(readFileSync("/tmp/beads-export.json", "utf-8"));
  console.log(`Found ${beadsIssues.length} issues`);

  // Sort by created_at to maintain chronological order
  beadsIssues.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const issues: Issue[] = beadsIssues.map((bead, i) => 
    convertIssue(bead, String(i + 1).padStart(3, "0"))
  );

  // Write to issues.jsonl
  const issuesPath = join(import.meta.dir, ".issues", "issues.jsonl");
  const content = issues.map((i) => JSON.stringify(i)).join("\n") + "\n";
  writeFileSync(issuesPath, content);

  console.log(`\nMigrated ${issues.length} issues to ${issuesPath}`);
  
  const open = issues.filter((i) => i.status === "open").length;
  const inProgress = issues.filter((i) => i.status === "in_progress").length;
  const closed = issues.filter((i) => i.status === "closed").length;
  
  console.log(`\nSummary:`);
  console.log(`  Open:        ${open}`);
  console.log(`  In Progress: ${inProgress}`);
  console.log(`  Closed:      ${closed}`);
  console.log(`  Total:       ${issues.length}`);
}

main();
