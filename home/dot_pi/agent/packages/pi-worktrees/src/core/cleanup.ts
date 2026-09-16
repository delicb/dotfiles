import { resolve } from "node:path";

export interface CleanupCandidate {
  branch?: string;
  path: string;
  state: string;
}

interface WorktreeChanges {
  conflicted?: unknown;
  deleted?: unknown;
  modified?: unknown;
  renamed?: unknown;
  staged?: unknown;
  untracked?: unknown;
}

interface WorktrunkListItem {
  branch?: unknown;
  display?: {
    state?: unknown;
  };
  worktree?: {
    changes?: WorktreeChanges;
    current?: unknown;
    main?: unknown;
    path?: unknown;
  };
}

interface WorktrunkListOutput {
  items?: unknown;
  schema?: unknown;
}

const INTEGRATED_STATES = new Set(["empty", "integrated"]);

export function parseCleanupCandidates(
  output: string,
  currentPath: string,
  integratedOnly: boolean,
): CleanupCandidate[] {
  let parsed: WorktrunkListOutput;
  try {
    parsed = JSON.parse(output) as WorktrunkListOutput;
  } catch {
    throw new Error("Worktrunk did not return a valid worktree list.");
  }

  if (parsed.schema !== 2 || !Array.isArray(parsed.items)) {
    throw new Error("Worktrunk returned an unsupported worktree list.");
  }

  const current = resolve(currentPath);
  const candidates: CleanupCandidate[] = [];

  for (const value of parsed.items) {
    const item = value as WorktrunkListItem;
    const worktree = item.worktree;
    if (!worktree) continue;
    const path = worktree.path;
    const state = item.display?.state;
    if (typeof path !== "string" || typeof state !== "string") continue;
    if (worktree.main === true || worktree.current === true) continue;
    if (resolve(path) === current) continue;
    if (!isClean(worktree.changes)) continue;
    if (integratedOnly && !INTEGRATED_STATES.has(state)) continue;

    candidates.push({
      branch: typeof item.branch === "string" ? item.branch : undefined,
      path: resolve(path),
      state,
    });
  }

  return candidates.sort((left, right) =>
    candidateName(left).localeCompare(candidateName(right)),
  );
}

export function formatCleanupCandidate(candidate: CleanupCandidate): string {
  return `${candidateName(candidate)} [${candidate.state}] - ${candidate.path}`;
}

function candidateName(candidate: CleanupCandidate): string {
  return candidate.branch ?? candidate.path;
}

function isClean(changes: WorktreeChanges | undefined): boolean {
  if (!changes || typeof changes !== "object") return false;
  return ![
    changes.conflicted,
    changes.deleted,
    changes.modified,
    changes.renamed,
    changes.staged,
    changes.untracked,
  ].some((value) => value === true);
}
