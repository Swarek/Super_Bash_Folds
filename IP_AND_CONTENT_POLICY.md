# Naming, trademark, and content policy

Super Bash Folds is an independent platform fighter. The project must never be
presented as a sequel, port, remake, or product affiliated with an existing
franchise.

This document is a technical publishing policy, not legal advice. Before
commercialization, fundraising, or filing a trademark application, have the
name and product reviewed by an intellectual property professional in the
relevant countries.

## Name and identity

- The public name is **Super Bash Folds**. Former names must no longer appear in
  the product, packages, screenshots, releases, or metadata.
- The logo uses two offset platform angles. It must not reproduce another
  game's symbol, typography, or visual composition.
- Public pages use only "platform fighter" to describe the genre. Third-party
  trademarks must not be used as subtitles, promotional keywords, or mode names.
- A preliminary exact-match search for "Super Bash Folds" conducted on July 16,
  2026 across the Web, GitHub, and npm found no project with that exact name.
  This check is neither exhaustive nor a guarantee of availability: the EUIPO
  also recommends searching for similar signs and notes that a trademark may be
  challenged even when a search returns no result.

Official references:

- [EUIPO — check trademark availability](https://www.euipo.europa.eu/uk/trade-marks/before-applying/availability)
- [EUIPO — limitations of an availability search](https://www.euipo.europa.eu/en/help-centre/tm/faq-search-availability)

## Permitted public content

Every distributed asset must have a source, author, compatible license, record
of transformations, and hash. A license covering the file is not enough if the
file reproduces a character, logo, music, or other identity that its author does
not own.

Gameplay mechanics and methods may inspire the genre, but their audiovisual
expression must remain original. The U.S. Copyright Office distinguishes game
methods, which are not protected by copyright, from graphic or literary
elements, which may be protected:
[Games](https://www.copyright.gov/register/tx-games.html).

## Content prohibited from Git and releases

- Models, textures, animations, sprites, sounds, music, voices, effects,
  screenshots, or data extracted from a commercial game.
- Conversions or renders derived from those files.
- Game archives, extraction tools and scripts, internal path manifests, or
  data-mining instructions.
- Logos, names, or branding likely to imply affiliation.
- Secrets, machine paths, personal data, and account files.

Fan-content or media-sharing policies do not authorize redistribution of
extracted files, derivative asset packs, or unlicensed software. Contributors
must obtain explicit permission for every asset that is not covered by a
compatible open license.

## Local overlay

A maintainer may keep an overlay ignored by Git on their own machine. This
overlay is not a distributed feature, is not covered by the repository license,
and must not appear in a release, promotional screenshot, or issue. Public
commands remain the only supported contribution and CI surface.

## Checks before publishing

```sh
npm run check:public-assets
npm run check:public-history
npm run build:public
npm run check:public-dist
```

Checking the working tree is not enough: a deleted file remains in Git history.
If prohibited content has already been published, stop releases, rewrite every
affected reference, force-replace the remote branches and tags, and ask
contributors to clone the repository again.
