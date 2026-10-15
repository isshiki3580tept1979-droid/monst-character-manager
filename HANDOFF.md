# 開発引き継ぎ（2026-10-15 時点）

モンストキャラ管理アプリの開発を、Claude Code・Codex など別の開発AI／担当者が GitHub だけを見て再開するための文書です。
**作業を始める前に必ず最後まで読み、「7. 再開手順」に従ってください。**

## 1. 現在の状態

| 項目 | 値 |
|---|---|
| 公開バージョン | **v36**（試作版） |
| 最終公開 commit | **v36 の commit**（この文書の更新を含む同じ commit。`git log --oneline -1 -- monst_character_manager_trial.html` で確認。v35 は `1d23e53`） |
| 作業ブランチ | `codex/trial-character-basic-info`（main と同じ内容を fast-forward で公開） |
| 公開先 | GitHub Pages：main ブランチのルート（従来方式・Jekyll） |
| 試作版URL | https://isshiki3580tept1979-droid.github.io/monst-character-manager/monst_character_manager_trial.html |
| 全体回帰 | 36ファイル・372件すべて合格（v36 追加 `tests/trial-v36.test.cjs` 8件を含む） |

## 2. 構成

| ファイル | 役割 | 変更 |
|---|---|---|
| `monst_character_manager_trial.html` | **開発対象の試作版**（1ファイルの HTML＋CSS＋JS。保存は端末の localStorage） | 開発はここだけ |
| `monst_character_manager.html`／`monst_character_manager_v2.html` | 本番用 | **変更禁止** |
| `モンスト スクショ読取/`（`Code.js`・`Index.html`・`appsscript.json`・`README.md`） | スクショ読取アプリ（Google Apps Script・本人のみ）。管理アプリへ postMessage で読み取り結果を送る | 依頼がない限り変更しない。デプロイは利用者の承認が必要 |
| `tests/` | Node.js の `node:test` ＋ Playwright（Chromium）による画面テスト | 機能追加ごとに `trial-vNN.test.cjs` を追加 |
| `tests/helpers/` | 共通ヘルパー（`team.cjs`：編成画面の操作、`reader-send.cjs`：読取アプリの送信とタブ終了の確認） | |
| `TRIAL_BASIC_INFO_REPORT.md` | 以前の作業報告（参考） | |

外部の仕組み（リポジトリ外・利用者の Google アカウント内。ID はここに書かない）：
- **適正データ更新元**：本人専用の Apps Script「モンスト 適正データ更新元」（実行＝アクセスしているユーザー、アクセス＝自分のみ、権限は `drive.readonly` だけ）。Googleドライブの専用フォルダ「モンスト_適正データ更新元」にある最新の `…_bundle_YYYY-MM-DD.json` を1件読み、GitHub Pages の公開元へだけ postMessage で送る。試作版の `SUIT_UPDATE.url` にこの Web アプリの URL が入っている
- 更新元のコードはリポジトリに入っていない。変更・デプロイは利用者の承認が必要

## 3. 保存データと保護事項

保存先：localStorage キー `monst-character-manager-trial-v2`（試作版だけが読み書き。本番用のキーには触れない）。主な項目：

| 項目 | 内容 |
|---|---|
| `master.characters`／`master.forms` | キャラ（`origin:'SUIT_CATALOG'` は適正図鑑キャラ＝所持個体なし）と進化形態（種族・戦型・撃種・図鑑No. 任意） |
| `units` | 所持個体 `{id, formId, device, no, fruits[最大4], memo, epithet, verificationStatus, importSource, lentTo?, race?/battleType?/shotType?/monsterNo?}`。`no`＝同じ端末・同じキャラの個体番号。`lentTo`＝貸出先の端末 |
| `suits` | ステージ適正（出典ごと。`evaluationType` RANK/GRADE/CANDIDATE、`verificationStatus` VERIFIED/UNVERIFIED/NEEDS_REVIEW） |
| `picks`／`useDevs` | ステージごとの編成（端末→個体ID）と、今回使う端末（6端末から最大4台） |
| `ownershipChecks` | 端末ごとの所持確認の記録（所持／未所持／要確認） |
| `idLinks`／`suitAliases` | 利用者が確認したキャラ・形態の対応付け（basis：USER_SELECTED＝対応付け、USER_EXCLUDED＝同じキャラではない、**USER_GROUP／USER_GROUP_LINKED＝v36 のまとめ**）、取り込み時の対応表 |
| `importIssues`／`pendingReadings` | 取り込みで保留した行、スクショ読取の保留 |
| `characters`／`rankings`／`ownership` | **旧データ**（従来方式の登録キャラ・旧TOP20）。読むだけで変換・書き換えはしない |
| `deviceNames`／`ui` | 端末名、表示状態 |

**守ること**
- スマホの保存データには触れない（取り込み・復元・保存は利用者が操作する）。既存のバックアップを上書き・復元しない
- 所持個体・編成・貸出・わくわくの実・端末名・既存の適正を、自動で作成・統合・削除・上書きしない
- 名前が似ているだけのキャラを自動で同じキャラにしない（α付き・二つ名・形態名違いなど）。未検証・要確認の情報を確定扱いしない。推測で補わない
- 適正図鑑キャラ（個体なし）を所持として数えない
- 保存形式・バックアップ形式を変えるときは、旧データ・旧バックアップとの互換を保つ
- 本番用HTML・読取アプリ・Apps Script・Googleドライブは、利用者の承認なしに変更しない
- commit・push・公開は利用者の承認を得てから。force push しない。ブランチ・リポジトリを削除しない
- 個人の所持データ・バックアップ・認証情報をリポジトリに入れない

## 4. テストの実行

必要なもの：Node.js 18 以上、`playwright`（Chromium）。`NODE_PATH` に playwright の入った `node_modules` を指定する。

```
# 1ファイル
NODE_PATH=<playwrightのnode_modules> node --test --test-concurrency=1 tests/trial-v36.test.cjs
# 全体（PCの負荷・メモリが心配なときは1ファイルずつ順番に）
NODE_PATH=<playwrightのnode_modules> node --test --test-concurrency=2 tests/*.test.cjs
```

- テストは架空データだけを使い、外部への通信を遮断して実行する（Google・Gemini には接続しない）
- 公開版で確かめるとき：`TRIAL_HTML_SOURCE=<取得した公開HTML>` を付けると、その HTML に対して実行できる。`LIVE_MANAGER=1` を付けると `reader-manager-e2e` が公開中の Pages に対して動く
- 画面写真は `tests/artifacts/`（Git管理外）に出る
- 過去にメモリ不足で全体実行が止まったことがある。空きメモリ1GB以上を確認し、1ファイルずつ実行するのが安全

## 5. 完成した主な機能（試作版）

- 進化形態・所持個体・ステージ適正・編成の新構造（形態の管理は v26 で廃止し、キャラ名単位で扱う）。旧TOP20データは残したまま、選んだものだけ取り込める
- 所持個体：端末ごとの個体番号、わくわくの実（最大4）、二つ名、撃種・戦型・種族・図鑑No.（個体ごとの値も可）、貸出・返却
- 所持データ取り込み（JSON）、スクショ読取アプリとの連携（読み取り → 確認画面 → 利用者が登録）、読み取りの保留
- 適正データ取り込み：1ステージずつ（v17〜）、複数ステージの一括取り込み（v33）、本人専用の更新元から受け取る「適正データの更新」（v34。内容確認・バックアップ確認のあと「更新する」で保存。SHA-256・件数・出典日・送り元・合言葉を検証）
- キャラの対応付け（自動照合は名前の完全一致・二つ名を除いた一致だけ。除外も記録できる）
- ステージ編成（v27〜v29）：今回使う端末（6台から最大4台）、端末ごとのカード（端末名 → キャラ名 → 撃種｜戦型｜種族 → わくわくの実 → ボタン）、キャラを選ぶ画面
- **v35**：端末ごとの適正所持状況。カードの印「適正候補あり N体」（緑＝全員が適正と同じ形態かつ確認済み、薄い青＝キャラ名だけの一致や未検証を含む）、「貸出中」「該当なし」（全キャラに未所持の記録があるときだけ）「未確認」「旧登録あり・要確認」（旧データに名前が完全一致する所持記録）「適正未登録」。未選択の端末には候補名の1行
- 複数タブでの上書き防止、保存失敗時のロールバック、バックアップ・復元
- **v36**：同じキャラの複数個体の「まとめ」（下記8）。キャラ一覧の見出しを全キャラ共通の「所持N体」に変更

## 6. 未解決事項

1. v36 のまとめの実機確認（ヤクモ3体・MV の図鑑No.8930 の表示。下記8）
2. 実データでは所持個体の多くが「形態未確認」のため、v35 の印はほとんど薄い青になる見込み（緑は形態まで対応付けた個体だけ）。実機での見え方の確認が必要
3. v35 の内訳は印の説明（`title`）に入れている。スマホでは表示されないことがあるため、キャラ選択画面で確認する形
4. 旧データ（旧登録・旧TOP20）の照合は名前の完全一致だけ。旧TOP20の所持記録は、調べたステージにかかわらず端末の記録として扱う
5. 天魔の孤城の適正：19ステージ・157件のうち 133件を保存済み、24件は保留（似た名前・α付き・ギルティなど。利用者が1ステージずつの取り込みで選ぶまで取り込まない）。ネオ（獣神化改）・ミライは要確認のまま
6. 自動照合しないキャラ：物干し竿（形態名の読み取り疑い）、ネオ（獣神化改≠ハロー）、春野サクラ（GameWith の「桜」は別キャラ）、チェンソーマン＆ビーム、sinギルティ と「ギルティ」、α付きキャラ
7. `reader-manager-e2e` のタブ終了のタイミング問題は、テスト側で対策済み（`tests/helpers/reader-send.cjs`）。再発したら単独で再実行し、エラー内容を確認する

## 7. 再開手順（新しい担当者向け）

1. GitHub の最新状態を取得する：`git fetch origin`
2. 差分を確認する：`git status`、`git log --oneline -5`、`git rev-parse HEAD origin/main origin/codex/trial-character-basic-info`（3つが同じか、どちらが進んでいるか）、`git diff origin/main..HEAD --stat`
3. `README.md` とこの `HANDOFF.md` を読む
4. ソースとテストを確認する：試作版HTMLの該当箇所（下記9）、最新のテスト `tests/trial-v36.test.cjs`。可能なら全体回帰を実行して現状を確認する
5. データ保護の方針（上記3）を確認する
6. 未解決事項（上記6）と次の開発テーマ（下記8）を整理する
7. **開発に入る前に、作業方針（変更する範囲・保存データへの影響・テスト計画）を利用者に提示し、承認を得る**

## 8. v36 で対応：同じキャラの複数個体（「まとめ」）

**実機の状況（きっかけ）**：メイン端末にヤクモを3体所持。「ヤクモ（MV・図鑑No.8930・戦型の実3つ）」と「ヤクモ大荒武装（No.6737）」2体が、別キャラ名として登録されていた。

**採用した方式（表示上のまとめ。保存データの統合はしない）**
- キャラ画面の「同じキャラをまとめる」で、利用者が相手のキャラを選び、確認画面（代表名・まとめた後の「所持N体」・含まれる個体）で「まとめる」を押したときだけ、`idLinks` に `{kind:'char', a:代表のキャラ, b:相手, basis:'USER_GROUP'}` を1件足す。既に「同じキャラとして対応付け」済み（USER_SELECTED）のペアは、その記録の basis を `USER_GROUP_LINKED` に切り替える（ID・日時はそのまま）
- キャラ名・キャラID・進化形態・所持個体（個体ID・図鑑No.・個体の種族などの値・わくわくの実・貸出）・編成・適正は変更しない。自動ではまとめない（候補に名前・図鑑No.の近いキャラを出すだけ。所持個体のないキャラは対象外。「同じキャラではない」と記録したペアを含むまとめは不可）
- 「まとめから外す」：そのキャラにつながるまとめの記録だけを外す（USER_GROUP は削除、USER_GROUP_LINKED は USER_SELECTED に戻す）
- 代表名：まとめた側（a）。確認画面で選べる（初期値は、一方の名前がもう一方の先頭と同じなら短い方。例「ヤクモ」）
- 表示：キャラ一覧は1枚（「ヤクモ　所持3体（貸出中◯）」）。各個体に個体番号・図鑑No.・撃種｜戦型｜種族・登録名（代表名と違うとき）・実・貸出／返却。編成のキャラ選択・端末カード・端末画面・検索も代表名＋個体ごとの図鑑No.
- 個体番号：保存値は変えない。まとめたキャラで同じ端末の番号が重なるときだけ、画面は通し番号。新しい個体はまとめ全体で重ならない番号
- まとめはキャラの対応付けでもあるため、適正の照合（`charGroupOf`）でも同じキャラとして扱う（例：「ヤクモ」の適正で大荒武装の個体も候補に出る。進化形態まで同じでない個体には v35 どおり「キャラ名で一致」と表示）
- 保存形式：`idLinks` の basis に新しい値が増えただけ。旧データ・旧バックアップはそのまま読める。v35 以前の試作版で読んでも通常の対応付けとして保持される（一覧はまとまらない）
- キャラ一覧の見出しは全キャラ共通で「所持N体・適正M」（個体のないキャラは「個体未登録」。適正図鑑キャラを所持と書かない）

**次回の開発テーマ（候補・未着手）**
1. 実機確認：ヤクモ3体をまとめ、MV の図鑑No.8930 が表示されるか（未登録なら「No.未登録」と出る。個体の図鑑No.は今は画面から編集できず、スクショ読取の登録で入る）
2. 個体の編集画面で図鑑No.・個体ごとの撃種／戦型／種族を直せるようにするか（要相談）
3. 下記6の未解決事項

## 9. 関連する場所（試作版HTML内の関数）

| 内容 | 主な関数・場所 |
|---|---|
| 保存データの読み込み・正規化 | `normalize`、`blank`、`unitOwnBasic`、冒頭の「新構造」のコメント |
| キャラの同一判定・対応付け | `charGroupOf`、`autoSameChar`、`linkedIds`、`candReason`、`charCandidates` |
| 個体の表示 | `unitCharName`、`unitBasic`、`basicLine`、`frChips`、`unitBoxHtml`（端末画面） |
| キャラ画面 | `renderChara` 付近、`unitSuitText` |
| ステージ編成 | `renderStage`、`pickState`、`pickBlock`、`pickButton`、`openPicker`、`renderPicker`、`setPick` |
| v35 適正所持状況 | `devSuitState`、`legacyOwnFor`、`devSuitChips`、`devSuitHint`、`devSuitBadge`、`teamSuitText` |
| 適正取り込み | `parseSuitImport`、`planSuitImport`、`applySuitImport`、一括 `parseSuitBundle`、更新 `onUpdateMessage`・`applyUpdate` |
| スクショ読取連携 | `openReader`、`onReaderMessage`、`previewScreenshot` |
| v36 まとめ | `dispGroupInfo`（まとめの集合・代表名）、`dispNo`、`unitSort`、`unitMonsterNo`、`unitNoTag`、`unitRegName`、`renderChara`、`openGroup`・`renderGroup`・`renderGroupList`・`pickGroupTarget`・`saveGroup`・`ungroupChar`、`nextUnitNo` |
| 関連テスト | `tests/trial-v26`（形態管理の廃止）、`v16`・`v19`・`v21`・`v22`（対応付け・候補）、`v27`〜`v29`・`v35`（編成画面）、`v31`・`v32`（同名・別能力の個体）、`v36`（同じキャラのまとめ） |
