const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const AYAH_MIN = 1;
const AYAH_MAX = 6236;
const FALLBACK_AYAH = {
  ar: 'لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ',
  en: 'There is no deity except You; exalted are You. Indeed, I have been of the wrongdoers.',
  surahName: 'سُورَةُ ٱلْأَنْبِيَاءِ',
  surahEnglishName: 'Al-Anbiya',
  numberInSurah: 87
};

let panel = null;
let bundledVerses = null;
let timerHandle = null;
let currentAyah = null;

function getRandomAyahNumber() {
  return Math.floor(Math.random() * (AYAH_MAX - AYAH_MIN + 1)) + AYAH_MIN;
}

function getUserLanguage() {
  return vscode.workspace.getConfiguration('noor').get('language') === 'Arabic' ? 'ar' : 'en';
}

function getBundledVerses() {
  if (bundledVerses) return bundledVerses;
  try {
    const versesPath = path.join(__dirname, 'src', 'quran', 'verses.json');
    const data = fs.readFileSync(versesPath, 'utf8');
    bundledVerses = JSON.parse(data);
    return bundledVerses;
  } catch (e) {
    return null;
  }
}

async function getRandomAyah() {
  const randomNum = getRandomAyahNumber();

  try {
    const [arResponse, enResponse] = await Promise.all([
      axios.get(`https://api.alquran.cloud/v1/ayah/${randomNum}/quran-uthmani`, { timeout: 10000 }),
      axios.get(`https://api.alquran.cloud/v1/ayah/${randomNum}/en.asad`, { timeout: 10000 })
    ]);

    const arData = arResponse.data?.data;
    const enData = enResponse.data?.data;
    if (!arData || !enData) throw new Error('Invalid API response');

    return {
      ar: (arData.text || '').replace(/^\ufeff/, '').trim(),
      en: (enData.text || '').trim(),
      surahName: arData.surah?.name || '',
      surahEnglishName: arData.surah?.englishName || '',
      numberInSurah: arData.numberInSurah || 0
    };
  } catch (error) {
    const verses = getBundledVerses();
    if (verses) {
      const key = String(randomNum);
      const v = verses[key];
      if (v) return v;
      const keys = Object.keys(verses);
      const fallback = verses[keys[Math.floor(Math.random() * keys.length)]];
      if (fallback) return fallback;
    }
    return FALLBACK_AYAH;
  }
}

function getPopupHtml(ayah) {
  const showSuraName = vscode.workspace.getConfiguration('noor').get('showSuraName');
  const ayahAr = (ayah.ar || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ayahEn = (ayah.en || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const metaContent = showSuraName
    ? `<span class="emoji">✨</span> ${(ayah.surahName || ayah.surahEnglishName || '').replace(/</g, '&lt;')} (${ayah.numberInSurah || ''})`
    : '';
  const metaStyle = showSuraName ? '' : ' style="display:none"';

  const templatePath = path.join(__dirname, 'src', 'webview', 'popup.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  html = html
    .replace('{{AYAH_AR}}', ayahAr)
    .replace('{{AYAH_EN}}', ayahEn)
    .replace('{{META}}', metaContent)
    .replace('{{META_STYLE}}', metaStyle);
  return html;
}

function showAyahPanel(ayah) {
  currentAyah = ayah;
  const viewColumn = vscode.workspace.getConfiguration('noor').get('popupPosition') === 'sidebar'
    ? vscode.ViewColumn.Two
    : vscode.ViewColumn.One;

  if (panel) {
    panel.reveal(viewColumn);
    panel.webview.postMessage({
      type: 'update',
      ayah,
      showSuraName: vscode.workspace.getConfiguration('noor').get('showSuraName')
    });
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'noor.ayahPanel',
    'Noor - Quran Verse',
    viewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = getPopupHtml(ayah);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.action === 'copy') {
      const lang = getUserLanguage();
      const a = currentAyah || ayah;
      const text = lang === 'ar' ? a.ar : a.en;
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage('Ayah copied to clipboard');
    } else if (msg.action === 'next') {
      const nextAyah = await getRandomAyah();
      currentAyah = nextAyah;
      panel.webview.postMessage({
        type: 'update',
        ayah: nextAyah,
        showSuraName: vscode.workspace.getConfiguration('noor').get('showSuraName')
      });
    } else if (msg.action === 'dismiss') {
      if (panel) {
        panel.dispose();
        panel = null;
      }
    }
  });

  panel.onDidDispose(() => {
    panel = null;
  });
}

async function showAyah() {
  const ayah = await getRandomAyah();
  showAyahPanel(ayah);
}

async function showNextAyah() {
  if (panel) {
    const ayah = await getRandomAyah();
    currentAyah = ayah;
    panel.webview.postMessage({
      type: 'update',
      ayah,
      showSuraName: vscode.workspace.getConfiguration('noor').get('showSuraName')
    });
  } else {
    await showAyah();
  }
}

function dismissAyah() {
  if (panel) {
    panel.dispose();
    panel = null;
  }
}

function startTimer() {
  if (timerHandle) clearInterval(timerHandle);

  const minutes = vscode.workspace.getConfiguration('noor').get('repeatedEveryMinute');
  const ms = minutes * 60 * 1000;

  timerHandle = setInterval(async () => {
    const ayah = await getRandomAyah();
    showAyahPanel(ayah);
  }, ms);
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('noor.showAyah', showAyah),
    vscode.commands.registerCommand('noor.showNextAyah', showNextAyah),
    vscode.commands.registerCommand('noor.dismissAyah', dismissAyah)
  );

  startTimer();

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('noor.repeatedEveryMinute')) {
      startTimer();
    }
  });
}

function deactivate() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  if (panel) {
    panel.dispose();
    panel = null;
  }
}

module.exports = { activate, deactivate };
