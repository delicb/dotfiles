import { describe, expect, it } from "vitest";
import {
  findWorktree,
  parseWorktreeList,
  parseWorktrunkSwitchOutput,
  summarizeStatus,
} from "./worktrees";

describe("parseWorktreeList", () => {
  it("parses linked and detached worktrees", () => {
    const output = [
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /worktrees/repo/feature-a",
      "HEAD def",
      "branch refs/heads/feature/a",
      "",
      "worktree /worktrees/repo/review",
      "HEAD 123",
      "detached",
      "",
    ].join("\0");

    expect(parseWorktreeList(output)).toEqual([
      { branch: "main", detached: false, path: "/repo" },
      {
        branch: "feature/a",
        detached: false,
        path: "/worktrees/repo/feature-a",
      },
      { detached: true, path: "/worktrees/repo/review" },
    ]);
  });
});

describe("parseWorktrunkSwitchOutput", () => {
  it("uses the JSON result line", () => {
    expect(
      parseWorktrunkSwitchOutput(
        'progress\n{"action":"created","branch":"feature/a","path":"/worktrees/repo/feature-a"}\n',
      ),
    ).toEqual({
      action: "created",
      branch: "feature/a",
      path: "/worktrees/repo/feature-a",
    });
  });

  it("rejects output without a switch result", () => {
    expect(() => parseWorktrunkSwitchOutput("progress only")).toThrow(
      "Worktrunk did not return a valid switch result.",
    );
  });
});

describe("findWorktree", () => {
  const worktrees = [
    { branch: "main", detached: false, path: "/repo" },
    { branch: "feature/a", detached: false, path: "/worktrees/repo/feature-a" },
  ];

  it("matches a branch before a path", () => {
    expect(findWorktree(worktrees, "feature/a", "/repo")?.path).toBe(
      "/worktrees/repo/feature-a",
    );
  });

  it("matches an absolute path", () => {
    expect(
      findWorktree(worktrees, "/worktrees/repo/feature-a", "/repo")?.branch,
    ).toBe("feature/a");
  });
});

describe("summarizeStatus", () => {
  it("limits long status output", () => {
    expect(summarizeStatus("a\nb\nc", 2)).toBe("a\nb\n... 1 more");
  });
});
