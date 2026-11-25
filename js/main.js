const tooltip = document.querySelector("#tooltip");
const count = value => value.toLocaleString("en-AU");
const decimal = value => value.toFixed(2);
const signed = (value, format) => (value > 0 ? "+" : "") + format(value);

function hideTooltip() {
  tooltip.hidden = true;
}

function showTooltip(x, y, text) {
  tooltip.textContent = text;
  tooltip.hidden = false;
  const left = Math.max(8, Math.min(x + 12, innerWidth - tooltip.offsetWidth - 8));
  const top = Math.max(8, Math.min(y + 12, innerHeight - tooltip.offsetHeight - 8));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") hideTooltip();
});

function addTooltips(marks, describe) {
  marks.attr("class", "mark")
    .attr("tabindex", 0)
    .attr("role", "img")
    .attr("aria-label", describe)
    .on("pointerenter pointermove", (event, row) => {
      showTooltip(event.clientX, event.clientY, describe(row));
    })
    .on("focus pointerdown", function (event, row) {
      const bounds = this.getBoundingClientRect();
      showTooltip(bounds.left + bounds.width / 2, bounds.top, describe(row));
    })
    .on("pointerleave blur", hideTooltip);
}

function createPlot(container, height, minimumWidth) {
  const width = Math.max(container.clientWidth, minimumWidth);
  const svg = d3.select(container).append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "group")
    .attr("aria-label", container.getAttribute("aria-label"));

  return { svg, width };
}

function drawAxis(svg, generator, x, y, className = "axis") {
  svg.append("g")
    .attr("class", className)
    .attr("transform", `translate(${x},${y})`)
    .call(generator);
}

function axisLabel(svg, x, y, text, anchor = "start") {
  svg.append("text")
    .attr("class", "axis-label")
    .attr("x", x)
    .attr("y", y)
    .attr("text-anchor", anchor)
    .text(text);
}

function drawLine(container, rows) {
  const height = 310;
  const { svg, width } = createPlot(container, height, 275);
  const left = 58;
  const right = width - 20;
  const bottom = 255;

  const x = d3.scaleLinear()
    .domain(d3.extent(rows, row => row.year))
    .range([left, right]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(rows, row => row.total)])
    .nice()
    .range([bottom, 35]);

  const years = rows.map(row => row.year)
    .filter((_, index) => width >= 660 || index % (width < 420 ? 5 : 2) === 0);

  drawAxis(svg, d3.axisLeft(y).ticks(5).tickSize(left - right).tickFormat(""), left, 0, "grid");
  drawAxis(svg, d3.axisLeft(y).ticks(5).tickFormat(d3.format(",d")), left, 0);
  drawAxis(svg, d3.axisBottom(x).tickValues(years).tickFormat(d3.format("d")), 0, bottom);

  axisLabel(svg, 0, 16, "Number of hospitalisations");
  axisLabel(svg, (left + right) / 2, 297, "Calendar year", "middle");

  const line = d3.line().x(row => x(row.year)).y(row => y(row.total));

  svg.append("path")
    .datum(rows)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "#12666b")
    .attr("stroke-width", 3);

  const points = svg.selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("cx", row => x(row.year))
    .attr("cy", row => y(row.total))
    .attr("r", 5)
    .attr("fill", "#12666b");

  addTooltips(points, row => `${row.year} · ${count(row.total)} hospitalisations`);
}

function drawBars(container, rows, options) {
  const height = rows.length * 37 + 76;
  const { svg, width } = createPlot(container, height, 290);
  const left = options.left;
  const right = width - 59;
  const bottom = height - 47;

  const x = d3.scaleLinear()
    .domain([Math.min(0, d3.min(rows, options.value)), Math.max(0, d3.max(rows, options.value))])
    .nice()
    .range([left, right]);

  const y = d3.scaleBand()
    .domain(rows.map(row => row.name))
    .range([26, bottom])
    .padding(.28);

  const ticks = width < 450 ? 4 : 7;
  drawAxis(svg, d3.axisBottom(x).ticks(ticks).tickSize(26 - bottom).tickFormat(""), 0, bottom, "grid");
  drawAxis(svg, d3.axisBottom(x).ticks(ticks).tickFormat(options.tick), 0, bottom);
  drawAxis(svg, d3.axisLeft(y).tickSize(0).tickPadding(7), left, 0);

  axisLabel(svg, 0, 15, options.category);
  axisLabel(svg, width / 2, height - 6, options.unit, "middle");

  svg.append("line")
    .attr("x1", x(0)).attr("x2", x(0))
    .attr("y1", 26).attr("y2", bottom)
    .attr("stroke", "#849b9f");

  const bars = svg.selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("x", row => x(Math.min(0, options.value(row))))
    .attr("y", row => y(row.name))
    .attr("width", row => Math.abs(x(options.value(row)) - x(0)))
    .attr("height", y.bandwidth())
    .attr("rx", 3)
    .attr("fill", row => options.value(row) < 0 ? "#a45231" : "#247981");

  addTooltips(bars, options.describe);

  svg.selectAll(".bar-value")
    .data(rows)
    .join("text")
    .attr("class", "bar-value")
    .attr("x", row => x(Math.max(0, options.value(row))) + 5)
    .attr("y", row => y(row.name) + y.bandwidth() / 2)
    .attr("dy", ".35em")
    .text(row => options.format(options.value(row)));
}


function drawParetoChart(container, rows, limit = "all") {
  const sorted = rows
    .filter(row => Number.isFinite(row.count) && row.count >= 0)
    .sort((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    container.textContent = "No road-user data available.";
    return;
  }

  // Short labels for better chart readability
  const getLabel = group => {
    const value = group.toLowerCase();

    if (value.includes("car")) return "Car occupants";
    if (value.includes("motorcycl")) return "Motorcyclists";
    if (value.includes("pedal")) return "Pedal cyclists";
    if (value.includes("pedestrian")) return "Pedestrians";
    if (value.includes("heavy")) return "Heavy transport";
    if (value.includes("pick-up") || value.includes("van")) {
      return "Pick-up / van";
    }
    if (value.includes("bus")) return "Bus occupants";

    return group;
  };

  // Calculate cumulative percentage using all seven categories
  const total = d3.sum(sorted, row => row.count);
  let runningTotal = 0;

  const ranked = sorted.map(row => {
    runningTotal += row.count;

    return {
      ...row,
      label: getLabel(row.group),
      cumulative: total > 0
        ? runningTotal / total * 100
        : 0
    };
  });

  const visible = limit === "all"
    ? ranked
    : ranked.slice(0, Number(limit));

  const height = 470;
  const { svg, width } = createPlot(container, height, 850);

  const left = 75;
  const right = width - 85;
  const top = 50;
  const bottom = 300;

  const x = d3.scaleBand()
    .domain(visible.map(row => row.label))
    .range([left, right])
    .padding(0.22);

  const yCount = d3.scaleLinear()
    .domain([0, d3.max(sorted, row => row.count) || 1])
    .nice()
    .range([bottom, top]);

  const yPercent = d3.scaleLinear()
    .domain([0, 100])
    .range([bottom, top]);

  // Horizontal gridlines
  drawAxis(
    svg,
    d3.axisLeft(yCount).ticks(5).tickSize(left - right).tickFormat(""),
    left,
    0,
    "grid"
  );

  // Left axis: hospitalisation counts
  drawAxis(
    svg,
    d3.axisLeft(yCount).ticks(5).tickFormat(d3.format(",d")),
    left,
    0
  );

  // Right axis: cumulative percentage
  drawAxis(
    svg,
    d3.axisRight(yPercent).ticks(5).tickFormat(value => `${value}%`),
    right,
    0
  );

  // Bottom axis: road-user categories
  const xAxis = svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${bottom})`)
    .call(d3.axisBottom(x).tickSize(0));

  xAxis.selectAll("text")
    .attr("transform", "rotate(-25)")
    .attr("text-anchor", "end")
    .attr("dx", "-0.6em")
    .attr("dy", "0.5em");

  axisLabel(svg, 0, 22, "Hospitalisations");
  axisLabel(svg, width, 22, "Cumulative percentage", "end");
  axisLabel(svg, (left + right) / 2, 435, "Road-user group", "middle");

  // Draw bars
  const bars = svg.selectAll(".pareto-bar")
    .data(visible)
    .join("rect")
    .attr("class", "pareto-bar")
    .attr("x", row => x(row.label))
    .attr("y", row => yCount(row.count))
    .attr("width", x.bandwidth())
    .attr("height", row => bottom - yCount(row.count))
    .attr("rx", 3)
    .attr("fill", "#247981");

  addTooltips(bars, row =>
    `${row.group}: ${count(row.count)} hospitalisations`
  );

  // Cumulative percentage line
  const line = d3.line()
    .x(row => x(row.label) + x.bandwidth() / 2)
    .y(row => yPercent(row.cumulative));

  svg.append("path")
    .datum(visible)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", "#a45231")
    .attr("stroke-width", 3);

  // Line points
  const points = svg.selectAll(".pareto-point")
    .data(visible)
    .join("circle")
    .attr("class", "pareto-point")
    .attr("cx", row => x(row.label) + x.bandwidth() / 2)
    .attr("cy", row => yPercent(row.cumulative))
    .attr("r", 5)
    .attr("fill", "#a45231");

  addTooltips(points, row =>
    `${row.group}: ${row.cumulative.toFixed(2)}% cumulative`
  );

  // Chart legend
  const legend = svg.append("g")
    .attr("transform", `translate(${left + 30},455)`);

  legend.append("rect")
    .attr("width", 13)
    .attr("height", 13)
    .attr("fill", "#247981");

  legend.append("text")
    .attr("x", 20)
    .attr("y", 11)
    .text("Hospitalisations");

  legend.append("line")
    .attr("x1", 165)
    .attr("x2", 185)
    .attr("y1", 6)
    .attr("y2", 6)
    .attr("stroke", "#a45231")
    .attr("stroke-width", 3);

  legend.append("text")
    .attr("x", 192)
    .attr("y", 11)
    .text("Cumulative percentage");
}

const stateAbbreviations = {
  "New South Wales": "NSW",
  "Victoria": "VIC",
  "Queensland": "QLD",
  "South Australia": "SA",
  "Western Australia": "WA",
  "Tasmania": "TAS",
  "Northern Territory": "NT",
  "Australian Capital Territory": "ACT"
};

function displayShare(value) {
  return value === null ? "n.p." : `${decimal(value)}%`;
}

function drawHeatmap(container, rows, categoryLabel) {
  const { svg, width } = createPlot(container, 354, 720);
  const states = Array.from(new Set(rows.map(row => row.state)));
  const groups = Array.from(new Set(rows.map(row => row.group)));

  const x = d3.scaleBand().domain(groups).range([68, width - 12]).padding(.04);
  const y = d3.scaleBand().domain(states).range([68, 347]).padding(.07);
  const colour = d3.scaleLinear()
    .domain([0, 60])
    .range(["#e9f6f3", "#0f6164"])
    .clamp(true);

  axisLabel(svg, 0, 16, "State or territory");
  axisLabel(svg, (width + 56) / 2, 16, categoryLabel, "middle");
  drawAxis(
    svg,
    d3.axisLeft(y).tickSize(0).tickPadding(8)
      .tickFormat(state => stateAbbreviations[state] ?? state),
    68,
    0
  );

  svg.selectAll(".group-label")
    .data(groups)
    .join("text")
    .attr("class", "group-label")
    .attr("text-anchor", "middle")
    .attr("y", 37)
    .each(function (group) {
      const words = group.split(" ");
      const lines = group.length > 13
        ? [words.slice(0, -1).join(" "), words.at(-1)]
        : [group];
      d3.select(this).selectAll("tspan")
        .data(lines)
        .join("tspan")
        .attr("x", x(group) + x.bandwidth() / 2)
        .attr("dy", (_, index) => index * 15)
        .text(line => line);
    });

  const cells = svg.selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("x", row => x(row.group))
    .attr("y", row => y(row.state))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 3)
    .attr("fill", row => row.share === null ? "#edf0f2" : colour(row.share));

  addTooltips(cells, row => {
    const value = row.share === null ? "Not published" : displayShare(row.share);
    return `${row.state} · ${row.group} · ${value}`;
  });

  svg.selectAll(".cell-label")
    .data(rows)
    .join("text")
    .attr("class", "cell-label")
    .attr("x", row => x(row.group) + x.bandwidth() / 2)
    .attr("y", row => y(row.state) + y.bandwidth() / 2)
    .attr("dy", ".35em")
    .attr("text-anchor", "middle")
    .attr("fill", row => row.share > 42 ? "#fff" : "#172f3a")
    .text(row => displayShare(row.share));

  d3.select(container).append("div")
    .attr("class", "matrix-key")
    .html('Share within each state or territory: 0% <span class="scale" aria-hidden="true"></span> 60% · n.p. = Not published');
}

function addDataTable(section, headers, rows) {
  const details = d3.select(section).append("details");
  details.append("summary").text("View chart data");

  const table = details.append("div").attr("class", "table-wrap").append("table");
  table.append("thead").append("tr")
    .selectAll("th").data(headers).join("th")
    .attr("scope", "col").text(value => value);
  table.append("tbody")
    .selectAll("tr").data(rows).join("tr")
    .selectAll("td").data(row => row).join("td")
    .text(value => value);
}

function mountChart(section, draw) {
  const container = section.querySelector(".chart");
  let lastWidth;

  function render() {
    lastWidth = container.clientWidth;
    hideTooltip();
    container.replaceChildren();
    draw(container);
  }

  render();
  const observer = new ResizeObserver(() => {
    if (container.clientWidth !== lastWidth) render();
  });
  observer.observe(container);
  return render;
}

function readShareRow(row) {
  return {
    state: row.State,
    group: row.ColumnNames,
    share: row.ColumnValues.trim() === "" ? null : Number(row.ColumnValues)
  };
}

async function start() {
  const annual = document.querySelector("#annual");
  const remoteness = document.querySelector("#remoteness");
  const roadUsers = document.querySelector("#road-users");
  const ageGroups = document.querySelector("#age");
  const bedDays = document.querySelector("#bed-days");

  const [years, places, roads, ages, beds, paretoRows] = await Promise.all([
    d3.csv("./data/q1_annual_trend.csv", row => ({
      year: Number(row["Calendar year"]),
      total: Number(row.Total)
    })),
    d3.csv("./data/q2_remoteness.csv", row => ({
      name: row.Remoteness,
      start: Number(row["2011"]),
      end: Number(row["2021"]),
      percent: Number(row.pct_change)
    })),
    d3.csv("./data/q3_road_users.csv", readShareRow),
    d3.csv("./data/q4_age_groups.csv", readShareRow),
    d3.csv("./data/q5_bed_days.csv", row => ({
      name: row.state.toUpperCase(),
      cases: Number(row.cases),
      days: Number(row.bed_days),
      average: Number(row["Bed days per hospitalisation"])
    })),
    d3.csv("./data/q3_pareto_counts.csv", 
      row => ({group: row["Road-user group"],
      count: Number(row.Hospitalisations)
    }))
  ]);

  years.sort((a, b) => a.year - b.year);
  beds.sort((a, b) => b.average - a.average);
  paretoRows.sort((a, b) => b.count - a.count);

  // Q1: annual line chart
  mountChart(annual, container => drawLine(container, years));
  addDataTable(annual, ["Year", "Hospitalisations"],
    years.map(row => [row.year, count(row.total)]));

  // Q2: percentage or count change
  let measure = "percent";
  const percentLabel = value => `${decimal(value)}%`;

  const renderRemoteness = mountChart(remoteness, container => {
    const showPercent = measure === "percent";
    drawBars(container, places, {
      left: 86,
      category: "Residential remoteness category",
      unit: showPercent ? "Change in hospitalisations (%)" : "Change in hospitalisations (cases)",
      value: row => showPercent ? row.percent : row.end - row.start,
      tick: showPercent ? value => `${value}%` : d3.format(",d"),
      format: value => signed(value, showPercent ? percentLabel : count),
      describe: row =>
        `${row.name} · 2011: ${count(row.start)} · 2021: ${count(row.end)} · ` +
        `${signed(row.percent, percentLabel)} (${signed(row.end - row.start, count)} cases)`
    });
  });

  const buttons = remoteness.querySelectorAll("button[data-measure]");
  buttons.forEach(button => button.addEventListener("click", () => {
    measure = button.dataset.measure;
    buttons.forEach(item => item.setAttribute("aria-pressed", item === button));
    renderRemoteness();
  }));

  addDataTable(remoteness, ["Category", "2011", "2021", "Change (%)", "Change (cases)"],
    places.map(row => [
      row.name, count(row.start), count(row.end),
      signed(row.percent, decimal), signed(row.end - row.start, count)
    ]));

  
  // Q3: Road-user Pareto chart

  paretoRows.sort((a, b) => b.count - a.count);

  let q3Limit = "all";
  const q3LimitSelect = roadUsers.querySelector("#q3-limit");

  const renderQ3 = mountChart(roadUsers, container => {
    drawParetoChart(container, paretoRows, q3Limit);
  });

  roadUsers.querySelector("#q3-apply").addEventListener("click", () => {
    q3Limit = q3LimitSelect.value;
    renderQ3();
  });

  roadUsers.querySelector("#q3-reset").addEventListener("click", () => {
    q3LimitSelect.value = "all";
    q3Limit = "all";
    renderQ3();
  });

  addDataTable(
    roadUsers,
    ["Road-user group", "Hospitalisations"],
    paretoRows.map(row => [row.group, count(row.count)])
  );

  // Q4: Age-group heatmap with interactive filters

  const q4StateFilter = ageGroups.querySelector("#q4-state-filter");
  const q4AgeFilter = ageGroups.querySelector("#q4-age-filter");

  // Populate state dropdown
  const states = [...new Set(ages.map(row => row.state))];

  states.forEach(state => {
    q4StateFilter.add(new Option(state, state));
  });

  // Populate age-group dropdown
  const ageList = [...new Set(ages.map(row => row.group))];

  ageList.forEach(group => {
    q4AgeFilter.add(new Option(group, group));
  });

  // Default filters
  let selectedState = "all";
  let selectedAge = "all";

  // Render filtered heatmap
  const renderQ4 = mountChart(ageGroups, container => {

    const filteredRows = ages.filter(row =>
      (selectedState === "all" || row.state === selectedState) &&
      (selectedAge === "all" || row.group === selectedAge)
    );

    if (filteredRows.length === 0) {
      container.textContent = "No data available for this selection.";
      return;
    }

    drawHeatmap(container, filteredRows, "Age group (years)");
  });

  // Apply Filter button
  ageGroups.querySelector("#q4-apply").addEventListener("click", () => {

    selectedState = q4StateFilter.value;
    selectedAge = q4AgeFilter.value;

    renderQ4();
  });

  // Reset button
  ageGroups.querySelector("#q4-reset").addEventListener("click", () => {

    q4StateFilter.value = "all";
    q4AgeFilter.value = "all";

    selectedState = "all";
    selectedAge = "all";

    renderQ4();
  });

  // Display original complete data table
  addDataTable(
    ageGroups,
    ["State or territory", "Age group (years)", "Share (%)"],
    ages.map(row => [
      row.state,
      row.group,
      displayShare(row.share)
    ])
  );


  // Q5: bed days per hospitalisation, ranked highest first
  mountChart(bedDays, container => drawBars(container, beds, {
    left: 48,
    category: "State or territory",
    unit: "Average bed days per hospitalisation (days)",
    value: row => row.average,
    tick: d3.format("~g"),
    format: decimal,
    describe: row =>
      `${row.name} · ${decimal(row.average)} days per hospitalisation · ` +
      `${count(row.days)} bed days / ${count(row.cases)} hospitalisations`
  }));

  addDataTable(bedDays, ["State or territory", "Hospitalisations", "Bed days", "Average (days)"],
    beds.map(row => [row.name, count(row.cases), count(row.days), decimal(row.average)]));
}

start().catch(error => {
  console.error(error);
  const status = document.querySelector("#load-status");
  status.textContent = "The charts could not load. Open the page through a local web server, check the five CSV filenames, and make sure the D3.js CDN is reachable.";
  status.hidden = false;
});