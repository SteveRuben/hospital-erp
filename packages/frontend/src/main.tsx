import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Listen for Service Worker update notifications
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      // Show update banner
      if (document.getElementById('sw-update-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'sw-update-banner';
      banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#0f62fe;color:#fff;padding:0.875rem 1.5rem;display:flex;align-items:center;justify-content:space-between;z-index:99999;font-size:0.875rem;box-shadow:0 -2px 8px rgba(0,0,0,0.2)';
      const text = document.createElement('span');
      text.textContent = '🔄 Une mise à jour est disponible.';
      const btn = document.createElement('button');
      btn.textContent = 'Actualiser';
      btn.style.cssText = 'background:#fff;color:#0f62fe;border:none;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;font-weight:600;font-size:0.8125rem';
      btn.addEventListener('click', () => window.location.reload());
      banner.appendChild(text);
      banner.appendChild(btn);
      document.body.appendChild(banner);
    }
  });
}
