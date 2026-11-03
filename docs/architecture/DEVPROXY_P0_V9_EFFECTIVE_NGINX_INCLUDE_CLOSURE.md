# Dev Proxy P0 v9 - Effective Nginx include closure (nonlive, CTO source)

## Actual source-grounded vulnerability

The approved source `d89c962fb31a962a518f331bae458e63708e7e86` contains two glob includes. `config/nginx.production.conf` (blob `971180545a885b5bf21ab28f6babc257a1e3e067`) includes `/etc/nginx/conf.d/*.conf`; `config/default.production.conf` (blob `e0e4d389605069a2e73fadf5500baba52841b1d9`) includes `/etc/nginx/conf.d/sites-enabled/*.conf`. The v6 HMAC signs the generated bundle, main config and default config, but not an additional `.conf` matching either glob or bytes loaded via a nested `include`. Thus three-file content integrity alone does not bind all effective loaded configuration.

A RED-first test proves the 3-file v6 SHA-256 remains IDENTICAL after adding `build/sites-enabled/unbound.conf`. The host-only wrapper now checks this before its injected, fixed nginx-test/reload commands.

## CTO-owned implementation (source-only)

`utils/rc1-effective-nginx-config-closure.cjs` checks a fixed approved include graph, rejects another site-enabled file or symlink, rejects unexpected nested include directives, and rechecks candidate integrity before and after an optional external host-view callback. A conservative quote/comment-aware Nginx directive lexer recognizes nested/multiline includes without confusing comments or quoted text with executable directives. Malformed or untrusted content fails closed. A host callback may report exactly `default.conf` and `apps.generated.conf`, but the module NEVER claims `actualHostAttested:true`; its best result is `HOST_CALLBACK_CONFIG_CLOSURE_REPORTED`, with `productionChangeAuthorized:false`.

`utils/rc1-closure-gated-host-driver.cjs` wraps an independently trusted fixed-action host driver. Closure is checked before each attest, nginx-test, nginx-reload and before and after active-route proof. It never imports Docker, runs commands, launches a listener, modifies owner files or authorizes privileged execution. Unknown actions, untrusted runtime view and aborted/late callbacks fail closed.

Thirty-three Node 22.16.0 fixture/integration tests pass (17 closure, 10 driver and 6 genuine HMAC spool + corrected v7 guarded-worker path). The tests were added RED-first. Dependency copies in the isolated fixture exactly match the parent branch Git blob SHAs: manifest `ee8318c2f86a3db5158916c29b9317f88c196e1a`, spool `2813ce6b4c602bcc4b24aa4ffed8865631005f23`, HMAC `d032a3ca9f8590321ef15ef992b0374b2c9c04fe`, host fence `c749aa5b110a657553ce25a9c37837720bec109b`, and guarded host worker `1aac143b8f7ef138da6775e198c26e572742696d`.

## Remaining release blockers

This is only a static preflight. A host-view callback could be fabricated; actual read-only enumeration of the running nginx container's conf.d directory, exact mounted file identity and full proxy image digest require independently observed trusted host evidence. A noncooperating writer can change files between checks; immutable snapshots or a cross-process integrity lease and authorized host worker are still absent. PR #67's post-fence / pre-API-settle race remains open. Config edits remain `allowConfigEdit:false`; rename and destructive cleanup remain deferred.

The prior single-operation RC1 production authorization is consumed. Current production is NOT redeployed; latest observation was an API `/app` RW deviation and 17 preserved owner routes. All CTO v9 work is isolated source/tests only. Protected master, owner data, credentials/sessions, ngrok/bridge and UI are untouched. Any future UI work requires independent CTO pixel inspection before owner UAT.
