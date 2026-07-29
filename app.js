// app.js — 화면 흐름과 볼트 상태 관리

const AUTO_LOCK_MS = 5 * 60 * 1000;      // 무동작 5분 후 잠금
const BG_LOCK_MS = 60 * 1000;            // 백그라운드 60초 후 잠금
const CLIPBOARD_CLEAR_MS = 15 * 1000;    // 복사 15초 후 클립보드 삭제

const state = {
  vaultKey: null,     // 메모리에만 존재. 잠그면 null
  items: [],          // [{id, data, updatedAt}] 복호화된 상태 (잠금 해제 중에만)
  editingId: null,
  filter: "all",      // 종류 필터: all | fav | <type>
  vaultName: "",      // 금고 표시 이름 (암호화 저장, 잠금 해제 후에만)
};

// 금고 이름 로드/저장 (암호화 prefs)
async function loadPrefs() {
  state.vaultName = "";
  try {
    const rec = await vaultDB.getPrefs();
    if (rec && rec.ct) {
      const p = await decryptItem(state.vaultKey, rec);
      state.vaultName = p.vaultName || "";
    }
  } catch (e) { /* prefs 없거나 실패 → 기본값 */ }
}
async function saveVaultName(name) {
  const enc = await encryptItem(state.vaultKey, { vaultName: name });
  await vaultDB.setPrefs(enc);
  state.vaultName = name;
  updateHeaderName();
}
function updateHeaderName() {
  $("#vault-name").textContent = state.vaultName || "Goblin Keeper";
}

const $ = (sel) => document.querySelector(sel);

// ---------- 토스트 ----------
let toastTimer = null;
function showToast(msg) {
  const t = $("#toast");
  $("#toast-text").textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

// 제목 → 배지 글자/색 (일관된 해시 색상)
const BADGE_COLORS = ["#2DB400", "#4285F4", "#F5B400", "#7A5CB0", "#E50914", "#2AC1BC", "#E67E22", "#16A085"];
function badgeFor(title) {
  const t = (title || "?").trim();
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return { letter: t[0] ? t[0].toUpperCase() : "?", color: BADGE_COLORS[h % BADGE_COLORS.length] };
}

// ---------- 화면 전환 ----------
function showScreen(name) {
  for (const s of document.querySelectorAll(".screen"))
    s.classList.toggle("active", s.id === `screen-${name}`);
}

async function boot() {
  const meta = await vaultDB.getMeta();
  if (!meta) { showScreen("setup"); return; }
  showScreen("unlock");
  await refreshBioButton();
}

// 잠금 해제된 상태에서만 호출. 모든 항목을 복호화해 메모리에 적재
async function loadAllItems() {
  const records = await vaultDB.getAllItems();
  state.items = [];
  for (const rec of records) {
    try {
      const data = normalizeItem(await decryptItem(state.vaultKey, rec));
      state.items.push({ id: rec.id, data, updatedAt: rec.updatedAt });
    } catch (e) {
      // 개별 항목이 손상돼도 입장 자체는 막지 않는다 (해당 항목만 건너뜀)
      console.warn("항목 복호화 실패, 건너뜀:", rec.id);
    }
  }
}

// ---------- 볼트 생성 ----------
async function handleSetup(e) {
  e.preventDefault();
  const pw = $("#setup-pw").value;
  const pw2 = $("#setup-pw2").value;
  const err = $("#setup-error");
  err.textContent = "";
  if (pw.length < 12) { err.textContent = t("err.pwShort"); return; }
  if (pw !== pw2) { err.textContent = t("err.pwMismatch"); return; }

  setBusy("#setup-submit", true);
  try {
    const meta = await createVaultMeta(pw);
    await vaultDB.setMeta(meta);
    state.vaultKey = await unlockVault(pw, meta);
    state.items = [];
    enterMain();
  } finally {
    setBusy("#setup-submit", false);
    $("#setup-pw").value = ""; $("#setup-pw2").value = "";
  }
}

// ---------- 잠금 해제 ----------
async function handleUnlock(e) {
  e.preventDefault();
  const pw = $("#unlock-pw").value;
  const err = $("#unlock-error");
  err.textContent = "";
  setBusy("#unlock-submit", true);
  try {
    const meta = await vaultDB.getMeta();
    let key;
    try {
      key = await unlockVault(pw, meta); // 오직 이 단계 실패 = 암구호 오류
    } catch {
      err.textContent = t("err.wrongPw");
      return;
    }
    state.vaultKey = key;
    await loadAllItems(); // 개별 항목 실패는 내부에서 건너뜀 → 입장은 됨
    await loadPrefs();
    enterMain();
  } finally {
    setBusy("#unlock-submit", false);
    $("#unlock-pw").value = "";
  }
}

// ---------- 생체인증 잠금 해제 ----------
async function refreshBioButton() {
  const bio = await vaultDB.getBio();
  $("#btn-bio-unlock").style.display = bio && bioSupported() ? "block" : "none";
}

async function handleBioUnlock() {
  const err = $("#unlock-error");
  err.textContent = "";
  try {
    const bio = await vaultDB.getBio();
    if (!bio) return;
    state.vaultKey = await bioUnlock(bio);
    await loadAllItems();
    await loadPrefs();
    enterMain();
  } catch (e) {
    if (e.name === "NotAllowedError")
      err.textContent = t("err.bioCancel");
    else
      err.textContent = t("err.bioFail");
  }
}

function enterMain() {
  $("#search").value = "";
  state.filter = "all";
  bannerDismissed = false;
  updateHeaderName();
  renderList();
  renderBackupBanner();
  showScreen("main");
  resetIdleTimer();
}

// ---------- 잠금 ----------
function lockVault() {
  state.vaultKey = null;
  state.items = [];
  state.vaultName = "";
  state.editingId = null;
  closeEditor();
  $("#list").innerHTML = "";
  showScreen("unlock");
}

// ---------- 금고 초기화 (암구호 분실 시 새로 시작) ----------
async function resetVault() {
  if (!confirm(t("reset.confirm"))) return;
  await vaultDB.clearMeta();
  await vaultDB.clearItems();
  state.vaultKey = null;
  state.items = [];
  $("#unlock-pw").value = "";
  $("#unlock-error").textContent = "";
  alert(t("reset.done"));
  renderStrength("");
  showScreen("setup");
}

// ---------- 비밀번호류 / 재사용 ----------
function passwordsOf(data) {
  const f = data.fields || {};
  const out = [];
  if (f.password) out.push(f.password);
  if (f.wifiPassword) out.push(f.wifiPassword);
  return out;
}
let reusedSet = new Set();
function computeReusedSet() {
  const counts = new Map();
  for (const it of state.items)
    for (const pw of passwordsOf(it.data)) counts.set(pw, (counts.get(pw) || 0) + 1);
  reusedSet = new Set([...counts].filter(([, v]) => v >= 2).map(([k]) => k));
}
function reuseCountFor(pw, excludeId) {
  let n = 0;
  for (const it of state.items)
    if (it.id !== excludeId && passwordsOf(it.data).includes(pw)) n++;
  return n;
}

// 목록 카드의 부제·대표 복사값
function itemSubText(data) {
  const f = data.fields || {};
  switch (data.type) {
    case "login": return f.username || t("main.savedPw");
    case "email": return f.email || t("main.savedPw");
    case "card": return f.cardNumber ? "•••• " + f.cardNumber.replace(/\s/g, "").slice(-4) : t("type.card");
    case "membership": return f.memberNumber || t("type.membership");
    case "bank": return f.bankName || t("type.bank");
    case "wifi": return f.ssid || t("type.wifi");
    case "note": return (data.memo || f.body || "").slice(0, 24) || t("type.note");
    case "id": return f.idKind || t("type.id");
    default: return t("main.savedPw");
  }
}
function primaryValue(data) {
  const f = data.fields || {};
  return f.password || f.cardNumber || f.memberNumber || f.accountNumber ||
    f.wifiPassword || f.idNumber || f.body || "";
}

// ---------- 종류 필터 칩 ----------
function renderTypeFilter() {
  const wrap = $("#type-filter");
  const counts = {};
  let favCount = 0;
  for (const it of state.items) {
    counts[it.data.type] = (counts[it.data.type] || 0) + 1;
    if (it.data.fav) favCount++;
  }
  const chips = [`<button type="button" class="chip" data-filter="all">${t("filter.all")} ${state.items.length}</button>`];
  if (favCount) chips.push(`<button type="button" class="chip" data-filter="fav">★ ${t("filter.fav")} ${favCount}</button>`);
  for (const k of TYPE_ORDER)
    if (counts[k]) chips.push(`<button type="button" class="chip" data-filter="${k}">${t("type." + k)} ${counts[k]}</button>`);
  wrap.innerHTML = chips.join("");
  for (const c of wrap.querySelectorAll(".chip"))
    c.classList.toggle("active", c.dataset.filter === state.filter);
  wrap.style.display = state.items.length ? "flex" : "none";
}

// 목록 카드 하나 (제목만 표시 — 아이디는 탭해서 편집화면에서)
function renderItemLi(it) {
  const tdef = ITEM_TYPES[it.data.type] || ITEM_TYPES.login;
  const exp = itemExpiryState(it.data);
  const reused = passwordsOf(it.data).some((p) => reusedSet.has(p));
  let warn = "";
  if (exp === "expired") warn = `<span class="warn-ic danger" title="${t("warn.expired")}">${iconSvg("alert", 15)}</span>`;
  else if (exp === "soon") warn = `<span class="warn-ic gold" title="${t("warn.expirySoon")}">${iconSvg("alert", 15)}</span>`;
  if (reused) warn += `<span class="warn-ic danger" title="${t("warn.reuse")}">${iconSvg("alert", 15)}</span>`;
  const star = it.data.fav ? `<span class="fav-ic">${iconSvg("star-fill", 14)}</span>` : "";

  const li = document.createElement("li");
  li.className = "item";
  li.innerHTML = `
    <div class="badge type-badge">${iconSvg(tdef.icon, 22)}</div>
    <div class="item-main">
      <div class="item-title-row"><span class="item-title"></span>${star}${warn}</div>
    </div>
    <button class="btn-copy" title="복사">${iconSvg("copy", 19)}</button>
    <span class="ic chev">${iconSvg("chevron", 22)}</span>`;
  li.querySelector(".badge").style.background = tdef.color;
  li.querySelector(".item-title").textContent = it.data.title || "(제목 없음)";
  li.querySelector(".item-main").addEventListener("click", () => openEditor(it.id));
  li.querySelector(".btn-copy").addEventListener("click", (e) => {
    e.stopPropagation();
    copyToClipboard(primaryValue(it.data), it.data.title || t("label.password"));
  });
  return li;
}

function groupHeaderLi(type, count) {
  const li = document.createElement("li");
  li.className = "group-header";
  li.innerHTML =
    `<span class="gh-ic" style="color:${ITEM_TYPES[type].color}">${iconSvg(ITEM_TYPES[type].icon, 16)}</span>` +
    `<span>${t("type." + type)}</span><span class="gh-count">${count}</span>`;
  return li;
}

// ---------- 목록 ----------
function renderList() {
  computeReusedSet();
  const q = $("#search").value.trim().toLowerCase();
  const list = $("#list");
  list.innerHTML = "";

  const matches = (it) => {
    if (state.filter === "fav") { if (!it.data.fav) return false; }
    else if (state.filter !== "all" && it.data.type !== state.filter) return false;
    if (!q) return true;
    const hay = [it.data.title, ...Object.values(it.data.fields || {}),
      ...(it.data.custom || []).map((c) => c.label)].join(" ").toLowerCase();
    return hay.includes(q);
  };
  const byTitle = (a, b) => {
    if (!!b.data.fav !== !!a.data.fav) return a.data.fav ? -1 : 1; // 즐겨찾기 먼저
    return (a.data.title || "").localeCompare(b.data.title || "");
  };

  const filtered = state.items.filter(matches);
  $("#empty").style.display = state.items.length === 0 ? "block" : "none";
  $("#head-sub").textContent = state.items.length
    ? t("main.statusCount", { n: state.items.length })
    : t("main.statusOpen");
  renderTypeFilter();

  // "예치품" 라벨은 그룹 헤더로 대체 → 항상 숨김
  const label = document.querySelector("#screen-main .section-label");
  if (label) label.style.display = "none";

  if (state.filter === "all") {
    // 카테고리별로 묶어서 정렬
    for (const type of TYPE_ORDER) {
      const group = filtered.filter((it) => it.data.type === type).sort(byTitle);
      if (!group.length) continue;
      list.appendChild(groupHeaderLi(type, group.length));
      for (const it of group) list.appendChild(renderItemLi(it));
    }
  } else {
    // 단일 필터(종류/즐겨찾기) → 평면 목록
    for (const it of filtered.sort(byTitle)) list.appendChild(renderItemLi(it));
  }
}

// ---------- 종류 선택 (새 예치품) ----------
function openPicker() {
  const grid = $("#picker-grid");
  grid.innerHTML = TYPE_ORDER.map((k) =>
    `<button type="button" class="picker-item" data-type="${k}">
       <span class="picker-ic" style="background:${ITEM_TYPES[k].color}">${iconSvg(ITEM_TYPES[k].icon, 22)}</span>
       <span>${t("type." + k)}</span>
     </button>`).join("");
  $("#dlg-picker").showModal();
}

// ---------- 항목 편집 (종류별 동적) ----------
let editorType = "login";
let editorFav = false;
const revealedKeys = new Set(); // 이번 편집 세션에서 지문 인증 통과한 필드

// 민감정보 열람 게이트: 생체인증 → 실패/미설정 시 암구호 재입력
async function revealGate() {
  const bio = await vaultDB.getBio();
  if (bio && bioSupported()) {
    try {
      await bioAssert(bio.credentialId); // 지문/FaceID
      return true;
    } catch (e) {
      if (e.name === "NotAllowedError") return false; // 사용자가 취소
      // 그 외 실패 → 암구호로 폴백
    }
  }
  return await passwordReauth();
}

let reauthResolve = null;
function passwordReauth() {
  return new Promise((resolve) => {
    reauthResolve = resolve;
    $("#reauth-pw").value = "";
    $("#reauth-error").textContent = "";
    $("#dlg-reauth").showModal();
  });
}
async function handleReauth(e) {
  e.preventDefault();
  try {
    const meta = await vaultDB.getMeta();
    await unlockVault($("#reauth-pw").value, meta); // 암구호 검증
    $("#reauth-pw").value = "";
    if (reauthResolve) { reauthResolve(true); reauthResolve = null; }
    $("#dlg-reauth").close();
  } catch {
    $("#reauth-error").textContent = t("err.wrongPw");
  }
}

function fieldRowHtml(f) {
  const label = t("f." + f.k);
  const sensitive = f.kind === "secret";
  const mono = sensitive || f.kind === "text-mmYY" || f.kind === "text-date";
  const cls = mono ? "mono" : "";
  const bioGated = f.reveal === "bio";
  const ph = f.ph ? t(f.ph)
    : f.kind === "text-mmYY" ? t("ph.mmYY")
    : f.kind === "text-date" ? t("ph.date") : "";
  let input, actions = "";
  if (f.kind === "multiline") {
    input = `<textarea id="fld-${f.k}"></textarea>`;
  } else if (f.kind === "select-barcode") {
    input = `<select id="fld-${f.k}" class="fld-select">` +
      BARCODE_FORMATS.map((fmt) => `<option value="${fmt}">${t("bc." + fmt)}</option>`).join("") + `</select>`;
  } else {
    const type = sensitive ? "password" : "text";
    input = `<input id="fld-${f.k}" class="${cls}" type="${type}" placeholder="${ph}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />`;
    // 지문 게이트 필드는 눈 아이콘 대신 지문 아이콘으로 표시
    if (sensitive) actions += `<button type="button" data-act="eye">${iconSvg(bioGated ? "fingerprint" : "eye", 20)}</button>`;
    if (f.gen) actions += `<button type="button" data-act="gen">${iconSvg("dice", 20)}</button>`;
    actions += `<button type="button" data-act="copy">${iconSvg("copy", 19)}</button>`;
  }
  return `<div class="field" data-key="${f.k}"${bioGated ? ' data-reveal="bio"' : ""}>
    <label>${label}</label>
    <div class="field-input">${input}${actions ? `<div class="field-actions">${actions}</div>` : ""}</div>
  </div>`;
}

function renderEditorFields(type, data) {
  const wrap = $("#editor-fields");
  wrap.innerHTML = ITEM_TYPES[type].fields.map(fieldRowHtml).join("");
  for (const f of ITEM_TYPES[type].fields) {
    const el = $("#fld-" + f.k);
    if (!el) continue;
    if (f.kind === "select-barcode") el.value = data.fields[f.k] || "code128";
    else el.value = data.fields[f.k] || "";
  }
}

function addCustomRow(label, value) {
  const row = document.createElement("div");
  row.className = "custom-row";
  row.innerHTML = `
    <input class="cf-label" placeholder="${t("custom.labelPh")}" autocapitalize="off" autocorrect="off" spellcheck="false" />
    <div class="field-input">
      <input class="cf-value mono" type="password" placeholder="${t("custom.valuePh")}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
      <div class="field-actions">
        <button type="button" data-cact="eye">${iconSvg("eye", 19)}</button>
        <button type="button" data-cact="copy">${iconSvg("copy", 18)}</button>
        <button type="button" data-cact="remove">${iconSvg("trash", 18)}</button>
      </div>
    </div>`;
  row.querySelector(".cf-label").value = label || "";
  row.querySelector(".cf-value").value = value || "";
  $("#editor-custom").appendChild(row);
}

function renderBarcodePreview() {
  const box = $("#editor-barcode");
  box.innerHTML = "";
  if (editorType !== "membership") return;
  const num = ($("#fld-memberNumber")?.value || "").trim();
  const fmt = $("#fld-barcodeFormat")?.value || "code128";
  if (!num) return;
  const svg = makeBarcode(num, fmt);
  box.innerHTML = svg
    ? `<div class="barcode-box">${svg}<div class="barcode-hint">${t("barcode.hint")}</div></div>`
    : `<div class="barcode-invalid">${t("barcode.invalid")}</div>`;
}

function updateFavBtn() {
  $("#btn-fav").classList.toggle("active", editorFav);
  const ic = $("#btn-fav").firstElementChild; // .ic 스팬
  if (ic) ic.innerHTML = iconSvg(editorFav ? "star-fill" : "star", 20);
}

function updateReuseWarn(data, excludeId) {
  const warn = $("#reuse-warn");
  const pw = (data.fields || {}).password || (data.fields || {}).wifiPassword;
  const others = pw ? reuseCountFor(pw, excludeId) : 0;
  if (others >= 1) {
    $("#reuse-warn-text").textContent = t("warn.reuseFull", { n: others + 1 });
    warn.style.display = "flex";
  } else warn.style.display = "none";
}

function openEditor(id, forcedType) {
  state.editingId = id || null;
  const it = id ? state.items.find((x) => x.id === id) : null;
  const data = it ? it.data
    : { type: forcedType || "login", title: "", fav: false, fields: {}, custom: [], memo: "" };
  editorType = data.type;
  editorFav = !!data.fav;

  const tdef = ITEM_TYPES[editorType];
  const badge = $("#editor-badge");
  badge.innerHTML = iconSvg(tdef.icon, 22);
  badge.style.background = tdef.color;
  $("#editor-title").textContent = t("type." + editorType);
  $("#f-title").value = data.title || "";
  $("#f-memo").value = data.memo || "";

  renderEditorFields(editorType, data);
  $("#editor-custom").innerHTML = "";
  (data.custom || []).forEach((c) => addCustomRow(c.label, c.value));
  updateFavBtn();
  updateReuseWarn(data, state.editingId);
  renderBarcodePreview();

  $("#btn-delete").style.display = it ? "inline-block" : "none";
  $("#editor").classList.add("open");
  $("#sheet-body").scrollTop = 0;   // 항상 위에서부터
  $("#f-title").focus({ preventScroll: true });
}

function closeEditor() {
  $("#editor").classList.remove("open");
  state.editingId = null;
  revealedKeys.clear();                 // 닫으면 지문 인증 상태 초기화
  $("#f-title").value = "";
  $("#f-memo").value = "";
  $("#editor-fields").innerHTML = "";   // 복호화된 값 제거
  $("#editor-custom").innerHTML = "";
  $("#editor-barcode").innerHTML = "";
  $("#reuse-warn").style.display = "none";
}

async function saveItem(e) {
  e.preventDefault();
  if (!state.vaultKey) return;
  const fields = {};
  for (const f of ITEM_TYPES[editorType].fields) {
    const el = $("#fld-" + f.k);
    fields[f.k] = el ? el.value : "";
  }
  const custom = [];
  for (const row of document.querySelectorAll("#editor-custom .custom-row")) {
    const label = row.querySelector(".cf-label").value.trim();
    const value = row.querySelector(".cf-value").value;
    if (label || value) custom.push({ label, value });
  }
  const data = {
    type: editorType,
    title: $("#f-title").value.trim(),
    fav: editorFav,
    fields,
    custom,
    memo: $("#f-memo").value,
  };
  const id = state.editingId || crypto.randomUUID();
  const updatedAt = Date.now();
  const enc = await encryptItem(state.vaultKey, data);
  await vaultDB.putItem({ id, ...enc, updatedAt });

  const idx = state.items.findIndex((x) => x.id === id);
  if (idx >= 0) state.items[idx] = { id, data, updatedAt };
  else state.items.push({ id, data, updatedAt });

  closeEditor();
  renderList();
}

async function deleteCurrentItem() {
  if (!state.editingId) return;
  if (!confirm(t("editor.confirmDelete"))) return;
  await vaultDB.deleteItem(state.editingId);
  state.items = state.items.filter((x) => x.id !== state.editingId);
  closeEditor();
  renderList();
}

// ---------- 클립보드 (15초 후 자동 삭제) ----------
let clipboardTimer = null;
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text || "");
    showToast(t("toast.copied", { label: label || t("label.password") }));
    if (clipboardTimer) clearTimeout(clipboardTimer);
    clipboardTimer = setTimeout(() => {
      navigator.clipboard.writeText("").catch(() => {});
    }, CLIPBOARD_CLEAR_MS);
  } catch {
    alert("클립보드 복사에 실패했습니다.");
  }
}

// ---------- 백업 (암호화된 상태 그대로 내보내기/가져오기) ----------
async function exportBackup() {
  const meta = await vaultDB.getMeta();
  const items = await vaultDB.getAllItems();
  const backup = { app: "my-vault", version: 1, exportedAt: new Date().toISOString(), meta, items };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const d = new Date().toISOString().slice(0, 10);
  a.download = `my-vault-backup-${d}.json`;
  a.click();
  URL.revokeObjectURL(a.href);

  await vaultDB.setBackupInfo({ lastBackupAt: Date.now() });
  bannerDismissed = true;
  renderBackupBanner();
  renderBackupStatus();
}

// ---------- 백업 리마인더 배너 / 상태 ----------
const BACKUP_REMIND_DAYS = 7;
let bannerDismissed = false;

async function renderBackupBanner() {
  const banner = $("#backup-banner");
  const info = await vaultDB.getBackupInfo();
  const last = info?.lastBackupAt;
  const DAY = 86400000;
  let msg = null;
  if (!last) {
    msg = t("banner.never");
  } else {
    const days = Math.floor((Date.now() - last) / DAY);
    if (days >= BACKUP_REMIND_DAYS) msg = t("banner.daysAgo", { n: days });
  }
  if (msg && !bannerDismissed) {
    $("#backup-banner-text").textContent = msg;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

async function renderBackupStatus() {
  const info = await vaultDB.getBackupInfo();
  const el = $("#backup-status");
  if (!el) return;
  if (info?.lastBackupAt) {
    el.textContent = new Date(info.lastBackupAt).toLocaleString(localeTag());
  } else {
    el.textContent = t("settings.backupNever");
  }
}

async function importBackup(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    alert(t("import.invalidRead")); return;
  }
  if (backup.app !== "my-vault" || !backup.meta || !Array.isArray(backup.items)) {
    alert(t("import.invalidFormat")); return;
  }
  // 메타(암호화 설정) 검증: 조작·손상된 파일이 잠금 해제 시 앱을 멈추지 않도록
  const m = backup.meta;
  const okIter = Number.isInteger(m.iterations) &&
    m.iterations >= 100000 && m.iterations <= 10000000;
  const okStrings = typeof m.salt === "string" &&
    typeof m.wrapIv === "string" && typeof m.wrappedVaultKey === "string";
  if (!okIter || !okStrings) {
    alert(t("import.badMeta")); return;
  }
  if (!confirm(t("import.confirm", { n: backup.items.length }))) return;

  await vaultDB.setMeta(backup.meta);
  await vaultDB.clearItems();
  for (const rec of backup.items) await vaultDB.putItem(rec);
  // 복원된 볼트는 볼트키가 달라 기존 생체인증 레코드가 무효 → 제거 후 재등록 필요
  await vaultDB.deleteBio();
  alert(t("import.done"));
  lockVault();
}

// ---------- 마스터 비밀번호 변경 ----------
async function changeMasterPassword(e) {
  e.preventDefault();
  const oldPw = $("#cp-old").value;
  const newPw = $("#cp-new").value;
  const newPw2 = $("#cp-new2").value;
  const err = $("#cp-error");
  err.textContent = "";
  if (newPw.length < 12) { err.textContent = t("cp.errShort"); return; }
  if (newPw !== newPw2) { err.textContent = t("cp.errMismatch"); return; }
  setBusy("#cp-submit", true);
  try {
    const meta = await vaultDB.getMeta();
    const newMeta = await rewrapVaultMeta(oldPw, newPw, meta);
    await vaultDB.setMeta(newMeta);
    alert(t("cp.success"));
    $("#dlg-changepw").close();
  } catch {
    err.textContent = t("cp.errWrong");
  } finally {
    setBusy("#cp-submit", false);
    $("#cp-old").value = ""; $("#cp-new").value = ""; $("#cp-new2").value = "";
  }
}

// ---------- 생체인증 설정 (켜기/끄기) ----------
async function renderBioSettings() {
  const wrap = $("#bio-settings");
  if (!bioSupported()) {
    wrap.innerHTML = `<p class="hint">${t("settings.bioUnsupported")}</p>`;
    return;
  }
  const bio = await vaultDB.getBio();
  if (bio) {
    wrap.innerHTML = `<button id="btn-bio-off" class="btn-danger-outline">${t("settings.bioOff")}</button>`;
    $("#btn-bio-off").addEventListener("click", disableBio);
  } else {
    wrap.innerHTML = `<button id="btn-bio-on" class="btn-ghost">${t("settings.bioOn")}</button>`;
    $("#btn-bio-on").addEventListener("click", () => {
      $("#dlg-settings").close();
      $("#bio-error").textContent = "";
      $("#dlg-bio").showModal();
    });
  }
}

async function enableBio(e) {
  e.preventDefault();
  const pw = $("#bio-pw").value;
  const err = $("#bio-error");
  err.textContent = "";
  setBusy("#bio-submit", true);

  let vaultKey;
  try {
    const meta = await vaultDB.getMeta();
    vaultKey = await unlockVault(pw, meta, { extractable: true }); // 확인 겸 감쌀 키 확보
  } catch {
    err.textContent = t("err.wrongPw");
    setBusy("#bio-submit", false);
    return;
  }

  try {
    const bioRecord = await bioEnable(vaultKey);
    await vaultDB.setBio(bioRecord);
    $("#bio-pw").value = "";
    $("#dlg-bio").close();
    alert(t("bio.successOn"));
  } catch (e2) {
    if (e2.message === "PRF_UNSUPPORTED" || e2.message === "PRF_NO_RESULT")
      err.textContent = t("bio.errUnsupported");
    else if (e2.name === "NotAllowedError")
      err.textContent = t("bio.errCancel");
    else
      err.textContent = t("bio.errFail");
  } finally {
    setBusy("#bio-submit", false);
  }
}

async function disableBio() {
  if (!confirm(t("bio.confirmOff"))) return;
  await vaultDB.deleteBio();
  await renderBioSettings();
}

// ---------- 자동 잠금 ----------
let idleTimer = null;
let hiddenAt = null;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (!state.vaultKey) return;
  idleTimer = setTimeout(lockVault, AUTO_LOCK_MS);
}

document.addEventListener("visibilitychange", () => {
  if (!state.vaultKey) return;
  if (document.visibilityState === "hidden") {
    hiddenAt = Date.now();
  } else if (hiddenAt && Date.now() - hiddenAt > BG_LOCK_MS) {
    lockVault();
    hiddenAt = null;
  }
});

for (const ev of ["click", "keydown", "input"])
  document.addEventListener(ev, resetIdleTimer, { passive: true });

// ---------- 유틸 ----------
function setBusy(sel, busy) {
  const btn = $(sel);
  btn.disabled = busy;
  if (busy) {
    if (btn.dataset.html === undefined) btn.dataset.html = btn.innerHTML;
    btn.textContent = t("common.busy");
  } else if (btn.dataset.html !== undefined) {
    btn.innerHTML = btn.dataset.html;
    delete btn.dataset.html;
  }
}

// 눈 아이콘 토글 (input type 전환 + 아이콘 스왑)
// 버튼이 .ic 스팬을 가진 경우(정적)와 SVG를 직접 담은 경우(동적 필드) 모두 지원
function toggleEye(input, btn) {
  const shown = input.type === "text";
  input.type = shown ? "password" : "text";
  const holder = btn.querySelector(".ic") || btn;
  holder.innerHTML = iconSvg(shown ? "eye" : "eye-off", 20);
}

// 암구호 강도 미터 (설정 화면)
function renderStrength(pw) {
  const wrap = $("#pw-strength");
  if (!wrap) return;
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[^A-Za-z0-9]/.test(pw) || (/[A-Z]/.test(pw) && /[0-9]/.test(pw))) score++;
  const labels = ["", t("strength.weak"), t("strength.medium"), t("strength.strong")];
  const colors = ["var(--line)", "var(--danger)", "var(--gold)", "var(--success)"];
  let bars = "";
  for (let i = 0; i < 3; i++)
    bars += `<div style="flex:1;height:5px;border-radius:3px;background:${i < score ? colors[score] : "var(--line)"}"></div>`;
  wrap.innerHTML = bars +
    `<span style="font-size:11.5px;font-weight:700;margin-left:4px;color:${colors[score]};min-width:38px">${pw ? labels[score] : ""}</span>`;
}

// ---------- 이벤트 바인딩 ----------
document.addEventListener("DOMContentLoaded", () => {
  $("#form-setup").addEventListener("submit", handleSetup);
  $("#form-unlock").addEventListener("submit", handleUnlock);
  $("#form-editor").addEventListener("submit", saveItem);
  $("#btn-add").addEventListener("click", openPicker);
  $("#btn-lock").addEventListener("click", () => { if (confirm(t("lock.confirm"))) lockVault(); });
  $("#btn-close-editor").addEventListener("click", closeEditor);
  $("#btn-delete").addEventListener("click", deleteCurrentItem);
  $("#search").addEventListener("input", renderList);

  // 종류 선택 → 편집 열기
  $("#picker-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".picker-item");
    if (!btn) return;
    $("#dlg-picker").close();
    openEditor(null, btn.dataset.type);
  });

  // 종류 필터 칩
  $("#type-filter").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.filter = chip.dataset.filter;
    renderList();
  });

  // 편집: 동적 필드 액션 (눈/생성/복사) + 바코드 실시간 갱신
  const barcodeRefresh = () => { if (editorType === "membership") renderBarcodePreview(); };
  $("#editor-fields").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const field = btn.closest(".field");
    const key = field.dataset.key;
    const input = field.querySelector("input, textarea, select");
    const act = btn.dataset.act;
    if (act === "gen") {
      input.value = generatePassword(20);
      if (input.type === "password") toggleEye(input, field.querySelector('[data-act="eye"]'));
      showToast(t("toast.genPw"));
      return;
    }
    // 지문 게이트: 보기/복사 전에 인증 (이미 통과했으면 생략)
    if (field.dataset.reveal === "bio" && !revealedKeys.has(key)) {
      const ok = await revealGate();
      if (!ok) return;
      revealedKeys.add(key);
    }
    if (act === "eye") toggleEye(input, btn);
    else if (act === "copy") copyToClipboard(input.value, t("f." + key));
  });
  $("#editor-fields").addEventListener("input", barcodeRefresh);
  $("#editor-fields").addEventListener("change", barcodeRefresh);

  // 커스텀 필드
  $("#btn-add-custom").addEventListener("click", () => addCustomRow("", ""));
  $("#editor-custom").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cact]");
    if (!btn) return;
    const row = btn.closest(".custom-row");
    const input = row.querySelector(".cf-value");
    const act = btn.dataset.cact;
    if (act === "eye") toggleEye(input, btn);
    else if (act === "copy") copyToClipboard(input.value, row.querySelector(".cf-label").value || t("label.password"));
    else if (act === "remove") row.remove();
  });

  // 즐겨찾기 토글
  $("#btn-fav").addEventListener("click", () => { editorFav = !editorFav; updateFavBtn(); });

  // 눈 아이콘 토글 (설정/잠금 화면)
  for (const btn of document.querySelectorAll(".eye-btn")) {
    btn.addEventListener("click", () => toggleEye($("#" + btn.dataset.eye), btn));
  }
  $("#setup-pw").addEventListener("input", (e) => renderStrength(e.target.value));

  $("#btn-settings").addEventListener("click", async () => {
    await renderBioSettings();
    await renderBackupStatus();
    $("#vault-name-input").value = state.vaultName || "";
    $("#dlg-settings").showModal();
  });
  $("#btn-save-name").addEventListener("click", async () => {
    await saveVaultName($("#vault-name-input").value.trim());
    showToast(t("settings.nameSaved"));
  });
  $("#btn-bio-unlock").addEventListener("click", handleBioUnlock);
  $("#btn-forgot").addEventListener("click", resetVault);
  $("#form-bio").addEventListener("submit", enableBio);
  $("#form-reauth").addEventListener("submit", handleReauth);
  $("#dlg-reauth").addEventListener("close", () => {
    if (reauthResolve) { reauthResolve(false); reauthResolve = null; } // 취소 시
  });
  $("#banner-backup").addEventListener("click", exportBackup);
  $("#banner-dismiss").addEventListener("click", () => {
    bannerDismissed = true;
    $("#backup-banner").style.display = "none";
  });
  $("#btn-export").addEventListener("click", exportBackup);
  $("#file-import").addEventListener("change", (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
    e.target.value = "";
  });
  $("#btn-open-changepw").addEventListener("click", () => {
    $("#dlg-settings").close();
    $("#dlg-changepw").showModal();
  });
  $("#form-changepw").addEventListener("submit", changeMasterPassword);

  // 언어 전환
  for (const btn of document.querySelectorAll("#lang-toggle button")) {
    btn.addEventListener("click", () => switchLang(btn.dataset.lang));
  }

  hydrateIcons();          // 정적 SVG 아이콘 주입
  applyI18n();             // 저장된 언어로 텍스트 채우기
  updateLangToggle();
  renderStrength("");      // 강도 미터 초기화

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
  boot();
});

// 언어를 바꾸고, 화면에 이미 그려진 동적 텍스트도 다시 렌더
function switchLang(lang) {
  if (lang === getLang()) return;
  setLang(lang);           // 정적 텍스트(applyI18n) 갱신
  updateLangToggle();
  renderStrength($("#setup-pw")?.value || "");
  if (state.vaultKey) { renderList(); renderBackupBanner(); }
  if ($("#dlg-settings").open) { renderBackupStatus(); renderBioSettings(); }
}

function updateLangToggle() {
  for (const btn of document.querySelectorAll("#lang-toggle button"))
    btn.classList.toggle("active", btn.dataset.lang === getLang());
}
