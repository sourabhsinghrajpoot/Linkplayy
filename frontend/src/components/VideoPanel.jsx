import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileVideo, HardDrive, ExternalLink, Heart } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function VideoPanel({ video, favorites, onFavoritesChange, resumeSeconds }) {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const [saved, setSaved] = useState(false);
  const lastSavedAtRef = useRef(0);

  const isFav = !!(video && favorites?.find((f) => f.source_url === video.source_url));

  // Resume from continue-watching
  useEffect(() => {
    if (!video || !videoRef.current || !resumeSeconds || resumeSeconds < 3) return;
    const el = videoRef.current;
    const setTime = () => {
      try {
        el.currentTime = resumeSeconds;
      } catch (_) {}
    };
    if (el.readyState >= 1) setTime();
    else el.addEventListener("loadedmetadata", setTime, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.source_url]);

  // Save continue-watching every 10s
  useEffect(() => {
    if (!video || !user || user === false) return;
    const el = videoRef.current;
    if (!el) return;

    const onTime = () => {
      const now = Date.now();
      if (now - lastSavedAtRef.current < 10000) return;
      if (!el.duration || el.currentTime < 3) return;
      lastSavedAtRef.current = now;
      api
        .saveContinue({
          source_url: video.source_url,
          position_seconds: Math.floor(el.currentTime),
          duration_seconds: Math.floor(el.duration || 0),
          title: video.title,
          thumbnail: video.thumbnail,
        })
        .catch(() => {});
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [video, user]);

  if (!video) return null;

  const handleFavorite = async () => {
    if (!user || user === false) {
      toast.error("Sign in to save favorites");
      return;
    }
    setSaved(true);
    try {
      if (isFav) {
        await api.removeFavorite(video.source_url);
        toast.success("Removed from favorites");
      } else {
        await api.addFavorite({
          source_url: video.source_url,
          title: video.title,
          size: video.size,
          thumbnail: video.thumbnail,
        });
        toast.success("Saved to favorites");
      }
      onFavoritesChange && onFavoritesChange();
    } catch (e) {
      toast.error("Could not update favorites");
    } finally {
      setSaved(false);
    }
  };

  return (
    <section
      data-testid="video-panel"
      className="max-w-7xl mx-auto px-4 sm:px-8 pb-16 fade-up"
    >
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Video Player - takes 2 cols */}
        <div className="lg:col-span-2">
          <div
            data-testid="video-player-container"
            className="relative rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl"
          >
            <video
              key={video.download_url}
              ref={videoRef}
              data-testid="video-player"
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-black"
              poster={video.thumbnail || undefined}
              crossOrigin="anonymous"
            >
              <source src={video.download_url} />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>

        {/* Info Bento */}
        <div className="space-y-4">
          <div
            data-testid="video-info-card"
            className="rounded-2xl border border-white/10 bg-[#0c0c0e] p-6"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#e63946]/10 border border-[#e63946]/30 flex items-center justify-center flex-shrink-0">
                <FileVideo className="w-5 h-5 text-[#e63946]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono-lp uppercase tracking-widest text-zinc-500 mb-1">
                  Now Playing
                </div>
                <div
                  data-testid="video-title"
                  className="font-display font-bold text-lg leading-tight break-words"
                >
                  {video.title || "Untitled"}
                </div>
              </div>
            </div>

            {video.size && (
              <div className="flex items-center gap-2 py-3 border-t border-white/5 text-sm">
                <HardDrive className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-400">File size</span>
                <span
                  data-testid="video-size"
                  className="ml-auto font-mono-lp font-bold text-white"
                >
                  {video.size}
                </span>
              </div>
            )}

            <a
              href={video.download_url}
              target="_blank"
              rel="noopener noreferrer"
              download
              data-testid="download-btn"
              className="mt-4 flex items-center justify-center gap-2 w-full bg-[#e63946] hover:bg-[#f04856] text-white font-semibold py-3 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </a>

            <button
              onClick={handleFavorite}
              disabled={saved}
              data-testid="favorite-btn"
              className={`mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border transition-colors ${
                isFav
                  ? "bg-[#e63946]/10 border-[#e63946]/40 text-[#e63946]"
                  : "border-white/10 text-zinc-300 hover:border-white/20 hover:text-white"
              }`}
            >
              <Heart className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />
              {isFav ? "Favorited" : "Save to favorites"}
            </button>

            <a
              href={video.source_url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="open-source-link"
              className="mt-2 flex items-center justify-center gap-2 w-full text-sm text-zinc-400 hover:text-white py-2 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View original link
            </a>
          </div>

          {video.thumbnail && (
            <div
              data-testid="video-thumbnail-card"
              className="rounded-2xl border border-white/10 bg-[#0c0c0e] overflow-hidden"
            >
              <img
                src={video.thumbnail}
                alt="thumbnail"
                className="w-full h-40 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
