/*
 * build_op_gongsi_index.js
 *
 * 왜 필요한가
 * ---------------------------------------------------------------------------
 * 오피스텔 기준시가 정적 데이터(op_gongsi_data/{법정동코드}.json)는 국세청이 고시할
 * 때 사용하던 법정동코드(10자리)로 쪼개져 있다. 그런데 주소검색 API(카카오)가 내려주는
 * b_code는 *현재* 법정동코드다. 행정구역이 개편된 동은 코드가 다르다.
 *
 *   실제 사례 (2026-02 확인):
 *     카카오 b_code   4146126221  경기도 용인시 처인구 양지읍 양지리   (존재)
 *     데이터 파일     4146136021  경기도 용인시 처인구 양지면 양지리   (폐지)
 *     같은 필지       본번 0573 / 부번 0008  (= 양지 어반시아)
 *
 * 그래서 OP시세조회.html이 op_gongsi_data/{b_code}.json을 그대로 fetch하면 404가 나고,
 * 오피스텔로 판별하지 못한 채 "공시가격 정보를 찾을 수 없습니다"로 끝난다.
 *
 * 해결
 * ---------------------------------------------------------------------------
 * 지번(본번-부번)은 행정구역 개편前后에 바뀌지 않으므로, "지번 -> 그 지번을 담은
 * 데이터 파일(법정동코드) 목록" 인덱스를 한 번 만들어 {_index.json}으로 둔다.
 * 브라우저는 정확한 코드 파일을 먼저 시도하고, 404면 인덱스에서 후보를 찾아
 * 그중 요청 코드와 앞자리가 가장 많이 같은 것을 고른다.
 *
 * 사용법
 * ---------------------------------------------------------------------------
 *   node build_op_gongsi_index.js
 *
 * 산출물: op_gongsi_data/_index.json  (약 300KB)
 * 이 파일을 배포 폴더(public/op_gongsi_data/)에도 함께 올려야 한다.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'op_gongsi_data');
const OUT_FILE = path.join(DATA_DIR, '_index.json');

const files = fs.readdirSync(DATA_DIR).filter(n => /^\d{10}\.json$/.test(n));

if (files.length === 0) {
    console.error('op_gongsi_data 에 %s 형식의 파일이 없습니다.', '\\d{10}.json');
    process.exit(1);
}

// "본번-부번" -> [법정동코드, ...]
const index = new Map();
// 세 기준연도 자료가 섞여도 지번 매핑은 같으므로 파일 단위로 한 번만 넣는다.
for (const name of files) {
    const code = name.slice(0, 10);
    let json;
    try {
        json = JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
    } catch (e) {
        console.error('  건너뜀(파싱 실패): %s - %s', name, e.message);
        continue;
    }
    if (!Array.isArray(json.b)) continue;

    for (const b of json.b) {
        if (!Array.isArray(b) || b.length < 2) continue;
        const key = b[0] + '-' + b[1];
        let list = index.get(key);
        if (!list) {
            list = [];
            index.set(key, list);
        }
        if (list.indexOf(code) === -1) list.push(code);
    }
}

// 같은 지번이 여러 파일에 있으면(국가 전체 규모로 드물게 발생) 결정적 순서를 넣는다.
// 브라우저는 이 순서대로 앞에서부터 시도하므로, 매번 같은 후보를 고르게 된다.
for (const list of index.values()) list.sort();

const out = {};
for (const key of Array.from(index.keys()).sort()) out[key] = index.get(key);

fs.writeFileSync(OUT_FILE, JSON.stringify(out));

const bytes = fs.statSync(OUT_FILE).size;
let multi = 0, maxList = 0;
for (const list of index.values()) {
    if (list.length > 1) multi++;
    if (list.length > maxList) maxList = list.length;
}

console.log('op_gongsi_data/_index.json 생성 완료');
console.log('  대상 파일      %d개', files.length);
console.log('  서로 다른 지번 %d개', index.size);
console.log('  여러 후보 지번 %d개 (최대 후보 %d개)', multi, maxList);
console.log('  파일 크기      %sKB', (bytes / 1024).toFixed(0));
