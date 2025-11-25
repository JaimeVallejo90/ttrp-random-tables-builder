const dieButtons = document.querySelectorAll("[data-die]");
const dicePoolContainer = document.getElementById("dice-pool");
const ruleChips = document.getElementById("rule-chips");
const ruleCountDisplay = document.getElementById("rule-count");
const ruleCountInc = document.getElementById("count-inc");
const ruleCountDec = document.getElementById("count-dec");
const summaryDice = document.getElementById("summary-dice");
const summaryMean = document.getElementById("summary-mean");
const summaryRange = document.getElementById("summary-range");
const chartCaption = document.getElementById("chart-caption");
const chartContainer = document.getElementById("chart");
const tableContainer = document.getElementById("table-container");

const dicePool = [6, 6, 6];
let activeRule = "none";
let activeRuleCount = 1;

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

function updateRuleCount() {
  ruleCountDisplay.textContent = activeRuleCount;
}

function addDieToPool(sides) {
  if (!Number.isFinite(sides)) {
    return;
  }
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
      (sides, idx) =>
        `<button type="button" class="pool-die" data-index="${idx}"><span class="symbol remove">×</span>d${sides}</button>`
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
    return;
  }

  const distribution = buildDistribution(dicePool, activeRule, activeRuleCount);
  if (distribution.error) {
    chartContainer.innerHTML = `<p class="muted">${distribution.error}</p>`;
    tableContainer.innerHTML = "";
    updateSummary(null);
    chartCaption.textContent = "";
    return;
  }

  renderChart(distribution);
  renderTable(distribution);
  updateSummary(distribution);
}

function buildDistribution(sidesArray, rule, ruleCount) {
  const active = rule !== "none" && Number.isFinite(ruleCount) && ruleCount > 0;
  if (!active) {
    return buildStandardDistribution(sidesArray);
  }

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

function renderChart({ probabilities, dicePool: pool }) {
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
      <text x="${width / 2}" y="${height - 10}" text-anchor="middle" fill="var(--muted)" font-size="11">
        Total (${minSum} - ${maxSum})
      </text>
    </svg>`;

  chartCaption.textContent = `${describePool(pool)}${describeRule()}: exact probability of totals (${minSum} to ${maxSum}).`;
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
  const expectedValue = probabilities.reduce(
    (acc, p) => acc + p.total * p.probability,
    0
  );

  summaryDice.textContent = describePool(pool);
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

// Initial state
renderPool();
updateRuleCount();
calculateDistribution();
