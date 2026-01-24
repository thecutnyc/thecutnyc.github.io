import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = "https://eeihtokxisihnyizanuj.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWh0b2t4aXNpaG55aXphbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTMwMzgsImV4cCI6MjA4NDg2OTAzOH0.BBt7cVENwwUMrVQv5SD5Z8L02lQts5ooXRVTv6LRavY"

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// --- UI refs
const authView = document.getElementById('authView')
const appView = document.getElementById('appView')
const btnLogout = document.getElementById('btnLogout')
const btnRefresh = document.getElementById('btnRefresh')

const authMsg = document.getElementById('authMsg')
const resetBox = document.getElementById('resetBox')
const resetMsg = document.getElementById('resetMsg')
const walletMsg = document.getElementById('walletMsg')
const settingsMsg = document.getElementById('settingsMsg')

const whoami = document.getElementById('whoami')
const walletLine = document.getElementById('walletLine')
const walletBalancePill = document.getElementById('walletBalancePill')

const feed = document.getElementById('feed')
const walletList = document.getElementById('walletList')

document.getElementById('loginForm').addEventListener('submit', onLogin)
document.getElementById('signupForm').addEventListener('submit', onSignup)
document.getElementById('forgotForm').addEventListener('submit', onForgot)
document.getElementById('resetForm').addEventListener('submit', onReset)

document.getElementById('postForm').addEventListener('submit', onPost)
document.getElementById('walletForm').addEventListener('submit', onWalletTx)
document.getElementById('settingsForm').addEventListener('submit', onSaveSettings)

btnLogout.addEventListener('click', async () => { await supabase.auth.signOut(); await refreshUI() })
btnRefresh.addEventListener('click', async () => { await loadFeed() })

function setMsg(el, t){ if (el) el.textContent = t || '' }
function show(el){ el.classList.remove('hidden') }
function hide(el){ el.classList.add('hidden') }
function esc(s){ return (s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') }

function setActiveView(viewId){
  document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'))
  document.querySelector(`.navbtn[data-view="${viewId}"]`)?.classList.add('active')

  document.getElementById('feedView').classList.toggle('hidden', viewId !== 'feedView')
  document.getElementById('walletView').classList.toggle('hidden', viewId !== 'walletView')
  document.getElementById('settingsView').classList.toggle('hidden', viewId !== 'settingsView')
}

document.querySelectorAll('.navbtn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const v = btn.getAttribute('data-view')
    setActiveView(v)
    if (v === 'walletView') await loadWallet()
  })
})

async function refreshUI(){
  setMsg(authMsg,''); setMsg(resetMsg,''); setMsg(walletMsg,''); setMsg(settingsMsg,'')
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

  whoami.textContent = profile?.username ? `@${profile.username}` : '@signed_in'
  document.getElementById('bioInput').value = profile?.bio ?? ''

  setActiveView('feedView')
  await loadFeed()
  await loadWalletBalance()
}

async function loadFeed(){
  feed.innerHTML = `<div class="muted">Loading…</div>`
  const { data, error } = await supabase
    .from('posts')
    .select('id, content, created_at, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error){ feed.innerHTML = `<div class="muted">Error: ${esc(error.message)}</div>`; return }

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
  setMsg(document.getElementById('postMsg'), '')
  const content = document.getElementById('postContent').value.trim()
  if (!content) return

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('posts').insert({ user_id: user.id, content })
  if (error) return setMsg(document.getElementById('postMsg'), error.message)

  document.getElementById('postContent').value = ''
  await loadFeed()
}

// ---- Wallet
async function loadWalletBalance(){
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount')
    .eq('user_id', user.id)

  if (error) { walletLine.textContent = 'Wallet: —'; walletBalancePill.textContent = '$—'; return }

  const balance = (data ?? []).reduce((acc, r) => acc + Number(r.amount || 0), 0)
  walletLine.textContent = `Wallet: ${balance}`
  walletBalancePill.textContent = `$${balance}`
}

async function loadWallet(){
  walletList.innerHTML = `<div class="muted">Loading…</div>`
  await loadWalletBalance()

  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, amount, note, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error){ walletList.innerHTML = `<div class="muted">Error: ${esc(error.message)}</div>`; return }

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

  const amount = Number(document.getElementById('walletAmount').value)
  const note = document.getElementById('walletNote').value.trim()

  if (!Number.isFinite(amount) || amount === 0) return setMsg(walletMsg, 'Amount must be a non-zero number.')

  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('wallet_transactions').insert({
    user_id: user.id,
    amount,
    note
  })

  if (error) return setMsg(walletMsg, error.message)

  document.getElementById('walletAmount').value = ''
  document.getElementById('walletNote').value = ''
  await loadWallet()
}

// ---- Settings
async function onSaveSettings(e){
  e.preventDefault()
  setMsg(settingsMsg, 'Saving…')

  const bio = document.getElementById('bioInput').value.trim()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('profiles')
    .update({ bio })
    .eq('id', user.id)

  setMsg(settingsMsg, error ? error.message : 'Saved.')
}

// ---- Auth (username login via username->email lookup)
async function onSignup(e){
  e.preventDefault()
  setMsg(authMsg, 'Creating account…')

  const username = document.getElementById('signupUsername').value.trim()
  const email = document.getElementById('signupEmail').value.trim().toLowerCase()
  const password = document.getElementById('signupPassword').value

  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return setMsg(authMsg, error.message)

  const userId = data.user?.id
  const { error: profErr } = await supabase.from('profiles').insert({
    id: userId, username, email, wallet_balance: 0
  })
  setMsg(authMsg, profErr ? profErr.message : 'Account created. Login now.')
}

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

  const { error } = await supabase.auth.signInWithPassword({ email: rows[0].email, password })
  if (error) return setMsg(authMsg, error.message)

  await refreshUI()
}

// Password reset
async function onForgot(e){
  e.preventDefault()
  setMsg(authMsg, '')
  setMsg(resetMsg, '')
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase()
  const redirectTo = window.location.origin + window.location.pathname

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }) // [web:55]
  setMsg(authMsg, error ? error.message : 'Sent reset email. Open the link, then set a new password.')
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    show(resetBox)
  }
}) // listen to auth events [web:166]

async function onReset(e){
  e.preventDefault()
  setMsg(resetMsg, 'Updating…')
  const password = document.getElementById('newPassword').value
  const { error } = await supabase.auth.updateUser({ password }) // [web:55]
  setMsg(resetMsg, error ? error.message : 'Password updated. Login again.')
}

// boot
await refreshUI()
