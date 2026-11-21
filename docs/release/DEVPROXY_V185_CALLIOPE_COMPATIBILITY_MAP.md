# V185 Calliope compatibility map (source-only)

**Not installed. Not loaded. Not owner UAT. Not healed.**

## Generated API overlay
| Identity | Value |
|---|---|
| Installed preimage Git blob | `7a22ec61531ac7b39c01370e41196775904c274f` |
| Protected main API Git blob | `bafc60dc0224439e3d726f07e900afdbfce7cf60` |
| Reviewed V182 API Git blob | `79c87fdc83ae5da2bdc22d1670f9d03709aee80d` |
| Generated overlay Git blob | `f95607cb7e4c07161c1ca07b3d74c0e4e4a7c528` |
| Insertions | 29 lines / 5 hunks / 0 deletions |
| Authority flags | all false |

## Future dedicated durable API stage set (separate owner GO required)
| Path | Role | Reviewed candidate blob |
|---|---|---|
| `utils/proxyConfigAPI.js` | generated overlay only (not main, not raw V182) | `f95607cb7e4c07161c1ca07b3d74c0e4e4a7c528` |
| `utils/calliope-owner-session-runtime.cjs` | new | `4064363810b8c90ccfa1a0e20f407ead894f5b87` |
| `utils/calliope-owner-session-brain.cjs` | new | `f69d9c9ad468a21a9f0df572bf34fb13f8bb0aa7` |
| `utils/calliope-local-model-complete.cjs` | new | `86a3717e40fb021f9e04e318334a7da71ea12466` |
| `utils/calliope-grounded-local-turn.cjs` | new | `a7e15ad1126a707dda5ba6d88df4f4f7006f0245` |
| `utils/calliope-trusted-observation-cache.cjs` | new | `2e74686c989ac6024611569fd90d4a885938faab` |
| `utils/rc2-calliope-grounded-followup.cjs` | missing on host today; required | `78a511dd8e5d7a2dc24a8487cfd80e1c58f70e78` |

## Explicitly out of scope for the future V185-shaped stage
- `status/status.html` and any Status remount / nginx change
- Dirty owner checkout writes
- Proxy / ngrok / host-worker recycle
- Protected-main merge
- Milestone 2 heal permissions

## Future signed-in smoke lane (after separate activation GO)
Health/Reports shared assistant in `status/common.js` already issues authenticated `POST /devproxy/api/ai/ask`. That path can prove local-model behavior **without** staging Status HTML, once the durable API overlay + six companion modules are installed and the Config API is recycled under a new explicit owner grant.
