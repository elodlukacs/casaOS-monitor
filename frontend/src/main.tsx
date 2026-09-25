import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Bundled font: the page works on an offline LAN and makes no request to Google.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
