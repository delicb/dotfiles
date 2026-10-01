export const RepositoryTrust = {
  decide(options: TrustOptions): "allow" | "deny" | "ask" {
    if (!options.nativeTrusted) {
      return "deny";
    }
    if (options.explicitApproval) {
      return "allow";
    }
    if (options.savedDecision !== null) {
      return options.savedDecision ? "allow" : "deny";
    }
    if (options.nativeTrustCoversRepository) {
      return "allow";
    }
    if (options.defaultTrust === "always") {
      return "allow";
    }
    if (options.defaultTrust === "never" || !options.hasUI) {
      return "deny";
    }
    return "ask";
  },
};

export type TrustOptions = {
  nativeTrusted: boolean;
  explicitApproval: boolean;
  savedDecision: boolean | null;
  nativeTrustCoversRepository: boolean;
  defaultTrust: "ask" | "always" | "never";
  hasUI: boolean;
};
