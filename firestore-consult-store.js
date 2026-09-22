/* =========================================================================
   firestore-consult-store.js — 사용자별 상담내용 Firestore 저장/불러오기

   기존 GAS(Google Sheets) 동기화를 대체한다.
   · 경로: users/{uid}/consults/{docId}
   · docId: 연락처(숫자만) → 없으면 이름 → 없으면 자동 ID
   · 저장 형태는 기존 상담저장소 레코드와 최대한 동일하게 맞춰
     화면(모달) 코드가 그대로 재사용되게 한다.

   공개 API (기존 저장소 함수와 이름이 겹치지 않게 DodoConsult* 로 둔다):
     DodoConsult.available()            → Firestore 사용 가능 여부
     DodoConsult.list()                 → Promise<레코드 배열>
     DodoConsult.save(record)           → Promise<void>  (record 는 saveConsultRecord 형식)
     DodoConsult.remove(docId)          → Promise<void>
     DodoConsult.importFromLocal()      → 로컬 상담저장소를 Firestore 로 1회 업로드
     DodoConsult.exportToLocal()        → Firestore 기록을 로컬 상담저장소 캐시로 내려받기

   의존: firebase-init.js, firebase-auth-ui.js(window.DodoAuth)
   ========================================================================= */
(function () {
  'use strict';

  function fb() { return window.DodoFirebase; }
  function uid() {
    var f = fb();
    return (f && f.auth && f.auth.currentUser) ? f.auth.currentUser.uid : null;
  }
  function available() { return !!(fb() && fb().db && uid()); }

  function phoneKey(phone) { return String(phone || '').replace(/\D/g, ''); }

  // 레코드 → Firestore 문서 ID. 화면/기존 로직과 같은 규칙(폰번호 우선, 이름 폴백).
  function docIdOf(record) {
    var p = phoneKey(record && record.phone);
    if (p) return 'p_' + p;
    var name = String((record && record.name) || '').trim();
    if (name) return 'n_' + encodeURIComponent(name);
    return null; // 자동 ID 로 저장
  }

  function collection() {
    return fb().db.collection('users').doc(uid()).collection('consults');
  }

  // 저장: 기존 saveConsultRecord 가 만든 레코드를 그대로 받는다.
  //   storage/inputSnapshot 등 큰 필드도 함께 저장해 복원 시 그대로 재사용한다.
  function save(record) {
    if (!available() || !record) return Promise.resolve(null);
    var data = {
      phone: record.phone || '',
      name: record.name || '',
      broker: record.broker || '',
      memo: record.memo || '',
      needDate: record.needDate || '',
      needAmount: record.needAmount || '',
      loanType: record.loanType || '',
      loanCategory: record.loanCategory || '담보',
      guaranteeType: record.guaranteeType || '',
      heldLoans: record.heldLoans || '',
      propertyInfo: record.propertyInfo || '',
      futureSummary: record.futureSummary || '',
      storage: record.storage || {},
      inputSnapshot: record.inputSnapshot || '',
      savedAt: record.savedAt || new Date().toISOString(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var id = docIdOf(record);
    var ref = id ? collection().doc(id) : collection().doc();
    return ref.set(data, { merge: true }).then(function () { return ref.id; });
  }

  // 목록: 최신순. 저장 형태를 화면 레코드 형태로 되돌린다.
  function list() {
    if (!available()) return Promise.resolve([]);
    return collection().orderBy('savedAt', 'desc').limit(100).get().then(function (snap) {
      var out = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        out.push({
          firestoreId: doc.id,
          phone: d.phone || '',
          name: d.name || '',
          broker: d.broker || '',
          memo: d.memo || '',
          needDate: d.needDate || '',
          needAmount: d.needAmount || '',
          loanType: d.loanType || '',
          loanCategory: d.loanCategory || '담보',
          guaranteeType: d.guaranteeType || '',
          heldLoans: d.heldLoans || '',
          propertyInfo: d.propertyInfo || '',
          futureSummary: d.futureSummary || '',
          storage: d.storage || {},
          inputSnapshot: d.inputSnapshot || '',
          savedAt: d.savedAt || ''
        });
      });
      return out;
    });
  }

  function remove(firestoreId) {
    if (!available() || !firestoreId) return Promise.resolve();
    return collection().doc(firestoreId).delete();
  }

  // 기존 로컬 상담저장소(localStorage)를 Firestore 로 1회 업로드한다.
  // 이관(마이그레이션)용 — 이미 있으면 merge 로 덮어씀.
  function importFromLocal() {
    if (!available()) return Promise.resolve(0);
    var local = [];
    try { local = JSON.parse(localStorage.getItem('CONSULT_상담저장소') || '[]') || []; } catch (e) { local = []; }
    if (!Array.isArray(local) || !local.length) return Promise.resolve(0);
    return Promise.all(local.map(function (r) { return save(r); })).then(function () { return local.length; });
  }

  // Firestore 기록을 로컬 상담저장소 캐시로 내려받는다(오프라인/기존 화면 호환용).
  function exportToLocal() {
    if (!available()) return Promise.resolve(0);
    return list().then(function (records) {
      try { localStorage.setItem('CONSULT_상담저장소', JSON.stringify(records.slice(0, 100))); } catch (e) {}
      return records.length;
    });
  }

  window.DodoConsult = {
    available: available,
    uid: uid,
    save: save,
    list: list,
    remove: remove,
    importFromLocal: importFromLocal,
    exportToLocal: exportToLocal
  };
})();