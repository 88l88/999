const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GH_PAT });

const OWNER = '88ll88';
const REPO = '999';
const PATH = 'vvv.js';
const VAR_NAME = 'vvv';

const MAX_ATTEMPTS = 3;
const SHUN_INTERVAL_MS = 1 * 60 * 1000;   // 順球：每 1 分鐘
const LUOQIU_INTERVAL_MS = 3 * 60 * 1000; // 落球：每 3 分鐘

// 取得格式化的台灣時間字串 (用於 Log)
function getTaiwanTimestamp() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));
    let yyyy = twTime.getFullYear();
    let mm = String(twTime.getMonth() + 1).padStart(2, '0');
    let dd = String(twTime.getDate()).padStart(2, '0');
    let hh = String(twTime.getHours()).padStart(2, '0');
    let min = String(twTime.getMinutes()).padStart(2, '0');
    let ss = String(twTime.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

async function main() {
    let targetDate = "2026-11-07"; 
    console.log(`[${getTaiwanTimestamp()}] [啟動] 開始執行自動更新程式，目標日期鎖定: ${targetDate}`);

    try {
        let fileData = await getFileContent();
        let records = fileData.records;
        let sha = fileData.sha;

        let topRecord = records[0];
        let topDate = topRecord[0];
        let topVal = topRecord[2];

        if (topDate === targetDate && topVal === 1) {
            console.log(`[${getTaiwanTimestamp()}] [檢查] 發現 vvv[0][2] = 1，順球已完成，直接從落球階段開始...`);
            let success = await retryLuoqiu(records, sha, targetDate);
            if (success) {
                console.log(`[${getTaiwanTimestamp()}] [完成] 本次排程順利結束（僅執行落球）。`);
                return;
            }
            console.log(`[${getTaiwanTimestamp()}] [結束] 落球重試 3 次皆失敗。`);
            return;
        }

        console.log(`[${getTaiwanTimestamp()}] [檢查] 從順球階段開始...`);
        let shunSuccess = await retryShun(records, sha, targetDate);
        if (shunSuccess) {
            console.log(`[${getTaiwanTimestamp()}] [轉換] 順球完成，準備進入落球階段...`);
            let updatedData = await getFileContent();
            await retryLuoqiu(updatedData.records, updatedData.sha, targetDate);
        } else {
            console.log(`[${getTaiwanTimestamp()}] [結束] 順球重試 3 次皆失敗。`);
        }

    } catch (e) {
        console.error(`[${getTaiwanTimestamp()}] [錯誤] 執行發生例外錯誤:`, e.message);
    }
}

async function retryShun(records, sha, targetDate) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`[${getTaiwanTimestamp()}] [順球] 第 ${attempt} 次嘗試抓取 (目標日期: ${targetDate})...`);
        let shun = await fetchShunPilio(targetDate);
        
        if (shun && shun.length === 5) {
            console.log(`[${getTaiwanTimestamp()}] [順球成功] 取得號碼: ${shun.join(', ')}`);
            let topRecord = records[0];
            let topDate = topRecord[0];

            if (topDate === targetDate) {
                records[0] = [targetDate, shun, 1];
            } else {
                records.unshift([targetDate, shun, 1]);
            }
            await saveFile(records, sha);
            return true;
        }

        console.log(`[${getTaiwanTimestamp()}] [順球失敗] 第 ${attempt} 次未抓到有效號碼`);
        if (attempt < MAX_ATTEMPTS) {
            console.log(`[${getTaiwanTimestamp()}] [等待] 將於 1 分鐘後進行第 ${attempt + 1} 次重試...`);
            await new Promise(r => setTimeout(r, SHUN_INTERVAL_MS));
            let fresh = await getFileContent();
            records = fresh.records;
            sha = fresh.sha;
        }
    }
    return false;
}

async function retryLuoqiu(records, sha, targetDate) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`[${getTaiwanTimestamp()}] [落球] 第 ${attempt} 次嘗試抓取 (目標日期: ${targetDate})...`);
        let luoqiu = await fetchLuoqiu9800(targetDate);
        
        if (luoqiu && luoqiu.length === 5) {
            console.log(`[${getTaiwanTimestamp()}] [落球成功] 取得號碼: ${luoqiu.join(', ')}`);
            records[0] = [targetDate, luoqiu];
            await saveFile(records, sha);
            return true;
        }

        console.log(`[${getTaiwanTimestamp()}] [落球失敗] 第 ${attempt} 次未抓到有效號碼`);
        if (attempt < MAX_ATTEMPTS) {
            console.log(`[${getTaiwanTimestamp()}] [等待] 將於 3 分鐘後進行第 ${attempt + 1} 次重試...`);
            await new Promise(r => setTimeout(r, LUOQIU_INTERVAL_MS));
            let fresh = await getFileContent();
            records = fresh.records;
            sha = fresh.sha;
        }
    }
    return false;
}

async function getFileContent() {
    let res = await octokit.repos.getContent({ owner: OWNER, repo: REPO, path: PATH });
    let content = Buffer.from(res.data.content, 'base64').toString('utf-8');
    let sha = res.data.sha;
    let regex = new RegExp(`var\\s+${VAR_NAME}\\s*=\\s*(\\[[\\s\\S]*\\]);?`);
    let match = content.match(regex);
    let records = eval('(' + match[1] + ')');
    return { records, sha };
}

async function saveFile(records, sha) {
    let rows = records.map(r => {
        let dateStr = r[0];
        let nums = r[1].map(n => `'${n}'`).join(',');
        if (r.length === 3 && r[2] === 1) {
            return `  ['${dateStr}',[${nums}],1]`;
        }
        return `  ['${dateStr}',[${nums}]]`;
    }).join(',\n');

    let newContent = `var ${VAR_NAME} = [\n${rows}\n];\n`;
    let encodedContent = Buffer.from(newContent, 'utf-8').toString('base64');

    await octokit.repos.createOrUpdateFileContents({
        owner: OWNER,
        repo: REPO,
        path: PATH,
        message: `auto: update vvv.js with logs`,
        content: encodedContent,
        sha: sha
    });
    console.log(`[${getTaiwanTimestamp()}] [儲存成功] 已成功寫入並更新 ${PATH}`);
}

async function fetchShunPilio(targetDate) {
    try {
        let res = await fetch('https://www.pilio.idv.tw/lto539/list.asp');
        let text = await res.text();
        let [y, m, d] = targetDate.split('-');
        let targetStr = `${m}/${d}`;
        
        let idx = text.indexOf(targetStr);
        if (idx === -1) return null;

        let sub = text.substring(idx, idx + 600);
        let numCellMatch = sub.match(/class="number-cell"[^>]*>([\s\S]*?)<\/td>/);
        if (numCellMatch) {
            let numText = numCellMatch[1];
            let matches = numText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
            if (matches && matches.length >= 5) {
                return matches.slice(0, 5);
            }
        }
    } catch (e) {}
    return null;
}

async function fetchLuoqiu9800(targetDate) {
    try {
        let res = await fetch('http://www.9800.com.tw/lotto539/');
        let text = await res.text();
        let [y, m, d] = targetDate.split('-');
        let targetFull = `${y}-${m}-${d}`;
        
        let idx = text.indexOf(targetFull);
        if (idx === -1) return null;

        let trSub = text.substring(idx - 100, idx + 500);
        let tds = trSub.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (tds && tds.length >= 4) {
            let fourthTd = tds[3];
            let matches = fourthTd.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
            if (matches && matches.length >= 5) {
                return matches.slice(0, 5);
            }
        }
    } catch (e) {}
    return null;
}

main();
