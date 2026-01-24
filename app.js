import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1) PUT YOUR REAL VALUES HERE
const SUPABASE_URL = "https://eeihtokxisihnyizanuj.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWh0b2t4aXNpaG55aXphbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTMwMzgsImV4cCI6MjA4NDg2OTAzOH0.BBt7cVENwwUMrVQv5SD5Z8L02lQts5ooXRVTv6LRavY"

// ------------------------------------------------------------------
// Supabase client
// ------------------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Tiny helpers (safe against nulls)
const $ = (id) => document.getElementById(id)
const setMsg = (el, t) => { if (el) el.textContent = t || '' }
const show = (el) => { if (el) el.classList.remove('hidden') }
const hide = (el) => { if (el) el.classList.add('hidden') }
const esc = (s) => (s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')

// ------------------------------------------------------------------
// Element refs
// ------------------------------------------------------------------
const authView = $('authView')
const appView = $('appView')
const btnLogout = $('btnLogout')
const btnRefresh = $('btnRefresh')

const authMsg = $('authMsg')
const signupMsg = $('signupMsg')
const forgotMsg = $('forgotMsg')
const resetMsg = $('resetMsg')
const resetBox = $('resetBox')

const whoami = $('whoami')
const walletLine = $('walletLine')
const walletBalancePill = $('walletBalancePill')

const postMsg = $('postMsg')
const feed = $('feed')

const walletMsg = $('walletMsg')
const walletList = $('walletList')

const settingsMsg = $('settingsMsg')
const bioInput = $('bioInput')

// ------------------------------------------------------------------
// Auth tabs (Login / Signup / Forgot)
// ------------------------------------------------------------------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const tab = btn.getAttribute('data-tab')
    setAuthPane(tab)
  })
})

function setAuthPane(tab){
  $('pane-login')?.classList.toggle('hidden', tab !== 'login')
  $('pane-signup')?.classList.toggle('hidden', tab !== 'signup')
  $('pane-forgot')?.classList.toggle('hidden', tab !== 'forgot')
}

// ------------------------------------------------------------------
// Top nav (Feed / Wallet / Settings)
// ------------------------------------------------------------------
document.querySelectorAll('.navbtn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const view = btn.getAttribute('data-view')
    setView(view)
    if (view === 'walletView') await loadWallet()
  })
})

function setView(viewId){
  $('feedView')?.classList.toggle('hidden', viewId !== 'feedView')
  $('walletView')?.classList.toggle('hidden', viewId !== 'walletView')
  $('settingsView')?.classList.toggle('hidden', viewId !== 'settingsView')
}

// ------------------------------------------------------------------
// Wire form events
// ------------------------------------------------------------------
$('loginForm')?.addEventListener('submit', onLogin)
$('signupForm')?.addEventListener('submit', onSignup)
$('forgotForm')?.addEventListener('submit', onForgot)
$('resetForm')?.addEventListener('submit', onReset)

$('postForm')?.addEventListener('submit', onPost)
$('walletForm')?.addEventListener('submit', onWalletTx)
$('settingsForm')?.addEventListener('submit', onSaveSettings)

btnLogout?.addEventListener('click', async () => { await supabase.auth.signOut(); await refreshUI() })
btnRefresh?.addEventListener('click', async () => { await loadFeed() })

// ------------------------------------------------------------------
// Main UI refresh
// ------------------------------------------------------------------
async function refreshUI(){
  setMsg(authMsg,''); setMsg(signupMsg,''); setMsg(forgotMsg,''); setMsg(resetMsg,'')
  setMsg(postMsg,''); setMsg(walletMsg,''); setMsg(settingsMsg,'')

  const { data: { user } } = await supabase.auth.getUser()

  if (!user){
    show(authView); hide(appView); hide(btnLogout)
    return
  }

  hide(authView); show(appView); show(btnLogout)

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, bio')
    .eq('id', user.id)
    .single()

  if (whoami) whoami.textContent = profile?.username ? `@${profile.username}` : '@signed_in'
  if (bioInput) bioInput.value = profile?.bio ?? ''

  setView('feedView')
  document.querySelector('.navbtn[data-view="feedView"]')?.classList.add('active')

  await loadFeed()
  await loadWalletBalance()
}

// ------------------------------------------------------------------
// Feed
// ------------------------------------------------------------------
async function loadFeed(){
  if (!feed) return
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

async function onPost(e){
  e.preventDefault()
  setMsg(postMsg, '')

  const content = $('postContent')?.value?.trim() ?? ''
  if (!content) return setMsg(postMsg, 'Write something first.')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return setMsg(postMsg, 'Not logged in.')

  const { error } = await supabase.from('posts').insert({ user_id: user.id, content })
  if (error) return setMsg(postMsg, error.message)

  $('postContent').value = ''
  await loadFeed()
}

// ------------------------------------------------------------------
// Wallet (transaction log in wallet_transactions)
// ------------------------------------------------------------------
async function loadWalletBalance(){
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount')
    .eq('user_id', user.id)

  if (error){
    if (walletLine) walletLine.textContent = 'Wallet: 0'
    if (walletBalancePill) walletBalancePill.textContent = '$0'
    return
  }

  const balance = (data ?? []).reduce((acc, r) => acc + Number(r.amount || 0), 0)
  if (walletLine) walletLine.textContent = `Wallet: ${balance}`
  if (walletBalancePill) walletBalancePill.textContent = `$${balance}`
}

async function loadWallet(){
  if (!walletList) return
  walletList.innerHTML = `<div class="muted">Loading…</div>`
  await loadWalletBalance()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, amount, note, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(60)

  if (error){
    walletList.innerHTML = `<div class="muted">Wallet table error: ${esc(error.message)}</div>`
    return
  }

  walletList.innerHTML = ''
  for (const row of data){
    const amt = Number(row.amount || 0)
    const cls = amt >= 0 ? 'pos' : 'neg'
    const t = new Date(row.created_at).toLocaleString()
    const div = document.createElement('div')
    div.className = 'item'
    div.innerHTML = `
      <div>
        <div><span class="amount ${cls}">${esc(String(amt))}</span> <span class="muted">${esc(row.note || '')}</span></div>
        <div class="muted" style="font-size:13px;margin-top:4px">${esc(t)}</div>
      </div>
      <div class="pill">${amt >= 0 ? 'IN' : 'OUT'}</div>
    `
    walletList.appendChild(div)
  }
}

async function onWalletTx(e){
  e.preventDefault()
  setMsg(walletMsg, '')

  const amtRaw = $('walletAmount')?.value
  const note = $('walletNote')?.value?.trim() ?? ''
  const amount = Number(amtRaw)

  if (!Number.isFinite(amount) || amount === 0) return setMsg(walletMsg, 'Amount must be a non-zero number.')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return setMsg(walletMsg, 'Not logged in.')

  const { error } = await supabase.from('wallet_transactions').insert({ user_id: user.id, amount, note })
  if (error) return setMsg(walletMsg, error.message)

  $('walletAmount').value = ''
  $('walletNote').value = ''
  await loadWallet()
}

// ------------------------------------------------------------------
// Settings
// ------------------------------------------------------------------
async function onSaveSettings(e){
  e.preventDefault()
  setMsg(settingsMsg, 'Saving…')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return setMsg(settingsMsg, 'Not logged in.')

  const bio = bioInput?.value?.trim() ?? ''
  const { error } = await supabase.from('profiles').update({ bio }).eq('id', user.id)
  setMsg(settingsMsg, error ? error.message : 'Saved.')
}

// ------------------------------------------------------------------
// Auth: signup + username login
// ------------------------------------------------------------------
async function onSignup(e){
  e.preventDefault()
  setMsg(signupMsg, 'Creating account…')

  const username = $('signupUsername')?.value?.trim() ?? ''
  const email = ($('signupEmail')?.value ?? '').trim().toLowerCase()
  const password = $('signupPassword')?.value ?? ''

  if (!username.match(/^[a-zA-Z0-9_]{3,20}$/)) {
    return setMsg(signupMsg, 'Username must be 3–20 chars (letters, numbers, underscore).')
  }

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return setMsg(signupMsg, error.message)

  const userId = data.user?.id
  if (!userId) return setMsg(signupMsg, 'Signup ok, but no user returned (check email confirm settings in Supabase).')

  const { error: profErr } = await supabase.from('profiles').insert({ id: userId, username, email })
  setMsg(signupMsg, profErr ? profErr.message : 'Account created. Go to Login.')
}

async function onLogin(e){
  e.preventDefault()
  setMsg(authMsg, 'Logging in…')

  const username = $('loginUsername')?.value?.trim() ?? ''
  const password = $('loginPassword')?.value ?? ''

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

// ------------------------------------------------------------------
// Password reset (email flow)
// ------------------------------------------------------------------
async function onForgot(e){
  e.preventDefault()
  setMsg(forgotMsg, 'Sending…')

  const email = ($('forgotEmail')?.value ?? '').trim().toLowerCase()
  const redirectTo = window.location.origin + window.location.pathname

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }) // [web:55]
  setMsg(forgotMsg, error ? error.message : 'Sent reset email. Open the link, then set a new password here.')
}

// Listen for PASSWORD_RECOVERY event. [web:166]
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'))
    document.querySelector('.tab[data-tab="forgot"]')?.classList.add('active')
    setAuthPane('forgot')
    show(resetBox)
  }
})

async function onReset(e){
  e.preventDefault()
  setMsg(resetMsg, 'Updating…')

  const password = $('newPassword')?.value ?? ''
  const { error } = await supabase.auth.updateUser({ password }) // [web:55]
  setMsg(resetMsg, error ? error.message : 'Password updated. Go to Login.')
}

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
console.log("The Cut NYC using Supabase URL:", SUPABASE_URL)
await refreshUI()
