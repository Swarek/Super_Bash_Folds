# Add a fighter pack

An open fighter lives entirely in `fighters/<id>/`. Once the pack is complete
and marked `ready`, the game registry, the 2D/3D lists, the effects, and the
rendering manifests are generated automatically. Adding a character therefore
requires no manual changes under `src/`.

## Quick start

```sh
# 2d also accepts 3d
npm run fighter:new -- my-fighter --kind 2d
```

This command creates:

```text
fighters/my-fighter/
├── fighter.json  # identity, gameplay, special moves, license, and effects
└── render.json   # sources and mapping for the 50 animations
```

The new pack is a `draft` and is intentionally excluded from the game. Next:

1. Replace all placeholder values in both files.
2. Declare every animation in `render.json`.
3. Set `status` to `ready` in `fighter.json`.
4. Build and validate the character.

```sh
npm run fighter:build -- my-fighter
npm run fighter:check
```

To synchronize only the registries without rebuilding the images:

```sh
npm run fighter:build
```

## Pack contract

`fighter.json` follows [fighter.schema.json](fighter.schema.json). Its main
fields are:

- `id`: identical to the folder name, using lowercase letters and hyphens;
- `order`: a unique position among `ready` packs;
- `identity`: display name, archetype, play style, and colors;
- `gameplay`: hurtbox, weight, movement, and four special moves;
- `visual`: orientation, attribution, source page, and license;
- `effects`: material for each attack and shared visual traits.

`render.json` maps upstream files to the engine's 50 animation roles. For 2D,
every slot must be classified exactly once as `direct`, `adapted`, or
`author_required`. For 3D, the model, rig, slot profile, and action aliases are
required.

If the model, animations, or other elements come from separate packs, declare
each additional source in `render.json` with `additionalSources` (`role`,
`name`, `author`, `sourcePage`, `license`, and `licenseUrl`). This information
is copied into the public provenance record.

These grades are not equivalent:

- `direct`: a source animation genuinely designed for this movement;
- `adapted`: a real, usable source clip that is not dedicated to the movement;
- `author_required`: a temporary fallback; a dedicated animation still needs
  to be created.

A pack can be playable without being ready for publication. The validation
command reports this distinction and never presents a fallback clip as a real
attack animation.

## Assets and licensing

Local sources referenced by `render.json` must exist under
`assets-source/open-fighters/`, together with their provenance and SHA-256
checksums. The source page and license must match in `fighter.json` and
`render.json`. Do not use an asset unless its redistribution and modification
rights are explicit.

The `sourceProvenance` and `sourceSha256Manifest` fields in 2D packs are audit
pointers to this local source vault; they are intentionally not resolved in a
public clone. The URLs, licenses, transformations, and checksums for distributed
derivatives remain in the pack and under `public/assets/characters/open/`.

For each `00` variant, the renderer produces:

- 50 WebP atlases under `public/assets/characters/open/<id>/00/`;
- `PROVENANCE.json` and `SHA256SUMS`;
- a portrait under `public/assets/ui/fighters/<id>/select/00.png` and its
  `00.thumb.webp` WebP thumbnail for the character-select screen;
- the 2D or 3D animation metadata expected by the runtime.

## What is automated

`npm run fighter:build` validates the `ready` packs, sorts them by order, and
regenerates:

- `src/game/generated/openFighterRegistry.ts`;
- `scripts/open_fighter_pipeline/manifest.json`;
- `scripts/open_fighter_pipeline/2d_manifest.json`.

Do not edit these three outputs manually. They are also synchronized by
`npm run dev`, `npm test`, and `npm run build`.

The targeted `npm run fighter:build -- <id>` command automatically regenerates
the fighter thumbnail. After manually replacing multiple fighter portraits or
stage previews, run `npm run optimize:ui-assets`.

Stats, movement tuning, animation mapping, all four special moves, and effects
already supported by the engine are configurable in the pack. Standard attack
logic is still shared by the engine; follow
[issue #11](https://github.com/Swarek/Super_Bash_Folds/issues/11) for the pack
contract that will expose it. A completely new mechanic, such as a new kind of
tether, a transformation, or unsupported projectile behavior, still requires
an engine implementation before the pack can reference it.

## Troubleshooting

- `Fighter pack ... already exists`: choose a new `id` or complete the existing
  pack.
- `... invalid status`: keep `draft` while working, then use `ready` only when
  the pack is complete.
- `slot ... missing` or fewer than `50/50 slots`: complete the classification in
  `render.json` without duplicating a role.
- `Generated output is stale`: run `npm run fighter:build`.
- Provenance or SHA-256 failure: fix the sources and their manifests, then run
  the pipeline again; do not bypass the validator.

For exhaustive validation of all 50 atlases for every fighter:

```sh
npm run fighter:check -- --deep
```
