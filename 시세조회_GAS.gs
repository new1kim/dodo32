const FETCH_OPTIONS = {
  method: 'get',
  muteHttpExceptions: true,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://kbland.kr/"
  }
};

const SIMPLE_FETCH_OPTIONS = {
  method: 'get',
  muteHttpExceptions: true
};

// gonsi.html(공시가격 조회) 연동용 키
const KAKAO_API_KEY = "40ff77c743e30864998d253cf262c62c";
const VWORLD_API_KEY = "A22C5EF4-6A9B-38A4-82F9-ABCF8A3777D5";
// VWorld 인증키 발급 시 등록한 서비스URL(http://127.0.0.1)과 반드시 일치해야 INCORRECT_KEY가 나지 않는다.
const VWORLD_DOMAIN = "127.0.0.1";

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
    if (action === 'addressSearch') {
      return handleAddressSearch(e);
    }
    if (action === 'aptPrice') {
      return handleAptPrice(e);
    }
    if (action === 'housePrice') {
      return handleHousePrice(e);
    }
    if (action === 'nameSearch') {
      return handleNameSearch(e);
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

// ============================================================
// gonsi.html (부동산 공시가격 조회) 연동
// ============================================================

// 4자리 zero-pad (PNU의 본번/부번 규격)
function pad4(v) {
  const digits = String(v || '0').replace(/\D/g, '') || '0';
  return ('0000' + digits).slice(-4);
}

// PNU(필지고유번호, 19자리) = 법정동코드(10) + 대장구분(1: 1=토지대장/일반, 2=임야대장/산) + 본번(4) + 부번(4)
function buildPnu(bCode, mountainYn, mainNo, subNo) {
  return bCode + (mountainYn === 'Y' ? '2' : '1') + pad4(mainNo) + pad4(subNo);
}

// 카카오 주소검색 API로 도로명/지번주소 + PNU 계산에 필요한 정보 조회
function handleAddressSearch(e) {
  const keyword = e.parameter.keyword;

  if (!keyword) {
    return jsonOutput({ error: "검색어가 없습니다." });
  }

  const url = buildUrl('https://dapi.kakao.com/v2/local/search/address.json', {
    query: keyword
  });

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      "Authorization": "KakaoAK " + KAKAO_API_KEY,
      // 카카오 로컬 API는 서버 호출에도 등록된 웹 플랫폼 도메인이 담긴 KA 헤더를 요구한다.
      "KA": "sdk/1.0.0 os/javascript lang/ko-KR device/pc origin/https://new1kim.github.io"
    }
  });

  const json = JSON.parse(response.getContentText());

  if (json.errorType) {
    return jsonOutput({ error: json.message || json.errorType, results: [] });
  }

  const documents = json.documents || [];

  const results = documents
    .filter(doc => doc.address)
    .map(doc => {
      const addr = doc.address;
      const road = doc.road_address;

      return {
        roadAddress: road ? road.address_name : doc.address_name,
        jibunAddress: addr.address_name,
        buildingName: road ? (road.building_name || '') : '',
        legalDongCode: addr.b_code,
        pnu: buildPnu(addr.b_code, addr.mountain_yn, addr.main_address_no, addr.sub_address_no)
      };
    });

  return jsonOutput({ results: results });
}

// 카카오 키워드(장소) 검색 API로 오피스텔/빌라/아파트 등 건물명 검색
// 주소검색과 달리 b_code 등 구조화된 정보가 없어 PNU는 못 만든다 -
// 결과 선택 시 클라이언트가 roadAddress로 addressSearch를 한 번 더 호출해 PNU를 얻는다.
function handleNameSearch(e) {
  const keyword = e.parameter.keyword;

  if (!keyword) {
    return jsonOutput({ error: "검색어가 없습니다." });
  }

  const url = buildUrl('https://dapi.kakao.com/v2/local/search/keyword.json', {
    query: keyword,
    size: 15
  });

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      "Authorization": "KakaoAK " + KAKAO_API_KEY,
      "KA": "sdk/1.0.0 os/javascript lang/ko-KR device/pc origin/https://new1kim.github.io"
    }
  });

  const json = JSON.parse(response.getContentText());

  if (json.errorType) {
    return jsonOutput({ error: json.message || json.errorType, results: [] });
  }

  const documents = json.documents || [];

  // 상가/음식점 등 잡음을 빼고 아파트/오피스텔/빌라·주택 등 주거시설만 남긴다
  const results = documents
    .filter(doc => doc.category_name && doc.category_name.indexOf('주거시설') !== -1)
    .map(doc => ({
      placeName: doc.place_name,
      roadAddress: doc.road_address_name || doc.address_name,
      jibunAddress: doc.address_name,
      categoryName: doc.category_name.split('>').pop().trim()
    }));

  return jsonOutput({ results: results });
}

// VWorld 공동주택가격속성조회
function handleAptPrice(e) {
  const pnu = e.parameter.pnu;
  const stdrYear = e.parameter.stdrYear || '';

  if (!pnu) {
    return jsonOutput({ error: "pnu가 없습니다." });
  }

  const url = buildUrl('https://api.vworld.kr/ned/data/getApartHousingPriceAttr', {
    pnu: pnu,
    stdrYear: stdrYear,
    format: 'json',
    numOfRows: 1000,
    pageNo: 1,
    key: VWORLD_API_KEY,
    domain: VWORLD_DOMAIN
  });

  const response = UrlFetchApp.fetch(url, SIMPLE_FETCH_OPTIONS);
  const json = JSON.parse(response.getContentText());
  const body = json.apartHousingPrices || {};

  if (body.resultCode) {
    return jsonOutput({ error: body.resultMsg || body.resultCode, items: [] });
  }

  const items = (body.field || []).map(f => ({
    aphusNm: f.aphusNm,
    dongNm: f.dongNm,
    floorNm: f.floorNm,
    hoNm: f.hoNm,
    prvuseAr: Number(f.prvuseAr),
    price: Number(f.pblntfPc),
    stdrYear: f.stdrYear,
    ldCodeNm: f.ldCodeNm,
    mnnmSlno: f.mnnmSlno
  }));

  return jsonOutput({ items: items });
}

// VWorld 개별주택가격속성조회
function handleHousePrice(e) {
  const pnu = e.parameter.pnu;
  const stdrYear = e.parameter.stdrYear || '';

  if (!pnu) {
    return jsonOutput({ error: "pnu가 없습니다." });
  }

  const url = buildUrl('https://api.vworld.kr/ned/data/getIndvdHousingPriceAttr', {
    pnu: pnu,
    stdrYear: stdrYear,
    format: 'json',
    numOfRows: 100,
    pageNo: 1,
    key: VWORLD_API_KEY,
    domain: VWORLD_DOMAIN
  });

  const response = UrlFetchApp.fetch(url, SIMPLE_FETCH_OPTIONS);
  const json = JSON.parse(response.getContentText());
  const body = json.indvdHousingPrices || {};

  if (body.resultCode) {
    return jsonOutput({ error: body.resultMsg || body.resultCode, items: [] });
  }

  const items = (body.field || []).map(f => ({
    price: Number(f.housePc),
    stdrYear: f.stdrYear,
    ldCodeNm: f.ldCodeNm,
    mnnmSlno: f.mnnmSlno,
    buldCalcTotAr: Number(f.buldCalcTotAr),
    ladRegstrAr: Number(f.ladRegstrAr)
  }));

  return jsonOutput({ items: items });
}
