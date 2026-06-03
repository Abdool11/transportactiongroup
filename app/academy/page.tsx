import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, BookOpen, Users, Award, TrendingUp, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GreenFreightAcademy | Transport Action Group",
  description: "TAG's capability development platform for road freight companies — scalable training, certification, and performance improvement.",
};

const FEATURES = [
  { icon: BookOpen, title: "Six specialist programmes", body: "From professional driver certification to management training to green freight procurement — GFA delivers structured learning pathways for every role in the freight enterprise." },
  { icon: Users, title: "Company-level deployment", body: "GFA is designed for fleet operators and freight companies. Upload your driver list, select programmes, and deploy training to your entire workforce in a single workflow." },
  { icon: Award, title: "Nationally recognised certification", body: "All GFA programmes lead to certification that is recognised across the South African freight sector. Drivers and managers build a visible, verifiable record of professional development." },
  { icon: TrendingUp, title: "Performance-linked outcomes", body: "GFA programmes are designed around measurable business outcomes — fuel efficiency, safety performance, compliance, and emissions reduction — not just learning completion." },
];

/**
 * Fetches programme pricing from GFA constants via the GFA API.
 * Falls back to importing directly from the shared constants file.
 * Single source of truth: greenfreightacademy/lib/constants.ts
 */
async function fetchProgrammes() {
  // Import directly from the GFA constants — monorepo allows cross-app imports
  // This ensures TAG always reflects the exact same data as GFA with zero duplication
  try {
    const { PROGRAMMES } = await import("../../greenfreightacademy/lib/constants");
    return PROGRAMMES;
  } catch {
    // Fallback: return empty array; table will not render rather than show stale prices
    return [];
  }
}

export default async function AcademyPage() {
  const PROGRAMMES = await fetchProgrammes();

  const driverProgrammes = PROGRAMMES.filter(
    (p: { tier: string; status?: string }) => p.tier === "workforce" && (p as { status?: string }).status !== "coming-soon"
  );
  const managementProgrammes = PROGRAMMES.filter(
    (p: { tier: string; status?: string }) => p.tier === "enterprise" && (p as { status?: string }).status !== "coming-soon"
  );
  const comingSoonProgrammes = PROGRAMMES.filter(
    (p: { status?: string }) => (p as { status?: string }).status === "coming-soon"
  );

  return (
    <div className="min-h-screen bg-background pt-32 pb-24">
      <div className="container max-w-5xl">
        <div className="mb-16">
          <img src="/gfa-logo.png" alt="GreenFreightAcademy" className="h-12 w-auto mb-4" />
          <h1 className="mb-6">Capability development at scale</h1>
          <p className="text-muted-foreground leading-relaxed text-lg max-w-3xl">
            GreenFreightAcademy is TAG's capability and performance platform for road freight companies. It delivers scalable, structured training that improves business performance through people development — built by transport experts who understand trucks, drivers, and trucking.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Icon size={20} className="text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* Programmes table — fully dynamic from GFA constants */}
        {PROGRAMMES.length > 0 && (
          <div className="mb-10">
            <h2 className="text-2xl font-semibold mb-6">Available programmes</h2>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 font-semibold">Programme</th>
                    <th className="text-left p-4 font-semibold">Audience</th>
                    <th className="text-left p-4 font-semibold">Type</th>
                    <th className="text-left p-4 font-semibold">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {[...driverProgrammes, ...managementProgrammes].map((prog: {
                    id: string; title: string; audienceLabel: string;
                    pricingModel: string; priceLabel: string;
                  }) => (
                    <tr key={prog.id} className="border-b border-border last:border-0">
                      <td className="p-4 font-medium">{prog.title}</td>
                      <td className="p-4 text-muted-foreground">{prog.audienceLabel}</td>
                      <td className="p-4 text-muted-foreground">
                        {prog.pricingModel === "monthly-per-driver" ? "Subscription" : "Once-off"}
                      </td>
                      <td className="p-4 font-medium text-primary">{prog.priceLabel}</td>
                    </tr>
                  ))}
                  {comingSoonProgrammes.map((prog: {
                    id: string; title: string; audienceLabel: string;
                    pricingModel: string; priceLabel: string;
                  }) => (
                    <tr key={prog.id} className="border-b border-border last:border-0 opacity-75">
                      <td className="p-4 font-medium">
                        <span className="flex items-center gap-2">
                          <Zap size={13} className="text-green-400 flex-shrink-0" />
                          {prog.title}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                            Coming soon
                          </span>
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">{prog.audienceLabel}</td>
                      <td className="p-4 text-muted-foreground">Once-off</td>
                      <td className="p-4 font-medium text-green-400">{prog.priceLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Coming soon EV teaser cards — dynamic from constants */}
        {comingSoonProgrammes.map((prog: {
          id: string; title: string; fullDescription: string;
          outcomes: string[]; price: number; durationLabel: string; slug: string;
        }) => (
          <div key={prog.id} className="card p-6 mb-8 border border-green-500/20 bg-green-500/5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap size={20} className="text-green-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-base">{prog.title} — Coming Soon</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/12 text-green-400 border border-green-500/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    New programme
                  </span>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4 max-w-2xl">
                  {prog.fullDescription}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {prog.outcomes.map((item: string) => (
                    <span key={item} className="px-2.5 py-1 rounded-md text-xs bg-green-500/8 border border-green-500/15 text-muted-foreground">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-green-400 font-bold text-lg">
                    R{prog.price.toLocaleString()}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      launch price · once-off per driver · {prog.durationLabel}
                    </span>
                  </span>
                  <a
                    href={`https://greenfreightacademy.co.za/contact?type=ev-driver-interest&programme=${prog.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline text-sm py-1.5"
                  >
                    Register your interest <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="card p-8">
          <img src="/gfa-logo.png" alt="GreenFreightAcademy" className="h-10 w-auto mb-3" />
          <p className="text-muted-foreground leading-relaxed mb-6">
            GreenFreightAcademy is a standalone platform with its own company portal, driver management dashboard, and enrolment workflow. Visit the GFA site to register your company, upload your driver list, and deploy training.
          </p>
          <div className="flex flex-wrap gap-4">
            <a href="https://greenfreightacademy.co.za" target="_blank" rel="noopener noreferrer" className="btn-primary">
              <img src="/gfa-logo.png" alt="GFA" className="h-5 w-auto" /> Visit GreenFreightAcademy <ExternalLink size={16} />
            </a>
            <Link href="/contact" className="btn-outline">
              Talk to TAG about training
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
