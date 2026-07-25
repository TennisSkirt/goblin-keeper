// types.js — 예치품 종류(8종) 정의 + 데이터 정규화
// 각 field: { k:키, kind, sensitive?, gen?, barcode?, expiry? }
//   kind: text | secret | multiline | url | text-mmYY | text-date | select-barcode
//   sensitive=true → 기본 가림 + 눈 토글 + 원터치 복사

const ITEM_TYPES = {
  login: {
    icon: "globe", color: "#4285F4",
    fields: [
      { k: "username", kind: "text" },
      { k: "password", kind: "secret", gen: true },
      { k: "url", kind: "url" },
    ],
  },
  email: {
    icon: "mail", color: "#EA4335",
    fields: [
      { k: "email", kind: "text" },
      { k: "password", kind: "secret", gen: true },
      { k: "provider", kind: "url" },
    ],
  },
  card: {
    icon: "card", color: "#7A5CB0",
    fields: [
      { k: "cardNumber", kind: "secret", reveal: "bio" },
      { k: "cardHolder", kind: "text" },
      { k: "expiry", kind: "text-mmYY", expiry: true },
      { k: "cvc", kind: "secret", reveal: "bio" },
      { k: "pin", kind: "secret", reveal: "bio" },
    ],
  },
  membership: {
    icon: "barcode", color: "#2AC1BC",
    fields: [
      { k: "memberNumber", kind: "text", barcode: true },
      { k: "barcodeFormat", kind: "select-barcode" },
    ],
  },
  bank: {
    icon: "bank", color: "#2DB400",
    fields: [
      { k: "bankName", kind: "text" },
      { k: "bankCode", kind: "text", ph: "ph.bank4" },      // 銀行コード 4桁
      { k: "branchCode", kind: "text", ph: "ph.bank3" },    // 支店コード 3桁
      { k: "accountType", kind: "text", ph: "ph.accountType" }, // 普通/当座
      { k: "accountNumber", kind: "secret", reveal: "bio" }, // 口座番号
      { k: "accountHolder", kind: "text", ph: "ph.kana" },  // 名義(カナ)
    ],
  },
  wifi: {
    icon: "wifi", color: "#E67E22",
    fields: [
      { k: "ssid", kind: "text" },
      { k: "wifiPassword", kind: "secret", gen: true },
    ],
  },
  note: {
    icon: "note", color: "#8A6A1E",
    fields: [
      { k: "body", kind: "multiline" },
    ],
  },
  id: {
    icon: "id", color: "#C0392B",
    fields: [
      { k: "idKind", kind: "text" },
      { k: "idNumber", kind: "secret", reveal: "bio" },
      { k: "issued", kind: "text-date" },
      { k: "expiry", kind: "text-date", expiry: true },
    ],
  },
};

const TYPE_ORDER = ["login", "email", "card", "membership", "bank", "wifi", "note", "id"];

// 레거시(구버전 로그인) 및 누락 필드 보정
function normalizeItem(data) {
  const d = { ...data };
  if (!d.type) {
    // 예전 스키마: {title, username, password, url, memo}
    d.type = "login";
    d.fields = { username: d.username || "", password: d.password || "", url: d.url || "" };
    delete d.username; delete d.password; delete d.url;
  }
  if (!ITEM_TYPES[d.type]) d.type = "login";
  d.title = d.title || "";
  d.fields = d.fields || {};
  d.custom = Array.isArray(d.custom) ? d.custom : [];
  d.memo = d.memo || "";
  d.fav = !!d.fav;
  return d;
}

// 만료일 파싱 → 남은 일수 (없으면 null)
function daysUntilExpiry(field, value) {
  if (!value) return null;
  const v = value.trim();
  let end;
  if (field.kind === "text-mmYY") {
    // MM/YY 또는 MM/YYYY → 해당 월 말일
    const m = v.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{2,4})$/);
    if (!m) return null;
    let yy = +m[2]; if (yy < 100) yy += 2000;
    const mm = +m[1];
    if (mm < 1 || mm > 12) return null;
    end = new Date(yy, mm, 0); // 그 달의 말일
  } else {
    // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    const m = v.match(/^(\d{4})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})$/);
    if (!m) return null;
    end = new Date(+m[1], +m[2] - 1, +m[3]);
  }
  if (isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

// 항목의 만료 상태 (임박 30일/만료) — 없으면 null
function itemExpiryState(data) {
  const type = ITEM_TYPES[data.type];
  if (!type) return null;
  let worst = null;
  for (const f of type.fields) {
    if (!f.expiry) continue;
    const days = daysUntilExpiry(f, data.fields[f.k]);
    if (days === null) continue;
    if (days < 0) return "expired";
    if (days <= 30) worst = "soon";
  }
  return worst;
}
