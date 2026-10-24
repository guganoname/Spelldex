/**
 * 3D shell host (R3F) around @spelldex/device-3d's createCodex(). Lands with the 3D team's PR:
 * until then DEVICE_3D_AVAILABLE is false and this module is never loaded.
 */
import Device2D from './Device2D.tsx';

export default function Device3D({ reducedMotion }: { reducedMotion: boolean }) {
  return <Device2D reducedMotion={reducedMotion} />;
}
