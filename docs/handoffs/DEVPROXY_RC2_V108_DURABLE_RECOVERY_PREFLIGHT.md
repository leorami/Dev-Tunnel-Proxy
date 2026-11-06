# V108 — recovery preflight only

OWNER ACTION GATE: NEW RECOVERY APPROVAL PENDING. This instruction does not authorize a live start or deployment.

Primary repository: leorami/Dev-Tunnel-Proxy. Start from genuinely RETURNED V106 engineer/devproxy-rc2-controlled-release-20261104 at full SHA f3dd8ffc4cafd7023ecc140a6793c1eceb2a6468 (PR #79 comment 6673725518). Verify the latest PR head and agent lifecycle before starting. Do not interrupt another active assignment.

Engineer-I owns one read-only investigation and one consolidated receipt. Import only this isolated branch's source, test and canonical-unit hook. Run native focused test for rc2-live-durable-mount-paths.test.cjs and ./smart-build.sh test:unit. Record exact source SHA and test exits.

Without modifying the Mac, privately inventory recovery materials already available through trusted tools: preserved images, original and durable backup locations, mount paths, config bytes and ownership, route inventory, worker binding and HMAC continuity. Do not expose original file paths or credential contents on GitHub. State which materials exist and which are missing, with independent evidence. Preserve existing stopped containers and owner data; do not auto-create missing directories.

Distinguish two recovery strategies correctly: existing same-ID containers require restoration at their original bind source paths; relocation to a durable directory requires new reviewed container creation and host-worker revalidation. Recommend the durable strategy if original materials can be authenticated. Do not perform either strategy until a NEW specifically scoped owner approval appears in PR #79. Prior API-only authorization is already recorded but excludes proxy/ngrok/worker changes.

If a new owner approval becomes available, stop and reconcile its exact scope with current CTO guidance before taking any privileged action. No source-only test grants deployment permission. Return a single evidence-based report labelled RECOVERY_PREFLIGHT_OWNER_AUTH_REQUIRED, not a false production PASS. Continue only harmless independent verification. No protected merge, tunnel configuration change, credential rotation, owner application edit, or extra service.
