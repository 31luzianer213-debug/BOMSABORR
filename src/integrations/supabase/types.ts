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
      ai_settings: {
        Row: {
          greeting: string
          handoff_keywords: string[]
          id: string
          is_enabled: boolean
          system_prompt: string
          updated_at: string
        }
        Insert: {
          greeting?: string
          handoff_keywords?: string[]
          id?: string
          is_enabled?: boolean
          system_prompt?: string
          updated_at?: string
        }
        Update: {
          greeting?: string
          handoff_keywords?: string[]
          id?: string
          is_enabled?: boolean
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          price_f: number | null
          price_g: number | null
          price_m: number | null
          price_p: number | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name: string
          price_f?: number | null
          price_g?: number | null
          price_m?: number | null
          price_p?: number | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          price_f?: number | null
          price_g?: number | null
          price_m?: number | null
          price_p?: number | null
          sort_order?: number
        }
        Relationships: []
      }
      courier_locations: {
        Row: {
          accuracy: number | null
          courier_id: string
          created_at: string
          id: string
          lat: number
          lng: number
        }
        Insert: {
          accuracy?: number | null
          courier_id: string
          created_at?: string
          id?: string
          lat: number
          lng: number
        }
        Update: {
          accuracy?: number | null
          courier_id?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
        }
        Relationships: [
          {
            foreignKeyName: "courier_locations_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          active: boolean
          created_at: string
          fee_per_delivery: number
          id: string
          name: string
          pay_amount: number
          pay_type: string
          phone: string
          share_token: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          fee_per_delivery?: number
          id?: string
          name: string
          pay_amount?: number
          pay_type?: string
          phone?: string
          share_token?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          fee_per_delivery?: number
          id?: string
          name?: string
          pay_amount?: number
          pay_type?: string
          phone?: string
          share_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          active: boolean
          created_at: string
          fee: number
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          fee?: number
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          fee?: number
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string
          change_for: number | null
          code: string
          courier_fee: number
          courier_id: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_fee: number
          dispatched_at: string | null
          id: string
          items: Json
          neighborhood: string
          notes: string
          order_type: string
          payment_method: string
          source_external_id: string | null
          status: string
          subtotal: number
          total: number
          track_token: string
          updated_at: string
          whatsapp_sent: boolean
        }
        Insert: {
          address?: string
          change_for?: number | null
          code?: string
          courier_fee?: number
          courier_id?: string | null
          created_at?: string
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_fee?: number
          dispatched_at?: string | null
          id?: string
          items?: Json
          neighborhood?: string
          notes?: string
          order_type?: string
          payment_method?: string
          source_external_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          track_token?: string
          updated_at?: string
          whatsapp_sent?: boolean
        }
        Update: {
          address?: string
          change_for?: number | null
          code?: string
          courier_fee?: number
          courier_id?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_fee?: number
          dispatched_at?: string | null
          id?: string
          items?: Json
          neighborhood?: string
          notes?: string
          order_type?: string
          payment_method?: string
          source_external_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          track_token?: string
          updated_at?: string
          whatsapp_sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          description: string
          id: string
          name: string
          price: number | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          description?: string
          id?: string
          name: string
          price?: number | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          price?: number | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string
          allow_delivery: boolean
          allow_half_half: boolean
          allow_pickup: boolean
          flat_delivery_fee: number
          id: string
          is_open: boolean
          min_order: number
          notify_customer: boolean
          notify_store: boolean
          opening_hours: string
          pay_card: boolean
          pay_cash: boolean
          pay_pix: boolean
          pix_key: string
          pix_name: string
          store_name: string
          store_whatsapp: string
          tagline: string
          updated_at: string
          use_flat_fee: boolean
        }
        Insert: {
          address?: string
          allow_delivery?: boolean
          allow_half_half?: boolean
          allow_pickup?: boolean
          flat_delivery_fee?: number
          id?: string
          is_open?: boolean
          min_order?: number
          notify_customer?: boolean
          notify_store?: boolean
          opening_hours?: string
          pay_card?: boolean
          pay_cash?: boolean
          pay_pix?: boolean
          pix_key?: string
          pix_name?: string
          store_name?: string
          store_whatsapp?: string
          tagline?: string
          updated_at?: string
          use_flat_fee?: boolean
        }
        Update: {
          address?: string
          allow_delivery?: boolean
          allow_half_half?: boolean
          allow_pickup?: boolean
          flat_delivery_fee?: number
          id?: string
          is_open?: boolean
          min_order?: number
          notify_customer?: boolean
          notify_store?: boolean
          opening_hours?: string
          pay_card?: boolean
          pay_cash?: boolean
          pay_pix?: boolean
          pix_key?: string
          pix_name?: string
          store_name?: string
          store_whatsapp?: string
          tagline?: string
          updated_at?: string
          use_flat_fee?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wa_conversations: {
        Row: {
          bot_paused: boolean
          created_at: string
          customer_name: string | null
          id: string
          last_message_at: string
          last_message_preview: string | null
          phone: string
          processing: boolean
          processing_started_at: string | null
          status: string
        }
        Insert: {
          bot_paused?: boolean
          created_at?: string
          customer_name?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          phone: string
          processing?: boolean
          processing_started_at?: string | null
          status?: string
        }
        Update: {
          bot_paused?: boolean
          created_at?: string
          customer_name?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          phone?: string
          processing?: boolean
          processing_started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      wa_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          direction: string
          external_id: string | null
          id: string
          webhook_status: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          webhook_status?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          webhook_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_wa_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      release_wa_conversation: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
