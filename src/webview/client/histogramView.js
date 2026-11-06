/**
 * The profiling histogram's chart and table, shared by the QVD editor's
 * Profiling tab and the visual-analysis panel. Both webviews inline this file
 * after Chart.js and Tabulator: it is copied into dist/webview when the
 * extension is built, see copyWebviewLibsPlugin in esbuild.js. The bins come
 * from the profiler: see calculateHistogram in src/qvdStatistics.mjs.
 */

/* exported renderHistogramChart, renderHistogramTable */

/**
 * Draw a histogram as a bar chart
 * @param {CanvasRenderingContext2D} ctx - Canvas to draw on
 * @param {{labels: string[], counts: number[]}} histogram - Bins from the profiler
 * @returns {Chart} The chart
 */
function renderHistogramChart(ctx, histogram) {
  const foreground = getComputedStyle(document.body).getPropertyValue(
    "--vscode-foreground"
  );
  const gridColor = "rgba(128, 128, 128, 0.2)";

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: histogram.labels,
      datasets: [
        {
          label: "Frequency",
          data: histogram.counts,
          backgroundColor: "rgba(75, 192, 192, 0.6)",
          borderColor: "rgba(75, 192, 192, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: "Histogram: Value Distribution",
          color: foreground,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: foreground,
          },
          grid: {
            color: gridColor,
          },
          title: {
            display: true,
            text: "Frequency",
            color: foreground,
          },
        },
        x: {
          ticks: {
            color: foreground,
            maxRotation: 45,
            minRotation: 45,
          },
          grid: {
            color: gridColor,
          },
          title: {
            display: true,
            text: "Value Range",
            color: foreground,
          },
        },
      },
    },
  });
}

/**
 * Show a histogram's bins in a table
 * @param {string} selector - Element to build the table in
 * @param {{rows: Array<{from: string, to: string, count: number, percentage: string}>}} histogram - Bins from the profiler
 * @returns {Tabulator} The table
 */
function renderHistogramTable(selector, histogram) {
  return new Tabulator(selector, {
    data: histogram.rows,
    columns: [
      { title: "From", field: "from", headerSort: true, widthGrow: 1 },
      { title: "To", field: "to", headerSort: true, widthGrow: 1 },
      { title: "Count", field: "count", headerSort: true, widthGrow: 1 },
      {
        title: "Percentage",
        field: "percentage",
        headerSort: true,
        widthGrow: 1,
        formatter: (cell) => cell.getValue() + "%",
      },
    ],
    layout: "fitDataStretch",
    pagination: true,
    paginationSize: 50,
    paginationSizeSelector: [25, 50, 100],
    paginationCounter: "rows",
  });
}
