import { config } from "./config.server";
import db from "../db.server";

type Level = "info" | "warning" | "error";

/** Sends an alert to the ops channel (Slack-compatible webhook) and the log. */
export async function alert(level: Level, text: string): Promise<void> {
  const line = `[${level.toUpperCase()}] ${text}`;
  if (level === "error") console.error(line);
  else console.log(line);
  if (!config.alertWebhookUrl || level === "info") return;
  try {
    await fetch(config.alertWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `${level === "error" ? ":rotating_light:" : ":warning:"} ${text}` }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error("[alerts] could not deliver alert", e);
  }
}

/** Adds an entry to a brand order's timeline. */
export async function logEvent(
  brandOrderId: string,
  kind: string,
  message: string,
  level: Level = "info",
): Promise<void> {
  await db.orderEvent.create({
    data: { brandOrderId, kind, message: message.slice(0, 2000), level },
  });
}
