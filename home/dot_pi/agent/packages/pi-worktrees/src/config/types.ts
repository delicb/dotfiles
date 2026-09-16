export const WORKTREE_POLICIES = ["always", "never", "ask"] as const;

export type WorktreePolicy = (typeof WORKTREE_POLICIES)[number];

export interface WorktreeConfig {
  default?: WorktreePolicy;
  repositories?: Record<string, WorktreePolicy>;
}

export interface ResolvedWorktreeConfig {
  default: WorktreePolicy;
  repositories: Record<string, WorktreePolicy>;
}

export interface LoadedWorktreeConfig {
  config: ResolvedWorktreeConfig;
  warnings: string[];
}
