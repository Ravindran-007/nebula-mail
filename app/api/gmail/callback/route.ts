import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, saveTokenFromCode } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(errorParam)}`, req.url));
  }

  if (!code) {
    if (isAuthorized()) {
      return NextResponse.redirect(new URL("/?auth=success", req.url));
    }
    return NextResponse.redirect(new URL("/?auth_error=missing_code", req.url));
  }

  try {
    await saveTokenFromCode(code);
    return NextResponse.redirect(new URL("/?auth=success", req.url));
  } catch (err: any) {
    console.error("Error exchanging OAuth code:", err?.message || err);
    if (isAuthorized()) {
      // Valid token is already present
      return NextResponse.redirect(new URL("/?auth=success", req.url));
    }
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(err?.message || "auth_failed")}`, req.url)
    );
  }
}
