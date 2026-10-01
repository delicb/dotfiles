export type Exposure = "codemode" | "deferred" | "direct" | "hidden";

export type ServerPolicy = {
  exposure?: Exposure;
  toolExposure?: Record<string, Exposure>;
  enabled?: boolean;
};

export type OverrideConfig = {
  $schema?: string;
  defaults?: ServerPolicy;
  servers?: Record<string, ServerPolicy>;
};

export type ServerMetadata = ServerPolicy & {
  description?: string;
  timeout?: number;
};

export type OAuthConfig = {
  clientId?: string;
  clientSecret?: string;
  callbackPort?: number;
  callbackUrl?: string;
  scope?: string;
  clientName?: string;
};

export type ServerConfig =
  | (ServerMetadata & {
      type?: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    })
  | (ServerMetadata & {
      type?: "http";
      url: string;
      headers?: Record<string, string>;
      oauth?: OAuthConfig;
      auth?: { provider: string };
    });

export type ServerEntry = {
  name: string;
  config: ServerConfig;
  source: string;
  scope: "global" | "project";
};

export type LoadedConfig = {
  servers: ServerEntry[];
  errors: string[];
  autoEnableCodemode?: boolean;
};

export type ConfigPaths = {
  agentDir: string;
  repositoryRoot?: string;
  projectTrusted: boolean;
};
