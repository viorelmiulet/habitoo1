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
      agency_registration_requests: {
        Row: {
          agency_name: string
          created_at: string
          cui: string
          email: string | null
          full_name: string
          id: string
          legal_name: string
          organization_id: string | null
          phone: string | null
          rejection_reason: string | null
          requested_plan: string
          requested_term: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trade_registry_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_name: string
          created_at?: string
          cui: string
          email?: string | null
          full_name: string
          id?: string
          legal_name: string
          organization_id?: string | null
          phone?: string | null
          rejection_reason?: string | null
          requested_plan?: string
          requested_term?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trade_registry_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_name?: string
          created_at?: string
          cui?: string
          email?: string | null
          full_name?: string
          id?: string
          legal_name?: string
          organization_id?: string | null
          phone?: string | null
          rejection_reason?: string | null
          requested_plan?: string
          requested_term?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trade_registry_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_registration_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      collaboration_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          proposal_id: string
          sender_id: string
          sender_organization_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          proposal_id: string
          sender_id: string
          sender_organization_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          proposal_id?: string
          sender_id?: string
          sender_organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_messages_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "collaboration_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_messages_sender_organization_id_fkey"
            columns: ["sender_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_proposals: {
        Row: {
          client_label: string
          contact_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          message: string | null
          owner_organization_id: string
          property_id: string
          requester_organization_id: string
          requester_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_label: string
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          message?: string | null
          owner_organization_id: string
          property_id: string
          requester_organization_id: string
          requester_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_label?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          message?: string | null
          owner_organization_id?: string
          property_id?: string
          requester_organization_id?: string
          requester_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_proposals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_proposals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_proposals_owner_organization_id_fkey"
            columns: ["owner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_proposals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_proposals_requester_organization_id_fkey"
            columns: ["requester_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          agency: string
          created_at: string
          email: string
          id: string
          interest: string
          message: string
          name: string
          phone: string | null
          source_path: string | null
          status: string
          user_agent: string | null
        }
        Insert: {
          agency: string
          created_at?: string
          email: string
          id?: string
          interest: string
          message: string
          name: string
          phone?: string | null
          source_path?: string | null
          status?: string
          user_agent?: string | null
        }
        Update: {
          agency?: string
          created_at?: string
          email?: string
          id?: string
          interest?: string
          message?: string
          name?: string
          phone?: string | null
          source_path?: string | null
          status?: string
          user_agent?: string | null
        }
        Relationships: []
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
      cron_job_nonces: {
        Row: {
          created_at: string
          purpose: string
          token: string
        }
        Insert: {
          created_at?: string
          purpose: string
          token: string
        }
        Update: {
          created_at?: string
          purpose?: string
          token?: string
        }
        Relationships: []
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
      email_attachments: {
        Row: {
          checksum: string | null
          content_type: string
          created_at: string
          filename: string
          id: string
          message_id: string
          rejected_reason: string | null
          size_bytes: number
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          checksum?: string | null
          content_type: string
          created_at?: string
          filename: string
          id?: string
          message_id: string
          rejected_reason?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          checksum?: string | null
          content_type?: string
          created_at?: string
          filename?: string
          id?: string
          message_id?: string
          rejected_reason?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          error_code: string | null
          event_key: string
          event_type: string
          id: string
          message_id: string | null
          occurred_at: string | null
          provider: string
          provider_message_id: string | null
          reason: string | null
          received_at: string
          recipient_hash: string | null
          severity: string | null
        }
        Insert: {
          error_code?: string | null
          event_key: string
          event_type: string
          id?: string
          message_id?: string | null
          occurred_at?: string | null
          provider?: string
          provider_message_id?: string | null
          reason?: string | null
          received_at?: string
          recipient_hash?: string | null
          severity?: string | null
        }
        Update: {
          error_code?: string | null
          event_key?: string
          event_type?: string
          id?: string
          message_id?: string | null
          occurred_at?: string | null
          provider?: string
          provider_message_id?: string | null
          reason?: string | null
          received_at?: string
          recipient_hash?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          message_id: string | null
          next_retry_at: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          message_id?: string | null
          next_retry_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          message_id?: string | null
          next_retry_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          cc_emails: string[]
          created_at: string
          delivered_at: string | null
          delivery_status: string
          direction: string
          error_code: string | null
          from_email: string
          from_name: string | null
          has_attachments: boolean
          html_body: string | null
          id: string
          in_reply_to: string | null
          is_read: boolean
          last_error: string | null
          mailbox_id: string
          message_references: string[]
          provider: string
          provider_message_id: string | null
          received_at: string | null
          reply_to: string | null
          send_key: string | null
          sent_at: string | null
          size_bytes: number | null
          status: string
          stripped_text: string | null
          subject: string | null
          text_body: string | null
          thread_id: string | null
          to_emails: string[]
          updated_at: string
        }
        Insert: {
          cc_emails?: string[]
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          direction: string
          error_code?: string | null
          from_email: string
          from_name?: string | null
          has_attachments?: boolean
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          last_error?: string | null
          mailbox_id: string
          message_references?: string[]
          provider?: string
          provider_message_id?: string | null
          received_at?: string | null
          reply_to?: string | null
          send_key?: string | null
          sent_at?: string | null
          size_bytes?: number | null
          status?: string
          stripped_text?: string | null
          subject?: string | null
          text_body?: string | null
          thread_id?: string | null
          to_emails?: string[]
          updated_at?: string
        }
        Update: {
          cc_emails?: string[]
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string
          direction?: string
          error_code?: string | null
          from_email?: string
          from_name?: string | null
          has_attachments?: boolean
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          last_error?: string | null
          mailbox_id?: string
          message_references?: string[]
          provider?: string
          provider_message_id?: string | null
          received_at?: string | null
          reply_to?: string | null
          send_key?: string | null
          sent_at?: string | null
          size_bytes?: number | null
          status?: string
          stripped_text?: string | null
          subject?: string | null
          text_body?: string | null
          thread_id?: string | null
          to_emails?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          created_at: string
          id: string
          last_direction: string | null
          last_message_at: string | null
          mailbox_id: string
          message_count: number
          participants: string[]
          status: string
          subject: string | null
          subject_key: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_direction?: string | null
          last_message_at?: string | null
          mailbox_id: string
          message_count?: number
          participants?: string[]
          status?: string
          subject?: string | null
          subject_key: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_direction?: string | null
          last_message_at?: string | null
          mailbox_id?: string
          message_count?: number
          participants?: string[]
          status?: string
          subject?: string | null
          subject_key?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
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
      impersonation_requests: {
        Row: {
          approve_token_hash: string | null
          approve_token_used_at: string | null
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          mode: string
          reason: string
          requested_at: string
          responded_at: string | null
          responded_via: string | null
          revoke_token_hash: string | null
          revoke_token_used_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          superadmin_id: string
          target_user_id: string
          updated_at: string
        }
        Insert: {
          approve_token_hash?: string | null
          approve_token_used_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          mode?: string
          reason: string
          requested_at?: string
          responded_at?: string | null
          responded_via?: string | null
          revoke_token_hash?: string | null
          revoke_token_used_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          superadmin_id: string
          target_user_id: string
          updated_at?: string
        }
        Update: {
          approve_token_hash?: string | null
          approve_token_used_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          mode?: string
          reason?: string
          requested_at?: string
          responded_at?: string | null
          responded_via?: string | null
          revoke_token_hash?: string | null
          revoke_token_used_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          superadmin_id?: string
          target_user_id?: string
          updated_at?: string
        }
        Relationships: []
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
      mail_outbound_uploads: {
        Row: {
          consumed_at: string | null
          content_type: string
          created_at: string
          created_by: string
          expires_at: string
          filename: string
          id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          consumed_at?: string | null
          content_type: string
          created_at?: string
          created_by: string
          expires_at?: string
          filename: string
          id?: string
          size_bytes?: number
          storage_path: string
        }
        Update: {
          consumed_at?: string | null
          content_type?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          filename?: string
          id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: []
      }
      mail_rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      mail_webhook_nonces: {
        Row: {
          bucket: string
          created_at: string
          token: string
        }
        Insert: {
          bucket: string
          created_at?: string
          token: string
        }
        Update: {
          bucket?: string
          created_at?: string
          token?: string
        }
        Relationships: []
      }
      mailboxes: {
        Row: {
          address: string
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailboxes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          archived_at: string | null
          archived_by: string | null
          city: string | null
          collaboration_enabled: boolean
          created_at: string
          created_by: string | null
          cui: string | null
          demo_seed_version: string | null
          demo_seeded_at: string | null
          email: string | null
          id: string
          is_demo: boolean
          legal_name: string | null
          logo_path: string | null
          logo_url: string | null
          material_accent_color: string
          material_address: string | null
          material_email: string | null
          material_phone: string | null
          material_show_habitoo: boolean
          material_website: string | null
          max_properties: number
          max_users: number
          name: string
          phone: string | null
          plan: string
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          subscription_expires_at: string | null
          subscription_grace_notified_at: string | null
          subscription_started_at: string | null
          subscription_term: string | null
          suspended_reason: string | null
          trade_registry_number: string | null
          updated_at: string
          updated_by: string | null
          watermark_enabled: boolean
          watermark_margin_percent: number
          watermark_opacity_percent: number
          watermark_position: string
          watermark_scale_percent: number
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          collaboration_enabled?: boolean
          created_at?: string
          created_by?: string | null
          cui?: string | null
          demo_seed_version?: string | null
          demo_seeded_at?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          legal_name?: string | null
          logo_path?: string | null
          logo_url?: string | null
          material_accent_color?: string
          material_address?: string | null
          material_email?: string | null
          material_phone?: string | null
          material_show_habitoo?: boolean
          material_website?: string | null
          max_properties?: number
          max_users?: number
          name: string
          phone?: string | null
          plan?: string
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          subscription_expires_at?: string | null
          subscription_grace_notified_at?: string | null
          subscription_started_at?: string | null
          subscription_term?: string | null
          suspended_reason?: string | null
          trade_registry_number?: string | null
          updated_at?: string
          updated_by?: string | null
          watermark_enabled?: boolean
          watermark_margin_percent?: number
          watermark_opacity_percent?: number
          watermark_position?: string
          watermark_scale_percent?: number
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          collaboration_enabled?: boolean
          created_at?: string
          created_by?: string | null
          cui?: string | null
          demo_seed_version?: string | null
          demo_seeded_at?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          legal_name?: string | null
          logo_path?: string | null
          logo_url?: string | null
          material_accent_color?: string
          material_address?: string | null
          material_email?: string | null
          material_phone?: string | null
          material_show_habitoo?: boolean
          material_website?: string | null
          max_properties?: number
          max_users?: number
          name?: string
          phone?: string | null
          plan?: string
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          subscription_expires_at?: string | null
          subscription_grace_notified_at?: string | null
          subscription_started_at?: string | null
          subscription_term?: string | null
          suspended_reason?: string | null
          trade_registry_number?: string | null
          updated_at?: string
          updated_by?: string | null
          watermark_enabled?: boolean
          watermark_margin_percent?: number
          watermark_opacity_percent?: number
          watermark_position?: string
          watermark_scale_percent?: number
        }
        Relationships: []
      }
      portal_activation_requests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          organization_id: string
          portal: string
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          portal: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          portal?: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_activation_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          public_url: string | null
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
          public_url?: string | null
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
          public_url?: string | null
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
      portal_messages: {
        Row: {
          body: string | null
          created_at: string
          expires_at: string
          external_message_id: string | null
          id: string
          lead_id: string | null
          organization_id: string
          portal: string
          property_id: string | null
          sender_email: string | null
          sender_name: string | null
          sender_phone: string | null
          sent_at: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          expires_at?: string
          external_message_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          portal: string
          property_id?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sent_at?: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          expires_at?: string
          external_message_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          portal?: string
          property_id?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sent_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_messages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          organization_id: string
          portal: string
          state_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          organization_id: string
          portal: string
          state_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          portal?: string
          state_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_oauth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      portal_taxonomy_cache: {
        Row: {
          categories: Json
          created_at: string
          discrepancies: Json
          fetched_at: string
          fetched_by: string | null
          id: string
          organization_id: string | null
          portal: string
          site_urn: string
          updated_at: string
        }
        Insert: {
          categories?: Json
          created_at?: string
          discrepancies?: Json
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          organization_id?: string | null
          portal: string
          site_urn: string
          updated_at?: string
        }
        Update: {
          categories?: Json
          created_at?: string
          discrepancies?: Json
          fetched_at?: string
          fetched_by?: string | null
          id?: string
          organization_id?: string | null
          portal?: string
          site_urn?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_taxonomy_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_webhook_events: {
        Row: {
          headers: Json
          http_method: string
          id: string
          organization_id: string | null
          parsed_payload: Json | null
          portal: string
          process_note: string | null
          processed: boolean
          raw_payload: string | null
          received_at: string
          signature_note: string | null
          signature_present: boolean
          signature_valid: boolean | null
        }
        Insert: {
          headers?: Json
          http_method: string
          id?: string
          organization_id?: string | null
          parsed_payload?: Json | null
          portal: string
          process_note?: string | null
          processed?: boolean
          raw_payload?: string | null
          received_at?: string
          signature_note?: string | null
          signature_present?: boolean
          signature_valid?: boolean | null
        }
        Update: {
          headers?: Json
          http_method?: string
          id?: string
          organization_id?: string | null
          parsed_payload?: Json | null
          portal?: string
          process_note?: string | null
          processed?: boolean
          raw_payload?: string | null
          received_at?: string
          signature_note?: string | null
          signature_present?: boolean
          signature_valid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          archived_at: string | null
          archived_by: string | null
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
          collab_commission_percent: number | null
          collab_terms: string | null
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
          pre_archive_status:
            | Database["public"]["Enums"]["property_status"]
            | null
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
          archived_at?: string | null
          archived_by?: string | null
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
          collab_commission_percent?: number | null
          collab_terms?: string | null
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
          pre_archive_status?:
            | Database["public"]["Enums"]["property_status"]
            | null
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
          archived_at?: string | null
          archived_by?: string | null
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
          collab_commission_percent?: number | null
          collab_terms?: string | null
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
          pre_archive_status?:
            | Database["public"]["Enums"]["property_status"]
            | null
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
      support_ticket_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_internal_note: boolean
          is_staff: boolean
          sender_id: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          is_staff?: boolean
          sender_id?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          is_staff?: boolean
          sender_id?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          context_path: string | null
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          last_reply_by_staff: boolean
          organization_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          category?: string
          context_path?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          last_reply_by_staff?: boolean
          organization_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          category?: string
          context_path?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          last_reply_by_staff?: boolean
          organization_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
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
      admin_change_user_organization: {
        Args: { _new_org: string; _user_id: string }
        Returns: undefined
      }
      approve_organization: { Args: { _org: string }; Returns: undefined }
      approve_registration_request: {
        Args: { _request_id: string }
        Returns: string
      }
      bootstrap_agency: {
        Args: {
          _agency_name: string
          _cui?: string
          _full_name: string
          _legal_name?: string
          _phone?: string
          _trade_registry_number?: string
        }
        Returns: string
      }
      can_access_ticket: { Args: { _ticket_id: string }; Returns: boolean }
      cron_nonce_claim: {
        Args: { _purpose: string; _token: string }
        Returns: boolean
      }
      cron_nonce_issue: { Args: { _purpose: string }; Returns: string }
      current_org: { Args: never; Returns: string }
      email_job_finish: {
        Args: { _error?: string; _job_id: string; _ok: boolean }
        Returns: undefined
      }
      email_jobs_claim: {
        Args: { _kind: string; _limit?: number }
        Returns: {
          attempts: number
          id: string
          max_attempts: number
          message_id: string
          payload: Json
        }[]
      }
      email_thread_refresh: { Args: { _thread_id: string }; Returns: undefined }
      email_thread_upsert: {
        Args: {
          _mailbox_id: string
          _participants: string[]
          _subject: string
          _subject_key: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      impersonation_expire_stale: { Args: never; Returns: undefined }
      impersonation_preview_by_token: {
        Args: { _hash: string; _id: string }
        Returns: Json
      }
      impersonation_request_create: {
        Args: { _reason: string; _target: string }
        Returns: string
      }
      impersonation_respond: {
        Args: { _accept: boolean; _id: string }
        Returns: undefined
      }
      impersonation_respond_by_token: {
        Args: { _accept: boolean; _hash: string; _id: string }
        Returns: Json
      }
      impersonation_revoke: { Args: { _id: string }; Returns: undefined }
      impersonation_revoke_by_token: {
        Args: { _hash: string; _id: string }
        Returns: Json
      }
      impersonation_set_approve_token: {
        Args: { _hash: string; _id: string }
        Returns: undefined
      }
      impersonation_target: { Args: { _id: string }; Returns: string }
      is_org_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      mail_rate_limit_hit: {
        Args: { _bucket: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      mail_thread_list: {
        Args: {
          _has_attachments?: boolean
          _limit: number
          _mailbox_id: string
          _offset: number
          _status: string
          _unread_only?: boolean
        }
        Returns: {
          has_attachments: boolean
          id: string
          last_direction: string
          last_has_html: boolean
          last_message_at: string
          last_stripped_text: string
          last_text_body: string
          mailbox_id: string
          message_count: number
          participants: string[]
          status: string
          subject: string
          unread_count: number
        }[]
      }
      mail_thread_search: {
        Args: {
          _from?: string
          _has_attachments?: boolean
          _limit: number
          _mailbox_id: string
          _offset: number
          _q?: string
          _status: string
          _to?: string
          _unread_only?: boolean
        }
        Returns: {
          has_attachments: boolean
          id: string
          last_direction: string
          last_has_html: boolean
          last_message_at: string
          last_stripped_text: string
          last_text_body: string
          mailbox_id: string
          message_count: number
          participants: string[]
          status: string
          subject: string
          unread_count: number
        }[]
      }
      mail_thread_search_count: {
        Args: {
          _from?: string
          _has_attachments?: boolean
          _mailbox_id: string
          _q?: string
          _status: string
          _to?: string
          _unread_only?: boolean
        }
        Returns: number
      }
      mail_webhook_nonce_claim: {
        Args: { _bucket: string; _token: string; _ttl_seconds: number }
        Returns: boolean
      }
      next_property_reference: { Args: never; Returns: string }
      org_access_blocked: { Args: never; Returns: string }
      plan_agent_limit: { Args: { _plan: string }; Returns: number }
      purge_expired_portal_messages: { Args: never; Returns: number }
      qa_purge_demo_organization: { Args: { _org: string }; Returns: string[] }
      qa_reset_demo_organization: { Args: { _org: string }; Returns: Json }
      reject_registration_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: undefined
      }
      ro_normalize_name: { Args: { _v: string }; Returns: string }
      set_organization_subscription: {
        Args: { _org: string; _term: string }
        Returns: string
      }
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
      submit_agency_registration_request:
        | {
            Args: {
              _agency_name: string
              _cui: string
              _full_name: string
              _legal_name: string
              _phone?: string
              _trade_registry_number: string
            }
            Returns: string
          }
        | {
            Args: {
              _agency_name: string
              _cui: string
              _full_name: string
              _legal_name: string
              _phone?: string
              _requested_plan?: string
              _requested_term?: string
              _trade_registry_number: string
            }
            Returns: string
          }
      subscription_cron_tick: { Args: never; Returns: Json }
      subscription_enforce_daily: { Args: never; Returns: Json }
      superadmin_delete_organization: {
        Args: { _actor?: string; _org: string }
        Returns: Json
      }
      superadmin_delete_user: {
        Args: { _actor?: string; _reassign_to?: string; _user: string }
        Returns: Json
      }
      superadmin_reassign_user_data: {
        Args: { _actor?: string; _from: string; _to: string }
        Returns: Json
      }
      superadmin_user_workload: {
        Args: { _actor?: string; _user: string }
        Returns: Json
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
      org_status:
        | "active"
        | "trial"
        | "suspended"
        | "cancelled"
        | "pending_approval"
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
      org_status: [
        "active",
        "trial",
        "suspended",
        "cancelled",
        "pending_approval",
      ],
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
