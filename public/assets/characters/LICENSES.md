# Distributable character assets

The repository distributes only the fighter derivatives under `open/`. Each
fighter directory contains:

- `PROVENANCE.json`, including the upstream creator, source page and license;
- `SHA256SUMS`, covering every runtime atlas;
- the rendered WebP animation atlases used by the game.

The canonical human-readable inventory is maintained in
[`OPEN_ROSTER.md`](../../../OPEN_ROSTER.md), while the machine-readable source
of truth is the matching `fighters/<id>/fighter.json` pack.

Private compatibility overlays may exist in a developer's working copy under
other ignored directories. They are not part of this repository, are not
covered by the open-asset licenses, and must never be added to a commit.
