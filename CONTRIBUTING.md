# Contributing to Super Bash Folds

Please keep changes small and verifiable, and include provenance whenever they
add content.

## Setup

```sh
git clone https://github.com/Swarek/Super_Bash_Folds.git
cd Super_Bash_Folds
npm ci
npm run dev
```

Node.js 20 or newer is recommended.

The atlas checks run before a pull request also use `dwebp`. Install the `webp`
package with `brew install webp` on macOS or `sudo apt-get install webp` on
Debian/Ubuntu.

## Before opening a pull request

```sh
npm test
npm run fighter:check
npm run stage:check
npm run validate:public
```

Add or update the test closest to the changed behavior. Do not bypass a
validator, commit `dist/` output, or force-add an ignored asset.

The `npm test` suite is self-contained and public. `npm run test:private` exists
only for maintainers who already have an ignored local overlay. A contribution
must not depend on it.

Similarly, use `npm run dev` and `npm run build:public` for all redistributable
validation. Commands ending in `:private` are strictly local, and their output
must never be attached to an issue, release, or pull request.

## Add content

- Fighters are self-contained packs under `fighters/`; see
  [`fighters/README.md`](fighters/README.md).
- Stages are self-contained packs under `stages/`; see
  [`stages/README.md`](stages/README.md).
- Every asset must comply with [`ASSET_POLICY.md`](ASSET_POLICY.md).

A declared license is not enough if the file reproduces an identity that its
author does not own. When in doubt, open an issue with provenance links first;
do not add the file to the repository.

Do not use the name, logo, characters, screenshots, music, or other distinctive
elements of a third-party franchise in a contribution. Also read
[`IP_AND_CONTENT_POLICY.md`](IP_AND_CONTENT_POLICY.md).
