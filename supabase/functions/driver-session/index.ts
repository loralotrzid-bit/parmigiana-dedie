// Legacy QR/name-based driver sessions have been retired. Permanent staff
// accounts authenticate with Supabase email/password and are authorized by
// delivery-api from their JWT-linked delivery_drivers row.
Deno.serve((req) => new Response(JSON.stringify({ error: "Cette méthode de connexion est désactivée. Connectez-vous avec le compte e-mail du personnel." }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
}));
