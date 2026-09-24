/**
 * FS040U (Fujisoft LTE USB dongle) の管理Web UIをHTTPで直接操作するクライアント。
 * HARキャプチャ(実機のブラウザ操作ログ)を解析して得られたリクエスト仕様に基づく。
 */
export interface Fs040uOptions {
    /** ログインに使うユーザー名。未指定時は環境変数、既定値の順に解決する。 */
    readonly username?: string;
    /** ログインに使うパスワード。未指定時は環境変数、既定値の順に解決する。 */
    readonly password?: string;
    /** 接続先のホスト名または IP アドレス。未指定時は {@link DEFAULT_HOST} を使う。 */
    readonly host?: string;
    /** 再起動後に端末の復帰を待つ時間。ミリ秒単位。 */
    readonly timeoutMs?: number;
}
export interface Fs040uSession {
    /** ddddd / dddddddd クッキーに使うセッション ID を含む Cookie 文字列。 */
    readonly cookie: string;
    /** ログインした FS040U のホスト。後続のリクエストはこのホストへ送信する。 */
    readonly host?: string;
}
/**
 * FS040U 管理画面へログインし、以降のリクエストに使うセッション Cookie を確立する。
 *
 * ユーザー名とパスワードは、オプション、環境変数、ソースコードの既定値の順に解決する。
 * 接続先ホストは、オプションまたはソースコードの既定値から解決し、環境変数は参照しない。
 *
 * @param options ログイン情報と接続先。省略時は環境変数と既定値を使う。
 * @returns 後続の操作で使うセッション情報。
 * @throws 認証に失敗した場合、またはセッションを確立できなかった場合。
 */
export declare function login(options?: Fs040uOptions): Promise<Fs040uSession>;
/**
 * 「システム設定→端末再起動」画面で再起動理由を記録する付随処理。
 * 実際の再起動には不要な可能性があるため、失敗しても呼び出し元は処理を継続してよい。
 *
 * @param session {@link login} で取得したセッション情報。
 * @throws 管理画面との通信に失敗した場合、または CSRF トークンを取得できない場合。
 */
export declare function setRebootReason(session: Fs040uSession): Promise<void>;
/**
 * 端末を実際に再起動させるリクエストを送信する。
 * 送信直後に端末がリブートし応答を返さずコネクションが切れるのが正常な挙動のため、
 * ネットワークエラー/タイムアウトも成功とみなす。
 *
 * @param session {@link login} で取得したセッション情報。
 */
export declare function triggerReboot(session: Fs040uSession): Promise<void>;
/**
 * 再起動完了後、管理画面が応答するようになるまでポーリングする。
 *
 * @param timeoutMs 復帰を待つ最大時間。ミリ秒単位。
 * @param host 確認対象のホスト。省略時は FS040U の標準ホストを使う。
 * @returns 指定時間内に管理画面へ接続できた場合は `true`、それ以外は `false`。
 */
export declare function waitForDeviceOnline(timeoutMs: number, host?: string): Promise<boolean>;
//# sourceMappingURL=fs040uClient.d.ts.map