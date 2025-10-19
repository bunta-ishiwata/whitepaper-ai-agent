export class OpenAIService {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-5-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Rewrite a single cell value using GPT-5 mini (Responses API)
   */
  async rewriteCell(
    original: string,
    instruction: string,
    context: {
      columnName: string;
      rowIndex: number;
      allHeaders: string[];
    }
  ): Promise<string> {
    try {
      const systemPrompt = `あなたはエンタープライズ向けビジネス文書のリライト専門家です。
スプレッドシートのセル値を、ユーザーの指示に従って書き換えてください。

## リライトの原則

### 1. 指示を最優先
- 指示された改善点は、大胆に反映する
- 「もっと○○」という指示は、明確に変化が分かるレベルで対応
- 曖昧な表現は具体的に、冗長な部分は簡潔に

### 2. 品質向上の具体例
- 「初心者にもわかる言葉づかい」→ 専門用語を平易な言葉に置き換え、補足説明を追加
- 「具体例がもっと欲しい」→ 数値例、判断基準、シナリオなどを明示的に追加
- 「簡潔に」→ 冗長な修飾語を削除し、要点を明確化

### 3. 文体の統一
- ビジネス文書として自然で読みやすい文体を維持
- 「です・ます調」で統一

出力は書き換え後のテキストのみを返してください（説明不要）。`;

      const userPrompt = `# 書き換え対象
列名: ${context.columnName}
行番号: ${context.rowIndex + 1}
元のテキスト: ${original}

# 書き換え指示
${instruction}

# 全体のコンテキスト
この列は、以下の列を含むホワイトペーパー企画表の一部です:
${context.allHeaders.join(', ')}

上記の指示に従って、元のテキストを書き換えてください。`;

      // Responses API形式
      const payload = {
        model: this.model,
        reasoning: {
          effort: 'low', // GPT-5の推論時間を短縮
        },
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: systemPrompt,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: userPrompt,
              },
            ],
          },
        ],
      };

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      // Responses API: output配列から type="message" を探す
      if (result.output && Array.isArray(result.output)) {
        const messageOutput = result.output.find((o: any) => o.type === 'message');

        if (messageOutput && messageOutput.content && messageOutput.content[0]) {
          const content = messageOutput.content[0];

          if (content.type === 'output_text' && content.text) {
            return content.text.trim();
          }
        }
      }

      throw new Error('OpenAI returned empty or invalid response structure');
    } catch (error: any) {
      console.error('OpenAI rewrite error:', error.message);
      throw new Error(`Failed to rewrite cell: ${error.message}`);
    }
  }

  /**
   * Rewrite multiple rows in batch using GPT-5 mini with JSON Schema (Responses API)
   */
  async rewriteBatch(
    rows: Array<{
      row_index: number;
      data: Record<string, string>;
      comment: string;
    }>,
    headers: string[]
  ): Promise<Array<Record<string, string>>> {
    try {
      // Generate JSON Schema for structured output
      const schema = await this.generateSchema(headers);

      const systemPrompt = `あなたはエンタープライズ向けビジネス文書のリライト専門家です。
スプレッドシートの複数行を、各行のコメント列の指示に従って一括で書き換えます。

## リライトの原則

### 1. コメントの指示を最優先
- 各行のコメントに書かれた指示を最優先で反映
- 「もっと○○」という指示は、明確に変化が分かるレベルで対応
- 曖昧な表現は具体的に、冗長な部分は簡潔に

### 2. 品質向上の具体例
- 「初心者にもわかる言葉づかい」→ 専門用語を平易な言葉に置き換え、補足説明を追加
- 「具体例がもっと欲しい」→ 数値例、判断基準、シナリオなどを明示的に追加
- 「簡潔に」→ 冗長な修飾語を削除し、要点を明確化

### 3. 文体の統一
- ビジネス文書として自然で読みやすい文体を維持
- 「です・ます調」で統一

### 4. 行間の整合性
- 複数行をまとめて処理する場合、全体の整合性を保つ
- 同じカテゴリやトピックの行は表現を統一

出力は、指定されたJSON Schemaに従って、書き換え後の全行データを返してください。`;

      // Build user prompt with all rows
      let userPrompt = '# 書き換え対象の行データ\n\n';
      rows.forEach((row, idx) => {
        userPrompt += `## 行 ${row.row_index + 1}\n`;
        userPrompt += `コメント（書き換え指示）: ${row.comment}\n`;
        userPrompt += `現在のデータ:\n`;
        Object.entries(row.data).forEach(([key, value]) => {
          userPrompt += `  - ${key}: ${value}\n`;
        });
        userPrompt += '\n';
      });

      userPrompt += `\n上記の各行について、コメントの指示に従って書き換えてください。\n`;
      userPrompt += `\n**重要**: 各行の row_index は入力と同じ値を必ず保持してください。変更してはいけません。\n`;
      userPrompt += `出力は以下のJSON Schemaに従ってください:\n`;
      userPrompt += JSON.stringify(schema, null, 2);

      // Responses API with JSON Schema (using text.format instead of response_format)
      const payload = {
        model: this.model,
        reasoning: {
          effort: 'low',
        },
        text: {
          format: {
            type: 'json_schema',
            name: 'rewrite_batch_response',
            schema: schema,
            strict: true,
          },
        },
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: systemPrompt,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: userPrompt,
              },
            ],
          },
        ],
      };

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      // Parse Responses API output
      if (result.output && Array.isArray(result.output)) {
        const messageOutput = result.output.find((o: any) => o.type === 'message');

        if (messageOutput && messageOutput.content && messageOutput.content[0]) {
          const content = messageOutput.content[0];

          if (content.type === 'output_text' && content.text) {
            const parsed = JSON.parse(content.text);
            if (parsed.rows && Array.isArray(parsed.rows)) {
              // Fix row_index to match input (OpenAI sometimes changes it)
              const fixedRows = parsed.rows.map((row: any, idx: number) => {
                return {
                  ...row,
                  row_index: rows[idx].row_index, // Use original row_index from input
                };
              });
              return fixedRows;
            }
          }
        }
      }

      throw new Error('OpenAI returned empty or invalid batch response');
    } catch (error: any) {
      console.error('OpenAI batch rewrite error:', error.message);
      throw new Error(`Failed to rewrite batch: ${error.message}`);
    }
  }

  /**
   * Generate JSON Schema from column headers using GPT-5 mini (Responses API)
   */
  async generateSchema(headers: string[]): Promise<any> {
    try {
      // 動的にJSON Schemaを生成（元のGASコードと同じロジック）
      const properties: any = {
        row_index: { type: 'integer' },
      };

      headers.forEach((header) => {
        properties[header] = { type: 'string' };
      });

      const requiredFields = ['row_index'].concat(headers);

      const schema = {
        type: 'object',
        required: ['rows'],
        additionalProperties: false,
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              required: requiredFields,
              additionalProperties: false,
              properties: properties,
            },
          },
        },
      };

      return schema;
    } catch (error: any) {
      console.error('Schema generation error:', error.message);
      throw new Error(`Failed to generate schema: ${error.message}`);
    }
  }
}
