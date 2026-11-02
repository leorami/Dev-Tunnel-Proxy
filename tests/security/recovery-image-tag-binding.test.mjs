/** RED-first: Compose name:tag bindings must resolve to recorded immutable image IDs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  COMPOSE_BINDINGS,
  normalizeDigest,
  mapOriginalIdsToLoadedConfigs,
  resolveTagBindings,
  assertAllBindingsResolved,
} = require('../../utils/recovery-image-binding.cjs');

test('compose bindings cover the three recorded recovery images', () => {
  assert.equal(COMPOSE_BINDINGS.length, 3);
  assert.deepEqual(
    COMPOSE_BINDINGS.map((b) => b.composeRef),
    ['dev-tunnel-proxy-proxy:latest', 'node:18-alpine', 'ngrok/ngrok:latest'],
  );
});

test('OCI index digests alone are not Compose tags', () => {
  const index = {
    manifests: COMPOSE_BINDINGS.map((b) => ({
      digest: b.originalId,
      mediaType: 'application/vnd.oci.image.index.v1+json',
    })),
  };
  const dockerManifest = [
    {Config: 'blobs/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
  ];
  const mapped = mapOriginalIdsToLoadedConfigs(index, dockerManifest);
  assert.equal(mapped.originals.length, 3);
  assert.equal(mapped.loadedConfigs.length, 1);
  const unresolved = resolveTagBindings(
    COMPOSE_BINDINGS,
    new Map(COMPOSE_BINDINGS.map((b) => [b.originalId, []])),
    mapped.loadedConfigs,
  );
  assert.equal(assertAllBindingsResolved(unresolved), false);
});

test('loaded config digests mapped under each original ID unlock tag bindings', () => {
  const originalToConfigs = new Map([
    [COMPOSE_BINDINGS[0].originalId, ['sha256:345bd478a643a0e92e5517744175a8b27ddf04d9d4e09fe2568ae1eca6f3167f']],
    [COMPOSE_BINDINGS[1].originalId, ['sha256:c5914b9dd279c0f596933e65906cb3c6d2da5aae71e863e819e9b963997b1c17']],
    [COMPOSE_BINDINGS[2].originalId, ['sha256:664248f85249475cc20b8ec8fc3d1c2d6d9d852635777d2c32986e3ccc2e1e1c']],
  ]);
  const loaded = [
    'sha256:345bd478a643a0e92e5517744175a8b27ddf04d9d4e09fe2568ae1eca6f3167f',
    'sha256:c5914b9dd279c0f596933e65906cb3c6d2da5aae71e863e819e9b963997b1c17',
    'sha256:664248f85249475cc20b8ec8fc3d1c2d6d9d852635777d2c32986e3ccc2e1e1c',
  ];
  const resolved = resolveTagBindings(COMPOSE_BINDINGS, originalToConfigs, loaded);
  assert.equal(assertAllBindingsResolved(resolved), true);
  assert.equal(resolved[0].composeRef, 'dev-tunnel-proxy-proxy:latest');
  assert.equal(resolved[0].originalId, COMPOSE_BINDINGS[0].originalId);
  assert.equal(resolved[0].loadedId, loaded[0]);
});

test('normalizeDigest accepts blob paths and bare hex', () => {
  assert.equal(
    normalizeDigest('blobs/sha256/345bd478a643a0e92e5517744175a8b27ddf04d9d4e09fe2568ae1eca6f3167f'),
    'sha256:345bd478a643a0e92e5517744175a8b27ddf04d9d4e09fe2568ae1eca6f3167f',
  );
  assert.equal(
    normalizeDigest('345bd478a643a0e92e5517744175a8b27ddf04d9d4e09fe2568ae1eca6f3167f'),
    'sha256:345bd478a643a0e92e5517744175a8b27ddf04d9d4e09fe2568ae1eca6f3167f',
  );
});
