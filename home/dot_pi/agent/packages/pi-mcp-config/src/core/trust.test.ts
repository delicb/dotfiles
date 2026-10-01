import { describe, expect, it } from "vitest";
import { RepositoryTrust, type TrustOptions } from "./trust";

describe("RepositoryTrust", () => {
  const defaults: TrustOptions = {
    nativeTrusted: true,
    explicitApproval: false,
    savedDecision: null,
    nativeTrustCoversRepository: false,
    defaultTrust: "ask",
    hasUI: true,
  };

  it("asks when native Pi silently trusts a directory with only .mcp.json", () => {
    expect(RepositoryTrust.decide(defaults)).toBe("ask");
  });

  it("keeps unapproved repository servers disabled without an interactive UI", () => {
    expect(RepositoryTrust.decide({ ...defaults, hasUI: false })).toBe("deny");
  });

  it.each([
    { nativeTrusted: false, explicitApproval: true },
    { nativeTrusted: false, savedDecision: true },
    { savedDecision: false, nativeTrustCoversRepository: true },
    { defaultTrust: "never" as const },
  ])("respects denied trust: %j", (override) => {
    expect(RepositoryTrust.decide({ ...defaults, ...override })).toBe("deny");
  });

  it.each([
    { savedDecision: true },
    { nativeTrustCoversRepository: true },
    { explicitApproval: true, savedDecision: false },
    { defaultTrust: "always" as const, hasUI: false },
  ])("respects approved trust: %j", (override) => {
    expect(RepositoryTrust.decide({ ...defaults, ...override })).toBe("allow");
  });

  it("does not treat trust for a subdirectory as repository approval", () => {
    expect(
      RepositoryTrust.decide({
        ...defaults,
        nativeTrustCoversRepository: false,
        hasUI: false,
      }),
    ).toBe("deny");
  });
});
