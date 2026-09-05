(() => {
  "use strict";

  const STATUS_OPTIONS = ["New", "Contacted", "Interested", "Follow Up", "Site Visit", "Converted", "Not Interested", "Lost"];
  const STATUS_COLORS = ["green", "blue", "yellow", "purple", "cyan", "red"];
  const VIEW_TITLES = {
    dashboard: ["Dashboard", "All projects overview"],
    projects: ["Projects", "Manage connected projects"],
    connections: ["Google Sheets", "Manage Google Sheet connections"],
    allLeads: ["All Leads", "Leads from all projects"]
  };

  let csrfToken = null;
  let user = null;
  let projects = [];
  const leadsCache = Object.create(null);
  let currentProjectId = null;
  let syncing = false;
  let spreadsheets = [];
  let selectedSpreadsheet = null;
  let selectedTab = null;
  let toastTimer = null;

  const $ = id => document.getElementById(id);

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHTML(value);
  }

  function when(value) {
    return value
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
      : "Not refreshed yet";
  }

  function greetingName() {
    const name = user?.name?.trim() || user?.email?.split("@")[0] || "Admin";
    const hour = new Date().getHours();
    const period = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return `${period}, ${name}`;
  }

  function normalizeStatus(value) {
    return String(value || "").trim().toLowerCase();
  }

  function statusColumn(columns) {
    return (columns || []).find(c => normalizeStatus(c) === "lead status") || null;
  }

  function statusValue(lead, column) {
    if (!column) return "New";
    return String(lead?.[column] ?? "").trim() || "New";
  }

  function findColumn(columns, name) {
    const target = normalizeStatus(name);
    return (columns || []).find(c => normalizeStatus(c) === target) || null;
  }

  function getStatusClass(status) {
    const s = normalizeStatus(status);
    if (s === "new") return "status-new";
    if (s === "contacted" || s === "follow up") return "status-contacted";
    if (s === "interested") return "status-interested";
    if (s.includes("site") || s.includes("visit")) return "status-site";
    if (s === "converted") return "status-converted";
    if (s === "lost" || s.includes("not interested")) return "status-lost";
    return "status-contacted";
  }

  function projectInitials(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .map(word => word[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "P";
  }

  function activeProject() {
    return currentProjectId ? leadsCache[currentProjectId] || null : null;
  }

  function setCache(projectData) {
    if (projectData?.id) leadsCache[projectData.id] = projectData;
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method)) {
      headers.set("X-CSRF-Token", csrfToken);
    }
    const res = await fetch(path, { ...options, headers, credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  function showLoading(text) {
    $("loadingText").textContent = text || "Loading...";
    $("loading").classList.add("active");
  }

  function hideLoading() {
    $("loading").classList.remove("active");
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function toggleSidebar() {
    $("sidebar").classList.toggle("open");
  }

  function closeSidebar() {
    $("sidebar").classList.remove("open");
  }

  function setUserUI() {
    const initials = projectInitials(user?.name || user?.email || "A");
    $("userAvatar").textContent = initials;
    $("userName").textContent = user?.name?.trim() || "Admin";
    $("userEmail").textContent = user?.email || "";
    $("oauthSignedInText").textContent = user?.email
      ? `Signed in as ${user.email}. Select a spreadsheet and tab below to connect a project.`
      : "Your Google account is authorized for this app. Select a spreadsheet and tab below.";
    $("dashboardGreeting").textContent = greetingName();
  }

  function latestSyncText() {
    const times = projects.map(p => p.lastSync).filter(Boolean);
    if (!times.length) return "Not synced yet";
    const latest = times.sort((a, b) => new Date(b) - new Date(a))[0];
    return `Last sync ${when(latest)}`;
  }

  function updateSyncText() {
    $("syncText").textContent = latestSyncText();
  }

  function collectAllLeads() {
    const items = [];
    projects.forEach(project => {
      const cached = leadsCache[project.id];
      if (!cached?.leads) return;
      const col = statusColumn(cached.columns);
      cached.leads.forEach((lead, index) => {
        items.push({
          projectId: project.id,
          projectName: project.name,
          lead,
          rowNumber: cached.rowNumbers?.[index] ?? null,
          statusColumn: col,
          columns: cached.columns || []
        });
      });
    });
    return items;
  }

  function statusCountsFromItems(items) {
    const counts = Object.create(null);
    items.forEach(item => {
      const status = statusValue(item.lead, item.statusColumn);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }

  function statusCountsForProject(projectId) {
    const cached = leadsCache[projectId];
    if (!cached?.leads) return Object.create(null);
    const col = statusColumn(cached.columns);
    const counts = Object.create(null);
    cached.leads.forEach(lead => {
      const status = statusValue(lead, col);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }

  function countStatus(counts, status) {
    const key = Object.keys(counts).find(k => normalizeStatus(k) === normalizeStatus(status));
    return key ? counts[key] : 0;
  }

  function renderStatusBars(container, counts, total) {
    if (!total) {
      container.innerHTML = '<div class="empty-state"><p>No leads loaded yet.</p></div>';
      return;
    }
    const rows = Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([status, count], index) => {
        const pct = Math.round((count / total) * 100);
        const color = STATUS_COLORS[index % STATUS_COLORS.length];
        return `<div class="status-row">
          <div class="status-info">
            <div class="status-name"><span class="status-dot ${color}"></span>${escapeHTML(status)}</div>
            <strong>${count}${total ? ` (${pct}%)` : ""}</strong>
          </div>
          <div class="status-bar"><div class="status-fill ${color}" style="width:${pct}%"></div></div>
        </div>`;
      })
      .join("");
    container.innerHTML = rows || '<div class="empty-state"><p>No status data.</p></div>';
  }

  function renderProjectCard(project) {
    const cached = leadsCache[project.id];
    const leads = cached?.leads || [];
    const counts = statusCountsForProject(project.id);
    const total = leads.length;
    const converted = countStatus(counts, "Converted");
    const newCount = countStatus(counts, "New");
    const initials = projectInitials(project.name);

    return `<div class="project-card" data-project-id="${project.id}" onclick="openProject(${project.id})">
      <div class="project-head">
        <div class="project-logo">${escapeHTML(initials)}</div>
      </div>
      <h3>${escapeHTML(project.name)}</h3>
      <p>${escapeHTML(project.spreadsheetName || project.spreadsheetId)} · ${escapeHTML(project.sheetName)}</p>
      <div class="project-stats">
        <div class="mini-stat"><span>Total Leads</span><strong>${total}</strong></div>
        <div class="mini-stat"><span>New Leads</span><strong>${newCount}</strong></div>
        <div class="mini-stat"><span>Converted</span><strong>${converted}</strong></div>
        <div class="mini-stat"><span>Last Sync</span><strong style="font-size:12px;">${escapeHTML(when(project.lastSync))}</strong></div>
      </div>
      <div class="project-footer"><span>View Dashboard</span><span>→</span></div>
    </div>`;
  }

  function renderProjectsGrid(containerId) {
    const container = $(containerId);
    if (!container) return;
    if (!projects.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">▣</div><p>No projects connected yet.</p></div>`;
      return;
    }
    container.innerHTML = projects.map(renderProjectCard).join("");
  }

  function loadDashboard() {
    $("dashboardGreeting").textContent = greetingName();
    const allItems = collectAllLeads();
    const counts = statusCountsFromItems(allItems);
    const totalLeads = allItems.length;

    $("totalProjects").textContent = String(projects.length);
    $("totalLeads").textContent = String(totalLeads);
    $("newLeads").textContent = String(countStatus(counts, "New"));
    $("convertedLeads").textContent = String(countStatus(counts, "Converted"));

    renderStatusBars($("overallStatusContainer"), counts, totalLeads);

    const perf = $("performanceContainer");
    if (!projects.length) {
      perf.innerHTML = '<div class="empty-state"><p>No projects yet.</p></div>';
    } else {
      perf.innerHTML = projects.map(project => {
        const cached = leadsCache[project.id];
        const total = cached?.leads?.length || 0;
        const converted = countStatus(statusCountsForProject(project.id), "Converted");
        const rate = total ? Math.round((converted / total) * 100) : 0;
        return `<div style="margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px;">
            <strong>${escapeHTML(project.name)}</strong><span>${rate}% Converted</span>
          </div>
          <div class="status-bar"><div class="status-fill green" style="width:${rate}%"></div></div>
        </div>`;
      }).join("");
    }

    renderProjectsGrid("dashboardProjects");
    updateSyncText();
  }

  function renderProjectDetailStats() {
    const cached = activeProject();
    if (!cached) return;
    const counts = statusCountsForProject(cached.id);
    $("detailTotal").textContent = String(cached.leads?.length || 0);
    $("detailNew").textContent = String(countStatus(counts, "New"));
    $("detailContacted").textContent = String(countStatus(counts, "Contacted"));
    $("detailInterested").textContent = String(countStatus(counts, "Interested"));
    $("detailSite").textContent = String(countStatus(counts, "Site Visit"));
    $("detailConverted").textContent = String(countStatus(counts, "Converted"));
  }

  function populateProjectFilters() {
    const cached = activeProject();
    if (!cached) return;
    const col = statusColumn(cached.columns);
    const sourceCol = findColumn(cached.columns, "Source");

    const statusFilter = $("statusFilter");
    statusFilter.innerHTML = '<option value="">All Status</option>';
    STATUS_OPTIONS.forEach(status => {
      statusFilter.innerHTML += `<option value="${escapeAttr(status)}">${escapeHTML(status)}</option>`;
    });
    statusFilter.disabled = !col;

    const sourceFilter = $("sourceFilter");
    if (sourceCol) {
      sourceFilter.classList.remove("hidden");
      const sources = [...new Set(cached.leads.map(l => String(l[sourceCol] ?? "").trim()).filter(Boolean))].sort();
      sourceFilter.innerHTML = '<option value="">All Sources</option>';
      sources.forEach(source => {
        sourceFilter.innerHTML += `<option value="${escapeAttr(source)}">${escapeHTML(source)}</option>`;
      });
    } else {
      sourceFilter.classList.add("hidden");
      sourceFilter.innerHTML = '<option value="">All Sources</option>';
    }

    const hasCol = Boolean(col);
    $("addStatusColumnBtn").classList.toggle("hidden", hasCol);
    $("statusColumnWarning").classList.toggle("hidden", hasCol);
  }

  function buildStatusSelect(lead, column, rowNumber, row) {
    let saved = statusValue(lead, column);
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Lead Status");
    const values = new Set(STATUS_OPTIONS);
    values.add(saved);
    [...values].forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    select.value = saved;
    if (!rowNumber) select.disabled = true;

    select.onchange = async () => {
      const nextStatus = select.value;
      if (nextStatus === saved) return;
      select.disabled = true;
      row.classList.add("row-updating");
      try {
        const result = await api(`/api/projects/${currentProjectId}/leads/${rowNumber}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus })
        });
        setCache(result.project);
        lead[column] = nextStatus;
        saved = nextStatus;
        showToast(`Lead Status saved as ${nextStatus}.`);
        renderProjectDetailStats();
        renderProjectStatusDistribution();
        filterLeads();
      } catch (err) {
        select.value = saved;
        showToast(err.message);
      } finally {
        row.classList.remove("row-updating");
        select.disabled = !rowNumber;
      }
    };
    return select;
  }

  function renderLeadTableRows(leads) {
    const cached = activeProject();
    const head = $("leadTableHead");
    const body = $("leadTableBody");
    if (!cached) return;

    const columns = cached.columns || [];
    const statusCol = statusColumn(columns);

    head.innerHTML = `<tr>${columns.map(c => `<th>${escapeHTML(c)}</th>`).join("")}</tr>`;
    body.replaceChildren();

    if (!columns.length) {
      body.innerHTML = `<tr><td colspan="1" style="text-align:center;padding:40px;color:#6b7280;">This sheet has no header row.</td></tr>`;
      return;
    }
    if (!leads.length) {
      body.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;padding:40px;color:#6b7280;">No leads match the current filters.</td></tr>`;
      return;
    }

    leads.forEach(({ lead, rowNumber }) => {
      const row = document.createElement("tr");
      columns.forEach(column => {
        const cell = document.createElement("td");
        if (statusCol && column === statusCol) {
          cell.appendChild(buildStatusSelect(lead, column, rowNumber, row));
        } else {
          const text = String(lead[column] ?? "");
          cell.textContent = text;
          if (normalizeStatus(column) === "name") cell.classList.add("lead-name");
        }
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
  }

  function filteredProjectLeads() {
    const cached = activeProject();
    if (!cached) return [];
    const search = $("leadSearch").value.trim().toLowerCase();
    const status = $("statusFilter").value;
    const sourceCol = findColumn(cached.columns, "Source");
    const source = sourceCol ? $("sourceFilter").value : "";
    const statusCol = statusColumn(cached.columns);

    return cached.leads
      .map((lead, index) => ({ lead, rowNumber: cached.rowNumbers?.[index] ?? null }))
      .filter(({ lead }) => {
        const matchStatus = !status || statusValue(lead, statusCol) === status;
        const matchSource = !source || String(lead[sourceCol] ?? "") === source;
        const matchSearch = !search || (cached.columns || []).some(key => {
          const value = statusCol && key === statusCol ? statusValue(lead, statusCol) : String(lead[key] ?? "");
          return value.toLowerCase().includes(search);
        });
        return matchStatus && matchSource && matchSearch;
      });
  }

  function renderProjectStatusDistribution() {
    const cached = activeProject();
    const container = $("projectStatusContainer");
    if (!cached) return;
    const counts = statusCountsForProject(cached.id);
    renderStatusBars(container, counts, cached.leads?.length || 0);
  }

  function renderProjectDetail() {
    const cached = activeProject();
    if (!cached) return;

    $("detailProjectName").textContent = cached.name;
    $("detailProjectSheet").textContent = `Spreadsheet: ${cached.spreadsheetName || "Google Spreadsheet"} · Tab: ${cached.sheetName}`;

    renderProjectDetailStats();
    renderProjectStatusDistribution();
    populateProjectFilters();
    renderLeadTableRows(filteredProjectLeads());
  }

  function buildUnionColumns() {
    const ordered = ["Project"];
    const seen = new Set(["project"]);
    const priority = ["Lead Status", "Name", "Phone", "Email", "Date", "Source"];

    priority.forEach(name => {
      const lower = normalizeStatus(name);
      let found = false;
      projects.forEach(project => {
        const cols = leadsCache[project.id]?.columns || [];
        const match = cols.find(c => normalizeStatus(c) === lower);
        if (match && !seen.has(normalizeStatus(match))) {
          ordered.push(match);
          seen.add(normalizeStatus(match));
          found = true;
        }
      });
      if (!found && name === "Lead Status" && !seen.has("lead status")) {
        ordered.push("Lead Status");
        seen.add("lead status");
      }
    });

    projects.forEach(project => {
      (leadsCache[project.id]?.columns || []).forEach(column => {
        const lower = normalizeStatus(column);
        if (lower === "lead status" || seen.has(lower)) return;
        ordered.push(column);
        seen.add(lower);
      });
    });

    return ordered;
  }

  function drawAllLeads(items) {
    const columns = buildUnionColumns();
    const head = $("allLeadTableHead");
    const body = $("allLeadTableBody");

    head.innerHTML = `<tr>${columns.map(c => `<th>${escapeHTML(c)}</th>`).join("")}</tr>`;
    body.replaceChildren();

    if (!items.length) {
      body.innerHTML = `<tr><td colspan="${Math.max(columns.length, 1)}" style="text-align:center;padding:40px;color:#6b7280;">No leads found.</td></tr>`;
      return;
    }

    items.forEach(item => {
      const rowHtml = columns.map(column => {
        if (normalizeStatus(column) === "project") {
          return `<td><strong>${escapeHTML(item.projectName)}</strong></td>`;
        }
        const statusCol = item.statusColumn;
        if (statusCol && normalizeStatus(column) === normalizeStatus(statusCol)) {
          const status = statusValue(item.lead, statusCol);
          return `<td><span class="status-badge ${getStatusClass(status)}">${escapeHTML(status)}</span></td>`;
        }
        const match = item.columns.find(c => normalizeStatus(c) === normalizeStatus(column));
        const value = match ? String(item.lead[match] ?? "") : "";
        const cls = normalizeStatus(column) === "name" ? "lead-name" : "";
        return `<td class="${cls}">${escapeHTML(value)}</td>`;
      }).join("");
      body.innerHTML += `<tr>${rowHtml}</tr>`;
    });
  }

  function populateAllLeadsFilters() {
    const projectFilter = $("allProjectFilter");
    projectFilter.innerHTML = '<option value="">All Projects</option>';
    projects.forEach(p => {
      projectFilter.innerHTML += `<option value="${p.id}">${escapeHTML(p.name)}</option>`;
    });

    const statusFilter = $("allStatusFilter");
    statusFilter.innerHTML = '<option value="">All Status</option>';
    STATUS_OPTIONS.forEach(status => {
      statusFilter.innerHTML += `<option value="${escapeAttr(status)}">${escapeHTML(status)}</option>`;
    });
  }

  function renderAllLeads() {
    populateAllLeadsFilters();
    filterAllLeads();
  }

  function filterAllLeads() {
    const search = $("allLeadSearch").value.trim().toLowerCase();
    const projectId = $("allProjectFilter").value;
    const status = $("allStatusFilter").value;

    let items = collectAllLeads();
    if (projectId) items = items.filter(item => String(item.projectId) === String(projectId));
    if (status) items = items.filter(item => statusValue(item.lead, item.statusColumn) === status);
    if (search) {
      items = items.filter(item => {
        const values = [item.projectName, ...item.columns.map(c => String(item.lead[c] ?? ""))];
        if (item.statusColumn) values.push(statusValue(item.lead, item.statusColumn));
        return values.join(" ").toLowerCase().includes(search);
      });
    }
    drawAllLeads(items);
  }

  function renderConnections() {
    const container = $("connectionList");
    if (!projects.length) {
      container.innerHTML = '<div class="empty-state"><p>No connected projects yet.</p></div>';
      return;
    }
    container.innerHTML = projects.map(project => `
      <div class="connection-item">
        <div class="connection-info">
          <strong>${escapeHTML(project.name)}</strong>
          <span>${escapeHTML(project.spreadsheetName || project.spreadsheetId)} · ${escapeHTML(project.sheetName)} · Last sync: ${escapeHTML(when(project.lastSync))}</span>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <span class="connected">● Connected</span>
          <button class="btn btn-danger" type="button" onclick="removeProject(${project.id})">Remove</button>
        </div>
      </div>
    `).join("");
  }

  async function loadSpreadsheets() {
    const select = $("spreadsheetSelect");
    const tabSelect = $("sheetSelect");
    select.innerHTML = '<option value="">Loading spreadsheets...</option>';
    tabSelect.innerHTML = '<option value="">Select spreadsheet first</option>';
    tabSelect.disabled = true;
    selectedSpreadsheet = null;
    selectedTab = null;

    try {
      const result = await api("/api/sheets");
      spreadsheets = result.spreadsheets || [];
      if (!spreadsheets.length) {
        select.innerHTML = '<option value="">No spreadsheets found</option>';
        return;
      }
      select.innerHTML = '<option value="">Select a spreadsheet</option>';
      spreadsheets.forEach(sheet => {
        select.innerHTML += `<option value="${escapeAttr(sheet.id)}">${escapeHTML(sheet.name || "Untitled spreadsheet")}</option>`;
      });
    } catch (err) {
      select.innerHTML = '<option value="">Unable to load spreadsheets</option>';
      showToast(err.message);
    }
  }

  async function onSpreadsheetChange() {
    const select = $("spreadsheetSelect");
    const tabSelect = $("sheetSelect");
    const sheetId = select.value;
    selectedSpreadsheet = spreadsheets.find(s => s.id === sheetId) || null;
    selectedTab = null;
    tabSelect.innerHTML = '<option value="">Loading tabs...</option>';
    tabSelect.disabled = true;

    if (!selectedSpreadsheet) {
      tabSelect.innerHTML = '<option value="">Select spreadsheet first</option>';
      return;
    }

    if (!$("projectNameInput").value.trim()) {
      $("projectNameInput").value = selectedSpreadsheet.name || "";
    }

    try {
      const result = await api(`/api/sheets/${encodeURIComponent(selectedSpreadsheet.id)}/tabs`);
      const tabs = result.tabs || [];
      tabSelect.innerHTML = '<option value="">Select a tab</option>';
      tabs.forEach(tab => {
        tabSelect.innerHTML += `<option value="${escapeAttr(String(tab.sheetId))}" data-title="${escapeAttr(tab.title)}">${escapeHTML(tab.title)}</option>`;
      });
      tabSelect.disabled = false;
    } catch (err) {
      tabSelect.innerHTML = '<option value="">Unable to load tabs</option>';
      showToast(err.message);
    }
  }

  function onTabChange() {
    const tabSelect = $("sheetSelect");
    const option = tabSelect.selectedOptions[0];
    if (!option || !option.value) {
      selectedTab = null;
      return;
    }
    selectedTab = {
      sheetId: Number(option.value),
      sheetTitle: option.dataset.title || option.textContent
    };
  }

  async function getProjects() {
    const result = await api("/api/projects");
    projects = result.projects || [];
  }

  async function fetchProjectLeads(projectId, { silent = false } = {}) {
    if (!silent) showLoading("Loading leads...");
    try {
      const data = await api(`/api/projects/${projectId}/leads`);
      setCache(data);
      const index = projects.findIndex(p => p.id === projectId);
      if (index >= 0) {
        projects[index] = {
          ...projects[index],
          name: data.name,
          sheetName: data.sheetName,
          spreadsheetName: data.spreadsheetName,
          lastSync: data.lastSync,
          columns: data.columns
        };
      }
      return data;
    } finally {
      if (!silent) hideLoading();
    }
  }

  async function warmLeadsCache() {
    if (!projects.length) return;
    showLoading("Loading project leads...");
    try {
      await Promise.all(projects.map(p => fetchProjectLeads(p.id, { silent: true }).catch(() => null)));
    } finally {
      hideLoading();
    }
  }

  function setSyncButtonsDisabled(disabled) {
    syncing = disabled;
    $("syncAllBtn").disabled = disabled;
    const detailSync = $("detailSyncBtn");
    if (detailSync) detailSync.disabled = disabled;
  }

  async function syncAllSheets() {
    if (syncing) return;
    setSyncButtonsDisabled(true);
    showLoading("Syncing all Google Sheets...");
    try {
      await api("/api/sync", { method: "POST" });
      await getProjects();
      await warmLeadsCache();
      updateSyncText();
      loadDashboard();
      showToast("All Google Sheets synced successfully.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
      setSyncButtonsDisabled(false);
    }
  }

  async function syncCurrentProject() {
    if (!currentProjectId || syncing) return;
    setSyncButtonsDisabled(true);
    $("detailRefreshBtn").disabled = true;
    showLoading("Syncing project...");
    try {
      const result = await api(`/api/projects/${currentProjectId}/sync`, { method: "POST" });
      setCache(result.project);
      const index = projects.findIndex(p => p.id === currentProjectId);
      if (index >= 0) {
        projects[index] = {
          ...projects[index],
          name: result.project.name,
          sheetName: result.project.sheetName,
          spreadsheetName: result.project.spreadsheetName,
          lastSync: result.project.lastSync,
          columns: result.project.columns
        };
      }
      updateSyncText();
      renderProjectDetail();
      showToast(result.sync?.message || "Project synced.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
      $("detailRefreshBtn").disabled = false;
      setSyncButtonsDisabled(false);
    }
  }

  async function refreshCurrentProject() {
    if (!currentProjectId) return;
    $("detailRefreshBtn").disabled = true;
    showLoading("Refreshing leads...");
    try {
      await fetchProjectLeads(currentProjectId, { silent: true });
      renderProjectDetail();
      showToast("Leads refreshed.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
      $("detailRefreshBtn").disabled = false;
    }
  }

  async function addLeadStatusColumn() {
    if (!currentProjectId) return;
    const btn = $("addStatusColumnBtn");
    btn.disabled = true;
    showLoading("Adding Lead Status column...");
    try {
      const result = await api(`/api/projects/${currentProjectId}/lead-status-column`, { method: "POST" });
      setCache(result.project);
      renderProjectDetail();
      showToast("Lead Status column added.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
      btn.disabled = false;
    }
  }

  async function openProject(projectId) {
    currentProjectId = projectId;
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    $("projectDetailView").classList.add("active");

    const project = projects.find(p => p.id === projectId);
    $("pageTitle").textContent = project?.name || "Project";
    $("pageSubtitle").textContent = "Project Lead Dashboard";

    if (!leadsCache[projectId]) {
      try {
        await fetchProjectLeads(projectId);
      } catch (err) {
        showToast(err.message);
        return;
      }
    }
    renderProjectDetail();
    closeSidebar();
  }

  function showView(viewName, element) {
    if (viewName !== "projectDetail") currentProjectId = null;

    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    const target = $(`${viewName}View`);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-item[data-view]").forEach(item => item.classList.remove("active"));
    if (element) element.classList.add("active");

    if (VIEW_TITLES[viewName]) {
      $("pageTitle").textContent = VIEW_TITLES[viewName][0];
      $("pageSubtitle").textContent = VIEW_TITLES[viewName][1];
    }

    if (viewName === "dashboard") loadDashboard();
    if (viewName === "projects") renderProjectsGrid("allProjects");
    if (viewName === "connections") {
      renderConnections();
      loadSpreadsheets();
    }
    if (viewName === "allLeads") renderAllLeads();
    closeSidebar();
  }

  function filterLeads() {
    renderLeadTableRows(filteredProjectLeads());
  }

  function clearFilters() {
    $("leadSearch").value = "";
    $("statusFilter").value = "";
    $("sourceFilter").value = "";
    filterLeads();
  }

  async function saveProjectConnection() {
    const name = $("projectNameInput").value.trim();
    if (!name) {
      showToast("Please enter a project name.");
      return;
    }
    if (!selectedSpreadsheet || !selectedTab) {
      showToast("Select a spreadsheet and tab.");
      return;
    }

    const btn = $("saveProjectBtn");
    btn.disabled = true;
    showLoading("Saving project...");
    try {
      const created = await api("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          spreadsheetId: selectedSpreadsheet.id,
          sheetId: selectedTab.sheetId,
          sheetTitle: selectedTab.sheetTitle
        })
      });
      await getProjects();
      if (created.project?.id) {
        await fetchProjectLeads(created.project.id, { silent: true }).catch(() => null);
      }
      $("projectNameInput").value = "";
      $("spreadsheetSelect").value = "";
      $("sheetSelect").innerHTML = '<option value="">Select spreadsheet first</option>';
      $("sheetSelect").disabled = true;
      selectedSpreadsheet = null;
      selectedTab = null;
      renderConnections();
      loadDashboard();
      showToast("Project connected successfully.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
      btn.disabled = false;
    }
  }

  async function removeProject(id) {
    if (!confirm("Remove this project connection? The Google Sheet will not be deleted.")) return;
    showLoading("Removing project...");
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      projects = projects.filter(p => p.id !== id);
      delete leadsCache[id];
      if (currentProjectId === id) currentProjectId = null;
      renderConnections();
      loadDashboard();
      showToast("Project removed.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
    }
  }

  function googleLogin() {
    location.assign("/api/auth/google?returnTo=/");
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* proceed to login screen */
    }
    location.assign("/");
  }

  async function init() {
    try {
      const auth = await api("/api/auth/me");
      if (!auth.authenticated) return;

      user = auth.user;
      ({ csrfToken } = await api("/api/csrf"));
      await getProjects();
      setUserUI();

      $("loginScreen").style.display = "none";
      $("app").style.display = "block";

      await warmLeadsCache();
      loadDashboard();
    } catch (err) {
      showToast(err.message);
    }
  }

  window.googleLogin = googleLogin;
  window.logout = logout;
  window.showView = showView;
  window.toggleSidebar = toggleSidebar;
  window.syncAllSheets = syncAllSheets;
  window.openProject = openProject;
  window.filterLeads = filterLeads;
  window.clearFilters = clearFilters;
  window.filterAllLeads = filterAllLeads;
  window.saveProjectConnection = saveProjectConnection;
  window.removeProject = removeProject;
  window.syncCurrentProject = syncCurrentProject;
  window.refreshCurrentProject = refreshCurrentProject;
  window.addLeadStatusColumn = addLeadStatusColumn;

  document.addEventListener("DOMContentLoaded", () => {
    $("spreadsheetSelect").addEventListener("change", onSpreadsheetChange);
    $("sheetSelect").addEventListener("change", onTabChange);
    init();
  });
})();
