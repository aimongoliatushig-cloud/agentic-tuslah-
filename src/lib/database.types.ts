export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      api_clients: {
        Row: {
          id: string;
          name: string;
          api_key_hash: string;
          api_key_preview: string;
          status: "active" | "suspended" | "disabled";
          credit_balance: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          api_key_hash: string;
          api_key_preview: string;
          status?: "active" | "suspended" | "disabled";
          credit_balance?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          api_key_hash?: string;
          api_key_preview?: string;
          status?: "active" | "suspended" | "disabled";
          credit_balance?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_models: {
        Row: {
          id: string;
          name: string;
          provider: string;
          provider_model: string;
          credit_cost: number;
          billing_type: "credit" | "token" | "image" | "request";
          input_1k_token_price_mnt: number;
          output_1k_token_price_mnt: number;
          unit_price_mnt: number;
          input_cache_hit_1m_token_price_usd: number;
          input_cache_miss_1m_token_price_usd: number;
          output_1m_token_price_usd: number;
          unit_price_usd: number;
          pricing_source_url: string | null;
          pricing_checked_at: string | null;
          status: "active" | "inactive";
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          provider?: string;
          provider_model: string;
          credit_cost?: number;
          billing_type?: "credit" | "token" | "image" | "request";
          input_1k_token_price_mnt?: number;
          output_1k_token_price_mnt?: number;
          unit_price_mnt?: number;
          input_cache_hit_1m_token_price_usd?: number;
          input_cache_miss_1m_token_price_usd?: number;
          output_1m_token_price_usd?: number;
          unit_price_usd?: number;
          pricing_source_url?: string | null;
          pricing_checked_at?: string | null;
          status?: "active" | "inactive";
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          provider?: string;
          provider_model?: string;
          credit_cost?: number;
          billing_type?: "credit" | "token" | "image" | "request";
          input_1k_token_price_mnt?: number;
          output_1k_token_price_mnt?: number;
          unit_price_mnt?: number;
          input_cache_hit_1m_token_price_usd?: number;
          input_cache_miss_1m_token_price_usd?: number;
          output_1m_token_price_usd?: number;
          unit_price_usd?: number;
          pricing_source_url?: string | null;
          pricing_checked_at?: string | null;
          status?: "active" | "inactive";
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_credit_transactions: {
        Row: {
          id: string;
          client_id: string;
          amount: number;
          type: "credit" | "debit";
          balance_after: number;
          note: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          amount: number;
          type: "credit" | "debit";
          balance_after: number;
          note?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          amount?: number;
          type?: "credit" | "debit";
          balance_after?: number;
          note?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_credit_transactions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "api_clients";
            referencedColumns: ["id"];
          }
        ];
      };
      api_usage_logs: {
        Row: {
          id: string;
          client_id: string;
          model_id: string;
          request_id: string;
          status: "success" | "failed";
          credit_cost: number;
          input_tokens: number | null;
          output_tokens: number | null;
          total_tokens: number | null;
          input_cache_hit_tokens: number | null;
          input_cache_miss_tokens: number | null;
          billable_units: number;
          cost_mnt: number;
          cost_usd: number;
          estimated_cost_usd: number;
          cost_breakdown: Json;
          latency_ms: number | null;
          provider_response: Json;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          model_id: string;
          request_id: string;
          status: "success" | "failed";
          credit_cost: number;
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          input_cache_hit_tokens?: number | null;
          input_cache_miss_tokens?: number | null;
          billable_units?: number;
          cost_mnt?: number;
          cost_usd?: number;
          estimated_cost_usd?: number;
          cost_breakdown?: Json;
          latency_ms?: number | null;
          provider_response?: Json;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          model_id?: string;
          request_id?: string;
          status?: "success" | "failed";
          credit_cost?: number;
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          input_cache_hit_tokens?: number | null;
          input_cache_miss_tokens?: number | null;
          billable_units?: number;
          cost_mnt?: number;
          cost_usd?: number;
          estimated_cost_usd?: number;
          cost_breakdown?: Json;
          latency_ms?: number | null;
          provider_response?: Json;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "api_clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "api_usage_logs_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "api_models";
            referencedColumns: ["id"];
          }
        ];
      };
      api_client_budget_limits: {
        Row: {
          id: string;
          client_id: string;
          scope_type: "total" | "provider" | "model";
          scope_key: string;
          period: "daily" | "weekly" | "monthly" | "lifetime";
          limit_usd: number;
          status: "active" | "inactive";
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          scope_type: "total" | "provider" | "model";
          scope_key?: string;
          period?: "daily" | "weekly" | "monthly" | "lifetime";
          limit_usd: number;
          status?: "active" | "inactive";
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          scope_type?: "total" | "provider" | "model";
          scope_key?: string;
          period?: "daily" | "weekly" | "monthly" | "lifetime";
          limit_usd?: number;
          status?: "active" | "inactive";
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_client_budget_limits_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "api_clients";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
