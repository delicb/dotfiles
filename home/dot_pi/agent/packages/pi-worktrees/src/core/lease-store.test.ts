import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ActiveWorktreeLeaseError, LeaseStore } from "./lease-store";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "pi-worktree-lease-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("LeaseStore", () => {
  it("acquires and releases one lease", async () => {
    const root = await temporaryDirectory();
    const worktree = join(root, "worktree");
    const commonGitDir = join(root, "git");
    await Promise.all([
      mkdir(worktree, { recursive: true }),
      mkdir(commonGitDir, { recursive: true }),
    ]);

    const store = new LeaseStore(commonGitDir, {
      isProcessAlive: (pid) => pid === 42,
      pid: 42,
    });
    await store.acquire(worktree, "session-1");

    expect(await store.listActive(worktree)).toMatchObject([
      { path: worktree, pid: 42, sessionId: "session-1" },
    ]);

    await store.release(worktree, "session-1");
    expect(await store.listActive(worktree)).toEqual([]);
  });

  it("removes a lease for a stopped process", async () => {
    const root = await temporaryDirectory();
    const worktree = join(root, "worktree");
    const commonGitDir = join(root, "git");
    await mkdir(worktree, { recursive: true });
    await mkdir(commonGitDir, { recursive: true });

    const writer = new LeaseStore(commonGitDir, {
      isProcessAlive: () => true,
      pid: 42,
    });
    await writer.acquire(worktree, "session-1");

    const reader = new LeaseStore(commonGitDir, {
      isProcessAlive: () => false,
      pid: 43,
    });
    expect(await reader.listActive(worktree)).toEqual([]);
  });

  it("tracks several sessions in one worktree", async () => {
    const root = await temporaryDirectory();
    const worktree = join(root, "worktree");
    const commonGitDir = join(root, "git");
    await mkdir(worktree, { recursive: true });
    await mkdir(commonGitDir, { recursive: true });

    const first = new LeaseStore(commonGitDir, {
      isProcessAlive: () => true,
      pid: 42,
    });
    const second = new LeaseStore(commonGitDir, {
      isProcessAlive: () => true,
      pid: 43,
    });
    await first.acquire(worktree, "session-1");
    await second.acquire(worktree, "session-2");

    expect(await first.listActive(worktree)).toHaveLength(2);
    await expect(
      first.guardCleanup(worktree, async () => "removed"),
    ).rejects.toBeInstanceOf(ActiveWorktreeLeaseError);
  });
});
