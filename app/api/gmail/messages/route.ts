import { NextRequest, NextResponse } from "next/server";
import { getMessage, getThread, listMessages, MailFilters } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const id = sp.get("id");
    const threadId = sp.get("threadId");

    if (id) {
      const msg = await getMessage(id);
      return NextResponse.json(msg);
    }

    if (threadId) {
      const thread = await getThread(threadId);
      return NextResponse.json(thread);
    }

    const afterDaysRaw = sp.get("afterDays");
    const afterDays = afterDaysRaw ? Number(afterDaysRaw) : undefined;
    if (afterDays !== undefined && (!Number.isFinite(afterDays) || afterDays < 1)) {
      return NextResponse.json({ error: "afterDays must be a positive number" }, { status: 400 });
    }

    const filters: MailFilters = {
      query: sp.get("query") || undefined,
      sender: sp.get("sender") || undefined,
      afterDays,
      unreadOnly: sp.get("unreadOnly") === "true",
      label: sp.get("label") === "SENT" ? "SENT" : "INBOX",
    };

    const messages = await listMessages(filters);
    return NextResponse.json(messages);
  } catch (error: any) {
    console.error("Gmail messages error", error);
    const msg = error?.message || "Gmail is not connected or the request failed.";
    return NextResponse.json(
      { error: `${msg} Visit /api/gmail/auth to connect or refresh authorization.` },
      { status: 500 }
    );
  }
}
