import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, body: content, inReplyToMessageId } = body ?? {};
    if (!to || !subject || !content) {
      return NextResponse.json({ error: "To, subject, and body are required." }, { status: 400 });
    }
    const result = await sendMessage({ to, subject, body: content, inReplyToMessageId });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gmail send error", error);
    return NextResponse.json({ error: "Unable to send the email. Check Gmail authorization and the recipient address." }, { status: 500 });
  }
}
