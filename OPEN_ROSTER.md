# Open roster — current state

> Source of truth as of July 14, 2026. The
> [`OPEN_ROSTER_RESEARCH.md`](OPEN_ROSTER_RESEARCH.md) document preserves the
> research history; this file describes only what is actually integrated and
> verifiable in the project.

## Verdict

The public runtime contains **14 open CC0 prototypes**. They are enabled in the
character select screen, have a portrait, and each include exactly 50 WebP
atlases compatible with the game's contract. An optional local overlay can
extend the roster during development, but it is disabled by
`PUBLIC_CONTENT_ONLY=1` and is not included in the repository.

Every pixel and pose in these atlases comes from audited upstream clips or
sprites. The pipeline neither draws nor interpolates motion. However, the
presence of an atlas does not necessarily mean that a dedicated animation
exists for that role: a genuine upstream clip may serve as a fallback for
several attacks until the correct animation is produced.

The game therefore distinguishes between two states:

- `visualReady`: portrait and 50 atlases are present, making the fighter
  selectable and playable as a prototype;
- `productionReady`: all 50 roles each have a directly corresponding upstream
  clip, with no adaptation or fallback.

All 14 fighters are `visualReady`. None is `productionReady` yet. The interface
labels them with the **Open prototype** badge so that fallback animations are
not presented as final animations.

## Integrated inventory

Coverage still totals 50 roles per fighter. `direct` means that a clip matches
the role, `adapted` means that a genuine, similar animation still needs to be
specialized, and `author_required` means that the visual fallback comes from a
genuine clip but does not match the role closely enough.

| Fighter | Pipeline | Source | direct | adapted | author_required |
| --- | --- | --- | ---: | ---: | ---: |
| KayKit Knight | 3D | [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) + [Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) | 28 | 21 | 1 |
| Quaternius Ranger | 3D | [Fantasy Outfits](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) + [Animation Library 1](https://quaternius.com/packs/universalanimationlibrary.html) + [Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) | 25 | 15 | 10 |
| George | 3D | [Animated Mech](https://quaternius.com/packs/animatedmech.html) | 11 | 20 | 19 |
| Platformer | 3D | [Ultimate Platformer](https://quaternius.com/packs/ultimateplatformer.html) | 12 | 20 | 18 |
| Wolf | 3D | [Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html) | 8 | 19 | 23 |
| Cactus | 3D | [Cute Animated Monsters](https://quaternius.com/packs/cutemonsters.html) | 8 | 18 | 24 |
| Yeti | 3D | [Cute Animated Monsters](https://quaternius.com/packs/cutemonsters.html) | 8 | 18 | 24 |
| RGS Stick Figure | 2D | [RGS Animated Stick Figure](https://rgsdev.itch.io/animated-stick-figure-character-2d-free-cc0) | 7 | 22 | 21 |
| Dark Knight 2D | 2D | [OpenGameArt](https://opengameart.org/content/dark-knight-2d-character-sprites) | 16 | 28 | 6 |
| Knight Hero | 2D | [OpenGameArt](https://opengameart.org/content/knight-hero-platformer-animation-pack) | 11 | 28 | 11 |
| Kenney Toon Adventurer | 2D | [Kenney Toon Characters](https://kenney.nl/assets/toon-characters) | 18 | 24 | 8 |
| RGS Character Prototype | 2D | [RGS Character Prototype](https://rgsdev.itch.io/character-prototype-animated-cc0) | 7 | 27 | 16 |
| Hormelz Melee Character | 2D | [Hormelz Melee Character](https://hormelz.itch.io/8-directional-melee-character) | 14 | 29 | 7 |
| Hormelz Knight | 2D | [Hormelz Knight](https://hormelz.itch.io/8-directional-knight) | 17 | 25 | 8 |

The downloaded pages and archives declare these packs under **CC0 1.0**. Every
public output also keeps `PROVENANCE.json` and `SHA256SUMS` alongside the
atlases. If this table differs from the files, each directory under `fighters/`
is the machine-readable source of truth. Render manifests are generated from
these packs.

## Verification and reproduction

Open-fighter definitions live in their `fighters/<id>/` directories. The
runtime registry and pipeline manifests are generated and must not be edited
directly. The process for adding a fighter is documented in
[`fighters/README.md`](fighters/README.md).

```sh
# Synchronize every pack with the runtime
npm run fighter:build

# Rebuild one fighter from its audited local sources
npm run fighter:build -- kaykit-knight

# Verify inventories, metadata, provenance, and one WebP per fighter
npm run fighter:check

# Verify all 700 open WebPs instead of using the quick sample
npm run fighter:check -- --deep
```

Downloaded archives remain local and are ignored by Git. Open derivatives
under `public/assets/characters/open/` and their portraits may be committed.
Transformation details are documented in
[`scripts/open_fighter_pipeline/README.md`](scripts/open_fighter_pipeline/README.md)
and
[`scripts/open_fighter_pipeline/README-2D.md`](scripts/open_fighter_pipeline/README-2D.md).

## Present but unintegrated candidates

- **Godinez Free** has been ingested and has provenance records, but its two
  free sprite sheets have no clip names, slicing metadata, or editable source.
  The pipeline explicitly refuses to guess their segmentation.
- **Hikou, Hana, and Takino** still require a Synfig rendering pipeline.
- **Turner/Lugaru** requires a converter for its legacy binary formats.
- Paid packs and candidates with non-commercial, ambiguous, or incompatible
  creative licenses remain excluded.

## Public scope

The stages, music, sounds, items, cursors, and interface elements in the public
repository have their own open provenance. The automated policy rejects legacy
paths from the private overlay; see [`ASSET_POLICY.md`](ASSET_POLICY.md) and
[`THIRD_PARTY_ASSETS.md`](THIRD_PARTY_ASSETS.md).
