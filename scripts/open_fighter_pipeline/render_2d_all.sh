#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

command -v ffmpeg >/dev/null 2>&1 || {
  echo "ffmpeg is required" >&2
  exit 1
}
command -v ffprobe >/dev/null 2>&1 || {
  echo "ffprobe is required" >&2
  exit 1
}
command -v cwebp >/dev/null 2>&1 || {
  echo "cwebp is required" >&2
  exit 1
}

node "$project_root/scripts/open_fighter_pipeline/build_2d_atlases.mjs"
