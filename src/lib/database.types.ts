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
      ingredient_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          ingredient_id: string
          kitchen_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          ingredient_id: string
          kitchen_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          ingredient_id?: string
          kitchen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_aliases_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_aliases_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_supermarkets: {
        Row: {
          ingredient_id: string
          kitchen_id: string
          supermarket_id: string
        }
        Insert: {
          ingredient_id: string
          kitchen_id: string
          supermarket_id: string
        }
        Update: {
          ingredient_id?: string
          kitchen_id?: string
          supermarket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_supermarkets_ingredient_fkey"
            columns: ["ingredient_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "ingredient_supermarkets_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_supermarkets_supermarket_fkey"
            columns: ["supermarket_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "supermarkets"
            referencedColumns: ["id", "kitchen_id"]
          },
        ]
      }
      ingredients: {
        Row: {
          category: string | null
          created_at: string
          default_unit: string | null
          id: string
          kitchen_id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_unit?: string | null
          id?: string
          kitchen_id: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_unit?: string | null
          id?: string
          kitchen_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          kitchen_id: string
          revoked_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          kitchen_id: string
          revoked_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          kitchen_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_invites_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_members: {
        Row: {
          joined_at: string
          kitchen_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          kitchen_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          kitchen_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_members_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_recipe_added_ingredients: {
        Row: {
          added_at: string
          ingredient_id: string
          kitchen_id: string
          meal_plan_recipe_id: string
        }
        Insert: {
          added_at?: string
          ingredient_id: string
          kitchen_id: string
          meal_plan_recipe_id: string
        }
        Update: {
          added_at?: string
          ingredient_id?: string
          kitchen_id?: string
          meal_plan_recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_recipe_added_ingred_meal_plan_recipe_id_kitchen__fkey"
            columns: ["meal_plan_recipe_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_recipes"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "meal_plan_recipe_added_ingredient_ingredient_id_kitchen_id_fkey"
            columns: ["ingredient_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "meal_plan_recipe_added_ingredients_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_recipes: {
        Row: {
          cooked_at: string | null
          created_at: string
          id: string
          kitchen_id: string
          meal_plan_id: string
          recipe_id: string
          servings: number
          sort_order: number
        }
        Insert: {
          cooked_at?: string | null
          created_at?: string
          id?: string
          kitchen_id: string
          meal_plan_id: string
          recipe_id: string
          servings: number
          sort_order?: number
        }
        Update: {
          cooked_at?: string | null
          created_at?: string
          id?: string
          kitchen_id?: string
          meal_plan_id?: string
          recipe_id?: string
          servings?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_recipes_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_recipes_meal_plan_id_kitchen_id_fkey"
            columns: ["meal_plan_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "meal_plan_recipes_recipe_id_kitchen_id_fkey"
            columns: ["recipe_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "kitchen_id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          completed_at: string | null
          created_at: string
          ends_on: string | null
          id: string
          kitchen_id: string
          name: string | null
          starts_on: string
          status: Database["public"]["Enums"]["plan_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          kitchen_id: string
          name?: string | null
          starts_on?: string
          status?: Database["public"]["Enums"]["plan_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          kitchen_id?: string
          name?: string | null
          starts_on?: string
          status?: Database["public"]["Enums"]["plan_status"]
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          id: string
          kitchen_id: string
          recipe_id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kitchen_id: string
          recipe_id: string
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          kitchen_id?: string
          recipe_id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_recipe_fkey"
            columns: ["recipe_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          display_unit: string | null
          id: string
          ingredient_id: string
          kitchen_id: string
          note: string | null
          quantity: number | null
          recipe_id: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          display_unit?: string | null
          id?: string
          ingredient_id: string
          kitchen_id: string
          note?: string | null
          quantity?: number | null
          recipe_id: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          display_unit?: string | null
          id?: string
          ingredient_id?: string
          kitchen_id?: string
          note?: string | null
          quantity?: number | null
          recipe_id?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_fkey"
            columns: ["ingredient_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_fkey"
            columns: ["recipe_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "kitchen_id"]
          },
        ]
      }
      recipe_photos: {
        Row: {
          created_at: string
          id: string
          kitchen_id: string
          recipe_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id: string
          recipe_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: string
          recipe_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_photos_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_photos_recipe_fkey"
            columns: ["recipe_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "kitchen_id"]
          },
        ]
      }
      recipe_tags: {
        Row: {
          kitchen_id: string
          recipe_id: string
          tag_id: string
        }
        Insert: {
          kitchen_id: string
          recipe_id: string
          tag_id: string
        }
        Update: {
          kitchen_id?: string
          recipe_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tags_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_tags_recipe_fkey"
            columns: ["recipe_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "recipe_tags_tag_fkey"
            columns: ["tag_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "kitchen_id"]
          },
        ]
      }
      recipes: {
        Row: {
          archived_at: string | null
          base_servings: number
          created_at: string
          created_by: string | null
          id: string
          kitchen_id: string
          last_reviewed_at: string | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          method: string | null
          name: string
          notes: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          base_servings?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id: string
          last_reviewed_at?: string | null
          meal_type?: Database["public"]["Enums"]["meal_type"]
          method?: string | null
          name: string
          notes?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          base_servings?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id?: string
          last_reviewed_at?: string | null
          meal_type?: Database["public"]["Enums"]["meal_type"]
          method?: string | null
          name?: string
          notes?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_item_supermarkets: {
        Row: {
          item_id: string
          kitchen_id: string
          supermarket_id: string
        }
        Insert: {
          item_id: string
          kitchen_id: string
          supermarket_id: string
        }
        Update: {
          item_id?: string
          kitchen_id?: string
          supermarket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_item_supermarkets_item_id_kitchen_id_fkey"
            columns: ["item_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "shopping_list_items"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "shopping_list_item_supermarkets_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_item_supermarkets_supermarket_id_kitchen_id_fkey"
            columns: ["supermarket_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "supermarkets"
            referencedColumns: ["id", "kitchen_id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          ingredient_id: string | null
          is_checked: boolean
          kitchen_id: string
          manual_name: string | null
          quantity: number | null
          shopping_list_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string | null
          is_checked?: boolean
          kitchen_id: string
          manual_name?: string | null
          quantity?: number | null
          shopping_list_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          ingredient_id?: string | null
          is_checked?: boolean
          kitchen_id?: string
          manual_name?: string | null
          quantity?: number | null
          shopping_list_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_ingredient_id_kitchen_id_fkey"
            columns: ["ingredient_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id", "kitchen_id"]
          },
          {
            foreignKeyName: "shopping_list_items_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_shopping_list_id_kitchen_id_fkey"
            columns: ["shopping_list_id", "kitchen_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id", "kitchen_id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          kitchen_id: string
          meal_plan_id: string | null
          status: Database["public"]["Enums"]["list_status"]
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          kitchen_id: string
          meal_plan_id?: string | null
          status?: Database["public"]["Enums"]["list_status"]
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          kitchen_id?: string
          meal_plan_id?: string | null
          status?: Database["public"]["Enums"]["list_status"]
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      supermarkets: {
        Row: {
          created_at: string
          id: string
          kitchen_id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "supermarkets_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          kitchen_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_kitchen_id_fkey"
            columns: ["kitchen_id"]
            isOneToOne: false
            referencedRelation: "kitchens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_meal_plan: { Args: { plan_id: string }; Returns: string }
      create_invite: { Args: { target_kitchen_id: string }; Returns: string }
      create_kitchen: { Args: { kitchen_name: string }; Returns: string }
      is_kitchen_member: { Args: { k: string }; Returns: boolean }
      merge_ingredients: {
        Args: { source_id: string; target_id: string }
        Returns: undefined
      }
      redeem_invite: { Args: { invite_code: string }; Returns: string }
      shares_a_kitchen_with: { Args: { other: string }; Returns: boolean }
    }
    Enums: {
      list_status: "active" | "archived"
      meal_type: "breakfast" | "lunch" | "dinner" | "dessert" | "snack"
      plan_status: "active" | "complete"
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
      list_status: ["active", "archived"],
      meal_type: ["breakfast", "lunch", "dinner", "dessert", "snack"],
      plan_status: ["active", "complete"],
    },
  },
} as const
