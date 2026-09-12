import { app, BrowserWindow, Tray, ipcMain, shell, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { trayIcon } from './icon.js';
import { loadAll, signIn, hasStoredSession } from '../src/session.js';
import { TOKEN_PATH } from '../src/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let tray = null;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 620,
    height: 760,
    show: false,
    frame: false,
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(join(__dirname, 'renderer', 'index.html'));
  if (process.env.ZWIFT_PLAN_CAPTURE) {
    win.webContents.on('console-message', (_e, level, message, line, src) =>
      console.log(`[renderer:${level}] ${message} (${String(src).split('/').pop()}:${line})`));
  }
  win.on('blur', () => { if (!win.webContents.isDevToolsOpened()) win.hide(); });
  // Links to ZwiftInsider etc. open in the real browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function toggleWindow() {
  if (win.isVisible()) return win.hide();
  const { x, y } = tray.getBounds();
  const { width, height } = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x, y });
  const left = Math.round(Math.min(Math.max(x - width / 2, display.workArea.x + 8), display.workArea.x + display.workArea.width - width - 8));
  win.setPosition(left, Math.round(y + 24), false);
  win.show();
  win.focus();
}

// Dev aid: ZWIFT_PLAN_CAPTURE=<dir> renders the UI headlessly and writes a PNG
// per tab, so the interface can be reviewed without a screen recording.
async function capture(dir) {
  const { writeFileSync } = await import('node:fs');
  win.show();
  await new Promise((r) => setTimeout(r, 6000));
  if (process.env.ZWIFT_PLAN_THEME) {
    const theme = process.env.ZWIFT_PLAN_THEME;
    await win.webContents.executeJavaScript(
      `document.documentElement.dataset.theme=${JSON.stringify(theme)};try{localStorage.setItem('zp-theme',${JSON.stringify(theme)})}catch{}`);
  }
  const shots = (process.env.ZWIFT_PLAN_SHOTS || 'today,routes,badges,achievements,events,challenge')
    .split(',').map((entry) => { const [tab, scroll] = entry.split(':'); return { tab, scroll: Number(scroll) || 0, name: entry.replace(':', '-') }; });
  for (const { tab, scroll, name } of shots) {
    await win.webContents.executeJavaScript(tab === 'login'
      ? `document.getElementById('app').hidden=true;document.getElementById('loading').hidden=true;document.getElementById('login').hidden=false;`
      : `document.querySelector('#tabs button[data-tab="${tab}"]').click(); document.querySelector('#panels').scrollTop = ${scroll};`);
    if (process.env.ZWIFT_PLAN_EXPAND) {
      await new Promise((r) => setTimeout(r, 500));
      await win.webContents.executeJavaScript(
        `(()=>{const rows=[...document.querySelectorAll('.rt-name')];const t=rows.find(n=>n.textContent.includes(${JSON.stringify(process.env.ZWIFT_PLAN_EXPAND)}));if(t){t.closest('.rt-row').click();t.closest('.rt-row').scrollIntoView({block:'center'});}})()`);
    }
    await new Promise((r) => setTimeout(r, 1200));
    await win.webContents.capturePage();
    await new Promise((r) => setTimeout(r, 400));
    writeFileSync(join(dir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    console.log(`captured ${name}`);
  }
  app.exit(0);
}

app.whenReady().then(() => {
  app.dock?.hide(); // menu-bar app: no dock icon
  createWindow();
  if (process.env.ZWIFT_PLAN_CAPTURE) return win.webContents.once('did-finish-load', () => capture(process.env.ZWIFT_PLAN_CAPTURE));
  tray = new Tray(trayIcon());
  tray.setToolTip('Zwift Badge Planner');
  tray.on('click', toggleWindow);
  tray.on('right-click', toggleWindow);
});

app.on('window-all-closed', (e) => e.preventDefault()); // stay resident in the menu bar

ipcMain.handle('zwift:status', () => ({ signedIn: hasStoredSession() }));

ipcMain.handle('zwift:signIn', async (_e, { username, password }) => {
  try {
    await signIn(username, password);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } // the password is never stored, logged, or returned
});

ipcMain.handle('zwift:signOut', () => {
  try { unlinkSync(TOKEN_PATH); } catch { /* already gone */ }
  return { ok: true };
});

ipcMain.handle('zwift:load', async (_e, { hours }) => {
  try {
    return { ok: true, data: await loadAll({ hours }) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('zwift:quit', () => app.exit(0));
