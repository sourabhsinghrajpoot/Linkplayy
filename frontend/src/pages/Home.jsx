import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import HeroInput from "@/components/HeroInput";
import VideoPanel from "@/components/VideoPanel";
import HistoryList from "@/components/HistoryList";
import PricingCard from "@/components/PricingCard";
import AuthModal from "@/components/AuthModal";
import PaymentModal from "@/components/PaymentModal";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const HISTORY_KEY = "linkplay_history";
const QUOTA_KEY = "linkplay_quota";
const DAILY_LIMIT = 3;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadQuota() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUOTA_KEY) || "{}");
    if (raw.date !== todayStr()) return { date: todayStr(), count: 0 };
    return raw;
  } catch {
    return { date: todayStr(), count: 0 };
  }
}

function saveQuota(q) {
  localStorage.setItem(QUOTA_KEY, JSON.stringify(q));
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function Home() {
  const { user } = useAuth();
  const isPro = user && user.subscription_status === "pro";

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(loadHistory());
  const [quota, setQuota] = useState(loadQuota());
  const [authOpen, setAuthOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const bumpQuota = () => {
    const next = { date: todayStr(), count: quota.count + 1 };
    setQuota(next);
    saveQuota(next);
  };

  const addHistory = (v) => {
    const entry = {
      id: v.id,
      source_url: v.source_url,
      title: v.title,
      size: v.size,
      played_at: new Date().toISOString(),
    };
    const next = [entry, ...history.filter((h) => h.source_url !== entry.source_url)].slice(0, 12);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
    toast.success("History cleared");
  };

  const handlePlay = useCallback(
    async (url) => {
      // Enforce quota for non-pro
      if (!isPro && quota.count >= DAILY_LIMIT) {
        toast.error(`Daily free limit reached (${DAILY_LIMIT}/day). Upgrade to Pro for unlimited playback.`);
        setPayOpen(false);
        setAuthOpen(false);
        // If user not logged in, ask them to sign up first via pricing flow
        if (!user || user === false) {
          setAuthOpen(true);
        } else {
          setPayOpen(true);
        }
        return;
      }

      setLoading(true);
      setVideo(null);
      try {
        const data = await api.extract(url);
        setVideo(data);
        if (!isPro) bumpQuota();
        addHistory(data);
        toast.success("Video ready");
        setTimeout(() => {
          document.getElementById("video-anchor")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      } catch (err) {
        toast.error(
          formatApiErrorDetail(err.response?.data?.detail) ||
            "Failed to load video"
        );
      } finally {
        setLoading(false);
      }
    },
    [isPro, quota.count, user, history]
  );

  const handleUpgrade = () => {
    if (!user || user === false) {
      setAuthOpen(true);
    } else {
      setPayOpen(true);
    }
  };

  const onAuthSuccess = () => {
    // After signing up from upgrade CTA, open payment
    setTimeout(() => setPayOpen(true), 250);
  };

  useEffect(() => {
    // reset quota if date changed
    const q = loadQuota();
    if (q.date !== quota.date) setQuota(q);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-[#e63946]/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-[600px] -right-40 w-[500px] h-[500px] rounded-full bg-[#facc15]/5 blur-[120px]" />

      <div className="relative z-10">
        <Header
          dailyUsed={quota.count}
          dailyLimit={DAILY_LIMIT}
          onUpgradeClick={handleUpgrade}
          onAuthClick={() => setAuthOpen(true)}
        />

        <HeroInput onPlay={handlePlay} loading={loading} />

        <div id="video-anchor" />
        <VideoPanel video={video} />

        <HistoryList
          items={history}
          onReplay={(url) => handlePlay(url)}
          onClear={clearHistory}
        />

        <PricingCard onSubscribe={handleUpgrade} isPro={isPro} />

        <footer className="border-t border-white/5 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-500">
            <div className="font-display font-bold">
              link<span className="text-[#e63946]">play</span>
            </div>
            <div className="font-mono-lp text-xs">
              Made for streaming Terabox links, instantly.
            </div>
          </div>
        </footer>
      </div>

      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSuccess={onAuthSuccess}
      />
      <PaymentModal open={payOpen} onOpenChange={setPayOpen} />
    </div>
  );
}
