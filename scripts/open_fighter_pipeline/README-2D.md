# Open fighter 2D pipeline

This pipeline exclusively normalizes previously audited upstream raster frames.
For every candidate, it produces the 50 atlases expected by the runtime, with
transparent 192 px cells and eight columns, as well as a portrait, a
machine-readable provenance record, and SHA-256 checksums for the outputs.

It does not draw, interpolate, or synthesize any animation. Allowed operations
are spritesheet slicing, preservation of Unity pivots, uniform scaling,
transparent padding, declared sampling, and lossless WebP encoding.

Accepted sources include PNG sequences, regular strips or grids, sheets
described by PixelOver/Unity JSON, and explicit poses. An upstream GIF can
provide the frame count and timing for a grid, but its pixels do not replace
the original PNG sheet.

The grades declared in `fighters/<id>/render.json` remain intentionally strict.
`2d_manifest.json` is generated from the fighter packs and must not be edited
directly:

- `direct`: the upstream movement matches the role;
- `adapted`: the movement is real and useful, but is not yet an animation
  dedicated to the role;
- `author_required`: the atlas is only a fallback taken from a real upstream
  clip. The slot is not ready for a playable release.

## Running the pipeline

```sh
npm run fighter:build -- knight-hero
npm run fighter:build
scripts/open_fighter_pipeline/render_2d_all.sh
```

Intermediate frames are written under `.generated/open-fighters-2d/`. Public
outputs are located under:

- `public/assets/characters/open/<fighter>/00/*.webp`;
- `public/assets/characters/open/<fighter>/PROVENANCE.json`;
- `public/assets/characters/open/<fighter>/SHA256SUMS`;
- `public/assets/ui/fighters/<fighter>/select/00.png`;
- `public/assets/characters/open/2d-animation-metadata.json`.

The manifest rejects a candidate until every one of the 50 slots is classified
exactly once.

## Intentionally excluded candidate

`godinez-free` is archived and verified under `assets-source/`, but its two
free sheets contain neither slicing metadata nor clip names. The pipeline does
not guess their rows: no Godinez animation is generated until an upstream
manifest or the corresponding Aseprite source becomes available.
