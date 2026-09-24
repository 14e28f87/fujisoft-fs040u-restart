#!/usr/bin/env node
import { login, setRebootReason, triggerReboot, waitForDeviceOnline } from './fs040uClient.js';
import type { Fs040uOptions } from './fs040uClient.js';
export { login, setRebootReason, triggerReboot, waitForDeviceOnline };
export type { Fs040uOptions, Fs040uSession } from './fs040uClient.js';
/**
 * FS040U のログインから再起動後の復帰確認までを一括して実行する。
 *
 * `username` と `password` は、指定したオプション、環境変数、既定値の順に解決する。
 * `host` と `timeoutMs` は、指定したオプションがなければソースコードの既定値を使う。
 * 再起動理由の記録だけは補助処理として扱い、失敗しても再起動要求を続行する。
 *
 * @param options ログイン情報、接続先、復帰確認の待機時間。省略可能。
 * @throws ログインに失敗した場合、または再起動要求前の通信に失敗した場合。
 */
export declare function rebootFs040u(options?: Fs040uOptions): Promise<void>;
export default rebootFs040u;
//# sourceMappingURL=index.d.ts.map