import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Paste from Supabase: Settings -> API
const SUPABASE_URL = 'https://eeihtokxisihnyizanuj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWh0b2t4aXNpaG55aXphbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTMwMzgsImV4cCI6MjA4NDg2OTAzOH0.BBt7cVENwwUMrVQv5SD5Z8L02lQts5ooXRVTv6LRavY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) // createClient options supported [web:36]

// ---- UI refs
const authView = document.getElementById('authView')
const appView = document.getElementById('appView')
const btnLogout = document.getElementById('btnLogout')
const btnRefresh = document.getElementById('btnRefresh')

const authMsg = document.getElementById('authMsg')
const signupMsg = document.getElementById('signupMsg')
const forgotMsg = document.getElementById('forgotMsg')
const resetMsg = document.getElementById('resetMsg')
const resetBox = document.getElementById('resetBox')

const whoami = document.getElementById('whoami')
const walletLine = document.getElementById('walletLine')
const postMsg = document.getElementById('postMsg')
const feed = document.getElementById('feed')

// ---- Tabs
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const tab = btn.getAttribute('data-tab')
    setPane(tab)
  })
})
function setPane(tab){
  document.getElementById('pane-login').classList.toggle('hidden', tab !== 'login')
  document.getElementById('pane-signup').classList.toggle('hidden', tab !== 'signup')
  document.getElementById('pane-forgot').classList.toggle('hidden', tab !== 'forgot')
}

// ---- Forms
document.getElementById('loginForm').addEventListener('submit', onLogin)
document.getElementById('signupForm').addEventListener('submit', onSignup)
document.getElementById('forgotForm').addEventListener('submit', onForgot)
document.getElementById('resetForm').addEventListener('submit', onReset)
document.getElementById('postForm').addEventListener('submit', onPost)
btnLogout.addEventListener('click', async () => { await supabase.auth.signOut(); await refreshUI() })
btnRefresh.addEventListener('click', async () => { await loadFeed() })

function setMsg(el, text){ el.textContent = text || '' }
function show(el){ el.classList.remove('hidden') }
function hide(el){ el.classList.add('hidden') }
function esc(s){ return (s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') }

async function refreshUI(){
  setMsg(authMsg,''); setMsg(signupMsg,''); setMsg(forgotMsg,''); setMsg(resetMsg,''); setMsg(postMsg,'')
  const { data: { user } } = await supabase.auth.getUser()

  if (!user){
    show(authView); hide(appView); hide(btnLogout)
    return
  }

  hide(authView); show(appView); show(btnLogout)

  const { data: profile } = await supabase
    .from('profiles')
    .select('username,wallet_balance')
    .eq('id', user.id)
    .single()

  whoami.textContent = profile?.username ? `@${profile.username}` : '@signed_in'
  walletLine.textContent = `Wallet: ${profile?.wallet_balance ?? 0}`

  await loadFeed()
}

async function loadFeed(){
  feed.innerHTML = `<div class="muted">Loading…</div>`
  const { data, error } = await supabase
    .from('posts')
    .select('id, content, created_at, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error){
    feed.innerHTML = `<div class="muted">Error: ${esc(error.message)}</div>`
    return
  }

  feed.innerHTML = ''
  for (const row of data){
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

// ---- Signup
async function onSignup(e){
  e.preventDefault()
  setMsg(signupMsg, 'Creating account…')

  const username = document.getElementById('signupUsername').value.trim()
  const email = document.getElementById('signupEmail').value.trim().toLowerCase()
  const password = document.getElementById('signupPassword').value

  if (!username.match(/^[a-zA-Z0-9_]{3,20}$/)) {
    return setMsg(signupMsg, 'Username must be 3–20 chars (letters, numbers, underscore).')
  }

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return setMsg(signupMsg, error.message)

  const userId = data.user?.id
  if (!userId) return setMsg(signupMsg, 'Signup ok, but no user returned. Check email confirmation settings in Supabase.')

  const { error: profErr } = await supabase.from('profiles').insert({
    id: userId,
    username,
    email,
    wallet_balance: 0
  })
  if (profErr) return setMsg(signupMsg, `Profile error: ${profErr.message}`)

  setMsg(signupMsg, 'Account created. Switch to Login.')
}

// ---- Login (username + password => username->email lookup then sign in)
// signInWithPassword is the standard method [web:69]
async function onLogin(e){
  e.preventDefault()
  setMsg(authMsg, 'Logging in…')

  const username = document.getElementById('loginUsername').value.trim()
  const password = document.getElementById('loginPassword').value

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
  if (!user) return setMsg(postMsg, 'Not logged in.')

  const { error } = await supabase.from('posts').insert({ user_id: user.id, content })
  if (error) return setMsg(postMsg, error.message)

  document.getElementById('postContent').value = ''
  await loadFeed()
}

// ---- Forgot password (email)
async function onForgot(e){
  e.preventDefault()
  setMsg(forgotMsg, 'Sending reset email…')

  const email = document.getElementById('forgotEmail').value.trim().toLowerCase()

  const redirectTo = window.location.origin + window.location.pathname
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }) // [web:55]

  setMsg(forgotMsg, error ? error.message : 'Sent. Open the email link to set a new password here.')
}

// When user returns from the email link, Supabase docs show listening for PASSWORD_RECOVERY to show the reset UI. [web:166]
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    setPane('forgot')
    show(resetBox)
  }
})

// ---- Update password
async function onReset(e){
  e.preventDefault()
  setMsg(resetMsg, 'Updating password…')

  const password = document.getElementById('newPassword').value
  const { error } = await supabase.auth.updateUser({ password }) // part of reset flow [web:55]

  setMsg(resetMsg, error ? error.message : 'Password updated. You can login now.')
}

// Boot
await refreshUI()
