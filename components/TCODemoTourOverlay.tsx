"use client";
/**
 * TCO Calculator — Guided Demo Tour Overlay
 * Renders a spotlight cutout over the target element with a tooltip,
 * progress bar, and step navigation. Works on top of the live calculator.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { X, ArrowLeft, ArrowRight, Play } from "lucide-react";
import { useTCOTour, TCO_TOUR_STEPS } from "@/lib/tco-tour-context";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 12; // spotlight padding around target element

function getTargetRect(targetId: string | null): Rect | null {
  if (!targetId) return null;
  const el = document.getElementById(targetId);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top + window.scrollY - PADDING,
    left: r.left + window.scrollX - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  };
}

function scrollToTarget(targetId: string | null) {
  if (!targetId) return;
  const el = document.getElementById(targetId);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const viewH = window.innerHeight;
  // Only scroll if element is not fully visible
  if (rect.top < 80 || rect.bottom > viewH - 80) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export default function TCODemoTourOverlay() {
  const { isActive, step, currentStep, totalSteps, next, prev, endTour } = useTCOTour();
  const [rect, setRect] = useState<Rect | null>(null);
  const [vpW, setVpW] = useState(0);
  const [vpH, setVpH] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Update spotlight rect when step changes or window resizes
  const updateRect = useCallback(() => {
    if (!isActive) return;
    setVpW(window.innerWidth);
    setVpH(window.innerHeight);
    // Small delay to allow scroll to complete
    setTimeout(() => {
      setRect(getTargetRect(step.targetId));
    }, 350);
  }, [isActive, step]);

  useEffect(() => {
    if (!isActive) return;
    scrollToTarget(step.targetId);
    updateRect();
  }, [isActive, step, updateRect]);

  useEffect(() => {
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [updateRect]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") endTour();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, next, prev, endTour]);

  if (!isActive) return null;

  const progress = ((currentStep + 1) / totalSteps) * 100;
  const isCentered = !step.targetId || !rect;

  // ── Tooltip positioning ──────────────────────────────────────────────────
  let tooltipStyle: React.CSSProperties = {};

  if (isCentered) {
    tooltipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 10001,
      width: "min(520px, 90vw)",
    };
  } else if (rect) {
    const absTop = rect.top - window.scrollY;
    const absLeft = rect.left - window.scrollX;
    const tooltipW = Math.min(400, window.innerWidth * 0.85);
    const tooltipH = 240; // estimated

    let top = 0;
    let left = 0;

    switch (step.placement) {
      case "bottom":
        top = absTop + rect.height + 16;
        left = Math.min(
          Math.max(8, absLeft + rect.width / 2 - tooltipW / 2),
          window.innerWidth - tooltipW - 8
        );
        break;
      case "top":
        top = absTop - tooltipH - 16;
        left = Math.min(
          Math.max(8, absLeft + rect.width / 2 - tooltipW / 2),
          window.innerWidth - tooltipW - 8
        );
        break;
      case "right":
        top = Math.min(
          Math.max(8, absTop + rect.height / 2 - tooltipH / 2),
          window.innerHeight - tooltipH - 8
        );
        left = absLeft + rect.width + 16;
        break;
      case "left":
        top = Math.min(
          Math.max(8, absTop + rect.height / 2 - tooltipH / 2),
          window.innerHeight - tooltipH - 8
        );
        left = absLeft - tooltipW - 16;
        break;
      default:
        top = absTop + rect.height + 16;
        left = Math.min(
          Math.max(8, absLeft + rect.width / 2 - tooltipW / 2),
          window.innerWidth - tooltipW - 8
        );
    }

    // Clamp to viewport
    top = Math.max(8, Math.min(top, window.innerHeight - tooltipH - 8));
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipW - 8));

    tooltipStyle = {
      position: "fixed",
      top,
      left,
      zIndex: 10001,
      width: tooltipW,
    };
  }

  // ── SVG clip path for spotlight ──────────────────────────────────────────
  const renderSpotlight = () => {
    if (isCentered) {
      // Full dark overlay, no cutout
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 10000,
          }}
          onClick={endTour}
        />
      );
    }

    if (!rect) return null;

    const absTop = rect.top - window.scrollY;
    const absLeft = rect.left - window.scrollX;

    return (
      <svg
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 10000,
          pointerEvents: "none",
        }}
      >
        <defs>
          <mask id="tco-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={absLeft}
              y={absTop}
              width={rect.width}
              height={rect.height}
              rx={8}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.78)"
          mask="url(#tco-spotlight-mask)"
        />
        {/* Highlight border around target */}
        <rect
          x={absLeft}
          y={absTop}
          width={rect.width}
          height={rect.height}
          rx={8}
          fill="none"
          stroke="rgba(34,197,94,0.6)"
          strokeWidth={2}
        />
      </svg>
    );
  };

  const isLastStep = currentStep === totalSteps - 1;

  return (
    <>
      {renderSpotlight()}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #0f1f3d 0%, #0a1628 100%)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "1rem",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(34,197,94,0.1)",
            overflow: "hidden",
          }}
        >
          {/* Progress bar */}
          <div style={{ height: "3px", background: "rgba(255,255,255,0.08)" }}>
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: "linear-gradient(90deg, #22c55e, #16a34a)",
                transition: "width 0.35s ease",
              }}
            />
          </div>

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              padding: "1.25rem 1.25rem 0",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: "rgba(34,197,94,0.15)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Play size={11} style={{ color: "#22c55e", marginLeft: "1px" }} />
              </div>
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: "#22c55e",
                  opacity: 0.8,
                }}
              >
                Guided Tour · {currentStep + 1} of {totalSteps}
              </span>
            </div>
            <button
              onClick={endTour}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(148,163,184,0.6)",
                padding: "0.25rem",
                borderRadius: "0.375rem",
                display: "flex",
                alignItems: "center",
                transition: "color 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "white")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(148,163,184,0.6)")}
              aria-label="Close tour"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "0.875rem 1.25rem 0" }}>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "white",
                marginBottom: "0.625rem",
                lineHeight: 1.3,
              }}
            >
              {step.title}
            </h3>
            <p
              style={{
                fontSize: "0.875rem",
                color: "rgba(148,163,184,0.9)",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              {step.body}
            </p>
            {step.hint && (
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "rgba(34,197,94,0.7)",
                  lineHeight: 1.55,
                  marginTop: "0.625rem",
                  padding: "0.5rem 0.75rem",
                  background: "rgba(34,197,94,0.06)",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(34,197,94,0.12)",
                }}
              >
                {step.hint}
              </p>
            )}
          </div>

          {/* Step dots */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "0.375rem",
              padding: "0.875rem 1.25rem 0",
            }}
          >
            {TCO_TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => {/* goTo handled via context if needed */}}
                style={{
                  width: i === currentStep ? "20px" : "6px",
                  height: "6px",
                  borderRadius: "3px",
                  background: i === currentStep
                    ? "#22c55e"
                    : i < currentStep
                    ? "rgba(34,197,94,0.35)"
                    : "rgba(255,255,255,0.12)",
                  border: "none",
                  cursor: "default",
                  transition: "all 0.25s ease",
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Navigation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.875rem 1.25rem 1.25rem",
              gap: "0.75rem",
            }}
          >
            <button
              onClick={prev}
              disabled={currentStep === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: currentStep === 0 ? "rgba(255,255,255,0.2)" : "rgba(148,163,184,0.8)",
                fontSize: "0.8rem",
                cursor: currentStep === 0 ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
            >
              <ArrowLeft size={13} /> Back
            </button>

            <button
              onClick={isLastStep ? endTour : next}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.5rem 1.25rem",
                borderRadius: "0.5rem",
                border: "none",
                background: isLastStep
                  ? "linear-gradient(135deg, #16a34a, #15803d)"
                  : "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "white",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(34,197,94,0.3)",
                transition: "all 0.15s",
              }}
            >
              {isLastStep ? "Finish tour" : <>Next <ArrowRight size={13} /></>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
