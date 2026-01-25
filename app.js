import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = "https://eeihtokxisihnyizanuj.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWh0b2t4aXNpaG55aXphbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTMwMzgsImV4cCI6MjA4NDg2OTAzOH0.BBt7cVENwwUMrVQv5SD5Z8L02lQts5ooXRVTv6LRavY"
const BUCKET_POST_IMAGES = "post-images"

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// helpers
const $ = (id) => document.getElementById(id)
const setMsg = (el, t) => { if (el) el.textContent = t || '' }
const show = (el) => { if (el) el.classList.remove('hidden') }
const hide = (el) => { if (el) el.classList.add('hidden') }
const esc = (s) => (s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')

function extFromType(type){
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  if (type === 'image/gif') return 'gif'
  return 'jpg'
}

// refs
const authView = $('authView')
const appView = $('appView')
const btnLogout = $('btnLogout')
const btnRefresh = $('btnRefresh')
const btnRefreshCharacters = $('btnRefreshCharacters')

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

const charactersMsg = $('charactersMsg')
const charactersList = $('charactersList')

// -------------------- tabs (auth)
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

// -------------------- nav (views)
document.querySelectorAll('.navbtn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    const view = btn.getAttribute('data-view')
    setView(view)

    if (view === 'walletView') await loadWallet()
    if (view === 'charactersView') await loadCharacters()
  })
})
function setView(viewId){
  $('feedView')?.classList.toggle('hidden', viewId !== 'feedView')
  $('walletView')?.classList.toggle('hidden', viewId !== 'walletView')
  $('charactersView')?.classList.toggle('hidden', viewId !== 'charactersView')
  $('settingsView')?.classList.toggle('hidden', viewId !== 'settingsView')
}

// -------------------- events
$('loginForm')?.addEventListener('submit', onLogin)
$('signupForm')?.addEventListener('submit', onSignup)
$('forgotForm')?.addEventListener('submit', onForgot)
$('resetForm')?.addEventListener('submit', onReset)

$('postForm')?.addEventListener('submit', onPost)

$('walletForm')?.addEventListener('submit', onWalletTx)
$('transferForm')?.addEventListener('submit', onTransfer)

$('settingsForm')?.addEventListener('submit', onSaveSettings)

$('characterForm')?.addEventListener('submit', onSaveCharacter)
btnRefreshCharacters?.addEventListener('click', async () => loadCharacters())

btnLogout?.addEventListener('click', async () => { await supabase.auth.signOut(); await refreshUI() })
btnRefresh?.addEventListener('click', async () => { await loadFeed() })

// -------------------- shared: profile map
async function loadProfileMap(userIds){
  const ids = [...new Set((userIds ?? []).filter(Boolean))]
  if (!ids.length) return {}

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', ids)

  if (error || !data) return {}
  const map = {}
  for (const p of data) map[p.id] = p.username
  return map
}

// -------------------- UI refresh
async function refreshUI(){
  setMsg(authMsg,''); setMsg(signupMsg,''); setMsg(forgotMsg,''); setMsg(resetMsg,'')
  setMsg(postMsg,''); setMsg(walletMsg,''); setMsg(settingsMsg,''); setMsg(charactersMsg,'')

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
  document.querySelectorAll('.navbtn').forEach(b => b.classList.remove('active'))
  document.querySelector('.navbtn[data-view="feedView"]')?.classList.add('active')

  await loadFeed()
  await loadWalletBalance()
}

// -------------------- FEED (posts + likes + comments)
async function loadFeed(){
  if (!feed) return
  feed.innerHTML = `<div class="muted">Loading…</div>`

  const { data: posts, error } = await supabase
    .from('posts')
    .select('id, user_id, content, image_url, created_at')
    .order('created_at', { ascending: false })
    .limit(40)

  if (error){
    feed.innerHTML = `<div class="muted">Error: ${esc(error.message)}</div>`
    return
  }

  const postIds = (posts ?? []).map(p => p.id)
  const userIds = (posts ?? []).map(p => p.user_id)

  // like counts + my likes
  const { data: likes } = await supabase
    .from('post_likes')
    .select('post_id, user_id')
    .in('post_id', postIds)

  const likeCount = {}
  const likedByMe = {}
  const { data: { user } } = await supabase.auth.getUser()
  const myId = user?.id ?? null

  for (const l of (likes ?? [])){
    likeCount[l.post_id] = (likeCount[l.post_id] || 0) + 1
    if (myId && l.user_id === myId) likedByMe[l.post_id] = true
  }

  // comment counts
  const { data: comments } = await supabase
    .from('post_comments')
    .select('id, post_id')
    .in('post_id', postIds)

  const commentCount = {}
  for (const c of (comments ?? [])){
    commentCount[c.post_id] = (commentCount[c.post_id] || 0) + 1
  }

  const nameMap = await loadProfileMap(userIds)

  feed.innerHTML = ''
  for (const row of posts){
    const u = nameMap[row.user_id] || 'user'
    const t = new Date(row.created_at).toLocaleString()
    const likesN = likeCount[row.id] || 0
    const commentsN = commentCount[row.id] || 0
    const isLiked = !!likedByMe[row.id]

    const div = document.createElement('div')
    div.className = 'post'
    div.innerHTML = `
      <div class="meta"><span class="user">@${esc(u)}</span><span>${esc(t)}</span></div>
      ${row.image_url ? `<img src="${esc(row.image_url)}" style="width:100%;border-radius:16px;border:1px solid rgba(255,255,255,.08);margin:8px 0" />` : ''}
      ${row.content ? `<div>${esc(row.content)}</div>` : ''}

      <div class="actions">
        <button class="smallbtn" data-like="${row.id}">${isLiked ? 'Liked' : 'Like'} · ${likesN}</button>
        <button class="smallbtn" data-toggle-comments="${row.id}">Comments · ${commentsN}</button>
      </div>

      <div id="comments-${row.id}" class="hidden" style="margin-top:10px">
        <div id="comments-list-${row.id}" class="list"></div>

        <form data-comment-form="${row.id}" class="grid" style="margin-top:10px">
          <label>Add comment
            <input data-comment-input="${row.id}" maxlength="220" placeholder="Say something…" />
          </label>
          <button class="btn primary" type="submit">Comment</button>
        </form>
        <p id="comments-msg-${row.id}" class="msg"></p>
      </div>
    `
    feed.appendChild(div)
  }

  // wire like buttons + comment toggles/forms
  feed.querySelectorAll('[data-like]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = Number(btn.getAttribute('data-like'))
      await toggleLike(postId)
      await loadFeed()
    })
  })

  feed.querySelectorAll('[data-toggle-comments]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = Number(btn.getAttribute('data-toggle-comments'))
      const box = $(`comments-${postId}`)
      if (!box) return
      box.classList.toggle('hidden')
      if (!box.classList.contains('hidden')) await renderComments(postId)
    })
  })

  feed.querySelectorAll('form[data-comment-form]').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const postId = Number(form.getAttribute('data-comment-form'))
      const input = feed.querySelector(`[data-comment-input="${postId}"]`)
      const msgEl = $(`comments-msg-${postId}`)
      setMsg(msgEl, '')
      const content = (input?.value ?? '').trim()
      if (!content) return setMsg(msgEl, 'Write a comment first.')
      const err = await addComment(postId, content)
      if (err) return setMsg(msgEl, err)
      if (input) input.value = ''
      await renderComments(postId)
      await loadFeed()
    })
  })
}

async function toggleLike(post_id){
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.from('post_likes').insert({ post_id, user_id: user.id })
  if (!error) return

  await supabase.from('post_likes').delete().eq('post_id', post_id).eq('user_id', user.id)
}

async function addComment(post_id, content){
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Not logged in.'
  const { error } = await supabase.from('post_comments').insert({ post_id, user_id: user.id, content })
  return error ? error.message : null
}

async function renderComments(post_id){
  const list = $(`comments-list-${post_id}`)
  if (!list) return
  list.innerHTML = `<div class="muted">Loading…</div>`

  const { data: rows, error } = await supabase
    .from('post_comments')
    .select('id, user_id, content, created_at')
    .eq('post_id', post_id)
    .order('created_at', { ascending: true })

  if (error){
    list.innerHTML = `<div class="muted">Error: ${esc(error.message)}</div>`
    return
  }

  const map = await loadProfileMap((rows ?? []).map(r => r.user_id))
  const { data: { user } } = await supabase.auth.getUser()
  const myId = user?.id ?? null

  list.innerHTML = ''
  for (const r of (rows ?? [])){
    const u = map[r.user_id] || 'user'
    const t = new Date(r.created_at).toLocaleString()
    const canDelete = myId && r.user_id === myId

    const div = document.createElement('div')
    div.className = 'item'
    div.innerHTML = `
      <div>
        <div class="meta" style="margin:0 0 6px">
          <span class="user">@${esc(u)}</span><span>${esc(t)}</span>
        </div>
        <div>${esc(r.content)}</div>
      </div>
      ${canDelete ? `<button class="smallbtn" data-del-comment="${r.id}" data-post="${post_id}">Delete</button>` : `<div class="pill">•</div>`}
    `
    list.appendChild(div)
  }

  list.querySelectorAll('[data-del-comment]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-del-comment'))
      const pid = Number(btn.getAttribute('data-post'))
      await supabase.from('post_comments').delete().eq('id', id)
      await renderComments(pid)
      await loadFeed()
    })
  })
}

// -------------------- POST (image upload)
async function onPost(e){
  e.preventDefault()
  setMsg(postMsg, '')

  const content = $('postContent')?.value?.trim() ?? ''
  const file = $('postImage')?.files?.[0] ?? null
  if (!content && !file) return setMsg(postMsg, 'Write something or add an image.')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return setMsg(postMsg, 'Not logged in.')

  let image_url = null

  if (file){
    if (!file.type.startsWith('image/')) return setMsg(postMsg, 'That file is not an image.')
    if (file.size > 6 * 1024 * 1024) return setMsg(postMsg, 'Image too big (max ~6MB).')

    const ext = extFromType(file.type)
    const filename = `${crypto.randomUUID()}.${ext}`
    const path = `${user.id}/${filename}`

    const { error: upErr } = await supabase
      .storage
      .from(BUCKET_POST_IMAGES)
      .upload(path, file, { upsert: false, contentType: file.type }) // [web:368]

    if (upErr) return setMsg(postMsg, upErr.message)

    const { data: pub } = supabase
      .storage
      .from(BUCKET_POST_IMAGES)
      .getPublicUrl(path) // [web:377]

    image_url = pub?.publicUrl ?? null
  }

  const { error } = await supabase
    .from('posts')
    .insert({ user_id: user.id, content: content || '', image_url })

  if (error) return setMsg(postMsg, error.message)

  $('postContent').value = ''
  if ($('postImage')) $('postImage').value = ''
  await loadFeed()
}

// -------------------- WALLET
async function loadWalletBalance(){
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount')
    .eq('user_id', user.id)

  const balance = error ? 0 : (data ?? []).reduce((acc, r) => acc + Number(r.amount || 0), 0)

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
    walletList.innerHTML = `<div class="muted">Wallet error: ${esc(error.message)}</div>`
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

async function onTransfer(e){
  e.preventDefault()
  setMsg(walletMsg, '')

  const to_username = ($('transferTo')?.value ?? '').trim()
  const amount = Number($('transferAmount')?.value)
  const note = ($('transferNote')?.value ?? '').trim()

  if (!to_username) return setMsg(walletMsg, 'Enter a username.')
  if (!Number.isFinite(amount) || amount <= 0) return setMsg(walletMsg, 'Amount must be > 0.')

  const { error } = await supabase.rpc('transfer_money', { to_username, amount, note }) // [web:427]
  if (error) return setMsg(walletMsg, error.message)

  $('transferTo').value = ''
  $('transferAmount').value = ''
  $('transferNote').value = ''
  await loadWallet()
}

// -------------------- CHARACTERS
async function loadCharacters(){
  if (!charactersList) return
  setMsg(charactersMsg, '')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // load my character (first one)
  const { data: mine } = await supabase
    .from('characters')
    .select('id, character_name, age, faction, faceclaim, bio')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)

  const m = (mine && mine[0]) ? mine[0] : null
  $('charName').value = m?.character_name ?? ''
  $('charAge').value = m?.age ?? ''
  $('charFaction').value = m?.faction ?? ''
  $('charFaceclaim').value = m?.faceclaim ?? ''
  $('charBio').value = m?.bio ?? ''
  $('characterForm').setAttribute('data-char-id', m?.id ?? '')

  // load all characters
  charactersList.innerHTML = `<div class="muted">Loading…</div>`
  const { data: rows, error } = await supabase
    .from('characters')
    .select('id, user_id, character_name, age, faction, faceclaim, bio, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error){
    charactersList.innerHTML = `<div class="muted">Error: ${esc(error.message)}</div>`
    return
  }

  const map = await loadProfileMap((rows ?? []).map(r => r.user_id))

  charactersList.innerHTML = ''
  for (const r of (rows ?? [])){
    const owner = map[r.user_id] || 'user'
    const div = document.createElement('div')
    div.className = 'item'
    div.innerHTML = `
      <div>
        <div class="meta" style="margin:0 0 6px">
          <span class="user">${esc(r.character_name)}</span>
          <span class="muted">by @${esc(owner)}</span>
        </div>
        <div class="muted" style="margin-bottom:6px">${esc([r.age ? `Age: ${r.age}` : '', r.faction ? `Faction: ${r.faction}` : '', r.faceclaim ? `Faceclaim: ${r.faceclaim}` : ''].filter(Boolean).join(' · '))}</div>
        <div>${esc(r.bio || '')}</div>
      </div>
      <div class="pill">IC</div>
    `
    charactersList.appendChild(div)
  }
}

async function onSaveCharacter(e){
  e.preventDefault()
  setMsg(charactersMsg, 'Saving…')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return setMsg(charactersMsg, 'Not logged in.')

  const character_name = ($('charName')?.value ?? '').trim()
  const age = ($('charAge')?.value ?? '').trim()
  const faction = ($('charFaction')?.value ?? '').trim()
  const faceclaim = ($('charFaceclaim')?.value ?? '').trim()
  const bio = ($('charBio')?.value ?? '').trim()

  if (!character_name) return setMsg(charactersMsg, 'Name is required.')

  const id = $('characterForm')?.getAttribute('data-char-id') || ''

  let error
  if (id){
    ;({ error } = await supabase
      .from('characters')
      .update({ character_name, age, faction, faceclaim, bio })
      .eq('id', Number(id))
      .eq('user_id', user.id))
  } else {
    ;({ error } = await supabase
      .from('characters')
      .insert({ user_id: user.id, character_name, age, faction, faceclaim, bio }))
  }

  setMsg(charactersMsg, error ? error.message : 'Saved.')
  await loadCharacters()
}

// -------------------- SETTINGS
async function onSaveSettings(e){
  e.preventDefault()
  setMsg(settingsMsg, 'Saving…')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return setMsg(settingsMsg, 'Not logged in.')

  const bio = bioInput?.value?.trim() ?? ''
  const { error } = await supabase.from('profiles').update({ bio }).eq('id', user.id)
  setMsg(settingsMsg, error ? error.message : 'Saved.')
}

// -------------------- AUTH
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
  if (!userId) return setMsg(signupMsg, 'Signup ok, but no user returned (check email confirm settings).')

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

  if (uErr) return setMsg
