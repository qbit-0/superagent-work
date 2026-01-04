import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { $ } from "bun";

const TEST_DIR = "/tmp/superagent-work-test";
const WORK_DIR = join(TEST_DIR, ".work");

// Helper to run CLI commands
async function work(args: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	try {
		const result = await $`bun ${join(import.meta.dir, "work.ts")} ${args.split(" ")}`
			.quiet()
			.cwd(TEST_DIR);
		return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: 0 };
	} catch (e: any) {
		return {
			stdout: e.stdout?.toString() || "",
			stderr: e.stderr?.toString() || "",
			exitCode: e.exitCode || 1,
		};
	}
}

describe("superagent-work CLI", () => {
	beforeAll(() => {
		// Create test directory
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterAll(() => {
		// Cleanup
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
	});

	describe("init", () => {
		test("creates .work directory and files", async () => {
			const result = await work("init");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Initialized");
			expect(existsSync(WORK_DIR)).toBe(true);
			expect(existsSync(join(WORK_DIR, "work.db"))).toBe(true);
			expect(existsSync(join(WORK_DIR, "work.jsonl"))).toBe(true);
		});

		test("reports if already exists", async () => {
			const result = await work("init");
			expect(result.stdout).toContain("already exists");
		});
	});

	describe("add", () => {
		test("creates a work item with default values", async () => {
			const result = await work("add Test task");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Created 001");
			expect(result.stdout).toContain("Test task");
		});

		test("creates with custom priority and type", async () => {
			const result = await work("add Bug fix --type=bug --priority=1");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Created 002");
		});

		test("fails without title", async () => {
			const result = await work("add");
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Usage");
		});
	});

	describe("list", () => {
		test("lists open work items", async () => {
			const result = await work("list");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("001");
			expect(result.stdout).toContain("Test task");
		});

		test("filters by status", async () => {
			const result = await work("list --status=open");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("001");
		});
	});

	describe("show", () => {
		test("shows work item details", async () => {
			const result = await work("show 001");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("ID:");
			expect(result.stdout).toContain("Test task");
		});

		test("supports --json flag", async () => {
			const result = await work("show 001 --json");
			expect(result.exitCode).toBe(0);
			const json = JSON.parse(result.stdout);
			expect(json.id).toBe("001");
			expect(json.title).toBe("Test task");
		});

		test("fails for non-existent item", async () => {
			const result = await work("show 999");
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("not found");
		});
	});

	describe("start", () => {
		test("marks item as in_progress", async () => {
			const result = await work("start 001");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Started");

			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.status).toBe("in_progress");
		});
	});

	describe("close", () => {
		test("closes a work item", async () => {
			const result = await work("close 001 Done testing");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Closed");

			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.status).toBe("closed");
			expect(json.closed_reason).toBe("Done testing");
		});
	});

	describe("reopen", () => {
		test("reopens a closed item", async () => {
			const result = await work("reopen 001");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Reopened");

			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.status).toBe("open");
		});
	});

	describe("log", () => {
		test("adds a log entry", async () => {
			const result = await work("log 001 First log entry --agent=test");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Logged");

			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.log).toHaveLength(1);
			expect(json.log[0].text).toBe("First log entry");
			expect(json.log[0].agent).toBe("test");
		});

		test("appends multiple log entries", async () => {
			await work("log 001 Second entry");
			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.log).toHaveLength(2);
		});
	});

	describe("edit", () => {
		test("edits title", async () => {
			const result = await work("edit 001 title Updated title");
			expect(result.exitCode).toBe(0);

			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.title).toBe("Updated title");
		});

		test("edits priority", async () => {
			await work("edit 001 priority 0");
			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.priority).toBe(0);
		});

		test("fails for unknown field", async () => {
			const result = await work("edit 001 unknown value");
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("Unknown field");
		});
	});

	describe("block/unblock/ready/blocked", () => {
		beforeEach(async () => {
			// Create two more items for dependency testing
			await work("add Blocker task --priority=1");
			await work("add Blocked task --priority=1");
		});

		test("blocks a work item", async () => {
			const result = await work("block 004 003");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("blocked by");

			const show = await work("show 004 --json");
			const json = JSON.parse(show.stdout);
			expect(json.blocked_by).toContain("003");
		});

		test("shows blocked items", async () => {
			const result = await work("blocked");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("004");
		});

		test("shows ready items (excludes blocked)", async () => {
			const result = await work("ready");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).not.toContain("004");
			expect(result.stdout).toContain("003");
		});

		test("unblocks a work item", async () => {
			const result = await work("unblock 004 003");
			expect(result.exitCode).toBe(0);

			const show = await work("show 004 --json");
			const json = JSON.parse(show.stdout);
			expect(json.blocked_by).toBeUndefined();
		});
	});

	describe("label/unlabel/labels", () => {
		test("adds a label", async () => {
			const result = await work("label 001 urgent");
			expect(result.exitCode).toBe(0);

			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.labels).toContain("urgent");
		});

		test("lists all labels", async () => {
			await work("label 002 bug");
			const result = await work("labels");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("urgent");
			expect(result.stdout).toContain("bug");
		});

		test("filters by label", async () => {
			const result = await work("list --label=urgent");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("001");
			expect(result.stdout).not.toContain("002");
		});

		test("removes a label", async () => {
			const result = await work("unlabel 001 urgent");
			expect(result.exitCode).toBe(0);

			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.labels || []).not.toContain("urgent");
		});
	});

	describe("claim/unclaim/mine", () => {
		test("claims, lists, and unclaims a work item", async () => {
			// Claim
			const claimResult = await work("claim 001 agent-123");
			expect(claimResult.exitCode).toBe(0);

			const showAfterClaim = await work("show 001 --json");
			const claimedJson = JSON.parse(showAfterClaim.stdout);
			expect(claimedJson.assignee).toBe("agent-123");

			// Mine
			const mineResult = await work("mine agent-123");
			expect(mineResult.exitCode).toBe(0);
			expect(mineResult.stdout).toContain("001");

			// Unclaim
			const unclaimResult = await work("unclaim 001");
			expect(unclaimResult.exitCode).toBe(0);

			const showAfterUnclaim = await work("show 001 --json");
			const unclaimedJson = JSON.parse(showAfterUnclaim.stdout);
			expect(unclaimedJson.assignee).toBeFalsy();
		});
	});

	describe("import/export", () => {
		test("exports to JSONL", async () => {
			const result = await work("export");
			expect(result.exitCode).toBe(0);

			const jsonlPath = join(WORK_DIR, "work.jsonl");
			const content = readFileSync(jsonlPath, "utf-8");
			expect(content).toContain("001");
		});

		test("imports from JSONL", async () => {
			// Modify JSONL manually
			const jsonlPath = join(WORK_DIR, "work.jsonl");
			const content = readFileSync(jsonlPath, "utf-8");
			const lines = content.trim().split("\n");
			const items = lines.map((l) => JSON.parse(l));
			items[0].title = "Modified via JSONL";
			writeFileSync(jsonlPath, items.map((i) => JSON.stringify(i)).join("\n") + "\n");

			const result = await work("import");
			expect(result.exitCode).toBe(0);

			const show = await work("show 001 --json");
			const json = JSON.parse(show.stdout);
			expect(json.title).toBe("Modified via JSONL");
		});
	});

	describe("help", () => {
		test("shows help", async () => {
			const result = await work("help");
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Commands:");
			expect(result.stdout).toContain("add");
			expect(result.stdout).toContain("list");
		});
	});
});
