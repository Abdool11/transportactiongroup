"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { ArrowLeft, Download, AlertTriangle, Info } from "lucide-react";

// ─── Types (mirrored from TCOv2Client) ───────────────────────────────────────
interface Inputs {
  monthlyKm: number;
  vehicleLifeYears: number;
  dieselFinanced: boolean;
  dieselDepositPct: number;
  dieselFinanceRate: number;
  dieselFinanceTerm: number;
  dieselPurchasePrice: number;
  dieselFuelConsumption: number;
  dieselFuelPrice: number;
  dieselFuelEscalation: number;
  dieselMaintenanceCpm: number;
  dieselInsuranceAnnual: number;
  dieselResidualPct: number;
  electricFinanced: boolean;
  electricDepositPct: number;
  electricFinanceRate: number;
  electricFinanceTerm: number;
  electricPurchasePrice: number;
  electricEnergyConsumption: number;
  electricEnergyPrice: number;
  electricEnergyEscalation: number;
  electricMaintenanceCpm: number;
  electricInsuranceAnnual: number;
  electricResidualPct: number;
  decoupleKmLife: boolean;
  dieselMonthlyKm: number;
  dieselVehicleLifeYears: number;
  electricMonthlyKm: number;
  electricVehicleLifeYears: number;
  // Revenue
  revenuePerKm: number;
  currency: string;
  currencySymbol: string;
}

interface SensitivityState {
  inputs: Inputs;
  marginPct: number;
}

// ─── Finance helpers (duplicated — no shared module yet) ─────────────────────
function monthlyInstalment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}
function annualFinanceCost(purchasePrice: number, depositPct: number, annualRate: number, termMonths: number, year: number): number {
  const deposit = purchasePrice * (depositPct / 100);
  const financed = purchasePrice - deposit;
  if (financed <= 0 || annualRate === 0) return year === 1 ? deposit : 0;
  const monthly = monthlyInstalment(financed, annualRate, termMonths);
  const startMonth = (year - 1) * 12 + 1;
  const endMonth = Math.min(year * 12, termMonths);
  if (startMonth > termMonths) return year === 1 ? deposit : 0;
  const months = endMonth - startMonth + 1;
  return (year === 1 ? deposit : 0) + monthly * months;
}

// ─── Calculation engine ───────────────────────────────────────────────────────
function calcProfitAdvantage(inputs: Inputs, revenuePerKm: number): number {
  const dKm = inputs.decoupleKmLife ? inputs.dieselMonthlyKm : inputs.monthlyKm;
  const eKm = inputs.decoupleKmLife ? inputs.electricMonthlyKm : inputs.monthlyKm;
  const dLife = inputs.decoupleKmLife ? inputs.dieselVehicleLifeYears : inputs.vehicleLifeYears;
  const eLife = inputs.decoupleKmLife ? inputs.electricVehicleLifeYears : inputs.vehicleLifeYears;
  const maxYears = Math.max(dLife, eLife);
  let dieselCumProfit = 0;
  let electricCumProfit = 0;

  for (let y = 1; y <= maxYears; y++) {
    let dOpex = 0, dAnnualKm = 0;
    if (y <= dLife) {
      const dFuelPrice = inputs.dieselFuelPrice * Math.pow(1 + inputs.dieselFuelEscalation / 100, y - 1);
      dAnnualKm = dKm * 12;
      dOpex = (dAnnualKm / 100) * inputs.dieselFuelConsumption * dFuelPrice
        + dAnnualKm * inputs.dieselMaintenanceCpm
        + inputs.dieselInsuranceAnnual;
    }
    const dFinance = inputs.dieselFinanced
      ? annualFinanceCost(inputs.dieselPurchasePrice, inputs.dieselDepositPct, inputs.dieselFinanceRate, inputs.dieselFinanceTerm, y)
      : 0;
    const dieselAnnual = dOpex + dFinance;

    let eOpex = 0, eAnnualKm = 0;
    if (y <= eLife) {
      const eEnergyPrice = inputs.electricEnergyPrice * Math.pow(1 + inputs.electricEnergyEscalation / 100, y - 1);
      eAnnualKm = eKm * 12;
      eOpex = (eAnnualKm / 100) * inputs.electricEnergyConsumption * eEnergyPrice
        + eAnnualKm * inputs.electricMaintenanceCpm
        + inputs.electricInsuranceAnnual;
    }
    const eFinance = inputs.electricFinanced
      ? annualFinanceCost(inputs.electricPurchasePrice, inputs.electricDepositPct, inputs.electricFinanceRate, inputs.electricFinanceTerm, y)
      : 0;
    const electricAnnual = eOpex + eFinance;

    const rev = revenuePerKm * Math.pow(1.05, y - 1);
    dieselCumProfit += rev * dAnnualKm - dieselAnnual;
    electricCumProfit += rev * eAnnualKm - electricAnnual;
  }
  return electricCumProfit - dieselCumProfit;
}

// ─── Sensitivity variables config ────────────────────────────────────────────
interface SensVar {
  key: string;
  label: string;
  description: string;
  applyLow: (inp: Inputs) => Inputs;
  applyHigh: (inp: Inputs) => Inputs;
}

function buildSensVars(band: number): SensVar[] {
  const lo = 1 - band / 100;
  const hi = 1 + band / 100;
  return [
    {
      key: "dieselFuelEscalation",
      label: "Diesel price escalation",
      description: `Annual diesel price escalation ±${band}%`,
      applyLow: (inp) => ({ ...inp, dieselFuelEscalation: inp.dieselFuelEscalation * lo }),
      applyHigh: (inp) => ({ ...inp, dieselFuelEscalation: inp.dieselFuelEscalation * hi }),
    },
    {
      key: "electricPurchasePrice",
      label: "BEV purchase price",
      description: `Electric truck purchase price ±${band}%`,
      applyLow: (inp) => ({ ...inp, electricPurchasePrice: inp.electricPurchasePrice * lo }),
      applyHigh: (inp) => ({ ...inp, electricPurchasePrice: inp.electricPurchasePrice * hi }),
    },
    {
      key: "electricEnergyPrice",
      label: "Electricity tariff",
      description: `Electricity tariff (ZAR/kWh) ±${band}%`,
      applyLow: (inp) => ({ ...inp, electricEnergyPrice: inp.electricEnergyPrice * lo }),
      applyHigh: (inp) => ({ ...inp, electricEnergyPrice: inp.electricEnergyPrice * hi }),
    },
    {
      key: "monthlyKm",
      label: "Annual kilometres",
      description: `Monthly km driven ±${band}%`,
      applyLow: (inp) => ({ ...inp, monthlyKm: inp.monthlyKm * lo, dieselMonthlyKm: inp.dieselMonthlyKm * lo, electricMonthlyKm: inp.electricMonthlyKm * lo }),
      applyHigh: (inp) => ({ ...inp, monthlyKm: inp.monthlyKm * hi, dieselMonthlyKm: inp.dieselMonthlyKm * hi, electricMonthlyKm: inp.electricMonthlyKm * hi }),
    },
    {
      key: "dieselFuelPrice",
      label: "Diesel fuel price",
      description: `Current diesel price (ZAR/L) ±${band}%`,
      applyLow: (inp) => ({ ...inp, dieselFuelPrice: inp.dieselFuelPrice * lo }),
      applyHigh: (inp) => ({ ...inp, dieselFuelPrice: inp.dieselFuelPrice * hi }),
    },
    {
      key: "electricFinanceRate",
      label: "Finance rate",
      description: `Finance interest rate ±${band}%`,
      applyLow: (inp) => ({ ...inp, dieselFinanceRate: inp.dieselFinanceRate * lo, electricFinanceRate: inp.electricFinanceRate * lo }),
      applyHigh: (inp) => ({ ...inp, dieselFinanceRate: inp.dieselFinanceRate * hi, electricFinanceRate: inp.electricFinanceRate * hi }),
    },
  ];
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function fmtShort(v: number, sym: string): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${(v / 1_000).toFixed(0)}K`;
  return `${sym}${v.toFixed(0)}`;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function TornadoTooltip({ active, payload, label, sym, base }: {
  active?: boolean; payload?: { value: number; name: string }[]; label?: string; sym: string; base: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1923] border border-border/50 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold text-white mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span className={p.name === "favourable" ? "text-green-400" : "text-red-400"}>
            {p.name === "favourable" ? "▲ Favourable" : "▼ Unfavourable"}
          </span>
          <span className="text-muted-foreground">{fmtShort(base + p.value, sym)}</span>
        </div>
      ))}
      <p className="text-muted-foreground mt-1 border-t border-border/30 pt-1">Base: {fmtShort(base, sym)}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SensitivityClient() {
  const router = useRouter();
  const [state, setState] = useState<SensitivityState | null>(null);
  const [band, setBand] = useState(20);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // Session guard
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tco_sensitivity_state");
      if (!raw) {
        router.replace("/tco-v2?sensitivity_redirect=1");
        return;
      }
      setState(JSON.parse(raw) as SensitivityState);
    } catch {
      router.replace("/tco-v2?sensitivity_redirect=1");
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Compute tornado data
  const { tornadoData, baseAdvantage, dominantVar } = React.useMemo(() => {
    if (!state) return { tornadoData: [], baseAdvantage: 0, dominantVar: "" };
    const { inputs, marginPct } = state;
    const rev = inputs.revenuePerKm;
    const base = calcProfitAdvantage(inputs, rev);
    const vars = buildSensVars(band);

    const rows = vars.map((v) => {
      const lowAdv = calcProfitAdvantage(v.applyLow(inputs), rev);
      const highAdv = calcProfitAdvantage(v.applyHigh(inputs), rev);
      // favourable = scenario where electric advantage is larger
      const fav = Math.max(lowAdv, highAdv) - base;
      const unfav = Math.min(lowAdv, highAdv) - base;
      return {
        label: v.label,
        description: v.description,
        favourable: fav,
        unfavourable: unfav,
        width: fav - unfav,
      };
    });

    // Sort by width descending (tornado shape)
    rows.sort((a, b) => b.width - a.width);

    return {
      tornadoData: rows,
      baseAdvantage: base,
      dominantVar: rows[0]?.label ?? "",
    };
  }, [state, band]);

  const sym = state?.inputs.currencySymbol ?? "R";

  // ─── PDF download ─────────────────────────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    if (!chartRef.current || !state) return;
    setDownloading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: "#0a1628",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // ── Background ──
      pdf.setFillColor(10, 22, 40);
      pdf.rect(0, 0, pageW, pageH, "F");

      // ── Header bar ──
      pdf.setFillColor(22, 163, 74); // green-600
      pdf.rect(0, 0, pageW, 14, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text("Fleet Sensitivity Analysis", 10, 9.5);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text("Transport Action Group  |  transportactiongroup.co.za", pageW - 10, 9.5, { align: "right" });

      // ── Input summary table ──
      const inp = state.inputs;
      const summaryY = 22;
      pdf.setFontSize(8);
      pdf.setTextColor(160, 180, 200);
      pdf.text("INPUT ASSUMPTIONS", 10, summaryY);

      const cols = [
        ["Vehicle life", `${inp.vehicleLifeYears} years`],
        ["Monthly km", `${inp.monthlyKm.toLocaleString()} km`],
        ["Diesel price", `${sym}${inp.dieselFuelPrice}/L`],
        ["Diesel escalation", `${inp.dieselFuelEscalation}% p.a.`],
        ["Electricity tariff", `${sym}${inp.electricEnergyPrice}/kWh`],
        ["BEV purchase price", `${sym}${(inp.electricPurchasePrice / 1_000_000).toFixed(1)}M`],
        ["Finance rate", `${inp.electricFinanceRate}% p.a.`],
        ["Sensitivity band", `±${band}%`],
      ];

      const colW = (pageW - 20) / 4;
      cols.forEach((col, i) => {
        const cx = 10 + (i % 4) * colW;
        const cy = summaryY + 6 + Math.floor(i / 4) * 8;
        pdf.setTextColor(100, 130, 160);
        pdf.setFontSize(7);
        pdf.text(col[0], cx, cy);
        pdf.setTextColor(220, 235, 255);
        pdf.setFontSize(8.5);
        pdf.setFont("helvetica", "bold");
        pdf.text(col[1], cx, cy + 4.5);
        pdf.setFont("helvetica", "normal");
      });

      // ── Divider ──
      pdf.setDrawColor(30, 60, 90);
      pdf.line(10, summaryY + 22, pageW - 10, summaryY + 22);

      // ── Chart image ──
      const imgData = canvas.toDataURL("image/png");
      const chartTop = summaryY + 26;
      const chartH = pageH - chartTop - 22;
      const chartW = pageW - 20;
      pdf.addImage(imgData, "PNG", 10, chartTop, chartW, chartH);

      // ── Key insight callout ──
      const insightY = pageH - 16;
      pdf.setFillColor(22, 163, 74, 0.15);
      pdf.setDrawColor(22, 163, 74);
      pdf.roundedRect(10, insightY - 5, pageW - 20, 10, 2, 2, "FD");
      pdf.setTextColor(134, 239, 172); // green-300
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Key insight: "${dominantVar}" has the greatest impact on your electric vs diesel profit advantage.`, 14, insightY + 0.5);

      // ── Footer ──
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(80, 110, 140);
      const dateStr = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });
      pdf.text(`Generated ${dateStr}  |  Sensitivity band ±${band}%  |  Base profit advantage: ${fmtShort(baseAdvantage, sym)}`, pageW / 2, pageH - 3, { align: "center" });

      pdf.save(`TAG-Sensitivity-Analysis-${dateStr.replace(/ /g, "-")}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [state, band, baseAdvantage, dominantVar, sym]);

  // ─── Loading / guard states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm animate-pulse">Loading analysis…</div>
      </div>
    );
  }
  if (!state) return null;

  const electricMoreProfitable = baseAdvantage > 0;

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 max-w-5xl mx-auto">

      {/* ── Back link ── */}
      <Link href="/tco-v2" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors mb-6">
        <ArrowLeft size={14} /> Back to Calculator
      </Link>

      {/* ── Page header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white mb-1">Sensitivity Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Which input variables have the greatest impact on your electric vs diesel profit advantage?
          Each bar shows how the lifetime profit advantage changes when that variable shifts by ±{band}%.
        </p>
      </div>

      {/* ── Band selector + Download ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Sensitivity band:</span>
          {[10, 20, 30].map(b => (
            <button
              key={b}
              onClick={() => setBand(b)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                band === b
                  ? "bg-green-500/20 border-green-500/50 text-green-400"
                  : "border-border/40 text-muted-foreground hover:border-border/70"
              }`}
            >
              ±{b}%
            </button>
          ))}
        </div>
        <button
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition-colors disabled:opacity-60"
        >
          <Download size={14} />
          {downloading ? "Generating PDF…" : "Download PDF"}
        </button>
      </div>

      {/* ── Base case summary ── */}
      <div className={`rounded-xl p-4 mb-6 border-2 ${electricMoreProfitable ? "bg-green-500/10 border-green-500/30" : "bg-amber-500/10 border-amber-500/30"}`}>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Base case profit advantage</p>
        <p className={`text-3xl font-extrabold ${electricMoreProfitable ? "text-green-400" : "text-amber-400"}`}>
          {fmtShort(Math.abs(baseAdvantage), sym)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {electricMoreProfitable
            ? "Electric generates more lifetime profit than diesel under your current inputs."
            : "Diesel generates more lifetime profit than electric under your current inputs."}
        </p>
      </div>

      {/* ── Tornado chart ── */}
      <div className="card p-5 mb-6" ref={chartRef}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tornado Chart</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Impact on lifetime profit advantage (electric vs diesel). Green = electric more favourable. Red = electric less favourable.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Favourable</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Unfavourable</span>
          </div>
        </div>

        <div className="mt-4" style={{ height: tornadoData.length * 52 + 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={tornadoData}
              margin={{ top: 4, right: 80, left: 160, bottom: 4 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtShort(v, "")}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={false}
                label={{ value: `Change in profit advantage (${sym})`, position: "insideBottom", offset: -2, fontSize: 9, fill: "#64748b" }}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11, fill: "#cbd5e1" }}
                axisLine={false}
                tickLine={false}
                width={155}
              />
              <Tooltip
                content={<TornadoTooltip sym={sym} base={baseAdvantage} />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
              <Bar dataKey="favourable" name="favourable" stackId="a" radius={[0, 4, 4, 0]}>
                {tornadoData.map((_, i) => (
                  <Cell key={i} fill="#22c55e" fillOpacity={0.85} />
                ))}
              </Bar>
              <Bar dataKey="unfavourable" name="unfavourable" stackId="b" radius={[4, 0, 0, 4]}>
                {tornadoData.map((_, i) => (
                  <Cell key={i} fill="#ef4444" fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Key insight callout ── */}
      <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 mb-6 flex gap-3">
        <Info size={16} className="text-green-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-300 mb-1">Key insight</p>
          <p className="text-sm text-muted-foreground">
            <strong className="text-white">{dominantVar}</strong> has the greatest impact on your profit advantage — a ±{band}% change in this variable produces the widest swing in outcomes.{" "}
            {dominantVar === "Diesel price escalation"
              ? "This is largely outside your control, which strengthens the case for switching to electric sooner rather than later."
              : dominantVar === "BEV purchase price"
              ? "Negotiating a lower purchase price or accessing fleet finance incentives would have the highest return on effort."
              : dominantVar === "Annual kilometres"
              ? "Maximising vehicle utilisation (km driven) is your most powerful lever for improving the electric truck's advantage."
              : dominantVar === "Electricity tariff"
              ? "Securing a favourable electricity tariff or on-site solar generation would significantly strengthen the electric case."
              : "Focus your risk management efforts on this variable when building your business case."}
          </p>
        </div>
      </div>

      {/* ── Input summary ── */}
      <div className="card p-4 mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Your Input Assumptions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-xs">
          {[
            ["Vehicle life", `${state.inputs.vehicleLifeYears} years`],
            ["Monthly km", `${state.inputs.monthlyKm.toLocaleString()} km`],
            ["Diesel price", `${sym}${state.inputs.dieselFuelPrice}/L`],
            ["Diesel escalation", `${state.inputs.dieselFuelEscalation}% p.a.`],
            ["Electricity tariff", `${sym}${state.inputs.electricEnergyPrice}/kWh`],
            ["BEV purchase price", `${sym}${(state.inputs.electricPurchasePrice / 1_000_000).toFixed(1)}M`],
            ["Finance rate", `${state.inputs.electricFinanceRate}% p.a.`],
            ["Revenue per km", `${sym}${state.inputs.revenuePerKm.toFixed(2)}`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-muted-foreground">{label}</p>
              <p className="font-semibold text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="rounded-2xl bg-gradient-to-br from-green-900/30 to-emerald-900/20 border border-green-500/20 p-6 text-center">
        <h3 className="text-lg font-bold text-white mb-2">Ready to act on these numbers?</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-xl mx-auto">
          Join a TAG pilot project and be part of the first wave of operators deploying electric trucks profitably in Southern Africa.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/partner-with-tag"
            className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors">
            Join the Pilot Project →
          </Link>
          <Link href="/tco-v2"
            className="px-5 py-2.5 rounded-xl border border-border/50 text-sm text-muted-foreground hover:text-white hover:border-border transition-colors">
            ← Back to Calculator
          </Link>
        </div>
      </div>

    </div>
  );
}
