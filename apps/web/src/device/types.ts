import type { ComponentType } from 'react';

/**
 * Contract for device shells. A shell renders the device, owns the lid animation and the
 * hardware buttons, and provides the two screen slots (useSlotRef('top' | 'bottom')).
 * State (open, accent, active gem) comes from useDeviceStore; buttons go out via emitButton().
 */
export type DeviceShell = ComponentType<{ reducedMotion: boolean }>;
