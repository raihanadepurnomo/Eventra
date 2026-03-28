import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
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

  try {
    const projectId = Deno.env.get("BLINK_PROJECT_ID")!;
    const secretKey = Deno.env.get("BLINK_SECRET_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const blink = createClient({ projectId, secretKey });

    // Fetch all PENDING orders
    const pendingOrders = await blink.db.table("orders").list({
      where: { status: "PENDING" },
    });

    const now = new Date();
    let expiredCount = 0;

    for (const order of pendingOrders) {
      const expiredAt = new Date(String(order.expired_at));
      if (now > expiredAt) {
        // Mark order as EXPIRED
        await blink.db.table("orders").update(String(order.id), {
          status: "EXPIRED",
        });
        expiredCount++;

        // Restore quota for each item
        const items = await blink.db.table("order_items").list({
          where: { order_id: String(order.id) },
        });

        for (const item of items) {
          const tt = await blink.db.table("ticket_types").get(String(item.ticket_type_id));
          if (tt) {
            const restored = Math.max(0, Number(tt.sold) - Number(item.quantity));
            await blink.db.table("ticket_types").update(String(item.ticket_type_id), {
              sold: restored,
            });
          }
        }

        // Send expiry email if Resend configured
        if (resendApiKey) {
          const user = await blink.db.table("users").get(String(order.user_id));
          if (user?.email) {
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
                  subject: "Pesanan Anda Telah Kedaluwarsa",
                  html: `
<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
  <h2 style="color: #0F1729;">Pesanan Kedaluwarsa</h2>
  <p style="color: #64748b;">Halo <strong>${user.name ?? user.email}</strong>,</p>
  <p style="color: #64748b;">Pesanan <code>${order.id}</code> telah kedaluwarsa karena tidak diselesaikan dalam 15 menit.</p>
  <p style="color: #64748b;">Anda dapat melakukan pembelian ulang di <a href="https://eventra.id/events">eventra.id/events</a>.</p>
  <p style="color: #94a3b8; font-size: 12px;">© 2025 Eventra</p>
</div>
                  `,
                }),
              });
            } catch (emailErr) {
              console.error("Expiry email failed:", emailErr);
            } finally {
              clearTimeout(timeout);
            }
          }
        }
      }
    }

    return json({ ok: true, expired: expiredCount, checked: pendingOrders.length });
  } catch (err) {
    console.error("order-expire error:", err);
    return json({ error: "Internal error" }, 500);
  }
}

Deno.serve(handler);
