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
      appointment_status_transitions: {
        Row: {
          from_status: string
          to_status: string
        }
        Insert: {
          from_status: string
          to_status: string
        }
        Update: {
          from_status?: string
          to_status?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_end: string | null
          appointment_start: string | null
          appointment_time: string
          barber_id: string
          branch_id: string
          confirmation_email_sent_at: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_package_id: string | null
          customer_phone: string | null
          id: string
          notes: string | null
          service_id: string | null
          status: string
          total_price: number | null
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_end?: string | null
          appointment_start?: string | null
          appointment_time: string
          barber_id: string
          branch_id?: string
          confirmation_email_sent_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_package_id?: string | null
          customer_phone?: string | null
          id?: string
          notes?: string | null
          service_id?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_end?: string | null
          appointment_start?: string | null
          appointment_time?: string
          barber_id?: string
          branch_id?: string
          confirmation_email_sent_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_package_id?: string | null
          customer_phone?: string | null
          id?: string
          notes?: string | null
          service_id?: string | null
          status?: string
          total_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_package_id_fkey"
            columns: ["customer_package_id"]
            isOneToOne: false
            referencedRelation: "customer_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          branch_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      barbers: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          nickname: string
          specialty: string
          updated_at: string
        }
        Insert: {
          branch_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          nickname: string
          specialty: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          nickname?: string
          specialty?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barbers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_analytics: {
        Row: {
          appointment_id: string
          booking_browser: string | null
          booking_city: string | null
          booking_country: string | null
          booking_device: string | null
          booking_ip: string | null
          booking_os: string | null
          booking_region: string | null
          created_at: string | null
          id: string
          user_agent: string | null
        }
        Insert: {
          appointment_id: string
          booking_browser?: string | null
          booking_city?: string | null
          booking_country?: string | null
          booking_device?: string | null
          booking_ip?: string | null
          booking_os?: string | null
          booking_region?: string | null
          created_at?: string | null
          id?: string
          user_agent?: string | null
        }
        Update: {
          appointment_id?: string
          booking_browser?: string | null
          booking_city?: string | null
          booking_country?: string | null
          booking_device?: string | null
          booking_ip?: string | null
          booking_os?: string | null
          booking_region?: string | null
          created_at?: string | null
          id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_analytics_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_events: {
        Row: {
          appointment_id: string
          branch_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          new_status: string | null
          old_status: string | null
          performed_by: string | null
        }
        Insert: {
          appointment_id: string
          branch_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          performed_by?: string | null
        }
        Update: {
          appointment_id?: string
          branch_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "booking_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_transitions: {
        Row: {
          from_status: Database["public"]["Enums"]["booking_status"]
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Insert: {
          from_status: Database["public"]["Enums"]["booking_status"]
          to_status: Database["public"]["Enums"]["booking_status"]
        }
        Update: {
          from_status?: Database["public"]["Enums"]["booking_status"]
          to_status?: Database["public"]["Enums"]["booking_status"]
        }
        Relationships: []
      }
      bookings: {
        Row: {
          barber_id: string | null
          booking_date: string
          booking_time: string
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          notes: string | null
          service_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          barber_id?: string | null
          booking_date: string
          booking_time: string
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          notes?: string | null
          service_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          barber_id?: string | null
          booking_date?: string
          booking_time?: string
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          notes?: string | null
          service_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_packages: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          package_id: string
          requested_at: string
          sessions_total: number
          sessions_used: number
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          package_id: string
          requested_at?: string
          sessions_total: number
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          package_id?: string
          requested_at?: string
          sessions_total?: number
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_packages_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_packages_activated_by_fkey"
            columns: ["activated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_packages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_packages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          id: string
          marketing_opt_in: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          marketing_opt_in?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          marketing_opt_in?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customers_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          shop_device_id: string
          started_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          shop_device_id: string
          started_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          shop_device_id?: string
          started_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_sessions_shop_device_id_fkey"
            columns: ["shop_device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "device_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_reviews: {
        Row: {
          created_at: string | null
          id: string
          is_featured: boolean | null
          rating: number | null
          review_date: string | null
          review_text: string
          reviewer_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_featured?: boolean | null
          rating?: number | null
          review_date?: string | null
          review_text: string
          reviewer_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_featured?: boolean | null
          rating?: number | null
          review_date?: string | null
          review_text?: string
          reviewer_name?: string
        }
        Relationships: []
      }
      loyalty_programs: {
        Row: {
          branch_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          reward_service_id: string | null
          reward_type: string
          updated_at: string
          visits_required: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          reward_service_id?: string | null
          reward_type?: string
          updated_at?: string
          visits_required: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          reward_service_id?: string | null
          reward_type?: string
          updated_at?: string
          visits_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_reward_service_id_fkey"
            columns: ["reward_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          amount: number
          appointment_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          loyalty_program_id: string | null
          reason: string | null
          type: string
        }
        Insert: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          loyalty_program_id?: string | null
          reason?: string | null
          type: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          loyalty_program_id?: string | null
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "loyalty_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_loyalty_program_id_fkey"
            columns: ["loyalty_program_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["loyalty_program_id"]
          },
          {
            foreignKeyName: "loyalty_transactions_loyalty_program_id_fkey"
            columns: ["loyalty_program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          message: string
          title: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          title: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          title?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      packages: {
        Row: {
          branch_id: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string | null
          name_en: string
          price: number
          service_id: string
          session_count: number
          updated_at: string
          validity_days: number
        }
        Insert: {
          branch_id: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          price: number
          service_id: string
          session_count: number
          updated_at?: string
          validity_days?: number
        }
        Update: {
          branch_id?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          price?: number
          service_id?: string
          session_count?: number
          updated_at?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "packages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_ids: string[]
          checkout_url: string | null
          created_at: string
          currency: string
          customer_package_id: string | null
          id: string
          merchant_reference: string
          provider: string
          provider_checkout_id: string | null
          provider_order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_ids: string[]
          checkout_url?: string | null
          created_at?: string
          currency?: string
          customer_package_id?: string | null
          id?: string
          merchant_reference: string
          provider?: string
          provider_checkout_id?: string | null
          provider_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_ids?: string[]
          checkout_url?: string | null
          created_at?: string
          currency?: string
          customer_package_id?: string | null
          id?: string
          merchant_reference?: string
          provider?: string
          provider_checkout_id?: string | null
          provider_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_package_id_fkey"
            columns: ["customer_package_id"]
            isOneToOne: false
            referencedRelation: "customer_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          branch_id: string | null
          created_at: string
          customer_id: string
          earned_at: string
          expires_at: string | null
          id: string
          loyalty_program_id: string
          max_value: number | null
          metadata: Json
          redeemed_appointment_id: string | null
          redeemed_at: string | null
          reward_type: string
          status: Database["public"]["Enums"]["reward_status"]
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          customer_id: string
          earned_at?: string
          expires_at?: string | null
          id?: string
          loyalty_program_id: string
          max_value?: number | null
          metadata?: Json
          redeemed_appointment_id?: string | null
          redeemed_at?: string | null
          reward_type?: string
          status?: Database["public"]["Enums"]["reward_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          customer_id?: string
          earned_at?: string
          expires_at?: string | null
          id?: string
          loyalty_program_id?: string
          max_value?: number | null
          metadata?: Json
          redeemed_appointment_id?: string | null
          redeemed_at?: string | null
          reward_type?: string
          status?: Database["public"]["Enums"]["reward_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_loyalty_program_id_fkey"
            columns: ["loyalty_program_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["loyalty_program_id"]
          },
          {
            foreignKeyName: "rewards_loyalty_program_id_fkey"
            columns: ["loyalty_program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_redeemed_appointment_id_fkey"
            columns: ["redeemed_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          branch_id: string
          category: string | null
          created_at: string
          duration: number | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          price: number
          updated_at: string
        }
        Insert: {
          branch_id?: string
          category?: string | null
          created_at?: string
          duration?: number | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          price: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          category?: string | null
          created_at?: string
          duration?: number | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_devices: {
        Row: {
          branch_id: string
          created_at: string
          device_name: string
          device_type: string
          id: string
          is_active: boolean
          language: string
          last_seen_at: string | null
          notifications_enabled: boolean
          updated_at: string
          voice_enabled: boolean
          volume: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          device_name: string
          device_type?: string
          id?: string
          is_active?: boolean
          language?: string
          last_seen_at?: string | null
          notifications_enabled?: boolean
          updated_at?: string
          voice_enabled?: boolean
          volume?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          device_name?: string
          device_type?: string
          id?: string
          is_active?: boolean
          language?: string
          last_seen_at?: string | null
          notifications_enabled?: boolean
          updated_at?: string
          voice_enabled?: boolean
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_devices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      staff_notifications: {
        Row: {
          appointment_id: string | null
          branch_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          recipient_user_id: string | null
          title: string
          type: Database["public"]["Enums"]["staff_notification_type"]
        }
        Insert: {
          appointment_id?: string | null
          branch_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          recipient_user_id?: string | null
          title: string
          type: Database["public"]["Enums"]["staff_notification_type"]
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          recipient_user_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["staff_notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "staff_notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "staff_notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_loyalty_progress"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "staff_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_loyalty_progress: {
        Row: {
          branch_id: string | null
          customer_id: string | null
          loyalty_program_id: string | null
          name: string | null
          visits_progress: number | null
          visits_required: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_customer_package: {
        Args: { p_customer_package_id: string }
        Returns: {
          activated_at: string | null
          activated_by: string | null
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          package_id: string
          requested_at: string
          sessions_total: number
          sessions_used: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_packages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_package_from_payment: {
        Args: { p_payment_id: string }
        Returns: {
          activated_at: string | null
          activated_by: string | null
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          package_id: string
          requested_at: string
          sessions_total: number
          sessions_used: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_packages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_appointment: {
        Args: {
          p_appointment_date: string
          p_appointment_time: string
          p_barber_id: string
          p_customer_email?: string
          p_customer_id: string
          p_customer_name?: string
          p_customer_package_id?: string
          p_customer_phone?: string
          p_notes?: string
          p_service_id: string
        }
        Returns: {
          appointment_date: string
          appointment_end: string | null
          appointment_start: string | null
          appointment_time: string
          barber_id: string
          branch_id: string
          confirmation_email_sent_at: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_package_id: string | null
          customer_phone: string | null
          id: string
          notes: string | null
          service_id: string | null
          status: string
          total_price: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_booking: {
        Args: {
          p_barber_id: string
          p_customer_id: string
          p_notes?: string
          p_service_id: string
          p_starts_at: string
        }
        Returns: {
          barber_id: string | null
          booking_date: string
          booking_time: string
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          notes: string | null
          service_id: string | null
          status: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_branch_manager: { Args: { branch: string }; Returns: boolean }
      is_branch_staff: { Args: { branch: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      link_my_guest_bookings: { Args: never; Returns: undefined }
      request_package: {
        Args: { p_package_id: string }
        Returns: {
          activated_at: string | null
          activated_by: string | null
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          package_id: string
          requested_at: string
          sessions_total: number
          sessions_used: number
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_packages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reschedule_appointment: {
        Args: {
          p_appointment_id: string
          p_new_date: string
          p_new_time: string
        }
        Returns: {
          appointment_date: string
          appointment_end: string | null
          appointment_start: string | null
          appointment_time: string
          barber_id: string
          branch_id: string
          confirmation_email_sent_at: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_package_id: string | null
          customer_phone: string | null
          id: string
          notes: string | null
          service_id: string | null
          status: string
          total_price: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_appointment_start: {
        Args: {
          p_appointment_date: string
          p_appointment_time: string
          p_timezone?: string
        }
        Returns: string
      }
      update_appointment_status: {
        Args: {
          p_appointment_id: string
          p_new_status: string
          p_reason?: string
        }
        Returns: {
          appointment_date: string
          appointment_end: string | null
          appointment_start: string | null
          appointment_time: string
          barber_id: string
          branch_id: string
          confirmation_email_sent_at: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_package_id: string | null
          customer_phone: string | null
          id: string
          notes: string | null
          service_id: string | null
          status: string
          total_price: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_booking_status: {
        Args: {
          p_booking_id: string
          p_new_status: Database["public"]["Enums"]["booking_status"]
          p_reason?: string
        }
        Returns: {
          barber_id: string | null
          booking_date: string
          booking_time: string
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          notes: string | null
          service_id: string | null
          status: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "cashier" | "barber" | "customer"
      booking_event_type:
        | "booking_created"
        | "booking_confirmed"
        | "booking_rescheduled"
        | "barber_changed"
        | "customer_checked_in"
        | "service_started"
        | "service_completed"
        | "booking_cancelled"
        | "marked_no_show"
        | "booking_status_changed"
      booking_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "in_service"
        | "completed"
        | "cancelled"
        | "no_show"
      loyalty_transaction_type:
        | "visit_earned"
        | "visit_removed"
        | "reward_earned"
        | "reward_redeemed"
        | "manual_adjustment"
        | "reward_expired"
      notification_type:
        | "new_booking"
        | "booking_cancelled"
        | "booking_rescheduled"
        | "customer_arrived"
        | "booking_starting_soon"
        | "reward_earned"
      reward_status:
        | "available"
        | "reserved"
        | "redeemed"
        | "expired"
        | "cancelled"
      shop_device_type:
        | "cashier_terminal"
        | "barber_display"
        | "kiosk"
        | "other"
      staff_notification_type:
        | "new_booking"
        | "booking_cancelled"
        | "booking_rescheduled"
        | "customer_checked_in"
        | "booking_starting_soon"
        | "reward_earned"
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
      app_role: ["owner", "manager", "cashier", "barber", "customer"],
      booking_event_type: [
        "booking_created",
        "booking_confirmed",
        "booking_rescheduled",
        "barber_changed",
        "customer_checked_in",
        "service_started",
        "service_completed",
        "booking_cancelled",
        "marked_no_show",
        "booking_status_changed",
      ],
      booking_status: [
        "pending",
        "confirmed",
        "checked_in",
        "in_service",
        "completed",
        "cancelled",
        "no_show",
      ],
      loyalty_transaction_type: [
        "visit_earned",
        "visit_removed",
        "reward_earned",
        "reward_redeemed",
        "manual_adjustment",
        "reward_expired",
      ],
      notification_type: [
        "new_booking",
        "booking_cancelled",
        "booking_rescheduled",
        "customer_arrived",
        "booking_starting_soon",
        "reward_earned",
      ],
      reward_status: [
        "available",
        "reserved",
        "redeemed",
        "expired",
        "cancelled",
      ],
      shop_device_type: [
        "cashier_terminal",
        "barber_display",
        "kiosk",
        "other",
      ],
      staff_notification_type: [
        "new_booking",
        "booking_cancelled",
        "booking_rescheduled",
        "customer_checked_in",
        "booking_starting_soon",
        "reward_earned",
      ],
    },
  },
} as const
