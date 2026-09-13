function doGet(e) {
  try {
    var action = e.parameter.action;
    var userCode = e.parameter.userCode ? e.parameter.userCode.toString().trim().toUpperCase() : "공통";
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(userCode);
        if (sheet) ensureConsultSheetLayout_(sheet);

    // 1. 데이터 조회 (Read)
    if (action === "read") {
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }

      var lastRow = sheet.getLastRow();
      if (lastRow < 3) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }

      // B열(연락처)부터 P열(장래예상 요약)까지 읽는다.
      var dataRange = sheet.getRange(3, 2, lastRow - 2, 12);
      var values = dataRange.getDisplayValues();
      var resultList = [];

      for (var i = 0; i < values.length; i++) {
        if (!values[i][1] && !values[i][0]) continue;

        resultList.push({
          userCode: userCode,
          phone: values[i][0] ? values[i][0].toString() : "",
          dateTime: values[i][1] ? values[i][1].toString() : "",
          name: values[i][2] ? values[i][2].toString() : "",
          needDate: values[i][3] ? values[i][3].toString() : "",
          needAmount: values[i][4] ? values[i][4].toString() : "",
          loanType: values[i][5] ? values[i][5].toString() : "",
          memo: values[i][6] ? values[i][6].toString() : "",
          broker: values[i][7] ? values[i][7].toString() : "",
          futureSummary: values[i][8] ? values[i][8].toString() : "",
          inputSnapshot: values[i][9] ? values[i][9].toString() : "",
          propertyInfo: values[i][10] ? values[i][10].toString() : "",
          heldLoans: values[i][11] ? values[i][11].toString() : ""
        });
      }
      var json = JSON.stringify(resultList);
      if (e.parameter.callback) {
        return ContentService.createTextOutput(e.parameter.callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
    }

  // 1-1. 전화번호로 최근 상담 메모 조회 (안드로이드 앱 - 수신전화 연동용)
    if (action === "readByPhone") {
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }

      var targetPhone = e.parameter.phone ? e.parameter.phone.toString().replace(/\D/g, "") : "";
      var lastRow = sheet.getLastRow();
      if (lastRow < 3 || !targetPhone) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }

      var dataRange = sheet.getRange(3, 2, lastRow - 2, 12);
      var values = dataRange.getDisplayValues();
      var resultList = [];

      for (var i = 0; i < values.length; i++) {
        if (!values[i][1] && !values[i][0]) continue;

        var rowPhone = values[i][0] ? values[i][0].toString().replace(/\D/g, "") : "";
        if (rowPhone !== targetPhone) continue; // 번호가 일치하는 행만 수집

        resultList.push({
          userCode: userCode,
          phone: values[i][0] ? values[i][0].toString() : "",
          dateTime: values[i][1] ? values[i][1].toString() : "",
          name: values[i][2] ? values[i][2].toString() : "",
          needDate: values[i][3] ? values[i][3].toString() : "",
          needAmount: values[i][4] ? values[i][4].toString() : "",
          loanType: values[i][5] ? values[i][5].toString() : "",
          memo: values[i][6] ? values[i][6].toString() : "",
          broker: values[i][7] ? values[i][7].toString() : "",
          futureSummary: values[i][8] ? values[i][8].toString() : "",
          inputSnapshot: values[i][9] ? values[i][9].toString() : "",
          propertyInfo: values[i][10] ? values[i][10].toString() : "",
          heldLoans: values[i][11] ? values[i][11].toString() : ""
        });
      }
      // insertRowBefore(3)로 항상 3행에 삽입되므로 위에서부터 이미 최신순입니다.
      var phoneJson = JSON.stringify(resultList);
      if (e.parameter.callback) {
        return ContentService.createTextOutput(e.parameter.callback + '(' + phoneJson + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(phoneJson).setMimeType(ContentService.MimeType.JSON);
    }
    // ↑↑↑ 여기까지 새로 추가 ↑↑↑






    // 2. 구글 시트 개별 행 삭제 (Delete)
    if (action === "delete") {
      if (!sheet) {
        return ContentService.createTextOutput("시트 없음").setMimeType(ContentService.MimeType.TEXT);
      }

      var targetDateTime = e.parameter.dateTime ? e.parameter.dateTime.toString().trim() : "";
      var targetName = e.parameter.name ? e.parameter.name.toString().trim() : "";
      var lastRow = sheet.getLastRow();

      if (lastRow >= 3) {
        var dataRange = sheet.getRange(3, 3, lastRow - 2, 2);
        var values = dataRange.getValues();

        for (var i = values.length - 1; i >= 0; i--) {
          var sheetDateTime = values[i][0] ? values[i][0].toString().trim() : "";
          var sheetName = values[i][1] ? values[i][1].toString().trim() : "";

          if (sheetDateTime === targetDateTime && sheetName === targetName) {
            var actualRowNumber = i + 3;
            sheet.deleteRow(actualRowNumber);
          }
        }
      }
      return ContentService.createTextOutput("성공").setMimeType(ContentService.MimeType.TEXT);
    }

    return ContentService.createTextOutput("서버 정상 대기 중").setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}

function ensureConsultSheetLayout_(sheet) {
  var headers = ["구분", "연락처", "최초상담일시", "이름", "필요일자", "필요금액", "대출구분", "상담내용", "중개업소", "장래예상 요약", "전체입력값(JSON)", "물건지정보", "보유대출"];

  // 기존 16열 양식(시세/거래 열 포함)을 새 양식으로 한 번 변환한다.
  // A:I는 유지하고, 기존 N/O의 장래예상·JSON을 새 J/K로 옮긴다.
  var oldHeader = sheet.getMaxColumns() >= 13 ? sheet.getRange(1, 1, 1, Math.min(sheet.getMaxColumns(), 16)).getValues()[0] : [];
  if (oldHeader.indexOf("시세구분") !== -1 || oldHeader.indexOf("거래구분") !== -1) {
    var oldLastRow = sheet.getLastRow();
    if (oldLastRow >= 3) {
      var oldRows = sheet.getRange(3, 1, oldLastRow - 2, Math.min(sheet.getMaxColumns(), 16)).getValues();
      var migrated = oldRows.map(function(row) {
        return [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[13] || "", row[14] || "", "", ""];
      });
      sheet.getRange(3, 1, migrated.length, 13).setValues(migrated);
    }
    sheet.getRange(1, 1, 1, 13).setValues([headers]);
    sheet.getRange(2, 1, 1, 13).setValues([headers.map(function() { return "-"; })]);
    if (sheet.getMaxColumns() > 13) sheet.deleteColumns(14, sheet.getMaxColumns() - 13);
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var needsHeader = current.every(function(value) { return value === "" || value === "-"; });
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  if (sheet.getMaxRows() >= 2) {
    var second = sheet.getRange(2, 1, 1, headers.length).getValues()[0];
    if (second.every(function(value) { return value === ""; })) sheet.getRange(2, 1, 1, headers.length).setValues([headers.map(function() { return "-"; })]);
  }
}

function formatConsultSheet_(sheet) {
  ensureConsultSheetLayout_(sheet);
  var lastColumn = 13;
  sheet.getRange(1, 1, 2, lastColumn).setFontWeight('bold');
  sheet.getRange(1, 1, 1, lastColumn).setBackground('#1d4ed8').setFontColor('#ffffff');
  sheet.getRange(2, 1, 1, lastColumn).setBackground('#dbeafe').setFontColor('#1e3a8a');
  sheet.setFrozenRows(2);
  sheet.setColumnWidth(1, 70);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 135);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 105);
  sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 100);
  sheet.setColumnWidth(8, 280);
  sheet.setColumnWidth(9, 120);
  sheet.setColumnWidth(10, 100);
  sheet.setColumnWidth(11, 110);
  sheet.setColumnWidth(12, 100);
  sheet.setColumnWidth(13, 110);
  sheet.setColumnWidth(10, 240);
  sheet.setColumnWidth(11, 420);
  sheet.setColumnWidth(12, 360);
  sheet.setColumnWidth(13, 360);

  var usedRows = Math.max(sheet.getLastRow(), 2);
  var allRange = sheet.getRange(1, 1, usedRows, lastColumn);
  allRange.setWrap(true).setVerticalAlignment('middle');
  if (usedRows >= 3) sheet.getRange(3, 3, usedRows - 2, 1).setNumberFormat('yy.MM.dd HH:mm:ss');

  // 전체입력값(JSON)은 내용이 길어도 행 높이가 늘어나지 않도록 "자르기" 처리한다.
  // 필요할 때 셀을 선택하면 수식 입력줄에서 전체 JSON을 확인할 수 있다.
  sheet.getRange(1, 11, usedRows, 1)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setVerticalAlignment('middle');

  // JSON 때문에 기존 행 높이가 커져 있는 경우에도 새 저장 때마다 자동으로 정상화한다.
  if (usedRows >= 3) sheet.setRowHeights(3, usedRows - 2, 28);
}

function doPost(e) {
  try {
    var p = e.parameter;
    var userCode = p.userCode ? p.userCode.toString().trim().toUpperCase() : "공통";

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(userCode);

    // 동기화는 기록마다 delete/insert하지 않고 한 번의 요청으로 처리한다.
    if (p.action === 'sync') {
      var records = JSON.parse(p.records || '[]');
      if (!Array.isArray(records)) records = [];
      if (!sheet) sheet = ss.insertSheet(userCode);
      ensureConsultSheetLayout_(sheet);
      var existing = sheet.getLastRow() >= 3
        ? sheet.getRange(3, 2, sheet.getLastRow() - 2, 12).getDisplayValues()
        : [];
      var byPhone = {};
      existing.forEach(function(row, index) {
        var key = String(row[0] || '').replace(/\\D/g, '');
        if (key) byPhone[key] = index + 3;
      });
      records.forEach(function(record) {
        var key = String(record.phone || '').replace(/\\D/g, '');
        var savedAt = record.savedAt ? new Date(record.savedAt) : new Date();
        if (isNaN(savedAt.getTime())) savedAt = new Date();
        var rowData = ["", record.phone || "", savedAt, record.name || "", record.needDate || "", record.needAmount || "", record.loanType || "", record.memo || "", record.broker || "", record.futureSummary || "", record.inputSnapshot || "", record.propertyInfo || "", record.heldLoans || ""];
        if (key && byPhone[key]) sheet.getRange(byPhone[key], 1, 1, 13).setValues([rowData]);
        else { sheet.insertRowBefore(3); sheet.getRange(3, 1, 1, 13).setValues([rowData]); }
      });
      formatConsultSheet_(sheet);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, count: records.length })).setMimeType(ContentService.MimeType.JSON);
    }

    // 신규 시트 개설 시 확장된 레이아웃 헤더 적용
    if (!sheet) {
      sheet = ss.insertSheet(userCode);
      sheet.appendRow(["구분", "연락처", "최초상담일시", "이름", "필요일자", "필요금액", "대출구분", "상담내용", "중개업소", "장래예상 요약", "전체입력값(JSON)", "물건지정보", "보유대출"]);
      sheet.appendRow(["-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"]);
      formatConsultSheet_(sheet);
      sheet.setFrozenRows(2);
    }
    ensureConsultSheetLayout_(sheet);

    // 저장일시는 시트 표시용 Date 객체로 기록하고, 표시 형식은 yy.MM.dd HH:mm:ss로 고정한다.
    var savedAt = p.dateTime ? new Date(p.dateTime) : new Date();
    if (isNaN(savedAt.getTime())) savedAt = new Date();

    // 확장된 데이터 열 구조 배치
    var rowData = [
      "",
      p.phone,
      savedAt,
      p.name,
      p.needDate,
      p.needAmount,
      p.loanType,
      p.memo,
      p.broker,
      p.futureSummary || p.futureIncome || "",
      p.inputSnapshot || "",
      p.propertyInfo || "",
      p.heldLoans || ""
    ];

    sheet.insertRowBefore(3);
    sheet.getRange(3, 1, 1, 13).setValues([rowData]);
    sheet.getRange(3, 3).setNumberFormat('yy.MM.dd HH:mm:ss');
    formatConsultSheet_(sheet);
    
    return ContentService.createTextOutput("성공").setMimeType(ContentService.MimeType.TEXT);
  } catch (error) {
    return ContentService.createTextOutput("Error: " + error.toString()).setMimeType(ContentService.MimeType.TEXT);
  }
}