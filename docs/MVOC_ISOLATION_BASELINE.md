# WSadmin MVOC Read-only Baseline

Recorded before WSadmin Business checkpoint work on 2026-08-27.

- Repository: `/opt/wsadmin`
- Branch: `Dev`
- HEAD: `8d002a7445debf693014f7e3ff6f465f750c2a67`
- Rule: WSadmin Business tooling may read this repository only for isolation verification. It must never modify, stash, reset, clean, commit, migrate, build into, or deploy from it.

The repository was already dirty before this project checkpoint. The exact baseline status is stored in `docs/mvoc-baseline-status.txt` and must be compared without normalization that loses paths.

## Baseline refresh — 2026-08-28
MVOC HEAD remains `8d002a7445debf693014f7e3ff6f465f750c2a67`. During WSadmin Business P10 hardening, an independent MVOC worktree change was observed: previously recorded modified/untracked source files were no longer present and the only current untracked path is `backups/`. WSadmin Business did not edit `/opt/wsadmin`; the status-only baseline was refreshed to the observed state so future Business checkpoints continue detecting new MVOC drift.
