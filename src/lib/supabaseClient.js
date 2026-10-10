import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hesjadnveduthwxstvdf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlc2phZG52ZWR1dGh3eHN0dmRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MDU5OTcsImV4cCI6MjEwNzE4MTk5N30.0wlniIaMxSsgE1h1nsPmLJCTsFAvY_IgZ7x7hA1rQrU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
