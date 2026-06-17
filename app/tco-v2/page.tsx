import type { Metadata } from "next";
import TCOv2Client from "./TCOv2Client";

export const metadata: Metadata = {
  title: "Fleet Profit & TCO Calculator (v2) | Transport Action Group",
  description: "Compare diesel vs electric truck profitability over the full vehicle lifetime. Optimise for profit, not just cost.",
};

export default function TCOv2Page() {
  return <TCOv2Client />;
}
