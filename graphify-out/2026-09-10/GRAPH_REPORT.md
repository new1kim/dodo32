# Graph Report - dodo32  (2026-09-10)

## Corpus Check
- 1952 files · ~131,237 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 239 nodes · 470 edges · 20 communities (17 shown, 3 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b30a7350`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DSR_calculator_ui.js
- What You Must Do When Invoked
- applySlotSnapshot
- build_office_price_data.py
- DSR_calculator_logic.js
- gate-auth.js
- DSR_calculator_logic.min.js
- saveDSRInputs
- getStoredJson
- manifest.json
- obfuscate.js
- init
- nocache_server.py
- devDependencies
- CLAUDE.md
- .claude/CLAUDE.md
- showBubble
- setupNeedDatePicker
- saveFormToSlot
- handleTableOrderBtnClick

## God Nodes (most connected - your core abstractions)
1. `showBubble()` - 20 edges
2. `init()` - 16 edges
3. `자동계산()` - 15 edges
4. `saveDSRInputs()` - 15 edges
5. `applySlotSnapshot()` - 12 edges
6. `What You Must Do When Invoked` - 12 edges
7. `자동계산()` - 11 edges
8. `getRowEls()` - 11 edges
9. `applyOtherRowsBlock()` - 11 edges
10. `/graphify` - 11 edges

## Surprising Connections (you probably didn't know these)
- `자동계산()` --indirect_call--> `adjustDsrMaxFontSize()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js
- `자동계산()` --indirect_call--> `adjustDsrToggleFontSize()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js
- `자동계산()` --indirect_call--> `adjustTableFontSize()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js
- `자동계산()` --indirect_call--> `fitAllNumericInputFontSizes()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js

## Import Cycles
- None detected.

## Communities (20 total, 3 thin omitted)

### Community 0 - "DSR_calculator_ui.js"
Cohesion: 0.05
Nodes (36): ageInput, applyRateCheck, APT_PRICE_FIELD_LABELS, baseDeclareAmountInput, baseDeclareConvertedOutput, baseDeclareInputGroup, baseDeclareTypeRadios, baseEstimateLabel (+28 more)

### Community 1 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 2 - "applySlotSnapshot"
Cohesion: 0.19
Nodes (26): applyBaseIncomeMode(), applyIncomeRowMode(), applyOtherRowsBlock(), applySlotSnapshot(), autoResizeMemoTextarea(), calcDeclareConvertedIncome(), extraIncomeRowIndexes(), getRowEls() (+18 more)

### Community 3 - "build_office_price_data.py"
Cohesion: 0.31
Nodes (9): build_floor_label(), convert(), find_source_xlsx(), main(), OP_gongsi/ 폴더 안의 .xlsx 파일을 자동으로 찾는다. 매년 파일명이 "상업용건물 및 오피스텔 기준시가(2027년 1월 1일…, 건물층구분코드가 '지하층'이면 층 번호 앞에 'B'를 붙인다. (지상층/옥탑층은 원본 층 번호를 그대로 쓴다), gonsi.html의 `const OFFICE_DATA_YEAR = '2026';` 값을 새 연도로 자동 갱신한다. (매년 이 상수 갱신을…, update_gonsi_html_year() (+1 more)

### Community 4 - "DSR_calculator_logic.js"
Cohesion: 0.24
Nodes (15): applyRatioResultStyle(), buildScheduleRow(), calculateLtvMaxAmount(), formatKoreanAmount(), generateSchedule(), getGraceAdjustedTerm(), getLtvMaxLimitByMarketPrice(), resetDsrMaxBlocks() (+7 more)

### Community 5 - "gate-auth.js"
Cohesion: 0.27
Nodes (10): backgroundVerifyGate(), callGateAPI(), clearGateSession(), GATE_MESSAGES, getDeviceId(), getEnvSummary(), lockApp(), logUsageBackground() (+2 more)

### Community 6 - "DSR_calculator_logic.min.js"
Cohesion: 0.19
Nodes (18): _0x154f(), _0x414a53, _0x47f1(), applyRatioResultStyle(), buildScheduleRow(), calculateLtvMaxAmount(), formatKoreanAmount(), generateSchedule() (+10 more)

### Community 7 - "saveDSRInputs"
Cohesion: 0.21
Nodes (13): closeModal(), decreaseAmount(), handleDsrMaxBlockClick(), increaseAmount(), saveCustomRates(), saveDefaultFirstRowData(), saveDSRInputs(), saveMortgageRows() (+5 more)

### Community 8 - "getStoredJson"
Cohesion: 0.25
Nodes (11): applySavedTableLayoutOrder(), getModalPanels(), getStoredJson(), hideOtherModalPanels(), openDefaultFirstRowModal(), openImageModal(), openScheduleModal(), openTextModal() (+3 more)

### Community 9 - "manifest.json"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 10 - "obfuscate.js"
Cohesion: 0.25
Nodes (7): code, fs, JavaScriptObfuscator, obfuscationResult, outputPath, path, targetPath

### Community 11 - "init"
Cohesion: 0.25
Nodes (14): adjustDsrMaxFontSize(), adjustDsrToggleFontSize(), adjustTableFontSize(), applyDefaultProfileToRow(), bindLongPress(), bindMortgageRowEvents(), fitAllNumericInputFontSizes(), fitNumericInputFontSize() (+6 more)

### Community 13 - "devDependencies"
Cohesion: 0.50
Nodes (3): javascript-obfuscator, devDependencies, javascript-obfuscator

### Community 16 - "showBubble"
Cohesion: 0.32
Nodes (8): fallbackCopyText(), getMortgageRowMemo(), handleAddIncomeClick(), showBubble(), 내용복사(), 대출정보텍스트생성(), 상담일지로전달(), 화면캡쳐()

### Community 17 - "setupNeedDatePicker"
Cohesion: 0.57
Nodes (7): setupNeedDatePicker(), closeDatePicker(), formatDisplayDate(), formatToCustomDate(), openDatePicker(), parseCustomDate(), renderDatePicker()

### Community 18 - "saveFormToSlot"
Cohesion: 0.50
Nodes (5): formHasContent(), initSlotButtons(), loadFormFromSlot(), refreshSlotButtonStates(), saveFormToSlot()

### Community 19 - "handleTableOrderBtnClick"
Cohesion: 0.67
Nodes (3): handleTableOrderBtnClick(), renderTableOrderButtons(), saveCurrentTableLayoutOrder()

## Knowledge Gaps
- **75 isolated node(s):** `_0x414a53`, `DEFAULT_FIRST_ROW_FIELD_IDS`, `APT_PRICE_FIELD_LABELS`, `DEFAULT_LOAN_RATE_TABLE`, `savedRates` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `자동계산()` connect `DSR_calculator_logic.min.js` to `init`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `setupNeedDatePicker()` connect `setupNeedDatePicker` to `DSR_calculator_ui.js`, `init`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `adjustTableFontSize()` connect `init` to `DSR_calculator_ui.js`, `applySlotSnapshot`, `DSR_calculator_logic.min.js`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `자동계산()` (e.g. with `applyRatioResultStyle()` and `calculateLtvMaxAmount()`) actually correct?**
  _`자동계산()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **What connects `_0x414a53`, `DEFAULT_FIRST_ROW_FIELD_IDS`, `APT_PRICE_FIELD_LABELS` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DSR_calculator_ui.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._