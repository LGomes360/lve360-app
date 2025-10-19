export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("u"); // REQUIRED (encoded)
    const src  = url.searchParams.get("src") || "amazon";
    const submissionId = url.searchParams.get("submission_id");
    const stackId = url.searchParams.get("stack_id");
    const item = url.searchParams.get("item");

    if (!raw) {
      return NextResponse.json({ ok:false, error:"Missing u (destination)" }, { status: 400 });
    }

    // ✅ Decode and sanity-check the destination
    const dest = decodeURIComponent(raw);
    if (!/^https?:\/\//i.test(dest)) {
      return NextResponse.json({ ok:false, error:"Invalid destination" }, { status: 400 });
    }
    // Optional: tighten to Amazon/Fullscript if you want
    // if (!/^(https?:\/\/(www\.)?amazon\.com|https?:\/\/.*fullscript\.com)/i.test(dest)) { ... }

    // ... keep your logging code here ...
    // await supabaseAdmin.from("link_clicks").insert({ ... , url: dest, ... });

    // ✅ Now redirect to the true destination
    return NextResponse.redirect(dest, { status: 302 });
