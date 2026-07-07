export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'manager' | 'operator';
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';
export type PaymentMode = 'CASH' | 'P.O' | 'OFFSET' | 'GCASH' | 'BANK_TRANSFER' | 'DONATION' | 'SPLIT';
export type TransactionStatus = 'PENDING' | 'PAID';
export type ActivityCode =
  | 'DASHBOARD_VIEW'
  | 'DAILY_LEDGER_VIEW'
  | 'DAILY_LEDGER_ADD'
  | 'DAILY_LEDGER_EDIT'
  | 'DAILY_LEDGER_DELETE'
  | 'DAILY_LEDGER_UPLOAD'
  | 'CUSTOMERS_VIEW'
  | 'CUSTOMERS_ADD'
  | 'CUSTOMERS_EDIT'
  | 'CUSTOMERS_DELETE'
  | 'ACCOUNTS_RECEIVABLE_VIEW'
  | 'ACCOUNTS_RECEIVABLE_EDIT'
  | 'TRUCKS_VIEW'
  | 'TRUCKS_ADD'
  | 'TRUCKS_EDIT'
  | 'TRUCKS_DELETE'
  | 'PRICING_VIEW'
  | 'PRICING_ADD'
  | 'PRICING_EDIT'
  | 'PRICING_DELETE'
  | 'EXPENSES_VIEW'
  | 'EXPENSES_ADD'
  | 'EXPENSES_DELETE'
  | 'REPORTS_VIEW'
  | 'REPORTS_PRINT'
  | 'REPORTS_EXPORT'
  | 'USER_ACCOUNTS_MANAGE'
  | 'USER_GROUP_ACCESS_VIEW'
  | 'USER_GROUP_ACCESS_MANAGE'
  | 'AUDIT_LOG_VIEW';

export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          role?: UserRole;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          table_name: string;
          record_id: string | null;
          action: AuditAction;
          actor_user_id: string | null;
          actor_email: string | null;
          old_data: Json | null;
          new_data: Json | null;
          created_at: string;
        };
        Insert: {
          table_name: string;
          record_id?: string | null;
          action: AuditAction;
          actor_user_id?: string | null;
          actor_email?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
        };
        Update: {
          table_name?: string;
          record_id?: string | null;
          action?: AuditAction;
          actor_user_id?: string | null;
          actor_email?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
        };
        Relationships: [];
      };
      sys_user_group: {
        Row: {
          id: string;
          code: UserRole;
          name: string;
          description: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: UserRole;
          name: string;
          description?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: UserRole;
          name?: string;
          description?: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      sys_module: {
        Row: {
          id: string;
          code: string;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          name?: string;
          sort_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      sys_sub_module: {
        Row: {
          id: string;
          module_id: string;
          code: string;
          name: string;
          nav_section: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          module_id: string;
          code: string;
          name: string;
          nav_section?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          module_id?: string;
          code?: string;
          name?: string;
          nav_section?: string | null;
          sort_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sys_sub_module_module_id_fkey';
            columns: ['module_id'];
            referencedRelation: 'sys_module';
            referencedColumns: ['id'];
          },
        ];
      };
      sys_activity: {
        Row: {
          id: string;
          sub_module_id: string;
          code: ActivityCode;
          name: string;
          action: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sub_module_id: string;
          code: ActivityCode;
          name: string;
          action: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          sub_module_id?: string;
          code?: ActivityCode;
          name?: string;
          action?: string;
          sort_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sys_activity_sub_module_id_fkey';
            columns: ['sub_module_id'];
            referencedRelation: 'sys_sub_module';
            referencedColumns: ['id'];
          },
        ];
      };
      sys_map_user_group_activity: {
        Row: {
          id: string;
          user_group_id: string;
          activity_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_group_id: string;
          activity_id: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_group_id?: string;
          activity_id?: string;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sys_map_user_group_activity_activity_id_fkey';
            columns: ['activity_id'];
            referencedRelation: 'sys_activity';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sys_map_user_group_activity_user_group_id_fkey';
            columns: ['user_group_id'];
            referencedRelation: 'sys_user_group';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          contact: string;
          address: string;
          created_at: string;
        };
        Insert: {
          name: string;
          contact?: string;
          address?: string;
        };
        Update: {
          name?: string;
          contact?: string;
          address?: string;
        };
        Relationships: [];
      };
      trucks: {
        Row: {
          id: string;
          plate_number: string;
          driver_name: string;
          customer_id: string | null;
          capacity_m3: number;
          length_cm: number;
          width_cm: number;
          height_cm: number;
          created_at: string;
        };
        Insert: {
          plate_number: string;
          driver_name?: string;
          customer_id?: string | null;
          capacity_m3?: number;
          length_cm?: number;
          width_cm?: number;
          height_cm?: number;
        };
        Update: {
          plate_number?: string;
          driver_name?: string;
          customer_id?: string | null;
          capacity_m3?: number;
          length_cm?: number;
          width_cm?: number;
          height_cm?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'trucks_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      pricing: {
        Row: {
          id: string;
          material_type: string;
          unit_price: number;
          effective_date: string;
          created_at: string;
        };
        Insert: {
          material_type: string;
          unit_price?: number;
          effective_date?: string;
        };
        Update: {
          material_type?: string;
          unit_price?: number;
          effective_date?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          transaction_date: string;
          customer_id: string;
          truck_id: string;
          dr_number: string;
          length_cm: number;
          width_cm: number;
          height_cm: number;
          volume_m3: number;
          unit_price: number;
          amount: number;
          dr_capitol: number;
          passway: number;
          kulot: number;
          total_amount: number;
          material_type: string;
          payment_mode: PaymentMode;
          status: TransactionStatus;
          notes: string;
          attachment_urls: string[];
          split_payment_details: Json;
          created_at: string;
        };
        Insert: {
          transaction_date?: string;
          customer_id: string;
          truck_id: string;
          dr_number?: string;
          length_cm?: number;
          width_cm?: number;
          height_cm?: number;
          unit_price?: number;
          dr_capitol?: number;
          passway?: number;
          kulot?: number;
          material_type?: string;
          payment_mode?: PaymentMode;
          status?: TransactionStatus;
          notes?: string;
          attachment_urls?: string[];
          split_payment_details?: Json;
        };
        Update: {
          transaction_date?: string;
          customer_id?: string;
          truck_id?: string;
          dr_number?: string;
          length_cm?: number;
          width_cm?: number;
          height_cm?: number;
          unit_price?: number;
          dr_capitol?: number;
          passway?: number;
          kulot?: number;
          material_type?: string;
          payment_mode?: PaymentMode;
          status?: TransactionStatus;
          notes?: string;
          attachment_urls?: string[];
          split_payment_details?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_truck_id_fkey';
            columns: ['truck_id'];
            referencedRelation: 'trucks';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_categories: {
        Row: {
          id: string;
          name: string;
          user_id: string | null;
          is_default: boolean;
          order: number;
          created_at: string;
        };
        Insert: {
          name: string;
          user_id?: string | null;
          is_default?: boolean;
          order?: number;
        };
        Update: {
          name?: string;
          user_id?: string | null;
          is_default?: boolean;
          order?: number;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          expense_date: string;
          category_id: string;
          amount: number;
          payee_supplier: string;
          description: string;
          liters_counter: number | null;
          created_at: string;
        };
        Insert: {
          expense_date?: string;
          category_id?: string;
          amount?: number;
          payee_supplier?: string;
          description?: string;
          liters_counter?: number | null;
        };
        Update: {
          expense_date?: string;
          category_id?: string;
          amount?: number;
          payee_supplier?: string;
          description?: string;
          liters_counter?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'expense_categories';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_user_profile: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['app_users']['Row'];
      };
      get_my_activity_codes: {
        Args: Record<string, never>;
        Returns: string[];
      };
      has_activity: {
        Args: {
          activity_code: string;
          check_user_id?: string;
        };
        Returns: boolean;
      };
      replace_user_group_activities: {
        Args: {
          target_user_group_id: string;
          activity_codes: string[];
        };
        Returns: void;
      };
      save_user_group_activities: {
        Args: {
          target_user_group_id: string;
          activity_codes: string[];
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type AppUser = Database['public']['Tables']['app_users']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
export type UserGroup = Database['public']['Tables']['sys_user_group']['Row'];
export type AccessModule = Database['public']['Tables']['sys_module']['Row'];
export type AccessSubModule = Database['public']['Tables']['sys_sub_module']['Row'];
export type AccessActivity = Database['public']['Tables']['sys_activity']['Row'];
export type UserGroupActivity = Database['public']['Tables']['sys_map_user_group_activity']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Truck = Database['public']['Tables']['trucks']['Row'];
export type Pricing = Database['public']['Tables']['pricing']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row'];
export type Expense = Database['public']['Tables']['expenses']['Row'];

export type AuditLog = Omit<AuditLogRow, 'old_data' | 'new_data'> & {
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export type TransactionWithRelations = Transaction & {
  customers: Customer | null;
  trucks: Truck | null;
};

export type ExpenseWithCategory = Expense & {
  expense_categories: ExpenseCategory | null;
};
