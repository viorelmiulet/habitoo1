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
          demo_seed_version: string | null
          demo_seeded_at: string | null
          email: string | null
          id: string
          is_demo: boolean
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
          demo_seed_version?: string | null
          demo_seeded_at?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
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
          demo_seed_version?: string | null
          demo_seeded_at?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
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
      portal_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          organization_id: string
          portal: string
          portal_connection_id: string | null
          request_count: number
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          organization_id: string
          portal: string
          portal_connection_id?: string | null
          request_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          organization_id?: string
          portal?: string
          portal_connection_id?: string | null
          request_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_api_keys_portal_connection_id_fkey"
            columns: ["portal_connection_id"]
            isOneToOne: false
            referencedRelation: "portal_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_connections: {
        Row: {
          activated: boolean
          authentication_mode: string
          created_at: string
          created_by: string | null
          direction: string
          external_account_id: string | null
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          organization_id: string
          portal: string
          portal_credentials_encrypted: string | null
          settings: Json
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activated?: boolean
          authentication_mode?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          external_account_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          organization_id: string
          portal: string
          portal_credentials_encrypted?: string | null
          settings?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activated?: boolean
          authentication_mode?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          external_account_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          organization_id?: string
          portal?: string
          portal_credentials_encrypted?: string | null
          settings?: Json
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_integrations: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          credential_hash: string | null
          credential_prefix: string | null
          credential_secret: string | null
          enabled: boolean
          endpoint_url: string | null
          external_agency_id: string | null
          id: string
          last_error: string | null
          last_error_at: string | null
          last_sync_at: string | null
          organization_id: string
          portal_key: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          credential_hash?: string | null
          credential_prefix?: string | null
          credential_secret?: string | null
          enabled?: boolean
          endpoint_url?: string | null
          external_agency_id?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_sync_at?: string | null
          organization_id: string
          portal_key: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          credential_hash?: string | null
          credential_prefix?: string | null
          credential_secret?: string | null
          enabled?: boolean
          endpoint_url?: string | null
          external_agency_id?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_sync_at?: string | null
          organization_id?: string
          portal_key?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_listings: {
        Row: {
          created_at: string
          created_by: string | null
          external_id: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          organization_id: string
          portal: string
          property_id: string
          published_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id: string
          portal: string
          property_id: string
          published_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id?: string
          portal?: string
          property_id?: string
          published_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_listings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_operation_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          operation: string
          organization_id: string
          portal: string
          property_id: string | null
          success: boolean
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          operation: string
          organization_id: string
          portal: string
          property_id?: string | null
          success: boolean
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          operation?: string
          organization_id?: string
          portal?: string
          property_id?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "portal_operation_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_operation_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_publications: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          external_ref: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          organization_id: string
          portal_key: string
          property_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          external_ref?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          organization_id: string
          portal_key: string
          property_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          external_ref?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          organization_id?: string
          portal_key?: string
          property_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_publications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_publications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
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
          additional_spaces: string[]
          address: string | null
          appliances: string[]
          assigned_to: string | null
          balconies: number | null
          balcony: boolean
          balcony_surface: number | null
          bathroom_window: boolean
          bathrooms: number | null
          bedrooms: number | null
          blinds: string[]
          build_year: number | null
          building_amenities: string[]
          building_floors: number | null
          building_structure: string | null
          building_type: string | null
          built_surface: number | null
          category: string | null
          city: string | null
          collaboration: boolean
          comfort: string | null
          commission: string | null
          construction_stage: string | null
          cooling_systems: string[]
          county: string | null
          county_siruta_code: number | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string | null
          destination: string | null
          district: string | null
          entry_door: string[]
          external_id: string | null
          features: string[]
          finish_state: string | null
          floor: number | null
          floor_finishes: string[]
          floor_label: string | null
          for_rent: boolean
          for_sale: boolean
          furnishing: string | null
          garages: number | null
          garden_surface: number | null
          has_attic: boolean
          has_basement: boolean
          has_ground_floor: boolean
          has_loft: boolean
          has_semi_basement: boolean
          heating: string | null
          heating_systems: string[]
          id: string
          insulation: string[]
          interior_doors: string[]
          internal_notes: string | null
          key_in_agency: boolean
          kitchen_features: string[]
          kitchens: number | null
          land_surface: number | null
          last_activity_at: string | null
          lat: number | null
          layout: string | null
          lng: number | null
          locality_siruta_code: number | null
          location_precise: boolean
          metering: string[]
          misc_features: string[]
          negotiable: boolean
          open_kitchen: boolean
          organization_id: string
          orientation: string | null
          owner_contact_id: string | null
          parking: string | null
          parking_spaces: number | null
          pet_friendly: boolean
          price: number | null
          property_type: string
          publish_status: string
          published_at: string | null
          recessed_floors: number | null
          reference: string | null
          renovation_year: number | null
          rent_currency: string | null
          rent_price: number | null
          rooms: number | null
          sale_currency: string | null
          sale_price: number | null
          seismic_risk: string | null
          shutters: string[]
          source: string | null
          status: Database["public"]["Enums"]["property_status"]
          street: string | null
          street_arrangement: string[]
          street_number: string | null
          surface: number | null
          tags: string[]
          terrace_surface: number | null
          terraces: number | null
          title: string
          total_usable_surface: number | null
          transaction_kind: Database["public"]["Enums"]["transaction_kind"]
          uat_siruta_code: number | null
          updated_at: string
          updated_by: string | null
          usable_surface: number | null
          utilities: string[]
          vat_included: boolean
          views: string[]
          wall_finishes: string[]
          windows: string[]
        }
        Insert: {
          additional_spaces?: string[]
          address?: string | null
          appliances?: string[]
          assigned_to?: string | null
          balconies?: number | null
          balcony?: boolean
          balcony_surface?: number | null
          bathroom_window?: boolean
          bathrooms?: number | null
          bedrooms?: number | null
          blinds?: string[]
          build_year?: number | null
          building_amenities?: string[]
          building_floors?: number | null
          building_structure?: string | null
          building_type?: string | null
          built_surface?: number | null
          category?: string | null
          city?: string | null
          collaboration?: boolean
          comfort?: string | null
          commission?: string | null
          construction_stage?: string | null
          cooling_systems?: string[]
          county?: string | null
          county_siruta_code?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          destination?: string | null
          district?: string | null
          entry_door?: string[]
          external_id?: string | null
          features?: string[]
          finish_state?: string | null
          floor?: number | null
          floor_finishes?: string[]
          floor_label?: string | null
          for_rent?: boolean
          for_sale?: boolean
          furnishing?: string | null
          garages?: number | null
          garden_surface?: number | null
          has_attic?: boolean
          has_basement?: boolean
          has_ground_floor?: boolean
          has_loft?: boolean
          has_semi_basement?: boolean
          heating?: string | null
          heating_systems?: string[]
          id?: string
          insulation?: string[]
          interior_doors?: string[]
          internal_notes?: string | null
          key_in_agency?: boolean
          kitchen_features?: string[]
          kitchens?: number | null
          land_surface?: number | null
          last_activity_at?: string | null
          lat?: number | null
          layout?: string | null
          lng?: number | null
          locality_siruta_code?: number | null
          location_precise?: boolean
          metering?: string[]
          misc_features?: string[]
          negotiable?: boolean
          open_kitchen?: boolean
          organization_id: string
          orientation?: string | null
          owner_contact_id?: string | null
          parking?: string | null
          parking_spaces?: number | null
          pet_friendly?: boolean
          price?: number | null
          property_type?: string
          publish_status?: string
          published_at?: string | null
          recessed_floors?: number | null
          reference?: string | null
          renovation_year?: number | null
          rent_currency?: string | null
          rent_price?: number | null
          rooms?: number | null
          sale_currency?: string | null
          sale_price?: number | null
          seismic_risk?: string | null
          shutters?: string[]
          source?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          street?: string | null
          street_arrangement?: string[]
          street_number?: string | null
          surface?: number | null
          tags?: string[]
          terrace_surface?: number | null
          terraces?: number | null
          title: string
          total_usable_surface?: number | null
          transaction_kind?: Database["public"]["Enums"]["transaction_kind"]
          uat_siruta_code?: number | null
          updated_at?: string
          updated_by?: string | null
          usable_surface?: number | null
          utilities?: string[]
          vat_included?: boolean
          views?: string[]
          wall_finishes?: string[]
          windows?: string[]
        }
        Update: {
          additional_spaces?: string[]
          address?: string | null
          appliances?: string[]
          assigned_to?: string | null
          balconies?: number | null
          balcony?: boolean
          balcony_surface?: number | null
          bathroom_window?: boolean
          bathrooms?: number | null
          bedrooms?: number | null
          blinds?: string[]
          build_year?: number | null
          building_amenities?: string[]
          building_floors?: number | null
          building_structure?: string | null
          building_type?: string | null
          built_surface?: number | null
          category?: string | null
          city?: string | null
          collaboration?: boolean
          comfort?: string | null
          commission?: string | null
          construction_stage?: string | null
          cooling_systems?: string[]
          county?: string | null
          county_siruta_code?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string | null
          destination?: string | null
          district?: string | null
          entry_door?: string[]
          external_id?: string | null
          features?: string[]
          finish_state?: string | null
          floor?: number | null
          floor_finishes?: string[]
          floor_label?: string | null
          for_rent?: boolean
          for_sale?: boolean
          furnishing?: string | null
          garages?: number | null
          garden_surface?: number | null
          has_attic?: boolean
          has_basement?: boolean
          has_ground_floor?: boolean
          has_loft?: boolean
          has_semi_basement?: boolean
          heating?: string | null
          heating_systems?: string[]
          id?: string
          insulation?: string[]
          interior_doors?: string[]
          internal_notes?: string | null
          key_in_agency?: boolean
          kitchen_features?: string[]
          kitchens?: number | null
          land_surface?: number | null
          last_activity_at?: string | null
          lat?: number | null
          layout?: string | null
          lng?: number | null
          locality_siruta_code?: number | null
          location_precise?: boolean
          metering?: string[]
          misc_features?: string[]
          negotiable?: boolean
          open_kitchen?: boolean
          organization_id?: string
          orientation?: string | null
          owner_contact_id?: string | null
          parking?: string | null
          parking_spaces?: number | null
          pet_friendly?: boolean
          price?: number | null
          property_type?: string
          publish_status?: string
          published_at?: string | null
          recessed_floors?: number | null
          reference?: string | null
          renovation_year?: number | null
          rent_currency?: string | null
          rent_price?: number | null
          rooms?: number | null
          sale_currency?: string | null
          sale_price?: number | null
          seismic_risk?: string | null
          shutters?: string[]
          source?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          street?: string | null
          street_arrangement?: string[]
          street_number?: string | null
          surface?: number | null
          tags?: string[]
          terrace_surface?: number | null
          terraces?: number | null
          title?: string
          total_usable_surface?: number | null
          transaction_kind?: Database["public"]["Enums"]["transaction_kind"]
          uat_siruta_code?: number | null
          updated_at?: string
          updated_by?: string | null
          usable_surface?: number | null
          utilities?: string[]
          vat_included?: boolean
          views?: string[]
          wall_finishes?: string[]
          windows?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "properties_county_siruta_code_fkey"
            columns: ["county_siruta_code"]
            isOneToOne: false
            referencedRelation: "ro_counties"
            referencedColumns: ["siruta_code"]
          },
          {
            foreignKeyName: "properties_locality_siruta_code_fkey"
            columns: ["locality_siruta_code"]
            isOneToOne: false
            referencedRelation: "ro_localities"
            referencedColumns: ["siruta_code"]
          },
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
          {
            foreignKeyName: "properties_uat_siruta_code_fkey"
            columns: ["uat_siruta_code"]
            isOneToOne: false
            referencedRelation: "ro_uats"
            referencedColumns: ["siruta_code"]
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
      ro_counties: {
        Row: {
          active: boolean
          county_code: number
          created_at: string
          id: string
          name: string
          normalized_name: string | null
          nuts_code: string | null
          region_code: number | null
          siruta_code: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          county_code: number
          created_at?: string
          id?: string
          name: string
          normalized_name?: string | null
          nuts_code?: string | null
          region_code?: number | null
          siruta_code: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          county_code?: number
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string | null
          nuts_code?: string | null
          region_code?: number | null
          siruta_code?: number
          updated_at?: string
        }
        Relationships: []
      }
      ro_localities: {
        Row: {
          active: boolean
          county_id: string
          county_siruta_code: number
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          medium: string | null
          name: string
          normalized_name: string | null
          parent_siruta_code: number
          postal_code: string | null
          siruta_code: number
          type: string
          type_code: number
          uat_id: string
          uat_siruta_code: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          county_id: string
          county_siruta_code: number
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          medium?: string | null
          name: string
          normalized_name?: string | null
          parent_siruta_code: number
          postal_code?: string | null
          siruta_code: number
          type: string
          type_code: number
          uat_id: string
          uat_siruta_code: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          county_id?: string
          county_siruta_code?: number
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          medium?: string | null
          name?: string
          normalized_name?: string | null
          parent_siruta_code?: number
          postal_code?: string | null
          siruta_code?: number
          type?: string
          type_code?: number
          uat_id?: string
          uat_siruta_code?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ro_localities_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "ro_counties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ro_localities_uat_id_fkey"
            columns: ["uat_id"]
            isOneToOne: false
            referencedRelation: "ro_uats"
            referencedColumns: ["id"]
          },
        ]
      }
      ro_nomenclature_meta: {
        Row: {
          counties_count: number
          created_at: string
          id: string
          imported_at: string
          localities_count: number
          source_url: string | null
          uats_count: number
          updated_at: string
          version: string
        }
        Insert: {
          counties_count?: number
          created_at?: string
          id: string
          imported_at?: string
          localities_count?: number
          source_url?: string | null
          uats_count?: number
          updated_at?: string
          version: string
        }
        Update: {
          counties_count?: number
          created_at?: string
          id?: string
          imported_at?: string
          localities_count?: number
          source_url?: string | null
          uats_count?: number
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      ro_uats: {
        Row: {
          active: boolean
          county_id: string
          county_siruta_code: number
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          medium: string | null
          name: string
          normalized_name: string | null
          parent_siruta_code: number | null
          postal_code: string | null
          siruta_code: number
          type: string
          type_code: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          county_id: string
          county_siruta_code: number
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          medium?: string | null
          name: string
          normalized_name?: string | null
          parent_siruta_code?: number | null
          postal_code?: string | null
          siruta_code: number
          type: string
          type_code: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          county_id?: string
          county_siruta_code?: number
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          medium?: string | null
          name?: string
          normalized_name?: string | null
          parent_siruta_code?: number | null
          postal_code?: string | null
          siruta_code?: number
          type?: string
          type_code?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ro_uats_county_id_fkey"
            columns: ["county_id"]
            isOneToOne: false
            referencedRelation: "ro_counties"
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
      site_feed_access_logs: {
        Row: {
          created_at: string
          detail: string | null
          endpoint: string
          id: string
          items: number | null
          method: string
          organization_id: string | null
          status: number
          token_prefix: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          endpoint: string
          id?: string
          items?: number | null
          method: string
          organization_id?: string | null
          status: number
          token_prefix?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          endpoint?: string
          id?: string
          items?: number | null
          method?: string
          organization_id?: string | null
          status?: number
          token_prefix?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_feed_access_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_feed_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_used_at: string | null
          name: string
          organization_id: string
          request_count: number
          revoked_at: string | null
          token_hash: string
          token_prefix: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          organization_id: string
          request_count?: number
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          request_count?: number
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_feed_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_feed_visits: {
        Row: {
          created_at: string
          id: string
          occurred_on: string
          organization_id: string
          property_id: string
          source: string | null
          updated_at: string
          views: number
        }
        Insert: {
          created_at?: string
          id?: string
          occurred_on?: string
          organization_id: string
          property_id: string
          source?: string | null
          updated_at?: string
          views?: number
        }
        Update: {
          created_at?: string
          id?: string
          occurred_on?: string
          organization_id?: string
          property_id?: string
          source?: string | null
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_feed_visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_feed_visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
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
      admin_change_user_organization: {
        Args: { _new_org: string; _user_id: string }
        Returns: undefined
      }
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
      plan_agent_limit: { Args: { _plan: string }; Returns: number }
      qa_purge_demo_organization: { Args: { _org: string }; Returns: string[] }
      qa_reset_demo_organization: { Args: { _org: string }; Returns: Json }
      ro_normalize_name: { Args: { _v: string }; Returns: string }
      site_feed_record_visit: {
        Args: {
          _occurred_on: string
          _org: string
          _property: string
          _source: string
          _views: number
        }
        Returns: undefined
      }
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
