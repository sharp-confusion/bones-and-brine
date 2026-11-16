/* Bones & Brine settings.
   Accounts: paste your Supabase project's URL and "anon public" key here (Supabase dashboard ->
   Project Settings -> API). Both are meant to be public; your data is protected by the rules in
   supabase/setup.sql. Leave them empty to run the game with guest play only. */
window.BNB_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  // usernames are turned into a placeholder sign-in address; no emails are ever sent
  loginDomain: 'players.bonesandbrine.example'
};
