'use strict';
// DEVPROXY P0 RC1. Local read-only attestation for smart-build pre-mutation guard.
// Emits only redacted enum/boolean fields. Never prints mount sources, secrets, or inspect JSON.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { assessReleaseMutationPlan, RELEASE_SHA } = require('./rc1-release-drift-policy.cjs');
const { classifyManagementBindings } = require('./rc1-runtime-ports.cjs');

const RC1_PROXY_IMAGE_PREFIX = '9b2ae98f11d8';
const LIVE_PROJECT = 'dev-tunnel-proxy';

function sh(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: opts.timeout || 8000,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

function containerExists(name) {
  const out = sh('docker', ['inspect', '-f', '{{.Id}}', name]);
  return Boolean(out);
}

function imagePrefix(name) {
  const img = sh('docker', ['inspect', '-f', '{{.Image}}', name]);
  if (!img) return 'unknown';
  return img.replace(/^sha256:/, '').slice(0, 12);
}

function classifyProxyImage(name) {
  const p = imagePrefix(name);
  if (p === 'unknown') return 'unknown';
  return p === RC1_PROXY_IMAGE_PREFIX ? 'accepted_rc1' : 'different';
}

function classifyLiveSource(apiName, proxyName, surface, proxyImage) {
  // Prefer runtime nginx posture + image over host path strings (never logged).
  if (
    proxyImage === 'accepted_rc1' &&
    surface.publicHealth === 'minimal' &&
    surface.anonymousRoutes === 'denied'
  ) {
    return 'accepted_rc1';
  }
  const raw = sh('docker', ['inspect', apiName || proxyName]);
  if (!raw) return 'unknown';
  try {
    const mounts = JSON.parse(raw)[0].Mounts || [];
    const app = mounts.find((m) => m.Destination === '/app' && m.Type === 'bind');
    if (!app) {
      // Proxy-only: inspect nginx config inside container for RC1 markers (no host paths).
      const nginxSnippet = sh('docker', [
        'exec',
        proxyName,
        'sh',
        '-lc',
        'grep -c "auth_request /admin/check" /etc/nginx/conf.d/default.conf 2>/dev/null; grep -c "status.:.ok" /etc/nginx/conf.d/default.conf 2>/dev/null',
      ]);
      if (nginxSnippet) {
        const [authCount, okCount] = nginxSnippet.split(/\s+/).map((x) => Number(x) || 0);
        if (authCount > 0 && okCount > 0 && proxyImage === 'accepted_rc1') return 'accepted_rc1';
      }
      return 'unknown';
    }
    const src = fs.realpathSync(app.Source);
    const healing = path.join(src, 'utils', 'calliopeHealing.js');
    const healingTxt = fs.readFileSync(healing, 'utf8');
    if (healingTxt.includes('CONTAINER_SNAPSHOT_DISABLED')) {
      // 004A tip bind is not the accepted live RC1 overlay for this P0 gate.
      return 'unknown';
    }
    // Owner/master bind with non-RC1 runtime posture.
    if (proxyImage === 'different' || surface.publicHealth === 'full_report' || surface.anonymousRoutes === 'open') {
      return 'owner_checkout';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function classifyDockerSock(name) {
  const raw = sh('docker', ['inspect', name]);
  if (!raw) return 'unknown';
  try {
    const mounts = JSON.parse(raw)[0].Mounts || [];
    const sock = mounts.find((m) => m.Destination === '/var/run/docker.sock');
    if (!sock) return 'absent';
    return sock.RW ? 'rw' : 'ro';
  } catch {
    return 'unknown';
  }
}

function classifyManagementPorts(name) {
  const raw = sh('docker', ['inspect', name]);
  if (!raw) return 'unknown';
  try {
    const ports = JSON.parse(raw)[0].NetworkSettings?.Ports;
    return classifyManagementBindings(ports);
  } catch {
    return 'unknown';
  }
}

function httpProbe(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: 4000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode || 0, body, location: res.headers.location || '' });
        });
      }
    );
    req.on('error', () => resolve({ status: 0, body: '', location: '' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: '', location: '' });
    });
    req.end();
  });
}

async function classifyPublicSurface() {
  // Prefer published proxy port 8080 (RC1/dev mapping). Fall back unknown.
  const health = await httpProbe(8080, '/health.json');
  const routes = await httpProbe(8080, '/routes.json');
  let publicHealth = 'unknown';
  if (health.status === 200) {
    try {
      const j = JSON.parse(health.body);
      const keys = Object.keys(j || {});
      if (keys.length === 1 && j.status === 'ok') publicHealth = 'minimal';
      else if (keys.includes('results') || keys.includes('ngrok')) publicHealth = 'full_report';
      else publicHealth = keys.includes('status') && keys.length <= 2 ? 'minimal' : 'full_report';
    } catch {
      publicHealth = 'unknown';
    }
  } else if (health.status === 503) {
    publicHealth = 'minimal'; // fail-closed missing report still RC1-shaped
  }
  let anonymousRoutes = 'unknown';
  if (routes.status === 200 && routes.body.trim().startsWith('{')) anonymousRoutes = 'open';
  else if (routes.status === 302 || routes.status === 401 || (routes.status === 302)) anonymousRoutes = 'denied';
  else if (routes.status === 302 || /login/i.test(routes.location)) anonymousRoutes = 'denied';
  else if ([301, 302, 303, 307, 308].includes(routes.status)) anonymousRoutes = 'denied';
  else if (routes.status === 401 || routes.status === 403) anonymousRoutes = 'denied';
  return { publicHealth, anonymousRoutes };
}

function privateContinuityFlags() {
  // Presence-only; do not read archive/session contents.
  const root = process.env.DEVPROXY_OWNER_ROOT || '';
  // Without an explicit root we cannot claim preservation from disk; use container mounts.
  const raw = sh('docker', ['inspect', 'dev-proxy']);
  if (!raw) return { privateConfigPreserved: false, routeFingerprintPreserved: false };
  try {
    const mounts = JSON.parse(raw)[0].Mounts || [];
    const hasSites = mounts.some((m) => String(m.Destination).includes('sites-enabled'));
    const hasArtifacts = mounts.some((m) => String(m.Destination).includes('.artifacts'));
    return {
      privateConfigPreserved: hasSites,
      routeFingerprintPreserved: hasSites && hasArtifacts,
    };
  } catch {
    return { privateConfigPreserved: false, routeFingerprintPreserved: false };
  }
}

function isDisposableStack(env = process.env) {
  if (env.DEVPROXY_DISPOSABLE_STACK !== '1') return false;
  const proj = env.COMPOSE_PROJECT_NAME || '';
  if (!proj || proj === LIVE_PROJECT) return false;
  return /^(rc1|devproxy-test|tmp|disposable|rc1mc|rc1op)/i.test(proj);
}

function defaultCandidate(rootDir, env = process.env) {
  let sourceSha = sh('git', ['-C', rootDir, 'rev-parse', 'HEAD']);
  if (!sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha)) sourceSha = '0'.repeat(40);
  // Ordinary smart-build from a checkout is not an RC1 private overlay plan.
  const isReleaseSha = sourceSha === RELEASE_SHA;
  return {
    sourceSha,
    exactPrivateMounts: false,
    sharedConfigDigest: false,
    trustedOriginsPreserved: Boolean(env.DEVPROXY_TRUSTED_ORIGINS),
    rollbackReady: false,
    verifiedDisposable: isDisposableStack(env),
  };
}

async function attestLive() {
  const proxyUp = containerExists('dev-proxy');
  const apiUp = containerExists('dev-proxy-config-api');
  if (!proxyUp && !apiUp) {
    return {
      attested: false,
      liveSource: 'unknown',
      proxyImage: 'unknown',
      publicHealth: 'unknown',
      anonymousRoutes: 'unknown',
      managementPorts: 'unknown',
      apiDockerSocket: 'unknown',
      privateConfigPreserved: false,
      routeFingerprintPreserved: false,
    };
  }
  const surface = await classifyPublicSurface();
  const continuity = privateContinuityFlags();
  const proxyImage = proxyUp ? classifyProxyImage('dev-proxy') : 'unknown';
  return {
    attested: true,
    liveSource: classifyLiveSource(
      apiUp ? 'dev-proxy-config-api' : null,
      proxyUp ? 'dev-proxy' : 'dev-proxy',
      surface,
      proxyImage
    ),
    proxyImage,
    publicHealth: surface.publicHealth,
    anonymousRoutes: surface.anonymousRoutes,
    managementPorts: apiUp ? classifyManagementPorts('dev-proxy-config-api') : 'unknown',
    apiDockerSocket: apiUp ? classifyDockerSock('dev-proxy-config-api') : 'unknown',
    privateConfigPreserved: continuity.privateConfigPreserved,
    routeFingerprintPreserved: continuity.routeFingerprintPreserved,
  };
}

async function runPremutationGuard(action, opts = {}) {
  const env = opts.env || process.env;
  const rootDir = opts.rootDir || process.cwd();

  // P0 corrective: NEVER authorize from DEVPROXY_DISPOSABLE_STACK / COMPOSE_* /
  // DOCKER_HOST / absence of named containers. Those env flags are untrusted.
  // Isolated disposable Docker must use purpose-built fixture Compose only,
  // outside these smart-build mutating entrypoints.
  void isDisposableStack(env);
  void opts.liveContainersPresent;

  const live = opts.live || (await attestLive());
  const candidate = opts.candidate || defaultCandidate(rootDir, env);
  const result = assessReleaseMutationPlan({ action, live, candidate });

  // Policy never authorizes production mutation.
  if (result.code === 'PLAN_COMPATIBLE_OWNER_GATE') {
    return {
      code: 'OWNER_GATE_REQUIRED',
      mutationAllowed: false,
      productionChangeAuthorized: false,
      policyCode: result.code,
    };
  }
  return {
    code: result.code,
    mutationAllowed: false,
    productionChangeAuthorized: false,
    policyCode: result.code,
  };
}

module.exports = {
  RELEASE_SHA,
  RC1_PROXY_IMAGE_PREFIX,
  isDisposableStack,
  defaultCandidate,
  attestLive,
  runPremutationGuard,
  // test seams
  _test: { classifyProxyImage, classifyDockerSock, classifyManagementPorts, classifyLiveSource },
};
