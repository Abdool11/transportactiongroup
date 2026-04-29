# Transport Action Group — Next.js 15 Frontend Package

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui  
**Role in ecosystem:** Flagship public platform — creates the enabling environment for green freight transformation. Attracts DFIs, donors, government bodies, industry associations, and ecosystem collaborators.

---

## Component Inventory

### Layout Components (`/components/layout/`)

| Component | Purpose | Props |
|---|---|---|
| `Navigation.tsx` | Top navigation bar with logo, nav links, mobile menu, and CTA button | None — reads from `lib/constants.ts` |
| `Footer.tsx` | Site footer with four-column link grid and ecosystem links | None — reads from `lib/constants.ts` |

### Page Components (`/app/`)

| Route | File | Dynamic Data Required |
|---|---|---|
| `/` | `app/page.tsx` | Impact strip metrics via `/api/metrics` |
| `/about` | `app/about/page.tsx` | None — static content |
| `/services` | `app/services/page.tsx` | None — static content |
| `/green-freight` | `app/green-freight/page.tsx` | None — static content |
| `/electric-truck` | `app/electric-truck/page.tsx` | None — static content |
| `/academy` | `app/academy/page.tsx` | None — links to GFA |
| `/books` | `app/books/page.tsx` | Publications list via `/api/publications` |
| `/knowledge-hub` | `app/knowledge-hub/page.tsx` | Articles/resources via `/api/knowledge` |
| `/ecosystem-partners` | `app/ecosystem-partners/page.tsx` | Partners list via `/api/partners` |
| `/partner-with-tag` | `app/partner-with-tag/page.tsx` | None — static content |
| `/contact` | `app/contact/page.tsx` | Form submission via Server Action |

---

## Data Flow

### Impact Strip (Homepage Section 4)
```
Client → /api/metrics → { action_plans, workshops, partners, countries, last_updated, data_source }
```
- Fetched client-side with 15-minute cache
- Falls back to `IMPACT_STRIP_FALLBACK` in `lib/constants.ts` if API unavailable
- `data_source: "demo"` triggers yellow warning banner in UI

### Enquiry Form (`/contact`)
```
User fills form → Server Action (submitEnquiry) → POST /api/submit-enquiry
                                                 → Supabase: enquiry_submissions table
                                                 → Email notification to owner
```
**Form fields:** organisation_name, organisation_role, contact_name, email, mobile, fleet_size (optional), nature_of_enquiry, enquiry_type (enum)  
**Enquiry types:** `dfi` | `government` | `industry_body` | `fleet` | `partnership` | `other`

---

## Static Strings

All static strings, labels, and copy live in `lib/constants.ts`. Do not hardcode strings in page or component files.

All external URLs use `process.env.NEXT_PUBLIC_*` with fallbacks in `ECOSYSTEM_URLS`. Set these in Vercel environment variables.

---

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_GFA_URL` | GreenFreightAcademy site URL |
| `NEXT_PUBLIC_BETTERDRIVER_URL` | BetterDriver site URL |
| `NEXT_PUBLIC_ZERO_AFRICA_URL` | ZeroAfrica site URL |
| `NEXT_PUBLIC_TAG_API_URL` | Base URL for the TAG API layer |
| `NEXT_PUBLIC_METRICS_ENDPOINT` | `/api/metrics` endpoint |

---

## TypeScript Types

All data shapes are defined in `types/index.ts`. Key interfaces:

- `Metric` — impact strip data from `/api/metrics`
- `Publication` — books and frameworks list item
- `EnquiryFormData` — contact form submission payload
- `EnquiryType` — union type for enquiry classification

---

## Mock Data Removal Checklist

Before going live, remove or replace the following:

- [ ] `IMPACT_STRIP_FALLBACK` in `lib/constants.ts` — replace with live `/api/metrics` fetch
- [ ] `PUBLICATIONS_PLACEHOLDER` in `lib/constants.ts` — replace with live `/api/publications` fetch
- [ ] Yellow `[DEMO DATA]` banner in homepage impact strip — remove once `data_source === "live"`
- [ ] Stub inner pages (`/services`, `/green-freight`, etc.) — replace with real content

---

## Deployment Notes

- Deploy to Vercel. Set all `NEXT_PUBLIC_*` environment variables in the Vercel dashboard.
- The Next.js build produces a `standalone` output — use `next start` in production.
- The build will warn about chunk size — this is expected and does not affect functionality.
- The `/api/*` routes are **not** in this package — they are Asif's API layer, deployed separately or as Vercel serverless functions.
