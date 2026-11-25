# V200 Engineer receipt — loaded RC2 Signal overlay

**CTO pin:** `cto/devproxy-v200-live-api-preservation-20261124@7649f5fe38e30c00f838eee5dda5b443bf8d4f4d`
**STARTED:** https://github.com/leorami/Dev-Tunnel-Proxy/issues/259#issuecomment-7145634464

The loaded Config API file stayed the RC2 bytes `4ebd2194bb03be78e9f02ab0abdd313d9666869c296190bf5bdd37cd07243650`. The overlay inserts only the private Signal mailbox. Stripping that overlay returns those exact bytes. Public health before and after the reload hashed `db4aa4a34db9874cecea71da6a4a48ee9322f7a4b84df4d22c7f2c440440f442`.

Anonymous mailbox access on the API redirects to login. The nginx edge returns 404 for `POST /devproxy/api/signal/private/deliver`. No nginx route was added.

Official `@signalapp/libsignal-client@0.108.7` (`AGPL-3.0-only`) matches upstream tag `v0.108.7`. Mac Node 24.18.1 and Linux glibc Node 24.20.0 both completed a `proxy.status` exchange. Node 18.20.8 and Node 22.19.0 ran the mailbox, enrollment, atomic-store, and overlay tests: 31 passed, 0 failed, 0 skipped on each.

The live exchange used the loaded API. Reports list stayed HTTP 200. Both Signal processes restarted and exchanged again. `executable` stayed false. Revoking the Calliope device then returned HTTP 403. The same Trajectory Room shows that result. Screenshot `1794×1850`, SHA-256 `0ecdcdab83b04d62de0e0d055cedc15440c65eaada532b1d0604064718761731`.

No specialist was launched. Protected `main` was not merged. Private rollback of the pre-overlay API was taken and a scratch restore matched the loaded hash. The product bind is read-only inside the API container, so the mailbox and nonce directory use the existing writable apps mount. That directory is gitignored and is not part of this branch.
