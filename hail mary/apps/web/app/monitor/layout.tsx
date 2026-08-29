import type { Metadata } from "next";
export const metadata: Metadata = { title: "Sensor Monitor" };
export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
