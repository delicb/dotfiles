import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const readFileSync = fs.readFileSync;
fs.readFileSync = (path, ...options) => {
  if (String(path).endsWith("/mcp-overrides.json")) {
    process.send("read");
  }
  return readFileSync(path, ...options);
};
syncBuiltinESMExports();

const { ConfigLoader } = await import(process.argv[2]);
process.send("ready");
process.on("message", () => {
  process.send("started");
  ConfigLoader.savePolicy(process.argv[3], process.argv[4], {
    enabled: false,
  });
  process.disconnect();
});
