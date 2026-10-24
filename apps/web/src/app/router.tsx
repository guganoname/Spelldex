/** Routes (code-based, typed). Every screen renders into the device via <TopScreen>/<BottomScreen>. */
import {
  createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, useNavigate, useRouter,
} from '@tanstack/react-router';
import { ENTRY_TABS, type EntryTab } from '@spelldex/shared/contracts';
import { DeviceHost } from '../device/DeviceHost.tsx';
import { useDeviceButton } from '../state/device.ts';
import { HomeScreen } from '../screens/HomeScreen.tsx';

function Root() {
  const navigate = useNavigate();
  const router = useRouter();
  // Global hardware buttons; screens can consume them first.
  useDeviceButton((b) => {
    if (b === 'scan') void navigate({ to: '/scan' });
    else if (b === 'search') void navigate({ to: '/suche', search: { q: '' } });
    else if (b === 'back') {
      if (router.state.location.pathname !== '/') router.history.back();
    } else return false;
    return true;
  });
  return (
    <>
      <DeviceHost />
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({ component: Root });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeScreen });

export const cardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/karte/$id',
  validateSearch: (s: Record<string, unknown>): { tab: EntryTab } => ({
    tab: ENTRY_TABS.includes(s.tab as EntryTab) ? (s.tab as EntryTab) : 'overview',
  }),
  component: lazyRouteComponent(() => import('../screens/CardScreen.tsx'), 'CardScreen'),
});

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/suche',
  validateSearch: (s: Record<string, unknown>): { q: string } => ({ q: typeof s.q === 'string' ? s.q : '' }),
  component: lazyRouteComponent(() => import('../screens/SearchScreen.tsx'), 'SearchScreen'),
});

const scanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scan',
  component: lazyRouteComponent(() => import('../screens/ScanScreen.tsx'), 'ScanScreen'),
});

const collectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sammlung',
  component: lazyRouteComponent(() => import('../screens/CollectionScreen.tsx'), 'CollectionScreen'),
});

export const setRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sammlung/set/$code',
  component: lazyRouteComponent(() => import('../screens/SetScreen.tsx'), 'SetScreen'),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/einstellungen',
  component: lazyRouteComponent(() => import('../screens/SettingsScreen.tsx'), 'SettingsScreen'),
});

const infoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/info',
  component: lazyRouteComponent(() => import('../screens/InfoScreen.tsx'), 'InfoScreen'),
});

const routeTree = rootRoute.addChildren([
  homeRoute, cardRoute, searchRoute, scanRoute, collectionRoute, setRoute, settingsRoute, infoRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
