"use strict";

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const parseDate = (str) => {
  const [d, m, y] = str.split(".").map(Number);
  const year = Number.isFinite(y) ? y : new Date().getFullYear();
  return new Date(year, (m || 1) - 1, d || 1);
};

const tableEl = document.getElementById("table");
const dateButtonsEl = document.getElementById("dateButtons");


let DATA = null;
let avgPosition = "right";
let currentType = "damage";
let currentDate = null;


fetch("battle_data.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Не удалось загрузить battle_data.json: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    DATA = data;
    initDates();
    loadTable(currentType);
  })
  .catch((error) => {
    tableEl.textContent = `Ошибка загрузки данных: ${error.message}`;
  });


function toggleAverage() {
  avgPosition = avgPosition === "right" ? "left" : "right";
  loadTable(currentType);
}

function selectDateButton(activeBtn) {
  dateButtonsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  activeBtn.classList.add("active");
}

function initDates() {
  const dates = [...new Set(DATA.battles.map((b) => b.date))]
    .sort((a, b) => parseDate(a) - parseDate(b));

  dateButtonsEl.innerHTML = "";

  dates.forEach((date, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = date;
    btn.onclick = () => {
      currentDate = date;
      selectDateButton(btn);
      loadTable(currentType);
    };
    dateButtonsEl.appendChild(btn);

    if (index === 0) {
      btn.classList.add("active");
      currentDate = date;
    }
  });

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.innerText = "ВСЕ БОИ";
  allBtn.onclick = () => {
    currentDate = null;
    selectDateButton(allBtn);
    loadTable(currentType);
  };
  dateButtonsEl.appendChild(allBtn);
}

function selectModeButton(activeBtn) {
  document.querySelectorAll(".mode").forEach((b) => b.classList.remove("active"));
  activeBtn?.classList.add("active");
}


function getPenRate(name, battles) {
  let hits = 0;
  let pen = 0;
  battles.forEach((battle) => {
    const player = battle.players[name];
    if (!player) return;
    hits += player.hits;
    pen += player.piercings;
  });
  return hits ? pen / hits : 0;
}

function extractCellValue(type, player) {
  switch (type) {
    case "damage": return player.damage;
    case "damage_received": return player.damage_received;
    case "hits": return `${player.shots}/${player.hits}/${player.piercings}`;
    case "assist": return player.assist_track + player.assist_radio;
    default: return 0;
  }
}

function buildPlayerGrid(type, battles) {
  const players = {};
  battles.forEach((battle, index) => {
    for (const name in battle.players) {
      const player = battle.players[name];
      players[name] ??= {};
      players[name][index] = {
        tank: player.tank,
        value: extractCellValue(type, player),
        assist_track: player.assist_track,
        assist_radio: player.assist_radio,
        alive: player.alive,
      };
    }
  });
  return players;
}

function computeAverages(players, battles) {
  const averages = {};
  for (const name in players) {
    let sum = 0;
    let count = 0;
    battles.forEach((_, i) => {
      const cell = players[name][i];
      if (cell && typeof cell.value === "number") {
        sum += cell.value;
        count++;
      }
    });
    averages[name] = count ? Math.round(sum / count) : 0;
  }
  return averages;
}

function sortPlayerNames(type, players, battles, averages) {
  const names = Object.keys(players);
  return type === "hits"
    ? names.sort((a, b) => getPenRate(b, battles) - getPenRate(a, battles))
    : names.sort((a, b) => averages[b] - averages[a]);
}


function renderAverageHeaderCell(type) {
  return `<th>${type === "hits" ? "%" : "Ср"}</th>`;
}

function renderHeaderRow(type, battles) {
  const avgCell = renderAverageHeaderCell(type);
  const mapCells = battles
    .map((b) => `<th class="${b.win ? "win" : "lose"}">${escapeHtml(b.map)}</th>`)
    .join("");

  return `<tr><th>Ник</th>${avgPosition === "left" ? avgCell : ""}${mapCells}${avgPosition === "right" ? avgCell : ""}</tr>`;
}

function renderAverageDataCell(type, name, battles, averages) {
  return type === "hits"
    ? `<td>${Math.round(getPenRate(name, battles) * 100)}%</td>`
    : `<td>${averages[name]}</td>`;
}

function renderPlayerCell(cell) {
  if (!cell) return "<td></td>";
  const statusClass = cell.alive ? "alive" : "dead";
  return `<td>
    <span class="${statusClass}">${escapeHtml(cell.tank)}</span><br>
    <span>${cell.value}</span>
  </td>`;
}

function renderPlayerRow(type, name, players, battles, averages) {
  const avgCell = renderAverageDataCell(type, name, battles, averages);
  const dataCells = battles.map((_, i) => renderPlayerCell(players[name][i])).join("");
  return `<tr><td>${escapeHtml(name)}</td>${avgPosition === "left" ? avgCell : ""}${dataCells}${avgPosition === "right" ? avgCell : ""}</tr>`;
}

function loadTable(type, event) {
  currentType = type;
  if (event) selectModeButton(event.target);

  const battles = DATA.battles.filter((b) => !currentDate || b.date === currentDate);

  if (!battles.length) {
    tableEl.innerHTML = "<p>Нет боёв</p>";
    return;
  }

  const players = buildPlayerGrid(type, battles);
  const averages = computeAverages(players, battles);
  const sortedNames = sortPlayerNames(type, players, battles, averages);

  const rows = sortedNames
    .map((name) => renderPlayerRow(type, name, players, battles, averages))
    .join("");

  tableEl.innerHTML = `<table>${renderHeaderRow(type, battles)}${rows}</table>`;

  enableHover();
}


function enableHover() {
  const table = document.querySelector("table");
  if (!table) return;

  table.querySelectorAll("td").forEach((cell) => {
    cell.addEventListener("mouseenter", () => {
      const { parentElement: row, cellIndex: index } = cell;
      row.classList.add("hover-row");
      table.querySelectorAll("tr").forEach((tr) => {
        tr.children[index]?.classList.add("hover-col");
      });
      cell.classList.add("hover-cell");
    });

    cell.addEventListener("mouseleave", () => {
      const { parentElement: row, cellIndex: index } = cell;
      row.classList.remove("hover-row");
      table.querySelectorAll("tr").forEach((tr) => {
        tr.children[index]?.classList.remove("hover-col");
      });
      cell.classList.remove("hover-cell");
    });
  });
}
