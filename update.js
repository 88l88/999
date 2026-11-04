const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行 7788.js 更新檢查...`);

    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        console.error('無法讀取 7788.js:', e.message);
        process.exit(1);
    }

    const match = content.match(/var\s+7788\s*=\s*(\[[\s\S]*\]);?/);
    if (!match) {
        console.error('7788.js 格式解析失敗');
        process.exit(1);
    }

    let records = eval('(' + match[1] + ')');
    let topRecord = records[0];
    let topDate = topRecord[0];

    let targetDate = getTargetDrawDate();
    console.log(`目標日期: ${targetDate}，7788.js 首列日期: ${topDate}`);

    let shun = await fetchLotteryShun(targetDate);
    if (!shun || shun.length !== 5) {
        console.log(`[${targetDate}] 官方時尚未開獎或順球資料不完全。`);
        return;
    }

    // 邏輯判斷：
    // 1. 若首列日期小於目標日期（落後兩期以上）：插入新列 ['日期', ['順球']]
    if (topDate < targetDate) {
        records.unshift([targetDate, shun]);
        console.log(`[兩期以上未更新] 插入新首列: ${targetDate} [${shun.join(',')}]`);
    } 
    // 2. 若首列日期剛好等於目標日期：直接替換首列的順球（落球直接對應順球）
    else if (topDate === targetDate) {
        topRecord[1] = shun;
        console.log(`[一期未更新/更新首列] 成功替換 ${targetDate} 順球: [${shun.join(',')}]`);
    } else {
        console.log('首列日期大於目標日期，無需更新。');
        return;
    }

    // 嚴格格式化輸出（只輸出兩欄結構：日期與順球）
    let rows = records.map(r => {
        let dateStr = r[0];
        let shunStr = r[1].map(n => `'${n}'`).join(',');
        return `['${dateStr}',[${shunStr}]]`;
    }).join(',\n');

    let newContent = `var 7788 = [\n${rows}\n];\n`;
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log('7788.js 檔案更新完成！');
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
