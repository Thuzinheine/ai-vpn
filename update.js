import fs from 'fs';
import axios from 'axios';
import net from 'net';
import dns from 'dns/promises';
import { URL } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// VLESS သီးသန့် အဓိက Sources များ
async function fetchVlessOnlySources() {
  const sources = [
    'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
    'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
    'https://raw.githubusercontent.com/cmliu/WorkerVless2sub/main/sub',
    'https://raw.githubusercontent.com/freefq/free/master/v2',
    'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub'
  ];

  let rawList = [];

  for (const url of sources) {
    try {
      const res = await axios.get(url, { 
        timeout: 6000, 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
      });
      let data = res.data;

      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}

      // VLESS သီးသန့်သာ Regex ဆွဲထုတ်မည် (Trojan/VMess လုံးဝမယူပါ)
      const matches = data.match(/vless:\/\/[^\s<"']+/g);
      if (matches) rawList.push(...matches);
    } catch (e) {}
  }

  return [...new Set(rawList)];
}

// TCP Port Alive Check
function checkTcpAlive(host, port = 443, timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      const ping = Date.now() - socket._startTime;
      socket.destroy();
      resolve({ alive: true, ping: ping || 50 });
    });

    socket._startTime = Date.now();
    socket.on('error', () => { socket.destroy(); resolve({ alive: false }); });
    socket.on('timeout', () => { socket.destroy(); resolve({ alive: false }); });
  });
}

// Gemini AI VLESS Core Repair
async function aiRepairVless(rawKeys) {
  if (!GEMINI_API_KEY) return rawKeys.filter(k => k.startsWith('vless://'));

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an expert Xray-core v1.8.24 and Sing-box engineer.
Review and fix these raw VLESS URIs strictly:
${rawKeys.slice(0, 40).join('\n')}

Rules:
1. ONLY return VLESS URIs (vless://...). Drop all trojan or vmess if any exist.
2. Fix corrupted base64, missing parameters, bad reality pbk or sid.
3. Inject fp=chrome and valid SNI (speed.cloudflare.com, gateway.icloud.com) if missing.
4. Output strictly one valid vless:// URI per line without explanation or markdown blocks.
`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim().split(/\r?\n/).filter(l => l.startsWith('vless://'));
  } catch (e) {
    return rawKeys.filter(k => k.startsWith('vless://'));
  }
}

async function main() {
  console.log("[1/3] Scraping VLESS-Only Nodes...");
  const rawVless = await fetchVlessOnlySources();
  console.log(`Found ${rawVless.length} pure VLESS candidate keys.`);

  console.log("[2/3] Gemini AI Auto-Repairing VLESS Schemas...");
  const repairedVless = await aiRepairVless(rawVless);

  console.log("[3/3] Testing Latency and Building Final Sub...");
  const finalNodes = [];

  for (let i = 0; i < repairedVless.length; i++) {
    const uri = repairedVless[i];
    try {
      const parsed = new URL(uri);
      const host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 443;

      const check = await checkTcpAlive(host, port);
      if (check.alive) {
        const base = uri.split('#')[0];
        finalNodes.push(`${base}#SG-AI-VLESS-NODE-${finalNodes.length + 1}[Ping:${check.ping}ms]`);
      }
    } catch (e) {}

    if (finalNodes.length >= 25) break;
  }

  // Backup fallback if alive checks are slow
  const outputList = finalNodes.length > 0 ? finalNodes : repairedVless.slice(0, 20);

  // Base64 Subscription Encoding
  const base64Data = Buffer.from(outputList.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log(`Done! Exported ${outputList.length} pure VLESS nodes to sub.txt.`);
}

main();
