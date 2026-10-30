import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import App from './App.jsx';
import { loadTheme } from './theme.js';

document.documentElement.dataset.theme = loadTheme();
// ?embed=1 runs the app inside the side viewer: canvas only, no sidebar.
if (new URLSearchParams(location.search).has('embed')) document.documentElement.dataset.embed = '1';
// Keep the theme in step with other windows of the app (including the side viewer).
window.addEventListener('storage', e => { if (e.key === 'yozu-theme') document.documentElement.dataset.theme = loadTheme(); });

createRoot(document.getElementById('root')).render(<App />);
