/* Bones & Brine settings.
   Accounts: paste your Supabase project's URL and "anon public" key here (Supabase dashboard ->
   Project Settings -> API). Both are meant to be public; your data is protected by the rules in
   supabase/setup.sql. Leave them empty to run the game with guest play only. */
window.BNB_CONFIG = {
  supabaseUrl: 'https://pekqxbgnpohmyaixavhs.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBla3F4YmducG9obXlhaXhhdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4NTkzNjQsImV4cCI6MjExMDQzNTM2NH0.-OqOAJwJeHWtmeykDRTzKaVE4mIRQ-wR_7DZGrWLMSQ',
  // usernames are turned into a placeholder sign-in address; no emails are ever sent
  loginDomain: 'players.bonesandbrine.example',
  // Connection relay (TURN) for players on strict school / work / mobile networks.
  // Free: sign up at https://www.metered.ca/stun-turn, create an app, then paste the app name
  // (the part before .metered.live) and the API key shown under "TURN Server" here.
  // This key is made to be used in web pages, so it's fine for it to be public.
  turnApp: '',
  turnKey: ''
};
