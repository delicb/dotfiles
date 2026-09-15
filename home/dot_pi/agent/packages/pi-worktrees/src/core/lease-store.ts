import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export interface WorktreeLease {
  heartbeatAt: string;
  path: string;
  pid: number;
  sessionId: string;
  startedAt: string;
}

export class ActiveWorktreeLeaseError extends Error {
  public constructor(public readonly leases: WorktreeLease[]) {
    super(
      `The worktree has ${leases.length} active Pi ${leases.length === 1 ? "session" : "sessions"}.`,
    );
    this.name = "ActiveWorktreeLeaseError";
  }
}

interface LeaseStoreOptions {
  isProcessAlive?: (pid: number) => boolean;
  lockTimeoutMs?: number;
  now?: () => Date;
  pid?: number;
}

export class LeaseStore {
  private readonly isProcessAlive: (pid: number) => boolean;
  private readonly lockTimeoutMs: number;
  private readonly now: () => Date;
  private readonly pid: number;
  private readonly stateRoot: string;

  public constructor(commonGitDir: string, options: LeaseStoreOptions = {}) {
    this.stateRoot = join(commonGitDir, "pi-worktrees");
    this.pid = options.pid ?? process.pid;
    this.now = options.now ?? (() => new Date());
    this.lockTimeoutMs = options.lockTimeoutMs ?? 300_000;
    this.isProcessAlive = options.isProcessAlive ?? processIsAlive;
  }

  public async acquire(worktreePath: string, sessionId: string): Promise<void> {
    await this.withLock(worktreePath, async () => {
      await access(worktreePath);
      const existing = await this.readLease(worktreePath, sessionId);
      const now = this.now().toISOString();
      const lease: WorktreeLease = {
        heartbeatAt: now,
        path: worktreePath,
        pid: this.pid,
        sessionId,
        startedAt: existing?.startedAt ?? now,
      };
      await this.writeLease(worktreePath, lease);
    });
  }

  public async heartbeat(
    worktreePath: string,
    sessionId: string,
  ): Promise<void> {
    await this.withLock(worktreePath, async () => {
      const lease = await this.readLease(worktreePath, sessionId);
      if (!lease || lease.pid !== this.pid) return;
      await this.writeLease(worktreePath, {
        ...lease,
        heartbeatAt: this.now().toISOString(),
      });
    });
  }

  public async release(worktreePath: string, sessionId: string): Promise<void> {
    await this.withLock(worktreePath, async () => {
      await rm(this.leasePath(worktreePath, sessionId), { force: true });
      await this.removeEmptyLeaseDirectory(worktreePath);
    });
  }

  public async listActive(worktreePath: string): Promise<WorktreeLease[]> {
    return this.withLock(worktreePath, () =>
      this.listActiveWithoutLock(worktreePath),
    );
  }

  public async guardCleanup<T>(
    worktreePath: string,
    cleanup: () => Promise<T>,
  ): Promise<T> {
    return this.withLock(worktreePath, async () => {
      const leases = await this.listActiveWithoutLock(worktreePath);
      if (leases.length > 0) throw new ActiveWorktreeLeaseError(leases);

      const result = await cleanup();
      await rm(this.leaseDirectory(worktreePath), {
        force: true,
        recursive: true,
      });
      return result;
    });
  }

  private async listActiveWithoutLock(
    worktreePath: string,
  ): Promise<WorktreeLease[]> {
    const directory = this.leaseDirectory(worktreePath);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (isErrorCode(error, "ENOENT")) return [];
      throw error;
    }

    const active: WorktreeLease[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const path = join(directory, name);
      const lease = await readLeaseFile(path);
      if (!lease || !this.isProcessAlive(lease.pid)) {
        await rm(path, { force: true });
        continue;
      }
      active.push(lease);
    }

    await this.removeEmptyLeaseDirectory(worktreePath);
    return active.sort((left, right) =>
      left.startedAt.localeCompare(right.startedAt),
    );
  }

  private async withLock<T>(
    worktreePath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockDirectory = join(
      this.stateRoot,
      "locks",
      worktreeKey(worktreePath),
    );
    await mkdir(join(this.stateRoot, "locks"), { recursive: true });

    const token = randomUUID();
    const deadline = Date.now() + this.lockTimeoutMs;
    while (true) {
      try {
        await mkdir(lockDirectory);
        await writeFile(
          join(lockDirectory, "owner.json"),
          JSON.stringify({ pid: this.pid, token }),
          "utf8",
        );
        break;
      } catch (error) {
        if (!isErrorCode(error, "EEXIST")) throw error;
        if (await this.removeDeadLock(lockDirectory)) continue;
        if (Date.now() >= deadline) {
          throw new Error(
            `Timed out while waiting for the worktree lock: ${worktreePath}`,
          );
        }
        await sleep(100);
      }
    }

    try {
      return await operation();
    } finally {
      await this.releaseLock(lockDirectory, token);
    }
  }

  private async removeDeadLock(lockDirectory: string): Promise<boolean> {
    try {
      const value = JSON.parse(
        await readFile(join(lockDirectory, "owner.json"), "utf8"),
      ) as { pid?: unknown };
      if (typeof value.pid === "number" && this.isProcessAlive(value.pid)) {
        return false;
      }
    } catch {
      try {
        const lock = await stat(lockDirectory);
        if (Date.now() - lock.mtimeMs < 5_000) return false;
      } catch (error) {
        return isErrorCode(error, "ENOENT");
      }
    }

    await rm(lockDirectory, { force: true, recursive: true });
    return true;
  }

  private async releaseLock(
    lockDirectory: string,
    token: string,
  ): Promise<void> {
    try {
      const value = JSON.parse(
        await readFile(join(lockDirectory, "owner.json"), "utf8"),
      ) as { token?: unknown };
      if (value.token !== token) return;
      await rm(lockDirectory, { force: true, recursive: true });
    } catch (error) {
      if (!isErrorCode(error, "ENOENT")) throw error;
    }
  }

  private async readLease(
    worktreePath: string,
    sessionId: string,
  ): Promise<WorktreeLease | undefined> {
    return readLeaseFile(this.leasePath(worktreePath, sessionId));
  }

  private async writeLease(
    worktreePath: string,
    lease: WorktreeLease,
  ): Promise<void> {
    const directory = this.leaseDirectory(worktreePath);
    await mkdir(directory, { recursive: true });
    const destination = this.leasePath(worktreePath, lease.sessionId);
    const temporary = `${destination}.${this.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(lease)}\n`, "utf8");
    await rename(temporary, destination);
  }

  private async removeEmptyLeaseDirectory(worktreePath: string): Promise<void> {
    try {
      const directory = this.leaseDirectory(worktreePath);
      if ((await readdir(directory)).length === 0) {
        await rm(directory, { recursive: true });
      }
    } catch (error) {
      if (!isErrorCode(error, "ENOENT") && !isErrorCode(error, "ENOTEMPTY")) {
        throw error;
      }
    }
  }

  private leaseDirectory(worktreePath: string): string {
    return join(this.stateRoot, "leases", worktreeKey(worktreePath));
  }

  private leasePath(worktreePath: string, sessionId: string): string {
    const safeSessionId = sessionId.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.leaseDirectory(worktreePath), `${safeSessionId}.json`);
  }
}

async function readLeaseFile(path: string): Promise<WorktreeLease | undefined> {
  try {
    const value = JSON.parse(
      await readFile(path, "utf8"),
    ) as Partial<WorktreeLease>;
    if (
      typeof value.heartbeatAt !== "string" ||
      typeof value.path !== "string" ||
      typeof value.pid !== "number" ||
      typeof value.sessionId !== "string" ||
      typeof value.startedAt !== "string"
    ) {
      return undefined;
    }
    return value as WorktreeLease;
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return undefined;
    return undefined;
  }
}

function worktreeKey(worktreePath: string): string {
  return createHash("sha256").update(worktreePath).digest("hex").slice(0, 24);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrorCode(error, "EPERM");
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}
