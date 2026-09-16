import { describe, expect, it } from "vitest";
import { handoverUsage, parseHandoverCommand } from "./command";

describe("handover command parser", () => {
  it("parses a subcommand and value", () => {
    expect(parseHandoverCommand("review 2026-03-23/153012-example")).toEqual({
      subcommand: "review",
      value: "2026-03-23/153012-example",
    });
  });

  it("rejects unknown subcommands", () => {
    expect(parseHandoverCommand("remove example")).toEqual({
      subcommand: undefined,
      value: "example",
    });
  });

  it("shows every supported command", () => {
    const usage = handoverUsage();
    expect(usage).toContain("/handover create");
    expect(usage).toContain("/handover finish");
  });
});
