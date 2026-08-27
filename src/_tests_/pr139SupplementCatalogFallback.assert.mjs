import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const packageJson = JSON.parse(read("package.json"));
const searchRoute = read("app/api/fullscript/search/route.ts");

assert.match(packageJson.scripts["qa:pr139"], /pr139SupplementCatalogFallback\.assert\.mjs/);
assert.match(searchRoute, /id, ingredient, product_name, dose, link_fullscript, link_default, link_trusted, link_clean, link_budget, notes/);
assert.doesNotMatch(searchRoute, /select\([^\n]*link_amazon/,
  "The internal catalog query must not request the nonexistent link_amazon column.");
assert.match(searchRoute, /if \(ingredientMatches\.error && productMatches\.error\) throw ingredientMatches\.error/,
  "A total catalog-query failure must surface as an error instead of looking like zero matches.");
assert.match(searchRoute, /dose: row\.dose \|\| row\.notes \|\| null/);
assert.match(searchRoute, /row\.link_default[\s\S]*row\.link_trusted[\s\S]*row\.link_clean[\s\S]*row\.link_budget/);
assert.match(searchRoute, /if \(!items\.length\) items = await fallbackSearch\(q\)/);

console.log("PR139 supplement catalog fallback assertions passed.");
