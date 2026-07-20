// bio.js — WebAuthn PRF 기반 생체인증 편의 잠금 해제
// 원리: 기기 보안하드웨어가 지문/FaceID 인증 시에만 내주는 PRF 시크릿으로
//       볼트키를 한 겹 더 감싼다. 마스터 비밀번호 경로와 동일한 암호학적 강도.
//       PRF를 지원하지 않는 기기에서는 활성화 자체를 거부한다(약한 우회로 없음).

const BIO_PRF_SALT = new TextEncoder().encode("my-vault/prf/v1");

function bioSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials?.create);
}

// PRF 출력(32바이트) → 볼트키를 감싸는 AES 키
async function bioDeriveWrapKey(prfOutput) {
  const base = await crypto.subtle.importKey(
    "raw", prfOutput, "HKDF", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF", hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("my-vault-bio-wrap"),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// 등록된 자격증명으로 PRF 시크릿을 얻는다(지문/FaceID 프롬프트 발생)
async function bioGetPrf(credentialId) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: "public-key", id: credentialId }],
      userVerification: "required",
      timeout: 60000,
      extensions: { prf: { eval: { first: BIO_PRF_SALT } } },
    },
  });
  const ext = assertion.getClientExtensionResults();
  const prf = ext.prf?.results?.first;
  if (!prf) throw new Error("PRF_NO_RESULT");
  return prf; // ArrayBuffer
}

// 생체인증 등록 + 볼트키 감싸기 (vaultKey는 extractable이어야 함)
async function bioEnable(vaultKey) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Goblin Keeper" }, // id 생략 → 현재 도메인 사용
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "vault",
        displayName: "Goblin Keeper",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      extensions: { prf: { eval: { first: BIO_PRF_SALT } } },
    },
  });

  const ext = cred.getClientExtensionResults();
  if (!ext.prf?.enabled) throw new Error("PRF_UNSUPPORTED");

  const credentialId = new Uint8Array(cred.rawId);
  // 일부 플랫폼은 create() 때 PRF 값을 바로 주고, 아니면 get()으로 한 번 더 받는다
  const prfOutput = ext.prf.results?.first || (await bioGetPrf(credentialId));

  const wrapKey = await bioDeriveWrapKey(prfOutput);
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", vaultKey, wrapKey, {
    name: "AES-GCM", iv: wrapIv,
  });

  const toB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
  return {
    credentialId: toB64(credentialId),
    wrapIv: toB64(wrapIv),
    wrappedVaultKey: toB64(wrapped),
  };
}

// 생체인증으로 볼트키 복원
async function bioUnlock(bioRecord) {
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const prfOutput = await bioGetPrf(fromB64(bioRecord.credentialId));
  const wrapKey = await bioDeriveWrapKey(prfOutput);
  return crypto.subtle.unwrapKey(
    "raw",
    fromB64(bioRecord.wrappedVaultKey),
    wrapKey,
    { name: "AES-GCM", iv: fromB64(bioRecord.wrapIv) },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
