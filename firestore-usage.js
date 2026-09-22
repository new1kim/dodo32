/* =========================================================================
   firestore-usage.js — 사용자별 사용내역 Firestore 기록

   기존 GAS 접속기록(action=logUsage / trackButton)을 대체한다.
   · 경로: users/{uid}/usage/{eventId}
   · 매 접속 1회 + 버튼/화면 사용 이벤트를 기록한다.
   · 서버(Sheets)와 달리 Firestore 보안 규칙상 본인 문서만 쓸 수 있다.

   공개 API:
     DodoUsage.logVisit(item)     → 접속/화면 사용 1건 기록
     DodoUsage.logButton(item)    → 버튼 사용 1건 기록 (visitId 로 묶음)
     DodoUsage.listRecent(limit)  → 최근 사용내역 배열

   의존: firebase-init.js, firebase-auth-ui.js
   ========================================================================= */
(function () {
  'use strict';

  var VISIT_KEY = 'dodo_usage_visit_v1';
  var WINDOW_MS = 30 * 1000; // 30초 - 같은 항목 중복 차단(기존 로직과 동일)

  function fb() { return window.DodoFirebase; }
  function uid() {
    var f = fb();
    return (f && f.auth && f.auth.currentUser) ? f.auth.currentUser.uid : null;
  }
  function available() { return !!(fb() && fb().db && uid()); }
  function usageCol() { return fb().db.collection('users').doc(uid()).collection('usage'); }

  function makeId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Date.now() + '-' + Math.random().toString(36).slice(2));
  }
  function visitId() {
    try {
      var saved = JSON.parse(localStorage.getItem(VISIT_KEY) || 'null');
      if (saved && saved.id && Date.now() - saved.createdAt < WINDOW_MS) return saved.id;
    } catch (e) {}
    var v = { id: makeId(), createdAt: Date.now() };
    try { localStorage.setItem(VISIT_KEY, JSON.stringify(v)); } catch (e) {}
    return v.id;
  }

  var _lastItem = ''; var _lastAt = 0;
  function shouldSend(item) {
    var now = Date.now();
    if (_lastItem === item && now - _lastAt < WINDOW_MS) return false;
    _lastItem = item; _lastAt = now;
    return true;
  }

  function writeEvent(kind, item) {
    if (!available()) return Promise.resolve();
    var data = {
      kind: kind,
      item: String(item || ''),
      visitId: visitId(),
      deviceId: (function () {
        try {
          var id = localStorage.getItem('calc_device_id');
          if (!id) { id = makeId(); localStorage.setItem('calc_device_id', id); }
          return id;
        } catch (e) { return ''; }
      })(),
      at: new Date().toISOString(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    return usageCol().doc(makeId()).set(data).catch(function (e) {
      console.warn('[Usage] 기록 실패:', e);
    });
  }

  function logVisit(item) {
    if (!available()) return Promise.resolve();
    if (!shouldSend('visit:' + item)) return Promise.resolve();
    return writeEvent('visit', item);
  }
  function logButton(item) {
    if (!available()) return Promise.resolve();
    if (!shouldSend('button:' + item)) return Promise.resolve();
    return writeEvent('button', item);
  }

  function listRecent(limit) {
    if (!available()) return Promise.resolve([]);
    return usageCol().orderBy('at', 'desc').limit(limit || 50).get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) { var d = doc.data() || {}; out.push({ id: doc.id, kind: d.kind, item: d.item, at: d.at }); });
      return out;
    });
  }

  window.DodoUsage = {
    available: available,
    logVisit: logVisit,
    logButton: logButton,
    listRecent: listRecent
  };
})();