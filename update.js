const fs = require('fs');
const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GH_PAT });

const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' },
  { owner: '88l88',  repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88l88',  repo: '888', path: 'ddd.js', varName: 'ddd' }
];

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行更新檢查...`);
    let targetDate = "2026-11-07"; // 或使用 getTargetDrawDate()
    let shun = await fetchLotteryShun(targetDate);
    
    if (!shun || shun.length !== 5) {
        console.log(`[${targetDate}] 尚未開獎或資料不完全，略過。`);
        return;
    }

    for (const target of TARGET_FILES) {
        await updateSingleRepository(target, targetDate, shun);
    }
}

async function updateSingleRepository(target, targetDate, shun) {
    const { owner, repo, path, varName } = target;
    try {
        const res = await octokit.repos.getContent({ owner, repo, path });
        const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
        const sha = res.data.sha;

        const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*\\]);?`);
        const match = content.match(regex);
        if (!match) return;

        let records = eval('(' + match[1] + ')');
        let topRecord = records[0];
        let topDate = topRecord[0];

        if (topDate < targetDate) {
            records.unshift([targetDate, shun]);
        } else if (topDate === targetDate) {
            topRecord[1] = shun;
        } else {
            return;
        }

        let rows = records.map(r => {
            let dateStr = r[0];
            let shunStr = r[1].map(n => `'${n}'`).join(',');
            return `  ['${dateStr}',[${shunStr}]]`;
        }).join(',\n');

        let newContent = `var ${varName} = [\n${rows}\n];\n`;
        
        // 修正：必須轉換為標準的 Base64 編碼
        let encodedContent = Buffer.from(newContent, 'utf-8').toString('base64');

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: `auto: update ${path} for ${targetDate}`,
            content: encodedContent,
            sha: sha
        });
        console.log(`[成功] 已更新 ${owner}/${repo}/${path}`);
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
    if (hours * 60 + minutes < 1240) twTime.setDate(twTime.getDate() - 1);
    if (twTime.getDay() === 0) twTime.setDate(twTime.getDate() - 1);
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
        const targets = [`${mingGuoYear}/${m}/${d}`, `${targetDate}`, `${mingGuoYear}-${m}-${d}`];
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
            if (shun.length === 5 && !shun.includes('00')) return shun;
        }
    } catch (e) {}
    return null;
}

main();
