// Loads .env for processes that don't get it from the Shopify CLI (the worker).
// Never overrides variables that are already set, so values injected by
// `shopify app dev` or by your host always win.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

if (existsSync(".env")) {
  try {
    const vars = parseEnv(readFileSync(".env", "utf8"));
    for (const [key, value] of Object.entries(vars)) {
      if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
    }
  } catch (e) {
    console.warn("[env] could not read .env:", (e as Error).message);
  }
}