import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://jrxnqetpyyxrjamspjpl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyeG5xZXRweXl4cmphbXNwanBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NDAxNzIsImV4cCI6MjA5MDQxNjE3Mn0.X1VJMENMwHd8V6ruDRMPQPlK6NQ01kLF-gHCZ8_UZJc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
