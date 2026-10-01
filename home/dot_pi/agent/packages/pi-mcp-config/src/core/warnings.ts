export const McpWarnings = {
  compact(message: string): string {
    const prefix = "MCP servers need attention:\n";
    const suffix = "\nRun /mcp to fix.";
    if (!message.startsWith(prefix) || !message.endsWith(suffix)) {
      return message;
    }
    const body = message.slice(prefix.length, -suffix.length);
    const blocks = body.split(/\n(?= {2}[A-Za-z0-9_-]+: )/);
    const signIn: string[] = [];
    const gcloud: string[] = [];
    const other: string[] = [];
    for (const block of blocks) {
      const match = /^ {2}([A-Za-z0-9_-]+): ([^\n]*)/.exec(block);
      const name = match?.[1];
      const state = match?.[2];
      if (
        name &&
        name !== "config" &&
        state === "needs sign-in" &&
        !block.includes("\n")
      ) {
        signIn.push(name);
      } else if (
        name &&
        name !== "config" &&
        state?.startsWith("failed: gcloud auth print-access-token failed") &&
        state.includes("run `gcloud auth login`")
      ) {
        gcloud.push(name);
      } else {
        other.push(block);
      }
    }
    if (signIn.length === 0 && gcloud.length === 0) {
      return message;
    }
    const parts = other.map((block) =>
      block.replace(/\r?\n[ \t]*/g, " ").trim(),
    );
    if (signIn.length > 0) {
      parts.push(`MCP sign-in needed for ${signIn.join(", ")}`);
    }
    if (gcloud.length > 0) {
      parts.push(`gcloud auth failed for ${gcloud.join(", ")}`);
    }
    return parts.join("; ");
  },
};
