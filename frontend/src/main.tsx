import { Buffer } from 'buffer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

// Some Midnight libraries assume a Node-like Buffer global that browsers don't have.
window.Buffer = window.Buffer ?? Buffer;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
