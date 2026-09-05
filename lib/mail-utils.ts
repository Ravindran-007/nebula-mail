import type { MailFilters } from "./types";

export function header(headers: any[] | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  return headers.find((h) => String(h.name).toLowerCase() === name.toLowerCase())
    ?.value as string | undefined;
}

export function decodeBase64Url(value: string): string {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf-8"
  );
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(?=.)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function buildQuery(filters: MailFilters): string {
  const qParts: string[] = [filters.label === "SENT" ? "in:sent" : "in:inbox"];
  if (filters.unreadOnly) qParts.push("is:unread");
  if (filters.afterDays && filters.afterDays > 0) {
    qParts.push(`newer_than:${Math.floor(filters.afterDays)}d`);
  }
  if (filters.sender?.trim()) {
    qParts.push(`from:${filters.sender.trim()}`);
  }
  if (filters.query?.trim()) {
    qParts.push(filters.query.trim());
  }
  return qParts.join(" ");
}
