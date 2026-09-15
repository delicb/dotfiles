export const USE_REQUESTED_WORKTREE = "Use the requested worktree";
export const USE_PRIMARY_WORKTREE =
  "Continue in the primary worktree for this session";
export const CANCEL_WORKTREE_CHOICE = "Cancel";

export type PrimaryWriteChoice =
  | "cancel"
  | "primary"
  | "unavailable"
  | "worktree";

export interface WorktreeChoiceRequest {
  branch: string;
  mode: "create" | "join";
}

export interface WorktreeChoicePrompt {
  options: string[];
  title: string;
}

export function buildWorktreeChoicePrompt(
  request: WorktreeChoiceRequest,
): WorktreeChoicePrompt {
  const action =
    request.mode === "create"
      ? `create a worktree for branch "${request.branch}"`
      : `join the worktree "${request.branch}"`;
  return {
    options: [
      USE_REQUESTED_WORKTREE,
      USE_PRIMARY_WORKTREE,
      CANCEL_WORKTREE_CHOICE,
    ],
    title: `The agent wants to ${action}. Where should it continue?`,
  };
}

export function resolvePrimaryWriteChoice(
  selection: string | undefined,
  hasUI: boolean,
): PrimaryWriteChoice {
  if (!hasUI) return "unavailable";
  if (selection === USE_REQUESTED_WORKTREE) return "worktree";
  if (selection === USE_PRIMARY_WORKTREE) return "primary";
  return "cancel";
}
