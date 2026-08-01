import assert from "node:assert/strict";

import {
  fullscriptImageUrlForSku,
  normalizeHttpsUrl,
  normalizeTrustedProductImageUrl,
} from "../lib/supplementProduct.ts";

assert.equal(normalizeHttpsUrl("https://example.com/product"), "https://example.com/product");
assert.equal(normalizeHttpsUrl(""), null);
assert.throws(() => normalizeHttpsUrl("javascript:alert(1)"), /invalid_reorder_url/);
assert.throws(() => normalizeHttpsUrl("http://example.com/product"), /invalid_reorder_url/);

assert.equal(
  fullscriptImageUrlForSku("PP0184"),
  "https://assets.fullscript.io/Product/PP0184/400_front.png?image_position=1&label=front"
);
assert.equal(fullscriptImageUrlForSku("not-a-product-code"), null);
assert.equal(
  normalizeTrustedProductImageUrl("https://assets.fullscript.io/Product/PP0184/400_front.png?image_position=1&amp;label=front"),
  "https://assets.fullscript.io/Product/PP0184/400_front.png?image_position=1&label=front"
);
assert.throws(() => normalizeTrustedProductImageUrl("https://example.com/tracker.png"), /invalid_product_image/);

console.log("PR77 supplement product assertions passed");
