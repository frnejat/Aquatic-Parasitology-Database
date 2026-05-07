const STORAGE_KEY = "flowbase-manager-v1";
const FONT_SIZE_KEY = "flowbase-font-size";
const ADMIN_PIN_KEY = "flowbase-admin-pin";
const ADMIN_UNLOCK_KEY = "flowbase-admin-unlocked";
const DEFAULT_BANNER_THEME = {
  background: "#2b6cb0",
  text: "#ffffff",
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
  addRowBtn: document.querySelector("#add-row-btn"),
  addColumnBtn: document.querySelector("#add-column-btn"),
  filterToggleBtn: document.querySelector("#filter-toggle-btn"),
  globalSearchInput: document.querySelector("#global-search-input"),
  sortColumnSelect: document.querySelector("#sort-column-select"),
  sortDirectionSelect: document.querySelector("#sort-direction-select"),
  clearSelectionBtn: document.querySelector("#clear-selection-btn"),
  duplicateSelectedBtn: document.querySelector("#duplicate-selected-btn"),
  deleteSelectedBtn: document.querySelector("#delete-selected-btn"),
  rowStats: document.querySelector("#row-stats"),
  pagePrevBtn: document.querySelector("#page-prev-btn"),
  pageIndicator: document.querySelector("#page-indicator"),
  pageNextBtn: document.querySelector("#page-next-btn"),
  pageSizeSelect: document.querySelector("#page-size-select"),
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
  adminStatus: document.querySelector("#admin-status"),
  adminPasswordInput: document.querySelector("#admin-password-input"),
  adminLoginBtn: document.querySelector("#admin-login-btn"),
  adminChangePasswordBtn: document.querySelector("#admin-change-password-btn"),
  exportChangesBtn: document.querySelector("#export-changes-btn"),
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
let adminUnlocked = loadAdminUnlocked();
let syncingTableScroll = false;
let supabaseClient = null;
let supabaseConfig = null;
let remoteReady = false;
let remoteSaveTimer = null;
let syncStatusMessage = "Local only";
let remoteAdminPin = null;

if (!state.pages.length && !isSupabaseConfigured()) {
  seedStarterWorkspace();
}

applyFontSize(fontSize);
applyBannerTheme(DEFAULT_BANNER_THEME);
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

  const previousName = page.name;
  page.name = name.trim() || page.name;
  if (page.name !== previousName) {
    recordPageChange(page, "Page renamed", `${previousName} -> ${page.name}`);
  }
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

els.adminLoginBtn.addEventListener("click", async () => {
  const value = els.adminPasswordInput.value.trim();
  if (!value) return;

  try {
    const savedPin = getStoredAdminPin();
    if (!savedPin) {
      await setStoredAdminPin(value);
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
  } catch (error) {
    window.alert(error.message || "Could not update admin PIN.");
  }
});

els.adminLockBtn.addEventListener("click", () => {
  adminUnlocked = false;
  window.sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
  els.adminPasswordInput.value = "";
  applyAdminState();
  render();
});

els.adminChangePasswordBtn.addEventListener("click", async () => {
  if (!isAdminUnlocked()) return;

  const nextPin = window.prompt("Enter a new admin password");
  if (!nextPin) return;

  const trimmedPin = nextPin.trim();
  if (!trimmedPin) return;

  try {
    await setStoredAdminPin(trimmedPin);
    els.adminPasswordInput.value = "";
    applyAdminState();
    window.alert("Admin password updated.");
  } catch (error) {
    window.alert(error.message || "Could not change the admin password.");
  }
});

els.exportChangesBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;
  exportChangeLogText(page);
});

els.addColumnBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page || !isAdminUnlocked()) return;

  const name = window.prompt("Column name");
  if (!name) return;

  const typeInput = window.prompt("Column type: text, number, date, checkbox", "text");
  const allowedTypes = new Set(["text", "number", "date", "checkbox"]);
  const type = allowedTypes.has(String(typeInput ?? "").trim().toLowerCase())
    ? String(typeInput).trim().toLowerCase()
    : "text";

  const column = {
    id: createId("col"),
    name: name.trim(),
    type,
    style: createDefaultColumnStyle(),
  };

  page.columns.push(column);
  for (const row of page.rows) {
    row.values[column.id] = defaultValueForType(column.type);
  }

  recordPageChange(page, "Column added", `${column.name} (${column.type})`);
  persistAndRender();
});

els.addRowBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page || !page.columns.length) return;

  const missingRequiredRows = getRowsWithMissingRequiredValues(page);
  if (missingRequiredRows.length) {
    window.alert("Fill the required cells before adding another row.");
    return;
  }

  const duplicateUniqueRows = getRowsWithDuplicateUniqueValues(page);
  if (duplicateUniqueRows.length) {
    window.alert("Fix duplicate values in unique columns before adding another row.");
    return;
  }

  const row = createRow(page.columns);
  markRowChanged(row, page.columns.map((column) => column.id));
  page.rows.push(row);
  recordPageChange(page, "Row added", `Row ${page.rows.length} was created.`);
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

  for (const row of rowsAdded) {
    markRowChanged(row, page.columns.map((column) => column.id));
  }
  recordPageChange(page, "Rows pasted", `${rowsAdded.length} row${rowsAdded.length === 1 ? "" : "s"} added from pasted data.`);
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
  recordPageChange(page, "Automation added", "A cross-page auto-fill rule was added.");
  runAutomations();
  persistAndRender();
});

els.automationSourcePage.addEventListener("change", renderAutomationFieldOptions);
els.clearFilterBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.filter = createDefaultFilter();
  page.pagination.page = 1;
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
  page.pagination.page = 1;
  persistState();
  renderTable(page);
  renderTableTools(page);
});

els.sortColumnSelect.addEventListener("change", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.sort.columnId = els.sortColumnSelect.value;
  page.pagination.page = 1;
  persistState();
  renderTable(page);
  renderTableTools(page);
});

els.sortDirectionSelect.addEventListener("change", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.sort.direction = els.sortDirectionSelect.value === "desc" ? "desc" : "asc";
  page.pagination.page = 1;
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

els.pagePrevBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.pagination.page = Math.max(1, page.pagination.page - 1);
  persistAndRender();
});

els.pageNextBtn.addEventListener("click", () => {
  const page = getCurrentPage();
  if (!page) return;
  const totalPages = getTotalPages(page);
  page.pagination.page = Math.min(totalPages, page.pagination.page + 1);
  persistAndRender();
});

els.pageSizeSelect.addEventListener("change", () => {
  const page = getCurrentPage();
  if (!page) return;
  page.pagination.pageSize = normalizePageSize(els.pageSizeSelect.value);
  page.pagination.page = 1;
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
    markRowChanged(clone, page.columns.map((column) => column.id));
  }
  page.rows.push(...clones);
  recordPageChange(page, "Rows duplicated", `${clones.length} selected row${clones.length === 1 ? "" : "s"} duplicated.`);
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
  recordPageChange(page, "Rows deleted", `${selectedCount} selected row${selectedCount === 1 ? "" : "s"} deleted.`);
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

  if (!isSupabaseConfigured() || typeof createClient !== "function") {
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

  setSyncStatus(state.pages.length ? "Connecting to Supabase..." : "Loading cloud workspace...");
  renderCloudStatus();
  void loadStateFromSupabase();
}

function isAdminUnlocked() {
  return adminUnlocked;
}

function applyAdminState() {
  document.body.classList.toggle("admin-unlocked", adminUnlocked);
  const hasPin = Boolean(getStoredAdminPin());
  els.adminStatus.textContent = adminUnlocked ? "Unlocked" : hasPin ? "Locked" : "Create PIN";
  els.adminLoginBtn.textContent = hasPin ? "Unlock" : "Set PIN";
  els.adminLockBtn.hidden = !adminUnlocked;
  els.adminChangePasswordBtn.disabled = !adminUnlocked;
  els.deletePageBtn.disabled = !adminUnlocked || !getCurrentPage();
  els.deleteSelectedBtn.disabled = !adminUnlocked;
  els.exportChangesBtn.disabled = !adminUnlocked || !getCurrentPage();
}

function getStoredAdminPin() {
  return supabaseClient ? remoteAdminPin : window.localStorage.getItem(ADMIN_PIN_KEY);
}

async function setStoredAdminPin(pin) {
  if (!supabaseClient || !supabaseConfig) {
    window.localStorage.setItem(ADMIN_PIN_KEY, pin);
    return;
  }

  remoteAdminPin = pin;
  await pushStateToSupabase();
}

function applyBannerTheme(theme) {
  document.documentElement.style.setProperty("--banner-bg", theme.background);
  document.documentElement.style.setProperty("--banner-text", theme.text);
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
    changeLog: [],
    filter: createDefaultFilter(),
    sort: createDefaultSort(),
    pagination: createDefaultPagination(),
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
    changeFlags: {},
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
  els.addColumnBtn.disabled = !hasPage || !isAdminUnlocked();
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
        recordPageChange(page, "Automation removed", "A cross-page auto-fill rule was removed.");
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
  els.pagePrevBtn.disabled = !page || page.columns.length === 0;
  els.pageNextBtn.disabled = !page || page.columns.length === 0;
  els.pageSizeSelect.disabled = !page || page.columns.length === 0;
}

function isSupabaseConfigured() {
  const config = window.SUPABASE_CONFIG ?? null;
  return Boolean(config?.url && config?.publishableKey && config?.workspaceId);
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
    els.pageIndicator.textContent = "Page 1 / 1";
    els.pageSizeSelect.value = "100";
    els.pagePrevBtn.disabled = true;
    els.pageNextBtn.disabled = true;
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

  const filteredRows = getSortedRows(page);
  const totalPages = getTotalPages(page, filteredRows.length);
  clampPagination(page, filteredRows.length);
  const selectedCount = page.rows.filter((row) => row.selected).length;
  els.rowStats.textContent =
    `${page.rows.length} total | ${filteredRows.length} visible | ${selectedCount} selected`;
  els.pageIndicator.textContent = `Page ${page.pagination.page} / ${totalPages}`;
  els.pageSizeSelect.value = String(page.pagination.pageSize);
  els.pagePrevBtn.disabled = page.pagination.page <= 1;
  els.pageNextBtn.disabled = page.pagination.page >= totalPages;
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
    const headWrap = document.createElement("div");
    headWrap.className = "column-head-wrap";
    const title = document.createElement("span");
    title.textContent = `${column.name}${column.style?.required ? " *" : ""}${column.style?.unique ? " [Unique]" : ""}${column.style?.adminOnly ? " [Admin]" : ""}`;
    title.className = "column-title";
    headWrap.appendChild(title);
    if (showAdminActions) {
      headWrap.appendChild(createColumnAdminMenu(page, column));
    }
    th.appendChild(headWrap);
    headRow.appendChild(th);

    const filterCell = document.createElement("th");
    filterCell.className = "column-filter-cell";
    applyColumnCellStyle(filterCell, column, true);
    const wrap = document.createElement("details");
    wrap.className = "filter-multiselect";

    const summary = document.createElement("summary");
    summary.className = "filter-multiselect-summary";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "filter-multiselect-search";
    searchInput.placeholder = "Search";

    const optionsList = document.createElement("div");
    optionsList.className = "filter-multiselect-list";

    let stagedValues = getSelectedFilterValues(page, column.id);

    const actions = document.createElement("div");
    actions.className = "filter-multiselect-actions";

    const updateSummary = () => {
      const selectedValues = getSelectedFilterValues(page, column.id);
      if (!selectedValues.length) {
        summary.textContent = "All";
        return;
      }

      if (selectedValues.length <= 2) {
        summary.textContent = selectedValues.join(", ");
        return;
      }

      summary.textContent = `${selectedValues.length} selected`;
    };

    const applySelection = () => {
      page.filter.values[column.id] = normalizeFilterSelection(stagedValues);
      page.pagination.page = 1;
      persistState();
      renderTable(page);
      renderTableTools(page);
    };

    const renderOptions = () => {
      const query = searchInput.value.trim().toLowerCase();
      optionsList.innerHTML = "";

      for (const optionValue of getColumnFilterOptions(page, column.id)) {
        if (query && !optionValue.toLowerCase().includes(query)) continue;

        const optionLabel = document.createElement("label");
        optionLabel.className = "filter-multiselect-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = stagedValues.includes(optionValue);
        checkbox.addEventListener("change", () => {
          const currentValues = new Set(stagedValues);
          if (checkbox.checked) {
            currentValues.add(optionValue);
          } else {
            currentValues.delete(optionValue);
          }
          stagedValues = normalizeFilterSelection([...currentValues]);
        });

        const text = document.createElement("span");
        text.textContent = optionValue || "(empty)";

        optionLabel.append(checkbox, text);
        optionsList.appendChild(optionLabel);
      }
    };

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "ghost-btn tiny-btn";
    allButton.textContent = "All";
    allButton.addEventListener("click", () => {
      page.filter.values[column.id] = [];
      page.pagination.page = 1;
      persistState();
      renderTable(page);
      renderTableTools(page);
    });

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "ghost-btn tiny-btn";
    clearButton.textContent = "Clear";
    clearButton.addEventListener("click", () => {
      stagedValues = [];
      renderOptions();
    });

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.className = "ghost-btn tiny-btn";
    applyButton.textContent = "Apply";
    applyButton.addEventListener("click", applySelection);

    searchInput.addEventListener("input", renderOptions);

    updateSummary();
    renderOptions();
    actions.append(allButton, clearButton, applyButton);
    wrap.append(summary, searchInput, optionsList, actions);
    filterCell.append(wrap);
    filterRow.appendChild(filterCell);
  }
  thead.appendChild(headRow);
  thead.appendChild(filterRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const row of visibleRows) {
    const tr = document.createElement("tr");
    const rowChanged = rowHasChanges(row);

    const indexCell = document.createElement("td");
    indexCell.className = "row-index-column sticky-left";
    applyRowStyle(indexCell, row);
    if (showAdminActions && rowChanged) {
      indexCell.classList.add("changed-row-marker");
      indexCell.style.setProperty("--change-row-alpha", String(getRowChangeAlpha(row)));
    }
    indexCell.textContent = String(page.rows.findIndex((candidate) => candidate.id === row.id) + 1);
    tr.appendChild(indexCell);

    const selectCell = document.createElement("td");
    selectCell.className = "select-column sticky-left-2";
    applyRowStyle(selectCell, row);
    if (showAdminActions && rowChanged) {
      selectCell.classList.add("changed-row-marker");
      selectCell.style.setProperty("--change-row-alpha", String(getRowChangeAlpha(row)));
    }
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
      if (rowChanged) {
        actionCell.classList.add("changed-row-marker");
        actionCell.style.setProperty("--change-row-alpha", String(getRowChangeAlpha(row)));
      }
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mini-btn delete-x";
      removeButton.textContent = "X";
      removeButton.setAttribute("aria-label", "Delete row");
      removeButton.title = "Delete row";
      removeButton.addEventListener("click", () => {
        const rowNumber = page.rows.findIndex((candidate) => candidate.id === row.id) + 1;
        page.rows = page.rows.filter(({ id }) => id !== row.id);
        recordPageChange(page, "Row deleted", `Row ${rowNumber} was deleted.`);
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
      if (column.style?.required && isEmptyRequiredValue(row.values[column.id], column.type)) {
        td.classList.add("required-missing");
      }
      if (column.style?.unique && hasDuplicateUniqueValue(page, row, column)) {
        td.classList.add("duplicate-value");
      }
      if (showAdminActions && row.changeFlags?.[column.id]) {
        td.classList.add("changed-cell");
        td.style.setProperty("--change-cell-alpha", String(getCellChangeAlpha(row.changeFlags[column.id])));
      }
      const input = buildInput(column, row.values[column.id], (value) => {
        const previousValue = row.values[column.id];
        if (column.style?.unique && wouldCreateDuplicateUniqueValue(page, row, column, value)) {
          window.alert(`${column.name} must be unique.`);
          return;
        }
        row.values[column.id] = value;
        if (String(displayValue(previousValue, column.type)) !== String(displayValue(value, column.type))) {
          markRowChanged(row, [column.id]);
          const rowNumber = page.rows.findIndex((candidate) => candidate.id === row.id) + 1;
          recordPageChange(
            page,
            "Cell edited",
            `Row ${rowNumber}, ${column.name}: ${summarizeValue(previousValue, column.type)} -> ${summarizeValue(value, column.type)}`
          );
        }
        runAutomations();
        persistAndRender();
      });
      applyInputStyle(input, row, column);
      if (column.style?.adminOnly && !isAdminUnlocked()) {
        input.disabled = true;
        input.title = "Only admin can edit this column";
      }
      if (column.style?.required) {
        input.required = true;
      }
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
    .map(([columnId, value]) => [columnId, normalizeFilterSelection(value)])
    .filter(([, value]) => value.length > 0);

  if (!activeFilters.length && !globalFilter) {
    return page.rows;
  }

  return page.rows.filter((row) => {
    const matchesColumns = activeFilters.every(([columnId, filterValues]) => {
      const column = page.columns.find((candidate) => candidate.id === columnId);
      if (!column) return true;

      const rowValue = String(displayValue(row.values[column.id], column.type)).trim();
      return filterValues.includes(rowValue);
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
  const sortedRows = getSortedRows(page);
  clampPagination(page, sortedRows.length);
  const pageSize = normalizePageSize(page.pagination?.pageSize);
  const start = (page.pagination.page - 1) * pageSize;
  return sortedRows.slice(start, start + pageSize);
}

function getSortedRows(page) {
  return sortRows(getFilteredRows(page), page);
}

function getTotalPages(page, rowCount = getSortedRows(page).length) {
  const pageSize = normalizePageSize(page.pagination?.pageSize);
  return Math.max(1, Math.ceil(rowCount / pageSize));
}

function clampPagination(page, rowCount = getSortedRows(page).length) {
  page.pagination = normalizePagination(page.pagination);
  const totalPages = getTotalPages(page, rowCount);
  page.pagination.page = Math.max(1, Math.min(totalPages, page.pagination.page));
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

function getSelectedFilterValues(page, columnId) {
  return normalizeFilterSelection(page.filter?.values?.[columnId]);
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

function createColumnAdminMenu(page, column) {
  const menu = document.createElement("details");
  menu.className = "column-admin-menu";

  const summary = document.createElement("summary");
  summary.className = "column-admin-summary";
  summary.textContent = "⋯";

  const panel = document.createElement("div");
  panel.className = "column-admin-panel";

  const typeSelect = document.createElement("select");
  for (const value of ["text", "number", "date", "checkbox"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    typeSelect.appendChild(option);
  }
  typeSelect.value = column.type || "text";
  typeSelect.title = "Column type";
  typeSelect.addEventListener("change", () => {
    const previousType = column.type || "text";
    const nextType = typeSelect.value || "text";
    if (previousType === nextType) {
      return;
    }

    const confirmed = window.confirm(
      `Change "${column.name}" from ${previousType} to ${nextType}? Existing values will be converted.`
    );
    if (!confirmed) {
      typeSelect.value = previousType;
      return;
    }

    column.type = nextType;
    for (const row of page.rows) {
      row.values[column.id] = coerceCellValue(row.values[column.id], nextType);
    }
    runAutomations();
    recordPageChange(page, "Column type changed", `${column.name}: ${previousType} -> ${nextType}`);
    persistAndRender();
  });

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

  const adminOnlyToggle = createColumnRuleToggle("Admin only", Boolean(column.style?.adminOnly), (checked) => {
    column.style.adminOnly = checked;
    persistAndRender();
  });

  const requiredToggle = createColumnRuleToggle("Required", Boolean(column.style?.required), (checked) => {
    column.style.required = checked;
    persistAndRender();
  });

  const uniqueToggle = createColumnRuleToggle("Unique", Boolean(column.style?.unique), (checked) => {
    column.style.unique = checked;
    persistAndRender();
  });

  const removeButton = document.createElement("button");
  removeButton.className = "ghost-btn tiny-btn column-remove-btn";
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => removeColumn(page.id, column.id));

  panel.append(
    typeSelect,
    widthInput,
    headerColor,
    cellColor,
    alignSelect,
    adminOnlyToggle,
    requiredToggle,
    uniqueToggle,
    removeButton
  );
  menu.append(summary, panel);
  return menu;
}

function createColumnRuleToggle(labelText, checked, onChange) {
  const label = document.createElement("label");
  label.className = "column-rule-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function createDefaultColumnStyle() {
  return {
    width: "",
    headerBg: "",
    cellBg: "",
    align: "left",
    adminOnly: false,
    required: false,
    unique: false,
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

function isEmptyRequiredValue(value, type) {
  if (type === "checkbox") {
    return value !== true;
  }
  return String(value ?? "").trim() === "";
}

function getRowsWithMissingRequiredValues(page) {
  const requiredColumns = page.columns.filter((column) => column.style?.required);
  if (!requiredColumns.length) {
    return [];
  }

  return page.rows.filter((row) =>
    requiredColumns.some((column) => isEmptyRequiredValue(row.values[column.id], column.type))
  );
}

function normalizeUniqueValue(value, type) {
  if (type === "checkbox") {
    return value ? "true" : "false";
  }
  return String(value ?? "").trim().toLowerCase();
}

function hasDuplicateUniqueValue(page, row, column) {
  const currentValue = normalizeUniqueValue(row.values[column.id], column.type);
  if (!currentValue) {
    return false;
  }

  return page.rows.some(
    (candidate) =>
      candidate.id !== row.id &&
      normalizeUniqueValue(candidate.values[column.id], column.type) === currentValue
  );
}

function wouldCreateDuplicateUniqueValue(page, row, column, nextValue) {
  const normalizedNextValue = normalizeUniqueValue(nextValue, column.type);
  if (!normalizedNextValue) {
    return false;
  }

  return page.rows.some(
    (candidate) =>
      candidate.id !== row.id &&
      normalizeUniqueValue(candidate.values[column.id], column.type) === normalizedNextValue
  );
}

function getRowsWithDuplicateUniqueValues(page) {
  const uniqueColumns = page.columns.filter((column) => column.style?.unique);
  if (!uniqueColumns.length) {
    return [];
  }

  return page.rows.filter((row) =>
    uniqueColumns.some((column) => hasDuplicateUniqueValue(page, row, column))
  );
}

function removeColumn(pageId, columnId) {
  const page = state.pages.find(({ id }) => id === pageId);
  if (!page) return;
  const column = page.columns.find(({ id }) => id === columnId);

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

  if (column) {
    recordPageChange(page, "Column removed", `${column.name} was removed.`);
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
    changeLog: normalizeChangeLog(page.changeLog),
    rows: (page.rows ?? []).map((row) => ({
      ...row,
      selected: Boolean(row.selected),
      changeFlags: { ...(row.changeFlags ?? {}) },
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
    pagination: normalizePagination(page.pagination),
  }));

  return {
    currentPageId: rawState.currentPageId ?? normalizedPages[0]?.id ?? null,
    pages: normalizedPages,
  };
}

function normalizeChangeLog(changeLog) {
  return (changeLog ?? [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: entry.id ?? createId("change"),
      at: entry.at ?? new Date().toISOString(),
      title: String(entry.title ?? "Change"),
      detail: String(entry.detail ?? ""),
    }))
    .slice(-300);
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

function createDefaultPagination() {
  return {
    page: 1,
    pageSize: 100,
  };
}

function normalizeFilter(filter) {
  if (filter?.values && typeof filter.values === "object") {
    return {
      values: Object.fromEntries(
        Object.entries(filter.values).map(([columnId, value]) => [columnId, normalizeFilterSelection(value)])
      ),
      global: filter.global ?? "",
      open: filter.open ?? true,
    };
  }

  if (filter?.columnId && filter?.value) {
    return {
      values: {
        [filter.columnId]: normalizeFilterSelection(filter.value),
      },
      global: "",
      open: true,
    };
  }

  return createDefaultFilter();
}

function normalizeFilterSelection(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
  }

  const text = String(value ?? "").trim();
  return text ? [text] : [];
}

function normalizeSort(sort) {
  return {
    ...createDefaultSort(),
    ...(sort ?? {}),
  };
}

function normalizePagination(pagination) {
  return {
    page: Math.max(1, Number(pagination?.page) || 1),
    pageSize: normalizePageSize(pagination?.pageSize),
  };
}

function normalizePageSize(value) {
  const allowed = [50, 100, 250, 500];
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : 100;
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
  const sortedRows = getSortedRows(page);
  const selectedRows = sortedRows.filter((row) => row.selected);
  const rowsToExport = selectedRows.length ? selectedRows : sortedRows;

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
    bannerTheme: DEFAULT_BANNER_THEME,
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

  persistState();
  window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  applyFontSize(fontSize);
  applyBannerTheme(DEFAULT_BANNER_THEME);
  scheduleSupabaseSave(true);
  render();
}

async function loadStateFromSupabase() {
  if (!supabaseClient || !supabaseConfig) return;

  try {
    const record = await fetchSupabaseWorkspace();

    if (record?.data?.pages) {
      remoteAdminPin = record.admin_pin ?? null;
      state = normalizeState(record.data);
      fontSize = normalizeRemoteFontSize(record.font_size);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
      applyFontSize(fontSize);
      applyBannerTheme(DEFAULT_BANNER_THEME);
      remoteReady = true;
      setSyncStatus(`Cloud synced: ${formatUpdatedAt(record.updated_at)}`);
      applyAdminState();
      render();
      return;
    }

    remoteAdminPin = record?.admin_pin ?? null;
    if (!state.pages.length) {
      seedStarterWorkspace();
    }
    remoteReady = true;
    await pushStateToSupabase();
    setSyncStatus("Cloud ready");
    applyAdminState();
    render();
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
    .select("workspace_id, data, font_size, banner_theme, admin_pin, updated_at")
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
    banner_theme: DEFAULT_BANNER_THEME,
    admin_pin: remoteAdminPin,
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

function recordPageChange(page, title, detail) {
  if (!page) return;
  page.changeLog = normalizeChangeLog([
    ...(page.changeLog ?? []),
    {
      id: createId("change"),
      at: new Date().toISOString(),
      title,
      detail,
    },
  ]);
}

function markRowChanged(row, columnIds) {
  row.changeFlags = {
    ...(row.changeFlags ?? {}),
  };

  for (const columnId of columnIds) {
    row.changeFlags[columnId] = Number(row.changeFlags[columnId] ?? 0) + 1;
  }
}

function rowHasChanges(row) {
  return Object.values(row.changeFlags ?? {}).some((count) => Number(count) > 0);
}

function getCellChangeAlpha(count) {
  const safeCount = Math.max(1, Number(count) || 1);
  return Math.min(0.18 + safeCount * 0.08, 0.62);
}

function getRowChangeAlpha(row) {
  const counts = Object.values(row.changeFlags ?? {}).map((count) => Number(count) || 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  return Math.min(0.08 + total * 0.03, 0.34);
}

function summarizeValue(value, type) {
  const text = String(displayValue(value, type) ?? "").trim();
  if (!text) {
    return "(empty)";
  }
  return text.length > 42 ? `${text.slice(0, 39)}...` : text;
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

function formatChangeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

function exportChangeLogText(page) {
  const lines = [
    `Change log for ${page.name}`,
    `Exported: ${new Date().toLocaleString()}`,
    "",
  ];

  if (!page.changeLog?.length) {
    lines.push("No tracked changes.");
  } else {
    for (const entry of [...page.changeLog].reverse()) {
      lines.push(`[${formatChangeTime(entry.at)}] ${entry.title}`);
      if (entry.detail) {
        lines.push(entry.detail);
      }
      lines.push("");
    }
  }

  const blob = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${page.name || "changes"}-change-log.txt`;
  link.click();
  window.URL.revokeObjectURL(url);
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
