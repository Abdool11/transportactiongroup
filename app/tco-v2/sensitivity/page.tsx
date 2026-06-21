import type { Metadata } from "next";
import SensitivityClient from "./SensitivityClient";

export const metadata: Metadata = {
  title: "Sensitivity Analysis | Fleet Profit & TCO Calculator | Transport Action Group",
  description: "Identify which input variables have the greatest impact on your electric vs diesel fleet decision.",
  robots: { index: false, follow: false }, // not indexed — only reachable via calculator
};

export default function SensitivityPage() {
  return <SensitivityClient />;
}
