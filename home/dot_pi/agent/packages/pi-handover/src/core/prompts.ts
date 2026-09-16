export interface CreateHandoverPromptInput {
  baseCommit: string;
  branch: string;
  dirtyStatus: string;
  origin: string;
  planPath: string;
  repository: string;
  repositoryRoot: string;
  sourceSession: string;
}

export type HandoverMode = "create" | "finish" | "review" | "start";

export function buildCreatePrompt(input: CreateHandoverPromptInput): string {
  return [
    "/skill:agent-handover create",
    `Exact plan path: ${input.planPath}`,
    `Repository ID: ${input.repository}`,
    `Repository root: ${input.repositoryRoot}`,
    `Origin: ${input.origin || "none"}`,
    `Branch: ${input.branch}`,
    `Base commit: ${input.baseCommit}`,
    `Source session: ${input.sourceSession || "none"}`,
    "Repository status:",
    input.dirtyStatus || "clean",
    "Complete the handover draft at the exact plan path.",
  ].join("\n");
}

export function buildModePrompt(
  mode: Exclude<HandoverMode, "create">,
  planPath: string,
): string {
  return [
    `/skill:agent-handover ${mode}`,
    `Exact plan path: ${planPath}`,
    `Run ${mode} mode for this handover.`,
  ].join("\n");
}
