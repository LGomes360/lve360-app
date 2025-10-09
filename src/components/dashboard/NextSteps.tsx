"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Rocket, Target, CalendarPlus, Repeat, PackageOpen, Sparkles,
  TrendingUp
} from "lucide-react";

/**
 * NextSteps.tsx — Smart CTAs based on user context (merged & optimized)
 *
 * Signals:
 *  - users.tier
 *  - goals row existence
 *  - recent log in last 48h
 *  - adherence 7d from intake_events (defensive if table/rows absent)
 *  - low stock (stacks_items.refill_days_left <= 10)
 *  - has stack/items?
 *  - AI summary recency (7d)
 *
 * Improvements:
 *  - Parallel fetch via Promise.all for snappy loads
 *  - Consistent anchors: #daily-log, #todays-plan, #insights, #progress
 *  - Defensive guards if intake_events doesn’t exist/empty
 *  - A11y titles and clear variants
 *  - Configurable shop route
 */

type UserRow = { id: string; email: string; tier: string | null };
type GoalsRow = { id: string } | null;
type LowStockItem = { id: string; name: string; refill_days_left: number | null };

const SHOP_ROUTE = "/shop"; // change if your Fullscript entry differs

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

        // Dates
        const since48 = new Date(); since48.setDate(since48.getDate() - 2);
        const since48Str = since48.toISOString().slice(0, 10);
        const since7 = new Date(); since7.setDate(since7.getDate() - 6);
        const since7Str = since7.toISOString().slice(0, 10);
        const cutoffAI = new Date(); cutoffAI.setDate(cutoffAI.getDate() - 7);

        // Fetch in parallel (each limited to needed cols)
        const [
          userQ,
          goalsQ,
          recentLogsQ,
          stacksQ,
          aiQ,
        ] = await Promise.all([
          supabase.from("users").select("id, email, tier").eq("id", uid).maybeSingle(),
          supabase.from("goals").select("id").eq("user_id", uid).maybeSingle(),
          supabase.from("logs").select("id, log_date").eq("user_id", uid).gte("log_date", since48Str).limit(1),
          supabase.from("stacks").select("id").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
          supabase.from("ai_summaries").select("id, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
        ]);

        setUser((userQ.data ?? null) as UserRow | null);
        setGoals((goalsQ.data ?? null) as GoalsRow);
        setHasRecentLog((recentLogsQ.data?.length ?? 0) > 0);

        const stackId = stacksQ.data?.[0]?.id ?? null;
        setHasStack(!!stackId);

        if (aiQ.data?.[0]?.created_at) {
          setHasAiRecent(new Date(aiQ.data[0].created_at) >= cutoffAI);
        } else {
          setHasAiRecent(false);
        }

        // Adherence 7d (defensive in case intake_events absent/empty)
        try {
          const intakeQ = await supabase
            .from("intake_events")
            .select("taken")
            .eq("user_id", uid)
            .gte("intake_date", since7Str);

          const total = (intakeQ.data ?? []).length;
          const taken = (intakeQ.data ?? []).filter(r => r.taken).length;
          setAdherence7(total ? Math.round((taken / total) * 100) : null);
        } catch {
          // table missing or RLS—skip quietly
          setAdherence7(null);
        }

        // Low stock (<=10 days) if we have a stack
        if (stackId) {
          const itemsQ = await supabase
            .from("stacks_items")
            .select("id, name, refill_days_left")
            .eq("stack_id", stackId)
            .order("refill_days_left", { ascending: true });

          const low = (itemsQ.data ?? []).filter(i => {
            const d = i?.refill_days_left;
            return typeof d === "number" && d <= 10;
          });

          setLowStock(low.slice(0, 3));
        } else {
          setLowStock([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  // Build ranked CTAs (max 4)
  const ctas = useMemo(() => {
    const list: CTA[] = [];

    // 1) Log today (if no recent log)
    if (!hasRecentLog) {
      list.push({
        key: "log-today",
        icon: CalendarPlus,
        title: "Log today",
        desc: "Add sleep, energy, weight or a note—keep your plan personalized.",
        actionLabel: "Open Daily Log",
        href: "#daily-log",
        variant: "primary",
      });
    }

    // 2) Boost adherence (if <60%)
    if (adherence7 != null && adherence7 < 60) {
      list.push({
        key: "boost-adherence",
        icon: Repeat,
        title: "Boost your consistency",
        desc: `You're at ${adherence7}% this week. Try setting a fixed AM/PM window.`,
        actionLabel: "Open Today’s Plan",
        href: "#todays-plan",
        variant: "accent",
      });
    }

    // 3) Refill when low stock
    if (lowStock.length > 0) {
      const names = lowStock.map(i => i.name).slice(0,2).join(", ");
      list.push({
        key: "refill",
        icon: PackageOpen,
        title: "Refill supplements",
        desc: `${names}${lowStock.length > 2 ? "…" : ""} are running low. Avoid gaps in your routine.`,
        actionLabel: "Reorder now",
        href: SHOP_ROUTE,
        variant: "warning",
      });
    }

    // 4) Set goals (if none)
    if (!goals) {
      list.push({
        key: "set-goals",
        icon: Target,
        title: "Set your goals",
        desc: "Pick targets for weight, sleep, and energy so your plan adapts.",
        actionLabel: "Set goals",
        href: "#progress",
        variant: "secondary",
      });
    }

    // 5) Build a stack (if none)
    if (!hasStack) {
      list.push({
        key: "build-stack",
        icon: TrendingUp,
        title: "Build your supplement stack",
        desc: "Create your AM/PM routine and start tracking adherence.",
        actionLabel: "Create stack",
        href: "#todays-plan",
        variant: "secondary",
      });
    }

    // 6) Generate insights (if none in last week)
    if (!hasAiRecent) {
      list.push({
        key: "ai-refresh",
        icon: Sparkles,
        title: "Get fresh insights",
        desc: "Quick tip from your latest logs and adherence data.",
        actionLabel: "Refresh insights",
        href: "#insights",
        onClick: () => {
          // Proxy-click a button with id="ai-refresh-proxy" inside InsightsFeed if present
          try { (document.getElementById("ai-refresh-proxy") as HTMLButtonElement | null)?.click(); } catch {}
        },
        variant: "ghost",
      });
    }

    // 7) Upsell if on free tier
    if ((user?.tier ?? "free").toLowerCase() === "free") {
      list.push({
        key: "upgrade",
        icon: Rocket,
        title: "Upgrade to Premium",
        desc: "Unlock AI coaching, advanced trends, and refill coaching.",
        actionLabel: "Go Premium",
        href: "/upgrade",
        variant: "premium",
      });
    }

    // Always: review stack if present
    if (hasStack) {
      list.push({
        key: "manage-stack",
        icon: TrendingUp,
        title: "Review your stack",
        desc: "Adjust doses, timing, or add new supplements from the catalog.",
        actionLabel: "Manage stack",
        href: "#todays-plan",
        variant: "ghost",
      });
    }

    return list.slice(0, 4);
  }, [hasRecentLog, adherence7, lowStock, goals, hasStack, hasAiRecent, user?.tier]);

  if (loading) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm" aria-busy="true">
        <div className="text-gray-600">Preparing your next steps…</div>
      </div>
    );
  }

  return (
    <section className="bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm" id="next-steps" aria-label="Next steps">
      <h2 className="text-2xl font-bold text-[#041B2D] mb-4">➡️ Next Steps</h2>

      {ctas.length === 0 ? (
        <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50 to-yellow-50 p-4 text-gray-700">
          You’re all set for now. Keep up the momentum!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ctas.map((cta) => (
            <CTA key={cta.key} cta={cta} />
          ))}
        </div>
      )}
    </section>
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
          <Icon className={`w-5 h-5 ${cta.variant==="primary" ? "text-white" : "text-[#7C3AED]"}`} aria-hidden="true" />
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
              cta.variant==="primary" ? "bg-white text-[#041B2D]" : "border hover:bg-white"
            }`}
            aria-label={cta.title}
          >
            {cta.actionLabel}
          </a>
        ) : (
          <button
            onClick={cta.onClick}
            className={`inline-flex items-center rounded-xl px-3 py-1.5 text-sm font-semibold shadow-sm ${
              cta.variant==="primary" ? "bg-white text-[#041B2D]" : "border hover:bg-white"
            }`}
            aria-label={cta.title}
          >
            {cta.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
