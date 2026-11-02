const fs = require('fs');
const axios = require('axios');
const iconv = require('iconv-lite');

async function main() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const twTime = new Date(utc + (3600000 * 8));
    
    const hours = twTime.getHours();
    const minutes = twTime.getMinutes();
    const totalMins = hours * 60 + minutes;

    console.log(`[${twTime.toISOString()}] 開始執行 vvv.js 更新檢查... 台灣時間 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);

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

    let targetDate = getTargetDrawDate(twTime);
    console.log(`目標日期: ${targetDate}，vvv.js 目前首列日期: ${topDate}`);

    // 20:45 (1245分鐘) 之後抓 9800 落球，其餘抓 Pilio 順球
    let isDropTime = totalMins >= 1245; 
    let numbers = null;
    let modeName = '';

    if (isDropTime) {
        modeName = '落球 (9800)';
        numbers = await fetch9800Drop(targetDate);
    } else {
        modeName = '順球 (Pilio)';
        numbers = await fetchPilioShun();
    }

    if (!numbers || numbers.length !== 5) {
        console.log(`[${targetDate}] 官方尚未開獎或 ${modeName} 資料不完全。`);
        return;
    }

    if (topDate < targetDate) {
        records.unshift([targetDate, numbers]);
        console.log(`[新增首列 - ${modeName}] 成功插入 ${targetDate}: [${numbers.join(',')}]`);
    } else if (topDate === targetDate) {
        if (isDropTime) {
            topRecord[1] = numbers;
            console.log(`[替換為落球 - ${modeName}] 成功更新 ${targetDate} 為落球: [${numbers.join(',')}]`);
        } else {
            console.log(`[跳過] 當天 ${targetDate} 的順球已經存在，等待 20:45 後落球替換。`);
            return;
        }
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

function getTargetDrawDate(twTime) {
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

// 1. 抓取 Pilio 順球
async function fetchPilioShun() {
    try {
        const response = await axios.get('https://www.pilio.idv.tw/', {
            timeout: 10000,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const htmlText = iconv.decode(Buffer.from(response.data), 'big5');
        const matchNo = htmlText.match(/id="lto539no"[^>]*>([^<]+)</);
        if (!matchNo || !matchNo[1]) return null;

        const rawNumbers = matchNo[1].trim();
        const nums = rawNumbers.split(',').map(n => n.trim().padStart(2, '0'));
        if (nums.length === 5) return nums;
    } catch (e) {
        console.error('Pilio 抓取錯誤:', e.message);
    }
    return null;
}

// 2. 抓取 9800 網站的落球 (根據您提供的 TR 結構精準解析)
async function fetch9800Drop(targetDate) {
    try {
        const response = await axios.get('https://www.9800.com.tw/lotto539/drop.html', {
            timeout: 10000,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const htmlText = iconv.decode(Buffer.from(response.data), 'big5');
        
        const rows = htmlText.split('<TR');
        for (let row of rows) {
            // 比對日期
            if (row.includes(targetDate)) {
                // 抓取綠色字 color="#006600" 的落球欄位
                const matchDrop = row.match(/color="#006600"[^>]*>([^<]+)</);
                if (matchDrop && matchDrop[1]) {
                    const rawDrop = matchDrop[1].replace(/&nbsp;/g, ' ').trim();
                    const nums = rawDrop.split(/\s+/).map(n => n.padStart(2, '0'));
                    if (nums.length === 5) {
                        console.log(`成功從 9800 抓取落球: [${nums.join(',')}]`);
                        return nums;
                    }
                }
            }
        }
    } catch (e) {
        console.error('9800 抓取錯誤:', e.message);
    }
    return null;
}

main();
