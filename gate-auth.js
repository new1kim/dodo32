/* =========================================================================
   이용 제한(인증) 게이트 - API 통신 모듈
   ⚠️ 이 파일에는 API 엔드포인트(GAS URL)가 포함되어 있습니다.
   난수화/난독화 등 보안 처리는 이 파일을 대상으로 진행하세요.
   ========================================================================= */
const GATE_GAS_URL = "https://script.google.com/macros/s/AKfycbwW_7x4agccYUUn2BoLTpcln8auXCqYATYay3bGFy_gzT4yvuSy2Ae005hwcEBJjCaOpg/exec";
const GATE_SESSION_KEY = "dsr_gate_session";
const GATE_SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6시간
const GATE_ENABLED = false; // 사용자 인증은 잠시 끄고, 이름별 사용량 기록만 유지

function getGateSession() {
  try {
    const raw = localStorage.getItem(GATE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveGateSession(uid, name) {
  const session = { uid, name, expiresAt: Date.now() + GATE_SESSION_TTL_MS };
  localStorage.setItem(GATE_SESSION_KEY, JSON.stringify(session));
  return session;
}

function clearGateSession() {
  localStorage.removeItem(GATE_SESSION_KEY);
}

async function callGateAPI(params) {
  // 로컬 개발 서버에서는 CORS로 막히므로 요청 자체를 보내지 않는다.
  if (!canReachGateAPI()) {
    const corsError = new Error('로컬 개발 서버에서는 인증 서버에 접근할 수 없습니다(CORS)');
    corsError.name = 'CorsError';
    corsError.isCorsError = true;
    throw corsError;
  }

  const url = new URL(GATE_GAS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  // Apps Script가 응답하지 않을 때 "확인중..." 상태로 영원히 남지 않도록 제한시간을 둔다.
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    if (controller) controller.abort();
  }, 15000);

  try {
    const fetchOptions = controller
      ? { signal: controller.signal, cache: 'no-store' }
      : { cache: 'no-store' };
    const res = await fetch(url.toString(), fetchOptions);
    if (!res.ok) throw new Error("GAS 응답 오류: " + res.status);
    const result = await res.json();
    if (!result || typeof result !== 'object') throw new Error("GAS 응답 형식 오류");
    return result;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('인증 서버 응답 시간 초과');
    }
    /* CORS 차단은 fetch가 TypeError("Failed to fetch")로 보고한다.
       로컬 개발 서버(http://localhost, http://127.0.0.1)에서만 발생하는
       개발 환경 제약이므로, 호출부가 구분할 수 있게 표시해둔다. */
    if (err instanceof TypeError && !canReachGateAPI()) {
      const corsError = new Error('로컬 개발 서버에서는 인증 서버에 접근할 수 없습니다(CORS)');
      corsError.name = 'CorsError';
      corsError.isCorsError = true;
      throw corsError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// 인증 기능을 다시 켰을 때 사용하는 인증 사용자 사용횟수 기록 함수.
// GATE_ENABLED=false인 현재는 호출하지 않고, index.html의 일반 사용량 기록만 사용한다.
function logUsageBackground(session) {
  callGateAPI({
    action: "logUsage",
    uid: session.uid,
    name: session.name
  }).catch((err) => {
    console.error("사용횟수 기록 실패:", err);
  });
}

// 세션 만료 시: 화면은 막지 않고 백그라운드로만 재검증
async function backgroundVerifyGate(uid, name) {
  try {
    const result = await callGateAPI({ action: "verify", uid, name });
    if (result.allowed) {
      const session = saveGateSession(uid, name); // 세션 갱신
      // 재검증으로 진입한 경우에도 현재 접속 1회를 즉시 기록한다.
      logUsageBackground(session);
    } else {
      lockApp(result.reason);
    }
  } catch (err) {
    console.error("재검증 실패:", err);
    // 네트워크 오류는 사용자 귀책이 아니므로 세션 유지, 다음 로드 때 재시도
  }
}

const GATE_MESSAGES = {
  config_error: "인증 시트 설정을 확인해주세요.",
  blocked: "이용이 제한된 계정입니다. 관리자에게 문의해주세요.",
  expired: "이용 기간이 만료되었습니다. 관리자에게 문의해주세요.",
  mismatch: "이미 다른 기기에 등록된 이름입니다. 관리자에게 문의해주세요.",
  unregistered: "등록되지 않은 사용자입니다. 관리자에게 문의해주세요.",
  network_error: "인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.",
  invalid_request: "요청 정보가 올바르지 않습니다."
};

// 인증 실패 시: 세션/이름 초기화하고 다시 잠금
function lockApp(reason) {
  clearGateSession();
  localStorage.removeItem('calc_user_name');

  alert(GATE_MESSAGES[reason] || "이용이 제한되었습니다.");

  document.getElementById('auth-section').style.display = 'flex';
  // .frame-toggle-group도 프레임과 함께 숨겨야 한다 - 안 그러면 잠긴 뒤에도 토글 칩만 남는다
  document.querySelectorAll('.nav-btn, .main-wrapper, .frame-toggle-group').forEach(el => el.classList.add('locked-content'));

  const nameInput = document.getElementById('user-name-input');
  const counterEl = document.getElementById('today-count');
  if (nameInput) { nameInput.value = ''; nameInput.focus(); }
  if (counterEl) counterEl.textContent = "이름 입력 필요";
}

function getDeviceId() {
  let id = localStorage.getItem('calc_device_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
    localStorage.setItem('calc_device_id', id);
  }
  return id;
}

function getEnvSummary() {
  const ua = navigator.userAgent;

  let os = 'Unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'Mac';

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  const deviceType = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'PC';

  return `${os}·${browser}·${deviceType}`;
}

const ACCESS_LOG_CACHE_KEY = 'calc_last_access_log';
const ACCESS_LOG_CACHE_MS = 30 * 1000; // 30초 - 같은 접속 요청 중복 방지
/* 기록을 보낼 수 있는 환경인가?

   Google Apps Script의 ContentService 응답에는 CORS 헤더가 없다.
   그래서 origin이 null(파일 직접 열기)이거나 앱 전용 가상 도메인(appassets)인
   환경에서는 정상 동작하지만, http://localhost 나 http://127.0.0.1 같은
   로컬 개발 서버에서는 브라우저가 CORS 정책으로 응답을 막는다.

   이때 fetch는 실패하고 DevTools 콘솔에 CORS 오류만 남는다(실제 기능엔 영향 없음).
   개발 중인 화면을 보려고 로컬 서버를 쓰는 경우가 많아, 그런 환경에서는
   아예 요청을 보내지 않도록 한다 - 콘솔을 깨끗하게 유지하기 위함이다. */
function canReachGateAPI() {
  try {
    const origin = String(window.location.origin || '');
    if (origin === 'null' || origin === '') return true;                 // 파일 직접 열기
    if (origin.indexOf('appassets.androidx.startup') !== -1) return true; // Android 앱 WebView
    return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
  } catch (e) {
    return true;
  }
}

/* 사용량·접속 기록 전용 GET 전송기.
   이 기록 요청은 응답 본문을 읽을 필요가 없으므로 Image 요청을 사용할 수 있다.
   Image는 CORS 응답 헤더가 없어도 브라우저가 요청 자체를 전송한다.
   따라서 Live Server(localhost/127.0.0.1)에서도 Apps Script의 doGet이 실행된다. */
const TRACKING_IMAGE_REQUESTS = new Set();

function sendTrackingRequest(params) {
  try {
    const url = new URL(GATE_GAS_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const request = new Image();
    TRACKING_IMAGE_REQUESTS.add(request);
    const release = () => TRACKING_IMAGE_REQUESTS.delete(request);
    request.onload = release;
    request.onerror = release;
    request.src = url.toString();
    return true;
  } catch (e) {
    console.warn('사용량 기록 요청 생성 실패:', e);
    return false;
  }
}
/*
 * index.html 버튼 사용 기록
 * - 페이지 진입 시 사용 항목을 즉시 기록 요청한다. (체류 시간 대기 없음)
 * - 모바일에서 포커스가 돌아오면 같은 항목을 다시 1회 기록한다.
 * - 같은 항목의 30초 이내 재요청(새로고침/재진입)은 클라이언트·서버 양쪽에서 차단한다.
 * - eventId를 함께 보내므로 네트워크 재시도에 따른 서버 중복 기록도 막는다.
 * - localStorage 접근과 통신은 모두 비동기로 처리해 화면 조작을 막지 않는다.
 */
const BUTTON_USAGE_QUEUE_KEY = 'calc_button_usage_queue_v1';
const BUTTON_USAGE_VISIT_KEY = 'calc_button_usage_visit_v1';
// 항목별 중복 차단 창. 서버(접속기록.gs)의 캐시 TTL과 같은 값으로 맞춘다.
const BUTTON_USAGE_ITEM_WINDOW_MS = 30 * 1000;
let buttonUsageFlushPromise = null;
let activeButtonUsageItem = '';
let activeButtonUsageItemAt = 0;

function readButtonUsageQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(BUTTON_USAGE_QUEUE_KEY) || '[]');
    return Array.isArray(queue) ? queue : [];
  } catch (e) {
    return [];
  }
}

function writeButtonUsageQueue(queue) {
  try {
    localStorage.setItem(BUTTON_USAGE_QUEUE_KEY, JSON.stringify(queue.slice(-100)));
  } catch (e) {
    // 저장 공간 부족 등은 사용 화면에 영향을 주지 않도록 무시한다.
  }
}

function makeButtonUsageId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getButtonUsageVisitId() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUTTON_USAGE_VISIT_KEY) || 'null');
    if (saved && saved.id && Date.now() - saved.createdAt < BUTTON_USAGE_ITEM_WINDOW_MS) return saved.id;
    const visit = { id: makeButtonUsageId(), createdAt: Date.now() };
    localStorage.setItem(BUTTON_USAGE_VISIT_KEY, JSON.stringify(visit));
    return visit.id;
  } catch (e) {
    return makeButtonUsageId();
  }
}

/* 같은 항목이 30초 안에 다시 요청되면 서버로 보내지 않고 여기서 먼저 차단한다.
   (새로고침이 연속으로 일어나도 요청 자체가 늘어나지 않게 하기 위함)
   항목 단위로 판단하므로, 다른 항목으로 이동하는 것은 막지 않는다. */
function shouldSendButtonUsage(item) {
  const now = Date.now();
  if (activeButtonUsageItem === item && now - activeButtonUsageItemAt < BUTTON_USAGE_ITEM_WINDOW_MS) {
    return false;
  }
  activeButtonUsageItem = item;
  activeButtonUsageItemAt = now;
  return true;
}

function flushButtonUsageQueue() {
  /* 전송 가능 조건은 "보낼 것이 있고 사용자 이름이 있는가" 하나뿐이다.
     예전에는 buttonUsageReady 플래그까지 봤는데, 첫 화면 기록
     (proceedToApp → startButtonUsageTracking)이 그 플래그가 세워지기 전에
     큐를 비우려다 전송이 유보되어, 페이지를 떠날 때까지 기록이 밀리는 원인이었다. */
  if (buttonUsageFlushPromise) return buttonUsageFlushPromise;
  const userName = (localStorage.getItem('calc_user_name') || '').trim();
  const queue = readButtonUsageQueue();
  if (!userName || !queue.length) return null;

  const deviceId = getDeviceId();
  const visitId = getButtonUsageVisitId();
  const trackingParams = (event) => ({
    action: 'trackButton', uid: deviceId, name: userName, visitId,
    eventId: event.eventId, item: event.item, clickedAt: event.clickedAt,
    opened_at: event.openedAt, env: getEnvSummary()
  });

  /* 사용량 기록은 응답 본문이 필요 없는 단방향 GET이다.
     Apps Script ContentService에는 CORS 응답 헤더가 없으므로 fetch로 읽으려 하면
     localhost뿐 아니라 일반 웹 origin에서도 브라우저가 응답을 차단할 수 있다.
     Image GET은 응답을 읽지 않고 요청만 전송하므로 모든 지원 환경에서 동일하게 쓴다. */
  const sentIds = queue
    .filter(event => sendTrackingRequest(trackingParams(event)))
    .map(event => event.eventId);
  if (sentIds.length) {
    const sent = new Set(sentIds);
    writeButtonUsageQueue(readButtonUsageQueue().filter(event => !sent.has(event.eventId)));
  }
  return null;
}

/* 항목 사용 기록을 시작한다.
   - 진입 즉시 +1 을 기록하고, 30초 이내 같은 항목 재호출은 보내지 않는다.
   - 항목 단위로 판단하므로 다른 항목으로 이동하면 즉시 기록된다. */
function startButtonUsageTracking(item) {
  const currentItem = String(item || '');
  getButtonUsageVisitId();

  if (!shouldSendButtonUsage(currentItem)) return;
  trackButtonUsage(currentItem, Date.now());
}

/* 모바일에서 다른 앱을 보고 돌아온 경우(visibilitychange → visible) 실행된다.
   포커스 복귀는 새 사용 구간으로 보지만, 30초 안에 되돌아오면 중복으로 차단된다. */
function resumeButtonUsageTracking() {
  if (!activeButtonUsageItem) return;
  if (!shouldSendButtonUsage(activeButtonUsageItem)) return;
  trackButtonUsage(activeButtonUsageItem, Date.now());
}

function trackButtonUsage(item, openedAt) {
  const userName = (localStorage.getItem('calc_user_name') || '').trim();
  if (!userName || !item || !openedAt) return;
  const queue = readButtonUsageQueue();
  queue.push({
    eventId: makeButtonUsageId(),
    item: String(item),
    clickedAt: new Date().toISOString(),
    openedAt: openedAt
  });
  writeButtonUsageQueue(queue);
  flushButtonUsageQueue();
}

// 페이지를 떠나기 전에, 아직 서버로 보내지 못한 기록이 있으면 밀어낸다.
function flushActiveButtonUsage() {
  flushButtonUsageQueue();
}

window.addEventListener('pagehide', flushActiveButtonUsage, { capture: true });
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushActiveButtonUsage();
  } else if (document.visibilityState === 'visible') {
    resumeButtonUsageTracking();
  }
});

function startWorkerRecordAccess(userName) {
  // 첫 접속은 즉시 기록하고, 서버의 30초 캐시가 새로고침/재호출 중복을 막는다.
  const now = Date.now();
  const lastLoggedAt = parseInt(localStorage.getItem(ACCESS_LOG_CACHE_KEY) || '0', 10);
  if (now - lastLoggedAt < ACCESS_LOG_CACHE_MS) {
    const counterEl = document.getElementById('today-count');
    if (counterEl) counterEl.textContent = `${userName} ✔`;
    return;
  }

  // 요청 시각을 먼저 저장해 Worker 유무와 관계없이 클라이언트 중복을 차단한다.
  localStorage.setItem(ACCESS_LOG_CACHE_KEY, String(now));

  const trackingParams = {
    name: userName,
    device_id: getDeviceId(),
    env: getEnvSummary(),
    ua: navigator.userAgent
  };

  // 접속량도 응답 본문이 필요 없는 단방향 GET으로 전송한다.
  // Worker/fetch 조합은 Apps Script CORS 응답을 읽지 못해 기록이 누락될 수 있다.
  sendTrackingRequest(trackingParams);
  const counterEl = document.getElementById('today-count');
  if (counterEl) counterEl.textContent = `${userName} ✔`;
  return;
}
