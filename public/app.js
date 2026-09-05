(() => {
  "use strict";
  const $ = s => document.querySelector(s), app = $("#app"), login = $("#login"), logout = $("#logout"), status = $("#status");
  let csrfToken, projects = [], active;
  const STATUS_OPTIONS = ["New", "Contacted", "Interested", "Follow Up", "Site Visit", "Converted", "Not Interested", "Lost"];
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "ariaLabel") n.setAttribute("aria-label", v);
      else if (k === "ariaModal") n.setAttribute("aria-modal", v);
      else if (k === "ariaLabelledby") n.setAttribute("aria-labelledby", v);
      else if (k === "dataset") Object.entries(v).forEach(([dk, dv]) => { n.dataset[dk] = dv; });
      else n[k] = v;
    });
    children.forEach(c => n.append(c));
    return n;
  };
  const note = (text, className = "") => el("p", { textContent: text, className });
  const statusColumn = columns => columns.find(c => String(c).trim().toLowerCase() === "lead status") || null;
  const statusValue = (lead, column) => String(lead?.[column] ?? "").trim() || "New";
  const when = value => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not refreshed yet";

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrfToken && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method)) headers.set("X-CSRF-Token", csrfToken);
    const res = await fetch(path, { ...options, headers, credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function getProjects() { ({ projects } = await api("/api/projects")); }
  function back() {
    const b = el("button", { className: "quiet", type: "button", textContent: "← Back to Projects" });
    b.onclick = projectsView;
    return b;
  }

  function projectsView(error) {
    active = null;
    app.replaceChildren();
    const add = el("button", { className: "primary", type: "button", textContent: "Add Project" });
    add.onclick = projectDialog;
    app.append(el("div", { className: "toolbar" }, [
      el("div", {}, [el("div", {}, [el("h2", { textContent: "Projects" }), note("Connect a spreadsheet tab to view its live leads.", "subtle")])]),
      add
    ]));
    if (error) app.append(note(error, "error"));
    if (!projects.length) {
      return app.append(el("section", { className: "panel empty" }, [
        note("No projects yet."),
        note("Add a project to connect a Google Spreadsheet tab.")
      ]));
    }
    const grid = el("section", { className: "project-grid", ariaLabel: "Configured projects" });
    projects.forEach(p => {
      const card = el("button", { className: "project-card", type: "button" }, [
        el("h3", { textContent: p.name }),
        note(p.spreadsheetName || p.spreadsheetId),
        note(`Tab: ${p.sheetName}`)
      ]);
      card.onclick = () => openProject(p);
      grid.append(card);
    });
    app.append(grid);
  }

  async function openProject(project) {
    app.replaceChildren(el("section", { className: "panel empty" }, [note("Loading the latest Google Sheet data…")]));
    try {
      active = await api(`/api/projects/${project.id}/leads`);
      projectView();
    } catch (e) {
      projectError(e.message);
    }
  }

  function projectError(message) {
    app.replaceChildren(el("section", { className: "panel" }, [back(), note(message, "error")]));
  }

  function summary(columns, leads) {
    const column = statusColumn(columns);
    const counts = new Map();
    if (column) {
      leads.forEach(lead => {
        const name = statusValue(lead, column);
        counts.set(name, (counts.get(name) || 0) + 1);
      });
    }
    return {
      column,
      statuses: [...counts.entries()]
        .map(([name, count]) => ({ name, count, percentage: leads.length ? count / leads.length * 100 : 0 }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    };
  }

  function card(name, count, percentage, primary) {
    return el("article", { className: `metric${primary ? " metric-primary" : ""}` }, [
      el("span", { textContent: name }),
      el("strong", { textContent: String(count) }),
      note(percentage === null ? "All valid lead rows" : `${percentage.toFixed(1)}% of total`, "subtle")
    ]);
  }

  function distribution(items) {
    const section = el("section", { className: "distribution", ariaLabel: "Lead Status distribution" }, [
      el("h3", { textContent: "Lead Status distribution" })
    ]);
    items.forEach(i => section.append(el("div", { className: "distribution-row" }, [
      el("div", { className: "distribution-label", textContent: i.name }),
      el("div", { className: "distribution-track" }, [el("div", { className: "distribution-bar", style: `width:${i.percentage}%` })]),
      el("div", { className: "distribution-value", textContent: `${i.count} (${i.percentage.toFixed(1)}%)` })
    ])));
    return section;
  }

  async function addLeadStatusColumn() {
    const button = app.querySelector("[data-action='add-status-column']");
    if (button) {
      button.disabled = true;
      button.textContent = "Adding column…";
    }
    try {
      const result = await api(`/api/projects/${active.id}/lead-status-column`, { method: "POST" });
      active = result.project;
      projectView();
    } catch (e) {
      projectError(e.message);
    }
  }

  function projectView() {
    app.replaceChildren();
    const { columns, leads, name, spreadsheetName, sheetName, lastSync } = active;
    const data = summary(columns, leads);
    const refresh = el("button", { className: "secondary", type: "button", textContent: "Refresh" });
    refresh.onclick = async () => {
      refresh.disabled = true;
      refresh.textContent = "Refreshing…";
      try {
        active = await api(`/api/projects/${active.id}/leads`);
        projectView();
      } catch (e) {
        projectError(e.message);
      }
    };
    const header = el("section", { className: "project-header panel" }, [
      el("div", {}, [
        el("h2", { textContent: name }),
        note(`Spreadsheet: ${spreadsheetName || "Google Spreadsheet"}`),
        note(`Sheet/Tab: ${sheetName}`),
        note(`Last refreshed: ${when(lastSync)}`, "subtle")
      ]),
      el("div", { className: "header-actions" }, [back(), refresh])
    ]);
    const cards = el("section", { className: "metrics", ariaLabel: "Lead status summary" }, [
      card("Total Leads", leads.length, null, true)
    ]);
    data.statuses.forEach(i => cards.append(card(i.name, i.count, i.percentage)));

    let statusSection;
    if (data.column) {
      statusSection = distribution(data.statuses);
    } else {
      const addColumn = el("button", {
        className: "primary",
        type: "button",
        textContent: "Add Lead Status column",
        dataset: { action: "add-status-column" }
      });
      addColumn.onclick = addLeadStatusColumn;
      statusSection = el("section", { className: "status-warning" }, [
        el("h3", { textContent: "Lead Status distribution" }),
        note("Lead Status column not found", "error"),
        note("Add a Lead Status column at the end of this sheet to track and edit statuses. Existing lead rows will default to New.", "subtle"),
        addColumn
      ]);
    }

    app.append(
      header,
      el("section", { className: "dashboard-summary" }, [el("h2", { textContent: "Lead Summary" }), cards]),
      statusSection,
      leadControls()
    );
  }

  function leadControls() {
    const section = el("section", { className: "panel lead-data" }, [el("h2", { textContent: "Leads" })]);
    const search = el("input", { type: "search", placeholder: "Search all lead data", ariaLabel: "Search all lead data" });
    const filter = el("select", { ariaLabel: "Filter by Lead Status" }, [
      el("option", { value: "", textContent: "All Lead Statuses" })
    ]);
    const clear = el("button", { className: "quiet", type: "button", textContent: "Clear Filters" });
    const feedback = el("p", { className: "notice", role: "status" });
    const target = el("div");

    const syncFilterOptions = selected => {
      const data = summary(active.columns, active.leads);
      filter.disabled = !data.column;
      filter.replaceChildren(el("option", { value: "", textContent: "All Lead Statuses" }));
      data.statuses.forEach(i => filter.append(el("option", { value: i.name, textContent: i.name })));
      if (selected && [...filter.options].some(option => option.value === selected)) filter.value = selected;
      else filter.value = "";
      return data;
    };

    const update = () => {
      const data = syncFilterOptions(filter.value);
      renderTable(
        target,
        active.columns,
        active.leads,
        data.column,
        search.value,
        filter.value,
        active.rowNumbers || [],
        feedback,
        () => {
          rebuildSummary(summary(active.columns, active.leads));
          update();
        }
      );
    };

    search.oninput = update;
    filter.onchange = update;
    clear.onclick = () => {
      search.value = "";
      filter.value = "";
      feedback.textContent = "";
      update();
    };
    section.append(el("div", { className: "toolbar lead-controls" }, [el("div", {}, [search, filter, clear])]), feedback, target);
    update();
    return section;
  }

  function rebuildSummary(data) {
    const summaryRoot = app.querySelector(".dashboard-summary");
    const distributionRoot = app.querySelector(".distribution, .status-warning");
    if (!summaryRoot) return;
    const cards = el("section", { className: "metrics", ariaLabel: "Lead status summary" }, [
      card("Total Leads", active.leads.length, null, true)
    ]);
    data.statuses.forEach(i => cards.append(card(i.name, i.count, i.percentage)));
    summaryRoot.replaceChildren(el("h2", { textContent: "Lead Summary" }), cards);
    if (distributionRoot && data.column) {
      distributionRoot.replaceWith(distribution(data.statuses));
    }
  }

  function renderTable(target, columns, leads, column, search, selected, rowNumbers, feedback, onStatusChanged) {
    target.replaceChildren();
    if (!columns.length) return target.append(el("div", { className: "empty", textContent: "This sheet has no header row." }));
    if (!leads.length) return target.append(el("div", { className: "empty", textContent: "No leads found in this sheet." }));

    const needle = search.trim().toLowerCase();
    const indexed = leads.map((lead, index) => ({ lead, rowNumber: rowNumbers[index], index }))
      .filter(({ lead }) => (!selected || statusValue(lead, column) === selected)
        && (!needle || columns.some(key => {
          const value = column && key === column ? statusValue(lead, column) : String(lead[key] ?? "");
          return value.toLowerCase().includes(needle);
        })));

    if (!indexed.length) return target.append(el("div", { className: "empty", textContent: "No leads match the current filters." }));

    const tr = el("tr");
    const body = el("tbody");
    columns.forEach(key => tr.append(el("th", { scope: "col", textContent: key })));

    indexed.forEach(({ lead, rowNumber }) => {
      const row = el("tr");
      columns.forEach(key => {
        if (column && key === column) {
          row.append(el("td", {}, [statusSelect(lead, column, rowNumber, row, feedback, onStatusChanged)]));
        } else {
          row.append(el("td", { textContent: String(lead[key] ?? "") }));
        }
      });
      body.append(row);
    });

    target.append(
      note(`Showing ${indexed.length} of ${leads.length} leads`, "subtle"),
      el("div", { className: "table-wrap" }, [el("table", {}, [el("thead", {}, [tr]), body])])
    );
  }

  function statusSelect(lead, column, rowNumber, row, feedback, onStatusChanged) {
    const previous = statusValue(lead, column);
    const select = el("select", {
      ariaLabel: "Lead Status",
      value: previous,
      disabled: !rowNumber
    });
    const optionValues = new Set(STATUS_OPTIONS);
    optionValues.add(previous);
    [...optionValues].forEach(value => select.append(el("option", { value, textContent: value })));
    select.value = previous;

    select.onchange = async () => {
      const nextStatus = select.value;
      if (nextStatus === previous) return;
      select.disabled = true;
      row.classList.add("row-updating");
      feedback.textContent = "Saving Lead Status…";
      feedback.className = "notice";
      try {
        const result = await api(`/api/projects/${active.id}/leads/${rowNumber}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus })
        });
        active = result.project;
        feedback.textContent = `Lead Status saved as ${nextStatus}.`;
        feedback.className = "notice";
        row.classList.remove("row-updating");
        select.disabled = false;
        onStatusChanged();
      } catch (e) {
        select.value = previous;
        feedback.textContent = e.message;
        feedback.className = "error";
        row.classList.remove("row-updating");
        select.disabled = false;
      }
    };
    return select;
  }

  async function projectDialog() {
    const shade = el("div", { className: "modal-backdrop" });
    const dialog = el("section", { className: "modal", role: "dialog", ariaModal: "true", ariaLabelledby: "dialog-title" });
    shade.append(dialog);
    document.body.append(shade);
    const close = () => shade.remove();
    const error = el("div");
    const search = el("input", { type: "search", placeholder: "Search spreadsheets", ariaLabel: "Search available spreadsheets" });
    const list = el("div", { className: "choice-list", ariaLabel: "Available Google Spreadsheets" });
    const tabs = el("select", { disabled: true });
    const name = el("input", { type: "text", maxLength: 120, placeholder: "Project name", required: true });
    const save = el("button", { className: "primary", type: "submit", textContent: "Save Project", disabled: true });
    const form = el("form", {}, [el("div", { className: "form-actions" }, [
      el("button", { className: "quiet", type: "button", textContent: "Cancel" }),
      save
    ])]);
    dialog.append(
      el("div", { className: "modal-head" }, [
        el("div", {}, [
          el("h2", { id: "dialog-title", textContent: "Connect Google Sheet" }),
          note("Select a spreadsheet and one of its tabs.", "subtle")
        ]),
        el("button", { className: "quiet", type: "button", textContent: "Close" })
      ]),
      el("label", { textContent: "Google Spreadsheet" }),
      search,
      list,
      el("label", { textContent: "Sheet tab" }),
      tabs,
      el("label", { textContent: "Project Name" }),
      name,
      error,
      form
    );
    dialog.querySelector(".modal-head button").onclick = close;
    form.querySelector(".quiet").onclick = close;
    let sheets = [], selectedSheet, selectedTab;
    const ready = () => { save.disabled = !(selectedSheet && selectedTab && name.value.trim()); };
    const draw = () => {
      list.replaceChildren();
      sheets.filter(s => s.name.toLowerCase().includes(search.value.toLowerCase())).forEach(s => {
        const b = el("button", {
          className: "choice",
          type: "button",
          ariaPressed: String(selectedSheet?.id === s.id),
          textContent: s.name || "Untitled spreadsheet"
        });
        b.onclick = () => choose(s);
        list.append(b);
      });
      if (!list.children.length) list.append(el("p", { className: "empty", textContent: "No spreadsheets found." }));
    };
    async function choose(sheet) {
      selectedSheet = sheet;
      selectedTab = null;
      ready();
      tabs.replaceChildren(el("option", { textContent: "Loading tabs…" }));
      tabs.disabled = true;
      draw();
      try {
        const result = await api(`/api/sheets/${encodeURIComponent(sheet.id)}/tabs`);
        tabs.replaceChildren(el("option", { value: "", textContent: "Select a tab" }));
        result.tabs.forEach(tab => tabs.append(el("option", { value: String(tab.sheetId), textContent: tab.title })));
        tabs.disabled = false;
        name.value = name.value || sheet.name || "";
      } catch (e) {
        error.replaceChildren(note(e.message, "error"));
      }
    }
    search.oninput = draw;
    tabs.onchange = () => {
      selectedTab = tabs.value ? { sheetId: Number(tabs.value), sheetTitle: tabs.selectedOptions[0].textContent } : null;
      ready();
    };
    name.oninput = ready;
    form.onsubmit = async event => {
      event.preventDefault();
      save.disabled = true;
      save.textContent = "Saving…";
      error.replaceChildren();
      try {
        await api("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.value, spreadsheetId: selectedSheet.id, ...selectedTab })
        });
        await getProjects();
        close();
        projectsView();
      } catch (e) {
        error.replaceChildren(note(e.message, "error"));
        save.textContent = "Save Project";
        ready();
      }
    };
    try {
      list.append(el("p", { className: "empty", textContent: "Loading accessible spreadsheets…" }));
      ({ spreadsheets: sheets } = await api("/api/sheets"));
      draw();
      search.focus();
    } catch (e) {
      error.replaceChildren(note(e.message, "error"));
      list.replaceChildren();
    }
  }

  login.onclick = () => location.assign("/api/auth/google?returnTo=/");
  logout.onclick = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      location.assign("/");
    } catch (e) {
      status.textContent = e.message;
    }
  };

  (async () => {
    try {
      const auth = await api("/api/auth/me");
      if (!auth.authenticated) {
        status.textContent = "Sign in with the configured administrator Google account to continue.";
        return;
      }
      ({ csrfToken } = await api("/api/csrf"));
      await getProjects();
      login.hidden = true;
      logout.hidden = false;
      app.hidden = false;
      status.textContent = `Signed in as ${auth.user.email}.`;
      projectsView();
    } catch (e) {
      status.textContent = e.message;
    }
  })();
})();
