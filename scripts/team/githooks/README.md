# `.githooks/` template for `viki team infect`

`scripts/team/githooks/post-merge` is the canonical body of the post-merge
hook that `viki team infect` copies into a target project's `.githooks/`
directory.

The hook is intentionally:

- **Bash-only** — no Node startup overhead per pull
- **Silent on success** — `>/dev/null 2>&1`
- **Non-blocking** — every failure is `|| true` so a broken viki install
  cannot prevent a `git pull` from completing
- **Conditional** — only runs when `.viki/manifest.json` exists (so cloning
  a non-team repo with a stale post-merge file is a no-op)

To inspect what `viki team infect` will install, just read
`scripts/team/githooks/post-merge`. To customize for a single project,
edit the project's `.githooks/post-merge` directly after infection.
