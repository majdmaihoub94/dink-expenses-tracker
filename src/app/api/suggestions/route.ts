import { NextResponse } from "next/server";

import { buildSuggestions, EMPTY_SUGGESTIONS, type SuggestionRow } from "@/lib/suggestions";
import { createClient } from "@/lib/supabase/server";

/** How far back the autocomplete looks. Plenty of history, one cheap query. */
const SAMPLE_SIZE = 400;

/**
 * Autocomplete data for the add form: names you have used before, and the
 * amounts you usually pair with them.
 *
 * Fetched lazily when the add sheet first opens rather than on every page
 * load, so it costs nothing while you are just navigating.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(EMPTY_SUGGESTIONS, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) return NextResponse.json(EMPTY_SUGGESTIONS);

  const { data, error } = await supabase
    .from("transactions")
    .select("merchant, amount, category_id, payment_method_id, kind, occurred_on")
    .eq("household_id", profile.household_id)
    .eq("kind", "expense")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SAMPLE_SIZE);

  if (error) return NextResponse.json(EMPTY_SUGGESTIONS);

  return NextResponse.json(buildSuggestions((data ?? []) as SuggestionRow[]), {
    // Short private cache: fresh enough to reflect today's spending, long
    // enough that reopening the sheet repeatedly is free.
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
