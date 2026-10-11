import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 1. Scrape Telegram Public Channels
async function scrapeTelegram() {
  const channels = [
    'https://t.me/s/v2ray_free_conf',
    'https://t.me/s/V2rayNG_VPNN'
  ];
  let list = [];
  for (const c of channels) {
    try {
      const res = await axios.get(c, { timeout: 5000 });
      const $ = cheerio.load(res.data);
      const text = $('.tgme_widget_message_text').text();
      const matches = text.match(/(vless|vmess|trojan):\/\/[^\s<]+/g);
      if (matches) list.push(...matches);
    } catch (e) {}
  }
  return list;
}

// 2. Scrape GitHub Raw Sources
async function scrapeGitHub() {
  const sources = [
    'https://raw.githubusercontent.com/freefq/free/master/v2'
  ];
  let list = [];
  for (const s of sources) {
    try {
      const res = await axios.get(s, { timeout: 5000 });
      let data = res.data;
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}
      list.push(...data.split(/\r?\n/).filter(l => l.startsWith('vless://') || l.startsWith('vmess://') || l.startsWith('trojan://')));
    } catch (e) {}
  }
  return list;
}

// 3. Main Runner
async function run() {
  console.log("Starting Scraping...");
  const [tg, gh] = await Promise.all([scrapeTelegram(), scrapeGitHub()]);
  const allKeys = [...new Set([...tg, ...gh])].slice(0, 20);

  let finalKeys = allKeys;

  // Gemini AI Repair
  if (GEMINI_API_KEY) {
    try {
      console.log("Processing with Gemini AI Core...");
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Review, fix syntax errors, and tune these VLESS/VMESS keys for Southeast Asia:\n${allKeys.join('\n')}\nReturn only valid URI lines.`;
      const result = await model.generateContent(prompt);
      finalKeys = result.response.text().trim().split(/\r?\n/).filter(l => l.includes('://'));
    } catch (e) {
      console.warn("AI step failed, using fallback raw keys:", e.message);
    }
  }

  // Base64 Encoding
  const base64Content = Buffer.from(finalKeys.join('\n')).toString('base64');

  // Write to sub.txt
  fs.writeFileSync('sub.txt', base64Content, 'utf-8');
  console.log(`Saved ${finalKeys.length} nodes to sub.txt successfully!`);
}

run();
