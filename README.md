# Super Bash Folds

[Official website](https://super-bash-folds.spry-crumb-3668.chatgpt.site) ·
[Source code](https://github.com/Swarek/Super-Open-Bros)

A local two-player platform fighter designed so that fighters and stages can be
added as self-contained packs instead of requiring changes to the engine.

The public repository currently contains 14 open fighter prototypes, one CC0
stage, 20 original items, and a redistributable audio library. Large combat
assets are loaded only when a match starts and then cached for subsequent
matches.

Super Bash Folds is an independent project. It is not affiliated with, endorsed
by, or approved by any video game publisher. The public repository and build
are limited to original code and content with documented redistribution rights.

## Quick start

Prerequisite: Node.js 20 or newer.

```sh
git clone https://github.com/Swarek/Super-Open-Bros.git
cd Super-Open-Bros
npm ci
npm run dev
```

Vite displays the game's local address, which defaults to
[`http://localhost:4173/`](http://localhost:4173/).
Keyboard, mouse, and controllers are supported. Bindings can be configured
directly from the Controls menu.

## Public build and local overlay

`npm run dev` always launches redistributable content, even when private files
exist on the machine. A maintainer who already has a local overlay ignored by
Git can run:

```sh
npm run dev:private
```

This command refuses to activate an incomplete overlay. Its content is not part
of the public project, must not be redistributed, and is not covered by the
repository's MIT license.

`npm run build` and `npm run build:public` produce a public `dist/`, remove
reserved paths, and verify the result. `npm run build:private` remains local.
`npm run preview:private` automatically rebuilds the private bundle before
serving it. These commands are intended only for local overlay testing. Always
run `npm run build:public` again before publishing an artifact.

## Add a fighter

```sh
npm run fighter:new -- my-fighter --kind 2d
# complete fighters/my-fighter/fighter.json and render.json
npm run fighter:build -- my-fighter
npm run fighter:check
```

The pack directory is the source of truth. The TypeScript registry, render
manifests, portraits, and atlases are synchronized by the pipeline. The
50-animation contract and common errors are documented in
[`fighters/README.md`](fighters/README.md).

## Add a stage

```sh
npm run stage:new -- my-stage --kind 2d
# complete stages/my-stage/stage.json, PROVENANCE.md, and assets/
npm run stage:build
npm run stage:check
```

Each pack defines its collisions, ledges, spawn points, blast zone, rendering,
and license. The menu and `StageId` type are generated automatically. See
[`stages/README.md`](stages/README.md).

## Verify the project

Atlas verification also requires `dwebp`, provided by the `webp` package
(`brew install webp` on macOS or `sudo apt-get install webp` on Debian/Ubuntu).

```sh
npm test
npm run fighter:check -- --deep
npm run stage:check
npm run validate:public
```

`validate:public` forces public mode, checks the asset policy, runs the public
tests, inspects Git history, and produces a build without relying on a local
overlay. The final contents of `dist/`, initial JavaScript budgets, and
thumbnails are also verified during the build.

By default, `npm test` covers the public repository, including the engine.
Maintainers who have the ignored private overlay can additionally run
`npm run test:private`. This command must never be required by public CI.

## Licenses and provenance

- Code: [MIT](LICENSE).
- Original project assets under `public/assets/open/`: CC0-1.0.
- Third-party assets: licenses and provenance are documented in
  [`THIRD_PARTY_ASSETS.md`](THIRD_PARTY_ASSETS.md).
- Asset contribution rules: [`ASSET_POLICY.md`](ASSET_POLICY.md).
- Naming, trademark, and content policy:
  [`IP_AND_CONTENT_POLICY.md`](IP_AND_CONTENT_POLICY.md).

Generated files must not be edited directly. Contributions are welcome; start
with [`CONTRIBUTING.md`](CONTRIBUTING.md).
