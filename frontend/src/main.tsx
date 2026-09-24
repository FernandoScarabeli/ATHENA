import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@xyflow/react/dist/style.css';
import { App } from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // Revalidate stale data when the user returns to the tab or reconnects.
    // The workspace also polls its live overview queries while it is open.
    queries: { staleTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
