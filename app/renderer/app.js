const $ = (s) => document.querySelector(s);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
const esc = (s) => String(s ?? '');
const hhmm = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const toemin = (h) => (h < 1 ? Math.round(h * 60) + 'm' : hhmm(h));
const num = (n) => Math.round(n).toLocaleString();
const dropsFmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));
const hm = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

let DATA = null;
let todayBracket = 1; // default: 1 hour, matching the design

// ---------- theme (system / dark / light) ----------
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  document.querySelectorAll('#themeseg button').forEach((b) => b.classList.toggle('active', b.dataset.theme === mode));
  try { localStorage.setItem('zp-theme', mode); } catch { /* storage may be unavailable */ }
}
function initTheme() {
  let mode = 'system';
  try { mode = localStorage.getItem('zp-theme') || 'system'; } catch { /* ignore */ }
  applyTheme(['system', 'dark', 'light'].includes(mode) ? mode : 'system');
  document.querySelectorAll('#themeseg button').forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.theme)));
}

function tabTo(name) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== `p-${name}`; });
}

// ---------- route segment breakdown (real POI positions from zwift-data) ----------
// No per-point elevation trace exists for Zwift routes (zwift-data ships only
// total climbing + segment positions), so we show the accurate segment list
// rather than a modelled curve.
function segCounts(route) {
  const segs = route.onRouteSegments || [];
  return { sprints: segs.filter((s) => s.kind === 'sprint').length, koms: segs.filter((s) => s.kind !== 'sprint').length };
}

function profilePanel(route) {
  const box = el('div', 'profile');
  const legend = el('div', 'plegend');
  const add = (cls, txt) => { const s = el('span', 'lg'); s.append(el('i', cls)); s.append(document.createTextNode(txt)); legend.append(s); };
  const { sprints, koms } = segCounts(route);
  add('i-climb', `${num(route.elevationM)} m climbing`);
  if (sprints) add('i-sprint', `${sprints} sprint${sprints > 1 ? 's' : ''}`);
  if (koms) add('i-kom', `${koms} KOM${koms > 1 ? 's' : ''}`);
  box.append(legend);
  const segs = (route.onRouteSegments || []).slice().sort((a, b) => a.from - b.from);
  if (segs.length) {
    const list = el('div', 'pseglist');
    segs.forEach((s) => {
      const r = el('div', 'pseg');
      r.append(el('span', 'k', (s.kind === 'sprint' ? '⚡ ' : '▲ ')));
      r.append(document.createTextNode(`${s.name} · ${s.from.toFixed(1)}–${s.to.toFixed(1)} km${s.incline ? ` · ${s.incline}%` : ''}`));
      list.append(r);
    });
    box.append(list);
  } else {
    box.append(el('div', 'lg-note', 'No timed sprint or KOM segments on this route.'));
  }
  return box;
}


// ---------- Today ----------
const BRACKETS = [['30M', 0, 0.5], ['1H', 0.5, 1], ['1H30', 1, 1.5], ['2H', 1.5, 2], ['2H+', 2, Infinity]];

function todayPool() {
  const rides = DATA.routes.filter((r) => r.hours > 0 && !r.isPortal).map((r) => ({ ...r, _kind: 'ride' }));
  const evs = DATA.events.filter((e) => e.rate && e.hours > 0).map((e) => ({ ...e, _kind: 'event' }));
  return [...rides, ...evs];
}

function heroTags(x) {
  const tags = [];
  const isNew = x._kind === 'ride' ? x.badgeStatus === 'NEW' : x.badgeNew;
  if (isNew && x.badgeXp) tags.push(el('span', 'tag green', `New badge +${num(x.badgeXp)}`));
  if (x.rideXp) tags.push(el('span', 'tag neutral', `Ride XP +${num(x.rideXp)}`));
  if (x.rate) tags.push(el('span', 'tag neutral', `${num(x.rate)} XP/H`));
  if (x.questXp) tags.push(el('span', 'tag blue', `Quest +${num(x.questXp)}`));
  return tags;
}

function heroCard(x) {
  const c = el('div', 'hero');
  const top = el('div', 'hero-top');
  const left = el('div'); left.style.minWidth = '0';
  left.append(el('div', 'hero-label', x._kind === 'event' ? 'Join this' : 'Ride this'));
  left.append(el('div', 'hero-name', x.name));
  const stats = x._kind === 'event'
    ? [hm(x.start), x.routeName || 'event', (x.eventType || '').replace(/_/g, ' ').toLowerCase()].filter(Boolean).join(' · ')
    : `${x.world} · ${x.totalKm.toFixed(1)} km · ${num(x.elevationM)} m · ${hhmm(x.hours)}`;
  left.append(el('div', 'hero-stats', stats));
  top.append(left);
  const xpw = el('div', 'hero-xpwrap');
  xpw.append(el('div', 'hero-xp', num(x.xp)));
  xpw.append(el('div', 'hero-xplab', 'XP'));
  top.append(xpw);
  c.append(top);
  const tags = el('div', 'hero-tags'); heroTags(x).forEach((t) => tags.append(t)); c.append(tags);
  if (x._kind === 'ride') {
    const foot = [x.komCount ? `${x.komCount} KOM` : null, x.sprintCount ? `${x.sprintCount} sprint${x.sprintCount > 1 ? 's' : ''}` : null,
      `${num(x.elevationM)} m climbing`, `${x.totalKm.toFixed(1)} km`].filter(Boolean).join(' · ');
    c.append(el('div', 'hero-foot', foot));
  }
  return c;
}

function rankRow(x, n) {
  const row = el('div', 'lrow');
  row.append(el('div', 'lrank', String(n)));
  const main = el('div', 'lmain');
  const name = el('div', 'lname');
  name.append(el('span', 'txt', x.name));
  const isNew = x._kind === 'ride' ? x.badgeStatus === 'NEW' : x.badgeNew;
  if (x._kind === 'event') name.append(el('span', 'pill event', 'Event'));
  else if (isNew) name.append(el('span', 'pill new', 'New'));
  main.append(name);
  const sub = x._kind === 'event'
    ? [hm(x.start), x.routeName || 'event'].filter(Boolean).join(' · ')
    : `${x.world} · ${x.totalKm.toFixed(1)} km · ${toemin(x.hours)}`;
  main.append(el('div', 'lsub', sub));
  row.append(main);
  const right = el('div', 'lright');
  right.append(el('div', 'lxp', num(x.xp)));
  right.append(el('div', 'lxph', `${num(x.rate)} XP/H`));
  row.append(right);
  return row;
}

function renderToday() {
  const p = $('#p-today'); p.replaceChildren();

  const chips = el('div', 'chips');
  BRACKETS.forEach(([label], i) => {
    const b = el('button', 'chip' + (i === todayBracket ? ' active' : ''), label);
    b.onclick = () => { todayBracket = i; renderToday(); };
    chips.append(b);
  });
  p.append(chips);

  const [, lo, hi] = BRACKETS[todayBracket];
  const seen = new Set(); const picks = [];
  for (const x of todayPool().filter((x) => x.hours > lo && x.hours <= hi).sort((a, b) => b.xp - a.xp)) {
    const key = x.name.replace(/\s*\|.*$/, '').trim();
    if (seen.has(key)) continue; seen.add(key); picks.push(x);
    if (picks.length === 7) break;
  }

  if (!picks.length) { p.append(el('div', 'hero-empty', 'Nothing rated in this time range right now.')); }
  else {
    p.append(heroCard(picks[0]));
    if (picks.length > 1) {
      p.append(el('div', 'seclabel', `Next best inside ${BRACKETS[todayBracket][0].replace('H', ' hour').replace('30', '30').replace('M', ' min')}`.replace(/\s+/g, ' ')));
      picks.slice(1).forEach((x, i) => p.append(rankRow(x, i + 2)));
    }
  }
  p.append(el('div', 'note', 'Zwift registers one route per session — the route you pick from the home screen. These are single-route options ranked by total XP, never a combination.'));

  // Best unearned route of each character (kept from the earlier brief).
  const types = [
    ['Flat', (r) => r.category === 'flat', (r) => `${(r.elevationM / Math.max(r.totalKm, 0.1)).toFixed(0)} m/km`],
    ['Climbing', (r) => r.category === 'mountain' || r.category === 'hilly', (r) => `${num(r.elevationM)} m ↑`],
    ['Sprint', (r) => r.sprintCount > 0, (r) => `${r.sprintCount} sprint${r.sprintCount > 1 ? 's' : ''}`],
    ['Endurance', (r) => r.endurance, (r) => `${r.totalKm.toFixed(0)} km`],
  ];
  const byType = types.map(([name, pred, extra]) => {
    const cands = DATA.routes.filter((r) => r.hours <= DATA.hours && !r.isPortal && pred(r));
    const best = cands.filter((r) => r.badgeStatus === 'NEW').sort((a, b) => b.rate - a.rate)[0] || cands.sort((a, b) => b.rate - a.rate)[0];
    return { name, best, extra };
  }).filter((t) => t.best);
  if (byType.length) {
    p.append(el('div', 'seclabel', `Best route by type · within ${hhmm(DATA.hours)}`));
    byType.forEach(({ name, best, extra }) => {
      const row = el('div', 'lrow');
      const tag = el('div', 'lrank'); tag.style.minWidth = '58px'; tag.style.color = 'var(--acc-ink)';
      tag.style.font = "700 10px 'Barlow Condensed',sans-serif"; tag.style.letterSpacing = '.1em'; tag.style.textTransform = 'uppercase'; tag.textContent = name;
      row.append(tag);
      const main = el('div', 'lmain');
      const nm = el('div', 'lname'); nm.append(el('span', 'txt', best.name));
      if (best.badgeStatus === 'NEW') nm.append(el('span', 'pill new', 'New'));
      main.append(nm);
      main.append(el('div', 'lsub', `${best.world} · ${extra(best)}`));
      row.append(main);
      const right = el('div', 'lright');
      right.append(el('div', 'lxp', num(best.xp)));
      right.append(el('div', 'lxph', `${num(best.rate)} XP/H`));
      row.append(right);
      p.append(row);
    });
  }
}

// ---------- Routes ----------
function renderRoutes() {
  const p = $('#p-routes'); p.replaceChildren();

  const budget = el('div', 'chips wrap');
  budget.append(el('span', 'budgetlab', 'Budget'));
  [1, 1.5, 2, 3, 4].forEach((h) => {
    const b = el('button', 'chip' + (h === DATA.hours ? ' active' : ''), hhmm(h));
    b.style.flex = '0 0 auto'; b.style.minWidth = '52px';
    b.onclick = () => load(h);
    budget.append(b);
  });
  const fits = DATA.routes.filter((r) => r.hours <= DATA.hours && !r.isPortal);
  budget.append(el('span', 'budgetnote', `${fits.length} routes fit`));
  p.append(budget);

  const head = el('div', 'rt-head');
  ['Route', 'Est', 'XP', 'XP/H', 'Badge'].forEach((h, i) => {
    const s = el('span', (i >= 1 && i <= 3 ? 'r' : '') + (i === 3 ? ' orange' : ''), h);
    head.append(s);
  });
  p.append(head);

  for (const r of fits) {
    const row = el('div', 'rt-row');
    const name = el('div');
    const nm = el('div', 'rt-name'); nm.textContent = r.name + (r.levelLocked ? ' ✳' : ''); name.append(nm);
    name.append(el('div', 'rt-sub', `${r.world} · ${r.totalKm.toFixed(1)} km · ${num(r.elevationM)} m`));
    row.append(name);
    row.append(el('div', 'rt-est r', toemin(r.hours)));
    row.append(el('div', 'rt-xp r', num(r.xp)));
    row.append(el('div', 'rt-xph r', num(r.rate)));
    const badge = el('div', 'r');
    badge.append(el('span', 'pill ' + (r.badgeStatus === 'NEW' ? 'new' : r.badgeStatus === 'done' ? 'done' : 'done'), r.badgeStatus === 'NEW' ? 'New' : r.badgeStatus === 'done' ? 'Done' : '—'));
    row.append(badge);

    let open = false, panel = null;
    row.onclick = () => {
      open = !open;
      row.classList.toggle('open', open);
      if (open) { panel = el('div', 'rt-detail'); panel.append(profilePanel(r)); row.after(panel); }
      else if (panel) { panel.remove(); panel = null; }
    };
    p.append(row);
  }
  p.append(el('div', 'note', 'Tap a route for its sprint and KOM segments — where they fall (km) and their gradient. ✳ level-locked: Zwift publishes that a route is locked, not at which level — check in game.'));
}

// ---------- Badges ----------
function renderBadges() {
  const p = $('#p-badges'); p.replaceChildren();
  const earned = DATA.routeBadges.filter((b) => b.earned);
  const remaining = DATA.routeBadges.filter((b) => !b.earned);
  const xpLeft = remaining.reduce((s, b) => s + b.xp, 0);
  const pct = DATA.routeBadges.length ? earned.length / DATA.routeBadges.length : 0;

  p.append(el('div', 'bignum orange', num(xpLeft)));
  p.append(el('div', 'bigsub', 'XP still on the table'));
  const bar = el('div', 'bar'); const i = el('i'); i.style.width = `${pct * 100}%`; bar.append(i); p.append(bar);
  p.append(el('div', 'barmeta', `${earned.length} earned · ${remaining.length} to go`));
  p.append(el('div', 'note', 'A route badge is earned by completing a route you picked from the Zwift home screen (or an event / RoboPacer that runs it) — riding onto it mid-session does not count. One route = one badge; sprint and KOM segments on the way are separate timed-segment achievements.'));

  p.append(el('div', 'seclabel', `Biggest badges left`));
  remaining.sort((a, b) => b.xp - a.xp).slice(0, 40).forEach((b) => {
    const row = el('div', 'lrow');
    const main = el('div', 'lmain');
    const nm = el('div', 'lname'); nm.append(el('span', 'txt', b.name + (b.levelLocked ? ' ✳' : ''))); main.append(nm);
    const segs = [b.sprintCount ? `${b.sprintCount} sprint${b.sprintCount > 1 ? 's' : ''}` : null, b.komCount ? `${b.komCount} KOM${b.komCount > 1 ? 's' : ''}` : null].filter(Boolean).join(', ');
    main.append(el('div', 'lsub', `${b.world} · ${b.km.toFixed(1)} km · ${num(b.elevationM)} m${segs ? ' · ' + segs : ''}`));
    row.append(main);
    const right = el('div', 'lright'); right.append(el('div', 'lxp orange', num(b.xp))); row.append(right);
    p.append(row);
  });

  if (DATA.uncovered?.length) {
    p.append(el('div', 'note', `${DATA.uncovered.length} route badges cannot be free-ridden (running-only or event-only): ${DATA.uncovered.map((a) => a.name).join(', ')}.`));
  }

  const done = el('details');
  done.append(el('summary', null, `Already earned (${earned.length})`));
  earned.sort((a, b) => b.xp - a.xp).forEach((b) => {
    const row = el('div', 'lrow');
    const main = el('div', 'lmain'); main.append(el('div', 'lname', b.name)); main.append(el('div', 'lsub', `${b.world} · ${b.km.toFixed(1)} km`));
    row.append(main);
    const right = el('div', 'lright'); right.append(el('div', 'lxp', num(b.xp))); row.append(right);
    done.append(row);
  });
  p.append(done);
}

// ---------- Achievements ----------
function labelForFamily(family) {
  const named = { GiveRideOn: 'Ride Ons given', GetRideOn: 'Ride Ons received', Watt: 'Peak power', VolcanoLap: 'Volcano laps', DistanceRun: 'Run distance' };
  return named[family] ?? family;
}
function renderAchievements() {
  const p = $('#p-achievements'); p.replaceChildren();
  const fams = DATA.achievementFamilies ?? [];
  const openFams = fams.filter((f) => !f.complete);
  const tiered = openFams.filter((f) => f.tiered && f.nextRung);
  const otherOpen = openFams.filter((f) => !f.tiered && f.nextRung);
  const doneCount = fams.filter((f) => f.complete).length;

  p.append(el('div', 'note', `Non-route achievements — Ride Ons, watts, speed, drafting and the rest. Zwift shows which you hold but not progress toward the others. ${doneCount} of ${fams.length} done.`));

  if (tiered.length) {
    p.append(el('div', 'seclabel', 'Ladders in progress'));
    tiered.forEach((f) => {
      const card = el('div', 'ladder');
      const head = el('div', 'ladder-head');
      head.append(el('div', 'ladder-name', f.nextRung.name));
      head.append(el('div', 'ladder-count', `${f.earnedCount}/${f.rungs.length} rungs`));
      card.append(head);
      const rungs = el('div', 'rungs');
      f.rungs.forEach((_, ri) => rungs.append(el('div', 'rung' + (ri < f.earnedCount ? ' on' : ''))));
      card.append(rungs);
      card.append(el('div', 'ladder-next', f.nextInfo?.howTo ? `Next: ${f.nextInfo.howTo}` : `Next: ${f.nextRung.name} (${labelForFamily(f.family)})`));
      p.append(card);
    });
  }

  const describable = otherOpen.filter((f) => f.nextInfo?.howTo && f.nextInfo.category !== 'event');
  const eventish = otherOpen.filter((f) => !describable.includes(f));
  if (describable.length) {
    p.append(el('div', 'seclabel', 'One-off achievements you can plan for'));
    describable.forEach((f) => {
      const row = el('div', 'achv');
      row.append(el('div', 'achv-name', f.nextRung.name));
      row.append(el('div', 'achv-desc', f.nextInfo.howTo));
      p.append(row);
    });
  }
  if (eventish.length) p.append(el('div', 'note', `Plus ${eventish.length} event badges (time-limited event completions): ${eventish.slice(0, 12).map((f) => f.nextRung.name).join(', ')}${eventish.length > 12 ? '…' : ''}.`));

  const done = el('details');
  done.append(el('summary', null, `Already earned (${doneCount})`));
  fams.filter((f) => f.complete).forEach((f) => {
    const row = el('div', 'achv');
    row.append(el('div', 'achv-name', f.rungs.filter((r) => r.earned).slice(-1)[0]?.name ?? f.family));
    row.append(el('div', 'achv-desc', labelForFamily(f.family)));
    done.append(row);
  });
  p.append(done);
}

// ---------- Events ----------
function renderEvents() {
  const p = $('#p-events'); p.replaceChildren();
  if (!DATA.events.length) { p.append(el('div', 'hero-empty', 'No upcoming cycling events returned.')); return; }
  const newOnes = DATA.events.filter((e) => e.badgeNew);
  const statrow = el('div', 'statrow');
  const stat = (v, k, cls) => { const s = el('div', 'stat' + (cls ? ' ' + cls : '')); s.append(el('b', null, String(v))); s.append(el('span', null, k)); return s; };
  statrow.append(stat(DATA.events.length, 'Events 24h'));
  statrow.append(stat(newOnes.length, 'Earn a badge', 'green'));
  statrow.append(stat(DATA.events.filter((e) => e.eventOnlyRoute).length, 'Event-only routes', 'orange'));
  p.append(statrow);
  p.append(el('div', 'note', 'Event-only routes cannot be free-ridden, so an event is the only way to earn those badges. Starting an event also registers its route for you.'));

  const now = Date.now();
  DATA.events.forEach((e) => {
    const past = new Date(e.start).getTime() < now;
    const row = el('div', 'ev' + (past ? ' past' : ''));
    row.append(el('div', 'ev-time', hm(e.start)));
    const main = el('div', 'ev-main');
    const nm = el('div', 'ev-name');
    nm.append(document.createTextNode(e.name + ' '));
    if (!past && e.badgeNew) nm.append(el('span', 'pill new', 'New'));
    main.append(nm);
    const bits = [e.routeName ?? 'unknown route', e.km ? `${e.km.toFixed(1)} km` : e.basis, (e.eventType || '').replace(/_/g, ' ').toLowerCase()];
    if (e.eventOnlyRoute) bits.push('event-only route');
    main.append(el('div', 'ev-sub', bits.filter(Boolean).join(' · ')));
    row.append(main);
    const xp = (e.rideXp ?? 0) + (e.badgeXp ?? 0);
    row.append(el('div', 'ev-xp', xp ? num(xp) : '—'));
    p.append(row);
  });
}

// ---------- Quests ----------
function renderQuests() {
  const p = $('#p-challenge'); p.replaceChildren();
  const live = (DATA.quests ?? []).filter((q) => q.xpRemaining > 0 || q.dropsTotal > 0 || q.accumulator);

  if (live.length) {
    const statrow = el('div', 'statrow');
    const stat = (v, k, cls) => { const s = el('div', 'stat' + (cls ? ' ' + cls : '')); s.append(el('b', null, String(v))); s.append(el('span', null, k)); return s; };
    statrow.append(stat(live.length, 'Active quests'));
    statrow.append(stat(num(live.reduce((s2, q) => s2 + q.xpRemaining, 0)), 'XP unclaimed', 'orange'));
    statrow.append(stat(dropsFmt(live.reduce((s2, q) => s2 + (q.dropsTotal || 0), 0)), 'Drops on offer', 'blue'));
    p.append(statrow);
    p.append(el('div', 'note', 'Read live from Zwift’s quest API — progress, milestones and rewards are real. Every active quest is auto-enrol, so simply riding counts.'));
  }

  for (const q of live) {
    const box = el('div', 'quest');
    const head = el('div', 'quest-head');
    head.append(el('div', 'quest-name', q.name));
    if (q.endDate) head.append(el('div', 'quest-ends', `Ends ${new Date(q.endDate).toLocaleDateString()}`));
    box.append(head);
    const acc = q.accumulator;
    const pct = acc ? acc.pct : (q.totalGoals ? q.completedGoals / q.totalGoals : 0);
    const bar = el('div', 'bar'); const i = el('i'); i.style.width = `${Math.min(pct, 1) * 100}%`; bar.append(i); box.append(bar);
    const detail = el('div', 'quest-detail');
    if (acc) {
      detail.innerHTML = `${num(acc.current)} / ${num(acc.target)} km · next milestone at ${num(acc.nextMilestoneKm)} km` +
        (acc.nextMilestoneXp ? ` for <b>${num(acc.nextMilestoneXp)} XP</b>` : '') +
        (acc.nextMilestoneDrops ? ` + <b>${dropsFmt(acc.nextMilestoneDrops)} Drops</b>` : '');
    } else {
      detail.innerHTML = `${q.completedGoals} / ${q.totalGoals} goals` +
        (q.xpNow ? ` · next goal pays <b>${num(q.xpNow)} XP</b>` : '') + ` · <b>${num(q.xpRemaining)} XP</b> left`;
    }
    box.append(detail);
    p.append(box);
  }

  if (DATA.climbs?.length) {
    p.append(el('div', 'seclabel', 'Climb Portal'));
    DATA.climbs.forEach((c) => {
      const row = el('div', 'lrow');
      const main = el('div', 'lmain');
      main.append(el('div', 'lname', c.name));
      const when = c.kind === 'quest' ? 'quest climb, open all week' : 'today’s rotation';
      main.append(el('div', 'lsub', `${c.totalKm.toFixed(2)} km · ${num(c.elevationM)} m · ${when}${c.questXp ? ` · quest +${num(c.questXp)}` : ''}`));
      row.append(main);
      const right = el('div', 'lright'); right.append(el('div', 'lxp', num(c.xp))); right.append(el('div', 'lxph', `${num(c.rate)} XP/H`)); row.append(right);
      p.append(row);
    });
    p.append(el('div', 'note', 'Climb Portal roads rotate daily; a Climb of the Week sits outside the rotation and stays open. They carry no ordinary route badge, so they are absent from the route rankings.'));
  }

  const qRoutes = DATA.routes.filter((r) => r.questXp > 0 && r.hours <= DATA.hours && !r.isPortal);
  if (qRoutes.length) {
    p.append(el('div', 'seclabel', 'Routes that pay quest XP now'));
    qRoutes.sort((a, b) => b.questXp - a.questXp).forEach((r) => {
      const row = el('div', 'lrow');
      const main = el('div', 'lmain');
      const nm = el('div', 'lname'); nm.append(el('span', 'txt', r.name)); if (r.badgeStatus === 'NEW') nm.append(el('span', 'pill new', 'New')); main.append(nm);
      main.append(el('div', 'lsub', `${r.world} · ${r.totalKm.toFixed(1)} km`));
      row.append(main);
      const right = el('div', 'lright'); right.append(el('div', 'lxp orange', '+' + num(r.questXp))); right.append(el('div', 'lxph', `${num(r.rate)} XP/H`)); row.append(right);
      p.append(row);
    });
  }
}

// ---------- shell ----------
async function load(hours = 2) {
  $('#loading').hidden = false;
  const res = await window.zwift.load(hours);
  $('#loading').hidden = true;
  if (!res.ok) { $('#loading').hidden = false; $('#loading').textContent = res.error; return; }
  DATA = res.data;
  const a = DATA.athlete;
  const who = $('#who'); who.replaceChildren();
  const main = el('div', 'who-main');
  const line = el('div', 'who-line');
  line.append(el('span', 'who-name', `${DATA.profile.firstName} ${DATA.profile.lastName}`));
  line.append(el('span', 'lvl', `LVL ${DATA.profile.level}`));
  main.append(line);
  main.append(el('div', 'who-stats', `${a.ftp} W · ${a.weightKg} kg · ${(a.ftp / a.weightKg).toFixed(2)} w/kg · ${num(DATA.profile.totalDrops ?? 0)} Drops`));
  who.append(main);
  const right = el('div', 'who-right');
  const earned = DATA.routeBadges.filter((x) => x.earned).length;
  const total = DATA.routeBadges.length;
  const count = el('div', 'who-count'); count.append(document.createTextNode(String(earned))); count.append(el('span', null, `/${total}`));
  right.append(count);
  right.append(el('div', 'who-rlabel', 'Route badges'));
  const wbar = el('div', 'who-bar'); const wi = el('i'); wi.style.width = `${(earned / total) * 100}%`; wbar.append(wi); right.append(wbar);
  who.append(right);

  renderToday(); renderRoutes(); renderBadges(); renderAchievements(); renderEvents(); renderQuests();
  $('#app').hidden = false;
}

async function boot() {
  initTheme();
  const { signedIn } = await window.zwift.status();
  $('#loading').hidden = true;
  if (signedIn) { $('#login').hidden = true; await load(2); }
  else { $('#login').hidden = false; $('#app').hidden = true; }
}

$('#loginform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginbtn'); btn.disabled = true; btn.textContent = 'Signing in…';
  $('#loginerr').hidden = true;
  const res = await window.zwift.signIn($('#user').value, $('#pass').value);
  $('#pass').value = '';
  btn.disabled = false; btn.textContent = 'Sign in';
  if (!res.ok) { $('#loginerr').textContent = res.error; $('#loginerr').hidden = false; return; }
  $('#login').hidden = true;
  await load(2);
});

document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => tabTo(b.dataset.tab)));
$('#refresh').addEventListener('click', () => DATA && load(DATA.hours));
$('#quit').addEventListener('click', () => window.zwift.quit());
boot();
