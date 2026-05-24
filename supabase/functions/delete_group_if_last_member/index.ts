// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// supabase/functions/delete_group_if_last_member/index.ts
//
// Removes the caller's membership in a group. If the caller is the last
// authenticated member, deletes the group (and cascades all related data).
//
// Auth: requires a valid user JWT in Authorization: Bearer <token>
// DB: uses the service role key to perform writes safely (bypasses RLS).
//
// Request JSON:
//   { "group_id": "uuid" }
// Response JSON:
//   { "deleted_group": boolean }

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
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", ...cors },
    ...init,
  });

const badRequest = (msg: string) => json({ error: msg }, { status: 400 });
const unauthorized = () => json({ error: "Unauthorized" }, { status: 401 });
const forbidden = (msg = "Forbidden") => json({ error: msg }, { status: 403 });

function bearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

type Payload = {
  group_id?: string;
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") return badRequest("Use POST with JSON body");

    const token = bearer(req);
    if (!token) return unauthorized();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller
    const { data: authRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !authRes?.user) return unauthorized();
    const caller: User = authRes.user;

    const body = (await req.json().catch(() => ({}))) as Payload;
    const group_id = body.group_id?.trim();
    if (!group_id) return badRequest("Missing 'group_id'");

    // Resolve caller profile
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("id")
      .eq("auth_user_id", caller.id)
      .single();

    if (profErr || !callerProfile) return forbidden("Caller profile not found");

    // Verify membership
    const { data: membership, error: membershipErr } = await admin
      .from("memberships")
      .select("id, authenticated")
      .eq("group_id", group_id)
      .eq("user_id", callerProfile.id)
      .maybeSingle();

    if (membershipErr) {
      return json({ error: "Failed to check membership" }, { status: 500 });
    }

    if (!membership) return forbidden("Caller is not a member of this group");

    // Count authenticated members to avoid client-side race conditions
    const { count, error: countErr } = await admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("group_id", group_id)
      .eq("authenticated", true);

    if (countErr) {
      return json({ error: "Failed to count authenticated members" }, { status: 500 });
    }

    const authenticatedCount = count ?? 0;
    const shouldDeleteGroup = membership.authenticated && authenticatedCount === 1;

    if (shouldDeleteGroup) {
      const { error: deleteGroupErr } = await admin
        .from("groups")
        .delete()
        .eq("id", group_id);

      if (deleteGroupErr) {
        return json({ error: "Failed to delete group" }, { status: 500 });
      }

      return json({ deleted_group: true }, { status: 200 });
    }

    // Remove the caller's splits from this group before deleting membership
    const { data: groupExpenses, error: expensesError } = await admin
      .from("expenses")
      .select("id")
      .eq("group_id", group_id);

    if (expensesError) {
      return json({ error: "Failed to look up group expenses" }, { status: 500 });
    }

    const expenseIds = (groupExpenses ?? []).map((expense) => expense.id);
    if (expenseIds.length > 0) {
      const { error: deleteSplitsError } = await admin
        .from("expense_splits")
        .delete()
        .eq("user_id", callerProfile.id)
        .in("expense_id", expenseIds);

      if (deleteSplitsError) {
        return json({ error: "Failed to remove member splits" }, { status: 500 });
      }
    }

    const { error: deleteMembershipErr } = await admin
      .from("memberships")
      .delete()
      .eq("id", membership.id);

    if (deleteMembershipErr) {
      return json({ error: "Failed to remove membership" }, { status: 500 });
    }

    return json({ deleted_group: false }, { status: 200 });
  } catch (e) {
    console.error("[delete_group_if_last_member] error:", e);
    return json({ error: "Internal Error" }, { status: 500 });
  }
});
