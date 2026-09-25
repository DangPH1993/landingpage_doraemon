// Doraemon Web Client v31.72 – forgot-password UI/action + mail-check feedback
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

function ensureVocabularyCardStyles(){
  if(document.getElementById("doraemon-vocabulary-card-styles")) return;
  const style=document.createElement("style"); style.id="doraemon-vocabulary-card-styles";
  style.textContent=`
    .daily-vocabulary-card{margin:8px 0 4px;padding:18px;border:1px solid #d8e2ef;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f8fbff);box-shadow:0 8px 24px rgba(15,23,42,.06)}
    .daily-vocabulary-progress{font-size:12px;font-weight:800;color:#4f46e5;margin-bottom:10px}
    .daily-vocabulary-word{font-size:28px;font-weight:700;color:#0f172a;line-height:1.15;margin-bottom:10px;overflow-wrap:anywhere}
    .daily-vocabulary-field{font-size:14px;line-height:1.65;color:#334155;margin:7px 0}
    .daily-vocabulary-example{padding:10px 12px;border-left:3px solid #7c9cff;background:#f8fbff;border-radius:8px}
    .daily-vocabulary-image{display:block;width:100%;max-height:300px;object-fit:contain;margin:14px 0 2px;border-radius:12px;border:1px solid #e2e8f0;background:#fff}
    @media(max-width:700px){.daily-vocabulary-card{padding:14px}.daily-vocabulary-word{font-size:24px}}
  `; document.head.appendChild(style);
}

function ensureAppNavigationStyles(){
  if(document.getElementById("doraemon-app-navigation-styles")) return;
  const style=document.createElement("style");
  style.id="doraemon-app-navigation-styles";
  style.textContent=`
    /* Landing-page navigation belongs only to the landing page.
       The learning screen has its own study header, so hide the global nav while #/app is active. */
    #siteNav.app-mode{display:none !important;}
  `;
  document.head.appendChild(style);
}

function ensureStudyChatLayoutStyles(){
  if(document.getElementById("doraemon-study-chat-layout-styles")) return;
  const style=document.createElement("style");
  style.id="doraemon-study-chat-layout-styles";
  style.textContent=`
    /* Keep the two-column study area inside the viewport.
       The left curriculum list and chat messages scroll independently. */
    .study-grid{
      /* Desktop learning area is intentionally 1.5x the previous viewport-based height.
         Each column still scrolls internally, so long lesson lists do not stretch the chat. */
      height:calc(150vh - 198px);
      height:calc(150dvh - 198px);
      min-height:840px;
      max-height:none;
      align-items:stretch !important;
      min-width:0;
    }
    .study-library{
      height:100% !important;
      min-height:0 !important;
      max-height:100% !important;
      display:flex !important;
      flex-direction:column !important;
      overflow:hidden !important;
      min-width:0;
    }
    .study-library-head,.tutor-launch-card,.library-filters,.library-note{
      flex:0 0 auto;
    }
    .study-library-list{
      flex:1 1 auto;
      min-height:0 !important;
      overflow-y:auto !important;
      overflow-x:hidden !important;
      padding:2px 6px 6px 0;
      scrollbar-width:thin;
      overscroll-behavior:contain;
    }
    .study-plan-lesson-action{margin:8px 0 2px;display:flex;justify-content:flex-start}
    .study-plan-lesson-button{min-width:210px;box-shadow:0 8px 18px rgba(37,99,235,.12)}

    .study-library-list::-webkit-scrollbar,.chat-messages::-webkit-scrollbar{width:8px}
    .study-library-list::-webkit-scrollbar-thumb,.chat-messages::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px}
    .study-library-list::-webkit-scrollbar-track,.chat-messages::-webkit-scrollbar-track{background:transparent}
    .chat-panel{
      height:100% !important;
      min-height:0 !important;
      max-height:100% !important;
      display:flex !important;
      flex-direction:column !important;
      overflow:hidden !important;
      min-width:0;
    }
    .chat-toolbar{flex:0 0 auto}
    .chat-messages{
      flex:1 1 auto !important;
      min-height:0 !important;
      max-height:none !important;
      height:auto !important;
      overflow-y:auto !important;
      overflow-x:hidden !important;
      overscroll-behavior:contain;
    }
    .chat-composer,.composer-hint{flex:0 0 auto}
    @media(max-width:900px){
      .study-grid{height:auto;min-height:0;max-height:none}
      .study-library,.chat-panel{height:auto !important;max-height:none !important}
      .study-library-list{max-height:52vh;min-height:220px !important}
      .chat-panel{min-height:620px !important}
    }
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
    .library-filter-multi{position:relative;min-width:0}
    .library-filter-trigger{width:100%;height:34px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #d8e2ef;border-radius:9px;background:#fff;padding:0 9px;color:#1e293b;font-size:12px;outline:none;cursor:pointer;text-align:left}
    .library-filter-trigger:hover{border-color:#b9c9df}
    .library-filter-multi.open .library-filter-trigger{border-color:#7c9cff;box-shadow:0 0 0 3px rgba(59,130,246,.08)}
    .library-filter-chevron{font-size:10px;color:#64748b;transition:transform .15s ease}
    .library-filter-multi.open .library-filter-chevron{transform:rotate(180deg)}
    .library-filter-menu{position:absolute;left:0;right:0;top:calc(100% + 5px);z-index:60;display:none;max-height:220px;overflow:auto;padding:5px;border:1px solid #d8e2ef;border-radius:10px;background:#fff;box-shadow:0 12px 26px rgba(15,23,42,.12)}
    .library-filter-multi.open .library-filter-menu{display:block}
    .library-filter-option{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;font-size:12px;color:#334155;cursor:pointer;user-select:none}
    .library-filter-option:hover{background:#f1f5ff}
    .library-filter-option input{width:14px;height:14px;margin:0;accent-color:#3b82f6}
    .library-filter-option.all-option{border-bottom:1px solid #eef2f7;margin-bottom:3px;padding-bottom:8px;font-weight:700}
    .library-filter-count{font-size:10px;color:#64748b;margin-left:auto}
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
function setAuthFieldLabel(inputId, text) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const label = document.querySelector(`label[for="${inputId}"]`) || input.closest("label");
  if (!label) return;
  const span = label.querySelector("span") || label.querySelector("strong") || label.firstElementChild;
  if (span && span !== input && !span.contains(input)) span.textContent = text;
  else {
    const node = [...label.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (node) node.textContent = text + " ";
  }
}
function ensureAuthExtras() {
  if (!authForm) return;
  if (!document.getElementById("forgotPasswordLink")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "forgotPasswordLink";
    btn.className = "auth-forgot-link";
    btn.textContent = "Quên mật khẩu?";
    btn.onclick = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      openAuth("forgot");
    };
    const submit = document.getElementById("authSubmit");
    if (submit?.parentElement) submit.parentElement.insertAdjacentElement("afterend", btn);
    else authForm.appendChild(btn);
  }
  if (!document.getElementById("authForgotHint")) {
    const hint = document.createElement("div");
    hint.id = "authForgotHint";
    hint.className = "auth-forgot-hint hidden";
    hint.setAttribute("role", "status");
    const submit = document.getElementById("authSubmit");
    if (submit?.parentElement) submit.parentElement.insertAdjacentElement("afterend", hint);
    else authForm.appendChild(hint);
  }
  if (!document.getElementById("authPasswordConfirmField")) {
    const wrap = document.createElement("label");
    wrap.id = "authPasswordConfirmField";
    wrap.className = "auth-dynamic-field";
    wrap.innerHTML = '<span>Nhập lại mật khẩu</span><input id="authPasswordConfirm" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu">';
    const pass = document.getElementById("authPassword");
    const passWrap = pass?.closest("label") || pass?.parentElement;
    if (passWrap?.parentElement) passWrap.parentElement.insertBefore(wrap, passWrap.nextSibling);
    else authForm.appendChild(wrap);
    const styleId = "doraemon-auth-extra-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `.auth-forgot-link{display:block;margin:10px auto 0;background:none;border:0;color:#2563eb;font-weight:700;cursor:pointer}.auth-forgot-link:hover{text-decoration:underline}.auth-forgot-hint{margin:10px 0 2px;padding:10px 12px;border:1px solid #dbe7ff;border-radius:12px;background:#f5f8ff;color:#334155;font-size:13px;line-height:1.5}.auth-forgot-hint.hidden{display:none}.auth-dynamic-field{display:block;margin-top:10px}.auth-dynamic-field span{display:block;margin-bottom:5px}.auth-dynamic-field input{width:100%;box-sizing:border-box}`;
      document.head.appendChild(style);
    }
  }
}

// Delegated handler makes the forgot-password action reliable even if the link is
// injected/re-rendered after boot. It also prevents the form from submitting as a
// normal button click before setAuthMode("forgot") runs.
document.addEventListener("click", (event) => {
  const link = event.target?.closest?.("#forgotPasswordLink");
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  openAuth("forgot");
});

function isResetPasswordRoute() { return (location.hash || "").startsWith("#/reset-password"); }
function resetTokenFromHash() {
  const raw = location.hash || "";
  const idx = raw.indexOf("?");
  if (idx < 0) return "";
  return new URLSearchParams(raw.slice(idx + 1)).get("token") || "";
}
function openAuth(mode = "login") {
  ensureAuthExtras();
  authModal.classList.remove("hidden");
  authModal.setAttribute("aria-hidden", "false");
  setAuthMode(mode);
  setTimeout(() => {
    const target = mode === "reset" ? $("#authPassword") : $("#authPhone");
    target?.focus();
    target?.select?.();
  }, 30);
}
function closeAuth() { authModal.classList.add("hidden"); authModal.setAttribute("aria-hidden", "true"); const s = $("#authStatus"); if (s) s.textContent = ""; }
function setAuthMode(mode) {
  ensureAuthExtras();
  const register = mode === "register";
  const forgot = mode === "forgot";
  const reset = mode === "reset";
  $$(".auth-tab").forEach(x => x.classList.toggle("active", register ? x.dataset.authMode === "register" : (!forgot && !reset && x.dataset.authMode === "login")));
  $$(".auth-tab").forEach(x => x.classList.toggle("hidden", forgot || reset));
  const nickField = $("#nicknameField");
  if (nickField) nickField.classList.toggle("hidden", !register);
  const nick = $("#authNickname");
  if (nick) nick.required = register;
  const pass = $("#authPassword");
  const passWrap = pass?.closest("label") || pass?.parentElement;
  if (passWrap) passWrap.classList.toggle("hidden", forgot);
  const confirmField = $("#authPasswordConfirmField");
  if (confirmField) confirmField.classList.toggle("hidden", !reset);
  if (pass) pass.required = register || reset;
  const emailInput = $("#authPhone");
  if (emailInput) {
    emailInput.type = "email";
    emailInput.name = "email";
    emailInput.autocomplete = forgot ? "email" : (register ? "email" : "username");
    emailInput.placeholder = "you@example.com";
    emailInput.required = !reset;
    const emailWrap = emailInput.closest("label") || emailInput.parentElement;
    if (emailWrap) emailWrap.classList.toggle("hidden", reset);
    setAuthFieldLabel("authPhone", "Email");
  }
  setAuthFieldLabel("authNickname", "Username");
  const forgotHint = $("#authForgotHint");
  if (forgotHint) {
    forgotHint.classList.toggle("hidden", !forgot);
    forgotHint.textContent = forgot
      ? "Nhập email đã đăng ký. Doraemon sẽ gửi link đặt lại mật khẩu qua email."
      : "";
  }
  if (forgot) {
    if (pass) pass.value = "";
    if (nick) nick.value = "";
    const emailInput = $("#authPhone");
    if (emailInput) emailInput.value = emailInput.value.trim();
  }
  if (reset) {
    if (emailInput) emailInput.value = "";
    if (nick) nick.value = "";
    if (pass) { pass.value = ""; pass.placeholder = "Mật khẩu mới"; }
    const c = $("#authPasswordConfirm"); if (c) c.value = "";
    authForm.dataset.resetToken = resetTokenFromHash();
  } else if (!register && pass) {
    pass.placeholder = "Mật khẩu";
  }
  const authSubmit = $("#authSubmit");
  if (authSubmit) {
    authSubmit.disabled = false;
    authSubmit.textContent = register ? "Tạo tài khoản" : forgot ? "Gửi link đặt lại mật khẩu" : reset ? "Đặt lại mật khẩu" : "Đăng nhập";
  }
  $("#authPassword").autocomplete = register || reset ? "new-password" : "current-password";
  const forgotLink = $("#forgotPasswordLink");
  if (forgotLink) {
    forgotLink.textContent = (forgot || reset) ? "Quay lại đăng nhập" : "Quên mật khẩu?";
    forgotLink.onclick = () => { location.hash = "#"; setAuthMode("login"); openAuth("login"); };
    forgotLink.classList.toggle("hidden", reset);
  }
  const status = $("#authStatus");
  if (status && authForm.dataset.mode !== mode) status.textContent = "";
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

async function login(email, password) {
  const data = await api("/auth/login", { method: "POST", body: { email, password } });
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
async function register(email, username, password) {
  const data = await api("/auth/register", { method: "POST", body: { email, username, password } });
  setToken(data.access_token || "", data.user || { email, username, nickname: username });
  sessionStorage.removeItem("doraemon_features_shown_this_login");
  sessionStorage.removeItem("doraemon_collocation_shown_this_login");
  sessionStorage.removeItem("doraemon_phrasal_verb_shown_this_login");
  state.showCollocationOnFirstChat = true;
  if (!state.token) { await login(email, password); return; }
  await loadMe(); closeAuth(); toast("Tạo tài khoản thành công", "success"); location.hash = "#/app";
}
async function forgotPassword(email) {
  const data = await api("/auth/forgot-password", { method: "POST", body: { email } });
  return data?.message || "Nếu email này tồn tại trong hệ thống, Doraemon sẽ gửi hướng dẫn đặt lại mật khẩu.";
}
async function resetPassword(token, newPassword) {
  const data = await api("/auth/reset-password", { method: "POST", body: { token, new_password: newPassword } });
  return data?.message || "Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.";
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
  ensureAppNavigationStyles();
  $("#siteNav").classList.add("app-mode");
  const userName = escapeHtml(state.profile?.nickname || "bạn");
  const initial = escapeHtml((state.profile?.nickname || "D").slice(0,1).toUpperCase());
  const sub = state.__me?.subscription || {};
  const courseName = escapeHtml(state.selectedCourseName || (state.courses[0]?.name || "Chưa chọn khóa học"));
  appView.innerHTML = `
    <div class="study-shell">
      <header class="study-topbar">
        <a href="#" class="study-brand" aria-label="Về trang chủ Doraemon"><div class="logo-icon">D</div><div><strong>Doraemon</strong><span>Gia sư đồng hành cùng bạn</span></div></a>
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
  if (type === "vocabulary_item") {
    const x=block.vocabulary||{}; const image=x.image_url||""; const pronunciationLabel=x.is_english===false?"Cách đọc":"Phiên âm";
    return `<div class="daily-vocabulary-card">
      <div class="daily-vocabulary-progress">📚 ${Number(x.index||0)+1}/${Number(x.total||1)}</div>
      <div class="daily-vocabulary-word"><strong>Từ vựng:</strong> ${escapeHtml(x.writing||"")}</div>
      ${x.pronunciation?`<div class="daily-vocabulary-field"><strong>${pronunciationLabel}:</strong> ${escapeHtml(x.pronunciation)}</div>`:""}
      ${x.meaning?`<div class="daily-vocabulary-field"><strong>Nghĩa:</strong> ${escapeHtml(x.meaning)}</div>`:""}
      ${x.example?`<div class="daily-vocabulary-field daily-vocabulary-example"><strong>Ví dụ:</strong> ${escapeHtml(x.example)}</div>`:""}
      ${image?`<img class="daily-vocabulary-image" src="${escapeHtml(resolveMediaUrl(image))}" alt="Ảnh minh hoạ cho ${escapeHtml(x.writing||'Từ vựng')}" loading="eager" onerror="this.classList.add('image-error')">`:""}
    </div>`;
  }
  if (type === "choice") {
    const options = Array.isArray(block.options) ? block.options : [];
    return `<div class="choice-row">${options.map((o,i)=>`<button class="chat-choice ${i===0?"primary":""}" data-action="${escapeHtml(o.action || "")}" data-label="${escapeHtml(o.label || "")}" data-display="${escapeHtml(o.display_label || o.label || "")}">${escapeHtml(o.label || "Lựa chọn")}</button>`).join("")}</div>`;
  }
  if (type === "study_plan_lesson") {
    const lesson = String(block.lesson || "").trim();
    const contentType = String(block.content_type || "Giáo trình").trim();
    if (!lesson) return "";
    return `<div class="study-plan-lesson-action"><button type="button" class="chat-choice primary study-plan-lesson-button" data-plan-course-id="${escapeHtml(block.course_id ?? "")}" data-plan-content-type="${escapeHtml(contentType)}" data-plan-lesson="${escapeHtml(lesson)}" data-plan-topic="${escapeHtml(block.topic || "")}">🎯 ${escapeHtml(block.label || "Học theo lộ trình")}</button></div>`;
  }
  if (type === "html") return block.html || "";
  return `<div class="chat-text">${sanitizeRichText(block.text || "")}</div>`;
}
function renderMessages() {
  const list = $("#chatMessages"); if (!list) return;
  list.innerHTML = state.messages.map((m, idx)=>`<div class="chat-row ${m.role==='user'?'user':'model'}"><div class="chat-avatar ${m.role==='model'?'chat-avatar-doraemon':''}">${m.role==='user'?'Bạn':'<img src="assets/doraemon-teacher.png" alt="Doraemon" loading="lazy">'}</div><div class="chat-bubble"><div class="chat-role">${m.role==='user'?'Bạn':'Doraemon'}</div>${m.blocks.map(b=>renderBlock({...b,messageIndex:idx})).join("")}</div></div>`).join("");
  $$(".chat-choice", list).forEach(btn => btn.addEventListener("click", () => { const action=btn.dataset.action; if(action==="phrasing_next"){ startNextPhrasing(); return; } sendAction(action, btn.dataset.display || btn.dataset.label); }));
  $$(".study-plan-lesson-button", list).forEach(btn => btn.addEventListener("click", async () => {
    const lesson = String(btn.dataset.planLesson || "").trim();
    if (!lesson) return;
    const contentType = String(btn.dataset.planContentType || "Giáo trình").trim() || "Giáo trình";
    const topic = String(btn.dataset.planTopic || "").trim();
    const courseId = Number(btn.dataset.planCourseId || 0);
    if (courseId && Number(state.selectedCourseId || 0) !== courseId) {
      state.selectedCourseId = courseId;
      try { await api("/learning/select-course", {method:"POST", body:{course_id:courseId}}); } catch {}
    }
    btn.disabled = true;
    try {
      await startLesson(lesson, contentType, topic);
    } finally {
      btn.disabled = false;
    }
  }));
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
    if (!action && state.activeFeature && state.activeFeatureItem && effectivePrompt.trim()) {
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
  ensureStudyChatLayoutStyles();
  el.innerHTML = `<div class="study-grid">
    <aside class="study-library page-card"><div class="study-library-head"><div><span class="section-label">NỘI DUNG HỌC</span><h2>${escapeHtml(state.selectedCourseName||"Khóa học")}</h2></div><span class="content-count">Đang học</span></div><button class="tutor-launch-card" id="freeTutorBtn"><span class="tutor-launch-avatar" aria-hidden="true"><img src="assets/doraemon-teacher.png" alt="Doraemon" loading="lazy"></span><span class="tutor-launch-copy"><strong>Trò chuyện cùng gia sư</strong><small>Doraemon sẽ đồng hành và giúp cậu cải thiện những điểm còn yếu.</small></span><span class="tutor-launch-arrow">→</span></button><div class="study-library-list"><div class="loading">Đang tải nội dung…</div></div><div class="library-note">💡 Chọn bài để Doraemon mở đúng ngữ cảnh học. Trạng thái chi tiết của Giáo trình nằm trong menu <b>Thông tin người học → Giáo trình</b>.</div></aside>
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
      const locked=Boolean(r.locked);
      return `<button class="lesson-card compact ${locked?'locked':''}" data-lesson="${escapeHtml(r.lesson)}" data-type="${escapeHtml(actualType)}" data-topic="${escapeHtml(r.topic||"")}" data-status="${escapeHtml(st.cls)}" data-locked="${locked?'1':'0'}" ${locked?'aria-disabled="true"':''} style="${locked?'opacity:.58;cursor:not-allowed;':''}"><div class="lesson-card-copy"><strong>${escapeHtml(r.lesson)}</strong>${r.topic?`<small>${escapeHtml(r.topic)}</small>`:""}</div><span class="lesson-status-tag ${locked?'not-started':st.cls}">${locked?'🔒 Đã khóa':st.label}</span><span class="lesson-card-open">${locked?'🔒':'Học →'}</span></button>`;
    }).join("")}</div>`).join("");
    ensureLibraryFilterStyles();
    const typeFilterOptions=types.map(t=>`<label class="library-filter-option"><input type="checkbox" value="${escapeHtml(t)}"> <span>${escapeHtml(t)}</span></label>`).join("");
    const statusOptions=[
      ["not-started","Chưa học"],
      ["in-progress","Đang học dở"],
      ["completed","Đã học"]
    ].map(([value,label])=>`<label class="library-filter-option"><input type="checkbox" value="${escapeHtml(value)}"> <span>${escapeHtml(label)}</span></label>`).join("");
    const makeMultiFilter=(id,label,allLabel,options)=>`<div class="library-filter"><label>${escapeHtml(label)}</label><div class="library-filter-multi" id="${id}" data-filter-key="${id.includes("Type")?"type":"status"}"><button type="button" class="library-filter-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="library-filter-label">Tất cả</span><span class="library-filter-chevron">▾</span></button><div class="library-filter-menu" role="listbox"><label class="library-filter-option all-option"><input type="checkbox" value="" checked> <span>${escapeHtml(allLabel)}</span></label>${options}</div></div></div>`;
    const libraryHtml = `<div class="study-library-head"><div><span class="section-label">NỘI DUNG HỌC</span><h2>${escapeHtml(state.selectedCourseName||"Khóa học")}</h2></div><span class="content-count">${docs.length} mục</span></div><button class="tutor-launch-card" id="freeTutorBtn"><span class="tutor-launch-avatar" aria-hidden="true"><img src="assets/doraemon-teacher.png" alt="Doraemon" loading="lazy"></span><span class="tutor-launch-copy"><strong>Trò chuyện cùng gia sư</strong><small>Doraemon sẽ đồng hành và giúp cậu cải thiện những điểm còn yếu.</small></span><span class="tutor-launch-arrow">→</span></button><div class="library-filters">${makeMultiFilter("libraryTypeFilter","Loại nội dung","Tất cả loại nội dung",typeFilterOptions)}${makeMultiFilter("libraryStatusFilter","Trạng thái học","Tất cả trạng thái",statusOptions)}</div><div class="study-library-list">${sections || `<div class="empty-state">Chưa có nội dung được cấp quyền.</div>`}<div id="libraryFilterEmpty" class="library-filter-empty" style="display:none">Không có bài nào khớp với bộ lọc hiện tại.</div></div><div class="library-note">💡 Chọn bài để Doraemon mở đúng ngữ cảnh học. Dùng bộ lọc phía trên để tìm nhanh theo loại nội dung hoặc trạng thái học.</div>`;
    $(".study-library").innerHTML=libraryHtml;
  } catch (e) {
    $(".study-library").innerHTML = `<div class="study-library-head"><div><span class="section-label">NỘI DUNG HỌC</span><h2>${escapeHtml(state.selectedCourseName||"Khóa học")}</h2></div></div><div class="study-library-list"><div class="empty-state error">${escapeHtml(e.message)}</div></div>`;
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
  const getCheckedValues=(control)=>new Set($$("input[type=checkbox]:checked",control).map(x=>String(x.value||"")).filter(Boolean));
  const updateMultiFilterLabel=(control)=>{
    if(!control) return;
    const checked=[...$$('input[type="checkbox"]',control)].filter(x=>x.checked && x.value);
    const label=control.querySelector(".library-filter-label");
    if(label) label.textContent=checked.length===0?"Tất cả":checked.length===1?checked[0].parentElement?.querySelector("span")?.textContent||"1 đã chọn":`${checked.length} đã chọn`;
    const all=control.querySelector('input[type="checkbox"][value=""]');
    if(all) all.checked=checked.length===0;
  };
  const setupMultiFilter=(control)=>{
    if(!control) return;
    const trigger=control.querySelector(".library-filter-trigger");
    const all=control.querySelector('input[type="checkbox"][value=""]');
    const options=$$(".library-filter-menu input[type=checkbox]",control);
    trigger?.addEventListener("click",e=>{
      e.stopPropagation();
      const isOpen=control.classList.toggle("open");
      trigger.setAttribute("aria-expanded",isOpen?"true":"false");
      $$(".library-filter-multi.open").forEach(other=>{if(other!==control){other.classList.remove("open");other.querySelector(".library-filter-trigger")?.setAttribute("aria-expanded","false");}});
    });
    all?.addEventListener("change",()=>{
      if(all.checked) options.forEach(x=>{if(x!==all)x.checked=false;});
      updateMultiFilterLabel(control);
      applyLibraryFilters();
    });
    options.filter(x=>x!==all).forEach(x=>x.addEventListener("change",()=>{
      if(x.checked && all) all.checked=false;
      updateMultiFilterLabel(control);
      applyLibraryFilters();
    }));
    updateMultiFilterLabel(control);
  };
  setupMultiFilter(typeFilter);
  setupMultiFilter(statusFilter);
  const closeLibraryFilters=(e)=>{
    if(e.target.closest(".library-filter-multi")) return;
    $$(".library-filter-multi.open").forEach(control=>{
      control.classList.remove("open");
      control.querySelector(".library-filter-trigger")?.setAttribute("aria-expanded","false");
    });
  };
  if(window.__doraemonLibraryFilterOutsideHandler) document.removeEventListener("click",window.__doraemonLibraryFilterOutsideHandler);
  window.__doraemonLibraryFilterOutsideHandler=closeLibraryFilters;
  document.addEventListener("click",closeLibraryFilters);
  const applyLibraryFilters=()=>{
    const typesSelected=getCheckedValues(typeFilter);
    const statusesSelected=getCheckedValues(statusFilter);
    let visibleCount=0;
    $$(".lesson-section",$(".study-library")).forEach(section=>{
      let sectionVisible=0;
      $$(".lesson-card.compact",section).forEach(card=>{
        const type=String(card.dataset.type||"");
        const status=String(card.dataset.status||"");
        const typeOk=!typesSelected.size || typesSelected.has(type);
        const statusOk=!statusesSelected.size || statusesSelected.has(status);
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
  applyLibraryFilters();
  const input=$("#chatInput"); const send=()=>{const v=input.value.trim(); if(!v)return; input.value=""; autoGrow(input); if(state.activeFeature==="phrasing" && state.phrasingTask){ sendPhrasingAnswer(v); return; } sendChat(v);}; $("#sendBtn").onclick=send; input.addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }); input.addEventListener("input",()=>autoGrow(input));
  $$(".lesson-card", el).forEach(x=>x.onclick=()=>{if(x.dataset.locked==="1"){toast("🔒 Bài này đang bị khóa trong gói Free.","error");return;} startLesson(x.dataset.lesson,x.dataset.type,x.dataset.topic||"");});
  if (!state.messages.length && !state.activeFeature) await startWelcome();
}
function autoGrow(el){el.style.height="auto";el.style.height=Math.min(160,el.scrollHeight)+"px";}
async function renderCatalog(el){
  const data=await api(`/learning/catalog${state.selectedCourseId ? `?course_id=${encodeURIComponent(state.selectedCourseId)}` : ""}`);
  const docs=data.documents||[]; const grouped={}; docs.forEach(r=>{const ct=r.content_type||"Nội dung"; const lesson=r.lesson||""; if(!lesson)return;(grouped[ct]??=[]).push(r);});
  const types=["Giáo trình","Từ vựng","Ngữ pháp","Bài tập","Truyện đọc",...Object.keys(grouped).filter(x=>!["Giáo trình","Từ vựng","Ngữ pháp","Bài tập","Truyện đọc"].includes(x))];
  const freePlan=String(data.subscription?.plan||state.__me?.subscription?.plan||"Free").toLowerCase()==="free";
  const renderLesson=r=>{const locked=Boolean(r.locked);return `<button class="lesson-card ${locked?'locked':''}" data-lesson="${escapeHtml(r.lesson)}" data-type="${escapeHtml(r.content_type)}" data-topic="${escapeHtml(r.topic||"")}" data-locked="${locked?'1':'0'}" ${locked?'aria-disabled="true"':''} style="${locked?'opacity:.58;cursor:not-allowed;':''}"><div><strong>${escapeHtml(r.lesson)}</strong><small>${escapeHtml(r.topic||"")}</small></div><span>${locked?'🔒 Khóa':'Học →'}</span></button>`;};
  el.innerHTML=`<div class="page-grid"><section><div class="page-card"><div class="card-head"><div><strong>Nội dung được cấp quyền</strong><small>${docs.length?`${docs.length} bản ghi nội dung`:"Chưa có nội dung"}</small></div><button class="small-button" id="catalogRefresh">↻ Làm mới</button></div>${docs.length?types.filter(t=>grouped[t]?.length).map(t=>`<div class="content-group"><div class="group-head"><span>${iconType(t)} ${escapeHtml(t)}</span><small>${new Set(grouped[t].map(x=>`${x.lesson}|${x.topic||""}`)).size} bài</small></div>${uniqRows(grouped[t]).map(renderLesson).join("")}</div>`).join(""): `<div class="empty-state">${data.requires_course_selection?"Hãy chọn khóa học ở góc phải.":"Tài khoản chưa có nội dung khóa học được cấp quyền."}</div>`}</div></section><aside class="page-card insight"><h3>📌 Quyền học</h3><p>${freePlan?'Gói Free: 5 bài cho mỗi loại nội dung. Các bài còn lại được khóa.':'Gói hiện tại: học toàn bộ khóa học và tối đa 200 request GenAI mỗi ngày.'}</p><div class="stat-grid"><div><strong>${docs.length}</strong><span>Bản ghi</span></div><div><strong>${Object.keys(grouped).length}</strong><span>Loại nội dung</span></div></div></aside></div>`;
  $("#catalogRefresh").onclick=()=>renderCatalog($("#appContent"));
  $$(".lesson-card").forEach(b=>b.onclick=()=>{if(b.dataset.locked==="1"){toast("🔒 Bài này đang bị khóa trong gói Free.","error");return;}startLesson(b.dataset.lesson,b.dataset.type,b.dataset.topic||"");});
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
      const locked=Boolean(r.locked);
      return `<button class="curriculum-row ${locked?'locked':''}" data-lesson="${escapeHtml(r.lesson||"")}" data-type="${escapeHtml(actualType)}" data-topic="${escapeHtml(r.topic||"")}" data-locked="${locked?'1':'0'}" ${locked?'aria-disabled="true"':''} style="${locked?'opacity:.58;cursor:not-allowed;':''}"><span class="curriculum-icon ${locked?'not-started':st.cls}">${locked?'🔒':st.icon}</span><span class="curriculum-main"><strong>${escapeHtml(r.lesson||"")}</strong>${r.topic?`<small>${escapeHtml(r.topic)}</small>`:""}</span><span class="curriculum-status ${locked?'not-started':st.cls}">${locked?'Đã khóa':st.label}</span><span class="curriculum-open">${locked?'🔒':'Học →'}</span></button>`;
    }).join("");
    return `<div class="content-group curriculum-content-group"><div class="group-head"><span>${iconType(ct)} ${escapeHtml(ct)}</span><small>${rows.length} bài</small></div>${cards}</div>`;
  }).join("");

  el.innerHTML=`<section class="page-card curriculum-card"><div class="card-head"><div><strong>📖 Nội dung học</strong><small>Hiển thị tất cả loại nội dung của khóa học đang chọn</small></div><button class="small-button" id="curriculumRefresh">↻ Làm mới</button></div><div class="curriculum-summary"><div><strong>${allRows.length}</strong><span>Tổng bài</span></div><div><strong>${counts["in-progress"]}</strong><span>Đang học</span></div><div><strong>${counts.completed}</strong><span>Đã học</span></div><div><strong>${counts["not-started"]}</strong><span>Chưa học</span></div></div><div class="curriculum-list">${groupHtml||`<div class="empty-state">Chưa có nội dung nào được cấp quyền cho khóa học này.</div>`}</div></section>`;
  $("#curriculumRefresh").onclick=()=>renderCurriculum(el);
  $$(".curriculum-row",el).forEach(btn=>btn.onclick=async()=>{if(btn.dataset.locked==="1"){toast("🔒 Bài này đang bị khóa trong gói Free.","error");return;} closeLearnerPanel();await startLesson(btn.dataset.lesson,btn.dataset.type,btn.dataset.topic||"");});
}

async function renderPlan(el){const data=await api(`/learning/plan${state.selectedCourseId?`?course_id=${state.selectedCourseId}`:""}`); const plans=data.plans||[]; const plan=data.plan||null; const draft=data.draft||null; el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Lộ trình học</strong><small>${data.learning_mode==='planned'?'Đang học theo lộ trình':'Học tự do'}</small></div><button class="small-button" id="planChat">✦ Điều chỉnh bằng chat</button></div>${plans.length?plans.map(p=>`<div class="plan-card"><div class="plan-icon">🎯</div><div class="plan-main"><strong>${escapeHtml(p.goal_name||"Lộ trình")}</strong><span>${escapeHtml(p.content_type||"")} · ${escapeHtml(p.scope||"")}</span><small>Bắt đầu: ${escapeHtml(p.start_date||"—")} ${p.target_date?` · Mục tiêu: ${escapeHtml(p.target_date)}`:""}</small></div><button class="danger-button" data-delete-plan="${p.id}">Xóa</button></div>`).join(""): `<div class="empty-state">${draft?"Bạn có một lộ trình nháp. Hãy vào chat để xác nhận lộ trình.":"Chưa có lộ trình hoạt động. Hãy mở chat và chọn <b>Học theo lộ trình</b>."}</div>`}</section><aside class="page-card"><h3>📊 Trạng thái</h3><div class="stat-grid"><div><strong>${plans.length}</strong><span>Plan active</span></div><div><strong>${escapeHtml(data.learning_mode||"free")}</strong><span>Chế độ</span></div></div>${plan?`<div class="mini-note">${escapeHtml(plan.goal_name||"")}</div>`:""}</aside></div>`; $("#planChat").onclick=async()=>{state.view="chat"; closeLearnerPanel(); await renderChat($("#appContent"));}; $$("[data-delete-plan]").forEach(b=>b.onclick=async()=>{if(!confirm("Xóa lộ trình này?"))return;try{await api(`/learning/plan/${b.dataset.deletePlan}`,{method:"DELETE"});toast("Đã xóa lộ trình","success");await renderPlan($("#appContent"));}catch(e){toast(e.message,"error");}});}

async function renderReview(el){const d=await api(`/learning/review/today${state.selectedCourseId?`?course_id=${state.selectedCourseId}`:""}`);const items=d.review_items||[];const scheduled=d.scheduled_lessons||[];el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Nội dung cần ôn tập</strong><small>${items.length?`${items.length} mục đang chờ ôn`:"Chưa có mục sai để ôn"}</small></div><div class="button-row-inline"><button class="small-button" id="reviewStart">Bắt đầu ôn</button><button class="small-button" id="reviewChat">Ôn bằng chat</button></div></div>${items.length?`<div class="review-list">${items.map(x=>`<div class="review-item"><div class="review-badge">${x.item_type==='vocabulary'?'Từ':'Ngữ'}</div><div><strong>${escapeHtml(x.label||x.pattern||x.item_id)}</strong><small>${escapeHtml(x.lesson||"")} · ${escapeHtml(x.meaning||x.explanation||"")}</small></div><span>📅 ${escapeHtml(fmtDate(x.next_review_at))}</span></div>`).join("")}`:`<div class="empty-state success">✅ Hiện chưa có nội dung cần ôn. Nội dung chỉ được thêm sau khi cậu trả lời sai trong review.</div>`}</section><aside class="page-card"><h3>📆 Lịch ôn</h3>${scheduled.length?scheduled.slice(0,8).map(x=>`<div class="schedule-row"><strong>${escapeHtml(x.lesson||"Bài")}</strong><span>${escapeHtml(x.content_type||"")}</span><small>${escapeHtml(fmtDate(x.next_review_at))}</small></div>`).join(""):`<div class="empty-state">Chưa có lịch ôn.</div>`}</aside></div>`;$("#reviewStart").onclick=()=>startReviewQuiz();$("#reviewChat").onclick=()=>startReviewChat();}
async function startReviewQuiz(){const el=$("#appContent");el.innerHTML=`<section class="page-card quiz-card"><div class="card-head"><div><strong>🔄 Phiên ôn tập</strong><small>Trả lời theo đúng định dạng Doraemon yêu cầu</small></div><button class="small-button" id="quizExit">← Quay lại</button></div><div id="quizBody" class="quiz-body"><div class="loading">Đang tạo câu hỏi…</div></div></section>`;$("#quizExit").onclick=()=>renderReview(el);try{const d=await api("/learning/review/start",{method:"POST",body:{course_id:Number(state.selectedCourseId||0),max_questions:12}});const qs=d.questions||[];const sid=d.session_id;if(!qs.length){$("#quizBody").innerHTML=`<div class="empty-state success">✅ Không còn câu hỏi để ôn.</div>`;return;}let idx=0,score=0;const submit=async answer=>{if(!String(answer||"").trim())return;const q=qs[idx];try{const r=await api("/learning/review/answer",{method:"POST",body:{course_id:Number(state.selectedCourseId||0),session_id:sid,item_type:q.item_type,item_id:q.item_id,answer:String(answer).trim()}});if(r.correct)score++;const feedback=$("#quizFeedback");if(feedback){feedback.className=`quiz-feedback ${r.correct?'correct':'wrong'}`;feedback.innerHTML=(r.correct?"✅ Đúng!":"❌ Chưa đúng.")+(r.explanation?`<div>${nl2br(r.explanation)}</div>`:"");}$$('.quiz-options button').forEach(b=>b.disabled=true);if($("#quizSubmit"))$("#quizSubmit").disabled=true;setTimeout(()=>{idx++;if(idx>=qs.length){$("#quizBody").innerHTML=`<div class="quiz-finish"><div>🎉 Hoàn thành phiên ôn!</div><strong>${score}/${qs.length}</strong><p>Cậu có thể quay lại nội dung cần ôn hoặc tiếp tục học với Doraemon.</p><button class="button button-primary" id="quizDone">Xem lại</button></div>`;$("#quizDone").onclick=()=>renderReview(el);}else renderQ();},650);}catch(e){const f=$("#quizFeedback");if(f){f.className="quiz-feedback wrong";f.textContent=e.message;}}};const renderQ=()=>{const q=qs[idx];const opts=q.options||[];$("#quizBody").innerHTML=`<div class="quiz-progress">Câu ${idx+1}/${qs.length}</div><h3 class="quiz-question">${nl2br(q.question||"")}</h3>${opts.length?`<div class="quiz-options">${opts.map(o=>`<button data-opt="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join("")}</div>`:`<div class="quiz-answer"><input id="quizAnswer" placeholder="Nhập đáp án…"><button class="button button-primary" id="quizSubmit">Trả lời</button></div>`}<div id="quizFeedback" class="quiz-feedback"></div>`;$$('[data-opt]').forEach(b=>b.onclick=()=>submit(b.dataset.opt));$("#quizSubmit")?.addEventListener('click',()=>submit($("#quizAnswer")?.value));$("#quizAnswer")?.addEventListener('keydown',e=>{if(e.key==='Enter')submit($("#quizAnswer").value);});};renderQ();}catch(e){$("#quizBody").innerHTML=`<div class="empty-state error">${escapeHtml(e.message)}</div>`;}}

function phrasingResetState(){
  state.activeFeature="phrasing";
  state.activeFeatureItem=null;
  state.activeContentType="";
  state.activeLesson="";
  state.freeChatTutor=false;
  state.phrasingTask="";
}

async function launchPhrasing(options={}){
  // Phrasing is a dedicated feature session. Keep the five most recent chat turns
  // only as context for the server-generated task, then reset the visible session.
  const incomingContext = Array.isArray(options.context)
    ? options.context.slice(-5)
    : state.chatHistory.slice(-5);
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
    const d=await api("/learning/phrasing/start",{
      method:"POST",
      body:{course_id:Number(state.selectedCourseId||0),chat_history:incomingContext.slice(-5)}
    });
    state.phrasingTask=String(d.task||d.reply||"").trim();
    bubble.blocks=[{type:"text",text:d.reply||"👉 Hãy diễn đạt ý này bằng tiếng Anh nhé."}];
    if(d.reply) rememberChatTurn("model",d.reply);
    renderMessages();
  }catch(e){
    state.phrasingTask="";
    bubble.blocks=[{type:"text",text:`Không thể bắt đầu Phrasing: ${e.message}`}];
    renderMessages();
  }
}

async function sendPhrasingAnswer(answer){
  const text=String(answer||"").trim();
  if(!text || !state.phrasingTask) return;
  addChatMessage("user",textBlocksFromReply(text));
  rememberChatTurn("user",text);
  const recentHistory=state.phrasingContext.slice(-5).concat(state.chatHistory.slice(-5)).slice(-5);
  const bubble=addChatMessage("model",[{type:"typing",text:"Doraemon đang xem cách diễn đạt của cậu..."}]);
  renderMessages();
  try{
    const d=await api("/learning/phrasing/evaluate",{
      method:"POST",
      body:{course_id:Number(state.selectedCourseId||0),task:state.phrasingTask,answer:text,chat_history:recentHistory}
    });
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

async function startReviewChat(){closeLearnerPanel();state.view="chat";state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;state.chatboxNew=true;state.messages=[];state.chatHistory=[];state.activeFeature="";state.activeFeatureItem=null;await renderChat($("#appContent"));await sendAction("review_open","Mở nội dung ôn tập");}

async function renderPackages(el){
  const [me,pkgs]=await Promise.all([api("/auth/me"),api("/payments/packages")]); const sub=me.subscription||{};
  const paid=String(sub.plan||"Free").toLowerCase()!=="free"; const limit=Number(sub.daily_limit||5);
  el.innerHTML=`<div class="page-grid"><section class="page-card"><div class="card-head"><div><strong>Gói học</strong><small>Quyền học áp dụng cho toàn bộ tài khoản</small></div></div><div class="subscription-banner"><div><span>Gói hiện tại</span><strong>${escapeHtml(sub.plan||"Free")}</strong></div><div><span>Trạng thái</span><strong>${escapeHtml(sub.status||"ACTIVE")}</strong></div><div><span>Hết hạn</span><strong>${escapeHtml(sub.expires_at_vn||"Không giới hạn")}</strong></div><div><span>GenAI hôm nay</span><strong>${Number(sub.used_today||0)}/${limit}</strong></div></div><div style="margin:14px 0;padding:12px 14px;border:1px solid #e4e7ec;border-radius:10px;background:#f9fafb"><strong>${paid?'✅ Gói trả phí':'🆓 Gói Free'}</strong><div style="margin-top:5px;color:#475467">${paid?'Học toàn bộ khóa học, tối đa 200 request GenAI mỗi ngày.':'Được học tất cả khóa học, nhưng chỉ mở tối đa 5 bài cho mỗi loại nội dung. Các bài còn lại sẽ hiển thị 🔒.'}</div></div><div class="package-grid">${(pkgs.packages||[]).map(p=>`<div class="package-card"><span class="package-month">${p.months} tháng</span><h3>${escapeHtml(p.plan_name||"")}</h3><strong>${escapeHtml(p.price_display||money(p.price_vnd))}</strong>${p.qr_url?`<img src="${escapeHtml(p.qr_url)}" alt="QR thanh toán" class="qr-img">`:``}<div class="payment-code">${escapeHtml(p.payment_content||"")}</div><button class="small-button copy-payment" data-copy="${escapeHtml(p.payment_content||"")}">Sao chép nội dung</button></div>`).join("")}</div></section><aside class="page-card"><h3>🎓 Khóa học</h3>${(sub.courses||[]).length?(sub.courses||[]).map(c=>`<div class="course-entitlement"><strong>${escapeHtml(c.name||"")}</strong><span>${paid?escapeHtml(c.expires_at_vn||"Đang hiệu lực"):"Được học"}</span></div>`).join(""):`<div class="empty-state">Chưa có khóa học.</div>`}</aside></div>`; $$(".copy-payment").forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast("Đã sao chép","success");}catch{toast("Không thể sao chép tự động","error");}});
}


async function renderAdmin(el){const data=await api("/admin-chat/history?limit=200"); el.innerHTML=`<div class="page-card admin-card"><div class="card-head"><div><strong>Chat với Admin</strong><small>HTTP polling bảo đảm hoạt động cả khi WebSocket bị gián đoạn</small></div><span class="status-dot">● Đang hoạt động</span></div><div class="admin-messages" id="adminMessages">${(data.messages||[]).map(renderAdminMessage).join("")}</div><div class="admin-composer"><input id="adminInput" placeholder="Nhắn tin cho Admin…"><button class="send-button" id="adminSend">➤</button></div></div>`; const list=$("#adminMessages"); list.scrollTop=list.scrollHeight; $("#adminSend").onclick=sendAdmin; $("#adminInput").addEventListener("keydown",e=>{if(e.key==='Enter')sendAdmin();}); window.clearInterval(window.__adminPoll); window.__adminPoll=setInterval(async()=>{try{const d=await api("/admin-chat/history?limit=200");list.innerHTML=(d.messages||[]).map(renderAdminMessage).join("");list.scrollTop=list.scrollHeight;}catch{}},3500);}
function renderAdminMessage(m){return `<div class="admin-msg ${m.sender==='user'?'me':''}"><div class="admin-msg-author">${m.sender==='user'?'Bạn':'Admin'}</div><div class="admin-msg-body">${nl2br(m.message||"")}</div><small>${escapeHtml(fmtDate(m.created_at))}</small></div>`;}
async function sendAdmin(){const input=$("#adminInput"); const msg=input?.value.trim(); if(!msg)return; input.value=""; try{await api("/admin-chat/send",{method:"POST",body:{client_message_id:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`),message:msg}});const d=await api("/admin-chat/history?limit=200");$("#adminMessages").innerHTML=(d.messages||[]).map(renderAdminMessage).join("");$("#adminMessages").scrollTop=$("#adminMessages").scrollHeight;}catch(e){toast(e.message,"error");}}

async function renderSettings(el){
  const me=state.__me||await api("/auth/me");
  let settings={review_interval_days:1};
  try{settings=await api("/learning/review/settings");}catch{}
  el.innerHTML=`<div class="settings-grid"><section class="page-card"><div class="card-head"><div><strong>Cấu hình học tập</strong><small>Thiết lập các tùy chọn học tập chính</small></div></div><label class="setting-row"><div><strong>Khóa học đang học</strong><small>Chat và review sẽ dùng course này</small></div><select id="settingsCourse">${(me.subscription?.courses||[]).map(c=>`<option value="${c.course_id}" ${String(c.course_id)===String(state.selectedCourseId)?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}</select></label><label class="setting-row"><div><strong>Ôn tập lại sau</strong><small>Số ngày sau khi hoàn thành nội dung</small></div><input id="reviewDays" type="number" min="1" max="365" value="${Number(settings.review_interval_days||1)}"></label><div class="button-row"><button class="button button-primary" id="saveSettings">Lưu cấu hình</button><button class="button button-secondary" id="resetLearning">🗑 Xóa lịch sử học</button></div></section><aside class="page-card"><h3>👤 Tài khoản</h3><div class="profile-line"><span>Username</span><strong>${escapeHtml(me.user?.username||me.user?.nickname||"")}</strong></div><div class="profile-line"><span>Email</span><strong>${escapeHtml(me.user?.email||"")}</strong></div><div class="profile-line"><span>Gói</span><strong>${escapeHtml(me.subscription?.plan||"Free")}</strong></div></aside></div>`;
  $("#saveSettings").onclick=async()=>{try{const cid=Number($("#settingsCourse").value||0); if(cid){const d=await api("/learning/select-course",{method:"POST",body:{course_id:cid}});state.selectedCourseId=d.course_id;state.selectedCourseName=d.course_name;} await api("/learning/review/settings",{method:"POST",body:{review_interval_days:Number($("#reviewDays").value||1)}}); toast("Đã lưu cấu hình","success"); closeLearnerPanel(); await renderChat($("#appContent"));}catch(e){toast(e.message,"error");}};
  $("#resetLearning").onclick=async()=>{if(!confirm("Xóa toàn bộ tiến độ, review và lộ trình học? Tài khoản và gói học không bị xóa."))return;try{await api("/learning/reset",{method:"POST"});toast("Đã xóa lịch sử học","success");state.chatboxId=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;state.chatboxNew=true;state.messages=[];state.chatHistory=[];state.activeFeature="";state.activeFeatureItem=null;state.view="chat"; closeLearnerPanel(); await renderChat($("#appContent"));}catch(e){toast(e.message,"error");}};
}

async function boot(){
  ensureAuthExtras();
  $$("[data-close-modal]").forEach(x=>x.addEventListener("click",closeAuth));
  $$("[data-auth-mode]").forEach(x=>x.addEventListener("click",()=>setAuthMode(x.dataset.authMode)));
  $("#navAuthBtn").onclick=()=>state.token?location.hash="#/app":openAuth("login");
  $("#heroAuthBtn").onclick=()=>openAuth("register");
  authForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const mode=authForm.dataset.mode||"login";
    const email=$("#authPhone").value.trim();
    const username=$("#authNickname").value.trim();
    const password=$("#authPassword").value;
    const status=$("#authStatus");
    status.textContent="Đang xử lý…";
    try {
      if(mode==='register') {
        await register(email,username,password);
      } else if(mode==='forgot') {
        if(!email) throw new Error("Vui lòng nhập email đã đăng ký.");
        if(!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email chưa đúng định dạng.");
        const submit = $("#authSubmit");
        if(submit) submit.disabled = true;
        try {
          const msg = await forgotPassword(email);
          status.setAttribute("role", "status");
          status.textContent = `✅ ${msg || "Yêu cầu đặt lại mật khẩu đã được gửi."} Hãy kiểm tra hộp thư đến và cả mục Spam/Thư rác.`;
        } finally {
          if(submit) submit.disabled = false;
        }
      } else if(mode==='reset') {
        const confirm=$("#authPasswordConfirm")?.value || "";
        const token=authForm.dataset.resetToken || resetTokenFromHash();
        if(!token) throw new Error("Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
        if(password.length<6) throw new Error("Mật khẩu mới phải có ít nhất 6 ký tự.");
        if(password!==confirm) throw new Error("Hai lần nhập mật khẩu chưa giống nhau.");
        status.textContent=await resetPassword(token,password);
        setTimeout(()=>{ location.hash="#"; openAuth("login"); const s=$("#authStatus"); if(s) s.textContent="Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới."; },300);
      } else {
        await login(email,password);
      }
    } catch(err) { status.textContent=err.message; }
  });
  setAuthMode("login");
  window.addEventListener("hashchange",()=>{
    if(isResetPasswordRoute()) {
      if(state.token) { setToken("", null); state.token=""; state.profile=null; }
      renderLanding();
      openAuth("reset");
      return;
    }
    if(route()==="app" && state.token)initApp();else renderLanding();
  });
  if(isResetPasswordRoute()) { if(state.token) { setToken("", null); state.token=""; state.profile=null; } renderLanding(); openAuth("reset"); }
  else if(route()==="app" && state.token) await initApp(); else renderLanding();
}
document.addEventListener("DOMContentLoaded",boot);
