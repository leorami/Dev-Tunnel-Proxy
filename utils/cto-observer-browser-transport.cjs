'use strict';
/**
 * Truth-gate classifier for mandatory CTO visual evidence transport.
 * Source alone cannot claim connected browser access.
 */
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * @param {object} input
 * @param {boolean} input.chatgptWorkCloudBrowserCallable
 * @param {boolean} input.devProxyObserverPluginCallable
 * @param {boolean} input.canRetrieveOriginalPngBytes
 * @param {boolean} input.deliversInlineToOwnerChatgpt
 * @param {boolean} [input.cursorIdeBrowserPresent] - not a substitute for CTO ChatGPT transport
 */
function classifyCtoBrowserTransport(input) {
  if (!plain(input)) {
    return Object.freeze({
      code: 'BLOCKED_CTO_BROWSER_TRANSPORT',
      uiApproval: 'UI_APPROVAL_WITHHELD',
      reason: 'invalid_input',
    });
  }
  const trustedCallable = input.chatgptWorkCloudBrowserCallable === true
    || input.devProxyObserverPluginCallable === true;
  if (!trustedCallable) {
    return Object.freeze({
      code: 'BLOCKED_CTO_BROWSER_TRANSPORT',
      uiApproval: 'UI_APPROVAL_WITHHELD',
      reason: 'no_trusted_cto_browser_or_plugin',
      cursorIdeBrowserPresent: input.cursorIdeBrowserPresent === true,
    });
  }
  if (input.canRetrieveOriginalPngBytes !== true) {
    return Object.freeze({
      code: 'BLOCKED_VISUAL_EVIDENCE_TRANSPORT',
      uiApproval: 'UI_APPROVAL_WITHHELD',
      reason: 'png_bytes_unavailable',
    });
  }
  if (input.deliversInlineToOwnerChatgpt !== true) {
    return Object.freeze({
      code: 'BLOCKED_VISUAL_EVIDENCE_TRANSPORT',
      uiApproval: 'UI_APPROVAL_WITHHELD',
      reason: 'inline_owner_chatgpt_delivery_unavailable',
    });
  }
  return Object.freeze({
    code: 'CTO_BROWSER_TRANSPORT_READY',
    uiApproval: 'PENDING_OWNER_UAT',
    reason: 'trusted_transport_demonstrated',
  });
}

module.exports = Object.freeze({ classifyCtoBrowserTransport });
