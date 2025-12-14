// Authentication check for admin pages
// This script should be included at the top of protected pages

(function() {
  // Check if user is authenticated
  fetch('/admin/check', {
    credentials: 'same-origin'
  })
  .then(res => res.json())
  .then(data => {
    if (!data.authenticated) {
      // Not authenticated - redirect to login
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = '/admin/login?redirect=' + encodeURIComponent(currentPath);
    }
  })
  .catch(err => {
    console.error('Auth check failed:', err);
    // On error, redirect to login to be safe
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = '/admin/login?redirect=' + encodeURIComponent(currentPath);
  });

  // Add logout button to pages
  window.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for the header to be fully rendered
    setTimeout(() => {
      // Try to find the header actions container
      let headerActions = document.querySelector('.header-actions');
      
      if (!headerActions) {
        // If no header-actions, try to find the header row
        const headerRow = document.querySelector('.header-row');
        if (headerRow) {
          // Create header-actions if it doesn't exist
          headerActions = document.createElement('div');
          headerActions.className = 'header-actions';
          headerRow.appendChild(headerActions);
        }
      }
      
      // Create logout button
      const logoutBtn = document.createElement('button');
      logoutBtn.textContent = '🔒 Logout';
      logoutBtn.className = 'tab logout-btn';
      logoutBtn.style.cssText = `
        background: rgba(239, 68, 68, 0.8);
        color: white;
        border: 1px solid rgba(239, 68, 68, 0.4);
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
        margin-left: 8px;
      `;
      
      logoutBtn.addEventListener('mouseover', () => {
        logoutBtn.style.background = 'rgba(220, 38, 38, 0.9)';
        logoutBtn.style.transform = 'translateY(-1px)';
      });
      
      logoutBtn.addEventListener('mouseout', () => {
        logoutBtn.style.background = 'rgba(239, 68, 68, 0.8)';
        logoutBtn.style.transform = 'translateY(0)';
      });
      
      logoutBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to logout?')) return;
        
        try {
          await fetch('/admin/logout', {
            method: 'POST',
            credentials: 'same-origin'
          });
          window.location.href = '/admin/login';
        } catch (err) {
          console.error('Logout failed:', err);
          alert('Logout failed. Please try again.');
        }
      });
      
      // Add to header actions or fallback to fixed position
      if (headerActions) {
        headerActions.appendChild(logoutBtn);
      } else {
        // Fallback: add as fixed position if no header found
        logoutBtn.style.position = 'fixed';
        logoutBtn.style.top = '1rem';
        logoutBtn.style.right = '1rem';
        logoutBtn.style.zIndex = '10000';
        document.body.appendChild(logoutBtn);
      }
    }, 100);
  });
})();

