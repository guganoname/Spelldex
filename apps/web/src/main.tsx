import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import '@spelldex/design/tokens.css';
import './styles/global.css';
import { router } from './app/router.tsx';
import { bootstrap } from './app/bootstrap.ts';
import { persister, PERSISTED_ROOTS, queryClient } from './data/net.ts';
import { ScreenSlotsProvider } from './device/slots.tsx';
import { registerServiceWorker } from './app/pwa.ts';

void bootstrap().catch((e) => console.error('[bootstrap]', e));
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60_000,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED_ROOTS.has(String(q.queryKey[0])) },
      }}
    >
      <ScreenSlotsProvider>
        <RouterProvider router={router} />
      </ScreenSlotsProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
