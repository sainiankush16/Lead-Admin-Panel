(() => {
  "use strict";

  const STATUS_OPTIONS = ["New", "Contacted", "Interested", "Follow Up", "Site Visit", "Converted", "Not Interested", "Lost"];
  const STATUS_COLORS = ["green", "blue", "yellow", "purple", "cyan", "red"];
  const VIEW_TITLES = {
    dashboard: ["Dashboard", "All projects overview"],
    projects: ["Projects", "Manage connected projects"],
    connections: ["Google Sheets", "Manage Google Sheet connections"],
    users: ["Users", "Manage project users and assignments"],
    allLeads: ["All Leads", "Leads from all projects"]
  };

  let csrfToken = null;
  let user = null;
  let projects = [];
  let users = [];
  let googleConnected = false;
  let googleEmail = null;
  const leadsCache = Object.create(null);
  let currentProjectId = null;
  let syncing = false;
  let spreadsheets = [];
  let selectedSpreadsheet = null;
  let selectedTab = null;
  let toastTimer = null;
  let uiBound = false;
  let loginSubmitStarted = false;
  let googleConnectStarted = false;
  let activeLeadDetail = null;

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

  function isAdmin() {
    return user?.role === "admin";
  }

  function roleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "project_user") return "Project User";
    return role || "User";
  }

  function greetingName() {
    const name = user?.name?.trim() || user?.loginId || "User";
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

  function setLoginError(message) {
    const el = $("loginError");
    if (!el) return;
    if (!message) {
      el.textContent = "";
      el.classList.add("hidden");
      return;
    }
    el.textContent = message;
    el.classList.remove("hidden");
  }

  function toggleSidebar() {
    $("sidebar").classList.toggle("open");
  }

  function closeSidebar() {
    $("sidebar").classList.remove("open");
  }

  function applyRoleUI() {
    const admin = isAdmin();
    document.querySelectorAll("[data-admin-only]").forEach(el => {
      el.classList.toggle("hidden", !admin);
    });
  }

  function setUserUI() {
    const initials = projectInitials(user?.name || user?.loginId || "A");
    $("userAvatar").textContent = initials;
    $("userName").textContent = user?.name?.trim() || "User";
    const loginId = user?.loginId || "";
    const role = roleLabel(user?.role);
    $("userEmail").textContent = loginId ? `${loginId} · ${role}` : role;
    $("dashboardGreeting").textContent = greetingName();
    updateGoogleConnectionStatus();
    applyRoleUI();
  }

  function updateGoogleConnectionStatus() {
    const status = $("googleConnectionStatus");
    const signedInText = $("oauthSignedInText");
    if (!status) return;
    if (googleConnected) {
      status.textContent = googleEmail
        ? `Connected as ${googleEmail}`
        : "Google Sheets is connected.";
      if (signedInText) {
        signedInText.textContent = googleEmail
          ? `Sheets access authorized for ${googleEmail}. Reauthorize if access was revoked or scopes change.`
          : "Sheets access is authorized. Select a spreadsheet and tab below to connect a project.";
      }
    } else {
      status.textContent = "Google Sheets is not connected.";
      if (signedInText) {
        signedInText.textContent = "Connect a Google account to list spreadsheets and sync leads. Admin login is required.";
      }
    }
  }

  function latestSyncText() {
    const times = projects.map(p => p.lastSync).filter(Boolean);
    if (!times.length) return "Not synced yet";
    const latest = times.sort((a, b) => new Date(b) - new Date(a))[0];
    return `Last sync ${when(latest)}`;
  }

  function updateSyncText() {
    const el = $("syncText");
    if (el) el.textContent = latestSyncText();
  }

  function emptyProjectsMessage() {
    return isAdmin()
      ? "No projects connected yet."
      : "No projects have been assigned to your account yet.";
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

    return `<div class="project-card" data-project-id="${project.id}" data-action="open-project" role="button" tabindex="0">
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
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">▣</div><p>${escapeHTML(emptyProjectsMessage())}</p></div>`;
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
      perf.innerHTML = `<div class="empty-state"><p>${escapeHTML(emptyProjectsMessage())}</p></div>`;
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
    $("addStatusColumnBtn").classList.toggle("hidden", hasCol || !isAdmin());
    $("statusColumnWarning").classList.toggle("hidden", hasCol);
  }

  function buildStatusSelect(lead, column, rowNumber, updatingEl) {
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

    select.addEventListener("change", async () => {
      const nextStatus = select.value;
      if (nextStatus === saved) return;
      select.disabled = true;
      if (updatingEl) updatingEl.classList.add("row-updating");
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
        if (activeLeadDetail && Number(activeLeadDetail.rowNumber) === Number(rowNumber)) {
          refreshLeadDetailSideData();
        }
      } catch (err) {
        select.value = saved;
        showToast(err.message);
      } finally {
        if (updatingEl) updatingEl.classList.remove("row-updating");
        select.disabled = !rowNumber;
      }
    });
    return select;
  }

  function phoneHelpers() {
    return globalThis.LeadPhoneHelpers || {};
  }

  function createContactAction({ href, label, ariaLabel, className }) {
    if (href) {
      const link = document.createElement("a");
      link.className = `btn ${className}`;
      link.href = href;
      link.textContent = label;
      link.setAttribute("aria-label", ariaLabel);
      link.title = ariaLabel;
      if (href.startsWith("https://wa.me/")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      return link;
    }
    const disabled = document.createElement("span");
    disabled.className = `btn ${className} is-disabled`;
    disabled.textContent = label;
    disabled.setAttribute("aria-disabled", "true");
    disabled.setAttribute("aria-label", `${ariaLabel} unavailable`);
    disabled.title = "Phone number unavailable";
    disabled.tabIndex = -1;
    return disabled;
  }

  function formatDateTime(value) {
    if (!value) return "";
    const normalized = String(value).includes("T") ? String(value) : `${String(value).replace(" ", "T")}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function closeLeadDetail() {
    activeLeadDetail = null;
    const overlay = $("leadDetailOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function renderRemarkItems(remarks) {
    const list = $("leadRemarkList");
    if (!list) return;
    list.replaceChildren();
    if (!remarks.length) {
      list.innerHTML = '<div class="lead-mobile-empty">No remarks yet.</div>';
      return;
    }
    remarks.forEach(remark => {
      const item = document.createElement("div");
      item.className = "remark-item";
      const text = document.createElement("p");
      text.textContent = remark.body;
      const meta = document.createElement("div");
      meta.className = "remark-meta";
      meta.textContent = `${remark.author?.name || remark.author?.loginId || "User"} · ${formatDateTime(remark.createdAt)}`;
      item.append(text, meta);
      list.appendChild(item);
    });
  }

  function renderTimelineItems(events) {
    const list = $("leadTimelineList");
    if (!list) return;
    list.replaceChildren();
    if (!events.length) {
      list.innerHTML = '<div class="lead-mobile-empty">No timeline events yet.</div>';
      return;
    }
    events.forEach(event => {
      const item = document.createElement("div");
      item.className = "timeline-item";
      const title = document.createElement("strong");
      title.textContent = event.eventData?.title || event.eventType;
      item.appendChild(title);

      const when = document.createElement("div");
      when.className = "timeline-meta";
      when.textContent = formatDateTime(event.createdAt);
      item.appendChild(when);

      const details = document.createElement("p");
      if (event.eventType === "STATUS_CHANGED") {
        details.textContent = `${event.eventData.fromStatus || ""} → ${event.eventData.toStatus || ""}`;
      } else if (event.eventType === "REMARK_ADDED" || event.eventType === "REMARK_EDITED") {
        details.textContent = event.eventData.text || "";
      } else if (event.eventType === "LEAD_GENERATED") {
        details.textContent = event.eventData.source ? `Source: ${event.eventData.source}` : "Imported from Google Sheets";
      } else if (event.eventData?.notice) {
        details.textContent = event.eventData.notice;
      } else if (event.eventData?.reason) {
        details.textContent = event.eventData.reason;
      } else {
        details.textContent = "";
      }
      if (details.textContent) item.appendChild(details);

      const actor = document.createElement("div");
      actor.className = "timeline-meta";
      actor.textContent = `By: ${event.actor?.name || event.eventData?.actorLabel || event.actor?.role || "System"}`;
      item.appendChild(actor);

      if (isAdmin() && !event.isDeleted && event.eventType !== "TIMELINE_EVENT_EDITED" && event.eventType !== "TIMELINE_EVENT_DELETED") {
        const adminActions = document.createElement("div");
        adminActions.style.marginTop = "8px";
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-light";
        del.textContent = "Remove event";
        del.addEventListener("click", async eventClick => {
          eventClick.stopPropagation();
          if (!window.confirm("Soft-delete this timeline event?")) return;
          try {
            await api(`/api/projects/${activeLeadDetail.projectId}/timeline/${event.id}`, { method: "DELETE" });
            await refreshLeadDetailSideData();
            showToast("Timeline event removed.");
          } catch (err) {
            showToast(err.message);
          }
        });
        adminActions.appendChild(del);
        item.appendChild(adminActions);
      }

      list.appendChild(item);
    });
  }

  async function refreshLeadDetailSideData() {
    if (!activeLeadDetail) return;
    try {
      const [remarksRes, timelineRes] = await Promise.all([
        api(`/api/projects/${activeLeadDetail.projectId}/leads/${activeLeadDetail.leadId}/remarks`),
        api(`/api/projects/${activeLeadDetail.projectId}/leads/${activeLeadDetail.leadId}/timeline`)
      ]);
      renderRemarkItems(remarksRes.remarks || []);
      renderTimelineItems(timelineRes.events || []);
    } catch (err) {
      showToast(err.message);
    }
  }

  async function submitLeadRemark() {
    if (!activeLeadDetail) return;
    const input = $("leadRemarkInput");
    const body = input?.value || "";
    if (!body.trim()) {
      showToast("Enter a remark.");
      return;
    }
    showLoading("Saving remark...");
    try {
      const result = await api(`/api/projects/${activeLeadDetail.projectId}/leads/${activeLeadDetail.leadId}/remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      });
      input.value = "";
      renderRemarkItems(result.remarks || []);
      renderTimelineItems(result.events || []);
      showToast("Remark added.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
    }
  }

  async function openLeadDetail(rowNumber) {
    const cached = activeProject();
    if (!cached || !rowNumber) return;
    const index = (cached.rowNumbers || []).indexOf(Number(rowNumber));
    if (index < 0) return;
    const lead = cached.leads[index];
    if (!lead) return;

    activeLeadDetail = { projectId: cached.id, leadId: String(rowNumber), rowNumber: Number(rowNumber) };
    const helpers = phoneHelpers();
    const columns = cached.columns || [];
    const nameCol = helpers.findNameColumn ? helpers.findNameColumn(columns) : findColumn(columns, "Name");
    const phoneCol = helpers.findPhoneColumn ? helpers.findPhoneColumn(columns) : findColumn(columns, "Phone");
    const statusCol = statusColumn(columns);
    const nameText = nameCol ? String(lead[nameCol] ?? "").trim() : "Lead";
    const phoneText = phoneCol ? String(lead[phoneCol] ?? "").trim() : "";
    const links = helpers.normalizePhoneForLinks ? helpers.normalizePhoneForLinks(phoneText) : null;

    $("leadDetailTitle").textContent = nameText || "Lead Details";
    $("leadDetailSubtitle").textContent = `${cached.name} · Row ${rowNumber}`;

    const body = $("leadDetailBody");
    body.replaceChildren();

    const fieldsSection = document.createElement("section");
    fieldsSection.className = "lead-detail-section";
    fieldsSection.innerHTML = "<h3>Lead Information</h3>";
    const fields = document.createElement("div");
    fields.className = "lead-detail-fields";
    columns.forEach(column => {
      if (statusCol && column === statusCol) return;
      const row = document.createElement("div");
      row.className = "lead-detail-field";
      const label = document.createElement("span");
      label.textContent = column;
      const value = document.createElement("strong");
      value.textContent = String(lead[column] ?? "");
      row.append(label, value);
      fields.appendChild(row);
    });
    fieldsSection.appendChild(fields);
    body.appendChild(fieldsSection);

    const actionsSection = document.createElement("section");
    actionsSection.className = "lead-detail-section";
    actionsSection.innerHTML = "<h3>Contact</h3>";
    const actions = document.createElement("div");
    actions.className = "lead-detail-actions";
    actions.appendChild(createContactAction({
      href: links?.telHref || null,
      label: "☎ Call Now",
      ariaLabel: `Call ${nameText || "lead"}`,
      className: "btn-light"
    }));
    actions.appendChild(createContactAction({
      href: links?.waHref || null,
      label: "WhatsApp",
      ariaLabel: `WhatsApp ${nameText || "lead"}`,
      className: "btn-primary"
    }));
    actionsSection.appendChild(actions);
    body.appendChild(actionsSection);

    const remarksSection = document.createElement("section");
    remarksSection.className = "lead-detail-section";
    remarksSection.innerHTML = "<h3>Remarks</h3>";
    const remarkList = document.createElement("div");
    remarkList.className = "remark-list";
    remarkList.id = "leadRemarkList";
    remarksSection.appendChild(remarkList);
    const compose = document.createElement("div");
    compose.className = "remark-compose";
    const textarea = document.createElement("textarea");
    textarea.id = "leadRemarkInput";
    textarea.maxLength = 2000;
    textarea.placeholder = "Add a remark...";
    const submitBtn = document.createElement("button");
    submitBtn.className = "btn btn-primary";
    submitBtn.type = "button";
    submitBtn.id = "leadRemarkSubmitBtn";
    submitBtn.textContent = "Add Remark";
    submitBtn.addEventListener("click", () => { submitLeadRemark(); });
    compose.append(textarea, submitBtn);
    remarksSection.appendChild(compose);
    body.appendChild(remarksSection);

    const timelineSection = document.createElement("section");
    timelineSection.className = "lead-detail-section";
    timelineSection.innerHTML = "<h3>Lead Timeline</h3>";
    const timelineList = document.createElement("div");
    timelineList.className = "timeline-list";
    timelineList.id = "leadTimelineList";
    timelineSection.appendChild(timelineList);
    body.appendChild(timelineSection);

    const statusSection = document.createElement("section");
    statusSection.className = "lead-detail-section lead-detail-status";
    statusSection.innerHTML = "<h3>Lead Status</h3>";
    if (statusCol) {
      const statusHost = document.createElement("div");
      statusSection.appendChild(statusHost);
      statusHost.appendChild(buildStatusSelect(lead, statusCol, Number(rowNumber), statusHost));
    } else {
      const missing = document.createElement("p");
      missing.className = "lead-mobile-phone";
      missing.textContent = "Lead Status column not found";
      statusSection.appendChild(missing);
    }
    body.appendChild(statusSection);

    const overlay = $("leadDetailOverlay");
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");

    await refreshLeadDetailSideData();
  }

  function closeGlobalSearchResults() {
    const panel = $("globalSearchResultsPanel");
    if (panel) panel.classList.add("hidden");
  }

  function renderGlobalSearchResults(payload) {
    const panel = $("globalSearchResultsPanel");
    const meta = $("globalSearchMeta");
    const body = $("globalSearchResultsBody");
    if (!panel || !meta || !body) return;

    panel.classList.remove("hidden");
    const count = Number(payload?.count || 0);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    meta.textContent = count === 1 ? "1 match found" : `${count} matches found`;

    body.replaceChildren();

    if (payload?.error) {
      const err = document.createElement("div");
      err.className = "global-search-error";
      err.textContent = payload.error;
      body.appendChild(err);
      return;
    }

    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "global-search-empty";
      empty.textContent = "No results";
      body.appendChild(empty);
      return;
    }

    results.forEach(hit => {
      const card = document.createElement("article");
      card.className = "global-search-card";

      const name = document.createElement("strong");
      name.className = "name";
      name.textContent = hit.name || "Unnamed lead";
      card.appendChild(name);

      if (hit.phone) {
        const phone = document.createElement("div");
        phone.className = "meta-line";
        phone.textContent = `📞 ${hit.phone}`;
        card.appendChild(phone);
      }
      const projectLine = document.createElement("div");
      projectLine.className = "meta-line";
      projectLine.textContent = `Project: ${hit.projectName || "—"}`;
      card.appendChild(projectLine);

      const sheetLine = document.createElement("div");
      sheetLine.className = "meta-line";
      sheetLine.textContent = `Sheet: ${hit.spreadsheetName || "—"}`;
      card.appendChild(sheetLine);

      const tabLine = document.createElement("div");
      tabLine.className = "meta-line";
      tabLine.textContent = `Tab: ${hit.sheetTitle || "—"}`;
      card.appendChild(tabLine);

      const statusLine = document.createElement("div");
      statusLine.className = "meta-line";
      statusLine.textContent = `Status: ${hit.status || "—"}`;
      card.appendChild(statusLine);

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn btn-primary";
      openBtn.textContent = "Open Lead";
      openBtn.addEventListener("click", () => {
        openLeadFromSearch(hit);
      });
      card.appendChild(openBtn);
      body.appendChild(card);
    });
  }

  async function runGlobalLeadSearch() {
    const input = $("globalLeadSearchInput");
    const btn = $("globalLeadSearchBtn");
    const query = String(input?.value || "").trim();
    if (!query) {
      showToast("Enter a phone, name, or email to search.");
      return;
    }

    if (btn) btn.disabled = true;
    renderGlobalSearchResults({ count: 0, results: [], error: null });
    $("globalSearchMeta").textContent = "Searching...";
    $("globalSearchResultsBody").replaceChildren();
    const searching = document.createElement("div");
    searching.className = "global-search-empty";
    searching.textContent = "Searching...";
    $("globalSearchResultsBody").appendChild(searching);

    try {
      const data = await api(`/api/leads/search?q=${encodeURIComponent(query)}`);
      renderGlobalSearchResults(data);
      if (data.sheetErrors?.length) {
        showToast("Some projects could not be searched.");
      }
    } catch (err) {
      renderGlobalSearchResults({ count: 0, results: [], error: err.message || "Search failed." });
      $("globalSearchMeta").textContent = "Error";
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function openLeadFromSearch(hit) {
    if (!hit?.projectId || !hit?.rowNumber) return;
    closeGlobalSearchResults();
    showLoading("Opening lead...");
    try {
      await openProject(Number(hit.projectId));
      // Ensure fresh sheet rows so Open Lead finds the row.
      if (!leadsCache[hit.projectId]?.rowNumbers?.includes(Number(hit.rowNumber))) {
        await fetchProjectLeads(Number(hit.projectId), { silent: true });
        renderProjectDetail();
      }
      await openLeadDetail(Number(hit.rowNumber));
    } catch (err) {
      showToast(err.message || "Unable to open lead.");
    } finally {
      hideLoading();
    }
  }

  function renderLeadMobileCards(leads) {
    const cached = activeProject();
    const list = $("leadMobileList");
    if (!list || !cached) return;

    const helpers = phoneHelpers();
    const columns = cached.columns || [];
    const statusCol = statusColumn(columns);
    const nameCol = helpers.findNameColumn ? helpers.findNameColumn(columns) : findColumn(columns, "Name");
    const phoneCol = helpers.findPhoneColumn ? helpers.findPhoneColumn(columns) : findColumn(columns, "Phone");

    list.replaceChildren();

    if (!columns.length) {
      list.innerHTML = '<div class="lead-mobile-empty">This sheet has no header row.</div>';
      return;
    }
    if (!leads.length) {
      list.innerHTML = '<div class="lead-mobile-empty">No leads match the current filters.</div>';
      return;
    }

    leads.forEach(({ lead, rowNumber }) => {
      const card = document.createElement("article");
      card.className = "lead-mobile-card";

      const nameText = nameCol ? String(lead[nameCol] ?? "").trim() : "";
      const phoneText = phoneCol ? String(lead[phoneCol] ?? "").trim() : "";
      const displayName = nameText || "Unnamed lead";
      const links = helpers.normalizePhoneForLinks
        ? helpers.normalizePhoneForLinks(phoneText)
        : null;

      const nameEl = document.createElement("div");
      nameEl.className = "lead-mobile-name";
      nameEl.textContent = displayName;
      card.appendChild(nameEl);

      const phoneEl = document.createElement("div");
      phoneEl.className = "lead-mobile-phone";
      phoneEl.textContent = phoneText || "No phone number";
      card.appendChild(phoneEl);

      const actions = document.createElement("div");
      actions.className = "lead-mobile-actions";
      actions.appendChild(createContactAction({
        href: links?.telHref || null,
        label: "☎ Call Now",
        ariaLabel: `Call ${displayName}`,
        className: "btn-light"
      }));
      actions.appendChild(createContactAction({
        href: links?.waHref || null,
        label: "WhatsApp",
        ariaLabel: `WhatsApp ${displayName}`,
        className: "btn-primary"
      }));
      card.appendChild(actions);

      const statusWrap = document.createElement("div");
      statusWrap.className = "lead-mobile-status";
      const statusLabel = document.createElement("label");
      const statusId = `lead-status-${rowNumber || "x"}-${Math.random().toString(36).slice(2, 8)}`;
      statusLabel.textContent = "Lead Status";
      statusLabel.htmlFor = statusId;
      statusWrap.appendChild(statusLabel);
      if (statusCol) {
        const select = buildStatusSelect(lead, statusCol, rowNumber, card);
        select.id = statusId;
        statusWrap.appendChild(select);
      } else {
        const missing = document.createElement("div");
        missing.className = "lead-mobile-phone";
        missing.textContent = "Lead Status column not found";
        statusWrap.appendChild(missing);
      }
      card.appendChild(statusWrap);

      card.addEventListener("click", event => {
        if (event.target.closest("a, button, select, textarea, input, label")) return;
        openLeadDetail(rowNumber);
      });
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.setAttribute("aria-label", `Open details for ${displayName}`);
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLeadDetail(rowNumber);
        }
      });

      list.appendChild(card);
    });
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
      renderLeadMobileCards([]);
      return;
    }
    if (!leads.length) {
      body.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;padding:40px;color:#6b7280;">No leads match the current filters.</td></tr>`;
      renderLeadMobileCards([]);
      return;
    }

    leads.forEach(({ lead, rowNumber }) => {
      const row = document.createElement("tr");
      row.className = "lead-row-clickable";
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.addEventListener("click", event => {
        if (event.target.closest("select, a, button, input")) return;
        openLeadDetail(rowNumber);
      });
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLeadDetail(rowNumber);
        }
      });
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

    renderLeadMobileCards(leads);
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
          <button class="btn btn-danger" type="button" data-action="remove-project" data-project-id="${project.id}" data-admin-only>Remove</button>
        </div>
      </div>
    `).join("");
    applyRoleUI();
  }

  function renderProjectCheckboxes(containerId, selectedIds = []) {
    const container = $(containerId);
    if (!container) return;
    const selected = new Set((selectedIds || []).map(Number));
    if (!projects.length) {
      container.innerHTML = '<span style="color:#6b7280;font-size:13px;">No projects available yet.</span>';
      return;
    }
    container.innerHTML = projects.map(project => `
      <label>
        <input type="checkbox" value="${project.id}" ${selected.has(Number(project.id)) ? "checked" : ""}>
        <span>${escapeHTML(project.name)}</span>
      </label>
    `).join("");
  }

  function selectedCheckboxIds(containerId) {
    const container = $(containerId);
    if (!container) return [];
    return [...container.querySelectorAll('input[type="checkbox"]:checked')]
      .map(input => Number(input.value))
      .filter(id => Number.isSafeInteger(id) && id > 0);
  }

  function renderUsers() {
    const body = $("usersTableBody");
    if (!body) return;
    renderProjectCheckboxes("newUserProjects");

    if (!users.length) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:#6b7280;">No project users yet.</td></tr>`;
      return;
    }

    body.replaceChildren();
    users.forEach(item => {
      const row = document.createElement("tr");
      row.dataset.userId = String(item.id);

      const assignedIds = (item.projects || []).map(p => p.id);
      const projectLabels = (item.projects || []).map(p => p.name).join(", ") || "None";

      row.innerHTML = `
        <td><strong>${escapeHTML(item.name)}</strong></td>
        <td>${escapeHTML(item.loginId)}</td>
        <td><span class="status-pill ${item.isActive ? "active" : "inactive"}">${item.isActive ? "Active" : "Inactive"}</span></td>
        <td>
          <div style="margin-bottom:8px;font-size:12px;color:#6b7280;">${escapeHTML(projectLabels)}</div>
          <div class="checkbox-list" data-user-projects="${item.id}"></div>
        </td>
        <td>
          <div class="users-actions">
            <button class="btn btn-light" type="button" data-action="toggle-user" data-user-id="${item.id}" data-active="${item.isActive ? "1" : "0"}">
              ${item.isActive ? "Deactivate" : "Activate"}
            </button>
            <button class="btn btn-light" type="button" data-action="reset-password" data-user-id="${item.id}">Reset Password</button>
            <button class="btn btn-primary" type="button" data-action="save-user-projects" data-user-id="${item.id}">Save Projects</button>
          </div>
        </td>
      `;
      body.appendChild(row);

      const checkboxHost = row.querySelector(`[data-user-projects="${item.id}"]`);
      if (checkboxHost) {
        if (!projects.length) {
          checkboxHost.innerHTML = '<span style="color:#6b7280;font-size:12px;">No projects yet.</span>';
        } else {
          const selected = new Set(assignedIds.map(Number));
          checkboxHost.innerHTML = projects.map(project => `
            <label>
              <input type="checkbox" value="${project.id}" ${selected.has(Number(project.id)) ? "checked" : ""}>
              <span>${escapeHTML(project.name)}</span>
            </label>
          `).join("");
        }
      }
    });
  }

  async function loadUsers() {
    const result = await api("/api/users");
    users = result.users || [];
  }

  async function createUser() {
    const name = $("newUserName").value.trim();
    const loginId = $("newUserLoginId").value.trim();
    const password = $("newUserPassword").value;
    const projectIds = selectedCheckboxIds("newUserProjects");
    const btn = $("createUserBtn");

    if (!name || !loginId || !password) {
      showToast("Name, Login ID, and password are required.");
      return;
    }

    btn.disabled = true;
    showLoading("Creating user...");
    try {
      await api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, loginId, password, projectIds })
      });
      $("newUserName").value = "";
      $("newUserLoginId").value = "";
      $("newUserPassword").value = "";
      await loadUsers();
      renderUsers();
      showToast("User created.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
      btn.disabled = false;
    }
  }

  async function toggleActive(userId, currentlyActive) {
    showLoading(currentlyActive ? "Deactivating user..." : "Activating user...");
    try {
      const result = await api(`/api/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentlyActive })
      });
      users = result.users || users;
      renderUsers();
      showToast(currentlyActive ? "User deactivated." : "User activated.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
    }
  }

  async function resetPassword(userId) {
    const password = window.prompt("Enter a new password (8–128 characters):");
    if (password == null) return;
    if (!password) {
      showToast("Password is required.");
      return;
    }
    showLoading("Resetting password...");
    try {
      await api(`/api/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      showToast("Password reset.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
    }
  }

  async function assignProjects(userId, projectIds) {
    showLoading("Saving project assignments...");
    try {
      const result = await api(`/api/users/${userId}/projects`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds })
      });
      users = result.users || users;
      renderUsers();
      showToast("Project assignments saved.");
    } catch (err) {
      showToast(err.message);
    } finally {
      hideLoading();
    }
  }

  async function loadGoogleStatus() {
    if (!isAdmin()) return;
    try {
      const status = await api("/api/google/status");
      googleConnected = Boolean(status.connected);
      googleEmail = status.email || null;
      updateGoogleConnectionStatus();
    } catch {
      updateGoogleConnectionStatus();
    }
  }

  async function loadSpreadsheets() {
    const select = $("spreadsheetSelect");
    const tabSelect = $("sheetSelect");
    if (!select || !tabSelect) return;
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
    const syncAll = $("syncAllBtn");
    if (syncAll) syncAll.disabled = disabled;
    const detailSync = $("detailSyncBtn");
    if (detailSync) detailSync.disabled = disabled;
  }

  async function syncAllSheets() {
    if (syncing || !isAdmin()) return;
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
    if (!currentProjectId || syncing || !isAdmin()) return;
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
    if (!currentProjectId || !isAdmin()) return;
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
    if (!isAdmin() && (viewName === "connections" || viewName === "users")) {
      showView("dashboard");
      return;
    }

    if (viewName !== "projectDetail") currentProjectId = null;

    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    const target = $(`${viewName}View`);
    if (target) target.classList.add("active");

    document.querySelectorAll(".nav-item[data-view]").forEach(item => item.classList.remove("active"));
    if (element) {
      element.classList.add("active");
    } else {
      const nav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
      if (nav) nav.classList.add("active");
    }

    if (VIEW_TITLES[viewName]) {
      $("pageTitle").textContent = VIEW_TITLES[viewName][0];
      $("pageSubtitle").textContent = VIEW_TITLES[viewName][1];
    }

    if (viewName === "dashboard") loadDashboard();
    if (viewName === "projects") renderProjectsGrid("allProjects");
    if (viewName === "connections") {
      renderConnections();
      loadGoogleStatus();
      loadSpreadsheets();
    }
    if (viewName === "users") {
      loadUsers()
        .then(() => renderUsers())
        .catch(err => showToast(err.message));
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
    if (!isAdmin()) return;
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
    if (!isAdmin()) return;
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

  async function passwordLogin() {
    if (loginSubmitStarted) return;
    loginSubmitStarted = true;
    const btn = $("loginSubmitBtn");
    if (btn) btn.disabled = true;
    setLoginError("");

    const loginId = $("loginIdInput").value.trim();
    const password = $("loginPasswordInput").value;

    if (!loginId || !password) {
      setLoginError("Enter your Login ID and password.");
      loginSubmitStarted = false;
      if (btn) btn.disabled = false;
      return;
    }

    showLoading("Signing in...");
    try {
      await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password })
      });
      $("loginPasswordInput").value = "";
      const auth = await api("/api/auth/me");
      if (!auth.authenticated) throw new Error("Login succeeded but session was not established.");
      await enterApp(auth);
    } catch (err) {
      setLoginError(err.message);
      showToast(err.message);
      loginSubmitStarted = false;
      if (btn) btn.disabled = false;
    } finally {
      hideLoading();
    }
  }

  function googleConnect() {
    if (!isAdmin()) return;
    if (googleConnectStarted) return;
    googleConnectStarted = true;
    const btn = $("googleConnectBtn");
    if (btn) btn.disabled = true;
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

  async function enterApp(auth) {
    user = auth.user;
    googleConnected = Boolean(auth.googleConnected);
    googleEmail = auth.googleEmail || null;
    ({ csrfToken } = await api("/api/csrf"));
    await getProjects();
    setUserUI();

    $("loginScreen").style.display = "none";
    $("app").style.display = "block";

    await warmLeadsCache();
    loadDashboard();
  }

  function bindUi() {
    if (uiBound) return;
    uiBound = true;

    const on = (id, event, handler) => {
      const node = $(id);
      if (node) node.addEventListener(event, handler);
    };

    on("loginSubmitBtn", "click", () => { passwordLogin(); });
    on("leadDetailCloseBtn", "click", closeLeadDetail);
    const leadOverlay = $("leadDetailOverlay");
    if (leadOverlay) {
      leadOverlay.addEventListener("click", event => {
        if (event.target === leadOverlay) closeLeadDetail();
      });
    }
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeLeadDetail();
        closeGlobalSearchResults();
      }
    });
    on("loginForm", "submit", event => {
      event.preventDefault();
      passwordLogin();
    });
    on("loginIdInput", "keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        passwordLogin();
      }
    });
    on("loginPasswordInput", "keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        passwordLogin();
      }
    });
    on("googleConnectBtn", "click", googleConnect);
    on("mobileMenuBtn", "click", toggleSidebar);
    on("syncAllBtn", "click", () => { syncAllSheets(); });
    on("addProjectFromDashboardBtn", "click", () => showView("connections"));
    on("backToProjectsBtn", "click", () => showView("projects"));
    on("detailSyncBtn", "click", () => { syncCurrentProject(); });
    on("detailRefreshBtn", "click", () => { refreshCurrentProject(); });
    on("addStatusColumnBtn", "click", () => { addLeadStatusColumn(); });
    on("leadSearch", "input", filterLeads);
    on("statusFilter", "change", filterLeads);
    on("sourceFilter", "change", filterLeads);
    on("clearFiltersBtn", "click", clearFilters);
    on("allLeadSearch", "input", filterAllLeads);
    on("allProjectFilter", "change", filterAllLeads);
    on("allStatusFilter", "change", filterAllLeads);
    on("globalLeadSearchBtn", "click", () => { runGlobalLeadSearch(); });
    on("globalLeadSearchInput", "keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        runGlobalLeadSearch();
      }
      if (event.key === "Escape") closeGlobalSearchResults();
    });
    on("saveProjectBtn", "click", () => { saveProjectConnection(); });
    on("spreadsheetSelect", "change", onSpreadsheetChange);
    on("sheetSelect", "change", onTabChange);
    on("createUserBtn", "click", () => { createUser(); });

    document.querySelectorAll(".nav-item[data-action='nav']").forEach(item => {
      item.addEventListener("click", () => showView(item.dataset.view, item));
      item.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showView(item.dataset.view, item);
        }
      });
    });

    const logoutNav = document.querySelector(".nav-item[data-action='logout']");
    if (logoutNav) {
      logoutNav.addEventListener("click", () => { logout(); });
      logoutNav.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          logout();
        }
      });
    }

    document.addEventListener("click", event => {
      const openCard = event.target.closest("[data-action='open-project']");
      if (openCard) {
        const id = Number(openCard.dataset.projectId);
        if (id) openProject(id);
        return;
      }
      const removeBtn = event.target.closest("[data-action='remove-project']");
      if (removeBtn) {
        const id = Number(removeBtn.dataset.projectId);
        if (id) removeProject(id);
        return;
      }
      const toggleBtn = event.target.closest("[data-action='toggle-user']");
      if (toggleBtn) {
        const id = Number(toggleBtn.dataset.userId);
        const active = toggleBtn.dataset.active === "1";
        if (id) toggleActive(id, active);
        return;
      }
      const resetBtn = event.target.closest("[data-action='reset-password']");
      if (resetBtn) {
        const id = Number(resetBtn.dataset.userId);
        if (id) resetPassword(id);
        return;
      }
      const saveProjectsBtn = event.target.closest("[data-action='save-user-projects']");
      if (saveProjectsBtn) {
        const id = Number(saveProjectsBtn.dataset.userId);
        if (!id) return;
        const host = document.querySelector(`[data-user-projects="${id}"]`);
        const projectIds = host
          ? [...host.querySelectorAll('input[type="checkbox"]:checked')]
            .map(input => Number(input.value))
            .filter(value => Number.isSafeInteger(value) && value > 0)
          : [];
        assignProjects(id, projectIds);
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const openCard = event.target.closest("[data-action='open-project']");
      if (!openCard || event.target !== openCard) return;
      event.preventDefault();
      const id = Number(openCard.dataset.projectId);
      if (id) openProject(id);
    });
  }

  async function init() {
    try {
      const auth = await api("/api/auth/me");
      if (!auth.authenticated) return;
      await enterApp(auth);
    } catch (err) {
      showToast(err.message);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindUi();
    init();
  });
})();
