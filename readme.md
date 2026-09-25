# fujisoft-fs040u-restart

FujiSoft FS040U LTE USB ドングルの管理画面に接続し、端末を再起動するための Node.js ツールです。
FS040U の管理 Web UI にブラウザーでアクセスする代わりに、ログインから再起動要求、再起動後の復帰確認までをコマンドラインまたは TypeScript/JavaScript から実行できます。

## できること

- FS040U の管理画面へログイン
- 再起動理由を管理画面に記録
- FS040U へ再起動要求を送信
- 再起動後、セルラー回線への接続または管理画面の応答を確認するまで待機（既定: セルラー回線、最大 60 秒）

本ツールは FS040U の管理画面が使用する HTTP API を利用します。対象機器のファームウェア更新などで API の仕様や HTML の構造が変わった場合、動作しなくなる可能性があります。

## 動作環境

- Node.js 18 以上
- FS040U と実行端末が同じネットワークに接続されていること
- FS040U の管理画面が標準アドレス `http://192.168.200.1` で利用できること
- FS040U の管理画面で使用するユーザー名とパスワード

## インストール

リポジトリを取得して依存パッケージをインストールします。

```sh
npm install
```

ビルドする場合は次を実行します。

```sh
npm run build
```

ビルド後は `dist/index.js` と型定義ファイルが生成されます。

## 使いかた

### CLI として実行する

ログイン情報は環境変数またはコマンドライン引数で指定できます。コマンドライン引数を指定した場合は環境変数より優先されます。

PowerShell:

```powershell
$env:FS040U_USERNAME = "admin"
$env:FS040U_PASSWORD = "your-password"
npm start
```

コマンドライン引数を使う場合は、`npm start` の後ろに `--` を置いてから引数を指定します。

```powershell
npm start -- --username admin --password "your-password" --host 192.168.200.1 --timeout 120
```

利用できるオプションは次のとおりです。

| オプション | 短縮形 | 説明 | 既定値・優先順位 |
| --- | --- | --- | --- |
| `--username <name>` | `-u` | FS040U のユーザー名 | CLI 引数 > `FS040U_USERNAME` > `admin` |
| `--password <password>` | `-p` | FS040U のパスワード | CLI 引数 > `FS040U_PASSWORD` > 空文字列 |
| `--host <host>` | `-h` | 接続先ホストまたは IP アドレス | CLI 引数 > `192.168.200.1` |
| `--timeout <seconds>` | `-t` | 再起動後の復帰確認時間（秒） | CLI 引数 > 120 秒 |
| `--wait-for <mode>` | なし | 復帰の判定方法。`cellular`: セルラー回線への接続を確認、`web`: 管理画面の応答を確認 | CLI 引数 > `cellular` |
| `--help` | なし | ヘルプを表示 | - |

`host` と `timeout` は環境変数を使用せず、コマンドライン引数がない場合はソースコードの既定値を使用します。`npm run dev` を使う場合も同じように、`npm run dev -- --timeout 90` の形式で指定できます。

コマンドを実行すると、次の処理が順番に行われます。

1. FS040U にログインする
2. 再起動理由を設定する
3. 再起動要求を送信する
4. 2 秒待機した後、最大 120 秒間 FS040U の復帰を確認する
   - `cellular`（既定）: 再ログインしながら回線情報を取得し、セルラー回線に接続して WAN IP が割り当てられたら復帰とみなす
   - `web`: 管理画面が応答したら復帰とみなす

指定時間内に復帰を確認できない場合はエラー終了（終了コード 1）します。

パスワードを指定しない場合、実装上は空のパスワードで認証を試みます。パスワードを使用している機器では、必ず `FS040U_PASSWORD` を設定してください。

`--password` に指定した値は、シェルの履歴や実行中プロセスの情報に残る可能性があります。通常の運用では環境変数の利用を推奨します。

### npm パッケージとして使う

ビルド済みのパッケージから、再起動処理全体を `rebootFs040u` で呼び出せます。

```ts
import rebootFs040u from 'fujisoft-fs040u-restart';

await rebootFs040u();

// 管理画面の応答で復帰を判定し、最大 120 秒待つ
await rebootFs040u({ waitFor: 'web', timeoutMs: 120_000 });
```

実行前に環境変数を設定します。

```sh
FS040U_USERNAME=admin FS040U_PASSWORD=your-password node app.js
```

Windows PowerShell では次のように設定できます。

```powershell
$env:FS040U_USERNAME = "admin"
$env:FS040U_PASSWORD = "your-password"
node app.js
```

### 処理を分けて呼び出す

ログイン、再起動理由の設定、再起動要求、復帰確認は個別にも呼び出せます。

```ts
import {
	login,
	setRebootReason,
	triggerReboot,
	waitForCellularConnected,
	waitForDeviceOnline,
} from 'fujisoft-fs040u-restart';

const session = await login();

try {
	await setRebootReason(session);
} catch (error) {
	// 再起動理由の記録は補助処理です。失敗しても再起動を続行できます。
	console.warn('再起動理由を設定できませんでした:', error);
}

await triggerReboot(session);

// セルラー回線への接続を待つ。時間内に接続できなければ例外を投げる。
const status = await waitForCellularConnected(120_000);
console.log(`接続しました: ${status.networkType} ${status.ipAddress}`);

// 管理画面の応答だけを待つ場合はこちら。結果は boolean で返る。
const isOnline = await waitForDeviceOnline(120_000);
console.log(isOnline ? 'FS040U が復帰しました。' : '復帰を確認できませんでした。');
```

`waitForCellularConnected(timeoutMs, options)` の `options` には `login` と同じ `username` / `password` / `host` を指定できます。再起動でセッションが失われるため、待機中に再ログインします。現在の回線状態だけを取得したい場合は `getCellularStatus(session)` を使えます。

FS040U は管理画面のセッションを同時に 1 つしか保持できません。`login` は既存セッションが残っている場合に自動でログアウトして取り直しますが、ブラウザーで管理画面を開いている場合はそちらがログアウトされます。セッションを使い終えたら `logout(session)` を呼び出してください。

## 開発用コマンド

```sh
# TypeScript をビルドする
npm run build

# ソースを直接実行する
npm start

# 開発中に変更を監視して実行する
npm run dev
```

## 注意事項

- 再起動要求を送信すると、FS040U はすぐに通信を切断します。そのため、`triggerReboot` では通信エラーやタイムアウトを正常な再起動の一部として扱います。
- `setRebootReason` は再起動理由を記録するための補助処理です。処理に失敗しても `rebootFs040u` は再起動要求を続行します。
- 再起動中は管理画面へ接続できません。`waitForDeviceOnline` は指定時間内に応答を確認できなかった場合、`false` を返します。`waitForCellularConnected` は例外を投げます。`rebootFs040u` はどちらの判定方法でも復帰を確認できなければ例外を投げます。
- LTE 回線への接続は再起動後しばらく時間がかかることがあります。実機では 5 分前後かかった例があるため、`cellular` で待つ場合は `--timeout` / `timeoutMs` を十分に延ばしてください（例: `--timeout 600`）。
- ユーザー名とパスワードは環境変数で渡してください。パスワードをソースコードやシェルスクリプトへ直接書き込む場合は、アクセス権限と保管方法に注意してください。
- 接続先は現在 `192.168.200.1` に固定されています。別の管理アドレスを使用する機器には、そのままでは接続できません。

## ライセンス

ISC
