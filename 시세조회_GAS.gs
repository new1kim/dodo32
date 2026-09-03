const FETCH_OPTIONS = {
  method: 'get',
  muteHttpExceptions: true,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://kbland.kr/"
  }
};

function doGet(e) {
  try {
    const action = e.parameter.action || 'search';

    if (action === 'priceByType') {
      return handlePriceByType(e);
    }
    if (action === 'dongList') {
      return handleDongList(e);
    }
    if (action === 'dongHoList') {
      return handleDongHoList(e);
    }

    return handleSearch(e);

  } catch (error) {
    return jsonOutput({ error: error.toString() });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

// 한글 파라미터 "키"까지 반드시 인코딩해야 KB API가 정상 응답한다.
// (값만 encodeURIComponent 하고 키를 원문 그대로 붙이면 33500 "throw error"가 남)
function buildUrl(base, params) {
  const query = Object.keys(params)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key]))
    .join('&');
  return base + '?' + query;
}

// 아파트 단지명 검색
function handleSearch(e) {
  const keyword = e.parameter.keyword;

  if (!keyword) {
    return jsonOutput({ error: "검색어가 없습니다." });
  }

  const targetApiUrl = buildUrl('https://api.kbland.kr/land-complex/serch/intgraSerch', {
    "검색설정명": "SRC_NTOTAL",
    "검색키워드": keyword,
    "출력갯수": 10,
    "페이지설정값": 1
  });

  const apiResponse = UrlFetchApp.fetch(targetApiUrl, FETCH_OPTIONS);
  return ContentService.createTextOutput(apiResponse.getContentText())
                       .setMimeType(ContentService.MimeType.JSON);
}

// 단지번호(COMPLEX_NO = 단지기본일련번호)로 평형별 KB시세 + 투기과열/조정대상 여부 조회
function handlePriceByType(e) {
  const complexNo = e.parameter.complexNo;

  if (!complexNo) {
    return jsonOutput({ error: "단지번호가 없습니다." });
  }

  const priceUrl = buildUrl('https://api.kbland.kr/land-complex/complex/mpriByType', {
    "단지기본일련번호": complexNo
  });
  const mainUrl = buildUrl('https://api.kbland.kr/land-complex/complex/complexMain', {
    "단지기본일련번호": complexNo
  });

  const priceResponse = UrlFetchApp.fetch(priceUrl, FETCH_OPTIONS);
  const mainResponse = UrlFetchApp.fetch(mainUrl, FETCH_OPTIONS);

  const priceJson = JSON.parse(priceResponse.getContentText());
  const mainJson = JSON.parse(mainResponse.getContentText());

  const types = (priceJson.dataBody && priceJson.dataBody.data) || [];
  const mainData = (mainJson.dataBody && mainJson.dataBody.data) || {};
  const regulList = mainData.regulList || [];
  const regulNames = regulList.map(r => r["규제명"]);

  return jsonOutput({
    complexNo: complexNo,
    단지명: mainData["단지명"] || '',
    투기과열지구: regulNames.indexOf("투기과열지구") !== -1,
    조정대상지역: regulNames.indexOf("조정대상지역") !== -1,
    규제목록: regulNames,
    타입목록: types.map(t => ({
      타입: t["주택형타입내용"],
      면적일련번호: t["면적일련번호"],
      전용면적: t["전용면적"],
      공급면적: t["공급면적"],
      전용면적평: t["전용면적평"],
      공급면적평: t["공급면적평"],
      매매상한가: t["매매상한가"],
      매매일반가: t["매매일반거래가"],
      매매하한가: t["매매하한가"],
      세대수: t["세대수"]
    }))
  });
}

// 단지의 동 목록 조회 (동명 + 동일련번호) - 로그인 불필요, 시세 간편조회 페이지와 동일한 공개 API
function handleDongList(e) {
  const complexNo = e.parameter.complexNo;

  if (!complexNo) {
    return jsonOutput({ error: "단지번호가 없습니다." });
  }

  const url = buildUrl('https://api.kbland.kr/land-complex/complexComm/dongList', {
    "단지기본일련번호": complexNo
  });

  const response = UrlFetchApp.fetch(url, FETCH_OPTIONS);
  const json = JSON.parse(response.getContentText());
  const list = (json.dataBody && json.dataBody.data) || [];

  return jsonOutput({
    동목록: list.map(d => ({
      동명: d["동명"],
      동일련번호: d["동일련번호"]
    }))
  });
}

// 특정 동의 호수 목록 조회 (호명, 층수, 면적일련번호) - dongList와 같은 공개 API 계열
function handleDongHoList(e) {
  const complexNo = e.parameter.complexNo;
  const dongNo = e.parameter.dongNo; // 동일련번호

  if (!complexNo || !dongNo) {
    return jsonOutput({ error: "단지번호 또는 동번호가 없습니다." });
  }

  const url = buildUrl('https://api.kbland.kr/land-extra/myHouse/dongHoList', {
    "단지기본일련번호": complexNo,
    "동일련번호": dongNo
  });

  const response = UrlFetchApp.fetch(url, FETCH_OPTIONS);
  const json = JSON.parse(response.getContentText());
  const list = (json.dataBody && json.dataBody.data) || [];

  return jsonOutput({
    호목록: list.map(h => ({
      호명: h["호명"],
      호층수: h["호층수"],
      면적일련번호: h["면적일련번호"]
    }))
  });
}
