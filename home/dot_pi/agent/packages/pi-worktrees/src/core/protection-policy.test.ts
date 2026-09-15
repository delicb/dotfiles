import { describe, expect, it } from "vitest";
import type { ResolvedWorktreeConfig } from "../config";
import { decidePrimaryProtection } from "./protection-policy";

function config(
  overrides: Partial<ResolvedWorktreeConfig> = {},
): ResolvedWorktreeConfig {
  return {
    protectPrimaryByDefault: true,
    allow: [],
    deny: [],
    ...overrides,
  };
}

describe("decidePrimaryProtection", () => {
  it("uses the configured default", () => {
    expect(
      decidePrimaryProtection(
        config({ protectPrimaryByDefault: false }),
        "/repos/example",
      ),
    ).toEqual({ protect: false, source: "default" });
  });

  it("matches a repository folder name", () => {
    expect(
      decidePrimaryProtection(
        config({ allow: ["linear-app"] }),
        "/repos/github.com/linear/linear-app",
      ),
    ).toEqual({ protect: false, source: "allow", match: "linear-app" });
  });

  it("matches the root worktree folder name", () => {
    expect(
      decidePrimaryProtection(
        config({ allow: ["linear-app"] }),
        "/canonical/repositories/repo-123",
        { repositoryName: "linear-app" },
      ),
    ).toEqual({ protect: false, source: "allow", match: "linear-app" });
  });

  it("matches an absolute repository path", () => {
    expect(
      decidePrimaryProtection(
        config({
          protectPrimaryByDefault: false,
          deny: ["/repos/github.com/linear/linear-app/"],
        }),
        "/repos/github.com/linear/linear-app",
      ),
    ).toEqual({
      protect: true,
      source: "deny",
      match: "/repos/github.com/linear/linear-app/",
    });
  });

  it("expands the home directory in a repository path", () => {
    expect(
      decidePrimaryProtection(
        config({ allow: ["~/src/linear-app"] }),
        "/home/del-boy/src/linear-app",
        { homeDirectory: "/home/del-boy" },
      ),
    ).toEqual({
      protect: false,
      source: "allow",
      match: "~/src/linear-app",
    });
  });

  it("gives deny entries precedence over allow entries", () => {
    expect(
      decidePrimaryProtection(
        config({ allow: ["linear-app"], deny: ["linear-app"] }),
        "/repos/github.com/linear/linear-app",
      ),
    ).toEqual({ protect: true, source: "deny", match: "linear-app" });
  });

  it("does not treat a relative path as a folder name", () => {
    expect(
      decidePrimaryProtection(
        config({ allow: ["github.com/linear/linear-app"] }),
        "/repos/github.com/linear/linear-app",
      ),
    ).toEqual({ protect: true, source: "default" });
  });
});
