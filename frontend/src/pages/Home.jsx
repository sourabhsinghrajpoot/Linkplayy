import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import HeroInput from "@/components/HeroInput";
import VideoPanel from "@/components/VideoPanel";
import HistoryList from "@/components/HistoryList";
import PricingCard from "@/components/PricingCard";
import AuthModal from "@/components/AuthModal";
import PaymentModal from "@/components/PaymentModal";
import ContinueWatching from "@/components/ContinueWatching";
import FavoritesList from "@/components/FavoritesList";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const LOCAL_HISTORY_KEY = "linkplay_history_local";

function loadLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const isLoggedIn = !!(user && user !== false);
  const isPro = user && user.subscription_status === "pro";

  const [video, setVideo] = useState(null);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [history, setHistory] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [continueList, setContinueList] = useState([]);
  const [quota, setQuota] = useState({ used: 0, limit: 3, remaining: 3, is_pro: false });

  const [authOpen, setAuthOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  // Load quota (works for both guests and users)
  const refreshQuota = useCallback(async () => {
    try {
      const q = await api.quota();
      setQuota(q);
    } catch (e) {
      // fail-soft, keep defaults
    }
  }, []);

  // Load user-specific data
  const refreshUserData = useCallback(async () => {
    if (!isLoggedIn) {
      setHistory(loadLocalHistory());
      setFavorites([]);
      setContinueList([]);
      return;
    }
    try {
      const [h, f, c] = await Promise.all([
        api.listHistory(),
        api.listFavorites(),
        api.listContinue(),
      ]);
      setHistory(h);
      setFavorites(f);
      setContinueList(c);
    } catch (e) {
      // fail-soft
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (authLoading) return;
    refreshQuota();
    refreshUserData();
  }, [authLoading, refreshQuota, refreshUserData]);

  const addLocalHistory = (v) => {
    const entry = {
      source_url: v.source_url,
      title: v.title,
      size: v.size,
      thumbnail: v.thumbnail,
      played_at: new Date().toISOString(),
    };
    const cur = loadLocalHistory();
    const next = [entry, ...cur.filter((h) => h.source_url !== entry.source_url)].slice(0, 12);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(next));
    setHistory(next);
  };

  const handlePlay = useCallback(
    async (url, seekTo = 0) => {
      setPlaying(true);
      setVideo(null);
      setResumeSeconds(seekTo);
      try {
        const data = await api.extract(url);
        setVideo(data);
        setQuota(data.quota || quota);

        if (isLoggedIn) {
          api.saveHistory({
            source_url: data.source_url,
            title: data.title,
            size: data.size,
            thumbnail: data.thumbnail,
          })
            .then(() => refreshUserData())
            .catch(() => {});
        } else {
          addLocalHistory(data);
        }

        toast.success("Video ready");
        setTimeout(() => {
          document.getElementById("video-anchor")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      } catch (err) {
        const code = err.response?.status;
        const msg = formatApiErrorDetail(err.response?.data?.detail) || "Failed to load video";
        toast.error(msg);
        if (code === 429) {
          // Quota reached — offer upgrade
          if (!isLoggedIn) setAuthOpen(true);
          else setPayOpen(true);
        }
        refreshQuota();
      } finally {
        setPlaying(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoggedIn, quota, refreshQuota, refreshUserData]
  );

  const handleUpgrade = () => {
    if (!isLoggedIn) setAuthOpen(true);
    else setPayOpen(true);
  };

  const onAuthSuccess = () => {
    // reload data + open payment
    refreshQuota();
    refreshUserData();
    setTimeout(() => setPayOpen(true), 250);
  };

  const onPaySuccess = () => {
    refreshQuota();
    refreshUserData();
  };

  const clearAllHistory = async () => {
    if (isLoggedIn) {
      await api.clearHistory().catch(() => {});
    } else {
      localStorage.removeItem(LOCAL_HISTORY_KEY);
    }
    setHistory([]);
    toast.success("History cleared");
  };

  const removeFavorite = async (source_url) => {
    await api.removeFavorite(source_url).catch(() => {});
    setFavorites((prev) => prev.filter((f) => f.source_url !== source_url));
    toast.success("Removed from favorites");
  };

  const removeContinue = async (source_url) => {
    await api.removeContinue(source_url).catch(() => {});
    setContinueList((prev) => prev.filter((c) => c.source_url !== source_url));
  };

  const scrollToFavorites = () => {
    document.querySelector('[data-testid="favorites-section"]')?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full bg-[#e63946]/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-[600px] -right-40 w-[500px] h-[500px] rounded-full bg-[#facc15]/5 blur-[120px]" />

      <div className="relative z-10">
        <Header
          quota={quota}
          onUpgradeClick={handleUpgrade}
          onAuthClick={() => setAuthOpen(true)}
          onFavoritesClick={scrollToFavorites}
        />

        <HeroInput onPlay={(u) => handlePlay(u, 0)} loading={playing} />

        <div id="video-anchor" />
        <VideoPanel
          video={video}
          favorites={favorites}
          onFavoritesChange={refreshUserData}
          resumeSeconds={resumeSeconds}
        />

        {isLoggedIn && (
          <ContinueWatching
            items={continueList}
            onResume={(url, sec) => handlePlay(url, sec)}
            onRemove={removeContinue}
          />
        )}

        {isLoggedIn && (
          <FavoritesList
            items={favorites}
            onPlay={(url) => handlePlay(url, 0)}
            onRemove={removeFavorite}
          />
        )}

        <HistoryList
          items={history}
          onReplay={(url) => handlePlay(url, 0)}
          onClear={clearAllHistory}
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
      <PaymentModal open={payOpen} onOpenChange={setPayOpen} onSuccess={onPaySuccess} />
    </div>
  );
}
