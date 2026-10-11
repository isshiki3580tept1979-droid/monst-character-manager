# モンスト スクショ読取ツール

キャラクター詳細スクリーンショット（1キャラ分・最大2枚）を Gemini でまとめて読み取り、確認・修正してから、モンストキャラ管理アプリ（試作版）へ送る、または JSON をコピーする Google Apps Script のウェブアプリ。画像は保存しない。

## 読み取る項目
キャラ名・形態名・図鑑No.・種族・戦型・撃種・わくわくの実（`fruit1`〜`fruit4`、最大4つ）。
- 画像に表示されている実だけを読む。見えない枠は `null`（推測しない）。`fruit4` は省略可で、`null` でも「要確認」にはならない。
- 旧形式（`fruit4` が無い読み取り結果）もそのまま扱える。形式名 `monst-screenshot-reading-v1` は変わらない。
- 読み取り結果は画面で必ず確認・修正できる。管理アプリへの登録は管理アプリ側で利用者が押したときだけ。

## 管理アプリとの連携
管理アプリ（試作版）の「スクショから登録」から、この読取アプリを別ウィンドウで開く（`window.open` ＋ 使い捨ての nonce）。確認後に「管理アプリへ送る」を押すと `postMessage` で読み取り結果が管理アプリへ届き、管理アプリの確認画面に表示される。受け取っただけでは何も保存されない。
- 管理アプリが受け取るのは `*-script.googleusercontent.com` から届き、nonce が一致したものだけ。
- 管理アプリが読取アプリを開く URL（`SR_READER_URL`）は管理アプリ側に書かれている。**デプロイを新しく作ると URL が変わって連携が切れる**ので、更新は既存のデプロイを新しいバージョンに向け直す方法で行う。
- 順序の注意：わくわくの実4つ目は、管理アプリ側が対応していないと黙って捨てられる。**更新は管理アプリ → 読取アプリの順**に行う。戻すときは両方を揃える。

## ファイル
- `Code.js` … サーバー側（Gemini 呼び出し・応答の検証）。画面から呼ぶのは `msrReadScreenshot` だけ。**Apps Script 上のファイル名は「コード」**
- `Index.html` … 画面（画像を選ぶ／カメラで撮る → 縮小・Base64化 → 読み取り → 確認・修正 → 管理アプリへ送る／JSONをコピー）
- `appsscript.json` … 権限は外部通信（`script.external_request`）だけ。Web アプリは「アクセスしているユーザーとして実行」「自分のみ」

## Apps Script への配置
1. Apps Script で専用のプロジェクトを作る（他の用途のプロジェクトは使わない）
2. 「プロジェクトの設定」→「「appsscript.json」マニフェスト ファイルをエディタで表示する」をオン
3. サーバーコードに `Code.js` の内容、`appsscript.json` に同名ファイルの内容を貼る。「＋」→「HTML」で `Index` を作り `Index.html` の内容を貼る
4. 「プロジェクトの設定」→「スクリプト プロパティ」に `GEMINI_API_KEY` を追加（値は自分で入力。ここ以外・Git・ログ・会話には書かない）
   - 任意：`GEMINI_MODEL`（未設定なら `gemini-3.5-flash-lite`）
5. 「デプロイ」→「新しいデプロイ」→ ウェブアプリ、実行ユーザー「ウェブアプリにアクセスしているユーザー」、アクセス「自分のみ」
6. 初回は権限の確認（外部サービスへの接続）を許可する

## clasp で更新するとき
- スクリプトID・デプロイID・認証情報（`.clasp.json`、`~/.clasprc.json`）は Git に入れない。
- Apps Script 上のサーバーコードは「コード」という名前。ローカルの `Code.js` をそのまま push すると「Code」という別ファイルになり二重定義になる。**push 専用のフォルダに `コード.js`・`Index.html`・`appsscript.json` の3つをそろえ、`clasp status` で3つだけが対象になっていることを確認してから** push する。
- push で変わるのは HEAD（編集中の版）だけ。公開版は、バージョンを作って既存のデプロイをそのバージョンに向け直したときに変わる（`clasp deploy --deploymentId <既存ID> --versionNumber <N>`。`--deploymentId` を付けないと新しい URL のデプロイができてしまう）。
- 前のバージョンへ戻すときも、既存デプロイを前のバージョンに向け直す。Script Property は push・バージョン作成・デプロイのどれでも変わらない。

## テスト（Gemini とは通信しない）
Apps Script と Gemini はモックで、テストは `モンストキャラ管理アプリ` フォルダの `tests/` にあり、このフォルダの `Code.js`・`Index.html` を読み込む。
```
node --test tests/screenshot-reader.test.cjs tests/screenshot-reader-ui.test.cjs tests/screenshot-reader-camera.test.cjs tests/screenshot-reader-fruit4.test.cjs tests/reader-manager-e2e.test.cjs tests/reader-manager-fruit4.test.cjs
```
`reader-manager-e2e`・`reader-manager-fruit4` は管理アプリと読取アプリ（モック）の連携を、本番と同じ構造で確かめる。`LIVE_MANAGER=1` を付けると公開中の管理アプリ（GitHub Pages）に対して実行する。
