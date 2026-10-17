/**
 * Recognizes customer next steps from link text and link URLs.
 *
 * Precision matters more than recall: a false "booking link found" tells a
 * business owner a problem is solved when it is not. So only links are
 * inspected (never body prose), English words need word boundaries, and a
 * match proves only that a link exists, not that the flow behind it works.
 *
 * Languages: English, Simplified Chinese, Traditional Chinese, Japanese,
 * Malay. CJK terms have no word boundaries, so the list uses specific
 * compounds ("预约", not "约").
 */
export const ACTION_KINDS = ["booking", "order", "register", "enquiry"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

const PATTERNS: Record<ActionKind, RegExp> = {
  booking: new RegExp(
    [
      String.raw`\b(?:book(?:ing|ings)?|reserv(?:e|ation|ations)|appointments?|schedule an?)\b`,
      "预约|预订|预定|订位|订座|订房|預約|預訂|預定|訂位|訂座|訂房",
      "予約|ご予約|予約する",
      String.raw`\b(?:tempah(?:an)?|temujanji|buat tempahan)\b`,
    ].join("|"),
    "i",
  ),
  order: new RegExp(
    [
      // "order" but not the phrase "in order to".
      String.raw`(?<!\bin\s)\border\b(?!\s+to\b)|\b(?:buy(?:\s+now)?|add to cart|cart|checkout|shop(?:\s+now)?|purchase)\b`,
      "下单|点餐|订餐|购买|立即购买|购物车|结账|下單|點餐|訂餐|購買|立即購買|購物車|結帳",
      "注文|購入|カート|お買い物",
      String.raw`\b(?:beli(?:\s+sekarang)?|pesan(?:an)?|troli|bayar)\b`,
    ].join("|"),
    "i",
  ),
  register: new RegExp(
    [
      String.raw`\b(?:register|registration|sign\s?up|enrol(?:l|ment)?|join(?:\s+now|\s+us)?|rsvp|tickets?)\b`,
      "报名|注册|登记|購票|报名参加|報名|註冊|登記",
      "登録|申し込み|申込|お申し込み|参加申込",
      String.raw`\b(?:daftar|pendaftaran|sertai)\b`,
    ].join("|"),
    "i",
  ),
  enquiry: new RegExp(
    [
      String.raw`\b(?:enquir(?:e|y|ies)|inquir(?:e|y|ies)|request a quote|get a quote|request a callback)\b`,
      "咨询|询价|在线咨询|免费咨询|諮詢|詢價|查詢",
      "お問い合わせフォーム|見積|ご相談",
      String.raw`\b(?:pertanyaan|sebut harga|minta sebut harga)\b`,
    ].join("|"),
    "i",
  ),
};

/** Decode a URL path for matching ("%E9%A2%84%E7%BA%A6" → "预约"). */
function decodedPath(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "mailto:" || parsed.protocol === "tel:") return "";
    return decodeURIComponent(parsed.pathname).replace(/[-_/.]+/g, " ");
  } catch {
    return "";
  }
}

/** Which action kinds a single link represents. */
export function linkActions(link: { url: string; text: string }): ActionKind[] {
  const haystack = `${link.text} ${decodedPath(link.url)}`;
  return ACTION_KINDS.filter((kind) => PATTERNS[kind].test(haystack));
}

const CONTACT = new RegExp(
  [
    String.raw`\b(?:contact(?:\s+us)?|get in touch)\b`,
    "联系我们|联系方式|聯絡我們|聯繫我們|联络",
    "お問い合わせ|問い合わせ|お問合せ|連絡先",
    String.raw`\b(?:hubungi(?:\s+kami)?)\b`,
  ].join("|"),
  "i",
);

/** A link that lets a visitor contact the business. */
export function isContactLink(link: { url: string; text: string }): boolean {
  return (
    /^(mailto:|tel:)/i.test(link.url) ||
    CONTACT.test(`${link.text} ${decodedPath(link.url)}`) ||
    linkActions(link).includes("enquiry")
  );
}

/** A link that offers a booking, order, registration or enquiry step. */
export function isNextStepLink(link: { url: string; text: string }): boolean {
  return linkActions(link).length > 0;
}
