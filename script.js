const dieButtons = document.querySelectorAll("[data-die]");
const dicePoolContainer = document.getElementById("dice-pool");
const ruleChips = document.getElementById("rule-chips");
const ruleCountDisplay = document.getElementById("rule-count");
const ruleCountInc = document.getElementById("count-inc");
const ruleCountDec = document.getElementById("count-dec");
const outcomesContainer = document.getElementById("outcomes-container");
const addOutcomeButton = document.getElementById("add-outcome");
const autoSpreadButton = document.getElementById("auto-spread");
const coverageEl = document.getElementById("outcome-coverage");
const summaryDice = document.getElementById("summary-dice");
const summaryMean = document.getElementById("summary-mean");
const summaryRange = document.getElementById("summary-range");
const chartCaption = document.getElementById("chart-caption");
const chartContainer = document.getElementById("chart");
const tableContainer = document.getElementById("table-container");

const dicePool = [6, 6, 6];
let activeRule = "none";
let activeRuleCount = 1;
let outcomes = [
  { label: "Outcome 1", min: 3, max: 6 },
  { label: "Outcome 2", min: 7, max: 10 },
  { label: "Outcome 3", min: 11, max: 18 }
];
let lastDistribution = null;

dieButtons.forEach(button => {
  button.addEventListener("click", () => {
    const sides = parseInt(button.dataset.die, 10);
    addDieToPool(sides);
  });
});

dicePoolContainer.addEventListener("click", event => {
  const target = event.target.closest("[data-index]");
  if (!target) return;
  const index = parseInt(target.dataset.index, 10);
  dicePool.splice(index, 1);
  renderPool();
  calculateDistribution();
});

ruleChips.addEventListener("click", event => {
  const chip = event.target.closest("[data-rule]");
  if (!chip) return;
  activeRule = chip.dataset.rule;
  Array.from(ruleChips.children).forEach(btn => btn.classList.remove("active"));
  chip.classList.add("active");
  calculateDistribution();
});

ruleCountInc.addEventListener("click", () => {
  activeRuleCount = Math.min(30, activeRuleCount + 1);
  updateRuleCount();
  calculateDistribution();
});

ruleCountDec.addEventListener("click", () => {
  activeRuleCount = Math.max(1, activeRuleCount - 1);
  updateRuleCount();
  calculateDistribution();
});

addOutcomeButton.addEventListener("click", () => {
  outcomes.push({ label: `Outcome ${outcomes.length + 1}`, min: null, max: null });
  renderDesigner(lastDistribution);
});

autoSpreadButton.addEventListener("click", () => {
  if (!lastDistribution) return;
  autoSpreadRanges(lastDistribution);
  renderDesigner(lastDistribution);
  renderChart(lastDistribution);
});

outcomesContainer.addEventListener("input", event => {
  const row = event.target.closest("[data-idx]");
  if (!row) return;
  const idx = Number(row.dataset.idx);
  const field = event.target.name;
  if (field === "label") {
    outcomes[idx].label = event.target.value;
  } else if (field === "min" || field === "max") {
    const val = parseInt(event.target.value, 10);
    outcomes[idx][field] = Number.isFinite(val) ? val : null;
  }
  renderDesigner(lastDistribution);
  renderChart(lastDistribution);
});

outcomesContainer.addEventListener("click", event => {
  const shiftBtn = event.target.closest("[data-shift]");
  if (shiftBtn) {
    const idx = Number(shiftBtn.dataset.shift);
    const delta = Number(shiftBtn.dataset.delta);
    shiftRange(idx, delta);
    return;
  }
  const removeBtn = event.target.closest("[data-remove]");
  if (!removeBtn) return;
  const idx = Number(removeBtn.dataset.remove);
  outcomes.splice(idx, 1);
  if (!outcomes.length) outcomes.push({ label: "Outcome 1", min: null, max: null });
  renderDesigner(lastDistribution);
  renderChart(lastDistribution);
});

function updateRuleCount() {
  ruleCountDisplay.textContent = activeRuleCount;
}

function addDieToPool(sides) {
  if (!Number.isFinite(sides)) return;
  if (sides < 2 || sides > 200) {
    chartContainer.innerHTML = `<p class="muted">Dice must have between 2 and 200 sides.</p>`;
    tableContainer.innerHTML = "";
    updateSummary(null);
    chartCaption.textContent = "";
    return;
  }
  dicePool.push(sides);
  renderPool();
  calculateDistribution();
}

function renderPool() {
  if (!dicePool.length) {
    dicePoolContainer.innerHTML = `<p class="muted">Add dice to begin.</p>`;
    return;
  }
  dicePoolContainer.innerHTML = dicePool
    .map(
      (sides, idx) => `<button type="button" class="pool-die" data-index="${idx}">
          <span class="pill-icon remove" aria-hidden="true">×</span>
          <span class="pill-label">d${sides}</span>
        </button>`
    )
    .join("");
}

function calculateDistribution() {
  const errors = [];

  if (!dicePool.length) {
    errors.push("Add at least one die to see the distribution.");
  } else if (dicePool.length > 30) {
    errors.push("Let's cap it at 30 dice to keep things readable.");
  }

  const invalid = dicePool.find(s => s < 2 || s > 200);
  if (invalid) {
    errors.push("All dice must have between 2 and 200 sides.");
  }

  if (errors.length) {
    chartContainer.innerHTML = `<p class="muted">${errors.join(" ")}</p>`;
    tableContainer.innerHTML = "";
    updateSummary(null);
    chartCaption.textContent = "";
    renderDesigner(null);
    lastDistribution = null;
    return;
  }

  const distribution = buildDistribution(dicePool, activeRule, activeRuleCount);
  if (distribution.error) {
    lastDistribution = null;
    chartContainer.innerHTML = `<p class="muted">${distribution.error}</p>`;
    tableContainer.innerHTML = "";
    updateSummary(null);
    chartCaption.textContent = "";
    renderDesigner(null);
    return;
  }

  lastDistribution = distribution;
  if (!rangesValid(distribution)) {
    autoSpreadRanges(distribution);
  }

  renderChart(distribution);
  renderTable(distribution);
  updateSummary(distribution);
  renderDesigner(distribution);
}

function buildDistribution(sidesArray, rule, ruleCount) {
  const active = rule !== "none" && Number.isFinite(ruleCount) && ruleCount > 0;
  if (!active) return buildStandardDistribution(sidesArray);

  const maxOutcomes = 300000;
  const totalOutcomesEstimate = sidesArray.reduce((acc, sides) => acc * sides, 1);
  if (totalOutcomesEstimate > maxOutcomes) {
    return {
      error:
        "Keep/drop rules are supported up to 300k outcome combinations. Reduce dice count or sides to apply the rule."
    };
  }

  const totalsMap = new Map();
  function recurse(idx, currentRoll) {
    if (idx === sidesArray.length) {
      const keptSum = applyRuleToRoll(currentRoll, rule, ruleCount);
      const nextCount = totalsMap.get(keptSum) || 0;
      totalsMap.set(keptSum, nextCount + 1);
      return;
    }
    const sides = sidesArray[idx];
    for (let face = 1; face <= sides; face += 1) {
      currentRoll.push(face);
      recurse(idx + 1, currentRoll);
      currentRoll.pop();
    }
  }

  recurse(0, []);

  const totals = Array.from(totalsMap.keys()).sort((a, b) => a - b);
  const probabilities = totals.map(total => {
    const count = totalsMap.get(total);
    const probability = count / totalOutcomesEstimate;
    return { total, count, probability };
  });

  return {
    totals,
    probabilities,
    totalOutcomes: totalOutcomesEstimate,
    dicePool: [...sidesArray],
    rule,
    ruleCount
  };
}

function buildStandardDistribution(sidesArray) {
  let dist = new Map([[0, 1]]);

  sidesArray.forEach(sides => {
    const next = new Map();
    for (const [sum, count] of dist.entries()) {
      for (let face = 1; face <= sides; face += 1) {
        const newSum = sum + face;
        const nextCount = next.get(newSum) || 0;
        next.set(newSum, nextCount + count);
      }
    }
    dist = next;
  });

  const totals = Array.from(dist.keys()).sort((a, b) => a - b);
  const totalOutcomes = sidesArray.reduce((acc, sides) => acc * sides, 1);

  const probabilities = totals.map(total => {
    const count = dist.get(total);
    const probability = count / totalOutcomes;
    return { total, count, probability };
  });

  return { totals, probabilities, totalOutcomes, dicePool: [...sidesArray], rule: "none", ruleCount: 0 };
}

function applyRuleToRoll(rolls, rule, count) {
  if (rule === "none" || !Number.isFinite(count) || count <= 0) {
    return rolls.reduce((acc, v) => acc + v, 0);
  }

  const sorted = [...rolls].sort((a, b) => a - b);
  const n = sorted.length;
  const c = Math.min(count, n);

  switch (rule) {
    case "keep-high":
      return sorted.slice(n - c).reduce((acc, v) => acc + v, 0);
    case "keep-low":
      return sorted.slice(0, c).reduce((acc, v) => acc + v, 0);
    case "drop-high":
      return sorted.slice(0, n - c).reduce((acc, v) => acc + v, 0);
    case "drop-low":
      return sorted.slice(c).reduce((acc, v) => acc + v, 0);
    default:
      return rolls.reduce((acc, v) => acc + v, 0);
  }
}

function renderChart(distribution) {
  if (!distribution) {
    chartContainer.innerHTML = "";
    return;
  }
  const { probabilities, dicePool: pool } = distribution;
  const width = 960;
  const height = 320;
  const margin = { top: 12, right: 16, bottom: 36, left: 44 };
  const maxProb = Math.max(...probabilities.map(p => p.probability));
  const minSum = probabilities[0].total;
  const maxSum = probabilities[probabilities.length - 1].total;

  const usableWidth = width - margin.left - margin.right;
  const usableHeight = height - margin.top - margin.bottom;

  const points = probabilities.map((p, idx) => {
    const x =
      probabilities.length === 1
        ? width / 2
        : margin.left + (idx / (probabilities.length - 1)) * usableWidth;
    const y =
      height - margin.bottom - (p.probability / maxProb || 0) * usableHeight;
    return { x, y, ...p };
  });

  const pathD = points
    .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ");

  const areaD = [
    `M ${points[0].x} ${height - margin.bottom}`,
    ...points.map(pt => `L ${pt.x} ${pt.y}`),
    `L ${points[points.length - 1].x} ${height - margin.bottom}`,
    "Z"
  ].join(" ");

  const yTicks = 4;
  const tickLines = [];
  for (let i = 0; i <= yTicks; i += 1) {
    const pct = (i / yTicks) * maxProb * 100;
    const y = height - margin.bottom - (i / yTicks) * usableHeight;
    tickLines.push({ y, label: `${pct.toFixed(1)}%` });
  }

  const xTicks = Math.min(8, Math.max(2, probabilities.length - 1));
  const xTickNodes = [];
  for (let i = 0; i <= xTicks; i += 1) {
    const value = minSum + ((maxSum - minSum) * i) / xTicks;
    const rounded = Math.round(value);
    const x =
      probabilities.length === 1
        ? width / 2
        : margin.left + ((value - minSum) / (maxSum - minSum || 1)) * usableWidth;
    xTickNodes.push({ x, label: rounded });
  }

  const probabilitiesByTotal = new Map(probabilities.map(p => [p.total, p.probability]));
  const regions = renderOutcomeRegions(distribution, probabilitiesByTotal, usableWidth, usableHeight, margin);

  chartContainer.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="false">
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.45" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g>
        ${tickLines
          .map(
            t => `<g>
            <line x1="${margin.left}" y1="${t.y}" x2="${width - margin.right}" y2="${t.y}" stroke="rgba(255,255,255,0.06)" />
            <text x="${margin.left - 10}" y="${t.y + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${t.label}</text>
          </g>`
          )
          .join("")}
        <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="rgba(255,255,255,0.2)" />
        ${regions.rects}
        <path d="${areaD}" fill="url(#area)" />
        <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" />
        ${points
          .map(
            pt =>
              `<circle cx="${pt.x}" cy="${pt.y}" r="3" fill="var(--accent)" opacity="0.8">
                <title>Total ${pt.total}: ${(pt.probability * 100).toFixed(2)}%</title>
              </circle>`
          )
          .join("")}
      </g>
      ${regions.labels}
      <g>
        ${xTickNodes
          .map(
            t => `<g>
            <line x1="${t.x}" y1="${height - margin.bottom}" x2="${t.x}" y2="${height - margin.bottom + 6}" stroke="rgba(255,255,255,0.3)" />
            <text x="${t.x}" y="${height - margin.bottom + 24}" text-anchor="middle" fill="var(--muted)" font-size="11">${t.label}</text>
          </g>`
          )
          .join("")}
      </g>
      <text x="${width / 2}" y="${height - 4}" text-anchor="middle" fill="var(--muted)" font-size="11">
        Total (${minSum} - ${maxSum})
      </text>
    </svg>`;

  chartCaption.textContent = `${describePool(pool)}${describeRule()}: exact probability of totals (${minSum} to ${maxSum}).`;
}

function renderOutcomeRegions(distribution, probabilitiesByTotal, usableWidth, usableHeight, margin) {
  const ranges = getOutcomeRanges(distribution);
  if (!ranges.length) return { rects: "", labels: "" };
  const { minSum, maxSum } = getRangeBounds(distribution);
  const baselineY = margin.top + usableHeight;
  const regionHeight = usableHeight * 0.65;
  const hueStep = 360 / Math.max(ranges.length, 1);

  const rects = [];
  const labels = [];

  ranges.forEach((range, idx) => {
    if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) return;
    const startX = margin.left + ((range.min - minSum) / (maxSum - minSum || 1)) * usableWidth;
    const endX = margin.left + ((range.max - minSum) / (maxSum - minSum || 1)) * usableWidth;
    const hue = Math.round((idx * hueStep) % 360);
    const prob = sumProbability(probabilitiesByTotal, range.min, range.max);
    const centerX = (startX + endX) / 2;
    rects.push(`<rect x="${startX}" y="${baselineY - regionHeight}" width="${Math.max(
      endX - startX,
      1
    )}" height="${regionHeight}" fill="hsla(${hue}, 60%, 60%, 0.16)" stroke="hsla(${hue}, 60%, 60%, 0.4)" stroke-width="0.5" rx="6" ry="6">
      <title>${range.label}: ${range.min}-${range.max} (${(prob * 100).toFixed(2)}%)</title>
    </rect>`);
    labels.push(`<text x="${centerX}" y="${baselineY - regionHeight + 18}" text-anchor="middle" fill="var(--text)" font-size="12" font-weight="700" stroke="var(--panel)" stroke-width="0.6" paint-order="stroke fill">
      ${(prob * 100).toFixed(1)}%
    </text>`);
  });

  return { rects: rects.join(""), labels: labels.join("") };
}

function renderTable({ probabilities, totalOutcomes }) {
  const rows = probabilities
    .map(
      p => `<tr>
      <td>${p.total}</td>
      <td>${p.count.toLocaleString("en-US")}</td>
      <td>${(p.probability * 100).toFixed(3)}%</td>
    </tr>`
    )
    .join("");

  tableContainer.innerHTML = `<table>
      <thead>
        <tr>
          <th>Total</th>
          <th>Outcomes</th>
          <th>Probability</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <caption class="muted" style="caption-side: bottom; padding: 8px;">
        Total combinations: ${totalOutcomes.toLocaleString("en-US")}
      </caption>
    </table>`;
}

function updateSummary(distribution) {
  if (!distribution) {
    summaryDice.textContent = "-";
    summaryMean.textContent = "-";
    summaryRange.textContent = "-";
    return;
  }

  const { probabilities, dicePool: pool } = distribution;
  const expectedValue = probabilities.reduce((acc, p) => acc + p.total * p.probability, 0);

  summaryDice.textContent = `${describePool(pool)}${describeRule()}`;
  summaryMean.textContent = expectedValue.toFixed(2);
  summaryRange.textContent = `${probabilities[0].total} - ${probabilities[probabilities.length - 1].total}`;
}

function describePool(pool) {
  if (!pool.length) return "No dice";
  const counts = pool.reduce((acc, sides) => {
    acc[sides] = (acc[sides] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([sides, count]) => `${count}d${sides}`)
    .join(" + ");
}

function describeRule() {
  const mode = activeRule;
  const count = activeRuleCount;
  if (mode === "none" || !Number.isFinite(count) || count <= 0) return "";
  const label =
    mode === "drop-low"
      ? ` drop lowest ${count}`
      : mode === "drop-high"
      ? ` drop highest ${count}`
      : mode === "keep-low"
      ? ` keep lowest ${count}`
      : mode === "keep-high"
      ? ` keep highest ${count}`
      : "";
  return label ? ` (${label})` : "";
}

function getOutcomeRanges(distribution) {
  const { minSum, maxSum } = getRangeBounds(distribution);
  let ranges = outcomes.map(o => {
    const min = Number.isFinite(o.min) ? clamp(o.min, minSum, maxSum) : minSum;
    const max = Number.isFinite(o.max) ? clamp(o.max, minSum, maxSum) : maxSum;
    return { label: o.label, min: Math.min(min, max), max: Math.max(min, max) };
  });

  const invalid = ranges.some(r => !Number.isFinite(r.min) || !Number.isFinite(r.max) || r.min > r.max);
  if (invalid) {
    autoSpreadRanges(distribution);
    ranges = outcomes.map(o => ({
      label: o.label,
      min: clamp(o.min, minSum, maxSum),
      max: clamp(o.max, minSum, maxSum)
    }));
  }
  return ranges;
}

function rangesValid(distribution) {
  if (!distribution) return false;
  const { minSum, maxSum } = getRangeBounds(distribution);
  return outcomes.every(
    o => Number.isFinite(o.min) && Number.isFinite(o.max) && o.min <= o.max && o.min >= minSum && o.max <= maxSum
  );
}

function autoSpreadRanges(distribution) {
  if (!distribution) return;
  const { minSum, maxSum } = getRangeBounds(distribution);
  const span = maxSum - minSum + 1;
  const count = Math.max(outcomes.length, 1);
  const base = Math.floor(span / count);
  let cursor = minSum;

  outcomes = outcomes.map((o, idx) => {
    const extra = idx < span % count ? 1 : 0;
    const start = cursor;
    const end = idx === outcomes.length - 1 ? maxSum : Math.min(maxSum, cursor + base + extra - 1);
    cursor = end + 1;
    return { ...o, min: start, max: end };
  });
}

function shiftRange(idx, delta) {
  if (!lastDistribution) return;
  const { minSum, maxSum } = getRangeBounds(lastDistribution);
  const o = outcomes[idx];
  if (!Number.isFinite(o.min) || !Number.isFinite(o.max)) return;
  let newMin = o.min + delta;
  let newMax = o.max + delta;
  if (newMin < minSum || newMax > maxSum) return;

  const prev = outcomes[idx - 1];
  if (prev && Number.isFinite(prev.max) && newMin <= prev.max) return;
  const next = outcomes[idx + 1];
  if (next && Number.isFinite(next.min) && newMax >= next.min) return;

  outcomes[idx] = { ...o, min: newMin, max: newMax };
  renderDesigner(lastDistribution);
  renderChart(lastDistribution);
}

function getRangeBounds(distribution) {
  const { totals } = distribution;
  return { minSum: totals[0], maxSum: totals[totals.length - 1] };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sumProbability(probabilitiesByTotal, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return 0;
  let prob = 0;
  for (let t = min; t <= max; t += 1) {
    prob += probabilitiesByTotal.get(t) || 0;
  }
  return prob;
}

function renderDesigner(distribution) {
  if (!distribution) {
    outcomesContainer.innerHTML = `<p class="muted">Add dice to configure outcomes.</p>`;
    coverageEl.textContent = "";
    return;
  }
  const { minSum, maxSum } = getRangeBounds(distribution);
  const probabilitiesByTotal = new Map(distribution.probabilities.map(p => [p.total, p.probability]));

  const rows = outcomes
    .map((o, idx) => {
      const min = clamp(o.min, minSum, maxSum);
      const max = clamp(o.max, minSum, maxSum);
      const prob = sumProbability(probabilitiesByTotal, min, max);
      const invalid = !Number.isFinite(min) || !Number.isFinite(max) || min > max;
      return `<div class="outcome-row" data-idx="${idx}">
        <input name="label" class="text-input" value="${escapeHtml(o.label)}" />
        <div class="range-inputs">
          <input name="min" type="number" value="${Number.isFinite(min) ? min : ""}" min="${minSum}" max="${maxSum}" />
          <span class="muted">to</span>
          <input name="max" type="number" value="${Number.isFinite(max) ? max : ""}" min="${minSum}" max="${maxSum}" />
        </div>
        <div class="prob">${invalid ? "-" : `${(prob * 100).toFixed(2)}%`}</div>
        <div class="range-actions">
          <button type="button" class="ghost compact" data-shift="${idx}" data-delta="-1">−</button>
          <button type="button" class="ghost compact" data-shift="${idx}" data-delta="1">+</button>
          <button type="button" class="ghost danger" data-remove="${idx}" aria-label="Remove outcome">×</button>
        </div>
      </div>`;
    })
    .join("");
  outcomesContainer.innerHTML = rows;

  const coverage = evaluateCoverage(outcomes, distribution.totals);
  coverageEl.textContent = coverage.message;
}

function evaluateCoverage(outcomesList, totals) {
  const coverCount = new Map();
  outcomesList.forEach(o => {
    if (!Number.isFinite(o.min) || !Number.isFinite(o.max) || o.min > o.max) return;
    for (let t = o.min; t <= o.max; t += 1) {
      coverCount.set(t, (coverCount.get(t) || 0) + 1);
    }
  });

  const uncovered = totals.filter(t => !coverCount.has(t));
  const overlaps = totals.filter(t => (coverCount.get(t) || 0) > 1);

  const parts = [];
  if (uncovered.length)
    parts.push(`Uncovered totals: ${uncovered[0]}${uncovered.length > 1 ? `…${uncovered[uncovered.length - 1]}` : ""}`);
  if (overlaps.length)
    parts.push(`Overlapping totals: ${overlaps[0]}${overlaps.length > 1 ? `…${overlaps[overlaps.length - 1]}` : ""}`);

  return {
    message: parts.length ? parts.join(" · ") : "All totals covered without overlaps."
  };
}

function clamp(val, min, max) {
  if (!Number.isFinite(val)) return val;
  return Math.min(Math.max(val, min), max);
}

// Initial state
renderPool();
updateRuleCount();
calculateDistribution();
