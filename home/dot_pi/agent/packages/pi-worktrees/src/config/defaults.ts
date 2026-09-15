import type { ResolvedWorktreeConfig } from "./types";

export const DEFAULT_WORKTREE_CONFIG: ResolvedWorktreeConfig = {
  protectPrimaryByDefault: true,
  allow: [],
  deny: [],
};
