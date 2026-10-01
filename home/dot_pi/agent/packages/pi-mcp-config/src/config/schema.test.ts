import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { ConfigValidation } from "./validation";

describe("MCP override schema", () => {
  const schema = JSON.parse(
    readFileSync(
      new URL("../../mcp-overrides.schema.json", import.meta.url),
      "utf8",
    ),
  );
  const validate = new Ajv().compile(schema);

  it.each(
    [
      {},
      { $schema: "./mcp-overrides.schema.json" },
      { defaults: {} },
      { defaults: { exposure: "codemode", enabled: false } },
      { defaults: { toolExposure: { "get_*": "direct", "*": "hidden" } } },
      { servers: { "linear-admin": { exposure: "deferred" } } },
      { servers: { constructor: { enabled: true } } },
      { servers: { tools: { exposure: "codemode-deferred" } } },
    ].map((value) => ({ value })),
  )("accepts valid configuration: %j", ({ value }) => {
    expect(validate(value)).toBe(true);
    expect(() => ConfigValidation.overrides(value)).not.toThrow();
  });

  it.each(
    [
      null,
      [],
      { $schema: 1 },
      { default: {} },
      { defaults: null },
      { defaults: [] },
      { defaults: { enabled: "false" } },
      { defaults: { command: "node" } },
      { defaults: { exposure: "unknown" } },
      { defaults: { toolExposure: [] } },
      { defaults: { toolExposure: { "*": true } } },
      { servers: [] },
      { servers: { "": {} } },
      { servers: { "invalid name": {} } },
      { servers: { tools: null } },
      { servers: { tools: { url: "https://example.com" } } },
    ].map((value) => ({ value })),
  )("rejects invalid configuration: %j", ({ value }) => {
    expect(validate(value)).toBe(false);
    expect(() => ConfigValidation.overrides(value)).toThrow();
  });

  it.each([
    "codemode",
    "deferred",
    "direct",
    "hidden",
    "codemode-deferred",
  ])("accepts exposure %s at each policy level", (exposure) => {
    const value = {
      defaults: { exposure, toolExposure: { "*": exposure } },
      servers: { tools: { exposure, toolExposure: { get_tool: exposure } } },
    };
    expect(validate(value)).toBe(true);
    expect(() => ConfigValidation.overrides(value)).not.toThrow();
  });
});
