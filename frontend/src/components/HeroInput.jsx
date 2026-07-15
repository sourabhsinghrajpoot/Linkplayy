import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClipboardPaste, Play, Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

export default function HeroInput({ onPlay, loading }) {
  const [url, setUrl] = useState("");

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        toast.success("Link pasted from clipboard");
      }
    } catch (e) {
      toast.error("Clipboard access denied. Paste manually.");
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please paste a Terabox link first");
      return;
    }
    onPlay(url.trim());
  };

  return (
    <section
      data-testid="hero-section"
      className="relative pt-16 pb-12 sm:pt-24 sm:pb-16"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-8">
        <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e63946]/10 border border-[#e63946]/30">
          <span className="w-1.5 h-1.5 rounded-full bg-[#e63946] animate-pulse" />
          <span className="font-mono-lp text-xs uppercase tracking-widest text-[#e63946]">
            Instant Playback
          </span>
        </div>

        <h1
          data-testid="hero-title"
          className="font-display text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.02] mb-5"
        >
          Paste a Terabox link.
          <br />
          <span className="text-[#e63946]">Play it instantly.</span>
        </h1>

        <p className="text-zinc-400 text-lg max-w-2xl mb-10 font-normal">
          No downloads. No waiting. Drop any Terabox share URL below and stream
          the video right here on the page — with a proper download button too.
        </p>

        <form onSubmit={submit} className="relative">
          <div className="flex flex-col sm:flex-row items-stretch gap-3 p-2 bg-[#0c0c0e] border border-white/10 rounded-2xl focus-within:border-[#e63946]/60 focus-within:ring-2 focus-within:ring-[#e63946]/30 transition-colors">
            <div className="flex items-center pl-3 sm:pl-4">
              <LinkIcon className="w-5 h-5 text-zinc-500" />
            </div>
            <Input
              data-testid="paste-link-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://terabox.com/s/..."
              className="flex-1 bg-transparent border-none font-mono-lp text-base sm:text-lg text-white placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex gap-2 px-2 sm:px-0">
              <Button
                type="button"
                data-testid="paste-clipboard-btn"
                onClick={handlePaste}
                variant="ghost"
                className="text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ClipboardPaste className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Paste</span>
              </Button>
              <Button
                type="submit"
                data-testid="play-video-btn"
                disabled={loading}
                className="bg-[#e63946] hover:bg-[#f04856] text-white font-semibold px-6 glow-crimson transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    Play
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500 font-mono-lp">
          <span>terabox.com</span>
          <span>terabox.app</span>
          <span>1024tera.com</span>
          <span>4funbox.com</span>
          <span>+ more mirrors</span>
        </div>
      </div>
    </section>
  );
}
