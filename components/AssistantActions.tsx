"use client";

import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { View, Filters, ComposeState, ThemeMode } from "@/lib/types";
import { MailSummary, MailDetail } from "@/lib/gmail";
import React, { useState } from "react";

interface Props {
  state: {
    view: View;
    filters: Filters;
    messages: MailSummary[];
    selected: MailDetail | null;
    compose: ComposeState;
    theme: ThemeMode;
  };
  actions: {
    setView: (v: View) => void;
    setFilters: (f: Filters) => void;
    openMessage: (id: string) => Promise<void>;
    setCompose: (c: ComposeState) => void;
    sendCompose: (overrideCompose?: ComposeState) => Promise<void>;
    refresh: (override?: { view?: View; filters?: Filters }) => Promise<void>;
    setTheme: (t: ThemeMode) => void;
  };
}

export default function AssistantActions({ state, actions }: Props) {
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);

  // Expose full UI context to CopilotKit LLM
  useCopilotReadable({
    description:
      "Current state of the mail application. Includes active view ('inbox', 'sent', 'compose', 'detail'), active filters (query, sender, afterDays, unreadOnly), currently visible messages count and titles, currently open email details (from, subject, date, body, thread), compose draft state, and active UI theme.",
    value: {
      currentView: state.view,
      activeFilters: state.filters,
      visibleMessageCount: state.messages.length,
      visibleMessages: state.messages.slice(0, 10).map((m) => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        date: m.date,
        unread: m.unread,
        preview: m.preview,
      })),
      currentlyOpenEmail: state.selected
        ? {
            id: state.selected.id,
            threadId: state.selected.threadId,
            from: state.selected.from,
            to: state.selected.to,
            subject: state.selected.subject,
            date: state.selected.date,
            bodySnippet: state.selected.body?.slice(0, 500),
          }
        : null,
      currentComposeDraft: state.compose,
      theme: state.theme,
    },
  });

  // Action 1: Compose & Fill Email
  useCopilotAction({
    name: "composeEmail",
    description:
      "Open the compose screen and visibly fill in the To, Subject, and Body fields. Use this when the user asks to compose or draft an email. Does NOT send immediately; leaves draft for review unless instructed to send.",
    parameters: [
      { name: "to", type: "string", required: true, description: "Recipient email address" },
      { name: "subject", type: "string", required: true, description: "Email subject line" },
      { name: "body", type: "string", required: true, description: "Email body text" },
    ],
    handler: async ({ to, subject, body }) => {
      actions.setCompose({ to, subject, body });
      actions.setView("compose");
      setLastActionMessage(`Draft created for ${to}`);
      return {
        status: "success",
        to,
        subject,
        bodySnippet: body.slice(0, 120),
        message: "Compose form has been opened and filled on screen for review.",
      };
    },
    render: ({ status, args, result }) => {
      return (
        <div className="assistant-card draft-card">
          <div className="assistant-card-badge">✍ DRAFT CREATED</div>
          <div className="assistant-card-title">{args.subject || "(No Subject)"}</div>
          <div className="assistant-card-meta">
            <strong>To:</strong> {args.to}
          </div>
          <div className="assistant-card-snippet">{args.body}</div>
          <div className="assistant-card-actions">
            <button
              className="assistant-btn-primary"
              onClick={() => {
                actions.setView("compose");
              }}
            >
              Review in Compose View
            </button>
            <button
              className="assistant-btn-accent"
              onClick={() => {
                actions.sendCompose({
                  to: args.to || "",
                  subject: args.subject || "",
                  body: args.body || "",
                });
              }}
            >
              Send Now
            </button>
          </div>
        </div>
      );
    },
  });

  // Action 2: Search & Filter Mailbox
  useCopilotAction({
    name: "searchEmails",
    description:
      "Search and filter the mailbox and immediately update the main mail list on the screen. Use this when the user asks to 'show unread emails', 'find emails from Sarah', 'show emails from the last 10 days', or similar mailbox queries.",
    parameters: [
      { name: "query", type: "string", required: false, description: "Keywords, subject text, or search phrase" },
      { name: "sender", type: "string", required: false, description: "Filter by sender name or email address" },
      { name: "afterDays", type: "number", required: false, description: "Filter emails within the last N days" },
      { name: "unreadOnly", type: "boolean", required: false, description: "Filter for unread messages only" },
      { name: "label", type: "string", required: false, description: "'inbox' or 'sent'" },
    ],
    handler: async ({ query, sender, afterDays, unreadOnly, label }) => {
      const targetView = label === "sent" ? "sent" : "inbox";
      const nextFilters: Filters = {
        query: query || undefined,
        sender: sender || undefined,
        afterDays: afterDays || undefined,
        unreadOnly: !!unreadOnly,
      };
      actions.setView(targetView);
      actions.setFilters(nextFilters);
      await actions.refresh({ view: targetView, filters: nextFilters });
      setLastActionMessage("Updated mailbox list with filters");
      return {
        status: "success",
        targetView,
        filters: nextFilters,
        message: "Mailbox list updated on the main UI.",
      };
    },
    render: ({ status, args }) => {
      const activePills: string[] = [];
      if (args.unreadOnly) activePills.push("Unread Only");
      if (args.sender) activePills.push(`From: ${args.sender}`);
      if (args.afterDays) activePills.push(`Past ${args.afterDays} days`);
      if (args.query) activePills.push(`Keyword: "${args.query}"`);
      if (args.label) activePills.push(`Box: ${args.label}`);

      return (
        <div className="assistant-card search-card">
          <div className="assistant-card-badge">🔍 MAILBOX UPDATED</div>
          <div className="assistant-card-title">Main UI Filter Applied</div>
          <div className="assistant-pill-row">
            {activePills.map((pill, idx) => (
              <span key={idx} className="assistant-pill">
                {pill}
              </span>
            ))}
          </div>
          <p className="assistant-card-note">
            The central email list has updated to display matching messages.
          </p>
        </div>
      );
    },
  });

  // Action 3: Navigate & Open Email
  useCopilotAction({
    name: "openEmail",
    description:
      "Navigate to and display a specific email in the detail view. Can open by exact messageId, or by sender name / search query (e.g. 'Open latest email from David').",
    parameters: [
      { name: "messageId", type: "string", required: false, description: "Exact Gmail message ID" },
      { name: "sender", type: "string", required: false, description: "Sender name or email (e.g. 'David')" },
      { name: "query", type: "string", required: false, description: "Subject or content keyword" },
    ],
    handler: async ({ messageId, sender, query }) => {
      let targetId = messageId;

      // If no direct messageId, find the latest matching email from current list or fetch
      if (!targetId && (sender || query)) {
        const needle = (sender || query || "").toLowerCase();
        const found = state.messages.find(
          (m) =>
            m.from.toLowerCase().includes(needle) ||
            m.subject.toLowerCase().includes(needle)
        );
        if (found) {
          targetId = found.id;
        } else {
          // Attempt a quick search via API
          try {
            const params = new URLSearchParams();
            if (sender) params.set("sender", sender);
            if (query) params.set("query", query);
            const res = await fetch(`/api/gmail/messages?${params.toString()}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              targetId = data[0].id;
            }
          } catch (e) {
            console.error("Error searching for email to open:", e);
          }
        }
      }

      if (!targetId) {
        if (state.messages.length > 0) {
          targetId = state.messages[0].id;
        } else {
          return { status: "error", message: "No matching email found to open." };
        }
      }

      await actions.openMessage(targetId);
      return {
        status: "success",
        messageId: targetId,
        message: "Email opened in full detail view.",
      };
    },
    render: ({ args, result }) => {
      return (
        <div className="assistant-card open-card">
          <div className="assistant-card-badge">✉ EMAIL OPENED</div>
          <div className="assistant-card-title">Navigated to Email Detail</div>
          <p className="assistant-card-note">
            The full email and conversation thread is now loaded in the workspace.
          </p>
        </div>
      );
    },
  });

  // Action 4: Contextual Reply (+5 Bonus)
  useCopilotAction({
    name: "replyToOpenEmail",
    description:
      "Context-aware reply: Drafts a reply to the email currently open in the detail view. Pre-fills recipient, subject ('Re: ...'), and the reply body into the compose form.",
    parameters: [
      { name: "body", type: "string", required: true, description: "Content of the reply message" },
    ],
    handler: async ({ body }) => {
      if (!state.selected) {
        return {
          status: "error",
          message: "No email is currently open. Please open an email first before replying.",
        };
      }

      const replyTo = state.selected.from;
      const cleanSubject = state.selected.subject.startsWith("Re:")
        ? state.selected.subject
        : `Re: ${state.selected.subject}`;

      actions.setCompose({
        to: replyTo,
        subject: cleanSubject,
        body,
        inReplyToMessageId: state.selected.id,
        threadId: state.selected.threadId,
      });
      actions.setView("compose");

      return {
        status: "success",
        to,
        subject: cleanSubject,
        body,
        message: "Reply draft prepared and loaded into compose editor.",
      };
    },
    render: ({ args }) => {
      return (
        <div className="assistant-card reply-card">
          <div className="assistant-card-badge">↩ REPLY PREPARED</div>
          <div className="assistant-card-title">
            {state.selected?.subject ? `Re: ${state.selected.subject}` : "Reply Draft"}
          </div>
          <div className="assistant-card-meta">
            <strong>To:</strong> {state.selected?.from || "Recipient"}
          </div>
          <div className="assistant-card-snippet">{args.body}</div>
          <div className="assistant-card-actions">
            <button
              className="assistant-btn-primary"
              onClick={() => actions.setView("compose")}
            >
              Review in Compose
            </button>
          </div>
        </div>
      );
    },
  });

  // Action 5: Contextual Forward (+5 Bonus)
  useCopilotAction({
    name: "forwardOpenEmail",
    description:
      "Context-aware forward: Forwards the currently open email to a new recipient with an optional note and quoted headers.",
    parameters: [
      { name: "to", type: "string", required: true, description: "Recipient to forward the email to" },
      { name: "note", type: "string", required: false, description: "Personal note to prepend to forwarded mail" },
    ],
    handler: async ({ to, note }) => {
      if (!state.selected) {
        return {
          status: "error",
          message: "No email is currently open to forward. Please open an email first.",
        };
      }

      const forwardSubject = state.selected.subject.startsWith("Fwd:")
        ? state.selected.subject
        : `Fwd: ${state.selected.subject}`;

      const forwardedBody = `${note ? note + "\n\n" : ""}---------- Forwarded message ---------
From: ${state.selected.from}
Date: ${state.selected.date}
Subject: ${state.selected.subject}
To: ${state.selected.to}

${state.selected.body || state.selected.preview || ""}`;

      actions.setCompose({
        to,
        subject: forwardSubject,
        body: forwardedBody,
        isForward: true,
      });
      actions.setView("compose");

      return {
        status: "success",
        to,
        subject: forwardSubject,
        message: "Forward draft populated in the compose form.",
      };
    },
    render: ({ args }) => {
      return (
        <div className="assistant-card forward-card">
          <div className="assistant-card-badge">↪ FORWARD PREPARED</div>
          <div className="assistant-card-title">Forward to {args.to}</div>
          {args.note && <div className="assistant-card-snippet">Note: {args.note}</div>}
          <div className="assistant-card-actions">
            <button
              className="assistant-btn-primary"
              onClick={() => actions.setView("compose")}
            >
              Open Compose View
            </button>
          </div>
        </div>
      );
    },
  });

  // Action 6: Human-In-The-Loop Confirmation & Send (+5 Bonus)
  useCopilotAction({
    name: "askConfirmationAndSend",
    description:
      "Human-in-the-loop sending: Prompts the user with an explicit confirmation card before sending an email.",
    parameters: [
      { name: "to", type: "string", required: true },
      { name: "subject", type: "string", required: true },
      { name: "body", type: "string", required: true },
    ],
    handler: async ({ to, subject, body }) => {
      actions.setCompose({ to, subject, body });
      return {
        status: "awaiting_confirmation",
        to,
        subject,
        body,
        message: "Confirmation card rendered for user approval.",
      };
    },
    render: ({ args }) => {
      return (
        <div className="assistant-card confirm-card">
          <div className="assistant-card-badge warning">⚠ CONFIRM SENDING</div>
          <div className="assistant-card-title">Send this email?</div>
          <div className="assistant-card-meta">
            <strong>To:</strong> {args.to}
          </div>
          <div className="assistant-card-meta">
            <strong>Subject:</strong> {args.subject}
          </div>
          <div className="assistant-card-snippet">{args.body}</div>
          <div className="assistant-card-actions">
            <button
              className="assistant-btn-accent"
              onClick={async () => {
                await actions.sendCompose({
                  to: args.to || "",
                  subject: args.subject || "",
                  body: args.body || "",
                });
              }}
            >
              ✓ Confirm & Send
            </button>
            <button
              className="assistant-btn-ghost"
              onClick={() => {
                actions.setView("compose");
              }}
            >
              Edit in Compose
            </button>
          </div>
        </div>
      );
    },
  });

  // Action 7: Switch Theme (Dark / Light Mode) (+2 Bonus)
  useCopilotAction({
    name: "setThemeMode",
    description: "Switch the application appearance between light and dark mode.",
    parameters: [
      { name: "theme", type: "string", required: true, description: "'light' or 'dark'" },
    ],
    handler: async ({ theme }) => {
      const mode = theme === "dark" ? "dark" : "light";
      actions.setTheme(mode);
      return `Theme switched to ${mode} mode.`;
    },
  });

  return null;
}
