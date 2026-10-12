/**
 * update.js - AI-VPN Core Aggregator (ES Module Version)
 * Protocols: Hysteria 2 & VLESS Reality
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

// Reality & Hysteria 2 Configs ပါဝင်သော Provider Sources များ
const SOURCES = [
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/mix',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/reality',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/hysteria'
];

// Helper: HTTP/HTTPS URL များဆီမှ Data ဆွဲယူခြင်း (Redirects handling ပါဝင်သည်)
function fetchUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { 
      headers: { 'User-Agent': 'v2rayNG/1.8.5' }, 
      timeout: 10000 
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', () => resolve(''));
    req.on('timeout', () => { 
      req.destroy(); 
      resolve(''); 
    });
  });
}

// Helper: Base64 ဖြစ်နေပါက Decode ပြုလုပ်ခြင်း
function decodeContent(content) {
  if (!content) return '';
  content = content.trim();
  try {
    const buff = Buffer.from(content.replace(/\s+/g, ''), 'base64');
    const decoded = buff.toString('utf-8');
    if (decoded.includes('://')) return decoded;
  } catch (e) {}
  return content;
}

async function main() {
  console.log('--- Starting Reality & Hysteria 2 Node Aggregation ---');
  let collected = [];

  for (const src of SOURCES) {
    try {
      console.log(`Fetching: ${src}`);
      const raw = await fetchUrl(src);
      const text = decodeContent(raw);
      const lines = text.split(/[\r\n]+/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // ၁။ Hysteria 2 Protocol စစ်ဆေးခြင်း
        const isHy2 = trimmed.startsWith('hy2://') || trimmed.startsWith('hysteria2://');
        
        // ၂။ VLESS Reality Protocol စစ်ဆေးခြင်း (security=reality ပါရမည်)
        const isReality = trimmed.startsWith('vless://') && trimmed.includes('security=reality');

        if (isHy2 || isReality) {
          collected.push(trimmed);
        }
      }
    } catch (err) {
      console.log(`Failed to fetch from ${src}: ${err.message}`);
    }
  }

  // Duplicate key များကို ဖယ်ရှားခြင်း
  const uniqueNodes = Array.from(new Set(collected));
  console.log(`Discovered ${uniqueNodes.length} valid Reality & Hysteria 2 nodes.`);

  // အများဆုံး Node ၅၀ ခု ကန့်သတ်ယူခြင်း
  const finalNodes = uniqueNodes.slice(0, 50);

  if (finalNodes.length === 0) {
    console.log('No valid Reality or Hysteria 2 nodes found. sub.txt remains unchanged.');
    return;
  }

  // Base64 encode ပြုလုပ်ပြီး sub.txt ထဲသို့ ရေးသားခြင်း
  const base64Output = Buffer.from(finalNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully written ${finalNodes.length} nodes to sub.txt`);
  console.log('--- Aggregation Completed Successfully ---');
}

main();
