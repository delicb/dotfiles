import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG } from "../../src/config/defaults";
import { loadConfig } from "../../src/config/loader";
import {
  fastMultiplier,
  modelKey,
  PROVIDERS,
  restoreEnabled,
  STATE_ENTRY,
  STATUS_KEY,
  statusText,
  type TierReport,
} from "../../src/tier";
import { wrapProvider } from "./provider";

const WARNING =
  "Fast mode requests premium processing. The backend can reject unsupported models. Included Codex usage can run out faster. Pi costs are estimates, not subscription quota.";

export default function openAIFast(pi: ExtensionAPI): void {
  let config = DEFAULT_CONFIG;
  let enabled = false;
  let available = false;
  let context: ExtensionContext | undefined;
  let generation = 0;
  let report: TierReport | undefined;

  function updateStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus(STATUS_KEY, statusText(enabled));
  }

  function restore(ctx: ExtensionContext): void {
    enabled =
      available &&
      restoreEnabled(
        ctx.sessionManager.getBranch(),
        pi.getFlag("fast") === true || config.enabled,
      );
    report = undefined;
    updateStatus(ctx);
  }

  function describe(ctx: ExtensionContext): string {
    const model = ctx.model ? modelKey(ctx.model) : "no model";
    if (!available)
      return "Fast mode is unavailable because configuration is invalid.";
    if (!enabled)
      return `Fast mode is off for ${model}. Other service-tier settings remain unchanged.`;
    const multiplier = fastMultiplier(ctx.model, config);
    if (multiplier === undefined) {
      return `Fast mode is on, but ${model} is outside the configured models or supported APIs. This extension will not send a tier override.`;
    }
    const observed =
      report?.modelKey === model ? report.reportedTier : undefined;
    const response = observed ? ` Last reported tier: ${observed}.` : "";
    return `Requesting priority processing for ${model}. Requested Fast cost estimate: ${multiplier}x catalog Standard rates.${response} ${WARNING}`;
  }

  pi.registerFlag("fast", {
    description: "Request OpenAI Fast mode for configured chat models",
    type: "boolean",
    default: false,
  });

  pi.registerCommand("fast", {
    description: "Toggle OpenAI Fast mode for this session",
    getArgumentCompletions(prefix) {
      const items = ["on", "off", "status"]
        .filter((value) => value.startsWith(prefix.trim().toLowerCase()))
        .map((value) => ({ value, label: value }));
      return items.length ? items : null;
    },
    async handler(args, ctx) {
      const action = args.trim().toLowerCase();
      if (!["", "on", "off", "status"].includes(action)) {
        ctx.ui.notify("Usage: /fast [on|off|status]", "warning");
        return;
      }
      if (action === "status") {
        ctx.ui.notify(describe(ctx), "info");
        return;
      }
      if (!available) {
        ctx.ui.notify(describe(ctx), "error");
        return;
      }
      enabled = action === "" ? !enabled : action === "on";
      report = undefined;
      pi.appendEntry(STATE_ENTRY, { enabled });
      updateStatus(ctx);
      ctx.ui.notify(describe(ctx), enabled ? "warning" : "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    context = ctx;
    const currentGeneration = ++generation;
    available = false;
    try {
      config = loadConfig({
        agentDir: getAgentDir(),
        cwd: ctx.cwd,
        projectTrusted: ctx.isProjectTrusted(),
      });
      available = true;
    } catch (error) {
      ctx.ui.notify(
        error instanceof Error
          ? error.message
          : "Invalid Fast mode configuration.",
        "error",
      );
    }
    restore(ctx);
    for (const id of PROVIDERS) {
      const provider = ctx.modelRegistry.getProvider(id);
      if (!provider) continue;
      pi.registerProvider(
        wrapProvider(
          provider,
          (model) =>
            currentGeneration === generation && enabled
              ? fastMultiplier(model, config)
              : undefined,
          (next) => {
            if (currentGeneration !== generation || !context) return;
            report = next;
            updateStatus(context);
          },
        ),
      );
    }
    if (enabled) ctx.ui.notify(describe(ctx), "warning");
  });

  pi.on("model_select", (_event, ctx) => {
    context = ctx;
    report = undefined;
    updateStatus(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    context = ctx;
    restore(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    generation += 1;
    context = undefined;
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
