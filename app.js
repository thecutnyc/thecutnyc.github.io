import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1) Fill these in from Supabase Dashboard -> Project Settings -> API
const SUPABASE_URL = 'https://eeihtokxisihnyizanuj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWh0b2t4aXNpaG55aXphbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTMwMzgsImV4cCI6MjA4NDg2OTAzOH0.BBt7cVENwwUMrVQv5SD5Z8L02lQts5ooXRVTv6LRavY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY) // standard init [web:36]

// ---- UI refs
const authView = document.getElementById('authView')
const appView = document.getElementById('appView')
const adminPanel = document.getElementById('adminPanel')

const btnLogout = document.getElementById('btnLogout')
const authMsg = document.getElementById('authMsg')
const postMsg = document.getElementById('postMsg')
const adminMsg = document.getElementById('adminMsg')

const whoami = document.getElementById('whoami')
const walletLine = document.getElementById('walletLine')
const feed = document.getElementById('feed')

document.getElementById('loginForm').addEventListener('submit', onLogin)
document.getElementById('signupForm').addEventListener('submit', onSignup)
document.getElementById('postForm').addEventListener('submit', onPost)
document.getElementById('adminResetForm').addEventListener('submit', onAdminReset)
btnLogout.addEventListener('click', async () => { await supabase.auth.signOut(); await refreshUI() })

// ---- helpers
function setMsg(el, text){ el.textContent = text || '' }
function show(el){ el.classList.remove('hidden') }
function hide(el){ el.classList.add('hidden') }
function esc(s){ return (s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') }

async function refreshUI() {
  setMsg(authMsg,''); setMsg(postMsg,''); setMsg(adminMsg,'')
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    show(authView); hide(appView); hide(btnLogout)
    return
  }

  hide(authView); show(appView); show(btnLogout)

  // Load profile
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, is_admin, wallet_balance')
    .eq('id', user.id)
    .single()

  if (pErr) {
    whoami.textContent = 'Signed in'
    walletLine.textContent = 'Wallet: —'
    hide(adminPanel)
  } else {
    whoami.textContent = `@${profile.username}`
    walletLine.textContent = `Wallet: ${profile.wallet_balance ?? 0}`
    profile.is_admin ? show(adminPanel) : hide(adminPanel)
  }

  await loadFeed()
}

async function loadFeed() {
  feed.innerHTML = ''
  const { data, error } = await supabase
    .from('posts')
    .select('id, content, created_at, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    feed.innerHTML = `<div class="muted">Error loading feed: ${esc(error.message)}</div>`
    return
  }

  for (const row of data) {
    const u = row.profiles?.username ?? 'unknown'
    const t = new Date(row.created_at).toLocaleString()
    const div = document.createElement('div')
    div.className = 'post'
    div.innerHTML = `
      <div class="meta"><span class="user">@${esc(u)}</span><span>${esc(t)}</span></div>
      <div>${esc(row.content)}</div>
    `
    feed.appendChild(div)
  }
}

// ---- Auth
async function onSignup(e){
  e.preventDefault()
  setMsg(authMsg, 'Creating account...')

  const username = document.getElementById('signupUsername').value.trim()
  const email = document.getElementById('signupEmail').value.trim().toLowerCase()
  const password = document.getElementById('signupPassword').value

  if (!username.match(/^[a-zA-Z0-9_]{3,20}$/)) {
    return setMsg(authMsg, 'Username must be 3–20 chars: letters, numbers, underscore.')
  }

  // Create auth user (email+password) [web:47]
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return setMsg(authMsg, error.message)

  // Create profile row (visible username)
  const userId = data.user?.id
  if (!userId) return setMsg(authMsg, 'Signup succeeded but no user returned (check email confirmation settings).')

  const { error: profErr } = await supabase.from('profiles').insert({
    id: userId,
    username,
    email,
    wallet_balance: 0,
    is_admin: false
  })

  if (profErr) return setMsg(authMsg, `Profile error: ${profErr.message}`)

  setMsg(authMsg, 'Account created. You can login now (or you may need to confirm email depending on your settings).')
}

async function onLogin(e){
  e.preventDefault()
  setMsg(authMsg, 'Logging in...')

  const username = document.getElementById('loginUsername').value.trim()
  const password = document.getElementById('loginPassword').value

  // Lookup email by username, then sign in with email+password [web:48][web:69]
  const { data: rows, error: uErr } = await supabase
    .from('profiles')
    .select('email')
    .eq('username', username)
    .limit(1)

  if (uErr) return setMsg(authMsg, uErr.message)
  if (!rows || rows.length === 0) return setMsg(authMsg, 'Unknown username.')

  const email = rows[0].email
  const { error } = await supabase.auth.signInWithPassword({ email, password }) // [web:69]
  if (error) return setMsg(authMsg, error.message)

  await refreshUI()
}

// ---- Posts
async function onPost(e){
  e.preventDefault()
  setMsg(postMsg, '')

  const content = document.getElementById('postContent').value.trim()
  if (!content) return setMsg(postMsg, 'Write something first.')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return setMsg(postMsg, 'You are not logged in.')

  const { error } = await supabase.from('posts').insert({
    user_id: user.id,
    content
  })

  if (error) return setMsg(postMsg, error.message)
  document.getElementById('postContent').value = ''
  await loadFeed()
}

// ---- Admin password reset (Option A)
// You will create an Edge Function named "admin-reset-password".
// This frontend will call it.
async function onAdminReset(e){
  e.preventDefault()
  setMsg(adminMsg, 'Resetting...')

  const username = document.getElementById('adminTargetUsername').value.trim()
  const newPassword = document.getElementById('adminNewPassword').value

  const { data, error } = await supabase.functions.invoke('admin-reset-password', {
    body: { username, newPassword }
  })

  if (error) return setMsg(adminMsg, error.message)
  setMsg(adminMsg, data?.message ?? 'Done.')
}

await refreshUI()
supabase.auth.onAuthStateChange(async () => { await refreshUI() })
