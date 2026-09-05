import { google } from "googleapis";
import fs from "fs";
import path from "path";
import type { ThreadDetail, ThreadMessage } from "./types";

const TOKEN_PATH = process.env.TOKEN_STORE_PATH
  ? path.resolve(process.cwd(), process.env.TOKEN_STORE_PATH)
  : path.join(process.cwd(), ".gmail-token.json");

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
      client.setCredentials(token);
    } catch (e) {
      console.error("Error reading token file:", e);
    }
  }

  client.on("tokens", (tokens) => {
    try {
      const existing = fs.existsSync(TOKEN_PATH)
        ? JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"))
        : {};
      const merged = { ...existing, ...tokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to auto-save refreshed token", err);
    }
  });

  return client;
}

export function isAuthorized(): boolean {
  if (!fs.existsSync(TOKEN_PATH)) return false;
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    return Boolean(token?.access_token || token?.refresh_token);
  } catch {
    return false;
  }
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
  });
}

export async function saveTokenFromCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf-8");
  client.setCredentials(tokens);
  return client;
}

function gmailClient() {
  const auth = getOAuthClient();
  return google.gmail({ version: "v1", auth });
}

export interface MailSummary {
  id: string;
  threadId: string;
  from: string;
  to?: string;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
}

export interface MailDetail extends MailSummary {
  to: string;
  body: string;
  messageIdHeader?: string;
  references?: string;
  thread?: ThreadDetail;
}

export interface MailFilters {
  query?: string;
  sender?: string;
  afterDays?: number;
  unreadOnly?: boolean;
  label?: "INBOX" | "SENT";
}

import { header, decodeBase64Url, stripHtml, buildQuery } from "./mail-utils";
export { header, decodeBase64Url, stripHtml, buildQuery };

function isStubText(text: string): boolean {
  if (!text) return true;
  const lower = text.trim().toLowerCase();
  return (
    lower.includes("please enable html") ||
    lower.includes("please enable javascript") ||
    lower.includes("enable javascript") ||
    lower.includes("enable html") ||
    lower === "please enable html to view this message" ||
    lower === "please enable javascript to view this message"
  );
}

export function decodeBody(payload: any): string {
  if (!payload) return "";

  let plainText = "";
  let htmlText = "";

  function walk(part: any) {
    if (!part) return;
    if (part.mimeType === "text/plain" && part.body?.data && !plainText) {
      plainText = decodeBase64Url(part.body.data);
    }
    if (part.mimeType === "text/html" && part.body?.data && !htmlText) {
      htmlText = stripHtml(decodeBase64Url(part.body.data));
    }
    if (part.parts && Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  // Check top-level payload body directly
  if (payload.body?.data) {
    const text = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      htmlText = stripHtml(text);
    } else {
      plainText = text;
    }
  }

  walk(payload);

  // If plainText exists and is not a placeholder stub, use it
  if (plainText && !isStubText(plainText)) {
    return plainText;
  }

  // Fallback to cleaned HTML text if plainText was just a stub (e.g. "Please Enable HTML")
  if (htmlText) {
    return htmlText;
  }

  return plainText || "";
}


export async function listMessages(filters: MailFilters = {}): Promise<MailSummary[]> {
  const gmail = gmailClient();
  const list = await gmail.users.messages.list({
    userId: "me",
    q: buildQuery(filters),
    maxResults: 25,
  });

  const messages = list.data.messages || [];
  const details = await Promise.all(
    messages.map(async (m) => {
      if (!m.id) return null;
      try {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const headers = msg.data.payload?.headers || [];
        return {
          id: msg.data.id!,
          threadId: msg.data.threadId!,
          from: header(headers, "From") || "",
          to: header(headers, "To"),
          subject: header(headers, "Subject") || "(no subject)",
          preview: msg.data.snippet || "",
          date: header(headers, "Date") || "",
          unread: (msg.data.labelIds || []).includes("UNREAD"),
        } satisfies MailSummary;
      } catch (err) {
        return null;
      }
    })
  );

  return details.filter(Boolean) as MailSummary[];
}

export async function getThread(threadId: string): Promise<ThreadDetail | null> {
  try {
    const gmail = gmailClient();
    const res = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const messages: ThreadMessage[] = (res.data.messages || []).map((msg) => {
      const headers = msg.payload?.headers || [];
      return {
        id: msg.id!,
        threadId: msg.threadId!,
        from: header(headers, "From") || "",
        to: header(headers, "To") || "",
        subject: header(headers, "Subject") || "(no subject)",
        preview: msg.snippet || "",
        date: header(headers, "Date") || "",
        unread: (msg.labelIds || []).includes("UNREAD"),
        body: decodeBody(msg.payload),
      };
    });

    return {
      id: threadId,
      messages,
    };
  } catch (err) {
    console.error("Error fetching thread:", err);
    return null;
  }
}

export async function getMessage(id: string): Promise<MailDetail> {
  const gmail = gmailClient();
  const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const headers = msg.data.payload?.headers || [];

  if ((msg.data.labelIds || []).includes("UNREAD")) {
    await gmail.users.messages
      .modify({
        userId: "me",
        id,
        requestBody: { removeLabelIds: ["UNREAD"] },
      })
      .catch(() => {});
  }

  let thread: ThreadDetail | undefined;
  if (msg.data.threadId) {
    const threadData = await getThread(msg.data.threadId);
    if (threadData) {
      thread = threadData;
    }
  }

  return {
    id: msg.data.id!,
    threadId: msg.data.threadId!,
    from: header(headers, "From") || "",
    to: header(headers, "To") || "",
    subject: header(headers, "Subject") || "(no subject)",
    preview: msg.data.snippet || "",
    date: header(headers, "Date") || "",
    unread: false,
    body: decodeBody(msg.data.payload),
    messageIdHeader: header(headers, "Message-ID"),
    references: header(headers, "References"),
    thread,
  };
}

function headerValue(name: string, value: string) {
  return `${name}: ${value}`;
}

export async function sendMessage(opts: {
  to: string;
  subject: string;
  body: string;
  inReplyToMessageId?: string;
  threadId?: string;
}) {
  const gmail = gmailClient();
  let threadId: string | undefined = opts.threadId;
  let replyHeaders: string[] = [];

  if (opts.inReplyToMessageId) {
    try {
      const original = await gmail.users.messages.get({
        userId: "me",
        id: opts.inReplyToMessageId,
        format: "metadata",
        metadataHeaders: ["Message-ID", "References"],
      });
      if (!threadId) {
        threadId = original.data.threadId || undefined;
      }
      const headers = original.data.payload?.headers || [];
      const originalMessageId = header(headers, "Message-ID");
      const references = header(headers, "References");
      if (originalMessageId) replyHeaders.push(headerValue("In-Reply-To", originalMessageId));
      if (references || originalMessageId) {
        replyHeaders.push(
          headerValue("References", [references, originalMessageId].filter(Boolean).join(" "))
        );
      }
    } catch (e) {
      console.warn("Could not fetch in-reply-to message headers:", e);
    }
  }

  const lines = [
    headerValue("To", opts.to),
    headerValue("Subject", opts.subject),
    "Content-Type: text/plain; charset=utf-8",
    ...replyHeaders,
    "",
    opts.body,
  ];

  const raw = Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId },
  });

  return res.data;
}
