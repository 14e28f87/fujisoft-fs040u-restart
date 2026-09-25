#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  getCellularStatus,
  login,
  logout,
  setRebootReason,
  triggerReboot,
  waitForCellularConnected,
  waitForDeviceOnline,
} from './fs040uClient.js';
import type { Fs040uOptions, Fs040uWaitMode } from './fs040uClient.js';

export {
  getCellularStatus,
  login,
  logout,
  setRebootReason,
  triggerReboot,
  waitForCellularConnected,
  waitForDeviceOnline,
};
export type {
  Fs040uCellularStatus,
  Fs040uOptions,
  Fs040uSession,
  Fs040uWaitMode,
} from './fs040uClient.js';

/** 指定した時間だけ処理を一時停止する。 */
function sleep(msec: number) {
  return new Promise((resolve) => setTimeout(resolve, msec));
}

/** CLI 引数を解析した結果。 */
interface CliParseResult {
  /** 再起動処理へ渡すオプション。 */
  readonly options: Fs040uOptions;

  /** ヘルプ表示だけを行い、再起動処理を開始しないかどうか。 */
  readonly showHelp: boolean;
}

/**
 * プロセスのコマンドライン引数を再起動オプションへ変換する。
 *
 * npm script 経由で実行する場合は、`npm start -- --timeout 90` のように
 * npm の引数とスクリプトの引数を区切る `--` が必要になる。
 * 値は `--option value` と `--option=value` の両方を受け付ける。
 *
 * @param args `process.argv` から実行ファイル名などを除いた引数。
 * @returns 解析済みのオプションとヘルプ表示フラグ。
 * @throws 未知のオプション、値がないオプション、不正なタイムアウトを受け取った場合。
 */
function parseCliArgs(args: string[]): CliParseResult {
  const options: {
    username?: string;
    password?: string;
    host?: string;
    timeoutMs?: number;
    waitFor?: Fs040uWaitMode;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equalsIndex = argument.indexOf('=');
    const option = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    const inlineValue = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;

    if (option === '--help') {
      return { options, showHelp: true };
    }

    if (!['--username', '-u', '--password', '-p', '--host', '-h', '--timeout', '-t', '--wait-for'].includes(option)) {
      throw new Error(`不明なコマンドラインオプションです: ${option}`);
    }

    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith('-')) {
      throw new Error(`${option} には値が必要です`);
    }

    if (option === '--username' || option === '-u') {
      options.username = value;
    } else if (option === '--password' || option === '-p') {
      options.password = value;
    } else if (option === '--host' || option === '-h') {
      options.host = value;
    } else if (option === '--wait-for') {
      if (value !== 'cellular' && value !== 'web') {
        throw new Error(`--wait-for には cellular または web を指定してください: ${value}`);
      }
      options.waitFor = value;
    } else {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error(`--timeout には0より大きい秒数を指定してください: ${value}`);
      }
      options.timeoutMs = seconds * 1_000;
    }
  }

  return { options, showHelp: false };
}

/** CLI で利用できるオプションを標準出力へ表示する。 */
function printUsage(): void {
  console.log(`使いかた: fujisoft-fs040u-restart [オプション]

オプション:
  -u, --username <name>    FS040Uのユーザー名
  -p, --password <pass>    FS040Uのパスワード
  -h, --host <host>        接続先ホスト (既定値: 192.168.200.1)
  -t, --timeout <seconds>  復帰確認の待機時間 (既定値: 120秒)
      --wait-for <mode>    復帰の判定方法 (既定値: cellular)
                             cellular: セルラー回線への接続を確認
                             web:      管理画面の応答を確認
      --help              このヘルプを表示`);
}

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
export async function rebootFs040u(options: Fs040uOptions = {}): Promise<void> {
  console.log('FS040U にログインしています...');
  const session = await login(options);
  console.log('ログインに成功しました。');

  try {
    await setRebootReason(session);
  } catch (error) {
    console.warn('再起動理由の設定に失敗しましたが、再起動処理を続行します:', error);
  }

  console.log('端末の再起動を要求しています...');
  await triggerReboot(session);
  console.log('再起動要求を送信しました。');

  await sleep(2000);

  const timeoutMs = options.timeoutMs ?? 120_000;
  if ((options.waitFor ?? 'cellular') === 'cellular') {
    console.log('セルラー回線の接続を待機しています...');
    const status = await waitForCellularConnected(timeoutMs, { ...options, host: session.host });
    console.log(`端末が復帰し、セルラー回線への接続を確認しました(回線種別: ${status.networkType}, IP: ${status.ipAddress})。`);
    return;
  }

  console.log('端末の復帰を待機しています...');
  const isOnline = await waitForDeviceOnline(timeoutMs, session.host);
  if (!isOnline) {
    throw new Error(`${Math.round(timeoutMs / 1_000)}秒以内に端末の復帰を確認できませんでした(再起動要求自体は送信済みです)`);
  }
  console.log('端末が復帰し、管理画面への応答を確認しました。');
}

export default rebootFs040u;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { options, showHelp } = parseCliArgs(process.argv.slice(2));
    if (showHelp) {
      printUsage();
    } else {
      rebootFs040u(options).catch((error) => {
        console.error('FS040U の再起動に失敗しました:', error);
        process.exitCode = 1;
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('コマンドライン引数の解析に失敗しました:', message);
    printUsage();
    process.exitCode = 1;
  }
}
