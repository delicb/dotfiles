export interface FastConfig {
  enabled: boolean;
  models: Record<string, number>;
}

export interface ConfigPaths {
  agentDir: string;
  cwd: string;
  projectTrusted: boolean;
}
