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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          order_id: string | null
          restaurant_id: string
        }
        Insert: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          order_id?: string | null
          restaurant_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          order_id?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_alerts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          options: Json
          product_id: string
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          options?: Json
          product_id: string
          product_name: string
          quantity?: number
          unit_price: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          options?: Json
          product_id?: string
          product_name?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          order_type: string
          restaurant_id: string | null
          session_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_type?: string
          restaurant_id?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_type?: string
          restaurant_id?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          is_visible_to_client: boolean
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          is_visible_to_client?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          is_visible_to_client?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          order_id: string
          sender_id: string
          sender_type: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          order_id: string
          sender_id: string
          sender_type: string
          target_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          order_id?: string
          sender_id?: string
          sender_type?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          created_at: string
          id: string
          processed_at: string | null
          requested_at: string
          status: string
          user_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          user_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_assignments: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivery_order: number
          driver_id: string
          id: string
          order_id: string
          picked_up_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivery_order?: number
          driver_id: string
          id?: string
          order_id: string
          picked_up_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivery_order?: number
          driver_id?: string
          id?: string
          order_id?: string
          picked_up_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "delivery_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_drivers: {
        Row: {
          auth_user_id: string | null
          can_deliver: boolean
          can_serve: boolean
          created_at: string
          driver_code: string
          email: string | null
          full_name: string
          id: string
          internal_rating: number | null
          is_active: boolean
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          can_deliver?: boolean
          can_serve?: boolean
          created_at?: string
          driver_code: string
          email?: string | null
          full_name: string
          id?: string
          internal_rating?: number | null
          is_active?: boolean
          phone?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          can_deliver?: boolean
          can_serve?: boolean
          created_at?: string
          driver_code?: string
          email?: string | null
          full_name?: string
          id?: string
          internal_rating?: number | null
          is_active?: boolean
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_drivers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_drivers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_settings: {
        Row: {
          delivery_paused: boolean
          id: string
          paused_at: string | null
          paused_until: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          delivery_paused?: boolean
          id?: string
          paused_at?: string | null
          paused_until?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          delivery_paused?: boolean
          id?: string
          paused_at?: string | null
          paused_until?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
          updated_at: string
        }
        Insert: {
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
          updated_at?: string
        }
        Update: {
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "delivery_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_sessions: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          restaurant_id: string
          session_token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          restaurant_id: string
          session_token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          restaurant_id?: string
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      eta_learning: {
        Row: {
          avg_announced_eta: number
          avg_real_duration: number
          correction_margin: number
          created_at: string
          id: string
          restaurant_id: string
          total_orders: number
          week_start: string
        }
        Insert: {
          avg_announced_eta?: number
          avg_real_duration?: number
          correction_margin?: number
          created_at?: string
          id?: string
          restaurant_id: string
          total_orders?: number
          week_start: string
        }
        Update: {
          avg_announced_eta?: number
          avg_real_duration?: number
          correction_margin?: number
          created_at?: string
          id?: string
          restaurant_id?: string
          total_orders?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "eta_learning_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eta_learning_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_progress: {
        Row: {
          hidden_score: number
          id: string
          reward_available: boolean
          reward_claimed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          hidden_score?: number
          id?: string
          reward_available?: boolean
          reward_claimed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          hidden_score?: number
          id?: string
          reward_available?: boolean
          reward_claimed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      order_item_choices: {
        Row: {
          created_at: string
          id: string
          option_name: string
          order_item_id: string
          price_supplement: number
        }
        Insert: {
          created_at?: string
          id?: string
          option_name: string
          order_item_id: string
          price_supplement?: number
        }
        Update: {
          created_at?: string
          id?: string
          option_name?: string
          order_item_id?: string
          price_supplement?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_choices_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          product_name: string
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          cash_details: Json | null
          client_phone: string | null
          created_at: string
          delivery_address: string | null
          delivery_code: string | null
          delivery_postcode: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          estimated_delivery_at: string | null
          eta_confidence: string
          guest_session_id: string
          id: string
          note: string | null
          order_number: number
          order_source: string
          order_type: string
          payment_method: string | null
          payment_status: string
          ready_at: string | null
          restaurant_id: string
          scheduled_at: string | null
          status: string
          subtotal: number
          table_number: number | null
          total: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          cash_details?: Json | null
          client_phone?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_code?: string | null
          delivery_postcode?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          estimated_delivery_at?: string | null
          eta_confidence?: string
          guest_session_id: string
          id?: string
          note?: string | null
          order_number: number
          order_source?: string
          order_type?: string
          payment_method?: string | null
          payment_status?: string
          ready_at?: string | null
          restaurant_id: string
          scheduled_at?: string | null
          status?: string
          subtotal?: number
          table_number?: number | null
          total?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          cash_details?: Json | null
          client_phone?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_code?: string | null
          delivery_postcode?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          estimated_delivery_at?: string | null
          eta_confidence?: string
          guest_session_id?: string
          id?: string
          note?: string | null
          order_number?: number
          order_source?: string
          order_type?: string
          payment_method?: string | null
          payment_status?: string
          ready_at?: string | null
          restaurant_id?: string
          scheduled_at?: string | null
          status?: string
          subtotal?: number
          table_number?: number | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          created_at: string
          free_count: number
          group_price: number | null
          id: string
          is_menu_only: boolean
          is_required: boolean
          linked_category_id: string | null
          max_selections: number
          min_selections: number
          name: string
          pricing_mode: string
          product_id: string
          selection_type: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          free_count?: number
          group_price?: number | null
          id?: string
          is_menu_only?: boolean
          is_required?: boolean
          linked_category_id?: string | null
          max_selections?: number
          min_selections?: number
          name: string
          pricing_mode?: string
          product_id: string
          selection_type?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          free_count?: number
          group_price?: number | null
          id?: string
          is_menu_only?: boolean
          is_required?: boolean
          linked_category_id?: string | null
          max_selections?: number
          min_selections?: number
          name?: string
          pricing_mode?: string
          product_id?: string
          selection_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_linked_category_id_fkey"
            columns: ["linked_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          name: string
          option_group_id: string | null
          price_supplement: number
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          name: string
          option_group_id?: string | null
          price_supplement?: number
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          name?: string
          option_group_id?: string | null
          price_supplement?: number
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_options_option_group_id_fkey"
            columns: ["option_group_id"]
            isOneToOne: false
            referencedRelation: "product_option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          is_featured: boolean
          is_published: boolean
          weekend_only: boolean
          menu_label: string | null
          menu_supplement: number | null
          name: string
          price: number
          sort_order: number
          stock: number | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          is_published?: boolean
          weekend_only?: boolean
          menu_label?: string | null
          menu_supplement?: number | null
          name: string
          price: number
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          is_published?: boolean
          weekend_only?: boolean
          menu_label?: string | null
          menu_supplement?: number | null
          name?: string
          price?: number
          sort_order?: number
          stock?: number | null
          updated_at?: string
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
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          restaurant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          restaurant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          restaurant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_amount: number | null
          restaurant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number | null
          restaurant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_delivery_postcode_rates: {
        Row: {
          created_at: string
          fee: number
          id: string
          is_active: boolean
          locality: string
          postcode: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee: number
          id?: string
          is_active?: boolean
          locality?: string
          postcode: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee?: number
          id?: string
          is_active?: boolean
          locality?: string
          postcode?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_delivery_postcode_rates_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          created_at: string
          email: string
          id: string
          message: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          accepted_payments: string[]
          address: string | null
          avg_delivery_time: number | null
          avg_prep_time: number | null
          company_address: string | null
          company_email: string | null
          company_name: string | null
          company_phone: string | null
          created_at: string
          cuisine_categories: string[]
          cuisine_type: string | null
          default_driver_id: string | null
          delivery_flat_fee: number
          delivery_free_under_km: number | null
          delivery_mode: string
          delivery_per_km_fee: number
          digital_menu_enabled: boolean
          phone_delivery_fallback_fee: number
          description: string | null
          dine_in_enabled: boolean
          halal_type: string
          id: string
          image_url: string | null
          is_free_delivery: boolean | null
          is_open: boolean
          is_paused: boolean
          is_top_rated: boolean | null
          is_visible: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          max_delivery_radius_km: number
          minimum_order: number | null
          name: string
          opening_hours: Json
          rating: number | null
          scheduling_mode: string
          slug: string
          takeaway_discount: number
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          accepted_payments?: string[]
          address?: string | null
          avg_delivery_time?: number | null
          avg_prep_time?: number | null
          company_address?: string | null
          company_email?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          cuisine_categories?: string[]
          cuisine_type?: string | null
          default_driver_id?: string | null
          delivery_flat_fee?: number
          delivery_free_under_km?: number | null
          delivery_mode?: string
          delivery_per_km_fee?: number
          digital_menu_enabled?: boolean
          phone_delivery_fallback_fee?: number
          description?: string | null
          dine_in_enabled?: boolean
          halal_type?: string
          id?: string
          image_url?: string | null
          is_free_delivery?: boolean | null
          is_open?: boolean
          is_paused?: boolean
          is_top_rated?: boolean | null
          is_visible?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_delivery_radius_km?: number
          minimum_order?: number | null
          name: string
          opening_hours?: Json
          rating?: number | null
          scheduling_mode?: string
          slug: string
          takeaway_discount?: number
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          accepted_payments?: string[]
          address?: string | null
          avg_delivery_time?: number | null
          avg_prep_time?: number | null
          company_address?: string | null
          company_email?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          cuisine_categories?: string[]
          cuisine_type?: string | null
          default_driver_id?: string | null
          delivery_flat_fee?: number
          delivery_free_under_km?: number | null
          delivery_mode?: string
          delivery_per_km_fee?: number
          digital_menu_enabled?: boolean
          phone_delivery_fallback_fee?: number
          description?: string | null
          dine_in_enabled?: boolean
          halal_type?: string
          id?: string
          image_url?: string | null
          is_free_delivery?: boolean | null
          is_open?: boolean
          is_paused?: boolean
          is_top_rated?: boolean | null
          is_visible?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_delivery_radius_km?: number
          minimum_order?: number | null
          name?: string
          opening_hours?: Json
          rating?: number | null
          scheduling_mode?: string
          slug?: string
          takeaway_discount?: number
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      totp_secrets: {
        Row: {
          created_at: string
          encrypted_secret: string
          id: string
          is_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_secret: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_secret?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_restaurants: {
        Row: {
          accepted_payments: string[] | null
          address: string | null
          avg_delivery_time: number | null
          avg_prep_time: number | null
          cuisine_categories: string[] | null
          cuisine_type: string | null
          delivery_flat_fee: number | null
          delivery_free_under_km: number | null
          delivery_mode: string | null
          delivery_per_km_fee: number | null
          description: string | null
          dine_in_enabled: boolean | null
          digital_menu_enabled: boolean | null
          halal_type: string | null
          id: string | null
          image_url: string | null
          is_free_delivery: boolean | null
          is_open: boolean | null
          is_paused: boolean | null
          is_top_rated: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          max_delivery_radius_km: number | null
          minimum_order: number | null
          name: string | null
          opening_hours: Json | null
          rating: number | null
          scheduling_mode: string | null
          slug: string | null
          takeaway_discount: number | null
        }
        Insert: {
          accepted_payments?: string[] | null
          address?: string | null
          avg_delivery_time?: number | null
          avg_prep_time?: number | null
          cuisine_categories?: string[] | null
          cuisine_type?: string | null
          delivery_flat_fee?: number | null
          delivery_free_under_km?: number | null
          delivery_mode?: string | null
          delivery_per_km_fee?: number | null
          description?: string | null
          dine_in_enabled?: boolean | null
          digital_menu_enabled?: boolean | null
          halal_type?: string | null
          id?: string | null
          image_url?: string | null
          is_free_delivery?: boolean | null
          is_open?: boolean | null
          is_paused?: boolean | null
          is_top_rated?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_delivery_radius_km?: number | null
          minimum_order?: number | null
          name?: string | null
          opening_hours?: Json | null
          rating?: number | null
          scheduling_mode?: string | null
          slug?: string | null
          takeaway_discount?: number | null
        }
        Update: {
          accepted_payments?: string[] | null
          address?: string | null
          avg_delivery_time?: number | null
          avg_prep_time?: number | null
          cuisine_categories?: string[] | null
          cuisine_type?: string | null
          delivery_flat_fee?: number | null
          delivery_free_under_km?: number | null
          delivery_mode?: string | null
          delivery_per_km_fee?: number | null
          description?: string | null
          dine_in_enabled?: boolean | null
          digital_menu_enabled?: boolean | null
          halal_type?: string | null
          id?: string | null
          image_url?: string | null
          is_free_delivery?: boolean | null
          is_open?: boolean | null
          is_paused?: boolean | null
          is_top_rated?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_delivery_radius_km?: number | null
          minimum_order?: number | null
          name?: string | null
          opening_hours?: Json | null
          rating?: number | null
          scheduling_mode?: string | null
          slug?: string | null
          takeaway_discount?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_loyalty_reward: { Args: { p_user_id: string }; Returns: boolean }
      delete_restaurant_cascade: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      get_user_restaurant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_loyalty_score: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      merge_cart_to_user: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: Json
      }
      next_order_number: { Args: { p_restaurant_id: string }; Returns: number }
      use_promo_code_atomic: { Args: { p_promo_id: string }; Returns: boolean }
      validate_promo_code: {
        Args: { p_code: string; p_order_total: number; p_restaurant_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "user" | "restaurant_admin" | "super_admin"
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
      app_role: ["user", "restaurant_admin", "super_admin"],
    },
  },
} as const
