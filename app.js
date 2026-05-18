// === GTD Flow Application ===
(function() {
'use strict';

// --- Data Layer ---
const STORAGE_KEY = 'gtd_flow_data';
const SMS_SETTINGS_KEY = 'gtd_sms_settings';
const defaultData = () => ({ items: [], projects: [], reviewChecklist: {} });
const defaultSmsSettings = () => ({ apiKey: '', fromPhone: '', toPhone: '', waApiKey: '', waPhone: '', onCapture: false, onComplete: false, onDelegate: false, onCalendar: true });

function loadSmsSettings() {
    try { return JSON.parse(localStorage.getItem(SMS_SETTINGS_KEY)) || defaultSmsSettings(); }
    catch { return defaultSmsSettings(); }
}
function saveSmsSettings(s) { localStorage.setItem(SMS_SETTINGS_KEY, JSON.stringify(s)); }
let smsSettings = loadSmsSettings();

function loadData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData(); }
    catch { return defaultData(); }
}
function saveData(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

let data = loadData();
let currentView = 'inbox';
let processingItemId = null;
let editingItemId = null;
let searchQuery = '';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// --- Notifications Integration ---
async function sendNotification(message) {
    let sent = false;
    let err = null;

    // SMS via httpSMS
    if (smsSettings.apiKey && smsSettings.fromPhone && smsSettings.toPhone) {
        try {
            const resp = await fetch('https://api.httpsms.com/v1/messages/send', {
                method: 'POST',
                headers: { 'x-api-key': smsSettings.apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message, from: smsSettings.fromPhone, to: smsSettings.toPhone })
            });
            const json = await resp.json();
            if (resp.ok) { sent = true; toast('📱 SMS sent!'); }
            else { err = json.message || resp.statusText; toast('SMS failed: ' + err, 'error'); }
        } catch (e) { err = e.message; toast('SMS error: ' + err, 'error'); }
    }

    // WhatsApp via CallMeBot
    if (smsSettings.waApiKey && smsSettings.waPhone) {
        try {
            const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(smsSettings.waPhone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(smsSettings.waApiKey)}`;
            await fetch(url, { mode: 'no-cors' });
            sent = true;
            toast('💬 WhatsApp sent!');
        } catch (e) { err = e.message; toast('WhatsApp error: ' + err, 'error'); }
    }

    if (!sent && !err) {
        console.warn('Notifications not configured'); 
        return { ok: false, error: 'Notifications not configured' };
    }
    return { ok: sent, error: err };
}

function smsConfigured() { 
    const hasSms = smsSettings.apiKey && smsSettings.fromPhone && smsSettings.toPhone;
    const hasWa = smsSettings.waApiKey && smsSettings.waPhone;
    return hasSms || hasWa;
}

function buildPendingList() {
    const pending = data.items.filter(i => !i.completed);
    if (!pending.length) return 'No pending to-dos.';
    const lines = pending.slice(0, 8).map(i => {
        let line = `• ${i.title}`;
        if (i.dueDate) line += ` (Due: ${i.dueDate})`;
        if (i.delegatedTo) line += ` [→ ${i.delegatedTo}]`;
        return line;
    });
    if (pending.length > 8) lines.push(`...and ${pending.length - 8} more`);
    return lines.join('\n');
}

function buildItemDetail(item) {
    let detail = '';
    if (item.dueDate) detail += ` | Deadline: ${item.dueDate}`;
    if (item.context && item.context !== '@anywhere') detail += ` | Context: ${item.context}`;
    if (item.delegatedTo) detail += ` | Assigned to: ${item.delegatedTo}`;
    if (item.notes) detail += ` | Notes: ${item.notes.slice(0, 60)}`;
    return detail;
}

// --- Toast ---
function toast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${type === 'success' ? '✅' : '❌'}</span>${msg}`;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 2500);
}

// --- Badge Counts ---
function updateBadges() {
    const counts = { inbox: 0, next: 0, waiting: 0, calendar: 0, someday: 0, reference: 0, completed: 0 };
    data.items.forEach(i => { if (i.completed) counts.completed++; else if (counts[i.category] !== undefined) counts[i.category]++; });
    document.getElementById('inbox-count').textContent = counts.inbox;
    document.getElementById('next-count').textContent = counts.next;
    document.getElementById('waiting-count').textContent = counts.waiting;
    document.getElementById('calendar-count').textContent = counts.calendar;
    document.getElementById('someday-count').textContent = counts.someday;
    document.getElementById('reference-count').textContent = counts.reference;
    document.getElementById('completed-count').textContent = counts.completed;
    document.getElementById('projects-count').textContent = data.projects.filter(p => !p.completed).length;
}

// --- Navigation ---
const viewMeta = {
    'inbox': { title: 'Inbox', subtitle: 'Capture everything on your mind' },
    'next-actions': { title: 'Next Actions', subtitle: 'Organized by context — what you can do right now' },
    'projects': { title: 'Projects', subtitle: 'Multi-step outcomes you\'re committed to' },
    'waiting-for': { title: 'Waiting For', subtitle: 'Items delegated to others' },
    'calendar': { title: 'Calendar', subtitle: 'Date-specific actions and deadlines' },
    'someday': { title: 'Someday / Maybe', subtitle: 'Ideas to revisit when the time is right' },
    'reference': { title: 'Reference', subtitle: 'Non-actionable information for future use' },
    'weekly-review': { title: 'Weekly Review', subtitle: 'Keep your system current and complete' },
    'completed': { title: 'Completed', subtitle: 'Everything you\'ve accomplished' }
};

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        document.getElementById('view-title').textContent = viewMeta[currentView].title;
        document.getElementById('view-subtitle').textContent = viewMeta[currentView].subtitle;
        renderView();
        // Close sidebar on mobile
        document.getElementById('sidebar').classList.remove('open');
    });
});

// Mobile menu
document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// --- Capture ---
const captureInput = document.getElementById('capture-input');
const captureBtn = document.getElementById('capture-btn');

function captureItem() {
    const title = captureInput.value.trim();
    if (!title) return;
    data.items.push({
        id: genId(), title, notes: '', category: 'inbox', context: '@anywhere',
        projectId: '', energy: 'medium', timeEstimate: 30, delegatedTo: '',
        dueDate: '', dueTime: '', reminderSent: false, completed: false, createdAt: new Date().toISOString(), completedAt: null
    });
    saveData(data); captureInput.value = '';
    updateBadges(); if (currentView === 'inbox') renderView();
    toast('Captured to Inbox');
    if (smsSettings.onCapture && smsConfigured()) sendNotification(`📥 You added this to-do: "${title}"\n\nYour checklist to-do:\n${buildPendingList()}`);
}
captureBtn.addEventListener('click', captureItem);
captureInput.addEventListener('keydown', e => { if (e.key === 'Enter') captureItem(); });

// --- Search ---
document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderView();
});

// --- Render Views ---
function renderView() {
    const area = document.getElementById('content-area');
    switch (currentView) {
        case 'inbox': renderInbox(area); break;
        case 'next-actions': renderNextActions(area); break;
        case 'projects': renderProjects(area); break;
        case 'waiting-for': renderWaitingFor(area); break;
        case 'calendar': renderCalendar(area); break;
        case 'someday': renderSomeday(area); break;
        case 'reference': renderReference(area); break;
        case 'weekly-review': renderWeeklyReview(area); break;
        case 'completed': renderCompleted(area); break;
    }
}

function filterItems(category, includeCompleted = false) {
    return data.items.filter(i => {
        if (!includeCompleted && i.completed) return false;
        if (i.category !== category) return false;
        if (searchQuery && !i.title.toLowerCase().includes(searchQuery) && !i.notes.toLowerCase().includes(searchQuery)) return false;
        return true;
    });
}

function renderTaskCard(item, showProcess = false) {
    const tags = [];
    if (item.context && item.context !== '@anywhere') tags.push(`<span class="task-tag tag-context">${item.context}</span>`);
    if (item.projectId) {
        const p = data.projects.find(p => p.id === item.projectId);
        if (p) tags.push(`<span class="task-tag tag-project">${p.title}</span>`);
    }
    if (item.energy && item.category === 'next') tags.push(`<span class="task-tag tag-energy">${item.energy}</span>`);
    if (item.timeEstimate && item.category === 'next') tags.push(`<span class="task-tag tag-time">${item.timeEstimate}min</span>`);
    if (item.delegatedTo) tags.push(`<span class="task-tag tag-delegated">→ ${item.delegatedTo}</span>`);
    if (item.dueDate) {
        let tagText = `📅 ${formatDate(item.dueDate)}`;
        if (item.dueTime) tagText += ` at ${item.dueTime}`;
        tags.push(`<span class="task-tag tag-due">${tagText}</span>`);
    }

    const gcalUrl = (item.category === 'calendar' && item.dueDate) ? 
        `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.title)}&details=${encodeURIComponent(item.notes || '')}&dates=${item.dueDate.replace(/-/g, '')}${item.dueTime ? 'T' + item.dueTime.replace(/:/g, '') + '00/' + item.dueDate.replace(/-/g, '') + 'T' + item.dueTime.replace(/:/g, '') + '00' : '/' + item.dueDate.replace(/-/g, '')}` : '';

    return `<div class="task-card ${item.completed ? 'completed' : ''}" data-id="${item.id}">
        <button class="task-checkbox ${item.completed ? 'checked' : ''}" data-id="${item.id}" onclick="event.stopPropagation(); window.GTD.toggleComplete('${item.id}')">${item.completed ? '✓' : ''}</button>
        <div class="task-info" onclick="window.GTD.editItem('${item.id}')">
            <div class="task-title">${escapeHtml(item.title)}</div>
            ${tags.length ? `<div class="task-meta">${tags.join('')}</div>` : ''}
        </div>
        <div class="task-actions">
            ${showProcess ? `<button class="task-action-btn process-action" title="Process" onclick="event.stopPropagation(); window.GTD.processItem('${item.id}')">🔍</button>` : ''}
            ${gcalUrl ? `<a class="task-action-btn" title="Add to Google Calendar" href="${gcalUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="text-decoration:none">🗓️</a>` : ''}
            ${smsConfigured() ? `<button class="task-action-btn" title="Send Reminder" onclick="event.stopPropagation(); window.GTD.sendReminder('${item.id}')">📱</button>` : ''}
            <button class="task-action-btn" title="Edit" onclick="event.stopPropagation(); window.GTD.editItem('${item.id}')">✏️</button>
            <button class="task-action-btn delete-action" title="Delete" onclick="event.stopPropagation(); window.GTD.deleteItem('${item.id}')">🗑️</button>
        </div>
    </div>`;
}

function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${desc}</p></div>`;
}

function renderInbox(area) {
    const items = filterItems('inbox');
    if (!items.length) { area.innerHTML = emptyState('📥', 'Inbox is empty', 'Capture thoughts using the bar above. Everything starts here before being processed.'); return; }
    area.innerHTML = `<div class="task-list">${items.map(i => renderTaskCard(i, true)).join('')}</div>`;
}

function renderNextActions(area) {
    const items = filterItems('next');
    if (!items.length) { area.innerHTML = emptyState('⚡', 'No next actions', 'Process inbox items and defer them here to build your action list.'); return; }
    const grouped = {};
    items.forEach(i => { const ctx = i.context || '@anywhere'; if (!grouped[ctx]) grouped[ctx] = []; grouped[ctx].push(i); });
    let html = '';
    Object.keys(grouped).sort().forEach(ctx => {
        html += `<div class="context-group"><div class="context-header"><h3>${ctx}</h3><span class="count">${grouped[ctx].length}</span></div><div class="task-list">${grouped[ctx].map(i => renderTaskCard(i)).join('')}</div></div>`;
    });
    area.innerHTML = html;
}

function renderProjects(area) {
    const projects = data.projects.filter(p => !p.completed);
    let html = `<button class="add-btn" onclick="window.GTD.showProjectModal()">+ New Project</button>`;
    if (!projects.length) { html += emptyState('📂', 'No active projects', 'Projects are outcomes requiring multiple steps. Create one to start organizing.'); area.innerHTML = html; return; }
    html += '<div class="projects-grid">';
    projects.forEach(p => {
        const tasks = data.items.filter(i => i.projectId === p.id);
        const done = tasks.filter(i => i.completed).length;
        const total = tasks.length;
        const pct = total ? Math.round(done / total * 100) : 0;
        html += `<div class="project-card" data-id="${p.id}">
            <h3>${escapeHtml(p.title)}</h3>
            ${p.outcome ? `<p class="project-outcome">${escapeHtml(p.outcome)}</p>` : ''}
            <div class="project-progress"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div><span class="progress-text">${pct}%</span></div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${done}/${total} tasks completed</div>
            <div class="project-actions-bar">
                <button class="project-action-btn primary" onclick="window.GTD.addTaskToProject('${p.id}')">+ Add Task</button>
                <button class="project-action-btn" onclick="window.GTD.completeProject('${p.id}')">Complete</button>
                <button class="project-action-btn" onclick="window.GTD.deleteProject('${p.id}')">Delete</button>
            </div>
        </div>`;
    });
    html += '</div>';
    area.innerHTML = html;
}

function renderWaitingFor(area) {
    const items = filterItems('waiting');
    if (!items.length) { area.innerHTML = emptyState('⏳', 'Nothing waiting', 'Delegate tasks and track them here.'); return; }
    area.innerHTML = `<div class="task-list">${items.map(i => renderTaskCard(i)).join('')}</div>`;
}

function renderCalendar(area) {
    const items = filterItems('calendar').sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    if (!items.length) { area.innerHTML = emptyState('📅', 'No scheduled items', 'Schedule date-specific actions from your inbox.'); return; }
    // Group by date
    const grouped = {};
    items.forEach(i => { const d = i.dueDate || 'No date'; if (!grouped[d]) grouped[d] = []; grouped[d].push(i); });
    let html = '';
    Object.keys(grouped).sort().forEach(d => {
        const label = d === 'No date' ? d : formatDate(d);
        html += `<div class="context-group"><div class="context-header"><h3>📅 ${label}</h3><span class="count">${grouped[d].length}</span></div><div class="task-list">${grouped[d].map(i => renderTaskCard(i)).join('')}</div></div>`;
    });
    area.innerHTML = html;
}

function renderSomeday(area) {
    const items = filterItems('someday');
    if (!items.length) { area.innerHTML = emptyState('💭', 'Nothing here yet', 'Park ideas you might want to pursue someday.'); return; }
    area.innerHTML = `<div class="task-list">${items.map(i => renderTaskCard(i)).join('')}</div>`;
}

function renderReference(area) {
    const items = filterItems('reference');
    if (!items.length) { area.innerHTML = emptyState('📚', 'No reference items', 'Store non-actionable information here for future use.'); return; }
    area.innerHTML = `<div class="task-list">${items.map(i => renderTaskCard(i)).join('')}</div>`;
}

function renderCompleted(area) {
    const items = data.items.filter(i => i.completed).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    if (searchQuery) items.filter(i => i.title.toLowerCase().includes(searchQuery));
    if (!items.length) { area.innerHTML = emptyState('✅', 'Nothing completed yet', 'Complete tasks and they\'ll appear here.'); return; }
    area.innerHTML = `<div class="task-list">${items.map(i => renderTaskCard(i)).join('')}</div>`;
}

function renderWeeklyReview(area) {
    const inboxCount = data.items.filter(i => !i.completed && i.category === 'inbox').length;
    const nextCount = data.items.filter(i => !i.completed && i.category === 'next').length;
    const waitingCount = data.items.filter(i => !i.completed && i.category === 'waiting').length;
    const projectsCount = data.projects.filter(p => !p.completed).length;
    const completedThisWeek = data.items.filter(i => {
        if (!i.completedAt) return false;
        const d = new Date(i.completedAt);
        const now = new Date();
        return (now - d) < 7 * 24 * 60 * 60 * 1000;
    }).length;

    const checklist = [
        { id: 'collect', text: 'Collect loose papers and materials — get everything into Inbox' },
        { id: 'empty-head', text: 'Empty your head — capture any new thoughts, ideas, or tasks' },
        { id: 'process-inbox', text: `Process Inbox to zero (${inboxCount} items remaining)` },
        { id: 'review-next', text: `Review Next Actions lists (${nextCount} items)` },
        { id: 'review-projects', text: `Review active Projects (${projectsCount} projects)` },
        { id: 'review-waiting', text: `Review Waiting For list (${waitingCount} items)` },
        { id: 'review-someday', text: 'Review Someday/Maybe list' },
        { id: 'review-calendar', text: 'Review upcoming Calendar items' },
        { id: 'creative', text: 'Be creative and courageous — any new projects or ideas?' }
    ];

    let html = `<div class="review-stats">
        <div class="stat-card"><div class="stat-value">${inboxCount}</div><div class="stat-label">Inbox Items</div></div>
        <div class="stat-card"><div class="stat-value">${nextCount}</div><div class="stat-label">Next Actions</div></div>
        <div class="stat-card"><div class="stat-value">${waitingCount}</div><div class="stat-label">Waiting For</div></div>
        <div class="stat-card"><div class="stat-value">${projectsCount}</div><div class="stat-label">Active Projects</div></div>
        <div class="stat-card"><div class="stat-value">${completedThisWeek}</div><div class="stat-label">Completed This Week</div></div>
    </div>`;

    html += `<div class="review-section"><h3>📋 Weekly Review Checklist</h3><div class="review-checklist">`;
    checklist.forEach(c => {
        const done = data.reviewChecklist[c.id] || false;
        html += `<div class="review-item ${done ? 'done' : ''}" onclick="window.GTD.toggleReview('${c.id}')">
            <div class="review-check">${done ? '✓' : ''}</div><span class="review-text">${c.text}</span></div>`;
    });
    html += `</div></div>`;
    html += `<button class="add-btn" onclick="window.GTD.resetReview()">🔄 Reset Checklist</button>`;
    area.innerHTML = html;
}

// --- Process Item ---
function processItem(id) {
    processingItemId = id;
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    document.getElementById('process-item-title').textContent = item.title;
    document.getElementById('process-main-view').style.display = '';
    document.getElementById('defer-subview').style.display = 'none';
    document.getElementById('delegate-subview').style.display = 'none';
    document.getElementById('schedule-subview').style.display = 'none';
    populateProjectSelects();
    document.getElementById('process-modal').classList.add('show');
}

function closeProcessModal() {
    document.getElementById('process-modal').classList.remove('show');
    processingItemId = null;
}

document.getElementById('process-modal-close').addEventListener('click', closeProcessModal);
document.querySelectorAll('.defer-close, .delegate-close, .schedule-close').forEach(b => b.addEventListener('click', closeProcessModal));
document.getElementById('process-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeProcessModal(); });

// Process action buttons
document.querySelectorAll('.process-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const item = data.items.find(i => i.id === processingItemId);
        if (!item) return;
        switch (action) {
            case 'do-it':
                item.completed = true; item.completedAt = new Date().toISOString();
                saveData(data); closeProcessModal(); updateBadges(); renderView();
                toast('Marked as done!');
                if (smsSettings.onComplete && smsConfigured()) sendNotification(`✅ You completed: "${item.title}"\n\nRemaining to-do:\n${buildPendingList()}`);
                break;
            case 'trash':
                data.items = data.items.filter(i => i.id !== processingItemId);
                saveData(data); closeProcessModal(); updateBadges(); renderView();
                toast('Trashed!'); break;
            case 'someday':
                item.category = 'someday';
                saveData(data); closeProcessModal(); updateBadges(); renderView();
                toast('Moved to Someday/Maybe'); break;
            case 'reference':
                item.category = 'reference';
                saveData(data); closeProcessModal(); updateBadges(); renderView();
                toast('Filed as Reference'); break;
            case 'defer':
                document.getElementById('process-main-view').style.display = 'none';
                document.getElementById('defer-subview').style.display = '';
                break;
            case 'delegate':
                document.getElementById('process-main-view').style.display = 'none';
                document.getElementById('delegate-subview').style.display = '';
                break;
            case 'schedule':
                document.getElementById('process-main-view').style.display = 'none';
                document.getElementById('schedule-subview').style.display = '';
                break;
        }
    });
});

// Back buttons
document.getElementById('defer-back').addEventListener('click', () => { document.getElementById('defer-subview').style.display = 'none'; document.getElementById('process-main-view').style.display = ''; });
document.getElementById('delegate-back').addEventListener('click', () => { document.getElementById('delegate-subview').style.display = 'none'; document.getElementById('process-main-view').style.display = ''; });
document.getElementById('schedule-back').addEventListener('click', () => { document.getElementById('schedule-subview').style.display = 'none'; document.getElementById('process-main-view').style.display = ''; });

// Save defer
document.getElementById('defer-save').addEventListener('click', () => {
    const item = data.items.find(i => i.id === processingItemId);
    if (!item) return;
    item.category = 'next';
    item.context = document.getElementById('defer-context').value;
    item.projectId = document.getElementById('defer-project').value;
    item.energy = document.getElementById('defer-energy').value;
    item.timeEstimate = parseInt(document.getElementById('defer-time').value);
    item.notes = document.getElementById('defer-notes').value;
    saveData(data); closeProcessModal(); updateBadges(); renderView();
    toast('Added to Next Actions');
});

// Save delegate
document.getElementById('delegate-save').addEventListener('click', () => {
    const item = data.items.find(i => i.id === processingItemId);
    if (!item) return;
    item.category = 'waiting';
    item.delegatedTo = document.getElementById('delegate-to').value;
    item.dueDate = document.getElementById('delegate-due').value;
    item.notes = document.getElementById('delegate-notes').value;
    saveData(data); closeProcessModal(); updateBadges(); renderView();
    toast('Added to Waiting For');
    if (smsSettings.onDelegate && smsConfigured()) sendNotification(`👤 You delegated this to-do: "${item.title}" → ${item.delegatedTo}${item.dueDate ? ' | Follow up: ' + item.dueDate : ''}\n\nYour checklist to-do:\n${buildPendingList()}`);
});

// Save schedule
document.getElementById('schedule-save').addEventListener('click', () => {
    const item = data.items.find(i => i.id === processingItemId);
    if (!item) return;
    item.category = 'calendar';
    item.dueDate = document.getElementById('schedule-date').value;
    item.dueTime = document.getElementById('schedule-time').value;
    item.reminderSent = false;
    item.notes = document.getElementById('schedule-notes').value;
    saveData(data); closeProcessModal(); updateBadges(); renderView();
    toast('Added to Calendar');
});

// --- Edit Item ---
function editItem(id) {
    editingItemId = id;
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    populateProjectSelects();
    document.getElementById('edit-title').value = item.title;
    document.getElementById('edit-category').value = item.category;
    document.getElementById('edit-context').value = item.context || '@anywhere';
    document.getElementById('edit-project').value = item.projectId || '';
    document.getElementById('edit-energy').value = item.energy || 'medium';
    document.getElementById('edit-time').value = item.timeEstimate || 30;
    document.getElementById('edit-delegated').value = item.delegatedTo || '';
    document.getElementById('edit-due').value = item.dueDate || '';
    document.getElementById('edit-due-time').value = item.dueTime || '';
    document.getElementById('edit-notes').value = item.notes || '';
    document.getElementById('edit-modal').classList.add('show');
}

document.getElementById('edit-modal-close').addEventListener('click', () => document.getElementById('edit-modal').classList.remove('show'));
document.getElementById('edit-modal').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('edit-modal').classList.remove('show'); });

document.getElementById('edit-save').addEventListener('click', () => {
    const item = data.items.find(i => i.id === editingItemId);
    if (!item) return;
    item.title = document.getElementById('edit-title').value.trim() || item.title;
    item.category = document.getElementById('edit-category').value;
    item.context = document.getElementById('edit-context').value;
    item.projectId = document.getElementById('edit-project').value;
    item.energy = document.getElementById('edit-energy').value;
    item.timeEstimate = parseInt(document.getElementById('edit-time').value);
    item.delegatedTo = document.getElementById('edit-delegated').value;
    item.dueDate = document.getElementById('edit-due').value;
    item.dueTime = document.getElementById('edit-due-time').value;
    if (item.dueDate !== document.getElementById('edit-due').value || item.dueTime !== document.getElementById('edit-due-time').value) {
        item.reminderSent = false;
    }
    item.notes = document.getElementById('edit-notes').value;
    saveData(data); document.getElementById('edit-modal').classList.remove('show');
    updateBadges(); renderView(); toast('Item updated');
});

document.getElementById('edit-delete').addEventListener('click', () => {
    data.items = data.items.filter(i => i.id !== editingItemId);
    saveData(data); document.getElementById('edit-modal').classList.remove('show');
    updateBadges(); renderView(); toast('Item deleted');
});

// --- Projects ---
function showProjectModal() { document.getElementById('project-modal').classList.add('show'); document.getElementById('project-title').value = ''; document.getElementById('project-outcome').value = ''; }
document.getElementById('project-modal-close').addEventListener('click', () => document.getElementById('project-modal').classList.remove('show'));
document.getElementById('project-modal').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('project-modal').classList.remove('show'); });

document.getElementById('project-save').addEventListener('click', () => {
    const title = document.getElementById('project-title').value.trim();
    if (!title) return;
    data.projects.push({ id: genId(), title, outcome: document.getElementById('project-outcome').value.trim(), completed: false, createdAt: new Date().toISOString() });
    saveData(data); document.getElementById('project-modal').classList.remove('show');
    updateBadges(); renderView(); toast('Project created');
});

function addTaskToProject(projectId) {
    const title = prompt('Enter task for this project:');
    if (!title || !title.trim()) return;
    data.items.push({
        id: genId(), title: title.trim(), notes: '', category: 'next', context: '@anywhere',
        projectId, energy: 'medium', timeEstimate: 30, delegatedTo: '',
        dueDate: '', dueTime: '', reminderSent: false, completed: false, createdAt: new Date().toISOString(), completedAt: null
    });
    saveData(data); updateBadges(); renderView(); toast('Task added to project');
}

function completeProject(id) {
    const p = data.projects.find(p => p.id === id);
    if (p) { p.completed = true; saveData(data); updateBadges(); renderView(); toast('Project completed! 🎉'); }
}

function deleteProject(id) {
    if (!confirm('Delete this project and unlink all its tasks?')) return;
    data.projects = data.projects.filter(p => p.id !== id);
    data.items.forEach(i => { if (i.projectId === id) i.projectId = ''; });
    saveData(data); updateBadges(); renderView(); toast('Project deleted');
}

// --- Toggle Complete ---
function toggleComplete(id) {
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    item.completed = !item.completed;
    item.completedAt = item.completed ? new Date().toISOString() : null;
    saveData(data); updateBadges(); renderView();
    toast(item.completed ? 'Task completed! 🎉' : 'Task reopened');
    if (item.completed && smsSettings.onComplete && smsConfigured()) sendNotification(`✅ You completed: "${item.title}"\n\nRemaining to-do:\n${buildPendingList()}`);
}

function deleteItem(id) {
    data.items = data.items.filter(i => i.id !== id);
    saveData(data); updateBadges(); renderView(); toast('Item deleted');
}

// --- Weekly Review ---
function toggleReview(id) {
    data.reviewChecklist[id] = !data.reviewChecklist[id];
    saveData(data); renderView();
}
function resetReview() {
    data.reviewChecklist = {};
    saveData(data); renderView(); toast('Checklist reset');
}

// --- Helpers ---
function populateProjectSelects() {
    const active = data.projects.filter(p => !p.completed);
    const opts = '<option value="">No project</option>' + active.map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('');
    ['defer-project', 'edit-project'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = opts; });
}

function escapeHtml(str) {
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return dateStr; }
}

// --- SMS Reminder ---
function sendReminder(id) {
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    let msg = `⏰ Reminder for your to-do: "${item.title}"${buildItemDetail(item)}`;
    msg += `\n\nYour checklist to-do:\n${buildPendingList()}`;
    sendNotification(msg);
}

// --- SMS Settings Modal ---
function showSmsSettings() {
    document.getElementById('wa-api-key').value = smsSettings.waApiKey || '';
    document.getElementById('wa-phone').value = smsSettings.waPhone || '';
    document.getElementById('sms-api-key').value = smsSettings.apiKey;
    document.getElementById('sms-from-phone').value = smsSettings.fromPhone;
    document.getElementById('sms-to-phone').value = smsSettings.toPhone;
    document.getElementById('sms-on-capture').checked = smsSettings.onCapture;
    document.getElementById('sms-on-complete').checked = smsSettings.onComplete;
    document.getElementById('sms-on-delegate').checked = smsSettings.onDelegate;
    if (document.getElementById('sms-on-calendar')) {
        document.getElementById('sms-on-calendar').checked = smsSettings.onCalendar !== false;
    }
    document.getElementById('sms-status').textContent = '';
    document.getElementById('sms-settings-modal').classList.add('show');
}

document.getElementById('sms-settings-close').addEventListener('click', () => document.getElementById('sms-settings-modal').classList.remove('show'));
document.getElementById('sms-settings-modal').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('sms-settings-modal').classList.remove('show'); });

document.getElementById('sms-settings-save').addEventListener('click', () => {
    smsSettings.waApiKey = document.getElementById('wa-api-key').value.trim();
    smsSettings.waPhone = document.getElementById('wa-phone').value.trim();
    smsSettings.apiKey = document.getElementById('sms-api-key').value.trim();
    smsSettings.fromPhone = document.getElementById('sms-from-phone').value.trim();
    smsSettings.toPhone = document.getElementById('sms-to-phone').value.trim();
    smsSettings.onCapture = document.getElementById('sms-on-capture').checked;
    smsSettings.onComplete = document.getElementById('sms-on-complete').checked;
    smsSettings.onDelegate = document.getElementById('sms-on-delegate').checked;
    if (document.getElementById('sms-on-calendar')) {
        smsSettings.onCalendar = document.getElementById('sms-on-calendar').checked;
    }
    saveSmsSettings(smsSettings);
    toast('SMS settings saved');
    document.getElementById('sms-status').textContent = '✅ Settings saved!';
    document.getElementById('sms-status').style.color = 'var(--success)';
});

document.getElementById('sms-test').addEventListener('click', async () => {
    const statusEl = document.getElementById('sms-status');
    // Save first
    smsSettings.waApiKey = document.getElementById('wa-api-key').value.trim();
    smsSettings.waPhone = document.getElementById('wa-phone').value.trim();
    smsSettings.apiKey = document.getElementById('sms-api-key').value.trim();
    smsSettings.fromPhone = document.getElementById('sms-from-phone').value.trim();
    smsSettings.toPhone = document.getElementById('sms-to-phone').value.trim();
    saveSmsSettings(smsSettings);
    if (!smsConfigured()) { statusEl.textContent = '❌ Fill in at least one API key and phone number'; statusEl.style.color = 'var(--danger)'; return; }
    statusEl.textContent = '⏳ Sending test notification...'; statusEl.style.color = 'var(--warning)';
    const result = await sendNotification('🧪 GTD Flow test — Notifications integration is working! Your tasks will now send reminders.');
    if (result.ok) { statusEl.textContent = '✅ Test notification sent successfully!'; statusEl.style.color = 'var(--success)'; }
    else { statusEl.textContent = '❌ Failed: ' + (result.error || 'Unknown error'); statusEl.style.color = 'var(--danger)'; }
});

// --- Global API ---
window.GTD = { processItem, editItem, deleteItem, toggleComplete, showProjectModal, addTaskToProject, completeProject, deleteProject, toggleReview, resetReview, sendReminder, showSmsSettings };

// --- Init ---
updateBadges();
renderView();

// --- Background Reminder Check ---
function checkReminders() {
    if (!smsSettings.onCalendar || !smsConfigured()) return;
    const now = new Date();
    data.items.forEach(item => {
        if (!item.completed && item.dueDate && item.dueTime && !item.reminderSent && item.category === 'calendar') {
            const due = new Date(`${item.dueDate}T${item.dueTime}`);
            if (now >= due) {
                item.reminderSent = true;
                saveData(data);
                sendNotification(`⏰ Event Starting: "${item.title}"\n${buildItemDetail(item)}`);
            }
        }
    });
}
setInterval(checkReminders, 60000); // Check every minute
checkReminders(); // Initial check on load

})();
