# Whitepaper Rewriter - Google Apps Script

スプレッドシートにバインドされたGASで、コメント行を元にOpenAI APIでAIリライトし、VER(n+1)タブに差分ハイライト付きで出力するツールです。

## 機能概要

- **バインドGAS**: スプレッドシートに直接バインドされ、カスタムメニュー「Whitepaper Rewriter」を提供
- **バージョン管理**: VERn タブを自動検出し、VER(n+1) に結果を出力
- **コメント駆動**: 最右列のコメントがある行のみをAI処理
- **差分ハイライト**: 追加された文字を赤字で表示（RichTextValue使用）
- **バッチ処理**: 5行ずつまとめてOpenAI Responses APIに送信
- **構造化出力**: JSON Schemaを使用して正確なレスポンスを取得
- **Backlog管理**: 処理履歴やエラーログを専用シートに記録

## セットアップ

### 1. Claspでデプロイ

```bash
# プロジェクトをGoogle Apps Scriptにプッシュ
clasp push

# スプレッドシートを開く（parentIdを使用）
# または、以下のURLから直接アクセス
# https://drive.google.com/open?id=1cEKmB73smHOn6mtxSzEifRpO42pH1HfMHmPq-QB2lbc
```

### 2. スプレッドシートでの初期設定

1. スプレッドシートを開く
2. ページをリロード（F5）して、カスタムメニューを表示
3. **Whitepaper Rewriter > Set API Key** を選択
4. OpenAI APIキー（`sk-...`）を入力して保存
5. （任意）**Set Model** でモデル名を変更（デフォルト: `gpt-5-mini`）

## 使い方

### 1. データ準備

スプレッドシートに以下の形式でデータを用意：

- **1行目**: ヘッダー行
- **最右列**: コメント列（列名は任意）
- **データ行**: コメント列にテキストがある行のみがAI処理の対象

例：

| No | タイトル | 目的 | 内容（概要） | ... | コメント |
|----|---------|------|-------------|-----|---------|
| 1 | サンプル1 | 説明 | これは例です | ... | もっと具体的に |
| 2 | サンプル2 | 説明 | これも例です | ... | |
| 3 | サンプル3 | 説明 | さらに例です | ... | 簡潔にまとめる |

### 2. 実行

1. **Whitepaper Rewriter > Rewrite all commented rows (batch: 5)** を選択
2. 処理が開始されると、新しいタブ（`VER2`、`VER3`...）が作成される
3. 処理完了後、ダイアログで完了通知

### 3. 処理履歴の確認

- **Whitepaper Rewriter > View Backlog** を選択すると、「Backlog」シートが表示される
- 処理履歴、APIリクエスト/レスポンス、エラー情報などが記録される
- トラブルシューティングに役立つ詳細なログが確認できる

### 4. 結果確認

- 新しいVERタブが作成され、全データがコピーされる
- コメントがあった行のみ、AI修正が反映される
- **追加された文字が赤字**でハイライトされる
- コメント列は元のまま保持される

## 仕組み

### バージョン管理

- 既存の `VERn` タブがあれば、最大のnを持つタブを参照元とする
- なければ、現在アクティブなタブを参照
- 新規タブは `VER(n+1)` として作成

### AI処理フロー

1. コメント行を収集（右端列にテキストがある行）
2. 5行ずつバッチに分割
3. 各バッチをOpenAI Responses APIに送信
   - モデル: `gpt-5-mini`（または設定したモデル）
   - 構造化出力（JSON Schema）使用
   - タイムアウト: 300秒（5分）
   - Reasoning effort: `low`（推論時間を短縮）
4. レスポンスをパースし、該当行に反映
5. 差分計算（LCS）で追加部分を赤字表示
6. 全ての処理履歴をBacklogシートに記録

### JSON Schema

ヘッダーから動的に生成されるため、列の追加・削除に対応：

```json
{
  "type": "object",
  "required": ["rows"],
  "properties": {
    "rows": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["row_index"],
        "properties": {
          "row_index": { "type": "integer" },
          "No": { "type": "string" },
          "タイトル": { "type": "string" },
          ...
        }
      }
    }
  }
}
```

### エラーハンドリング

- **HTTPエラー（ステータス≥300）**: ダイアログに詳細を表示し、Backlogに記録
- **JSONパースエラー**: エラー詳細をBacklogに記録し、該当バッチをスキップ
- **APIキー未設定**: エラーメッセージを表示
- **バッチ処理失敗**: エラーが発生したバッチはスキップし、他のバッチは処理継続

### Backlogシート

処理履歴を記録する専用シートで、以下の情報を保存：

| 列名 | 説明 |
|------|------|
| Timestamp | 記録日時 |
| Type | ログタイプ（INFO, API_REQUEST, API_RESPONSE, ERROR等） |
| Batch Index | バッチ番号 |
| Status | ステータス（START, SENDING, SUCCESS, FAILED等） |
| Message | メッセージ |
| Details | 詳細情報（JSON形式） |

- APIリクエスト/レスポンスの全内容を記録
- エラー時のスタックトレースを保存
- トラブルシューティングに活用可能

## プロジェクト構成

```
.
├── appsscript.json    # GAS設定（OAuth、URL許可リスト）
├── Code.gs            # メイン処理
├── .clasp.json        # Clasp設定
└── README.md          # このファイル
```

## カスタマイズ

### バッチサイズ変更

`Code.gs` の `BATCH_SIZE` を変更（Code.gs:260）：

```javascript
const BATCH_SIZE = 5; // 5行ずつ → 任意の値に変更可能
```

注: GPT-5系モデルは処理時間が長いため、バッチサイズは5程度を推奨

### プロンプト調整

`callOpenAIBatch` 関数内の `systemPrompt` や `userPrompt` を編集（Code.gs:403-447）：

```javascript
const systemPrompt = `あなたはエンタープライズ向けビジネス文書のリライト専門家です。
// ... カスタマイズ可能
`;
```

現在のプロンプトは以下の原則で動作：
- コメントの指示を最優先で積極的に反映
- 「もっと○○」という指示は明確に変化が分かるレベルで対応
- ビジネス文書として自然で読みやすい文体を維持

### 差分表示の色変更

`createDiffRichText` 関数内の色コードを変更（Code.gs:588-590）：

```javascript
const redStyle = SpreadsheetApp.newTextStyle()
  .setForegroundColor('#FF0000') // 赤 → 任意の色
  .build();
```

### タイムアウト時間の変更

`callOpenAIBatch` 関数内のタイムアウト設定を変更（Code.gs:491）：

```javascript
timeout: 300000  // 5分（300秒）→ 任意のミリ秒数
```

## トラブルシューティング

### メニューが表示されない

- スプレッドシートをリロード（F5）
- Apps Scriptのトリガーが有効か確認

### API呼び出しエラー

- APIキーが正しく設定されているか確認
- OpenAIアカウントに十分なクレジットがあるか確認
- モデル名が正しいか確認（`gpt-5-mini`、`gpt-5`、`gpt-4o` など）
- **Backlogシートを確認**して詳細なエラー情報を確認

### タイムアウトエラー

- GPT-5系モデルは処理時間が長い場合があります
- バッチサイズを小さくする（5以下）
- タイムアウト時間を延長する（デフォルト: 300秒）

### Backlogシートの確認方法

1. **Whitepaper Rewriter > View Backlog** を選択
2. エラーログの詳細を確認
3. API_REQUEST/API_RESPONSEログでリクエスト/レスポンス内容を確認

### 差分が正しく表示されない

- 元のセルに書式設定が含まれている場合、上書きされる
- 複数の書式が混在する場合は手動調整が必要

## ライセンス

このプロジェクトは自由に使用・改変できます。

## スクリプトURL

- **Apps Script Editor**: https://script.google.com/d/1TGh9DtOdE0ShaSZuTAOW8IqA2gTiud0NGOfaBpg8d0t3qJc1n6d-Du4y/edit
- **スプレッドシート**: https://drive.google.com/open?id=1cEKmB73smHOn6mtxSzEifRpO42pH1HfMHmPq-QB2lbc
