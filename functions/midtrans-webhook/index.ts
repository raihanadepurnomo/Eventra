import { createClient } from "npm:@blinkdotnew/sdk";
import { createHash } from "node:crypto";

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

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const projectId = Deno.env.get("BLINK_PROJECT_ID")!;
    const secretKey = Deno.env.get("BLINK_SECRET_KEY")!;
    const midtransServerKey = Deno.env.get("MIDTRANS_SERVER_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const blink = createClient({ projectId, secretKey });

    const payload = await req.json();
    const {
      order_id: orderId,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
    } = payload;

    // Verify Midtrans signature
    const rawSignature = `${orderId}${status_code}${gross_amount}${midtransServerKey}`;
    const expectedSig = createHash("sha512").update(rawSignature).digest("hex");

    if (signature_key !== expectedSig) {
      console.error("Invalid Midtrans signature");
      return json({ error: "Invalid signature" }, 403);
    }

    // Determine if payment succeeded
    const isPaid =
      (transaction_status === "settlement" || transaction_status === "capture") &&
      (fraud_status === "accept" || fraud_status === undefined);

    const isCancelled =
      transaction_status === "cancel" ||
      transaction_status === "deny" ||
      transaction_status === "expire";

    const order = await blink.db.table("orders").get(orderId);
    if (!order) {
      return json({ error: "Order not found" }, 404);
    }

    if (isPaid && order.status === "PENDING") {
      const now = new Date().toISOString();

      // Mark order as PAID
      await blink.db.table("orders").update(orderId, {
        status: "PAID",
        paid_at: now,
        payment_method: payload.payment_type ?? "unknown",
      });

      // Generate tickets for each order item
      const orderItems = await blink.db.table("order_items").list({
        where: { order_id: orderId },
      });

      for (const item of orderItems) {
        const qty = Number(item.quantity);
        for (let i = 0; i < qty; i++) {
          await blink.db.table("tickets").create({
            id: crypto.randomUUID(),
            order_id: orderId,
            user_id: String(order.user_id),
            ticket_type_id: String(item.ticket_type_id),
            qr_code: crypto.randomUUID(),
            status: "ACTIVE",
            is_used: 0,
            created_at: now,
          });
        }
        // Update sold count
        const tt = await blink.db.table("ticket_types").get(String(item.ticket_type_id));
        if (tt) {
          await blink.db.table("ticket_types").update(String(item.ticket_type_id), {
            sold: Number(tt.sold) + qty,
          });
        }
      }

      // Send confirmation email via Resend
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
                subject: "Tiket Anda Sudah Siap! 🎟️",
                html: buildTicketEmail({
                  name: String(user.name ?? user.email),
                  orderId,
                  totalAmount: Number(order.total_amount),
                }),
              }),
            });
          } catch (emailErr) {
            console.error("Email send failed:", emailErr);
          } finally {
            clearTimeout(timeout);
          }
        }
      }
    }

    if (isCancelled && order.status === "PENDING") {
      // Restore quota
      const orderItems = await blink.db.table("order_items").list({
        where: { order_id: orderId },
      });
      for (const item of orderItems) {
        const tt = await blink.db.table("ticket_types").get(String(item.ticket_type_id));
        if (tt) {
          const restored = Math.max(0, Number(tt.sold) - Number(item.quantity));
          await blink.db.table("ticket_types").update(String(item.ticket_type_id), {
            sold: restored,
          });
        }
      }
      await blink.db.table("orders").update(orderId, { status: "EXPIRED" });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("midtrans-webhook error:", err);
    return json({ error: "Internal error" }, 500);
  }
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function buildTicketEmail({
  name,
  orderId,
  totalAmount,
}: {
  name: string;
  orderId: string;
  totalAmount: number;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; background: #f8fafc; padding: 32px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
    <div style="background: #0F1729; padding: 24px 32px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">Eventra<span style="color: #6467F2;">.</span></h1>
    </div>
    <div style="padding: 32px;">
      <h2 style="color: #0F1729; margin-top: 0;">Pembayaran Berhasil!</h2>
      <p style="color: #64748b;">Halo <strong>${name}</strong>,</p>
      <p style="color: #64748b;">Tiket Anda sudah siap. Silakan buka dashboard Eventra untuk melihat QR Code tiket Anda.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px; color: #64748b; font-size: 13px;">Order ID</p>
        <p style="margin: 0; font-family: monospace; font-size: 13px; color: #0F1729;">${orderId}</p>
        <p style="margin: 12px 0 4px; color: #64748b; font-size: 13px;">Total</p>
        <p style="margin: 0; font-weight: 700; color: #0F1729; font-size: 18px;">${formatIDR(totalAmount)}</p>
      </div>
      <a href="https://eventra.id/dashboard" style="display: inline-block; background: #6467F2; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Lihat Tiket Saya
      </a>
    </div>
    <div style="padding: 16px 32px; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">© 2025 Eventra. Platform tiket modern Indonesia.</p>
    </div>
  </div>
</body>
</html>
  `;
}

Deno.serve(handler);
