export interface WorktreeConfig {
  protectPrimaryByDefault?: boolean;
  allow?: string[];
  deny?: string[];
}

export interface ResolvedWorktreeConfig {
  protectPrimaryByDefault: boolean;
  allow: string[];
  deny: string[];
}

export interface LoadedWorktreeConfig {
  config: ResolvedWorktreeConfig;
  warnings: string[];
}
