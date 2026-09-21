/**
 * FS040U (Fujisoft LTE USB dongle) の管理Web UIをHTTPで直接操作するクライアント。
 * HARキャプチャ(実機のブラウザ操作ログ)を解析して得られたリクエスト仕様に基づく。
 */
export interface Fs040uSession {
    /** ddddd/ddddddddクッキーに使うセッションID(サーバーではなくクライアント側で採番する) */
    readonly cookie: string;
}
/** check_password_home → ajax_session の順でログインし、以降のリクエストに使うCookieを確立する */
export declare function login(): Promise<Fs040uSession>;
/**
 * 「システム設定→端末再起動」画面で再起動理由を記録する付随処理。
 * 実際の再起動には不要な可能性があるため、失敗しても呼び出し元は処理を継続してよい。
 */
export declare function setRebootReason(session: Fs040uSession): Promise<void>;
/**
 * 端末を実際に再起動させるリクエストを送信する。
 * 送信直後に端末がリブートし応答を返さずコネクションが切れるのが正常な挙動のため、
 * ネットワークエラー/タイムアウトも成功とみなす。
 */
export declare function triggerReboot(session: Fs040uSession): Promise<void>;
/** 再起動完了後、管理画面が応答するようになるまでポーリングする */
export declare function waitForDeviceOnline(timeoutMs: number): Promise<boolean>;
//# sourceMappingURL=fs040uClient.d.ts.map