# Distributable character assets

The repository distributes only the fighter derivatives under `open/`. Each
fighter directory contains:

- `PROVENANCE.json`, including the upstream creator, source page and license;
- `SHA256SUMS`, covering every runtime atlas;
- the rendered WebP animation atlases used by the game.

The canonical human-readable inventory is maintained in
[`OPEN_ROSTER.md`](https://github.com/Swarek/Super_Bash_Folds/blob/main/OPEN_ROSTER.md),
while the machine-readable source of truth is the matching
`fighters/<id>/fighter.json` pack.

Files outside the documented open packs are not covered by these declarations
and must pass the public asset policy before distribution.
