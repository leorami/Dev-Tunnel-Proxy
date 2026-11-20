# V174 Stage A — main default normalization and accepted-vs-draft inventory

**Date:** 2026-11-20  
**Issue:** #182  
**Assignment:** `devproxy-v174-main-default-and-mandatory-cto-visual-bridge`

## GitHub settings (verified)

- Default branch changed: `master` → `main`
- `main` tip at change: `952aa2625990f8da60784a8c6a63759b47b43569`
- `master` tip unchanged: `62a4d7babae986ade1feb0fd6dbe7dd32532523a` (not deleted)
- `origin/HEAD` → `refs/heads/main`
- Branch protection on `main`: enabled; `allow_force_pushes=false`; `allow_deletions=false`; required approving review count = 1; `protected:true`

## Lifecycle

- V173 #180 CLOSED (`STARTED` #7046984089 → `RETURNED` #7046997778 → CTO REVIEW #7047052758)
- No competing V174 primary observed at STARTED
- Owner dirty local `master` checkout preserved (no force reset/stash/clean)

## Accepted vs draft inventory (material)

| Item | SHA / tip | Relation to `main@952aa26…` | Action |
| --- | --- | --- | --- |
| Merged CTO visual contract #181 | `952aa2625990f8da60784a8c6a63759b47b43569` | IS main tip | Keep |
| DRAFT #178 V171 four auth-prefix | `6a5e9aa8c1788961c1dc199f9cbca491ff26e65e` | Ancestor of main | Do not re-merge |
| DRAFT #169 V163 seven-file | `f218445a4657a50a8740d682eeffa45ae35c2fcb` | Ancestor of main | Do not re-merge |
| DRAFT #162 V160 Status+Calliope | `027aaf23cd9a6dd86b963827e424faa58b3fb559` | Ancestor of main | Do not re-merge |
| DRAFT #151 Calliope docs truth | `bb66ef3ee7cf334c11344e6832e22209b07f18c4` | Diverged (not ancestor) | Separate line-by-line reconciliation later |
| DRAFT #123 governance overlay | `63e3f6b466dadf624ee7dbab4e313c548b3cef3e` | Diverged (not ancestor) | Separate reconciliation; no blanket merge |

No untested/obsolete drafts were force-merged to reduce PR count. `master` retained for history.
