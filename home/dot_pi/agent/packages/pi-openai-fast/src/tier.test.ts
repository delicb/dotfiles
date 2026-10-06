import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./config/defaults";
import {
  fastMultiplier,
  pricingMultiplier,
  reportedTier,
  restoreEnabled,
  STATE_ENTRY,
  statusText,
} from "./tier";

const model = {
  provider: "openai-codex",
  api: "openai-codex-responses",
  id: "gpt-6.1-sol",
};

describe("tier rules", () => {
  it.each([
    ["openai", "openai-responses"],
    ["openai-codex", "openai-codex-responses"],
  ])("covers every configured chat model on %s", (provider, api) => {
    for (const id of ["gpt-6.1-sol", "gpt-6-sol", "future-model"]) {
      expect(fastMultiplier({ provider, api, id }, DEFAULT_CONFIG)).toBe(2);
    }
    expect(
      fastMultiplier({ provider, api, id: "gpt-5.5" }, DEFAULT_CONFIG),
    ).toBe(2.5);
    expect(
      fastMultiplier({ provider, api, id: "gpt-4.1" }, DEFAULT_CONFIG),
    ).toBe(1.75);
  });

  it("keeps provider and API matching exact", () => {
    for (const provider of [
      "openrouter",
      "openai-custom",
      "openai-codex-custom",
    ]) {
      expect(
        fastMultiplier({ ...model, provider }, DEFAULT_CONFIG),
      ).toBeUndefined();
    }
    expect(
      fastMultiplier({ ...model, api: "openai-responses" }, DEFAULT_CONFIG),
    ).toBeUndefined();
    expect(
      fastMultiplier(
        { ...model, provider: "openai", api: "openai-completions" },
        DEFAULT_CONFIG,
      ),
    ).toBeUndefined();
    expect(
      fastMultiplier(model, { ...DEFAULT_CONFIG, models: {} }),
    ).toBeUndefined();
    expect(fastMultiplier(undefined, DEFAULT_CONFIG)).toBeUndefined();
  });

  it("gives exact configuration overrides precedence over published prices", () => {
    const config = {
      ...DEFAULT_CONFIG,
      models: { "openai-codex/*": 4, "openai-codex/gpt-4.1": 3 },
    };
    expect(fastMultiplier({ ...model, id: "gpt-4.1" }, config)).toBe(3);
    expect(fastMultiplier({ ...model, id: "gpt-5.5" }, config)).toBe(2.5);
    expect(fastMultiplier({ ...model, id: "future-model" }, config)).toBe(4);
  });

  it("preserves explicit allowlists without adding wildcard coverage", () => {
    const config = {
      ...DEFAULT_CONFIG,
      models: { "openai-codex/gpt-6.1-sol": 3 },
    };
    expect(fastMultiplier(model, config)).toBe(3);
    expect(
      fastMultiplier({ ...model, id: "gpt-6-sol" }, config),
    ).toBeUndefined();
  });

  it("ignores inherited wildcard keys", () => {
    const config = {
      ...DEFAULT_CONFIG,
      models: Object.create({ "openai-codex/*": 2 }),
    };
    expect(fastMultiplier(model, config)).toBeUndefined();
  });

  it.each([
    "response.completed",
    "response.done",
    "response.incomplete",
  ])("reads terminal tiers from %s", (type) => {
    expect(reportedTier({ type, response: { service_tier: "fast" } })).toBe(
      "fast",
    );
    expect(reportedTier({ type, response: { service_tier: "priority" } })).toBe(
      "priority",
    );
  });

  it("ignores early events and unknown tier values", () => {
    expect(
      reportedTier({
        type: "response.created",
        response: { service_tier: "fast" },
      }),
    ).toBeUndefined();
    expect(
      reportedTier({
        type: "response.completed",
        response: { service_tier: "secret" },
      }),
    ).toBeUndefined();
    expect(reportedTier(null)).toBeUndefined();
  });

  it("normalizes aliases without treating a Codex default echo as a downgrade", () => {
    for (const tier of ["priority", "fast", undefined] as const) {
      expect(pricingMultiplier("openai-responses", tier, 2)).toBe(2);
    }
    expect(pricingMultiplier("openai-responses", "default", 2)).toBe(1);
    expect(pricingMultiplier("openai-codex-responses", "default", 2)).toBe(2);
    expect(pricingMultiplier("openai-responses", "flex", 2)).toBe(0.5);
  });

  it("restores the latest valid state from the selected branch", () => {
    const entries = [
      { type: "custom", customType: STATE_ENTRY, data: { enabled: true } },
      { type: "custom", customType: STATE_ENTRY, data: { enabled: false } },
      { type: "custom", customType: STATE_ENTRY, data: { enabled: "yes" } },
    ];
    expect(restoreEnabled(entries, true)).toBe(false);
    expect(restoreEnabled(entries.slice(0, 1), false)).toBe(true);
    expect(restoreEnabled([], true)).toBe(true);
  });

  it("shows the emoji only when the Fast preference is enabled", () => {
    expect(statusText(false)).toBeUndefined();
    expect(statusText(true)).toBe("⚡️");
  });
});
