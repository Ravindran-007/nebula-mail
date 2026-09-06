import { NextRequest, NextResponse } from "next/server";
import { trashMessage, isAuthorized } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized()) {
      return NextResponse.json(
        { error: "Gmail account is not authorized." },
        { status: 401 }
      );
    }

    let id: string | null = null;
    try {
      const body = await req.json();
      id = body?.id || body?.messageId || null;
    } catch {
      // Body might be empty; try searchParams
    }

    if (!id) {
      const searchParams = req.nextUrl.searchParams;
      id = searchParams.get("id") || searchParams.get("messageId");
    }

    if (!id) {
      return NextResponse.json(
        { error: "Message ID is required." },
        { status: 400 }
      );
    }

    const result = await trashMessage(id);
    return NextResponse.json({
      success: true,
      id,
      message: "Email moved to trash.",
      result,
    });
  } catch (error: any) {
    console.error("Gmail trash error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to move email to trash." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  return POST(req);
}
