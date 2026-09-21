#!/usr/bin/env node
import { login, setRebootReason, triggerReboot, waitForDeviceOnline } from './fs040uClient.js';
export { login, setRebootReason, triggerReboot, waitForDeviceOnline };
export type { Fs040uSession } from './fs040uClient.js';
export declare function rebootFs040u(): Promise<void>;
export default rebootFs040u;
//# sourceMappingURL=index.d.ts.map