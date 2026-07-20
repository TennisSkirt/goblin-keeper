// app.js — 화면 흐름과 볼트 상태 관리

const AUTO_LOCK_MS = 5 * 60 * 1000;      // 무동작 5분 후 잠금
const BG_LOCK_MS = 60 * 1000;            // 백그라운드 60초 후 잠금
const CLIPBOARD_CLEAR_MS = 15 * 1000;    // 복사 15초 후 클립보드 삭제

const state = {
  vaultKey: null,     // 메모리에만 존재. 잠그면 null
  items: [],          // [{id, data, updatedAt}] 복호화된 상태 (잠금 해제 중에만)
  editingId: null,
};

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
      const data = await decryptItem(state.vaultKey, rec);
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
  bannerDismissed = false;
  renderList();
  renderBackupBanner();
  showScreen("main");
  resetIdleTimer();
}

// ---------- 잠금 ----------
function lockVault() {
  state.vaultKey = null;
  state.items = [];
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

// ---------- 목록 ----------
function renderList() {
  const q = $("#search").value.trim().toLowerCase();
  const list = $("#list");
  list.innerHTML = "";
  const items = state.items
    .filter((it) => !q ||
      (it.data.title || "").toLowerCase().includes(q) ||
      (it.data.username || "").toLowerCase().includes(q) ||
      (it.data.url || "").toLowerCase().includes(q))
    .sort((a, b) => (a.data.title || "").localeCompare(b.data.title || ""));

  $("#empty").style.display = state.items.length === 0 ? "block" : "none";
  $("#head-sub").textContent = state.items.length
    ? t("main.statusCount", { n: state.items.length })
    : t("main.statusOpen");

  for (const it of items) {
    const b = badgeFor(it.data.title);
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="badge"></div>
      <div class="item-main">
        <div class="item-title"></div>
        <div class="item-sub"></div>
      </div>
      <button class="btn-copy" title="비밀번호 복사">${iconSvg("copy", 19)}</button>
      <span class="ic chev">${iconSvg("chevron", 22)}</span>`;
    const badge = li.querySelector(".badge");
    badge.textContent = b.letter;
    badge.style.background = b.color;
    li.querySelector(".item-title").textContent = it.data.title || "(제목 없음)";
    li.querySelector(".item-sub").textContent = it.data.username || t("main.savedPw");
    li.querySelector(".item-main").addEventListener("click", () => openEditor(it.id));
    li.querySelector(".btn-copy").addEventListener("click", (e) => {
      e.stopPropagation();
      copyToClipboard(it.data.password, it.data.title || "비밀번호");
    });
    list.appendChild(li);
  }
}

// ---------- 항목 편집 ----------
function openEditor(id) {
  state.editingId = id || null;
  const it = id ? state.items.find((x) => x.id === id) : null;
  $("#editor-title").textContent = it ? t("editor.editTitle") : t("editor.newTitle");
  const b = badgeFor(it?.data.title || "새");
  const badge = $("#editor-badge");
  badge.textContent = b.letter;
  badge.style.background = it ? b.color : "var(--bronze)";
  $("#f-title").value = it?.data.title || "";
  $("#f-username").value = it?.data.username || "";
  $("#f-password").value = it?.data.password || "";
  $("#f-url").value = it?.data.url || "";
  $("#f-memo").value = it?.data.memo || "";
  $("#btn-delete").style.display = it ? "inline-block" : "none";
  $("#editor").classList.add("open");
  $("#f-title").focus();
}

function closeEditor() {
  $("#editor").classList.remove("open");
  state.editingId = null;
  // 복호화된 값이 DOM에 남지 않도록 편집 필드 비우기
  for (const id of ["#f-title", "#f-username", "#f-password", "#f-url", "#f-memo"])
    $(id).value = "";
  const pw = $("#f-password");
  if (pw.type === "text") toggleEye(pw, $("#btn-toggle-pw")); // 다시 마스킹 상태로
}

async function saveItem(e) {
  e.preventDefault();
  if (!state.vaultKey) return;
  const data = {
    title: $("#f-title").value.trim(),
    username: $("#f-username").value.trim(),
    password: $("#f-password").value,
    url: $("#f-url").value.trim(),
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
function toggleEye(input, btn) {
  const shown = input.type === "text";
  input.type = shown ? "password" : "text";
  btn.querySelector(".ic").innerHTML = iconSvg(shown ? "eye" : "eye-off", 20);
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
  $("#btn-add").addEventListener("click", () => openEditor(null));
  $("#btn-lock").addEventListener("click", lockVault);
  $("#btn-close-editor").addEventListener("click", closeEditor);
  $("#btn-delete").addEventListener("click", deleteCurrentItem);
  $("#search").addEventListener("input", renderList);
  $("#btn-gen").addEventListener("click", () => {
    const f = $("#f-password");
    f.value = generatePassword(20);
    if (f.type === "password") toggleEye(f, $("#btn-toggle-pw"));
    showToast(t("toast.genPw"));
  });
  $("#btn-toggle-pw").addEventListener("click", () =>
    toggleEye($("#f-password"), $("#btn-toggle-pw")));
  $("#btn-copy-pw").addEventListener("click", () =>
    copyToClipboard($("#f-password").value, "비밀번호"));

  // 눈 아이콘 토글 (설정/잠금 화면)
  for (const btn of document.querySelectorAll(".eye-btn")) {
    btn.addEventListener("click", () => toggleEye($("#" + btn.dataset.eye), btn));
  }
  $("#setup-pw").addEventListener("input", (e) => renderStrength(e.target.value));

  $("#btn-settings").addEventListener("click", async () => {
    await renderBioSettings();
    await renderBackupStatus();
    $("#dlg-settings").showModal();
  });
  $("#btn-bio-unlock").addEventListener("click", handleBioUnlock);
  $("#btn-forgot").addEventListener("click", resetVault);
  $("#form-bio").addEventListener("submit", enableBio);
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
