import { test, expect } from "vitest";
import {
  candidateUrl,
  isLanguageSegment,
  languageKey,
  pickSamplePages,
  purposeOf,
} from "../../src/core/sampling";
import { actionEvidence } from "../../src/core/actions";
import { AIAnalysisSchema } from "../../src/core/schema";

const IH = "https://infoholder.io";
const LOCALES = ["en", "zh-HK", "jp", "ms", "zh"];

test("language segments are real language codes, not any two letters", () => {
  for (const one of ["en", "zh-HK", "zh_Hant", "jp", "pt-BR"])
    expect(isLanguageSegment(one)).toBe(true);
  for (const one of ["go", "us", "my", "m", "app-studio"])
    expect(isLanguageSegment(one)).toBe(false);
  expect(languageKey(`${IH}/app-studio/jp/pricing`)).toBe(
    languageKey(`${IH}/app-studio/en/pricing/`),
  );
});

test("purposes come from the path without language segments and from link text", () => {
  expect(purposeOf(`${IH}/app-studio/en`)).toBe("home");
  expect(purposeOf(`${IH}/app-studio/zh/pricing`)).toBe("pricing");
  expect(purposeOf("https://shop.example.com/p/1", "Book now")).toBe("action");
  expect(purposeOf("https://shop.example.com/blog/x")).toBe("other");
});

test("language versions of the homepage no longer fill the page budget", () => {
  const candidates = ["", "/templates", "/pricing", "/solutions"].flatMap(
    (path) => LOCALES.map((l) => ({ url: `${IH}/app-studio/${l}${path}` })),
  );
  const { picks } = pickSamplePages({
    entry: `${IH}/app-studio/en`,
    candidates,
    budget: 4,
  });
  const urls = picks.map((p) => p.url);
  expect(urls).toContain(`${IH}/app-studio/en/pricing`);
  expect(urls).toContain(`${IH}/app-studio/en/solutions`);
  expect(
    picks.filter((p) => p.purpose === "language_variant").length,
  ).toBeLessThanOrEqual(1);
});

test("candidates exclude other origins, query strings and files", () => {
  expect(candidateUrl("https://other.example.com/a", IH)).toBeNull();
  expect(candidateUrl(`${IH}/a?token=1`, IH)).toBeNull();
  expect(candidateUrl(`${IH}/menu.pdf`, IH)).toBeNull();
});

test("a booking link is only an entry point; a declaration is not verification", () => {
  expect(
    actionEvidence({
      links: [{ url: "https://x.example.com/book", text: "Book a table" }],
    }),
  ).toEqual([{ kind: "booking", level: "entry_found", basis: ["page_link"] }]);
  expect(
    actionEvidence({
      links: [],
      declared: [{ type: "reservation" }, { type: "unknown_verb" }],
    }),
  ).toEqual([
    { kind: "booking", level: "declared", basis: ["business_actions"] },
  ]);
});

test("AI claims may be unverifiable; older three-state analyses still parse", () => {
  const claim = (state: string) => ({ text: "x", state, evidenceIds: [] });
  const analysis = (state: string) => ({
    summary: claim("interpretation"),
    answers: Array.from({ length: 5 }, (_, i) => ({
      ...claim(i === 4 ? state : "unknown"),
      question: `q${i}`,
    })),
    improvements: [],
  });
  expect(
    AIAnalysisSchema.parse(analysis("unverifiable")).answers[4].state,
  ).toBe("unverifiable");
  expect(AIAnalysisSchema.parse(analysis("unknown")).answers[4].state).toBe(
    "unknown",
  );
  expect(() => AIAnalysisSchema.parse(analysis("guessed"))).toThrow();
});
