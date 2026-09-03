# Graph Report - dodo32  (2026-08-23)

## Corpus Check
- 14 files · ~66,348 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 192 nodes · 371 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- DSR_calculator_ui.js
- What You Must Do When Invoked
- showBubble
- DSR_calculator_logic.min.js
- DSR_calculator_logic.js
- gate-auth.js
- fitAllNumericInputFontSizes
- saveDSRInputs
- bindMortgageRowEvents
- obfuscate.js
- adjustTableFontSize
- nocache_server.py
- devDependencies
- CLAUDE.md
- .claude/CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `showBubble()` - 15 edges
2. `자동계산()` - 14 edges
3. `init()` - 14 edges
4. `saveDSRInputs()` - 13 edges
5. `What You Must Do When Invoked` - 12 edges
6. `자동계산()` - 11 edges
7. `/graphify` - 11 edges
8. `applyOtherRowsBlock()` - 10 edges
9. `getRowEls()` - 9 edges
10. `applyIncomeRowMode()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `자동계산()` --indirect_call--> `adjustDsrToggleFontSize()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js
- `자동계산()` --indirect_call--> `adjustTableFontSize()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js
- `자동계산()` --indirect_call--> `fitAllNumericInputFontSizes()`  [INFERRED]
  DSR_calculator_logic.min.js → DSR_calculator_ui.js

## Import Cycles
- None detected.

## Communities (15 total, 3 thin omitted)

### Community 0 - "DSR_calculator_ui.js"
Cohesion: 0.06
Nodes (30): ageInput, applyRateCheck, baseDeclareAmountInput, baseDeclareConvertedOutput, baseDeclareInputGroup, baseDeclareTypeRadios, baseEstimateLabel, baseIncomeInput (+22 more)

### Community 1 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 2 - "showBubble"
Cohesion: 0.16
Nodes (30): applyBaseIncomeMode(), applyIncomeRowMode(), applyOtherRowsBlock(), calcDeclareConvertedIncome(), closeModal(), extraIncomeRowIndexes(), fallbackCopyText(), getRowEls() (+22 more)

### Community 3 - "DSR_calculator_logic.min.js"
Cohesion: 0.19
Nodes (18): _0x1cbf(), _0x3686ed, _0x550d(), applyRatioResultStyle(), buildScheduleRow(), calculateLtvMaxAmount(), formatKoreanAmount(), generateSchedule() (+10 more)

### Community 4 - "DSR_calculator_logic.js"
Cohesion: 0.24
Nodes (15): applyRatioResultStyle(), buildScheduleRow(), calculateLtvMaxAmount(), formatKoreanAmount(), generateSchedule(), getGraceAdjustedTerm(), getLtvMaxLimitByMarketPrice(), resetDsrMaxBlocks() (+7 more)

### Community 5 - "gate-auth.js"
Cohesion: 0.27
Nodes (10): backgroundVerifyGate(), callGateAPI(), clearGateSession(), GATE_MESSAGES, getDeviceId(), getEnvSummary(), lockApp(), logUsageBackground() (+2 more)

### Community 6 - "fitAllNumericInputFontSizes"
Cohesion: 0.33
Nodes (11): fitAllNumericInputFontSizes(), getModalPanels(), hideOtherModalPanels(), openDefaultFirstRowModal(), openImageModal(), openRateEditModal(), openScheduleModal(), openTextModal() (+3 more)

### Community 7 - "saveDSRInputs"
Cohesion: 0.24
Nodes (10): decreaseAmount(), handleDsrMaxBlockClick(), increaseAmount(), saveDSRInputs(), saveMortgageRows(), setFirstRowRepaymentType(), setMortgageRepaymentType(), setupDSRAutoSave() (+2 more)

### Community 8 - "bindMortgageRowEvents"
Cohesion: 0.36
Nodes (8): applyDefaultProfileToRow(), bindLongPress(), bindMortgageRowEvents(), getDefaultProfileValues(), getStoredJson(), loadMortgageRows(), updateMortgagePlaceholders(), 주담대행추가()

### Community 10 - "obfuscate.js"
Cohesion: 0.25
Nodes (7): code, fs, JavaScriptObfuscator, obfuscationResult, outputPath, path, targetPath

### Community 11 - "adjustTableFontSize"
Cohesion: 0.53
Nodes (6): adjustDsrMaxFontSize(), adjustDsrToggleFontSize(), adjustTableFontSize(), fitNumericInputFontSize(), getMeasureGhost(), shrinkFontSizeToFit()

### Community 13 - "devDependencies"
Cohesion: 0.50
Nodes (3): javascript-obfuscator, devDependencies, javascript-obfuscator

## Knowledge Gaps
- **61 isolated node(s):** `_0x3686ed`, `DEFAULT_FIRST_ROW_FIELD_IDS`, `DEFAULT_LOAN_RATE_TABLE`, `savedRates`, `baseIncomeInput` (+56 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `자동계산()` connect `DSR_calculator_logic.min.js` to `adjustTableFontSize`, `fitAllNumericInputFontSizes`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `fitAllNumericInputFontSizes()` connect `fitAllNumericInputFontSizes` to `DSR_calculator_ui.js`, `showBubble`, `DSR_calculator_logic.min.js`, `bindMortgageRowEvents`, `adjustTableFontSize`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `adjustTableFontSize()` connect `adjustTableFontSize` to `DSR_calculator_ui.js`, `bindMortgageRowEvents`, `showBubble`, `DSR_calculator_logic.min.js`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `자동계산()` (e.g. with `applyRatioResultStyle()` and `getGraceAdjustedTerm()`) actually correct?**
  _`자동계산()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `_0x3686ed`, `DEFAULT_FIRST_ROW_FIELD_IDS`, `DEFAULT_LOAN_RATE_TABLE` to the rest of the system?**
  _61 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DSR_calculator_ui.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._