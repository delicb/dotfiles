import { describe, expect, it } from "vitest";
import { buildCreatePrompt, buildModePrompt } from "./prompts";

describe("handover prompts", () => {
  it("builds an explicit create request", () => {
    const prompt = buildCreatePrompt({
      baseCommit: "abc123",
      branch: "main",
      dirtyStatus: "clean",
      origin: "git@github.com:owner/repo.git",
      planPath: "/tmp/plan.md",
      repository: "github.com/owner/repo",
      repositoryRoot: "/tmp/repo",
      sourceSession: "/tmp/session.jsonl",
    });

    expect(prompt).toContain("/skill:agent-handover create");
    expect(prompt).toContain("Exact plan path: /tmp/plan.md");
    expect(prompt).toContain("Base commit: abc123");
  });

  it("builds a start request", () => {
    expect(buildModePrompt("start", "/tmp/plan.md")).toContain(
      "/skill:agent-handover start",
    );
  });
});
