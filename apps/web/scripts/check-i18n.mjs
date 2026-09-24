#!/usr/bin/env node
// Fails if the en and zh-CN locale files do not have exactly the same keys,
// or if any value is empty / has mismatched {{interpolation}} variables.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "locales");
const locales = ["en", "zh-CN"];

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const data = Object.fromEntries(
  locales.map((l) => [l, flatten(JSON.parse(readFileSync(path.join(root, l, "common.json"), "utf8")))]),
);

let failed = false;
const [a, b] = locales;
const vars = (s) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(",");
for (const [x, y] of [[a, b], [b, a]]) {
  for (const key of Object.keys(data[x])) {
    if (!(key in data[y])) {
      console.error(`✗ key "${key}" exists in ${x} but is missing in ${y}`);
      failed = true;
    }
  }
}
for (const l of locales) {
  for (const [key, v] of Object.entries(data[l])) {
    if (typeof v !== "string" || !v.trim()) {
      console.error(`✗ ${l}: "${key}" is empty or not a string`);
      failed = true;
    }
  }
}
for (const key of Object.keys(data[a])) {
  if (key in data[b] && vars(data[a][key]) !== vars(data[b][key])) {
    console.error(`✗ interpolation mismatch for "${key}": ${a}=[${vars(data[a][key])}] ${b}=[${vars(data[b][key])}]`);
    failed = true;
  }
}

if (failed) {
  console.error("\ni18n check failed.");
  process.exit(1);
}
console.log(`✓ i18n OK — ${Object.keys(data[a]).length} keys in ${locales.join(" & ")}`);
