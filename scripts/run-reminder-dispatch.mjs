import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://app.lve360.com/api/cron/reminders";

export function validateReminderDispatch(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Dispatcher response must be one JSON object.");
  }
  for (const field of ["sent", "skipped", "failed"]) {
    if (!Number.isInteger(payload[field]) || payload[field] < 0) {
      throw new Error(`Dispatcher response has invalid ${field}.`);
    }
  }
  if (payload.ok !== true || payload.failed !== 0) {
    throw new Error(`Dispatcher reported failure (sent=${payload.sent}, skipped=${payload.skipped}, failed=${payload.failed}).`);
  }
  for (const [field, expected] of [
    ["skipReasons", payload.skipped],
    ["failureReasons", payload.failed],
  ]) {
    const reasons = payload[field];
    if (!reasons || typeof reasons !== "object" || Array.isArray(reasons)) {
      throw new Error(`Dispatcher response has invalid ${field}.`);
    }
    const values = Object.values(reasons);
    if (values.some((value) => !Number.isInteger(value) || value < 0)
      || values.reduce((sum, value) => sum + value, 0) !== expected) {
      throw new Error(`Dispatcher response has inconsistent ${field}.`);
    }
  }
  return payload;
}

function parseResponseBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Dispatcher returned malformed or multiple JSON documents.");
  }
}

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

export async function runReminderDispatch({
  secret,
  url = DEFAULT_URL,
  fetchImpl = fetch,
  maxAttempts = 3,
  timeoutMs = 70_000,
  sleep = wait,
} = {}) {
  if (!secret) throw new Error("CRON_SECRET is required.");
  let lastError;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
        redirect: "error",
        signal: controller.signal,
      });
      const body = await response.text();
      const payload = parseResponseBody(body);
      if (response.status >= 500 && payload?.error === "load_failed" && attempt < maxAttempts) {
        lastError = new Error(`Dispatcher returned HTTP ${response.status}.`);
        await sleep(250 * attempt);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Dispatcher returned HTTP ${response.status} (error=${payload?.error ?? "unknown"}).`);
      }
      return validateReminderDispatch(payload);
    } catch (error) {
      lastError = error;
      const retryable = error?.name === "AbortError" || error instanceof TypeError;
      if (!retryable || attempt === maxAttempts) throw error;
      await sleep(250 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("Reminder dispatcher failed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await runReminderDispatch({ secret: process.env.CRON_SECRET });
    console.log(JSON.stringify(result));
    console.log("Reminder dispatch completed without failures.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Reminder dispatch failed.");
    process.exitCode = 1;
  }
}
