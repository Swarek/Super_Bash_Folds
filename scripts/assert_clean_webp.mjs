#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PAM_HEADER_END = Buffer.from("ENDHDR\n");
const MAX_DECODED_ATLAS_BYTES = 96 * 1024 * 1024;

const headerNumber = (header, name) => {
  const match = header.match(new RegExp(`^${name} (\\d+)$`, "m"));
  if (!match) throw new Error(`Missing ${name} in decoded PAM header`);
  return Number(match[1]);
};

export const inspectWebp = (file) => {
  const decoded = spawnSync(
    "dwebp",
    [file, "-pam", "-o", "-"],
    { maxBuffer: MAX_DECODED_ATLAS_BYTES },
  );
  if (decoded.error) throw decoded.error;
  if (decoded.status !== 0) {
    throw new Error(`dwebp failed for ${file}: ${decoded.stderr.toString().trim()}`);
  }

  const headerEnd = decoded.stdout.indexOf(PAM_HEADER_END);
  if (headerEnd < 0) throw new Error(`Invalid PAM output for ${file}`);
  const pixelOffset = headerEnd + PAM_HEADER_END.length;
  const header = decoded.stdout.subarray(0, pixelOffset).toString("ascii");
  const width = headerNumber(header, "WIDTH");
  const height = headerNumber(header, "HEIGHT");
  const depth = headerNumber(header, "DEPTH");
  if (depth !== 4) throw new Error(`Expected RGBA WebP for ${file}, received depth ${depth}`);

  const expectedBytes = width * height * depth;
  const actualBytes = decoded.stdout.length - pixelOffset;
  if (actualBytes !== expectedBytes) {
    throw new Error(`Decoded byte count mismatch for ${file}: ${actualBytes} != ${expectedBytes}`);
  }

  let transparentPixels = 0;
  let dirtyTransparentPixels = 0;
  let lowAlphaPixels = 0;
  let maxHiddenChannel = 0;
  let maxLowAlphaChannel = 0;
  for (let offset = pixelOffset; offset < decoded.stdout.length; offset += depth) {
    const alpha = decoded.stdout[offset + 3];
    if (alpha > 0 && alpha <= 20) {
      lowAlphaPixels += 1;
      maxLowAlphaChannel = Math.max(
        maxLowAlphaChannel,
        decoded.stdout[offset],
        decoded.stdout[offset + 1],
        decoded.stdout[offset + 2],
      );
    }
    if (alpha !== 0) continue;
    transparentPixels += 1;
    const hidden = Math.max(
      decoded.stdout[offset],
      decoded.stdout[offset + 1],
      decoded.stdout[offset + 2],
    );
    if (hidden === 0) continue;
    dirtyTransparentPixels += 1;
    maxHiddenChannel = Math.max(maxHiddenChannel, hidden);
  }

  return {
    width,
    height,
    transparentPixels,
    dirtyTransparentPixels,
    lowAlphaPixels,
    maxHiddenChannel,
    maxLowAlphaChannel,
  };
};

export const assertCleanWebp = (file) => {
  const inspection = inspectWebp(file);
  if (inspection.transparentPixels === 0) {
    throw new Error(`Expected transparent pixels in ${file}`);
  }
  if (inspection.dirtyTransparentPixels > 0) {
    throw new Error(
      `${file} contains ${inspection.dirtyTransparentPixels} transparent pixels ` +
      `with hidden RGB (max channel ${inspection.maxHiddenChannel})`,
    );
  }
  if (inspection.lowAlphaPixels > 0) {
    throw new Error(
      `${file} contains ${inspection.lowAlphaPixels} fringe pixels with alpha 1-20 ` +
      `(max colour channel ${inspection.maxLowAlphaChannel})`,
    );
  }
  return inspection;
};

const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("Pass at least one WebP path");
  for (const file of files) assertCleanWebp(resolve(file));
}
