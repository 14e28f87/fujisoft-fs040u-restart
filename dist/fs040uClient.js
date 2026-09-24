/**
 * FS040U (Fujisoft LTE USB dongle) の管理Web UIをHTTPで直接操作するクライアント。
 * HARキャプチャ(実機のブラウザ操作ログ)を解析して得られたリクエスト仕様に基づく。
 */
import http from 'node:http';
/** FS040U 管理画面の標準ホスト。 */
const DEFAULT_HOST = '192.168.200.1';
/** ユーザー名が未指定の場合に使う既定値。 */
const DEFAULT_USERNAME = 'admin';
/** パスワードが未指定の場合に使う既定値。 */
const DEFAULT_PASSWORD = '';
const USER_AGENT = 'FS040U-Restart-Tool/1.0';
/** FS040U のセッション ID に使う乱数を生成する。 */
function randomSid() {
    return Math.floor(Math.random() * 1000000);
}
/** FS040U 管理画面へのリクエストに共通する HTTP ヘッダーを作る。 */
function baseHeaders(referer, baseUrl) {
    return {
        'User-Agent': USER_AGENT,
        Origin: baseUrl,
        Referer: referer,
    };
}
/**
 * FS040Uの組み込みHTTPサーバーはヘッダーがRFC非準拠なことがあり、Node標準fetch(undici)の
 * 厳格なパーサーだと HPE_INVALID_HEADER_TOKEN で失敗する。node:http + insecureHTTPParser で回避する。
 *
 * @param options HTTP リクエストの接続先、メソッド、ヘッダーなど。
 * @returns 応答ボディの UTF-8 文字列。
 * @throws 接続エラー、タイムアウト、応答の読み取りエラーが発生した場合。
 */
function rawRequest(options) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: options.hostname,
            port: 80,
            path: options.path,
            method: options.method,
            headers: options.headers,
            insecureHTTPParser: true,
            timeout: options.timeoutMs,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        });
        req.on('timeout', () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}
/** Cookie なし、または空の POST を FS040U 管理 API へ送信する。 */
async function postQuery(hostname, path, referer, cookie) {
    return rawRequest({
        method: 'POST',
        path,
        hostname,
        headers: {
            ...baseHeaders(referer, `http://${hostname}`),
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Length': '0',
            ...(cookie ? { Cookie: cookie } : {}),
        },
    });
}
/** application/x-www-form-urlencoded 形式の POST を FS040U 管理 API へ送信する。 */
async function postForm(hostname, path, params, referer, cookie) {
    const body = new URLSearchParams(params).toString();
    return rawRequest({
        method: 'POST',
        path,
        hostname,
        headers: {
            ...baseHeaders(referer, `http://${hostname}`),
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Length': String(Buffer.byteLength(body)),
            Cookie: cookie,
        },
        body,
    });
}
/** Cookie を付けた GET を FS040U 管理画面へ送信する。 */
async function getText(hostname, path, referer, cookie) {
    return rawRequest({
        method: 'GET',
        path,
        hostname,
        headers: {
            ...baseHeaders(referer, `http://${hostname}`),
            Cookie: cookie,
        },
    });
}
/** 管理画面 HTML に埋め込まれた CSRF トークンを取り出す。 */
function extractCsrfToken(html) {
    const match = html.match(/csrftoken:\s*'([0-9a-f]+)'/);
    if (!match) {
        throw new Error('csrftokenの抽出に失敗しました(ページ構造が変わっている可能性があります)');
    }
    return match[1];
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
export async function login(options = {}) {
    const hostname = options.host ?? DEFAULT_HOST;
    const baseUrl = `http://${hostname}`;
    const username = options.username ?? process.env['FS040U_USERNAME'] ?? DEFAULT_USERNAME;
    const password = options.password ?? process.env['FS040U_PASSWORD'] ?? DEFAULT_PASSWORD;
    const checkResult = await postQuery(hostname, `/cgi-bin/ajax_get.cgi?which_ajax=check_password_home&pram=${encodeURIComponent(password)}&username=${encodeURIComponent(username)}&sids=${randomSid()}`, `${baseUrl}/home.html`);
    if (checkResult.trim() !== '1') {
        throw new Error(`ログイン認証に失敗しました(応答: "${checkResult}")`);
    }
    const sid = randomSid();
    const sessionResult = await postQuery(hostname, `/ajax_session?sid=${sid}`, `${baseUrl}/home.html`);
    if (sessionResult.trim() !== String(sid)) {
        throw new Error(`セッション確立に失敗しました(応答: "${sessionResult}")`);
    }
    return { cookie: `lct_remember_me=; ddddd=${sid}; dddddddd=${sid}`, host: hostname };
}
/**
 * 「システム設定→端末再起動」画面で再起動理由を記録する付随処理。
 * 実際の再起動には不要な可能性があるため、失敗しても呼び出し元は処理を継続してよい。
 *
 * @param session {@link login} で取得したセッション情報。
 * @throws 管理画面との通信に失敗した場合、または CSRF トークンを取得できない場合。
 */
export async function setRebootReason(session) {
    const { cookie } = session;
    const hostname = session.host ?? DEFAULT_HOST;
    const baseUrl = `http://${hostname}`;
    const restartPageHtml = await getText(hostname, '/user/lct_system_restart.html?id=dddd', `${baseUrl}/home.html`, cookie);
    const tokenA = extractCsrfToken(restartPageHtml);
    const restartPageReferer = `${baseUrl}/user/lct_system_restart.html?id=dddd`;
    await postForm(hostname, '/cgi-bin/apply.cgi', {
        webpage: '/user/lct_reboot_process.html?id=router_restart&token=' + tokenA,
        which_cgi: 'system_restart_set',
        sys_oper: '',
        request_token: tokenA,
    }, restartPageReferer, cookie);
    const processPageReferer = `${baseUrl}/cgi-bin/apply.cgi`;
    await getText(hostname, `/user/lct_reboot_process.html?id=router_restart&token=${tokenA}`, processPageReferer, cookie);
    const reasonReferer = `${baseUrl}/user/lct_reboot_process.html?id=router_restart&token=${tokenA}`;
    const reasonResult = await postForm(hostname, `/cgi-bin/ajax_set.cgi?sids=${randomSid()}`, {
        which_cgi: 'reboot_reason_nv_set',
        reboot_reason: 'id=reboot&reason=router_restart',
        request_token: tokenA,
    }, reasonReferer, cookie);
    if (reasonResult.trim() !== 'ok') {
        throw new Error(`再起動理由の設定に失敗しました(応答: "${reasonResult}")`);
    }
    await getText(hostname, '/start.html?id=reboot&reason=router_restart', reasonReferer, cookie);
}
/**
 * 端末を実際に再起動させるリクエストを送信する。
 * 送信直後に端末がリブートし応答を返さずコネクションが切れるのが正常な挙動のため、
 * ネットワークエラー/タイムアウトも成功とみなす。
 *
 * @param session {@link login} で取得したセッション情報。
 */
export async function triggerReboot(session) {
    const hostname = session.host ?? DEFAULT_HOST;
    const baseUrl = `http://${hostname}`;
    try {
        await postQuery(hostname, '/cgi-bin/ajax_get.cgi?which_ajax=ajax_reboot_system&pram=reboot', `${baseUrl}/start.html?id=reboot&reason=router_restart`, session.cookie);
    }
    catch {
        // 端末が即座に再起動するため、通信エラー/タイムアウトは想定内の成功パターン
    }
}
/**
 * 再起動完了後、管理画面が応答するようになるまでポーリングする。
 *
 * @param timeoutMs 復帰を待つ最大時間。ミリ秒単位。
 * @param host 確認対象のホスト。省略時は FS040U の標準ホストを使う。
 * @returns 指定時間内に管理画面へ接続できた場合は `true`、それ以外は `false`。
 */
export async function waitForDeviceOnline(timeoutMs, host = DEFAULT_HOST) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await rawRequest({ method: 'GET', hostname: host, path: '/', headers: { 'User-Agent': USER_AGENT }, timeoutMs: 3000 });
            return true;
        }
        catch {
            // 未起動中は接続エラーになるため無視して待機を継続
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return false;
}
//# sourceMappingURL=fs040uClient.js.map