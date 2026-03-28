import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const projectId = Deno.env.get("BLINK_PROJECT_ID")!;
    const secretKey = Deno.env.get("BLINK_SECRET_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const blink = createClient({ projectId, secretKey });

    // Verify caller is authenticated admin
    const auth = await blink.auth.verifyToken(req.headers.get("Authorization"));
    if (!auth.valid) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { eoProfileId, approved } = body;

    if (!eoProfileId) return json({ error: "eoProfileId required" }, 400);

    const profile = await blink.db.table("eo_profiles").get(eoProfileId);
    if (!profile) return json({ error: "Profile not found" }, 404);

    const user = await blink.db.table("users").get(String(profile.user_id));
    if (!user?.email) return json({ ok: true, message: "No email on file" });

    if (!resendApiKey) return json({ ok: true, message: "Resend not configured" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: "Eventra <noreply@eventra.id>",
          to: [String(user.email)],
          subject: approved
            ? "Akun EO Anda Telah Disetujui!"
            : "Update Status Akun EO Anda",
          html: approved
            ? `
<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
  <div style="background: #0F1729; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 18px;">Eventra<span style="color: #6467F2;">.</span></h1>
  </div>
  <div style="background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; padding: 24px;">
    <h2 style="color: #0F1729; margin-top: 0;">Selamat! Akun EO Anda Aktif</h2>
    <p style="color: #64748b;">Halo <strong>${profile.org_name}</strong>,</p>
    <p style="color: #64748b;">Akun Event Organizer Anda di Eventra telah <strong style="color: #10b981;">disetujui</strong>. Kini Anda dapat mulai membuat dan menjual tiket event!</p>
    <a href="https://eventra.id/eo/dashboard" style="display: inline-block; margin-top: 16px; background: #6467F2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
      Buka Dashboard EO
    </a>
  </div>
</div>`
            : `
<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
  <h2 style="color: #0F1729;">Status Akun EO</h2>
  <p style="color: #64748b;">Halo <strong>${profile.org_name}</strong>,</p>
  <p style="color: #64748b;">Mohon maaf, permohonan akun Event Organizer Anda belum dapat disetujui saat ini. Hubungi tim kami untuk informasi lebih lanjut.</p>
  <p style="color: #94a3b8; font-size: 12px;">© 2025 Eventra</p>
</div>`,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("notify-eo-approved error:", err);
    return json({ error: "Internal error" }, 500);
  }
}

Deno.serve(handler);
