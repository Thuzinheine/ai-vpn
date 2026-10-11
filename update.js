import fs from 'fs';
import axios from 'axios';
import net from 'net';
import dns from 'dns/promises';
import { URL } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 1. DigitalOcean & Vultr ISP / Org Keywords
const ALLOWED_ISPS = ['digitalocean', 'vultr', 'choopa', 'constant company'];

// 2. Strict Ping Threshold (80ms ထက်ကျော်လျှင် လုံးဝမယူပါ)
const MAX_PING_LIMIT = 80;

// VLESS Node Sources Pool
async function fetchVlessCandidates() {
  const sources = [
    'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
    'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
    'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
    'https://raw.githubusercontent.com/freefq/free/master/v2',
    'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
    'https://raw.githubusercontent.com/v2ray-free/v2ray-free.github.io/master/sub/sub_merge.txt'
  ];

  let rawList = [];

  for (const url of sources) {
    try {
      const res = await axios.get(url, { 
        timeout: 5000, 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
      });
      let data = res.data;

      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}

      // VLESS သီးသန့်သာ Filter လုပ်ခြင်း
      const matches = data.match(/vless:\/\/[^\s<"']+/g);
      if (matches) rawList.push(...matches);
    } catch (e) {}
  }

  return [...new Set(rawList)];
}

// DigitalOcean သို့မဟုတ် Vultr ဟုတ်မဟုတ် စစ်ဆေးခြင်း
async function verifyProvider(host) {
  try {
    let resolvedIp = host;
    if (!net.isIP(host)) {
      const lookup = await dns.lookup(host);
      resolvedIp = lookup.address;
    }

    const res = await axios.get(`http://ip-api.com/json/${resolvedIp}?fields=status,countryCode,isp,org,as`, { timeout: 2000 });
    if (res.data && res.data.status === 'success') {
      const orgInfo = (res.data.org + ' ' + res.data.isp + ' ' + res.data.as).toLowerCase();
      const matched = ALLOWED_ISPS.some(isp => orgInfo.includes(isp));

      if (matched) {
        const providerName = orgInfo.includes('vultr') || orgInfo.includes('choopa') ? 'Vultr' : 'DigitalOcean';
        return { valid: true, provider: providerName, ip: resolvedIp, country: res.data.countryCode };
      }
    }
  } catch (err) {}
  return { valid: false };
}

// Strict Real Latency Test (< 80ms)
function measurePing(host, port = 443) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(MAX_PING_LIMIT + 30); // 80ms ထက် ကျော်ပါက timeout ချက်ချင်းချမည်

    socket.connect(port, host, () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve(latency);
    });

    socket.on('error', () => { socket.destroy(); resolve(9999); });
    socket.on('timeout', () => { socket.destroy(); resolve(9999); });
  });
}

// Gemini AI Core Repair
async function aiRepairNodes(rawKeys) {
  if (!GEMINI_API_KEY) return rawKeys;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an expert Xray-core v1.8.24 and Sing-box engineer.
Task:
1. Examine these VLESS keys:
${rawKeys.slice(0, 35).join('\n')}

2. Fix syntax errors, repair bad reality parameters (pbk, sid, flow), enforce fp=chrome.
3. Return ONLY valid vless:// URI lines (one per line). Zero comments, zero markdown blocks.
`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim().split(/\r?\n/).filter(l => l.startsWith('vless://'));
  } catch (e) {
    return rawKeys;
  }
}

async function main() {
  console.log("[1/4] Fetching VLESS candidate nodes...");
  const rawNodes = await fetchVlessCandidates();
  console.log(`Found ${rawNodes.length} VLESS keys. Filtering strictly for DigitalOcean & Vultr...`);

  const validNodes = [];

  for (let i = 0; i < rawNodes.length; i++) {
    const uri = rawNodes[i];
    try {
      const parsed = new URL(uri);
      const host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 443;

      // Provider စစ်ဆေးခြင်း (DigitalOcean သို့မဟုတ် Vultr သာဖြစ်ရမည်)
      const providerCheck = await verifyProvider(host);
      if (providerCheck.valid) {
        // Latency စစ်ဆေးခြင်း
        const ping = await measurePing(providerCheck.ip, port);

        // Ping 80ms အောက်သာ လက်ခံမည် (100ms ကျော်ပါက drop လုပ်မည်)
        if (ping < MAX_PING_LIMIT) {
          const base = uri.split('#')[0];
          const nodeTag = `${providerCheck.country}-${providerCheck.provider}-UltraFast[Ping:${ping}ms]`;
          validNodes.push({ uri: `${base}#${nodeTag}`, ping });
          console.log(`[PASS] ${nodeTag} Latency: ${ping}ms`);
        }
      }
    } catch (e) {}

    await new Promise(r => setTimeout(r, 100)); // IP-API rate limiter
  }

  // Ping အနည်းဆုံးမှ အများဆုံးသို့ စီခြင်း
  validNodes.sort((a, b) => a.ping - b.ping);

  let finalPool = validNodes.map(n => n.uri);

  // Gemini AI ဖြင့် Parameter များအား နောက်ဆုံးအဆင့် check ပြုလုပ်ခြင်း
  if (finalPool.length > 0) {
    console.log(`[2/4] Optimizing ${finalPool.length} verified low-ping nodes with Gemini...`);
    finalPool = await aiRepairNodes(finalPool);
  }

  console.log(`[3/4] Exporting ${finalPool.length} nodes (Ping < 80ms on DigitalOcean & Vultr)...`);

  const base64Data = Buffer.from(finalPool.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log("[4/4] sub.txt successfully generated!");
}

main();

