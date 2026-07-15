import React, { useEffect, useRef, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 * AuthCallback handles the #session_id=... fragment returned by Emergent OAuth.
 * It exchanges the session_id for a user session, then removes the fragment and
 * renders the main app.
 */
export default function AuthCallback({ children }) {
  const { setUser } = useAuth();
  const processed = useRef(false);
  const [status, setStatus] = useState("processing");
  const [error, setError] = useState("");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) {
      setStatus("done");
      return;
    }
    const sessionId = decodeURIComponent(match[1]);

    (async () => {
      try {
        const u = await api.googleExchange(sessionId);
        setUser(u);
        // Clean the URL fragment so we don't reprocess on refresh
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        setStatus("done");
      } catch (e) {
        setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
        setStatus("error");
      }
    })();
  }, [setUser]);

  if (status === "processing") {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#e63946]" />
        <div className="font-display text-xl">Signing you in with Google…</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center gap-3 p-6">
        <div className="font-display text-2xl">Google sign-in failed</div>
        <div className="text-zinc-400 text-sm max-w-md text-center">{error}</div>
        <button
          onClick={() => {
            window.location.href = "/";
          }}
          className="mt-4 px-4 py-2 rounded-lg bg-[#e63946] text-white font-semibold"
        >
          Back to home
        </button>
      </div>
    );
  }

  return children;
}
