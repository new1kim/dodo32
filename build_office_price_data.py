#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_office_price_data.py
===========================================================================
매년 국세청이 새로 고시하는 "상업용건물 및 오피스텔 기준시가" 엑셀 파일을
gonsi.html이 바로 읽을 수 있는 "법정동코드별 JSON"으로 쪼개주는 변환 스크립트.

## 왜 이 스크립트가 필요한가
국세청 오피스텔 기준시가는 공공데이터포털(data.go.kr)에 "오픈 API"가 아니라
"파일데이터(엑셀)"로만 매년 갱신 등록된다 (2026-09 확인 결과, 오픈API는
2020년 데이터에서 멈춰 있고 법정동코드로 서버측 필터링도 안 됨 - 즉
API로는 이 작업을 자동화할 수 없다. 매년 새 엑셀을 받아서 다시 변환해야 함).

전체 엑셀은 약 250만 행(160MB+)이라 gonsi.html에서 매번 통째로 불러올 수
없다. 그래서 법정동코드(10자리) 단위로 쪼갠 작은 JSON 파일(op_gongsi_data/
{법정동코드}.json)을 미리 만들어두고, gonsi.html은 검색된 주소의 법정동코드에
해당하는 파일 "딱 하나"만 fetch 한다.

## 매년 해야 할 일 (요약)
1. https://www.data.go.kr 에서 "국세청_상업용건물 오피스텔 기준시가" 검색
   → 파일데이터 탭 → 최신 연도 엑셀(.xlsx) 다운로드
2. 그 파일을 이 프로젝트의 OP_gongsi/ 폴더 안에 넣는다
   (파일명은 아무거나 상관없음 - 폴더 안에 .xlsx가 하나만 있으면 자동 인식)
3. 터미널에서: python build_office_price_data.py
4. 끝. op_gongsi_data/*.json이 새로 생성되고, gonsi.html의 OFFICE_DATA_YEAR
   상수도 새 연도로 자동 갱신된다.

## 원본 엑셀 컬럼 구조 (2026년 1월 1일 기준 파일에서 확인, 매년 동일할 것으로 예상)
시트가 여러 개(1~5)로 나뉘어 있고, 시트마다 헤더가 반복된다. 컬럼 순서:
  0  상가건물번호     - 상가/오피스텔을 포함한 건물 일련번호 (참고용, 미사용)
  1  상가종류코드     - '상가' 또는 '오피스텔' → '오피스텔'만 사용
  2  고시일자         - 예: '20260101' → 앞 4자리가 기준연도
  3  법정동코드       - 10자리, 출력 파일명이 됨
  4  특수지코드       - '일반지번' / '산' / '가,확정예정지번' → 0/1/2로 매학
  5  번지             - 지번 본번 (문자열, 앞자리 0 유지: '0431' 등)
  6  호               - 지번 부번 (문자열, '01-2'처럼 숫자가 아닐 수도 있음)
  7  상가건물블록주소 - 건물명. 이름이 없으면 국세청이 이미 "(번지-호)"
                       형태의 문자열을 넣어서 내려주므로 그대로 쓰면 됨
  8  상가건물동주소   - 동 이름 (전유 유닛의 "동"에 해당)
  9  건물층구분코드   - '지상층' / '지하층' / '옥탑층' (오피스텔엔 옥탑층 없음)
  10 상가건물층주소   - 층 번호 (문자열, 예: '1', '13')
  11 상가건물호주소   - 호 표시. 이미 'B01', '301호'처럼 접두/접미사가 붙어
                       있는 경우도 있고 없는 경우도 있어 그대로 사용한다
  12 고시가격         - 정수(원)
  13 전용면적         - 실수(㎡)
  14 공유면적         - 실수(㎡)

## 출력 JSON 스키마 (op_gongsi_data/{법정동코드}.json)
{
  "y": "2026",                              # 고시일자에서 추출한 기준연도
  "b": [                                     # 이 법정동코드 안의 필지(지번) 목록
    [
      "0431",                               # 번지(본번)
      "0005",                               # 호(부번)
      0,                                     # 특수지코드: 0=일반지번 1=산 2=가·확정예정지번
      "신부파스칼텔",                         # 건물명 (이름 없으면 국세청이 준 "(번지-호)" 그대로)
      [                                      # 이 필지 안의 오피스텔 전유부분(호) 목록
        ["1(단일)", "2", "201", 1842000, 23.46, 10.98],
        #  동      층    호     고시가격    전용면적  공유면적
        #  ※ 층은 지하층일 때만 'B' 접두어를 붙인다 (예: "B1"). 호는 원본 그대로.
        ...
      ]
    ],
    ...
  ]
}

엑셀은 건물의 각 호(전유부분)마다 한 행씩 나오므로, "상가건물번호"(같은 건물이면
동일한 값)로 행을 묶어서 하나의 건물 = 하나의 b[] 항목이 되도록 재구성한다.
(번지+호만으로 묶으면 같은 지번 위에 등록된 서로 다른 동/건물이 하나로 합쳐지는
오류가 생겨서, 반드시 상가건물번호를 기준으로 묶어야 한다 - 실제 데이터로 검증함)
"""

import glob
import io
import json
import os
import re
import sys
import time

import openpyxl

# ---------------------------------------------------------------------------
# 경로 설정
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DATA_DIR = os.path.join(SCRIPT_DIR, "OP_gongsi")          # 원본 엑셀이 들어있는 폴더 (.gitignore 처리됨)
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "op_gongsi_data")        # gonsi.html이 fetch하는 JSON 폴더
GONSI_HTML_PATH = os.path.join(SCRIPT_DIR, "gonsi.html")       # OFFICE_DATA_YEAR 상수를 자동 갱신할 대상

# 특수지코드 문자열 → 코드 매핑 (기존 op_gongsi_data 산출물과 대조해 확인한 값)
SPECIAL_CODE_MAP = {
    "일반지번": 0,
    "산": 1,
    "가,확정예정지번": 2,
}


def find_source_xlsx():
    """
    OP_gongsi/ 폴더 안의 .xlsx 파일을 자동으로 찾는다.
    매년 파일명이 "상업용건물 및 오피스텔 기준시가(2027년 1월 1일 기준).xlsx"처럼
    바뀌므로 파일명을 하드코딩하지 않고, 폴더 안에 있는 유일한 xlsx를 사용한다.
    커맨드라인 인자로 경로를 직접 넘기면 그걸 우선 사용한다.
    """
    if len(sys.argv) > 1:
        path = sys.argv[1]
        if not os.path.isfile(path):
            sys.exit("지정한 파일을 찾을 수 없습니다: " + path)
        return path

    candidates = glob.glob(os.path.join(RAW_DATA_DIR, "*.xlsx"))
    # 엑셀을 열어둔 상태면 생기는 임시 잠금 파일(~$로 시작)은 제외
    candidates = [c for c in candidates if not os.path.basename(c).startswith("~$")]

    if not candidates:
        sys.exit(
            "OP_gongsi/ 폴더 안에 .xlsx 파일이 없습니다.\n"
            "data.go.kr에서 '국세청_상업용건물 오피스텔 기준시가' 최신 엑셀을 받아 "
            "OP_gongsi/ 폴더에 넣은 뒤 다시 실행해주세요."
        )
    if len(candidates) > 1:
        sys.exit(
            "OP_gongsi/ 폴더 안에 .xlsx 파일이 여러 개 있습니다:\n  "
            + "\n  ".join(candidates)
            + "\n어떤 파일을 쓸지 명확하지 않으니, 오래된 파일을 지우거나 "
            "`python build_office_price_data.py <파일경로>` 형태로 직접 지정해주세요."
        )
    return candidates[0]


def build_floor_label(floor_raw, floor_kind):
    """
    건물층구분코드가 '지하층'이면 층 번호 앞에 'B'를 붙인다.
    (지상층/옥탑층은 원본 층 번호를 그대로 쓴다)
    """
    floor_str = str(floor_raw)
    if floor_kind == "지하층":
        return "B" + floor_str
    return floor_str


def convert(xlsx_path):
    print("원본 파일: " + xlsx_path)
    t0 = time.time()

    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)

    # 법정동코드 -> {상가건물번호: {"bunji","ho","special","name","units":[...]}}
    # ※ 그룹 키는 반드시 상가건물번호여야 한다. 같은 (번지,호,건물명) 조합이라도
    #   같은 지번 위에 별도로 등록된 서로 다른 동/건물이 있는 사례가 실제로 있어서
    #   (번지,호)만으로 묶으면 서로 다른 건물이 하나로 합쳐지는 오류가 생긴다.
    #   (2026년 원본 데이터와 대조해 검증 완료: 상가건물번호 기준일 때만 완전히 일치)
    by_dong = {}
    year = None
    total_rows = 0
    kept_rows = 0

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row[0] is None:
                continue  # 빈 줄(시트 끝)
            total_rows += 1

            category = row[1]
            if category != "오피스텔":
                continue  # '상가' 행은 gonsi.html에서 쓰지 않으므로 제외

            kept_rows += 1

            building_no = row[0]           # 상가건물번호 - 건물을 구분하는 진짜 기본키
            notice_date = row[2]           # 예: '20260101'
            dong_code = row[3]             # 법정동코드 10자리
            special_raw = row[4]           # '일반지번' / '산' / '가,확정예정지번'
            bunji = row[5]                 # 번지(본번)
            ho_lot = row[6]                # 호(부번) - 지번 단위, 유닛 호수 아님
            building_name = row[7] or ""   # 상가건물블록주소
            dong_unit = row[8]             # 상가건물동주소 (동)
            floor_kind = row[9]            # '지상층'/'지하층'
            floor_raw = row[10]            # 상가건물층주소
            ho_unit = row[11]              # 상가건물호주소 (유닛 호수, 원본 그대로 사용)
            price = row[12]
            area_private = row[13]
            area_shared = row[14]

            if year is None:
                year = str(notice_date)[:4]

            special_code = SPECIAL_CODE_MAP.get(special_raw)
            if special_code is None:
                # 예상 못한 새 특수지코드 값이 나오면 조용히 넘기지 않고 바로 알려준다
                # (내년에 새 분류가 추가될 수도 있으니 무시하지 말고 확인 후 매핑 추가할 것)
                sys.exit(
                    "알 수 없는 특수지코드 값: " + repr(special_raw)
                    + " (SPECIAL_CODE_MAP에 추가해야 합니다)"
                )

            parcels = by_dong.setdefault(dong_code, {})
            parcel = parcels.get(building_no)
            if parcel is None:
                parcel = {
                    "bunji": str(bunji),
                    "ho": str(ho_lot),
                    "special": special_code,
                    "name": building_name,
                    "units": [],
                }
                parcels[building_no] = parcel

            floor_label = build_floor_label(floor_raw, floor_kind)

            parcel["units"].append([
                dong_unit,
                floor_label,
                ho_unit,
                int(price),
                float(area_private),
                float(area_shared),
            ])

        print("  시트 '%s' 처리 완료 (누적 %d행 중 오피스텔 %d행)" % (sheet_name, total_rows, kept_rows))

    if year is None:
        sys.exit("오피스텔 행을 하나도 찾지 못했습니다. 엑셀 컬럼 구조가 바뀐 것은 아닌지 확인해주세요.")

    print("기준연도: %s / 법정동코드 %d개 / 소요 %.1f초" % (year, len(by_dong), time.time() - t0))
    return year, by_dong


def write_output(year, by_dong):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 작년까지의 결과를 먼저 지운다. 그대로 두면 올해 데이터에서 사라진
    # 법정동코드의 파일이 낡은 채로 남아 잘못된 값을 보여줄 수 있다.
    old_files = glob.glob(os.path.join(OUTPUT_DIR, "*.json"))
    for f in old_files:
        os.remove(f)
    print("기존 JSON %d개 삭제 후 재생성" % len(old_files))

    for dong_code, parcels in by_dong.items():
        b = []
        for parcel in parcels.values():
            b.append([parcel["bunji"], parcel["ho"], parcel["special"], parcel["name"], parcel["units"]])

        out_path = os.path.join(OUTPUT_DIR, dong_code + ".json")
        with io.open(out_path, "w", encoding="utf-8") as f:
            # 용량을 줄이기 위해 들여쓰기 없이 저장 (gonsi.html은 fetch 후 JSON.parse만 함)
            json.dump({"y": year, "b": b}, f, ensure_ascii=False, separators=(",", ":"))

    print("op_gongsi_data/ 에 %d개 파일 생성 완료" % len(by_dong))


def update_gonsi_html_year(year):
    """
    gonsi.html의 `const OFFICE_DATA_YEAR = '2026';` 값을 새 연도로 자동 갱신한다.
    (매년 이 상수 갱신을 깜빡하는 게 가장 흔한 실수라 스크립트가 대신 처리한다)
    """
    if not os.path.isfile(GONSI_HTML_PATH):
        print("경고: gonsi.html을 찾지 못해 OFFICE_DATA_YEAR 자동 갱신을 건너뜁니다.")
        return

    with io.open(GONSI_HTML_PATH, "r", encoding="utf-8") as f:
        html = f.read()

    pattern = re.compile(r"const OFFICE_DATA_YEAR = '(\d{4})';")
    match = pattern.search(html)
    if not match:
        print("경고: gonsi.html에서 OFFICE_DATA_YEAR 상수를 찾지 못해 자동 갱신을 건너뜁니다.")
        return

    old_year = match.group(1)
    if old_year == year:
        print("gonsi.html의 OFFICE_DATA_YEAR는 이미 %s년으로 되어 있습니다." % year)
        return

    html = pattern.sub("const OFFICE_DATA_YEAR = '%s';" % year, html, count=1)
    with io.open(GONSI_HTML_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    print("gonsi.html의 OFFICE_DATA_YEAR를 %s -> %s 로 갱신했습니다." % (old_year, year))


def main():
    xlsx_path = find_source_xlsx()
    year, by_dong = convert(xlsx_path)
    write_output(year, by_dong)
    update_gonsi_html_year(year)
    print("완료. gonsi.html을 새로고침해서 %s년 오피스텔 기준시가가 정상 조회되는지 확인해보세요." % year)


if __name__ == "__main__":
    main()
