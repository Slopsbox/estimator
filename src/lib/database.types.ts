export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Midlertidig eksplisitt snapshot av de lokale 20260825-migrasjonene.
// Regenerer denne filen med Supabase CLI etter at migrasjonene er anvendt.

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      participants: {
        Row: {
          id: string
          joined_at: string
          left_at: string | null
          name: string
          role: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          id?: string
          joined_at?: string
          left_at?: string | null
          name: string
          role: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          id?: string
          joined_at?: string
          left_at?: string | null
          name?: string
          role?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          activity_type: string
          consensus_streak: number
          created_at: string
          current_round: number
          create_request_id: string | null
          facilitator_user_id: string | null
          id: string
          join_code: string | null
          started: boolean
          status: string
          votes_revealed: boolean
        }
        Insert: {
          activity_type?: string
          consensus_streak?: number
          created_at?: string
          current_round?: number
          create_request_id?: string | null
          facilitator_user_id?: string | null
          id?: string
          join_code?: string | null
          started?: boolean
          status?: string
          votes_revealed?: boolean
        }
        Update: {
          activity_type?: string
          consensus_streak?: number
          created_at?: string
          current_round?: number
          create_request_id?: string | null
          facilitator_user_id?: string | null
          id?: string
          join_code?: string | null
          started?: boolean
          status?: string
          votes_revealed?: boolean
        }
        Relationships: []
      }
      round_participants: {
        Row: {
          joined_at: string
          participant_id: string
          reestimate_used: boolean
          round: number
          session_id: string
        }
        Insert: {
          joined_at?: string
          participant_id: string
          reestimate_used?: boolean
          round: number
          session_id: string
        }
        Update: {
          joined_at?: string
          participant_id?: string
          reestimate_used?: boolean
          round?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_participants_session_participant_fkey"
            columns: ["session_id", "participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["session_id", "id"]
          },
        ]
      }
      votes: {
        Row: {
          created_at: string
          id: string
          participant_id: string
          round: number
          session_id: string
          size: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_id: string
          round: number
          session_id: string
          size: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_id?: string
          round?: number
          session_id?: string
          size?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cast_vote: {
        Args: { p_round: number; p_session_id: string; p_size: string; p_value: string }
        Returns: Json
      }
      claim_round: { Args: { p_session_id: string }; Returns: Json }
      create_session: {
        Args: { p_facilitator_name: string; p_request_id: string }
        Returns: Json
      }
      create_health_check_room_prototype: {
        Args: {
          p_delivery_id: string
          p_facilitator_name: string
          p_measurement_date: string
          p_request_id: string
          p_squad_name: string
        }
        Returns: Json
      }
      finalize_health_check_prototype: { Args: { p_room_id: string }; Returns: Json }
      get_round_vote_statuses: { Args: { p_round: number; p_session_id: string }; Returns: Json }
      end_session: { Args: { p_session_id: string }; Returns: Json }
      join_session: { Args: { p_join_code: string; p_name: string }; Returns: Json }
      leave_session: { Args: { p_session_id: string }; Returns: Json }
      next_round: { Args: { p_session_id: string }; Returns: Json }
      restore_session: { Args: { p_session_id: string }; Returns: Json }
      retract_vote: { Args: { p_round: number; p_session_id: string }; Returns: Json }
      reveal_votes: { Args: { p_session_id: string }; Returns: Json }
      start_session: { Args: { p_session_id: string }; Returns: Json }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
