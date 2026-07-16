# Contributing to Super Bash Folds

Thank you for helping build an original, open platform fighter. Contributions
can be code, art, animation, stages, fighter design, testing, documentation, or
community support.

By submitting a contribution, you agree that your code is licensed under the
project's MIT license and that contributed assets use the license declared in
their provenance files. You must have the right to contribute every file.

## Before you start

1. Read the [Code of Conduct](CODE_OF_CONDUCT.md) and
   [asset policy](ASSET_POLICY.md).
2. Search existing [issues](https://github.com/Swarek/Super_Bash_Folds/issues)
   and [discussions](https://github.com/Swarek/Super_Bash_Folds/discussions).
3. Comment on an issue before beginning substantial work, or open a Discussion
   when the design is still uncertain.
4. Keep the first pull request small enough to review and verify independently.

Good starting points are labelled
[`good first issue`](https://github.com/Swarek/Super_Bash_Folds/issues?q=is%3Aissue+state%3Aopen+label%3A%22good+first+issue%22)
or
[`help wanted`](https://github.com/Swarek/Super_Bash_Folds/issues?q=is%3Aissue+state%3Aopen+label%3A%22help+wanted%22).

## Setup

Install Node.js 20 or newer, then:

```sh
git clone https://github.com/Swarek/Super_Bash_Folds.git
cd Super_Bash_Folds
npm ci
npm run content:doctor
npm run dev
```

The doctor command reports optional content-pipeline tools and gives install
guidance. Running the game and changing TypeScript do not require Blender.

## Fast feedback while working

Use the smallest relevant loop:

- Engine or UI code: `npm test -- --watch` or a targeted Vitest file.
- Fighter pack: `npm run fighter:build -- <id>` then `npm run fighter:check`.
- Stage pack: `npm run stage:build` then `npm run stage:check`.
- Website: run `npm run site:sync-game` from the repository root, then run
  `npm test` inside `website/`.

Before opening a pull request, run the complete public verification once:

```sh
npm run validate:public
```

Do not bypass a validator, commit generated `dist/` output, or force-add an
ignored file.

## Add content

- Fighters are self-contained packs under `fighters/`; read
  [`fighters/README.md`](fighters/README.md).
- Stages are self-contained packs under `stages/`; read
  [`stages/README.md`](stages/README.md).
- Every asset must comply with [`ASSET_POLICY.md`](ASSET_POLICY.md).

A license declaration is not enough when a file reproduces an identity the
uploader does not own. Do not contribute commercial-game characters, logos,
screenshots, music, extracted files, or close imitations. When provenance is
uncertain, open a Discussion with source links before adding any file.

## Pull request checklist

- Explain the player or contributor problem being solved.
- Link the relevant issue or Discussion.
- Add or update the closest test.
- Include screenshots or a short recording for visible changes.
- Record author, source URL, license, transformations, and hashes for assets.
- Run `npm run validate:public` and report its result.
- Confirm that no generated output, credential, personal path, or proprietary
  content was added.

Maintainers may ask to split a pull request when independent changes can be
reviewed or released separately.

## Reporting security or private-content problems

Do not open a public issue containing a vulnerability, credential, personal
data, or prohibited asset. Follow [SECURITY.md](SECURITY.md).
