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

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // Verify Blink auth
    const projectId = Deno.env.get("BLINK_PROJECT_ID")!;
    const secretKey = Deno.env.get("BLINK_SECRET_KEY")!;
    const midtransServerKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";

    if (!midtransServerKey) {
      return json({ error: "Midtrans not configured" }, 500);
    }

    const blink = createClient({ projectId, secretKey });

    // Verify user auth
    const auth = await blink.auth.verifyToken(req.headers.get("Authorization"));
    if (!auth.valid) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return json({ error: "orderId required" }, 400);
    }

    // Fetch order from DB
    const order = await blink.db.table("orders").get(orderId);
    if (!order) {
      return json({ error: "Order not found" }, 404);
    }

    // Verify order belongs to this user
    if (order.user_id !== auth.userId) {
      return json({ error: "Forbidden" }, 403);
    }

    if (order.status !== "PENDING") {
      return json({ error: "Order is not pending" }, 400);
    }

    // Fetch user details for Midtrans
    const user = await blink.db.table("users").get(auth.userId);

    // Fetch order items for transaction details
    const orderItems = await blink.db.table("order_items").list({
      where: { order_id: orderId },
    });

    // Build item_details for Midtrans
    const itemDetails = [];
    for (const item of orderItems) {
      const tt = await blink.db.table("ticket_types").get(item.ticket_type_id);
      itemDetails.push({
        id: item.ticket_type_id,
        price: Number(item.unit_price),
        quantity: Number(item.quantity),
        name: tt ? String(tt.name).slice(0, 50) : "Tiket",
      });
    }

    // Midtrans Snap API
    const midtransBaseUrl = isProduction
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

    const authHeader = btoa(`${midtransServerKey}:`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const midtransRes = await fetch(midtransBaseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: orderId,
          gross_amount: Number(order.total_amount),
        },
        customer_details: {
          email: user?.email ?? auth.email ?? "",
          first_name: user?.name ?? "User",
        },
        item_details: itemDetails,
        expiry: {
          unit: "minutes",
          duration: 15,
        },
      }),
    });

    clearTimeout(timeout);

    if (!midtransRes.ok) {
      const errText = await midtransRes.text();
      console.error("Midtrans error:", errText);
      return json({ error: "Midtrans API error", detail: errText }, 502);
    }

    const midtransData = await midtransRes.json();

    // Save snap token to order
    await blink.db.table("orders").update(orderId, {
      payment_token: midtransData.token,
    });

    return json({
      token: midtransData.token,
      redirectUrl: midtransData.redirect_url,
    });
  } catch (err) {
    console.error("midtrans-create error:", err);
    return json({ error: "Internal error" }, 500);
  }
}

Deno.serve(handler);
