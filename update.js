const fs = require('fs');
const axios = require('axios');
const iconv = require('iconv-lite');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行 vvv.js 更新檢查...`);

    let content = '';
    try {
        content = fs.readFileSync('./vvv.js', 'utf8');
    } catch (e) {
        console.error('無法讀取 vvv.js:', e.message);
        process.exit(1);
    }

    const match = content.match(/var\s+vvv\s*=\s*(\[[\s\S]*\]);?/);
    if (!match) {
        console.error('vvv.js 格式解析失敗');
        process.exit(1);
    }

    let records = eval('(' + match[1] + ')');
    let topRecord = records[0];
    let topDate = topRecord[0];

    let targetDate = getTargetDrawDate();
    console.log(`目標日期: ${targetDate}，vvv.js 目前首列日期: ${topDate}`);

    let drop = await fetchLotteryDrop(targetDate);
    if (!drop || drop.length !== 5) {
        console.log(`[${targetDate}] 官方尚未開獎或落球資料不完全。`);
        return;
    }

    // 核心邏輯：若首列日期小於目標日期，直接在最上方 unshift 插入新一期
    if (topDate < targetDate) {
        records.unshift([targetDate, drop]);
        console.log(`[新增首列] 成功插入 ${targetDate} 順球/落球序: [${drop.join(',')}]`);
    } else if (topDate === targetDate) {
        topRecord[1] = drop;
        console.log(`[更新首列] 成功替換 ${targetDate} 順球/落球序: [${drop.join(',')}]`);
    } else {
        console.log('首列日期大於目標日期，無需更新。');
        return;
    }

    let rows = records.map(r => {
        let dateStr = r[0];
        let ballsStr = r[1].map(n => `'${n}'`).join(',');
        return `['${dateStr}',[${ballsStr}]]`;
    }).join(',\n');

    let newContent = `var vvv = [\n${rows}\n];\n`;
    fs.writeFileSync('./vvv.js', newContent, 'utf8');
    console.log('vvv.js 檔案更新完成！');
}

function getTargetDrawDate() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));

    let hours = twTime.getHours();
    let minutes = twTime.getMinutes();
    let totalMins = hours * 60 + minutes;

    if (totalMins < 1240) {
        twTime.setDate(twTime.getDate() - 1);
    }
    if (twTime.getDay() === 0) {
        twTime.setDate(twTime.getDate() - 1);
    }

    let yyyy = twTime.getFullYear();
    let mm = String(twTime.getMonth() + 1).padStart(2, '0');
    let dd = String(twTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchLotteryDrop(targetDate) {
    try {
        const response = await axios.get('https://www.pilio.idv.tw/lto539/list.asp', {
            timeout: 10000,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const htmlText = iconv.decode(Buffer.from(response.data), 'big5');

        const [y, m, d] = targetDate.split('-');
        const mingGuoYear = parseInt(y, 10) - 1911;
        const searchKey1 = targetDate;
        const searchKey2 = `${mingGuoYear}/${parseInt(m, 10)}/${parseInt(d, 10)}`;

        let dateIdx = htmlText.indexOf(searchKey1);
        if (dateIdx === -1) {
            dateIdx = htmlText.indexOf(searchKey2);
        }
        if (dateIdx === -1) return null;

        const subText = htmlText.substring(dateIdx, dateIdx + 400);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);

        if (!matches || matches.length < 5) return null;

        let drop = matches.slice(0, 5).map(n => n.padStart(2, '0'));
        if (drop.length === 5) {
            return drop;
        }
    } catch (e) {
        console.error('Pilio 抓取發生錯誤:', e.message);
    }
    return null;
}

main();
