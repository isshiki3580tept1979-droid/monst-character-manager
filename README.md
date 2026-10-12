# モンストキャラ管理アプリ

モンスターストライクのキャラ・所持個体（端末ごと・わくわくの実）・ステージ適正・編成を、スマホのブラウザで管理するアプリです。データは各端末のブラウザ（localStorage）に保存されます。

- 試作版（開発中・v35）：https://isshiki3580tept1979-droid.github.io/monst-character-manager/monst_character_manager_trial.html
- 開発対象：`monst_character_manager_trial.html`（本番用の `monst_character_manager.html`／`monst_character_manager_v2.html` は変更しない）
- スクショ読取アプリ（Google Apps Script）：`モンスト スクショ読取/`（説明は同フォルダの `README.md`）
- テスト：`tests/`（Node.js＋Playwright）

## 開発を再開するとき

**最初に [HANDOFF.md](HANDOFF.md)（開発引き継ぎ）を読んでください。** 現在のバージョン・保存データの保護事項・テストの実行方法・未解決事項・次の開発テーマ・再開手順をまとめています。
