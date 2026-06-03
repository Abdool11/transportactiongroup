"use client";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Download, FileText, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Inputs {
  dieselMonthlyKm: number;
  dieselVehicleLifeYears: number;
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
  electricMonthlyKm: number;
  electricVehicleLifeYears: number;
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
}

interface YearResult {
  year: number;
  dieselOpex: number;
  dieselFinance: number;
  dieselTotal: number;
  electricOpex: number;
  electricFinance: number;
  electricTotal: number;
  dieselCumulative: number;
  electricCumulative: number;
  saving: number;
}

// ─── Country → Currency mapping ──────────────────────────────────────────────
const COUNTRY_CURRENCY: Record<string, string> = {
  ZA: "ZAR",
  KE: "KES", TZ: "TZS", UG: "UGX", RW: "RWF", BI: "BIF",
  ZM: "ZMW", MW: "MWK", MZ: "MZN", ET: "ETB",
  DE: "EUR", FR: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", ES: "EUR",
  PT: "EUR", IT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
  SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", CY: "EUR", MT: "EUR",
};

// ─── Currencies ───────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: "ZAR", symbol: "R",   name: "South African Rand",  flag: "🇿🇦", rate: 1       },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling",     flag: "🇰🇪", rate: 7.82    },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling",  flag: "🇹🇿", rate: 157.38  },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling",    flag: "🇺🇬", rate: 224.57  },
  { code: "RWF", symbol: "RF",  name: "Rwandan Franc",       flag: "🇷🇼", rate: 88.29   },
  { code: "BIF", symbol: "Fr",  name: "Burundian Franc",     flag: "🇧🇮", rate: 179.48  },
  { code: "ZMW", symbol: "ZK",  name: "Zambian Kwacha",      flag: "🇿🇲", rate: 1.14    },
  { code: "MWK", symbol: "MK",  name: "Malawian Kwacha",     flag: "🇲🇼", rate: 104.77  },
  { code: "MZN", symbol: "MT",  name: "Mozambican Metical",  flag: "🇲🇿", rate: 3.86    },
  { code: "ETB", symbol: "Br",  name: "Ethiopian Birr",      flag: "🇪🇹", rate: 9.37    },
  { code: "EUR", symbol: "€",   name: "Euro",                flag: "🇪🇺", rate: 0.0516  },
  { code: "USD", symbol: "$",   name: "US Dollar",           flag: "🇺🇸", rate: 0.0605  },
];

function getCurrency(code: string) {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];
}

const PRICE_FIELDS: (keyof Inputs)[] = [
  "dieselPurchasePrice", "dieselFuelPrice", "dieselMaintenanceCpm", "dieselInsuranceAnnual",
  "electricPurchasePrice", "electricEnergyPrice", "electricMaintenanceCpm", "electricInsuranceAnnual",
];

function convertDefaults(defaults: Inputs, rate: number): Inputs {
  const result = { ...defaults };
  for (const field of PRICE_FIELDS) {
    (result as Record<string, number | boolean>)[field] =
      Math.round((defaults[field] as number) * rate * 100) / 100;
  }
  return result;
}

// ─── Finance helpers ──────────────────────────────────────────────────────────
function monthlyInstalment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 100 / 12;
  return (principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

function annualFinanceCost(
  purchasePrice: number, depositPct: number, annualRate: number,
  termMonths: number, year: number,
): number {
  const principal = purchasePrice * (1 - depositPct / 100);
  if (principal <= 0 || annualRate <= 0) return 0;
  const monthly = monthlyInstalment(principal, annualRate, termMonths);
  const startMonth = (year - 1) * 12 + 1;
  const endMonth = year * 12;
  const activeMonths = Math.max(0, Math.min(endMonth, termMonths) - Math.max(startMonth - 1, 0));
  return monthly * activeMonths;
}

// ─── Calculation engine ───────────────────────────────────────────────────────
function calcTCO(inputs: Inputs) {
  const maxYears = Math.max(inputs.dieselVehicleLifeYears, inputs.electricVehicleLifeYears);
  const years: YearResult[] = [];
  const dieselDeposit = inputs.dieselPurchasePrice * (inputs.dieselDepositPct / 100);
  const electricDeposit = inputs.electricPurchasePrice * (inputs.electricDepositPct / 100);
  let dieselCumulative = inputs.dieselFinanced ? dieselDeposit : inputs.dieselPurchasePrice;
  let electricCumulative = inputs.electricFinanced ? electricDeposit : inputs.electricPurchasePrice;
  let breakEvenYear: number | null = null;

  for (let y = 1; y <= maxYears; y++) {
    let dOpex = 0;
    if (y <= inputs.dieselVehicleLifeYears) {
      const dFuelPrice = inputs.dieselFuelPrice * Math.pow(1 + inputs.dieselFuelEscalation / 100, y - 1);
      const annualKm = inputs.dieselMonthlyKm * 12;
      dOpex = (annualKm / 100) * inputs.dieselFuelConsumption * dFuelPrice
        + annualKm * inputs.dieselMaintenanceCpm
        + inputs.dieselInsuranceAnnual;
    }
    const dFinance = inputs.dieselFinanced
      ? annualFinanceCost(inputs.dieselPurchasePrice, inputs.dieselDepositPct, inputs.dieselFinanceRate, inputs.dieselFinanceTerm, y)
      : 0;
    const dTotal = dOpex + dFinance;

    let eOpex = 0;
    if (y <= inputs.electricVehicleLifeYears) {
      const eEnergyPrice = inputs.electricEnergyPrice * Math.pow(1 + inputs.electricEnergyEscalation / 100, y - 1);
      const annualKm = inputs.electricMonthlyKm * 12;
      eOpex = (annualKm / 100) * inputs.electricEnergyConsumption * eEnergyPrice
        + annualKm * inputs.electricMaintenanceCpm
        + inputs.electricInsuranceAnnual;
    }
    const eFinance = inputs.electricFinanced
      ? annualFinanceCost(inputs.electricPurchasePrice, inputs.electricDepositPct, inputs.electricFinanceRate, inputs.electricFinanceTerm, y)
      : 0;
    const eTotal = eOpex + eFinance;

    dieselCumulative += dTotal;
    electricCumulative += eTotal;
    const saving = dieselCumulative - electricCumulative;
    if (breakEvenYear === null && saving >= 0) breakEvenYear = y;

    years.push({
      year: y, dieselOpex: dOpex, dieselFinance: dFinance, dieselTotal: dTotal,
      electricOpex: eOpex, electricFinance: eFinance, electricTotal: eTotal,
      dieselCumulative, electricCumulative, saving,
    });
  }

  const dResidual = inputs.dieselPurchasePrice * (inputs.dieselResidualPct / 100);
  const eResidual = inputs.electricPurchasePrice * (inputs.electricResidualPct / 100);
  const dieselTCO = dieselCumulative - dResidual;
  const electricTCO = electricCumulative - eResidual;
  const dieselTotalKm = inputs.dieselMonthlyKm * 12 * inputs.dieselVehicleLifeYears;
  const electricTotalKm = inputs.electricMonthlyKm * 12 * inputs.electricVehicleLifeYears;
  const dieselCpm = dieselTCO / dieselTotalKm;
  const electricCpm = electricTCO / electricTotalKm;
  const totalSaving = dieselTCO - electricTCO;
  return { years, dieselTCO, electricTCO, dieselCpm, electricCpm, totalSaving, breakEvenYear };
}

// ─── ZAR defaults ─────────────────────────────────────────────────────────────
const ZAR_DEFAULTS: Inputs = {
  dieselMonthlyKm: 10000, dieselVehicleLifeYears: 7,
  dieselFinanced: true, dieselDepositPct: 10, dieselFinanceRate: 12, dieselFinanceTerm: 60,
  dieselPurchasePrice: 2200000, dieselFuelConsumption: 38, dieselFuelPrice: 24.5,
  dieselFuelEscalation: 6, dieselMaintenanceCpm: 0.85, dieselInsuranceAnnual: 85000, dieselResidualPct: 15,
  electricMonthlyKm: 10000, electricVehicleLifeYears: 7,
  electricFinanced: true, electricDepositPct: 10, electricFinanceRate: 12, electricFinanceTerm: 60,
  electricPurchasePrice: 4200000, electricEnergyConsumption: 160, electricEnergyPrice: 2.8,
  electricEnergyEscalation: 2, electricMaintenanceCpm: 0.35, electricInsuranceAnnual: 95000, electricResidualPct: 15,
};

// ─── Slider config ────────────────────────────────────────────────────────────
interface SliderConfig {
  label: string;
  field: keyof Inputs;
  min: number;
  max: number;
  step: number;
  format: (v: number, sym: string) => string;
}

const DIESEL_SLIDERS: SliderConfig[] = [
  { label: "Monthly km", field: "dieselMonthlyKm", min: 1000, max: 50000, step: 500, format: (v) => `${v.toLocaleString()} km` },
  { label: "Vehicle life", field: "dieselVehicleLifeYears", min: 3, max: 15, step: 1, format: (v) => `${v} yrs` },
  { label: "Vehicle price", field: "dieselPurchasePrice", min: 500000, max: 10000000, step: 50000, format: (v, s) => `${s}${(v / 1_000_000).toFixed(1)}M` },
  { label: "Finance rate", field: "dieselFinanceRate", min: 0, max: 30, step: 0.25, format: (v) => `${v}%` },
  { label: "Diesel price", field: "dieselFuelPrice", min: 5, max: 100, step: 0.5, format: (v, s) => `${s}${v.toFixed(1)}/L` },
];

const ELECTRIC_SLIDERS: SliderConfig[] = [
  { label: "Monthly km", field: "electricMonthlyKm", min: 1000, max: 50000, step: 500, format: (v) => `${v.toLocaleString()} km` },
  { label: "Vehicle life", field: "electricVehicleLifeYears", min: 3, max: 15, step: 1, format: (v) => `${v} yrs` },
  { label: "Vehicle price", field: "electricPurchasePrice", min: 1000000, max: 20000000, step: 100000, format: (v, s) => `${s}${(v / 1_000_000).toFixed(1)}M` },
  { label: "Finance rate", field: "electricFinanceRate", min: 0, max: 30, step: 0.25, format: (v) => `${v}%` },
  { label: "Electricity price", field: "electricEnergyPrice", min: 0.5, max: 20, step: 0.1, format: (v, s) => `${s}${v.toFixed(1)}/kWh` },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <Info size={13} className="text-muted-foreground/60 hover:text-muted-foreground cursor-help"
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} />
      {show && (
        <span className="absolute left-5 top-0 z-50 w-56 rounded-lg border border-border bg-card p-2.5 text-xs text-muted-foreground shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

function InputRow({ label, value, onChange, suffix, tooltip, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; tooltip?: string; min?: number; max?: number; step?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value));
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/30 last:border-0">
      <label className="text-sm text-muted-foreground flex items-center gap-1 flex-1">
        {label}{tooltip && <Tooltip text={tooltip} />}
      </label>
      <div className="flex items-center gap-1">
        {editing ? (
          <input type="number" value={raw} autoFocus step={step ?? 1} min={min} max={max}
            onChange={e => setRaw(e.target.value)}
            onBlur={() => { const n = parseFloat(raw) || 0; onChange(n); setRaw(String(n)); setEditing(false); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-24 text-right bg-background border border-primary/50 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <button type="button" onClick={() => { setRaw(String(value)); setEditing(true); }}
            className="w-24 text-right bg-background border border-border/50 rounded-md px-2 py-1 text-sm hover:border-primary/50 transition-colors">
            {value.toLocaleString("en-US")}
          </button>
        )}
        {suffix && <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function PriceInputRow({ label, value, onChange, currencySymbol, suffix, tooltip }: {
  label: string; value: number; onChange: (v: number) => void;
  currencySymbol: string; suffix?: string; tooltip?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value));
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/30 last:border-0">
      <label className="text-sm text-muted-foreground flex items-center gap-1 flex-1">
        {label}{tooltip && <Tooltip text={tooltip} />}
      </label>
      <div className="flex items-center gap-1">
        {editing ? (
          <input type="number" value={raw} autoFocus step={1000} min={0}
            onChange={e => setRaw(e.target.value)}
            onBlur={() => { const n = parseFloat(raw) || 0; onChange(n); setRaw(String(n)); setEditing(false); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-28 text-right bg-background border border-primary/50 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <button type="button" onClick={() => { setRaw(String(value)); setEditing(true); }}
            className="w-28 text-right bg-background border border-border/50 rounded-md px-2 py-1 text-sm hover:border-primary/50 transition-colors">
            {currencySymbol} {value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </button>
        )}
        {suffix && <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function DecimalPriceInputRow({ label, value, onChange, prefix, suffix, step }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value));
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/30 last:border-0">
      <label className="text-sm text-muted-foreground flex-1">{label}</label>
      <div className="flex items-center gap-1">
        {editing ? (
          <input type="number" value={raw} autoFocus step={step ?? 0.1} min={0}
            onChange={e => setRaw(e.target.value)}
            onBlur={() => { const n = parseFloat(raw) || 0; onChange(n); setRaw(String(n)); setEditing(false); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-24 text-right bg-background border border-primary/50 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <button type="button" onClick={() => { setRaw(String(value)); setEditing(true); }}
            className="w-24 text-right bg-background border border-border/50 rounded-md px-2 py-1 text-sm hover:border-primary/50 transition-colors">
            {prefix}{value.toFixed(2)}
          </button>
        )}
        {suffix && <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/30">
      <label className="text-sm text-muted-foreground">{label}</label>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

// ─── Mixer Slider ─────────────────────────────────────────────────────────────
function MixerSlider({
  config, value, onChange, currencySymbol, accentColor,
}: {
  config: SliderConfig;
  value: number;
  onChange: (v: number) => void;
  currencySymbol: string;
  accentColor: "amber" | "green";
}) {
  const pct = Math.round(((value - config.min) / (config.max - config.min)) * 100);
  const accent = accentColor === "amber" ? "#f59e0b" : "#22c55e";
  const accentBg = accentColor === "amber" ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)";

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0 truncate">{config.label}</span>
      <div className="relative flex-1 h-3 flex items-center">
        <div className="absolute inset-0 rounded-full bg-muted/40" style={{ height: 3, top: "50%", transform: "translateY(-50%)" }} />
        <div
          className="absolute rounded-full"
          style={{ height: 3, top: "50%", transform: "translateY(-50%)", left: 0, width: `${pct}%`, background: accent }}
        />
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          style={{ zIndex: 2 }}
        />
        <div
          className="absolute w-3.5 h-3.5 rounded-full border-2 shadow-sm pointer-events-none"
          style={{
            left: `calc(${pct}% - 7px)`,
            background: accent,
            borderColor: accent,
            boxShadow: `0 0 0 3px ${accentBg}`,
          }}
        />
      </div>
      <span
        className="text-xs font-semibold w-20 text-right flex-shrink-0 px-1.5 py-0.5 rounded"
        style={{ color: accent, background: accentBg }}
      >
        {config.format(value, currencySymbol)}
      </span>
    </div>
  );
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, fmt }: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-xs">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(inputs: Inputs, result: ReturnType<typeof calcTCO>, currencyCode: string, sym: string, truckType: string, useCase: string, notes: string) {
  const rows = [
    ["TCO Calculator Export — Transport Action Group"],
    ["Currency", currencyCode],
    ["Truck type", truckType],
    ["Use case", useCase],
    ["Notes", notes],
    [],
    ["Year", "Diesel annual", "Electric annual", "Diesel cumulative", "Electric cumulative", "Cumul. saving"],
    ...result.years.map(r => [
      `Y${r.year}`,
      r.dieselTotal.toFixed(0), r.electricTotal.toFixed(0),
      r.dieselCumulative.toFixed(0), r.electricCumulative.toFixed(0),
      r.saving.toFixed(0),
    ]),
    [],
    ["Diesel TCO", result.dieselTCO.toFixed(0)],
    ["Electric TCO", result.electricTCO.toFixed(0)],
    ["Total saving", result.totalSaving.toFixed(0)],
    ["Break-even year", result.breakEvenYear ?? "N/A"],
  ];
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "TAG-TCO-Calculator.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Soft Login Modal ─────────────────────────────────────────────────────────
interface UserInfo { name: string; email: string; company: string; country: string; }

function SoftLoginModal({ exportType, onSubmit, onClose }: {
  exportType: "csv" | "pdf";
  onSubmit: (info: UserInfo) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Download {exportType.toUpperCase()}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Enter your details to receive your TCO report.</p>
        <div className="space-y-3">
          {[
            { label: "Name *", value: name, set: setName, placeholder: "Your name" },
            { label: "Email *", value: email, set: setEmail, placeholder: "you@company.com" },
            { label: "Company *", value: company, set: setCompany, placeholder: "Fleet operator name" },
            { label: "Country", value: country, set: setCountry, placeholder: "South Africa" },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
              <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          ))}
        </div>
        <button type="button" disabled={!name || !email || !company}
          onClick={() => onSubmit({ name, email, company, country })}
          className="w-full mt-4 btn-primary justify-center disabled:opacity-50 disabled:cursor-not-allowed">
          Download {exportType.toUpperCase()}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TCOCalculatorPageClient() {
  const printRef = useRef<HTMLDivElement>(null);
  const [inputs, setInputs] = useState<Inputs>(ZAR_DEFAULTS);
  const [currencyCode, setCurrencyCode] = useState("ZAR");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [truckType, setTruckType] = useState("");
  const [useCase, setUseCase] = useState("");
  const [notes, setNotes] = useState("");
  const [fleetSize, setFleetSize] = useState(1);
  const [loginModal, setLoginModal] = useState<"csv" | "pdf" | null>(null);
  const [routePlannerOpen, setRoutePlannerOpen] = useState(false);
  const [optOpen, setOptOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeTruckType, setRouteTruckType] = useState("");
  const [routeMaxPayload, setRouteMaxPayload] = useState(28);
  const [routeKmPerTrip, setRouteKmPerTrip] = useState(300);
  const [routeTripsPerDay, setRouteTripsPerDay] = useState(1);

  const currency = getCurrency(currencyCode);

  const set = useCallback((field: keyof Inputs) => (value: number | boolean) => {
    setInputs(prev => ({ ...prev, [field]: value }));
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

  const handleCurrencyChange = (code: string) => {
    const newCurrency = getCurrency(code);
    setInputs(convertDefaults(ZAR_DEFAULTS, newCurrency.rate));
    setCurrencyCode(code);
    setCurrencyOpen(false);
  };

  const result = useMemo(() => calcTCO(inputs), [inputs]);
  const electricIsCheaper = result.totalSaving > 0;
  const comparisonYears = Math.max(inputs.dieselVehicleLifeYears, inputs.electricVehicleLifeYears);

  const fmt = (n: number) =>
    `${currency.symbol} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;
  const fmtShort = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `${currency.symbol}${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${currency.symbol}${(n / 1_000).toFixed(0)}K`;
    return `${currency.symbol}${n.toFixed(0)}`;
  };
  const fmtCpm = (n: number) => `${currency.symbol} ${n.toFixed(2)}/km`;

  // CO₂ savings
  const dieselTotalLitres = (inputs.dieselMonthlyKm * 12 * inputs.dieselVehicleLifeYears / 100) * inputs.dieselFuelConsumption;
  const co2SavedKg = dieselTotalLitres * 3.48;
  const co2SavedMt = co2SavedKg / 1_000_000;

  // Chart data
  const chartData = result.years.map(r => ({
    year: `Y${r.year}`,
    Diesel: Math.round(r.dieselCumulative),
    Electric: Math.round(r.electricCumulative),
  }));

  const savingData = result.years.map(r => ({
    year: `Y${r.year}`,
    Saving: Math.round(r.saving),
  }));

  const routeDailyKm = routeKmPerTrip * routeTripsPerDay;
  const routeDailyKwh = (routeDailyKm / 100) * inputs.electricEnergyConsumption;

  const saveSubmission = async (userInfo: UserInfo, exportType: "csv" | "pdf") => {
    try {
      await fetch("/api/tco-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: userInfo.name,
          user_email: userInfo.email,
          company: userInfo.company,
          country: userInfo.country,
          currency_code: currencyCode,
          truck_type: truckType,
          use_case: useCase,
          notes,
          inputs_json: inputs,
          diesel_tco: result.dieselTCO,
          electric_tco: result.electricTCO,
          total_saving: result.totalSaving,
          break_even_year: result.breakEvenYear,
          export_type: exportType,
        }),
      });
    } catch {
      // Non-blocking
    }
  };

  const handleExport = async (userInfo: UserInfo) => {
    const type = loginModal;
    setLoginModal(null);
    await saveSubmission(userInfo, type!);
    if (type === "csv") {
      exportCSV(inputs, result, currencyCode, currency.symbol, truckType, useCase, notes);
    } else {
      window.print();
    }
  };

  return (
    <>
      {loginModal && (
        <SoftLoginModal
          exportType={loginModal}
          onSubmit={handleExport}
          onClose={() => setLoginModal(null)}
        />
      )}
      <style>{`
        @media print {
          nav, header, footer, .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .card { border: 1px solid #ccc !important; background: white !important; }
        }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 0; height: 0; }
        input[type="range"]::-moz-range-thumb { width: 0; height: 0; border: none; }
      `}</style>

      <div className="min-h-screen bg-background pt-32 pb-24" ref={printRef}>
        <div className="container max-w-6xl">

          {/* ── Header ── */}
          <div className="mb-8">
            <Link href="/green-freight" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 no-print">
              <ArrowLeft size={14} /> Back to Green Freight
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="mb-3 whitespace-nowrap">Electric vs Diesel TCO Calculator</h1>
                <p className="text-muted-foreground leading-relaxed max-w-3xl text-sm">
                  Compare the total cost of ownership of a battery electric truck against a diesel equivalent over the full vehicle life. Select currency, truck type, and use case below. Default values are indicative only — replace with current values from your region.
                </p>
                <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
                  <strong>Disclaimer:</strong> Indicative planning tool only. Consult a qualified fleet finance specialist before making capital investment decisions.
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0 no-print">
                <button onClick={() => setLoginModal("pdf")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 text-sm hover:bg-muted/40 transition-colors">
                  <FileText size={14} /> Download PDF
                </button>
                <button onClick={() => setLoginModal("csv")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 text-sm hover:bg-muted/40 transition-colors">
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* ── Calculation Context bar ── */}
          <div className="card p-5 mb-6 no-print">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Calculation context</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Currency */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Currency</label>
                <div className="relative">
                  <button type="button" onClick={() => setCurrencyOpen(!currencyOpen)}
                    className="w-full flex items-center justify-between gap-2 bg-background border border-border/50 rounded-md px-3 py-2 text-sm hover:border-primary/50 transition-colors">
                    <span className="flex items-center gap-2">
                      <span>{currency.flag}</span>
                      <span>{currency.code} — {currency.name}</span>
                    </span>
                    <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
                  </button>
                  {currencyOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                      {CURRENCIES.map(c => (
                        <button key={c.code} type="button" onClick={() => handleCurrencyChange(c.code)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors text-left ${c.code === currencyCode ? "text-primary font-medium" : ""}`}>
                          <span>{c.flag}</span><span>{c.code}</span>
                          <span className="text-muted-foreground text-xs">— {c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {currency.code !== "ZAR" && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Defaults converted from ZAR at {`1 ZAR ≈ ${currency.rate} ${currency.code}`}. Rates as at Apr 2026.
                  </p>
                )}
              </div>
              {/* Truck type */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Truck type</label>
                <select value={truckType} onChange={e => setTruckType(e.target.value)}
                  className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Select truck type…</option>
                  <option>Truck tractor (6×4)</option>
                  <option>Truck tractor (4×2)</option>
                  <option>Rigid truck (8t GVM)</option>
                  <option>Rigid truck (12t GVM)</option>
                  <option>Rigid truck (16t GVM)</option>
                  <option>Rigid truck (22t GVM)</option>
                  <option>Distribution truck</option>
                  <option>Other</option>
                </select>
              </div>
              {/* Use case */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Use case</label>
                <select value={useCase} onChange={e => setUseCase(e.target.value)}
                  className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Select use case…</option>
                  <option>Long haul (trunk)</option>
                  <option>Regional distribution</option>
                  <option>Urban delivery</option>
                  <option>Port drayage</option>
                  <option>Close-to-warehouse / yard</option>
                  <option>Mining / off-road</option>
                  <option>Refrigerated transport</option>
                  <option>Other</option>
                </select>
              </div>
              {/* Notes */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Fleet size, route, operator name…" rows={3}
                  className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 1: CUMULATIVE COST CHARTS (top — primary visual)
          ════════════════════════════════════════════════════════════════════ */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Cumulative cost line chart */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-0.5">Cumulative cost over time</h2>
              <p className="text-xs text-muted-foreground mb-4">Total accumulated cost including purchase price and operating costs.</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={60} />
                  <ReTooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload as any[]} label={String(label ?? "")} fmt={fmt} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Diesel" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Electric" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Annual saving bar chart */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-0.5">Cumulative saving by year</h2>
              <p className="text-xs text-muted-foreground mb-4">
                {electricIsCheaper
                  ? `Electric is ahead by ${fmtShort(result.totalSaving)} by end of comparison period.`
                  : `Diesel is cheaper by ${fmtShort(Math.abs(result.totalSaving))} under these inputs.`}
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={savingData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={60} />
                  <ReTooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload as any[]} label={String(label ?? "")} fmt={fmt} />} />
                  <Bar dataKey="Saving" radius={[3, 3, 0, 0]}>
                    {savingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.Saving >= 0 ? "#22c55e" : "#f59e0b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 2: TCO OPTIMIZER — MIXING DESK
          ════════════════════════════════════════════════════════════════════ */}
          <div className="card mb-6 no-print overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <div>
                <h2 className="text-sm font-semibold">TCO Optimizer</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Slide to adjust key variables and watch the cost curves update in real time.</p>
              </div>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-muted-foreground font-medium">Diesel</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400" />
                  <span className="text-muted-foreground font-medium">Electric</span>
                </span>
              </div>
            </div>

            {/* Dual-column sliders */}
            <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/30">
              {/* Left — Diesel */}
              <div className="px-4 py-3 border-l-2 border-l-amber-500/40">
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
              <div className="px-4 py-3 border-l-2 border-l-green-500/40">
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
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 3: TCO SUMMARY CARD (below optimizer)
          ════════════════════════════════════════════════════════════════════ */}
          <div className={`card p-6 mb-6 border-l-2 ${electricIsCheaper ? "border-l-green-500" : "border-l-amber-500"}`}>
            <h2 className="text-base font-semibold mb-4">TCO Summary</h2>

            {/* Fleet size stepper */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/30">
              <div>
                <p className="text-sm font-medium">Number of trucks in fleet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Scales cost savings and CO₂ emissions saved</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setFleetSize(f => Math.max(1, f - 1))}
                  className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center text-sm hover:bg-muted/40 transition-colors font-bold">−</button>
                <span className="w-8 text-center font-semibold text-sm">{fleetSize}</span>
                <button type="button" onClick={() => setFleetSize(f => Math.min(500, f + 1))}
                  className="w-8 h-8 rounded-lg border border-border/50 flex items-center justify-center text-sm hover:bg-muted/40 transition-colors font-bold">+</button>
              </div>
            </div>

            {/* Per-truck TCO boxes */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-muted/30 rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Diesel TCO</p>
                <p className="text-xl font-bold text-amber-400">{fmtShort(result.dieselTCO)}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtCpm(result.dieselCpm)}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Electric TCO</p>
                <p className="text-xl font-bold text-green-400">{fmtShort(result.electricTCO)}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtCpm(result.electricCpm)}</p>
              </div>
            </div>

            {/* Saving banner — prominent */}
            <div className={`rounded-2xl p-5 mb-4 ${electricIsCheaper ? "bg-green-500/10 border-2 border-green-500/30" : "bg-amber-500/10 border-2 border-amber-500/30"}`}>
              {electricIsCheaper ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-widest text-green-400/70 mb-1">Total saving over comparison period</p>
                  <p className="text-3xl font-extrabold text-green-400 leading-tight">
                    {fmtShort(result.totalSaving * fleetSize)}
                    {fleetSize > 1 && <span className="text-base font-normal text-muted-foreground ml-2">({fleetSize} trucks)</span>}
                  </p>
                  <p className="text-sm text-green-300/80 mt-1 font-medium">
                    {fmtShort(result.totalSaving / Math.max(inputs.dieselVehicleLifeYears, inputs.electricVehicleLifeYears))} per truck per year on average
                  </p>
                  <div className="mt-3 pt-3 border-t border-green-500/20">
                    <p className="text-xs text-muted-foreground">
                      {result.breakEvenYear
                        ? `⚡ Break-even at Year ${result.breakEvenYear} — electric is cheaper from that point forward.`
                        : "⚡ Electric is cheaper from Year 1 under these inputs."}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/70 mb-1">Diesel advantage over comparison period</p>
                  <p className="text-3xl font-extrabold text-amber-400 leading-tight">
                    {fmtShort(Math.abs(result.totalSaving) * fleetSize)}
                    {fleetSize > 1 && <span className="text-base font-normal text-muted-foreground ml-2">({fleetSize} trucks)</span>}
                  </p>
                  <p className="text-sm text-amber-300/80 mt-1 font-medium">
                    {fmtShort(Math.abs(result.totalSaving) / Math.max(inputs.dieselVehicleLifeYears, inputs.electricVehicleLifeYears))} per truck per year on average
                  </p>
                  <div className="mt-3 pt-3 border-t border-amber-500/20">
                    <p className="text-xs text-muted-foreground">
                      Try increasing monthly km, diesel fuel escalation %, or reducing electricity price.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Environmental impact */}
            <div className="rounded-xl p-4 bg-muted/20 border border-border/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Environmental impact</p>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-green-400 text-sm">🌿</span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tailpipe CO₂ saved (lifetime{fleetSize > 1 ? `, ${fleetSize} trucks` : ", per truck"})</p>
                  <p className="text-lg font-bold text-green-400 mt-0.5">
                    {(co2SavedMt * fleetSize).toFixed(2)} Mt CO₂e
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Diesel fuel consumed × 3.48 kg CO₂e per litre</p>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 4: DETAILED INPUTS (collapsible, below summary)
          ════════════════════════════════════════════════════════════════════ */}
          <div className="grid lg:grid-cols-2 gap-8 mb-6 no-print">
            {/* Diesel inputs */}
            <div className="card p-6 border-l-2 border-l-amber-500/50">
              <h2 className="text-base font-semibold mb-1">Diesel truck — detailed inputs</h2>
              <p className="text-xs text-muted-foreground mb-4">Typical 6×4 tractor-trailer combination</p>
              <div className="mb-4 pb-4 border-b border-border/40">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Operating profile</p>
                <InputRow label="Monthly kilometres" value={inputs.dieselMonthlyKm} onChange={set("dieselMonthlyKm") as (v: number) => void} suffix="km/month" min={1000} max={50000} step={500} />
                <InputRow label="Vehicle life" value={inputs.dieselVehicleLifeYears} onChange={set("dieselVehicleLifeYears") as (v: number) => void} suffix="years" min={3} max={15} />
              </div>
              <div className="mb-4 pb-4 border-b border-border/40">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Finance</p>
                <ToggleRow label="Vehicle financed?" value={inputs.dieselFinanced} onChange={set("dieselFinanced") as (v: boolean) => void} />
                {inputs.dieselFinanced && (
                  <>
                    <InputRow label="Deposit" value={inputs.dieselDepositPct} onChange={set("dieselDepositPct") as (v: number) => void} suffix="% of price" step={1} min={0} max={50} />
                    <InputRow label="Finance rate" value={inputs.dieselFinanceRate} onChange={set("dieselFinanceRate") as (v: number) => void} suffix="% pa" step={0.25} min={0} max={30} />
                    <InputRow label="Finance term" value={inputs.dieselFinanceTerm} onChange={set("dieselFinanceTerm") as (v: number) => void} suffix="months" step={12} min={12} max={84} />
                  </>
                )}
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Operating costs</p>
              <PriceInputRow label="Purchase price" value={inputs.dieselPurchasePrice} onChange={set("dieselPurchasePrice") as (v: number) => void} tooltip="Ex-VAT purchase price." currencySymbol={currency.symbol} />
              <InputRow label="Fuel consumption" value={inputs.dieselFuelConsumption} onChange={set("dieselFuelConsumption") as (v: number) => void} suffix="L/100km" step={0.5} />
              <DecimalPriceInputRow label="Current diesel price" value={inputs.dieselFuelPrice} onChange={set("dieselFuelPrice") as (v: number) => void} prefix={currency.symbol} suffix="/L" step={0.1} />
              <InputRow label="Diesel price escalation" value={inputs.dieselFuelEscalation} onChange={set("dieselFuelEscalation") as (v: number) => void} suffix="% pa" step={0.5} min={0} max={20} />
              <DecimalPriceInputRow label="Maintenance cost" value={inputs.dieselMaintenanceCpm} onChange={set("dieselMaintenanceCpm") as (v: number) => void} prefix={currency.symbol} suffix="/km" step={0.05} />
              <PriceInputRow label="Annual insurance" value={inputs.dieselInsuranceAnnual} onChange={set("dieselInsuranceAnnual") as (v: number) => void} currencySymbol={currency.symbol} suffix="/year" />
              <InputRow label="Residual value" value={inputs.dieselResidualPct} onChange={set("dieselResidualPct") as (v: number) => void} suffix="% of purchase" step={1} />
            </div>

            {/* Electric inputs */}
            <div className="card p-6 border-l-2 border-l-green-500/50">
              <h2 className="text-base font-semibold mb-1">Electric truck — detailed inputs</h2>
              <p className="text-xs text-muted-foreground mb-4">Battery electric equivalent</p>
              <div className="mb-4 pb-4 border-b border-border/40">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Operating profile</p>
                <InputRow label="Monthly kilometres" value={inputs.electricMonthlyKm} onChange={set("electricMonthlyKm") as (v: number) => void} suffix="km/month" min={1000} max={50000} step={500} />
                <InputRow label="Vehicle life" value={inputs.electricVehicleLifeYears} onChange={set("electricVehicleLifeYears") as (v: number) => void} suffix="years" min={3} max={15} />
              </div>
              <div className="mb-4 pb-4 border-b border-border/40">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Finance</p>
                <ToggleRow label="Vehicle financed?" value={inputs.electricFinanced} onChange={set("electricFinanced") as (v: boolean) => void} />
                {inputs.electricFinanced && (
                  <>
                    <InputRow label="Deposit" value={inputs.electricDepositPct} onChange={set("electricDepositPct") as (v: number) => void} suffix="% of price" step={1} min={0} max={50} />
                    <InputRow label="Finance rate" value={inputs.electricFinanceRate} onChange={set("electricFinanceRate") as (v: number) => void} suffix="% pa" step={0.25} min={0} max={30} />
                    <InputRow label="Finance term" value={inputs.electricFinanceTerm} onChange={set("electricFinanceTerm") as (v: number) => void} suffix="months" step={12} min={12} max={84} />
                  </>
                )}
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Operating costs</p>
              <PriceInputRow label="Purchase price" value={inputs.electricPurchasePrice} onChange={set("electricPurchasePrice") as (v: number) => void} tooltip="Ex-VAT purchase price of the electric truck." currencySymbol={currency.symbol} />
              <InputRow label="Energy consumption" value={inputs.electricEnergyConsumption} onChange={set("electricEnergyConsumption") as (v: number) => void} suffix="kWh/100km" step={5} />
              <DecimalPriceInputRow label="Electricity price" value={inputs.electricEnergyPrice} onChange={set("electricEnergyPrice") as (v: number) => void} prefix={currency.symbol} suffix="/kWh" step={0.05} />
              <InputRow label="Electricity price escalation" value={inputs.electricEnergyEscalation} onChange={set("electricEnergyEscalation") as (v: number) => void} suffix="% pa" step={0.5} min={0} max={20} />
              <DecimalPriceInputRow label="Maintenance cost" value={inputs.electricMaintenanceCpm} onChange={set("electricMaintenanceCpm") as (v: number) => void} prefix={currency.symbol} suffix="/km" step={0.05} />
              <PriceInputRow label="Annual insurance" value={inputs.electricInsuranceAnnual} onChange={set("electricInsuranceAnnual") as (v: number) => void} currencySymbol={currency.symbol} suffix="/year" />
              <InputRow label="Residual value" value={inputs.electricResidualPct} onChange={set("electricResidualPct") as (v: number) => void} suffix="% of purchase" step={1} />
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 5: YEAR-BY-YEAR TABLE
          ════════════════════════════════════════════════════════════════════ */}
          <div className="card p-6 mb-6">
            <h2 className="text-base font-semibold mb-1">Year-by-year costs</h2>
            <p className="text-xs text-muted-foreground mb-4">Comparison runs for {comparisonYears} years.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 text-muted-foreground font-medium">Year</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Diesel</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Electric</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Cumul. saving</th>
                  </tr>
                </thead>
                <tbody>
                  {result.years.map(row => (
                    <tr key={row.year} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="py-2 text-muted-foreground">
                        Y{row.year}
                        {row.year === inputs.dieselVehicleLifeYears && <span className="ml-1 text-amber-400/70">(D)</span>}
                        {row.year === inputs.electricVehicleLifeYears && <span className="ml-1 text-green-400/70">(E)</span>}
                      </td>
                      <td className="py-2 text-right">{row.dieselTotal > 0 ? fmt(row.dieselTotal) : "—"}</td>
                      <td className="py-2 text-right">{row.electricTotal > 0 ? fmt(row.electricTotal) : "—"}</td>
                      <td className={`py-2 text-right font-medium ${row.saving >= 0 ? "text-green-400" : "text-amber-400"}`}>
                        {row.saving >= 0 ? "+" : ""}{fmt(row.saving)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── CTAs ── */}
          <div className="card p-6 mb-6 no-print border border-primary/20 bg-primary/5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-lg">⚡</span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-1">Ready to run a real-world pilot?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  TAG works with fleet operators across Africa to design structured electric truck pilots — from vehicle selection and route analysis to charging infrastructure and driver training. Turn this model into a funded business case.
                </p>
                <Link href="/partner-with-tag" className="btn-primary text-sm px-4 py-2">
                  Talk to TAG about a pilot →
                </Link>
              </div>
            </div>
          </div>

          {/* ── Daily Energy Required Per Truck ── */}
          <div className="card mb-6 no-print overflow-hidden">
            <button type="button" onClick={() => setRoutePlannerOpen(!routePlannerOpen)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/20 transition-colors">
              <div>
                <p className="text-sm font-semibold">Daily Energy Required Per Truck</p>
                <p className="text-xs text-muted-foreground mt-0.5">Estimate daily energy demand per truck to plan charging infrastructure requirements</p>
              </div>
              {routePlannerOpen ? <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" />
                : <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />}
            </button>
            {routePlannerOpen && (
              <div className="px-5 pb-5 border-t border-border/30">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  <div className="lg:col-span-1">
                    <label className="text-xs text-muted-foreground block mb-1.5">Route name</label>
                    <input type="text" value={routeName} onChange={e => setRouteName(e.target.value)}
                      placeholder="e.g. Johannesburg – Durban"
                      className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div className="lg:col-span-1">
                    <label className="text-xs text-muted-foreground block mb-1.5">Truck type on this route</label>
                    <input type="text" value={routeTruckType} onChange={e => setRouteTruckType(e.target.value)}
                      placeholder="e.g. Truck tractor (6×4)"
                      className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Max payload (tonnes)</label>
                    <input type="number" value={routeMaxPayload} min={1} max={60} step={0.5}
                      onChange={e => setRouteMaxPayload(parseFloat(e.target.value) || 0)}
                      className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">km per trip</label>
                    <input type="number" value={routeKmPerTrip} min={1} max={2000} step={10}
                      onChange={e => setRouteKmPerTrip(parseFloat(e.target.value) || 0)}
                      className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Trips per day</label>
                    <input type="number" value={routeTripsPerDay} min={1} max={10} step={1}
                      onChange={e => setRouteTripsPerDay(parseFloat(e.target.value) || 1)}
                      className="w-full bg-background border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
                {routeDailyKm > 0 && (
                  <div className="mt-5 grid sm:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-muted/30 border border-border/30 p-4">
                      <p className="text-xs text-muted-foreground mb-1">Total km per day</p>
                      <p className="text-2xl font-bold text-foreground">{routeDailyKm.toLocaleString("en-US")}</p>
                      <p className="text-xs text-muted-foreground mt-1">{routeKmPerTrip} km × {routeTripsPerDay} trip{routeTripsPerDay !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4">
                      <p className="text-xs text-muted-foreground mb-1">Daily energy required per truck</p>
                      <p className="text-2xl font-bold text-green-400">{routeDailyKwh.toLocaleString("en-US", { maximumFractionDigits: 0 })} kWh</p>
                      <p className="text-xs text-muted-foreground mt-1">At {inputs.electricEnergyConsumption} kWh/100km</p>
                    </div>
                  </div>
                )}
                <div className="mt-4 rounded-lg bg-primary/5 border border-primary/20 p-4">
                  <p className="text-xs font-medium text-foreground mb-1">Infrastructure planning note</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This is the energy required per truck per day on this route. Consider the number of trucks in your fleet and your rate of deployment of electric trucks to estimate energy demand growth and charging infrastructure requirements over time. Depot charger sizing, grid connection capacity, and demand charge tariffs should all be reviewed with your utility and an infrastructure specialist before committing to a deployment plan.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    TAG can assist with fleet electrification planning.{" "}
                    <Link href="/partner-with-tag" className="text-primary hover:underline">Talk to TAG →</Link>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Optional Considerations ── */}
          <div className="card mb-6 no-print overflow-hidden">
            <button type="button" onClick={() => setOptOpen(!optOpen)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/20 transition-colors">
              <div>
                <p className="text-sm font-semibold">Optional considerations not included in this model</p>
                <p className="text-xs text-muted-foreground mt-0.5">Factors that may materially affect your real-world TCO</p>
              </div>
              {optOpen ? <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" />
                : <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />}
            </button>
            {optOpen && (
              <div className="px-5 pb-5 border-t border-border/30">
                <div className="grid sm:grid-cols-2 gap-4 mt-4 text-xs text-muted-foreground">
                  {[
                    ["Charging infrastructure", "Depot charger installation, grid connection upgrades, and demand charge tariffs can add significantly to the electric TCO."],
                    ["Battery replacement", "If the vehicle life exceeds the battery warranty period (typically 8–10 years), a battery replacement cost should be modelled."],
                    ["Government incentives", "Subsidies, tax credits, or duty exemptions on electric vehicles may reduce the effective purchase price in some markets."],
                    ["Driver training", "Transitioning to electric trucks requires driver upskilling. TAG's BetterDriver programme covers this."],
                    ["Downtime and range anxiety", "Charging time and range limitations may affect vehicle utilisation and require additional vehicles in the fleet."],
                    ["Carbon pricing", "Emerging carbon taxes and emissions trading schemes may add a material cost to diesel operations over time."],
                  ].map(([title, body]) => (
                    <div key={title} className="rounded-lg bg-muted/20 border border-border/30 p-3">
                      <p className="font-medium text-foreground mb-1">{title}</p>
                      <p>{body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Generic CTA */}
          <div className="card p-6 text-center no-print">
            <p className="text-sm text-muted-foreground mb-4">
              Ready to explore electric truck deployment for your fleet? TAG can help you build a business case, identify pilot opportunities, and connect with the right ecosystem partners.
            </p>
            <Link href="/partner-with-tag" className="btn-primary">
              Talk to TAG about electric trucks
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
