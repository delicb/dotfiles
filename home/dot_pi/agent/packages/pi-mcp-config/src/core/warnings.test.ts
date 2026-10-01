import { describe, expect, it } from "vitest";
import { McpWarnings } from "./warnings";

describe("McpWarnings", () => {
  function warning(...lines: string[]): string {
    return `MCP servers need attention:\n${lines.join("\n")}\nRun /mcp to fix.`;
  }

  const gcloudError =
    "failed: gcloud auth print-access-token failed - run `gcloud auth login` (Command failed: gcloud auth print-access-token)";

  it("groups the supplied sign-in and gcloud failures", () => {
    const message = warning(
      "  linear-admin: needs sign-in",
      "  notion: needs sign-in",
      "  figma: needs sign-in",
      ...["gke", "gcs", "pubsub", "alloydb", "memorystore"].map(
        (name) => `  ${name}: ${gcloudError}`,
      ),
    );
    const compact = McpWarnings.compact(message);
    expect(compact).toBe(
      "MCP sign-in needed for linear-admin, notion, figma; gcloud auth failed for gke, gcs, pubsub, alloydb, memorystore",
    );
    expect(compact).not.toContain(":");
    expect(compact).not.toMatch(/[\r\n]/);
    expect(compact).not.toContain("/mcp");
    expect(compact.length).toBeLessThan(message.length / 3);
  });

  it("removes multiline diagnostics only for recognized gcloud failures", () => {
    const message = warning(
      `  gke: ${gcloudError}\nERROR: No active account.\n    at commandRunner (test.js:1:1)`,
      "  notion: needs sign-in",
    );
    expect(McpWarnings.compact(message)).toBe(
      "MCP sign-in needed for notion; gcloud auth failed for gke",
    );
  });

  it("keeps config errors and other connection details on one line", () => {
    const config =
      "  config: Invalid override setting.\nCheck the policy file.";
    const failures = [
      "  sentry: failed: Network unavailable.\n    at connect (test.js:2:1)",
      "  tools: failed: Permission denied.",
    ];
    const message = warning(config, "  figma: needs sign-in", ...failures);
    expect(McpWarnings.compact(message)).toBe(
      "config: Invalid override setting. Check the policy file.; sentry: failed: Network unavailable. at connect (test.js:2:1); tools: failed: Permission denied.; MCP sign-in needed for figma",
    );
  });

  it.each([
    "Signed in to MCP server figma.",
    "MCP failed to load: invalid configuration.",
    "MCP servers need attention:\n  figma: needs sign-in",
    warning("  tools: failed: Permission denied."),
    warning("  config: needs sign-in"),
    warning(
      "  gke: failed: gcloud auth print-access-token failed: executable not found",
    ),
    warning("  figma: needs sign-in\nUnexpected extra detail."),
    warning("Malformed server status."),
    warning(),
  ])("leaves unrelated or unrecognized messages unchanged: %s", (message) => {
    expect(McpWarnings.compact(message)).toBe(message);
  });

  it("does not compact its output a second time", () => {
    const compact = McpWarnings.compact(warning("  figma: needs sign-in"));
    expect(McpWarnings.compact(compact)).toBe(compact);
  });
});
