import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// supabase/functions/update_expense/index.ts
// Updates an expense and replaces its splits.
//
// Auth: requires a valid user JWT in Authorization: Bearer <token>
// DB: uses the service role key after enforcing caller permissions.
//
// Request JSON:
//   {
//     "expense_id": string,
//     "description": string,
//     "amount": number,
//     "date": "YYYY-MM-DD",
//     "split_mode": "equal" | "shares",
//     "participant_ids": string[],
//     "shares"?: { "user_id": string, "share": number }[]
//   }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { User } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type SplitMode = "equal" | "shares";

type ShareInput = {
  user_id?: unknown;
  userId?: unknown;
  share?: unknown;
};

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

function forbidden(msg = "Forbidden") {
  return json({ error: msg }, { status: 403 });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, { status: 401 });
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  return h.slice(7);
}

function isUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDateString(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getOrCreateProfileForAuthUser(admin: ReturnType<typeof createClient>, user: User) {
  const { data: existing, error: selectError } = await admin
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.email?.split("@")?.[0] ?? "User");

  const { data: inserted, error: insertError } = await admin
    .from("profiles")
    .insert({
      auth_user_id: user.id,
      display_name: displayName,
      email: user.email ?? null,
      avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      venmo_username: null,
      cashapp_username: null,
      paypal_username: null,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return inserted;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") {
      return badRequest("Use POST with an expense update payload");
    }

    const token = getBearerToken(req);
    if (!token) return unauthorized();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return unauthorized();

    const profile = await getOrCreateProfileForAuthUser(admin, userRes.user);
    const body = await req.json().catch(() => ({}));

    const expenseId = body?.expense_id;
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const amount = typeof body?.amount === "number" ? body.amount : Number(body?.amount);
    const date = body?.date;
    const splitMode = body?.split_mode as SplitMode;
    const participantIds = Array.isArray(body?.participant_ids) ? body.participant_ids : [];
    const shares = Array.isArray(body?.shares) ? body.shares as ShareInput[] : [];

    if (!isUuid(expenseId)) return badRequest("Missing or invalid expense_id");
    if (!description) return badRequest("Missing or empty description");
    if (!Number.isFinite(amount) || amount <= 0) return badRequest("Amount must be greater than zero");
    if (!isDateString(date)) return badRequest("Date must use YYYY-MM-DD");
    if (splitMode !== "equal" && splitMode !== "shares") return badRequest("Invalid split_mode");
    if (participantIds.length === 0 || !participantIds.every(isUuid)) {
      return badRequest("At least one valid participant is required");
    }

    const uniqueParticipantIds = [...new Set(participantIds as string[])];

    const { data: expense, error: expenseError } = await admin
      .from("expenses")
      .select("id, group_id, created_by")
      .eq("id", expenseId)
      .maybeSingle();

    if (expenseError) throw expenseError;
    if (!expense) return json({ error: "Expense not found" }, { status: 404 });

    const { data: group, error: groupError } = await admin
      .from("groups")
      .select("id, created_by")
      .eq("id", expense.group_id)
      .maybeSingle();

    if (groupError) throw groupError;
    if (!group) return json({ error: "Group not found" }, { status: 404 });

    const { data: callerMembership, error: callerMembershipError } = await admin
      .from("memberships")
      .select("role")
      .eq("group_id", expense.group_id)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (callerMembershipError) throw callerMembershipError;

    const canEdit =
      expense.created_by === profile.id ||
      group.created_by === profile.id ||
      callerMembership?.role === "admin";

    if (!canEdit) return forbidden("Only the expense creator or a group admin can edit this expense");

    const { data: participantMemberships, error: participantMembershipsError } = await admin
      .from("memberships")
      .select("user_id")
      .eq("group_id", expense.group_id)
      .in("user_id", uniqueParticipantIds);

    if (participantMembershipsError) throw participantMembershipsError;

    const validParticipantIds = new Set((participantMemberships ?? []).map((m) => m.user_id));
    if (validParticipantIds.size !== uniqueParticipantIds.length) {
      return badRequest("All participants must be members of the expense group");
    }

    const splits = [];

    if (splitMode === "equal") {
      const memberCount = uniqueParticipantIds.length;
      const share = 1 / memberCount;
      const splitAmount = amount / memberCount;
      for (const userId of uniqueParticipantIds) {
        splits.push({ user_id: userId, share, amount: splitAmount });
      }
    } else {
      if (shares.length === 0) return badRequest("Custom shares are required");

      const normalizedShares = shares.map((share) => ({
        user_id: typeof share.user_id === "string" ? share.user_id : share.userId,
        share: typeof share.share === "number" ? share.share : Number(share.share),
      }));

      if (!normalizedShares.every((share) => isUuid(share.user_id) && Number.isFinite(share.share) && share.share > 0)) {
        return badRequest("Each custom share must include a valid user_id and positive share");
      }

      const participantSet = new Set(uniqueParticipantIds);
      const shareUserIds = normalizedShares.map((share) => share.user_id as string);
      const shareUserSet = new Set(shareUserIds);
      if (
        shareUserSet.size !== uniqueParticipantIds.length ||
        !shareUserIds.every((userId) => participantSet.has(userId))
      ) {
        return badRequest("Custom shares must match selected participants");
      }

      const totalShares = normalizedShares.reduce((sum, share) => sum + share.share, 0);
      if (totalShares <= 0) return badRequest("Total shares must be greater than zero");

      for (const share of normalizedShares) {
        const ratio = share.share / totalShares;
        splits.push({
          user_id: share.user_id,
          share: ratio,
          amount: ratio * amount,
        });
      }
    }

    const { data: updatedExpense, error: updateError } = await admin.rpc(
      "update_expense_with_splits",
      {
        p_expense_id: expenseId,
        p_description: description,
        p_amount: amount,
        p_date: date,
        p_splits: splits,
      },
    );

    if (updateError) throw updateError;

    return json({ expense: updatedExpense }, { status: 200 });
  } catch (e) {
    console.error("[update_expense] error:", e);
    return json({ error: "Internal Error" }, { status: 500 });
  }
});
