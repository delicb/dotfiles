import { describe, expect, it } from "vitest";
import { parseWorktreeSettings } from "./loader";

describe("parseWorktreeSettings", () => {
  it("uses safe defaults when worktree settings are absent", () => {
    expect(parseWorktreeSettings({}).config).toEqual({
      default: "ask",
      repositories: {},
    });
  });

  it("loads the default and repository policies", () => {
    expect(
      parseWorktreeSettings({
        worktrees: {
          default: "always",
          repositories: {
            " linear-app ": "never",
            "/repos/dotfiles": "ask",
          },
        },
      }).config,
    ).toEqual({
      default: "always",
      repositories: {
        "linear-app": "never",
        "/repos/dotfiles": "ask",
      },
    });
  });

  it("ignores invalid values and reports warnings", () => {
    const result = parseWorktreeSettings({
      worktrees: {
        default: "sometimes",
        repositories: {
          "": "always",
          "linear-app": "sometimes",
          dotfiles: "never",
        },
      },
    });

    expect(result.config).toEqual({
      default: "ask",
      repositories: { dotfiles: "never" },
    });
    expect(result.warnings).toHaveLength(2);
  });

  it("rejects a non-object repository map", () => {
    const result = parseWorktreeSettings({
      worktrees: {
        repositories: ["linear-app"],
      },
    });

    expect(result.config.repositories).toEqual({});
    expect(result.warnings).toHaveLength(1);
  });
});
