"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Rocket, Target, RefreshCw, CalendarPlus, Repeat, PackageOpen, Sparkles,
  TrendingUp, ShieldCheck, Zap, FlaskConical
} from "lucide-react";

/**
 * NextSteps.tsx — Smart CTAs based on user context
 *
 * Signals considered:
 *  - user tier (users.tier)
 *  - goals row exists?
 *  - last log recency (logs within 48h?)
 *  - adherence 7d from intake_events
 *  - low stock items (refill_days_left <= 10)
 *  - has stack/items?
 *  - has an AI summary recently?
 *
 * Outputs:
 *  - Ordered CTA cards (1–4 items) with routes/buttons
 */

type UserRow = { id: string; email: string; tier: string | null };
type GoalsRow = { id: string } | null;
type LowStockItem = { id: string; name: string; refill_days_left: number | null };

export default function NextSteps() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState<UserRow | null>(null);
  const [goals, setGoals] = useState<GoalsRow>(null);
  const [hasRecentLog, setHasRecentLog] = useState<boolean>(false);
  const [adherence7, setAdherence7] = useState<number | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [hasStack, setHasStack] = useState<boolean>(false);
  const [hasAiRecent, setHasAiRecent] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user?.id) { setLoading(false); return; }
        const uid = auth.user.id;

        // users (tier)
        const { data: userRow } = await supabase
          .from("users")
          .select("id, email, tier")
          .eq("id", uid)
          .maybeSingle();
        setUser((userRow ?? null) as UserRow | null);

        // goals
        const { data: goalsRow } = await supabase
          .from("goals")
          .select("id")
          .eq("user_id", uid)
          .maybeSingle();
        setGoals((goalsRow ?? null) as GoalsRow);

        // last log in 48h?
        const since = new Date();
        since.setDate(since.getDate() - 2);
        const sinceStr = since.toISOString().slice(0,10);
        const { data: recentLogs } = await supabase
          .from("logs")
          .select("id")
          .eq("user_id", uid)
          .gte("log_date", sinceStr)
          .limit(1);
        setHasRecentLog((recentLogs?.length ?? 0) > 0);

        // adherence 7d
        const since7 = new Date(); since7.setDate(since7.getDate() - 6);
        const since7Str = since7.toISOString().slice(0,10);
        const { data: intake } = await supabase
          .from("intake_events")
          .select("taken")
          .eq("user_id", uid)
          .gte("intake_date", since7Str);
        const total = (intake ?? []).length;
        const taken = (intake ?? []).filter(r => r.taken).length;
        setAdherence7(total ? Math.round((taken/total)*100) : null);

        // has stack + low stock
        const { data: stacks } = await supabase
          .from("stacks")
          .select("id")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1);
        const stackId = stacks?.[0]?.id ?? null;
        setHasStack(!!stackId);

        if (stackId) {
          const { data: items } = await supabase
            .from("stacks_items")
            .select("id, name, refill_days_left")
            .eq("stack_id", stackId)
            .order("refill_days_left", { ascending: true });
          const low = (items ?? []).filter(i => (i.refill_days_left ?? Infinity) <= 10);
          setLowStock(low.slice(0, 3));
        }

        // has AI summary in last 7 days?
        const { data: aiRecent } = await supabase
          .from("ai_summaries")
          .select("id, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1);
        if (aiRecent?.[0]?.created_at) {
          const dt = new Date(aiRecent[0].created_at);
          const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
          setHasAiRecent(dt >= cutoff);
        } else {
          setHasAiRecent(false);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  // Rank CTAs by importance
  const ctas = useMemo(() => {
    const list: Array<CTA> = [];

    // 1) If no recent log → nudge to log today
    if (!hasRecentLog) {
      list.push({
        key: "log-today",
        icon: CalendarPlus,
        title: "Log today",
        desc: "Add energy, sleep, mood, and weight to keep your plan personalized.",
        actionLabel: "Open Daily Log",
        href: "#log", // if you have a direct anchor; else keep a no-op
        variant: "primary",
      });
    }

    // 2) If adherence is low → improve consistency
    if (adherence7 != null && adherence7 < 60) {
      list.push({
        key: "boost-adherence",
        icon: Repeat,
        title: "Boost your consistency",
        desc: `You're at ${adherence7}% adherence this week. Try setting a fixed AM/PM time window.`,
        actionLabel: "Open Today’s Plan",
        href: "#todays-plan",
        variant: "accent",
      });
    }

    // 3) Low stock → refill
    if (lowStock.length > 0) {
      const names = lowStock.map(i => i.name).slice(0,2).join(", ");
      list.push({
        key: "refill",
        icon: PackageOpen,
        title: "Refill supplements",
        desc: `${names}${lowStock.length > 2 ? "…" : ""} are running low. Avoid gaps in your routine.`,
        actionLabel: "Reorder now",
        href: "/dashboard#todays-plan", // same page; reorder buttons live in the list
        variant: "warning",
      });
    }

    // 4) If no goals yet → set goals
    if (!goals) {
      list.push({
        key: "set-goals",
        icon: Target,
        title: "Set your goals",
        desc: "Pick your targets for weight, sleep, and energy so we can tailor your plan.",
        actionLabel: "Set goals",
        href: "/dashboard#progress", // your ProgressTracker section
        variant: "secondary",
      });
    }

    // 5) If no stack yet → build one
    if (!hasStack) {
      list.push({
        key: "build-stack",
        icon: FlaskConical,
        title: "Build your supplement stack",
        desc: "Create your AM/PM routine and start tracking adherence.",
        actionLabel: "Create stack",
        href: "/dashboard#todays-plan",
        variant: "secondary",
      });
    }

    // 6) If no AI in last week → generate insights
    if (!hasAiRecent) {
      list.push({
        key: "ai-refresh",
        icon: Sparkles,
        title: "Get fresh insights",
        desc: "Generate a short, personalized tip based on your recent logs and adherence.",
        actionLabel: "Refresh insights",
        href: "#insights",
        onClick: async () => {
          try {
            const btn = document.getElementById("ai-refresh-proxy") as HTMLButtonElement | null;
            btn?.click(); // proxy the InsightsFeed button (keep code decoupled)
          } catch {}
        },
        variant: "ghost",
      });
    }

    // 7) Upsell if on free tier
    if ((user?.tier ?? "free") === "free") {
      list.push({
        key: "upgrade",
        icon: Rocket,
        title: "Upgrade to Premium",
        desc: "Unlock AI coaching, streak rewards, refill reminders, and Fullscript search.",
        actionLabel: "Go Premium",
        href: "/upgrade",
        variant: "premium",
      });
    }

    // Always: review stack
    if (hasStack) {
      list.push({
        key: "manage-stack",
        icon: TrendingUp,
        title: "Review your stack",
        desc: "Adjust doses, timing, or add new supplements from the catalog.",
        actionLabel: "Manage stack",
        href: "/dashboard#todays-plan",
        variant: "ghost",
      });
    }

    // ensure at most 4 CTAs to keep focus
    return list.slice(0, 4);
  }, [hasRecentLog, adherence7, lowStock, goals, hasStack, hasAiRecent, user?.tier]);

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm">
        <div className="text-gray-600">Preparing your next steps…</div>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm" id="next-steps">
      <h2 className="text-2xl font-bold text-[#041B2D] mb-4">➡️ Next Steps</h2>

      {ctas.length === 0 ? (
        <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 text-gray-700">
          You’re all set for now. Keep up the momentum!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ctas.map((cta) => (
            <CTA key={cta.key} cta={cta} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- CTA Types + Card ---------- */
type CTA = {
  key: string;
  icon: any;
  title: string;
  desc: string;
  actionLabel: string;
  href?: string;
  onClick?: () => void;
  variant: "primary" | "accent" | "warning" | "secondary" | "ghost" | "premium";
};

function CTA({ cta }: { cta: CTA }) {
  const Icon = cta.icon;
  const colors =
    cta.variant === "primary" ? "from-[#06C1A0] to-[#7C3AED] text-white" :
    cta.variant === "accent"  ? "from-teal-50 to-purple-50 text-[#041B2D]" :
    cta.variant === "warning" ? "from-amber-50 to-rose-50 text-[#041B2D]" :
    cta.variant === "secondary"? "from-purple-50 to-yellow-50 text-[#041B2D]" :
    cta.variant === "premium" ? "from-[#0ea5e9]/10 to-[#7c3aed]/10 text-[#041B2D]" :
                                "from-white to-white text-[#041B2D]";

  const border =
    cta.variant === "primary" ? "border-transparent" :
    cta.variant === "warning" ? "border-amber-200" :
    cta.variant === "premium" ? "border-purple-200" :
                                "border-purple-100";

  return (
    <div className={`rounded-2xl border ${border} bg-gradient-to-br ${colors} p-4 shadow-sm flex flex-col justify-between`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-xl ${cta.variant==="primary" ? "bg-white/10" : "bg-white"} p-2 shadow-sm`}>
          <Icon className={`w-5 h-5 ${cta.variant==="primary" ? "text-white" : "text-[#7C3AED]"}`} />
        </div>
        <div>
          <div className={`font-semibold ${cta.variant==="primary" ? "text-white" : "text-[#041B2D]"}`}>{cta.title}</div>
          <div className={`text-sm ${cta.variant==="primary" ? "text-white/90" : "text-gray-700"}`}>{cta.desc}</div>
        </div>
      </div>
      <div className="mt-3">
        {cta.href ? (
          <a
            href={cta.href}
            onClick={cta.onClick ?? undefined}
            className={`inline-flex items-center rounded-xl px-3 py-1.5 text-sm font-semibold shadow-sm ${
              cta.variant==="primary"
                ? "bg-white text-[#041B2D]"
                : "border hover:bg-white"
            }`}
          >
            {cta.actionLabel}
          </a>
        ) : (
          <button
            onClick={cta.onClick}
            className={`inline-flex items-center rounded-xl px-3 py-1.5 text-sm font-semibold shadow-sm ${
              cta.variant==="primary"
                ? "bg-white text-[#041B2D]"
                : "border hover:bg-white"
            }`}
          >
            {cta.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
