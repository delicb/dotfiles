import type { FastConfig } from "./types";

export const DEFAULT_CONFIG: FastConfig = {
  enabled: false,
  models: {
    "openai/*": 2,
    "openai-codex/*": 2,
  },
};
