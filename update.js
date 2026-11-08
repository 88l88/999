const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GH_PAT });

const OWNER = '88ll88';
const REPO = '999';
const PATH = 'vvv.js';
const VAR_NAME = 'vvv';

const MAX_ATTEMPTS = 3;
const SHUN_INTERVAL_MS = 1 * 60 * 1000;   // 順球：每 1 分鐘
const LUOQIU_INTERVAL_MS = 3 * 60 * 1000; // 落球：每 3 分鐘

async function main() {
    // 強制指定測試目標日期為 2026-11-07（避免伺服器時區誤判）
    let targetDate = "2026-11-07"; 
    console.log(`[${new Date().toISOString()}] 開始執行，強制指定目標日期: ${targetDate}`);

    try {
        let fileData = await getFileContent();
        let records = fileData.records;
        let sha = fileData.sha;

        let topRecord = records[0];
        let topDate = topRecord[0];
        let topVal = topRecord[2];

        // 檢查是否直接從落球開始（條件：日期相符且標記為 1）
        if (topDate === targetDate && topVal === 1) {
            console.log(`[檢查] 發現 vvv[0][2] = 1，順球已完成，直接從落球開始...`);
            let success = await retryLuoqiu(records, sha, targetDate);
            if (success) return;
            console.log(`[結束] 落球重試 3 次皆失敗，關閉等待下個排程。`);
            return;
        }

        console.log(`[檢查] 從順球階段開始...`);
        let shunSuccess = await retryShun(records, sha, targetDate);
        if (shunSuccess) {
            let updatedData = await getFileContent();
            await retryLuoqiu(updatedData.records, updatedData.sha, targetDate);
        } else {
            console.log(`[結束] 順球重試 3 次皆失敗，關閉等待下個排程。`);
        }

    } catch (e) {
        console.error(`執行發生錯誤:`, e.message);
    }
}

// 順球重試邏輯
async function retryShun(records, sha, targetDate) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`[順球] 第 ${attempt} 次嘗試抓取...`);
        let shun = await fetchShunPilio(targetDate);
        
        if (shun && shun.length === 5) {
            console.log(`[順球成功] 取得號碼: ${shun.join(', ')}`);
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

        console.log(`[順球失敗] 第 ${attempt} 次未成功`);
        if (attempt < MAX_ATTEMPTS) {
            console.log(`等待 1 分鐘後再次嘗試順球...`);
            await new Promise(r => setTimeout(r, SHUN_INTERVAL_MS));
            let fresh = await getFileContent();
            records = fresh.records;
            sha = fresh.sha;
        }
    }
    return false;
}

// 落球重試邏輯
async function retryLuoqiu(records, sha, targetDate) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`[落球] 第 ${attempt} 次嘗試抓取...`);
        let luoqiu = await fetchLuoqiu9800(targetDate);
        
        if (luoqiu && luoqiu.length === 5) {
            console.log(`[落球成功] 取得號碼: ${luoqiu.join(', ')}`);
            records[0] = [targetDate, luoqiu];
            await saveFile(records, sha);
            return true;
        }

        console.log(`[落球失敗] 第 ${attempt} 次未成功`);
        if (attempt < MAX_ATTEMPTS) {
            console.log(`等待 3 分鐘後再次嘗試落球...`);
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
        message: `auto: update vvv.js`,
        content: encodedContent,
        sha: sha
    });
    console.log(`[已儲存檔案] ${PATH}`);
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

// 精準抓取 9800 落球序：鎖定 2026-11-07，抓取其後方表格中的落球序號碼
async function fetchLuoqiu9800(targetDate) {
    try {
        let res = await fetch('http://www.9800.com.tw/lotto539/');
        let text = await res.text();
        let [y, m, d] = targetDate.split('-');
        let targetFull = `${y}-${m}-${d}`; // "2026-11-07"
        let targetShort = `${m}-${d}`;     // "11-07"
        
        let idx = text.indexOf(targetFull);
        if (idx === -1) {
            idx = text.indexOf(targetShort);
        }
        if (idx === -1) return null;

        // 從找到的日期往後擷取 800 字元
        let sub = text.substring(idx, idx + 800);
        
        // 尋找所有的 <font color="..."> 或是直接抓出該行所有的數字
        let matches = sub.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (matches && matches.length >= 15) {
            // 9800 該行結構會包含：期次、日期、排序號碼(5個)、落球序號碼(5個)
            // 取最後 5 個數字即為落球序
            let luoqiu = matches.slice(matches.length - 5);
            if (luoqiu.length === 5) return luoqiu;
        }
    } catch (e) {}
    return null;
}

main();
