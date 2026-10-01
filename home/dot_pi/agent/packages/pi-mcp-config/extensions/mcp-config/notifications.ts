import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { McpWarnings } from "../../src/core/warnings";

export const McpNotifications = {
  wrap(pi: ExtensionAPI): ExtensionAPI {
    const on: ExtensionAPI["on"] = (
      event: string,
      handler: (...args: never[]) => unknown,
    ) => {
      if (event !== "session_start" && event !== "mcp_servers_change") {
        return Reflect.apply(pi.on, pi, [event, handler]);
      }
      const wrapped = (event: unknown, ctx: ExtensionContext) =>
        Reflect.apply(handler, undefined, [event, notificationContext(ctx)]);
      return Reflect.apply(pi.on, pi, [event, wrapped]);
    };
    return new Proxy(pi, {
      get(target, property) {
        return property === "on" ? on : Reflect.get(target, property, target);
      },
    });
  },
};

function notificationContext(ctx: ExtensionContext): ExtensionContext {
  return new Proxy(ctx, {
    get(target, property) {
      if (property !== "ui") {
        return Reflect.get(target, property, target);
      }
      return new Proxy(target.ui, {
        get(ui, property) {
          if (property !== "notify") {
            return Reflect.get(ui, property, ui);
          }
          const notify: ExtensionUIContext["notify"] = (message, type) => {
            ui.notify(
              type === "warning" ? McpWarnings.compact(message) : message,
              type,
            );
          };
          return notify;
        },
      });
    },
  });
}
