import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const parseAuthToken = (request: Request): string | null => {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/sb-access-token=([^;]+)/);
  if (match && match[1]) return decodeURIComponent(match[1]);
  return null;
};

const isSafeZipName = (name: string) =>
  /^[a-z0-9][a-z0-9._-]{0,160}\.zip$/i.test(name) && !name.includes("..");

export async function GET(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name || !isSafeZipName(name)) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const token = parseAuthToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const path = `${user.id}/bundles/${name}`;
    const { data: signed, error: signedErr } = await supabase.storage
      .from("documents")
      .createSignedUrl(path, 3600, { download: name });
    if (signedErr || !signed?.signedUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to download bundle" },
      { status: 500 }
    );
  }
}
