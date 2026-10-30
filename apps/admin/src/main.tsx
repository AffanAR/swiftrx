import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppCrashBoundary, DemoFrame, createQueryClient } from '@swiftrx/shared';
import App from './App';
// Tailwind entry + shared rx-* classes, the same stylesheet the portal uses.
import '../../shared/src/shared.css';

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppCrashBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <DemoFrame>
            <App />
          </DemoFrame>
        </BrowserRouter>
      </QueryClientProvider>
    </AppCrashBoundary>
  </React.StrictMode>,
);
