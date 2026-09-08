---
title: Mac実機プロトタイプの使い方
---

# Mac実機プロトタイプ v0.1

2026年9月8日。[プロトタイプ詳細仕様](/prototype-specification) / [構成の追加ADR](/prototype-decisions#adr-023)

ユーザPC（macOS）でカードの接続とパスキー認証を試すアプリを追加しました。**実カードとTouch IDの実機成功は未確認**です。PFは引き続き模倣します。

## 1. 起動と試験

リポジトリ直下の `Start-JPKI-Prototype.command` をFinderでダブルクリックし、SafariまたはChromeで `http://localhost:18080/app/` を開いてください。初回セットアップは `./scripts/setup-mac-prototype.sh` です。

1. 「パスキーを登録」を押し、macOSの画面でユーザPCのTouch IDを選択します。
2. 「パスキーで認証」を押して再び指を触れます。成功すると署名・UV・RP ID・検証時刻が表示されます。
3. リーダーを接続し、カードをセットして「接続状態を確認」を押します。
4. カード署名試験はパスキー認証と明示同意の後、Macのネイティブダイアログで署名用暗証番号を入力します。PINをブラウザやチャットに入力しないでください。
5. PFの合成シナリオを試します。ウォレット拡張があるブラウザではSIWEと模擬操作の両署名・証拠出力も試せます。

UVの成功から、指紋とMacのパスワードを区別することはできません。実際にTouch IDで操作したことは利用者が確認し、サーバーの署名検証結果と分けて扱います。

## 2. 今回実装した構成

```text
ユーザPCのSafari／Chrome（localhost:18080）
 ├─ WebAuthn → Macの認証器（Touch ID等）
 ├─ ウォレット拡張 → SIWE・EIP-712（送金しない）
 └─ localhost Node API（Host・Origin・CSRF制限）
     ├─ SQLite：試験用公開鍵・合成証拠・試験発行鍵
     ├─ PF模倣：合成fixtureのみ
     └─ Pythonネイティブヘルパー
         ├─ PC/SC → 接続リーダー・カード状態
         └─ JPKI PKCS#11 → ネイティブPIN入力 → 署名・検証
             （ブラウザに返すのは合否のみ）
```

この実機用プロファイルはクラウドへ接続しません。既存GCE/Dockerを再起動せず、SQLiteを利用します。v0.4の専用拡張／Native Messaging案に対し、今回は固定OriginのローカルAPIと子プロセスで連携します。詳細な仕様差分と制限は[実装README](https://github.com/ShigeichiroYamasaki/jpki-wallet-project/tree/main/services/mac-prototype)に記載しています。

## 3. 実装済みと確認待ち

| 項目 | 現在の状態 |
| --- | --- |
| パスキー | 登録・認証・サーバー検証を実装。ソフトウェア認証器による暗号試験は成功。Touch ID操作は確認待ち |
| リーダー検出 | PC/SC接続処理を実装。実装時の検証環境ではPCSC_UNAVAILABLE。Macのターミナルから再試験が必要 |
| カード署名 | 公開PKCS#11 APIによるRSA試験実装。合成カード試験は成功。実カード成功は未確認 |
| PF | 7シナリオの模倣。実証明書の有効性・失効は確認しない |
| ウォレット | EOAのSIWE・EIP-712と操作別WebAuthnを実装。テスト鍵による結合試験は成功 |
| 合成credential・証拠 | 独自試験形式の署名・出力・別鍵指定の検証コマンドを実装。W3C VC相互運用は未対応 |
| 保存 | ローカルSQLite。アプリ独自の暗号化証拠庫は未実装。実カード証拠は保存・出力しない |
| 公開・法的評価 | 実サービス提供・実権利操作・法的推定効の検証は範囲外 |

起動時の自動ブラウザ操作には環境制限があり、画面の実機操作は未確認です。PCSC_UNAVAILABLEの場合はリーダーを接続し、Macのターミナルで起動スクリプトを実行してください。認証画面が出ない場合はOrigin表記、対応ブラウザ、Touch ID設定を確認します。

## 4. 根拠となるAPI

[SimpleWebAuthn](https://simplewebauthn.dev/docs/packages/server)でWebAuthnの公開鍵署名を検証し、[J-LIS公開PKCS#11仕様](https://www.j-lis.go.jp/file/070_siyou_CardAPI_2_PKCS.pdf)を基にローカルカード処理を実装しています。ソフトのインストールは実機互換性や本システムの法的整合性の確認を意味しません。[JPKI Mac対応案内](https://www.jpki.go.jp/download/mac.html)
