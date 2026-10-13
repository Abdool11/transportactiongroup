# TAG TCO Calculator Validation

## Scope

This isolated preview uses branch `feature/tco-profitability-annotations`, restored from the verified currency-UX checkpoint and based on `feature/tco-currency-ux-preview`.

## Currency and export interface

The calculator opens with the concise **Currency Selection** and **Download TCO Results** panel. The existing seven currencies—ZAR, USD, EUR, KES, TZS, ETB, and GBP—remain available. Monetary inputs, charts, summaries, Profit Optimiser labels, and exported PDF/CSV context use the active currency. A USD-to-ZAR round trip retains the underlying scenario through six-decimal conversion precision.

## Cumulative chart outcome annotations

The cumulative TCO card now explains that the lower curve is cheaper and uses its calculated lifetime outcome to name the actual cheaper option. The cumulative-profit card explains that the higher curve produces more profit and names the actual lifetime profit winner.

Two browser scenarios were verified on 13 October 2026:

| Scenario | Verified TCO annotation | Verified profit annotation |
|---|---|---|
| Default inputs | **Electric is cheaper** | **Electric generates more profit** |
| Electric purchase price changed to R20,000,000 | **Diesel is cheaper** | **Diesel generates more profit** |

The annotations show the absolute monetary difference without a misleading plus or minus sign. They switch automatically according to `totalSaving` and `totalProfitDelta`.

## Build and type validation

`npm run build` completed successfully on 13 October 2026. `npm run type-check` still reports three pre-existing homepage errors in `app/page.tsx` relating to `seatsBooked`, `drivers`, and `certifications`; it reports no error in `app/tco-v2/TCOv2Client.tsx`.

## Preview URL

https://3003-ivnalw212q1019zu5pdkp-051cdf75.us1.manus.computer/tco-v2
