import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const library = read("app/(app)/blueprints/BlueprintsClient.tsx");
assert.match(library, /\/blueprints\/\$\{encodeURIComponent\(stack\.id\)\}/, "Paid Blueprint links must use the owned stack route.");
assert.doesNotMatch(library, /\/results\?s=/, "The broken stack-id results query must not return.");
assert.match(library, /stack_id=\$\{encodeURIComponent\(stack\.id\)\}/, "PDF export must target the selected Blueprint version.");

const detailPage = read("app/(app)/blueprints/[stackId]/page.tsx");
assert.match(detailPage, /requireTier\(\["premium", "trial"\]/, "The interactive workspace must require paid access.");
assert.match(detailPage, /\.eq\("user_id", user\.id\)/, "The selected Blueprint must be owner-bound.");
assert.match(detailPage, /input_snapshot_hash/, "The workspace must compare the report with its input snapshot.");

const supplementsRoute = read("app/api/blueprints/[stackId]/supplements/route.ts");
assert.match(supplementsRoute, /requirePaidApi/, "Supplement editing must require paid access.");
assert.match(supplementsRoute, /\.eq\("user_id", entitlement\.user\.id\)/, "Supplement editing must enforce ownership.");
assert.match(supplementsRoute, /engine_input_json/, "Member edits must update the generator's canonical input overlay.");

const refreshRoute = read("app/api/blueprints/[stackId]/refresh/route.ts");
assert.match(refreshRoute, /requirePaidApi/, "Blueprint refresh must require paid access.");
assert.match(refreshRoute, /inputSnapshotHash/, "Refresh must be idempotent for the current input snapshot.");
assert.match(refreshRoute, /generationReason: "member-refresh"/, "Refreshes must record a privacy-safe reason.");
assert.match(refreshRoute, /supersedesStackId/, "Refreshes must preserve version lineage.");

const generator = read("src/lib/generateStack.ts");
assert.match(generator, /\.insert\(/, "Generation must create immutable stack versions.");
assert.ok(
  generator.indexOf(".insert(") < generator.indexOf('onConflict: "submission_id"'),
  "Immutable insertion must be the primary persistence path."
);
assert.match(generator, /versionColumnsMissing/, "The legacy upsert must be limited to the pre-migration compatibility path.");
assert.match(generator, /input_snapshot_hash/, "Generated versions must store their input snapshot hash.");

const migration = read("supabase/migrations/20260729032920_interactive_blueprint_versions.sql");
assert.match(migration, /drop index if exists public\.stacks_submission_id_key/, "The legacy one-stack-per-submission index must be removed.");
assert.match(migration, /unique index if not exists stacks_submission_snapshot_key/, "The migration must deduplicate identical input snapshots.");
assert.match(migration, /stacks_submission_created_idx/, "Version history must have a submission/date index.");
assert.match(migration, /Rollback notes:/, "The migration must include rollback notes.");

const exportRoute = read("app/api/export-pdf/route.ts");
assert.match(exportRoute, /stack_id/, "PDF export must accept a specific Blueprint version.");
assert.match(exportRoute, /authorizeStackPayload/, "PDF export must retain owner authorization.");

const workspace = read("app/(app)/blueprints/[stackId]/BlueprintWorkspaceClient.tsx");
assert.match(workspace, /Refresh Blueprint and safety review/, "Stale reports need one honest refresh action.");
assert.match(workspace, /Mark an item stopped to preserve the history/, "Stopping a supplement must preserve its history.");
assert.match(workspace, /Start this weekly practice/, "Lifestyle guidance must connect to the existing practice loop.");
assert.match(workspace, /timeZone: "UTC"/, "Blueprint dates must render consistently during hydration.");
assert.doesNotMatch(workspace, /\bNo safety issues detected\b/i, "Customer-facing copy must not make an absolute safety claim.");

const blueprintLibrary = read("app/(app)/blueprints/BlueprintsClient.tsx");
assert.match(blueprintLibrary, /timeZone: "UTC"/, "Blueprint library dates must render consistently during hydration.");

const reportEmail = read("src/lib/reportEmail.ts");
assert.match(
  reportEmail,
  /blueprintEmailIdempotencyKey\(submissionId: string, stackId: string\)/,
  "Each immutable Blueprint version must have its own delivery idempotency key."
);
assert.match(
  reportEmail,
  /blueprint-email-\$\{submissionId\}-\$\{stackId\}/,
  "Refresh delivery must not reuse the original Blueprint email key."
);

console.log("Interactive Blueprint assertions passed.");
