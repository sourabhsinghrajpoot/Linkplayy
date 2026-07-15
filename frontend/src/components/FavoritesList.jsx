import React from "react";
import { Heart, Play, X } from "lucide-react";

export default function FavoritesList({ items, onPlay, onRemove }) {
  if (!items || items.length === 0) return null;

  return (
    <section
      data-testid="favorites-section"
      className="max-w-7xl mx-auto px-4 sm:px-8 pb-16"
    >
      <div className="mb-6 flex items-end gap-3">
        <Heart className="w-6 h-6 text-[#e63946] fill-current mb-1" />
        <div>
          <div className="font-mono-lp text-xs uppercase tracking-widest text-zinc-500 mb-1">
            Your saved videos
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold">Favorites</h2>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((f, idx) => (
          <div
            key={f.id || idx}
            data-testid={`favorite-item-${idx}`}
            className="group rounded-xl border border-white/10 bg-[#0c0c0e] p-4 hover:border-[#e63946]/30 transition-colors flex items-center gap-3"
          >
            <button
              onClick={() => onPlay(f.source_url)}
              className="flex items-center gap-3 flex-1 text-left min-w-0"
            >
              <div className="w-10 h-10 rounded-lg bg-[#e63946]/10 border border-[#e63946]/30 flex items-center justify-center flex-shrink-0 group-hover:bg-[#e63946] transition-colors">
                <Play className="w-4 h-4 text-[#e63946] group-hover:text-white transition-colors fill-current" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold text-sm text-white truncate">
                  {f.title || "Terabox video"}
                </div>
                {f.size && (
                  <div className="font-mono-lp text-xs text-zinc-500 mt-0.5">
                    {f.size}
                  </div>
                )}
              </div>
            </button>
            <button
              onClick={() => onRemove(f.source_url)}
              data-testid={`favorite-remove-${idx}`}
              className="p-1.5 rounded-md text-zinc-500 hover:text-[#e63946] hover:bg-[#e63946]/10 transition-colors"
              aria-label="Remove from favorites"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
