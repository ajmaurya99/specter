/**
 * Optional AI layer — the seam, not the dependency. The engine's template
 * prompts are the product; an enhancer MAY post-process them when an
 * ANTHROPIC_API_KEY exists. With no key (or on any failure) the app silently
 * uses the templates — it must never fail or degrade without a key.
 */

export interface EnhancerContext {
  url: string;
  issueType: string;
  stack: string;
}

export interface PromptEnhancer {
  enhance(prompt: string, ctx: EnhancerContext): Promise<string>;
}

export const noopEnhancer: PromptEnhancer = {
  enhance: async (prompt) => prompt,
};

const ENHANCER_MODEL = "claude-opus-4-8";

export function createEnhancer(apiKey: string | undefined): PromptEnhancer {
  if (!apiKey) return noopEnhancer;

  return {
    async enhance(prompt, ctx) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: ENHANCER_MODEL,
          max_tokens: 2048,
          system:
            "You polish fix-it prompts that developers paste into AI coding assistants. " +
            "Keep every concrete fact (URLs, selectors, numbers, evidence) exactly as given; " +
            "tighten wording, improve the numbered requirements for the specific stack, and " +
            "return ONLY the improved prompt text.",
          messages: [
            {
              role: "user",
              content: `Stack: ${ctx.stack}\nIssue type: ${ctx.issueType}\n\n${prompt}`,
            },
          ],
        });
        const text = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        return text.length > 0 ? text : prompt;
      } catch {
        return prompt; // any failure → template, silently
      }
    },
  };
}
