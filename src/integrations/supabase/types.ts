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
      activities: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          done: boolean
          duration_minutes: number
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["activity_kind"]
          lead_id: string | null
          organization_id: string
          property_id: string | null
          request_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["activity_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done?: boolean
          duration_minutes?: number
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          lead_id?: string | null
          organization_id: string
          property_id?: string | null
          request_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["activity_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done?: boolean
          duration_minutes?: number
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["activity_kind"]
          lead_id?: string | null
          organization_id?: string
          property_id?: string | null
          request_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["activity_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          created_by: string | null
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          new_values: Json | null
          old_values: Json | null
          organization_id: string | null
          updated_at: string
          updated_by: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          created_by?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          created_by?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          gdpr_consent: boolean
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          phone: string | null
          source: string | null
          status: string
          tags: string[]
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
          updated_by: string | null
          whatsapp: string | null
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          gdpr_consent?: boolean
          id?: string
          last_name?: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          gdpr_consent?: boolean
          id?: string
          last_name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          source?: string | null
          status?: string
          tags?: string[]
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          mime_type: string | null
          name: string
          organization_id: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          mime_type?: string | null
          name: string
          organization_id: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          mime_type?: string | null
          name?: string
          organization_id?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metric: string
          organization_id: string
          period: string
          progress: number
          target: number
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric: string
          organization_id: string
          period?: string
          progress?: number
          target?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric?: string
          organization_id?: string
          period?: string
          progress?: number
          target?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["lead_stage"] | null
          id: string
          lead_id: string
          note: string | null
          organization_id: string
          to_stage: Database["public"]["Enums"]["lead_stage"]
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["lead_stage"] | null
          id?: string
          lead_id: string
          note?: string | null
          organization_id: string
          to_stage: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["lead_stage"] | null
          id?: string
          lead_id?: string
          note?: string | null
          organization_id?: string
          to_stage?: Database["public"]["Enums"]["lead_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          campaign: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          last_interaction_at: string | null
          lost_reason: string | null
          name: string
          next_followup_at: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          property_id: string | null
          request_id: string | null
          score: number
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          stale: boolean
          updated_at: string
          updated_by: string | null
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          campaign?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          lost_reason?: string | null
          name?: string
          next_followup_at?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          property_id?: string | null
          request_id?: string | null
          score?: number
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          stale?: boolean
          updated_at?: string
          updated_by?: string | null
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          campaign?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          lost_reason?: string | null
          name?: string
          next_followup_at?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          property_id?: string | null
          request_id?: string | null
          score?: number
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          stale?: boolean
          updated_at?: string
          updated_by?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          link: string | null
          organization_id: string | null
          read_at: string | null
          title: string
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          organization_id?: string | null
          read_at?: string | null
          title: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          organization_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          logo_url: string | null
          max_properties: number
          max_users: number
          name: string
          phone: string | null
          plan: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_properties?: number
          max_users?: number
          name: string
          phone?: string | null
          plan?: string
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          max_properties?: number
          max_users?: number
          name?: string
          phone?: string | null
          plan?: string
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          job_title: string | null
          organization_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          job_title?: string | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          assigned_to: string | null
          balcony: boolean
          bathrooms: number | null
          bedrooms: number | null
          build_year: number | null
          building_floors: number | null
          built_surface: number | null
          category: string | null
          city: string | null
          collaboration: boolean
          commission: string | null
          county: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string | null
          district: string | null
          external_id: string | null
          features: string[]
          floor: number | null
          furnishing: string | null
          heating: string | null
          id: string
          internal_notes: string | null
          land_surface: number | null
          last_activity_at: string | null
          lat: number | null
          layout: string | null
          lng: number | null
          location_precise: boolean
          negotiable: boolean
          organization_id: string
          owner_contact_id: string | null
          parking: string | null
          price: number | null
          property_type: string
          publish_status: string
          published_at: string | null
          reference: string | null
          rooms: number | null
          source: string | null
          status: Database["public"]["Enums"]["property_status"]
          street: string | null
          street_number: string | null
          surface: number | null
          tags: string[]
          title: string
          transaction_kind: Database["public"]["Enums"]["transaction_kind"]
          updated_at: string
          updated_by: string | null
          usable_surface: number | null
          utilities: string[]
          vat_included: boolean
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          balcony?: boolean
          bathrooms?: number | null
          bedrooms?: number | null
          build_year?: number | null
          building_floors?: number | null
          built_surface?: number | null
          category?: string | null
          city?: string | null
          collaboration?: boolean
          commission?: string | null
          county?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          district?: string | null
          external_id?: string | null
          features?: string[]
          floor?: number | null
          furnishing?: string | null
          heating?: string | null
          id?: string
          internal_notes?: string | null
          land_surface?: number | null
          last_activity_at?: string | null
          lat?: number | null
          layout?: string | null
          lng?: number | null
          location_precise?: boolean
          negotiable?: boolean
          organization_id: string
          owner_contact_id?: string | null
          parking?: string | null
          price?: number | null
          property_type?: string
          publish_status?: string
          published_at?: string | null
          reference?: string | null
          rooms?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          street?: string | null
          street_number?: string | null
          surface?: number | null
          tags?: string[]
          title: string
          transaction_kind?: Database["public"]["Enums"]["transaction_kind"]
          updated_at?: string
          updated_by?: string | null
          usable_surface?: number | null
          utilities?: string[]
          vat_included?: boolean
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          balcony?: boolean
          bathrooms?: number | null
          bedrooms?: number | null
          build_year?: number | null
          building_floors?: number | null
          built_surface?: number | null
          category?: string | null
          city?: string | null
          collaboration?: boolean
          commission?: string | null
          county?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          district?: string | null
          external_id?: string | null
          features?: string[]
          floor?: number | null
          furnishing?: string | null
          heating?: string | null
          id?: string
          internal_notes?: string | null
          land_surface?: number | null
          last_activity_at?: string | null
          lat?: number | null
          layout?: string | null
          lng?: number | null
          location_precise?: boolean
          negotiable?: boolean
          organization_id?: string
          owner_contact_id?: string | null
          parking?: string | null
          price?: number | null
          property_type?: string
          publish_status?: string
          published_at?: string | null
          reference?: string | null
          rooms?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          street?: string | null
          street_number?: string | null
          surface?: number | null
          tags?: string[]
          title?: string
          transaction_kind?: Database["public"]["Enums"]["transaction_kind"]
          updated_at?: string
          updated_by?: string | null
          usable_surface?: number | null
          utilities?: string[]
          vat_included?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_contact_id_fkey"
            columns: ["owner_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      property_favorites: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          property_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          property_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_favorites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_favorites_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_images: {
        Row: {
          alt: string | null
          created_at: string
          created_by: string | null
          height: number | null
          id: string
          include_in_publish: boolean
          is_confidential: boolean
          is_primary: boolean
          organization_id: string
          position: number
          property_id: string
          storage_path: string | null
          updated_at: string
          updated_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          include_in_publish?: boolean
          is_confidential?: boolean
          is_primary?: boolean
          organization_id: string
          position?: number
          property_id: string
          storage_path?: string | null
          updated_at?: string
          updated_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          include_in_publish?: boolean
          is_confidential?: boolean
          is_primary?: boolean
          organization_id?: string
          position?: number
          property_id?: string
          storage_path?: string | null
          updated_at?: string
          updated_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_images_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          areas: string[]
          assigned_to: string | null
          budget_max: number | null
          budget_min: number | null
          cities: string[]
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          features: string[]
          floor_preference: string | null
          furnished: boolean | null
          id: string
          kind: Database["public"]["Enums"]["request_kind"]
          notes: string | null
          organization_id: string
          pets_allowed: boolean | null
          priority: string
          property_type: string | null
          rooms_max: number | null
          rooms_min: number | null
          source: string | null
          status: string
          surface_min: number | null
          term: string | null
          title: string
          updated_at: string
          updated_by: string | null
          wants_balcony: boolean | null
          wants_parking: boolean | null
        }
        Insert: {
          areas?: string[]
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          cities?: string[]
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          features?: string[]
          floor_preference?: string | null
          furnished?: boolean | null
          id?: string
          kind?: Database["public"]["Enums"]["request_kind"]
          notes?: string | null
          organization_id: string
          pets_allowed?: boolean | null
          priority?: string
          property_type?: string | null
          rooms_max?: number | null
          rooms_min?: number | null
          source?: string | null
          status?: string
          surface_min?: number | null
          term?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          wants_balcony?: boolean | null
          wants_parking?: boolean | null
        }
        Update: {
          areas?: string[]
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          cities?: string[]
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          features?: string[]
          floor_preference?: string | null
          furnished?: boolean | null
          id?: string
          kind?: Database["public"]["Enums"]["request_kind"]
          notes?: string | null
          organization_id?: string
          pets_allowed?: boolean | null
          priority?: string
          property_type?: string | null
          rooms_max?: number | null
          rooms_min?: number | null
          source?: string | null
          status?: string
          surface_min?: number | null
          term?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          wants_balcony?: boolean | null
          wants_parking?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          config: Json
          created_at: string
          id: string
          module: string
          name: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          module: string
          name: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          module?: string
          name?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_agency: {
        Args: { _agency_name: string; _full_name: string; _phone?: string }
        Returns: string
      }
      current_org: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
    }
    Enums: {
      activity_kind:
        | "call"
        | "meeting"
        | "viewing"
        | "task"
        | "email"
        | "followup"
        | "note"
      activity_status: "planned" | "done" | "cancelled"
      app_role: "superadmin" | "agency_admin" | "agent"
      contact_type:
        | "owner"
        | "buyer"
        | "tenant"
        | "investor"
        | "agent"
        | "partner"
        | "developer"
        | "company"
      lead_stage:
        | "new"
        | "contacted"
        | "qualified"
        | "viewing"
        | "offer"
        | "negotiation"
        | "transaction"
        | "won"
        | "lost"
      org_status: "active" | "trial" | "suspended" | "cancelled"
      property_status:
        | "draft"
        | "active"
        | "reserved"
        | "negotiation"
        | "sold"
        | "rented"
        | "expired"
        | "archived"
      request_kind: "buy" | "rent" | "invest"
      transaction_kind: "sale" | "rent"
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
      activity_kind: [
        "call",
        "meeting",
        "viewing",
        "task",
        "email",
        "followup",
        "note",
      ],
      activity_status: ["planned", "done", "cancelled"],
      app_role: ["superadmin", "agency_admin", "agent"],
      contact_type: [
        "owner",
        "buyer",
        "tenant",
        "investor",
        "agent",
        "partner",
        "developer",
        "company",
      ],
      lead_stage: [
        "new",
        "contacted",
        "qualified",
        "viewing",
        "offer",
        "negotiation",
        "transaction",
        "won",
        "lost",
      ],
      org_status: ["active", "trial", "suspended", "cancelled"],
      property_status: [
        "draft",
        "active",
        "reserved",
        "negotiation",
        "sold",
        "rented",
        "expired",
        "archived",
      ],
      request_kind: ["buy", "rent", "invest"],
      transaction_kind: ["sale", "rent"],
    },
  },
} as const
