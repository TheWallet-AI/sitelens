import { test, expect } from "vitest";
import {
  isContactLink,
  isNextStepLink,
  linkActions,
} from "../../src/core/actions";

const link = (text: string, url = "https://example.com/x") => ({ text, url });

test.each([
  ["Book a table", "booking"],
  ["Reservations", "booking"],
  ["立即预约", "booking"],
  ["線上訂位", "booking"],
  ["ご予約はこちら", "booking"],
  ["Buat tempahan", "booking"],
  ["Order online", "order"],
  ["在线点餐", "order"],
  ["立即購買", "order"],
  ["注文する", "order"],
  ["Beli sekarang", "order"],
  ["Register now", "register"],
  ["活动报名", "register"],
  ["お申し込み", "register"],
  ["Daftar", "register"],
  ["Request a quote", "enquiry"],
  ["免费咨询", "enquiry"],
  ["Minta sebut harga", "enquiry"],
])("%s → %s", (text, kind) => {
  expect(linkActions(link(text))).toContain(kind);
  expect(isNextStepLink(link(text))).toBe(true);
});

test("percent-encoded CJK paths are recognized", () => {
  expect(
    linkActions(link("", "https://example.com/%E9%A2%84%E7%BA%A6")),
  ).toContain("booking");
});

test.each([
  "Facebook",
  "Notebook collection",
  "In order to help",
  "About us",
  "关于我们",
  "Our story",
  "Terms",
])("no false positive for %s", (text) => {
  expect(isNextStepLink(link(text, "https://example.com/about"))).toBe(false);
});

test("contact cues in five languages", () => {
  for (const text of [
    "Contact us",
    "联系我们",
    "聯絡我們",
    "お問い合わせ",
    "Hubungi kami",
  ])
    expect(isContactLink(link(text))).toBe(true);
  expect(isContactLink(link("", "mailto:hi@example.com"))).toBe(true);
  expect(isContactLink(link("Gallery"))).toBe(false);
});
