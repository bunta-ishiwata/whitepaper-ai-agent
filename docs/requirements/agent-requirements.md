# AIエージェントシステム要件定義書

# 1. 目的 / 背景

営業資料・ターゲット情報・SEOキーワードの3入力から、ホワイトペーパー企画を N 件（10/50 など可）で一発生成し、所定フォーマットのスプレッドシートへ自動出力。さらに、クライアントのコメントを反映するワンボタン（GAS）で改稿版（v2 タブ）を作成し、差分を可視化する。

---

# 2. スコープ

* **入力ソース**

  * 営業資料：PDF / テキスト
  * ターゲット情報：PDF / テキスト
  * SEOキーワード：CSV / テキスト
* **出力**：Google スプレッドシート（新規作成）
* **運用 UI**：Web フォーム（Cloud Run サービスのフロント）
* **改稿フロー**：スプレッドシートにバインドした GAS により、コメント反映→v2 作成→差分ハイライト

---

# 3. スプレッドシート仕様（列定義）

CSVサンプルに基づく列：

* `No`
* `タイトル`
* `目的`
* `内容（概要）`
* `感情的ニーズ`
* `機能的ニーズ`
* `成果的ニーズ`
* `ニーズ（複数）`
* `ターゲット`
* `職種／部署`
* `レベル`
* `構成`
* `コメント`

## 出力要件

* ヘッダー行は上記の順に固定。
* 行は 1 行 = 1 企画。`No` は 1 起算の連番。
* `構成` は章立て（H2/H3）で具体化。
* `コメント` 列はクライアントの指示入力欄（生成時は空）。

---

# 4. LLM モデル方針

* **主モデル**：GPT-5。
* **補助モデル**（任意）：Gemini（図解を含むページの要約・補助理解用）。
* **出力形式**：構造化 JSON（response schema）。サーバ側で JSON → 2 次元配列へマッピングして Sheets に書込。
* **N 件固定**：`minItems = maxItems = N` をスキーマで指定。

### 応答スキーマ（例）

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "minItems": 10,
      "maxItems": 10,
      "items": {
        "type": "object",
        "properties": {
          "No": {"type": "integer"},
          "タイトル": {"type": "string"},
          "目的": {"type": "string"},
          "内容（概要）": {"type": "string"},
          "感情的ニーズ": {"type": "string"},
          "機能的ニーズ": {"type": "string"},
          "成果的ニーズ": {"type": "string"},
          "ニーズ（複数）": {"type": "string"},
          "ターゲット": {"type": "string"},
          "職種／部署": {"type": "string"},
          "レベル": {"type": "string"},
          "構成": {"type": "string"},
          "コメント": {"type": "string"}
        },
        "required": ["No","タイトル","目的","内容（概要）","ターゲット","構成"]
      }
    }
  },
  "required": ["items"]
}
```

---

# 5. アーキテクチャ構成

* **Cloud Run（バックエンド / API）**

  * エンドポイント：`POST /generate`
  * 入力：ファイル（PDF, CSV）とテキスト、件数 N
  * 処理：ファイル保管 → 解析（OCR/要約）→ LLM 推論（構造化出力）→ Sheets 作成 → Apps Script バインド → シートURL応答
* **Cloud Storage**：一時ファイル（PDF/CSV）保管
* **Sheets API / Drive API**：スプレッドシート作成、ヘッダー・データ書込、フォルダ移動
* **Apps Script API**：生成シートにバインド GAS を後付け
* **GAS（バインド）**：メニュー/ダイアログ、コメント反映、自動改稿、差分ハイライト

---

# 6. データフロー（シーケンス）

1. ユーザーがフォームで3入力（営業資料、ターゲット、キーワード）と N を指定し送信。
2. サーバはファイルを Cloud Storage に保存、メタ判定（PDF/CSV/テキスト）を行う。
3. 解析パス：

   * PDF（テキスト主体）：**Cloud Vision OCR**で抽出。
   * PDF（図版・スライド比率高）：Vision OCR＋画像キャプション/要約に **Gemini** を併用（対象ページのみ）。
   * テキスト：そのまま使用。
   * キーワード CSV：パース（1行1語／カンマ区切り対応）。
4. 解析結果を正規化（構造体：{salesText, targetText, keywords[]}）。
5. LLM へプロンプト（後述テンプレ）＋応答スキーマ指定 → N 件の JSON を受領。
6. Sheets API で新規スプレッドシート作成 → ヘッダー行 → N 行を書込 → （任意）Drive API で所定フォルダへ移動。
7. Apps Script API で `parentId=<sheetId>` のバインド GAS を作成 → コードと `appsscript.json` をアップロード。
8. 応答としてシートURLと簡易ログ（件数、処理秒数、OCR併用ページ数など）を返す。

---

# 7. コンポーネント詳細

## 7.1 Cloud Run（Server）

**エンドポイント**

* `POST /generate`

  * `multipart/form-data`

    * `sales_pdf` (optional)
    * `sales_text` (optional)
    * `target_pdf` (optional)
    * `target_text` (optional)
    * `keywords_csv` (optional)
    * `keywords_text` (optional)
    * `count` (required, number)

**主要ロジック**

* 入力バリデーション（3系統いずれか必須 / サイズ上限 / 拡張子）
* 解析器

  * `extractTextFromPdf(file)`: Vision OCR。低信頼文字列は除外 or 後段で LLM に補正させる。
  * `summarizeDiagramPages(file, pages)`: 図の多いページのみ Gemini で補助要約。
  * `parseCsvKeywords(file)`: CSV → string[]
* 正規化

  * `buildContext({salesText, targetText, keywords})`
* LLM 呼出

  * `callReasoningLLM(context, count, schema)`
* Sheets 出力

  * `createSheetAndWriteRows(headers, rows)`
  * `moveToFolder(sheetId, folderId)`（任意）
* GAS バインド

  * `attachBoundGAS(sheetId, code, manifest)`

## 7.2 GAS（バインドスクリプト）

**目的**：クライアントコメントを反映して改稿版（v2）を自動作成し、差分を赤で強調。

**メニュー**

```js
function onOpen(){
  SpreadsheetApp.getUi()
    .createMenu('WPエージェント')
    .addItem('コメント反映してv2作成','applyClientFeedback')
    .addToUi();
}
```

**処理フロー（`applyClientFeedback`）**

1. アクティブシートを v1 とみなす。v2 シートを新規作成（存在する場合は追番）。
2. 行ループ：`コメント`列が空でない行のみ対象。
3. LLM へ**行全体＋コメント**を渡し、行単位で推敲結果を受領。
4. v2 行へ書込。
5. v1 と v2 のセルを比較し、変更があるセルに `setBackground('#ffcccc')` などで赤系ハイライト。
6. 完了ダイアログ表示。

**留意**

* 実行時間が長くなる場合：選択行のみ対象にする UI、または時間トリガーで分割。
* LLM API キーは **Script Properties** に保存。
* スロットリング対策：一定件数ごとに `Utilities.sleep()`、失敗時リトライ。

---

# 8. プロンプト設計（叩き台）

**System（モデル方針）**

> あなたはB2Bマーケの編集者。以下の入力（営業資料/ターゲット/SEOキーワード）から、検索意図・差別化・実務適用性に優れたホワイトペーパー企画を N 件出す。列定義に厳密に従い、日本語で具体的に書く。重複と冗長は排除。

**User（テンプレ）**

```
【営業資料要約】
{{salesText}}

【ターゲット情報】
{{targetText}}

【SEOキーワード（配列）】
{{keywords}}

【出力フォーマット】
- 列：No, タイトル, 目的, 内容（概要）, 感情的ニーズ, 機能的ニーズ, 成果的ニーズ, ニーズ（複数）, ターゲット, 職種／部署, レベル, 構成, コメント
- No は 1 からの連番
- 構成は H2/H3 で章立て
- 競合が多いキーワードはサブトピック/角度を変えて差別化
```

**出力**：上記スキーマに完全準拠の JSON のみ。

---

# 9. 入力フォーマット詳細

* **PDF**：最大サイズ・ページ数は運用で上限設定（例：50MB/300p）。図表の多いページはサムネイル判定やテキスト比率で選別し Gemini 要約を追加。
* **テキスト**：UTF-8 で受領。Markdown はそのまま可。
* **CSV（キーワード）**：1列 or カンマ区切り。空白トリム・重複排除・小文字化（任意）。

---

# 10. セキュリティ / 権限

* Cloud Run サービスアカウントに Sheets/Drive/Script（Apps Script API）最低限の権限を付与。
* 出力シートの共有は原則**リンク知っている全員**ではなく、**クライアントの Google アカウント**へ限定共有（要要件）。
* API キー・認証情報は Secret Manager 管理。

---

# 11. エラーハンドリング

* 入力不足（3系統すべて空）→400。
* OCR 失敗 / 壊れたPDF → 再試行 or テキスト入力にフォールバック。
* LLM 応答がスキーマ不一致 → 自動再要求（温度0/短文要請）→ 不可時は手動レビュー用にドラフトを保存。
* Sheets 書込失敗 → リトライ（指数バックオフ）。

---

# 12. ロギング / 監視

* Cloud Logging：処理経路・時間・ページ数・OCR併用枚数・LLMトークン・コスト見積。
* エラーレートのモニタリングとアラート（Error Reporting）。

---

# 13. 性能 / コストの目安（設計観点）

* OCR はテキスト主の資料では安価・高速。図解が多い資料は対象ページのみ Gemini 併用でコスト最適化。
* LLM 推論は N 件に比例。必要ならバッチ出力（例：N=50 を 10 件×5 回）で安定性↑。

---

# 14. テスト計画（抜粋）

* 単体：CSVパース、PDF OCR、図表判定、スキーマバリデーション、差分ハイライト。
* 結合：PDF+テキスト混在入力、N=10/50、Drive フォルダ移動、GAS バインド後のメニュー起動。
* 受入：実案件資料3種で評価（網羅性、差別化、章立ての具体度）。

---

# 15. 将来拡張

* Agent 化：フィードバックの要旨抽出→改稿方針の自動提案→承認後に一括反映。
* RAG：過去の良企画・CV高資料をベクトル検索で参照し、精度と一貫性を向上。
* 多出力：LP構成・目次案・CTA案・メルマガ原案などの同時生成。

---

# 16. 付録

## 16.1 `appsscript.json`（例）

```json
{
  "timeZone": "Asia/Tokyo",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.container.ui",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/drive"
  ]
}
```

## 16.2 GAS 差分ハイライト（擬似コード）

```js
function highlightDiffs_(sheetV1, sheetV2){
  const range1 = sheetV1.getDataRange().getValues();
  const range2 = sheetV2.getDataRange().getValues();
  const maxR = Math.min(range1.length, range2.length);
  const maxC = Math.min(range1[0].length, range2[0].length);
  for (let r = 1; r < maxR; r++) { // skip header
    for (let c = 0; c < maxC; c++) {
      if ((range1[r][c] || '') !== (range2[r][c] || '')) {
        sheetV2.getRange(r+1, c+1).setBackground('#ffcccc');
      }
    }
  }
}
```

## 16.3 Cloud Run リクエスト例（multipart）

```
curl -X POST https://<service>/generate \
  -F sales_pdf=@sales.pdf \
  -F target_text='製造業の情報シス部門、年商100-300億、…' \
  -F keywords_csv=@kw.csv \
  -F count=10
```

## 16.4 LLM 失敗時の再要求プロンプト（例）

> 出力が指定の JSON スキーマに一致していません。構文エラーを修正し、**JSONのみ**を返してください。配列長は N 件に固定、各必須フィールドを埋めてください。

