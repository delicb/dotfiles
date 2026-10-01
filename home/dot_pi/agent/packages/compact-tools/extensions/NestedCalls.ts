import type {
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
} from "@earendil-works/pi-coding-agent";

/** Keep child-call results in memory for tool displays only. */
export class NestedCalls {
  public get(parentId: string): readonly ChildCall[] {
    return [...(this.parents.get(parentId)?.values() ?? [])];
  }

  public observe(
    event: ToolExecutionStartEvent | ToolExecutionUpdateEvent | ToolExecutionEndEvent,
  ): void {
    const parentId = event.parentToolCallId;
    if (!parentId) {
      return;
    }
    while (
      (!this.parents.has(parentId) && this.parents.size >= 128) ||
      (this.count >= 2048 && !this.parents.get(parentId)?.has(event.toolCallId))
    ) {
      const oldest = this.parents.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.drop(oldest);
    }
    let children = this.parents.get(parentId);
    if (!children) {
      children = new Map();
      this.parents.set(parentId, children);
    }
    let call = children.get(event.toolCallId);
    if (!call) {
      if (children.size >= 256) {
        return;
      }
      call = {
        id: event.toolCallId,
        parentId,
        name: event.toolName,
        args: undefined,
        status: "running",
        revision: 0,
        startedAt: performance.now(),
      };
      children.set(call.id, call);
      this.count++;
    }
    call.revision = ++this.revision;
    if ("args" in event) {
      call.args = this.keepArguments(event.args);
    }
    if (event.type !== "tool_execution_start") {
      const result: ChildResult = {
        ...(event.type === "tool_execution_end" ? event.result : event.partialResult),
        isError: event.type === "tool_execution_end" && event.isError,
      };
      if (event.type === "tool_execution_end") {
        call.status = event.isError ? "error" : "ok";
        call.durationMs = performance.now() - call.startedAt;
      }
      this.keepResult(call, result);
    }
    this.notify();
  }

  public subscribe(ui: RenderUI): void {
    for (const listener of this.listeners) {
      const current = listener.deref();
      if (current === ui) {
        return;
      }
      if (!current) {
        this.listeners.delete(listener);
      }
    }
    this.listeners.add(new WeakRef(ui));
  }

  public clear(): void {
    this.parents.clear();
    this.listeners.clear();
    this.results.clear();
    this.bytes = 0;
    this.count = 0;
    this.revision = 0;
  }

  private readonly parents = new Map<string, Map<string, ChildCall>>();
  private readonly listeners = new Set<WeakRef<RenderUI>>();
  private readonly results = new Map<ChildCall, number>();
  private bytes = 0;
  private count = 0;
  private revision = 0;

  private keepArguments(args: unknown): unknown {
    try {
      const json = JSON.stringify(args);
      return json && Buffer.byteLength(json) <= 8 * 1024
        ? JSON.parse(json)
        : "Arguments exceed the display limit.";
    } catch {
      return "Arguments are not available.";
    }
  }

  private drop(parentId: string): void {
    for (const call of this.parents.get(parentId)?.values() ?? []) {
      this.bytes -= this.results.get(call) ?? 0;
      this.results.delete(call);
      this.count--;
    }
    this.parents.delete(parentId);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      const ui = listener.deref();
      if (ui) {
        ui.requestRender();
      } else {
        this.listeners.delete(listener);
      }
    }
  }

  private keepResult(call: ChildCall, result: ChildResult): void {
    this.bytes -= this.results.get(call) ?? 0;
    this.results.delete(call);
    call.result = undefined;
    call.unavailable = "Child output is not available.";
    let bytes: number;
    try {
      bytes = Buffer.byteLength(JSON.stringify(result));
    } catch {
      return;
    }
    if (bytes > 1024 * 1024) {
      call.unavailable = "Child output exceeds the display limit.";
      return;
    }
    call.result = result;
    call.unavailable = undefined;
    this.results.set(call, bytes);
    this.bytes += bytes;
    while (this.bytes > 8 * 1024 * 1024) {
      const oldest = this.results.entries().next().value;
      if (!oldest) {
        break;
      }
      const [evicted, size] = oldest;
      this.results.delete(evicted);
      this.bytes -= size;
      evicted.result = undefined;
      evicted.unavailable = "Child output expired from the display cache.";
      evicted.revision = ++this.revision;
      this.notify();
    }
  }
}

/** A child result used only for display. */
export type ChildResult = {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  details?: unknown;
  isError: boolean;
};
/** Display state for one child call. */
export type ChildCall = {
  id: string;
  parentId?: string;
  name: string;
  args: unknown;
  status: string;
  revision: number;
  startedAt: number;
  result?: ChildResult;
  unavailable?: string;
  error?: string;
  durationMs?: number;
  cost?: number;
};

type RenderUI = { requestRender: () => void };
