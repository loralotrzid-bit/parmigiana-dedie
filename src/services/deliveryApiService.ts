import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const numericValue = z.union([
  z.number(),
  z.string().regex(/^-?\d+(?:\.\d+)?$/).transform(Number),
]);

const safeOrderSchema = z.object({
  id: z.string().uuid(),
  order_number: numericValue,
  status: z.string(),
  total: numericValue,
  created_at: z.string(),
  delivery_address: z.string().nullable(),
  delivery_postcode: z.string().nullable(),
  delivery_lat: numericValue.nullable(),
  delivery_lng: numericValue.nullable(),
  estimated_delivery_at: z.string().nullable(),
  payment_method: z.string().nullable(),
  cash_details: z.unknown().nullable(),
  client_phone: z.string().nullable(),
  note: z.string().nullable(),
}).passthrough();

const assignmentSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  delivery_order: numericValue.nullable(),
  picked_up_at: z.string().nullable(),
  orders: safeOrderSchema.nullable(),
}).passthrough();

export type DeliveryOrderPayload = z.infer<typeof safeOrderSchema>;
export type DeliveryAssignmentPayload = z.infer<typeof assignmentSchema>;

const objectPayload = z.object({}).passthrough();

async function callDeliveryApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke<unknown>("delivery-api", { body });
  if (error) throw error;
  const payload = objectPayload.parse(data);
  if (typeof payload.error === "string") throw new Error(payload.error);
  return payload;
}

export async function fetchAvailableOrders() {
  const res = await callDeliveryApi({ action: "list_available" });
  return z.array(safeOrderSchema).parse(res.orders);
}

export async function claimOrders(orderIds: string[]) {
  const res = await callDeliveryApi({ action: "claim", order_ids: orderIds });
  return z.object({ claimed: z.number().int().nonnegative() }).passthrough().parse(res);
}

export async function fetchMyAssignments() {
  const res = await callDeliveryApi({ action: "my_assignments" });
  return z.array(assignmentSchema).parse(res.assignments);
}

export async function updateDeliveryStatus(
  assignmentId: string,
  status: string,
  deliveryCode?: string
) {
  return callDeliveryApi({
    action: "update_status",
    assignment_id: assignmentId,
    status,
    delivery_code: deliveryCode,
  });
}

export async function updateDriverLocation(
  location: { latitude: number; longitude: number; heading?: number | null; speed?: number | null; accuracy?: number }
) {
  return callDeliveryApi({ action: "update_location", ...location });
}

export async function fetchDriverHistory() {
  const res = await callDeliveryApi({ action: "history" });
  return z.array(assignmentSchema).parse(res.assignments);
}

export async function releaseAllAssignments() {
  return z.object({ released: z.number().int().nonnegative() }).passthrough().parse(await callDeliveryApi({
    action: "release_all",
  }));
}

export async function fetchTableOrders() {
  const res = await callDeliveryApi({ action: "list_table_orders" });
  return z.array(z.object({ id: z.string().uuid(), order_number: numericValue, status: z.string(), total: numericValue, created_at: z.string(), table_number: z.number().nullable(), note: z.string().nullable() })).parse(res.orders);
}

export async function markTableOrderServed(orderId: string) {
  return callDeliveryApi({ action: "serve_order", order_id: orderId });
}
