/**
 * Portable app-owned authorization policy.
 * Ported from Tiger Slam PR #581 into the shared Dev Tunnel Proxy package.
 * No web listener, grant issuer, token reader, app runner, or persistence.
 *
 * This policy MUST receive a trusted server-verified principal and an
 * app-domain grant loaded from server-owned state, never from MCP arguments.
 */
import { createHash } from 'node:crypto';
import { validateAppCommandArguments } from './gateway.mjs';

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
const kinds = new Set(['read', 'proposal', 'reversible_write', 'privileged']);
const environments = new Set(['development', 'staging', 'production']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const deny = reason => Object.freeze({allowed:false,reason});
const strictObject = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
 (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function requestValid(req) {
  if (!strictObject(req)) return false;
  if (!Object.keys(req).every(k => ['name','arguments','requestId','expectedVersion','idempotencyKey'].includes(k))) return false;
  if (typeof req.name !== 'string' || !req.name || req.name.length > 128 ||
      !strictObject(req.arguments) || typeof req.requestId !== 'string' || !uuid.test(req.requestId)) return false;
  if (req.expectedVersion !== undefined &&
      (!Number.isSafeInteger(req.expectedVersion) || req.expectedVersion < 0)) return false;
  if (req.idempotencyKey !== undefined &&
      (typeof req.idempotencyKey !== 'string' || !uuid.test(req.idempotencyKey))) return false;
  return true;
}
export function fingerprintAppCommand(req) {
  return createHash('sha256').update(canonical({
    name:req.name,arguments:req.arguments,requestId:req.requestId,
    expectedVersion:req.expectedVersion,idempotencyKey:req.idempotencyKey,
  })).digest('hex');
}

/**
 * Command definitions are a trusted local registry:
 * {name,appId,kind,scope,roles,environments,argumentSchema}
 *
 * Context identity, environment, token audience and grant MUST be verified by
 * app's actual OAuth/session and policy store before calling this function.
 */
export function authorizeAppCommand(req, registry, context, nowMs=Date.now()) {
  if (!requestValid(req) || !Array.isArray(registry) || !strictObject(context)) return deny('invalid_request');
  const matches=registry.filter(d => d && d.name === req.name);
  if (matches.length !== 1) return deny('unknown_command');
  const cmd=matches[0];
  if (!kinds.has(cmd.kind) || !environments.has(context.environment)) return deny('invalid_registration');
  if (!context.actor || context.actor.tokenAudience !== context.resource ||
      typeof context.resource !== 'string' || !context.resource) return deny('wrong_resource');
  if (cmd.appId !== context.appId) return deny('wrong_app');
  if (!Array.isArray(cmd.environments) || !cmd.environments.includes(context.environment)) return deny('wrong_environment');
  if (!Array.isArray(cmd.roles) || !cmd.roles.includes(context.actor.role)) return deny('forbidden_role');
  if (!Array.isArray(context.actor.scopes) || !context.actor.scopes.includes(cmd.scope)) return deny('missing_scope');
  if (!validateAppCommandArguments(req.arguments,cmd.argumentSchema)) return deny('invalid_arguments');
  if (cmd.kind !== 'read') {
    if (req.expectedVersion === undefined) return deny('missing_version');
    if (!req.idempotencyKey) return deny('missing_idempotency');
    const grant=context.grant;
    if (!grant || grant.verifiedByServer !== true) return deny('missing_grant');
    if (grant.actorId !== context.actor.id || grant.appId !== context.appId ||
        grant.environment !== context.environment || grant.commandName !== cmd.name ||
        grant.intentHash !== fingerprintAppCommand(req)) return deny('wrong_grant');
    if (!Number.isFinite(grant.expiresAtMs) || grant.expiresAtMs <= nowMs) return deny('expired_grant');
    if (cmd.kind === 'privileged' && grant.ownerApproval !== true) return deny('owner_approval_required');
  }
  return Object.freeze({allowed:true,kind:cmd.kind,command:cmd,arguments:req.arguments,request:req});
}
