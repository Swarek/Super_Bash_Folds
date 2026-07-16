# Security policy

Do not open a public issue containing an exploitable vulnerability, token, key,
or private data. Use the private **Report a vulnerability** feature in the
GitHub repository's Security tab.

The project is a local game with no backend or user accounts. The most important
reports concern dependencies, path traversal in pack pipelines, execution of
untrusted content, and secrets accidentally added to the repository.

Content packs are static data. They must not contain executable scripts or paths
that escape their directory.

A proprietary asset, secret, or personal data found in an old commit must be
reported as an incident. Adding it to `.gitignore` afterward does not remove it
from cloneable history.
