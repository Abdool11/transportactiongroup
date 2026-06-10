"use client";
/**
 * TCO Calculator — Guided Demo Tour Context
 * Provides a 12-step spotlight tour for freight operators.
 * No database calls, no auth required.
 */

import React, { createContext, useContext, useState, useCallback } from "react";

export interface TourStep {
  id: string;
  /** DOM element ID to spotlight. If null, shows a centred modal. */
  targetId: string | null;
  /** Tooltip placement relative to the spotlight */
  placement: "top" | "bottom" | "left" | "right" | "center";
  title: string;
  body: string;
  /** Optional hint shown below the body in smaller text */
  hint?: string;
}

export const TCO_TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    targetId: null,
    placement: "center",
    title: "Welcome to the TCO Calculator",
    body: "This guided tour walks you through comparing the Total Cost of Ownership of a battery electric truck against a diesel equivalent over the full vehicle life. We will use a realistic example for a South African long-haul operator running a Truck Tractor (6×4) on the Johannesburg–Durban corridor.",
    hint: "Use the arrow buttons or keyboard ← → to move between steps. Press Esc to exit at any time.",
  },
  {
    id: "currency",
    targetId: "tco-currency",
    placement: "bottom",
    title: "Step 1 — Select your currency",
    body: "The calculator supports currencies across the Central and Northern Corridor: ZAR, USD, EUR, KES, TZS, ETB, ZMW, MWK, and more. Select your operating currency and all default values will be automatically converted from ZAR at the indicated exchange rate.",
    hint: "For this demo we are using ZAR — South African Rand.",
  },
  {
    id: "truck-type",
    targetId: "tco-truck-type",
    placement: "bottom",
    title: "Step 2 — Set truck type and use case",
    body: "Select the truck type that matches your fleet — from a Truck Tractor (6×4) for long-haul to a Rigid Truck (8t GVM) for urban delivery. The use case field helps you document what this calculation is for.",
    hint: "Example: Truck Tractor (6×4) · Long haul — Johannesburg to Durban.",
  },
  {
    id: "notes",
    targetId: "tco-notes",
    placement: "bottom",
    title: "Step 3 — Add your notes",
    body: "Use the Notes field to record the context of this calculation — fleet name, route, date, or any assumptions. This text is included in the PDF download and CSV export, making each calculation a self-contained document.",
    hint: "Example: \"Fleet: Horizon Freight · Route: JHB–DBN · Fuel price as at June 2026\"",
  },
  {
    id: "chart-cumulative",
    targetId: "tco-chart-cumulative",
    placement: "top",
    title: "Step 4 — Cumulative cost chart",
    body: "The amber line is the diesel truck's cumulative cost over the vehicle life. The green line is the electric truck. Where the green line crosses below the amber line is the break-even point — from that year onwards the electric truck is cheaper in total.",
    hint: "The Y-axis scales dynamically to both lines. Hover over any point to see the exact value.",
  },
  {
    id: "chart-annual",
    targetId: "tco-chart-annual",
    placement: "top",
    title: "Step 5 — Annual saving chart",
    body: "This bar chart shows the year-by-year saving of the electric truck over diesel. Green bars mean the electric truck saved money that year; amber bars mean diesel was cheaper. The saving typically grows each year as fuel price escalation compounds.",
    hint: "In early years the higher purchase price of the electric truck may make it more expensive — this is normal.",
  },
  {
    id: "savings-banner",
    targetId: "tco-savings-banner",
    placement: "top",
    title: "Step 6 — The savings outcome",
    body: "This is the headline result. It shows the total saving (or additional cost) of the electric truck over the full comparison period, the average annual saving per truck, and the break-even year. This is the number to take to a fleet finance meeting.",
    hint: "Use the fleet size stepper below to scale the saving across your entire fleet.",
  },
  {
    id: "fleet-size",
    targetId: "tco-fleet-size",
    placement: "top",
    title: "Step 7 — Fleet size multiplier",
    body: "Enter the number of trucks in your fleet. The TCO Summary and CO₂ savings will scale proportionally, giving you the total financial and environmental impact across your entire operation.",
    hint: "Example: 20 trucks × R1.2M saving per truck = R24M total fleet saving.",
  },
  {
    id: "sliders",
    targetId: "tco-sliders",
    placement: "top",
    title: "Step 8 — The optimisation sliders",
    body: "The mixing desk sliders let you quickly test sensitivity without opening the detailed parameter tables. The amber column controls diesel variables (fuel price, monthly km, fuel escalation). The green column controls electric variables (electricity price, monthly km, energy escalation). Move a slider and the charts update instantly.",
    hint: "Try raising the diesel fuel price slider — watch the cumulative cost gap widen in real time.",
  },
  {
    id: "diesel-params",
    targetId: "tco-diesel-params",
    placement: "right",
    title: "Step 9 — Diesel parameter table",
    body: "For a precise calculation, enter your actual fleet data here: purchase price, current diesel price per litre, maintenance cost per km, annual insurance, finance terms, and residual value. Default values are indicative — replace them with your actual figures for a meaningful result.",
    hint: "Tip: Get your diesel price from your fuel card statement and your maintenance cost from your service records.",
  },
  {
    id: "electric-params",
    targetId: "tco-electric-params",
    placement: "left",
    title: "Step 10 — Electric parameter table",
    body: "Enter the electric truck's purchase price (typically 2–3× the diesel equivalent), your electricity tariff per kWh, energy consumption in kWh/100km, maintenance cost (typically 30–40% lower than diesel), and finance terms. If you do not yet have a quote, the defaults provide a reasonable planning estimate.",
    hint: "Tip: Ask your electricity supplier for your C1 or TOU tariff. Industrial rates are typically R1.50–R2.50/kWh in South Africa.",
  },
  {
    id: "year-table",
    targetId: "tco-year-table",
    placement: "top",
    title: "Step 11 — Year-by-year cost table",
    body: "This table breaks down the annual diesel cost, electric cost, and cumulative saving for every year of the comparison period. It shows exactly when the electric truck pays back its higher upfront cost and how the saving compounds over time.",
    hint: "The comparison period matches the shorter of the two vehicle life settings.",
  },
  {
    id: "export",
    targetId: "tco-export",
    placement: "bottom",
    title: "Step 12 — Download and share",
    body: "Once you are satisfied with your inputs, download a PDF summary to share with your finance team or board, or export a full CSV for further analysis in Excel. Both exports include your notes, truck type, use case, and all input parameters.",
    hint: "You will be asked to provide your name and email before downloading — this helps us improve the tool.",
  },
];

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  step: TourStep;
  startTour: () => void;
  endTour: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TCOTourProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const endTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
  }, []);

  const next = useCallback(() => {
    setCurrentStep(s => {
      if (s >= TCO_TOUR_STEPS.length - 1) {
        setIsActive(false);
        return 0;
      }
      return s + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setCurrentStep(s => Math.max(0, s - 1));
  }, []);

  const goTo = useCallback((index: number) => {
    setCurrentStep(Math.max(0, Math.min(TCO_TOUR_STEPS.length - 1, index)));
  }, []);

  return (
    <TourContext.Provider value={{
      isActive,
      currentStep,
      totalSteps: TCO_TOUR_STEPS.length,
      step: TCO_TOUR_STEPS[currentStep],
      startTour,
      endTour,
      next,
      prev,
      goTo,
    }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTCOTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTCOTour must be used inside TCOTourProvider");
  return ctx;
}
