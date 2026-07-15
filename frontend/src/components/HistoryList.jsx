import React from "react";
import { Clock, Play, Trash2 } from "lucide-react";

function timeAgo(iso) {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
}

export default function HistoryList({ items, onReplay, onClear }) {
  if (!items || items.length === 0) return null;

  return (
    <section
      data-testid="history-section"
      className="max-w-7xl mx-auto px-4 sm:px-8 pb-16"
    >
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono-lp text-xs uppercase tracking-widest text-zinc-500 mb-1">
            Session History
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold">
            Recently Played
          </h2>
        </div>
        <button
          data-testid="clear-history-btn"
          onClick={onClear}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-[#e63946] transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear all
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((it, idx) => (
          <button
            key={it.id || idx}
            data-testid={`history-item-${idx}`}
            onClick={() => onReplay(it.source_url)}
            className="group text-left rounded-xl border border-white/10 bg-[#0c0c0e] hover:bg-[#121214] hover:border-white/20 p-4 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#e63946]/10 border border-[#e63946]/30 flex items-center justify-center flex-shrink-0 group-hover:bg-[#e63946] transition-colors">
                <Play className="w-4 h-4 text-[#e63946] group-hover:text-white transition-colors fill-current" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold text-sm text-white truncate">
                  {it.title || "Terabox video"}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  <span className="font-mono-lp text-xs text-zinc-500">
                    {timeAgo(it.played_at)}
                  </span>
                  {it.size && (
                    <>
                      <span className="text-zinc-700">•</span>
                      <span className="font-mono-lp text-xs text-zinc-500">
                        {it.size}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
