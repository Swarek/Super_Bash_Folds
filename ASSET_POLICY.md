# Public asset policy

The Super Bash Folds code is released under MIT. Original project creations
under `public/assets/open/` and `public/favicon.svg` are dedicated to the public
domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Third-party assets retain the license listed in their manifest and in
[`THIRD_PARTY_ASSETS.md`](THIRD_PARTY_ASSETS.md).

## Accepted content

An asset may be added to the repository only if all four of the following points
can be verified:

1. The source page and author are identified.
2. The license explicitly permits redistribution and modification, including
   in a commercial project.
3. Provenance, transformations, and SHA-256 hashes are retained.
4. The depicted identity is original or genuinely belongs to the author.

CC0 is preferred. CC BY is accepted with complete attribution. `NC` and `ND`
licenses, ambiguous licenses, files described only as "free," SoundCloud
downloads without an explicit license, and assets whose author does not own the
depicted identity are rejected.

## Prohibited content

The public repository must not contain any asset from an unlicensed third-party
work, especially a commercial game. This includes models, textures, sprites,
portraits, animations, effects, sounds, music, voices, items, stages,
screenshots, and converted derivatives.

Source archives, extraction tools, manifests naming game files, and data-mining
instructions are also prohibited in the public repository. This rule applies
to both the current state and the entire Git history.

A developer may keep a private overlay in paths ignored by Git, but must never
use `git add -f` to bypass them. `npm run dev` and `npm run build:public`
enforce the public boundary even when that overlay exists. Only the explicit
`dev:private`, `build:private`, and `preview:private` commands may activate it
locally; they produce no redistributable content.

## Add a pack

- Fighter: follow [`fighters/README.md`](fighters/README.md).
- Stage: follow [`stages/README.md`](stages/README.md).
- Audio or UI: add the source, license, transformation, and hashes to the
  nearest provenance document.

Before contributing:

```sh
npm run check:public-assets
npm run check:public-history
npm run validate:public
```

The validator automates structural rules. It does not replace human verification
of the license and depicted identity.
