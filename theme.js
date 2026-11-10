// Revolution with Scores - a wheel carousel beside the selected table's art, title and VPC high scores.
//
// This file does four things, in this order: read the options, draw the wheel, draw the
// selection, and hand every message to core. Input, audio, preloading, layout, the
// loading indicator, attract mode and the backglass and score view pages are core's.

const vpin = new VPinFECore();
window.vpin = vpin;                  // core and its overlays look for this name
window.receiveEvent = receiveEvent;  // core delivers every message through this one

const stage = document.querySelector(".stage");

async function start() {
  vpin.init();

  // Core turns a playfield picture only when asked; this is where it is asked. It is
  // watching before ready: core draws the first table's art before ready resolves.
  new MutationObserver(() => {
    for (const node of artEl.children) {
      node.classList.add("art-media");
      vpin.applyPlayfieldMediaRotation(node);
    }
  }).observe(artEl, { childList: true });

  await vpin.ready;                  // the tables, the options and the layout are in
  document.querySelector("nav.wheel").setAttribute("aria-label", vpin.t("theme.tables_label", "Tables"));

  // Input. Core moves the wheel, pages it and opens the menu and the collection picker.
  // Select is the one action it leaves to a theme.
  vpin.registerInputHandler((action) => {
    if (action === "select") vpin.launchTable(vpin.getCurrentTableIndex());
  });

  // openCollectionPicker() answers null when there is nothing to pick between.
  if (option("startCollectionSelection", false)) await vpin.openCollectionPicker();

  draw({ reason: "enter" });
  document.body.dataset.ready = "true";
}

// --- 1. Options ---------------------------------------------------------------------
// options.json declares them and carries their defaults; core merges in what the person
// chose. Read them where they are used, so the number always matches what the person sees.

function option(key, fallback) {
  const value = vpin.themeConfig ? vpin.themeConfig[key] : undefined;
  return value === undefined ? fallback : value;
}

// --- 2. The wheel -------------------------------------------------------------------
// Seven cards, five of them in view; the middle card is the selection. The same seven
// are refilled on every move, so a step is the cards slid back into place from where
// their pictures were a moment ago. A list shorter than seven leaves the outer cards
// invisible and keeps the selection in the middle.

const SLOTS = 7;
const MIDDLE = 3;
const SLIDE_MS = 520;
const SLIDE_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

const trackEl = document.getElementById("track");
const cards = Array.from({ length: SLOTS }, (_, slot) => {
  const el = document.createElement("li");
  el.dataset.offset = String(slot - MIDDLE);
  const img = document.createElement("img");
  img.alt = "";
  const text = document.createElement("span");
  el.append(img, text);
  trackEl.appendChild(el);
  return { el, img, text };
});

function drawWheel(list) {
  const shown = Math.min(SLOTS, list.length);
  const before = Math.min(MIDDLE, Math.floor((shown - 1) / 2));
  const after = shown - 1 - before;

  cards.forEach((card, slot) => {
    const offset = slot - MIDDLE;
    const used = offset >= -before && offset <= after;
    card.el.style.visibility = used ? "visible" : "hidden";
    if (!used) return;

    const index = list.indexAfter(offset);
    const art = cardArt(list, index);
    card.img.hidden = !art;
    if (art && card.img.getAttribute("src") !== art) card.img.src = art;
    card.text.hidden = Boolean(art);
    card.text.textContent = art ? "" : labelOf(list, index);
  });
}

// What a card shows: the table's wheel, or a collection's picture, or the first wheel in
// the collection. Empty means the card shows the name instead.
function cardArt(list, index) {
  const item = list.items[index];
  if (list.kind === "collection") return item.image_url || (item.game_wheel_urls || [])[0] || "";
  return item.media.includes("wheel") ? vpin.getMediaURL(index, "wheel") : "";
}

function labelOf(list, index) {
  const item = list.items[index];
  return list.kind === "collection" ? item.label : item.game.name;
}

// Slides the wheel one card in the direction the selection moved. The card that is now
// in a slot was in the next slot over a moment ago, so each card also eases from that
// slot's look to its own.
function slide(direction) {
  const sign = direction === "next" ? 1 : -1;
  const animations = [trackEl, ...cards.map((card) => card.el)].flatMap((el) => el.getAnimations());
  animations.forEach((animation) => animation.cancel());

  const down = cards[1].el.offsetTop - cards[0].el.offsetTop;
  const across = cards[1].el.offsetLeft - cards[0].el.offsetLeft;
  const axis = down ? "Y" : "X";
  const step = down || across;

  const looks = cards.map((card) => {
    const { opacity, transform, filter } = getComputedStyle(card.el);
    return { opacity, transform, filter };
  });

  const timing = { duration: SLIDE_MS, easing: SLIDE_EASING };
  trackEl.animate([{ transform: `translate${axis}(${sign * step}px)` }, { transform: "none" }], timing);
  cards.forEach((card, slot) => {
    const from = looks[slot + sign];
    if (from) card.el.animate([from, looks[slot]], timing);
  });
}

// --- 3. The selection ---------------------------------------------------------------
// Everything about the selected table is on its entry. A collection in the picker is a
// row with a name, a count and pictures.

const nameEl = document.getElementById("name");
const eyebrowEl = document.getElementById("eyebrow");
const metaEl = document.getElementById("meta");
const cabEl = document.getElementById("cab");
const artEl = document.getElementById("art");
const scoresEl = document.getElementById("scores");
const scoresHeadingEl = document.getElementById("scores-heading");
const scoresCountEl = document.getElementById("scores-count");
const emptyEl = document.getElementById("empty");

function drawSelection(list) {
  const empty = list.length === 0;
  emptyEl.hidden = !empty;
  emptyEl.textContent = vpin.t("frontend.theme.no_tables_found", "No tables found");
  document.getElementById("selection").hidden = empty;
  if (empty) return;

  const picking = list.kind === "collection";
  stage.dataset.view = picking ? "collections" : "tables";
  if (picking) { stopWatching(); drawCollection(list.current); }
  else drawTable(list.current, list.cursor);
}

function drawTable(entry, index) {
  const { game, table } = entry;
  nameEl.textContent = game.name;
  eyebrowEl.textContent = [game.manufacturer, game.year, game.type].filter(Boolean).join(" / ");

  metaEl.textContent = table.authors.join(", ");
  metaEl.hidden = table.authors.length === 0;

  const hasCab = entry.media.includes("cab");
  cabEl.hidden = !hasCab;
  if (hasCab) cabEl.src = vpin.getMediaURL(index, "cab");

  drawScores(entry);
}

function drawCollection(row) {
  nameEl.textContent = row.label;
  eyebrowEl.textContent = row.is_filter
    ? vpin.t("theme.filter_collection", "Filter collection")
    : vpin.t("theme.collection", "Collection");
  const count = row.table_count;
  metaEl.textContent = Number.isFinite(count)
    ? vpin.t("theme.tables", { one: "{count} Table", other: "{count} Tables" }, { count })
    : "";
  metaEl.hidden = !metaEl.textContent;
  cabEl.hidden = true;
}

// The board for a table: the weekly one on the weekly table, otherwise every version's
// scores merged to one line per player (best score), ranked with shared ranks for ties.
const SCORE_ROWS = 15;
const TOP_ROWS = 3;
const BELOW_ROWS = 1;

function boardFor(entry) {
  const ext = entry.ext || {};
  if (ext.vpc_weekly) {
    const weekly = ext.vpc_weekly;
    return {
      weekly: true,
      week: weekly.week,
      lines: (weekly.scores || []).map(s => ({ ...s, mine: Boolean(s.mine) })),
    };
  }
  const best = new Map();
  for (const version of (ext.vpc && ext.vpc.versions) || []) {
    for (const s of version.scores || []) {
      const key = String(s.player).toLowerCase();
      const have = best.get(key);
      if (!have || s.score > have.score) best.set(key, { ...s, mine: Boolean(s.mine) || Boolean(have && have.mine) });
      else if (s.mine) have.mine = true;
    }
  }
  const lines = [...best.values()].sort((a, b) => b.score - a.score);
  lines.forEach((line, i) => {
    line.rank = i > 0 && line.score === lines[i - 1].score ? lines[i - 1].rank : i + 1;
  });
  return { weekly: false, lines };
}

// Fifteen slots (3 columns of 5). When the player is outside the top, keep the top few, the
// player's line and one below it, and spend the rest on lines spread evenly between, ending
// right above the player, so each is a realistic next target. Ranks show where it skips.
function pickRows(board) {
  const lines = board.lines;
  const mineAt = lines.findIndex(l => l.mine);
  if (lines.length <= SCORE_ROWS || mineAt < 0 || mineAt < SCORE_ROWS) return lines.slice(0, SCORE_ROWS);

  const head = lines.slice(0, TOP_ROWS);
  const tail = lines.slice(mineAt, mineAt + 1 + BELOW_ROWS);
  const first = TOP_ROWS;                       // candidates: first .. mineAt-1
  const count = mineAt - first;
  const slots = SCORE_ROWS - head.length - tail.length;
  const middle = [];
  if (count <= slots) {
    for (let i = first; i < mineAt; i++) middle.push(lines[i]);
  } else {
    const picked = new Set();
    for (let i = 0; i < slots; i++) {
      picked.add(mineAt - 1 - Math.round(i * (count - 1) / Math.max(slots - 1, 1)));
    }
    [...picked].sort((x, y) => x - y).forEach(i => middle.push(lines[i]));
  }
  return [...head, ...middle, ...tail];
}

function drawScores(entry) {
  const board = boardFor(entry);
  scoresHeadingEl.textContent = board.weekly
    ? vpin.t("theme.weekly_heading", "Weekly Competition \u00b7 Week {week}", { week: board.week })
    : vpin.t("theme.scores_heading", "VPC High Scores");
  const total = board.lines.length;
  scoresCountEl.textContent = total
    ? vpin.t("theme.players", { one: "{count} player", other: "{count} players" }, { count: total })
    : "";

  const ext = entry.ext || {};
  const waiting = !total && !board.weekly && !ext.vpc && entry.game && !settled.has(String(entry.game.id));
  scoresEl.setAttribute("aria-busy", waiting ? "true" : "false");
  if (waiting) {
    scoresCountEl.textContent = vpin.t("theme.loading_scores", "Loading scores…");
    scoresEl.replaceChildren(...Array.from({ length: SCORE_ROWS }, () => {
      const li = document.createElement("li");
      li.className = "skeleton";
      li.append(...["rank", "player", "score"].map((cls) => {
        const bar = document.createElement("span");
        bar.className = cls;
        return bar;
      }));
      return li;
    }));
    watchScores(entry);
    return;
  }
  stopWatching();

  if (!total) {
    const none = document.createElement("li");
    none.className = "none";
    none.textContent = vpin.t("theme.no_scores", "No VPC scores yet");
    scoresEl.replaceChildren(none);
    return;
  }
  scoresEl.replaceChildren(...pickRows(board).map(line => {
    const li = document.createElement("li");
    const rank = document.createElement("span");
    const player = document.createElement("span");
    const score = document.createElement("span");
    rank.className = "rank";
    player.className = "player";
    score.className = "score";
    if (!line) {
      li.className = "gap";
      rank.textContent = "\u22ef";
    } else {
      rank.textContent = "#" + line.rank;
      player.textContent = line.player;
      score.textContent = Number(line.score).toLocaleString();
      li.classList.toggle("on", line.mine);
    }
    li.append(rank, player, score);
    return li;
  }));
}

// A table whose scores have not been fetched yet has no entry.ext.vpc, the same as a table
// VPC has none for, and core does not say when the extension's fetch lands. So while the
// skeleton is up, ask core for this game's data again every LOAD_POLL_MS (it forgets what it
// held and re-asks the extension) until scores appear or LOAD_TIMEOUT_MS passes.
const LOAD_POLL_MS = 1500;
const LOAD_TIMEOUT_MS = 10000;
const settled = new Set();  // game ids whose wait is over, so a revisit shows the result at once
let watching = null;

function mergeExt(id, ext) {
  const held = (vpin.tableData || []).find(item => item && item.game && String(item.game.id) === id);
  if (held && ext) held.ext = Object.assign({}, held.ext || {}, ext);
  return held;
}

function stopWatching() {
  if (watching) clearTimeout(watching.timer);
  watching = null;
}

function watchScores(entry) {
  const id = String(entry.game.id);
  if (watching && watching.id === id) return;
  stopWatching();
  const watch = { id, started: Date.now(), timer: 0 };
  watching = watch;

  const selected = () => {
    const list = vpin.activeList();
    return list.length && list.kind !== "collection" ? list.current : null;
  };
  const tick = async () => {
    if (watching !== watch) return;
    let current = selected();
    if (!current || String(current.game.id) !== id) return stopWatching();
    try {
      mergeExt(id, await vpin.call("refresh_entry_data", id));
    } catch (error) {
      // The next tick tries again; the timeout ends it.
    }
    if (watching !== watch) return;
    current = selected();
    if (!current || String(current.game.id) !== id) return stopWatching();
    const got = Boolean((current.ext || {}).vpc);
    if (got || Date.now() - watch.started >= LOAD_TIMEOUT_MS) {
      settled.add(id);
      stopWatching();
      drawScores(current);
    } else {
      watch.timer = setTimeout(tick, LOAD_POLL_MS);
    }
  };
  watch.timer = setTimeout(tick, LOAD_POLL_MS);
}

// --- 4. Messages --------------------------------------------------------------------
// Core needs to see every message first: it keeps the selection, the audio and the
// loading indicator in step with them. After that the theme draws.
//
// reason says why the wheel moved: "step" is one press and slides, anything else cuts.

async function receiveEvent(message) {
  await vpin.handleEvent(message);

  if (message.type === "TableIndexUpdate") {
    draw(message);
  } else if (message.type === "TableDataChange") {
    draw({ reason: "enter" });
  } else if (message.type === "EntryDataChange") {
    // Core's own merge of late data looks at a list that does not exist (this.tables, where
    // the list is tableData), so nothing lands on the entry. Merge it here; it is harmless
    // once core does it too.
    const id = String(message.game_id || "");
    mergeExt(id, message.ext);

    const list = vpin.activeList();
    const current = list.length ? list.current : null;
    if (list.kind !== "collection" && current && current.game && String(current.game.id) === id) {
      drawScores(current);
    }
  }
}

function draw(message) {
  const list = vpin.activeList();
  drawWheel(list);
  drawSelection(list);
  if (message.reason === "step" && message.direction && list.length > 1) slide(message.direction);
}

// Last, so every const above is set before start() reads it.
start();
