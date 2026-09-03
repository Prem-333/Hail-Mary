import type { Metadata } from "next";
export const metadata: Metadata = { title: "Evaluation Summary", description: "System performance against SIH 2026 burn-in screening evaluation criteria — anomaly detection, drift prediction accuracy, and explainability." };
export default function EvaluationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
