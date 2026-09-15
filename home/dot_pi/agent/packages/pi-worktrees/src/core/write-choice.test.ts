import { describe, expect, it } from "vitest";
import {
  buildWorktreeChoicePrompt,
  CANCEL_WORKTREE_CHOICE,
  resolvePrimaryWriteChoice,
  USE_PRIMARY_WORKTREE,
  USE_REQUESTED_WORKTREE,
} from "./write-choice";

describe("buildWorktreeChoicePrompt", () => {
  it("describes a new worktree request", () => {
    expect(
      buildWorktreeChoicePrompt({ branch: "feature/example", mode: "create" }),
    ).toEqual({
      options: [
        USE_REQUESTED_WORKTREE,
        USE_PRIMARY_WORKTREE,
        CANCEL_WORKTREE_CHOICE,
      ],
      title:
        'The agent wants to create a worktree for branch "feature/example". Where should it continue?',
    });
  });

  it("describes a worktree join request", () => {
    expect(
      buildWorktreeChoicePrompt({ branch: "feature/shared", mode: "join" })
        .title,
    ).toBe(
      'The agent wants to join the worktree "feature/shared". Where should it continue?',
    );
  });
});

describe("resolvePrimaryWriteChoice", () => {
  it("maps each available selection", () => {
    expect(resolvePrimaryWriteChoice(USE_REQUESTED_WORKTREE, true)).toBe(
      "worktree",
    );
    expect(resolvePrimaryWriteChoice(USE_PRIMARY_WORKTREE, true)).toBe(
      "primary",
    );
    expect(resolvePrimaryWriteChoice(CANCEL_WORKTREE_CHOICE, true)).toBe(
      "cancel",
    );
  });

  it("treats dismissal as cancellation", () => {
    expect(resolvePrimaryWriteChoice(undefined, true)).toBe("cancel");
  });

  it("reports that a choice is unavailable without UI", () => {
    expect(resolvePrimaryWriteChoice(USE_REQUESTED_WORKTREE, false)).toBe(
      "unavailable",
    );
  });
});
