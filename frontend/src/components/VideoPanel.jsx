import React from "react";
import { Button } from "@/components/ui/button";
import { Download, FileVideo, HardDrive, ExternalLink } from "lucide-react";

export default function VideoPanel({ video }) {
  if (!video) return null;

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
