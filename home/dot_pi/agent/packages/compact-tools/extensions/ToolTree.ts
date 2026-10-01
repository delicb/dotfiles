import { ToolExecutionComponent, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { NestedCalls, type ChildCall } from "./NestedCalls";

/** Show child tool rows with separate expansion controls. */
export class ToolTree implements Component {
  public constructor(
    private readonly parentId: string,
    private readonly calls: NestedCalls,
    private readonly ui: ConstructorParameters<typeof ToolExecutionComponent>[5],
    private readonly cwd: string,
  ) {}

  public update(metadata: readonly ChildCall[], theme: Theme, showImages: boolean): void {
    this.metadata = metadata;
    this.theme = theme;
    this.showImages = showImages;
  }

  public render(width: number): string[] {
    this.frames = [];
    const children = this.children();
    const keys = new Set(children.flatMap((call) => [call.key, call.id]));
    for (const key of this.entries.keys()) {
      if (!keys.has(key)) {
        this.entries.delete(key);
      }
    }
    if (width < 8 || !this.theme) {
      return [];
    }
    const lines: string[] = [];
    for (let index = 0; index < children.length; index++) {
      const call = children[index];
      const entry = this.component(call);
      const last = index === children.length - 1;
      const branch = last ? "└─" : "├─";
      const prefix = `${branch} ${entry.component.expandedInTree ? "▾" : "▸"} `;
      const continuation = last ? "      " : "│     ";
      const output = entry.component.render(width - 6);
      const start = lines.length;
      for (let row = 0; row < output.length; row++) {
        if (output[row].includes("\x1b_G") || output[row].includes("\x1b]1337;File=")) {
          lines.push(output[row]);
          continue;
        }
        const timing =
          row === 0 && call.durationMs !== undefined
            ? this.theme.fg("dim", ` · ${(call.durationMs / 1000).toFixed(2)}s`)
            : "";
        const cost =
          row === 0 && call.cost !== undefined
            ? this.theme.fg("dim", ` · $${call.cost.toPrecision(2)}`)
            : "";
        const cancelled =
          row === 0 && call.status === "cancelled" ? this.theme.fg("muted", " · cancelled") : "";
        lines.push(
          truncateToWidth(
            this.theme.fg("muted", row === 0 ? prefix : continuation) +
              output[row] +
              timing +
              cost +
              cancelled,
            width - 1,
          ),
        );
      }
      this.frames.push({ start, end: lines.length, entry });
    }
    return lines;
  }

  public handleMouse(event: TuiMouseEvent): ReturnType<ToolExecutionComponent["handleMouse"]> {
    const frame = this.frames.find((frame) => event.y >= frame.start && event.y < frame.end);
    if (!frame) {
      return undefined;
    }
    const response = frame.entry.component.handleMouse({
      ...event,
      x: event.x - 6,
      y: event.y - frame.start,
      width: event.width - 6,
      height: frame.end - frame.start,
    });
    if (response?.handled && event.type === "click" && event.button === "left") {
      this.ui.requestRender();
    }
    if (response) {
      return response;
    }
    return event.type === "click" && event.button === "left"
      ? {
          handled: true,
          target: {
            component: this,
            originX: event.screenX - event.x,
            originY: event.screenY - event.y,
            width: event.width,
            height: event.height,
          },
        }
      : undefined;
  }

  public invalidate(): void {
    for (const entry of this.entries.values()) {
      entry.component.invalidate();
    }
  }

  private metadata: readonly ChildCall[] = [];
  private theme?: Theme;
  private showImages = false;
  private readonly entries = new Map<string, Entry>();
  private frames: Array<{ start: number; end: number; entry: Entry }> = [];

  private children(): TreeCall[] {
    const observed = this.calls.get(this.parentId);
    const reserved = new Set(this.metadata.map((call) => call.id));
    const used = new Set<string>();
    const rows = this.metadata.map((saved, index): TreeCall => {
      const live =
        observed.find((call) => call.id === saved.id) ??
        observed.find(
          (call) =>
            !used.has(call.id) &&
            !reserved.has(call.id) &&
            call.name === saved.name &&
            saved.id.includes("/preview/"),
        );
      const key = `${this.parentId}/row/${index}`;
      if (!live) {
        return { ...saved, key };
      }
      used.add(live.id);
      return {
        ...live,
        key,
        args: live.args ?? saved.args,
        cost: saved.cost,
        status: saved.status === "cancelled" ? saved.status : live.status,
      };
    });
    return [
      ...rows,
      ...observed
        .filter((call) => !used.has(call.id))
        .map((call) => ({
          ...call,
          key: call.id,
          args: call.args ?? "Arguments are not available.",
        })),
    ];
  }

  private component(call: TreeCall): Entry {
    let entry = this.entries.get(call.key) ?? this.entries.get(call.id);
    if (!entry || entry.id !== call.id) {
      const expanded = entry?.component.expandedInTree ?? false;
      const raw = entry?.component.compactRaw ?? false;
      entry = {
        id: call.id,
        component: new ChildTool(
          call.name,
          call.id,
          call.args,
          { showImages: false },
          undefined,
          this.ui,
          this.cwd,
        ),
        stamp: "",
      };
      entry.component.compactRaw = raw;
      entry.component.setExpanded(expanded);
    }
    this.entries.delete(call.id);
    this.entries.set(call.key, entry);
    const stamp = `${call.revision}:${call.status}:${call.error ?? ""}:${JSON.stringify(call.args)}:${this.showImages}`;
    if (entry.stamp !== stamp) {
      entry.stamp = stamp;
      entry.component.updateArgs(call.args);
      entry.component.setImagesAllowed(this.showImages);
      entry.component.markExecutionStarted();
      entry.component.setArgsComplete();
      const missing =
        call.status === "running"
          ? []
          : [
              {
                type: "text",
                text: call.error || call.unavailable || "Child output was not saved.",
              },
            ];
      entry.component.updateResult(
        call.result ?? {
          content: missing,
          details: call.status === "running" ? undefined : { compactOutputUnavailable: true },
          isError: call.status === "error" || call.status === "cancelled",
        },
        call.status === "running",
      );
    }
    return entry;
  }
}

class ChildTool extends ToolExecutionComponent {
  public expandedInTree = false;
  public compactRaw = false;

  public treeImagesAllowed(): boolean {
    return this.imagesAllowed;
  }

  public setImagesAllowed(show: boolean): void {
    this.imagesAllowed = show;
    super.setShowImages(show && this.expandedInTree);
  }

  public override setExpanded(expanded: boolean): void {
    this.expandedInTree = expanded;
    super.setExpanded(expanded);
    super.setShowImages(this.imagesAllowed && expanded);
  }

  private imagesAllowed = false;
}

type Entry = { id: string; component: ChildTool; stamp: string };
type TreeCall = ChildCall & { key: string };
