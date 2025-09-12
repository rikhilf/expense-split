// supabase/functions/update_placeholder_profile/index.ts
// Allows a group admin to update a placeholder profile's basic fields (display_name + payment handles).
// Requires: Authorization: Bearer <user JWT>
// Body: { group_id, profile_id, display_name?, venmo_username?, cashapp_username?, paypal_username? }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), { headers: { "content-type": "application/json", ...cors }, ...init });

function bearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

type Payload = {
  group_id?: string;
  profile_id?: string;
  display_name?: string | null;
  venmo_username?: string | null;
  cashapp_username?: string | null;
  paypal_username?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method !== "POST") return json({ error: "Use POST" }, { status: 400 });

    const token = bearer(req);
    if (!token) return json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authRes, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !authRes?.user) return json({ error: "Unauthorized" }, { status: 401 });
    const caller: User = authRes.user;

    const body = (await req.json().catch(() => ({}))) as Payload;
    const group_id = body.group_id?.trim();
    const profile_id = body.profile_id?.trim();
    if (!group_id || !profile_id) return json({ error: "Missing group_id or profile_id" }, { status: 400 });

    // Resolve caller's profile and membership role in the group
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", caller.id)
      .single();
    if (profErr || !callerProfile) return json({ error: "Caller profile not found" }, { status: 403 });

    const { data: callerM, error: memErr } = await admin
      .from("memberships")
      .select("role")
      .eq("group_id", group_id)
      .eq("user_id", callerProfile.id)
      .single();
    if (memErr || !callerM) return json({ error: "Caller not a member of this group" }, { status: 403 });
    if (callerM.role !== "admin") return json({ error: "Only admins can edit placeholder profiles" }, { status: 403 });

    // Ensure target is a placeholder profile
    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, auth_user_id")
      .eq("id", profile_id)
      .single();
    if (tErr || !target) return json({ error: "Target profile not found" }, { status: 404 });
    if (target.auth_user_id) return json({ error: "Target is not a placeholder profile" }, { status: 400 });

    // Prepare updates (limit to allowed fields)
    const updates: Record<string, string | null> = {};
    if (typeof body.display_name === 'string') updates.display_name = body.display_name?.trim() || null;
    if (body.venmo_username !== undefined) updates.venmo_username = body.venmo_username?.trim() || null;
    if (body.cashapp_username !== undefined) updates.cashapp_username = body.cashapp_username?.trim() || null;
    if (body.paypal_username !== undefined) updates.paypal_username = body.paypal_username?.trim() || null;

    if (Object.keys(updates).length === 0) return json({ error: "No changes" }, { status: 400 });

    const { data: updated, error: updErr } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", profile_id)
      .select("id, display_name, email, venmo_username, cashapp_username, paypal_username")
      .single();
    if (updErr) return json({ error: updErr.message }, { status: 500 });

    return json({ profile: updated });
  } catch (e) {
    console.error("[update_placeholder_profile] error:", e);
    return json({ error: "Internal Error" }, { status: 500 });
  }
});

