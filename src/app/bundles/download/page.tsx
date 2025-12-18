"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const isSafeZipName = (name: string) =>
  /^[a-z0-9][a-z0-9._-]{0,160}\.zip$/i.test(name) && !name.includes("..");

function BundleDownloadContent() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!name || !isSafeZipName(name)) {
        setError("Invalid bundle name.");
        return;
      }
      try {
        const supabase = supabaseBrowser();
        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;
        const userId = sessionData?.session?.user?.id ?? null;
        if (!userId) throw new Error("Not logged in.");

        const path = `${userId}/bundles/${name}`;
        const { data: signed, error: signedErr } = await supabase.storage
          .from("documents")
          .createSignedUrl(path, 60 * 60, { download: name });
        if (signedErr || !signed?.signedUrl) throw signedErr;

        window.location.assign(signed.signedUrl);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to create download link.");
      }
    };
    run();
  }, [name]);

  return (
    <div className="pit-page flex items-center justify-center">
      <div className="pit-card w-full max-w-md">
        <h1 className="pit-title mb-2" style={{ fontSize: "24px" }}>
          Preparing download…
        </h1>
        <p className="pit-subtitle mb-4">
          {name ? `Bundle: ${name}` : "Bundle download"}
        </p>
        {error ? <p className="pit-error text-sm">{error}</p> : <p className="text-sm">One moment…</p>}
      </div>
    </div>
  );
}

export default function BundleDownloadPage() {
  return (
    <Suspense
      fallback={
        <div className="pit-page flex items-center justify-center">
          <div className="pit-card w-full max-w-md">
            <h1 className="pit-title mb-2" style={{ fontSize: "24px" }}>
              Preparing download…
            </h1>
            <p className="pit-subtitle mb-4">Bundle download</p>
            <p className="text-sm">One moment…</p>
          </div>
        </div>
      }
    >
      <BundleDownloadContent />
    </Suspense>
  );
}
