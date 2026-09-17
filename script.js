const API_BASE = (() => {
  const meta = document.querySelector('meta[name="doraemon-api-base"]');
  const configured = (window.DORAEMON_API_BASE || meta?.content || '').trim();
  return (configured || '').replace(/\/$/, '');
})();
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
  showCollocationOnFirstChat: false,
  chatHistory: [],
  messages: [],
  courses: [],
  activeContentType: "",
  activeLesson: "",
  activeFeature: "",
  activeFeatureItem: null,
  freeChatTutor: false,
  phrasingTask: "",
  phrasingContext: [],
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

// Rich text coming from Curriculum/Admin may contain only these harmless tags.
// Never inject arbitrary HTML into the learner page.
function decodeHtmlEntities(value) {
  let out = String(value ?? "");
  // Some legacy drafts were escaped 3+ times. Decode until stable (bounded)
  // before the allow-list sanitizer renders the rich text.
  for (let i = 0; i < 6; i++) {
    const ta = document.createElement("textarea");
    ta.innerHTML = out;
    const next = ta.value;
    if (next === out) break;
    out = next;
  }
  return out;
}

function markdownToRichHtml(value) {
  let src = String(value ?? "");
  // The server may return markdown-style bold in older/generated messages.
  src = src.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  src = src.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?;:])/g, "$1<i>$2</i>");
  return src;
}

function ensureAutoPipeTableStyles() {
  if (document.getElementById("doraemon-auto-pipe-table-styles")) return;
  const style = document.createElement("style");
  style.id = "doraemon-auto-pipe-table-styles";
  style.textContent = `
    .rich-table-wrap{width:100%;overflow-x:auto;margin:12px 0 14px;border:1px solid #dbe4ee;border-radius:12px;background:#fff;-webkit-overflow-scrolling:touch}
    .rich-auto-table{width:100%;min-width:520px;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:13px;line-height:1.5}
    .rich-auto-table td,.rich-auto-table th{padding:9px 10px;border-right:1px solid #e5ebf2;border-bottom:1px solid #e5ebf2;vertical-align:top;text-align:left;overflow-wrap:anywhere;word-break:break-word}
    .rich-auto-table tr:last-child td,.rich-auto-table tr:last-child th{border-bottom:0}
    .rich-auto-table td:last-child,.rich-auto-table th:last-child{border-right:0}
    .rich-auto-table th{font-weight:800;background:#f7faff;color:#1e3a8a}
    .rich-auto-table td{background:#fff;color:#334155}
    .rich-auto-table tr:nth-child(even) td{background:#fbfdff}
    @media(max-width:700px){.rich-table-wrap{margin-left:-2px;margin-right:-2px;width:calc(100% + 4px)}.rich-auto-table{min-width:460px;font-size:12px}.rich-auto-table td,.rich-auto-table th{padding:8px}}
  `;
  document.head.appendChild(style);
}

function ensureLibraryFilterStyles(){
  if(document.getElementById("doraemon-library-filter-styles")) return;
  const style=document.createElement("style");
  style.id="doraemon-library-filter-styles";
  style.textContent=`
    .library-filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 14px;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fbff}
    .library-filter{display:flex;flex-direction:column;gap:4px;min-width:0}
    .library-filter label{font-size:11px;font-weight:800;color:#64748b}
    .library-filter select{width:100%;height:34px;border:1px solid #d8e2ef;border-radius:9px;background:#fff;padding:0 9px;color:#1e293b;font-size:12px;outline:none}
    .library-filter select:focus{border-color:#7c9cff;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
    .library-filter-empty{padding:12px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;font-size:12px;text-align:center;background:#fff}
    @media(max-width:700px){.library-filters{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function pipeRowsToHtml(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const parseRow = (line) => {
    const raw = String(line ?? "").trim();
    if ((raw.match(/\|/g) || []).length < 2) return null;
    const cells = raw.replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "").split("|").map(x => x.trim());
    if (cells.length < 3) return null;
    if (cells.every(c => /^:?-{3,}:?$/.test(c))) return {separator:true,cells};
    return {separator:false,cells};
  };

  while (i < lines.length) {
    const row = parseRow(lines[i]);
    if (!row) { out.push(lines[i]); i++; continue; }

    let j = i;
    const rows = [];
    while (j < lines.length) {
      const r = parseRow(lines[j]);
      if (!r) break;
      rows.push(r);
      j++;
    }

    // Only convert a contiguous pipe-separated block. This avoids turning
    // ordinary prose containing a single | character into a table.
    if (rows.length === 1 && rows[0].cells.length < 4) {
      out.push(lines[i]);
      i++;
      continue;
    }

    const separatorIndex = rows.findIndex(r => r.separator);
    const hasMarkdownHeader = separatorIndex === 1;
    const dataRows = rows.filter(r => !r.separator);
    const columnCount = Math.max(...dataRows.map(r => r.cells.length));
    const normalizeCells = cells => Array.from({length:columnCount}, (_, idx) => String(cells[idx] ?? ""));

    ensureAutoPipeTableStyles();
    let html = '<div class="rich-table-wrap"><table class="rich-auto-table">';
    if (hasMarkdownHeader && dataRows.length >= 1) {
      html += "<thead><tr>" + normalizeCells(dataRows[0].cells).map(c => `<th>${markdownToRichHtml(escapeHtml(c))}</th>`).join("") + "</tr></thead>";
      html += "<tbody>" + dataRows.slice(1).map(r => `<tr>${normalizeCells(r.cells).map(c => `<td>${markdownToRichHtml(escapeHtml(c))}</td>`).join("")}</tr>`).join("") + "</tbody>";
    } else {
      html += "<tbody>" + dataRows.map(r => `<tr>${normalizeCells(r.cells).map(c => `<td>${markdownToRichHtml(escapeHtml(c))}</td>`).join("")}</tr>`).join("") + "</tbody>";
    }
    html += "</table></div>";
    out.push(html);
    i = j;
  }

  return out.join("\n");
}

function resolveMediaUrl(raw){
  const value=String(raw||"").trim();
  if(!value) return "";
  try{
    if(/^\/media\//i.test(value) && API_BASE) return new URL(value,API_BASE).href;
    return new URL(value,window.location.origin).href;
  }catch{return value;}
}

function sanitizeRichText(value) {
  if (value == null || value === "") return "";
  let src = decodeHtmlEntities(value).replace(/\r\n?/g, "\n");
  src = pipeRowsToHtml(src);
  src = markdownToRichHtml(src);
  const box = document.createElement("div");
  if (/<\s*(?:b|strong|i|em|u|br|p|div|span|img)\b/i.test(src)) box.innerHTML = src;
  else box.textContent = src;

  // Legacy/admin content can contain literal IMG markup as a plain text node.
  // Convert every such occurrence into a real image element before sanitizing.
  const literalImgRe = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/ig;
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  const nodes = []; let node;
  while ((node = walker.nextNode())) {
    literalImgRe.lastIndex = 0;
    if (literalImgRe.test(node.nodeValue || "")) nodes.push(node);
  }
  nodes.forEach(node => {
    const text = String(node.nodeValue || "");
    let last = 0, m;
    const frag = document.createDocumentFragment();
    literalImgRe.lastIndex = 0;
    while ((m = literalImgRe.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const raw = String(m[1] || "").trim();
      try {
        const u = new URL(resolveMediaUrl(raw), window.location.origin);
        const isHttp = u.protocol === "http:" || u.protocol === "https:";
        const isMedia = u.pathname.startsWith("/media/");
        const isApi = API_BASE ? u.origin === new URL(API_BASE).origin : u.origin === window.location.origin;
        if (isHttp && isMedia && isApi) {
          const img = document.createElement("img");
          img.src = u.href; img.alt = "Hình minh họa"; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
          frag.appendChild(img);
        } else {
          frag.appendChild(document.createTextNode(m[0]));
        }
      } catch {
        frag.appendChild(document.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  });

  box.querySelectorAll("script,style,iframe,object,embed,link,meta,form,input,button,textarea,select,audio,video,svg,math").forEach(el => el.remove());
  box.querySelectorAll("img").forEach(img => {
    const raw = String(img.getAttribute("src") || "").trim();
    try {
      const u = new URL(resolveMediaUrl(raw), window.location.origin);
      const isHttp = u.protocol === "http:" || u.protocol === "https:";
      const isMedia = u.pathname.startsWith("/media/");
      const isApi = API_BASE ? u.origin === new URL(API_BASE).origin : u.origin === window.location.origin;
      if (!isHttp || !isMedia || !isApi) { img.remove(); return; }
      img.src = u.href;
      img.removeAttribute("srcset"); img.removeAttribute("style"); img.removeAttribute("width"); img.removeAttribute("height");
      img.setAttribute("loading", "lazy"); img.setAttribute("referrerpolicy", "no-referrer");
      img.setAttribute("alt", img.getAttribute("alt") || "Hình minh họa");
    } catch { img.remove(); }
  });

  box.querySelectorAll("*").forEach(el => {
    const tag = el.tagName.toLowerCase();
    const allowed = new Set(["b","strong","i","em","u","br","p","div","span","img","table","thead","tbody","tr","th","td"]);
    if (!allowed.has(tag)) { el.replaceWith(...Array.from(el.childNodes)); return; }
    if (tag === "img") return;
    const keepTableClass = (tag === "div" && el.classList.contains("rich-table-wrap")) || (tag === "table" && el.classList.contains("rich-auto-table"));
    const keepClass = keepTableClass ? el.className : "";
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    if (keepClass) el.setAttribute("class", keepClass);
    if (tag === "strong") { const b = document.createElement("b"); while (el.firstChild) b.appendChild(el.firstChild); el.replaceWith(b); }
    else if (tag === "em") { const i = document.createElement("i"); while (el.firstChild) i.appendChild(el.firstChild); el.replaceWith(i); }
  });

  // Keep plain-text newlines even when the content contains rich HTML.
  const walker2 = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  const nodes2 = []; let t;
  while ((t = walker2.nextNode())) if (/\r|\n/.test(t.nodeValue || "")) nodes2.push(t);
  nodes2.forEach(t => {
    const parts = String(t.nodeValue || "").replace(/\r\n?/g, "\n").split("\n");
    if (parts.length < 2) return;
    const frag = document.createDocumentFragment();
    parts.forEach((part, i) => { if (part) frag.appendChild(document.createTextNode(part)); if (i < parts.length - 1) frag.appendChild(document.createElement("br")); });
    t.replaceWith(frag);
  });
  return box.innerHTML.replace(/\n{3,}/g, "\n\n");
}

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
  sessionStorage.removeItem("doraemon_features_shown_this_login");
  sessionStorage.removeItem("doraemon_collocation_shown_this_login");
  sessionStorage.removeItem("doraemon_phrasal_verb_shown_this_login");
  state.showCollocationOnFirstChat = true;
  await loadMe();
  closeAuth();
  toast("Đăng nhập thành công", "success");
  location.hash = "#/app";
}
async function register(phone, nickname, password) {
  const data = await api("/auth/register", { method: "POST", body: { phone, nickname, password } });
  setToken(data.access_token || "", data.user || { phone, nickname });
  sessionStorage.removeItem("doraemon_features_shown_this_login");
  sessionStorage.removeItem("doraemon_collocation_shown_this_login");
  sessionStorage.removeItem("doraemon_phrasal_verb_shown_this_login");
  state.showCollocationOnFirstChat = true;
  if (!state.token) { await login(phone, password); return; }
  await loadMe(); closeAuth(); toast("Tạo tài khoản thành công", "success"); location.hash = "#/app";
}
function logout(showToast = true) {
  state.token = ""; state.profile = null; state.courses = []; state.chatHistory = []; state.messages = []; state.chatboxNew = true; state.showCollocationOnFirstChat = false; state.activeFeature = ""; state.activeFeatureItem = null; sessionStorage.removeItem("doraemon_features_shown_this_login");
  sessionStorage.removeItem("doraemon_collocation_shown_this_login");
  sessionStorage.removeItem("doraemon_phrasal_verb_shown_this_login");
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(PROFILE_KEY);
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
  landingView.classList.add("hidden");
  appView.classList.remove("hidden");
  $("#siteNav").classList.add("app-mode");
  const userName = escapeHtml(state.profile?.nickname || "bạn");
  const initial = escapeHtml((state.profile?.nickname || "D").slice(0,1).toUpperCase());
  const sub = state.__me?.subscription || {};
  const courseName = escapeHtml(state.selectedCourseName || (state.courses[0]?.name || "Chưa chọn khóa học"));
  appView.innerHTML = `
    <div class="study-shell">
      <header class="study-topbar">
        <a href="#/app" class="study-brand"><div class="logo-icon">D</div><div><strong>Doraemon</strong><span>Gia sư đồng hành cùng bạn</span></div></a>
        <div class="study-course-picker">
          <span>Đang học</span>
          <select id="courseSelect"><option value="">${courseName}</option>${state.courses.map(c => `<option value="${escapeHtml(c.course_id)}" ${String(c.course_id)===String(state.selectedCourseId)?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}</select>
        </div>
        <div class="learner-menu-wrap">
          <button class="learner-menu-button" id="learnerMenuBtn" aria-expanded="false"><span class="avatar">${initial}</span><span class="learner-menu-copy"><strong>${userName}</strong><small>${escapeHtml(sub.plan || "Free")}</small></span><span class="chevron">⌄</span></button>
          <div class="learner-menu hidden" id="learnerMenu">
            <div class="learner-menu-head"><div class="avatar large">${initial}</div><div><strong>${userName}</strong><small>${escapeHtml(state.profile?.phone || "")}</small></div></div>
            <button data-panel="curriculum">📖 <span>Giáo trình</span></button>
            <button data-panel="plan">🎯 <span>Lộ trình học</span></button>
            <button data-panel="review">🔄 <span>Nội dung ôn tập</span></button>
            <button data-panel="admin">🛟 <span>Chat với admin</span></button>
            <button data-panel="packages">💳 <span>Gói học</span></button>
            <button data-panel="settings">⚙️ <span>Cấu hình học tập</span></button>
            <div class="learner-menu-divider"></div>
            <div class="learner-menu-meta"><span>Gói hiện tại</span><strong>${escapeHtml(sub.plan || "Free")}</strong></div>
            <button class="logout-menu" id="logoutBtn">↪ <span>Đăng xuất</span></button>
          </div>
        </div>
      </header>
      <main id="appContent" class="study-content"></main>
      <div id="profilePanel" class="profile-panel hidden" aria-hidden="true"></div>
    </div>`;

  $("#learnerMenuBtn").onclick = () => {
    const menu = $("#learnerMenu");
    const open = menu.classList.toggle("hidden") === false;
    $("#learnerMenuBtn").setAttribute("aria-expanded", String(open));
  };
  $("#logoutBtn").onclick = () => logout();
  $$('[data-panel]').forEach(btn => btn.addEventListener("click", () => {
    $("#learnerMenu")?.classList.add("hidden");
    $("#learnerMenuBtn")?.setAttribute("aria-expanded", "false");
    openLearnerPanel(btn.dataset.panel);
  }));
  $("#courseSelect")?.addEventListener("change", async e => {
    const cid = e.target.value;
    if (!cid) return;
    try {
      const d = await api("/learning/select-course", {method:"POST", body:{course_id:Number(cid)}});
      state.selectedCourseId=d.course_id; state.selectedCourseName=d.course_name;
      state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
      state.chatboxNew=true; state.chatHistory=[]; state.messages=[]; state.activeFeature=""; state.activeFeatureItem=null;
      toast(`Đã chọn ${d.course_name}`, "success");
      await renderChat($("#appContent"));
    } catch(err) { toast(err.message,"error"); }
  });
}
function openLearnerPanel(view) {
  const panel = $("#profilePanel");
  if (!panel) return;
  const titles = {curriculum:"Giáo trình",plan:"Lộ trình học",review:"Nội dung ôn tập",admin:"Chat với admin",packages:"Gói học",settings:"Cấu hình học tập"};
  panel.innerHTML = `<div class="profile-panel-backdrop" data-close-panel></div><section class="profile-drawer"><header class="drawer-head"><div><span class="section-label">THÔNG TIN NGƯỜI HỌC</span><h2>${escapeHtml(titles[view]||"Thông tin")}</h2></div><button class="modal-close" data-close-panel>×</button></header><div id="profilePanelContent" class="drawer-content"><div class="loading"><span></span><span></span><span></span>Đang tải...</div></div></section>`;
  panel.classList.remove("hidden"); panel.setAttribute("aria-hidden","false");
  $$('[data-close-panel]', panel).forEach(x => x.addEventListener("click", closeLearnerPanel));
  const el = $("#profilePanelContent");
  Promise.resolve({curriculum:renderCurriculum,plan:renderPlan,review:renderReview,admin:renderAdmin,packages:renderPackages,settings:renderSettings}[view]?.(el)).catch(e => { el.innerHTML = `<div class="empty-state error">${escapeHtml(e.message)}</div>`; });
}
function closeLearnerPanel() { const p=$("#profilePanel"); if(!p)return; p.classList.add("hidden"); p.setAttribute("aria-hidden","true"); window.clearInterval(window.__adminPoll); }
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
  state.view = "chat"; renderAppShell(); await renderChat($("#appContent"));
}
async function loadView() { const el=$("#appContent"); if(!el)return; try { await renderChat(el); } catch(e){ el.innerHTML=`<div class="empty-state error"><strong>Có lỗi.</strong><div>${escapeHtml(e.message)}</div></div>`; } }

function addChatMessage(role, blocks, opts = {}) {
  const item = { role, blocks: Array.isArray(blocks) ? blocks : [{type:"text",text:String(blocks||"")}], prefix: opts.prefix || "" };
  state.messages.push(item); return item;
}
function textBlocksFromReply(reply) { return [{type:"text",text:String(reply || "")}]; }
function renderBlock(block) {
  const type = block?.type || "text";
  if (type === "typing") {
    return `<div class="chat-typing" aria-live="polite"><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-label">${escapeHtml(block.text || "Doraemon đang suy nghĩ...")}</span></div>`;
  }
  if (type === "image") {
    const rawUrl = block.url || block.image_url || "";
    const url = resolveMediaUrl(rawUrl);
    if (!url) return "";
    const meta = [block.term, block.reading, block.meaning].filter(Boolean).join(" · ");
    return `<figure class="chat-image"><img src="${escapeHtml(url)}" alt="${escapeHtml(meta || "Nội dung bài học")}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('figure').classList.add('image-error')"><figcaption>${escapeHtml(meta || block.caption || "")}</figcaption></figure>`;
  }
  if (type === "collocation" || type === "phrasal_verb") {
    const isPhrasal = type === "phrasal_verb";
    const x = isPhrasal ? (block.phrasalVerb || {}) : (block.collocation || {});
    const image = x.image_url || "";
    const term = isPhrasal ? (x.phrasal_verb || "") : (x.collocation || "");
    const title = isPhrasal ? "🔗 Phrasal verb" : "💡 Collocation";
    const shuffleClass = isPhrasal ? "phrasal-verb-shuffle" : "collocation-shuffle";
    const idAttr = isPhrasal ? "data-phrasal-verb-id" : "data-collocation-id";
    return `<div class="daily-collocation-card">
      <div class="daily-collocation-title">${title}</div>
      <div class="daily-collocation-term">${escapeHtml(term)}</div>
      <div class="daily-collocation-field"><strong>Nghĩa:</strong> ${escapeHtml(x.meaning||"")}</div>
      <div class="daily-collocation-field"><strong>Ví dụ:</strong> ${escapeHtml(x.example||"")}</div>
      ${image?`<img class="daily-collocation-image" src="${escapeHtml(image)}" alt="Ảnh minh họa cho ví dụ" loading="eager" onerror="this.classList.add('image-error')">`:""}
      <div class="daily-collocation-footer"><span>🌟 Ghi nhớ mẫu này nhé! Cậu có thể hỏi thêm về cách dùng hoặc đổi sang mục khác.</span><button type="button" class="${shuffleClass}" data-feature-kind="${isPhrasal ? "phrasal_verb" : "collocation"}" data-message-index="${Number(block.messageIndex ?? -1)}" ${idAttr}="${Number(x.id||0)}" title="Xem ${isPhrasal ? "Phrasal verb" : "Collocation"} khác">🔀</button></div>
    </div>`;
  }
  if (type === "choice") {
    const options = Array.isArray(block.options) ? block.options : [];
    return `<div class="choice-row">${options.map((o,i)=>`<button class="chat-choice ${i===0?"primary":""}" data-action="${escapeHtml(o.action || "")}" data-label="${escapeHtml(o.label || "")}" data-display="${escapeHtml(o.display_label || o.label || "")}">${escapeHtml(o.label || "Lựa chọn")}</button>`).join("")}</div>`;
  }
  if (type === "html") return block.html || "";
  return `<div class="chat-text">${sanitizeRichText(block.text || "")}</div>`;
}
function renderMessages() {
  const list = $("#chatMessages"); if (!list) return;
  list.innerHTML = state.messages.map((m, idx)=>`<div class="chat-row ${m.role==='user'?'user':'model'}"><div class="chat-avatar ${m.role==='model'?'chat-avatar-doraemon':''}">${m.role==='user'?'Bạn':'<img src="assets/doraemon-teacher.png" alt="Doraemon" loading="lazy">'}</div><div class="chat-bubble"><div class="chat-role">${m.role==='user'?'Bạn':'Doraemon'}</div>${m.blocks.map(b=>renderBlock({...b,messageIndex:idx})).join("")}</div></div>`).join("");
  $$(".chat-choice", list).forEach(btn => btn.addEventListener("click", () => { const action=btn.dataset.action; if(action==="phrasing_next"){ startNextPhrasing(); return; } sendAction(action, btn.dataset.display || btn.dataset.label); }));
  $$(".collocation-shuffle, .phrasal-verb-shuffle", list).forEach(btn => btn.addEventListener("click", () => {
    const kind = btn.dataset.featureKind || (btn.classList.contains("phrasal-verb-shuffle") ? "phrasal_verb" : "collocation");
    const id = Number(btn.dataset.collocationId || btn.dataset.phrasalVerbId || 0);
    shuffleLearningFeature(kind, Number(btn.dataset.messageIndex), id);
  }));
  list.scrollTop = list.scrollHeight;
}
function currentHistoryForApi() { return state.chatHistory.slice(-20); }
function rememberChatTurn(role, text) { state.chatHistory.push({role, parts:[{text:String(text||"")}]}); if (state.chatHistory.length > 24) state.chatHistory = state.chatHistory.slice(-24); }
async function sendAction(action, displayLabel) { await sendChat("", null, false, action, displayLabel || action); }
async function sendChat(prompt, imageBase64 = null, proactive = false, action = null, visibleUserText = null) {
  if (!state.token) { openAuth("login"); return; }
  const userLabel = visibleUserText ?? prompt;
  if (userLabel) { addChatMessage("user", textBlocksFromReply(userLabel)); renderMessages(); }
  const isExerciseGrading = !action && String(state.activeContentType || "").trim() === "Bài tập" && String(prompt || "").trim();
  const bubble = addChatMessage("model", [{type:"typing", text:isExerciseGrading ? "Doraemon đang chấm điểm..." : "Doraemon đang suy nghĩ..."}]); renderMessages();
  try {
    let effectivePrompt = String(prompt || "");
    if (!action && state.activeFeature && state.activeFeature !== "phrasing" && state.activeFeatureItem && effectivePrompt.trim()) {
      const f = state.activeFeatureItem;
      const term = state.activeFeature === "phrasal_verb" ? (f.phrasal_verb || "") : (f.collocation || "");
      effectivePrompt = `[DỮ LIỆU ĐANG XEM] Loại: ${state.activeFeature === "phrasal_verb" ? "Phrasal verb" : "Collocation"}; Cụm: ${term}; Nghĩa: ${f.meaning || ""}; Ví dụ: ${f.example || ""}\nCâu hỏi của người học: ${effectivePrompt}`;
    }
    const payload = {
      prompt: effectivePrompt,
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
      free_chat_tutor: Boolean(state.freeChatTutor),
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
function featureKindLabel(kind){ return kind === "phrasal_verb" ? "Phrasal verb" : "Collocation"; }
function featureEndpoint(kind, mode){ return `/learning/${kind === "phrasal_verb" ? "phrasal-verb" : "collocation"}/${mode}`; }
function featureDataKey(kind){ return kind === "phrasal_verb" ? "phrasal_verb" : "collocation"; }
function featureBlockKey(kind){ return kind === "phrasal_verb" ? "phrasalVerb" : "collocation"; }
function featureTerm(item, kind){ return kind === "phrasal_verb" ? (item?.phrasal_verb || "") : (item?.collocation || ""); }
function setFeatureHistory(item, kind){
  state.chatHistory = [];
  if (!item) return;
  const label = featureKindLabel(kind);
  rememberChatTurn("model", `${label}: ${featureTerm(item, kind)}. Nghĩa: ${item.meaning || ""}. Ví dụ: ${item.example || ""}`);
}
async function showLearningFeature(kind){
  state.view = "chat";
  state.activeContentType = "";
  state.activeLesson = "";
  state.freeChatTutor = false;
  state.activeFeature = kind;
  state.activeFeatureItem = null;
  state.chatboxId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  state.chatboxNew = true;
  state.messages = [];
  state.chatHistory = [];
  await renderChat($("#appContent"));
  const label = featureKindLabel(kind);
  try {
    state.messages = [{role:"model",blocks:[{type:"typing",text:`Doraemon đang tải ${label}...`}]}];
    renderMessages();
    const qs=[];
    if(state.selectedCourseId) qs.push(`course_id=${encodeURIComponent(state.selectedCourseId)}`);
    const d=await api(`${featureEndpoint(kind,"daily")}${qs.length ? `?${qs.join("&")}` : ""}`);
    const apiKey=featureDataKey(kind);
    const blockKey=featureBlockKey(kind);
    if(!d?.show || !d?.[apiKey]){
      state.messages=[{role:"model",blocks:[{type:"text",text:`Hiện chưa có ${label} nào trong khóa học này.`}]}];
      renderMessages();
      return;
    }
    const item=d[apiKey];
    state.activeFeatureItem=item;
    setFeatureHistory(item, kind);
    state.messages=[{role:"model",blocks:[{type:"text",text:`Đây là một ${label} để mình học cùng nhau nhé.`},{type:kind, [blockKey]:item}]}];
    renderMessages();
  } catch(e) {
    state.messages=[{role:"model",blocks:[{type:"text",text:`Không thể tải ${label}: ${e.message}`}]}];
    renderMessages();
  }
}
async function shuffleLearningFeature(kind, messageIndex, excludeId){
  try {
    const qs=[];
    if(state.selectedCourseId) qs.push(`course_id=${encodeURIComponent(state.selectedCourseId)}`);
    if(excludeId) qs.push(`exclude_id=${encodeURIComponent(excludeId)}`);
    const d=await api(`${featureEndpoint(kind,"shuffle")}${qs.length ? `?${qs.join("&")}` : ""}`);
    const key=featureDataKey(kind);
    const blockKey=featureBlockKey(kind);
    const item=d?.[key];
    if(!d?.show || !item) return;
    state.activeFeature=kind;
    state.activeFeatureItem=item;
    setFeatureHistory(item, kind);
    const idx=Number(messageIndex);
    const target=state.messages[idx];
    if(target){
      target.blocks=[{type:"text",text:`Đổi sang một ${featureKindLabel(kind)} khác nhé.`},{type:kind,[blockKey]:item}];
    } else {
      state.messages=[{role:"model",blocks:[{type:"text",text:`Đổi sang một ${featureKindLabel(kind)} khác nhé.`},{type:kind,[blockKey]:item}]}];
    }
    renderMessages();
  } catch(e) {
    toast(e.message || `Không thể đổi ${featureKindLabel(kind)}`, "error");
  }
}
async function shuffleCollocation(messageIndex, excludeId){ return shuffleLearningFeature("collocation", messageIndex, excludeId); }
async function startWelcome() {
  state.activeFeature = "";
  state.activeFeatureItem = null;
  state.messages = []; state.chatHistory = [];
  const shouldShowFeatures = Boolean(state.showCollocationOnFirstChat) && sessionStorage.getItem("doraemon_features_shown_this_login") !== "1";
  if (shouldShowFeatures) sessionStorage.setItem("doraemon_features_shown_this_login", "1");
  try {
    if (shouldShowFeatures) {
      let featureShown = false;
      try {
        const c = await api(`/learning/collocation/daily${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`);
        if (c?.show && c.collocation) {
          const block={type:"collocation",collocation:c.collocation};
          state.messages.push({role:"model",blocks:[block]});
          rememberChatTurn("model",`Collocation hôm nay: ${c.collocation.collocation||""}. Nghĩa: ${c.collocation.meaning||""}. Ví dụ: ${c.collocation.example||""}`);
          featureShown = true;
        }
      } catch (ce) { console.warn('Login-first collocation skipped:', ce); }
      try {
        const p = await api(`/learning/phrasal-verb/daily${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`);
        if (p?.show && p.phrasal_verb) {
          const block={type:"phrasal_verb",phrasalVerb:p.phrasal_verb};
          state.messages.push({role:"model",blocks:[block]});
          rememberChatTurn("model",`Phrasal verb hôm nay: ${p.phrasal_verb.phrasal_verb||""}. Nghĩa: ${p.phrasal_verb.meaning||""}. Ví dụ: ${p.phrasal_verb.example||""}`);
          featureShown = true;
        }
      } catch (pe) { console.warn('Login-first phrasal verb skipped:', pe); }
      state.showCollocationOnFirstChat = false;
      if (featureShown) renderMessages();
    }
    const data = await api(`/session/welcome${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`);
    if (data.message) rememberChatTurn("model", data.message);
    state.messages.push({role:"model",blocks:data.content_blocks?.length ? data.content_blocks : textBlocksFromReply(data.message)});
  } catch (e) { state.messages.push({role:"model",blocks:textBlocksFromReply(`Chào cậu! Có lỗi khi tải phiên chào mừng: ${e.message}`)}); }
  renderMessages();
}

async function renderChat(el) {
  el.innerHTML = `<div class="study-grid">
    <aside class="study-library page-card"><div class="study-library-head"><div><span class="section-label">NỘI DUNG HỌC</span><h2>${escapeHtml(state.selectedCourseName||"Khóa học")}</h2></div><span class="content-count">Đang học</span></div><button class="tutor-launch-card" id="freeTutorBtn"><span class="tutor-launch-avatar" aria-hidden="true"><img src="assets/doraemon-teacher.png" alt="Doraemon" loading="lazy"></span><span class="tutor-launch-copy"><strong>Trò chuyện cùng gia sư</strong><small>Doraemon sẽ đồng hành và giúp cậu cải thiện những điểm còn yếu.</small></span><span class="tutor-launch-arrow">→</span></button><div class="loading">Đang tải nội dung…</div><div class="library-note">💡 Chọn bài để Doraemon mở đúng ngữ cảnh học. Trạng thái chi tiết của Giáo trình nằm trong menu <b>Thông tin người học → Giáo trình</b>.</div></aside>
    <section class="chat-panel page-card"><div class="chat-toolbar"><div class="chat-toolbar-copy"><span class="section-label">PHIÊN HỌC</span><strong>Học cùng Doraemon</strong><small>Doraemon hướng dẫn, giải thích, đặt câu hỏi và phản hồi ngay trong cùng một phòng học.</small></div><div class="chat-toolbar-actions"><button class="feature-launch-button" id="collocationBtn">Collocation</button><button class="feature-launch-button" id="phrasalVerbBtn">Phrasal verb</button><button class="feature-launch-button" id="phrasingBtn">Phrasing</button><button class="small-button" id="newChatBtn">＋ Phiên mới</button></div></div><div class="chat-messages" id="chatMessages"></div><div class="chat-composer"><textarea id="chatInput" rows="1" placeholder="Hỏi Doraemon hoặc trả lời câu hỏi…"></textarea><button class="send-button" id="sendBtn" aria-label="Gửi tin nhắn">➤</button></div><div class="composer-hint">Enter để gửi · Shift+Enter để xuống dòng · Có thể dán ảnh bài tập vào ô chat</div></section>
  </div>`;
  try {
    const [catalog, summary] = await Promise.all([
      api(`/learning/catalog${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`),
      api("/learning/summary")
    ]);
    const docs=catalog.documents||[];
    const progress=summary.learning_history||[];
    const grouped={};
    docs.forEach(r=>{const ct=r.content_type||"Nội dung"; const lesson=r.lesson||""; if(!lesson)return;(grouped[ct]??=[]).push(r);});
    const statusRank={completed:3,done:3,in_progress:2,active:2,review:2,needs_review:2};
    const progressMap=new Map();
    for(const row of progress){
      const cid=row.course_id!=null?String(row.course_id):"";
      const key=`${cid}|${String(row.content_type||"").trim().toLocaleLowerCase("vi-VN")}|${String(row.lesson||"").trim().toLocaleLowerCase("vi-VN")}|${String(row.topic||"").trim().toLocaleLowerCase("vi-VN")}`;
      const prev=progressMap.get(key);
      const score=statusRank[String(row.status||"").trim().toLocaleLowerCase("vi-VN")]||0;
      const prevScore=prev?(statusRank[String(prev.status||"").trim().toLocaleLowerCase("vi-VN")]||0):-1;
      if(!prev || score>=prevScore) progressMap.set(key,row);
    }
    const lessonStatus=row=>{
      if(!row) return {label:"Chưa học",cls:"not-started"};
      const st=String(row.status||"").trim().toLocaleLowerCase("vi-VN");
      if(st==="completed"||st==="done") return {label:"Đã học ✓",cls:"completed"};
      if(["in_progress","active","review","needs_review"].includes(st)) return {label:"Đang học dở ↻",cls:"in-progress"};
      return {label:"Chưa học",cls:"not-started"};
    };
    const typeOrder=["Giáo trình","Từ vựng","Ngữ pháp","Bài tập","Luyện viết","Truyện đọc"];
    const types=[...typeOrder.filter(t=>grouped[t]?.length),...Object.keys(grouped).filter(x=>!typeOrder.includes(x))];
    const cardRows=[];
    const sections=types.filter(t=>grouped[t]?.length).map(t=>`<div class="lesson-section" data-section-type="${escapeHtml(t)}"><div class="lesson-section-head"><span>${iconType(t)} ${escapeHtml(t)}</span><small class="lesson-section-count">${new Set(grouped[t].map(x=>`${x.lesson}|${x.topic||""}`)).size} bài</small></div>${uniqRows(grouped[t]).slice(0,30).map(r=>{
      const actualType=String(r.content_type||t).trim();
      const key=`${r.course_id!=null?String(r.course_id):""}|${actualType.toLocaleLowerCase("vi-VN")}|${String(r.lesson||"").trim().toLocaleLowerCase("vi-VN")}|${String(r.topic||"").trim().toLocaleLowerCase("vi-VN")}`;
      const st=lessonStatus(progressMap.get(key));
      cardRows.push({type:actualType,status:st.cls});
      return `<button class="lesson-card compact" data-lesson="${escapeHtml(r.lesson)}" data-type="${escapeHtml(actualType)}" data-topic="${escapeHtml(r.topic||"")}" data-status="${escapeHtml(st.cls)}"><div class="lesson-card-copy"><strong>${escapeHtml(r.lesson)}</strong>${r.topic?`<small>${escapeHtml(r.topic)}</small>`:""}</div><span class="lesson-status-tag ${st.cls}">${st.label}</span><span class="lesson-card-open">Học →</span></button>`;
    }).join("")}</div>`).join("");
    ensureLibraryFilterStyles();
    const filterTypeOptions=[`<option value="">Tất cả loại nội dung</option>`,...types.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)].join("");
    const libraryHtml = `<div class="study-library-head"><div><span class="section-label">NỘI DUNG HỌC</span><h2>${escapeHtml(state.selectedCourseName||"Khóa học")}</h2></div><span class="content-count">${docs.length} mục</span></div><button class="tutor-launch-card" id="freeTutorBtn"><span class="tutor-launch-avatar" aria-hidden="true"><img src="assets/doraemon-teacher.png" alt="Doraemon" loading="lazy"></span><span class="tutor-launch-copy"><strong>Trò chuyện cùng gia sư</strong><small>Doraemon sẽ đồng hành và giúp cậu cải thiện những điểm còn yếu.</small></span><span class="tutor-launch-arrow">→</span></button><div class="library-filters"><div class="library-filter"><label for="libraryTypeFilter">Loại nội dung</label><select id="libraryTypeFilter">${filterTypeOptions}</select></div><div class="library-filter"><label for="libraryStatusFilter">Trạng thái học</label><select id="libraryStatusFilter"><option value="">Tất cả trạng thái</option><option value="not-started">Chưa học</option><option value="in-progress">Đang học dở</option><option value="completed">Đã học</option></select></div></div>${sections || `<div class="empty-state">Chưa có nội dung được cấp quyền.</div>`}<div id="libraryFilterEmpty" class="library-filter-empty" style="display:none">Không có bài nào khớp với bộ lọc hiện tại.</div><div class="library-note">💡 Chọn bài để Doraemon mở đúng ngữ cảnh học. Dùng bộ lọc phía trên để tìm nhanh theo loại nội dung hoặc trạng thái học.</div>`;
    $(".study-library").innerHTML=libraryHtml;
  } catch (e) {
    $(".study-library").innerHTML = `<div class="study-library-head"><div><span class="section-label">NỘI DUNG HỌC</span><h2>${escapeHtml(state.selectedCourseName||"Khóa học")}</h2></div></div><div class="empty-state error">${escapeHtml(e.message)}</div>`;
  }
  renderMessages();
  $("#collocationBtn").onclick = () => showLearningFeature("collocation");
  $("#phrasalVerbBtn").onclick = () => showLearningFeature("phrasal_verb");
  $("#phrasingBtn").onclick = () => launchPhrasing();
  $("#newChatBtn").onclick = () => { state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`; state.chatboxNew=true; state.messages=[]; state.chatHistory=[]; state.activeContentType=""; state.activeLesson=""; state.activeFeature=""; state.activeFeatureItem=null; state.freeChatTutor=false; state.phrasingTask=""; state.phrasingContext=[]; startWelcome(); };
  const launchTutor = async () => {
    state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
    state.chatboxNew=true; state.messages=[]; state.chatHistory=[];
    state.activeContentType=""; state.activeLesson=""; state.activeFeature=""; state.activeFeatureItem=null; state.freeChatTutor=true;
    renderMessages();
    await sendChat("Bắt đầu một phiên Free Chat Tutor. Hãy chủ động bắt chuyện với mình.", null, false, null, null);
  };
  $("#freeTutorBtn").onclick = launchTutor;
  const typeFilter=$("#libraryTypeFilter"), statusFilter=$("#libraryStatusFilter"), filterEmpty=$("#libraryFilterEmpty");
  const applyLibraryFilters=()=>{
    const type=String(typeFilter?.value||"");
    const status=String(statusFilter?.value||"");
    let visibleCount=0;
    $$(".lesson-section",$(".study-library")).forEach(section=>{
      let sectionVisible=0;
      $$(".lesson-card.compact",section).forEach(card=>{
        const typeOk=!type || String(card.dataset.type||"")===type;
        const statusOk=!status || String(card.dataset.status||"")===status;
        const show=typeOk&&statusOk;
        card.style.display=show?"":"none";
        if(show){sectionVisible++;visibleCount++;}
      });
      section.style.display=sectionVisible?"":"none";
      const count=section.querySelector(".lesson-section-count");
      if(count) count.textContent=`${sectionVisible} bài`;
    });
    if(filterEmpty) filterEmpty.style.display=visibleCount?"none":"";
  };
  typeFilter?.addEventListener("change",applyLibraryFilters);
  statusFilter?.addEventListener("change",applyLibraryFilters);
  applyLibraryFilters();
  const input=$("#chatInput"); const send=()=>{const v=input.value.trim(); if(!v)return; input.value=""; autoGrow(input); if(state.activeFeature==="phrasing" && state.phrasingTask){ sendPhrasingAnswer(v); return; } sendChat(v);}; $("#sendBtn").onclick=send; input.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }); input.addEventListener("input",()=>autoGrow(input));
  $$(".lesson-card", el).forEach(x=>x.onclick=()=>startLesson(x.dataset.lesson,x.dataset.type,x.dataset.topic||""));
  if (!state.messages.length && !state.activeFeature) await startWelcome();
}
function autoGrow(el){el.style.height="auto";el.style.height=Math.min(160,el.scrollHeight)+"px";}
async function renderCatalog(el){
  const data=await api(`/learning/catalog${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`);
  const docs=data.documents||[]; const grouped={}; docs.forEach(r=>{const ct=r.content_type||"Nội dung"; const lesson=r.lesson||""; if(!lesson)return;(grouped[ct]??=[]).push(r);});
  const types=["Giáo trình","Từ vựng","Ngữ pháp","Bài tập","Truyện đọc",...Object.keys(grouped).filter(x=>!["Giáo trình","Từ vựng","Ngữ pháp","Bài tập","Truyện đọc"].includes(x))];
  el.innerHTML=`<div class="page-grid"><section><div class="page-card"><div class="card-head"><div><strong>Nội dung được cấp quyền</strong><small>${docs.length?`${docs.length} bản ghi nội dung`:"Chưa có nội dung"}</small></div><button class="small-button" id="catalogRefresh">↻ Làm mới</button></div>${docs.length?types.filter(t=>grouped[t]?.length).map(t=>`<div class="content-group"><div class="group-head"><span>${iconType(t)} ${escapeHtml(t)}</span><small>${new Set(grouped[t].map(x=>`${x.lesson}|${x.topic||""}`)).size} bài</small></div>${uniqRows(grouped[t]).map(r=>`<button class="lesson-card" data-lesson="${escapeHtml(r.lesson)}" data-type="${escapeHtml(r.content_type)}"><div><strong>${escapeHtml(r.lesson)}</strong><small>${escapeHtml(r.topic||"")}</small></div><span>Học →</span></button>`).join("")}</div>`).join(""): `<div class="empty-state">${data.requires_course_selection?"Hãy chọn khóa học ở góc phải.":"Tài khoản chưa có nội dung khóa học được cấp quyền."}</div>`}</div></section><aside class="page-card insight"><h3>📌 Cách học</h3><p>Chọn một bài cụ thể để Doraemon mở đúng lesson trong chat. Server sẽ quản lý trạng thái tiến độ và bước giáo trình.</p><div class="stat-grid"><div><strong>${docs.length}</strong><span>Bản ghi</span></div><div><strong>${Object.keys(grouped).length}</strong><span>Loại nội dung</span></div></div></aside></div>`;
  $("#catalogRefresh").onclick=()=>renderCatalog($("#appContent")); $$(".lesson-card").forEach(b=>b.onclick=()=>startLesson(b.dataset.lesson,b.dataset.type,b.dataset.topic||""));
}
function uniqRows(rows){const seen=new Set();return rows.filter(r=>{const k=`${r.lesson}|${r.topic||""}`;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>String(a.lesson).localeCompare(String(b.lesson),"vi"));}
function iconType(t){return ({"Giáo trình":"📖","Từ vựng":"🧠","Ngữ pháp":"✏️","Bài tập":"📝","Luyện viết":"✍️","Truyện đọc":"📚","Collocation":"💡","Phrasal verb":"🔗"})[t]||"📄";}
function encodeLessonScope(scope){const raw=JSON.stringify(scope);const bytes=encodeURIComponent(raw).replace(/%([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));return btoa(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function startLesson(lesson,type,topic=""){
  state.view="chat";
  state.activeContentType = String(type || "Giáo trình").trim();
  state.activeLesson = String(lesson || "").trim();
  state.freeChatTutor = false;
  state.activeFeature = "";
  state.activeFeatureItem = null;
  state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
  state.chatboxNew=true;
  state.messages=[];
  state.chatHistory=[];
  await renderChat($("#appContent"));
  const normalizedType=type||"Giáo trình";
  const scope={course_id:state.selectedCourseId?Number(state.selectedCourseId):null,course:state.selectedCourseName||null,content_type:normalizedType,lesson:String(lesson||"").trim(),topic:String(topic||"").trim()||null};
  const action=`lesson_confirm_yes:${encodeLessonScope(scope)}`;
  const display=`Mình muốn học ${normalizedType} ${lesson}${topic?` - ${topic}`:""}`;
  await sendChat("",null,false,action,display);
}

async function renderCurriculum(el){
  const [catalog, summary] = await Promise.all([
    api(`/learning/catalog${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`),
    api("/learning/summary")
  ]);
  const docs=(catalog.documents||[]).filter(x=>String(x.content_type||"").trim() && String(x.lesson||"").trim());
  const progress=summary.learning_history||[];
  const statusRank={completed:3,done:3,in_progress:2,active:2,review:2,needs_review:2};
  const progressMap=new Map();
  for(const row of progress){
    const cid=row.course_id!=null?String(row.course_id):"";
    const key=`${cid}|${String(row.content_type||"").trim().toLocaleLowerCase("vi-VN")}|${String(row.lesson||"").trim().toLocaleLowerCase("vi-VN")}|${String(row.topic||"").trim().toLocaleLowerCase("vi-VN")}`;
    const prev=progressMap.get(key);
    const score=statusRank[String(row.status||"").trim().toLocaleLowerCase("vi-VN")]||0;
    const prevScore=prev?(statusRank[String(prev.status||"").trim().toLocaleLowerCase("vi-VN")]||0):-1;
    if(!prev || score>=prevScore) progressMap.set(key,row);
  }
  const statusText=row=>{
    if(!row) return {label:"Chưa học",cls:"not-started",icon:"○"};
    const st=String(row.status||"").trim().toLocaleLowerCase("vi-VN");
    if(st==="completed"||st==="done") return {label:"Đã học",cls:"completed",icon:"✓"};
    if(["in_progress","active","review","needs_review"].includes(st)) return {label:"Đang học",cls:"in-progress",icon:"↻"};
    return {label:"Chưa học",cls:"not-started",icon:"○"};
  };
  const typeOrder=["Giáo trình","Bài tập","Từ vựng","Ngữ pháp","Truyện đọc"];
  const types=[...typeOrder.filter(t=>docs.some(x=>String(x.content_type||"").trim()===t)),
    ...[...new Set(docs.map(x=>String(x.content_type||"").trim()))].filter(t=>!typeOrder.includes(t))];
  const grouped={};
  for(const r of docs){const ct=String(r.content_type||"Nội dung").trim()||"Nội dung";(grouped[ct]??=[]).push(r);}

  const uniquePerType = ct => uniqRows(grouped[ct]||[]);
  const allRows = types.flatMap(ct=>uniquePerType(ct).map(r=>({...r,__type:ct})));
  const counts={"completed":0,"in-progress":0,"not-started":0};
  for(const r of allRows){
    const key=`${r.course_id!=null?String(r.course_id):""}|${String(r.content_type||r.__type||"").trim().toLocaleLowerCase("vi-VN")}|${String(r.lesson||"").trim().toLocaleLowerCase("vi-VN")}|${String(r.topic||"").trim().toLocaleLowerCase("vi-VN")}`;
    counts[statusText(progressMap.get(key)).cls]++;
  }

  const groupHtml=types.map(ct=>{
    const rows=uniquePerType(ct);
    if(!rows.length) return "";
    const cards=rows.map(r=>{
      const actualType=String(r.content_type||ct).trim();
      const key=`${r.course_id!=null?String(r.course_id):""}|${actualType.toLocaleLowerCase("vi-VN")}|${String(r.lesson||"").trim().toLocaleLowerCase("vi-VN")}|${String(r.topic||"").trim().toLocaleLowerCase("vi-VN")}`;
      const st=statusText(progressMap.get(key));
      return `<button class="curriculum-row" data-lesson="${escapeHtml(r.lesson||"")}" data-type="${escapeHtml(actualType)}" data-topic="${escapeHtml(r.topic||"")}"><span class="curriculum-icon ${st.cls}">${st.icon}</span><span class="curriculum-main"><strong>${escapeHtml(r.lesson||"")}</strong>${r.topic?`<small>${escapeHtml(r.topic)}</small>`:""}</span><span class="curriculum-status ${st.cls}">${st.label}</span><span class="curriculum-open">Học →</span></button>`;
    }).join("");
    return `<div class="content-group curriculum-content-group"><div class="group-head"><span>${iconType(ct)} ${escapeHtml(ct)}</span><small>${rows.length} bài</small></div>${cards}</div>`;
  }).join("");

  el.innerHTML=`<section class="page-card curriculum-card"><div class="card-head"><div><strong>📖 Nội dung học</strong><small>Hiển thị tất cả loại nội dung của khóa học đang chọn</small></div><button class="small-button" id="curriculumRefresh">↻ Làm mới</button></div><div class="curriculum-summary"><div><strong>${allRows.length}</strong><span>Tổng bài</span></div><div><strong>${counts["in-progress"]}</strong><span>Đang học</span></div><div><strong>${counts.completed}</strong><span>Đã học</span></div><div><strong>${counts["not-started"]}</strong><span>Chưa học</span></div></div><div class="curriculum-list">${groupHtml||`<div class="empty-state">Chưa có nội dung nào được cấp quyền cho khóa học này.</div>`}</div></section>`;
  $("#curriculumRefresh").onclick=()=>renderCurriculum(el);
  $$(".curriculum-row",el).forEach(btn=>btn.onclick=async()=>{closeLearnerPanel();await startLesson(btn.dataset.lesson,btn.dataset.type,btn.dataset.topic||"");});
}

async function renderPlan(el){const data=await api(`/learning/plan${state.selectedCourseId?`?course_id=${state.selectedCourseId}`:""}`); const plans=data.plans||[]; const plan=data.plan||null; const draft=data.draft||null; el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Lộ trình học</strong><small>${data.learning_mode==='planned'?'Đang học theo lộ trình':'Học tự do'}</small></div><button class="small-button" id="planChat">✦ Điều chỉnh bằng chat</button></div>${plans.length?plans.map(p=>`<div class="plan-card"><div class="plan-icon">🎯</div><div class="plan-main"><strong>${escapeHtml(p.goal_name||"Lộ trình")}</strong><span>${escapeHtml(p.content_type||"")} · ${escapeHtml(p.scope||"")}</span><small>Bắt đầu: ${escapeHtml(p.start_date||"—")} ${p.target_date?` · Mục tiêu: ${escapeHtml(p.target_date)}`:""}</small></div><button class="danger-button" data-delete-plan="${p.id}">Xóa</button></div>`).join(""): `<div class="empty-state">${draft?"Bạn có một lộ trình nháp. Hãy vào chat để xác nhận lộ trình.":"Chưa có lộ trình hoạt động. Hãy mở chat và chọn <b>Học theo lộ trình</b>."}</div>`}</section><aside class="page-card"><h3>📊 Trạng thái</h3><div class="stat-grid"><div><strong>${plans.length}</strong><span>Plan active</span></div><div><strong>${escapeHtml(data.learning_mode||"free")}</strong><span>Chế độ</span></div></div>${plan?`<div class="mini-note">${escapeHtml(plan.goal_name||"")}</div>`:""}</aside></div>`; $("#planChat").onclick=async()=>{state.view="chat"; closeLearnerPanel(); await renderChat($("#appContent"));}; $$("[data-delete-plan]").forEach(b=>b.onclick=async()=>{if(!confirm("Xóa lộ trình này?"))return;try{await api(`/learning/plan/${b.dataset.deletePlan}`,{method:"DELETE"});toast("Đã xóa lộ trình","success");await renderPlan($("#appContent"));}catch(e){toast(e.message,"error");}});}

async function renderReview(el){const d=await api(`/learning/review/today${state.selectedCourseId?`?course_id=${state.selectedCourseId}`:""}`);const items=d.review_items||[];const scheduled=d.scheduled_lessons||[];el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Nội dung cần ôn tập</strong><small>${items.length?`${items.length} mục đang chờ ôn`:"Chưa có mục sai để ôn"}</small></div><div class="button-row-inline"><button class="small-button" id="reviewStart">Bắt đầu ôn</button><button class="small-button" id="reviewChat">Ôn bằng chat</button></div></div>${items.length?`<div class="review-list">${items.map(x=>`<div class="review-item"><div class="review-badge">${x.item_type==='vocabulary'?'Từ':'Ngữ'}</div><div><strong>${escapeHtml(x.label||x.pattern||x.item_id)}</strong><small>${escapeHtml(x.lesson||"")} · ${escapeHtml(x.meaning||x.explanation||"")}</small></div><span>📅 ${escapeHtml(fmtDate(x.next_review_at))}</span></div>`).join("")}`:`<div class="empty-state success">✅ Hiện chưa có nội dung cần ôn. Nội dung chỉ được thêm sau khi cậu trả lời sai trong review.</div>`}</section><aside class="page-card"><h3>📆 Lịch ôn</h3>${scheduled.length?scheduled.slice(0,8).map(x=>`<div class="schedule-row"><strong>${escapeHtml(x.lesson||"Bài")}</strong><span>${escapeHtml(x.content_type||"")}</span><small>${escapeHtml(fmtDate(x.next_review_at))}</small></div>`).join(""):`<div class="empty-state">Chưa có lịch ôn.</div>`}</aside></div>`;$("#reviewStart").onclick=()=>startReviewQuiz();$("#reviewChat").onclick=()=>startReviewChat();}
async function startReviewQuiz(){const el=$("#appContent");el.innerHTML=`<section class="page-card quiz-card"><div class="card-head"><div><strong>🔄 Phiên ôn tập</strong><small>Trả lời theo đúng định dạng Doraemon yêu cầu</small></div><button class="small-button" id="quizExit">← Quay lại</button></div><div id="quizBody" class="quiz-body"><div class="loading">Đang tạo câu hỏi…</div></div></section>`;$("#quizExit").onclick=()=>renderReview(el);try{const d=await api("/learning/review/start",{method:"POST",body:{course_id:Number(state.selectedCourseId||0),max_questions:12}});const qs=d.questions||[];const sid=d.session_id;if(!qs.length){$("#quizBody").innerHTML=`<div class="empty-state success">✅ Không còn câu hỏi để ôn.</div>`;return;}let idx=0,score=0;const submit=async answer=>{if(!String(answer||"").trim())return;const q=qs[idx];try{const r=await api("/learning/review/answer",{method:"POST",body:{course_id:Number(state.selectedCourseId||0),session_id:sid,item_type:q.item_type,item_id:q.item_id,answer:String(answer).trim()}});if(r.correct)score++;const feedback=$("#quizFeedback");if(feedback){feedback.className=`quiz-feedback ${r.correct?'correct':'wrong'}`;feedback.innerHTML=(r.correct?"✅ Đúng!":"❌ Chưa đúng.")+(r.explanation?`<div>${nl2br(r.explanation)}</div>`:"");}$$('.quiz-options button').forEach(b=>b.disabled=true);if($("#quizSubmit"))$("#quizSubmit").disabled=true;setTimeout(()=>{idx++;if(idx>=qs.length){$("#quizBody").innerHTML=`<div class="quiz-finish"><div>🎉 Hoàn thành phiên ôn!</div><strong>${score}/${qs.length}</strong><p>Cậu có thể quay lại nội dung cần ôn hoặc tiếp tục học với Doraemon.</p><button class="button button-primary" id="quizDone">Xem lại</button></div>`;$("#quizDone").onclick=()=>renderReview(el);}else renderQ();},650);}catch(e){const f=$("#quizFeedback");if(f){f.className="quiz-feedback wrong";f.textContent=e.message;}}};const renderQ=()=>{const q=qs[idx];const opts=q.options||[];$("#quizBody").innerHTML=`<div class="quiz-progress">Câu ${idx+1}/${qs.length}</div><h3 class="quiz-question">${nl2br(q.question||"")}</h3>${opts.length?`<div class="quiz-options">${opts.map(o=>`<button data-opt="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}</div>`:`<div class="quiz-answer"><input id="quizAnswer" placeholder="Nhập đáp án…"><button class="button button-primary" id="quizSubmit">Trả lời</button></div>`}<div id="quizFeedback" class="quiz-feedback"></div>`;$$('[data-opt]').forEach(b=>b.onclick=()=>submit(b.dataset.opt));$("#quizSubmit")?.addEventListener('click',()=>submit($("#quizAnswer")?.value));$("#quizAnswer")?.addEventListener('keydown',e=>{if(e.key==='Enter')submit($("#quizAnswer").value);});};renderQ();}catch(e){$("#quizBody").innerHTML=`<div class="empty-state error">${escapeHtml(e.message)}</div>`;}}
async function startReviewChat(){closeLearnerPanel();state.view="chat";state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;state.chatboxNew=true;state.messages=[];state.chatHistory=[];state.activeFeature="";state.activeFeatureItem=null;await renderChat($("#appContent"));await sendAction("review_open","Mở nội dung ôn tập");}


function phrasingResetState(){
  state.activeFeature="phrasing";
  state.activeFeatureItem=null;
  state.activeContentType="";
  state.activeLesson="";
  state.freeChatTutor=false;
  state.phrasingTask="";
}
async function launchPhrasing(options={}){
  // Use the five most recent messages as context for the Phrasing flow.
  const incomingContext = Array.isArray(options.context) ? options.context.slice(-5) : state.chatHistory.slice(-5);
  state.phrasingContext = incomingContext;
  state.view="chat";
  state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
  state.chatboxNew=true;
  state.messages=[];
  state.chatHistory=[];
  phrasingResetState();
  await renderChat($("#appContent"));
  const bubble=addChatMessage("model",[{type:"typing",text:"Doraemon đang chọn một thử thách Phrasing..."}]);
  renderMessages();
  try{
    const d=await api("/learning/phrasing/start",{method:"POST",body:{course_id:Number(state.selectedCourseId||0),chat_history:incomingContext.slice(-5)}});
    state.phrasingTask=String(d.task||d.reply||"").trim();
    bubble.blocks=[{type:"text",text:d.reply||"👉 Hãy diễn đạt ý này bằng tiếng Anh nhé."}];
    rememberChatTurn("model",d.reply||"");
    renderMessages();
  }catch(e){
    bubble.blocks=[{type:"text",text:`Không thể bắt đầu Phrasing: ${e.message}`}];
    renderMessages();
  }
}
async function sendPhrasingAnswer(answer){
  const text=String(answer||"").trim();
  if(!text || !state.phrasingTask) return;
  addChatMessage("user",textBlocksFromReply(text));
  rememberChatTurn("user",text);
  const recentHistory=state.chatHistory.slice(-5);
  const bubble=addChatMessage("model",[{type:"typing",text:"Doraemon đang xem cách diễn đạt của cậu..."}]);
  renderMessages();
  try{
    const d=await api("/learning/phrasing/evaluate",{method:"POST",body:{course_id:Number(state.selectedCourseId||0),task:state.phrasingTask,answer:text,chat_history:recentHistory}});
    bubble.blocks=[{type:"text",text:d.reply||"Doraemon chưa có phản hồi."}];
    if(d.reply) rememberChatTurn("model",d.reply);
    renderMessages();
    state.phrasingTask="";
    bubble.blocks.push({type:"choice",options:[{label:"Bài Phrasing tiếp theo",action:"phrasing_next",display_label:"Bài Phrasing tiếp theo"}]});
    renderMessages();
  }catch(e){
    bubble.blocks=[{type:"text",text:`Không thể chấm Phrasing: ${e.message}`}];
    renderMessages();
  }
}
async function startNextPhrasing(){
  const context=state.chatHistory.slice(-5);
  state.phrasingTask="";
  await launchPhrasing({context});
}
async function renderPackages(el){const [me,pkgs]=await Promise.all([api("/auth/me"),api("/payments/packages")]); const sub=me.subscription||{}; el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Gói học</strong><small>Thông tin hiện tại của tài khoản</small></div></div><div class="subscription-banner"><div><span>Gói hiện tại</span><strong>${escapeHtml(sub.plan||"Free")}</strong></div><div><span>Trạng thái</span><strong>${escapeHtml(sub.status||"ACTIVE")}</strong></div><div><span>Hết hạn</span><strong>${escapeHtml(sub.expires_at_vn||"Không giới hạn")}</strong></div></div><div class="package-grid">${(pkgs.packages||[]).map(p=>`<div class="package-card"><span class="package-month">${p.months} tháng</span><h3>${escapeHtml(p.plan_name||"")}</h3><strong>${escapeHtml(p.price_display||money(p.price_vnd))}</strong>${p.qr_url?`<img src="${escapeHtml(p.qr_url)}" alt="QR thanh toán" class="qr-img">`:``}<div class="payment-code">${escapeHtml(p.payment_content||"")}</div><button class="small-button copy-payment" data-copy="${escapeHtml(p.payment_content||"")}">Sao chép nội dung</button></div>`).join("")}</div></section><aside class="page-card"><h3>🎓 Khóa học được cấp quyền</h3>${(sub.courses||[]).length?(sub.courses||[]).map(c=>`<div class="course-entitlement"><strong>${escapeHtml(c.name||"")}</strong><span>${escapeHtml(c.expires_at_vn||"Đang hiệu lực")}</span></div>`).join(""):`<div class="empty-state">Tài khoản hiện chưa có khóa học trả phí.</div>`}</aside></div>`; $$(".copy-payment").forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast("Đã sao chép","success");}catch{toast("Không thể sao chép tự động","error");}});}

async function renderAdmin(el){const data=await api("/admin-chat/history?limit=200"); el.innerHTML=`<div class="page-card admin-card"><div class="card-head"><div><strong>Chat với Admin</strong><small>HTTP polling bảo đảm hoạt động cả khi WebSocket bị gián đoạn</small></div><span class="status-dot">● Đang hoạt động</span></div><div class="admin-messages" id="adminMessages">${(data.messages||[]).map(renderAdminMessage).join("")}</div><div class="admin-composer"><input id="adminInput" placeholder="Nhắn tin cho Admin…"><button class="send-button" id="adminSend">➤</button></div></div>`; const list=$("#adminMessages"); list.scrollTop=list.scrollHeight; $("#adminSend").onclick=sendAdmin; $("#adminInput").addEventListener("keydown",e=>{if(e.key==='Enter')sendAdmin();}); window.clearInterval(window.__adminPoll); window.__adminPoll=setInterval(async()=>{try{const d=await api("/admin-chat/history?limit=200");list.innerHTML=(d.messages||[]).map(renderAdminMessage).join("");list.scrollTop=list.scrollHeight;}catch{}},3500);}
function renderAdminMessage(m){return `<div class="admin-msg ${m.sender==='user'?'me':''}"><div class="admin-msg-author">${m.sender==='user'?'Bạn':'Admin'}</div><div class="admin-msg-body">${nl2br(m.message||"")}</div><small>${escapeHtml(fmtDate(m.created_at))}</small></div>`;}
async function sendAdmin(){const input=$("#adminInput"); const msg=input?.value.trim(); if(!msg)return; input.value=""; try{await api("/admin-chat/send",{method:"POST",body:{client_message_id:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`),message:msg}});const d=await api("/admin-chat/history?limit=200");$("#adminMessages").innerHTML=(d.messages||[]).map(renderAdminMessage).join("");$("#adminMessages").scrollTop=$("#adminMessages").scrollHeight;}catch(e){toast(e.message,"error");}}

async function renderSettings(el){
  const me=state.__me||await api("/auth/me");
  let settings={review_interval_days:1};
  try{settings=await api("/learning/review/settings");}catch{}
  el.innerHTML=`<div class="settings-grid"><section class="page-card"><div class="card-head"><div><strong>Cấu hình học tập</strong><small>Thiết lập các tùy chọn học tập chính</small></div></div><label class="setting-row"><div><strong>Khóa học đang học</strong><small>Chat và review sẽ dùng course này</small></div><select id="settingsCourse">${(me.subscription?.courses||[]).map(c=>`<option value="${c.course_id}" ${String(c.course_id)===String(state.selectedCourseId)?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}</select></label><label class="setting-row"><div><strong>Ôn tập lại sau</strong><small>Số ngày sau khi hoàn thành nội dung</small></div><input id="reviewDays" type="number" min="1" max="365" value="${Number(settings.review_interval_days||1)}"></label><div class="button-row"><button class="button button-primary" id="saveSettings">Lưu cấu hình</button><button class="button button-secondary" id="resetLearning">🗑 Xóa lịch sử học</button></div></section><aside class="page-card"><h3>👤 Tài khoản</h3><div class="profile-line"><span>Nickname</span><strong>${escapeHtml(me.user?.nickname||"")}</strong></div><div class="profile-line"><span>SĐT</span><strong>${escapeHtml(me.user?.phone||"")}</strong></div><div class="profile-line"><span>Gói</span><strong>${escapeHtml(me.subscription?.plan||"Free")}</strong></div></aside></div>`;
  $("#saveSettings").onclick=async()=>{try{const cid=Number($("#settingsCourse").value||0); if(cid){const d=await api("/learning/select-course",{method:"POST",body:{course_id:cid}});state.selectedCourseId=d.course_id;state.selectedCourseName=d.course_name;} await api("/learning/review/settings",{method:"POST",body:{review_interval_days:Number($("#reviewDays").value||1)}}); toast("Đã lưu cấu hình","success"); closeLearnerPanel(); await renderChat($("#appContent"));}catch(e){toast(e.message,"error");}};
  $("#resetLearning").onclick=async()=>{if(!confirm("Xóa toàn bộ tiến độ, review và lộ trình học? Tài khoản và gói học không bị xóa."))return;try{await api("/learning/reset",{method:"POST"});toast("Đã xóa lịch sử học","success");state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;state.chatboxNew=true;state.messages=[];state.chatHistory=[];state.activeFeature="";state.activeFeatureItem=null;state.view="chat"; closeLearnerPanel(); await renderChat($("#appContent"));}catch(e){toast(e.message,"error");}};
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
