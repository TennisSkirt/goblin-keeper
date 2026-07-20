// i18n.js — 한국어/일본어 전환. 언어 설정은 민감정보가 아니라 localStorage에 보관.
// 사용법: HTML은 data-i18n / data-i18n-html / data-i18n-ph 속성, JS는 t(key, params).

const I18N = {
  ko: {
    "common.busy": "처리 중…",
    "common.cancel": "취소",
    "common.close": "닫기",

    "setup.badge": "새 금고를 준비합니다 · 암구호를 정하세요",
    "setup.warnTitle": "잊으면 문지기도 열지 못합니다",
    "setup.warnBody": "암구호는 어디에도 저장되지 않아요. 분실 시 금고는 영원히 잠깁니다.",
    "setup.pwLabel": "마스터 암구호 (12자 이상)",
    "setup.pw2Label": "암구호 확인",
    "setup.submit": "금고 열기",
    "setup.reassure": "기기에서만 암호화 · 서버는 아무것도 모릅니다",

    "lock.title": "문지기가 지키고 있습니다",
    "lock.subtitle": "암구호를 대면 금고를 열어드리지요.",
    "lock.pwPlaceholder": "암구호",
    "lock.submit": "잠금 해제",
    "lock.bio": "지문 / Face ID로 신원 확인",
    "lock.forgot": "암구호를 잊으셨나요? 금고 초기화",
    "reset.confirm": "⚠️ 마스터 암구호는 복구할 수 없습니다.\n\n금고를 완전히 초기화하고 처음부터 새로 시작할까요?\n저장된 모든 항목이 삭제됩니다. (백업 파일이 있으면 나중에 복원 가능)",
    "reset.done": "금고가 초기화되었습니다. 새 암구호를 정하세요.",

    "main.search": "검색 또는 웹사이트 입력",
    "main.deposits": "예치품",
    "main.empty": "금고가 비어 있습니다.<br>오른쪽 아래 + 버튼으로 첫 예치품을 맡기세요.",
    "main.statusOpen": "지금 열림",
    "main.statusCount": "예치품 {n} · 지금 열림",
    "main.savedPw": "비밀번호 저장됨",

    "banner.title": "열쇠 사본을 만들어 두세요",
    "banner.never": "아직 백업한 적이 없어요. 지금 만들어 두세요.",
    "banner.daysAgo": "마지막 백업 {n}일 전이에요.",
    "banner.mini": "백업",

    "editor.newTitle": "새 예치품",
    "editor.editTitle": "예치품 편집",
    "editor.title": "제목",
    "editor.titlePh": "예: 네이버",
    "editor.username": "아이디",
    "editor.password": "비밀번호",
    "editor.url": "URL",
    "editor.memo": "메모",
    "editor.delete": "버리기",
    "editor.save": "보관",
    "editor.confirmDelete": "이 예치품을 버릴까요?",

    "settings.title": "설정",
    "settings.backupSection": "백업 · 열쇠 사본",
    "settings.lastBackup": "마지막 백업",
    "settings.backupNever": "아직 백업한 적이 없습니다.",
    "settings.export": "내보내기",
    "settings.import": "가져오기",
    "settings.securitySection": "보안",
    "settings.bio": "생체인증",
    "settings.bioDesc": "문지기가 주인을 알아봅니다",
    "settings.bioOn": "생체인증 켜기",
    "settings.bioOff": "생체인증 끄기",
    "settings.bioUnsupported": "이 기기/브라우저는 생체인증을 지원하지 않습니다.",
    "settings.changePw": "암구호 변경",
    "settings.changePwDesc": "마스터 암구호를 다시 정합니다",
    "settings.langSection": "언어 · 言語",

    "backupInfo.summary": "백업이 뭔가요? 쉽게 설명",
    "backupInfo.p1": "이 앱은 비밀번호를 이 기기 안에만 보관해요. 서버에 올리지 않아 안전하지만, 폰을 잃어버리거나 고장나면 되살릴 수 없어요.",
    "backupInfo.p2": "그래서 가끔 ‘내보내기’로 백업 파일 하나를 만들어 두세요. 이 파일엔 모든 비밀번호가 들어있지만, 마스터 암구호로 꽁꽁 잠겨 있어 파일만으론 아무도 못 열어요.",
    "backupInfo.p3": "그래서 이메일·클라우드 어디에 둬도 안전해요. 다만 마스터 암구호는 절대 잊으면 안 돼요 — 그 암구호로만 열리니까요.",
    "backupInfo.p4": "새 폰으로 옮길 땐 ‘가져오기’로 이 파일을 불러오면 그대로 복원돼요.",

    "bio.title": "생체인증 켜기",
    "bio.desc": "확인을 위해 마스터 암구호를 한 번 입력하세요. 이후에는 지문/Face ID로 빠르게 열 수 있습니다.",
    "bio.pwPh": "마스터 암구호",
    "bio.submit": "등록",
    "bio.successOn": "생체인증이 켜졌습니다.",
    "bio.confirmOff": "생체인증을 끌까요?",
    "bio.errUnsupported": "이 기기는 앱 잠금 해제용 생체인증(PRF)을 지원하지 않습니다.",
    "bio.errCancel": "생체인증이 취소되었습니다.",
    "bio.errFail": "생체인증 등록에 실패했습니다.",

    "cp.title": "암구호 변경",
    "cp.oldPh": "현재 암구호",
    "cp.newPh": "새 암구호 (12자 이상)",
    "cp.new2Ph": "새 암구호 확인",
    "cp.submit": "변경",
    "cp.errShort": "새 암구호는 12자 이상이어야 합니다.",
    "cp.errMismatch": "새 암구호가 서로 다릅니다.",
    "cp.errWrong": "현재 암구호가 올바르지 않습니다.",
    "cp.success": "암구호가 변경되었습니다. 백업 파일도 새로 만들어 두세요.",

    "err.pwShort": "마스터 암구호는 12자 이상이어야 합니다.",
    "err.pwMismatch": "암구호가 서로 다릅니다.",
    "err.wrongPw": "암구호가 올바르지 않습니다.",
    "err.bioCancel": "생체인증이 취소되었습니다.",
    "err.bioFail": "생체인증에 실패했습니다. 암구호로 열어주세요.",

    "toast.copied": "{label} 복사됨 · 15초 후 지워짐",
    "toast.genPw": "새 암호 생성됨",
    "label.password": "비밀번호",

    "import.invalidRead": "백업 파일을 읽을 수 없습니다.",
    "import.invalidFormat": "올바른 Goblin Keeper 백업 파일이 아닙니다.",
    "import.badMeta": "백업 파일의 보안 설정이 올바르지 않아 가져올 수 없습니다.",
    "import.confirm": "백업({n}개 항목)으로 현재 금고를 완전히 교체합니다.\n계속할까요?",
    "import.done": "복원 완료. 백업 당시의 마스터 암구호로 잠금 해제하세요.",
    "clipboard.fail": "클립보드 복사에 실패했습니다.",

    "strength.weak": "약함",
    "strength.medium": "보통",
    "strength.strong": "튼튼함",
  },

  ja: {
    "common.busy": "処理中…",
    "common.cancel": "キャンセル",
    "common.close": "閉じる",

    "setup.badge": "新しい金庫を準備します · 合言葉を決めましょう",
    "setup.warnTitle": "忘れると番人でも開けられません",
    "setup.warnBody": "合言葉はどこにも保存されません。忘れると金庫は永遠に開きません。",
    "setup.pwLabel": "マスター合言葉（12文字以上）",
    "setup.pw2Label": "合言葉の確認",
    "setup.submit": "金庫を開く",
    "setup.reassure": "端末内だけで暗号化 · サーバーは何も知りません",

    "lock.title": "番人が見張っています",
    "lock.subtitle": "合言葉を告げれば金庫を開けましょう。",
    "lock.pwPlaceholder": "合言葉",
    "lock.submit": "ロック解除",
    "lock.bio": "指紋 / Face ID で本人確認",
    "lock.forgot": "合言葉をお忘れですか？金庫をリセット",
    "reset.confirm": "⚠️ マスター合言葉は復元できません。\n\n金庫を完全にリセットして最初からやり直しますか？\n保存された項目はすべて削除されます。（バックアップがあれば後で復元できます）",
    "reset.done": "金庫をリセットしました。新しい合言葉を決めてください。",

    "main.search": "検索またはサイト名を入力",
    "main.deposits": "預かり品",
    "main.empty": "金庫は空です。<br>右下の + ボタンで最初の預かり品を入れましょう。",
    "main.statusOpen": "現在オープン中",
    "main.statusCount": "預かり品 {n} · 現在オープン中",
    "main.savedPw": "パスワード保存済み",

    "banner.title": "合鍵を作っておきましょう",
    "banner.never": "まだバックアップしていません。今すぐ作りましょう。",
    "banner.daysAgo": "前回のバックアップから {n}日経過。",
    "banner.mini": "バックアップ",

    "editor.newTitle": "新しい預かり品",
    "editor.editTitle": "預かり品の編集",
    "editor.title": "タイトル",
    "editor.titlePh": "例: LINE",
    "editor.username": "ID",
    "editor.password": "パスワード",
    "editor.url": "URL",
    "editor.memo": "メモ",
    "editor.delete": "捨てる",
    "editor.save": "保管",
    "editor.confirmDelete": "この預かり品を捨てますか？",

    "settings.title": "設定",
    "settings.backupSection": "バックアップ · 合鍵",
    "settings.lastBackup": "前回のバックアップ",
    "settings.backupNever": "まだバックアップしていません。",
    "settings.export": "書き出し",
    "settings.import": "読み込み",
    "settings.securitySection": "セキュリティ",
    "settings.bio": "生体認証",
    "settings.bioDesc": "番人が持ち主を見分けます",
    "settings.bioOn": "生体認証をオン",
    "settings.bioOff": "生体認証をオフ",
    "settings.bioUnsupported": "この端末/ブラウザは生体認証に対応していません。",
    "settings.changePw": "合言葉の変更",
    "settings.changePwDesc": "マスター合言葉を再設定します",
    "settings.langSection": "言語 · 언어",

    "backupInfo.summary": "バックアップとは？やさしく説明",
    "backupInfo.p1": "このアプリはパスワードをこの端末の中だけに保管します。サーバーに送らないので安全ですが、スマホを無くしたり壊れたりすると元に戻せません。",
    "backupInfo.p2": "なので時々「書き出し」でバックアップファイルを作っておきましょう。全パスワードが入っていますが、マスター合言葉で固く暗号化されており、ファイルだけでは誰も開けません。",
    "backupInfo.p3": "そのためメールやクラウド、どこに置いても安全です。ただしマスター合言葉だけは絶対に忘れないでください — その合言葉でしか開けません。",
    "backupInfo.p4": "新しいスマホに移すときは「読み込み」でこのファイルを取り込めばそのまま復元できます。",

    "bio.title": "生体認証をオン",
    "bio.desc": "確認のためマスター合言葉を一度入力してください。以降は指紋/Face ID で素早く開けます。",
    "bio.pwPh": "マスター合言葉",
    "bio.submit": "登録",
    "bio.successOn": "生体認証をオンにしました。",
    "bio.confirmOff": "生体認証をオフにしますか？",
    "bio.errUnsupported": "この端末はアプリ解錠用の生体認証(PRF)に対応していません。",
    "bio.errCancel": "生体認証がキャンセルされました。",
    "bio.errFail": "生体認証の登録に失敗しました。",

    "cp.title": "合言葉の変更",
    "cp.oldPh": "現在の合言葉",
    "cp.newPh": "新しい合言葉（12文字以上）",
    "cp.new2Ph": "新しい合言葉の確認",
    "cp.submit": "変更",
    "cp.errShort": "新しい合言葉は12文字以上にしてください。",
    "cp.errMismatch": "新しい合言葉が一致しません。",
    "cp.errWrong": "現在の合言葉が正しくありません。",
    "cp.success": "合言葉を変更しました。バックアップも新しく作成してください。",

    "err.pwShort": "マスター合言葉は12文字以上にしてください。",
    "err.pwMismatch": "合言葉が一致しません。",
    "err.wrongPw": "合言葉が正しくありません。",
    "err.bioCancel": "生体認証がキャンセルされました。",
    "err.bioFail": "生体認証に失敗しました。合言葉で開いてください。",

    "toast.copied": "{label} をコピー · 15秒後に消えます",
    "toast.genPw": "新しいパスワードを生成",
    "label.password": "パスワード",

    "import.invalidRead": "バックアップファイルを読み込めません。",
    "import.invalidFormat": "正しい Goblin Keeper のバックアップファイルではありません。",
    "import.badMeta": "バックアップの設定が正しくないため読み込めません。",
    "import.confirm": "バックアップ（{n}件）で現在の金庫を完全に置き換えます。\n続けますか？",
    "import.done": "復元しました。バックアップ時のマスター合言葉で解錠してください。",
    "clipboard.fail": "クリップボードへのコピーに失敗しました。",

    "strength.weak": "弱い",
    "strength.medium": "普通",
    "strength.strong": "強い",
  },
};

let _lang = localStorage.getItem("gk-lang") ||
  (navigator.language && navigator.language.startsWith("ja") ? "ja" : "ko");

function getLang() { return _lang; }
function localeTag() { return _lang === "ja" ? "ja-JP" : "ko-KR"; }

function t(key, params) {
  let s = (I18N[_lang] && I18N[_lang][key]);
  if (s == null) s = I18N.ko[key];
  if (s == null) return key;
  if (params) for (const k in params) s = s.split("{" + k + "}").join(params[k]);
  return s;
}

function applyI18n(root) {
  const scope = root || document;
  for (const el of scope.querySelectorAll("[data-i18n]")) el.textContent = t(el.getAttribute("data-i18n"));
  for (const el of scope.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.getAttribute("data-i18n-html"));
  for (const el of scope.querySelectorAll("[data-i18n-ph]")) el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
  document.documentElement.lang = _lang;
}

function setLang(lang) {
  _lang = lang === "ja" ? "ja" : "ko";
  localStorage.setItem("gk-lang", _lang);
  applyI18n();
}
