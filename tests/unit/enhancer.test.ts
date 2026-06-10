import { describe, expect, it } from "vitest";
import { createEnhancer, noopEnhancer } from "@/lib/enhancer";

const CTX = { url: "https://example.com", issueType: "js_rendered_content", stack: "Next.js" };

describe("PromptEnhancer seam", () => {
  it("noopEnhancer returns the prompt untouched", async () => {
    await expect(noopEnhancer.enhance("template prompt", CTX)).resolves.toBe(
      "template prompt",
    );
  });

  it("createEnhancer without an API key is the no-op path", async () => {
    const enhancer = createEnhancer(undefined);
    await expect(enhancer.enhance("template prompt", CTX)).resolves.toBe(
      "template prompt",
    );
  });

  it("createEnhancer with a bogus key still falls back to the template on failure", async () => {
    // The implementation must never throw or degrade the scan — a dead API,
    // bad key, or missing network all resolve to the original template.
    const enhancer = createEnhancer("sk-ant-invalid-key-for-test");
    await expect(enhancer.enhance("template prompt", CTX)).resolves.toBe(
      "template prompt",
    );
  }, 30_000);
});
