import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type RestaurantTable = {
  id: string; restaurant_id: string; table_number: number; qr_token: string; is_active: boolean;
}
export type ServiceCall = {
  id: string; restaurant_id: string; table_id: string; table_number: number;
  status: "pending" | "acknowledged" | "resolved"; created_at: string;
  acknowledged_by: string | null; resolved_at: string | null;
}
export type TableInfo = { table_number: number; restaurant_name: string; }
type TableDefinition<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
type ServiceDatabase = { public: {
  Tables: { restaurant_tables: TableDefinition<RestaurantTable>; table_service_calls: TableDefinition<ServiceCall> };
  Views: Record<string, never>;
  Functions: {
    advance_table_service: { Args: { p_id: string; p_status: string }; Returns: undefined };
  };
  Enums: Record<string, never>; CompositeTypes: Record<string, never>;
} };
const db = supabase as unknown as SupabaseClient<ServiceDatabase>;
export const isTableToken = (token: string) => /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(token);
export async function getServiceTable(token: string): Promise<TableInfo> {
  if (!isTableToken(token)) throw new Error("QR de table invalide.");
  const { data, error } = await supabase.functions.invoke("digital-menu", { body: { action: "table_info", table_token: token } });
  if (error) throw new Error("Service des tables indisponible. Adressez-vous au serveur.");
  if (!data?.table) throw new Error(data?.error || "Cette table est inactive ou son QR a changé.");
  return data.table as TableInfo;
}
export async function requestTableService(token: string) {
  if (!isTableToken(token)) throw new Error("QR de table invalide.");
  const { data, error } = await supabase.functions.invoke("digital-menu", { body: { action: "table_request", table_token: token } });
  if (error || typeof data?.status !== "string") throw new Error(data?.error || "Appel non transmis. Réessayez ou adressez-vous au serveur.");
  return data.status;
}
export async function getTableServiceStatus(token: string): Promise<"pending" | "acknowledged" | null> {
  if (!isTableToken(token)) throw new Error("QR de table invalide.");
  const { data, error } = await supabase.functions.invoke("digital-menu", { body: { action: "table_status", table_token: token } });
  if (error) throw new Error("Impossible de vérifier l’appel serveur.");
  return data?.status ?? null;
}
export async function getAvailableServiceTables(): Promise<{ dine_in_enabled: boolean; tables: number[] }> {
  const { data, error } = await supabase.functions.invoke("digital-menu", { body: { action: "table_options" } });
  if (error || !data || !Array.isArray(data.tables)) throw new Error("Impossible de charger les tables disponibles.");
  return { dine_in_enabled: data.dine_in_enabled === true, tables: data.tables.filter((n: unknown): n is number => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 10) };
}
export async function requestTableServiceByNumber(tableNumber: number) {
  const { data, error } = await supabase.functions.invoke("digital-menu", { body: { action: "table_request_number", table_number: tableNumber } });
  if (error || typeof data?.status !== "string") throw new Error(data?.error || "Appel non transmis. Réessayez.");
  return data.status;
}
export async function getTableServiceStatusByNumber(tableNumber: number): Promise<"pending" | "acknowledged" | null> {
  const { data, error } = await supabase.functions.invoke("digital-menu", { body: { action: "table_status_number", table_number: tableNumber } });
  if (error) throw new Error("Impossible de vérifier l’appel serveur.");
  return data?.status ?? null;
}
export async function fetchServiceCalls(restaurantId: string) {
  const { data, error } = await db.from("table_service_calls").select("*")
    .eq("restaurant_id", restaurantId).in("status", ["pending", "acknowledged"]).order("created_at");
  if (error) throw new Error("Impossible de charger les appels. Vérifiez la connexion et l’activation Supabase.");
  return data || [];
}
export async function advanceServiceCall(id: string, status: "acknowledged" | "resolved") {
  const { error } = await db.rpc("advance_table_service", { p_id: id, p_status: status });
  if (error) throw new Error("L’appel a changé ou vous n’avez pas accès à cette table. Actualisez.");
}
export async function fetchRestaurantTables(restaurantId: string) {
  const { data, error } = await db.from("restaurant_tables").select("*")
    .eq("restaurant_id", restaurantId).order("table_number");
  if (error) throw new Error("Les QR ne sont pas disponibles. Activez d’abord les tables dans Supabase.");
  return data || [];
}
export async function setRestaurantTableActive(tableId: string, isActive: boolean) {
  const { error } = await db.from("restaurant_tables").update({ is_active: isActive }).eq("id", tableId);
  if (error) throw new Error("Impossible de modifier cette table. Vérifiez votre accès administrateur.");
}
