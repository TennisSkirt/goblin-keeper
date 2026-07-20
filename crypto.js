// crypto.js — 암호화 코어
// 구조: 마스터 비밀번호 → PBKDF2(600,000회) → 마스터키
//       마스터키로 볼트키(랜덤 AES-256)를 감쌈(봉투 암호화)
//       각 항목은 볼트키 + 항목별 IV로 AES-256-GCM 암호화

const KDF_ITERATIONS = 600000;

const b64 = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  dec: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

// 마스터 비밀번호 → 볼트키를 감싸고 푸는 용도의 마스터키
async function deriveMasterKey(password, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// 새 볼트 생성: salt, 볼트키 생성 후 마스터키로 감싼 메타 반환
async function createVaultMeta(password) {
  const salt = randomBytes(16);
  const masterKey = await deriveMasterKey(password, salt, KDF_ITERATIONS);
  const vaultKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
  const wrapIv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", vaultKey, masterKey, {
    name: "AES-GCM", iv: wrapIv,
  });
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt: b64.enc(salt),
    wrapIv: b64.enc(wrapIv),
    wrappedVaultKey: b64.enc(wrapped),
  };
}

// 잠금 해제: 비밀번호가 틀리면 GCM 인증 실패로 예외 발생
async function unlockVault(password, meta, { extractable = false } = {}) {
  const masterKey = await deriveMasterKey(
    password, b64.dec(meta.salt), meta.iterations
  );
  return crypto.subtle.unwrapKey(
    "raw",
    b64.dec(meta.wrappedVaultKey),
    masterKey,
    { name: "AES-GCM", iv: b64.dec(meta.wrapIv) },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

// 마스터 비밀번호 변경: 볼트키는 그대로, 감싼 껍데기만 교체 (전체 재암호화 불필요)
async function rewrapVaultMeta(oldPassword, newPassword, meta) {
  const vaultKey = await unlockVault(oldPassword, meta, { extractable: true });
  const salt = randomBytes(16);
  const newMasterKey = await deriveMasterKey(newPassword, salt, KDF_ITERATIONS);
  const wrapIv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", vaultKey, newMasterKey, {
    name: "AES-GCM", iv: wrapIv,
  });
  return {
    ...meta,
    iterations: KDF_ITERATIONS,
    salt: b64.enc(salt),
    wrapIv: b64.enc(wrapIv),
    wrappedVaultKey: b64.enc(wrapped),
  };
}

// 항목 암호화: 매번 새 IV
async function encryptItem(vaultKey, obj) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    new TextEncoder().encode(JSON.stringify(obj))
  );
  return { iv: b64.enc(iv), ct: b64.enc(ct) };
}

async function decryptItem(vaultKey, rec) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64.dec(rec.iv) },
    vaultKey,
    b64.dec(rec.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

function generatePassword(length = 20) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_=+";
  // 거부 표집(rejection sampling)으로 모듈로 편향 제거 — 각 문자가 균등 확률
  const max = 256 - (256 % chars.length); // 이 값 이상의 바이트는 버림
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < max) {
        out += chars[b % chars.length];
        if (out.length === length) break;
      }
    }
  }
  return out;
}
