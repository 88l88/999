const fs = require('fs');
const axios = require('axios');
const iconv = require('iconv-lite');

async function main() {
    const now = new Date();
    const twTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (3600000 * 8));
    const hours = twTime.getHours();
    const minutes = twTime.getMinutes();
    const totalMins = hours * 60 + minutes;

    let content = '';
    try {
        content = fs.readFileSync('./vvv.js', 'utf8');
    } catch (e) {
        console.error('無法讀取 vvv.js');
        process.exit(1);
    }

    let match = content.match(/var\s+vvv\s*=\s*(\[[\s\S]*\]);?/);
    if (!match) {
        console.error('vvv.js 格式錯誤');
        process.exit(1);
    }

    let records = eval('(' + match[1] + ')');
    let topRecord = records[0];
    let topDate = topRecord[0];

    let targetDate = getTargetDate(twTime);

    // 階段一：20:40 順球（只抓一次，若當天已存在或抓到就寫入並收工）
    if (totalMins >= 1240 && totalMins < 1260) {
        if (topDate === targetDate) {
            console.log("當天順球已存在，略過。");
            return;
        }
        let numbers = await fetchPilioShun(targetDate);
        if (numbers && numbers.length === 5) {
            records.unshift([targetDate, numbers]);
            saveFile(records);
            console.log("順球寫入成功，今日順球結束。");
        } else {
            console.log("順球尚未公佈或抓取失敗。");
        }
        return;
    }

    // 階段二：21:00 起每30分鐘抓落球，成功替換後即結束
    if (totalMins >= 1260) {
        // 檢查如果首列已經是落球格式（或是您可以用其他方式標記，這裡直接去抓落球來覆蓋當日順球）
        let numbers = await fetch9800Drop(targetDate);
        if (numbers && numbers.length === 5) {
            if (topDate === targetDate) {
                topRecord[1] = numbers; // 替換成落球
            } else {
                records.unshift([targetDate, numbers]); // 若還沒順球直接補落球
            }
            saveFile(records);
            console.log("落球替換成功，關閉後續落球動作。");
            return;
        } else {
            console.log("落球尚未公佈，等待下個排程再試。");
        }
    }
}

function getTargetDate(twTime) {
    let yyyy = twTime.getFullYear();
    let mm = String(twTime.getMonth() + 1).padStart(2, '0');
    let dd = String(twTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchPilioShun(targetDate) {
    try {
        const res = await axios.get('https://www.pilio.idv.tw/lotto539/list.asp', {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = iconv.decode(Buffer.from(res.data), 'big5');
        const rows = html.split('</tr>');
        let targetMD = targetDate.substring(5).replace('-', '/');
        for (let row of rows) {
            if (row.includes(targetMD)) {
                const m = row.match(/class="number-cell"[^>]*>([\s\S]*?)<\/td>/);
                if (m) {
                    let nums = m[1].replace(/<[^>]+>/g, '').split(',').map(n => n.trim().padStart(2, '0'));
                    if (nums.length === 5) return nums;
                }
            }
        }
    } catch (e) {}
    return null;
}

async function fetch9800Drop(targetDate) {
    try {
        const res = await axios.get('https://www.9800.com.tw/lotto539/drop.html', {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = iconv.decode(Buffer.from(res.data), 'big5');
        const rows = html.split('<TR');
        for (let row of rows) {
            if (row.includes(targetDate)) {
                const m = row.match(/color="#FF0000"[^>]*>([\s\S]*?)<\/font>/);
                if (m) {
                    let nums = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().split(/\s+/).map(n => n.padStart(2, '0'));
                    if (nums.length === 5) return nums;
                }
            }
        }
    } catch (e) {}
    return null;
}

function saveFile(records) {
    let rows = records.map(r => `['${r[0]}',[${r[1].map(n => `'${n}'`).join(',')}]]`).join(',\n');
    fs.writeFileSync('./vvv.js', `var vvv=[\n${rows}\n];\n`, 'utf8');
}

main();
