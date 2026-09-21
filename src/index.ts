#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  login,
  setRebootReason,
  triggerReboot,
  waitForDeviceOnline,
} from './fs040uClient.js';

export { login, setRebootReason, triggerReboot, waitForDeviceOnline };
export type { Fs040uSession } from './fs040uClient.js';

function sleep(msec: number){
	return new Promise(resolve => setTimeout(resolve, msec))
};

export async function rebootFs040u(): Promise<void> {
  console.log('FS040U にログインしています...');
  const session = await login();
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
  
  console.log('端末の復帰を待機しています...');
  const isOnline = await waitForDeviceOnline(60_000);
  if (isOnline) {
    console.log('端末が復帰し、管理画面への応答を確認しました。');
  } else {
    console.warn('60秒以内に端末の復帰を確認できませんでした(再起動要求自体は送信済みです)。');
  }
}

export default rebootFs040u;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  rebootFs040u().catch((error) => {
    console.error('FS040U の再起動に失敗しました:', error);
    process.exitCode = 1;
  });
}
