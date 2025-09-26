(function(){
  function initTheme(){
    try{
      const stored = localStorage.getItem('dtpTheme');
      const theme = stored || 'dark';
      document.documentElement.setAttribute('data-theme', theme==='light'?'light':'dark');
      const t = document.getElementById('themeToggle');
      if (t){ t.textContent = theme==='light' ? '🌙' : '☀️'; }
    }catch{}
  }
  function toggleTheme(){
    const cur = document.documentElement.getAttribute('data-theme')==='light'?'light':'dark';
    const next = cur==='light'?'dark':'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dtpTheme', next);
    const t = document.getElementById('themeToggle');
    if (t){ t.textContent = next==='light' ? '🌙' : '☀️'; }
  }
  function buildHeader(active){
    const header = document.createElement('header');
    header.innerHTML = (
      '<div class="header-row">'+
      '  <h1>'+
      '    <img src="/status/assets/logo.svg" alt="Dev Tunnel Proxy logo" style="height:40px;vertical-align:middle;margin-right:10px"/>'+
      '    <span class="brand">Dev Tunnel Proxy</span>'+
      '  </h1>'+
      '  <div class="header-actions">'+
      `    <a class="tab btn ${active==='status'?'active':''}" href="/status">Status</a>`+
      `    <a class="tab btn ${active==='health'?'active':''}" href="/health">Health</a>`+
      `    <a class="tab btn ${active==='reports'?'active':''}" href="/reports">Reports</a>`+
      `    <a class="tab btn ${active==='dashboard'?'active':''}" href="/dashboard/">Dashboard</a>`+
      '    <span class="divider" aria-hidden="true"></span>'+
      '    <button class="action btn" id="reloadConfigs" title="Reload configurations">🔄</button>'+
      '    <button class="action btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme">🌙</button>'+
      '    <button class="action btn" id="calliopeOpen" title="Open Calliope" aria-label="Open Calliope"><img src="/status/assets/calliope_heart_stethoscope.svg" alt="Calliope" style="width:16px;height:16px;vertical-align:middle;"></button>'+
      '  </div>'+
      '</div>'
    );
    return header;
  }
  function attachHeader(active){
    if (!document.querySelector('link[href$="/status/common.css"]')){
      const l = document.createElement('link'); l.rel='stylesheet'; l.href='/status/common.css'; document.head.appendChild(l);
    }
    const h = buildHeader(active);
    const first = document.body.firstElementChild;
    if (first && first.tagName.toLowerCase()==='header'){ first.replaceWith(h); } else { document.body.prepend(h); }
    // annotate page for CSS tweaks
    try{ document.body.setAttribute('data-page', String(active||'')); }catch{}
    const themeBtn = h.querySelector('#themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const calliopeBtn = h.querySelector('#calliopeOpen');
    if (calliopeBtn) calliopeBtn.addEventListener('click', ()=> openCalliopeWithContext());
    initTheme();
  }

  function attachCalliope(){
    if (document.getElementById('aiDrawer')) return; // avoid duplicating drawer
    const drawer = document.createElement('div');
    drawer.id='aiDrawer'; drawer.className='ai-drawer collapsed';
    drawer.innerHTML = (
      '<button class="ai-tab" id="aiTab" title="Calliope">'+
      '  <div class="icon-steth" aria-hidden="true"><img src="/status/assets/calliope_heart_stethoscope.svg" alt="Calliope" style="width:16px;height:16px;"></div>'+
      '  <div class="label">Calliope</div>'+
      '</button>'+
      '<div class="ai-header">'+
      '  <h2><span class="icon-steth-header" aria-hidden="true"><img src="/status/assets/calliope_heart_stethoscope.svg" alt="Calliope" style="width:20px;height:20px;vertical-align:middle;margin-right:8px;"></span>Calliope</h2>'+
      '  <div class="ai-meta">'+
      '    <span class="ai-healing-history" id="aiHealingHistory"><span class="ai-healing-history-label">🧪 Healing History</span></span>'+
      '    <span class="ai-healing-status" id="aiHealingStatus"><span class="pulse"></span><span class="ai-healing-status-label" id="aiHealingStatusLabel">🩺 Healing</span><span class="ai-healing-count" style="display:none" id="aiHealingCount"></span></span>'+
      '  </div>'+
      '</div>'+
      '<div class="ai-content">'+
      '  <div id="aiChat" class="ai-chat"></div>'+
      '  <div class="ai-hint" id="aiHint"></div>'+
      '  <div class="ai-input">'+
      '    <textarea id="aiQuery" rows="3" placeholder="Ask about proxy/network issues"></textarea>'+
      '    <div class="ai-actions">'+
      '      <button class="btn" id="aiCopyBtn" title="Copy conversation to clipboard">Copy</button>'+
      '      <button class="btn" id="aiClearBtn" title="Clear conversation">Clear</button>'+
      '      <button class="btn" id="aiAskBtn">Ask</button>'+
      '      <button class="btn" id="aiHealBtn" data-role="selfcheck" title="Self‑Check" aria-label="Self‑Check">Self‑Check</button>'+
      '    </div>'+
      '  </div>'+
      '</div>'
    );
    document.body.appendChild(drawer);
    // legacy tab is suppressed; rely on header button
    // Chat persistence helpers
    const LS_KEY = 'dtpCalliopeChat';
    const safe = (s)=> String(s||'').replace(/[<>&]/g, m=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]));
    function loadChat(){ try{ const j = JSON.parse(localStorage.getItem(LS_KEY)||'[]'); return Array.isArray(j)? j : []; }catch{ return []; } }
    function saveChat(arr){ try{ localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(-200))); }catch{} }
    function renderChat(){
      const c = loadChat();
      const chat = document.getElementById('aiChat');
      chat.innerHTML = c.map(m=>{
        const who = m.role==='user' ? '👤 You' : '🩺 Calliope';
        return `<div class="bubble ${m.role}"><div class="bubble-title">${who}</div><div class="bubble-content">${safe(m.content)}</div></div>`;
      }).join('');
      chat.scrollTop = chat.scrollHeight;
    }
    // Ensure friendly greeting exists once per session
    (function ensureGreeting(){
      const h = loadChat();
      const hasGreeting = h.some(m => m.role==='assistant');
      if (!hasGreeting){
        h.push({ role:'assistant', content: 'Heya! I\'m Calliope. How can I help your dev proxy today?', ts: Date.now() });
        saveChat(h);
      }
    })();
    renderChat();
    const ask = drawer.querySelector('#aiAskBtn');
    async function submitQuery(){
      const textarea = document.getElementById('aiQuery');
      const q = (textarea && textarea.value || '').trim();
      if (!q) return;
      const hist = loadChat(); hist.push({ role:'user', content:q, ts:Date.now() }); saveChat(hist); renderChat();
      try{
        const r = await fetch('/api/ai/ask', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ query: q }) });
        const j = await r.json();
        const ans = j && (j.answer || j.message || '');
        const hist2 = loadChat(); hist2.push({ role:'assistant', content: String(ans||'(no answer)'), ts:Date.now() }); saveChat(hist2); renderChat();
      }catch(e){ const h = loadChat(); h.push({ role:'assistant', content: `Error: ${e.message}`, ts:Date.now() }); saveChat(h); renderChat(); }
      if (textarea) textarea.value='';
    }
    ask.addEventListener('click', submitQuery);
    const textareaEvt = drawer.querySelector('#aiQuery');
    if (textareaEvt){ textareaEvt.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter' && !ev.shiftKey){ ev.preventDefault(); submitQuery(); } }); }
    const clearBtn = drawer.querySelector('#aiClearBtn');
    clearBtn.addEventListener('click', ()=>{ if (confirm('Clear Calliope chat history?')){ try{ localStorage.removeItem(LS_KEY); }catch{} renderChat(); } });
    const copyBtn = drawer.querySelector('#aiCopyBtn');
    if (copyBtn){ copyBtn.addEventListener('click', ()=>{ try{ const c = JSON.parse(localStorage.getItem(LS_KEY)||'[]'); navigator.clipboard.writeText(c.map(m=>`[${m.role}] ${m.content}`).join('\n')); copyBtn.textContent='Copied'; setTimeout(()=> copyBtn.textContent='Copy', 1200); }catch{} }); }
    const healBtn = drawer.querySelector('#aiHealBtn');
    if (healBtn){ healBtn.addEventListener('click', async ()=>{ const h = loadChat(); h.push({ role:'assistant', content:'Running self-check…', ts:Date.now() }); saveChat(h); renderChat(); try{ const r = await fetch('/api/ai/self-check', { method:'POST' }); const j = await r.json(); const h2 = loadChat(); h2.push({ role:'assistant', content: String(j&&j.message||'Self-check complete'), ts:Date.now() }); saveChat(h2); renderChat(); }catch(e){ const h3 = loadChat(); h3.push({ role:'assistant', content:`Self-check error: ${e.message}`, ts:Date.now() }); saveChat(h3); renderChat(); } }); }
    // Placeholder UX: show placeholder only; never prefill user box
    try{
      const textarea = document.getElementById('aiQuery');
      const defaultPH = 'Ask about proxy/network issues';
      if (textarea){
        textarea.placeholder = defaultPH;
        textarea.addEventListener('focus', ()=>{ /* keep placeholder visible? prefer empty */ textarea.placeholder=''; });
        textarea.addEventListener('blur', ()=>{ if (!textarea.value.trim()) textarea.placeholder = defaultPH; });
      }
    }catch{}
  }

  function openCalliopeWithContext(){
    try{
      attachCalliope();
      const drawer = document.getElementById('aiDrawer');
      if (!drawer) return;
      const isCollapsed = drawer.classList.contains('collapsed');
      if (isCollapsed){
        drawer.classList.remove('collapsed');
        document.body.classList.add('ai-open');
        const path = location.pathname;
        const context = path.startsWith('/reports') ? 'Analyze report retention and conflicts.' : path.startsWith('/health') ? 'Summarize current health and conflicts.' : path.startsWith('/dashboard') ? 'Assist with audits from dashboard.' : 'Help with route issues.';
        const hint = document.getElementById('aiHint');
        if (hint) { hint.textContent = `You are Calliope. Context page: ${path}. ${context}`; }
      } else {
        drawer.classList.add('collapsed');
        document.body.classList.remove('ai-open');
      }
      const btn = document.getElementById('calliopeOpen'); if (btn) btn.classList.toggle('active', isCollapsed);
    }catch{}
  }

  window.DTP = window.DTP || {};
  window.DTP.attachHeader = attachHeader;
  window.DTP.attachCalliope = attachCalliope;
  window.DTP.initTheme = initTheme;
  window.DTP.openCalliopeWithContext = openCalliopeWithContext;
})();


