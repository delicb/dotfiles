export const HANDOVER_SUBCOMMANDS = [
  "create",
  "finish",
  "list",
  "review",
  "start",
] as const;

export type HandoverSubcommand = (typeof HANDOVER_SUBCOMMANDS)[number];

export interface ParsedHandoverCommand {
  subcommand: HandoverSubcommand | undefined;
  value: string;
}

export function parseHandoverCommand(args: string): ParsedHandoverCommand {
  const trimmed = args.trim();
  if (!trimmed) return { subcommand: undefined, value: "" };

  const separator = trimmed.search(/\s/);
  const command = separator === -1 ? trimmed : trimmed.slice(0, separator);
  const value = separator === -1 ? "" : trimmed.slice(separator).trim();
  const subcommand = HANDOVER_SUBCOMMANDS.find((item) => item === command);
  return { subcommand, value };
}

export function handoverUsage(): string {
  return [
    "Usage:",
    "  /handover create <name>",
    "  /handover list",
    "  /handover review <ID-or-plan-path>",
    "  /handover start <ID-or-plan-path>",
    "  /handover finish <ID-or-plan-path>",
  ].join("\n");
}
