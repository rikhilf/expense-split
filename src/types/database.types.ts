export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      expense_splits: {
        Row: {
          amount: number
          expense_id: string
          id: string
          share: number | null
          user_id: string
        }
        Insert: {
          amount: number
          expense_id: string
          id?: string
          share?: number | null
          user_id: string
        }
        Update: {
          amount?: number
          expense_id?: string
          id?: string
          share?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_user_id_fkey1"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string
          date: string
          description: string | null
          group_id: string
          id: string
          paid_by: string
          type: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by: string
          date: string
          description?: string | null
          group_id: string
          id?: string
          paid_by: string
          type?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string
          date?: string
          description?: string | null
          group_id?: string
          id?: string
          paid_by?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          expense_id: string | null
          group_id: string | null
          id: string
          original_filename: string | null
          parsed_amount: number | null
          parsed_due_date: string | null
          parsed_vendor: string | null
          processed_at: string | null
          raw_email: Json | null
          source: string | null
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          expense_id?: string | null
          group_id?: string | null
          id?: string
          original_filename?: string | null
          parsed_amount?: number | null
          parsed_due_date?: string | null
          parsed_vendor?: string | null
          processed_at?: string | null
          raw_email?: Json | null
          source?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          expense_id?: string | null
          group_id?: string | null
          id?: string
          original_filename?: string | null
          parsed_amount?: number | null
          parsed_due_date?: string | null
          parsed_vendor?: string | null
          processed_at?: string | null
          raw_email?: Json | null
          source?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          authenticated: boolean
          group_id: string
          id: string
          joined_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          authenticated?: boolean
          group_id: string
          id?: string
          joined_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          authenticated?: boolean
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          cashapp_username: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          paypal_username: string | null
          updated_at: string
          venmo_username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          cashapp_username?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          paypal_username?: string | null
          updated_at?: string
          venmo_username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          cashapp_username?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          paypal_username?: string | null
          updated_at?: string
          venmo_username?: string | null
        }
        Relationships: []
      }
      settlement_items: {
        Row: {
          amount: number
          expense_id: string
          expense_split_id: string | null
          id: string
          settlement_id: string
        }
        Insert: {
          amount: number
          expense_id: string
          expense_split_id?: string | null
          id?: string
          settlement_id: string
        }
        Update: {
          amount?: number
          expense_id?: string
          expense_split_id?: string | null
          id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_expense_split_id_fkey"
            columns: ["expense_split_id"]
            isOneToOne: false
            referencedRelation: "expense_splits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          mask_names: boolean
          revoked_at: string | null
          settlement_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          mask_names?: boolean
          revoked_at?: string | null
          settlement_id: string
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          mask_names?: boolean
          revoked_at?: string | null
          settlement_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_shares_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          idempotency_key: string | null
          initial_status: string
          note: string | null
          paid_by: string
          paid_to: string
          payment_date: string | null
          payment_method: string | null
          provider_reference: string | null
          settled_at: string | null
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          idempotency_key?: string | null
          initial_status?: string
          note?: string | null
          paid_by: string
          paid_to: string
          payment_date?: string | null
          payment_method?: string | null
          provider_reference?: string | null
          settled_at?: string | null
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          idempotency_key?: string | null
          initial_status?: string
          note?: string | null
          paid_by?: string
          paid_to?: string
          payment_date?: string | null
          payment_method?: string | null
          provider_reference?: string | null
          settled_at?: string | null
          status?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_paid_to_fkey"
            columns: ["paid_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_settlement: {
        Args: { p_settlement_id: string }
        Returns: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          idempotency_key: string | null
          initial_status: string
          note: string | null
          paid_by: string
          paid_to: string
          payment_date: string | null
          payment_method: string | null
          provider_reference: string | null
          settled_at: string | null
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_expense_with_splits: {
        Args: {
          p_amount: number
          p_date: string
          p_description: string
          p_group_id: string
          p_paid_by: string
          p_splits: Json
        }
        Returns: {
          amount: number
          created_at: string | null
          created_by: string
          date: string
          description: string | null
          group_id: string
          id: string
          paid_by: string
          type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_settlement: {
        Args: {
          p_amount: number
          p_group_id: string
          p_idempotency_key: string
          p_note: string
          p_paid_by: string
          p_paid_to: string
          p_payment_method: string
          p_status: string
        }
        Returns: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          idempotency_key: string | null
          initial_status: string
          note: string | null
          paid_by: string
          paid_to: string
          payment_date: string | null
          payment_method: string | null
          provider_reference: string | null
          settled_at: string | null
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_current_profile_id: { Args: never; Returns: string }
      get_group_balances: {
        Args: { p_group_id: string }
        Returns: {
          balance: number
          profile_id: string
        }[]
      }
      group_has_members: { Args: { gid: string }; Returns: boolean }
      is_caller_member_of_group: { Args: { gid: string }; Returns: boolean }
      is_group_admin: { Args: { gid: string }; Returns: boolean }
      is_member_of_group: { Args: { gid: string }; Returns: boolean }
      record_settlement: {
        Args: {
          p_amount: number
          p_group_id: string
          p_idempotency_key: string
          p_note: string
          p_paid_by: string
          p_paid_to: string
          p_payment_date: string
          p_payment_method: string
        }
        Returns: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          idempotency_key: string | null
          initial_status: string
          note: string | null
          paid_by: string
          paid_to: string
          payment_date: string | null
          payment_method: string | null
          provider_reference: string | null
          settled_at: string | null
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_expense_with_splits: {
        Args: {
          p_amount: number
          p_date: string
          p_description: string
          p_expense_id: string
          p_paid_by?: string
          p_splits: Json
        }
        Returns: {
          amount: number
          created_at: string | null
          created_by: string
          date: string
          description: string | null
          group_id: string
          id: string
          paid_by: string
          type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_is_group_admin: {
        Args: { groupid: string; userid: string }
        Returns: boolean
      }
      void_settlement: {
        Args: { p_note?: string; p_settlement_id: string }
        Returns: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          idempotency_key: string | null
          initial_status: string
          note: string | null
          paid_by: string
          paid_to: string
          payment_date: string | null
          payment_method: string | null
          provider_reference: string | null
          settled_at: string | null
          status: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settlements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      whoami: {
        Args: never
        Returns: {
          role: string
          uid: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
