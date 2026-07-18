import { Injectable } from '@angular/core';
import {
  createClient,
  SupabaseClient
} from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {

  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(
      environment.supabaseUrl.trim(),
      environment.supabaseAnonKey.trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );
  }

  isConfigured(): boolean {
    return (
      environment.supabaseUrl.startsWith('https://') &&
      environment.supabaseUrl.endsWith('.supabase.co') &&
      environment.supabaseAnonKey.startsWith('sb_publishable_')
    );
  }
}