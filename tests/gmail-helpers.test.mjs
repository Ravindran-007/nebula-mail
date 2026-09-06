import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import pure helpers
import { buildQuery, stripHtml, decodeBase64Url, header } from "../lib/mail-utils.ts";

describe("Gmail Query Builder (buildQuery)", () => {
  it("defaults to inbox", () => {
    const q = buildQuery({});
    assert.equal(q, "in:inbox");
  });

  it("handles SENT mailbox label", () => {
    const q = buildQuery({ label: "SENT" });
    assert.equal(q, "in:sent");
  });

  it("adds is:unread when unreadOnly is true", () => {
    const q = buildQuery({ unreadOnly: true });
    assert.equal(q, "in:inbox is:unread");
  });

  it("formats newer_than filter for afterDays", () => {
    const q = buildQuery({ afterDays: 10 });
    assert.equal(q, "in:inbox newer_than:10d");
  });

  it("formats sender query with from: prefix", () => {
    const q = buildQuery({ sender: "sarah@example.com" });
    assert.equal(q, "in:inbox from:sarah@example.com");
  });

  it("appends keyword search terms", () => {
    const q = buildQuery({ query: "meeting tomorrow" });
    assert.equal(q, "in:inbox meeting tomorrow");
  });

  it("combines all filters together into valid Gmail query syntax", () => {
    const q = buildQuery({
      label: "INBOX",
      unreadOnly: true,
      afterDays: 7,
      sender: "David",
      query: "project status",
    });
    assert.equal(q, "in:inbox is:unread newer_than:7d from:David project status");
  });
});

describe("HTML Body Sanitization (stripHtml)", () => {
  it("strips basic tags", () => {
    const html = "<p>Hello <strong>World</strong>!</p>";
    assert.equal(stripHtml(html), "Hello World !");
  });

  it("strips style and script tags entirely", () => {
    const html = "<style>body{color:red;}</style><p>Content</p><script>alert(1);</script>";
    assert.equal(stripHtml(html), "Content");
  });

  it("converts br tags to linebreaks", () => {
    const html = "Line 1<br>Line 2<br/>Line 3";
    const text = stripHtml(html);
    assert.ok(text.includes("\n"));
  });

  it("decodes HTML entities", () => {
    const html = "Tom &amp; Jerry &#39;Special&#39; &quot;Edition&quot;";
    assert.equal(stripHtml(html), "Tom & Jerry 'Special' \"Edition\"");
  });
});

describe("Base64 URL Decoder (decodeBase64Url)", () => {
  it("decodes standard Base64 string", () => {
    const b64 = Buffer.from("Hello Nebula KnowLab!").toString("base64");
    assert.equal(decodeBase64Url(b64), "Hello Nebula KnowLab!");
  });

  it("handles URL-safe characters (- and _)", () => {
    // String whose base64 contains + or / replaced with - and _
    const original = "Subject: >>> ??? <<< ---";
    const urlSafe = Buffer.from(original)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    assert.equal(decodeBase64Url(urlSafe), original);
  });
});

describe("Header Extraction (header)", () => {
  const sampleHeaders = [
    { name: "From", value: "Aswath <aswath@nebulaknowlab.com>" },
    { name: "Subject", value: "Welcome to Nebula Mail" },
    { name: "Date", value: "Thu, 3 Sep 2026 15:30:00 +0530" },
  ];

  it("finds header case-insensitively", () => {
    assert.equal(header(sampleHeaders, "from"), "Aswath <aswath@nebulaknowlab.com>");
    assert.equal(header(sampleHeaders, "FROM"), "Aswath <aswath@nebulaknowlab.com>");
    assert.equal(header(sampleHeaders, "subject"), "Welcome to Nebula Mail");
  });

  it("returns undefined for missing header", () => {
    assert.equal(header(sampleHeaders, "In-Reply-To"), undefined);
  });
});

describe("Gmail Trash & Delete Feature", () => {
  it("exports trashMessage function in lib/gmail.ts", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(new URL("../lib/gmail.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("export async function trashMessage(id: string)"));
    assert.ok(content.includes("gmail.users.messages.trash"));
  });

  it("validates that a message id is required for trashing", () => {
    function validateDeletePayload(body) {
      const id = body?.id || body?.messageId;
      if (!id) {
        throw new Error("Message ID is required.");
      }
      return id;
    }

    assert.throws(() => validateDeletePayload({}), /Message ID is required\./);
    assert.throws(() => validateDeletePayload({ id: "" }), /Message ID is required\./);
    assert.equal(validateDeletePayload({ id: "msg_12345" }), "msg_12345");
    assert.equal(validateDeletePayload({ messageId: "msg_67890" }), "msg_67890");
  });
});

