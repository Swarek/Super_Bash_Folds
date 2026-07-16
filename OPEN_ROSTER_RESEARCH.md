# In-depth research — open fighters

> **Research archive dated July 14, 2026.** Several conclusions below describe
> the state before download and integration. The current source of truth is
> [`OPEN_ROSTER.md`](OPEN_ROSTER.md): 14 CC0 prototypes are now integrated, no
> purchase was made, and no candidate yet has 50 directly corresponding
> animations.

## Verdict

None of the verified sources contains a character that can honestly satisfy all
50 visible animations currently required by the game. Marketplace descriptions
such as “fully animated” generally mean locomotion and a few attacks, not a
complete platform-fighter character.

The best first pilot is the **free KayKit Knight**, paired with the **KayKit
Character Animations** library. It is the closest free combination to the
project's needs: the same rig, an already equipped model, standard formats, a
CC0 license, and 161 humanoid animations. However, it still requires original
special attacks, several aerial attacks, grabs, and character-specific throws.

The best foundation for building a family of original fighters afterward is
**Quaternius Universal Base Characters + Universal Animation Libraries 1 and 2
+ Modular Fantasy Outfits**. All of these packs use a compatible humanoid rig
and are released under CC0. Their complete catalog exceeds 250 clips, but the
free version contains only about 60–70% of some packs and still does not
guarantee all 50 game-specific roles.

## The game's actual contract

The current source of truth is `REMOTE_ANIMATION_SLOTS` in
`src/game/characterAssets.ts`. A complete integration must provide exactly these
50 roles, even if the same source file may exceptionally serve as the basis for
several roles after adaptation:

- 11 movements and poses: `idle`, `crouch`, `walk`, `turn`, `dash`, `run`,
  `jump_squat`, `jump`, `double_jump`, `fall`, `fast_fall`;
- 8 grounded attacks: `jab`, `dash_attack`, the three `tilt` attacks, and the
  three `smash` attacks;
- 5 directional aerial attacks: neutral, forward, back, up, and down;
- 4 special attacks: neutral, side, up, and down;
- 5 defensive actions: spot dodge, two rolls, air dodge, and shield;
- 3 item actions: hold, pickup, and attack;
- 7 grab states: grab, grab hold, grabbed, and four throws;
- 7 damage or presentation states: hurt, knockback, downed, ledge, entrance,
  taunt, and victory.

The future open roster should then add states that are currently absent from
this contract but useful for game quality: landing, pummel, tumble, tech,
get-up, shield break, and directional hitstun variants. They must not be
confused with the 50 slots already validated by the runtime.

### Required evidence level

- `direct` means that a specific clip inspected in the archive already matches
  the role, not merely that its name appears suitable;
- `adapted` means that a distinct animation must still be produced from a
  genuine editable source; it is not a ready slot;
- `author_required` means that no sufficiently close source was found;
- no `direct/adapted/author_required` total is accepted without a
  `runtime slot -> source clip` table and visual verification.

The aggregate matrices found during research are therefore cost estimates,
never proof that a character is playable or complete.

## Verified shortlist

| Priority | Candidate | Verified license and contents | Verdict against the 50 slots |
| --- | --- | --- | --- |
| **A — first pilot** | [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) + [Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) | CC0; 5 free characters, 25+ weapons/accessories, FBX/glTF; 161 humanoid clips covering locomotion, jumping, crouching, dodging, damage, death, armed or unarmed melee, shooting, magic, and emotes. | Most efficient foundation. The 4 specials, 5 aerials, 3 smashes, grabs/4 throws, ledge, and some reactions still need to be created or adapted. The Knight is the best pilot because of its sword and shield. |
| **A — extensible family** | [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html), [Library 1](https://quaternius.com/packs/universalanimationlibrary.html), [Library 2](https://quaternius.com/packs/universalanimationlibrary2.html), and [Fantasy Outfits](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) | CC0; 6 bases and 20 hairstyles; libraries advertised with 120+ and 130+ clips; 12 outfits and 62 pieces on the same rig. FBX/glTF available. | Excellent for creating several original identities. The exact free contents must be inventoried after download. Grabs/throws, ledge, specials, and complete aerial sets are not verified. |
| **B — 3D robot** | [George, Animated Mech Pack](https://quaternius.com/packs/animatedmech.html) | CC0; `.blend`, FBX, and glTF; 20 inspected clips and a complete 47-joint rig with arms, hands, and fingers. | Best mech in the pack. It has punch, kick, shoot, sword slash, pickup, and reaction animations, but these clips include no weapon, projectile, or VFX. About 40 roles still require an adapted or new animation. Leela is excluded because its rig has neither arms nor hands. |
| **B — genuine free 2D characters** | [Hikou no mizu](https://gitlab.com/hikou_no/hikounomizu): Hikou, Hana, and Takino | Synfig sources and graphics explicitly licensed under CC BY-SA 4.0; the repository contains idle/crouch, movement, jump/fall, grounded and aerial attacks, hit, guard, and block stun. | Much stronger identities and provenance than a marketplace sprite. However, smashes, 4 specials, grabs/throws, dodges, ledge, tech, taunt, and victory are missing. Any graphical adaptation must remain under CC BY-SA 4.0 with attribution. |
| **B — closest pixel art** | [Warrior Character](https://luizmelo.itch.io/warrior-character) | CC0; 22 animations: locomotion, jump/fall/landing, 3 grounded attacks, 3 aerial attacks, roll, hit, death, and horizontal/vertical dashes. Paid pack at USD 12.90. | Very strong 2D silhouette, but shield, grab/throws, ledge, complete specials, smashes, and several defensive actions still need to be created. No purchase without an explicit decision. |
| **B — rich free 2D** | [Hormelz Melee Character](https://hormelz.itch.io/8-directional-melee-character) and [Hormelz Knight](https://hormelz.itch.io/8-directional-knight) | Two separate CC0 packs: 38 melee animations for the first; 33 for the Knight, including jump attacks, combo, crouch attack, cast, block, and climb. | Substantial combat material, but the top-down perspective must be reworked, no Aseprite file or editable rig is provided, and there is still no complete grab/throws/ledge/aerial set. The Knight with sword/shield costs USD 3; its three unarmed archives are free. |
| **B — realistic 2D knight** | [Dark Knight 2D](https://opengameart.org/content/dark-knight-2d-character-sprites) | CC0; 37 downloadable clips and sprite sets, including idle, walk/run, jump, block, crouch, several slashes, kick, casting, impacts, and deaths. | Strong visual foundation, but there is no evidence of 5 aerials, grab/throws, ledge, rolls, air dodge, or tech. |
| **B — 3D animal with identity** | [Turner in Lugaru](https://github.com/osslugaru/lugaru) | Assets explicitly licensed under CC BY-SA 3.0/4.0; 109 animation files covering locomotion, jump/landing, ledge/climb, flips, dodge/roll, block/parry, catches, get-up, and many strikes/weapons. | Very rich and visually distinctive, but Lugaru's binary formats and old Blender plugin need conversion. The taxonomy does not directly provide all 50 slots, especially smashes, directional aerials, and specials. |
| **B — editable stick figure** | [RGS Animated Stick Figure](https://rgsdev.itch.io/animated-stick-figure-character-2d-free-cc0) | CC0; 12 PNG animations and a genuine Blender Grease Pencil source: locomotion, dash, slide, climb, damage, air attack, and combo. | The `.blend` source makes new animations possible, but its internal structure still needs auditing. Most of the 50 roles still need to be produced. |
| **C — small 2D prototype** | [Godinez Fighter](https://siwoku.itch.io/godinez-fighter) | CC0; highly limited free version; USD 1 tier with 19 animations covering boxing, guard, jump/fall/landing, air punch, and air kick. | Coherent but too incomplete for the first pilot. Only two aerials, with no verified grab/throw, ledge, roll, or air dodge. |
| **C — lightweight 3D humanoid** | [Quaternius Platformer Character](https://quaternius.com/packs/ultimateplatformer.html) | CC0; `.blend`, FBX, and glTF; 18 clips and a 29-joint humanoid rig. One variant contains a modeled rifle. | A simple seed, but much less complete than KayKit or the Universal Libraries. The rifle has no accompanying projectile or VFX, and most roles still need to be produced. |
| **C — non-humanoids** | [Wolf](https://quaternius.com/packs/ultimateanimatedanimals.html), [Cactus and Yeti](https://quaternius.com/packs/cutemonsters.html) | CC0 and `.blend` sources. Wolf has 12 clips and a 51-joint quadruped rig; Cactus and Yeti have 10 clips but only 7 joints. | Wolf is the best choice for a later animal fighter. Cactus/Yeti could become joke characters, but their very simple rigs make adaptations costly. None is a good first pilot. |
| **C — visual exploration** | [RGS Character Prototype](https://rgsdev.itch.io/character-prototype-animated-cc0), [Knight Hero Platformer](https://opengameart.org/content/knight-hero-platformer-animation-pack), and [Kenney Toon Characters](https://kenney.nl/assets/toon-characters) | CC0; cartoon, pixel, and vector styles. RGS provides 12 distinct PNG animations but no Blender source; Kenney primarily provides poses and short cycles. | Useful style pools, but not 50/50 characters. Keep them for a later phase, after the KayKit pilot. |

### Appealing but blocked candidates

**Fraynkie** is technically the closest result to the contract: the pinned
[`character.entity`](https://github.com/Fraymakers/character-template/blob/b23f663c8bc76e9a79771b6f070690eb33a8e6b9/library/entities/character.entity)
contains 120 genuine animations, including the five aerials, four specials,
three smashes, grab, and four throws. It is nevertheless inadmissible: the MIT
license covers the software, while
[`CREDITS.txt`](https://github.com/Fraymakers/character-template/blob/b23f663c8bc76e9a79771b6f070690eb33a8e6b9/CREDITS.txt)
explicitly places Fraynkie and the creative elements under CC BY-NC-SA 4.0. Its
voices also have third-party provenance without a precise license in that
commit. It therefore remains excluded unless it receives written relicensing
under CC0, CC BY, or an equivalent license.

[Super Tilt Bro](https://github.com/sgadrat/super-tilt-bro) is a genuine
open-source platform fighter with directional attacks, specials, and shields.
Its main repository displays the WTFPL, but the historical credits for several
sprites and music tracks also mention CC BY and CC BY-SA. No character should
therefore be imported until a file-by-file audit proves the license and origin
of its identity, sprites, effects, and sounds.

**Universal LPC** is a generator, not a ready fighter. Its code is GPL-3, each
image layer has its own license, and its 17 interface labels do not correspond
to 17 independent clips available across all outfits. Any integration would
require a pinned configuration, verification of every layer, and export of its
credits file. It is not a priority.

## What the best packs actually lack

For each selected candidate, the inventory must classify all 50 slots into
three columns: `direct`, `adapted`, and `author_required`. The most likely gaps
are:

- the 4 special attacks, whose movement and effects must be defined together
  with the mechanic rather than only as a pose;
- the 5 directional aerials and their ground/air transitions;
- the 3 smashes with distinct anticipation, charge, impact, and recovery;
- grab, grab hold, grabbed, and the 4 throws;
- ledge, air dodge, knockback, and downed;
- VFX, projectiles, sounds, and voices, each with its own provenance and
  license.

Reusing the same swing for five attacks does not constitute a complete
integration. An `adapted` slot must at minimum have timing, a silhouette, and a
readable direction that match its mechanic.

## Public-content boundary

The public runtime now loads only audited, redistributable packs. Non-public
experiments must stay outside this checkout or in the generic local vaults
ignored by Git; no development or build command can activate them. The
`validate:public` pipeline checks source, assets, Git history, tests, build
output, and performance before publication.

## License rules for the public repository

1. **Prefer CC0**, followed by CC BY with complete attribution. CC BY-SA is
   possible but requires derivatives of the asset to retain the same license.
   NC or ND licenses are excluded from the public roster.
2. An open license attached to fan art of a third-party commercial identity is
   not sufficient: the file's author cannot grant rights they do not own.
3. **Do not put Mixamo files in the public repository.** Adobe permits their use
   in a game but not their redistribution as standalone content.
4. On OpenGameArt or Sketchfab, verify the license of every submission and
   sub-asset; the platform's name is not a license.
5. Keep attribution even for CC0: it is not mandatory, but it makes provenance
   and future audits much more robust.
6. Third-party franchise characters, portraits, animations, effects, sounds,
   and derivatives must never enter the public repository or its history.

Reference legal sources: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
[Creative Commons attribution best practices](https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution),
[OpenGameArt FAQ](https://opengameart.org/content/faq),
[official Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html),
and [Sketchfab licenses](https://sketchfab.com/licenses).

## Required manifest before integration

Every open fighter must have a provenance manifest like this before its assets
are copied into `public/`:

```yaml
id: open-knight
status: candidate # candidate | approved | blocked
identity:
  original: true
  name_owner: project
source:
  author: Kay Lousberg
  page: https://kaylousberg.itch.io/kaykit-adventurers
  retrieved_at: YYYY-MM-DD
  archive_sha256: TO_FILL_AFTER_DOWNLOAD
license:
  spdx: CC0-1.0
  proof_file: licenses/kaykit-adventurers.txt
dependencies:
  mixamo: false
  third_party_assets: []
animation_audit:
  # Every direct entry must name the actual inspected clip:
  # - slot: idle
  #   source_clip: Idle
  direct: []
  # Every adaptation must describe the remaining work:
  # - slot: fast_fall
  #   source_clip: Fall
  #   work_required: New animation and new timing
  adapted: []
  # Example: [special_up]
  author_required: []
changes: []
```

The final manifest must also reference the model, textures, animations, VFX,
projectiles, sounds, and voices separately. A single blocked asset blocks the
entire character until it is replaced.

## Recommended next step

1. Explicitly separate the future public repository from the private Smash
   pack, including already generated files and Git history.
2. Download the free **KayKit Adventurers 2.0** and **Character Animations 1.1**
   versions into an ignored source area, then record the archive URLs, dates,
   licenses, and SHA-256 hashes.
3. Inventory the actual names of all 161 clips and produce the Knight's 50-slot
   matrix: no mapping should be inferred solely from categories on the web
   page.
4. Design its identity, mechanics, 4 specials, VFX, and original sounds, then
   create the missing animations.
5. Add an FBX/glTF adapter to the existing local rendering pipeline to produce
   the same 192 px WebP atlases as the current runtime, without requiring a
   second rendering engine during matches.
6. Enable the fighter in the roster only after validating all 50 slots, its
   in-game readability, and its entire provenance chain.

This sequence keeps Smash characters available locally during development
without confusing them with material that may actually be published.
