// 1) Put your keys here
const SUPABASE_URL = "https://eeihtokxisihnyizanuj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlaWh0b2t4aXNpaG55aXphbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTMwMzgsImV4cCI6MjA4NDg2OTAzOH0.BBt7cVENwwUMrVQv5SD5Z8L02lQts5ooXRVTv6LRavY";


const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const setMsg = (el, msg) => { if (el) el.textContent = msg || ""; };

const authSection = $("authSection");
const appSection = $("appSection");
const whoami = $("whoami");
const logoutBtn = $("logoutBtn");

const loginForm = $("loginForm");
const signupForm = $("signupForm");
const postForm = $("postForm");

const authMsg = $("authMsg");
const signupMsg = $("signupMsg");
const postMsg = $("postMsg");
const feed = $("feed");

loginForm.addEventListener("submit", onLogin);
signupForm.addEventListener("submit", onSignup);
postForm.addEventListener("submit", onCreatePost);
logoutBtn.addEventListener("click", onLogout);

supabase.auth.onAuthStateChange(() => refreshUI());
refreshUI();

async function onSignup(e){
  e.preventDefault();
  setMsg(signupMsg, "Creating account…");

  const email = ($("signupEmail").value || "").trim().toLowerCase();
  const password = $("signupPassword").value || "";

  const { error } = await supabase.auth.signUp({ email, password }); // [web:47]
  if (error) return setMsg(signupMsg, error.message);

  setMsg(signupMsg, "Account created. Now log in (or confirm email if required).");
}

async function onLogin(e){
  e.preventDefault();
  setMsg(authMsg, "Logging in…");

  const email = ($("loginEmail").value || "").trim().toLowerCase();
  const password = $("loginPassword").value || "";

  const { error } = await supabase.auth.signInWithPassword({ email, password }); // [web:69]
  if (error) return setMsg(authMsg, error.message);

  setMsg(authMsg, "");
}

async function onLogout(){
  await supabase.auth.signOut();
}

async function refreshUI(){
  const { data: { user } } = await supabase.auth.getUser();

  const authed = !!user;
  authSection.classList.toggle("hidden", authed);
  appSection.classList.toggle("hidden", !authed);
  logoutBtn.style.display = authed ? "inline-block" : "none";
  whoami.textContent = authed ? user.email : "";

  if (authed) await loadFeed();
}

async function onCreatePost(e){
  e.preventDefault();
  setMsg(postMsg, "Posting…");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return setMsg(postMsg, "Not logged in.");

  const body = ($("postBody").value || "").trim();
  if (!body) return setMsg(postMsg, "Write something.");

  let image_url = null;

  const file = $("postImage").files?.[0];
  if (file) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const up = await supabase.storage
      .from("post-images")
      .upload(path, file, { upsert: false });

    if (up.error) return setMsg(postMsg, up.error.message);

    // Public buckets can use getPublicUrl convenience helper. [web:571]
    const { data } = supabase.storage.from("post-images").getPublicUrl(path);
    image_url = data.publicUrl;
  }

  const ins = await supabase
    .from("posts")
    .insert({ user_id: user.id, body, image_url });

  if (ins.error) return setMsg(postMsg, ins.error.message);

  $("postBody").value = "";
  $("postImage").value = "";
  setMsg(postMsg, "");
  await loadFeed();
}

async function loadFeed(){
  feed.innerHTML = "Loading…";

  const { data: posts, error } = await supabase
    .from("posts")
    .select("id,user_id,body,image_url,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    feed.innerHTML = "";
    return setMsg(postMsg, error.message);
  }

  feed.innerHTML = "";
  for (const p of posts) {
    const el = document.createElement("div");
    el.className = "post";
    el.innerHTML = `
      <div class="meta">
        <span>${p.user_id}</span>
        <span>${new Date(p.created_at).toLocaleString()}</span>
      </div>
      <div>${escapeHtml(p.body)}</div>
      ${p.image_url ? `<img src="${p.image_url}" alt="post image" />` : ""}
      <div class="actions">
        <button data-like="${p.id}">Like</button>
        <button data-comment="${p.id}">Comment</button>
      </div>
    `;
    feed.appendChild(el);
  }

  // Minimal hooks (you can expand to show counts + comment list)
  feed.querySelectorAll("button[data-like]").forEach(btn => {
    btn.addEventListener("click", () => toggleLike(btn.dataset.like));
  });
  feed.querySelectorAll("button[data-comment]").forEach(btn => {
    btn.addEventListener("click", () => addComment(btn.dataset.comment));
  });
}

async function toggleLike(postId){
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Like exists?
  const existing = await supabase
    .from("post_likes")
    .select("post_id,user_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing.data) {
    await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
  } else {
    await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
  }
}

async function addComment(postId){
  const text = prompt("Comment:");
  if (!text) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("post_comments").insert({
    post_id: postId,
    user_id: user.id,
    body: text.trim(),
  });
}

function escapeHtml(s){
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
