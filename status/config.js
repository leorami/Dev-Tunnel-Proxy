// Dev Tunnel Proxy Frontend Configuration
// This module provides centralized configuration for API endpoints
// Configuration is loaded from the backend /config endpoint

(function() {
  // Default configuration (fallback if backend is unavailable)
  const DEFAULT_CONFIG = {
    apiBasePath: '/devproxy/api',
    version: '1.0.0'
  };

  let config = { ...DEFAULT_CONFIG };
  let configLoaded = false;

  // Helper to build API paths
  function apiPath(path) {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${config.apiBasePath}/${cleanPath}`;
  }

  // Load configuration from backend
  async function loadConfig() {
    if (configLoaded) return config;
    
    try {
      const response = await fetch('/config', { 
        cache: 'no-cache',
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      
      if (response.ok) {
        const data = await response.json();
        config = { ...DEFAULT_CONFIG, ...data };
        console.log('[Config] Loaded API configuration:', config);
      } else {
        console.warn('[Config] Failed to load config, using defaults');
      }
    } catch (e) {
      console.warn('[Config] Error loading config, using defaults:', e.message);
    }
    
    configLoaded = true;
    return config;
  }

  // Synchronous getter (must call loadConfig() first during page init)
  function getConfig() {
    return config;
  }

  // Export to window.DTP namespace
  window.DTP = window.DTP || {};
  window.DTP.config = {
    load: loadConfig,
    get: getConfig,
    apiPath: apiPath
  };

  // Auto-load config on script load
  loadConfig();
})();

