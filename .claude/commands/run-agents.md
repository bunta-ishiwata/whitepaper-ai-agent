---
description: Miyabiエージェントを並行実行（Claude Code統合）
---

# Miyabiエージェント並行実行

このコマンドは、指定されたIssueに対してMiyabiエージェントを並行実行します。

## 実行フロー

1. **Issue解析**: CoordinatorAgentがIssueを解析してタスクDAGを構築
2. **DAGレベル順実行**: 依存関係を保証しながらレベルごとに並行実行
3. **Task tool使用**: 各専門AgentをClaude CodeのTask toolで起動
4. **並行実行**: 同一レベルのタスクは並行実行（最大3-5並行）

## 使用方法

### 単一Issue処理

```
ユーザー: "Issue #5を処理して"
Claude Code: [CoordinatorAgentを使用してIssue #5を処理]
```

### 複数Issue並行処理

```
ユーザー: "Issue #5, #6, #7を並行処理して"
Claude Code: [各IssueをTask toolで並行実行]
```

## 実装詳細

```typescript
import { CoordinatorAgent } from '../../src/agents/coordinator.js';
import { Octokit } from '@octokit/rest';

// 1. Issue取得
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const issue = await octokit.issues.get({
  owner: 'your-owner',
  repo: 'your-repo',
  issue_number: issueNumber
});

// 2. CoordinatorAgent実行
const coordinator = new CoordinatorAgent();
const dag = await coordinator.decomposeIssue({
  issueNumber: issue.data.number,
  issueTitle: issue.data.title,
  issueBody: issue.data.body || '',
  labels: issue.data.labels.map(l => typeof l === 'string' ? l : l.name || '')
});

// 3. レベル順に並行実行
for (let i = 0; i < dag.levels.length; i++) {
  const level = dag.levels[i];
  console.log(`📍 Level ${i + 1}/${dag.levels.length}: ${level.length} tasks`);

  // 同一レベルのタスクを並行実行
  const tasks = level.map(async taskId => {
    const task = dag.nodes.find(n => n.id === taskId)!;

    // Task toolでエージェント実行
    // NOTE: これはClaude Codeが自動的に処理します
    console.log(`  ⏳ Starting ${task.agentType} for ${task.description}`);

    // エージェント定義を読み込んで実行
    const agentPrompt = await readAgentDefinition(task.agentType);

    // Task tool経由で実行（実際はClaude Codeの機能）
    // await executeTaskTool(agentPrompt, task);

    console.log(`  ✅ Completed ${task.agentType}`);
  });

  await Promise.all(tasks);
}

console.log('✅ All tasks completed');
```

## Agent種別

| Agent | 役割 | 入力 | 出力 |
|-------|------|------|------|
| **CoordinatorAgent** | タスク分解・並行制御 | Issue | TaskDAG |
| **CodeGenAgent** | コード生成 | Task | Generated Code |
| **ReviewAgent** | 品質検証 | Code | Score (≥80) |
| **PRAgent** | PR作成 | Code | Draft PR |
| **DeploymentAgent** | デプロイ | Code | Deployment |

## 並行実行の最適化

- **最大並行数**: 5タスク
- **依存関係保証**: DAGレベル順実行
- **エラーハンドリング**: 失敗時はエスカレーション

## 成功条件

✅ **必須**:
- [ ] DAG構築成功
- [ ] 全タスク実行完了
- [ ] 循環依存なし

✅ **品質**:
- [ ] タスク成功率 ≥95%
- [ ] 平均実行時間が見積もり±20%以内

---

🤖 **注意**: このコマンドは、Miyabiエージェントを**Claude Code内で直接実行**します。外部CLIは使用しません。
