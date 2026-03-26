const SUPABASE_URL = 'https://hqbspprcvkoopufningr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxYnNwcHJjdmtvb3B1Zm5pbmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MjA0MjMsImV4cCI6MjA5MDA5NjQyM30.FnOl4ytTq-mi2hJwqJuu3Kl8yy8wumOnP5l9lgeZOTU';

if (!window.supabase) {
  console.error('Supabase SDK failed to load. Check your network connection.');
}
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) ?? null;

async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/?login=1';
    return null;
  }
  return user;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  const { data } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!data || data.role !== 'admin') {
    window.location.href = '/';
    return null;
  }
  return user;
}

async function signUp(email, password) {
  if (!supabaseClient) throw new Error('Authentication service unavailable. Please refresh the page.');
  return supabaseClient.auth.signUp({ email, password });
}

async function signIn(email, password) {
  if (!supabaseClient) throw new Error('Authentication service unavailable. Please refresh the page.');
  return supabaseClient.auth.signInWithPassword({ email, password });
}

async function signOut() {
  if (!supabaseClient) { window.location.href = '/'; return; }
  await supabaseClient.auth.signOut();
  window.location.href = '/';
}

async function getUserProgress(userId) {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient
    .from('user_progress')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}

async function updateNavAuth(user) {
  const authNav = document.getElementById('auth-nav');
  if (!authNav) return;
  if (user) {
    let isAdmin = false;
    if (supabaseClient) {
      const { data } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
      isAdmin = data?.role === 'admin';
    }
    authNav.innerHTML = `
      ${isAdmin ? `<li><a href="admin.html"><i class="fa-solid fa-shield-halved"></i> Admin</a></li>` : `<li><a href="profile.html"><i class="fa-regular fa-user"></i> Profile</a></li>`}
      <li><a href="#" onclick="signOut();return false;" class="btn btn-outline btn-sm" style="padding:0.4rem 1rem;">Sign Out</a></li>
    `;
  } else {
    authNav.innerHTML = `
      <li><a href="#" id="open-login" class="btn btn-primary" style="padding:0.45rem 1.1rem;">Sign In</a></li>
    `;
    document.getElementById('open-login')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('auth-modal')?.classList.add('open');
    });
  }
}
