import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function PaymentModal({ open, onOpenChange, onSuccess }) {
  const { setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      // MOCK payment — instantly upgrade
      const res = await api.subscribeMock();
      setUser(res.user);
      setDone(true);
      toast.success("Welcome to LinkPlay Pro!");
      setTimeout(() => {
        onOpenChange(false);
        setDone(false);
        onSuccess && onSuccess();
      }, 1400);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="payment-modal"
        className="sm:max-w-md bg-[#0c0c0e] border border-[#facc15]/30 text-white"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[#facc15] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#050505]" strokeWidth={2.5} />
            </div>
            <DialogTitle className="font-display text-3xl font-bold">
              Upgrade to Pro
            </DialogTitle>
          </div>
          <DialogDescription className="text-zinc-400">
            Complete your subscription to unlock unlimited playback and HD
            quality.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-16 h-16 text-[#facc15]" />
            <div className="font-display text-2xl font-bold">You&apos;re Pro!</div>
            <div className="text-zinc-400 text-sm">Enjoy unlimited streaming.</div>
          </div>
        ) : (
          <>
            <div className="my-4 p-5 rounded-xl bg-black/40 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400">LinkPlay Pro (Monthly)</span>
                <span className="font-display text-2xl font-black text-[#facc15]">
                  ₹49
                </span>
              </div>
              <div className="text-xs text-zinc-500 font-mono-lp">
                Billed monthly • Cancel anytime
              </div>
            </div>

            <div
              data-testid="mock-notice"
              className="mb-4 p-3 rounded-lg bg-[#e63946]/10 border border-[#e63946]/30 text-xs text-zinc-300"
            >
              <span className="font-bold text-[#e63946]">MOCKED:</span> Razorpay
              is not configured yet. Clicking below will simulate a successful
              payment and upgrade your account for 30 days.
            </div>

            <Button
              onClick={handlePay}
              disabled={loading}
              data-testid="confirm-payment-btn"
              className="w-full bg-[#facc15] hover:bg-[#fde047] text-[#050505] font-bold py-6 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Pay ₹49 (mock)"
              )}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
