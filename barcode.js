// barcode.js — 외부 라이브러리 없이 스캔 가능한 바코드를 SVG로 생성 (오프라인/CSP 안전)
// 지원: Code 128(자동 B/C), EAN-13, Code 39. 흰 배경·검은 막대·여백(quiet zone) 규격.

// ---------- Code 128 ----------
const C128 = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];
const C128_STOP = 106;

function code128Encode(text) {
  // 전부 숫자 & 짝수 길이 → Code C(2자리씩, 절반 폭). 그 외 → Code B(ASCII)
  const allDigits = /^\d+$/.test(text);
  const symbols = [];
  let start;
  if (allDigits && text.length % 2 === 0 && text.length >= 2) {
    start = 105; // Start C
    for (let i = 0; i < text.length; i += 2) symbols.push(parseInt(text.substr(i, 2), 10));
  } else {
    start = 104; // Start B
    for (const ch of text) {
      const v = ch.charCodeAt(0) - 32;
      if (v < 0 || v > 94) return null; // Code B 표현 불가 문자
      symbols.push(v);
    }
  }
  let sum = start;
  symbols.forEach((v, i) => { sum += v * (i + 1); });
  const check = sum % 103;
  const values = [start, ...symbols, check, C128_STOP];
  return values.map((v) => C128[v]).join("");
}

// ---------- Code 39 ----------
const C39_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
const C39_PAT = [
  "bwbWBwBwb","BwbWbwbwB","bwBWbwbwB","BwBWbwbwb","bwbWBwbwB","BwbWBwbwb","bwBWBwbwb","bwbWbwBwB","BwbWbwBwb","bwBWbwBwb",
  "BwbwbWbwB","bwBwbWbwB","BwBwbWbwb","bwbwBWbwB","BwbwBWbwb","bwBwBWbwb","bwbwbWBwB","BwbwbWBwb","bwBwbWBwb","bwbwBWBwb",
  "BwbwbwbWB","bwBwbwbWB","BwBwbwbWb","bwbwBwbWB","BwbwBwbWb","bwBwBwbWb","bwbwbwBWB","BwbwbwBWb","bwBwbwBWb","bwbwBwBWb",
  "BWbwbwbwB","bWBwbwbwB","BWBwbwbwb","bWbwBwbwB","BWbwBwbwb","bWBwBwbwb","bWbwbwBwB","BWbwbwBwb","bWBwbwBwb","bWbWbWbwb",
  "bWbWbwbWb","bWbwbWbWb","bwbWbWbWb"
];
const C39_STAR = "bWbwBwBwb"; // 시작/끝 문자 '*'
function code39Encode(text) {
  const seq = [C39_STAR];
  for (const ch of text.toUpperCase()) {
    const idx = C39_CHARS.indexOf(ch);
    if (idx < 0) return null;
    seq.push(C39_PAT[idx]);
  }
  seq.push(C39_STAR);
  let bits = "";
  seq.forEach((pat, pi) => {
    for (const c of pat) {
      if (c === "b") bits += "1";
      else if (c === "B") bits += "11";
      else if (c === "w") bits += "0";
      else if (c === "W") bits += "00";
    }
    if (pi < seq.length - 1) bits += "0"; // intercharacter narrow gap
  });
  return bits;
}

// ---------- EAN-13 ----------
const EAN_L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const EAN_G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const EAN_R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const EAN_PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
function ean13Encode(text) {
  let d = text.replace(/\D/g, "");
  if (d.length === 12) { // 체크디짓 계산
    let s = 0;
    for (let i = 0; i < 12; i++) s += (+d[i]) * (i % 2 === 0 ? 1 : 3);
    d += ((10 - (s % 10)) % 10).toString();
  }
  if (d.length !== 13) return null;
  const first = +d[0];
  const parity = EAN_PARITY[first];
  let bits = "101"; // 시작 가드
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? EAN_L : EAN_G)[+d[i]];
  bits += "01010"; // 중앙 가드
  for (let i = 7; i <= 12; i++) bits += EAN_R[+d[i]];
  bits += "101"; // 끝 가드
  return { bits, normalized: d };
}

// ---------- SVG 렌더 ----------
function barsToSvg(bits, label, opts = {}) {
  const mw = opts.moduleWidth || 2;
  const h = opts.height || 76;
  const quiet = 10; // 좌우 여백 모듈
  const total = bits.length + quiet * 2;
  const w = total * mw;
  const fullH = h + 22;
  let rects = "";
  let x = quiet * mw;
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      let run = 1;
      while (i + run < bits.length && bits[i + run] === "1") run++;
      rects += `<rect x="${x}" y="0" width="${run * mw}" height="${h}" fill="#000"/>`;
      x += run * mw; i += run;
    } else { x += mw; i++; }
  }
  const text = label
    ? `<text x="${w / 2}" y="${h + 17}" text-anchor="middle" font-family="monospace" font-size="14" fill="#000">${label}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${fullH}" width="100%" style="max-width:${w}px" preserveAspectRatio="xMidYMid meet"><rect width="${w}" height="${fullH}" fill="#fff"/>${rects}${text}</svg>`;
}

// 공개 API: (값, 형식) → SVG 문자열 또는 null(형식 불일치)
function makeBarcode(value, format) {
  const v = (value || "").trim();
  if (!v) return null;
  try {
    if (format === "ean13") {
      const r = ean13Encode(v);
      return r ? barsToSvg(r.bits, r.normalized, { moduleWidth: 2.4 }) : null;
    }
    if (format === "code39") {
      const bits = code39Encode(v);
      return bits ? barsToSvg(bits, v.toUpperCase(), { moduleWidth: 2 }) : null;
    }
    // 기본: code128
    const bits = code128Encode(v);
    return bits ? barsToSvg(bits, v, { moduleWidth: 2 }) : null;
  } catch (e) {
    return null;
  }
}

const BARCODE_FORMATS = ["code128", "ean13", "code39"];
