import type {
  Exposure,
  OAuthConfig,
  OverrideConfig,
  ServerConfig,
  ServerMetadata,
  ServerPolicy,
} from "./types";

export const ConfigValidation = {
  overrides(raw: unknown): OverrideConfig {
    const value = ConfigValidation.record(raw, "Overrides");
    for (const key of Object.keys(value)) {
      if (!["defaults", "servers", "$schema"].includes(key)) {
        throw new Error(`Unknown override setting "${key}".`);
      }
    }
    const defaults =
      value.defaults === undefined
        ? undefined
        : ConfigValidation.policy(value.defaults);
    const servers =
      value.servers === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(
              ConfigValidation.record(value.servers, "servers"),
            ).map(([name, policy]) => {
              ConfigValidation.serverName(name);
              return [name, ConfigValidation.policy(policy)];
            }),
          );
    const $schema = ConfigValidation.string(value.$schema, "$schema");
    return { $schema, defaults, servers };
  },

  server(raw: unknown, project: boolean): ServerConfig {
    const value = ConfigValidation.record(raw, "Server");
    const metadata: ServerMetadata = {
      ...ConfigValidation.policy(value, false),
      description: ConfigValidation.string(value.description, "description"),
      timeout: ConfigValidation.positiveNumber(value.timeout, "timeout"),
    };
    if (value.url !== undefined && value.command !== undefined) {
      throw new Error("Use either url or command, not both.");
    }
    if (typeof value.url === "string") {
      if (
        value.type !== undefined &&
        value.type !== "http" &&
        value.type !== "streamable-http"
      ) {
        throw new Error("HTTP servers require type http or streamable-http.");
      }
      const url = new URL(value.url);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("url must use HTTP or HTTPS.");
      }
      let auth: { provider: string } | undefined;
      if (value.auth !== undefined) {
        if (project) {
          throw new Error("auth is only allowed in global server definitions.");
        }
        const settings = ConfigValidation.record(value.auth, "auth");
        const provider = ConfigValidation.string(
          settings.provider,
          "auth.provider",
        );
        if (!provider) {
          throw new Error("auth.provider must name a Pi provider.");
        }
        if (url.protocol !== "https:" && !isLoopback(url)) {
          throw new Error("auth requires HTTPS or a loopback URL.");
        }
        auth = { provider };
      }
      return {
        ...metadata,
        type: "http",
        url: value.url,
        headers: ConfigValidation.strings(value.headers, "headers"),
        oauth: ConfigValidation.oauth(value.oauth),
        auth,
      };
    }
    if (typeof value.command === "string" && value.command.trim()) {
      if (value.type !== undefined && value.type !== "stdio") {
        throw new Error("Stdio servers require type stdio.");
      }
      let args: string[] | undefined;
      if (value.args !== undefined) {
        if (
          !Array.isArray(value.args) ||
          !value.args.every((arg): arg is string => typeof arg === "string")
        ) {
          throw new Error("args must be an array of strings.");
        }
        args = value.args;
      }
      return {
        ...metadata,
        type: "stdio",
        command: value.command,
        args,
        env: ConfigValidation.strings(value.env, "env"),
        cwd: ConfigValidation.string(value.cwd, "cwd"),
      };
    }
    throw new Error(
      "Server requires command or url. Legacy SSE is not supported.",
    );
  },

  serverName(name: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      throw new Error(`Invalid server name "${name}".`);
    }
  },

  record(value: unknown, label: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
    }
    return Object.fromEntries(Object.entries(value));
  },

  policy(raw: unknown, strict = true): ServerPolicy {
    const value = ConfigValidation.record(raw, "Server policy");
    if (strict) {
      for (const key of Object.keys(value)) {
        if (!["exposure", "toolExposure", "enabled"].includes(key)) {
          throw new Error(`Unknown server policy setting "${key}".`);
        }
      }
    }
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
      throw new Error("enabled must be a boolean.");
    }
    return {
      exposure:
        value.exposure === undefined
          ? undefined
          : ConfigValidation.exposure(value.exposure),
      toolExposure:
        value.toolExposure === undefined
          ? undefined
          : Object.fromEntries(
              Object.entries(
                ConfigValidation.record(value.toolExposure, "toolExposure"),
              ).map(([name, exposure]) => [
                name,
                ConfigValidation.exposure(exposure),
              ]),
            ),
      enabled: value.enabled,
    };
  },

  exposure(value: unknown): Exposure {
    if (value === "codemode-deferred") {
      return "codemode";
    }
    if (
      value === "codemode" ||
      value === "deferred" ||
      value === "direct" ||
      value === "hidden"
    ) {
      return value;
    }
    throw new Error("Exposure must be codemode, deferred, direct, or hidden.");
  },

  string(value: unknown, label: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error(`${label} must be a string.`);
    }
    return value;
  },

  positiveNumber(value: unknown, label: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} must be a positive number.`);
    }
    return value;
  },

  strings(value: unknown, label: string): Record<string, string> | undefined {
    if (value === undefined) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(ConfigValidation.record(value, label)).map(
        ([key, entry]) => {
          if (typeof entry !== "string") {
            throw new Error(`${label} values must be strings.`);
          }
          return [key, entry];
        },
      ),
    );
  },

  oauth(raw: unknown): OAuthConfig | undefined {
    if (raw === undefined) {
      return undefined;
    }
    const value = ConfigValidation.record(raw, "oauth");
    const callbackPort = ConfigValidation.positiveNumber(
      value.callbackPort,
      "oauth.callbackPort",
    );
    if (
      callbackPort !== undefined &&
      (!Number.isInteger(callbackPort) || callbackPort > 65535)
    ) {
      throw new Error("oauth.callbackPort must be a port number.");
    }
    const callbackUrl = ConfigValidation.string(
      value.callbackUrl,
      "oauth.callbackUrl",
    );
    if (callbackUrl !== undefined) {
      const url = new URL(callbackUrl);
      if (
        url.protocol !== "http:" ||
        !isLoopback(url) ||
        url.search ||
        url.hash
      ) {
        throw new Error(
          "oauth.callbackUrl must use HTTP on a loopback host without a query or fragment.",
        );
      }
      if (
        url.port &&
        callbackPort !== undefined &&
        Number(url.port) !== callbackPort
      ) {
        throw new Error("OAuth callback ports must match.");
      }
    }
    const clientName = ConfigValidation.string(
      value.clientName,
      "oauth.clientName",
    );
    if (clientName !== undefined && !clientName.trim()) {
      throw new Error("oauth.clientName must not be empty.");
    }
    return {
      clientId: ConfigValidation.string(value.clientId, "oauth.clientId"),
      clientSecret: ConfigValidation.string(
        value.clientSecret,
        "oauth.clientSecret",
      ),
      callbackPort,
      callbackUrl,
      scope: ConfigValidation.string(value.scope, "oauth.scope"),
      clientName,
    };
  },
};

function isLoopback(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
