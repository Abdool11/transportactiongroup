import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

// Lazy initialisation — prevents "supabaseUrl is required" error at build time.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      user_name,
      user_email,
      company,
      country,
      currency_code,
      truck_type,
      use_case,
      inputs_json,
      diesel_tco,
      electric_tco,
      total_saving,
      break_even_year,
      export_type,
    } = body;

    // Basic validation
    if (!user_name || !user_email || !company) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { error } = await supabase.from("tco_submissions").insert({
      user_name,
      user_email,
      company,
      country:         country        ?? null,
      currency_code:   currency_code  ?? "ZAR",
      truck_type:      truck_type     ?? null,
      use_case:        use_case       ?? null,
      inputs_json:     inputs_json    ?? null,
      diesel_tco:      diesel_tco     ?? null,
      electric_tco:    electric_tco   ?? null,
      total_saving:    total_saving   ?? null,
      break_even_year: break_even_year ?? null,
      export_type:     export_type    ?? null,
    });

    if (error) {
      console.error("TCO submit error:", error);
      // Don't block the download — log and continue
    }

    // ── Email notification ────────────────────────────────────────────────────
    const fmt = (n: number | null | undefined) =>
      n != null ? `R${Math.round(n).toLocaleString("en-ZA")}` : "N/A";

    if (process.env.BREVO_SMTP_PASSWORD) {
      await sendEmail({
        from: "notifications@transportactiongroup.com",
        fromName: "TAG TCO Calculator",
        to: "transportactiongroup@gmail.com",
        subject: `TCO ${export_type?.toUpperCase() ?? "Export"} downloaded — ${user_name} (${company})`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
            <h2 style="color: #22c55e; margin-bottom: 4px;">New TCO Calculator Download</h2>
            <p style="color: #6b7280; font-size: 13px; margin-top: 0;">
              ${export_type?.toUpperCase() ?? "Export"} downloaded on ${new Date().toLocaleString("en-ZA")}
            </p>

            <h3 style="margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">Contact Details</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 6px 0; color: #6b7280; width: 140px;">Name</td><td style="padding: 6px 0; font-weight: 600;">${user_name}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Email</td><td style="padding: 6px 0;"><a href="mailto:${user_email}" style="color: #22c55e;">${user_email}</a></td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Company</td><td style="padding: 6px 0;">${company}</td></tr>
              ${country ? `<tr><td style="padding: 6px 0; color: #6b7280;">Country</td><td style="padding: 6px 0;">${country}</td></tr>` : ""}
              ${truck_type ? `<tr><td style="padding: 6px 0; color: #6b7280;">Truck type</td><td style="padding: 6px 0;">${truck_type}</td></tr>` : ""}
              ${use_case ? `<tr><td style="padding: 6px 0; color: #6b7280;">Use case</td><td style="padding: 6px 0;">${use_case}</td></tr>` : ""}
            </table>

            <h3 style="margin: 20px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">TCO Results</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 6px 0; color: #6b7280; width: 200px;">Currency</td><td style="padding: 6px 0;">${currency_code ?? "ZAR"}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Diesel TCO (lifetime)</td><td style="padding: 6px 0; font-weight: 600;">${fmt(diesel_tco)}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Electric TCO (lifetime)</td><td style="padding: 6px 0; font-weight: 600; color: #22c55e;">${fmt(electric_tco)}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Lifetime Cost Difference</td><td style="padding: 6px 0; font-weight: 600;">${fmt(total_saving)}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280;">Break-even year</td><td style="padding: 6px 0;">${break_even_year ?? "N/A"}</td></tr>
            </table>

            <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
              View all submissions in the
              <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://transportactiongroup.co.za"}/admin/tco-submissions" style="color: #22c55e;">Admin Dashboard</a>
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("TCO submit exception:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
