export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = string;
export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';
export type PaymentMode = 'CASH' | 'P.O' | 'OFFSET' | 'GCASH' | 'BANK_TRANSFER' | 'DONATION' | 'SPLIT' | 'CUSTOMER_CREDIT';
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
  | 'EXPENSES_EDIT'
  | 'EXPENSES_DELETE'
  | 'FUEL_VIEW'
  | 'FUEL_PURCHASE_ADD'
  | 'FUEL_ISSUANCE_ADD'
  | 'FUEL_ADJUST'
  | 'FUEL_EXPORT'
  | 'FUEL_EQUIPMENT_MANAGE'
  | 'HAULER_OFFSET_LEDGER_VIEW'
  | 'HAULER_OFFSET_LEDGER_ADD'
  | 'HAULER_OFFSET_LEDGER_EXPORT'
  | 'HAULER_OFFSET_LEDGER_VIEW_DETAIL'
  | 'HAULER_OFFSET_LEDGER_ADJUST'
  | 'HAULER_STATEMENT_VIEW'
  | 'HAULER_STATEMENT_EXPORT'
  | 'CUSTOMER_CREDIT_VIEW'
  | 'CUSTOMER_CREDIT_ADD'
  | 'CUSTOMER_CREDIT_ADJUST'
  | 'CUSTOMER_CREDIT_EXPORT'
  | 'SC_OPERATIONS_VIEW'
  | 'SC_OPERATIONS_ADD'
  | 'SC_OPERATIONS_EDIT'
  | 'SC_OPERATIONS_DELETE'
  | 'SC_OPERATIONS_EXPORT'
  | 'SW_OPERATIONS_VIEW'
  | 'SW_OPERATIONS_ADD'
  | 'SW_OPERATIONS_EDIT'
  | 'SW_OPERATIONS_DELETE'
  | 'SW_OPERATIONS_EXPORT'
  | 'QS_OPERATIONS_VIEW'
  | 'QS_OPERATIONS_ADD'
  | 'QS_OPERATIONS_EDIT'
  | 'QS_OPERATIONS_DELETE'
  | 'QS_OPERATIONS_EXPORT'
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
          is_hauler: boolean;
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
          is_hauler?: boolean;
        };
        Update: {
          plate_number?: string;
          driver_name?: string;
          customer_id?: string | null;
          capacity_m3?: number;
          length_cm?: number;
          width_cm?: number;
          height_cm?: number;
          is_hauler?: boolean;
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
          delivery_fee: number;
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
          delivery_fee?: number;
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
          delivery_fee?: number;
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
          source_table: string | null;
          source_id: string | null;
          created_at: string;
        };
        Insert: {
          expense_date?: string;
          category_id?: string;
          amount?: number;
          payee_supplier?: string;
          description?: string;
          liters_counter?: number | null;
          source_table?: string | null;
          source_id?: string | null;
        };
        Update: {
          expense_date?: string;
          category_id?: string;
          amount?: number;
          payee_supplier?: string;
          description?: string;
          liters_counter?: number | null;
          source_table?: string | null;
          source_id?: string | null;
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
      hauler_offset_entries: {
        Row: {
          id: string;
          hauler_id: string;
          transaction_date: string;
          transaction_type: 'OPENING_BALANCE' | 'HAULING_SERVICE' | 'CASH_PAYMENT' | 'ADJUSTMENT';
          reference_no: string;
          description: string;
          debit_amount: number;
          credit_amount: number;
          status: 'ACTIVE' | 'VOIDED';
          remarks: string;
          details: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_by: string | null;
          voided_at: string | null;
        };
        Insert: {
          id?: string;
          hauler_id: string;
          transaction_date?: string;
          transaction_type: 'OPENING_BALANCE' | 'HAULING_SERVICE' | 'CASH_PAYMENT' | 'ADJUSTMENT';
          reference_no?: string;
          description?: string;
          debit_amount?: number;
          credit_amount?: number;
          status?: 'ACTIVE' | 'VOIDED';
          remarks?: string;
          details?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_by?: string | null;
          voided_at?: string | null;
        };
        Update: {
          hauler_id?: string;
          transaction_date?: string;
          transaction_type?: 'OPENING_BALANCE' | 'HAULING_SERVICE' | 'CASH_PAYMENT' | 'ADJUSTMENT';
          reference_no?: string;
          description?: string;
          debit_amount?: number;
          credit_amount?: number;
          status?: 'ACTIVE' | 'VOIDED';
          remarks?: string;
          details?: Json;
          created_by?: string | null;
          updated_at?: string;
          voided_by?: string | null;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'hauler_offset_entries_hauler_id_fkey';
            columns: ['hauler_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_credit_entries: {
        Row: {
          id: string;
          customer_id: string;
          transaction_date: string;
          transaction_type: 'OPENING_BALANCE' | 'ADVANCE_PAYMENT' | 'PURCHASE_DEDUCTION' | 'ADJUSTMENT' | 'REVERSAL';
          reference_no: string;
          description: string;
          debit_amount: number;
          credit_amount: number;
          status: 'ACTIVE' | 'VOIDED';
          source_table: string | null;
          source_id: string | null;
          remarks: string;
          details: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_by: string | null;
          voided_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id: string;
          transaction_date?: string;
          transaction_type: 'OPENING_BALANCE' | 'ADVANCE_PAYMENT' | 'PURCHASE_DEDUCTION' | 'ADJUSTMENT' | 'REVERSAL';
          reference_no?: string;
          description?: string;
          debit_amount?: number;
          credit_amount?: number;
          status?: 'ACTIVE' | 'VOIDED';
          source_table?: string | null;
          source_id?: string | null;
          remarks?: string;
          details?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_by?: string | null;
          voided_at?: string | null;
        };
        Update: {
          customer_id?: string;
          transaction_date?: string;
          transaction_type?: 'OPENING_BALANCE' | 'ADVANCE_PAYMENT' | 'PURCHASE_DEDUCTION' | 'ADJUSTMENT' | 'REVERSAL';
          reference_no?: string;
          description?: string;
          debit_amount?: number;
          credit_amount?: number;
          status?: 'ACTIVE' | 'VOIDED';
          source_table?: string | null;
          source_id?: string | null;
          remarks?: string;
          details?: Json;
          created_by?: string | null;
          updated_at?: string;
          voided_by?: string | null;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_credit_entries_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_credit_settlements: {
        Row: {
          id: string;
          transaction_id: string;
          customer_id: string;
          settlement_date: string;
          amount: number;
          status: 'ACTIVE' | 'VOIDED';
          remarks: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_by: string | null;
          voided_at: string | null;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          customer_id: string;
          settlement_date?: string;
          amount: number;
          status?: 'ACTIVE' | 'VOIDED';
          remarks?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_by?: string | null;
          voided_at?: string | null;
        };
        Update: {
          transaction_id?: string;
          customer_id?: string;
          settlement_date?: string;
          amount?: number;
          status?: 'ACTIVE' | 'VOIDED';
          remarks?: string;
          created_by?: string | null;
          updated_at?: string;
          voided_by?: string | null;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_credit_settlements_transaction_id_fkey';
            columns: ['transaction_id'];
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_credit_settlements_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      receivable_settlements: {
        Row: {
          id: string;
          transaction_id: string;
          customer_id: string;
          settlement_date: string;
          amount: number;
          payment_method: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
          reference_no: string;
          remarks: string;
          status: 'ACTIVE' | 'VOIDED';
          created_by: string | null;
          created_at: string;
          updated_at: string;
          voided_by: string | null;
          voided_at: string | null;
          void_reason: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          customer_id: string;
          settlement_date?: string;
          amount: number;
          payment_method: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
          reference_no?: string;
          remarks?: string;
          status?: 'ACTIVE' | 'VOIDED';
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          voided_by?: string | null;
          voided_at?: string | null;
          void_reason?: string;
        };
        Update: {
          settlement_date?: string;
          amount?: number;
          payment_method?: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
          reference_no?: string;
          remarks?: string;
          status?: 'ACTIVE' | 'VOIDED';
          updated_at?: string;
          voided_by?: string | null;
          voided_at?: string | null;
          void_reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'receivable_settlements_transaction_id_fkey';
            columns: ['transaction_id'];
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'receivable_settlements_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      fuel_branches: {
        Row: {
          id: string;
          name: string;
          company_name: string;
          is_default: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          company_name?: string;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          company_name?: string;
          is_default?: boolean;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_equipment: {
        Row: {
          id: string;
          branch_id: string | null;
          name: string;
          equipment_type: string;
          plate_or_code: string;
          operator_name: string;
          notes: string;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id?: string | null;
          name: string;
          equipment_type?: string;
          plate_or_code?: string;
          operator_name?: string;
          notes?: string;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string | null;
          name?: string;
          equipment_type?: string;
          plate_or_code?: string;
          operator_name?: string;
          notes?: string;
          is_active?: boolean;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_equipment_branch_id_fkey';
            columns: ['branch_id'];
            referencedRelation: 'fuel_branches';
            referencedColumns: ['id'];
          },
        ];
      };
      fuel_inventory_state: {
        Row: {
          id: string;
          branch_id: string;
          current_liters: number;
          weighted_average_cost: number;
          inventory_value: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          current_liters?: number;
          weighted_average_cost?: number;
          inventory_value?: number;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          current_liters?: number;
          weighted_average_cost?: number;
          inventory_value?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fuel_inventory_state_branch_id_fkey';
            columns: ['branch_id'];
            referencedRelation: 'fuel_branches';
            referencedColumns: ['id'];
          },
        ];
      };
      fuel_purchases: {
        Row: {
          id: string;
          branch_id: string;
          purchase_date: string;
          supplier: string;
          reference_no: string;
          liters: number;
          unit_cost: number;
          total_amount: number;
          remarks: string;
          expense_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          purchase_date?: string;
          supplier: string;
          reference_no?: string;
          liters: number;
          unit_cost: number;
          total_amount: number;
          remarks?: string;
          expense_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          purchase_date?: string;
          supplier?: string;
          reference_no?: string;
          liters?: number;
          unit_cost?: number;
          total_amount?: number;
          remarks?: string;
          expense_id?: string | null;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fuel_purchases_branch_id_fkey';
            columns: ['branch_id'];
            referencedRelation: 'fuel_branches';
            referencedColumns: ['id'];
          },
        ];
      };
      fuel_issuances: {
        Row: {
          id: string;
          branch_id: string;
          issuance_date: string;
          category: string;
          issued_to: string;
          truck_id: string | null;
          company_equipment_id: string | null;
          reference_no: string;
          liters: number;
          unit_cost_snapshot: number;
          total_value: number;
          remarks: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          issuance_date?: string;
          category: string;
          issued_to: string;
          truck_id?: string | null;
          company_equipment_id?: string | null;
          reference_no?: string;
          liters: number;
          unit_cost_snapshot: number;
          total_value: number;
          remarks?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          issuance_date?: string;
          category?: string;
          issued_to?: string;
          truck_id?: string | null;
          company_equipment_id?: string | null;
          reference_no?: string;
          liters?: number;
          unit_cost_snapshot?: number;
          total_value?: number;
          remarks?: string;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fuel_issuances_branch_id_fkey';
            columns: ['branch_id'];
            referencedRelation: 'fuel_branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fuel_issuances_truck_id_fkey';
            columns: ['truck_id'];
            referencedRelation: 'trucks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fuel_issuances_company_equipment_id_fkey';
            columns: ['company_equipment_id'];
            referencedRelation: 'company_equipment';
            referencedColumns: ['id'];
          },
        ];
      };
      fuel_inventory_ledger: {
        Row: {
          id: string;
          branch_id: string;
          movement_date: string;
          movement_type: 'OPENING_BALANCE' | 'PURCHASE' | 'ISSUANCE' | 'ADJUSTMENT' | 'REVERSAL';
          source_table: string | null;
          source_id: string | null;
          reference_no: string;
          description: string;
          liters_delta: number;
          unit_cost: number;
          value_delta: number;
          balance_liters_after: number;
          weighted_average_cost_after: number;
          inventory_value_after: number;
          reversal_of_ledger_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          movement_date?: string;
          movement_type: 'OPENING_BALANCE' | 'PURCHASE' | 'ISSUANCE' | 'ADJUSTMENT' | 'REVERSAL';
          source_table?: string | null;
          source_id?: string | null;
          reference_no?: string;
          description?: string;
          liters_delta: number;
          unit_cost?: number;
          value_delta?: number;
          balance_liters_after: number;
          weighted_average_cost_after: number;
          inventory_value_after: number;
          reversal_of_ledger_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          branch_id?: string;
          movement_date?: string;
          movement_type?: 'OPENING_BALANCE' | 'PURCHASE' | 'ISSUANCE' | 'ADJUSTMENT' | 'REVERSAL';
          source_table?: string | null;
          source_id?: string | null;
          reference_no?: string;
          description?: string;
          liters_delta?: number;
          unit_cost?: number;
          value_delta?: number;
          balance_liters_after?: number;
          weighted_average_cost_after?: number;
          inventory_value_after?: number;
          reversal_of_ledger_id?: string | null;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fuel_inventory_ledger_branch_id_fkey';
            columns: ['branch_id'];
            referencedRelation: 'fuel_branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fuel_inventory_ledger_reversal_of_ledger_id_fkey';
            columns: ['reversal_of_ledger_id'];
            referencedRelation: 'fuel_inventory_ledger';
            referencedColumns: ['id'];
          },
        ];
      };
      stone_crusher_monthly_targets: {
        Row: {
          id: string;
          target_month: string;
          target_hours: number;
          effective_date: string;
          remarks: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          target_month: string;
          target_hours?: number;
          effective_date: string;
          remarks?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          target_month?: string;
          target_hours?: number;
          effective_date?: string;
          remarks?: string;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      stone_crusher_daily_entries: {
        Row: {
          id: string;
          entry_date: string;
          operation_minutes: number;
          downtime_minutes: number;
          time_schedule: string;
          breakdown: string;
          monthly_target_id: string | null;
          jaw_1_dumps: number;
          jaw_2_dumps: number;
          genset_used: string;
          genset_1_liters: number;
          genset_2_liters: number;
          genset_4_liters: number;
          water_pump_genset_liters: number;
          genset_1_running_minutes: number;
          genset_2_running_minutes: number;
          genset_4_running_minutes: number;
          g1_volume_cbm: number;
          three_fourth_volume_cbm: number;
          s_three_fourth_volume_cbm: number;
          s1c_volume_cbm: number;
          operation_hours: number;
          downtime_hours: number;
          total_dumps: number;
          genset_diesel_consumption: number;
          g1_output: number;
          three_fourth_output: number;
          s_three_fourth_output: number;
          total_output: number;
          plant_capacity_tph: number;
          total_volume_cbm: number;
          plant_capacity_cbm_per_hour: number;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entry_date: string;
          operation_minutes?: number;
          downtime_minutes?: number;
          time_schedule?: string;
          breakdown?: string;
          monthly_target_id?: string | null;
          jaw_1_dumps?: number;
          jaw_2_dumps?: number;
          genset_used?: string;
          genset_1_liters?: number;
          genset_2_liters?: number;
          genset_4_liters?: number;
          water_pump_genset_liters?: number;
          genset_1_running_minutes?: number;
          genset_2_running_minutes?: number;
          genset_4_running_minutes?: number;
          g1_volume_cbm?: number;
          three_fourth_volume_cbm?: number;
          s_three_fourth_volume_cbm?: number;
          s1c_volume_cbm?: number;
          notes?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          entry_date?: string;
          operation_minutes?: number;
          downtime_minutes?: number;
          time_schedule?: string;
          breakdown?: string;
          monthly_target_id?: string | null;
          jaw_1_dumps?: number;
          jaw_2_dumps?: number;
          genset_used?: string;
          genset_1_liters?: number;
          genset_2_liters?: number;
          genset_4_liters?: number;
          water_pump_genset_liters?: number;
          genset_1_running_minutes?: number;
          genset_2_running_minutes?: number;
          genset_4_running_minutes?: number;
          g1_volume_cbm?: number;
          three_fourth_volume_cbm?: number;
          s_three_fourth_volume_cbm?: number;
          s1c_volume_cbm?: number;
          notes?: string;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stone_crusher_daily_entries_monthly_target_id_fkey';
            columns: ['monthly_target_id'];
            referencedRelation: 'stone_crusher_monthly_targets';
            referencedColumns: ['id'];
          },
        ];
      };
      sand_washing_daily_entries: {
        Row: {
          id: string;
          entry_date: string;
          product: 'Vibro' | '3/8-S1' | 'No Operation';
          operation_minutes: number;
          time_of_operation: string;
          number_of_dumps: number;
          genset_diesel_consumption_liters: number;
          number_truck_waste: number;
          waste_product: 'Waste' | '3/8' | 'N/A';
          operation_hours: number;
          vibro_sand_volume_cbm: number;
          waste_volume_cbm: number;
          diesel_consumption_lph: number;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entry_date: string;
          product?: 'Vibro' | '3/8-S1' | 'No Operation';
          operation_minutes?: number;
          time_of_operation?: string;
          number_of_dumps?: number;
          genset_diesel_consumption_liters?: number;
          number_truck_waste?: number;
          waste_product?: 'Waste' | '3/8' | 'N/A';
          notes?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          entry_date?: string;
          product?: 'Vibro' | '3/8-S1' | 'No Operation';
          operation_minutes?: number;
          time_of_operation?: string;
          number_of_dumps?: number;
          genset_diesel_consumption_liters?: number;
          number_truck_waste?: number;
          waste_product?: 'Waste' | '3/8' | 'N/A';
          notes?: string;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      quarry_site_daily_entries: {
        Row: {
          id: string;
          entry_date: string;
          jafcor_binder_trips: number;
          jafcor_boulder_trips: number;
          zaffara_boulder_trips: number;
          number_of_trucks: string;
          quarry_equipment_diesel_liters: number;
          total_diesel_consumption_liters: number;
          number_of_equipment: number;
          total_boulder_trips: number;
          binder_amount: number;
          jafcor_boulder_amount: number;
          total_computed_amount: number;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entry_date: string;
          jafcor_binder_trips?: number;
          jafcor_boulder_trips?: number;
          zaffara_boulder_trips?: number;
          number_of_trucks?: string;
          quarry_equipment_diesel_liters?: number;
          total_diesel_consumption_liters?: number;
          number_of_equipment?: number;
          notes?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          entry_date?: string;
          jafcor_binder_trips?: number;
          jafcor_boulder_trips?: number;
          zaffara_boulder_trips?: number;
          number_of_trucks?: string;
          quarry_equipment_diesel_liters?: number;
          total_diesel_consumption_liters?: number;
          number_of_equipment?: number;
          notes?: string;
          created_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      assign_user_group: {
        Args: {
          p_user_id: string;
          p_role: string;
        };
        Returns: Database['public']['Tables']['app_users']['Row'];
      };
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
      create_hauler_offset_entry: {
        Args: {
          p_hauler_id: string;
          p_transaction_date: string;
          p_transaction_type: 'OPENING_BALANCE' | 'HAULING_SERVICE' | 'CASH_PAYMENT' | 'ADJUSTMENT';
          p_reference_no: string;
          p_description: string;
          p_amount: number;
          p_entry_side?: 'DEBIT' | 'CREDIT' | null;
          p_remarks?: string;
          p_details?: Json;
        };
        Returns: Database['public']['Tables']['hauler_offset_entries']['Row'];
      };
      void_hauler_offset_entry: {
        Args: {
          p_entry_id: string;
          p_reason?: string;
        };
        Returns: Database['public']['Tables']['hauler_offset_entries']['Row'];
      };
      get_hauler_offset_ledger: {
        Args: {
          p_hauler_id: string;
          p_date_from: string;
          p_date_to: string;
        };
        Returns: {
          row_kind: 'SUMMARY' | 'ENTRY';
          line_no: number;
          hauler_id: string;
          hauler_name: string;
          transaction_date: string | null;
          transaction_type: 'OPENING_BALANCE' | 'HAULING_SERVICE' | 'PRODUCT_OFFSET' | 'DIESEL_OFFSET' | 'CASH_PAYMENT' | 'ADJUSTMENT' | null;
          source_module: 'hauler_offset_entries' | 'transactions' | 'fuel_issuances' | null;
          source_id: string | null;
          reference_no: string;
          description: string;
          debit_amount: number;
          credit_amount: number;
          running_balance: number;
          opening_balance: number;
          hauling_earnings: number;
          product_offsets: number;
          diesel_offsets: number;
          cash_payments: number;
          adjustments_debit: number;
          adjustments_credit: number;
          closing_balance: number;
          source_payload: Json;
          created_at: string;
        }[];
      };
      get_transaction_customer_credit_amount: {
        Args: {
          p_payment_mode: string;
          p_total_amount: number;
          p_split_payment_details?: Json;
        };
        Returns: number;
      };
      get_customer_credit_balance: {
        Args: {
          p_customer_id: string;
          p_exclude_source_table?: string | null;
          p_exclude_source_id?: string | null;
        };
        Returns: number;
      };
      create_customer_credit_entry: {
        Args: {
          p_customer_id: string;
          p_transaction_date: string;
          p_transaction_type: 'OPENING_BALANCE' | 'ADVANCE_PAYMENT' | 'ADJUSTMENT';
          p_reference_no: string;
          p_description: string;
          p_amount: number;
          p_entry_side?: 'DEBIT' | 'CREDIT' | null;
          p_remarks?: string;
          p_details?: Json;
        };
        Returns: Database['public']['Tables']['customer_credit_entries']['Row'];
      };
      void_customer_credit_entry: {
        Args: {
          p_entry_id: string;
          p_reason?: string;
        };
        Returns: Database['public']['Tables']['customer_credit_entries']['Row'];
      };
      settle_receivable_with_customer_credit: {
        Args: {
          p_transaction_id: string;
          p_settlement_date?: string;
          p_remarks?: string;
        };
        Returns: Database['public']['Tables']['customer_credit_settlements']['Row'];
      };
      get_transaction_receivable_amount: {
        Args: {
          p_payment_mode: string;
          p_total_amount: number;
          p_split_payment_details?: Json;
        };
        Returns: number;
      };
      settle_receivable: {
        Args: {
          p_transaction_id: string;
          p_settlement_date?: string;
          p_payment_method?: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
          p_reference_no?: string;
          p_remarks?: string;
        };
        Returns: Database['public']['Tables']['receivable_settlements']['Row'];
      };
      void_receivable_settlement: {
        Args: { p_settlement_id: string; p_reason: string };
        Returns: Database['public']['Tables']['receivable_settlements']['Row'];
      };
      void_customer_credit_settlement: {
        Args: { p_settlement_id: string; p_reason: string };
        Returns: Database['public']['Tables']['customer_credit_settlements']['Row'];
      };
      get_receivable_settlement_history: {
        Args: { p_limit?: number };
        Returns: {
          settlement_id: string;
          settlement_kind: 'EXTERNAL' | 'CUSTOMER_CREDIT';
          transaction_id: string;
          dr_number: string;
          customer_name: string;
          settlement_date: string;
          amount: number;
          payment_method: string;
          reference_no: string;
          remarks: string;
          status: 'ACTIVE' | 'VOIDED';
          created_at: string;
        }[];
      };
      get_customer_credit_ledger: {
        Args: {
          p_customer_id: string;
          p_date_from: string;
          p_date_to: string;
        };
        Returns: {
          row_kind: 'SUMMARY' | 'ENTRY';
          line_no: number;
          customer_id: string;
          customer_name: string;
          transaction_date: string | null;
          transaction_type: 'OPENING_BALANCE' | 'ADVANCE_PAYMENT' | 'PURCHASE_DEDUCTION' | 'ADJUSTMENT' | 'REVERSAL' | null;
          source_module: 'customer_credit_entries' | 'customer_credit_settlements' | 'transactions' | null;
          source_id: string | null;
          reference_no: string;
          description: string;
          debit_amount: number;
          credit_amount: number;
          running_balance: number;
          opening_balance: number;
          advances: number;
          purchases: number;
          adjustments_debit: number;
          adjustments_credit: number;
          closing_balance: number;
          source_payload: Json;
          created_at: string;
        }[];
      };
      create_fuel_purchase: {
        Args: {
          p_branch_id: string;
          p_purchase_date: string;
          p_supplier: string;
          p_reference_no: string;
          p_liters: number;
          p_unit_cost: number;
          p_remarks?: string;
          p_post_to_expenses?: boolean;
        };
        Returns: Database['public']['Tables']['fuel_purchases']['Row'];
      };
      post_fuel_purchase_to_expenses: {
        Args: { p_purchase_id: string };
        Returns: Database['public']['Tables']['fuel_purchases']['Row'];
      };
      create_user_group: {
        Args: {
          p_code: string | null;
          p_name: string;
          p_description?: string;
        };
        Returns: Database['public']['Tables']['sys_user_group']['Row'];
      };
      update_user_group: {
        Args: {
          p_group_id: string;
          p_code: string;
          p_name: string;
          p_description?: string;
        };
        Returns: Database['public']['Tables']['sys_user_group']['Row'];
      };
      deactivate_user_group: {
        Args: {
          p_group_id: string;
        };
        Returns: Database['public']['Tables']['sys_user_group']['Row'];
      };
      create_fuel_issuance: {
        Args: {
          p_branch_id: string;
          p_issuance_date: string;
          p_category: string;
          p_issued_to: string;
          p_truck_id: string | null;
          p_reference_no: string;
          p_liters: number;
          p_remarks?: string;
          p_company_equipment_id?: string | null;
        };
        Returns: Database['public']['Tables']['fuel_issuances']['Row'];
      };
      create_fuel_adjustment: {
        Args: {
          p_branch_id: string;
          p_movement_date: string;
          p_liters_delta: number;
          p_unit_cost: number;
          p_reference_no?: string;
          p_description?: string;
          p_is_opening_balance?: boolean;
        };
        Returns: Database['public']['Tables']['fuel_inventory_ledger']['Row'];
      };
      reverse_fuel_movement: {
        Args: {
          p_ledger_id: string;
          p_reason?: string;
        };
        Returns: Database['public']['Tables']['fuel_inventory_ledger']['Row'];
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
export type HaulerOffsetEntry = Database['public']['Tables']['hauler_offset_entries']['Row'];
export type HaulerOffsetLedgerRow = Database['public']['Functions']['get_hauler_offset_ledger']['Returns'][number];
export type CustomerCreditEntry = Database['public']['Tables']['customer_credit_entries']['Row'];
export type CustomerCreditLedgerRow = Database['public']['Functions']['get_customer_credit_ledger']['Returns'][number];
export type FuelBranch = Database['public']['Tables']['fuel_branches']['Row'];
export type CompanyEquipment = Database['public']['Tables']['company_equipment']['Row'];
export type FuelInventoryState = Database['public']['Tables']['fuel_inventory_state']['Row'];
export type FuelPurchase = Database['public']['Tables']['fuel_purchases']['Row'];
export type FuelIssuance = Database['public']['Tables']['fuel_issuances']['Row'];
export type FuelInventoryLedger = Database['public']['Tables']['fuel_inventory_ledger']['Row'];
export type CustomerCreditSettlement = Database['public']['Tables']['customer_credit_settlements']['Row'];
export type ReceivableSettlement = Database['public']['Tables']['receivable_settlements']['Row'];
export type ReceivableSettlementHistoryRow = Database['public']['Functions']['get_receivable_settlement_history']['Returns'][number];
export type StoneCrusherMonthlyTarget = Database['public']['Tables']['stone_crusher_monthly_targets']['Row'];
export type StoneCrusherDailyEntry = Database['public']['Tables']['stone_crusher_daily_entries']['Row'];
export type SandWashingDailyEntry = Database['public']['Tables']['sand_washing_daily_entries']['Row'];
export type QuarrySiteDailyEntry = Database['public']['Tables']['quarry_site_daily_entries']['Row'];

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
