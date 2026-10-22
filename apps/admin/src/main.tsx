import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DemoFrame } from '@swiftrx/shared';
import App from './App';
// Tailwind entry + shared rx-* classes, the same stylesheet the portal uses.
import '../../shared/src/shared.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoFrame>
        <App />
      </DemoFrame>
    </BrowserRouter>
  </React.StrictMode>,
);
