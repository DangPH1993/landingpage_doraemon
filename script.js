const API_BASE = "https://doraemon-pro.onrender.com";
const TOKEN_KEY = "doraemon_web_access_token";
const PROFILE_KEY = "doraemon_web_profile";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  profile: JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"),
  view: "chat",
  selectedCourseId: null,
  selectedCourseName: "",
  chatboxId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  chatboxNew: true,
  chatHistory: [],
  messages: [],
  courses: [],
  autoChatTimer: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const landingView = $("#landingView");
const appView = $("#appView");
const authModal = $("#authModal");
const authForm = $("#authForm");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}
function nl2br(value) { return escapeHtml(value).replace(/\n/g, "<br>"); }
function money(v) { return `${Number(v || 0).toLocaleString("vi-VN")} đ`; }
function fmtDate(v) { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v).slice(0, 16) : d.toLocaleString("vi-VN"); }
function setToken(token, profile = null) { state.token = token || ""; if (state.token) localStorage.setItem(TOKEN_KEY, state.token); else localStorage.removeItem(TOKEN_KEY); if (profile) { state.profile = profile; localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } }
function authHeaders(extra = {}) { return state.token ? { Authorization: `Bearer ${state.token}`, ...extra } : extra; }
function route() { const raw = location.hash || "#"; return raw.startsWith("#/app") ? "app" : "landing"; }
function routeView() { const raw = location.hash || ""; const q = raw.includes("?") ? new URLSearchParams(raw.split("?")[1]) : new URLSearchParams(); return q.get("view") || "chat"; }
function toast(msg, type = "info") { const el = $("#toast"); el.textContent = msg; el.className = `toast ${type}`; clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => el.className = "toast hidden", 3200); }
function openAuth(mode = "login") { authModal.classList.remove("hidden"); authModal.setAttribute("aria-hidden", "false"); setAuthMode(mode); setTimeout(() => $("#authPhone").focus(), 30); }
function closeAuth() { authModal.classList.add("hidden"); authModal.setAttribute("aria-hidden", "true"); $("#authStatus").textContent = ""; }
function setAuthMode(mode) {
  const register = mode === "register";
  $$(".auth-tab").forEach(x => x.classList.toggle("active", x.dataset.authMode === mode));
  $("#nicknameField").classList.toggle("hidden", !register);
  $("#authNickname").required = register;
  $("#authSubmit").textContent = register ? "Tạo tài khoản" : "Đăng nhập";
  $("#authPassword").autocomplete = register ? "new-password" : "current-password";
  authForm.dataset.mode = mode;
}

async function api(path, options = {}) {
  const opts = { ...options, headers: authHeaders({ ...(options.headers || {}) }) };
  if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }
  if (!res.ok) {
    const detail = data?.detail;
    if (res.status === 401 || res.status === 403) {
      if (detail?.code === "TOKEN_EXPIRED" || detail?.code === "INVALID_TOKEN" || res.status === 401) {
        logout(false);
      }
    }
    let msg = typeof detail === "string" ? detail : (detail?.message || `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

async function loadMe() {
  if (!state.token) return null;
  const data = await api("/auth/me");
  state.profile = data.user || state.profile;
  const sub = data.subscription || {};
  state.courses = Array.isArray(sub.courses) ? sub.courses : [];
  state.selectedCourseId = data.selected_course_id ?? (state.courses[0]?.course_id ?? null);
  state.selectedCourseName = data.selected_course_name || state.courses.find(c => String(c.course_id) === String(state.selectedCourseId))?.name || "";
  localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile || null));
  return data;
}

async function login(phone, password) {
  const data = await api("/auth/login", { method: "POST", body: { phone, password } });
  setToken(data.access_token, data.user);
  await loadMe();
  closeAuth();
  toast("Đăng nhập thành công", "success");
  location.hash = "#/app";
}
async function register(phone, nickname, password) {
  const data = await api("/auth/register", { method: "POST", body: { phone, nickname, password } });
  setToken(data.access_token || "", data.user || { phone, nickname });
  if (!state.token) { await login(phone, password); return; }
  await loadMe(); closeAuth(); toast("Tạo tài khoản thành công", "success"); location.hash = "#/app";
}
function logout(showToast = true) {
  state.token = ""; state.profile = null; state.courses = []; state.chatHistory = []; state.messages = []; state.chatboxNew = true;
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(PROFILE_KEY); stopAutoChat();
  if (showToast) toast("Đã đăng xuất", "success");
  location.hash = "#";
}

function renderLanding() {
  landingView.classList.remove("hidden");
  appView.classList.add("hidden");
  $("#siteNav").classList.remove("app-mode");
  $("#navAuthBtn").textContent = state.token ? "Mở Doraemon" : "Đăng nhập";
  $(".nav-app").textContent = state.token ? "Học ngay →" : "Học trên Web →";
}

function renderAppShell() {
  landingView.classList.add("hidden"); appView.classList.remove("hidden"); $("#siteNav").classList.add("app-mode");
  const userName = escapeHtml(state.profile?.nickname || "bạn");
  const sub = state.__me?.subscription || {};
  appView.innerHTML = `
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="app-brand"><div class="logo-icon">D</div><div><strong>Doraemon</strong><span>Japanese AI tutor</span></div></div>
      <div class="user-mini"><div class="avatar">${escapeHtml((state.profile?.nickname || "D").slice(0,1).toUpperCase())}</div><div><strong>${userName}</strong><small>${escapeHtml(sub.plan || "Free")}</small></div></div>
      <nav class="side-nav">
        ${navItem("chat","💬","Doraemon")}
        ${navItem("catalog","📚","Khóa học & nội dung")}
        ${navItem("plan","🎯","Lộ trình học")}
        ${navItem("review","🔄","Ôn tập")}
        ${navItem("packages","💳","Gói học")}
        ${navItem("admin","🛟","Chat Admin")}
        ${navItem("settings","⚙️","Cấu hình")}
      </nav>
      <div class="sidebar-bottom">
        <div class="quota-card">${sub.unlimited ? "∞ Không giới hạn" : `Free · ${Number(sub.remaining_today ?? Math.max(0,5-Number(sub.used_today||0)))}/5 lượt hôm nay`}</div>
        <button class="side-link" id="logoutBtn">↪ Đăng xuất</button>
        <a class="side-link" href="#">← Trang giới thiệu</a>
      </div>
    </aside>
    <section class="app-main">
      <header class="app-topbar"><div><div class="section-label">DORAEMON WEB</div><h1 id="appTitle">${titleFor(state.view)}</h1></div><div class="topbar-course"><span>Khóa học</span><select id="courseSelect"><option value="">${state.courses.length ? "Chọn khóa học" : "Chưa có khóa học"}</option>${state.courses.map(c => `<option value="${escapeHtml(c.course_id)}" ${String(c.course_id)===String(state.selectedCourseId)?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}</select></div></header>
      <div id="appContent" class="app-content"></div>
    </section>
  </div>`;
  $$(".side-nav .side-nav-item").forEach(btn => btn.addEventListener("click", () => { state.view = btn.dataset.view; renderAppShell(); loadView(); }));
  $("#logoutBtn").addEventListener("click", () => logout());
  $("#courseSelect")?.addEventListener("change", async e => { const cid = e.target.value; if (!cid) return; try { const d = await api("/learning/select-course", {method:"POST", body:{course_id:Number(cid)}}); state.selectedCourseId=d.course_id; state.selectedCourseName=d.course_name; toast(`Đã chọn ${d.course_name}`, "success"); state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`; state.chatboxNew=true; state.chatHistory=[]; state.messages=[]; renderAppShell(); loadView(); } catch(err) { toast(err.message,"error"); } });
}
function navItem(view, icon, label) { return `<button class="side-nav-item ${state.view===view?"active":""}" data-view="${view}"><span>${icon}</span>${label}</button>`; }
function titleFor(v) { return ({chat:"Học cùng Doraemon",catalog:"Khóa học & nội dung",plan:"Lộ trình học",review:"Ôn tập",packages:"Gói học",admin:"Chat với Admin",settings:"Cấu hình"})[v] || "Doraemon"; }

async function ensureSelectedCourse() {
  if (!state.selectedCourseId && state.courses.length === 1) {
    state.selectedCourseId = state.courses[0].course_id; state.selectedCourseName = state.courses[0].name;
    try { await api("/learning/select-course", {method:"POST", body:{course_id:Number(state.selectedCourseId)}}); } catch {}
  }
}
async function initApp() {
  try { state.__me = await loadMe(); await ensureSelectedCourse(); } catch (e) { renderAppShell(); $("#appContent").innerHTML = `<div class="empty-state error">Không thể tải tài khoản: ${escapeHtml(e.message)}</div>`; return; }
  state.view = routeView(); renderAppShell(); await loadView();
}
async function loadView() {
  const el = $("#appContent"); el.innerHTML = `<div class="loading"><span></span><span></span><span></span>Đang tải...</div>`;
  try {
    if (state.view === "chat") await renderChat(el);
    else if (state.view === "catalog") await renderCatalog(el);
    else if (state.view === "plan") await renderPlan(el);
    else if (state.view === "review") await renderReview(el);
    else if (state.view === "packages") await renderPackages(el);
    else if (state.view === "admin") await renderAdmin(el);
    else if (state.view === "settings") await renderSettings(el);
  } catch (e) { el.innerHTML = `<div class="empty-state error"><strong>Có lỗi.</strong><div>${escapeHtml(e.message)}</div></div>`; }
}

function addChatMessage(role, blocks, opts = {}) {
  const item = { role, blocks: Array.isArray(blocks) ? blocks : [{type:"text",text:String(blocks||"")}], prefix: opts.prefix || "" };
  state.messages.push(item); return item;
}
function textBlocksFromReply(reply) { return [{type:"text",text:String(reply || "")}]; }
function renderBlock(block) {
  const type = block?.type || "text";
  if (type === "image") {
    const url = block.url || block.image_url || ""; if (!url) return "";
    const meta = [block.term, block.reading, block.meaning].filter(Boolean).join(" · ");
    return `<figure class="chat-image"><img src="${escapeHtml(url)}" alt="${escapeHtml(meta || "Nội dung bài học")}" loading="lazy" onerror="this.closest('figure').classList.add('image-error')"><figcaption>${escapeHtml(meta || block.caption || "")}</figcaption></figure>`;
  }
  if (type === "choice") {
    const options = Array.isArray(block.options) ? block.options : [];
    return `<div class="choice-row">${options.map((o,i)=>`<button class="chat-choice ${i===0?"primary":""}" data-action="${escapeHtml(o.action || "")}" data-label="${escapeHtml(o.label || "")}" data-display="${escapeHtml(o.display_label || o.label || "")}">${escapeHtml(o.label || "Lựa chọn")}</button>`).join("")}</div>`;
  }
  if (type === "html") return block.html || "";
  return `<div class="chat-text">${nl2br(block.text || "")}</div>`;
}
function renderMessages() {
  const list = $("#chatMessages"); if (!list) return;
  list.innerHTML = state.messages.map((m, idx)=>`<div class="chat-row ${m.role==='user'?'user':'model'}"><div class="chat-avatar">${m.role==='user'?'Bạn':'D'}</div><div class="chat-bubble"><div class="chat-role">${m.role==='user'?'Bạn':'Doraemon'}</div>${m.blocks.map(renderBlock).join("")}</div></div>`).join("");
  $$(".chat-choice", list).forEach(btn => btn.addEventListener("click", () => sendAction(btn.dataset.action, btn.dataset.display || btn.dataset.label)));
  list.scrollTop = list.scrollHeight;
}
function currentHistoryForApi() { return state.chatHistory.slice(-20); }
function rememberChatTurn(role, text) { state.chatHistory.push({role, parts:[{text:String(text||"")}]}); if (state.chatHistory.length > 24) state.chatHistory = state.chatHistory.slice(-24); }
async function sendAction(action, displayLabel) { await sendChat("", null, false, action, displayLabel || action); }
async function sendChat(prompt, imageBase64 = null, proactive = false, action = null, visibleUserText = null) {
  if (!state.token) { openAuth("login"); return; }
  const userLabel = visibleUserText ?? prompt;
  if (userLabel) { addChatMessage("user", textBlocksFromReply(userLabel)); renderMessages(); }
  const bubble = addChatMessage("model", [{type:"text", text:"💭 Doraemon đang suy nghĩ..."}]); renderMessages();
  try {
    const payload = {
      prompt: prompt || "",
      chat_history: currentHistoryForApi(),
      chatbox_new: state.chatboxNew,
      chatbox_id: state.chatboxId,
      image_base64: imageBase64,
      use_knowledge_base: true,
      knowledge_namespace: "__default__",
      proactive,
      action,
      selected_context: null,
      course_id: state.selectedCourseId ? Number(state.selectedCourseId) : null,
    };
    state.chatboxNew = false;
    const data = await api("/api/proxy-chat", {method:"POST", body:payload});
    bubble.blocks = data.content_blocks?.length ? data.content_blocks : textBlocksFromReply(data.reply);
    if (state.messages.includes(bubble) === false) state.messages.push(bubble);
    if (userLabel) rememberChatTurn("user", userLabel);
    if (data.reply) rememberChatTurn("model", data.reply);
    renderMessages();
    if (data.subscription) state.__me.subscription = data.subscription;
  } catch (e) {
    bubble.blocks = [{type:"text",text:`${e.message}` }]; renderMessages();
  }
}
async function startWelcome() {
  state.messages = []; state.chatHistory = [];
  try {
    const data = await api(`/session/welcome${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`);
    if (data.message) rememberChatTurn("model", data.message);
    state.messages.push({role:"model",blocks:data.content_blocks?.length ? data.content_blocks : textBlocksFromReply(data.message)});
  } catch (e) { state.messages.push({role:"model",blocks:textBlocksFromReply(`Chào cậu! Có lỗi khi tải phiên chào mừng: ${e.message}`)}); }
  renderMessages();
}

async function renderChat(el) {
  el.innerHTML = `<div class="chat-layout"><section class="chat-panel"><div class="chat-toolbar"><div><strong>${escapeHtml(state.selectedCourseName || "Doraemon")}</strong><small>Phiên học mới · nội dung và nút hành động do server trả về</small></div><button class="small-button" id="newChatBtn">＋ Phiên mới</button></div><div class="chat-messages" id="chatMessages"></div><div class="chat-composer"><div class="attach-wrap"><input type="file" id="chatImage" accept="image/*" hidden><button class="icon-button" id="attachBtn" title="Gửi ảnh">📎</button><button class="icon-button" id="screenBtn" title="Chia sẻ màn hình">▣</button></div><textarea id="chatInput" rows="1" placeholder="Hỏi Doraemon…"></textarea><button class="send-button" id="sendBtn">➤</button></div><div class="composer-hint">Enter để gửi · Shift+Enter để xuống dòng · Có thể dán/chọn ảnh bài tập</div></section><aside class="chat-side"><div class="side-card"><div class="side-card-title">⚡ Truy cập nhanh</div><button class="quick-link" data-view="catalog">📚 Nội dung khóa học</button><button class="quick-link" data-view="plan">🎯 Lộ trình học</button><button class="quick-link" data-view="review">🔄 Ôn tập hôm nay</button><button class="quick-link" data-view="settings">⚙️ Cấu hình</button></div><div class="side-card"><div class="side-card-title">💡 Mẹo</div><p>Chọn một bài cụ thể trong nội dung khóa học rồi quay lại chat để học theo đúng lesson.</p></div></aside></div>`;
  renderMessages();
  $("#newChatBtn").onclick = () => { state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`; state.chatboxNew=true; state.messages=[]; state.chatHistory=[]; startWelcome(); };
  $("#attachBtn").onclick = () => $("#chatImage").click();
  $("#chatImage").onchange = async e => { const f=e.target.files?.[0]; if(f) await sendFileImage(f); e.target.value=""; };
  $("#screenBtn").onclick = async () => { try { const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false}); const video=document.createElement("video"); video.srcObject=stream; await video.play(); const canvas=document.createElement("canvas"); canvas.width=video.videoWidth; canvas.height=video.videoHeight; canvas.getContext("2d").drawImage(video,0,0); stream.getTracks().forEach(t=>t.stop()); await sendChat("Dựa vào ảnh màn hình mình vừa chia sẻ, hãy giúp mình.", canvas.toDataURL("image/jpeg",0.82).split(",")[1], false, null); } catch(e) { toast("Không thể chụp màn hình trình duyệt", "error"); } };
  const input=$("#chatInput"); const send=()=>{const v=input.value.trim(); if(!v)return; input.value=""; autoGrow(input); sendChat(v);}; $("#sendBtn").onclick=send; input.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }); input.addEventListener("input",()=>autoGrow(input)); input.addEventListener("paste",e=>{ const item=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith("image/")); if(item){const f=item.getAsFile(); if(f)sendFileImage(f);} });
  $$(".quick-link").forEach(x=>x.onclick=()=>{state.view=x.dataset.view; renderAppShell();loadView();});
  if (!state.messages.length) await startWelcome();
  startAutoChat();
}
function autoGrow(el){el.style.height="auto";el.style.height=Math.min(160,el.scrollHeight)+"px";}
function readFileAsBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]||"");r.onerror=reject;r.readAsDataURL(file);});}
async function sendFileImage(file){const b64=await readFileAsBase64(file); await sendChat("Hãy phân tích hình ảnh bài học/bài tập này và giúp mình.",b64,false,null,`📎 ${file.name}`);}
function startAutoChat(){ stopAutoChat(); const enabled=localStorage.getItem("doraemon_auto_chat")==="1"; if(!enabled)return; state.autoChatTimer=setTimeout(async()=>{ if(state.view!=="chat")return; try{ const r=await api(`/learning/review/reminder${state.selectedCourseId?`?course_id=${state.selectedCourseId}`:""}`); if(r.review_available&&r.content_blocks?.length){ state.messages.push({role:"model",blocks:r.content_blocks}); renderMessages(); return; } }catch{} await sendChat("Đây là một lời bắt chuyện ngắn của Doraemon với người học. Nếu ngữ cảnh có Study Plan thì ưu tiên nhắc tiến độ, động viên khi đúng tiến độ, chúc mừng khi vượt tiến độ, hoặc nhắc nhẹ khi chậm. Nếu không có Study Plan thì chỉ bắt chuyện thân thiện. KHÔNG dạy bài, KHÔNG hỏi menu học gì, KHÔNG tạo bài tập và KHÔNG đưa đáp án. Chỉ trả lời 1 câu ngắn bằng tiếng Việt.",null,true); startAutoChat(); }, 10*60*1000); }
function stopAutoChat(){if(state.autoChatTimer){clearTimeout(state.autoChatTimer);state.autoChatTimer=null;}}

async function renderCatalog(el){
  const data=await api(`/learning/catalog${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`);
  const docs=data.documents||[]; const grouped={}; docs.forEach(r=>{const ct=r.content_type||"Nội dung"; const lesson=r.lesson||""; if(!lesson)return;(grouped[ct]??=[]).push(r);});
  const types=["Giáo trình","Từ vựng","Ngữ pháp","Bài tập","Truyện đọc",...Object.keys(grouped).filter(x=>!["Giáo trình","Từ vựng","Ngữ pháp","Bài tập","Truyện đọc"].includes(x))];
  el.innerHTML=`<div class="page-grid"><section><div class="page-card"><div class="card-head"><div><strong>Nội dung được cấp quyền</strong><small>${docs.length?`${docs.length} bản ghi nội dung`:"Chưa có nội dung"}</small></div><button class="small-button" id="catalogRefresh">↻ Làm mới</button></div>${docs.length?types.filter(t=>grouped[t]?.length).map(t=>`<div class="content-group"><div class="group-head"><span>${iconType(t)} ${escapeHtml(t)}</span><small>${new Set(grouped[t].map(x=>`${x.lesson}|${x.topic||""}`)).size} bài</small></div>${uniqRows(grouped[t]).map(r=>`<button class="lesson-card" data-lesson="${escapeHtml(r.lesson)}" data-type="${escapeHtml(r.content_type)}"><div><strong>${escapeHtml(r.lesson)}</strong><small>${escapeHtml(r.topic||"")}</small></div><span>Học →</span></button>`).join("")}</div>`).join(""): `<div class="empty-state">${data.requires_course_selection?"Hãy chọn khóa học ở góc phải.":"Tài khoản chưa có nội dung khóa học được cấp quyền."}</div>`}</div></section><aside class="page-card insight"><h3>📌 Cách học</h3><p>Chọn một bài cụ thể để Doraemon mở đúng lesson trong chat. Server sẽ quản lý trạng thái tiến độ và bước giáo trình.</p><div class="stat-grid"><div><strong>${docs.length}</strong><span>Bản ghi</span></div><div><strong>${Object.keys(grouped).length}</strong><span>Loại nội dung</span></div></div></aside></div>`;
  $("#catalogRefresh").onclick=()=>renderCatalog($("#appContent")); $$(".lesson-card").forEach(b=>b.onclick=()=>startLesson(b.dataset.lesson,b.dataset.type));
}
function uniqRows(rows){const seen=new Set();return rows.filter(r=>{const k=`${r.lesson}|${r.topic||""}`;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>String(a.lesson).localeCompare(String(b.lesson),"vi"));}
function iconType(t){return ({"Giáo trình":"📖","Từ vựng":"🧠","Ngữ pháp":"✏️","Bài tập":"📝","Truyện đọc":"📚"})[t]||"📄";}
async function startLesson(lesson,type){state.view="chat";state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;state.chatboxNew=true;state.messages=[];state.chatHistory=[];renderAppShell();await renderChat($("#appContent"));const prompt=`Mình muốn học ${type ? type + " " : ""}bài ${lesson}`;await sendChat(prompt,null,false,null,prompt);}

async function renderPlan(el){const data=await api(`/learning/plan${state.selectedCourseId?`?course_id=${state.selectedCourseId}`:""}`); const plans=data.plans||[]; const plan=data.plan||null; const draft=data.draft||null; el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Lộ trình học</strong><small>${data.learning_mode==='planned'?'Đang học theo lộ trình':'Học tự do'}</small></div><button class="small-button" id="planChat">✦ Điều chỉnh bằng chat</button></div>${plans.length?plans.map(p=>`<div class="plan-card"><div class="plan-icon">🎯</div><div class="plan-main"><strong>${escapeHtml(p.goal_name||"Lộ trình")}</strong><span>${escapeHtml(p.content_type||"")} · ${escapeHtml(p.scope||"")}</span><small>Bắt đầu: ${escapeHtml(p.start_date||"—")} ${p.target_date?` · Mục tiêu: ${escapeHtml(p.target_date)}`:""}</small></div><button class="danger-button" data-delete-plan="${p.id}">Xóa</button></div>`).join(""): `<div class="empty-state">${draft?"Bạn có một lộ trình nháp. Hãy vào chat để xác nhận lộ trình.":"Chưa có lộ trình hoạt động. Hãy mở chat và chọn <b>Học theo lộ trình</b>."}</div>`}</section><aside class="page-card"><h3>📊 Trạng thái</h3><div class="stat-grid"><div><strong>${plans.length}</strong><span>Plan active</span></div><div><strong>${escapeHtml(data.learning_mode||"free")}</strong><span>Chế độ</span></div></div>${plan?`<div class="mini-note">${escapeHtml(plan.goal_name||"")}</div>`:""}</aside></div>`; $("#planChat").onclick=()=>{state.view="chat";renderAppShell();loadView();}; $$("[data-delete-plan]").forEach(b=>b.onclick=async()=>{if(!confirm("Xóa lộ trình này?"))return;try{await api(`/learning/plan/${b.dataset.deletePlan}`,{method:"DELETE"});toast("Đã xóa lộ trình","success");await renderPlan($("#appContent"));}catch(e){toast(e.message,"error");}});}

async function renderReview(el){const d=await api(`/learning/review/today${state.selectedCourseId?`?course_id=${state.selectedCourseId}`:""}`);const items=d.review_items||[];const scheduled=d.scheduled_lessons||[];el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Nội dung cần ôn tập</strong><small>${items.length?`${items.length} mục đang chờ ôn`:"Chưa có mục sai để ôn"}</small></div><div class="button-row-inline"><button class="small-button" id="reviewStart">Bắt đầu ôn</button><button class="small-button" id="reviewChat">Ôn bằng chat</button></div></div>${items.length?`<div class="review-list">${items.map(x=>`<div class="review-item"><div class="review-badge">${x.item_type==='vocabulary'?'Từ':'Ngữ'}</div><div><strong>${escapeHtml(x.label||x.pattern||x.item_id)}</strong><small>${escapeHtml(x.lesson||"")} · ${escapeHtml(x.meaning||x.explanation||"")}</small></div><span>📅 ${escapeHtml(fmtDate(x.next_review_at))}</span></div>`).join("")}`:`<div class="empty-state success">✅ Hiện chưa có nội dung cần ôn. Nội dung chỉ được thêm sau khi cậu trả lời sai trong review.</div>`}</section><aside class="page-card"><h3>📆 Lịch ôn</h3>${scheduled.length?scheduled.slice(0,8).map(x=>`<div class="schedule-row"><strong>${escapeHtml(x.lesson||"Bài")}</strong><span>${escapeHtml(x.content_type||"")}</span><small>${escapeHtml(fmtDate(x.next_review_at))}</small></div>`).join(""):`<div class="empty-state">Chưa có lịch ôn.</div>`}</aside></div>`;$("#reviewStart").onclick=()=>startReviewQuiz();$("#reviewChat").onclick=()=>startReviewChat();}
async function startReviewQuiz(){const el=$("#appContent");el.innerHTML=`<section class="page-card quiz-card"><div class="card-head"><div><strong>🔄 Phiên ôn tập</strong><small>Trả lời theo đúng định dạng Doraemon yêu cầu</small></div><button class="small-button" id="quizExit">← Quay lại</button></div><div id="quizBody" class="quiz-body"><div class="loading">Đang tạo câu hỏi…</div></div></section>`;$("#quizExit").onclick=()=>renderReview(el);try{const d=await api("/learning/review/start",{method:"POST",body:{course_id:Number(state.selectedCourseId||0),max_questions:12}});const qs=d.questions||[];const sid=d.session_id;if(!qs.length){$("#quizBody").innerHTML=`<div class="empty-state success">✅ Không còn câu hỏi để ôn.</div>`;return;}let idx=0,score=0;const submit=async answer=>{if(!String(answer||"").trim())return;const q=qs[idx];try{const r=await api("/learning/review/answer",{method:"POST",body:{course_id:Number(state.selectedCourseId||0),session_id:sid,item_type:q.item_type,item_id:q.item_id,answer:String(answer).trim()}});if(r.correct)score++;const feedback=$("#quizFeedback");if(feedback){feedback.className=`quiz-feedback ${r.correct?'correct':'wrong'}`;feedback.innerHTML=(r.correct?"✅ Đúng!":"❌ Chưa đúng.")+(r.explanation?`<div>${nl2br(r.explanation)}</div>`:"");}$$('.quiz-options button').forEach(b=>b.disabled=true);if($("#quizSubmit"))$("#quizSubmit").disabled=true;setTimeout(()=>{idx++;if(idx>=qs.length){$("#quizBody").innerHTML=`<div class="quiz-finish"><div>🎉 Hoàn thành phiên ôn!</div><strong>${score}/${qs.length}</strong><p>Cậu có thể quay lại nội dung cần ôn hoặc tiếp tục học với Doraemon.</p><button class="button button-primary" id="quizDone">Xem lại</button></div>`;$("#quizDone").onclick=()=>renderReview(el);}else renderQ();},650);}catch(e){const f=$("#quizFeedback");if(f){f.className="quiz-feedback wrong";f.textContent=e.message;}}};const renderQ=()=>{const q=qs[idx];const opts=q.options||[];$("#quizBody").innerHTML=`<div class="quiz-progress">Câu ${idx+1}/${qs.length}</div><h3 class="quiz-question">${nl2br(q.question||"")}</h3>${opts.length?`<div class="quiz-options">${opts.map(o=>`<button data-opt="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}</div>`:`<div class="quiz-answer"><input id="quizAnswer" placeholder="Nhập đáp án…"><button class="button button-primary" id="quizSubmit">Trả lời</button></div>`}<div id="quizFeedback" class="quiz-feedback"></div>`;$$('[data-opt]').forEach(b=>b.onclick=()=>submit(b.dataset.opt));$("#quizSubmit")?.addEventListener('click',()=>submit($("#quizAnswer")?.value));$("#quizAnswer")?.addEventListener('keydown',e=>{if(e.key==='Enter')submit($("#quizAnswer").value);});};renderQ();}catch(e){$("#quizBody").innerHTML=`<div class="empty-state error">${escapeHtml(e.message)}</div>`;}}
async function startReviewChat(){state.view="chat";state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;state.chatboxNew=true;state.messages=[];state.chatHistory=[];renderAppShell();await renderChat($("#appContent"));await sendAction("review_open","Mở nội dung ôn tập");}

async function renderPackages(el){const [me,pkgs]=await Promise.all([api("/auth/me"),api("/payments/packages")]); const sub=me.subscription||{}; el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Gói học</strong><small>Thông tin hiện tại của tài khoản</small></div></div><div class="subscription-banner"><div><span>Gói hiện tại</span><strong>${escapeHtml(sub.plan||"Free")}</strong></div><div><span>Trạng thái</span><strong>${escapeHtml(sub.status||"ACTIVE")}</strong></div><div><span>Hết hạn</span><strong>${escapeHtml(sub.expires_at_vn||"Không giới hạn")}</strong></div></div><div class="package-grid">${(pkgs.packages||[]).map(p=>`<div class="package-card"><span class="package-month">${p.months} tháng</span><h3>${escapeHtml(p.plan_name||"")}</h3><strong>${escapeHtml(p.price_display||money(p.price_vnd))}</strong>${p.qr_url?`<img src="${escapeHtml(p.qr_url)}" alt="QR thanh toán" class="qr-img">`:``}<div class="payment-code">${escapeHtml(p.payment_content||"")}</div><button class="small-button copy-payment" data-copy="${escapeHtml(p.payment_content||"")}">Sao chép nội dung</button></div>`).join("")}</div></section><aside class="page-card"><h3>🎓 Khóa học được cấp quyền</h3>${(sub.courses||[]).length?(sub.courses||[]).map(c=>`<div class="course-entitlement"><strong>${escapeHtml(c.name||"")}</strong><span>${escapeHtml(c.expires_at_vn||"Đang hiệu lực")}</span></div>`).join(""):`<div class="empty-state">Tài khoản hiện chưa có khóa học trả phí.</div>`}</aside></div>`; $$(".copy-payment").forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast("Đã sao chép","success");}catch{toast("Không thể sao chép tự động","error");}});}

async function renderAdmin(el){const data=await api("/admin-chat/history?limit=200"); el.innerHTML=`<div class="page-card admin-card"><div class="card-head"><div><strong>Chat với Admin</strong><small>HTTP polling bảo đảm hoạt động cả khi WebSocket bị gián đoạn</small></div><span class="status-dot">● Đang hoạt động</span></div><div class="admin-messages" id="adminMessages">${(data.messages||[]).map(renderAdminMessage).join("")}</div><div class="admin-composer"><input id="adminInput" placeholder="Nhắn tin cho Admin…"><button class="send-button" id="adminSend">➤</button></div></div>`; const list=$("#adminMessages"); list.scrollTop=list.scrollHeight; $("#adminSend").onclick=sendAdmin; $("#adminInput").addEventListener("keydown",e=>{if(e.key==='Enter')sendAdmin();}); window.clearInterval(window.__adminPoll); window.__adminPoll=setInterval(async()=>{try{const d=await api("/admin-chat/history?limit=200");list.innerHTML=(d.messages||[]).map(renderAdminMessage).join("");list.scrollTop=list.scrollHeight;}catch{}},3500);}
function renderAdminMessage(m){return `<div class="admin-msg ${m.sender==='user'?'me':''}"><div class="admin-msg-author">${m.sender==='user'?'Bạn':'Admin'}</div><div class="admin-msg-body">${nl2br(m.message||"")}</div><small>${escapeHtml(fmtDate(m.created_at))}</small></div>`;}
async function sendAdmin(){const input=$("#adminInput"); const msg=input?.value.trim(); if(!msg)return; input.value=""; try{await api("/admin-chat/send",{method:"POST",body:{client_message_id:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`),message:msg}});const d=await api("/admin-chat/history?limit=200");$("#adminMessages").innerHTML=(d.messages||[]).map(renderAdminMessage).join("");$("#adminMessages").scrollTop=$("#adminMessages").scrollHeight;}catch(e){toast(e.message,"error");}}

async function renderSettings(el){const me=state.__me||await api("/auth/me");let settings={review_interval_days:1};try{settings=await api("/learning/review/settings");}catch{}const auto=localStorage.getItem("doraemon_auto_chat")==="1"; el.innerHTML=`<div class="settings-grid"><section class="page-card"><div class="card-head"><div><strong>Cấu hình học tập</strong><small>Thiết lập giống các tùy chọn chính của App</small></div></div><label class="setting-row"><div><strong>Khóa học đang học</strong><small>Chat và review sẽ dùng course này</small></div><select id="settingsCourse">${(me.subscription?.courses||[]).map(c=>`<option value="${c.course_id}" ${String(c.course_id)===String(state.selectedCourseId)?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}</select></label><label class="setting-row"><div><strong>Ôn tập lại sau</strong><small>Số ngày sau khi hoàn thành nội dung</small></div><input id="reviewDays" type="number" min="1" max="365" value="${Number(settings.review_interval_days||1)}"></label><label class="toggle-row"><div><strong>Tự động bắt chuyện</strong><small>Trên Web, nhắc tự động chỉ chạy khi tab Doraemon đang mở.</small></div><input id="autoChatToggle" type="checkbox" ${auto?"checked":""}></label><div class="button-row"><button class="button button-primary" id="saveSettings">Lưu cấu hình</button><button class="button button-secondary" id="resetLearning">🗑 Xóa lịch sử học</button></div></section><aside class="page-card"><h3>👤 Tài khoản</h3><div class="profile-line"><span>Nickname</span><strong>${escapeHtml(me.user?.nickname||"")}</strong></div><div class="profile-line"><span>SĐT</span><strong>${escapeHtml(me.user?.phone||"")}</strong></div><div class="profile-line"><span>Gói</span><strong>${escapeHtml(me.subscription?.plan||"Free")}</strong></div></aside></div>`;
  $("#saveSettings").onclick=async()=>{try{const cid=Number($("#settingsCourse").value||0); if(cid){const d=await api("/learning/select-course",{method:"POST",body:{course_id:cid}});state.selectedCourseId=d.course_id;state.selectedCourseName=d.course_name;} await api("/learning/review/settings",{method:"POST",body:{review_interval_days:Number($("#reviewDays").value||1)}}); localStorage.setItem("doraemon_auto_chat",$("#autoChatToggle").checked?"1":"0"); toast("Đã lưu cấu hình","success"); renderAppShell();loadView();}catch(e){toast(e.message,"error");}};
  $("#resetLearning").onclick=async()=>{if(!confirm("Xóa toàn bộ tiến độ, review và lộ trình học? Tài khoản và gói học không bị xóa."))return;try{await api("/learning/reset",{method:"POST"});toast("Đã xóa lịch sử học","success");state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;state.chatboxNew=true;state.messages=[];state.chatHistory=[];state.view="chat";renderAppShell();loadView();}catch(e){toast(e.message,"error");}};
}

async function boot(){
  $$("[data-close-modal]").forEach(x=>x.addEventListener("click",closeAuth));
  $$("[data-auth-mode]").forEach(x=>x.addEventListener("click",()=>setAuthMode(x.dataset.authMode)));
  $("#navAuthBtn").onclick=()=>state.token?location.hash="#/app":openAuth("login"); $("#heroAuthBtn").onclick=()=>openAuth("register");
  authForm.addEventListener("submit",async e=>{e.preventDefault();const mode=authForm.dataset.mode||"login";const phone=$("#authPhone").value.trim(),nickname=$("#authNickname").value.trim(),password=$("#authPassword").value;const status=$("#authStatus");status.textContent="Đang xử lý…";try{if(mode==='register')await register(phone,nickname,password);else await login(phone,password);}catch(err){status.textContent=err.message;}}); setAuthMode("login");
  window.addEventListener("hashchange",()=>{if(route()==="app" && state.token)initApp();else renderLanding();});
  if(route()==="app" && state.token) await initApp(); else renderLanding();
}

document.addEventListener("DOMContentLoaded",boot);
