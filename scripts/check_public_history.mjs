#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isForbiddenPublicRepositoryPath } from "./public_asset_boundary.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (args, options = {}) => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
  ...options,
});

let objectLines;
try {
  objectLines = git(["rev-list", "--objects", "--all"])
    .split(/\r?\n/)
    .filter(Boolean);
} catch (error) {
  console.error(`Git history is unreadable: ${String(error)}`);
  process.exit(1);
}

const objects = objectLines.map((line) => {
  const separator = line.indexOf(" ");
  return separator < 0
    ? { oid: line, path: "" }
    : { oid: line.slice(0, separator), path: line.slice(separator + 1) };
});

const forbiddenPaths = [...new Set(
  objects
    .map(({ path }) => path)
    .filter((path) => path !== "" && isForbiddenPublicRepositoryPath(path)),
)].sort();

const sensitivePaths = [...new Set(
  objects
    .map(({ path }) => path)
    .filter((path) => /(^|\/)(?:\.env(?:\.|$)|\.npmrc$|id_(?:rsa|ed25519)(?:\.|$))|\.(?:key|p12|pem|pfx)$/i.test(path)),
)].sort();

const pathsByOid = new Map();
for (const { oid, path } of objects) {
  if (path !== "" && !pathsByOid.has(oid)) pathsByOid.set(oid, path);
}

const uniqueOids = [...new Set(objects.map(({ oid }) => oid))];
const metadata = git(
  ["cat-file", "--batch-check=%(objecttype) %(objectname) %(objectsize)"],
  { input: `${uniqueOids.join("\n")}\n` },
).split(/\r?\n/).filter(Boolean);

const oversized = metadata.flatMap((line) => {
  const match = line.match(/^blob ([0-9a-f]+) (\d+)$/);
  if (!match || Number(match[2]) <= 50 * 1024 * 1024) return [];
  return [{
    oid: match[1],
    bytes: Number(match[2]),
    path: pathsByOid.get(match[1]) ?? "(blob without a path)",
  }];
}).sort((a, b) => b.bytes - a.bytes);

const report = (title, entries, format = (entry) => String(entry)) => {
  if (entries.length === 0) return;
  console.error(`${title} (${entries.length}):`);
  for (const entry of entries.slice(0, 60)) console.error(`- ${format(entry)}`);
  if (entries.length > 60) console.error(`- … ${entries.length - 60} other`);
};

report("Private paths still retrievable from history", forbiddenPaths);
report("Sensitive filenames in history", sensitivePaths);
report(
  "Historical blobs larger than 50 MiB",
  oversized,
  ({ bytes, path }) => `${path} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`,
);

if (forbiddenPaths.length > 0 || sensitivePaths.length > 0 || oversized.length > 0) {
  console.error(
    "Public history check failed. Removing files from the latest commit or ignoring them is not enough: rewrite every Git reference before publishing.",
  );
  process.exitCode = 1;
} else {
  console.log(`${objects.length} historical objects verified; no private paths, sensitive files, or oversized blobs found.`);
}
