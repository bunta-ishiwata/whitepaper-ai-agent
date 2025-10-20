# 🚨 実装ポリシー - 絶対厳守 🚨

## ⚠️ 最重要ルール

**Claude Codeは絶対に直接実装してはいけません！**

全ての実装は **Miyabi AIエージェント経由** で行う必要があります。

## 実装フロー（必須）

```
ユーザーからの指示
    ↓
Claude Code（要件整理・計画のみ）
    ↓
GitHub Issue作成（詳細な要件定義付き）
    ↓
Miyabi CoordinatorAgentが自動検知
    ↓
タスク分解 → 専門Agent割り当て
    ↓
CodeGenAgent / DeploymentAgent が実装
    ↓
Draft PR作成
    ↓
Claude Code（レビュー・承認のみ）
    ↓
マージ
```

## Claude Codeの役割

### ✅ やること（許可）
- ユーザー要望のヒアリング・整理
- 要件定義書の作成（`docs/requirements/`）
- GitHub Issueの作成（詳細な実装要件付き）
- PRのレビュー・承認
- Miyabiエージェントへのフィードバック
- エスカレーション対応
- 設定ファイルの読み取り・確認

### ❌ やらないこと（禁止）
- **コードの直接実装**（Read/Write/Edit toolsの使用禁止）
- **機能開発**（すべてIssue → Miyabi経由）
- **バグ修正**（緊急時を除き、Issue → Miyabi経由）
- **ファイルの直接編集**（.envなど設定ファイルを除く）

## 例外ケース

以下の場合のみ、Claude Codeが直接作業可能：

1. **緊急のバグ修正**（本番環境がダウンしている場合のみ）
2. **設定ファイルの編集**（`.env`, `tsconfig.json`など）
3. **ドキュメントの更新**（`README.md`, `.claude/`配下）
4. **Miyabi自体の設定**（`.claude/agents/`, `.claude/commands/`）

## 実装要求の処理方法

ユーザーから実装要求があった場合：

1. **要件を整理**
2. **`docs/requirements/`に要件定義を作成**
3. **GitHub Issueを作成**
   - タイトル: 明確な機能名
   - ラベル: `🤖 agent:codegen` または適切なagent
   - 本文: 詳細な実装要件
     - 目的
     - 技術仕様
     - 成功条件
     - 参考資料
4. **ユーザーにIssue URLを通知**
5. **Miyabiエージェントの実行を待つ**

## Issue作成テンプレート

```markdown
## 概要
[機能の概要]

## 目的
[なぜこの機能が必要か]

## 技術仕様

### 実装箇所
- ファイル: `src/path/to/file.ts`
- 関数/クラス: `FunctionName`

### 詳細仕様
[具体的な実装内容]

### 依存関係
- 依存するIssue: #XX
- 必要なライブラリ: `package-name`

## 成功条件

- [ ] 実装完了
- [ ] テスト作成
- [ ] テスト通過
- [ ] ドキュメント更新

## 参考資料
- [関連ドキュメント]
- [API仕様書]
```

## Miyabi実行方法

### Task toolによる直接実行

Claude CodeはTask toolを使ってMiyabiエージェントを直接呼び出します：

```typescript
// CoordinatorAgentでタスク分解
const coordinator = new CoordinatorAgent();
const dag = await coordinator.decomposeIssue({
  issueNumber: 14,
  issueBody: issue.body
});

// Task toolで各エージェント実行
for (const level of dag.levels) {
  await Promise.all(level.map(taskId => {
    const task = dag.nodes.find(n => n.id === taskId);
    // Task tool実行
    executeAgent(task.agentType, task.description);
  }));
}
```

## 違反時の対応

Claude Codeが直接実装しようとした場合：

1. **即座に停止**
2. **ユーザーに警告**
   ```
   ⚠️ 直接実装は禁止されています。
   代わりにGitHub Issueを作成し、Miyabiエージェントに委譲します。
   ```
3. **Issue作成を提案**

---

**このポリシーは絶対に守ること！**

Miyabiフレームワークの価値は、エージェントによる自律的な開発にあります。
Claude Codeが直接実装してしまうと、その価値が失われます。
