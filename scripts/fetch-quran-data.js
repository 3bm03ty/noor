/**
 * Build script to fetch Quran data from Al-Quran Cloud API and generate verses.json
 * for offline use in the Noor extension.
 *
 * Run: node scripts/fetch-quran-data.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.alquran.cloud/v1';
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'quran');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'verses.json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching Quran data from Al-Quran Cloud API...');

  const [arabicRes, englishRes] = await Promise.all([
    fetchJson(`${API_BASE}/quran/quran-uthmani`),
    fetchJson(`${API_BASE}/quran/en.asad`)
  ]);

  if (arabicRes.code !== 200 || englishRes.code !== 200) {
    throw new Error('API returned non-200 status');
  }

  const arabicSurahs = arabicRes.data.surahs;
  const englishSurahs = englishRes.data.surahs;

  const verses = {};

  for (let i = 0; i < arabicSurahs.length; i++) {
    const arSurah = arabicSurahs[i];
    const enSurah = englishSurahs[i];

    if (!arSurah || !enSurah || arSurah.number !== enSurah.number) {
      console.warn(`Surah mismatch at index ${i}`);
      continue;
    }

    const arAyahs = arSurah.ayahs || [];
    const enAyahs = enSurah.ayahs || [];

    for (let j = 0; j < arAyahs.length; j++) {
      const arAyah = arAyahs[j];
      const enAyah = enAyahs[j];

      if (!arAyah || !enAyah) continue;

      const num = arAyah.number;
      verses[String(num)] = {
        ar: arAyah.text.replace(/^\ufeff/, '').trim(),
        en: (enAyah.text || '').trim(),
        surahName: arSurah.name,
        surahEnglishName: arSurah.englishName,
        numberInSurah: arAyah.numberInSurah
      };
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(verses), 'utf8');
  const size = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`Generated ${OUTPUT_FILE} with ${Object.keys(verses).length} verses (${size} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
