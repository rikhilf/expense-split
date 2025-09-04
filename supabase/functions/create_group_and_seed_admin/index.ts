// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// supabase/functions/create_group_and_seed_admin/index.ts
// Creates a group and seeds the caller as the first admin membership.
//
// Auth: requires a valid user JWT in Authorization: Bearer <token>
// DB: uses the service role key to perform writes safely (bypasses RLS).
//
// Request JSON:
//   { "name": string }
// Response JSON:
//   { "group": { id, name, created_by, created_at }, "membership": { id, group_id, user_id, role, joined_at }, "profile": { id, auth_user_id, display_name, email, avatar_url } }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { User } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", ...cors },
    ...init,
  });
}

function badRequest(msg: string) {
  return json({ error: msg }, { status: 400 });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, { status: 401 });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice(7);
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") {
      return badRequest("Use POST with JSON: { name }");
    }

    const token = getBearerToken(req);
    if (!token) return unauthorized();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return unauthorized();

    const user: User = userRes.user;

    // Parse payload
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return badRequest("Missing or empty 'name'");

    // Ensure a profile exists for this auth user
    // Your memberships.user_id points at profiles.id (not auth.users.id)
    async function upsertProfileForAuthUser(u: User) {
      const { data: existing, error: selErr } = await admin
        .from("profiles")
        .select("*")
        .eq("auth_user_id", u.id)
        .maybeSingle();

      if (selErr) throw selErr;
      if (existing) return existing;

      const display =
        (u.user_metadata?.full_name as string) ||
        (u.email?.split("@")?.[0] ?? "User");

      const { data: inserted, error: insErr } = await admin
        .from("profiles")
        .insert({
          auth_user_id: u.id,
          display_name: display,
          email: u.email ?? null,
          avatar_url: (u.user_metadata?.avatar_url as string) ?? null,
        })
        .select("*")
        .single();

      if (insErr) throw insErr;
      return inserted;
    }

    const profile = await upsertProfileForAuthUser(user);

    // 1) Create the group (created_by uses auth.users.id)
    const { data: group, error: grpErr } = await admin
      .from("groups")
      .insert({ name, created_by: user.id })
      .select("*")
      .single();

    if (grpErr) throw grpErr;

    // 2) Seed first membership as admin (memberships.user_id uses profiles.id)
    const { data: membership, error: memErr } = await admin
      .from("memberships")
      .insert({
        user_id: profile.id,  // profiles.id
        group_id: group.id,
        role: "admin",
      })
      .select("*")
      .single();

    if (memErr) {
      // best-effort cleanup if membership insert fails
      await admin.from("groups").delete().eq("id", group.id);
      throw memErr;
    }

    return json({ group, membership, profile }, { status: 200 });
  } catch (e) {
    console.error("[create_group_and_seed_admin] error:", e);
    return json({ error: "Internal Error" }, { status: 500 });
  }
});


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create_group_and_seed_admin' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
