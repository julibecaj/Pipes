/* ═══════════════════════════════════════════════════════════════════════════
   Pipes — Frontend SPA
   Plain ES2022 JavaScript, no framework, no build step.
   Open index.html with Live Server in VS Code (port 5500).
   ═══════════════════════════════════════════════════════════════════════════ */

const API = 'http://localhost:8080/api';

/* ── State ─────────────────────────────────────────────────────────────────── */
let token       = localStorage.getItem('pipes_token') || null;
let currentUser = localStorage.getItem('pipes_user')  || null;
let editingId   = null;   // pipeline id being edited (null = create mode)
let pollTimer   = null;   // setInterval handle for run polling

/* ── Bootstrap ─────────────────────────────────────────────────────────────── */
(function init() {
  if (token) {
    showApp();
    navigate('dashboard');
  } else {
    showAuth();
  }

  // Allow Enter key on auth forms
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('reg-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doRegister();
  });
})();

/* ── Auth state ─────────────────────────────────────────────────────────────── */
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sidebar-username').textContent = currentUser || '';
  document.getElementById('user-avatar').textContent = (currentUser || 'U')[0].toUpperCase();
}

/* ── Tab switching ──────────────────────────────────────────────────────────── */
function switchTab(tab) {
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab !== 'login');
  clearError('login-error');
  clearError('register-error');
}

/* ── API helper ─────────────────────────────────────────────────────────────── */
async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res  = await fetch(`${API}${path}`, opts);
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = json?.message || json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json?.data ?? json;
}

/* ── Auth actions ───────────────────────────────────────────────────────────── */
async function doLogin() {
  clearError('login-error');
  const username = val('login-username');
  const password = val('login-password');
  if (!username || !password) return showError('login-error', 'Please fill in all fields.');

  try {
    const data = await api('POST', '/auth/login', { username, password });
    token = data.token;
    currentUser = data.username;
    localStorage.setItem('pipes_token', token);
    localStorage.setItem('pipes_user', currentUser);
    showApp();
    navigate('dashboard');
  } catch (err) {
    showError('login-error', err.message);
  }
}

async function doRegister() {
  clearError('register-error');
  const username = val('reg-username');
  const email    = val('reg-email');
  const password = val('reg-password');
  if (!username || !email || !password) return showError('register-error', 'Please fill in all fields.');
  if (password.length < 6) return showError('register-error', 'Password must be at least 6 characters.');

  try {
    await api('POST', '/auth/register', { username, email, password });
    toast('Account created! Please sign in.', 'success');
    switchTab('login');
    document.getElementById('login-username').value = username;
  } catch (err) {
    showError('register-error', err.message);
  }
}

function doLogout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('pipes_token');
  localStorage.removeItem('pipes_user');
  clearInterval(pollTimer);
  showAuth();
}

/* ── Navigation ─────────────────────────────────────────────────────────────── */
function navigate(view) {
  // Deactivate all nav links and views
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });

  // Activate the chosen view
  const viewEl = document.getElementById(`view-${view}`);
  if (viewEl) {
    viewEl.classList.remove('hidden');
    viewEl.classList.add('active');
  }

  const link = document.querySelector(`.nav-link[data-view="${view}"]`);
  if (link) link.classList.add('active');

  clearInterval(pollTimer);

  // Load data for the view
  if (view === 'dashboard') loadDashboard();
  if (view === 'pipelines') loadPipelines();
  if (view === 'runs')      loadRecentRuns();
}

/* ── Dashboard ──────────────────────────────────────────────────────────────── */
async function loadDashboard() {
  document.getElementById('dashboard-greeting').textContent = `Welcome back, ${currentUser}!`;

  try {
    const stats = await api('GET', '/runs/stats');
    document.getElementById('stat-total').textContent   = stats.totalRuns   ?? 0;
    document.getElementById('stat-success').textContent = stats.successRuns ?? 0;
    document.getElementById('stat-failed').textContent  = stats.failedRuns  ?? 0;
    document.getElementById('stat-rate').textContent    = (stats.successRate ?? 0) + '%';
  } catch (_) {
    // Stats unavailable — leave as dashes
  }

  try {
    const runs = await api('GET', '/runs/recent?limit=8');
    renderRunList('recent-runs-list', runs);
  } catch (err) {
    document.getElementById('recent-runs-list').innerHTML = emptyState('Could not load recent runs.');
  }
}

/* ── Pipelines ──────────────────────────────────────────────────────────────── */
async function loadPipelines(query) {
  const listEl = document.getElementById('pipeline-list');
  listEl.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const path = query ? `/pipelines/search?q=${encodeURIComponent(query)}` : '/pipelines';
    const pipelines = await api('GET', path);
    if (!pipelines.length) {
      listEl.innerHTML = emptyState('No pipelines yet. Create one to get started!');
      return;
    }
    listEl.innerHTML = pipelines.map(renderPipelineCard).join('');
  } catch (err) {
    listEl.innerHTML = emptyState('Could not load pipelines: ' + err.message);
  }
}

function renderPipelineCard(p) {
  const successRate = p.totalRuns > 0
    ? Math.round(p.successRuns / p.totalRuns * 100) : null;

  return `
  <div class="pipeline-card" onclick="openPipelineDetail(${p.id})">
    <div class="pipeline-card-header">
      <div class="pipeline-card-name">${esc(p.name)}</div>
      <div class="pipeline-card-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-ghost" onclick="triggerPipeline(${p.id})" title="Run">▷ Run</button>
        <button class="btn-icon" onclick="openEditModal(${p.id})" title="Edit">✎</button>
        <button class="btn-icon" onclick="deletePipeline(${p.id})" title="Delete" style="color:var(--red)">✕</button>
      </div>
    </div>
    <div class="pipeline-card-desc">${esc(p.description || 'No description')}</div>
    <div class="pipeline-card-meta">
      <span class="meta-chip">⎇ ${esc(p.targetBranch)}</span>
      <span class="meta-chip">${p.totalRuns} run${p.totalRuns !== 1 ? 's' : ''}</span>
      ${successRate !== null
        ? `<span class="meta-chip ${successRate >= 70 ? 'green' : 'red'}">${successRate}% pass</span>`
        : ''}
      <span>${timeAgo(p.updatedAt)}</span>
    </div>
  </div>`;
}

/* ── Pipeline CRUD ──────────────────────────────────────────────────────────── */
function openCreateModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'New Pipeline';
  document.getElementById('p-name').value   = '';
  document.getElementById('p-desc').value   = '';
  document.getElementById('p-branch').value = 'main';
  document.getElementById('stages-builder').innerHTML = '';
  clearError('modal-error');
  addStage(); // start with one empty stage
  document.getElementById('modal-pipeline').classList.remove('hidden');
}

async function openEditModal(id) {
  try {
    const p = await api('GET', `/pipelines/${id}`);
    editingId = id;
    document.getElementById('modal-title').textContent = 'Edit Pipeline';
    document.getElementById('p-name').value   = p.name;
    document.getElementById('p-desc').value   = p.description || '';
    document.getElementById('p-branch').value = p.targetBranch || 'main';
    clearError('modal-error');

    const builder = document.getElementById('stages-builder');
    builder.innerHTML = '';
    p.stages.forEach(s => addStage(s));

    document.getElementById('modal-pipeline').classList.remove('hidden');
  } catch (err) {
    toast('Could not load pipeline: ' + err.message, 'error');
  }
}

function closePipelineModal() {
  document.getElementById('modal-pipeline').classList.add('hidden');
}

function closeModal(event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.classList.add('hidden');
  }
}

/* ── Stages / Jobs Builder ──────────────────────────────────────────────────── */
let stageCounter = 0;

function addStage(existing) {
  const id = `stage-${stageCounter++}`;
  const name = existing?.name || `Stage ${stageCounter}`;

  const el = document.createElement('div');
  el.className = 'stage-builder';
  el.id = id;
  el.innerHTML = `
    <div class="stage-builder-header">
      <input type="text" class="stage-name" value="${esc(name)}" placeholder="Stage name" />
      <button class="btn-icon" onclick="removeStage('${id}')" title="Remove stage" style="color:var(--red)">✕</button>
    </div>
    <div class="stage-builder-body" id="${id}-jobs"></div>
    <div style="padding:0 0.75rem 0.75rem">
      <button class="add-job-btn" onclick="addJob('${id}-jobs')">+ Add Job</button>
    </div>`;

  document.getElementById('stages-builder').appendChild(el);

  if (existing?.jobs?.length) {
    existing.jobs.forEach(j => addJob(`${id}-jobs`, j));
  } else {
    addJob(`${id}-jobs`);
  }
}

function removeStage(id) {
  document.getElementById(id)?.remove();
}

let jobCounter = 0;

function addJob(containerId, existing) {
  const jobId = `job-${jobCounter++}`;
  const el = document.createElement('div');
  el.className = 'job-builder';
  el.id = jobId;
  el.innerHTML = `
    <input type="text" class="job-name" placeholder="Job name" value="${esc(existing?.name || '')}" />
    <input type="text" class="job-cmd"  placeholder="Command" value="${esc(existing?.command || '')}" style="font-family:var(--mono)" />
    <input type="number" class="job-timeout" placeholder="60s" value="${existing?.timeoutSeconds || 60}" min="1" max="3600" style="width:60px" />
    <button class="btn-icon" onclick="document.getElementById('${jobId}').remove()" style="color:var(--red)">✕</button>`;
  document.getElementById(containerId).appendChild(el);
}

function collectPipelineForm() {
  const name   = val('p-name');
  const desc   = val('p-desc');
  const branch = val('p-branch') || 'main';
  if (!name) { showError('modal-error', 'Pipeline name is required.'); return null; }

  const stageEls = document.querySelectorAll('.stage-builder');
  const stages = [];
  for (const stageEl of stageEls) {
    const stageName = stageEl.querySelector('.stage-name')?.value.trim();
    if (!stageName) { showError('modal-error', 'All stages must have a name.'); return null; }

    const jobEls = stageEl.querySelectorAll('.job-builder');
    const jobs = [];
    for (const jobEl of jobEls) {
      const jName = jobEl.querySelector('.job-name')?.value.trim();
      const jCmd  = jobEl.querySelector('.job-cmd')?.value.trim();
      const jTime = parseInt(jobEl.querySelector('.job-timeout')?.value) || 60;
      if (!jName || !jCmd) { showError('modal-error', 'All jobs must have a name and command.'); return null; }
      jobs.push({ name: jName, command: jCmd, timeoutSeconds: jTime });
    }
    if (!jobs.length) { showError('modal-error', `Stage "${stageName}" must have at least one job.`); return null; }
    stages.push({ name: stageName, jobs });
  }
  if (!stages.length) { showError('modal-error', 'Add at least one stage.'); return null; }

  return { name, description: desc, targetBranch: branch, stages };
}

async function savePipeline() {
  clearError('modal-error');
  const body = collectPipelineForm();
  if (!body) return;

  try {
    if (editingId) {
      await api('PUT', `/pipelines/${editingId}`, body);
      toast('Pipeline updated!', 'success');
    } else {
      await api('POST', '/pipelines', body);
      toast('Pipeline created!', 'success');
    }
    closePipelineModal();
    loadPipelines();
  } catch (err) {
    showError('modal-error', err.message);
  }
}

async function deletePipeline(id) {
  if (!confirm('Delete this pipeline and all its runs?')) return;
  try {
    await api('DELETE', `/pipelines/${id}`);
    toast('Pipeline deleted.', 'info');
    loadPipelines();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'error');
  }
}

/* ── Run a pipeline ─────────────────────────────────────────────────────────── */
async function triggerPipeline(id) {
  try {
    const run = await api('POST', `/pipelines/${id}/runs`);
    toast('Pipeline triggered! Run #' + run.id, 'success');
    loadPipelines();
    loadDashboard();
    // If on dashboard, refresh
    if (document.getElementById('view-dashboard').classList.contains('active')) {
      setTimeout(loadDashboard, 1000);
    }
    openRunDetail(run.id);
  } catch (err) {
    toast('Trigger failed: ' + err.message, 'error');
  }
}

/* ── Pipeline Detail (opens run list for a pipeline) ─────────────────────────── */
async function openPipelineDetail(pipelineId) {
  // Navigate to runs view filtered by this pipeline
  navigate('runs');
  const listEl = document.getElementById('all-runs-list');
  listEl.innerHTML = '<div class="empty-state">Loading runs…</div>';
  try {
    const runs = await api('GET', `/pipelines/${pipelineId}/runs`);
    if (!runs.length) {
      listEl.innerHTML = emptyState('No runs yet. Trigger the pipeline to start.');
      return;
    }
    renderRunList('all-runs-list', runs);

    // Start polling if any run is active
    if (runs.some(r => r.status === 'RUNNING' || r.status === 'PENDING')) {
      startPollingPipelineRuns(pipelineId);
    }
  } catch (err) {
    listEl.innerHTML = emptyState('Could not load runs: ' + err.message);
  }
}

/* ── Recent Runs view ───────────────────────────────────────────────────────── */
async function loadRecentRuns() {
  const listEl = document.getElementById('all-runs-list');
  listEl.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const runs = await api('GET', '/runs/recent?limit=30');
    if (!runs.length) {
      listEl.innerHTML = emptyState('No runs yet. Trigger a pipeline to get started!');
      return;
    }
    renderRunList('all-runs-list', runs);
  } catch (err) {
    listEl.innerHTML = emptyState('Could not load runs: ' + err.message);
  }
}

function renderRunList(containerId, runs) {
  if (!runs.length) {
    document.getElementById(containerId).innerHTML = emptyState('No runs to display.');
    return;
  }

  document.getElementById(containerId).innerHTML = runs.map(r => `
    <div class="run-row" onclick="openRunDetail(${r.id})">
      <div class="run-status-dot dot-${r.status}"></div>
      <div class="run-info">
        <div class="run-pipeline-name">${esc(r.pipelineName)} <span style="color:var(--text-3);font-weight:400">#${r.id}</span></div>
        <div class="run-meta">${timeAgo(r.startedAt)} · ${r.finishedAt ? duration(r.startedAt, r.finishedAt) : 'running…'}</div>
      </div>

      <div style="display:flex;align-items:center;gap:0.5rem" onclick="event.stopPropagation()">
        <span class="status-badge badge-${r.status}">${r.status}</span>

        ${['PENDING', 'RUNNING'].includes(r.status)
          ? `<button class="btn btn-sm btn-ghost" onclick="cancelRun(${r.id})">Stop</button>`
          : ''}

        <button class="btn btn-sm btn-ghost" onclick="deleteRun(${r.id})" style="color:var(--red)">Delete</button>
      </div>
    </div>`).join('');
}

async function cancelRun(id) {
  if (!confirm(`Stop run #${id}?`)) return;

  try {
    await api('POST', `/runs/${id}/cancel`);
    toast('Run cancelled.', 'info');
    loadRecentRuns();
    loadDashboard();
  } catch (err) {
    toast('Cancel failed: ' + err.message, 'error');
  }
}

async function deleteRun(id) {
  if (!confirm(`Delete run #${id}?`)) return;

  try {
    await api('DELETE', `/runs/${id}`);
    toast('Run deleted.', 'info');
    loadRecentRuns();
    loadDashboard();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'error');
  }
}

/* ── Run Detail ─────────────────────────────────────────────────────────────── */
async function openRunDetail(runId) {
  navigate('run-detail');

  document.getElementById('run-detail-title').textContent   = `Run #${runId}`;
  document.getElementById('run-detail-pipeline').textContent = 'Loading…';
  document.getElementById('run-detail-badge').textContent    = '…';
  document.getElementById('run-stage-list').innerHTML        = '';
  document.getElementById('run-log').textContent             = 'Loading…';

  await refreshRunDetail(runId);

  // Poll every 2s while the run is active
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const done = await refreshRunDetail(runId);
    if (done) clearInterval(pollTimer);
  }, 2000);
}

async function refreshRunDetail(runId) {
  try {
    const run = await api('GET', `/runs/${runId}`);

    document.getElementById('run-detail-title').textContent   = `Run #${run.id}`;
    document.getElementById('run-detail-pipeline').textContent = run.pipelineName;

    const badge = document.getElementById('run-detail-badge');
    badge.textContent  = run.status;
    badge.className    = `status-badge badge-${run.status}`;

    document.getElementById('run-log').textContent = run.log || '(no log yet)';

    // Render stages
    const stagesEl = document.getElementById('run-stage-list');
    stagesEl.innerHTML = run.stageResults.map(sr => renderStageBlock(sr)).join('');

    return ['SUCCESS', 'FAILED', 'CANCELLED'].includes(run.status);
  } catch (err) {
    document.getElementById('run-log').textContent = 'Error loading run: ' + err.message;
    return true;
  }
}

function renderStageBlock(sr) {
  const jobs = sr.jobResults.map(jr => `
    <div class="job-block">
      <div class="job-block-header" onclick="toggleJobOutput(this)">
        <div>
          <div class="job-block-name">
            <span class="run-status-dot dot-${jr.status}" style="display:inline-block;margin-right:6px;vertical-align:middle"></span>
            ${esc(jr.jobName)}
          </div>
          <div class="job-block-cmd">$ ${esc(jr.command)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem">
          ${jr.exitCode !== null ? `<code style="font-size:0.75rem;color:var(--text-3)">exit ${jr.exitCode}</code>` : ''}
          <span class="status-badge badge-${jr.status}">${jr.status}</span>
        </div>
      </div>
      <pre class="job-output">${esc(jr.output || '(no output yet)')}</pre>
    </div>`).join('');

  return `
    <div class="stage-block">
      <div class="stage-block-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? '' : 'none'">
        <div>
          <div class="stage-block-name">
            <span class="run-status-dot dot-${sr.status}" style="display:inline-block;margin-right:8px;vertical-align:middle"></span>
            ${esc(sr.stageName)}
          </div>
          <div class="stage-block-meta">
            ${sr.finishedAt ? duration(sr.startedAt, sr.finishedAt) : sr.status === 'RUNNING' ? 'running…' : sr.status}
          </div>
        </div>
        <span class="status-badge badge-${sr.status}">${sr.status}</span>
      </div>
      <div class="job-list">${jobs}</div>
    </div>`;
}

function toggleJobOutput(header) {
  const pre = header.nextElementSibling;
  pre.classList.toggle('open');
}

/* ── Polling helpers ─────────────────────────────────────────────────────────── */
function startPollingPipelineRuns(pipelineId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const runs = await api('GET', `/pipelines/${pipelineId}/runs`);
      renderRunList('all-runs-list', runs);
      if (!runs.some(r => r.status === 'RUNNING' || r.status === 'PENDING')) {
        clearInterval(pollTimer);
      }
    } catch (_) { clearInterval(pollTimer); }
  }, 2500);
}

/* ── Search (debounced) ──────────────────────────────────────────────────────── */
let searchTimer;
function debouncedSearch(q) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPipelines(q.trim() || undefined), 300);
}

/* ── Utilities ──────────────────────────────────────────────────────────────── */
function val(id)  { return document.getElementById(id)?.value.trim() || ''; }
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

function emptyState(msg) {
  return `<div class="empty-state"><p>${esc(msg)}</p></div>`;
}

function toast(message, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function duration(start, end) {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s  = Math.floor(ms / 1000);
  if (s < 60)  return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
