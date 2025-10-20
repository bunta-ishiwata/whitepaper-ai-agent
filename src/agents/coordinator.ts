/**
 * CoordinatorAgent - Claude Code統合版
 * Task toolを使用して専門Agentを並行実行
 */

import type { AgentTask, TaskDAG, CoordinatorInput } from './types.js';
import { Logger } from '../utils/logger.js';

export class CoordinatorAgent {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('CoordinatorAgent');
  }

  /**
   * Issueを解析してタスクDAGを構築
   */
  async decomposeIssue(input: CoordinatorInput): Promise<TaskDAG> {
    this.logger.info(`🔍 Decomposing Issue #${input.issueNumber}`);

    const tasks = this.extractTasks(input.issueBody);
    const dag = this.buildDAG(tasks);

    this.logger.info(`✅ Found ${tasks.length} tasks, ${dag.levels.length} levels`);
    return dag;
  }

  /**
   * Issue本文からタスクを抽出
   */
  private extractTasks(issueBody: string): AgentTask[] {
    const tasks: AgentTask[] = [];
    const lines = issueBody.split('\n');

    let currentTask: Partial<AgentTask> | null = null;
    let taskId = 1;

    for (const line of lines) {
      // チェックボックス形式: - [ ] Task description
      const checkboxMatch = line.match(/^- \[ \] \*\*Task (\d+)\*\*: (.+)$/);
      if (checkboxMatch) {
        if (currentTask) {
          tasks.push(this.finalizeTask(currentTask, taskId++));
        }
        currentTask = {
          description: checkboxMatch[2],
          dependencies: [],
        };
        continue;
      }

      // 依存関係: depends: Task X
      if (currentTask && line.includes('depends:')) {
        const depsMatch = line.match(/depends: Task (\d+)/g);
        if (depsMatch) {
          currentTask.dependencies = depsMatch.map(d => `task-${d.match(/\d+/)![0]}`);
        }
      }
    }

    if (currentTask) {
      tasks.push(this.finalizeTask(currentTask, taskId++));
    }

    return tasks;
  }

  /**
   * タスクオブジェクトを完成させる
   */
  private finalizeTask(partial: Partial<AgentTask>, id: number): AgentTask {
    return {
      id: `task-${id}`,
      type: this.inferTaskType(partial.description || ''),
      description: partial.description || '',
      dependencies: partial.dependencies || [],
      estimatedMinutes: 30,
      agentType: this.assignAgent(partial.description || ''),
    };
  }

  /**
   * タスク種別を推論
   */
  private inferTaskType(description: string): AgentTask['type'] {
    const lower = description.toLowerCase();
    if (lower.includes('test') || lower.includes('テスト')) return 'test';
    if (lower.includes('doc') || lower.includes('ドキュメント')) return 'docs';
    if (lower.includes('deploy') || lower.includes('デプロイ')) return 'deployment';
    if (lower.includes('bug') || lower.includes('fix') || lower.includes('修正')) return 'bug';
    if (lower.includes('refactor') || lower.includes('リファクタ')) return 'refactor';
    return 'feature';
  }

  /**
   * タスクに専門Agentを割り当て
   */
  private assignAgent(description: string): AgentTask['agentType'] {
    const type = this.inferTaskType(description);
    if (type === 'deployment') return 'deployment';
    if (type === 'docs') return 'codegen'; // docs also handled by codegen
    return 'codegen'; // default to codegen for feature/bug/refactor
  }

  /**
   * DAG構築（トポロジカルソート）
   */
  private buildDAG(tasks: AgentTask[]): TaskDAG {
    const nodes = tasks;
    const edges = tasks.flatMap(task =>
      task.dependencies.map(dep => ({ from: dep, to: task.id }))
    );

    // トポロジカルソート（Kahn's Algorithm）
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    nodes.forEach(node => {
      inDegree.set(node.id, 0);
      adjList.set(node.id, []);
    });

    edges.forEach(edge => {
      adjList.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    });

    const levels: string[][] = [];
    const queue = nodes.filter(node => inDegree.get(node.id) === 0).map(n => n.id);

    while (queue.length > 0) {
      const currentLevel = [...queue];
      levels.push(currentLevel);
      queue.length = 0;

      currentLevel.forEach(nodeId => {
        adjList.get(nodeId)!.forEach(neighbor => {
          inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        });
      });
    }

    return { nodes, edges, levels };
  }

  /**
   * DAGに従ってタスクを並行実行
   *
   * NOTE: この関数は実際には使用されません。
   * 代わりに、Claude CodeがTask toolを直接呼び出してエージェントを実行します。
   * この実装は構造の理解とテストのためのものです。
   */
  async executeTasks(dag: TaskDAG): Promise<void> {
    this.logger.info(`⚡ Starting parallel execution: ${dag.levels.length} levels`);

    for (let i = 0; i < dag.levels.length; i++) {
      const level = dag.levels[i];
      if (!level) continue;

      this.logger.info(`📍 Executing level ${i + 1}/${dag.levels.length} (${level.length} tasks)`);

      // この時点では、実際の実行はClaude CodeのTask toolに委譲
      // 将来的には、ここでTask toolを呼び出す
      this.logger.info(`   Tasks: ${level.join(', ')}`);
    }

    this.logger.info('✅ All tasks completed');
  }
}
