import type { FastConfig } from "./config/types";
import { publishedFastMultiplier } from "./pricing";

export const STATE_ENTRY = "openai-fast-state";
export const STATUS_KEY = "openai-fast";
export const PROVIDERS = ["openai", "openai-codex"] as const;

export interface ModelRef {
  provider: string;
  api: string;
  id: string;
}

export type ReportedTier =
  | "priority"
  | "fast"
  | "default"
  | "auto"
  | "flex"
  | "scale";

export interface TierReport {
  modelKey: string;
  reportedTier?: ReportedTier;
  multiplier: number;
}

export function modelKey(model: ModelRef): string {
  return `${model.provider}/${model.id}`;
}

export function fastMultiplier(
  model: ModelRef | undefined,
  config: FastConfig,
): number | undefined {
  if (
    !model ||
    !(
      (model.provider === "openai" && model.api === "openai-responses") ||
      (model.provider === "openai-codex" &&
        model.api === "openai-codex-responses")
    )
  ) {
    return undefined;
  }
  const exact = modelKey(model);
  if (Object.hasOwn(config.models, exact)) return config.models[exact];
  const wildcard = `${model.provider}/*`;
  if (!Object.hasOwn(config.models, wildcard)) return undefined;
  return publishedFastMultiplier(model.id) ?? config.models[wildcard];
}

export function reportedTier(data: unknown): ReportedTier | undefined {
  if (!data || typeof data !== "object" || !("type" in data)) return undefined;
  if (
    data.type !== "response.completed" &&
    data.type !== "response.done" &&
    data.type !== "response.incomplete"
  ) {
    return undefined;
  }
  if (!("response" in data)) return undefined;
  const response = data.response;
  if (
    !response ||
    typeof response !== "object" ||
    !("service_tier" in response)
  ) {
    return undefined;
  }
  switch (response.service_tier) {
    case "priority":
    case "fast":
    case "default":
    case "auto":
    case "flex":
    case "scale":
      return response.service_tier;
    default:
      return undefined;
  }
}

export function pricingMultiplier(
  api: string,
  tier: ReportedTier | undefined,
  requestedMultiplier: number,
): number {
  if (tier === "priority" || tier === "fast" || tier === undefined) {
    return requestedMultiplier;
  }
  // Codex can echo Standard even after accepting a priority request.
  if (tier === "default" && api === "openai-codex-responses") {
    return requestedMultiplier;
  }
  return tier === "flex" ? 0.5 : 1;
}

export function restoreEnabled(
  entries: readonly { type: string; customType?: string; data?: unknown }[],
  fallback: boolean,
): boolean {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== STATE_ENTRY) continue;
    const data = entry.data;
    if (
      data &&
      typeof data === "object" &&
      "enabled" in data &&
      typeof data.enabled === "boolean"
    ) {
      return data.enabled;
    }
  }
  return fallback;
}

export function statusText(enabled: boolean): string | undefined {
  return enabled ? "⚡️" : undefined;
}
