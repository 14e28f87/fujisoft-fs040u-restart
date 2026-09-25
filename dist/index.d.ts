#!/usr/bin/env node
import { getCellularStatus, login, setRebootReason, triggerReboot, waitForCellularConnected, waitForDeviceOnline } from './fs040uClient.js';
import type { Fs040uOptions } from './fs040uClient.js';
export { getCellularStatus, login, setRebootReason, triggerReboot, waitForCellularConnected, waitForDeviceOnline, };
export type { Fs040uCellularStatus, Fs040uOptions, Fs040uSession, Fs040uWaitMode, } from './fs040uClient.js';
/**
 * FS040U のログインから再起動後の復帰確認までを一括して実行する。
 *
 * `username` と `password` は、指定したオプション、環境変数、既定値の順に解決する。
 * `host` と `timeoutMs` は、指定したオプションがなければソースコードの既定値を使う。
 * 再起動理由の記録だけは補助処理として扱い、失敗しても再起動要求を続行する。
 * 復帰の判定は `waitFor` で選び、未指定時はセルラー回線への接続を待つ。
 *
 * @param options ログイン情報、接続先、復帰確認の待機時間と判定方法。省略可能。
 * @throws ログインに失敗した場合、再起動要求前の通信に失敗した場合、
 *   または指定時間内に復帰を確認できなかった場合。
 */
export declare function rebootFs040u(options?: Fs040uOptions): Promise<void>;
export default rebootFs040u;
//# sourceMappingURL=index.d.ts.map