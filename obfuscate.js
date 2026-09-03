const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// 1. 원본 파일 경로와 난독화된 파일이 저장될 경로 설정
// 현재 폴더(__dirname)에 있는 DSR_calculator_logic.js를 타겟으로 잡습니다.
const targetPath = path.resolve(__dirname, 'DSR_calculator_logic.js'); 
// 원본을 보호하기 위해 이름 끝에 .min.js를 붙여 새로운 파일로 뽑아냅니다.
const outputPath = path.resolve(__dirname, 'DSR_calculator_logic.min.js'); 

// 파일이 실제로 있는지 확인
if (!fs.existsSync(targetPath)) {
    console.error('❌ 원본 파일(DSR_calculator_logic.js)을 찾을 수 없습니다.');
    process.exit(1);
}

// 2. 원본 코드 읽어오기
const code = fs.readFileSync(targetPath, 'utf8');

// 3. 난독화 옵션 적용 (강력한 수준)
const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
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
});

// 4. 난독화된 코드를 "새로운 파일(outputPath)"로 저장
fs.writeFileSync(outputPath, obfuscationResult.getObfuscatedCode(), 'utf8');

console.log('✨ 성공! 난독화된 DSR_calculator_logic.min.js 파일이 생성되었습니다.');

// Main 파일에 파일 연결할떄 .min 붙여야 함
//  터미널에  아래 코드 붙여 넣으면 난독화 작업 시작됨
// node obfuscate.js