import React, { useEffect, useState } from "react";
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
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    api
      .subscribeConfig()
      .then(setConfig)
      .catch(() => setConfig({ mode: "mock", amount_paise: 4900 }));
  }, [open]);

  const finishSuccess = () => {
    setDone(true);
    toast.success("Welcome to LinkPlay Pro!");
    setTimeout(() => {
      onOpenChange(false);
      setDone(false);
      onSuccess && onSuccess();
    }, 1400);
  };

  const handleMock = async () => {
    setLoading(true);
    try {
      const res = await api.subscribeMock();
      setUser(res.user);
      finishSuccess();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLive = async () => {
    if (typeof window === "undefined" || !window.Razorpay) {
      toast.error("Razorpay Checkout not loaded. Please refresh and try again.");
      return;
    }
    setLoading(true);
    try {
      const order = await api.createOrder();
      const rz = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "LinkPlay",
        description: "LinkPlay Pro — Monthly Subscription",
        order_id: order.order_id,
        prefill: {
          email: user?.email || "",
          name: user?.name || "",
        },
        theme: { color: "#e63946" },
        handler: async (rp) => {
          try {
            const verify = await api.verifyPayment({
              razorpay_order_id: rp.razorpay_order_id,
              razorpay_payment_id: rp.razorpay_payment_id,
              razorpay_signature: rp.razorpay_signature,
            });
            setUser(verify.user);
            finishSuccess();
          } catch (e) {
            toast.error(
              formatApiErrorDetail(e.response?.data?.detail) || "Payment verification failed"
            );
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });
      rz.open();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
      setLoading(false);
    }
  };

  const handlePay = () => {
    if (!config) return;
    if (config.mode === "live") return handleLive();
    return handleMock();
  };

  const rupees = config ? (config.amount_paise / 100).toFixed(0) : "49";
  const isLive = config?.mode === "live";

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
                  ₹{rupees}
                </span>
              </div>
              <div className="text-xs text-zinc-500 font-mono-lp">
                Billed monthly • Cancel anytime
              </div>
            </div>

            {!isLive && (
              <div
                data-testid="mock-notice"
                className="mb-4 p-3 rounded-lg bg-[#e63946]/10 border border-[#e63946]/30 text-xs text-zinc-300"
              >
                <span className="font-bold text-[#e63946]">MOCKED:</span>{" "}
                Razorpay is not configured. Clicking below will simulate a
                successful payment and upgrade your account for 30 days. Set{" "}
                <code className="font-mono-lp">RAZORPAY_MODE=live</code> and add
                keys to <code className="font-mono-lp">/app/backend/.env</code>{" "}
                to go live.
              </div>
            )}

            {isLive && (
              <div
                data-testid="live-notice"
                className="mb-4 p-3 rounded-lg bg-[#facc15]/10 border border-[#facc15]/30 text-xs text-zinc-300"
              >
                <span className="font-bold text-[#facc15]">LIVE:</span> Secure
                checkout by Razorpay. Test with card{" "}
                <code className="font-mono-lp">4111 1111 1111 1111</code>.
              </div>
            )}

            <Button
              onClick={handlePay}
              disabled={loading || !config}
              data-testid="confirm-payment-btn"
              className="w-full bg-[#facc15] hover:bg-[#fde047] text-[#050505] font-bold py-6 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isLive ? (
                `Pay ₹${rupees} securely`
              ) : (
                `Pay ₹${rupees} (mock)`
              )}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
