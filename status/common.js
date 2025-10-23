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
    const t = document.getElementById('themeToggle') || document.getElementById('themeToggleFallback');
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
    // Always wire Calliope header controls
    const calliopeBtn = h.querySelector('#calliopeOpen');
    if (calliopeBtn){ calliopeBtn.addEventListener('click', ()=> openCalliopeWithContext()); }
    // No Self‑Check button in header to keep headers consistent across pages
    const aiTab = h.querySelector('#aiTab');
    if (aiTab){ aiTab.addEventListener('click', ()=>{ try{ openCalliopeWithContext(); }catch{} }); }
    initTheme();
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
    
    // Progress polling for background operations
    let progressPoller = null;
    let lastSeenThoughtId = null;
    
    function startProgressPolling(){
      if (progressPoller) return; // Already polling
      progressPoller = setInterval(async () => {
        try {
          const r = await fetch('/api/ai/thoughts', { cache: 'no-cache' });
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
    async function submitQuery(){
      const textarea = document.getElementById('aiQuery');
      const q = (textarea && textarea.value || '').trim();
      if (!q) return;
      
      // Show user message
      const hist = loadChat(); 
      hist.push({ role:'user', content:q, ts:Date.now() }); 
      saveChat(hist); 
      renderChat();
      
      // Clear input immediately
      if (textarea) textarea.value='';
      
      // Show thinking indicator
      const chat = document.getElementById('aiChat');
      const thinkingBubble = document.createElement('div');
      thinkingBubble.className = 'bubble assistant thinking';
      thinkingBubble.innerHTML = '<div class="bubble-title">🩺 Calliope</div><div class="bubble-content thinking-dots">thinking<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>';
      chat.appendChild(thinkingBubble);
      chat.scrollTop = chat.scrollHeight;
      
      // Disable ask button, enable stop button
      const askBtn = document.getElementById('aiAskBtn');
      const stopBtn = document.getElementById('aiStopBtn');
      if (askBtn) {
        askBtn.disabled = true;
        askBtn.textContent = 'Thinking…';
      }
      if (stopBtn) {
        stopBtn.style.display = 'inline-block';
      }
      
      // Start progress polling
      startProgressPolling();
      
      // Poll for completed responses in chat history
      const chatPollStartTime = Date.now();
      const chatPoller = setInterval(async () => {
        try {
          const chatData = await fetch('/api/ai/chat-history', { cache: 'no-cache' }).then(r => r.json());
          const messages = (chatData && chatData.messages) || [];
          const lastMsg = messages[messages.length - 1];
          
          // If there's a new assistant message after we started, operation is complete
          if (lastMsg && lastMsg.role === 'assistant' && new Date(lastMsg.ts).getTime() > chatPollStartTime) {
            // Stop polling
            clearInterval(chatPoller);
            stopProgressPolling();
            
            // Remove thinking indicator
            if (thinkingBubble && thinkingBubble.parentNode) {
              thinkingBubble.remove();
            }
            
            // Reload and render chat
            renderChat();
            
            // Re-enable ask button, hide stop button
            if (askBtn) {
              askBtn.disabled = false;
              askBtn.textContent = 'Ask';
            }
            if (stopBtn) {
              stopBtn.style.display = 'none';
            }
          }
        } catch (e) {
          console.error('Chat polling error:', e);
        }
      }, 1000);
      
      try{
        const r = await fetch('/api/ai/ask', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ query: q }) });
        const j = await r.json();
        const ans = j && (j.answer || j.message || '');
        
        // If response is immediate (not background), stop polling
        if (!j.accepted) {
          clearInterval(chatPoller);
          stopProgressPolling();
          
          // Remove thinking indicator
          if (thinkingBubble && thinkingBubble.parentNode) {
            thinkingBubble.remove();
          }
          
          const hist2 = loadChat(); 
          hist2.push({ role:'assistant', content: String(ans||'(no answer)'), ts:Date.now() }); 
          saveChat(hist2); 
          renderChat();
          
          // Re-enable ask button, hide stop button
          if (askBtn) {
            askBtn.disabled = false;
            askBtn.textContent = 'Ask';
          }
          if (stopBtn) {
            stopBtn.style.display = 'none';
          }
        }
      }catch(e){ 
        // Stop polling on error
        clearInterval(chatPoller);
        stopProgressPolling();
        
        // Remove thinking indicator on error too
        if (thinkingBubble && thinkingBubble.parentNode) {
          thinkingBubble.remove();
        }
        
        const h = loadChat(); 
        h.push({ role:'assistant', content: `Error: ${e.message}`, ts:Date.now() }); 
        saveChat(h); 
        renderChat();
        
        // Re-enable ask button, hide stop button
        if (askBtn) {
          askBtn.disabled = false;
          askBtn.textContent = 'Ask';
        }
        if (stopBtn) {
          stopBtn.style.display = 'none';
        }
      }
    }
    ask.addEventListener('click', submitQuery);
    const textareaEvt = drawer.querySelector('#aiQuery');
    if (textareaEvt){ textareaEvt.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter' && !ev.shiftKey){ ev.preventDefault(); submitQuery(); } }); }
    
    // Stop button functionality
    const stopBtn = drawer.querySelector('#aiStopBtn');
    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        try {
          // Request cancellation via API
          await fetch('/api/ai/cancel', { method: 'POST' });
          
          // Stop polling
          stopProgressPolling();
          
          // Remove thinking bubble
          const thinkingBubble = document.querySelector('#aiChat .bubble.assistant.thinking');
          if (thinkingBubble) thinkingBubble.remove();
          
          // Add cancellation message
          const h = loadChat();
          h.push({ role:'assistant', content: 'Operation stopped by user.', ts:Date.now() });
          saveChat(h);
          renderChat();
          
          // Re-enable ask button, hide stop button
          const askBtn = document.getElementById('aiAskBtn');
          if (askBtn) {
            askBtn.disabled = false;
            askBtn.textContent = 'Ask';
          }
          stopBtn.style.display = 'none';
        } catch (e) {
          console.error('Stop error:', e);
        }
      });
    }
    
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
        const topGap = 16; // standard section gap
        const h = (header && header.offsetHeight) ? header.offsetHeight : 72;
        const top = h + topGap;
        drawer.style.top = top + 'px';
        drawer.style.height = `calc(100vh - ${top + topGap}px)`; // bottom gap = topGap
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
            const topGap = 16;
            const h = (header && header.offsetHeight) ? header.offsetHeight : 72;
            const top = h + topGap;
            drawer.style.top = top + 'px';
            drawer.style.height = `calc(100vh - ${top + topGap}px)`;
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

  window.DTP = window.DTP || {};
  window.DTP.attachHeader = attachHeader;
  window.DTP.attachCalliope = attachCalliope;
  window.DTP.initTheme = initTheme;
  window.DTP.openCalliopeWithContext = openCalliopeWithContext;
})();


