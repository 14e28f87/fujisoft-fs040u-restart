/**
 * FS040U (Fujisoft LTE USB dongle) の管理Web UIをHTTPで直接操作するクライアント。
 * HARキャプチャ(実機のブラウザ操作ログ)を解析して得られたリクエスト仕様に基づく。
 */
import http from 'node:http';
const BASE_URL = 'http://192.168.200.1';
const USERNAME = process.env['FS040U_USERNAME'] ?? 'admin';
const PASSWORD = process.env['FS040U_PASSWORD'] ?? '';
const USER_AGENT = 'FS040U-Restart-Tool/1.0';
function randomSid() {
    return Math.floor(Math.random() * 1000000);
}
function baseHeaders(referer) {
    return {
        'User-Agent': USER_AGENT,
        Origin: BASE_URL,
        Referer: referer,
    };
}
/**
 * FS040Uの組み込みHTTPサーバーはヘッダーがRFC非準拠なことがあり、Node標準fetch(undici)の
 * 厳格なパーサーだと HPE_INVALID_HEADER_TOKEN で失敗する。node:http + insecureHTTPParser で回避する。
 */
function rawRequest(options) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '192.168.200.1',
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
async function postQuery(path, referer, cookie) {
    return rawRequest({
        method: 'POST',
        path,
        headers: {
            ...baseHeaders(referer),
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Length': '0',
            ...(cookie ? { Cookie: cookie } : {}),
        },
    });
}
async function postForm(path, params, referer, cookie) {
    const body = new URLSearchParams(params).toString();
    return rawRequest({
        method: 'POST',
        path,
        headers: {
            ...baseHeaders(referer),
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Length': String(Buffer.byteLength(body)),
            Cookie: cookie,
        },
        body,
    });
}
async function getText(path, referer, cookie) {
    return rawRequest({
        method: 'GET',
        path,
        headers: {
            ...baseHeaders(referer),
            Cookie: cookie,
        },
    });
}
function extractCsrfToken(html) {
    const match = html.match(/csrftoken:\s*'([0-9a-f]+)'/);
    if (!match) {
        throw new Error('csrftokenの抽出に失敗しました(ページ構造が変わっている可能性があります)');
    }
    return match[1];
}
/** check_password_home → ajax_session の順でログインし、以降のリクエストに使うCookieを確立する */
export async function login() {
    const checkResult = await postQuery(`/cgi-bin/ajax_get.cgi?which_ajax=check_password_home&pram=${encodeURIComponent(PASSWORD)}&username=${encodeURIComponent(USERNAME)}&sids=${randomSid()}`, `${BASE_URL}/home.html`);
    if (checkResult.trim() !== '1') {
        throw new Error(`ログイン認証に失敗しました(応答: "${checkResult}")`);
    }
    const sid = randomSid();
    const sessionResult = await postQuery(`/ajax_session?sid=${sid}`, `${BASE_URL}/home.html`);
    if (sessionResult.trim() !== String(sid)) {
        throw new Error(`セッション確立に失敗しました(応答: "${sessionResult}")`);
    }
    return { cookie: `lct_remember_me=; ddddd=${sid}; dddddddd=${sid}` };
}
/**
 * 「システム設定→端末再起動」画面で再起動理由を記録する付随処理。
 * 実際の再起動には不要な可能性があるため、失敗しても呼び出し元は処理を継続してよい。
 */
export async function setRebootReason(session) {
    const { cookie } = session;
    const restartPageHtml = await getText('/user/lct_system_restart.html?id=dddd', `${BASE_URL}/home.html`, cookie);
    const tokenA = extractCsrfToken(restartPageHtml);
    const restartPageReferer = `${BASE_URL}/user/lct_system_restart.html?id=dddd`;
    await postForm('/cgi-bin/apply.cgi', {
        webpage: '/user/lct_reboot_process.html?id=router_restart&token=' + tokenA,
        which_cgi: 'system_restart_set',
        sys_oper: '',
        request_token: tokenA,
    }, restartPageReferer, cookie);
    const processPageReferer = `${BASE_URL}/cgi-bin/apply.cgi`;
    await getText(`/user/lct_reboot_process.html?id=router_restart&token=${tokenA}`, processPageReferer, cookie);
    const reasonReferer = `${BASE_URL}/user/lct_reboot_process.html?id=router_restart&token=${tokenA}`;
    const reasonResult = await postForm(`/cgi-bin/ajax_set.cgi?sids=${randomSid()}`, {
        which_cgi: 'reboot_reason_nv_set',
        reboot_reason: 'id=reboot&reason=router_restart',
        request_token: tokenA,
    }, reasonReferer, cookie);
    if (reasonResult.trim() !== 'ok') {
        throw new Error(`再起動理由の設定に失敗しました(応答: "${reasonResult}")`);
    }
    await getText('/start.html?id=reboot&reason=router_restart', reasonReferer, cookie);
}
/**
 * 端末を実際に再起動させるリクエストを送信する。
 * 送信直後に端末がリブートし応答を返さずコネクションが切れるのが正常な挙動のため、
 * ネットワークエラー/タイムアウトも成功とみなす。
 */
export async function triggerReboot(session) {
    try {
        await postQuery('/cgi-bin/ajax_get.cgi?which_ajax=ajax_reboot_system&pram=reboot', `${BASE_URL}/start.html?id=reboot&reason=router_restart`, session.cookie);
    }
    catch {
        // 端末が即座に再起動するため、通信エラー/タイムアウトは想定内の成功パターン
    }
}
/** 再起動完了後、管理画面が応答するようになるまでポーリングする */
export async function waitForDeviceOnline(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await rawRequest({ method: 'GET', path: '/', headers: { 'User-Agent': USER_AGENT }, timeoutMs: 3000 });
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