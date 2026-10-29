/**
 * Bounded page sampling: within a fixed page budget, cover different page
 * purposes (services, pricing, contact, an action entry, about) before
 * repeating one, and never let language versions of the same page use up
 * the budget.
 *
 * - Language versions: URLs that are equal once locale path segments
 *   (`en`, `zh-HK`, `jp`, ...) are removed are the same page
 *   (`languageKey`), as are the entry page's hreflang alternates. One
 *   version is kept, preferring the entry page's language. When budget is
 *   left, one other-language version of the entry page is read last.
 * - Purpose: path segments and link text (several languages) classify a
 *   page (`purposeOf`). One page per purpose first, then the shallowest
 *   remaining pages.
 * - Same section first: from `/circle/en/m/shop`, pages under `/circle/...`
 *   are preferred over other sections of the same origin.
 *
 * Only same-origin URLs without a query string count, and files are
 * excluded. The hosted Infoholder checker has an equivalent implementation
 * (`apps/app-studio/src/lib/discoverability/sampling.ts`); keep them in step.
 */
import type { PagePurpose as ContractPurpose } from "./contract";

/** Purposes a page can be sampled for (the contract adds "language_variant" for the extra locale slot). */
export type PagePurpose = Exclude<ContractPurpose, "language_variant">;

const PURPOSE_ORDER: readonly PagePurpose[] = [
  "services",
  "pricing",
  "contact",
  "action",
  "about",
  "home",
];

export type SampleSkipReason = "language_variant" | "budget";

export interface SampleCandidate {
  url: string;
  text?: string;
}

export interface SamplePick {
  url: string;
  purpose: PagePurpose | "language_variant";
}

/**
 * Common language path segments. Only real language codes (with optional
 * region or script), never any two letters: `/go`, `/us`, `/my` are not
 * languages. `jp` is not BCP 47 but many sites use it.
 */
const LANGUAGE_CODES = new Set([
  "en",
  "zh",
  "ja",
  "jp",
  "ko",
  "ms",
  "id",
  "th",
  "vi",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "ru",
  "ar",
  "nl",
  "sv",
  "no",
  "da",
  "fi",
  "pl",
  "tr",
  "he",
  "hi",
  "tl",
  "fil",
  "km",
  "lo",
  "cs",
  "el",
  "hu",
  "ro",
  "uk",
  "bn",
  "ta",
]);
const REGION_TAGS = /^(?:hans|hant|[a-z]{2}|\d{3})$/;

/** Whether a path segment is a language code (`en`, `zh-HK`, `zh_Hant`, `pt-BR`). */
export function isLanguageSegment(segment: string): boolean {
  const value = segment.toLowerCase().replace(/_/g, "-");
  const [language, ...rest] = value.split("-");
  if (!language || !LANGUAGE_CODES.has(language)) return false;
  return rest.length <= 2 && rest.every((one) => REGION_TAGS.test(one));
}

const segmentsOf = (pathname: string): string[] => {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((one) => {
      try {
        return decodeURIComponent(one);
      } catch {
        return one;
      }
    });
};

/** The first language segment in a URL, or null. */
export function languageOf(url: string): string | null {
  try {
    return (
      segmentsOf(new URL(url).pathname)
        .find(isLanguageSegment)
        ?.toLowerCase() ?? null
    );
  } catch {
    return null;
  }
}

/** Shared key for language versions of one page: origin + path without language segments. */
export function languageKey(url: string): string {
  try {
    const parsed = new URL(url);
    const rest = segmentsOf(parsed.pathname)
      .filter((one) => !isLanguageSegment(one))
      .map((one) => one.toLowerCase());
    return `${parsed.origin}/${rest.join("/")}`;
  } catch {
    return url;
  }
}

const PURPOSE_PATTERNS: readonly [PagePurpose, RegExp][] = [
  [
    "pricing",
    /pricing|prices?|plans?|fees?|rates?|tariff|价格|價格|价目|價目|收费|收費|套餐|方案价|料金|プラン|価格|harga|yuran|pakej/i,
  ],
  [
    "contact",
    /contact|enquir|inquir|get-in-touch|location|find-us|联系|聯絡|聯繫|联络|门店|門店|地址|お問い合わせ|問い合わせ|アクセス|hubungi|lokasi/i,
  ],
  [
    "action",
    /book|reserv|appointment|order|shop|cart|checkout|buy|register|sign-?up|apply|enrol|enroll|quote|预约|預約|订位|訂位|预订|預訂|下单|落單|购买|購買|报名|報名|申请|申請|予約|注文|申込|購入|tempah|pesan|daftar|beli/i,
  ],
  [
    "services",
    /services?|solutions?|products?|menu|offerings?|treatments?|courses?|classes|programs?|catalog|collections?|服务|服務|产品|產品|菜单|菜單|课程|課程|方案|サービス|メニュー|商品|コース|perkhidmatan|produk|menu|kursus/i,
  ],
  [
    "about",
    /about|our-story|team|who-we-are|关于|關於|简介|簡介|团队|團隊|会社概要|私たち|について|tentang|kami/i,
  ],
];

/** What a page is likely for, from its path (without language segments) and link text. */
export function purposeOf(url: string, text = ""): PagePurpose {
  let all: string[];
  try {
    all = segmentsOf(new URL(url).pathname);
  } catch {
    return "other";
  }
  const rest = all.filter((one) => !isLanguageSegment(one));
  if (
    !rest.length ||
    (rest.length === 1 && isLanguageSegment(all[all.length - 1] ?? ""))
  )
    return "home";
  const haystack = `${rest.join("/")} ${text}`.slice(0, 300);
  for (const [purpose, pattern] of PURPOSE_PATTERNS)
    if (pattern.test(haystack)) return purpose;
  return "other";
}

const FILE_EXTENSION =
  /\.(?:pdf|jpe?g|png|gif|webp|svg|avif|ico|zip|gz|mp4|webm|mp3|wav|xml|txt|json|css|js|docx?|xlsx?|pptx?)$/i;

/** A same-origin, query-free, non-file URL normalized to origin + path; otherwise null. */
export function candidateUrl(raw: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.search || url.username || url.password)
    return null;
  if (FILE_EXTENSION.test(url.pathname)) return null;
  return `${url.origin}${url.pathname}`;
}

const samePage = (a: string, b: string): boolean =>
  a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

const sectionOf = (url: string): string => {
  try {
    return (
      segmentsOf(new URL(url).pathname)
        .filter((one) => !isLanguageSegment(one))[0]
        ?.toLowerCase() ?? ""
    );
  } catch {
    return "";
  }
};

const depthOf = (url: string): number => {
  try {
    return segmentsOf(new URL(url).pathname).filter(
      (one) => !isLanguageSegment(one),
    ).length;
  } catch {
    return 99;
  }
};

/**
 * Pick at most `budget` pages from the candidates. `entry` has already been
 * read (it and its language versions are not picked again, except for the
 * final local-language slot). `alternates` are the entry's hreflang URLs.
 */
export function pickSamplePages(input: {
  entry: string;
  candidates: readonly SampleCandidate[];
  budget: number;
  alternates?: readonly string[];
  exclude?: readonly string[];
}): {
  picks: SamplePick[];
  skipped: { url: string; reason: SampleSkipReason }[];
} {
  const entryKey = languageKey(input.entry);
  const entryLanguage = languageOf(input.entry);
  const entrySection = sectionOf(input.entry);
  const excluded = [input.entry, ...(input.exclude ?? [])];
  const skipped: { url: string; reason: SampleSkipReason }[] = [];

  const groups = new Map<
    string,
    {
      url: string;
      text: string;
      rank: number;
      order: number;
      variants: string[];
    }
  >();
  let order = 0;
  for (const candidate of input.candidates) {
    const url = candidate.url;
    if (excluded.some((one) => samePage(one, url))) continue;
    const key = languageKey(url);
    const language = languageOf(url);
    const rank = language === entryLanguage ? 0 : language === null ? 1 : 2;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        url,
        text: candidate.text ?? "",
        rank,
        order: order++,
        variants: [],
      });
      continue;
    }
    if (samePage(current.url, url)) {
      if (!current.text && candidate.text) current.text = candidate.text;
      continue;
    }
    if (rank < current.rank) {
      current.variants.push(current.url);
      current.url = url;
      current.rank = rank;
      if (candidate.text) current.text = candidate.text;
    } else current.variants.push(url);
  }

  const alternates = new Set(
    (input.alternates ?? []).map((one) => one.replace(/\/+$/, "")),
  );
  const entryVariants: string[] = [];
  const pool: { url: string; purpose: PagePurpose; order: number }[] = [];
  for (const [key, group] of groups) {
    if (key === entryKey || alternates.has(group.url.replace(/\/+$/, ""))) {
      entryVariants.push(group.url, ...group.variants);
      continue;
    }
    for (const variant of group.variants)
      skipped.push({ url: variant, reason: "language_variant" });
    pool.push({
      url: group.url,
      purpose: purposeOf(group.url, group.text),
      order: group.order,
    });
  }

  pool.sort(
    (a, b) =>
      Number(sectionOf(b.url) === entrySection) -
        Number(sectionOf(a.url) === entrySection) ||
      depthOf(a.url) - depthOf(b.url) ||
      a.order - b.order,
  );

  const picks: SamplePick[] = [];
  const taken = new Set<string>();
  const take = (url: string, purpose: SamplePick["purpose"]) => {
    picks.push({ url, purpose });
    taken.add(url);
  };
  const budget = Math.max(0, Math.floor(input.budget));
  const entryPurpose = purposeOf(input.entry);
  for (const sameSection of entrySection ? [true, false] : [false]) {
    for (const purpose of PURPOSE_ORDER) {
      if (picks.length >= budget) break;
      if (
        purpose === entryPurpose ||
        picks.some((one) => one.purpose === purpose)
      )
        continue;
      const hit = pool.find(
        (one) =>
          one.purpose === purpose &&
          !taken.has(one.url) &&
          (!sameSection || sectionOf(one.url) === entrySection),
      );
      if (hit) take(hit.url, purpose);
    }
  }
  for (const one of pool) {
    if (picks.length >= budget) break;
    if (!taken.has(one.url)) take(one.url, one.purpose);
  }
  const otherLanguage = entryVariants.find(
    (url) =>
      languageOf(url) !== entryLanguage &&
      !excluded.some((one) => samePage(one, url)),
  );
  if (otherLanguage && picks.length < budget)
    take(otherLanguage, "language_variant");
  for (const url of entryVariants)
    if (!taken.has(url) && !excluded.some((one) => samePage(one, url)))
      skipped.push({ url, reason: "language_variant" });
  for (const one of pool)
    if (!taken.has(one.url)) skipped.push({ url: one.url, reason: "budget" });
  return { picks, skipped };
}
