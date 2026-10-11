import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import net from 'net';
import { URL } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Southeast Asia / Myanmar Route Clean IP Pool
const CLEAN_EDGE_IPS = [
  '104.16.132.229',
  '172.67.182.112',
  '104.18.2.161',
  '162.159.192.1',
  '104.16.85.20',
  '104.17.209.9'
];

// Reality SNI Pool
const SNI_POOL = [
  'gateway.icloud.com',
  'speed.cloudflare.com',
  'graph.facebook.com'
];

// 1. Scrape Sources
async function fetchSources() {
  const tgChannels = [
    'https://t.me/s/v2ray_free_conf',
    'https://t.me/s/V2rayNG_VPNN',
    'https://t.me/s/vless_vmess'
  ];

  const ghRepos = [
    'https://raw.githubusercontent.com/freefq/free/master/v2',
    'https://raw.githubusercontent.com/v2ray-free/v2ray-free.github.io/master/sub/sub_merge.txt'
  ];

  let rawList = [];

  for (const url of tgChannels) {
    try {
      const res = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(res.data);
      const text = $('.tgme_widget_message_text').text();
      const matches = text.match(/(vless|vmess|trojan):\/\/[^\s<]+/g);
      if (matches) rawList.push(...matches);
    } catch (e) {}
  }

  for (const url of ghRepos) {
    try {
      const res = await axios.get(url, { timeout: 5000 });
      let data = res.data;
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}
      rawList.push(...data.split(/\r?\n/).filter(l => l.startsWith('vless://') || l.startsWith('vmess://') || l.startsWith('trojan://')));
    } catch (e) {}
  }

  return [...new Set(rawList)];
}

// 2. TCP Ping Latency Test
function testTcpLatency(host, port = 443, timeout = 1200) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      const ping = Date.now() - start;
      socket.destroy();
      resolve(ping);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(9999);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(9999);
    });
  });
}

// 3. Gemini AI Core: Auto-Repair
async function aiRepairAndTune(rawKeys) {
  if (!GEMINI_API_KEY) return rawKeys.slice(0, 15);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
You are an expert Xray-core v1.8.24, Sing-box, v2rayNG and Clash Meta network protocol specialist.
Task:
1. Examine these raw proxy keys:
${rawKeys.slice(0, 25).join('\n')}

2. Fix any syntax corruption, bad url encoding, missing query parameters, or broken Reality public keys.
3. Optimize strictly for Southeast Asia / Myanmar latency:
   - Target Clean SNIs: ${SNI_POOL.join(', ')}
   - Fingerprint: chrome or safari
   - Security: reality or tls
   - Target Core Standard Schema:
     vless://UUID@HOST:PORT?encryption=none&security=reality&sni=...&fp=chrome&pbk=...&type=...#NAME
4. Return ONLY valid URI lines (one per line). Output zero explanation and zero markdown blocks.
`;

  try {
    const result = await model.generateContent(prompt);
    const cleaned = result.response.text().trim().split(/\r?\n/).filter(l => l.includes('://'));
    return cleaned;
  } catch (err) {
    console.error("AI tuning failed, fallback to raw keys:", err.message);
    return rawKeys.slice(0, 15);
  }
}

// 4. Main Workflow
async function main() {
  console.log("[1/4] Scraping Telegram & GitHub sources...");
  const rawNodes = await fetchSources();
  console.log(`Retrieved ${rawNodes.length} raw proxy candidates.`);

  console.log("[2/4] Gemini AI Auto-Repairing keys...");
  const repairedNodes = await aiRepairAndTune(rawNodes);

  console.log("[3/4] Measuring TCP Latency & Filtering Ping...");
  const testedNodes = [];

  for (let i = 0; i < repairedNodes.length; i++) {
    const nodeUri = repairedNodes[i];
    try {
      const parsed = new URL(nodeUri);
      const host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 443;

      const ping = await testTcpLatency(host, port);

      if (ping < 800) {
        const sni = SNI_POOL[i % SNI_POOL.length];
        const basePart = nodeUri.split('?')[0];
        const searchParams = new URLSearchParams(nodeUri.split('?')[1]?.split('#')[0] || '');

        searchParams.set('sni', sni);
        searchParams.set('fp', 'chrome');

        const tunedUri = `${basePart}?${searchParams.toString()}#SG-AI-LOWPING-${testedNodes.length + 1}[Ping:${ping}ms]`;
        testedNodes.push({ uri: tunedUri, ping });
      }
    } catch (e) {}
  }

  testedNodes.sort((a, b) => a.ping - b.ping);

  const finalPool = testedNodes.length > 0 ? testedNodes.map(n => n.uri) : repairedNodes.slice(0, 5);

  console.log(`[4/4] Successfully ready ${finalPool.length} nodes.`);

  const base64Data = Buffer.from(finalPool.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log("sub.txt has been generated successfully!");
}

main();
