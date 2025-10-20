import OpenAI from 'openai';
import type { ParsedContext, WhitepaperPlan } from '../types/index.js';

/**
 * LLM Service Configuration
 */
interface LLMServiceConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * LLM API Response for Whitepaper Plans
 */
interface WhitepaperPlansResponse {
  items: Array<{
    No: number;
    タイトル: string;
    目的: string;
    '内容（概要）': string;
    感情的ニーズ: string;
    機能的ニーズ: string;
    成果的ニーズ: string;
    'ニーズ（複数）': string;
    ターゲット: string;
    '職種／部署': string;
    レベル: string;
    構成: string;
    コメント: string;
  }>;
}

/**
 * LLM Service
 * Provides AI-powered whitepaper plan generation using OpenAI GPT-5
 * with Structured Outputs (Response Schema)
 *
 * @example
 * ```typescript
 * const llmService = new LLMService({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-5'
 * });
 *
 * const context: ParsedContext = {
 *   salesText: 'Product features...',
 *   targetText: 'Target market analysis...',
 *   keywords: ['AI', 'ML', 'automation']
 * };
 *
 * const plans = await llmService.generatePlans(context, 3);
 * ```
 */
export class LLMService {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  /**
   * Creates a new LLM Service instance
   *
   * @param config - Configuration for the LLM service
   * @throws {Error} If API key is not provided
   */
  constructor(config: LLMServiceConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model || 'gpt-5';
    this.maxTokens = config.maxTokens ?? 4096;
    // Note: GPT-5 only supports default temperature value
  }

  /**
   * Generates whitepaper plans based on parsed context
   *
   * Uses OpenAI's Structured Outputs feature to ensure the response
   * conforms exactly to the WhitepaperPlan schema with N fixed items
   *
   * @param context - Parsed context from sales materials, target documents, and keywords
   * @param count - Number of plans to generate (must be >= 1)
   * @returns Array of whitepaper plans with exactly `count` items
   * @throws {Error} If count is less than 1
   * @throws {Error} If OpenAI API call fails
   * @throws {Error} If response parsing fails
   *
   * @example
   * ```typescript
   * const plans = await llmService.generatePlans({
   *   salesText: 'Product features...',
   *   targetText: 'Target market...',
   *   keywords: ['AI', 'automation']
   * }, 3);
   * // Returns exactly 3 WhitepaperPlan objects
   * ```
   */
  async generatePlans(context: ParsedContext, count: number): Promise<WhitepaperPlan[]> {
    if (count < 1) {
      throw new Error('Count must be at least 1');
    }

    try {
      const systemPrompt = this.getSystemPrompt();
      const userPrompt = this.buildPrompt(context, count);

      // Use JSON mode (GPT-5 doesn't support json_schema structured outputs)
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: this.maxTokens,
        response_format: {
          type: 'json_object',
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        // Log full response for debugging
        console.error('OpenAI API Response:', JSON.stringify(response, null, 2));
        throw new Error(`Empty response from OpenAI API. Finish reason: ${response.choices[0]?.finish_reason || 'unknown'}`);
      }

      // Parse the structured JSON response
      const parsed = JSON.parse(content) as WhitepaperPlansResponse;

      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid response structure: missing items array');
      }

      if (parsed.items.length !== count) {
        throw new Error(
          `Expected ${count} plans but received ${parsed.items.length}`
        );
      }

      // Transform API response to WhitepaperPlan objects
      const plans: WhitepaperPlan[] = parsed.items.map((item, index) => ({
        no: item.No || index + 1,
        タイトル: item.タイトル,
        目的: item.目的,
        内容概要: item['内容（概要）'],
        感情的ニーズ: item.感情的ニーズ,
        機能的ニーズ: item.機能的ニーズ,
        成果的ニーズ: item.成果的ニーズ,
        ニーズ複数: item['ニーズ（複数）'],
        ターゲット: item.ターゲット,
        職種部署: item['職種／部署'],
        レベル: item.レベル,
        構成: item.構成,
        コメント: item.コメント || '',
      }));

      return plans;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw known errors with context
        throw new Error(`Failed to generate whitepaper plans: ${error.message}`);
      }
      // Handle unknown error types
      throw new Error('Failed to generate whitepaper plans: Unknown error');
    }
  }

  /**
   * Returns the system prompt for whitepaper plan generation
   *
   * Defines the AI's role, expertise, and output requirements
   *
   * @returns System prompt string
   * @private
   */
  private getSystemPrompt(): string {
    return `あなたはB2Bマーケティングの編集者です。以下の入力（営業資料/ターゲット/SEOキーワード）から、検索意図・差別化・実務適用性に優れたホワイトペーパー企画を N 件出します。列定義に厳密に従い、日本語で具体的に書きます。重複と冗長は排除します。

主な役割：
- 営業資料から製品/サービスの価値提案を理解する
- ターゲット層の課題や関心事を特定する
- SEOキーワードを自然に組み込む
- 多様で補完的なホワイトペーパー企画を作成する
- ビジネスインパクトとオーディエンスの関連性に基づいて優先順位をつける

出力要件：
- 各企画は独自で重複しないこと
- 内容概要は詳細で実行可能であること（3-5文）
- ターゲットは具体的に（例：「中堅SaaS企業のIT部門責任者」）
- 構成はH2/H3で章立て
- コメント列は空文字列で生成
- No は 1 起算の連番

要求された件数ちょうどを返す必要があります。`;
  }

  /**
   * Builds the user prompt with context and requirements
   *
   * Structures the input context and specifies output requirements
   *
   * @param context - Parsed context from input documents
   * @param count - Number of plans to generate
   * @returns Formatted user prompt string
   * @private
   */
  private buildPrompt(context: ParsedContext, count: number): string {
    const keywordsText = context.keywords.length > 0
      ? context.keywords.join(', ')
      : 'キーワード指定なし';

    return `【営業資料要約】
${context.salesText || '営業資料なし'}

【ターゲット情報】
${context.targetText || 'ターゲット情報なし'}

【SEOキーワード（配列）】
${keywordsText}

【出力フォーマット】
- 列：No, タイトル, 目的, 内容（概要）, 感情的ニーズ, 機能的ニーズ, 成果的ニーズ, ニーズ（複数）, ターゲット, 職種／部署, レベル, 構成, コメント
- No は 1 からの連番
- 構成は H2/H3 で章立て（例: ## 第1章 背景と課題 ### 1-1 市場動向）
- 競合が多いキーワードはサブトピック/角度を変えて差別化
- ${count} 件の企画を出力してください

## 重要な指示
- 感情的ニーズ: 読者が抱える不安や願望（例: 「遅れを取りたくない」「安心したい」）
- 機能的ニーズ: 具体的な機能要求（例: 「工数削減」「可視化」）
- 成果的ニーズ: 達成したい成果（例: 「売上20%増」「離職率低減」）
- ニーズ（複数）: 上記3つを簡潔にまとめたもの
- タイトルは具体的で魅力的に
- 目的は1-2文で明確に

## 構成フィールドの例
## 第1章 DX推進の背景と課題
### 1-1 製造業を取り巻くデジタル化の波
### 1-2 従来システムの限界と課題

## 第2章 ○○による解決アプローチ
### 2-1 クラウド基盤の選定ポイント
### 2-2 段階的導入のロードマップ

## 第3章 導入事例と成果
### 3-1 A社の事例（製造業・従業員500名）
### 3-2 ROI試算と効果測定

JSONのみを返してください。items配列に ${count} 件のオブジェクトを含むJSON形式で出力してください。`;
  }

}

/**
 * Factory function to create an LLM Service instance from environment variables
 *
 * @returns Configured LLMService instance
 * @throws {Error} If OPENAI_API_KEY environment variable is not set
 *
 * @example
 * ```typescript
 * import { createLLMService } from './services/llm.js';
 *
 * const llmService = createLLMService();
 * const plans = await llmService.generatePlans(context, 5);
 * ```
 */
export function createLLMService(): LLMService {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5';
  const maxTokens = process.env.OPENAI_MAX_TOKENS
    ? parseInt(process.env.OPENAI_MAX_TOKENS, 10)
    : undefined;

  return new LLMService({
    apiKey,
    model,
    maxTokens,
  });
}
