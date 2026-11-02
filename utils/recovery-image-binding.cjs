'use strict';
/**
 * Pure helpers for private image-archive tag recovery evidence.
 * No Docker, network, or filesystem side effects.
 */
const COMPOSE_BINDINGS = Object.freeze([
  Object.freeze({
    container: 'dev-proxy',
    composeRef: 'dev-tunnel-proxy-proxy:latest',
    originalId: 'sha256:bfc92bd8e3083962adfa084916481128a25d7bf7a0fb62325aa25f60fac41634',
  }),
  Object.freeze({
    container: 'dev-proxy-config-api',
    composeRef: 'node:18-alpine',
    originalId: 'sha256:8d6421d663b4c28fd3ebc498332f249011d118945588d0a35cb9bc4b8ca09d9e',
  }),
  Object.freeze({
    container: 'dev-ngrok',
    composeRef: 'ngrok/ngrok:latest',
    originalId: 'sha256:141f5645c298975b82e641dc62742bef49a8772dcdb6a90f1195f9afb6bf2bfa',
  }),
]);

function normalizeDigest(value) {
  if (typeof value !== 'string' || !value) return '';
  if (value.startsWith('sha256:')) return value;
  if (/^[0-9a-f]{64}$/i.test(value)) return `sha256:${value}`;
  if (value.includes('/')) {
    const leaf = value.split('/').pop();
    if (leaf && /^[0-9a-f]{64}$/i.test(leaf)) return `sha256:${leaf}`;
    if (leaf && leaf.startsWith('sha256:')) return leaf;
  }
  return value;
}

/**
 * Build original index digest -> loaded config digest candidates from OCI
 * index.json plus docker-style manifest.json Config paths.
 */
function mapOriginalIdsToLoadedConfigs(indexJson, dockerManifestJson) {
  const index = typeof indexJson === 'string' ? JSON.parse(indexJson) : indexJson;
  const dockerManifest = typeof dockerManifestJson === 'string'
    ? JSON.parse(dockerManifestJson)
    : dockerManifestJson;
  const loaded = new Set(
    (Array.isArray(dockerManifest) ? dockerManifest : [])
      .map((entry) => normalizeDigest(entry && entry.Config))
      .filter(Boolean),
  );
  const originals = (index && Array.isArray(index.manifests) ? index.manifests : [])
    .map((entry) => normalizeDigest(entry && entry.digest))
    .filter(Boolean);
  return {originals, loadedConfigs: [...loaded]};
}

/**
 * Given a resolver originalId -> iterable of config digests found under that
 * index entry, pick the loaded config that belongs to each Compose binding.
 */
function resolveTagBindings(bindings, originalToConfigs, loadedIds) {
  const loaded = new Set((loadedIds || []).map(normalizeDigest));
  const result = [];
  for (const binding of bindings) {
    const configs = [...(originalToConfigs.get(binding.originalId) || [])]
      .map(normalizeDigest);
    const match = configs.find((id) => loaded.has(id));
    result.push({
      composeRef: binding.composeRef,
      originalId: binding.originalId,
      loadedId: match || null,
      ok: Boolean(match),
    });
  }
  return result;
}

function assertAllBindingsResolved(resolved) {
  return Array.isArray(resolved)
    && resolved.length > 0
    && resolved.every((row) => row && row.ok && row.loadedId && row.composeRef && row.originalId);
}

module.exports = {
  COMPOSE_BINDINGS,
  normalizeDigest,
  mapOriginalIdsToLoadedConfigs,
  resolveTagBindings,
  assertAllBindingsResolved,
};
