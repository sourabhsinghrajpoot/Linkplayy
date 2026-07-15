import React from "react";
import { PlayCircle, Trash2 } from "lucide-react";

function pct(pos, dur) {
  if (!dur || dur === 0) return 0;
  return Math.max(0, Math.min(100, (pos / dur) * 100));
}

export default function ContinueWatching({ items, onResume, onRemove }) {
  if (!items || items.length === 0) return null;

  return (
    <section
      data-testid="continue-watching-section"
      className="max-w-7xl mx-auto px-4 sm:px-8 pb-16"
    >
      <div className="mb-6">
        <div className="font-mono-lp text-xs uppercase tracking-widest text-zinc-500 mb-1">
          Pick up where you left off
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold">
          Continue Watching
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it, idx) => (
          <div
            key={idx}
            data-testid={`continue-item-${idx}`}
            className="group rounded-xl border border-white/10 bg-[#0c0c0e] overflow-hidden hover:border-white/20 transition-colors"
          >
            <button
              onClick={() => onResume(it.source_url, it.position_seconds)}
              className="block w-full text-left"
            >
              <div className="relative aspect-video bg-black">
                {it.thumbnail ? (
                  <img
                    src={it.thumbnail}
                    alt=""
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
                  <PlayCircle className="w-12 h-12 text-white drop-shadow-lg" strokeWidth={1.5} />
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
                  <div
                    className="h-full bg-[#e63946] transition-all"
                    style={{ width: `${pct(it.position_seconds, it.duration_seconds)}%` }}
                    data-testid={`continue-progress-${idx}`}
                  />
                </div>
              </div>
              <div className="p-3">
                <div className="font-display font-semibold text-sm truncate">
                  {it.title || "Terabox video"}
                </div>
                <div className="font-mono-lp text-xs text-zinc-500 mt-0.5">
                  {Math.floor(pct(it.position_seconds, it.duration_seconds))}% watched
                </div>
              </div>
            </button>
            <button
              onClick={() => onRemove(it.source_url)}
              data-testid={`continue-remove-${idx}`}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-500 hover:text-[#e63946] border-t border-white/5 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
