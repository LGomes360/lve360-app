import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../../app/api/logs/route.ts", import.meta.url), "utf8");

const patchHandler = route.slice(route.indexOf("export async function PATCH"));
assert.match(patchHandler, /parseCalendarDate\(body\?\.log_date\)/, "historical context corrections must accept valid stored calendar dates");
assert.doesNotMatch(patchHandler, /parseLocalDate\(body\?\.log_date\)/, "historical corrections must not use the today-only date window");

console.log("PR176 saved-context correction assertions passed.");
