import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHandoverId,
  formatHandoverList,
  getStorageRoot,
  listHandovers,
  normalizeRemote,
  repositoryId,
  reserveHandoverDirectory,
  resolvePlanReference,
  slugify,
} from "./store";

describe("handover store", () => {
  it("normalizes common Git remotes", () => {
    expect(normalizeRemote("git@github.com:delicb/dotfiles.git")).toBe(
      "github.com/delicb/dotfiles",
    );
    expect(normalizeRemote("https://gitlab.com/group/repo.git")).toBe(
      "gitlab.com/group/repo",
    );
    expect(normalizeRemote("ssh://git@example.com/team/repo.git")).toBe(
      "example.com/team/repo",
    );
  });

  it("uses a stable local repository ID without a remote", () => {
    expect(repositoryId("", "/tmp/example")).toMatch(
      /^local\/example-[a-f0-9]{8}$/,
    );
  });

  it("builds safe handover IDs", () => {
    expect(slugify("Fix OAuth refresh! ")).toBe("fix-oauth-refresh");
    expect(
      buildHandoverId(new Date("2026-03-23T15:30:12Z"), "Fix OAuth refresh"),
    ).toBe("2026-03-23/153012-fix-oauth-refresh");
  });

  it("uses the configured storage root", () => {
    expect(
      getStorageRoot({ AGENT_HANDOVER_DIR: "~/plans", HOME: "/home/test" }),
    ).toBe("/home/test/plans");
    expect(getStorageRoot({ HOME: "/home/test" })).toBe(
      "/home/test/.local/share/agent-handoffs",
    );
  });

  it("reserves unique directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-handover-"));
    const now = new Date("2026-03-23T15:30:12Z");
    const first = await reserveHandoverDirectory(
      root,
      "github.com/owner/repo",
      now,
      "example",
    );
    const second = await reserveHandoverDirectory(
      root,
      "github.com/owner/repo",
      now,
      "example",
    );

    expect(first.id).toBe("2026-03-23/153012-example");
    expect(second.id).toBe("2026-03-23/153012-example-2");
  });

  it("lists and resolves plans", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-handover-"));
    const directory = join(
      root,
      "github.com",
      "owner",
      "repo",
      "2026-03-23",
      "153012-example",
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "plan.md"),
      "---\nstatus: ready\n---\n# Example plan\n",
    );
    await writeFile(
      join(directory, "review.md"),
      "---\nstatus: pass\n---\n# Review\n",
    );

    const records = await listHandovers(root, "github.com/owner/repo");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      hasReview: true,
      id: "2026-03-23/153012-example",
      status: "ready",
      title: "Example plan",
    });
    expect(
      await resolvePlanReference(
        "153012-example",
        "/tmp",
        root,
        "github.com/owner/repo",
      ),
    ).toBe(join(directory, "plan.md"));
    expect(formatHandoverList("github.com/owner/repo", records)).toContain(
      "[ready] [reviewed]",
    );
  });
});
