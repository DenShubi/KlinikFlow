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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      doctors: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          profile_id: string | null
          room: string | null
          ticket_prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          profile_id?: string | null
          room?: string | null
          ticket_prefix: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          profile_id?: string | null
          room?: string | null
          ticket_prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          provider_message_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          ticket_id: string
          to_phone: string
        }
        Insert: {
          body: string
          created_at?: string
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          ticket_id: string
          to_phone: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          ticket_id?: string
          to_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "queue_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          birth_date: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      queue_events: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          event_type: Database["public"]["Enums"]["queue_event_type"]
          id: number
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type: Database["public"]["Enums"]["queue_event_type"]
          id?: never
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type?: Database["public"]["Enums"]["queue_event_type"]
          id?: never
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "queue_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_tickets: {
        Row: {
          actual_minutes: number | null
          ai_summary: string | null
          called_at: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at: string | null
          complaint: string
          created_at: string
          created_by: string | null
          defer_count: number
          doctor_id: string
          ended_at: string | null
          estimated_call_at: string | null
          id: string
          is_follow_up: boolean
          patient_id: string
          position: number
          predicted_minutes: number | null
          prediction_confidence: number | null
          prediction_model: string | null
          prediction_source:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date: string
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: number
          updated_at: string
        }
        Insert: {
          actual_minutes?: number | null
          ai_summary?: string | null
          called_at?: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at?: string | null
          complaint: string
          created_at?: string
          created_by?: string | null
          defer_count?: number
          doctor_id: string
          ended_at?: string | null
          estimated_call_at?: string | null
          id?: string
          is_follow_up?: boolean
          patient_id: string
          position: number
          predicted_minutes?: number | null
          prediction_confidence?: number | null
          prediction_model?: string | null
          prediction_source?:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number: number
          updated_at?: string
        }
        Update: {
          actual_minutes?: number | null
          ai_summary?: string | null
          called_at?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at?: string | null
          complaint?: string
          created_at?: string
          created_by?: string | null
          defer_count?: number
          doctor_id?: string
          ended_at?: string | null
          estimated_call_at?: string | null
          id?: string
          is_follow_up?: boolean
          patient_id?: string
          position?: number
          predicted_minutes?: number | null
          prediction_confidence?: number | null
          prediction_model?: string | null
          prediction_source?:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_tickets_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_tickets_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clinic_today: { Args: never; Returns: string }
      queue_call_next: {
        Args: { p_doctor_id: string; p_service_date?: string }
        Returns: {
          actual_minutes: number | null
          ai_summary: string | null
          called_at: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at: string | null
          complaint: string
          created_at: string
          created_by: string | null
          defer_count: number
          doctor_id: string
          ended_at: string | null
          estimated_call_at: string | null
          id: string
          is_follow_up: boolean
          patient_id: string
          position: number
          predicted_minutes: number | null
          prediction_confidence: number | null
          prediction_model: string | null
          prediction_source:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date: string
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "queue_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_cancel_ticket: {
        Args: { p_reason?: string; p_ticket_id: string }
        Returns: {
          actual_minutes: number | null
          ai_summary: string | null
          called_at: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at: string | null
          complaint: string
          created_at: string
          created_by: string | null
          defer_count: number
          doctor_id: string
          ended_at: string | null
          estimated_call_at: string | null
          id: string
          is_follow_up: boolean
          patient_id: string
          position: number
          predicted_minutes: number | null
          prediction_confidence: number | null
          prediction_model: string | null
          prediction_source:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date: string
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "queue_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_check_in: {
        Args: { p_ticket_id: string }
        Returns: {
          actual_minutes: number | null
          ai_summary: string | null
          called_at: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at: string | null
          complaint: string
          created_at: string
          created_by: string | null
          defer_count: number
          doctor_id: string
          ended_at: string | null
          estimated_call_at: string | null
          id: string
          is_follow_up: boolean
          patient_id: string
          position: number
          predicted_minutes: number | null
          prediction_confidence: number | null
          prediction_model: string | null
          prediction_source:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date: string
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "queue_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_create_ticket: {
        Args: {
          p_ai_summary?: string
          p_channel: Database["public"]["Enums"]["ticket_channel"]
          p_complaint: string
          p_doctor_id: string
          p_is_follow_up?: boolean
          p_patient_id: string
          p_predicted_minutes?: number
          p_prediction_confidence?: number
          p_prediction_model?: string
          p_prediction_source?: Database["public"]["Enums"]["prediction_source"]
          p_service_date?: string
        }
        Returns: {
          actual_minutes: number | null
          ai_summary: string | null
          called_at: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at: string | null
          complaint: string
          created_at: string
          created_by: string | null
          defer_count: number
          doctor_id: string
          ended_at: string | null
          estimated_call_at: string | null
          id: string
          is_follow_up: boolean
          patient_id: string
          position: number
          predicted_minutes: number | null
          prediction_confidence: number | null
          prediction_model: string | null
          prediction_source:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date: string
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "queue_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_finish_consultation: {
        Args: { p_ticket_id: string }
        Returns: {
          actual_minutes: number | null
          ai_summary: string | null
          called_at: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at: string | null
          complaint: string
          created_at: string
          created_by: string | null
          defer_count: number
          doctor_id: string
          ended_at: string | null
          estimated_call_at: string | null
          id: string
          is_follow_up: boolean
          patient_id: string
          position: number
          predicted_minutes: number | null
          prediction_confidence: number | null
          prediction_model: string | null
          prediction_source:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date: string
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "queue_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_start_consultation: {
        Args: { p_ticket_id: string }
        Returns: {
          actual_minutes: number | null
          ai_summary: string | null
          called_at: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          checked_in_at: string | null
          complaint: string
          created_at: string
          created_by: string | null
          defer_count: number
          doctor_id: string
          ended_at: string | null
          estimated_call_at: string | null
          id: string
          is_follow_up: boolean
          patient_id: string
          position: number
          predicted_minutes: number | null
          prediction_confidence: number | null
          prediction_model: string | null
          prediction_source:
            | Database["public"]["Enums"]["prediction_source"]
            | null
          service_date: string
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "queue_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ticket_public_status: { Args: { p_ticket_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "receptionist" | "doctor"
      notification_kind: "visit_time_update" | "three_turns_alert"
      notification_status: "pending" | "sent" | "failed" | "skipped"
      prediction_source: "ai" | "fallback"
      queue_event_type:
        | "created"
        | "checked_in"
        | "called"
        | "consultation_started"
        | "consultation_ended"
        | "deferred"
        | "estimate_updated"
        | "cancelled"
        | "no_show"
      ticket_channel: "walk_in" | "remote"
      ticket_status:
        | "waiting"
        | "called"
        | "in_consultation"
        | "done"
        | "cancelled"
        | "no_show"
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
    Enums: {
      app_role: ["receptionist", "doctor"],
      notification_kind: ["visit_time_update", "three_turns_alert"],
      notification_status: ["pending", "sent", "failed", "skipped"],
      prediction_source: ["ai", "fallback"],
      queue_event_type: [
        "created",
        "checked_in",
        "called",
        "consultation_started",
        "consultation_ended",
        "deferred",
        "estimate_updated",
        "cancelled",
        "no_show",
      ],
      ticket_channel: ["walk_in", "remote"],
      ticket_status: [
        "waiting",
        "called",
        "in_consultation",
        "done",
        "cancelled",
        "no_show",
      ],
    },
  },
} as const
