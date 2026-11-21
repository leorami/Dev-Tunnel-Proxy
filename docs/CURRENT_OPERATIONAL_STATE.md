# Dev Tunnel Proxy — current operational state (2026-11-20)

**Status of this file:** source documentation on an isolated draft branch. It is **not** proof that the owner's live checkout, bind-mounted Status UI, or ChatGPT session has been updated. Recheck protected `main`, Engineer receipts, and the actual runtime before any release claim.

**Protected default tip referenced at writing:** `main@de163771106b5c3f8ab1fbdac39d8e615147b6d1` (includes merged PR #186 browser/screenshot governance). Separate draft work (V174/V175 observer, V177 docs) may remain **source-only / unmerged / not deployed**.

## Secure mode in one sentence

In the approved secure management mode, Calliope Ask/Diagnose is **observation-only**: bounded local-documentation answers and authenticated read-only HTTP HEAD route checks. Chat text such as `please repair` does **not** grant repair authority. Owner-approved, reviewed, reversible changes are required before any heal, reload, route install, Docker/worker action, or deployment.

## Evidence boundaries (do not collapse these)

| Milestone | What was actually established | What it does **not** prove |
| --- | --- | --- |
| **V153** (#150) | Source-only grounded follow-up work RETURNED | Live Status HTML/JS necessarily loaded today; autonomous repair |
| **V154** (#153) | Read-only cross-project route assessment; proposed live change rejected as unsafe | Production fix of the original failing route |
| **V165** | Four static UI files published and hash-verified on the owner host | Complete authenticated owner UI UAT |
| **V172** | Four `^~` UI auth-prefix Nginx protections installed and Engineer host-tested | Calliope repair permission or observer deployment |
| **V175** | Draft PR #187 `beacbdf973cfefd1e0f249d208a5d4f64640909c` — source-only observer security gates GREEN | Merged/deployed observer; `/observer/*` JSON shells ≠ the real app |
| **V176** (#189) | Real login page reachable (owner Safari + Engineer Mac GET 200 / blob match); RETURNED `STOPPED_CHATGPT_BROWSER_TOOL_UNAVAILABLE` | Site outage; ChatGPT Work browser / inline original PNG to CTO; logged-in product UAT |

## What Calliope can safely claim today

- Local observational diagnostics and source-grounded explanation when authenticated
- Explicit, restricted actions only where policy and owner authorization exist
- Honest uncertainty: a failed HEAD is one observation, not first-cause certainty

## What must not be claimed from docs alone

- Unattended autonomous route healing in secure mode
- That the live site is down because ChatGPT's tool network cannot open a graphical browser
- That unmerged source drafts (observer, older Calliope UI PRs) are production behavior
- That documentation edits themselves repaired a route or updated the owner's running Ask corpus

## Where to read more

- [Calliope assistant guide](CALLIOPE_ASSISTANT.md) — historical design retained under an early secure-mode / observation-only banner
- [Documentation index](DOCUMENTATION_INDEX.md)
- GitHub issues #150, #153, #185, #189 for authentic STARTED/RETURNED receipts

## Change control

No nginx reload, Compose mutation, tunnel change, credential change, protected `main` merge, or owner-checkout sync is authorized by publishing this file in a draft PR. Visual acceptance still requires original pixels in the authorized reviewer surface; V176 established that Cursor-only capture is not ChatGPT inline proof.
