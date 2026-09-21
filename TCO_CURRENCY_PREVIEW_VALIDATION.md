# TAG TCO Currency Preview Validation

## Scope

This isolated preview uses branch `feature/tco-currency-ux-preview`, based on `origin/feature/tco-currency-responsive-controls`.

## Visual validation

The TCO calculator opens with a single, clearly structured tools panel above the calculator inputs. Its two concise headings are **Currency Selection** and **Download TCO Results**. The currency selector and the PDF/CSV export actions remain immediately visible, while the former decorative icons and explanatory subtitles have been removed.

The currency menu retains all seven existing options: ZAR, USD, EUR, KES, TZS, ETB, and GBP. PDF and CSV export actions use the currently selected display currency.

## Currency behaviour validation

Selecting USD changes the active control to `US$ · USD`. The editable monetary labels change to `US$`, including vehicle price, fuel, electricity, maintenance, and insurance. Charts, summary values, cost-per-kilometre values, the Profit Optimiser, and export context also change to `US$`.

A USD-to-ZAR round trip returns the visible default ZAR input values and summary view. The implementation keeps conversion precision to six decimal places internally to prevent scenario drift caused solely by display rounding.

## Build and type validation

`npm run build` completed successfully on 21 September 2026. `npm run type-check` reports three pre-existing errors in `app/page.tsx` relating to `seatsBooked`, `drivers`, and `certifications`; it reports no error in `app/tco-v2/TCOv2Client.tsx`.

## Preview URL

https://3000-iczzsrbi0r5ccqtg5ww80-b403b374.us1.manus.computer/tco-v2
