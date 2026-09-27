// lib/database.types.ts
//
// Hand-authored to match the REAL live "splitcuts" Supabase project after
// supabase/extend_live_schema.sql was applied (see supabase/migrations/*.sql
// for the source of truth). Once you can run
// `npm run supabase:types` against the live project, REPLACE this file with
// the generated output so it never drifts from the real schema.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// The live app_role enum has no "barber" role -- barbers are just a table of
// service providers (see `barbers` below), not authenticated accounts.
export type AppRole = "owner" | "manager" | "cashier" | "customer";

// appointments.status is plain text with a CHECK constraint, not a Postgres
// enum (kept that way so the 154 pre-migration rows never had to change
// type). checked_in / in_service are new, added for the shop-mode workflow.
export type AppointmentStatus =
  | "booked"
  | "checked_in"
  | "in_service"
  | "completed"
  | "cancelled"
  | "no_show";

export type RewardStatus = "available" | "reserved" | "redeemed" | "expired" | "cancelled";
export type StaffNotificationType =
  | "new_booking"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "customer_checked_in"
  | "booking_starting_soon"
  | "reward_earned";

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          name: string;
          slug: string;
          address: string | null;
          city: string | null;
          timezone: string;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["branches"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["branches"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          role: AppRole;
          branch_id: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          notes: string | null;
          marketing_opt_in: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [];
      };
      staff_roles: {
        Row: {
          id: string;
          user_id: string;
          branch_id: string;
          role: AppRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["staff_roles"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["staff_roles"]["Row"]>;
        Relationships: [];
      };
      // These are the ORIGINAL live columns -- name/nickname/specialty/image_url
      // -- plus branch_id, added by the extend-in-place migration.
      barbers: {
        Row: {
          id: string;
          branch_id: string;
          name: string | null;
          nickname: string | null;
          specialty: string | null;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["barbers"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["barbers"]["Row"]>;
        Relationships: [];
      };
      // Original live columns -- name_ar/name_en, price, duration -- plus
      // branch_id, added by the extend-in-place migration, and category
      // (nullable -- legacy rows have none and fall back to a name-keyword
      // guess, see lib/serviceCategories.ts), added by migration 0012.
      services: {
        Row: {
          id: string;
          branch_id: string;
          name_ar: string | null;
          name_en: string | null;
          price: number;
          duration: number;
          is_active: boolean;
          category: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["services"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["services"]["Row"]>;
        Relationships: [];
      };
      // Original live columns -- customer_name/phone/email, appointment_date,
      // appointment_time (plain text, e.g. "21:30", no seconds), status,
      // notes, total_price -- plus branch_id, customer_id, appointment_start
      // and appointment_end, added by the extend-in-place migration.
      appointments: {
        Row: {
          id: string;
          branch_id: string;
          barber_id: string;
          service_id: string;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          customer_email: string | null;
          appointment_date: string;
          appointment_time: string;
          status: AppointmentStatus;
          notes: string | null;
          total_price: number | null;
          appointment_start: string;
          appointment_end: string;
          // Which package redemption (if any) paid for this visit -- added by
          // migration 0013. Null for every ordinary paid-at-checkout booking.
          customer_package_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["appointments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["appointments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "appointments_barber_id_fkey";
            columns: ["barber_id"];
            isOneToOne: false;
            referencedRelation: "barbers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_status_transitions: {
        Row: { from_status: string; to_status: string };
        Insert: Partial<Database["public"]["Tables"]["appointment_status_transitions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["appointment_status_transitions"]["Row"]>;
        Relationships: [];
      };
      booking_events: {
        Row: {
          id: string;
          appointment_id: string;
          branch_id: string;
          event_type: string;
          performed_by: string | null;
          old_status: string | null;
          new_status: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["booking_events"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["booking_events"]["Row"]>;
        Relationships: [];
      };
      loyalty_programs: {
        Row: {
          id: string;
          branch_id: string | null;
          name: string;
          description: string | null;
          visits_required: number;
          reward_type: string;
          reward_service_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["loyalty_programs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["loyalty_programs"]["Row"]>;
        Relationships: [];
      };
      loyalty_transactions: {
        Row: {
          id: string;
          customer_id: string;
          loyalty_program_id: string | null;
          appointment_id: string | null;
          type: string;
          amount: number;
          reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["loyalty_transactions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["loyalty_transactions"]["Row"]>;
        Relationships: [];
      };
      rewards: {
        Row: {
          id: string;
          customer_id: string;
          loyalty_program_id: string;
          branch_id: string | null;
          reward_type: string;
          status: RewardStatus;
          earned_at: string;
          expires_at: string | null;
          redeemed_at: string | null;
          redeemed_appointment_id: string | null;
          max_value: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["rewards"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["rewards"]["Row"]>;
        Relationships: [];
      };
      shop_devices: {
        Row: {
          id: string;
          branch_id: string;
          device_name: string;
          device_type: string;
          last_seen_at: string | null;
          notifications_enabled: boolean;
          voice_enabled: boolean;
          language: string;
          volume: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["shop_devices"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["shop_devices"]["Row"]>;
        Relationships: [];
      };
      device_sessions: {
        Row: {
          id: string;
          shop_device_id: string;
          user_id: string | null;
          started_at: string;
          ended_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["device_sessions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["device_sessions"]["Row"]>;
        Relationships: [];
      };
      // The Shop Mode realtime feed -- named staff_notifications (not
      // "notifications") because that name is already the live site-banner
      // table below.
      staff_notifications: {
        Row: {
          id: string;
          branch_id: string;
          recipient_user_id: string | null;
          appointment_id: string | null;
          type: StaffNotificationType;
          title: string;
          message: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["staff_notifications"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["staff_notifications"]["Row"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          branch_id: string | null;
          actor_id: string | null;
          action: string;
          table_name: string | null;
          record_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]>;
        Relationships: [];
      };
      // Pre-existing site-banner table (unrelated to Shop Mode notifications).
      notifications: {
        Row: {
          id: string;
          title: string | null;
          message: string | null;
          [key: string]: Json | string | number | boolean | null;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };
      site_settings: {
        Row: {
          id: string;
          key: string;
          value: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["site_settings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["site_settings"]["Row"]>;
        Relationships: [];
      };
      google_reviews: {
        Row: {
          id: string;
          [key: string]: Json | string | number | boolean | null;
        };
        Insert: Partial<Database["public"]["Tables"]["google_reviews"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["google_reviews"]["Row"]>;
        Relationships: [];
      };
      // supabase/migrations/0009_live_extend_payments.sql -- Tamara (BNPL)
      // checkout tracking. Booking is never gated on this table; see that
      // migration's header comment for why.
      payments: {
        Row: {
          id: string;
          appointment_ids: string[];
          provider: string;
          merchant_reference: string;
          provider_order_id: string | null;
          provider_checkout_id: string | null;
          checkout_url: string | null;
          status: string;
          amount: number;
          currency: string;
          // Which package purchase (if any) this payment is for -- added by
          // migration 0014. Null for every ordinary appointment payment;
          // appointment_ids is '{}' for a package payment instead.
          customer_package_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "payments_customer_package_id_fkey";
            columns: ["customer_package_id"];
            isOneToOne: false;
            referencedRelation: "customer_packages";
            referencedColumns: ["id"];
          },
        ];
      };
      // supabase/migrations/0013 -- catalog of purchasable multi-visit
      // bundles (e.g. the University Student Package), one row per branch.
      packages: {
        Row: {
          id: string;
          branch_id: string;
          code: string;
          name_en: string;
          name_ar: string | null;
          price: number;
          session_count: number;
          service_id: string;
          validity_days: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["packages"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["packages"]["Row"]>;
        Relationships: [];
      };
      // supabase/migrations/0013 -- one row per customer purchase/request of
      // a package: pending until a cashier activates it (cash collected at
      // the shop), then redeemed session-by-session at booking time.
      customer_packages: {
        Row: {
          id: string;
          package_id: string;
          customer_id: string;
          status: "pending_payment" | "active" | "expired" | "cancelled";
          sessions_total: number;
          sessions_used: number;
          requested_at: string;
          activated_at: string | null;
          expires_at: string | null;
          activated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customer_packages"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["customer_packages"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "customer_packages_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_packages_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      customer_loyalty_progress: {
        Row: {
          customer_id: string;
          loyalty_program_id: string;
          branch_id: string | null;
          name: string;
          visits_required: number;
          visits_progress: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_appointment: {
        Args: {
          p_customer_id: string | null;
          p_barber_id: string;
          p_service_id: string;
          p_appointment_date: string;
          p_appointment_time: string;
          p_customer_name?: string | null;
          p_customer_phone?: string | null;
          p_customer_email?: string | null;
          p_notes?: string | null;
          p_customer_package_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      update_appointment_status: {
        Args: {
          p_appointment_id: string;
          p_new_status: AppointmentStatus;
          p_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["appointments"]["Row"];
      };
      request_package: {
        Args: { p_package_id: string };
        Returns: Database["public"]["Tables"]["customer_packages"]["Row"];
      };
      activate_customer_package: {
        Args: { p_customer_package_id: string };
        Returns: Database["public"]["Tables"]["customer_packages"]["Row"];
      };
      activate_package_from_payment: {
        Args: { p_payment_id: string };
        Returns: Database["public"]["Tables"]["customer_packages"]["Row"];
      };
    };
    Enums: {
      app_role: AppRole;
      reward_status: RewardStatus;
      staff_notification_type: StaffNotificationType;
    };
  };
}
