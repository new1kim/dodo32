# Graph Report - dodo32  (2026-09-05)

## Corpus Check
- 14 files · ~99,607 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 200 nodes · 394 edges · 14 communities (11 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5973e530`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DSR_calculator_ui.js
- What You Must Do When Invoked
- applySlotSnapshot
- DSR_calculator_logic.js
- gate-auth.js
- showBubble
- extraIncomeRowIndexes
- manifest.json
- obfuscate.js
- init
- nocache_server.py
- devDependencies
- CLAUDE.md
- .claude/CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `showBubble()` - 19 edges
2. `saveDSRInputs()` - 15 edges
3. `init()` - 15 edges
4. `applySlotSnapshot()` - 12 edges
5. `What You Must Do When Invoked` - 12 edges
6. `자동계산()` - 11 edges
7. `getRowEls()` - 11 edges
8. `applyOtherRowsBlock()` - 11 edges
9. `/graphify` - 11 edges
10. `extraIncomeRowIndexes()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `applyDefaultProfileToRow()` --calls--> `getStoredJson()`  [EXTRACTED]
  DSR_calculator_ui.js → DSR_calculator_ui.js  _Bridges community 8 → community 11_
- `populateDefaultFirstRowFields()` --calls--> `getStoredJson()`  [EXTRACTED]
  DSR_calculator_ui.js → DSR_calculator_ui.js  _Bridges community 8 → community 0_
- `saveDeclareIncomeRates()` --calls--> `setStoredJson()`  [EXTRACTED]
  DSR_calculator_ui.js → DSR_calculator_ui.js  _Bridges community 7 → community 2_
- `소득행삭제()` --calls--> `adjustTableFontSize()`  [EXTRACTED]
  DSR_calculator_ui.js → DSR_calculator_ui.js  _Bridges community 11 → community 2_
- `openDefaultFirstRowModal()` --calls--> `fitAllNumericInputFontSizes()`  [EXTRACTED]
  DSR_calculator_ui.js → DSR_calculator_ui.js  _Bridges community 11 → community 0_

## Import Cycles
- None detected.

## Communities (14 total, 3 thin omitted)

### Community 0 - "DSR_calculator_ui.js"
Cohesion: 0.06
Nodes (45): ageInput, applyRateCheck, APT_PRICE_FIELD_LABELS, baseDeclareAmountInput, baseDeclareConvertedOutput, baseDeclareInputGroup, baseDeclareTypeRadios, baseEstimateLabel (+37 more)

### Community 1 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 2 - "applySlotSnapshot"
Cohesion: 0.21
Nodes (22): applyBaseIncomeMode(), applyIncomeRowMode(), applyOtherRowsBlock(), applySlotSnapshot(), bindRadioToggleGroup(), buildIncomeRowHTML(), calcDeclareConvertedIncome(), getRowEls() (+14 more)

### Community 4 - "DSR_calculator_logic.js"
Cohesion: 0.24
Nodes (15): applyRatioResultStyle(), buildScheduleRow(), calculateLtvMaxAmount(), formatKoreanAmount(), generateSchedule(), getGraceAdjustedTerm(), getLtvMaxLimitByMarketPrice(), resetDsrMaxBlocks() (+7 more)

### Community 5 - "gate-auth.js"
Cohesion: 0.27
Nodes (10): backgroundVerifyGate(), callGateAPI(), clearGateSession(), GATE_MESSAGES, getDeviceId(), getEnvSummary(), lockApp(), logUsageBackground() (+2 more)

### Community 7 - "showBubble"
Cohesion: 0.12
Nodes (24): closeModal(), decreaseAmount(), fallbackCopyText(), handleAddIncomeClick(), handleDsrMaxBlockClick(), handleTableOrderBtnClick(), increaseAmount(), initSlotButtons() (+16 more)

### Community 8 - "extraIncomeRowIndexes"
Cohesion: 0.27
Nodes (10): applySavedTableLayoutOrder(), extraIncomeRowIndexes(), formHasContent(), getStoredJson(), loadDSRInputs(), loadFormFromSlot(), loadMortgageRows(), renderSelectedAptRow() (+2 more)

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

## Knowledge Gaps
- **73 isolated node(s):** `DEFAULT_FIRST_ROW_FIELD_IDS`, `APT_PRICE_FIELD_LABELS`, `DEFAULT_LOAN_RATE_TABLE`, `savedRates`, `baseIncomeInput` (+68 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `DEFAULT_FIRST_ROW_FIELD_IDS`, `APT_PRICE_FIELD_LABELS`, `DEFAULT_LOAN_RATE_TABLE` to the rest of the system?**
  _73 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DSR_calculator_ui.js` be split into smaller, more focused modules?**
  _Cohesion score 0.057004830917874394 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `showBubble` be split into smaller, more focused modules?**
  _Cohesion score 0.12318840579710146 - nodes in this community are weakly interconnected._