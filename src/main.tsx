import '@xyflow/react/dist/style.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme, getTheme, defaultAppearance } from './themes';
applyTheme(getTheme(window.espresso?.initialAppearance ?? defaultAppearance));
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
