# V191 Engineer completion — signed Calliope agent metadata envelope (SOURCE ONLY)

**Handoff:** `origin/cto/devproxy-v191-calliope-agent-envelope-20261123@890a2b3928b196de88bcc2b7ac6d7c0b517fa3b6:docs/handoffs/DEVPROXY_V191_SIGNED_AGENT_METADATA_SOURCE.md`  
**STARTED:** Issue #231 comment [#7105229260](https://github.com/leorami/Dev-Tunnel-Proxy/issues/231#issuecomment-7105229260)  
**Scope:** SOURCE ONLY. No live Calliope inbox, Signal/transport, screenshot export, file disclosure, heal, Nginx/Compose/API/worker/ngrok, credentials, protected-main merge, or deployment.

## Fresh lifecycle at dispatch

| Ref | SHA / status |
|---|---|
| Protected `main` | `590bcf2a980b434f533ddacac43a24a777a933e7` (untouched) |
| V190 Engineer return | `970b8e509407f8216862cd6cfaa8c722e5b56f70` (issue #228 STARTED #7091751640 → RETURNED/STOPPED #7091769360) |
| CTO V191 pin | `890a2b3928b196de88bcc2b7ac6d7c0b517fa3b6` (draft PR #230) |
| Competing primary | none; CTO VERIFIED #7104272293 is not a launched Engineer |

## Independent source audit

CTO add-only candidate (helper, focused tests, Node 22 workflow, architecture, handoff) is a transport-independent Ed25519 verifier for fixed `artifact.describe` metadata. It does not import heal/review-gate modules, does not read files/URLs, and success returns `SIGNED_METADATA_ONLY` with all authority flags **false**.

| Risk | Result |
|---|---|
| Algorithm confusion | Non-Ed25519 (RSA/X25519) rejected at config |
| Private key in verifier config | **Gap found:** Node `createPublicKey` derived a public key from Ed25519 private KeyObject/PKCS8/JWK, so a mis-wired registry would still verify. **RED** then reject private material before derivation |
| Canonical encoding | Fixed `SIGNED` field order + domain prefix; not JSON key-order dependent |
| Prototype / accessors / extra fields | Fail closed (`ownExactData`) |
| Replay | In-process nonce map; unexpired entries not evicted at capacity; **not** multi-process or restart-durable |
| Signer/project | Registry allowlist; tamper and unauthorized project denied |
| Signature encoding | 64-byte base64url with round-trip check |
| Intent / audience | Re-signed `artifact.export` / `heal.execute` / host/file intents denied; extra `path`/`url`/`bytes` never accepted |

V190 Nginx source and V189 screenshots were not modified.

## Tests actually run (isolated worktree, Node **v22.19.0**)

Observed **RED** after adding private-key assertions (CTO helper still derived public keys):

```text
node --test tests/security/v191-calliope-agent-envelope.test.cjs
# tests 6  pass 5  fail 1  skipped 0   exit 1
# missing expected exception: private KeyObject accepted
```

After rejecting private KeyObject / PKCS8 / private JWK at config:

```text
node --check utils/calliope-agent-envelope.cjs          # exit 0
node --check tests/security/v191-calliope-agent-envelope.test.cjs  # exit 0
node --test tests/security/v191-calliope-agent-envelope.test.cjs
# tests 6  pass 6  fail 0  skipped 0  cancelled 0  todo 0   exit 0
```

No skipped or todo tests. No release-scope full suite claimed.

## Specialists

`NOT_SPAWNED_NOT_BENEFICIAL` — coupled small crypto helper; one primary inspected, added the bounded RED, and verified GREEN. No provider specialist run ID.

## Explicit non-claims

- **NO LIVE ACTIVATION.** This is not a receiver, Signal integration, owner grant, or artifact export.
- In-memory replay is per verifier instance only.
- Source outcome is **not** runtime/owner UAT.
- No private keys committed or logged; tests generate ephemeral synthetic keys.

## Engineer delta

Isolated helper/test correction (private-material rejection) plus this receipt on the CTO V191 branch. GitHub Actions for this returned SHA is the existing path-filtered V191 workflow on the Engineer PR (run URL in the RETURNED/STOPPED comment).
