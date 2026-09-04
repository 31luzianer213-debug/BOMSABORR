import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Apenas administradores.");
}

/* ---------------- Admin: despachar pedido para um motoboy ---------------- */

export const dispatchOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        orderId: uuid,
        courierId: uuid,
        baseUrl: z.string().url().max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const db = await admin();

    const { data: courier } = await db
      .from("couriers")
      .select("id, name, phone, fee_per_delivery, pay_type, pay_amount, share_token")
      .eq("id", data.courierId)
      .maybeSingle();
    if (!courier) throw new Error("Motoboy não encontrado.");

    const { data: order, error } = await db
      .from("orders")
      .update({
        courier_id: courier.id,
        courier_fee: courier.pay_type === "fee" ? Number(courier.pay_amount || courier.fee_per_delivery) : 0,
        status: "delivering",
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", data.orderId)
      .select("*")
      .single();
    if (error || !order) throw new Error(error?.message ?? "Não foi possível despachar o pedido.");

    const origin = data.baseUrl.replace(/\/$/, "");
    const trackUrl = `${origin}/rastreio/${order.track_token}`;
    const courierUrl = `${origin}/entregador/${courier.share_token}`;

    const { sendWhatsapp } = await import("./whatsapp.server");
    const { data: settings } = await db
      .from("store_settings")
      .select("store_name")
      .limit(1)
      .maybeSingle();
    const storeName = settings?.store_name ?? "Bom Sabor";

    const messages: string[] = [];

    const customerMsg = [
      `🛵 *${storeName}* — seu pedido #${order.code} saiu para entrega!`,
      "",
      `Entregador: ${courier.name}`,
      `Total: ${brl(Number(order.total))}`,
      "",
      `Acompanhe em tempo real: ${trackUrl}`,
    ].join("\n");
    const toCustomer = await sendWhatsapp(order.customer_phone, customerMsg);
    if (!toCustomer.ok && toCustomer.error) messages.push(toCustomer.error);

    if (courier.phone) {
      const courierMsg = [
        `🛵 *Nova entrega — pedido #${order.code}*`,
        "",
        `Cliente: ${order.customer_name} — ${order.customer_phone}`,
        order.order_type === "delivery"
          ? `Endereço: ${order.address}${order.neighborhood ? ` — ${order.neighborhood}` : ""}`
          : "Retirada no local",
        `Total: ${brl(Number(order.total))} • Pagamento: ${order.payment_method}`,
        "",
        `Abra seu painel (mantenha aberto para o mapa): ${courierUrl}`,
      ].join("\n");
      const toCourier = await sendWhatsapp(courier.phone, courierMsg);
      if (!toCourier.ok && toCourier.error) messages.push(toCourier.error);
    }

    return { trackUrl, courierUrl, whatsappError: messages[0] ?? null };
  });

/* ---------------- Motoboy: sessão pelo link secreto ---------------- */

export const courierSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: uuid }).parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: courier } = await db
      .from("couriers")
      .select("id, name, active, fee_per_delivery, pay_type, pay_amount")
      .eq("share_token", data.token)
      .maybeSingle();
    if (!courier || !courier.active) throw new Error("Link inválido ou motoboy inativo.");

    const { data: orders } = await db
      .from("orders")
      .select(
        "id, code, customer_name, customer_phone, address, neighborhood, total, payment_method, change_for, status, order_type, notes, dispatched_at",
      )
      .eq("courier_id", courier.id)
      .in("status", ["delivering", "preparing"])
      .order("dispatched_at", { ascending: true });

    const { data: available } = await db
      .from("orders")
      .select(
        "id, code, customer_name, customer_phone, address, neighborhood, total, payment_method, change_for, status, order_type, notes, created_at",
      )
      .is("courier_id", null)
      .eq("order_type", "delivery")
      .in("status", ["pending", "preparing", "ready"])
      .order("created_at", { ascending: true });



    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: doneToday } = await db
      .from("orders")
      .select("id, courier_fee")
      .eq("courier_id", courier.id)
      .eq("status", "done")
      .gte("delivered_at", startOfDay.toISOString());

    return {
      courier: {
        id: courier.id,
        name: courier.name,
        payType: courier.pay_type as "fee" | "daily" | "monthly",
        fee: courier.pay_type === "fee" ? Number(courier.pay_amount || courier.fee_per_delivery) : 0,
      },
      orders: orders ?? [],
      available: available ?? [],
      today: {
        count: doneToday?.length ?? 0,
        earnings: (doneToday ?? []).reduce((sum, o) => sum + Number(o.courier_fee), 0),
      },
    };
  });

/* ---------------- Motoboy: pegar um pedido disponível ---------------- */

export const courierClaimOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: uuid,
        orderId: uuid,
        baseUrl: z.string().url().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: courier } = await db
      .from("couriers")
      .select("id, name, active, fee_per_delivery, pay_type, pay_amount")
      .eq("share_token", data.token)
      .maybeSingle();
    if (!courier || !courier.active) throw new Error("Link inválido ou motoboy inativo.");

    const { data: order, error } = await db
      .from("orders")
      .update({
        courier_id: courier.id,
        courier_fee: courier.pay_type === "fee" ? Number(courier.pay_amount || courier.fee_per_delivery) : 0,
        status: "delivering",
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", data.orderId)
      .is("courier_id", null)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Este pedido já foi pego por outro entregador.");

    const { sendWhatsapp } = await import("./whatsapp.server");
    const origin = (data.baseUrl ?? "").replace(/\/$/, "");
    const trackUrl = origin ? `${origin}/rastreio/${order.track_token}` : null;
    const sent = await sendWhatsapp(
      order.customer_phone,
      [
        `🛵 Seu pedido #${order.code} saiu para entrega!`,
        "",
        `Entregador: ${courier.name}`,
        `Total: ${brl(Number(order.total))}`,
        ...(trackUrl ? ["", `Acompanhe o motoboy em tempo real: ${trackUrl}`] : []),
      ].join("\n"),
    );

    return { ok: true, whatsappError: sent.ok ? null : (sent.error ?? "Falha no WhatsApp") };
  });



export const pushCourierLocation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: uuid,
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().min(0).max(100000).nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: courier } = await db
      .from("couriers")
      .select("id, active")
      .eq("share_token", data.token)
      .maybeSingle();
    if (!courier || !courier.active) throw new Error("Link inválido.");

    const { error } = await db.from("courier_locations").insert({
      courier_id: courier.id,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const courierFinishOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: uuid, orderId: uuid }).parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: courier } = await db
      .from("couriers")
      .select("id, active, name")
      .eq("share_token", data.token)
      .maybeSingle();
    if (!courier || !courier.active) throw new Error("Link inválido.");

    const { data: order, error } = await db
      .from("orders")
      .update({ status: "done", delivered_at: new Date().toISOString() })
      .eq("id", data.orderId)
      .eq("courier_id", courier.id)
      .select("code, customer_phone")
      .maybeSingle();
    if (error) throw new Error(error.message);

    let whatsappError: string | null = null;
    if (order) {
      const { sendWhatsapp } = await import("./whatsapp.server");
      const sent = await sendWhatsapp(
        order.customer_phone,
        `✅ Pedido #${order.code} entregue! Obrigado pela preferência. Bom apetite! 🍕`,
      );
      if (!sent.ok) whatsappError = sent.error ?? "Falha no WhatsApp";
    }
    return { ok: true, whatsappError };
  });



/* ---------------- Cliente: acompanhamento pelo link do pedido ---------------- */

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: uuid }).parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: order } = await db
      .from("orders")
      .select(
        "id, code, customer_name, status, total, order_type, address, neighborhood, courier_id, created_at, dispatched_at, delivered_at",
      )
      .eq("track_token", data.token)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado.");

    const { data: settings } = await db
      .from("store_settings")
      .select("store_name, store_whatsapp, opening_hours")
      .limit(1)
      .maybeSingle();

    let courier: { name: string; lat: number; lng: number; updatedAt: string } | null = null;
    let trail: { lat: number; lng: number }[] = [];
    const destMatch = decodeURIComponent(order.address ?? "").match(
      /(-?\d+\.\d+)[,\s/+]+(-?\d+\.\d+)/,
    );
    const destination = destMatch
      ? { lat: Number(destMatch[1]), lng: Number(destMatch[2]) }
      : null;
    if (order.courier_id) {
      const { data: c } = await db
        .from("couriers")
        .select("name")
        .eq("id", order.courier_id)
        .maybeSingle();
      const { data: locs } = await db
        .from("courier_locations")
        .select("lat, lng, created_at")
        .eq("courier_id", order.courier_id)
        .order("created_at", { ascending: false })
        .limit(25);
      const loc = locs?.[0] ?? null;
      trail = (locs ?? [])
        .slice()
        .reverse()
        .map((l) => ({ lat: Number(l.lat), lng: Number(l.lng) }));
      if (c) {
        courier = {
          name: c.name,
          lat: loc?.lat ?? 0,
          lng: loc?.lng ?? 0,
          updatedAt: loc?.created_at ?? "",
        };
        if (!loc) courier = { ...courier, lat: 0, lng: 0 };
      }
    }

    return {
      order: {
        code: order.code,
        customerName: order.customer_name.split(" ")[0] ?? order.customer_name,
        status: order.status,
        total: Number(order.total),
        orderType: order.order_type,
        address: order.address,
        neighborhood: order.neighborhood,
        createdAt: order.created_at,
        dispatchedAt: order.dispatched_at,
        deliveredAt: order.delivered_at,
      },
      courier,
      trail,
      destination,
      store: {
        name: settings?.store_name ?? "Bom Sabor",
        whatsapp: settings?.store_whatsapp ?? "",
        hours: settings?.opening_hours ?? "",
      },
    };
  });

/* ---------------- Admin: enviar link do painel ao motoboy pelo bot ---------------- */

export const sendCourierLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ courierId: uuid, baseUrl: z.string().url().max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const db = await admin();

    const { data: courier } = await db
      .from("couriers")
      .select("name, phone, share_token")
      .eq("id", data.courierId)
      .maybeSingle();
    if (!courier) throw new Error("Motoboy não encontrado.");
    if (!courier.phone) throw new Error("Este motoboy não tem telefone cadastrado.");

    const { data: settings } = await db
      .from("store_settings")
      .select("store_name")
      .limit(1)
      .maybeSingle();
    const storeName = settings?.store_name ?? "Bom Sabor";
    const origin = data.baseUrl.replace(/\/$/, "");
    const courierUrl = `${origin}/entregador/${courier.share_token}`;

    const { sendWhatsapp } = await import("./whatsapp.server");
    const res = await sendWhatsapp(
      courier.phone,
      [
        `🛵 *${storeName}* — painel de entregas`,
        "",
        `Olá ${courier.name}! Abra seu painel e ative a localização:`,
        courierUrl,
      ].join("\n"),
    );
    if (!res.ok) throw new Error(res.error ?? "Não foi possível enviar no WhatsApp.");
    return { courierUrl };
  });
