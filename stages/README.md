# Add a stage pack

An open stage lives entirely in `stages/<id>/`. The manifest describes the
deterministic geometry used by the engine, while the files in `assets/` provide
its visuals. Once the pack is marked `ready`, the registry, the `StageId` type,
the selection menu, and the Test Lab are synchronized without manual changes
under `src/`.

## Quick start

```sh
npm run stage:new -- my-stage --kind 2d
# complete stages/my-stage/stage.json and add the assets
npm run stage:build
npm run stage:check
```

A draft is intentionally excluded from the game. The build still requires at
least one other `ready` pack because a match always needs a default stage.

Image and scene size limits are centralized in `stages/pipeline.config.json` so
contributions remain fast to load without burying those limits in the script.

## Pack contents

```text
stages/my-stage/
├── stage.json
├── PROVENANCE.md
├── LICENSE.txt        # copy of the upstream license, when provided
├── SHA256SUMS
└── assets/
    ├── preview.png
    ├── preview.thumb.webp
    ├── arena.webp
    ├── backdrop.webp
    └── scene.glb          # only for kind: 3d
```

Manifest paths are relative to the pack. Absolute paths, remote URLs, `..`
traversals, and symbolic links are rejected. Vite imports these files; never
copy them into `public/assets/stages/`, which is reserved for the local private
overlay.

## Geometry

Gameplay coordinates use world units. A `ground` platform is solid on every
side; a `platform` can be passed through from below or with a downward input.
The pack must provide exactly one solid platform named `main`. Ledges are
declared explicitly and must reference a `ground` platform.

`render.art` maps the `arena` image to the world: `originPx` is the pixel that
represents the `(0, 0)` origin, and `worldUnitsPerPixel` defines the scale. The
blast zone must surround the platforms and both spawn points.

## 2D and 3D rendering

All four images are required for every pack. A 2D stage uses `arena` directly
over `backdrop`. A 3D stage also provides `render.scene`; if WebGL or the GLB
fails, the same images provide the fallback.

Version 1 supports static stages only. Moving platforms, hazards, and arbitrary
scripts require an audited engine mechanic; packs cannot provide executable
code.

## License and provenance

Use only sources with explicit redistribution and modification rights.
`stage.json`, `PROVENANCE.md`, and `SHA256SUMS` must remain consistent. The
validator checks the runtime files, but the author remains responsible for
verifying the source license.

## Commands

```sh
npm run stage:build  # validate and regenerate openStageRegistry.ts
npm run stage:check  # also verify that the registry is not stale
```
