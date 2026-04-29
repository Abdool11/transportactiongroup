import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lazy initialisation — client is created inside the handler, not at module load time.
// This prevents the "supabaseUrl is required" error during Next.js build-time page data collection.
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
      notes,
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
      country: country ?? null,
      currency_code: currency_code ?? "ZAR",
      truck_type: truck_type ?? null,
      use_case: use_case ?? null,
      notes: notes ?? null,
      inputs_json: inputs_json ?? null,
      diesel_tco: diesel_tco ?? null,
      electric_tco: electric_tco ?? null,
      total_saving: total_saving ?? null,
      break_even_year: break_even_year ?? null,
      export_type: export_type ?? null,
      submitted_at: new Date().toISOString(),
    });

    if (error) {
      console.error("TCO submit error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("TCO submit exception:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
