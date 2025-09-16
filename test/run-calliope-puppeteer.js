#!/usr/bin/env node
/* e2e status + Calliope runner (Puppeteer)
 * - Opens /status
 * - Opens Calliope drawer
 * - Sends an ask to audit+heal the SDK route
 * - Monitors status chip text and chat bubbles
 * - Captures screenshots on state changes
 */
const fs = require('fs');
const path = require('path');

async function ensureOutDir(){
  const root = path.join(__dirname, '..');
  const out = path.join(root, '.artifacts', 'puppeteer', new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(out, { recursive: true });
  return out;
}

async function discoverBase(){
  const guess = process.env.BASE_URL || 'http://localhost:8080';
  // Quick check if localhost serves status
  try{
    const r = await fetch(guess + '/status', { method: 'HEAD' });
    if (r.ok) return guess;
  }catch{}
  // Try reading health-latest.json for ngrok
  try{
    const p = path.join(__dirname, '..', '.artifacts', 'reports', 'health-latest.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j && j.ngrok) return j.ngrok.replace(/\/$/, '');
  }catch{}
  return guess;
}

function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

(async()=>{
  const outDir = await ensureOutDir();
  const base = (await discoverBase()).replace(/\/$/, '');
  console.log('Base:', base);
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1360, height: 900 } });
  const page = await browser.newPage();

  const log = [];
  const logEvent = async (name, data) => {
    const entry = { ts: new Date().toISOString(), name, data };
    log.push(entry);
    console.log(name, data||'');
    fs.writeFileSync(path.join(outDir, 'log.json'), JSON.stringify(log, null, 2));
  };

  try{
    await page.goto(base + '/status', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#aiTab', { timeout: 20000 });
    // Toggle the drawer open: click until body has ai-open
    await page.click('#aiTab');
    await page.waitForFunction(()=>document.body.classList.contains('ai-open'), { timeout: 20000 });
    await page.screenshot({ path: path.join(outDir, '01_open.png') });
    await logEvent('opened_drawer');

    // Inject a helper to read chip text and assistant bubble count
    const readUi = async ()=>{
      return await page.evaluate(()=>{
        const label = document.getElementById('aiHealingStatusLabel');
        const txt = label ? (label.textContent||'').trim() : '';
        const bubbles = Array.from(document.querySelectorAll('.ai-chat .bubble.assistant')).length;
        return { status: txt, bubbles };
      });
    };

    let { status: prevStatus, bubbles: prevBubbles } = await readUi();
    await logEvent('initial_ui', { prevStatus, prevBubbles });

    // First, inject synthetic thoughts to validate UI pipeline
    const injectRes = await page.evaluate(async ()=>{
      const r = await fetch('/api/ai/thoughts/inject', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ messages: ['Auditing pass 1…','Applying subpath healing…','Reloading nginx…','Audit+heal loop complete ✅'] }) });
      try{ return await r.json(); }catch{return { ok:false }}
    });
    await logEvent('injected_synthetic_thoughts', injectRes);
    const peek1 = await page.evaluate(async ()=>{ try{ const r=await fetch('/api/ai/thoughts/peek'); return await r.json(); }catch(e){return {ok:false,error:String(e)}}});
    await logEvent('peek_after_inject', peek1);
    // Pull once to simulate UI poller
    const drain1 = await page.evaluate(async ()=>{ try{ const r=await fetch('/api/ai/thoughts'); return await r.json(); }catch(e){return {ok:false,error:String(e)}}});
    await logEvent('drain_once', { count: (drain1&&drain1.events)?drain1.events.length:0 });
    await delay(1500);
    let ui1 = await readUi();
    await logEvent('post_inject_ui', ui1);

    // Then, send ask to audit+heal SDK via fetch in the page context
    const query = 'Please audit and heal route /sdk until green.';
    await page.evaluate(async (q)=>{
      await fetch('/api/ai/ask', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query: q }) });
    }, query);
    await logEvent('sent_ask', { query });

    // Monitor up to 120s, screenshot on status change or +assistant bubbles
    const start = Date.now();
    let shotIdx = 2;
    while (Date.now() - start < 120000) {
      await delay(1500);
      const ui = await readUi();
      if (ui.status !== prevStatus || ui.bubbles > prevBubbles) {
        await logEvent('ui_change', ui);
        await page.screenshot({ path: path.join(outDir, String(shotIdx).padStart(2,'0') + '_change.png') });
        shotIdx++;
        prevStatus = ui.status; prevBubbles = ui.bubbles;
      }
      // Exit early if happy and at least 3 assistant messages
      if ((/Happy/i.test(ui.status) || /complete/i.test(ui.status)) && ui.bubbles >= 3) break;
    }

    await logEvent('done', await readUi());
    await page.screenshot({ path: path.join(outDir, 'final.png') });
  } catch (e) {
    console.error('Runner error:', e);
    try { await page.screenshot({ path: path.join(outDir, 'error.png') }); } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();


