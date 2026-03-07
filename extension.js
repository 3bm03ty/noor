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
  numberInSurah: 87,
  number: 2600
};

let panel = null;
let bundledVerses = null;
let timerHandle = null;
let currentAyah = null;
let popupVisible = false;
let popupPromise = Promise.resolve();

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
      numberInSurah: arData.numberInSurah || 0,
      number: arData.number || randomNum
    };
  } catch (error) {
    const verses = getBundledVerses();
    if (verses) {
      const key = String(randomNum);
      const v = verses[key];
      if (v) return { ...v, number: parseInt(key, 10) };
      const keys = Object.keys(verses);
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      const fallback = verses[randomKey];
      if (fallback) return { ...fallback, number: parseInt(randomKey, 10) };
    }
    return FALLBACK_AYAH;
  }
}

function getPopupHtml(ayah, autoPlayOverride) {
  const showSuraName = vscode.workspace.getConfiguration('noor').get('showSuraName');
  const reciter = vscode.workspace.getConfiguration('noor').get('reciter') || 'ar.alafasy';
  const bitrate = vscode.workspace.getConfiguration('noor').get('audioBitrate') || 64;
  const playAudio = autoPlayOverride === true || vscode.workspace.getConfiguration('noor').get('playAudio') || false;
  const ayahNumber = ayah.number || 1;

  const ayahAr = (ayah.ar || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ayahEn = (ayah.en || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const metaContent = showSuraName
    ? `<span class="emoji">✨</span> ${(ayah.surahName || ayah.surahEnglishName || '').replace(/</g, '&lt;')} (${ayah.numberInSurah || ''})`
    : '';
  const metaStyle = showSuraName ? '' : ' style="display:none"';

  const initAudio = JSON.stringify({
    reciter,
    bitrate,
    ayahNumber,
    autoPlay: playAudio
  });

  const templatePath = path.join(__dirname, 'src', 'webview', 'popup.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  html = html
    .replace('{{AYAH_AR}}', ayahAr)
    .replace('{{AYAH_EN}}', ayahEn)
    .replace('{{META}}', metaContent)
    .replace('{{META_STYLE}}', metaStyle)
    .replace('{{INIT_AUDIO}}', initAudio);
  return html;
}

function getDisplayMode() {
  return vscode.workspace.getConfiguration('noor').get('displayMode') || 'popup';
}

async function showAyahAsPopup(ayah, skipIfUnfocused = false) {
  if (skipIfUnfocused) {
    const focused = vscode.window.state && typeof vscode.window.state.focused === 'boolean'
      ? vscode.window.state.focused
      : true;
    if (!focused) return;
  }

  popupPromise = popupPromise.then(async () => {
    if (popupVisible) return;
    popupVisible = true;

    currentAyah = ayah;
    const showSuraName = vscode.workspace.getConfiguration('noor').get('showSuraName');
    const lang = getUserLanguage();
    const text = lang === 'ar' ? ayah.ar : ayah.en;
    const meta = showSuraName ? ` — ${ayah.surahName || ayah.surahEnglishName} (${ayah.numberInSurah})` : '';
    const message = `✨ ${text}${meta}`;

    try {
      const choice = await Promise.race([
        vscode.window.showInformationMessage(
          message,
          { modal: false },
          'Play',
          'Copy',
          'Next Ayah',
          'Open in Tab'
        ),
        new Promise((resolve) => setTimeout(() => resolve(undefined), 30000))
      ]);

      if (choice === 'Play') {
        showAyahPanel(ayah, true);
      } else if (choice === 'Copy') {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage('Ayah copied to clipboard');
      } else if (choice === 'Next Ayah') {
        popupVisible = false;
        const nextAyah = await getRandomAyah();
        await showAyah(nextAyah, false);
      } else if (choice === 'Open in Tab') {
        showAyahPanel(ayah);
      }
    } finally {
      popupVisible = false;
    }
  });

  await popupPromise;
}

function showAyahPanel(ayah, autoPlayOverride) {
  currentAyah = ayah;
  const viewColumn = vscode.workspace.getConfiguration('noor').get('popupPosition') === 'sidebar'
    ? vscode.ViewColumn.Two
    : vscode.ViewColumn.One;

  if (panel) {
    panel.reveal(viewColumn);
    const reciter = vscode.workspace.getConfiguration('noor').get('reciter') || 'ar.alafasy';
    const bitrate = vscode.workspace.getConfiguration('noor').get('audioBitrate') || 64;
    const shouldAutoPlay = autoPlayOverride === true || vscode.workspace.getConfiguration('noor').get('playAudio') || false;
    panel.webview.postMessage({
      type: 'update',
      ayah,
      showSuraName: vscode.workspace.getConfiguration('noor').get('showSuraName'),
      reciter,
      bitrate,
      autoPlay: shouldAutoPlay
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

  panel.webview.html = getPopupHtml(ayah, autoPlayOverride);

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
      const reciter = vscode.workspace.getConfiguration('noor').get('reciter') || 'ar.alafasy';
      const bitrate = vscode.workspace.getConfiguration('noor').get('audioBitrate') || 64;
      panel.webview.postMessage({
        type: 'update',
        ayah: nextAyah,
        showSuraName: vscode.workspace.getConfiguration('noor').get('showSuraName'),
        reciter,
        bitrate
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

async function showAyah(ayah, skipIfUnfocused = false) {
  if (!ayah) ayah = await getRandomAyah();
  const mode = getDisplayMode();
  if (mode === 'popup') {
    await showAyahAsPopup(ayah, skipIfUnfocused);
  } else {
    showAyahPanel(ayah);
  }
}

async function showNextAyah() {
  if (panel && getDisplayMode() === 'tab') {
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
    const mode = getDisplayMode();
    if (mode === 'popup') {
      await showAyahAsPopup(ayah, true);
    } else {
      showAyahPanel(ayah);
    }
  }, ms);
}

function activate(context) {
  try {
    context.subscriptions.push(
      vscode.commands.registerCommand('noor.showAyah', showAyah),
      vscode.commands.registerCommand('noor.showNextAyah', showNextAyah),
      vscode.commands.registerCommand('noor.dismissAyah', dismissAyah)
    );

    startTimer();

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('noor.repeatedEveryMinute') || e.affectsConfiguration('noor.displayMode')) {
        startTimer();
      }
    });
  } catch (err) {
    console.error('[Noor] Activation failed:', err);
    vscode.window.showErrorMessage(`Noor extension failed to activate: ${err.message}`);
  }
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
