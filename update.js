const fs = require('fs');
const { Octokit } = require("@octokit/rest");

// 初始化 Octokit (讀取環境變數中的跨庫寫入 PAT)
const octokit = new Octokit({ auth: process.env.GH_PAT });

// 設定您要同時同步更新的所有目標檔案清單
const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' },
  { owner: '88l88',  repo: '888', path: 'ddd.js', varName: 'ddd' }
];

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行多庫開獎號碼更新檢查...`);

    // 1. 先從當前本地 (或透過網路) 取得最新的順球與目標日期
    let targetDate = getTargetDrawDate();
    let shun = await fetchLotteryShun(targetDate);
    
    if (!shun || shun.length !== 5) {
        console.log(`[${targetDate}] 官方時尚未開獎或順球資料不完全，本次略過。`);
        return;
    }
    console.log(`目標日期: ${targetDate}，成功抓取順球: [${shun.join(',')}]`);

    // 2. 依次更新清單中的每一個 GitHub 倉庫檔案
    for (const target of TARGET_FILES) {
        await updateSingleRepository(target, targetDate, shun);
    }
}

/**
 * 處理單一遠端倉庫檔案的讀取、比對、插入與 Push
 */
async function updateSingleRepository(target, targetDate, shun) {
    const { owner, repo, path, varName } = target;
    console.log(`正在處理目標: ${owner}/${repo}/${path} ...`);

    try {
        // 取得遠端檔案內容與 SHA
        const res = await octokit.repos.getContent({ owner, repo, path });
        const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
        const sha = res.data.sha;

        // 解析變數陣列
        const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*\\]);?`);
        const match = content.match(regex);
        if (!match) {
            console.error(`[${owner}/${repo}/${path}] 格式解析失敗，找不到變數 ${varName}`);
            return;
        }

        let records = eval('(' + match[1] + ')');
        let topRecord = records[0];
        let topDate = topRecord[0];

        // 邏輯判斷
        if (topDate < targetDate) {
            records.unshift([targetDate, shun]);
            console.log(`[${owner}/${repo}] 兩期以上未更新，插入新首列: ${targetDate}`);
        } else if (topDate === targetDate) {
            topRecord[1] = shun;
            console.log(`[${owner}/${repo}] 替換首列 ${targetDate} 順球資料`);
        } else {
            console.log(`[${owner}/${repo}] 首列日期大於目標日期，無需更新。`);
            return;
        }

        // 格式化輸出
        let rows = records.map(r => {
            let dateStr = r[0];
            let shunStr = r[1].map(n => `'${n}'`).join(',');
            return `  ['${dateStr}',[${shunStr}]]`;
        }).join(',\n');

        let newContent = `var ${varName} = [\n${rows}\n];\n`;

        // Push 回 GitHub
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: `auto: update ${path} for ${targetDate}`,
            content: Buffer.from(newContent).toString('utf-8'),
            sha: sha
        });

        console.log(`[成功] 已成功更新並推送至 ${owner}/${repo}/${path}`);
    } catch (e) {
        console.error(`[錯誤] 更新 ${owner}/${repo}/${path} 失敗:`, e.message);
    }
}

function getTargetDrawDate() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));

    let hours = twTime.getHours();
    let minutes = twTime.getMinutes();
    let totalMins = hours * 60 + minutes;

    // 20:40 以前算昨天，之後算今天
    if (totalMins < 1240) {
        twTime.setDate(twTime.getDate() - 1);
    }
    // 周日休息
    if (twTime.getDay() === 0) {
        twTime.setDate(twTime.getDate() - 1);
    }

    let yyyy = twTime.getFullYear();
    let mm = String(twTime.getMonth() + 1).padStart(2, '0');
    let dd = String(twTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchLotteryShun(targetDate) {
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();

        const [y, m, d] = targetDate.split('-');
        const mingGuoYear = parseInt(y) - 1911;
        
        const targets = [
            `${mingGuoYear}/${m}/${d}`,
            `${targetDate}`,
            `${mingGuoYear}-${m}-${d}`
        ];

        let dateIdx = -1;
        for (let t of targets) {
            dateIdx = text.indexOf(t);
            if (dateIdx !== -1) break;
        }

        if (dateIdx === -1) return null;

        const subText = text.substring(dateIdx, dateIdx + 500);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);

        if (!matches || matches.length < 6) return null;

        let mIdx = matches.indexOf(m);
        let dIdx = matches.indexOf(d, mIdx + 1);

        if (dIdx !== -1 && matches.length >= dIdx + 6) {
            let shun = matches.slice(dIdx + 1, dIdx + 6);
            if (shun.length === 5 && !shun.includes('00')) {
                return shun;
            }
        }
    } catch (e) {
        console.error('抓取發生錯誤:', e.message);
    }
    return null;
}

main();
