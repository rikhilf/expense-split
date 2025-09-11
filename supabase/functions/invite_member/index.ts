// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// supabase/functions/invite_member/index.ts
//
// Adds a member to a group.
// - Auth: requires a valid user JWT in Authorization: Bearer <token>
// - Authorization:
//     * Any current member of the group can add a member with role 'member'
//     * Only current admins can assign role 'admin'
// - Invitee can be referenced by an existing profiles.id OR by email (creates placeholder profile)
// - Idempotent: if membership already exists, returns the existing membership
//
// Request JSON:
// {
//   "group_id": "uuid",
//   "role": "member" | "admin",           // optional, default "member"; "admin" requires caller admin
//   "profile_id": "uuid",                 // optional, if inviting an existing profile
//   "email": "user@example.com",          // optional, if creating / finding by email (ignored when profile_id present)
//   "display_name": "Optional Name"       // optional, when creating placeholder
// }
//
// Response JSON (200):
// {
//   "membership": { ... },
//   "profile": { ... },
//   "created": boolean,                   // true if membership was newly created
//   "placeholder_created": boolean        // true if a placeholder profile was created
// }
//
// Errors: 400 (bad input), 401 (unauthorized), 403 (forbidden), 409 (conflict), 500 (server)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
const conflict = (msg: string) => json({ error: msg }, { status: 409 });

function bearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

type Payload = {
  group_id?: string;
  role?: "member" | "admin";
  profile_id?: string;
  email?: string;
  display_name?: string;
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

    // Parse & validate input
    const body = (await req.json().catch(() => ({}))) as Payload;
    const group_id = body.group_id?.trim();
    if (!group_id) return badRequest("Missing 'group_id'");

    const requestedRole: "member" | "admin" = body.role || "member";

    // Resolve caller's profile (profiles.id) and membership in target group
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("id, auth_user_id, display_name, email, venmo_username, cashapp_username, paypal_username")
      .eq("auth_user_id", caller.id)
      .single();

    if (profErr || !callerProfile) return forbidden("Caller profile not found");

    const { data: callerMembership, error: membErr } = await admin
      .from("memberships")
      .select("role")
      .eq("group_id", group_id)
      .eq("user_id", callerProfile.id) // memberships.user_id -> profiles.id
      .maybeSingle();

    if (membErr) return json({ error: "Failed to check caller membership" }, { status: 500 });
    if (!callerMembership) return forbidden("Caller is not a member of this group");

    const callerIsAdmin = callerMembership.role === "admin";
    if (requestedRole === "admin" && !callerIsAdmin) {
      return forbidden("Only admins can grant admin role");
    }

    // Resolve target profile: by profile_id or by email (create placeholder if necessary)
    let targetProfile: { id: string; auth_user_id: string | null; display_name: string | null; email: string | null } | null = null;
    let placeholderCreated = false;

    if (body.profile_id) {
      const { data: p, error } = await admin
        .from("profiles")
        .select("id, auth_user_id, display_name, email, venmo_username, cashapp_username, paypal_username")
        .eq("id", body.profile_id)
        .single();
      if (error || !p) return badRequest("Invalid 'profile_id'");
      targetProfile = p;
    } else if (body.email) {
      // Try to find existing profile by email
      const email = body.email.trim().toLowerCase();
      const { data: p, error } = await admin
        .from("profiles")
        .select("id, auth_user_id, display_name, email, venmo_username, cashapp_username, paypal_username")
        .eq("email", email)
        .maybeSingle();

      if (error) return json({ error: "Failed to look up profile by email" }, { status: 500 });

      if (p) {
        targetProfile = p;
      } else {
        // Create placeholder profile (auth_user_id = NULL to satisfy RLS)
        const display_name =
          (body.display_name?.trim() || email.split("@")[0] || "New Member");

        const { data: inserted, error: insErr } = await admin
          .from("profiles")
          .insert({
            auth_user_id: null,            // IMPORTANT: placeholder
            display_name,
            email,
            avatar_url: null,
            venmo_username: null,
            cashapp_username: null,
            paypal_username: null,
          })
          .select("id, auth_user_id, display_name, email, venmo_username, cashapp_username, paypal_username")
          .single();

        if (insErr) return json({ error: "Failed to create placeholder profile" }, { status: 500 });

        targetProfile = inserted!;
        placeholderCreated = true;
      }
    } else {
      // Create a placeholder without email, using display_name only
      const display_name = (body.display_name?.trim() || "New Member");
      const { data: inserted, error: insErr } = await admin
        .from("profiles")
        .insert({
          auth_user_id: null,
          display_name,
          email: null,
          avatar_url: null,
          venmo_username: null,
          cashapp_username: null,
          paypal_username: null,
        })
        .select("id, auth_user_id, display_name, email, venmo_username, cashapp_username, paypal_username")
        .single();

      if (insErr || !inserted) return json({ error: "Failed to create placeholder profile" }, { status: 500 });
      targetProfile = inserted;
      placeholderCreated = true;
    }

    // Prevent duplicate membership
    const { data: existingMembership, error: existErr } = await admin
      .from("memberships")
      .select("*")
      .eq("group_id", group_id)
      .eq("user_id", targetProfile.id)
      .maybeSingle();

    if (existErr) return json({ error: "Failed to check existing membership" }, { status: 500 });

    if (existingMembership) {
      return json({
        membership: existingMembership,
        profile: targetProfile,
        created: false,
        placeholder_created: placeholderCreated,
        already_member: true,
      });
    }

    // Insert membership; authenticated = true if target profile is linked to an auth user
    const isAuthenticated = !!targetProfile.auth_user_id;
    const { data: membership, error: memErr } = await admin
      .from("memberships")
      .insert({
        group_id,
        user_id: targetProfile.id,   // profiles.id
        role: requestedRole,
        authenticated: isAuthenticated,
      })
      .select("*")
      .single();

    if (memErr) return json({ error: memErr.message }, { status: 500 });

    return json({
      membership,
      profile: targetProfile,
      created: true,
      placeholder_created: placeholderCreated,
    });
  } catch (e) {
    console.error("[invite_member] error:", e);
    return json({ error: "Internal Error" }, { status: 500 });
  }
});


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/invite_member' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
