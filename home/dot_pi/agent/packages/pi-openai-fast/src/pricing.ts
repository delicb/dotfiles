const PUBLISHED_FAST_MULTIPLIERS: Readonly<Record<string, number>> = {
  "gpt-6-astra": 2,
  "gpt-6.1-sol": 2,
  "gpt-6-luna": 2,
  "gpt-6-sol": 2,
  "gpt-5.6-sol": 2,
  "gpt-5.6-terra": 2,
  "gpt-5.6-luna": 2,
  "gpt-5.5": 2.5,
  "gpt-5.4": 2,
  "gpt-5.4-mini": 2,
  "gpt-5.3-codex": 2,
  "gpt-5.2": 2,
  "gpt-5.1": 2,
  "gpt-5": 2,
  "gpt-5-mini": 1.8,
  "gpt-4.1": 1.75,
  "gpt-4.1-mini": 1.75,
  "gpt-4.1-nano": 2,
  "gpt-4o": 1.7,
  "gpt-4o-2024-05-13": 1.75,
  "gpt-4o-mini": 5 / 3,
  o3: 1.75,
  "o4-mini": 20 / 11,
};

export function publishedFastMultiplier(modelId: string): number | undefined {
  const key = Object.hasOwn(PUBLISHED_FAST_MULTIPLIERS, modelId)
    ? modelId
    : modelId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return Object.hasOwn(PUBLISHED_FAST_MULTIPLIERS, key)
    ? PUBLISHED_FAST_MULTIPLIERS[key]
    : undefined;
}
