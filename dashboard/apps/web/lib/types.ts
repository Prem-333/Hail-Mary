/**
 * Shared TypeScript interfaces for the LATENT dashboard.
 *
 * These types mirror the shapes returned by the FastAPI backend and are
 * consumed across multiple pages (lot overview, components, monitor, simulator).
 */

import type { ElementType } from "react";

// ── Component-level data (from /api/lots/{lot_id}) ────────────────────

export interface ComponentSummary {
  component_id: string;
  lot_id: string;
  defect_type: string;
  is_anomalous: boolean;
  anomaly_score: number;
  leakage_median: number;
  delay_median: number;
}

// ── Stat card used on the lot overview page ───────────────────────────

export interface StatCard {
  label: string;
  value: string | number;
  icon: ElementType;
  color: string;
  subtitle?: string;
}

// ── SHAP feature contribution ─────────────────────────────────────────

export interface ShapFeature {
  feature: string;
  value: number;
}

// ── Simulation result (from POST /api/simulate/) ──────────────────────

export interface SimulationParamResult {
  predicted_168h: number;
  implied_drift: number;
  threshold: number;
  is_flagged: boolean;
}

export interface SimulationShapResult {
  base_value: number;
  features: ShapFeature[];
}

export interface SimulationResponse {
  status: string;
  is_flagged: boolean;
  results: Record<string, SimulationParamResult>;
  shap: Record<string, SimulationShapResult>;
}

// ── Streaming component dropdown entry ────────────────────────────────

export interface StreamComponent {
  component_id: string;
  defect_type: string;
}
