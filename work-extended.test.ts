/**
 * Extended tests for superagent-work CLI
 *
 * These tests cover edge cases, error handling, and features
 * not covered by the main test file.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { $ } from "bun";

const TEST_DIR = "/tmp/superagent-work-extended-test";
const WORK_DIR = join(TEST_DIR, ".work");

// Helper to run CLI commands
async function work(
  args: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result =
      await $`bun ${join(import.meta.dir, "work.ts")} ${args.split(" ")}`
        .quiet()
        .cwd(TEST_DIR);
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: 0,
    };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString() || "",
      stderr: e.stderr?.toString() || "",
      exitCode: e.exitCode || 1,
    };
  }
}

describe("superagent-work CLI - Extended Tests", () => {
  beforeAll(async () => {
    // Create test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    // Initialize work directory
    await work("init");
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("add - extended", () => {
    test("creates with --from flag (author)", async () => {
      const result = await work("add Task from agent --from=agent-001");
      expect(result.exitCode).toBe(0);

      const show = await work("show 001 --json");
      const json = JSON.parse(show.stdout);
      expect(json.author).toBe("agent-001");
    });

    test("creates with --to flag (assignee)", async () => {
      const result = await work("add Task for someone --to=worker-abc");
      expect(result.exitCode).toBe(0);

      const show = await work("show 002 --json");
      const json = JSON.parse(show.stdout);
      expect(json.assignee).toBe("worker-abc");
    });

    test("creates with all flags combined", async () => {
      const result = await work(
        "add Full task --type=feature --priority=0 --from=author1 --to=assignee1",
      );
      expect(result.exitCode).toBe(0);

      const show = await work("show 003 --json");
      const json = JSON.parse(show.stdout);
      expect(json.type).toBe("feature");
      expect(json.priority).toBe(0);
      expect(json.author).toBe("author1");
      expect(json.assignee).toBe("assignee1");
    });

    test("creates message type", async () => {
      const result = await work("add Agent message --type=message");
      expect(result.exitCode).toBe(0);

      const show = await work("show 004 --json");
      const json = JSON.parse(show.stdout);
      expect(json.type).toBe("message");
    });

    test("handles multiword title", async () => {
      const result = await work(
        "add This is a very long title with many words",
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        "This is a very long title with many words",
      );
    });
  });

  describe("list - extended", () => {
    test("filters by --from (author)", async () => {
      const result = await work("list --from=agent-001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("001");
      expect(result.stdout).not.toContain("002");
    });

    test("filters by --to (assignee)", async () => {
      const result = await work("list --to=worker-abc");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("002");
      expect(result.stdout).not.toContain("001");
    });

    test("filters by --type", async () => {
      const result = await work("list --type=feature");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("003");
      expect(result.stdout).not.toContain("001");
    });

    test("filters by --type=message", async () => {
      const result = await work("list --type=message");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("004");
    });

    test("shows no items message when filter returns empty", async () => {
      const result = await work("list --from=nonexistent-author");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No work items found");
    });

    test("combines multiple filters", async () => {
      const result = await work("list --type=feature --from=author1");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("003");
    });

    test("shows closed items with --status=closed", async () => {
      // Close an item first
      await work("close 004 Done");

      const result = await work("list --status=closed");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("004");
    });

    test("shows in_progress items with --status=in_progress", async () => {
      await work("start 001");

      const result = await work("list --status=in_progress");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("001");
    });
  });

  describe("edit - extended", () => {
    test("edits author field", async () => {
      await work("edit 001 author new-author");
      const show = await work("show 001 --json");
      const json = JSON.parse(show.stdout);
      expect(json.author).toBe("new-author");
    });

    test("edits assignee field", async () => {
      await work("edit 001 assignee new-assignee");
      const show = await work("show 001 --json");
      const json = JSON.parse(show.stdout);
      expect(json.assignee).toBe("new-assignee");
    });

    test("edits description field", async () => {
      await work("edit 001 description This is a detailed description");
      const show = await work("show 001 --json");
      const json = JSON.parse(show.stdout);
      expect(json.description).toBe("This is a detailed description");
    });

    test("edits type field", async () => {
      await work("edit 001 type bug");
      const show = await work("show 001 --json");
      const json = JSON.parse(show.stdout);
      expect(json.type).toBe("bug");
    });

    test("fails without value", async () => {
      const result = await work("edit 001 title");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("fails without field", async () => {
      const result = await work("edit 001");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("fails for non-existent item", async () => {
      const result = await work("edit 999 title New");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });
  });

  describe("show - extended", () => {
    test("shows author in human output", async () => {
      const result = await work("show 001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Author:");
      expect(result.stdout).toContain("new-author");
    });

    test("shows assignee in human output", async () => {
      const result = await work("show 001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Assignee:");
      expect(result.stdout).toContain("new-assignee");
    });

    test("shows description in human output", async () => {
      const result = await work("show 001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("This is a detailed description");
    });

    test("shows blocked_by in human output", async () => {
      // Set up blocking relationship
      await work("block 002 001");

      const result = await work("show 002");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Blocked by:");
      expect(result.stdout).toContain("001");
    });

    test("shows labels in human output", async () => {
      await work("label 001 important");
      await work("label 001 review-needed");

      const result = await work("show 001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Labels:");
      expect(result.stdout).toContain("important");
    });

    test("shows log entries in human output", async () => {
      await work("log 001 First progress update --agent=worker");

      const result = await work("show 001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Log:");
      expect(result.stdout).toContain("First progress update");
      expect(result.stdout).toContain("[worker]");
    });

    test("shows closed_reason in human output", async () => {
      await work("close 001 Completed successfully");

      const result = await work("show 001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Closed:");
      expect(result.stdout).toContain("Completed successfully");
    });
  });

  describe("ID handling", () => {
    test("handles ID without leading zeros", async () => {
      const result = await work("show 1");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("001");
    });

    test("handles ID with leading zeros", async () => {
      const result = await work("show 001");
      expect(result.exitCode).toBe(0);
    });

    test("pads ID in output", async () => {
      const result = await work("add Padded ID test");
      expect(result.exitCode).toBe(0);
      // Should be 006 by now
      expect(result.stdout).toMatch(/Created 00\d/);
    });
  });

  describe("log - extended", () => {
    test("logs without agent", async () => {
      await work("reopen 001");
      const result = await work("log 001 Simple log entry");
      expect(result.exitCode).toBe(0);

      const show = await work("show 001 --json");
      const json = JSON.parse(show.stdout);
      // Find the entry without agent
      const noAgentEntry = json.log.find(
        (e: any) => e.text === "Simple log entry",
      );
      expect(noAgentEntry).toBeDefined();
      expect(noAgentEntry.agent).toBeUndefined();
    });

    test("fails without message", async () => {
      const result = await work("log 001");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("fails for non-existent item", async () => {
      const result = await work("log 999 Message");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });
  });

  describe("block/unblock - extended", () => {
    test("prevents duplicate blocking", async () => {
      // 002 is already blocked by 001
      const result = await work("block 002 001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("already blocked");
    });

    test("fails when blocking item doesn't exist", async () => {
      const result = await work("block 002 999");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("fails when blocked item doesn't exist", async () => {
      const result = await work("block 999 001");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("unblock when not blocked shows message", async () => {
      // First unblock, then try again
      await work("unblock 002 001");
      const result = await work("unblock 002 001");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("is not blocked");
    });

    test("unblock fails for non-existent item", async () => {
      const result = await work("unblock 999 001");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("block without args shows usage", async () => {
      const result = await work("block");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("unblock without args shows usage", async () => {
      const result = await work("unblock");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });
  });

  describe("label/unlabel - extended", () => {
    test("prevents duplicate labels", async () => {
      // important is already on 001
      const result = await work("label 001 important");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("already has label");
    });

    test("unlabel when label doesn't exist shows message", async () => {
      const result = await work("unlabel 001 nonexistent-label");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("doesn't have label");
    });

    test("label fails for non-existent item", async () => {
      const result = await work("label 999 test");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("unlabel fails for non-existent item", async () => {
      const result = await work("unlabel 999 test");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("label without args shows usage", async () => {
      const result = await work("label 001");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });
  });

  describe("claim/unclaim - extended", () => {
    test("claim fails for non-existent item", async () => {
      const result = await work("claim 999 agent");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("unclaim fails for non-existent item", async () => {
      const result = await work("unclaim 999");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("claim without args shows usage", async () => {
      const result = await work("claim");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("mine without args shows usage", async () => {
      const result = await work("mine");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("mine shows no items for unknown assignee", async () => {
      const result = await work("mine unknown-agent");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No work items assigned");
    });
  });

  describe("start/close/reopen - extended", () => {
    test("start fails for non-existent item", async () => {
      const result = await work("start 999");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("close fails for non-existent item", async () => {
      const result = await work("close 999");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("reopen fails for non-existent item", async () => {
      const result = await work("reopen 999");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    test("start without ID shows usage", async () => {
      const result = await work("start");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("close without ID shows usage", async () => {
      const result = await work("close");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("reopen without ID shows usage", async () => {
      const result = await work("reopen");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    test("close without reason is allowed", async () => {
      await work("start 002");
      const result = await work("close 002");
      expect(result.exitCode).toBe(0);

      const show = await work("show 002 --json");
      const json = JSON.parse(show.stdout);
      expect(json.status).toBe("closed");
      expect(json.closed_reason).toBeUndefined();
    });
  });

  describe("ready/blocked - edge cases", () => {
    test("ready shows message when no items ready", async () => {
      // Create item blocked by another
      await work("add Blocked item");
      await work("add Blocker item");

      const list = await work("list");
      // Find the IDs - should be around 007 and 008
      const blockedId = "007";
      const blockerId = "008";

      await work(`block ${blockedId} ${blockerId}`);

      // Close all other items to isolate
      await work("close 001 done");
      await work("close 003 done");
      await work("close 005 done");
      await work("close 006 done");

      // Ready should show 008 (the blocker) but not 007 (blocked)
      const result = await work("ready");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(blockerId);
      expect(result.stdout).not.toContain(`○ ${blockedId}`);
    });

    test("blocked shows no items when nothing blocked", async () => {
      // Unblock and check
      await work("unblock 007 008");
      await work("close 007 done");
      await work("close 008 done");

      const result = await work("blocked");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No blocked work items");
    });
  });

  describe("import/export - edge cases", () => {
    test("import handles empty JSONL", async () => {
      writeFileSync(join(WORK_DIR, "work.jsonl"), "");

      const result = await work("import");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No items to import");
    });

    test("export creates valid JSONL", async () => {
      // Add some items back
      await work("add Export test item");

      const result = await work("export");
      expect(result.exitCode).toBe(0);

      const jsonlPath = join(WORK_DIR, "work.jsonl");
      const content = readFileSync(jsonlPath, "utf-8").trim();
      const lines = content.split("\n").filter((l) => l);

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  describe("unknown command", () => {
    test("shows error for unknown command", async () => {
      const result = await work("unknowncommand");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown command");
    });
  });

  describe("help variations", () => {
    test("--help shows help", async () => {
      const result = await work("--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Commands:");
    });

    test("-h shows help", async () => {
      const result = await work("-h");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Commands:");
    });

    test("no args shows help", async () => {
      const result = await $`bun ${join(import.meta.dir, "work.ts")}`
        .quiet()
        .cwd(TEST_DIR);
      expect(result.stdout.toString()).toContain("Commands:");
    });
  });

  describe("labels command - edge cases", () => {
    test("shows no labels message when none exist", async () => {
      // Create fresh test environment
      const freshDir = "/tmp/work-labels-test";
      if (existsSync(freshDir)) rmSync(freshDir, { recursive: true });
      mkdirSync(freshDir, { recursive: true });

      const initResult = await $`bun ${join(import.meta.dir, "work.ts")} init`
        .quiet()
        .cwd(freshDir);
      await $`bun ${join(import.meta.dir, "work.ts")} add Test item`
        .quiet()
        .cwd(freshDir);

      const result = await $`bun ${join(import.meta.dir, "work.ts")} labels`
        .quiet()
        .cwd(freshDir);
      expect(result.stdout.toString()).toContain("No labels in use");

      rmSync(freshDir, { recursive: true });
    });
  });

  describe("priority ordering", () => {
    test("list orders by priority then ID", async () => {
      // Create items with different priorities
      await work("add P0 critical --priority=0");
      await work("add P4 backlog --priority=4");
      await work("add P1 high --priority=1");

      const result = await work("list");
      const lines = result.stdout.split("\n").filter((l) => l.trim());

      // Find positions of items with different priorities
      const p0Index = lines.findIndex(
        (l) => l.includes("P0 critical") || l.includes("[P0]"),
      );
      const p4Index = lines.findIndex(
        (l) => l.includes("P4 backlog") || l.includes("[P4]"),
      );

      // P0 should come before P4
      if (p0Index !== -1 && p4Index !== -1) {
        expect(p0Index).toBeLessThan(p4Index);
      }
    });
  });

  describe("format output", () => {
    test("formatWork shows correct status icons", async () => {
      // Open item
      await work("add Open item test");
      const openList = await work("list");
      expect(openList.stdout).toContain("○"); // Open icon

      // In progress
      const show = await work("list --json 2>&1 || echo ''");
      // We check via show
      await work("start 009"); // The recent item
      const progressList = await work("list --status=in_progress");
      expect(progressList.stdout).toContain("▶"); // In progress icon
    });
  });
});

describe("superagent-work - Database handling", () => {
  const DB_TEST_DIR = "/tmp/work-db-test";

  beforeAll(() => {
    if (existsSync(DB_TEST_DIR)) {
      rmSync(DB_TEST_DIR, { recursive: true });
    }
    mkdirSync(DB_TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(DB_TEST_DIR)) {
      rmSync(DB_TEST_DIR, { recursive: true });
    }
  });

  test("fails gracefully without .work directory", async () => {
    const result = await $`bun ${join(import.meta.dir, "work.ts")} list`
      .quiet()
      .cwd(DB_TEST_DIR)
      .nothrow();

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("No .work directory found");
  });

  test("init creates all necessary files", async () => {
    const result = await $`bun ${join(import.meta.dir, "work.ts")} init`
      .quiet()
      .cwd(DB_TEST_DIR);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(DB_TEST_DIR, ".work"))).toBe(true);
    expect(existsSync(join(DB_TEST_DIR, ".work", "work.db"))).toBe(true);
    expect(existsSync(join(DB_TEST_DIR, ".work", "work.jsonl"))).toBe(true);
  });

  test("works from subdirectory", async () => {
    const subDir = join(DB_TEST_DIR, "sub", "deep");
    mkdirSync(subDir, { recursive: true });

    const result =
      await $`bun ${join(import.meta.dir, "work.ts")} add Task from subdir`
        .quiet()
        .cwd(subDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("Created");
  });
});
