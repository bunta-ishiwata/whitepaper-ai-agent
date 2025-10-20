# Requirements Documents

このディレクトリには、プロジェクトの要件定義書を格納します。

## ディレクトリ構造

```
docs/requirements/
├── README.md                    # このファイル
├── agent-requirements.md        # AIエージェントシステムの要件定義
├── architecture-requirements.md # アーキテクチャ要件
└── functional-requirements.md   # 機能要件
```

## 要件定義書の使い方

1. **要件定義書を追加**
   - このディレクトリに新しいマークダウンファイルを作成
   - 要件を明確に記述

2. **Issueを作成**
   - 要件定義書を参照するGitHub Issueを作成
   - Miyabiエージェントが自動的に処理

3. **実装はMiyabiに委譲**
   - Claude Codeで直接実装せず、Miyabiフレームワークを通じて実装
   - Issue → CoordinatorAgent → 各専門Agent → PR

## 命名規則

- `{feature-name}-requirements.md`: 機能別要件
- `{component-name}-spec.md`: コンポーネント仕様
- `{epic-name}-overview.md`: エピック概要
