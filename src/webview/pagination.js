/**
 * Lightweight pagination module for QVD data tables
 * Supports both client-side pagination (current) and server-side pagination (future)
 */
class TablePagination {
  constructor(options) {
    this.data = options.data || [];
    this.columns = options.columns || [];
    this.pageSize = options.pageSize || 100;
    this.currentPage = 0;
    this.totalRows = options.totalRows || this.data.length;
    this.serverSide = options.serverSide || false;

    // Callbacks
    this.onPageChange = options.onPageChange || null;
    this.renderTable =
      options.renderTable || this.defaultRenderTable.bind(this);

    // DOM elements
    this.tableContainer = document.getElementById(options.tableContainerId);
    this.paginationContainer = document.getElementById(
      options.paginationContainerId
    );

    this.render();
  }

  /**
   * Get total number of pages
   */
  get totalPages() {
    return Math.ceil(this.totalRows / this.pageSize);
  }

  /**
   * Get current page data (for client-side pagination)
   */
  getCurrentPageData() {
    if (this.serverSide) {
      return this.data; // Server already sent the right page
    }

    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    return this.data.slice(start, end);
  }

  /**
   * Navigate to specific page
   */
  async goToPage(page) {
    const newPage = Math.max(0, Math.min(page, this.totalPages - 1));

    if (newPage === this.currentPage) return;

    this.currentPage = newPage;

    // If server-side, request new data
    if (this.serverSide && this.onPageChange) {
      await this.onPageChange(this.currentPage, this.pageSize);
    } else {
      this.render();
    }
  }

  /**
   * Update data (called when server sends new page data)
   */
  updateData(newData, totalRows) {
    this.data = newData;
    if (totalRows !== undefined) {
      this.totalRows = totalRows;
    }
    this.render();
  }

  /**
   * Render table and pagination controls
   */
  render() {
    this.renderTable(this.getCurrentPageData(), this.columns);
    this.renderPaginationControls();
  }

  /**
   * Default table renderer
   */
  defaultRenderTable(data, columns) {
    if (!this.tableContainer) return;

    let html = '<table class="qvd-data-table">';

    // Header
    html += "<thead><tr>";
    columns.forEach((col) => {
      html += `<th>${this.escapeHtml(col)}</th>`;
    });
    html += "</tr></thead>";

    // Body
    html += "<tbody>";
    data.forEach((row) => {
      html += "<tr>";
      columns.forEach((col) => {
        const value =
          row[col] !== null && row[col] !== undefined ? row[col] : "";
        html += `<td>${this.escapeHtml(String(value))}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody>";

    html += "</table>";
    this.tableContainer.innerHTML = html;
  }

  /**
   * Render pagination controls
   */
  renderPaginationControls() {
    if (!this.paginationContainer) return;

    const startRow = this.currentPage * this.pageSize + 1;
    const endRow = Math.min(
      (this.currentPage + 1) * this.pageSize,
      this.totalRows
    );

    let html = '<div class="pagination-controls">';

    // Info text
    html += `<div class="pagination-info">
            Showing ${startRow.toLocaleString()} - ${endRow.toLocaleString()} of ${this.totalRows.toLocaleString()} rows
        </div>`;

    html += '<div class="pagination-buttons">';

    // First page
    html += `<button class="pagination-btn" data-action="first" ${
      this.currentPage === 0 ? "disabled" : ""
    }>
            <span class="codicon codicon-chevron-left"></span><span class="codicon codicon-chevron-left"></span>
        </button>`;

    // Previous page
    html += `<button class="pagination-btn" data-action="prev" ${
      this.currentPage === 0 ? "disabled" : ""
    }>
            <span class="codicon codicon-chevron-left"></span>
        </button>`;

    // Page indicator with jump-to
    html += `<div class="pagination-page-info">
            Page <input type="number" class="page-input" min="1" max="${
              this.totalPages
            }" value="${this.currentPage + 1}"> of ${this.totalPages}
        </div>`;

    // Next page
    html += `<button class="pagination-btn" data-action="next" ${
      this.currentPage >= this.totalPages - 1 ? "disabled" : ""
    }>
            <span class="codicon codicon-chevron-right"></span>
        </button>`;

    // Last page
    html += `<button class="pagination-btn" data-action="last" ${
      this.currentPage >= this.totalPages - 1 ? "disabled" : ""
    }>
            <span class="codicon codicon-chevron-right"></span><span class="codicon codicon-chevron-right"></span>
        </button>`;

    html += "</div>"; // pagination-buttons

    // Page size selector
    html += `<div class="pagination-size">
            <label for="page-size-select">Rows per page:</label>
            <select id="page-size-select" class="page-size-select">
                <option value="25" ${
                  this.pageSize === 25 ? "selected" : ""
                }>25</option>
                <option value="50" ${
                  this.pageSize === 50 ? "selected" : ""
                }>50</option>
                <option value="100" ${
                  this.pageSize === 100 ? "selected" : ""
                }>100</option>
                <option value="250" ${
                  this.pageSize === 250 ? "selected" : ""
                }>250</option>
                <option value="500" ${
                  this.pageSize === 500 ? "selected" : ""
                }>500</option>
            </select>
        </div>`;

    html += "</div>"; // pagination-controls

    this.paginationContainer.innerHTML = html;
    this.attachPaginationEvents();
  }

  /**
   * Attach event listeners to pagination controls
   */
  attachPaginationEvents() {
    if (!this.paginationContainer) return;

    // Button clicks
    const buttons =
      this.paginationContainer.querySelectorAll(".pagination-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const action = e.currentTarget.dataset.action;
        switch (action) {
          case "first":
            this.goToPage(0);
            break;
          case "prev":
            this.goToPage(this.currentPage - 1);
            break;
          case "next":
            this.goToPage(this.currentPage + 1);
            break;
          case "last":
            this.goToPage(this.totalPages - 1);
            break;
        }
      });
    });

    // Page input
    const pageInput = this.paginationContainer.querySelector(".page-input");
    if (pageInput) {
      pageInput.addEventListener("change", (e) => {
        const page = parseInt(e.target.value) - 1;
        this.goToPage(page);
      });

      pageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          const page = parseInt(e.target.value) - 1;
          this.goToPage(page);
        }
      });
    }

    // Page size selector
    const sizeSelect =
      this.paginationContainer.querySelector(".page-size-select");
    if (sizeSelect) {
      sizeSelect.addEventListener("change", (e) => {
        this.pageSize = parseInt(e.target.value);
        this.currentPage = 0; // Reset to first page
        this.render();
      });
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export for use in webview
if (typeof module !== "undefined" && module.exports) {
  module.exports = TablePagination;
}
