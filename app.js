const STORAGE_KEY = "flowbase-manager-v1";
const FONT_SIZE_KEY = "flowbase-font-size";
const BANNER_THEME_KEY = "flowbase-banner-theme";
const ADMIN_PIN_KEY = "flowbase-admin-pin";
const ADMIN_UNLOCK_KEY = "flowbase-admin-unlocked";
const DEFAULT_BANNER_THEME = {
  background: "#ffffff",
  text: "#161616",
};

const els = {
  pageList: document.querySelector("#page-list"),
  pageTitle: document.querySelector("#page-title"),
  pageDescription: document.querySelector("#page-description"),
  fontSizeRange: document.querySelector("#font-size-range"),
  fontSizeInput: document.querySelector("#font-size-input"),
  fontSizeValue: document.querySelector("#font-size-value"),
  newPageBtn: document.querySelector("#new-page-btn"),
  renamePageBtn: document.querySelector("#rename-page-btn"),
  deletePageBtn: document.querySelector("#delete-page-btn"),
  columnForm: document.querySelector("#column-form"),
  columnName: document.querySelector("#column-name"),
  columnType: document.querySelector("#column-type"),
  columnList: document.querySelector("#column-list"),
  addRowBtn: document.querySelector("#add-row-btn"),
  filterToggleBtn: document.querySelector("#filter-toggle-btn"),
  globalSearchInput: document.querySelector("#global-search-input"),
  sortColumnSelect: document.querySelector("#sort-column-select"),
  sortDirectionSelect: document.querySelector("#sort-direction-select"),
  clearSelectionBtn: document.querySelector("#clear-selection-btn"),
  duplicateSelectedBtn: document.querySelector("#duplicate-selected-btn"),
  deleteSelectedBtn: document.querySelector("#delete-selected-btn"),
  rowStats: document.querySelector("#row-stats"),
  tableScrollTop: document.querySelector("#table-scroll-top"),
  tableScrollTrack: document.querySelector("#table-scroll-track"),
  tableWrap: document.querySelector("#table-wrap"),
  fileForm: document.querySelector("#file-form"),
  fileInput: document.querySelector("#file-input"),
  fileHasHeader: document.querySelector("#file-has-header"),
  fileBtn: document.querySelector("#file-btn"),
  saveDbBtn: document.querySelector("#save-db-btn"),
  loadDbInput: document.querySelector("#load-db-input"),
  importPageName: document.querySelector("#import-page-name"),
  pasteForm: document.querySelector("#paste-form"),
  pasteInput: document.querySelector("#paste-input"),
  pasteHasHeader: document.querySelector("#paste-has-header"),
  pasteBtn: document.querySelector("#paste-btn"),
  exportCsvBtn: document.querySelector("#export-csv-btn"),
  clearFilterBtn: document.querySelector("#clear-filter-btn"),
  cloudStatus: document.querySelector("#cloud-status"),
  cloudSyncBtn: document.querySelector("#cloud-sync-btn"),
  bannerBgColor: document.querySelector("#banner-bg-color"),
  bannerTextColor: document.querySelector("#banner-text-color"),
  adminStatus: document.querySelector("#admin-status"),
  adminPasswordInput: document.querySelector("#admin-password-input"),
  adminLoginBtn: document.querySelector("#admin-login-btn"),
  adminLockBtn: document.querySelector("#admin-lock-btn"),
  automationForm: document.querySelector("#automation-form"),
  automationSourcePage: document.querySelector("#automation-source-page"),
  automationSourceMatch: document.querySelector("#automation-source-match"),
  automationCurrentMatch: document.querySelector("#automation-current-match"),
  automationSourceValue: document.querySelector("#automation-source-value"),
  automationTargetField: document.querySelector("#automation-target-field"),
  automationList: document.querySelector("#automation-list"),
  pageItemTemplate: document.querySelector("#page-item-template"),
};

let state = loadState();
let fontSize = loadFontSize();
let bannerTheme = loadBannerTheme();
let adminUnlocked = loadAdminUnlocked();
let syncingTableScroll = false;
let supabaseClient = null;
let supabaseConfig = null;
let remoteReady = false;
let remoteSaveTimer = null;
let syncStatusMessage = "Local only";

if (!state.pages.length) {
  seedStarterWorkspace();
}

applyFontSize(fontSize);
applyBannerTheme(bannerTheme);
applyAdminState();
setupTableScrollSync();
render();
initializeSupabaseSync();

els.newPageBtn.addEventListener("click", () => {
  const name = window.prompt("Page name");
  if (!name) return;

  const page = createPage(name.trim());
  state.pages.push(page);
  state.currentPageId = page.id;
  persistAndRender();
});

els.renamePageBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;

  const name = window.prompt("Rename page", page.name);
  if (!name) return;

  page.name = name.trim() || page.name;
  persistAndRender();
});

els.deletePageBtn.addEventListener("click", () => {
  if (!isAdminUnlocked()) return;
  const page = getCurrentPage();
  if (!page) return;

  const confirmed = window.confirm(`Delete "${page.name}" and all its data?`);
  if (!confirmed) return;

  state.pages = state.pages.filter(({ id }) => id !== page.id);
  removeAutomationLinksToPage(page.id);
  state.currentPageId = state.pages[0]?.id ?? null;
  persistAndRender();
});

els.cloudSyncBtn.addEventListener("click", async () => {
  if (!supabaseClient || !supabaseConfig) {
    setSyncStatus("Supabase not configured");
    renderCloudStatus();
    return;
  }

  await syncToSupabase({ pullFirst: true });
});

els.adminLoginBtn.addEventListener("click", () => {
  const value = els.adminPasswordInput.value.trim();
  if (!value) return;

  const savedPin = window.localStorage.getItem(ADMIN_PIN_KEY);
  if (!savedPin) {
    window.localStorage.setItem(ADMIN_PIN_KEY, value);
    adminUnlocked = true;
    window.sessionStorage.setItem(ADMIN_UNLOCK_KEY, "true");
    els.adminPasswordInput.value = "";
    applyAdminState();
    render();
    return;
  }

  if (value !== savedPin) {
    window.alert("Incorrect admin PIN.");
    return;
  }

  adminUnlocked = true;
  window.sessionStorage.setItem(ADMIN_UNLOCK_KEY, "true");
  els.adminPasswordInput.value = "";
  applyAdminState();
  render();
});

els.adminLockBtn.addEventListener("click", () => {
  adminUnlocked = false;
  window.sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
  els.adminPasswordInput.value = "";
  applyAdminState();
  render();
});

els.columnForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const page = getCurrentPage();
  if (!page) return;

  const name = els.columnName.value.trim();
  if (!name) return;

  const column = {
    id: createId("col"),
    name,
    type: els.columnType.value,
    style: createDefaultColumnStyle(),
  };

  page.columns.push(column);
  for (const row of page.rows) {
    row.values[column.id] = defaultValueForType(column.type);
  }

  els.columnForm.reset();
  persistAndRender();
});

els.addRowBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page || !page.columns.length) return;

  page.rows.push(createRow(page.columns));
  runAutomations();
  persistAndRender();
});

els.fileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const [file] = els.fileInput.files;
  if (!file) return;

  try {
    const matrix = await readImportFile(file);
    const pageName = createImportPageName(els.importPageName.value, file.name);
    importAsNewPage(matrix, {
      pageName,
      hasHeader: els.fileHasHeader.checked,
    });
    els.fileForm.reset();
    els.importPageName.value = "";
    persistAndRender();
  } catch (error) {
    window.alert(error.message || "Could not import that file.");
  }
});

els.saveDbBtn.addEventListener("click", () => {
  exportDatabaseSnapshot();
});

els.loadDbInput.addEventListener("change", async () => {
  const [file] = els.loadDbInput.files;
  if (!file) return;

  try {
    const raw = await file.text();
    importDatabaseSnapshot(raw);
    els.loadDbInput.value = "";
  } catch (error) {
    window.alert(error.message || "Could not load that database file.");
  }
});

els.pasteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const page = getCurrentPage();
  if (!page || !page.columns.length) {
    window.alert("Select a page with columns before pasting into the grid.");
    return;
  }

  const raw = els.pasteInput.value.trim();
  if (!raw) return;

  const matrix = parseDelimitedText(raw, detectDelimiter(raw));
  const rowsAdded = importMatrixToCurrentPage(page, matrix, els.pasteHasHeader.checked);
  if (!rowsAdded.length) {
    window.alert("No rows were added from the pasted data.");
    return;
  }

  runAutomations();
  els.pasteInput.value = "";
  els.pasteHasHeader.checked = false;
  persistAndRender();
});

els.automationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const page = getCurrentPage();
  if (!page) return;

  const rule = {
    id: createId("rule"),
    sourcePageId: els.automationSourcePage.value,
    sourceMatchColumnId: els.automationSourceMatch.value,
    currentMatchColumnId: els.automationCurrentMatch.value,
    sourceValueColumnId: els.automationSourceValue.value,
    targetColumnId: els.automationTargetField.value,
  };

  if (
    !rule.sourcePageId ||
    !rule.sourceMatchColumnId ||
    !rule.currentMatchColumnId ||
    !rule.sourceValueColumnId ||
    !rule.targetColumnId
  ) {
    return;
  }

  page.automations.push(rule);
  runAutomations();
  persistAndRender();
});

els.automationSourcePage.addEventListener("change", renderAutomationFieldOptions);
els.clearFilterBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.filter = createDefaultFilter();
  persistAndRender();
});

els.filterToggleBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.filter.open = !page.filter.open;
  persistAndRender();
});

els.globalSearchInput.addEventListener("input", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.filter.global = els.globalSearchInput.value;
  persistState();
  renderTable(page);
  renderTableTools(page);
});

els.sortColumnSelect.addEventListener("change", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.sort.columnId = els.sortColumnSelect.value;
  persistState();
  renderTable(page);
  renderTableTools(page);
});

els.sortDirectionSelect.addEventListener("change", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.sort.direction = els.sortDirectionSelect.value === "desc" ? "desc" : "asc";
  persistState();
  renderTable(page);
  renderTableTools(page);
});

els.clearSelectionBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;
  for (const row of page.rows) {
    row.selected = false;
  }
  persistAndRender();
});

els.duplicateSelectedBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;

  const selectedRows = page.rows.filter((row) => row.selected);
  if (!selectedRows.length) return;

  const clones = selectedRows.map((row) => cloneRow(page.columns, row));
  for (const row of page.rows) {
    row.selected = false;
  }
  for (const clone of clones) {
    clone.selected = true;
  }
  page.rows.push(...clones);
  runAutomations();
  persistAndRender();
});

els.deleteSelectedBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;

  const selectedCount = page.rows.filter((row) => row.selected).length;
  if (!selectedCount) return;

  const confirmed = window.confirm(`Delete ${selectedCount} selected row${selectedCount === 1 ? "" : "s"}?`);
  if (!confirmed) return;

  page.rows = page.rows.filter((row) => !row.selected);
  runAutomations();
  persistAndRender();
});

els.fontSizeRange.addEventListener("input", () => {
  setFontSize(Number(els.fontSizeRange.value));
});

els.fontSizeInput.addEventListener("input", () => {
  setFontSize(Number(els.fontSizeInput.value));
});

els.exportCsvBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page || !page.columns.length) return;
  exportPageToCsv(page);
});

for (const control of [els.bannerBgColor, els.bannerTextColor]) {
  control.addEventListener("input", () => {
    bannerTheme = {
      background: els.bannerBgColor.value,
      text: els.bannerTextColor.value,
    };
    applyBannerTheme(bannerTheme);
    window.localStorage.setItem(BANNER_THEME_KEY, JSON.stringify(bannerTheme));
    scheduleSupabaseSave();
  });
}

function loadState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { currentPageId: null, pages: [] };
  }

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return { currentPageId: null, pages: [] };
  }
}

function loadFontSize() {
  const raw = Number(window.localStorage.getItem(FONT_SIZE_KEY));
  if (Number.isNaN(raw) || raw < 5 || raw > 20) {
    return 16;
  }
  return raw;
}

function applyFontSize(size) {
  const boundedSize = Math.max(5, Math.min(20, size));
  document.documentElement.style.setProperty("--grid-font-size", `${boundedSize}px`);
  els.fontSizeRange.value = String(boundedSize);
  els.fontSizeInput.value = String(boundedSize);
  els.fontSizeValue.value = `${boundedSize}px`;
  els.fontSizeValue.textContent = `${boundedSize}px`;
}

function setFontSize(size) {
  const parsed = Number(size);
  if (Number.isNaN(parsed)) return;
  fontSize = Math.max(5, Math.min(20, parsed));
  applyFontSize(fontSize);
  window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  scheduleSupabaseSave();
}

function loadAdminUnlocked() {
  return window.sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "true";
}

function initializeSupabaseSync() {
  const config = window.SUPABASE_CONFIG ?? null;
  const createClient = window.supabase?.createClient;

  if (!config?.url || !config?.publishableKey || !config?.workspaceId || typeof createClient !== "function") {
    setSyncStatus("Local only");
    renderCloudStatus();
    return;
  }

  supabaseConfig = {
    url: String(config.url).trim(),
    publishableKey: String(config.publishableKey).trim(),
    workspaceId: String(config.workspaceId).trim(),
    autoSync: config.autoSync !== false,
  };

  supabaseClient = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  setSyncStatus("Connecting to Supabase...");
  renderCloudStatus();
  void loadStateFromSupabase();
}

function isAdminUnlocked() {
  return adminUnlocked;
}

function applyAdminState() {
  document.body.classList.toggle("admin-unlocked", adminUnlocked);
  const hasPin = Boolean(window.localStorage.getItem(ADMIN_PIN_KEY));
  els.adminStatus.textContent = adminUnlocked ? "Unlocked" : hasPin ? "Locked" : "Create PIN";
  els.adminLoginBtn.textContent = hasPin ? "Unlock" : "Set PIN";
  els.adminLockBtn.hidden = !adminUnlocked;
  els.deletePageBtn.disabled = !adminUnlocked || !getCurrentPage();
  els.deleteSelectedBtn.disabled = !adminUnlocked;
}

function loadBannerTheme() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(BANNER_THEME_KEY));
    return {
      ...DEFAULT_BANNER_THEME,
      ...(saved ?? {}),
    };
  } catch {
    return DEFAULT_BANNER_THEME;
  }
}

function applyBannerTheme(theme) {
  document.documentElement.style.setProperty("--banner-bg", theme.background);
  document.documentElement.style.setProperty("--banner-text", theme.text);
  els.bannerBgColor.value = theme.background;
  els.bannerTextColor.value = theme.text;
}

function persistAndRender() {
  persistState();
  render();
}

function persistState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleSupabaseSave();
}

function createPage(name) {
  return {
    id: createId("page"),
    name,
    columns: [],
    rows: [],
    automations: [],
    filter: createDefaultFilter(),
    sort: createDefaultSort(),
  };
}

function createRow(columns) {
  const values = {};
  for (const column of columns) {
    values[column.id] = defaultValueForType(column.type);
  }

  return {
    id: createId("row"),
    values,
    style: createDefaultRowStyle(),
    selected: false,
  };
}

function defaultValueForType(type) {
  return type === "checkbox" ? false : "";
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function getCurrentPage() {
  return state.pages.find(({ id }) => id === state.currentPageId) ?? null;
}

function render() {
  const page = getCurrentPage();
  renderPageList();
  renderPageHeader(page);
  renderColumns(page);
  renderAutomations(page);
  renderAutomationFieldOptions();
  renderImportControls(page);
  renderTableTools(page);
  renderTable(page);
  renderCloudStatus();
}

function renderPageList() {
  els.pageList.innerHTML = "";

  for (const page of state.pages) {
    const fragment = els.pageItemTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".page-item");
    const name = fragment.querySelector(".page-name");
    const meta = fragment.querySelector(".page-meta");

    name.textContent = page.name;
    meta.textContent = `${page.rows.length} rows • ${page.columns.length} columns`;
    button.classList.toggle("active", page.id === state.currentPageId);
    button.addEventListener("click", () => {
      state.currentPageId = page.id;
      persistAndRender();
    });

    els.pageList.appendChild(fragment);
  }
}

function renderPageHeader(page) {
  const hasPage = Boolean(page);
  els.pageTitle.textContent = hasPage ? page.name : "Select a page";
  els.pageDescription.textContent = hasPage
    ? `${page.rows.length} rows, ${page.columns.length} columns, ${page.automations.length} automations`
    : "Build a page or choose a tab above.";
  els.renamePageBtn.disabled = !hasPage;
  els.deletePageBtn.disabled = !hasPage || !isAdminUnlocked();
  els.addRowBtn.disabled = !hasPage || !page.columns.length;
}

function renderColumns(page) {
  els.columnList.innerHTML = "";

  if (!page) {
    els.columnList.textContent = "Select a page to manage columns.";
    return;
  }

  if (!page.columns.length) {
    els.columnList.textContent = "No columns yet.";
    return;
  }

  for (const column of page.columns) {
    const card = document.createElement("div");
    card.className = "column-style-card";
    card.innerHTML = `
      <div class="column-style-head">
        <strong>${escapeHtml(column.name)}</strong>
        <span>${column.type}</span>
      </div>
    `;

    if (isAdminUnlocked()) {
      const controls = document.createElement("div");
      controls.className = "column-style-controls";

      const widthInput = document.createElement("input");
      widthInput.type = "number";
      widthInput.min = "60";
      widthInput.max = "600";
      widthInput.placeholder = "Width";
      widthInput.value = column.style?.width ?? "";
      widthInput.addEventListener("change", () => {
        column.style.width = widthInput.value;
        persistAndRender();
      });

      const headerColor = document.createElement("input");
      headerColor.type = "color";
      headerColor.value = column.style?.headerBg || "#eef5fc";
      headerColor.addEventListener("input", () => {
        column.style.headerBg = headerColor.value;
        persistAndRender();
      });

      const cellColor = document.createElement("input");
      cellColor.type = "color";
      cellColor.value = column.style?.cellBg || "#ffffff";
      cellColor.addEventListener("input", () => {
        column.style.cellBg = cellColor.value;
        persistAndRender();
      });

      const alignSelect = document.createElement("select");
      for (const value of ["left", "center", "right"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        alignSelect.appendChild(option);
      }
      alignSelect.value = column.style?.align || "left";
      alignSelect.addEventListener("change", () => {
        column.style.align = alignSelect.value;
        persistAndRender();
      });

      controls.append(widthInput, headerColor, cellColor, alignSelect);

      const removeButton = document.createElement("button");
      removeButton.className = "mini-btn";
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => removeColumn(page.id, column.id));

      card.append(controls, removeButton);
    }

    els.columnList.appendChild(card);
  }
}

function renderAutomations(page) {
  els.automationList.innerHTML = "";

  if (!page) {
    els.automationList.textContent = "Select a page to configure automations.";
    disableAutomationInputs(true);
    return;
  }

  const sourcePages = state.pages.filter((candidate) => candidate.id !== page.id && candidate.columns.length);
  disableAutomationInputs(page.columns.length === 0 || sourcePages.length === 0);

  if (!page.automations.length) {
    els.automationList.textContent =
      sourcePages.length === 0
        ? "Add another page with columns to unlock cross-page automation."
        : "No automations yet.";
    return;
  }

  for (const automation of page.automations) {
    const card = document.createElement("div");
    card.className = "automation-card";

    const sourcePage = state.pages.find(({ id }) => id === automation.sourcePageId);
    const targetColumn = page.columns.find(({ id }) => id === automation.targetColumnId);
    const currentMatch = page.columns.find(({ id }) => id === automation.currentMatchColumnId);
    const sourceMatch = sourcePage?.columns.find(({ id }) => id === automation.sourceMatchColumnId);
    const sourceValue = sourcePage?.columns.find(({ id }) => id === automation.sourceValueColumnId);

    const copy = document.createElement("div");
    copy.innerHTML = `
      <strong>${escapeHtml(targetColumn?.name ?? "Missing field")}</strong>
      <span>
        Fill from ${escapeHtml(sourcePage?.name ?? "deleted page")} when
        ${escapeHtml(currentMatch?.name ?? "missing field")} matches
        ${escapeHtml(sourceMatch?.name ?? "missing field")}, then copy
        ${escapeHtml(sourceValue?.name ?? "missing field")}
      </span>
    `;

    if (isAdminUnlocked()) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mini-btn";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        page.automations = page.automations.filter(({ id }) => id !== automation.id);
        runAutomations();
        persistAndRender();
      });

      card.append(copy, removeButton);
    } else {
      card.append(copy);
    }
    els.automationList.appendChild(card);
  }
}

function renderAutomationFieldOptions() {
  const page = getCurrentPage();

  setSelectOptions(
    els.automationSourcePage,
    state.pages
      .filter((candidate) => page && candidate.id !== page.id && candidate.columns.length)
      .map((candidate) => ({ value: candidate.id, label: candidate.name }))
  );

  const sourcePage = state.pages.find(({ id }) => id === els.automationSourcePage.value)
    ?? state.pages.find((candidate) => page && candidate.id !== page.id && candidate.columns.length);

  const currentColumns = page?.columns ?? [];
  const sourceColumns = sourcePage?.columns ?? [];

  setSelectOptions(
    els.automationCurrentMatch,
    currentColumns.map((column) => ({ value: column.id, label: `${column.name} (${column.type})` }))
  );
  setSelectOptions(
    els.automationTargetField,
    currentColumns.map((column) => ({ value: column.id, label: `${column.name} (${column.type})` }))
  );
  setSelectOptions(
    els.automationSourceMatch,
    sourceColumns.map((column) => ({ value: column.id, label: `${column.name} (${column.type})` }))
  );
  setSelectOptions(
    els.automationSourceValue,
    sourceColumns.map((column) => ({ value: column.id, label: `${column.name} (${column.type})` }))
  );
}

function setSelectOptions(select, options) {
  const currentValue = select.value;
  select.innerHTML = "";

  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }

  if (options.some(({ value }) => value === currentValue)) {
    select.value = currentValue;
  }
}

function renderImportControls(page) {
  els.saveDbBtn.disabled = false;
  els.loadDbInput.disabled = false;
  els.fileInput.disabled = false;
  els.fileHasHeader.disabled = false;
  els.fileBtn.disabled = false;
  els.pasteInput.disabled = !page || !page.columns.length;
  els.pasteHasHeader.disabled = !page || !page.columns.length;
  els.pasteBtn.disabled = !page || !page.columns.length;
  els.importPageName.disabled = false;
  els.clearFilterBtn.disabled = !page || page.columns.length === 0;
  els.exportCsvBtn.disabled = !page || page.columns.length === 0;
  els.globalSearchInput.disabled = !page || page.columns.length === 0;
  els.globalSearchInput.value = page?.filter?.global ?? "";
  els.filterToggleBtn.disabled = !page || page.columns.length === 0;
  els.filterToggleBtn.textContent = page?.filter?.open === false ? "Filters +" : "Filters -";
  els.cloudSyncBtn.disabled = !supabaseClient;
}

function renderCloudStatus() {
  if (!els.cloudStatus) return;
  els.cloudStatus.textContent = syncStatusMessage;
}

function renderTableTools(page) {
  const hasGrid = Boolean(page && page.columns.length);
  const admin = isAdminUnlocked();
  els.sortColumnSelect.disabled = !hasGrid;
  els.sortDirectionSelect.disabled = !hasGrid;
  els.clearSelectionBtn.disabled = !hasGrid;
  els.duplicateSelectedBtn.disabled = !hasGrid;
  els.deleteSelectedBtn.disabled = !hasGrid || !admin;

  els.sortColumnSelect.innerHTML = '<option value="">Sort by</option>';

  if (!hasGrid) {
    els.sortDirectionSelect.value = "asc";
    els.rowStats.textContent = "0 rows";
    return;
  }

  for (const column of page.columns) {
    const option = document.createElement("option");
    option.value = column.id;
    option.textContent = column.name;
    els.sortColumnSelect.appendChild(option);
  }

  if (page.columns.some((column) => column.id === page.sort?.columnId)) {
    els.sortColumnSelect.value = page.sort.columnId;
  }
  els.sortDirectionSelect.value = page.sort?.direction === "desc" ? "desc" : "asc";

  const filteredRows = getFilteredRows(page);
  const selectedCount = page.rows.filter((row) => row.selected).length;
  els.rowStats.textContent =
    `${page.rows.length} total | ${filteredRows.length} visible | ${selectedCount} selected`;
  els.clearSelectionBtn.disabled = selectedCount === 0;
  els.duplicateSelectedBtn.disabled = selectedCount === 0;
  els.deleteSelectedBtn.disabled = selectedCount === 0 || !admin;
}

function disableAutomationInputs(disabled) {
  for (const input of els.automationForm.querySelectorAll("select, button")) {
    input.disabled = disabled;
  }
}

function renderTable(page) {
  if (!page || !page.columns.length) {
    els.tableWrap.className = "table-wrap empty-table";
    els.tableWrap.innerHTML = "<p>Create a page and add columns to start entering data.</p>";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.className = "header-row";
  const filterRow = document.createElement("tr");
  filterRow.className = "filter-row";
  const showAdminActions = isAdminUnlocked();
  if (page.filter.open === false) {
    filterRow.classList.add("filters-hidden");
  }

  const indexHead = document.createElement("th");
  indexHead.className = "row-index-column sticky-left";
  indexHead.textContent = "#";
  headRow.appendChild(indexHead);

  const indexFilter = document.createElement("th");
  indexFilter.className = "row-index-column sticky-left filter-spacer";
  filterRow.appendChild(indexFilter);

  const selectHead = document.createElement("th");
  selectHead.className = "select-column sticky-left-2";
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  const visibleRows = getVisibleRows(page);
  selectAll.checked = visibleRows.length > 0 && visibleRows.every((row) => row.selected);
  selectAll.addEventListener("change", () => {
    for (const row of visibleRows) {
      row.selected = selectAll.checked;
    }
    persistAndRender();
  });
  selectHead.appendChild(selectAll);
  headRow.appendChild(selectHead);

  const selectFilter = document.createElement("th");
  selectFilter.className = "select-column sticky-left-2 filter-spacer";
  filterRow.appendChild(selectFilter);

  if (showAdminActions) {
    const actionsHead = document.createElement("th");
    actionsHead.className = "row-actions";
    actionsHead.textContent = "Act";
    actionsHead.title = "Row actions";
    headRow.appendChild(actionsHead);

    const actionsFilter = document.createElement("th");
    actionsFilter.className = "row-actions filter-spacer";
    filterRow.appendChild(actionsFilter);
  }

  for (const column of page.columns) {
    const th = document.createElement("th");
    applyColumnCellStyle(th, column, true);
    const title = document.createElement("span");
    title.textContent = column.name;
    title.className = "column-title";
    th.appendChild(title);
    headRow.appendChild(th);

    const filterCell = document.createElement("th");
    filterCell.className = "column-filter-cell";
    applyColumnCellStyle(filterCell, column, true);

    const filterInput = document.createElement("input");
    filterInput.type = "search";
    filterInput.className = "column-filter";
    filterInput.placeholder = "Type or pick";
    const listId = `filter-list-${column.id}`;
    filterInput.setAttribute("list", listId);
    filterInput.value = page.filter.values[column.id] ?? "";
    filterInput.addEventListener("input", () => {
      page.filter.values[column.id] = filterInput.value;
      persistState();
      renderTable(page);
      renderTableTools(page);
    });

    const dataList = document.createElement("datalist");
    dataList.id = listId;
    for (const optionValue of getColumnFilterOptions(page, column.id)) {
      const option = document.createElement("option");
      option.value = optionValue;
      dataList.appendChild(option);
    }

    filterCell.append(filterInput, dataList);
    filterRow.appendChild(filterCell);
  }
  thead.appendChild(headRow);
  thead.appendChild(filterRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const row of visibleRows) {
    const tr = document.createElement("tr");

    const indexCell = document.createElement("td");
    indexCell.className = "row-index-column sticky-left";
    applyRowStyle(indexCell, row);
    indexCell.textContent = String(page.rows.findIndex((candidate) => candidate.id === row.id) + 1);
    tr.appendChild(indexCell);

    const selectCell = document.createElement("td");
    selectCell.className = "select-column sticky-left-2";
    applyRowStyle(selectCell, row);
    const selectRow = document.createElement("input");
    selectRow.type = "checkbox";
    selectRow.checked = Boolean(row.selected);
    selectRow.addEventListener("change", () => {
      row.selected = selectRow.checked;
      persistAndRender();
    });
    selectCell.appendChild(selectRow);
    tr.appendChild(selectCell);

    if (showAdminActions) {
      const actionCell = document.createElement("td");
      applyRowStyle(actionCell, row);
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mini-btn delete-x";
      removeButton.textContent = "X";
      removeButton.setAttribute("aria-label", "Delete row");
      removeButton.title = "Delete row";
      removeButton.addEventListener("click", () => {
        page.rows = page.rows.filter(({ id }) => id !== row.id);
        runAutomations();
        persistAndRender();
      });
      const rowBg = document.createElement("input");
      rowBg.type = "color";
      rowBg.value = row.style?.background || "#ffffff";
      rowBg.title = "Row background";
      rowBg.addEventListener("input", () => {
        row.style.background = rowBg.value;
        persistAndRender();
      });

      const rowText = document.createElement("input");
      rowText.type = "color";
      rowText.value = row.style?.textColor || "#161616";
      rowText.title = "Row text";
      rowText.addEventListener("input", () => {
        row.style.textColor = rowText.value;
        persistAndRender();
      });

      const actionStack = document.createElement("div");
      actionStack.className = "row-action-stack";
      actionStack.append(removeButton, rowBg, rowText);
      actionCell.appendChild(actionStack);
      tr.appendChild(actionCell);
    }

    for (const column of page.columns) {
      const td = document.createElement("td");
      applyRowStyle(td, row);
      applyColumnCellStyle(td, column, false);
      const input = buildInput(column, row.values[column.id], (value) => {
        row.values[column.id] = value;
        runAutomations();
        persistAndRender();
      });
      applyInputStyle(input, row, column);
      td.appendChild(input);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  if (!page.rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = page.columns.length + (showAdminActions ? 3 : 2);
    td.textContent = "No rows yet. Use Add row to begin.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else if (!visibleRows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = page.columns.length + (showAdminActions ? 3 : 2);
    td.textContent = "No rows match the current filter.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  els.tableWrap.className = "table-wrap";
  els.tableWrap.innerHTML = "";
  els.tableWrap.appendChild(table);
  syncTableScrollWidth(table);
}

function getFilteredRows(page) {
  const globalFilter = String(page.filter?.global ?? "").trim().toLowerCase();
  const activeFilters = Object.entries(page.filter?.values ?? {})
    .map(([columnId, value]) => [columnId, String(value ?? "").trim().toLowerCase()])
    .filter(([, value]) => value.length > 0);

  if (!activeFilters.length && !globalFilter) {
    return page.rows;
  }

  return page.rows.filter((row) => {
    const matchesColumns = activeFilters.every(([columnId, filterValue]) => {
      const column = page.columns.find((candidate) => candidate.id === columnId);
      if (!column) return true;

      return String(displayValue(row.values[column.id], column.type)).toLowerCase().includes(filterValue);
    });

    if (!matchesColumns) {
      return false;
    }

    if (!globalFilter) {
      return true;
    }

    return page.columns.some((column) =>
      String(displayValue(row.values[column.id], column.type)).toLowerCase().includes(globalFilter)
    );
  });
}

function getVisibleRows(page) {
  return sortRows(getFilteredRows(page), page);
}

function sortRows(rows, page) {
  const sort = normalizeSort(page?.sort);
  if (!sort.columnId) {
    return [...rows];
  }

  const column = page.columns.find((item) => item.id === sort.columnId);
  if (!column) {
    return [...rows];
  }

  const direction = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const leftValue = rowSortValue(left.values[column.id], column.type);
    const rightValue = rowSortValue(right.values[column.id], column.type);

    if (leftValue < rightValue) return -1 * direction;
    if (leftValue > rightValue) return 1 * direction;

    const leftIndex = page.rows.findIndex((row) => row.id === left.id);
    const rightIndex = page.rows.findIndex((row) => row.id === right.id);
    return leftIndex - rightIndex;
  });
}

function rowSortValue(value, type) {
  if (type === "checkbox") {
    return value ? 1 : 0;
  }

  if (type === "number") {
    if (value === "") return Number.NEGATIVE_INFINITY;
    const numericValue = Number(value);
    return Number.isNaN(numericValue) ? Number.NEGATIVE_INFINITY : numericValue;
  }

  if (type === "date") {
    return normalizeDateValue(value) || "";
  }

  return String(value ?? "").trim().toLowerCase();
}

function getColumnFilterOptions(page, columnId) {
  const column = page.columns.find((item) => item.id === columnId);
  if (!column) {
    return [];
  }

  return [...new Set(
    page.rows
      .map((row) => String(displayValue(row.values[columnId], column.type)).trim())
      .filter((value) => value.length > 0)
  )].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function buildInput(column, value, onChange) {
  const input = document.createElement("input");

  if (column.type === "checkbox") {
    input.type = "checkbox";
    input.checked = Boolean(value);
    input.addEventListener("change", () => onChange(input.checked));
    return input;
  }

  input.type = column.type === "number" ? "number" : column.type;
  input.value = value ?? "";
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

function createDefaultColumnStyle() {
  return {
    width: "",
    headerBg: "",
    cellBg: "",
    align: "left",
  };
}

function createDefaultRowStyle() {
  return {
    background: "",
    textColor: "",
  };
}

function applyColumnCellStyle(cell, column, isHeader) {
  const style = column.style ?? createDefaultColumnStyle();
  const width = style.width || 160;
  cell.style.width = `${width}px`;
  cell.style.minWidth = `${width}px`;
  cell.style.textAlign = style.align || "left";
  if (isHeader && style.headerBg) {
    cell.style.background = style.headerBg;
  }
  if (!isHeader && style.cellBg) {
    cell.style.background = style.cellBg;
  }
}

function applyRowStyle(cell, row) {
  const style = row.style ?? createDefaultRowStyle();
  if (style.background) {
    cell.style.background = style.background;
  }
  if (style.textColor) {
    cell.style.color = style.textColor;
  }
}

function applyInputStyle(input, row, column) {
  if (row.style?.textColor) {
    input.style.color = row.style.textColor;
  }
  if (row.style?.background || column.style?.cellBg) {
    input.style.background = "transparent";
  }
  input.style.textAlign = column.style?.align || "left";
}

function removeColumn(pageId, columnId) {
  const page = state.pages.find(({ id }) => id === pageId);
  if (!page) return;

  page.columns = page.columns.filter(({ id }) => id !== columnId);
  for (const row of page.rows) {
    delete row.values[columnId];
  }
  page.automations = page.automations.filter(
    (rule) =>
      rule.currentMatchColumnId !== columnId &&
      rule.targetColumnId !== columnId
  );
  delete page.filter.values[columnId];

  for (const otherPage of state.pages) {
    otherPage.automations = otherPage.automations.filter(
      (rule) =>
        !(rule.sourcePageId === pageId &&
          (rule.sourceMatchColumnId === columnId || rule.sourceValueColumnId === columnId))
    );
  }

  runAutomations();
  persistAndRender();
}

function removeAutomationLinksToPage(pageId) {
  for (const page of state.pages) {
    page.automations = page.automations.filter((rule) => rule.sourcePageId !== pageId);
  }
}

function normalizeState(rawState) {
  const normalizedPages = (rawState.pages ?? []).map((page) => ({
    ...page,
    automations: page.automations ?? [],
    rows: (page.rows ?? []).map((row) => ({
      ...row,
      selected: Boolean(row.selected),
      style: {
        ...createDefaultRowStyle(),
        ...(row.style ?? {}),
      },
    })),
    columns: (page.columns ?? []).map((column) => ({
      ...column,
      style: {
        ...createDefaultColumnStyle(),
        ...(column.style ?? {}),
      },
    })),
    filter: normalizeFilter(page.filter),
    sort: normalizeSort(page.sort),
  }));

  return {
    currentPageId: rawState.currentPageId ?? normalizedPages[0]?.id ?? null,
    pages: normalizedPages,
  };
}

function createDefaultFilter() {
  return {
    values: {},
    global: "",
    open: true,
  };
}

function createDefaultSort() {
  return {
    columnId: "",
    direction: "asc",
  };
}

function normalizeFilter(filter) {
  if (filter?.values && typeof filter.values === "object") {
    return {
      values: { ...filter.values },
      global: filter.global ?? "",
      open: filter.open ?? true,
    };
  }

  if (filter?.columnId && filter?.value) {
    return {
      values: {
        [filter.columnId]: filter.value,
      },
      global: "",
      open: true,
    };
  }

  return createDefaultFilter();
}

function normalizeSort(sort) {
  return {
    ...createDefaultSort(),
    ...(sort ?? {}),
  };
}

function importAsNewPage(matrix, { pageName, hasHeader }) {
  const normalizedRows = normalizeImportedMatrix(matrix);
  if (!normalizedRows.length) {
    throw new Error("There was no data to import.");
  }

  const { columns, dataRows } = buildColumnsFromImportedRows(normalizedRows, hasHeader);
  if (!columns.length) {
    throw new Error("Could not create columns from the imported data.");
  }

  const page = createPage(pageName);
  page.columns = columns;
  page.rows = mapMatrixToRows(dataRows, columns);
  state.pages.push(page);
  state.currentPageId = page.id;
  runAutomations();
}

function importMatrixToCurrentPage(page, matrix, hasHeader) {
  const normalizedRows = normalizeImportedMatrix(matrix);
  if (!normalizedRows.length) {
    return [];
  }

  let rowsToImport = normalizedRows;
  let columnOrder = page.columns.map((column, index) => ({ column, index }));

  if (hasHeader) {
    const headerRow = normalizedRows[0] ?? [];
    const mappedColumns = headerRow.map((header, index) => ({
      column: page.columns.find((column) => normalizeKey(column.name) === normalizeKey(header)),
      index,
    }));

    if (!mappedColumns.some(({ column }) => column)) {
      return [];
    }

    columnOrder = mappedColumns.filter(({ column }) => column);
    rowsToImport = normalizedRows.slice(1);
  }

  const addedRows = rowsToImport
    .filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0))
    .map((cells) => {
      const row = createRow(page.columns);
      columnOrder.forEach(({ column, index }) => {
        row.values[column.id] = coerceCellValue(cells[index] ?? "", column.type);
      });
      return row;
    });

  page.rows.push(...addedRows);
  return addedRows;
}

function mapMatrixToRows(matrix, columns) {
  const normalizedRows = matrix
    .map((row) => row.map((cell) => String(cell ?? "")))
    .filter((row) => row.some((cell) => cell.trim().length > 0));

  return normalizedRows.map((cells) => {
    const row = createRow(columns);

    columns.forEach((column, index) => {
      row.values[column.id] = coerceCellValue(cells[index] ?? "", column.type);
    });

    return row;
  });
}

function normalizeImportedMatrix(matrix) {
  return matrix
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function buildColumnsFromImportedRows(rows, hasHeader) {
  const firstRow = rows[0] ?? [];
  const width = rows.reduce((largest, row) => Math.max(largest, row.length), 0);
  const headers = hasHeader
    ? firstRow
    : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const columns = Array.from({ length: width }, (_, index) => {
    const name = sanitizeColumnName(headers[index], index);
    const sampleValues = dataRows.map((row) => row[index] ?? "");

    return {
      id: createId("col"),
      name,
      type: inferColumnType(sampleValues),
      style: createDefaultColumnStyle(),
    };
  });

  return { columns, dataRows };
}

function sanitizeColumnName(value, index) {
  const trimmed = String(value ?? "").trim();
  return trimmed || `Column ${index + 1}`;
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "");
}

function inferColumnType(values) {
  const filled = values.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!filled.length) {
    return "text";
  }

  const isCheckbox = filled.every((value) =>
    ["true", "false", "yes", "no", "1", "0", "x", "checked", "unchecked"].includes(
      value.toLowerCase()
    )
  );
  if (isCheckbox) {
    return "checkbox";
  }

  const isNumber = filled.every((value) => {
    const normalized = value.replaceAll(",", "");
    return normalized !== "" && !Number.isNaN(Number(normalized));
  });
  if (isNumber) {
    return "number";
  }

  const isDate = filled.every((value) => Boolean(normalizeDateValue(value)));
  if (isDate) {
    return "date";
  }

  return "text";
}

function createImportPageName(inputName, fallbackName) {
  const typedName = String(inputName ?? "").trim();
  if (typedName) {
    return typedName;
  }

  const baseName = String(fallbackName ?? "Imported Page").replace(/\.[^.]+$/, "").trim();
  return baseName || "Imported Page";
}

function normalizeDateValue(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function readImportFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "csv" || extension === "txt") {
    const text = await file.text();
    return parseCsvText(text);
  }

  if (extension === "xlsx" || extension === "xls") {
    throw new Error(
      "Direct .xlsx/.xls import is not bundled offline yet. Save the sheet as CSV, or copy and paste from Excel."
    );
  }

  throw new Error("Supported file types are CSV and TXT. You can also paste directly from Excel.");
}

function parseDelimitedText(raw, delimiter) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(delimiter));
}

function detectDelimiter(raw) {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes("\t")) {
    return "\t";
  }
  if (firstLine.includes(";")) {
    return ";";
  }
  return ",";
}

function parseCsvText(raw) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const nextChar = raw[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((item) => String(item).trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((item) => String(item).trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function exportPageToCsv(page) {
  const headers = page.columns.map((column) => column.name);
  const lines = [headers.map(escapeCsvCell).join(",")];
  const visibleRows = getVisibleRows(page);
  const selectedRows = visibleRows.filter((row) => row.selected);
  const rowsToExport = selectedRows.length ? selectedRows : visibleRows;

  for (const row of rowsToExport) {
    lines.push(
      page.columns
        .map((column) => escapeCsvCell(displayValue(row.values[column.id], column.type)))
        .join(",")
    );
  }

  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${page.name || "grid"}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
}

function exportDatabaseSnapshot() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
    fontSize,
    bannerTheme,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aquatic-parasitology-database.json";
  link.click();
  window.URL.revokeObjectURL(url);
}

function importDatabaseSnapshot(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That database file is not valid JSON.");
  }

  if (!parsed?.state?.pages) {
    throw new Error("That file does not contain a valid database export.");
  }

  state = normalizeState(parsed.state);
  fontSize = Number(parsed.fontSize) || 16;
  bannerTheme = {
    ...loadBannerTheme(),
    ...(parsed.bannerTheme ?? {}),
  };

  persistState();
  window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  window.localStorage.setItem(BANNER_THEME_KEY, JSON.stringify(bannerTheme));
  applyFontSize(fontSize);
  applyBannerTheme(bannerTheme);
  scheduleSupabaseSave(true);
  render();
}

async function loadStateFromSupabase() {
  if (!supabaseClient || !supabaseConfig) return;

  try {
    const record = await fetchSupabaseWorkspace();

    if (record?.data?.pages) {
      state = normalizeState(record.data);
      fontSize = normalizeRemoteFontSize(record.font_size);
      bannerTheme = normalizeRemoteBannerTheme(record.banner_theme);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
      window.localStorage.setItem(BANNER_THEME_KEY, JSON.stringify(bannerTheme));
      applyFontSize(fontSize);
      applyBannerTheme(bannerTheme);
      remoteReady = true;
      setSyncStatus(`Cloud synced: ${formatUpdatedAt(record.updated_at)}`);
      render();
      return;
    }

    remoteReady = true;
    await pushStateToSupabase();
    setSyncStatus("Cloud ready");
    renderCloudStatus();
  } catch (error) {
    remoteReady = false;
    setSyncStatus(error.message || "Supabase sync failed");
    renderCloudStatus();
  }
}

async function syncToSupabase({ pullFirst = false } = {}) {
  if (!supabaseClient || !supabaseConfig) return;

  try {
    setSyncStatus(pullFirst ? "Syncing with cloud..." : "Saving to cloud...");
    renderCloudStatus();

    if (pullFirst) {
      await loadStateFromSupabase();
      return;
    }

    await pushStateToSupabase();
    setSyncStatus("Saved to cloud");
    renderCloudStatus();
  } catch (error) {
    setSyncStatus(error.message || "Supabase sync failed");
    renderCloudStatus();
  }
}

function scheduleSupabaseSave(immediate = false) {
  if (!supabaseClient || !supabaseConfig?.autoSync || !remoteReady) {
    return;
  }

  window.clearTimeout(remoteSaveTimer);
  if (immediate) {
    void syncToSupabase();
    return;
  }

  remoteSaveTimer = window.setTimeout(() => {
    void syncToSupabase();
  }, 600);
}

async function fetchSupabaseWorkspace() {
  const { data, error } = await supabaseClient
    .from("app_workspaces")
    .select("workspace_id, data, font_size, banner_theme, updated_at")
    .eq("workspace_id", supabaseConfig.workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase read failed: ${error.message}`);
  }

  return data;
}

async function pushStateToSupabase() {
  const payload = {
    workspace_id: supabaseConfig.workspaceId,
    data: state,
    font_size: fontSize,
    banner_theme: bannerTheme,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient.from("app_workspaces").upsert(payload);
  if (error) {
    throw new Error(`Supabase save failed: ${error.message}`);
  }
}

function setSyncStatus(message) {
  syncStatusMessage = message;
}

function normalizeRemoteFontSize(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 16;
  }
  return Math.max(5, Math.min(20, parsed));
}

function normalizeRemoteBannerTheme(theme) {
  return {
    ...DEFAULT_BANNER_THEME,
    ...(theme ?? {}),
  };
}

function formatUpdatedAt(value) {
  if (!value) {
    return "just now";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  return date.toLocaleString();
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function coerceCellValue(value, type) {
  const trimmed = String(value ?? "").trim();

  if (type === "checkbox") {
    return ["true", "yes", "1", "x", "checked"].includes(trimmed.toLowerCase());
  }

  if (type === "number") {
    if (trimmed === "") {
      return "";
    }
    const numericValue = Number(trimmed.replaceAll(",", ""));
    return Number.isNaN(numericValue) ? trimmed : numericValue;
  }

  if (type === "date") {
    return normalizeDateValue(trimmed);
  }

  return trimmed;
}

function displayValue(value, type) {
  if (type === "checkbox") {
    return value ? "true" : "false";
  }
  return value ?? "";
}

function runAutomations() {
  for (const page of state.pages) {
    for (const rule of page.automations) {
      const sourcePage = state.pages.find(({ id }) => id === rule.sourcePageId);
      if (!sourcePage) continue;

      const targetColumn = page.columns.find(({ id }) => id === rule.targetColumnId);
      if (!targetColumn) continue;

      for (const row of page.rows) {
        const currentValue = normalizeValue(row.values[rule.currentMatchColumnId]);
        if (!currentValue) {
          row.values[rule.targetColumnId] = defaultValueForType(targetColumn.type);
          continue;
        }

        const sourceRow = sourcePage.rows.find(
          (candidate) =>
            normalizeValue(candidate.values[rule.sourceMatchColumnId]) === currentValue
        );

        row.values[rule.targetColumnId] = sourceRow
          ? sourceRow.values[rule.sourceValueColumnId]
          : defaultValueForType(targetColumn.type);
      }
    }
  }
}

function normalizeValue(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value ?? "").trim().toLowerCase();
}

function cloneRow(columns, sourceRow) {
  const row = createRow(columns);
  row.style = {
    ...createDefaultRowStyle(),
    ...(sourceRow.style ?? {}),
  };
  row.values = Object.fromEntries(
    columns.map((column) => [column.id, sourceRow.values[column.id]])
  );
  return row;
}

function seedStarterWorkspace() {
  const contacts = createPage("Contacts");
  const projects = createPage("Projects");

  const contactsColumns = [
    { id: createId("col"), name: "Client ID", type: "text" },
    { id: createId("col"), name: "Client Name", type: "text" },
    { id: createId("col"), name: "Email", type: "text" },
  ];
  contacts.columns = contactsColumns;
  contacts.rows = [
    createSeedRow(contactsColumns, ["C-100", "Aster Studio", "hello@aster.studio"]),
    createSeedRow(contactsColumns, ["C-200", "Northwind Labs", "team@northwind.dev"]),
  ];

  const projectsColumns = [
    { id: createId("col"), name: "Project Name", type: "text" },
    { id: createId("col"), name: "Client ID", type: "text" },
    { id: createId("col"), name: "Client Name", type: "text" },
    { id: createId("col"), name: "Launch Date", type: "date" },
  ];
  projects.columns = projectsColumns;
  projects.rows = [createSeedRow(projectsColumns, ["Website refresh", "C-100", "", ""])];
  projects.automations = [
    {
      id: createId("rule"),
      sourcePageId: contacts.id,
      sourceMatchColumnId: contactsColumns[0].id,
      currentMatchColumnId: projectsColumns[1].id,
      sourceValueColumnId: contactsColumns[1].id,
      targetColumnId: projectsColumns[2].id,
    },
  ];

  state.pages = [contacts, projects];
  state.currentPageId = contacts.id;
  runAutomations();
  persistState();
}

function createSeedRow(columns, values) {
  const row = createRow(columns);
  columns.forEach((column, index) => {
    row.values[column.id] = column.type === "checkbox" ? Boolean(values[index]) : values[index];
  });
  return row;
}

function setupTableScrollSync() {
  els.tableScrollTop.addEventListener("scroll", () => {
    if (syncingTableScroll) return;
    syncingTableScroll = true;
    els.tableWrap.scrollLeft = els.tableScrollTop.scrollLeft;
    syncingTableScroll = false;
  });

  els.tableWrap.addEventListener("scroll", () => {
    if (syncingTableScroll) return;
    syncingTableScroll = true;
    els.tableScrollTop.scrollLeft = els.tableWrap.scrollLeft;
    syncingTableScroll = false;
  });
}

function syncTableScrollWidth(table) {
  els.tableScrollTrack.style.width = `${table.scrollWidth}px`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
