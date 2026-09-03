# Graph Report - dodo32  (2026-09-03)

## Corpus Check
- 15 files · ~94,980 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 221 nodes · 434 edges · 18 communities (15 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- DSR_calculator_ui.js
- What You Must Do When Invoked
- applySlotSnapshot
- DSR_calculator_logic.min.js
- DSR_calculator_logic.js
- gate-auth.js
- fitAllNumericInputFontSizes
- showBubble
- 주담대행추가
- manifest.json
- obfuscate.js
- init
- nocache_server.py
- devDependencies
- CLAUDE.md
- .claude/CLAUDE.md
- 대출정보텍스트생성
- handleTableOrderBtnClick

## God Nodes (most connected - your core abstractions)
1. `showBubble()` - 20 edges
2. `saveDSRInputs()` - 15 edges
3. `init()` - 15 edges
4. `자동계산()` - 14 edges
5. `applySlotSnapshot()` - 12 edges
6. `What You Must Do When Invoked` - 12 edges
7. `자동계산()` - 11 edges
8. `getRowEls()` - 11 edges
9. `applyOtherRowsBlock()` - 11 edges
10. `/graphify` - 11 edges

## Surprising Connections (you probably didn't know these)
- `자동계산()` --indirect_call--> `adjustDsrMaxFontSize()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js
- `자동계산()` --indirect_call--> `adjustTableFontSize()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js
- `자동계산()` --indirect_call--> `fitAllNumericInputFontSizes()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js

## Import Cycles
- None detected.

## Communities (18 total, 3 thin omitted)

### Community 0 - "DSR_calculator_ui.js"
Cohesion: 0.06
Nodes (33): ageInput, applyRateCheck, APT_PRICE_FIELD_LABELS, baseDeclareAmountInput, baseDeclareConvertedOutput, baseDeclareInputGroup, baseDeclareTypeRadios, baseEstimateLabel (+25 more)

### Community 1 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 2 - "applySlotSnapshot"
Cohesion: 0.16
Nodes (29): applyBaseIncomeMode(), applyIncomeRowMode(), applyOtherRowsBlock(), applySlotSnapshot(), bindRadioToggleGroup(), buildIncomeRowHTML(), calcDeclareConvertedIncome(), extraIncomeRowIndexes() (+21 more)

### Community 3 - "DSR_calculator_logic.min.js"
Cohesion: 0.19
Nodes (18): _0x44a4a4, _0x5dcf(), _0x88be(), applyRatioResultStyle(), buildScheduleRow(), calculateLtvMaxAmount(), formatKoreanAmount(), generateSchedule() (+10 more)

### Community 4 - "DSR_calculator_logic.js"
Cohesion: 0.24
Nodes (15): applyRatioResultStyle(), buildScheduleRow(), calculateLtvMaxAmount(), formatKoreanAmount(), generateSchedule(), getGraceAdjustedTerm(), getLtvMaxLimitByMarketPrice(), resetDsrMaxBlocks() (+7 more)

### Community 5 - "gate-auth.js"
Cohesion: 0.27
Nodes (10): backgroundVerifyGate(), callGateAPI(), clearGateSession(), GATE_MESSAGES, getDeviceId(), getEnvSummary(), lockApp(), logUsageBackground() (+2 more)

### Community 6 - "fitAllNumericInputFontSizes"
Cohesion: 0.33
Nodes (11): fitAllNumericInputFontSizes(), getModalPanels(), hideOtherModalPanels(), openDefaultFirstRowModal(), openImageModal(), openRateEditModal(), openScheduleModal(), openTextModal() (+3 more)

### Community 7 - "showBubble"
Cohesion: 0.13
Nodes (21): closeModal(), decreaseAmount(), fallbackCopyText(), handleAddIncomeClick(), handleDsrMaxBlockClick(), increaseAmount(), initSlotButtons(), refreshSlotButtonStates() (+13 more)

### Community 8 - "주담대행추가"
Cohesion: 0.31
Nodes (9): applyDefaultProfileToRow(), applySavedTableLayoutOrder(), bindLongPress(), bindMortgageRowEvents(), getDefaultProfileValues(), getStoredJson(), loadMortgageRows(), updateMortgagePlaceholders() (+1 more)

### Community 9 - "manifest.json"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 10 - "obfuscate.js"
Cohesion: 0.25
Nodes (7): code, fs, JavaScriptObfuscator, obfuscationResult, outputPath, path, targetPath

### Community 11 - "init"
Cohesion: 0.52
Nodes (7): adjustDsrMaxFontSize(), adjustDsrToggleFontSize(), adjustTableFontSize(), fitNumericInputFontSize(), getMeasureGhost(), init(), shrinkFontSizeToFit()

### Community 13 - "devDependencies"
Cohesion: 0.50
Nodes (3): javascript-obfuscator, devDependencies, javascript-obfuscator

### Community 16 - "대출정보텍스트생성"
Cohesion: 0.67
Nodes (3): getMortgageRowMemo(), 대출정보텍스트생성(), 상담일지로전달()

### Community 17 - "handleTableOrderBtnClick"
Cohesion: 0.67
Nodes (3): handleTableOrderBtnClick(), renderTableOrderButtons(), saveCurrentTableLayoutOrder()

## Knowledge Gaps
- **74 isolated node(s):** `_0x44a4a4`, `DEFAULT_FIRST_ROW_FIELD_IDS`, `APT_PRICE_FIELD_LABELS`, `DEFAULT_LOAN_RATE_TABLE`, `savedRates` (+69 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `자동계산()` connect `DSR_calculator_logic.min.js` to `init`, `fitAllNumericInputFontSizes`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `fitAllNumericInputFontSizes()` connect `fitAllNumericInputFontSizes` to `DSR_calculator_ui.js`, `init`, `DSR_calculator_logic.min.js`, `주담대행추가`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `adjustTableFontSize()` connect `init` to `DSR_calculator_ui.js`, `주담대행추가`, `applySlotSnapshot`, `DSR_calculator_logic.min.js`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `자동계산()` (e.g. with `applyRatioResultStyle()` and `calculateLtvMaxAmount()`) actually correct?**
  _`자동계산()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `_0x44a4a4`, `DEFAULT_FIRST_ROW_FIELD_IDS`, `APT_PRICE_FIELD_LABELS` to the rest of the system?**
  _74 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DSR_calculator_ui.js` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._