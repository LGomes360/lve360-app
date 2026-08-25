import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const MAX_ADDITIONAL_TURNS = 100;

function argsFrom(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`Invalid argument near ${key ?? "the end of the command"}.`);
    result.set(key.slice(2), value);
  }
  return result;
}

function currentPeriodStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

const args = argsFrom(process.argv.slice(2));
const email = String(args.get("email") ?? "").trim().toLowerCase();
const turns = Number(args.get("turns"));
const reason = String(args.get("reason") ?? "").trim();
const grantedBy = String(args.get("granted-by") ?? "").trim();
const periodStart = String(args.get("period") ?? currentPeriodStart()).trim();

if (!email || !email.includes("@")) throw new Error("Provide --email for the approved test account.");
if (!Number.isInteger(turns) || turns < 0 || turns > MAX_ADDITIONAL_TURNS) {
  throw new Error(`--turns must be a whole number between 0 and ${MAX_ADDITIONAL_TURNS}.`);
}
if (reason.length < 5 || reason.length > 300) throw new Error("--reason must be between 5 and 300 characters.");
if (grantedBy.length < 2 || grantedBy.length > 120) throw new Error("Provide --granted-by for the audit record.");
if (!/^\d{4}-\d{2}-01$/.test(periodStart)) throw new Error("--period must be the first day of a month in YYYY-MM-01 format.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: user, error: userError } = await admin.from("users")
  .select("id,email,tier").eq("email", email).maybeSingle();
if (userError) throw userError;
if (!user) throw new Error("No LVE360 account matches that email.");
if (user.tier !== "premium" && user.tier !== "trial") {
  throw new Error("Testing adjustments are limited to premium or trial accounts.");
}

const { data, error } = await admin.from("ai_coach_allowance_adjustments").upsert({
  user_id: user.id,
  period_start: periodStart,
  additional_turns: turns,
  reason,
  granted_by: grantedBy,
  updated_at: new Date().toISOString(),
}, { onConflict: "user_id,period_start" }).select("period_start,additional_turns,reason,granted_by,updated_at").single();
if (error) throw error;

console.log(JSON.stringify({
  ok: true,
  account: email,
  period: data.period_start,
  additionalTurns: data.additional_turns,
  reason: data.reason,
  grantedBy: data.granted_by,
  productionCostCeilingUnchanged: true,
}, null, 2));
