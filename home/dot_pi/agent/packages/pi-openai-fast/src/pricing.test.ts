import { describe, expect, it } from "vitest";
import { publishedFastMultiplier } from "./pricing";

describe("published Fast pricing", () => {
  it.each([
    ["gpt-6-astra", 2],
    ["gpt-6.1-sol", 2],
    ["gpt-6-luna", 2],
    ["gpt-6-sol", 2],
    ["gpt-5.6-sol", 2],
    ["gpt-5.6-terra", 2],
    ["gpt-5.6-luna", 2],
    ["gpt-5.5", 2.5],
    ["gpt-5.4", 2],
    ["gpt-5.4-mini", 2],
    ["gpt-5.3-codex", 2],
    ["gpt-5.2", 2],
    ["gpt-5.1", 2],
    ["gpt-5", 2],
    ["gpt-5-mini", 1.8],
    ["gpt-4.1", 1.75],
    ["gpt-4.1-mini", 1.75],
    ["gpt-4.1-nano", 2],
    ["gpt-4o", 1.7],
    ["gpt-4o-2024-05-13", 1.75],
    ["gpt-4o-mini", 5 / 3],
    ["o3", 1.75],
    ["o4-mini", 20 / 11],
  ] as const)("uses the published ratio for %s", (id, multiplier) => {
    expect(publishedFastMultiplier(id)).toBeCloseTo(multiplier);
  });

  it.each([
    ["gpt-5.5-2026-04-23", 2.5],
    ["gpt-4.1-2025-04-14", 1.75],
    ["gpt-4o-2024-08-06", 1.7],
    ["o4-mini-2025-04-16", 20 / 11],
  ] as const)("uses the family ratio for snapshot %s", (id, multiplier) => {
    expect(publishedFastMultiplier(id)).toBeCloseTo(multiplier);
  });

  it.each([
    "future-model",
    "gpt-5.5-pro",
    "gpt-5.5-custom",
    "ft:gpt-4.1:custom-model",
    "constructor",
    "__proto__",
  ])("does not invent a published price for %s", (id) => {
    expect(publishedFastMultiplier(id)).toBeUndefined();
  });
});
