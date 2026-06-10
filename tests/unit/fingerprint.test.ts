import { describe, expect, it } from "vitest";
import { fingerprint } from "@/lib/engine/fingerprint";

describe("fingerprint", () => {
  it.each([
    ["WordPress", `<link rel="stylesheet" href="/wp-content/themes/x/style.css">`],
    ["WordPress", `<meta name="generator" content="WordPress 6.5">`],
    ["Next.js", `<script id="__NEXT_DATA__" type="application/json">{}</script>`],
    ["Next.js", `<script>self.__next_f.push([1,"x"])</script>`],
    ["Nuxt", `<script>window.__NUXT__={}</script>`],
    ["Gatsby", `<div id="___gatsby"></div>`],
    ["Angular", `<app-root ng-version="17.3.0"></app-root>`],
    ["Vue", `<div data-v-7ba5bd90 class="card"></div>`],
    ["React", `<div data-reactroot=""></div>`],
    ["SvelteKit", `<script>{ __sveltekit_1a2b3c: true }</script>`],
  ])("detects %s", (stack, html) => {
    expect(fingerprint(`<html><body>${html}</body></html>`).stack).toBe(stack);
  });

  it("prefers the meta-framework over the underlying library", () => {
    const html = `<div data-reactroot=""></div><script id="__NEXT_DATA__"></script>`;
    const fp = fingerprint(html);
    expect(fp.stack).toBe("Next.js");
    expect(fp.signals.length).toBeGreaterThanOrEqual(2);
  });

  it("flags an empty root container as a client-rendered app", () => {
    const fp = fingerprint(`<html><body><div id="root"></div></body></html>`);
    expect(fp.stack).toBe("client-rendered JS app");
  });

  it("falls back to plain HTML", () => {
    expect(fingerprint(`<html><body><p>hi</p></body></html>`).stack).toBe(
      "plain HTML / unknown",
    );
  });
});
