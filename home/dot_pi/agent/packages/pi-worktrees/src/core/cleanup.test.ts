import { describe, expect, it } from "vitest";
import { formatCleanupCandidate, parseCleanupCandidates } from "./cleanup";

const cleanChanges = {
  conflicted: false,
  deleted: false,
  modified: false,
  renamed: false,
  staged: false,
  untracked: false,
};

function worktrunkOutput(): string {
  return JSON.stringify({
    schema: 2,
    items: [
      {
        branch: "main",
        display: { state: "is_main" },
        worktree: {
          changes: cleanChanges,
          current: true,
          main: true,
          path: "/repo",
        },
      },
      {
        branch: "feature/current",
        display: { state: "empty" },
        worktree: {
          changes: cleanChanges,
          current: false,
          main: false,
          path: "/worktrees/current",
        },
      },
      {
        branch: "feature/integrated",
        display: { state: "integrated" },
        worktree: {
          changes: cleanChanges,
          current: false,
          main: false,
          path: "/worktrees/integrated",
        },
      },
      {
        branch: "feature/ahead",
        display: { state: "ahead" },
        worktree: {
          changes: cleanChanges,
          current: false,
          main: false,
          path: "/worktrees/ahead",
        },
      },
      {
        branch: "feature/dirty",
        display: { state: "integrated" },
        worktree: {
          changes: { ...cleanChanges, modified: true },
          current: false,
          main: false,
          path: "/worktrees/dirty",
        },
      },
    ],
  });
}

describe("parseCleanupCandidates", () => {
  it("lists clean inactive worktrees for manual cleanup", () => {
    expect(
      parseCleanupCandidates(worktrunkOutput(), "/worktrees/current", false),
    ).toEqual([
      {
        branch: "feature/ahead",
        path: "/worktrees/ahead",
        state: "ahead",
      },
      {
        branch: "feature/integrated",
        path: "/worktrees/integrated",
        state: "integrated",
      },
    ]);
  });

  it("keeps only integrated worktrees for garbage collection", () => {
    expect(parseCleanupCandidates(worktrunkOutput(), "/repo", true)).toEqual([
      {
        branch: "feature/current",
        path: "/worktrees/current",
        state: "empty",
      },
      {
        branch: "feature/integrated",
        path: "/worktrees/integrated",
        state: "integrated",
      },
    ]);
  });

  it("rejects unsupported output", () => {
    expect(() => parseCleanupCandidates("{}", "/repo", true)).toThrow(
      "Worktrunk returned an unsupported worktree list.",
    );
  });
});

describe("formatCleanupCandidate", () => {
  it("includes the branch, state, and path", () => {
    expect(
      formatCleanupCandidate({
        branch: "feature/a",
        path: "/worktrees/a",
        state: "integrated",
      }),
    ).toBe("feature/a [integrated] - /worktrees/a");
  });
});
