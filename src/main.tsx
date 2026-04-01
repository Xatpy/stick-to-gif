import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { isNativeMobilePlatform } from './lib/platform';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && !isNativeMobilePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
