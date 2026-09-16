import { describe, expect, it } from "vitest";
import type { ResolvedWorktreeConfig } from "../config";
import { decideWorktreePolicy } from "./protection-policy";

function config(
  overrides: Partial<ResolvedWorktreeConfig> = {},
): ResolvedWorktreeConfig {
  return {
    default: "ask",
    repositories: {},
    ...overrides,
  };
}

describe("decideWorktreePolicy", () => {
  it("uses the configured default", () => {
    expect(
      decideWorktreePolicy(config({ default: "never" }), "/repos/example"),
    ).toEqual({ policy: "never", source: "default" });
  });

  it("matches a repository folder name", () => {
    expect(
      decideWorktreePolicy(
        config({ repositories: { "linear-app": "always" } }),
        "/repos/github.com/linear/linear-app",
      ),
    ).toEqual({
      policy: "always",
      source: "repository",
      match: "linear-app",
    });
  });

  it("matches the root worktree folder name", () => {
    expect(
      decideWorktreePolicy(
        config({ repositories: { "linear-app": "never" } }),
        "/canonical/repositories/repo-123",
        { repositoryName: "linear-app" },
      ),
    ).toEqual({
      policy: "never",
      source: "repository",
      match: "linear-app",
    });
  });

  it("matches an absolute repository path", () => {
    expect(
      decideWorktreePolicy(
        config({
          default: "never",
          repositories: {
            "/repos/github.com/linear/linear-app/": "ask",
          },
        }),
        "/repos/github.com/linear/linear-app",
      ),
    ).toEqual({
      policy: "ask",
      source: "repository",
      match: "/repos/github.com/linear/linear-app/",
    });
  });

  it("expands the home directory in a repository path", () => {
    expect(
      decideWorktreePolicy(
        config({ repositories: { "~/src/linear-app": "always" } }),
        "/home/del-boy/src/linear-app",
        { homeDirectory: "/home/del-boy" },
      ),
    ).toEqual({
      policy: "always",
      source: "repository",
      match: "~/src/linear-app",
    });
  });

  it("gives an absolute path precedence over a folder name", () => {
    expect(
      decideWorktreePolicy(
        config({
          repositories: {
            "linear-app": "always",
            "/repos/github.com/linear/linear-app": "never",
          },
        }),
        "/repos/github.com/linear/linear-app",
      ),
    ).toEqual({
      policy: "never",
      source: "repository",
      match: "/repos/github.com/linear/linear-app",
    });
  });

  it("does not treat a relative path as a folder name", () => {
    expect(
      decideWorktreePolicy(
        config({
          repositories: { "github.com/linear/linear-app": "always" },
        }),
        "/repos/github.com/linear/linear-app",
      ),
    ).toEqual({ policy: "ask", source: "default" });
  });
});
