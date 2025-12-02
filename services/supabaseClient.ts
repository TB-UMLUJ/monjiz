import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sgaxbwafynrrluyrdfia.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYXhid2FmeW5ycmx1eXJkZmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMjY1MDMsImV4cCI6MjA3OTkwMjUwM30.KgMZ5bAQBomUF3Bh-ZlmzlVbIf3xtyxhXDobQ5_Q2Ls';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Use the seed User ID from the SQL provided
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';