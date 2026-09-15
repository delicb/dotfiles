import { describe, expect, it } from "vitest";
import { parseWorktreeSettings } from "./loader";

describe("parseWorktreeSettings", () => {
  it("uses safe defaults when worktree settings are absent", () => {
    expect(parseWorktreeSettings({}).config).toEqual({
      protectPrimaryByDefault: true,
      allow: [],
      deny: [],
    });
  });

  it("loads the default and repository lists", () => {
    expect(
      parseWorktreeSettings({
        worktrees: {
          protectPrimaryByDefault: false,
          allow: ["linear-app", " /repos/dotfiles "],
          deny: ["production"],
        },
      }).config,
    ).toEqual({
      protectPrimaryByDefault: false,
      allow: ["linear-app", "/repos/dotfiles"],
      deny: ["production"],
    });
  });

  it("ignores invalid values and reports warnings", () => {
    const result = parseWorktreeSettings({
      worktrees: {
        protectPrimaryByDefault: "yes",
        allow: ["linear-app", "", 42],
        deny: "production",
      },
    });

    expect(result.config).toEqual({
      protectPrimaryByDefault: true,
      allow: ["linear-app"],
      deny: [],
    });
    expect(result.warnings).toHaveLength(3);
  });
});
