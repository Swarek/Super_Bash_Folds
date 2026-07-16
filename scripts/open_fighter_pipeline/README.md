# Open fighter pipeline

This pipeline converts audited open models and animations into WebP atlases
compatible with the runtime's 50 roles. It does not synthesize movement: every
cell comes from an action declared in `fighters/<id>/render.json`.
`manifest.json` is generated output and must not be edited directly.

The grades have strict meanings:

- `direct`: the source clip already matches the role;
- `adapted`: the clip is a real starting point, but a dedicated animation still
  needs to be produced;
- `author_required`: no sufficiently close movement exists, even if the
  prototype temporarily displays the declared fallback clip.

## Running the pipeline

Mount the local Blender image first if necessary:

```sh
hdiutil attach -readonly -nobrowse .tools/blender-5.1.2-macos-arm64.dmg
```

Then render one candidate through its fighter pack, or render the entire group:

```sh
npm run fighter:build -- kaykit-knight
npm run fighter:build
scripts/open_fighter_pipeline/render_all.sh
```

Framing is recalculated from the deformed vertices in every pose so root motion
does not make the character appear smaller. A portrait can use a dedicated
action and view through `portraitAction`, `portraitFrameFraction`,
`portraitCameraAxis`/`portraitCameraDirection`, and `portraitPadding` in the
manifest.

A render filtered with `OPEN_FIGHTERS` does not remove other metadata: the
global TypeScript file is rebuilt from every existing `render-index.json` under
the render root.

Intermediate PNG files remain under `.generated/open-fighters/`. Public
atlases, portraits, provenance records, and TypeScript metadata are generated
in `public/assets/characters/open/`, `public/assets/ui/fighters/`, and
`src/game/openAnimationMetadata.ts`.

Each public fighter folder also contains a 51-entry `SHA256SUMS`: the 50
`00/*.webp` atlases and the corresponding character-select portrait.
