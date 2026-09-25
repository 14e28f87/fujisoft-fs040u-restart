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

/** timeoutMs 未指定のリクエストに使うタイムアウト。ミリ秒単位。 */
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

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

/** FS040U のセッション ID に使う乱数を生成する。 */
function randomSid(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** FS040U 管理画面へのリクエストに共通する HTTP ヘッダーを作る。 */
function baseHeaders(referer: string, baseUrl: string): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    Origin: baseUrl,
    Referer: referer,
  };
}

interface RequestOptions {
  /** HTTP メソッド。 */
  method: 'GET' | 'POST';

  /** 接続先ホスト名または IP アドレス。 */
  hostname: string;

  /** 管理画面へ送るパスとクエリ文字列。 */
  path: string;

  /** 送信する HTTP ヘッダー。 */
  headers: Record<string, string>;

  /** POST の本文。 */
  body?: string;

  /** 応答を待たない、または短時間で打ち切るリクエスト用のタイムアウト。 */
  timeoutMs?: number;
}

/**
 * FS040Uの組み込みHTTPサーバーはヘッダーがRFC非準拠なことがあり、Node標準fetch(undici)の
 * 厳格なパーサーだと HPE_INVALID_HEADER_TOKEN で失敗する。node:http + insecureHTTPParser で回避する。
 *
 * @param options HTTP リクエストの接続先、メソッド、ヘッダーなど。
 * @returns 応答ボディの UTF-8 文字列。
 * @throws 接続エラー、タイムアウト、応答の読み取りエラーが発生した場合。
 */
function rawRequest(options: RequestOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.hostname,
        port: 80,
        path: options.path,
        method: options.method,
        headers: options.headers,
        insecureHTTPParser: true,
        timeout: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/** Cookie なし、または空の POST を FS040U 管理 API へ送信する。 */
async function postQuery(
  hostname: string,
  path: string,
  referer: string,
  cookie?: string,
): Promise<string> {
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
async function postForm(
  hostname: string,
  path: string,
  params: Record<string, string>,
  referer: string,
  cookie: string,
): Promise<string> {
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
async function getText(
  hostname: string,
  path: string,
  referer: string,
  cookie: string,
): Promise<string> {
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
function extractCsrfToken(html: string): string {
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
export async function login(options: Fs040uOptions = {}): Promise<Fs040uSession> {
  const hostname = options.host ?? DEFAULT_HOST;
  const baseUrl = `http://${hostname}`;
  const username = options.username ?? process.env['FS040U_USERNAME'] ?? DEFAULT_USERNAME;
  const password = options.password ?? process.env['FS040U_PASSWORD'] ?? DEFAULT_PASSWORD;
  const checkResult = await postQuery(
    hostname,
    `/cgi-bin/ajax_get.cgi?which_ajax=check_password_home&pram=${encodeURIComponent(password)}&username=${encodeURIComponent(username)}&sids=${randomSid()}`,
    `${baseUrl}/home.html`,
  );
  if (checkResult.trim() !== '1') {
    throw new Error(`ログイン認証に失敗しました(応答: "${checkResult}")`);
  }

  let sid = randomSid();
  let sessionResult = (
    await postQuery(hostname, `/ajax_session?sid=${sid}`, `${baseUrl}/home.html`)
  ).trim();
  // 応答 "2" は他のブラウザーや前回実行のセッションが残っている状態。切断して取り直す。
  if (sessionResult === '2') {
    await postQuery(hostname, '/ajax_session?sid=logout', `${baseUrl}/home.html`);
    sid = randomSid();
    sessionResult = (
      await postQuery(hostname, `/ajax_session?sid=${sid}`, `${baseUrl}/home.html`)
    ).trim();
  }
  if (sessionResult !== String(sid)) {
    throw new Error(`セッション確立に失敗しました(応答: "${sessionResult}")`);
  }

  return { cookie: `lct_remember_me=; ddddd=${sid}; dddddddd=${sid}`, host: hostname };
}

/**
 * 管理画面のセッションを破棄し、他からログインできる状態に戻す。
 * FS040U は同時に 1 セッションしか保持できないため、使い終えたら呼び出す。
 *
 * @param session {@link login} で取得したセッション情報。
 * @throws 管理画面との通信に失敗した場合。
 */
export async function logout(session: Fs040uSession): Promise<void> {
  const hostname = session.host ?? DEFAULT_HOST;
  await postQuery(hostname, '/ajax_session?sid=logout', `http://${hostname}/home.html`, session.cookie);
}

/**
 * 「システム設定→端末再起動」画面で再起動理由を記録する付随処理。
 * 実際の再起動には不要な可能性があるため、失敗しても呼び出し元は処理を継続してよい。
 *
 * @param session {@link login} で取得したセッション情報。
 * @throws 管理画面との通信に失敗した場合、または CSRF トークンを取得できない場合。
 */
export async function setRebootReason(session: Fs040uSession): Promise<void> {
  const { cookie } = session;
  const hostname = session.host ?? DEFAULT_HOST;
  const baseUrl = `http://${hostname}`;

  const restartPageHtml = await getText(
    hostname,
    '/user/lct_system_restart.html?id=dddd',
    `${baseUrl}/home.html`,
    cookie,
  );
  const tokenA = extractCsrfToken(restartPageHtml);

  const restartPageReferer = `${baseUrl}/user/lct_system_restart.html?id=dddd`;
  await postForm(
    hostname,
    '/cgi-bin/apply.cgi',
    {
      webpage: '/user/lct_reboot_process.html?id=router_restart&token=' + tokenA,
      which_cgi: 'system_restart_set',
      sys_oper: '',
      request_token: tokenA,
    },
    restartPageReferer,
    cookie,
  );

  const processPageReferer = `${baseUrl}/cgi-bin/apply.cgi`;
  await getText(
    hostname,
    `/user/lct_reboot_process.html?id=router_restart&token=${tokenA}`,
    processPageReferer,
    cookie,
  );

  const reasonReferer = `${baseUrl}/user/lct_reboot_process.html?id=router_restart&token=${tokenA}`;
  const reasonResult = await postForm(
    hostname,
    `/cgi-bin/ajax_set.cgi?sids=${randomSid()}`,
    {
      which_cgi: 'reboot_reason_nv_set',
      reboot_reason: 'id=reboot&reason=router_restart',
      request_token: tokenA,
    },
    reasonReferer,
    cookie,
  );
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
export async function triggerReboot(session: Fs040uSession): Promise<void> {
  const hostname = session.host ?? DEFAULT_HOST;
  const baseUrl = `http://${hostname}`;
  try {
    await postQuery(
      hostname,
      '/cgi-bin/ajax_get.cgi?which_ajax=ajax_reboot_system&pram=reboot',
      `${baseUrl}/start.html?id=reboot&reason=router_restart`,
      session.cookie,
    );
  } catch {
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
export async function waitForDeviceOnline(timeoutMs: number, host = DEFAULT_HOST): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await rawRequest({ method: 'GET', hostname: host, path: '/', headers: { 'User-Agent': USER_AGENT }, timeoutMs: 3_000 });
      return true;
    } catch {
      // 未起動中は接続エラーになるため無視して待機を継続
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return false;
}

/**
 * 管理画面ホームが定期取得している回線情報から、セルラー回線の接続状態を取得する。
 *
 * @param session {@link login} で取得したセッション情報。
 * @returns セルラー回線の接続状態。
 * @throws 通信に失敗した場合、または応答形式が想定と異なる場合 (セッション切れを含む)。
 */
export async function getCellularStatus(session: Fs040uSession): Promise<Fs040uCellularStatus> {
  const hostname = session.host ?? DEFAULT_HOST;
  const raw = await postQuery(
    hostname,
    `/cgi-bin/ajax_get.cgi?which_ajax=ajax_get_wm_wcdma_data&sids=${randomSid()}`,
    `http://${hostname}/home.html`,
    session.cookie,
  );
  const fields = raw.trim().split(',');
  if (fields.length < 12) {
    throw new Error(`回線情報の応答形式が想定と異なります(応答: "${raw}")`);
  }
  const networkType = fields[6];
  const connectionState = fields[7];
  const ipAddress = fields[11];
  return {
    connected: connectionState === 'connected' && ipAddress !== '' && ipAddress !== '0.0.0.0',
    networkType,
    connectionState,
    ipAddress,
    raw,
  };
}

/**
 * 再起動完了後、FS040U がセルラー回線に接続するまでポーリングする。
 * 再起動でセッションが失われるため、必要に応じて再ログインしながら確認する。
 *
 * @param timeoutMs 接続を待つ最大時間。ミリ秒単位。
 * @param options ログイン情報と接続先。省略時は環境変数と既定値を使う。
 * @returns 接続を確認した時点の回線状態。
 * @throws 指定時間内にセルラー回線への接続を確認できなかった場合。
 */
export async function waitForCellularConnected(
  timeoutMs: number,
  options: Fs040uOptions = {},
): Promise<Fs040uCellularStatus> {
  const deadline = Date.now() + timeoutMs;
  let session: Fs040uSession | undefined;
  let lastState = '未取得';
  try {
    while (Date.now() < deadline) {
      try {
        session ??= await login(options);
        const status = await getCellularStatus(session);
        if (status.connected) {
          return status;
        }
        lastState = `回線種別=${status.networkType}, 接続状態=${status.connectionState}, IP=${status.ipAddress}`;
      } catch (error) {
        session = undefined;
        lastState = `エラー: ${error instanceof Error ? error.message : String(error)}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  } finally {
    if (session) {
      await logout(session).catch(() => undefined);
    }
  }
  throw new Error(
    `${Math.round(timeoutMs / 1_000)}秒以内にセルラー回線への接続を確認できませんでした(最後の状態: ${lastState})`,
  );
}
