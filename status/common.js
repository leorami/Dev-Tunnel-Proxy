(function(){
  function initTheme(){
    try{
      const stored = localStorage.getItem('dtpTheme');
      const theme = stored || 'dark';
      document.documentElement.setAttribute('data-theme', theme==='light'?'light':'dark');
      const t = document.getElementById('themeToggle');
      if (t){
        t.innerHTML = theme === 'light' ? '<i data-lucide="moon" stroke-width="2.5" style="width:18px;height:18px"></i>' : '<i data-lucide="sun" stroke-width="2.5" style="width:18px;height:18px"></i>';
        if (window.lucide) lucide.createIcons();
      }
    }catch{}
  }
  function toggleTheme(){
    const cur = document.documentElement.getAttribute('data-theme')==='light'?'light':'dark';
    const next = cur==='light'?'dark':'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dtpTheme', next);
    const t = document.getElementById('themeToggle') || document.getElementById('themeToggleFallback');
    if (t){
      t.innerHTML = next === 'light' ? '<i data-lucide="moon" stroke-width="2.5" style="width:18px;height:18px"></i>' : '<i data-lucide="sun" stroke-width="2.5" style="width:18px;height:18px"></i>';
      if (window.lucide) lucide.createIcons();
    }
  }
  function initView(){
    try{
      const stored = localStorage.getItem('dtpView');
      const view = stored || 'comfortable';
      document.body.setAttribute('data-view', view);
      const v = document.getElementById('viewToggle');
      if (v){
        v.innerHTML = view === 'compact' ? '<i data-lucide="layout-grid" stroke-width="2.5" style="width:18px;height:18px"></i>' : '<i data-lucide="layout-list" stroke-width="2.5" style="width:18px;height:18px"></i>';
        v.title = view==='compact' ? 'Switch to Comfortable View' : 'Switch to Compact View';
        if (window.lucide) lucide.createIcons();
      }
    }catch{}
  }
  function toggleView(){
    const cur = document.body.getAttribute('data-view')==='compact'?'compact':'comfortable';
    const next = cur==='compact'?'comfortable':'compact';
    document.body.setAttribute('data-view', next);
    localStorage.setItem('dtpView', next);
    const v = document.getElementById('viewToggle');
    if (v){
      v.innerHTML = next === 'compact' ? '<i data-lucide="layout-grid" stroke-width="2.5" style="width:18px;height:18px"></i>' : '<i data-lucide="layout-list" stroke-width="2.5" style="width:18px;height:18px"></i>';
      v.title = next==='compact' ? 'Switch to Comfortable View' : 'Switch to Compact View';
      if (window.lucide) lucide.createIcons();
    }
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
      '    <a class="tab btn" href="/dashboard/#create-route">Create Route</a>'+
      '    <span class="divider" aria-hidden="true"></span>'+
      '    <button class="action btn" id="reloadConfigs" title="Reload configurations"><i data-lucide="refresh-cw" stroke-width="2.5" style="width:18px;height:18px"></i></button>'+
      '    <button class="action btn" id="viewToggle" title="Toggle view density" aria-label="Toggle view density"><i data-lucide="layout-list" stroke-width="2.5" style="width:18px;height:18px"></i></button>'+
      '    <button class="action btn" id="themeToggle" title="Toggle theme" aria-label="Toggle theme"><i data-lucide="moon" stroke-width="2.5" style="width:18px;height:18px"></i></button>'+
      '    <button class="action btn" id="calliopeOpen" title="Toggle Calliope" aria-label="Toggle Calliope" aria-pressed="false"><img src="/status/assets/calliope_heart_stethoscope.svg" alt="Calliope" style="width:16px;height:16px;vertical-align:middle;"></button>'+
      '    <span id="aiTab" class="tag" style="display:none;cursor:pointer" title="Open Calliope">Calliope</span>'+
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
    // If page provided a hidden header placeholder, replace it; otherwise prepend
    const pageHeader = document.querySelector('body > header');
    if (pageHeader){ pageHeader.replaceWith(h); } else if (first && first.tagName.toLowerCase()==='header'){ first.replaceWith(h); } else { document.body.prepend(h); }
    // annotate page for CSS tweaks
    try{ document.body.setAttribute('data-page', String(active||'')); }catch{}
    const themeBtn = h.querySelector('#themeToggle') || h.querySelector('#themeToggleFallback');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const viewBtn = h.querySelector('#viewToggle');
    if (viewBtn) viewBtn.addEventListener('click', toggleView);
    // Always wire Calliope header controls
    const calliopeBtn = h.querySelector('#calliopeOpen');
    if (calliopeBtn){ calliopeBtn.addEventListener('click', ()=> openCalliopeWithContext()); }
    // No Self‑Check button in header to keep headers consistent across pages
    const aiTab = h.querySelector('#aiTab');
    if (aiTab){ aiTab.addEventListener('click', ()=>{ try{ openCalliopeWithContext(); }catch{} }); }
    initTheme();
    initView();
  }

  function attachCalliope(){
    if (document.getElementById('aiDrawer')) return; // avoid duplicating drawer
    const drawer = document.createElement('div');
    drawer.id='aiDrawer'; drawer.className='ai-drawer collapsed';
    drawer.innerHTML = (
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
      '      <button class="btn" id="aiStopBtn" style="display:none" title="Stop current operation">⏹ Stop</button>'+
      '      <button class="btn" id="aiCopyBtn" title="Copy conversation to clipboard">Copy</button>'+
      '      <button class="btn" id="aiClearBtn" title="Clear conversation">Clear</button>'+
      '      <button class="btn" id="aiAskBtn">Ask</button>'+
      '      <button class="btn" id="aiHealBtn" data-role="selfcheck" title="Self‑Check" aria-label="Self‑Check">Self‑Check</button>'+
      '      <button class="btn" id="aiRedirectHealBtn" data-role="reviewed-redirect-heal" title="Apply owner-reviewed Next.js /_next/ redirect fix" aria-label="Apply reviewed redirect heal">Fix /_next/ loop</button>'+
      '    </div>'+
      '  </div>'+
      '</div>'
    );
    document.body.appendChild(drawer);
    // legacy tab is suppressed; rely on header button
    // Chat persistence helpers
    const LS_KEY = 'dtpCalliopeChat';
    // Independent shared-page controller: one pending Ask, one view epoch.
    let sharedViewEpoch = 0;
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
    // Render existing local history without generating an unsolicited assistant message.
    renderChat();
    
    // Progress polling for background operations
    let progressPoller = null;
    let lastSeenThoughtId = null;
    
    function startProgressPolling(){
      if (progressPoller) return; // Already polling
      progressPoller = setInterval(async () => {
        try {
          const r = await fetch('/devproxy/api/ai/thoughts', { cache: 'no-cache' });
          if (!r.ok) return;
          const data = await r.json();
          const events = (data && data.events) || [];
          
          // Process new events
          for (const ev of events) {
            const evId = ev.id || ev.ts;
            if (lastSeenThoughtId && evId <= lastSeenThoughtId) continue;
            lastSeenThoughtId = evId;
            
            const msg = (ev && ev.message) ? String(ev.message) : '';
            const details = ev.details || {};
            
            // Update thinking bubble status
            const thinkingBubble = document.querySelector('#aiChat .bubble.assistant.thinking .bubble-content');
            if (thinkingBubble && msg !== 'status') {
              // Map status to user-friendly text
              if (details.chip) {
                const statusMap = {
                  'Auditing': 'Auditing...',
                  'Healing': 'Healing...',
                  'Coding': 'Writing fixes...',
                  'Happy': 'Done!'
                };
                thinkingBubble.textContent = statusMap[details.chip] || details.chip;
              } else if (msg && msg.length < 100) {
                thinkingBubble.textContent = msg;
              }
            }
          }
        } catch (e) {
          console.error('Progress polling error:', e);
        }
      }, 800);
    }
    
    function stopProgressPolling(){
      if (progressPoller) {
        clearInterval(progressPoller);
        progressPoller = null;
      }
    }
    
    const ask = drawer.querySelector('#aiAskBtn');
    let sharedAskInFlight = false;
    let sharedAskController = null;

    async function submitQuery(){
      // Disallow a second network request while the first is unsettled;
      // retain any newly typed input rather than silently duplicating it.
      if (sharedAskInFlight) return;
      const textarea = document.getElementById('aiQuery');
      const q = (textarea && textarea.value || '').trim();
      if (!q) return;

      sharedAskInFlight = true;
      const controller = new AbortController();
      sharedAskController = controller;
      const requestEpoch = sharedViewEpoch;
      const startTime = Date.now();
      const askBtn = document.getElementById('aiAskBtn');
      const stopBtn = document.getElementById('aiStopBtn');
      const chat = document.getElementById('aiChat');
      const thinkingBubble = document.createElement('div');
      thinkingBubble.className = 'bubble assistant thinking';
      thinkingBubble.innerHTML = '<div class="bubble-title">🩺 Calliope</div><div class="bubble-content thinking-dots">thinking<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>';

      const hist = loadChat();
      hist.push({ role:'user', content:q, ts:startTime });
      saveChat(hist);
      renderChat();
      if (textarea) textarea.value = '';
      if (chat){
        chat.appendChild(thinkingBubble);
        chat.scrollTop = chat.scrollHeight;
      }
      if (askBtn){askBtn.disabled=true;askBtn.textContent='Thinking…';}
      // A server-verified Stop implementation does not exist in secure mode.
      if (stopBtn) stopBtn.style.display='none';

      try{
        const response = await fetch('/devproxy/api/ai/ask', {
          method:'POST', credentials:'include',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({query:q}),
          signal:controller.signal
        });
        const result = await response.json().catch(()=>null);
        if (requestEpoch!==sharedViewEpoch || controller.signal.aborted) return;
        if (!response.ok || !result || result.ok===false){
          throw Error('Local Ask unavailable (HTTP '+response.status+'). No action was taken.');
        }
        let answer = result && typeof result.answer==='string' ? result.answer.trim() : '';

        // The secure local-doc backend answers synchronously. Legacy accepted
        // jobs may return later, so poll *only after* explicit acceptance.
        // Never race the immediate reply with a history-poll assistant bubble.
        if (result.accepted===true){
          startProgressPolling();
          let confirmed = false;
          for (let attempt=0; attempt<20; attempt++){
            await new Promise(resolve=>setTimeout(resolve,1000));
            if (requestEpoch!==sharedViewEpoch || controller.signal.aborted) return;
            try{
              const resp = await fetch('/devproxy/api/ai/chat-history',{
                method:'GET',credentials:'include',cache:'no-cache',
                signal:controller.signal
              });
              if (!resp.ok) continue;
              const data = await resp.json().catch(()=>null);
              const messages = data && Array.isArray(data.messages) ? data.messages : [];
              const latest = messages[messages.length-1];
              if (latest && latest.role==='assistant' &&
                  Date.parse(latest.ts)>startTime &&
                  typeof latest.content==='string' && latest.content.trim()){
                answer=latest.content;
                confirmed=true;
                break;
              }
            }catch(e){
              if (controller.signal.aborted) return;
            }
          }
          if (!confirmed){
            answer='No verified background reply arrived in this view. Server work was not confirmed stopped.';
          }
        }
        if (requestEpoch!==sharedViewEpoch || controller.signal.aborted) return;
        const messages = loadChat();
        messages.push({role:'assistant',
          content:answer||'No verified local answer was available. No action was taken.',
          ts:Date.now()});
        saveChat(messages);
        renderChat();
      }catch(e){
        if (requestEpoch!==sharedViewEpoch || controller.signal.aborted) return;
        const messages = loadChat();
        messages.push({role:'assistant',
          content:'Local Ask could not be completed. '+String(e.message||'No changes were made.'),
          ts:Date.now()});
        saveChat(messages);
        renderChat();
      }finally{
        try{thinkingBubble.remove();}catch{}
        stopProgressPolling();
        if (sharedAskController===controller){
          sharedAskInFlight=false;
          sharedAskController=null;
          if (askBtn){askBtn.disabled=false;askBtn.textContent='Ask';}
        }
      }
    }
    if (ask) ask.addEventListener('click', submitQuery);
    const textareaEvt = drawer.querySelector('#aiQuery');
    if (textareaEvt){
      textareaEvt.addEventListener('keydown', ev=>{
        if(ev.key==='Enter' && !ev.shiftKey){ev.preventDefault();submitQuery();}
      });
    }

    // Legacy ai/cancel only acknowledges a flag for the older healing loop.
    // In secure read-only mode it cannot stop Ask/HEAD and must never claim success.
    // Do not expose a fake Stop action; the status-page Clear view has its own abort.
    const stopBtn = drawer.querySelector('#aiStopBtn');
    if (stopBtn) stopBtn.style.display = 'none';

    const clearBtn = drawer.querySelector('#aiClearBtn');
    clearBtn.addEventListener('click', async ()=>{ 
      const confirmed = await window.DTP.showDialog({
        type: 'confirm',
        title: 'Clear History',
        message: 'Clear Calliope chat history?'
      });
      if (confirmed){ try{ localStorage.removeItem(LS_KEY); }catch{} renderChat(); } 
    });
    const copyBtn = drawer.querySelector('#aiCopyBtn');
    if (copyBtn){ copyBtn.addEventListener('click', ()=>{ try{ const c = JSON.parse(localStorage.getItem(LS_KEY)||'[]'); navigator.clipboard.writeText(c.map(m=>`[${m.role}] ${m.content}`).join('\n')); copyBtn.textContent='Copied'; setTimeout(()=> copyBtn.textContent='Copy', 1200); }catch{} }); }
    const healBtn = drawer.querySelector('#aiHealBtn');
    if (healBtn){ healBtn.addEventListener('click', async ()=>{ const h = loadChat(); h.push({ role:'assistant', content:'Running local observation self-check (healing unavailable)…', ts:Date.now() }); saveChat(h); renderChat(); try{ const r = await fetch('/devproxy/api/ai/self-check', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ heal:false }) }); const j = await r.json().catch(()=>({})); const h2 = loadChat(); if(!r.ok || j.ok===false || j.healingPerformed===true){ h2.push({ role:'assistant', content: `Self-check unavailable: ${j.error||j.code||('HTTP '+r.status)}. Healing is not enabled in secure mode.`, ts:Date.now() }); } else { h2.push({ role:'assistant', content: `Local observation only (${j.code||'SELF_CHECK_INVENTORY_ONLY'}). Healing was not performed.`, ts:Date.now() }); } saveChat(h2); renderChat(); }catch(e){ const h3 = loadChat(); h3.push({ role:'assistant', content:`Self-check error: ${e.message}`, ts:Date.now() }); saveChat(h3); renderChat(); } }); }
    const redirectHealBtn = drawer.querySelector('#aiRedirectHealBtn');
    if (redirectHealBtn){ redirectHealBtn.addEventListener('click', async ()=>{
      const route=(window.prompt('Route slug for reviewed Next.js /_next/ redirect heal (e.g. lyra)','lyra')||'').trim();
      if(!route)return;
      const appName=route.endsWith('.conf')?route:route+'.conf';
      const h0=loadChat();
      h0.push({role:'assistant',content:`Proposing owner-reviewed redirect repair for ${appName} (one-use review ticket)…`,ts:Date.now()});
      saveChat(h0);renderChat();
      try{
        const p=await fetch('/devproxy/api/apps/propose-nextjs-redirect-heal',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName,route})});
        const pj=await p.json().catch(()=>({}));
        if(!p.ok||!pj.ok||!pj.beforeSha256||!pj.afterSha256||!pj.reviewTicket){
          const h1=loadChat();h1.push({role:'assistant',content:`Propose failed: ${pj.error||pj.status||('HTTP '+p.status)}. No ticket issued; no changes applied.`,ts:Date.now()});saveChat(h1);renderChat();return;
        }
        // Keep ticket only in this closure — never localStorage/chat/analytics.
        const reviewTicket=pj.reviewTicket;
        const ok=window.confirm(`Apply reviewed Next.js redirect fix?\n\napp: ${pj.appName}\nroute: ${pj.route}\nbefore: ${pj.beforeSha256.slice(0,12)}…\nafter: ${pj.afterSha256.slice(0,12)}…\nchange: ${pj.changeType||'KNOWN_NEXTJS_UPSTREAM_PREFIX_REPAIR'}\n\nServer issued a one-use review ticket (expires ~${Math.round((pj.expiresInMs||120000)/1000)}s).\nThis proves propose+apply from your signed-in session — not cryptographic proof that a human clicked Confirm.\nCAS editApp + HMAC only. liveAttested stays false until disposable browser proof.`);
        if(!ok){const hC=loadChat();hC.push({role:'assistant',content:'Owner declined apply. Ticket unused; no mutation.',ts:Date.now()});saveChat(hC);renderChat();return;}
        const a=await fetch('/devproxy/api/apps/apply-reviewed-nextjs-redirect',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName:pj.appName,route:pj.route,beforeSha256:pj.beforeSha256,afterSha256:pj.afterSha256,reviewTicket})});
        const aj=await a.json().catch(()=>({}));
        const h2=loadChat();
        if(!a.ok||aj.ok!==true){h2.push({role:'assistant',content:`Apply failed: ${aj.code||aj.error||('HTTP '+a.status)}. healingPerformed=${aj.healingPerformed===true}. Replay of the same ticket is rejected.`,ts:Date.now()});}
        else {h2.push({role:'assistant',content:`Owner-reviewed repair APPLIED (${aj.code}). ticket=${aj.reviewTicketStatus||'CONSUMED'}. CAS=${aj.casEnforced===true}. healingPerformed=${aj.healingPerformed===true} (browser/nginx proof still required). liveAttested=${aj.liveAttested===true}.`,ts:Date.now()});}
        saveChat(h2);renderChat();
      }catch(e){const h3=loadChat();h3.push({role:'assistant',content:`Redirect heal error: ${e.message}`,ts:Date.now()});saveChat(h3);renderChat();}
    }); }
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
    
    // Restore Calliope state from localStorage
    try {
      const wasOpen = localStorage.getItem('dtpCalliopeOpen') === 'true';
      if (wasOpen) {
        setTimeout(() => {
          const drawer = document.getElementById('aiDrawer');
          if (drawer && drawer.classList.contains('collapsed')) {
            drawer.classList.remove('collapsed');
            document.body.classList.add('ai-open');
            // Update button states
            const btns = document.querySelectorAll('#calliopeOpen, #aiSelfCheckGlobal');
            btns.forEach((btn) => {
              btn.classList.add('active');
              btn.setAttribute('aria-pressed', 'true');
              btn.setAttribute('title', 'Close Calliope');
            });
            // Trigger positioning
            setTimeout(() => {
              const recalcEvent = new CustomEvent('calliope-recalc');
              window.dispatchEvent(recalcEvent);
            }, 50);
          }
        }, 100);
      }
    } catch {}
    
    // Compute drawer top/height based on visible header and standard gap
    // Ensure equal gaps above and below, and align with content sections
    try{
      function recalc(){
        // Find the visible header (not the hidden one)
        const headers = document.querySelectorAll('header');
        let header = null;
        for (const h of headers) {
          const style = getComputedStyle(h);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            header = h;
            break;
          }
        }
        const gap = 16; // standard gap - equal above and below
        const h = (header && header.offsetHeight) ? header.offsetHeight : 72;
        const top = h + gap;
        drawer.style.top = top + 'px';
        drawer.style.height = `calc(100vh - ${top}px - ${gap}px)`; // Equal gap at bottom
      }
      // Initial calc and on resize
      setTimeout(recalc, 100); // delay to ensure header is rendered
      window.addEventListener('resize', recalc);
      window.addEventListener('calliope-recalc', recalc);
    }catch{}
  }

  function openCalliopeWithContext(){
    try{
      // Only attach if drawer doesn't exist
      if (!document.getElementById('aiDrawer')) {
        attachCalliope();
      }
      const drawer = document.getElementById('aiDrawer');
      if (!drawer) return;
      const isCollapsed = drawer.classList.contains('collapsed');
      if (isCollapsed){
        // Opening drawer
        drawer.classList.remove('collapsed');
        document.body.classList.add('ai-open');
        // Save state
        try { localStorage.setItem('dtpCalliopeOpen', 'true'); } catch {}
        const path = location.pathname;
        const context = path.startsWith('/reports') ? 'Analyze report retention and conflicts.' : path.startsWith('/health') ? 'Summarize current health and conflicts.' : path.startsWith('/dashboard') ? 'Assist with audits from dashboard.' : 'Help with route issues.';
        const hint = document.getElementById('aiHint');
        if (hint) { hint.textContent = `You are Calliope. Context page: ${path}. ${context}`; }
        // ensure layout sizing is correct when opening
        try{ 
          const evt = new Event('resize'); 
          window.dispatchEvent(evt); 
          // Force recalc positioning
          setTimeout(() => {
            const recalcEvent = new CustomEvent('calliope-recalc');
            window.dispatchEvent(recalcEvent);
          }, 50);
          // Also directly recalc positioning
          setTimeout(() => {
            const headers = document.querySelectorAll('header');
            let header = null;
            for (const h of headers) {
              const style = getComputedStyle(h);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                header = h;
                break;
              }
            }
            const gap = 16; // Equal gap above and below
            const h = (header && header.offsetHeight) ? header.offsetHeight : 72;
            const top = h + gap;
            drawer.style.top = top + 'px';
            drawer.style.height = `calc(100vh - ${top}px - ${gap}px)`;
          }, 100);
        }catch{}
      } else {
        // Closing drawer
        drawer.classList.add('collapsed');
        document.body.classList.remove('ai-open');
        // Save state
        try { localStorage.setItem('dtpCalliopeOpen', 'false'); } catch {}
      }
      // Reflect state on any header toggle buttons present (after DOM updates)
      setTimeout(() => {
        const currentDrawer = document.getElementById('aiDrawer');
        if (!currentDrawer) return;
        const btns = document.querySelectorAll('#calliopeOpen, #aiSelfCheckGlobal');
        const nowOpen = !currentDrawer.classList.contains('collapsed');
        btns.forEach((btn)=>{
          btn.classList.toggle('active', nowOpen);
          btn.setAttribute('aria-pressed', String(nowOpen));
          btn.setAttribute('title', nowOpen ? 'Close Calliope' : 'Open Calliope');
        });
      }, 50);
    }catch{}
  }

  function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function showDialog(options = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      
      const modal = document.createElement('div');
      modal.className = 'dialog-modal';
      
      const title = document.createElement('h2');
      title.textContent = options.title || 'Confirm';
      modal.appendChild(title);
      
      const msg = document.createElement('p');
      msg.textContent = options.message || '';
      modal.appendChild(msg);
      
      const footer = document.createElement('div');
      footer.className = 'dialog-footer';
      
      if (options.type === 'confirm') {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'dialog-btn-cancel';
        cancelBtn.textContent = options.cancelText || 'Cancel';
        cancelBtn.onclick = () => {
          overlay.remove();
          resolve(false);
        };
        footer.appendChild(cancelBtn);
      }
      
      const okBtn = document.createElement('button');
      okBtn.className = 'dialog-btn-ok';
      okBtn.textContent = options.okText || 'OK';
      okBtn.onclick = () => {
        overlay.remove();
        resolve(true);
      };
      footer.appendChild(okBtn);
      
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      okBtn.focus();
    });
  }

  function showPrompt(options = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      
      const modal = document.createElement('div');
      modal.className = 'dialog-modal';
      
      const title = document.createElement('h2');
      title.textContent = options.title || 'Prompt';
      modal.appendChild(title);
      
      const msg = document.createElement('p');
      msg.textContent = options.message || '';
      modal.appendChild(msg);
      
      const input = document.createElement('input');
      input.type = 'text';
      input.value = options.value || '';
      input.placeholder = options.placeholder || '';
      input.style.width = '100%';
      input.style.padding = '10px';
      input.style.marginBottom = '20px';
      input.style.borderRadius = '8px';
      input.style.border = '1px solid #d1d5db';
      input.style.color = '#111827';
      modal.appendChild(input);
      
      const footer = document.createElement('div');
      footer.className = 'dialog-footer';
      
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'dialog-btn-cancel';
      cancelBtn.textContent = options.cancelText || 'Cancel';
      cancelBtn.onclick = () => {
        overlay.remove();
        resolve(null);
      };
      footer.appendChild(cancelBtn);
      
      const okBtn = document.createElement('button');
      okBtn.className = 'dialog-btn-ok';
      okBtn.textContent = options.okText || 'OK';
      okBtn.onclick = () => {
        const val = input.value;
        overlay.remove();
        resolve(val);
      };
      footer.appendChild(okBtn);
      
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      input.focus();
      input.select();
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') okBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
      });
    });
  }

  window.DTP = window.DTP || {};
  window.DTP.showToast = showToast;
  window.DTP.showDialog = showDialog;
  window.DTP.showPrompt = showPrompt;
  window.DTP.attachHeader = attachHeader;
  window.DTP.attachCalliope = attachCalliope;
  window.DTP.initTheme = initTheme;
  window.DTP.initView = initView;
  window.DTP.toggleView = toggleView;
  window.DTP.openCalliopeWithContext = openCalliopeWithContext;
})();


