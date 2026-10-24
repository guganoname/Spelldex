/**
 * Picks the shell: 3D when the device package is available, the GPU can carry it and the user
 * did not opt out; otherwise the 2D shell. Both render the same screen slots.
 */
import { lazy, Suspense, useMemo } from 'react';
import { DEVICE_3D_AVAILABLE } from '@spelldex/device-3d';
import { prefersReducedMotion, useDeviceStore } from '../state/device.ts';
import Device2D from './Device2D.tsx';

const Device3D = lazy(() => import('./Device3D.tsx'));

function canRun3D(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return mem === undefined || mem >= 3;
  } catch {
    return false;
  }
}

export function DeviceHost() {
  const prefs = useDeviceStore((s) => s.prefs);
  const reduced = prefersReducedMotion(prefs);
  const use3D = useMemo(
    () => DEVICE_3D_AVAILABLE && prefs.shell !== '2d' && !reduced && canRun3D(),
    [prefs.shell, reduced],
  );
  if (!use3D) return <Device2D reducedMotion={reduced} />;
  return (
    <Suspense fallback={<Device2D reducedMotion={reduced} />}>
      <Device3D reducedMotion={reduced} />
    </Suspense>
  );
}
