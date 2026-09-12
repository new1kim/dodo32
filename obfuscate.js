const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

/* ─────────────────────────────
   난독화 대상 (두 버전 독립 관리)

   파일 이름 규칙: <접두사>_calculator_logic.js → <접두사>_calculator_logic.min.js
   - Consult 세트 : 상담 탭 (Consult_Main.html)
   - DSR 세트     : DSR 탭  (DSR_Main.html)

   실행: node obfuscate.js            → 두 버전 모두 난독화
        node obfuscate.js Consult     → Consult만
        node obfuscate.js DSR         → DSR만
   ───────────────────────────── */
const ALL_TARGETS = ['Consult', 'DSR'];
const requested = process.argv.slice(2).filter(arg => ALL_TARGETS.includes(arg));
const targets = requested.length ? requested : ALL_TARGETS;

// 난독화 옵션 적용 (강력한 수준)
const obfuscationOptions = {
    compact: true,                        // 코드를 한 줄로 압축
    controlFlowFlattening: true,          // 코드 구조를 꼬아버림
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,              // 가짜 코드를 섞어 방해
    deadCodeInjectionThreshold: 0.4,
    renameGlobals: false,
    selfDefending: true,
    stringArray: true,                    // 문자열 암호화
    stringArrayEncoding: ['base64'],
    unicodeEscapeSequence: false
};

let hasError = false;

targets.forEach(prefix => {
    const sourceName = `${prefix}_calculator_logic.js`;
    const outputName = `${prefix}_calculator_logic.min.js`;
    const targetPath = path.resolve(__dirname, sourceName);
    const outputPath = path.resolve(__dirname, outputName);

    // 파일이 실제로 있는지 확인
    if (!fs.existsSync(targetPath)) {
        console.error(`❌ 원본 파일(${sourceName})을 찾을 수 없습니다.`);
        hasError = true;
        return;
    }

    try {
        // 원본 코드 읽어오기 → 난독화 → .min.js로 저장
        const code = fs.readFileSync(targetPath, 'utf8');
        const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
        fs.writeFileSync(outputPath, obfuscationResult.getObfuscatedCode(), 'utf8');
        console.log(`✨ 성공! 난독화된 ${outputName} 파일이 생성되었습니다.`);
    } catch (err) {
        console.error(`❌ ${sourceName} 난독화 실패:`, err.message);
        hasError = true;
    }
});

console.log('');
console.log('📌 난독화한 뒤 할 일');
console.log('   1) 각 Main HTML의 <script> 주소를 .min.js 로 바꾼다');
console.log('        Consult_Main.html : Consult_calculator_logic.js → .min.js');
console.log('        DSR_Main.html     : DSR_calculator_logic.js     → .min.js');
console.log('   2) AssetSyncManager.FILES 의 로직 파일 이름도 .min.js 로 바꾼다');
console.log('');
console.log('   (지금은 난독화 전 원본(.js)을 참조하도록 맞춰둔 상태입니다.)');

if (hasError) process.exit(1);