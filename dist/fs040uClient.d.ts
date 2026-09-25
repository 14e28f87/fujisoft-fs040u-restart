/**
 * FS040U (Fujisoft LTE USB dongle) の管理Web UIをHTTPで直接操作するクライアント。
 * HARキャプチャ(実機のブラウザ操作ログ)を解析して得られたリクエスト仕様に基づく。
 */
/**
 * 再起動後の復帰判定方法。
 * - `cellular`: セルラー回線への接続を確認できたら復帰とみなす。
 * - `web`: 管理画面が応答したら復帰とみなす。
 */
export type Fs040uWaitMode = 'cellular' | 'web';
export interface Fs040uOptions {
    /** ログインに使うユーザー名。未指定時は環境変数、既定値の順に解決する。 */
    readonly username?: string;
    /** ログインに使うパスワード。未指定時は環境変数、既定値の順に解決する。 */
    readonly password?: string;
    /** 接続先のホスト名または IP アドレス。未指定時は {@link DEFAULT_HOST} を使う。 */
    readonly host?: string;
    /** 再起動後に端末の復帰を待つ時間。ミリ秒単位。 */
    readonly timeoutMs?: number;
    /** 再起動後の復帰判定方法。未指定時は `cellular`。 */
    readonly waitFor?: Fs040uWaitMode;
}
/** セルラー回線の接続状態。 */
export interface Fs040uCellularStatus {
    /** セルラー回線に接続され、WAN IP が割り当てられているかどうか。 */
    readonly connected: boolean;
    /** 回線種別 (例: `lte`, `no_service`)。 */
    readonly networkType: string;
    /** 接続状態 (例: `connected`, `disconnected`)。 */
    readonly connectionState: string;
    /** WAN 側 IP アドレス。未接続時は `0.0.0.0`。 */
    readonly ipAddress: string;
    /** 端末が返したカンマ区切りの応答そのもの。 */
    readonly raw: string;
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
/**
 * 管理画面ホームが定期取得している回線情報から、セルラー回線の接続状態を取得する。
 *
 * @param session {@link login} で取得したセッション情報。
 * @returns セルラー回線の接続状態。
 * @throws 通信に失敗した場合、または応答形式が想定と異なる場合 (セッション切れを含む)。
 */
export declare function getCellularStatus(session: Fs040uSession): Promise<Fs040uCellularStatus>;
/**
 * 再起動完了後、FS040U がセルラー回線に接続するまでポーリングする。
 * 再起動でセッションが失われるため、必要に応じて再ログインしながら確認する。
 *
 * @param timeoutMs 接続を待つ最大時間。ミリ秒単位。
 * @param options ログイン情報と接続先。省略時は環境変数と既定値を使う。
 * @returns 接続を確認した時点の回線状態。
 * @throws 指定時間内にセルラー回線への接続を確認できなかった場合。
 */
export declare function waitForCellularConnected(timeoutMs: number, options?: Fs040uOptions): Promise<Fs040uCellularStatus>;
//# sourceMappingURL=fs040uClient.d.ts.map