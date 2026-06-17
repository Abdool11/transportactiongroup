"use client";
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  X, ChevronDown, ChevronUp, Info, Play, TrendingUp,
  Truck, Zap, DollarSign, Target, Users, ArrowRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Inputs {
  monthlyKm: number;
  vehicleLifeYears: number;
  // Diesel
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
  // Electric
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
  // Decouple km/life
  decoupleKmLife: boolean;
  dieselMonthlyKm: number;
  dieselVehicleLifeYears: number;
  electricMonthlyKm: number;
  electricVehicleLifeYears: number;
}

interface YearResult {
  year: number;
  dieselCumulative: number;
  electricCumulative: number;
  dieselAnnual: number;
  electricAnnual: number;
  dieselRevenue: number;
  electricRevenue: number;
  dieselProfit: number;
  electricProfit: number;
  dieselCumProfit: number;
  electricCumProfit: number;
  saving: number;
  profitDelta: number;
}

// ─── Currencies ───────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: "ZAR", symbol: "R", name: "South African Rand", rate: 1 },
  { code: "USD", symbol: "$", name: "US Dollar", rate: 0.054 },
  { code: "EUR", symbol: "€", name: "Euro", rate: 0.050 },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling", rate: 7.1 },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling", rate: 138 },
  { code: "ETB", symbol: "Br", name: "Ethiopian Birr", rate: 3.0 },
  { code: "GBP", symbol: "£", name: "British Pound", rate: 0.043 },
];
const COUNTRY_CURRENCY: Record<string, string> = {
  ZA: "ZAR", US: "USD", GB: "GBP", KE: "KES", TZ: "TZS", ET: "ETB",
  DE: "EUR", FR: "EUR", NL: "EUR", BE: "EUR", AT: "EUR",
};
function getCurrency(code: string) {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];
}
function convertDefaults(d: Inputs, rate: number): Inputs {
  const priceFields = [
    "dieselPurchasePrice", "dieselFuelPrice", "dieselMaintenanceCpm", "dieselInsuranceAnnual",
    "electricPurchasePrice", "electricEnergyPrice", "electricMaintenanceCpm", "electricInsuranceAnnual",
  ] as const;
  const out = { ...d };
  for (const f of priceFields) (out as Record<string, number>)[f] = Math.round((d as Record<string, number>)[f] * rate);
  return out;
}

// ─── Finance helpers ──────────────────────────────────────────────────────────
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
function calcTCO(inputs: Inputs, revenuePerKm: number) {
  const dKm = inputs.decoupleKmLife ? inputs.dieselMonthlyKm : inputs.monthlyKm;
  const eKm = inputs.decoupleKmLife ? inputs.electricMonthlyKm : inputs.monthlyKm;
  const dLife = inputs.decoupleKmLife ? inputs.dieselVehicleLifeYears : inputs.vehicleLifeYears;
  const eLife = inputs.decoupleKmLife ? inputs.electricVehicleLifeYears : inputs.vehicleLifeYears;
  const maxYears = Math.max(dLife, eLife);
  const years: YearResult[] = [];
  const dieselDeposit = inputs.dieselPurchasePrice * (inputs.dieselDepositPct / 100);
  const electricDeposit = inputs.electricPurchasePrice * (inputs.electricDepositPct / 100);
  let dieselCumulative = 0;
  let electricCumulative = 0;
  let dieselCumProfit = 0;
  let electricCumProfit = 0;
  let breakEvenYear: number | null = null;
  let profitBreakEvenYear: number | null = null;

  for (let y = 1; y <= maxYears; y++) {
    let dOpex = 0;
    let dAnnualKm = 0;
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

    let eOpex = 0;
    let eAnnualKm = 0;
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

    dieselCumulative += dieselAnnual;
    electricCumulative += electricAnnual;

    // Revenue = revenuePerKm × annual km, escalating at 5% p.a.
    const revenueEscalated = revenuePerKm * Math.pow(1.05, y - 1);
    const dieselRevenue = revenueEscalated * dAnnualKm;
    const electricRevenue = revenueEscalated * eAnnualKm;
    const dieselProfit = dieselRevenue - dieselAnnual;
    const electricProfit = electricRevenue - electricAnnual;
    dieselCumProfit += dieselProfit;
    electricCumProfit += electricProfit;

    const saving = dieselCumulative - electricCumulative;
    const profitDelta = electricCumProfit - dieselCumProfit;

    if (breakEvenYear === null && saving >= 0) breakEvenYear = y;
    if (profitBreakEvenYear === null && electricCumProfit > dieselCumProfit) profitBreakEvenYear = y;

    years.push({
      year: y,
      dieselCumulative, electricCumulative,
      dieselAnnual, electricAnnual,
      dieselRevenue, electricRevenue,
      dieselProfit, electricProfit,
      dieselCumProfit, electricCumProfit,
      saving, profitDelta,
    });
  }

  const dResidual = inputs.dieselPurchasePrice * (inputs.dieselResidualPct / 100);
  const eResidual = inputs.electricPurchasePrice * (inputs.electricResidualPct / 100);
  const dieselTCO = dieselCumulative - dResidual;
  const electricTCO = electricCumulative - eResidual;
  const dieselTotalKm = dKm * 12 * dLife;
  const electricTotalKm = eKm * 12 * eLife;
  const dieselCpm = dieselTCO / dieselTotalKm;
  const electricCpm = electricTCO / electricTotalKm;
  const totalSaving = dieselTCO - electricTCO;
  const totalProfitDelta = electricCumProfit - dieselCumProfit;

  return {
    years, dieselTCO, electricTCO, dieselCpm, electricCpm,
    totalSaving, breakEvenYear, totalProfitDelta, profitBreakEvenYear,
    dieselFinalCumProfit: dieselCumProfit, electricFinalCumProfit: electricCumProfit,
  };
}

// ─── ZAR defaults ─────────────────────────────────────────────────────────────
const ZAR_DEFAULTS: Inputs = {
  monthlyKm: 15000,
  vehicleLifeYears: 5,
  dieselFinanced: true, dieselDepositPct: 10, dieselFinanceRate: 12, dieselFinanceTerm: 60,
  dieselPurchasePrice: 2200000, dieselFuelConsumption: 38, dieselFuelPrice: 30,
  dieselFuelEscalation: 6, dieselMaintenanceCpm: 0.85, dieselInsuranceAnnual: 88000, dieselResidualPct: 30,
  electricFinanced: true, electricDepositPct: 10, electricFinanceRate: 12, electricFinanceTerm: 60,
  electricPurchasePrice: 4200000, electricEnergyConsumption: 160, electricEnergyPrice: 2.8,
  electricEnergyEscalation: 2, electricMaintenanceCpm: 0.35, electricInsuranceAnnual: 168000, electricResidualPct: 30,
  decoupleKmLife: false,
  dieselMonthlyKm: 10000, dieselVehicleLifeYears: 7,
  electricMonthlyKm: 10000, electricVehicleLifeYears: 7,
};

// ─── Slider config ────────────────────────────────────────────────────────────
interface SliderConfig {
  label: string;
  field: keyof Inputs;
  min: number; max: number; step: number;
  format: (v: number, sym: string) => string;
}
const DIESEL_SLIDERS: SliderConfig[] = [
  { label: "Monthly km", field: "monthlyKm", min: 1000, max: 50000, step: 500, format: (v) => `${v.toLocaleString()} km` },
  { label: "Vehicle life", field: "vehicleLifeYears", min: 3, max: 15, step: 1, format: (v) => `${v} yrs` },
  { label: "Vehicle price", field: "dieselPurchasePrice", min: 500000, max: 10000000, step: 50000, format: (v, s) => `${s}${(v / 1_000_000).toFixed(1)}M` },
  { label: "Finance rate", field: "dieselFinanceRate", min: 0, max: 30, step: 0.25, format: (v) => `${v}%` },
  { label: "Diesel price", field: "dieselFuelPrice", min: 5, max: 100, step: 0.5, format: (v, s) => `${s}${v.toFixed(1)}/L` },
];
const ELECTRIC_SLIDERS: SliderConfig[] = [
  { label: "Monthly km", field: "monthlyKm", min: 1000, max: 50000, step: 500, format: (v) => `${v.toLocaleString()} km` },
  { label: "Vehicle life", field: "vehicleLifeYears", min: 3, max: 15, step: 1, format: (v) => `${v} yrs` },
  { label: "Vehicle price", field: "electricPurchasePrice", min: 1000000, max: 20000000, step: 100000, format: (v, s) => `${s}${(v / 1_000_000).toFixed(1)}M` },
  { label: "Finance rate", field: "electricFinanceRate", min: 0, max: 30, step: 0.25, format: (v) => `${v}%` },
  { label: "Electricity tariff", field: "electricEnergyPrice", min: 0.5, max: 20, step: 0.1, format: (v, s) => `${s}${v.toFixed(1)}/kWh` },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function MixerSlider({ config, value, onChange, currencySymbol, accentColor }: {
  config: SliderConfig; value: number; onChange: (v: number) => void;
  currencySymbol: string; accentColor: "amber" | "green";
}) {
  const trackColor = accentColor === "amber" ? "#f59e0b" : "#22c55e";
  const thumbBg = accentColor === "amber" ? "bg-amber-400" : "bg-green-400";
  const pct = ((value - config.min) / (config.max - config.min)) * 100;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-muted-foreground w-20 flex-shrink-0 truncate">{config.label}</span>
      <div className="relative flex-1 flex items-center" style={{ height: 20 }}>
        {/* Track background */}
        <div className="absolute inset-x-0 h-2 rounded-full bg-muted/40" style={{ top: "50%", transform: "translateY(-50%)" }} />
        {/* Filled track */}
        <div
          className="absolute h-2 rounded-full opacity-70"
          style={{ left: 0, width: `${pct}%`, top: "50%", transform: "translateY(-50%)", backgroundColor: trackColor }}
        />
        {/* Thumb indicator */}
        <div
          className={`absolute w-4 h-4 rounded-full shadow-md border-2 border-white/80 ${thumbBg} pointer-events-none`}
          style={{ left: `calc(${pct}% - 8px)`, top: "50%", transform: "translateY(-50%)" }}
        />
        {/* Invisible range input on top */}
        <input
          type="range" min={config.min} max={config.max} step={config.step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-grab active:cursor-grabbing"
          style={{ height: "100%" }}
        />
      </div>
      <span className="text-xs font-mono font-medium w-20 text-right flex-shrink-0">
        {config.format(value, currencySymbol)}
      </span>
    </div>
  );
}

function InputRow({ label, value, onChange, suffix, min, max, step, isCurrency }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; min?: number; max?: number; step?: number; isCurrency?: boolean;
}) {
  const [focused, setFocused] = React.useState(false);
  const displayValue = focused ? value : (isCurrency
    ? new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(value)
    : new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 }).format(value));
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        {isCurrency && !focused && <span className="text-xs text-muted-foreground">R</span>}
        <input
          type={focused ? "number" : "text"}
          value={displayValue}
          min={min} max={max} step={step ?? 1}
          onFocus={() => setFocused(true)}
          onBlur={e => { setFocused(false); onChange(Number(e.target.value)); }}
          onChange={e => focused && onChange(Number(e.target.value))}
          className="w-24 text-right text-xs bg-muted/30 border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary/50"
        />
        {suffix && <span className="text-xs text-muted-foreground w-12">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted/60"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function ChartTooltipContent({ active, payload, label, fmt }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string; fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-900 border border-border/50 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-medium mb-2 text-foreground">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="mb-0.5">
          {p.name}: <span className="font-semibold">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Explanation Card ─────────────────────────────────────────────────────────
function ExplanationCard({ onClose }: { onClose: () => void }) {
  return (
    <div className="card p-5 mb-6 border border-primary/30 bg-primary/5 relative">
      <button
        type="button" onClick={onClose}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Close explanation"
      >
        <X size={16} />
      </button>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Info size={16} className="text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-1">What is TCO — and why does profit matter more?</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Total Cost of Ownership (TCO)</strong> is the full cost of running a truck over its lifetime — purchase price, fuel or energy, maintenance, insurance, and finance. Comparing TCO between diesel and electric trucks tells you which is cheaper to operate.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-2">
            But cost alone does not tell you whether your fleet is <strong className="text-foreground">profitable</strong>. This calculator goes further: enter your revenue rate (what you charge per km), and the tool shows you the <strong className="text-foreground">profit generated by each truck type</strong> over its lifetime — and how much more profit an electric truck can generate compared to diesel.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          {
            icon: <DollarSign size={14} className="text-primary" />,
            step: "Step 1",
            title: "Set your revenue",
            body: "Enter your selling price per km (your rate card), or use the default 10% profit margin. This is what you charge your customer per kilometre.",
          },
          {
            icon: <Truck size={14} className="text-amber-400" />,
            step: "Step 2",
            title: "Enter your parameters",
            body: "Scroll down to the detailed input tables. Enter your actual fleet data — purchase price, fuel cost, maintenance, insurance, and finance terms.",
          },
          {
            icon: <Target size={14} className="text-green-400" />,
            step: "Step 3",
            title: "Optimise with sliders",
            body: "Use the mixing desk sliders to test scenarios in real time. See how changes to diesel price, electricity tariff, or vehicle price shift the profit curves.",
          },
          {
            icon: <Users size={14} className="text-blue-400" />,
            step: "Step 4 & 5",
            title: "Scale to your fleet",
            body: "Set your fleet size to see total lifetime profit across all trucks. Then join a pilot project to implement — click the button at the bottom of the page.",
          },
        ].map(item => (
          <div key={item.step} className="rounded-lg bg-muted/20 border border-border/30 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              {item.icon}
              <span className="text-xs font-semibold text-foreground">{item.step}: {item.title}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/60 italic">
        Close this card once you have read it — it will not appear again in this session.
      </p>
    </div>
  );
}

// ─── Revenue Input Card ───────────────────────────────────────────────────────
function RevenueInputCard({ mode, setMode, marginPct, setMarginPct, sellingPricePerKm, setSellingPricePerKm, effectiveRatePerKm, dieselCpm, electricCpm, currencySymbol }: {
  mode: "margin" | "price";
  setMode: (m: "margin" | "price") => void;
  marginPct: number; setMarginPct: (v: number) => void;
  sellingPricePerKm: number; setSellingPricePerKm: (v: number) => void;
  effectiveRatePerKm: number;
  dieselCpm: number; electricCpm: number; currencySymbol: string;
}) {
  const dieselMarginPct = effectiveRatePerKm > 0 ? ((effectiveRatePerKm - dieselCpm) / effectiveRatePerKm) * 100 : 0;
  const electricMarginPct = effectiveRatePerKm > 0 ? ((effectiveRatePerKm - electricCpm) / effectiveRatePerKm) * 100 : 0;

  return (
    <div className="card p-4 mb-4 border-l-2 border-l-primary">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-primary" />
          <h3 className="text-sm font-semibold">Revenue & Profit Model</h3>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-border/40 text-xs">
          <button
            type="button"
            onClick={() => setMode("margin")}
            className={`px-3 py-1.5 transition-colors ${mode === "margin" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted/30"}`}
          >
            Margin %
          </button>
          <button
            type="button"
            onClick={() => setMode("price")}
            className={`px-3 py-1.5 transition-colors ${mode === "price" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted/30"}`}
          >
            Price per km
          </button>
        </div>
      </div>

      {/* Selling price — single line, mode-aware input */}
      <div className="flex items-center gap-3 mb-3 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
        <span className="text-xs text-muted-foreground flex-1">Selling price per km <span className="text-primary/60">(same for both trucks)</span></span>
        {mode === "margin" ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Diesel margin</span>
            <input
              type="number" value={marginPct} min={1} max={80} step={0.5}
              onChange={e => setMarginPct(Number(e.target.value))}
              className="w-14 text-right text-xs bg-muted/30 border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary/50"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <span className="text-xs text-muted-foreground mx-1">→</span>
            <span className="text-sm font-bold text-primary">{currencySymbol}{effectiveRatePerKm.toFixed(2)}/km</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{currencySymbol}</span>
            <input
              type="number" value={sellingPricePerKm} min={0.1} max={500} step={0.1}
              onChange={e => setSellingPricePerKm(Number(e.target.value))}
              className="w-20 text-right text-xs bg-muted/30 border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary/50"
            />
            <span className="text-xs text-muted-foreground">/km</span>
          </div>
        )}
      </div>

      {/* Margin breakdown — compact one-line per truck */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">Diesel</span>
          <span className="text-sm font-bold text-amber-400">{dieselMarginPct.toFixed(1)}%</span>
          <span className="text-xs text-muted-foreground ml-auto">{currencySymbol}{dieselCpm.toFixed(2)}/km cost</span>
        </div>
        <div className="flex-1 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">Electric</span>
          <span className="text-sm font-bold text-green-400">{electricMarginPct.toFixed(1)}%</span>
          <span className="text-xs text-muted-foreground ml-auto">{currencySymbol}{electricCpm.toFixed(2)}/km cost</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TCOv2Client() {
  const [showExplanation, setShowExplanation] = useState(true);
  const [inputs, setInputs] = useState<Inputs>(ZAR_DEFAULTS);
  const [currencyCode, setCurrencyCode] = useState("ZAR");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [truckType, setTruckType] = useState("");
  const [useCase, setUseCase] = useState("");
  const [fleetSize, setFleetSize] = useState(1);
  const [revenueMode, setRevenueMode] = useState<"margin" | "price">("margin");
  const [marginPct, setMarginPct] = useState(10);
  const [sellingPricePerKm, setSellingPricePerKm] = useState(20);
  const [detailOpen, setDetailOpen] = useState(true);
  const [optOpen, setOptOpen] = useState(false);

  const currency = getCurrency(currencyCode);

  const set = useCallback((field: keyof Inputs) => (value: number | boolean) => {
    setInputs(prev => {
      const next = { ...prev, [field]: value };
      // Keep linked fields in sync
      if (!prev.decoupleKmLife) {
        if (field === "monthlyKm") {
          next.dieselMonthlyKm = value as number;
          next.electricMonthlyKm = value as number;
        }
        if (field === "vehicleLifeYears") {
          next.dieselVehicleLifeYears = value as number;
          next.electricVehicleLifeYears = value as number;
        }
      }
      return next;
    });
  }, []);

  // Geo-IP currency detection
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then(data => {
        const detected = COUNTRY_CURRENCY[data.country_code];
        if (detected && detected !== "ZAR") {
          const newCurrency = getCurrency(detected);
          setInputs(convertDefaults(ZAR_DEFAULTS, newCurrency.rate));
          setCurrencyCode(detected);
        }
      })
      .catch(() => {});
  }, []);

  // Session persistence for explanation card
  useEffect(() => {
    const seen = sessionStorage.getItem("tco-explanation-seen");
    if (seen) setShowExplanation(false);
  }, []);

  const handleCloseExplanation = () => {
    setShowExplanation(false);
    sessionStorage.setItem("tco-explanation-seen", "1");
  };

  const handleCurrencyChange = (code: string) => {
    const newCurrency = getCurrency(code);
    setInputs(convertDefaults(ZAR_DEFAULTS, newCurrency.rate));
    setCurrencyCode(code);
    setCurrencyOpen(false);
  };

  // Step 1: run a preliminary calc with a dummy revenue to get diesel cpm
  const prelimResult = useMemo(() => calcTCO(inputs, 0), [inputs]);

  // Step 2: derive the single selling price per km (same for both trucks)
  // In margin mode: selling price = dieselCpm / (1 - margin/100)
  // The operator charges this rate to every customer regardless of truck type.
  // Electric truck earns a higher margin because its costs are lower.
  const effectiveRevenuePerKm = useMemo(() => {
    if (revenueMode === "price") return sellingPricePerKm;
    // margin mode: back-calculate from diesel cost so the diesel truck earns exactly marginPct%
    // electric truck will earn a higher margin at the same rate
    return prelimResult.dieselCpm / (1 - marginPct / 100);
  }, [revenueMode, sellingPricePerKm, marginPct, prelimResult.dieselCpm]);

  const finalResult = useMemo(() => calcTCO(inputs, effectiveRevenuePerKm), [inputs, effectiveRevenuePerKm]);

  const electricIsCheaper = finalResult.totalSaving > 0;
  const electricMoreProfitable = finalResult.totalProfitDelta > 0;

  const fmt = (n: number) =>
    `${currency.symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
  const fmtShort = (n: number) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}${currency.symbol}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${currency.symbol}${(abs / 1_000).toFixed(0)}K`;
    return `${sign}${currency.symbol}${abs.toFixed(0)}`;
  };
  const fmtCpm = (n: number) => `${currency.symbol}${n.toFixed(2)}/km`;

  // Chart data
  const tcoChartData = finalResult.years.map(r => ({
    year: `Y${r.year}`,
    "Diesel TCO": Math.round(r.dieselCumulative),
    "Electric TCO": Math.round(r.electricCumulative),
  }));

  const profitChartData = finalResult.years.map(r => ({
    year: `Y${r.year}`,
    "Diesel Profit": Math.round(r.dieselCumProfit),
    "Electric Profit": Math.round(r.electricCumProfit),
  }));

  const annualProfitData = finalResult.years.map(r => ({
    year: `Y${r.year}`,
    "Diesel": Math.round(r.dieselProfit),
    "Electric": Math.round(r.electricProfit),
  }));

  const profitDeltaData = finalResult.years.map(r => ({
    year: `Y${r.year}`,
    "Profit Advantage": Math.round(r.profitDelta),
  }));

  const dKm = inputs.decoupleKmLife ? inputs.dieselMonthlyKm : inputs.monthlyKm;
  const eKm = inputs.decoupleKmLife ? inputs.electricMonthlyKm : inputs.monthlyKm;
  const dLife = inputs.decoupleKmLife ? inputs.dieselVehicleLifeYears : inputs.vehicleLifeYears;
  const eLife = inputs.decoupleKmLife ? inputs.electricVehicleLifeYears : inputs.vehicleLifeYears;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 pt-28 pb-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Fleet Profit & TCO Calculator</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compare diesel vs electric truck profitability over the full vehicle lifetime
            </p>
          </div>
          {/* Context bar */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Currency */}
            <div className="relative">
              <button type="button" onClick={() => setCurrencyOpen(!currencyOpen)}
                className="flex items-center gap-1.5 text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors">
                <span>{currencyCode}</span>
                <ChevronDown size={12} />
              </button>
              {currencyOpen && (
                <div className="absolute right-0 top-full mt-1 bg-navy-900 border border-border/50 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden">
                  {CURRENCIES.map(c => (
                    <button key={c.code} type="button" onClick={() => handleCurrencyChange(c.code)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/30 transition-colors ${currencyCode === c.code ? "text-primary font-semibold" : "text-foreground"}`}>
                      {c.code} — {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Truck type */}
            <input value={truckType} onChange={e => setTruckType(e.target.value)}
              placeholder="Truck type…"
              className="text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/50 w-32 focus:outline-none focus:border-primary/50" />
            <input value={useCase} onChange={e => setUseCase(e.target.value)}
              placeholder="Use case…"
              className="text-xs bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/50 w-32 focus:outline-none focus:border-primary/50" />
          </div>
        </div>

        {/* ── Explanation Card ── */}
        <div
          style={{
            maxHeight: showExplanation ? "600px" : "0px",
            opacity: showExplanation ? 1 : 0,
            overflow: "hidden",
            transition: "max-height 0.4s ease, opacity 0.3s ease",
            marginBottom: showExplanation ? undefined : "0",
          }}
        >
          <ExplanationCard onClose={handleCloseExplanation} />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            INPUT PARAMETERS (moved here — directly below guide card)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="card mb-4 overflow-hidden border border-primary/30">
          <button type="button" onClick={() => setDetailOpen(!detailOpen)}
            className="w-full flex items-center justify-between px-5 py-4 text-left bg-primary/10 hover:bg-primary/20 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Truck size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Fleet Input Parameters</p>
                <p className="text-xs text-muted-foreground mt-0.5">Enter your actual fleet data for a precise result — click to {detailOpen ? "collapse" : "expand"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary font-semibold">{detailOpen ? "Hide" : "Show"}</span>
              {detailOpen ? <ChevronUp size={18} className="text-primary flex-shrink-0" />
                : <ChevronDown size={18} className="text-primary flex-shrink-0" />}
            </div>
          </button>
          {detailOpen && (
            <div className="px-5 pb-5 border-t border-primary/20">
              <div className="grid sm:grid-cols-2 gap-6 mt-4">
                {/* Diesel */}
                <div>
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-3">Diesel Truck</p>
                  <InputRow label="Monthly kilometres" value={dKm} onChange={set(inputs.decoupleKmLife ? "dieselMonthlyKm" : "monthlyKm") as (v: number) => void} suffix="km/month" min={1000} max={50000} step={500} />
                  <InputRow label="Vehicle life" value={dLife} onChange={set(inputs.decoupleKmLife ? "dieselVehicleLifeYears" : "vehicleLifeYears") as (v: number) => void} suffix="years" min={3} max={15} />
                  <InputRow label="Purchase price" value={inputs.dieselPurchasePrice} onChange={set("dieselPurchasePrice") as (v: number) => void} suffix={currency.code} min={500000} max={10000000} step={50000} isCurrency />
                  <ToggleRow label="Financed" value={inputs.dieselFinanced} onChange={set("dieselFinanced") as (v: boolean) => void} />
                  {inputs.dieselFinanced && <>
                    <InputRow label="Deposit" value={inputs.dieselDepositPct} onChange={set("dieselDepositPct") as (v: number) => void} suffix="%" min={0} max={50} />
                    <InputRow label="Finance rate" value={inputs.dieselFinanceRate} onChange={set("dieselFinanceRate") as (v: number) => void} suffix="% p.a." min={0} max={30} step={0.25} />
                    <InputRow label="Finance term" value={inputs.dieselFinanceTerm} onChange={set("dieselFinanceTerm") as (v: number) => void} suffix="months" min={12} max={84} step={12} />
                  </>}
                  <InputRow label="Fuel consumption" value={inputs.dieselFuelConsumption} onChange={set("dieselFuelConsumption") as (v: number) => void} suffix="L/100km" min={15} max={80} step={0.5} />
                  <InputRow label="Diesel price" value={inputs.dieselFuelPrice} onChange={set("dieselFuelPrice") as (v: number) => void} suffix={`${currency.code}/L`} min={5} max={100} step={0.5} />
                  <InputRow label="Fuel price escalation" value={inputs.dieselFuelEscalation} onChange={set("dieselFuelEscalation") as (v: number) => void} suffix="% p.a." min={0} max={20} step={0.5} />
                  <InputRow label="Maintenance" value={inputs.dieselMaintenanceCpm} onChange={set("dieselMaintenanceCpm") as (v: number) => void} suffix={`${currency.code}/km`} min={0.1} max={5} step={0.05} />
                  <InputRow label="Insurance (annual)" value={inputs.dieselInsuranceAnnual} onChange={set("dieselInsuranceAnnual") as (v: number) => void} suffix={currency.code} min={10000} max={500000} step={5000} isCurrency />
                  <InputRow label="Residual value" value={inputs.dieselResidualPct} onChange={set("dieselResidualPct") as (v: number) => void} suffix="%" min={0} max={40} />
                </div>
                {/* Electric */}
                <div>
                  <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-3">Electric Truck</p>
                  <InputRow label="Monthly kilometres" value={eKm} onChange={set(inputs.decoupleKmLife ? "electricMonthlyKm" : "monthlyKm") as (v: number) => void} suffix="km/month" min={1000} max={50000} step={500} />
                  <InputRow label="Vehicle life" value={eLife} onChange={set(inputs.decoupleKmLife ? "electricVehicleLifeYears" : "vehicleLifeYears") as (v: number) => void} suffix="years" min={3} max={15} />
                  <InputRow label="Purchase price" value={inputs.electricPurchasePrice} onChange={set("electricPurchasePrice") as (v: number) => void} suffix={currency.code} min={1000000} max={20000000} step={100000} isCurrency />
                  <ToggleRow label="Financed" value={inputs.electricFinanced} onChange={set("electricFinanced") as (v: boolean) => void} />
                  {inputs.electricFinanced && <>
                    <InputRow label="Deposit" value={inputs.electricDepositPct} onChange={set("electricDepositPct") as (v: number) => void} suffix="%" min={0} max={50} />
                    <InputRow label="Finance rate" value={inputs.electricFinanceRate} onChange={set("electricFinanceRate") as (v: number) => void} suffix="% p.a." min={0} max={30} step={0.25} />
                    <InputRow label="Finance term" value={inputs.electricFinanceTerm} onChange={set("electricFinanceTerm") as (v: number) => void} suffix="months" min={12} max={84} step={12} />
                  </>}
                  <InputRow label="Energy consumption" value={inputs.electricEnergyConsumption} onChange={set("electricEnergyConsumption") as (v: number) => void} suffix="kWh/100km" min={50} max={400} step={5} />
                  <InputRow label="Electricity tariff" value={inputs.electricEnergyPrice} onChange={set("electricEnergyPrice") as (v: number) => void} suffix={`${currency.code}/kWh`} min={0.5} max={20} step={0.1} />
                  <InputRow label="Tariff escalation" value={inputs.electricEnergyEscalation} onChange={set("electricEnergyEscalation") as (v: number) => void} suffix="% p.a." min={0} max={20} step={0.5} />
                  <InputRow label="Maintenance" value={inputs.electricMaintenanceCpm} onChange={set("electricMaintenanceCpm") as (v: number) => void} suffix={`${currency.code}/km`} min={0.05} max={3} step={0.05} />
                  <InputRow label="Insurance (annual)" value={inputs.electricInsuranceAnnual} onChange={set("electricInsuranceAnnual") as (v: number) => void} suffix={currency.code} min={10000} max={500000} step={5000} isCurrency />
                  <InputRow label="Residual value" value={inputs.electricResidualPct} onChange={set("electricResidualPct") as (v: number) => void} suffix="%" min={0} max={40} />
                </div>
              </div>
              {/* Decouple toggle */}
              <div className="mt-4 pt-3 border-t border-border/20 flex items-center gap-2">
                <input type="checkbox" id="decouple-top" checked={inputs.decoupleKmLife}
                  onChange={e => set("decoupleKmLife")(e.target.checked as unknown as number)}
                  className="w-4 h-4 accent-primary" />
                <label htmlFor="decouple-top" className="text-xs text-muted-foreground cursor-pointer">
                  Decouple km/month and vehicle life (set independently for diesel and electric)
                </label>
              </div>
            </div>
          )}
        </div>

        {/* ── Revenue Model Card ── */}
        <RevenueInputCard
          mode={revenueMode} setMode={setRevenueMode}
          marginPct={marginPct} setMarginPct={setMarginPct}
          sellingPricePerKm={sellingPricePerKm} setSellingPricePerKm={setSellingPricePerKm}
          effectiveRatePerKm={effectiveRevenuePerKm}
          dieselCpm={finalResult.dieselCpm} electricCpm={finalResult.electricCpm}
          currencySymbol={currency.symbol}
        />

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1: TCO CURVES + PROFIT CURVES (2×2 grid)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          {/* TCO Cumulative */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Cumulative Cost (TCO)</h3>
            <p className="text-xs text-muted-foreground mb-3">Total accumulated cost including purchase and operating costs.</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={tcoChartData} margin={{ top: 4, right: 64, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => fmtShort(v)} width={52} />
                <ReTooltip content={({ active, payload, label }) =>
                  <ChartTooltipContent active={active} payload={payload as any} label={String(label ?? "")} fmt={fmt} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="Diesel TCO" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Electric TCO" stroke="#22c55e" strokeWidth={2} dot={false} />

              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Cumulative Profit */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Cumulative Profit</h3>
            <p className="text-xs text-muted-foreground mb-3">Total profit generated per truck after all costs, at your revenue rate.</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={profitChartData} margin={{ top: 4, right: 64, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => fmtShort(v)} width={52} />
                <ReTooltip content={({ active, payload, label }) =>
                  <ChartTooltipContent active={active} payload={payload as any} label={String(label ?? "")} fmt={fmt} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="Diesel Profit" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Electric Profit" stroke="#22c55e" strokeWidth={2} dot={false} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />

              </LineChart>
            </ResponsiveContainer>
          </div>

        </div>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 2b: OPTIMIZER SLIDERS (between top and bottom charts)
        ════════════════════════════════════════════════════════════════ */}
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Target size={14} className="text-primary" />
              Profit Optimiser
            </h2>
            <span className="text-xs text-muted-foreground/60 italic flex items-center gap-1">
              <span>↔</span> drag sliders to optimise
            </span>
          </div>
          <div className="grid grid-cols-2 gap-0 divide-x divide-border/30">
            {/* Left — Diesel */}
            <div className="pr-4">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">Diesel</p>
              <div className="space-y-0.5">
                {DIESEL_SLIDERS.map(cfg => (
                  <MixerSlider
                    key={cfg.field}
                    config={cfg}
                    value={inputs[cfg.field] as number}
                    onChange={set(cfg.field) as (v: number) => void}
                    currencySymbol={currency.symbol}
                    accentColor="amber"
                  />
                ))}
              </div>
            </div>
            {/* Right — Electric */}
            <div className="pl-4">
              <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">Electric</p>
              <div className="space-y-0.5">
                {ELECTRIC_SLIDERS.map(cfg => (
                  <MixerSlider
                    key={cfg.field}
                    config={cfg}
                    value={inputs[cfg.field] as number}
                    onChange={set(cfg.field) as (v: number) => void}
                    currencySymbol={currency.symbol}
                    accentColor="green"
                  />
                ))}
              </div>
            </div>
          </div>
          {/* Decouple toggle */}
          <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Monthly km and vehicle life are linked (same for both trucks)</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-muted-foreground">Decouple</span>
              <button type="button" onClick={() => set("decoupleKmLife")(!inputs.decoupleKmLife)}
                className={`relative w-9 h-5 rounded-full transition-colors ${inputs.decoupleKmLife ? "bg-primary" : "bg-muted/60"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${inputs.decoupleKmLife ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </label>
          </div>
          {inputs.decoupleKmLife && (
            <div className="mt-3 grid grid-cols-2 gap-4 pt-3 border-t border-border/20">
              <div>
                <p className="text-xs font-semibold text-amber-400 mb-2">Diesel (decoupled)</p>
                <InputRow label="Monthly km" value={inputs.dieselMonthlyKm} onChange={set("dieselMonthlyKm") as (v: number) => void} suffix="km" min={1000} max={50000} step={500} />
                <InputRow label="Vehicle life" value={inputs.dieselVehicleLifeYears} onChange={set("dieselVehicleLifeYears") as (v: number) => void} suffix="yrs" min={3} max={15} />
              </div>
              <div>
                <p className="text-xs font-semibold text-green-400 mb-2">Electric (decoupled)</p>
                <InputRow label="Monthly km" value={inputs.electricMonthlyKm} onChange={set("electricMonthlyKm") as (v: number) => void} suffix="km" min={1000} max={50000} step={500} />
                <InputRow label="Vehicle life" value={inputs.electricVehicleLifeYears} onChange={set("electricVehicleLifeYears") as (v: number) => void} suffix="yrs" min={3} max={15} />
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 1b: BOTTOM TWO CHARTS (Annual Profit + Profit Advantage)
        ════════════════════════════════════════════════════════════════ */}
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          {/* Annual Profit Bars */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Annual Profit per Truck</h3>
            <p className="text-xs text-muted-foreground mb-3">Year-by-year profit for each truck type.</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={annualProfitData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => fmtShort(v)} width={52} />
                <ReTooltip content={({ active, payload, label }) =>
                  <ChartTooltipContent active={active} payload={payload as any} label={String(label ?? "")} fmt={fmt} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Bar dataKey="Diesel" fill="#f59e0b" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                <Bar dataKey="Electric" fill="#22c55e" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Profit Advantage */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Cumulative Profit Advantage (Electric vs Diesel)</h3>
            <p className="text-xs text-muted-foreground mb-3">How much more cumulative profit the electric truck generates. Positive = electric ahead.</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={profitDeltaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => fmtShort(v)} width={52} />
                <ReTooltip content={({ active, payload, label }) =>
                  <ChartTooltipContent active={active} payload={payload as any} label={String(label ?? "")} fmt={fmt} />} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
                <Area dataKey="Profit Advantage"
                  stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>



        {/* ══════════════════════════════════════════════════════════════════
            SECTION 3: SUMMARY BANNERS
        ══════════════════════════════════════════════════════════════════ */}
        <div className="card p-4 mb-4">
          {/* Fleet size stepper */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/30">
            <div>
              <p className="text-sm font-semibold">Fleet size</p>
              <p className="text-xs text-muted-foreground mt-0.5">Scales lifetime savings and profit figures</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setFleetSize(f => Math.max(1, f - 1))}
                className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center text-sm hover:bg-muted/40 transition-colors font-bold">−</button>
              <span className="w-10 text-center font-semibold text-sm">{fleetSize}</span>
              <button type="button" onClick={() => setFleetSize(f => Math.min(500, f + 1))}
                className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center text-sm hover:bg-muted/40 transition-colors font-bold">+</button>
            </div>
          </div>

          {/* Per-truck TCO boxes */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground mb-1">Diesel TCO (per truck)</p>
              <p className="text-lg font-bold text-amber-400">{fmtShort(finalResult.dieselTCO)}</p>
              <p className="text-xs text-muted-foreground">{fmtCpm(finalResult.dieselCpm)}</p>
            </div>
            <div className="rounded-xl bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground mb-1">Electric TCO (per truck)</p>
              <p className="text-lg font-bold text-green-400">{fmtShort(finalResult.electricTCO)}</p>
              <p className="text-xs text-muted-foreground">{fmtCpm(finalResult.electricCpm)}</p>
            </div>
          </div>

          {/* Profit banner */}
          <div className={`rounded-xl p-4 ${electricMoreProfitable ? "bg-green-500/10 border-2 border-green-500/30" : "bg-amber-500/10 border-2 border-amber-500/30"}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
              {electricMoreProfitable ? "📈 Profit Advantage — Electric generates more profit" : "📊 Diesel generates more profit under current inputs"}
            </p>
            <p className={`text-3xl font-extrabold leading-tight ${electricMoreProfitable ? "text-green-400" : "text-amber-400"}`}>
              {fmtShort(Math.abs(finalResult.totalProfitDelta) * fleetSize)}
              {fleetSize > 1 && <span className="text-base font-normal text-muted-foreground ml-2">({fleetSize} trucks)</span>}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              extra lifetime profit from {electricMoreProfitable ? "electric" : "diesel"} vs the alternative
            </p>
            <div className="mt-3 pt-3 border-t border-green-500/20 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Diesel lifetime profit</p>
                <p className="text-sm font-bold text-amber-400">{fmtShort(finalResult.dieselFinalCumProfit * fleetSize)}</p>
                <p className="text-xs text-muted-foreground">{fleetSize > 1 ? `${fleetSize} trucks` : "per truck"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Electric lifetime profit</p>
                <p className="text-sm font-bold text-green-400">{fmtShort(finalResult.electricFinalCumProfit * fleetSize)}</p>
                <p className="text-xs text-muted-foreground">{fleetSize > 1 ? `${fleetSize} trucks` : "per truck"}</p>
              </div>
            </div>
            {finalResult.profitBreakEvenYear && electricMoreProfitable && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-green-500/20">
                📈 Electric overtakes diesel in cumulative profit at Year {finalResult.profitBreakEvenYear}.
              </p>
            )}
          </div>
        </div>

        {/* SECTION 4 removed — input table moved above revenue card */}

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 5: PILOT CTA
        ══════════════════════════════════════════════════════════════════ */}
        <div className="card p-6 text-center border border-primary/40 bg-primary/5">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Zap size={22} className="text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Ready to implement?</h2>
          <p className="text-sm text-muted-foreground mb-2 max-w-lg mx-auto">
            The numbers show the opportunity. The next step is building the ecosystem to make it real — charging infrastructure, driver training, fleet finance, and operational support.
          </p>
          <p className="text-sm text-muted-foreground mb-6 max-w-lg mx-auto">
            Join a TAG pilot project and be part of the first wave of operators deploying electric trucks profitably in Southern Africa.
          </p>
          <a
            href="mailto:Abdool@transportactiongroup.com?subject=Join%20Electric%20Truck%20Pilot%20Project&body=I%20am%20interested%20in%20joining%20the%20TAG%20electric%20truck%20pilot%20project.%20Please%20contact%20me%20to%20discuss%20next%20steps."
            className="btn-primary inline-flex items-center gap-2 text-sm px-6 py-3"
          >
            <Zap size={15} />
            Join the Pilot Project
            <ArrowRight size={15} />
          </a>
          <p className="text-xs text-muted-foreground mt-4">
            Or call us to discuss your fleet:{" "}
            <Link href="/contact" className="text-primary hover:underline">Contact TAG →</Link>
          </p>
        </div>

      </div>
    </div>
  );
}
