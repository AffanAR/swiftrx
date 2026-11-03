import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppCrashBoundary, DemoFrame, PageBoundary, installErrorReporting } from '@swiftrx/shared';
import App from './App';
import { queryClient } from './queryClient';
// Tailwind entry + shared rx-* classes, the same stylesheet the admin app uses.
import '../../shared/src/shared.css';

// Crashes go to the server's log, scrubbed (apps/shared/src/errorReport.ts).
installErrorReporting('portal');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppCrashBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <DemoFrame>
            {/* Loading and errors for the hospital lookup; pages have their own. */}
            <PageBoundary>
              <App />
            </PageBoundary>
          </DemoFrame>
        </BrowserRouter>
      </QueryClientProvider>
    </AppCrashBoundary>
  </React.StrictMode>,
);
