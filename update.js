const { Octokit } = require("@octokit/rest");

// 分別使用兩個不同帳號的 Token 授權
const octokit88ll88 = new Octokit({ auth: process.env.PAT_88LL88 });
const octokit88l88  = new Octokit({ auth: process.env.PAT_88L88 });

// 四個目標倉庫、檔案與對應的變數名稱
const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' },
  { owner: '88l88',  repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88l88',  repo: '888', path: 'ddd.js', varName: 'ddd' }
];

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行四倉庫同步更新檢查...`);
    let targetDate = "2026-11-07"; 
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
    // 依據擁有者自動切換對應的 Octokit 實例
    const activeOctokit = (owner === '88ll88') ? octokit88ll88 : octokit88l88;
  
    try {
        const res = await activeOctokit.repos.getContent({ owner, repo, path });
        const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
        const sha = res.data.sha;

        const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*\\]);?`);
        const match = content.match(regex);
        if (!match) {
            console.error(`[錯誤] 找不到變數 ${varName} 於 ${owner}/${repo}/${path}`);
            return;
        }

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
        let encodedContent = Buffer.from(newContent, 'utf-8').toString('base64');

        await activeOctokit.repos.createOrUpdateFileContents({
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
