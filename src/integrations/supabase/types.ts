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
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: string | null
          metadata: Json
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      agent_tasks: {
        Row: {
          agent_code: string
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          output: Json | null
          position: number
          run_id: string
          started_at: string | null
          status: string
          task_type: string
        }
        Insert: {
          agent_code: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          output?: Json | null
          position?: number
          run_id: string
          started_at?: string | null
          status?: string
          task_type: string
        }
        Update: {
          agent_code?: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          output?: Json | null
          position?: number
          run_id?: string
          started_at?: string | null
          status?: string
          task_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          code: string
          configuration: Json
          created_at: string
          description: string
          id: string
          is_enabled: boolean
          name: string
          position: number
          role: string
          updated_at: string
        }
        Insert: {
          code: string
          configuration?: Json
          created_at?: string
          description?: string
          id?: string
          is_enabled?: boolean
          name: string
          position?: number
          role: string
          updated_at?: string
        }
        Update: {
          code?: string
          configuration?: Json
          created_at?: string
          description?: string
          id?: string
          is_enabled?: boolean
          name?: string
          position?: number
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          billing_cycle: string
          created_at: string
          custom_seat_price_cents: number | null
          id: string
          name: string
          owner_id: string
          pending_billing_cycle: string | null
          pending_plan_id: string | null
          pending_requested_at: string | null
          plan_id: string | null
          seat_limit: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          created_at?: string
          custom_seat_price_cents?: number | null
          id?: string
          name: string
          owner_id: string
          pending_billing_cycle?: string | null
          pending_plan_id?: string | null
          pending_requested_at?: string | null
          plan_id?: string | null
          seat_limit?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          custom_seat_price_cents?: number | null
          id?: string
          name?: string
          owner_id?: string
          pending_billing_cycle?: string | null
          pending_plan_id?: string | null
          pending_requested_at?: string | null
          plan_id?: string | null
          seat_limit?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      company_chat_messages: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          recipient_id: string | null
          sender_id: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          id?: string
          recipient_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          recipient_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invitations: {
        Row: {
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          status: string
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          status?: string
          token?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invoices: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          id: string
          notes: string | null
          number: string
          paid_at: string | null
          pdf_url: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_invoice_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          number: string
          paid_at?: string | null
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_invoice_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          number?: string
          paid_at?: string | null
          pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_invoice_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          department: string | null
          hierarchy_level: number
          id: string
          joined_at: string
          manager_id: string | null
          position_title: string | null
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          department?: string | null
          hierarchy_level?: number
          id?: string
          joined_at?: string
          manager_id?: string | null
          position_title?: string | null
          role: string
          user_id: string
        }
        Update: {
          company_id?: string
          department?: string | null
          hierarchy_level?: number
          id?: string
          joined_at?: string
          manager_id?: string | null
          position_title?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      company_modules: {
        Row: {
          company_id: string
          enabled: boolean
          enabled_at: string
          module_code: string
          updated_at: string
        }
        Insert: {
          company_id: string
          enabled?: boolean
          enabled_at?: string
          module_code: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          enabled?: boolean
          enabled_at?: string
          module_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_modules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_name_risk_cache: {
        Row: {
          checked_at: string
          evidence: string | null
          matched_entity: string | null
          original_name: string
          risk_level: string
          slug: string
        }
        Insert: {
          checked_at?: string
          evidence?: string | null
          matched_entity?: string | null
          original_name: string
          risk_level: string
          slug: string
        }
        Update: {
          checked_at?: string
          evidence?: string | null
          matched_entity?: string | null
          original_name?: string
          risk_level?: string
          slug?: string
        }
        Relationships: []
      }
      company_verification_requests: {
        Row: {
          admin_note: string | null
          ai_check_report: Json | null
          ai_check_status: string | null
          created_at: string
          full_legal_name: string | null
          id: string
          identity_document_path: string | null
          identity_document_type: string | null
          message: string | null
          proof_path: string | null
          requested_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string | null
          slug: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          ai_check_report?: Json | null
          ai_check_status?: string | null
          created_at?: string
          full_legal_name?: string | null
          id?: string
          identity_document_path?: string | null
          identity_document_type?: string | null
          message?: string | null
          proof_path?: string | null
          requested_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          slug: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          ai_check_report?: Json | null
          ai_check_status?: string | null
          created_at?: string
          full_legal_name?: string | null
          id?: string
          identity_document_path?: string | null
          identity_document_type?: string | null
          message?: string | null
          proof_path?: string | null
          requested_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          slug?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_companies: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          industry: string | null
          name: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          industry?: string | null
          name: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          company_id: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          position: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          position?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          position?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          expected_close_date: string | null
          id: string
          stage: string | null
          title: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          expected_close_date?: string | null
          id?: string
          stage?: string | null
          title: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          expected_close_date?: string | null
          id?: string
          stage?: string | null
          title?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number
          storage_path: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          author_id: string | null
          category: string
          company_id: string | null
          created_at: string | null
          description: string | null
          file_url: string
          folder_id: string | null
          id: string
          metadata: Json | null
          mime_type: string | null
          report_id: string | null
          size_bytes: number
          title: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          author_id?: string | null
          category?: string
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          file_url: string
          folder_id?: string | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          report_id?: string | null
          size_bytes?: number
          title: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          author_id?: string | null
          category?: string
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          file_url?: string
          folder_id?: string | null
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          report_id?: string | null
          size_bytes?: number
          title?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          auth_type: string
          connection_key_ciphertext: string | null
          created_at: string
          display_name: string | null
          email: string
          gateway_account_id: string | null
          id: string
          imap_host: string | null
          imap_password_ciphertext: string | null
          imap_port: number | null
          imap_security: string | null
          imap_username: string | null
          is_primary: boolean
          label: string | null
          last_sync_at: string | null
          oauth_access_token_ciphertext: string | null
          oauth_expires_at: string | null
          oauth_refresh_token_ciphertext: string | null
          oauth_scope: string | null
          provider: string
          signature: string | null
          signature_mode: string
          smtp_host: string | null
          smtp_port: number | null
          smtp_security: string | null
          status: string
          status_message: string | null
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_type?: string
          connection_key_ciphertext?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          gateway_account_id?: string | null
          id?: string
          imap_host?: string | null
          imap_password_ciphertext?: string | null
          imap_port?: number | null
          imap_security?: string | null
          imap_username?: string | null
          is_primary?: boolean
          label?: string | null
          last_sync_at?: string | null
          oauth_access_token_ciphertext?: string | null
          oauth_expires_at?: string | null
          oauth_refresh_token_ciphertext?: string | null
          oauth_scope?: string | null
          provider: string
          signature?: string | null
          signature_mode?: string
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_security?: string | null
          status?: string
          status_message?: string | null
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_type?: string
          connection_key_ciphertext?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          gateway_account_id?: string | null
          id?: string
          imap_host?: string | null
          imap_password_ciphertext?: string | null
          imap_port?: number | null
          imap_security?: string | null
          imap_username?: string | null
          is_primary?: boolean
          label?: string | null
          last_sync_at?: string | null
          oauth_access_token_ciphertext?: string | null
          oauth_expires_at?: string | null
          oauth_refresh_token_ciphertext?: string | null
          oauth_scope?: string | null
          provider?: string
          signature?: string | null
          signature_mode?: string
          smtp_host?: string | null
          smtp_port?: number | null
          smtp_security?: string | null
          status?: string
          status_message?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          account_id: string
          bcc_recipients: string
          body_html: string
          cc_recipients: string
          created_at: string
          id: string
          in_reply_to: string | null
          subject: string
          to_recipients: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          bcc_recipients?: string
          body_html?: string
          cc_recipients?: string
          created_at?: string
          id?: string
          in_reply_to?: string | null
          subject?: string
          to_recipients?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          bcc_recipients?: string
          body_html?: string
          cc_recipients?: string
          created_at?: string
          id?: string
          in_reply_to?: string | null
          subject?: string
          to_recipients?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_folders: {
        Row: {
          account_id: string
          created_at: string
          id: string
          kind: string
          name: string
          position: number
          provider_folder_id: string
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          position?: number
          provider_folder_id: string
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          position?: number
          provider_folder_id?: string
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_folders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_scheduled_messages: {
        Row: {
          account_id: string
          attachments: Json
          attempts: number
          bcc_recipients: string
          body_html: string
          cc_recipients: string
          created_at: string
          id: string
          in_reply_to: string | null
          last_error: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string
          to_recipients: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          attachments?: Json
          attempts?: number
          bcc_recipients?: string
          body_html?: string
          cc_recipients?: string
          created_at?: string
          id?: string
          in_reply_to?: string | null
          last_error?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_recipients?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          attachments?: Json
          attempts?: number
          bcc_recipients?: string
          body_html?: string
          cc_recipients?: string
          created_at?: string
          id?: string
          in_reply_to?: string | null
          last_error?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_recipients?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_scheduled_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_signatures: {
        Row: {
          account_id: string
          body_html: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          body_html?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          body_html?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_signatures_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_logs: {
        Row: {
          account_id: string | null
          action: string
          created_at: string
          error_message: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          action: string
          created_at?: string
          error_message?: string | null
          id?: string
          status: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          action?: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sync_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          scope: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_html?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          scope?: string
          subject?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_html?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          scope?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          author_id: string
          created_at: string | null
          description: string | null
          end_time: string
          event_type: string | null
          id: string
          location: string | null
          start_time: string
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          created_at?: string | null
          description?: string | null
          end_time: string
          event_type?: string | null
          id?: string
          location?: string | null
          start_time: string
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          created_at?: string | null
          description?: string | null
          end_time?: string
          event_type?: string | null
          id?: string
          location?: string | null
          start_time?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      expense_reports: {
        Row: {
          amount: number
          author_id: string
          category: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          decided_at: string | null
          decided_by: string | null
          decision_comment: string | null
          description: string | null
          expense_date: string
          id: string
          manager_id: string | null
          receipt_url: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          author_id: string
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_comment?: string | null
          description?: string | null
          expense_date: string
          id?: string
          manager_id?: string | null
          receipt_url?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          author_id?: string
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_comment?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          manager_id?: string | null
          receipt_url?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          cost_price: number | null
          created_at: string | null
          current_stock: number | null
          description: string | null
          id: string
          min_stock_alert: number | null
          name: string
          reference: string | null
          unit: string | null
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          cost_price?: number | null
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string
          min_stock_alert?: number | null
          name: string
          reference?: string | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          cost_price?: number | null
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string
          min_stock_alert?: number | null
          name?: string
          reference?: string | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          item_id: string
          movement_type: string
          quantity: number
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_id: string
          movement_type: string
          quantity: number
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_id?: string
          movement_type?: string
          quantity?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_approvals: {
        Row: {
          approver_id: string
          comment: string | null
          decided_at: string
          decision: string
          id: string
          level: number
          request_id: string
        }
        Insert: {
          approver_id: string
          comment?: string | null
          decided_at?: string
          decision: string
          id?: string
          level?: number
          request_id: string
        }
        Update: {
          approver_id?: string
          comment?: string | null
          decided_at?: string
          decision?: string
          id?: string
          level?: number
          request_id?: string
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          allocated_days: number
          company_id: string
          created_at: string
          id: string
          type_id: string
          updated_at: string
          used_days: number
          user_id: string
          year: number
        }
        Insert: {
          allocated_days?: number
          company_id: string
          created_at?: string
          id?: string
          type_id: string
          updated_at?: string
          used_days?: number
          user_id: string
          year: number
        }
        Update: {
          allocated_days?: number
          company_id?: string
          created_at?: string
          id?: string
          type_id?: string
          updated_at?: string
          used_days?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          company_id: string | null
          created_at: string | null
          current_approver_id: string | null
          days_count: number
          decided_at: string | null
          employee_id: string
          end_date: string
          half_end: boolean
          half_start: boolean
          id: string
          leave_type: string
          manager_id: string | null
          proof_path: string | null
          reason: string | null
          start_date: string
          status: string | null
          submitted_at: string | null
          type_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          current_approver_id?: string | null
          days_count?: number
          decided_at?: string | null
          employee_id: string
          end_date: string
          half_end?: boolean
          half_start?: boolean
          id?: string
          leave_type?: string
          manager_id?: string | null
          proof_path?: string | null
          reason?: string | null
          start_date: string
          status?: string | null
          submitted_at?: string | null
          type_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          current_approver_id?: string | null
          days_count?: number
          decided_at?: string | null
          employee_id?: string
          end_date?: string
          half_end?: boolean
          half_start?: boolean
          id?: string
          leave_type?: string
          manager_id?: string | null
          proof_path?: string | null
          reason?: string | null
          start_date?: string
          status?: string | null
          submitted_at?: string | null
          type_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          default_days: number
          id: string
          is_active: boolean
          is_paid: boolean
          name: string
          requires_proof: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          default_days?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name: string
          requires_proof?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          default_days?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name?: string
          requires_proof?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          report_id: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          report_id?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          report_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_only: boolean
          avatar_url: string | null
          banned_at: string | null
          banned_reason: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_banned: boolean
          updated_at: string
        }
        Insert: {
          admin_only?: boolean
          avatar_url?: string | null
          banned_at?: string | null
          banned_reason?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_banned?: boolean
          updated_at?: string
        }
        Update: {
          admin_only?: boolean
          avatar_url?: string | null
          banned_at?: string | null
          banned_reason?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_banned?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      project_budget_lines: {
        Row: {
          created_at: string
          id: string
          label: string
          planned: number
          position: number
          project_id: string
          spent: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          planned?: number
          position?: number
          project_id: string
          spent?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          planned?: number
          position?: number
          project_id?: string
          spent?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          project_id: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          project_id: string
          size_bytes?: number
          storage_path: string
          uploaded_by?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          project_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          contact: string
          created_at: string
          id: string
          name: string
          project_id: string
          role: string
        }
        Insert: {
          contact?: string
          created_at?: string
          id?: string
          name: string
          project_id: string
          role?: string
        }
        Update: {
          contact?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          position: number
          project_id: string
          responsible: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          position?: number
          project_id: string
          responsible?: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          position?: number
          project_id?: string
          responsible?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number
          category: string
          client: string
          code: string
          company_id: string | null
          context: string
          created_at: string
          currency: string
          deliverables: string
          end_date: string | null
          health: string
          id: string
          manager_name: string
          objectives: string
          owner_id: string
          priority: string
          progress: number
          start_date: string | null
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          budget?: number
          category?: string
          client?: string
          code: string
          company_id?: string | null
          context?: string
          created_at?: string
          currency?: string
          deliverables?: string
          end_date?: string | null
          health?: string
          id?: string
          manager_name?: string
          objectives?: string
          owner_id?: string
          priority?: string
          progress?: number
          start_date?: string | null
          status?: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          budget?: number
          category?: string
          client?: string
          code?: string
          company_id?: string | null
          context?: string
          created_at?: string
          currency?: string
          deliverables?: string
          end_date?: string | null
          health?: string
          id?: string
          manager_name?: string
          objectives?: string
          owner_id?: string
          priority?: string
          progress?: number
          start_date?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_approvals: {
        Row: {
          approver_id: string
          comment: string | null
          decided_at: string
          decision: string
          id: string
          level: number
          report_id: string
        }
        Insert: {
          approver_id: string
          comment?: string | null
          decided_at?: string
          decision: string
          id?: string
          level: number
          report_id: string
        }
        Update: {
          approver_id?: string
          comment?: string | null
          decided_at?: string
          decision?: string
          id?: string
          level?: number
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_approvals_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime_type: string
          position: number
          report_id: string
          section_id: string | null
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          position?: number
          report_id: string
          section_id?: string | null
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          position?: number
          report_id?: string
          section_id?: string | null
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_attachments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "report_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      report_budget_lines: {
        Row: {
          actual_amount: number
          category: string
          created_at: string
          id: string
          label: string
          notes: string
          planned_amount: number
          position: number
          quantity: number
          report_id: string
          unit: string
          unit_price: number
        }
        Insert: {
          actual_amount?: number
          category?: string
          created_at?: string
          id?: string
          label?: string
          notes?: string
          planned_amount?: number
          position?: number
          quantity?: number
          report_id: string
          unit?: string
          unit_price?: number
        }
        Update: {
          actual_amount?: number
          category?: string
          created_at?: string
          id?: string
          label?: string
          notes?: string
          planned_amount?: number
          position?: number
          quantity?: number
          report_id?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_budget_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_images: {
        Row: {
          caption: string
          created_at: string
          id: string
          position: number
          report_id: string
          section_id: string | null
          storage_path: string
        }
        Insert: {
          caption?: string
          created_at?: string
          id?: string
          position?: number
          report_id: string
          section_id?: string | null
          storage_path: string
        }
        Update: {
          caption?: string
          created_at?: string
          id?: string
          position?: number
          report_id?: string
          section_id?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_images_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_images_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "report_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      report_minutes: {
        Row: {
          attendees: Json
          author_id: string
          created_at: string
          decisions: string
          facts: string
          held_at: string
          id: string
          location: string
          number: string
          report_id: string
          signature_url: string | null
          signer_name: string
          signer_role: string
          subject: string
          updated_at: string
        }
        Insert: {
          attendees?: Json
          author_id: string
          created_at?: string
          decisions?: string
          facts?: string
          held_at?: string
          id?: string
          location?: string
          number?: string
          report_id: string
          signature_url?: string | null
          signer_name?: string
          signer_role?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          attendees?: Json
          author_id?: string
          created_at?: string
          decisions?: string
          facts?: string
          held_at?: string
          id?: string
          location?: string
          number?: string
          report_id?: string
          signature_url?: string | null
          signer_name?: string
          signer_role?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_minutes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          report_id: string
          section_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          report_id: string
          section_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          report_id?: string
          section_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_notes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_notes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "report_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      report_run_audit_logs: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          event_details: Json
          event_type: string
          id: string
          run_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          created_at?: string
          event_details?: Json
          event_type: string
          id?: string
          run_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          event_details?: Json
          event_type?: string
          id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_run_audit_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          current_step: string | null
          error_summary: string | null
          id: string
          input_parameters: Json
          instructions: string
          period_end: string
          period_start: string
          quality_status: string | null
          report_type: string
          requested_by: string
          result_report_id: string | null
          sources: string[]
          started_at: string | null
          state: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_summary?: string | null
          id?: string
          input_parameters?: Json
          instructions?: string
          period_end: string
          period_start: string
          quality_status?: string | null
          report_type: string
          requested_by: string
          result_report_id?: string | null
          sources?: string[]
          started_at?: string | null
          state?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_summary?: string | null
          id?: string
          input_parameters?: Json
          instructions?: string
          period_end?: string
          period_start?: string
          quality_status?: string | null
          report_type?: string
          requested_by?: string
          result_report_id?: string | null
          sources?: string[]
          started_at?: string | null
          state?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_result_report_id_fkey"
            columns: ["result_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          position: number
          report_id: string
          title: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          report_id: string
          title?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          report_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_sections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_shares: {
        Row: {
          created_at: string
          id: string
          permission: string
          report_id: string
          shared_by: string
          shared_with: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          report_id: string
          shared_by: string
          shared_with: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          report_id?: string
          shared_by?: string
          shared_with?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sources: {
        Row: {
          consolidated_report_id: string
          created_at: string
          id: string
          source_report_id: string
        }
        Insert: {
          consolidated_report_id: string
          created_at?: string
          id?: string
          source_report_id: string
        }
        Update: {
          consolidated_report_id?: string
          created_at?: string
          id?: string
          source_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_sources_consolidated_report_id_fkey"
            columns: ["consolidated_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_sources_source_report_id_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          approved_at: string | null
          author_id: string
          company_id: string | null
          conclusion: string | null
          counterparty: string | null
          created_at: string
          currency: string
          current_approver_id: string | null
          doc_number: string | null
          doc_type: string
          id: string
          intro: string | null
          kind: string
          period_end: string | null
          period_label: string | null
          period_start: string | null
          report_date: string
          share_expires_at: string | null
          share_token: string | null
          signature_image: string | null
          signed_at: string | null
          signer_name: string | null
          signer_role: string | null
          stamp_image: string | null
          status: string
          submitted_at: string | null
          tax_rate: number
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          author_id: string
          company_id?: string | null
          conclusion?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          current_approver_id?: string | null
          doc_number?: string | null
          doc_type?: string
          id?: string
          intro?: string | null
          kind?: string
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          report_date: string
          share_expires_at?: string | null
          share_token?: string | null
          signature_image?: string | null
          signed_at?: string | null
          signer_name?: string | null
          signer_role?: string | null
          stamp_image?: string | null
          status?: string
          submitted_at?: string | null
          tax_rate?: number
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          author_id?: string
          company_id?: string | null
          conclusion?: string | null
          counterparty?: string | null
          created_at?: string
          currency?: string
          current_approver_id?: string | null
          doc_number?: string | null
          doc_type?: string
          id?: string
          intro?: string | null
          kind?: string
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          report_date?: string
          share_expires_at?: string | null
          share_token?: string | null
          signature_image?: string | null
          signed_at?: string | null
          signer_name?: string | null
          signer_role?: string | null
          stamp_image?: string | null
          status?: string
          submitted_at?: string | null
          tax_rate?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_company_names: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          notes: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          notes?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          notes?: string | null
          slug?: string
        }
        Relationships: []
      }
      section_bullets: {
        Row: {
          content: string
          id: string
          position: number
          section_id: string
        }
        Insert: {
          content?: string
          id?: string
          position?: number
          section_id: string
        }
        Update: {
          content?: string
          id?: string
          position?: number
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_bullets_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "report_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      share_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip: string | null
          report_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          report_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          report_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_audit_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          monthly_price_cents: number
          name: string
          price_per_extra_seat_cents: number
          seat_limit: number
          sort_order: number
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          stripe_product_id: string | null
          updated_at: string
          yearly_price_cents: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          monthly_price_cents?: number
          name: string
          price_per_extra_seat_cents?: number
          seat_limit?: number
          sort_order?: number
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
          yearly_price_cents?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          monthly_price_cents?: number
          name?: string
          price_per_extra_seat_cents?: number
          seat_limit?: number
          sort_order?: number
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
          yearly_price_cents?: number
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          report_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          report_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          report_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assert_not_admin_only: { Args: { _user_id: string }; Returns: undefined }
      assert_not_banned: { Args: { _user_id: string }; Returns: undefined }
      company_chat_colleagues: {
        Args: never
        Returns: {
          avatar_url: string
          company_id: string
          company_name: string
          email: string
          full_name: string
          position_title: string
          user_id: string
        }[]
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
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
