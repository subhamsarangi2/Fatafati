const SUPABASE_URL = 'https://hqbspprcvkoopufningr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxYnNwcHJjdmtvb3B1Zm5pbmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MjA0MjMsImV4cCI6MjA5MDA5NjQyM30.FnOl4ytTq-mi2hJwqJuu3Kl8yy8wumOnP5l9lgeZOTU';

// Resolves a root-relative path against the repo base so it works on
// both GitHub Pages (e.g. /Fatafati/) and a custom domain (/).
function siteUrl(path) {
  const base = document.querySelector('base')?.href
    ?? (location.origin + location.pathname.replace(/\/[^/]*$/, '/'));
  // Normalise: ensure base ends with /
  const root = base.endsWith('/') ? base : base + '/';
  // Strip leading slash from path so we don't double-up
  return root + path.replace(/^\//, '');
}

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
    window.location.href = siteUrl('/?login=1');
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
    window.location.href = siteUrl('/');
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
  if (!supabaseClient) { window.location.href = siteUrl('/'); return; }
  await supabaseClient.auth.signOut();
  window.location.href = siteUrl('/');
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
  const mobileAuthNav = document.getElementById('mobile-auth-nav');

  let isAdmin = false;
  if (user && supabaseClient) {
    const { data } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
    isAdmin = data?.role === 'admin';
  }

  if (authNav) {
    if (user) {
      authNav.innerHTML = `
        ${isAdmin
          ? `<li><a href="admin.html"><i class="fa-solid fa-shield-halved"></i> Admin</a></li>`
          : `<li><a href="profile.html"><i class="fa-regular fa-user"></i> Profile</a></li>`}
        <li><a href="#" onclick="signOut();return false;" class="btn btn-outline btn-sm" style="padding:0.4rem 1rem;">Sign Out</a></li>
      `;
    } else {
      authNav.innerHTML = `
        <li><a href="#" id="open-login" class="btn btn-primary" style="padding:0.45rem 1.1rem;">Sign In</a></li>
      `;
    }
  }

  if (mobileAuthNav) {
    if (user) {
      mobileAuthNav.innerHTML = `
        ${isAdmin
          ? `<a href="admin.html"><i class="fa-solid fa-shield-halved"></i> Admin</a>`
          : `<a href="profile.html"><i class="fa-regular fa-user"></i> Profile</a>`}
        <button class="mobile-nav-btn" onclick="signOut();return false;">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Sign Out
        </button>
      `;
    } else {
      mobileAuthNav.innerHTML = `
        <button class="mobile-nav-btn" id="mobile-open-login">
          <i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In
        </button>
      `;
      document.getElementById('mobile-open-login')?.addEventListener('click', () => {
        const modal = document.getElementById('auth-modal');
        window.closeMenu?.();
        if (modal) {
          modal.classList.add('open');
        } else {
          window.location.href = siteUrl('/?login=1');
        }
      });
    }
  }
}
