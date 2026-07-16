#!/bin/zsh
set -euo pipefail

project_root=${0:A:h:h:h}
manifest=${OPEN_FIGHTER_MANIFEST:-$project_root/scripts/open_fighter_pipeline/manifest.json}
render_root=${OPEN_FIGHTER_RENDER_ROOT:-$project_root/.generated/open-fighters}
blender=${BLENDER_BIN:-/Volumes/Blender/Blender.app/Contents/MacOS/Blender}
pipeline=$project_root/scripts/open_fighter_pipeline/render_3d.py
fighters=(${(s:,:)${OPEN_FIGHTERS:-$(jq -r '.fighters | keys | join(",")' "$manifest")}})

[[ -x "$blender" ]] || {
  print -u2 "Blender not found: $blender"
  print -u2 "Mount .tools/blender-5.1.2-macos-arm64.dmg or set BLENDER_BIN."
  exit 1
}

for fighter in $fighters; do
  "$blender" --background --factory-startup --python-exit-code 1 --python "$pipeline" -- \
    render \
    --manifest "$manifest" \
    --fighter "$fighter" \
    --project-root "$project_root" \
    --output-root "$render_root" \
    --resolution "${OPEN_FIGHTER_CELL_SIZE:-192}" \
    --max-frames "${OPEN_FIGHTER_MAX_FRAMES:-24}"
done

OPEN_FIGHTER_MANIFEST="$manifest" \
OPEN_FIGHTER_RENDER_ROOT="$render_root" \
OPEN_FIGHTERS="${(j:,:)fighters}" \
node "$project_root/scripts/open_fighter_pipeline/build_atlases.mjs"
