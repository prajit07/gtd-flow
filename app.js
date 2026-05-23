// === GTD Flow Application ===
(function() {
'use strict';

// --- Data Layer ---
const STORAGE_KEY = 'gtd_flow_data';
const SMS_SETTINGS_KEY = 'gtd_sms_settings';
const defaultData = () => ({ items: [], projects: [], reviewChecklist: {}, reviewStreak: 0, reviewCompletedThisWeek: false });
const defaultSmsSettings = () => ({
    apiKey: '',
    fromPhone: '',
    toPhone: '',
    waProvider: 'callmebot',
    waApiKey: '',
    waPhone: '',
    twilioSid: '',
    twilioToken: '',
    twilioFrom: '',
    twilioTo: '',
    customMethod: 'POST',
    customUrl: '',
    customHeaders: '',
    customBody: '',
    onCapture: false,
    onComplete: false,
    onDelegate: false,
    onCalendar: true
});

function loadSmsSettings() {
    try { return JSON.parse(localStorage.getItem(SMS_SETTINGS_KEY)) || defaultSmsSettings(); }
    catch { return defaultSmsSettings(); }
}
function saveSmsSettings(s) { localStorage.setItem(SMS_SETTINGS_KEY, JSON.stringify(s)); }
let smsSettings = loadSmsSettings();

function loadData() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData();
        // Schema fallback safely for existing stored data
        if (!parsed.items) parsed.items = [];
        if (!parsed.projects) parsed.projects = [];
        if (!parsed.reviewChecklist) parsed.reviewChecklist = {};
        if (parsed.reviewStreak === undefined) parsed.reviewStreak = 0;
        
        parsed.items.forEach(item => {
            if (!item.subtasks) item.subtasks = [];
        });
        
        return parsed;
    }
    catch {
        return defaultData();
    }
}
function saveData(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

let data = loadData();
let currentView = 'inbox';
let processingItemId = null;
let editingItemId = null;
let searchQuery = '';

// Premium State Variables
let calendarViewMode = 'list';
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let expandedTaskIds = new Set();
let paletteActiveIndex = 0;
let paletteVisibleResults = [];
let timerInterval = null;
let timerSecondsLeft = 120;
let timerIsRunning = false;
let lastInboxCount = data.items.filter(i => !i.completed && i.category === 'inbox').length;
let captureMode = 'task';

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

    // WhatsApp / Webhook Gateway via chosen provider
    const provider = smsSettings.waProvider || 'callmebot';
    
    if (provider === 'callmebot' && smsSettings.waApiKey && smsSettings.waPhone) {
        try {
            const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(smsSettings.waPhone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(smsSettings.waApiKey)}`;
            await fetch(url, { mode: 'no-cors' });
            sent = true;
            toast('💬 CallMeBot WhatsApp sent!');
        } catch (e) { err = e.message; toast('WhatsApp error: ' + err, 'error'); }
    } 
    else if (provider === 'twilio' && smsSettings.twilioSid && smsSettings.twilioToken && smsSettings.twilioFrom && smsSettings.twilioTo) {
        try {
            const sid = smsSettings.twilioSid;
            const token = smsSettings.twilioToken;
            let fromNum = smsSettings.twilioFrom.trim();
            let toNum = smsSettings.twilioTo.trim();
            if (!fromNum.startsWith('whatsapp:')) fromNum = 'whatsapp:' + fromNum;
            if (!toNum.startsWith('whatsapp:')) toNum = 'whatsapp:' + toNum;

            const auth = btoa(`${sid}:${token}`);
            const bodyParams = new URLSearchParams();
            bodyParams.append('To', toNum);
            bodyParams.append('From', fromNum);
            bodyParams.append('Body', message);

            const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: bodyParams.toString()
            });
            const json = await resp.json();
            if (resp.ok) {
                sent = true;
                toast('💬 Twilio WhatsApp sent!');
            } else {
                err = json.message || resp.statusText;
                toast('Twilio WhatsApp failed: ' + err, 'error');
            }
        } catch (e) {
            err = e.message;
            toast('Twilio WhatsApp error: ' + err, 'error');
        }
    } 
    else if (provider === 'custom' && smsSettings.customUrl) {
        try {
            let url = smsSettings.customUrl;
            const method = smsSettings.customMethod || 'POST';
            
            // Build custom headers
            const headers = {};
            if (smsSettings.customHeaders) {
                try {
                    const parsedHeaders = JSON.parse(smsSettings.customHeaders);
                    Object.assign(headers, parsedHeaders);
                } catch (e) {
                    console.error('Failed to parse custom headers JSON', e);
                }
            }

            const fetchOptions = {
                method: method,
                headers: headers
            };

            if (method === 'POST') {
                let processedBody = smsSettings.customBody || '{"text": "{{message}}"}';
                const escapedMessage = JSON.stringify(message).slice(1, -1);
                processedBody = processedBody.replace(/\{\{message\}\}/g, escapedMessage);
                fetchOptions.body = processedBody;
                
                if (!headers['Content-Type'] && !headers['content-type']) {
                    headers['Content-Type'] = 'application/json';
                }
            } else {
                // For GET, we replace query parameters in the URL itself
                url = url.replace(/\{\{message\}\}/g, encodeURIComponent(message));
            }

            const resp = await fetch(url, fetchOptions);
            if (resp.ok) {
                sent = true;
                toast('💬 Custom Webhook sent!');
            } else {
                err = `Status ${resp.status}: ${resp.statusText}`;
                toast('Webhook failed: ' + err, 'error');
            }
        } catch (e) {
            err = e.message;
            toast('Custom Webhook error: ' + err, 'error');
        }
    }

    if (!sent && !err) {
        console.warn('Notifications not configured'); 
        return { ok: false, error: 'Notifications not configured' };
    }
    return { ok: sent, error: err };
}

function smsConfigured() { 
    const hasSms = smsSettings.apiKey && smsSettings.fromPhone && smsSettings.toPhone;
    const provider = smsSettings.waProvider || 'callmebot';
    let hasWa = false;
    if (provider === 'callmebot') {
        hasWa = !!(smsSettings.waApiKey && smsSettings.waPhone);
    } else if (provider === 'twilio') {
        hasWa = !!(smsSettings.twilioSid && smsSettings.twilioToken && smsSettings.twilioFrom && smsSettings.twilioTo);
    } else if (provider === 'custom') {
        hasWa = !!smsSettings.customUrl;
    }
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
    let lines = [];
    if (item.dueDate) {
        let dt = item.dueDate;
        if (item.dueTime) dt += ' at ' + item.dueTime;
        lines.push(`📅 Scheduled: ${dt}`);
    }
    if (item.context && item.context !== '@anywhere') lines.push(`📍 Context: ${item.context}`);
    if (item.delegatedTo) lines.push(`👤 Delegated: ${item.delegatedTo}`);
    if (item.notes) lines.push(`📝 Notes: ${item.notes.slice(0, 100)}`);
    return lines.length ? '\n' + lines.join('\n') : '';
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

    // Check for Inbox Zero Celebration
    if (counts.inbox === 0 && lastInboxCount > 0) {
        triggerConfettiCelebration();
        toast('🎉 Inbox Zero achieved! Outstanding focus!', 'success');
    }
    lastInboxCount = counts.inbox;
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
        
        // Calendar Grid View Toggle container show/hide
        const toggleContainer = document.getElementById('calendar-toggle-container');
        if (toggleContainer) {
            toggleContainer.style.display = (currentView === 'calendar') ? 'flex' : 'none';
        }

        renderView();
        // Close sidebar on mobile
        document.getElementById('sidebar').classList.remove('open');
    });
});

// Mobile menu
document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// --- NLP Tag Parser Helper ---
function parseNLP(text) {
    let title = text;
    let context = '@anywhere';
    let energy = 'medium';
    let timeEstimate = 30;

    // Parse @context
    const contextMatch = title.match(/@(\w+)/);
    if (contextMatch) {
        context = '@' + contextMatch[1];
        title = title.replace(contextMatch[0], '');
    }

    // Parse energy:low, energy:medium, energy:high
    const energyMatch = title.match(/energy:(low|medium|high)/i);
    if (energyMatch) {
        energy = energyMatch[1].toLowerCase();
        title = title.replace(energyMatch[0], '');
    }

    // Parse time:5, time:15, time:30, time:60, etc.
    const timeMatch = title.match(/time:(\d+)/i);
    if (timeMatch) {
        timeEstimate = parseInt(timeMatch[1], 10);
        title = title.replace(timeMatch[0], '');
    }

    return {
        title: title.replace(/\s+/g, ' ').trim(),
        context,
        energy,
        timeEstimate
    };
}

// --- Event Modal & Recurrence Helpers ---
const eventModal = document.getElementById('event-modal');
const eventModalClose = document.getElementById('event-modal-close');
const eventTitleInput = document.getElementById('event-title');
const eventDateInput = document.getElementById('event-date');
const eventTimeInput = document.getElementById('event-time');
const eventRecurrenceSelect = document.getElementById('event-recurrence');
const eventNotesInput = document.getElementById('event-notes');
const eventSaveBtn = document.getElementById('event-save');

function openEventModal(rawTitle = '', preFilledDate = '') {
    eventTitleInput.value = rawTitle;
    if (preFilledDate) {
        eventDateInput.value = preFilledDate;
    } else {
        const today = new Date().toISOString().split('T')[0];
        eventDateInput.value = today;
    }
    eventTimeInput.value = '';
    eventRecurrenceSelect.value = 'none';
    eventNotesInput.value = '';
    eventModal.classList.add('show');
}

function closeEventModal() {
    eventModal.classList.remove('show');
}

if (eventModalClose) eventModalClose.addEventListener('click', closeEventModal);
if (eventModal) eventModal.addEventListener('click', e => { if (e.target === e.currentTarget) closeEventModal(); });

if (eventSaveBtn) {
    eventSaveBtn.addEventListener('click', () => {
        const title = eventTitleInput.value.trim();
        if (!title) {
            toast('Please enter an event title');
            return;
        }
        const dueDate = eventDateInput.value;
        if (!dueDate) {
            toast('Please select a date');
            return;
        }
        const dueTime = eventTimeInput.value;
        const recurrence = eventRecurrenceSelect.value;
        const notes = eventNotesInput.value;

        const newEvent = {
            id: genId(),
            title,
            notes,
            category: 'calendar',
            context: '@anywhere',
            projectId: '',
            energy: 'medium',
            timeEstimate: 30,
            delegatedTo: '',
            dueDate,
            dueTime,
            isEvent: true,
            recurrence,
            lastRemindedDate: '',
            reminderSent: false,
            completed: false,
            createdAt: new Date().toISOString(),
            completedAt: null,
            subtasks: []
        };

        data.items.push(newEvent);
        saveData(data);
        closeEventModal();
        updateBadges();
        renderView();
        toast('Event created successfully!');

        if (smsSettings.onCapture && smsConfigured()) {
            sendNotification(`📅 You scheduled a calendar event: "${title}"\nDate: ${dueDate} ${dueTime ? 'at ' + dueTime : ''}\nRecurrence: ${recurrence}`);
        }
    });
}

// --- Alert Modal & Beep ---
const alertModal = document.getElementById('alert-modal');
const alertDismissBtn = document.getElementById('alert-dismiss-btn');
const alertEventTitle = document.getElementById('alert-event-title');
const alertEventDetails = document.getElementById('alert-event-details');

let audioCtx = null;
function playAlertBeep() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
        
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1200, audioCtx.currentTime);
            gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
            osc2.start();
            osc2.stop(audioCtx.currentTime + 0.25);
        }, 180);
    } catch (e) {
        console.warn('Audio beep failed:', e);
    }
}

function triggerInAppAlert(item, dateStr) {
    if (alertEventTitle) alertEventTitle.textContent = item.title;
    let timeStr = item.dueTime ? `Starting at ${item.dueTime}` : 'All Day Event';
    let recurrenceLabel = item.recurrence && item.recurrence !== 'none' ? ` (${item.recurrence.charAt(0).toUpperCase() + item.recurrence.slice(1)} Event)` : '';
    if (alertEventDetails) alertEventDetails.textContent = `${timeStr} on ${dateStr}${recurrenceLabel}\n\n${item.notes || ''}`;
    if (alertModal) alertModal.classList.add('show');
    playAlertBeep();
}

function closeAlertModal() {
    if (alertModal) alertModal.classList.remove('show');
}
if (alertDismissBtn) alertDismissBtn.addEventListener('click', closeAlertModal);
if (alertModal) alertModal.addEventListener('click', e => { if (e.target === e.currentTarget) closeAlertModal(); });

// --- Recurrence & Mode helper ---
function doesEventOccurOnDate(item, dateStr) {
    if (!item.dueDate) return false;
    if (item.category !== 'calendar') {
        return item.dueDate === dateStr;
    }
    const recur = item.recurrence || 'none';
    if (recur === 'none') {
        return item.dueDate === dateStr;
    }
    if (dateStr < item.dueDate) {
        return false;
    }
    try {
        const targetDate = new Date(dateStr + 'T00:00:00');
        const startDate = new Date(item.dueDate + 'T00:00:00');
        if (isNaN(targetDate) || isNaN(startDate)) return false;
        
        if (recur === 'daily') {
            return true;
        }
        if (recur === 'weekly') {
            return targetDate.getDay() === startDate.getDay();
        }
        if (recur === 'monthly') {
            return targetDate.getDate() === startDate.getDate();
        }
        if (recur === 'yearly') {
            return targetDate.getMonth() === startDate.getMonth() && targetDate.getDate() === startDate.getDate();
        }
    } catch (e) {
        console.error('Error calculating recurrence:', e);
    }
    return false;
}

function setCaptureMode(mode) {
    captureMode = mode;
    const taskBtn = document.getElementById('capture-tab-task');
    const eventBtn = document.getElementById('capture-tab-event');
    const captureIcon = document.getElementById('capture-mode-icon');
    const captureInput = document.getElementById('capture-input');

    if (mode === 'event') {
        if (taskBtn) {
            taskBtn.classList.remove('active');
            taskBtn.style.background = 'transparent';
            taskBtn.style.border = '1px solid transparent';
            taskBtn.style.color = 'var(--text-muted)';
        }
        if (eventBtn) {
            eventBtn.classList.add('active');
            eventBtn.style.background = 'var(--bg-card)';
            eventBtn.style.border = '1px solid var(--border-active)';
            eventBtn.style.color = 'var(--text-primary)';
        }
        if (captureIcon) captureIcon.textContent = '📅';
        if (captureInput) captureInput.placeholder = 'Type event title (e.g. Dad\'s Birthday) and press Enter...';
    } else {
        if (eventBtn) {
            eventBtn.classList.remove('active');
            eventBtn.style.background = 'transparent';
            eventBtn.style.border = '1px solid transparent';
            eventBtn.style.color = 'var(--text-muted)';
        }
        if (taskBtn) {
            taskBtn.classList.add('active');
            taskBtn.style.background = 'var(--bg-card)';
            taskBtn.style.border = '1px solid var(--border)';
            taskBtn.style.color = 'var(--text-secondary)';
        }
        if (captureIcon) captureIcon.textContent = '+';
        if (captureInput) captureInput.placeholder = 'What\'s on your mind? Capture it here...';
    }
}

// --- Capture ---
const captureInput = document.getElementById('capture-input');
const captureBtn = document.getElementById('capture-btn');

function captureItem() {
    const rawTitle = captureInput.value.trim();
    if (!rawTitle) return;

    if (captureMode === 'event') {
        openEventModal(rawTitle);
        captureInput.value = '';
        return;
    }

    // Parse using NLP
    const parsed = parseNLP(rawTitle);

    data.items.push({
        id: genId(), title: parsed.title, notes: '', category: 'inbox', context: parsed.context,
        projectId: '', energy: parsed.energy, timeEstimate: parsed.timeEstimate, delegatedTo: '',
        dueDate: '', dueTime: '', reminderSent: false, completed: false, createdAt: new Date().toISOString(), completedAt: null,
        subtasks: []
    });
    saveData(data); captureInput.value = '';
    updateBadges(); if (currentView === 'inbox') renderView();
    toast('Captured to Inbox');
    if (smsSettings.onCapture && smsConfigured()) sendNotification(`📥 You added this to-do: "${parsed.title}"\n\nYour checklist to-do:\n${buildPendingList()}`);
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
    let items = data.items.filter(i => {
        if (!includeCompleted && i.completed) return false;
        if (i.category !== category) return false;
        if (searchQuery && !i.title.toLowerCase().includes(searchQuery) && !i.notes.toLowerCase().includes(searchQuery)) return false;
        return true;
    });

    // Sequential Project Sequencing Filters
    if (category === 'next') {
        const nextActionInProject = {};
        data.projects.forEach(p => {
            if (p.isSequential) {
                const projTasks = data.items.filter(i => i.projectId === p.id && !i.completed);
                if (projTasks.length > 0) {
                    nextActionInProject[p.id] = projTasks[0].id;
                }
            }
        });

        items = items.filter(i => {
            if (i.projectId) {
                const p = data.projects.find(proj => proj.id === i.projectId);
                if (p && p.isSequential) {
                    return nextActionInProject[i.projectId] === i.id;
                }
            }
            return true;
        });
    }

    return items;
}

function renderTaskCard(item, showProcess = false) {
    const tags = [];
    const subtasks = item.subtasks || [];
    const completedSubtasks = subtasks.filter(s => s.completed).length;
    const totalSubtasks = subtasks.length;
    const subtaskPct = totalSubtasks ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

    if (item.context && item.context !== '@anywhere') tags.push(`<span class="task-tag tag-context">${item.context}</span>`);
    if (item.projectId) {
        const p = data.projects.find(p => p.id === item.projectId);
        if (p) tags.push(`<span class="task-tag tag-project">${p.title}</span>`);
    }
    if (item.energy && (item.category === 'next' || item.category === 'inbox')) tags.push(`<span class="task-tag tag-energy">🔋 ${item.energy}</span>`);
    if (item.timeEstimate && (item.category === 'next' || item.category === 'inbox')) tags.push(`<span class="task-tag tag-time">⏱️ ${item.timeEstimate}m</span>`);
    
    // Add subtask progress tag if there are subtasks
    if (totalSubtasks > 0) {
        tags.push(`<span class="task-tag tag-subtask" style="color:var(--success); background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.2);">📋 ${completedSubtasks}/${totalSubtasks}</span>`);
    }
    
    if (item.delegatedTo) tags.push(`<span class="task-tag tag-delegated">→ ${item.delegatedTo}</span>`);
    if (item.dueDate) {
        let tagText = `📅 ${formatDate(item.dueDate)}`;
        if (item.dueTime) tagText += ` at ${item.dueTime}`;
        tags.push(`<span class="task-tag tag-due">${tagText}</span>`);
    }
    if (item.category === 'calendar' && item.recurrence && item.recurrence !== 'none') {
        const recurLabels = {
            daily: '🔄 Daily',
            weekly: '🗓️ Weekly',
            monthly: '📅 Monthly',
            yearly: '🎂 Yearly'
        };
        const label = recurLabels[item.recurrence] || item.recurrence;
        tags.push(`<span class="task-tag tag-recurrence">${label}</span>`);
    }

    const gcalUrl = (item.category === 'calendar' && item.dueDate) ? 
        `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.title)}&details=${encodeURIComponent(item.notes || '')}&dates=${item.dueDate.replace(/-/g, '')}${item.dueTime ? 'T' + item.dueTime.replace(/:/g, '') + '00/' + item.dueDate.replace(/-/g, '') + 'T' + item.dueTime.replace(/:/g, '') + '00' : '/' + item.dueDate.replace(/-/g, '')}` : '';

    const isExpanded = expandedTaskIds.has(item.id);

    if (isExpanded) {
        // Render Expanded Card Layout
        return `
        <div class="task-card task-card-expanded ${item.completed ? 'completed' : ''}" data-id="${item.id}">
            <div class="task-card-main-row">
                <button class="task-checkbox ${item.completed ? 'checked' : ''}" data-id="${item.id}" onclick="event.stopPropagation(); window.GTD.toggleComplete('${item.id}')">${item.completed ? '✓' : ''}</button>
                <div class="task-info" onclick="window.GTD.toggleExpandTask('${item.id}')">
                    <div class="task-title" style="cursor:pointer;">${escapeHtml(item.title)}</div>
                    ${tags.length ? `<div class="task-meta">${tags.join('')}</div>` : ''}
                </div>
                <div class="task-actions">
                    ${showProcess ? `<button class="task-action-btn process-action" title="Process" onclick="event.stopPropagation(); window.GTD.processItem('${item.id}')">🔍</button>` : ''}
                    ${gcalUrl ? `<a class="task-action-btn" title="Add to Google Calendar" href="${gcalUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="text-decoration:none">🗓️</a>` : ''}
                    ${smsConfigured() ? `<button class="task-action-btn" title="Send Reminder" onclick="event.stopPropagation(); window.GTD.sendReminder('${item.id}')">📱</button>` : ''}
                    <button class="task-action-btn" title="Edit" onclick="event.stopPropagation(); window.GTD.editItem('${item.id}')">✏️</button>
                    <button class="task-action-btn delete-action" title="Delete" onclick="event.stopPropagation(); window.GTD.deleteItem('${item.id}')">🗑️</button>
                </div>
            </div>
            
            <div class="subtask-container" onclick="event.stopPropagation()">
                ${totalSubtasks > 0 ? `
                <div class="subtask-card-progress" style="display:flex; align-items:center; gap:8px; font-size:11px; color:var(--text-secondary); margin-bottom:4px; width:100%;">
                    <span style="font-weight:600;">Checklist</span>
                    <div class="subtask-card-progress-bar" style="flex:1; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
                        <div class="subtask-card-progress-fill" style="height:100%; background:var(--success); width:${subtaskPct}%;"></div>
                    </div>
                    <span style="font-weight:600; min-width:28px; text-align:right;">${completedSubtasks}/${totalSubtasks}</span>
                </div>
                ` : ''}
                
                <div class="subtask-list">
                    ${subtasks.map((s, idx) => `
                    <div class="subtask-item ${s.completed ? 'completed' : ''}">
                        <button class="subtask-checkbox ${s.completed ? 'checked' : ''}" onclick="window.GTD.toggleSubtask('${item.id}', '${s.id}')">
                            ${s.completed ? '✓' : ''}
                        </button>
                        <span class="subtask-text">${escapeHtml(s.title)}</span>
                        <button class="subtask-delete-btn" onclick="window.GTD.deleteSubtask('${item.id}', '${s.id}')">🗑️</button>
                    </div>
                    `).join('')}
                </div>

                <div class="subtask-input-wrapper">
                    <input type="text" class="subtask-input" placeholder="Add checklist item..." id="subtask-input-${item.id}" onkeydown="if(event.key === 'Enter') window.GTD.addSubtask('${item.id}')">
                    <button class="subtask-add-btn" onclick="window.GTD.addSubtask('${item.id}')">+ Add</button>
                </div>
            </div>
        </div>`;
    } else {
        // Render Collapsed Card Layout
        return `<div class="task-card ${item.completed ? 'completed' : ''}" data-id="${item.id}">
            <button class="task-checkbox ${item.completed ? 'checked' : ''}" data-id="${item.id}" onclick="event.stopPropagation(); window.GTD.toggleComplete('${item.id}')">${item.completed ? '✓' : ''}</button>
            <div class="task-info" onclick="window.GTD.toggleExpandTask('${item.id}')">
                <div class="task-title" style="cursor:pointer;">${escapeHtml(item.title)}</div>
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
        
        const seqText = p.isSequential ? '⛓️ Sequential' : '⇅ Parallel';
        const seqClass = p.isSequential ? 'project-seq-badge' : 'project-seq-badge inactive';

        html += `<div class="project-card" data-id="${p.id}" style="position:relative;">
            <span class="${seqClass}" onclick="event.stopPropagation(); window.GTD.toggleProjectSequencing('${p.id}')">${seqText}</span>
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

// --- Dynamic Calendar Grid or List Rendering ---
function renderCalendar(area) {
    if (calendarViewMode === 'list') {
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
    } else {
        renderCalendarGrid(area);
    }
}

function renderCalendarGrid(area) {
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const prevTotalDays = new Date(calendarYear, calendarMonth, 0).getDate();
    
    const monthNames = [
        "January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"
    ];
    
    let html = `
    <div class="calendar-nav-bar">
        <button class="calendar-nav-btn" onclick="window.GTD.prevMonth()">←</button>
        <h2>📅 ${monthNames[calendarMonth]} ${calendarYear}</h2>
        <button class="calendar-nav-btn" onclick="window.GTD.nextMonth()">→</button>
    </div>
    <div class="calendar-grid-header">
        <div class="calendar-header-cell">Sun</div>
        <div class="calendar-header-cell">Mon</div>
        <div class="calendar-header-cell">Tue</div>
        <div class="calendar-header-cell">Wed</div>
        <div class="calendar-header-cell">Thu</div>
        <div class="calendar-header-cell">Fri</div>
        <div class="calendar-header-cell">Sat</div>
    </div>
    <div class="calendar-grid">
    `;
    
    // Days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const day = prevTotalDays - i;
        const prevMonthVal = calendarMonth === 0 ? 11 : calendarMonth - 1;
        const prevYearVal = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
        const dateStr = `${prevYearVal}-${String(prevMonthVal + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        html += renderCalendarCell(day, dateStr, true);
    }
    
    // Days of current month
    const today = new Date();
    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = today.getDate() === day && today.getMonth() === calendarMonth && today.getFullYear() === calendarYear;
        html += renderCalendarCell(day, dateStr, false, isToday);
    }
    
    // Days of next month to fill grid
    const totalCells = firstDayIndex + totalDays;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let day = 1; day <= remainingCells; day++) {
        const nextMonthVal = calendarMonth === 11 ? 0 : calendarMonth + 1;
        const nextYearVal = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
        const dateStr = `${nextYearVal}-${String(nextMonthVal + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        html += renderCalendarCell(day, dateStr, true);
    }
    
    html += `</div>`;
    area.innerHTML = html;
}

function renderCalendarCell(day, dateStr, isOtherMonth, isToday = false) {
    const cellTasks = data.items.filter(i => {
        if (i.completed) return false;
        if (i.category !== 'calendar') return false;
        return doesEventOccurOnDate(i, dateStr);
    });
    
    let taskPillsHtml = '';
    if (cellTasks.length > 0) {
        taskPillsHtml = `<div class="calendar-day-tasks">` + cellTasks.map(t => `
            <div class="calendar-task-pill ${t.completed ? 'completed' : ''}" onclick="event.stopPropagation(); window.GTD.editItem('${t.id}')">
                ${escapeHtml(t.title)}
            </div>
        `).join('') + `</div>`;
    }
    
    const cellClass = `calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`;
    return `
    <div class="${cellClass}" onclick="window.GTD.quickAddCalendarTask('${dateStr}')">
        <div class="calendar-day-number">${day}</div>
        ${taskPillsHtml}
    </div>
    `;
}

function prevMonth() {
    if (calendarMonth === 0) {
        calendarMonth = 11;
        calendarYear--;
    } else {
        calendarMonth--;
    }
    renderView();
}

function nextMonth() {
    if (calendarMonth === 11) {
        calendarMonth = 0;
        calendarYear++;
    } else {
        calendarMonth++;
    }
    renderView();
}

function quickAddCalendarTask(dateStr) {
    if (captureMode === 'event') {
        openEventModal('', dateStr);
        return;
    }

    const title = prompt(`Add scheduled task for ${formatDate(dateStr)}:`);
    if (!title || !title.trim()) return;
    
    data.items.push({
        id: genId(), title: title.trim(), notes: '', category: 'calendar', context: '@anywhere',
        projectId: '', energy: 'medium', timeEstimate: 30, delegatedTo: '',
        dueDate: dateStr, dueTime: '', reminderSent: false, completed: false, createdAt: new Date().toISOString(), completedAt: null,
        subtasks: []
    });
    
    saveData(data);
    updateBadges();
    renderView();
    toast('Task added to Calendar');
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

// --- Expanded Weekly Review with Analytics Dashboard ---
function renderWeeklyReview(area) {
    const inboxCount = data.items.filter(i => !i.completed && i.category === 'inbox').length;
    const nextCount = data.items.filter(i => !i.completed && i.category === 'next').length;
    const waitingCount = data.items.filter(i => !i.completed && i.category === 'waiting').length;
    const projectsCount = data.projects.filter(p => !p.completed).length;
    
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

    // Compute completion history for the last 7 days
    const completionHistory = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayDate = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(todayDate.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        const count = data.items.filter(item => {
            if (!item.completed || !item.completedAt) return false;
            return item.completedAt.split('T')[0] === dateStr;
        }).length;
        
        completionHistory.push({
            label: dayNames[d.getDay()],
            count: count
        });
    }

    const maxCount = Math.max(...completionHistory.map(h => h.count), 1);

    const barChartHtml = completionHistory.map(h => {
        const pct = Math.round((h.count / maxCount) * 100);
        return `
        <div class="chart-bar-col">
            <div class="chart-bar-fill-wrapper">
                <div class="chart-bar-fill" style="height:${pct}%;">
                    <div class="chart-bar-val">${h.count}</div>
                </div>
            </div>
            <div class="chart-bar-label">${h.label}</div>
        </div>
        `;
    }).join('');

    // Context donut chart
    const contextCounts = {};
    const nextItems = data.items.filter(i => !i.completed && i.category === 'next');
    nextItems.forEach(i => {
        const ctx = i.context || '@anywhere';
        contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
    });
    
    const totalNext = nextItems.length;
    const donutSegments = [];
    const colors = ['#818cf8', '#34d399', '#f43f5e', '#fbbf24', '#a78bfa', '#60a5fa'];
    
    let cumulativePercent = 0;
    let idx = 0;
    const labelItems = [];
    
    if (totalNext === 0) {
        donutSegments.push(`
            <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" 
                stroke="var(--border)" stroke-width="6" stroke-dasharray="100 0" stroke-dashoffset="0"></circle>
        `);
        labelItems.push(`
            <div class="donut-label-item">
                <span class="donut-label-dot" style="background:var(--border);"></span>
                <span>No active Next Actions</span>
            </div>
        `);
    } else {
        Object.entries(contextCounts).forEach(([ctx, count]) => {
            const percent = Math.round((count / totalNext) * 100);
            const strokeColor = colors[idx % colors.length];
            
            donutSegments.push(`
                <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" 
                    stroke="${strokeColor}" stroke-width="6"
                    stroke-dasharray="${percent} ${100 - percent}" 
                    stroke-dashoffset="${100 - cumulativePercent}"></circle>
            `);
            
            labelItems.push(`
                <div class="donut-label-item">
                    <span class="donut-label-dot" style="background:${strokeColor};"></span>
                    <span>${ctx}: ${count} (${percent}%)</span>
                </div>
            `);
            
            cumulativePercent += percent;
            idx++;
        });
    }

    const reviewStreak = data.reviewStreak || 0;

    let html = `
    <div class="dashboard-grid">
        <div class="chart-container">
            <h3>📊 7-Day Completion History</h3>
            <div class="css-bar-chart">
                ${barChartHtml}
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:16px;">
            <div class="chart-container">
                <h3>📍 Next Actions Contexts</h3>
                <div class="donut-chart-wrapper">
                    <svg class="donut-chart-svg" width="90" height="90" viewBox="0 0 42 42">
                        <circle class="donut-hole" cx="21" cy="21" r="15.91549430918954"></circle>
                        <circle class="donut-ring" cx="21" cy="21" r="15.91549430918954" stroke="rgba(255,255,255,0.03)" stroke-width="6"></circle>
                        ${donutSegments.join('')}
                    </svg>
                    <div class="donut-label-list">
                        ${labelItems.join('')}
                    </div>
                </div>
            </div>
            <div class="streak-display">
                <div class="streak-number">🔥 ${reviewStreak}</div>
                <div class="streak-title">Review Streak</div>
                <div class="streak-desc">Completed reviews: ${reviewStreak} weeks in a row. Maintain your momentum!</div>
            </div>
        </div>
    </div>
    `;

    html += `<div class="review-section" style="margin-top:24px;"><h3>📋 Weekly Review Checklist</h3><div class="review-checklist">`;
    checklist.forEach(c => {
        const done = data.reviewChecklist[c.id] || false;
        html += `<div class="review-item ${done ? 'done' : ''}" onclick="window.GTD.toggleReview('${c.id}')">
            <div class="review-check">${done ? '✓' : ''}</div><span class="review-text">${c.text}</span></div>`;
    });
    html += `</div></div>`;
    html += `<button class="add-btn" style="margin-top:16px;" onclick="window.GTD.resetReview()">🔄 Reset Checklist</button>`;
    
    area.innerHTML = html;
}

// --- Process Item Wizard Slide Controls ---
function showWizardStep(stepId) {
    const steps = ['process-step-1', 'process-step-2a', 'process-step-2b', 'process-step-timer', 'process-step-3b', 'defer-subview', 'delegate-subview', 'schedule-subview'];
    steps.forEach(sid => {
        const el = document.getElementById(sid);
        if (el) el.style.display = (sid === stepId) ? 'block' : 'none';
    });
}

function processItem(id) {
    processingItemId = id;
    const item = data.items.find(i => i.id === id);
    if (!item) return;

    // Reset timer
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerSecondsLeft = 120;
    timerIsRunning = false;
    updateTimerUI();

    document.getElementById('process-item-title').textContent = item.title;
    showWizardStep('process-step-1');
    populateProjectSelects();
    document.getElementById('process-modal').classList.add('show');
}

function closeProcessModal() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerIsRunning = false;
    document.getElementById('process-modal').classList.remove('show');
    processingItemId = null;
}

document.getElementById('process-modal-close').addEventListener('click', closeProcessModal);
document.querySelectorAll('.defer-close, .delegate-close, .schedule-close').forEach(b => b.addEventListener('click', closeProcessModal));
document.getElementById('process-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeProcessModal(); });

// Process non-actionable & actionable pathways routing
document.getElementById('process-actionable-yes').addEventListener('click', () => { showWizardStep('process-step-2b'); });
document.getElementById('process-actionable-no').addEventListener('click', () => { showWizardStep('process-step-2a'); });

document.getElementById('step-2a-back').addEventListener('click', () => { showWizardStep('process-step-1'); });
document.getElementById('step-2b-back').addEventListener('click', () => { showWizardStep('process-step-1'); });

document.getElementById('process-time-under').addEventListener('click', () => {
    showWizardStep('process-step-timer');
    startProcessTimer();
});
document.getElementById('process-time-over').addEventListener('click', () => { showWizardStep('process-step-3b'); });

document.getElementById('step-timer-back').addEventListener('click', () => {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerIsRunning = false;
    showWizardStep('process-step-2b');
});
document.getElementById('step-3b-back').addEventListener('click', () => { showWizardStep('process-step-2b'); });

// --- Wizard Interactive Process Buttons ---
document.querySelectorAll('.process-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const item = data.items.find(i => i.id === processingItemId);
        if (!item) return;
        switch (action) {
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
                showWizardStep('defer-subview');
                break;
            case 'delegate':
                showWizardStep('delegate-subview');
                break;
            case 'schedule':
                showWizardStep('schedule-subview');
                break;
        }
    });
});

// Back buttons on Defer/Delegate/Schedule subviews
document.getElementById('defer-back').addEventListener('click', () => { showWizardStep('process-step-3b'); });
document.getElementById('delegate-back').addEventListener('click', () => { showWizardStep('process-step-3b'); });
document.getElementById('schedule-back').addEventListener('click', () => { showWizardStep('process-step-3b'); });

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
    if (smsSettings.onDelegate && smsConfigured()) {
        let msg = `👤 You delegated: "${item.title}"\n→ To: ${item.delegatedTo}`;
        if (item.dueDate) msg += `\n📅 Follow up: ${item.dueDate}`;
        msg += `\n\nYour checklist:\n${buildPendingList()}`;
        sendNotification(msg);
    }
});

// Save schedule
document.getElementById('schedule-save').addEventListener('click', () => {
    const item = data.items.find(i => i.id === processingItemId);
    if (!item) return;
    item.category = 'calendar';
    item.dueDate = document.getElementById('schedule-date').value;
    item.dueTime = document.getElementById('schedule-time').value;
    item.recurrence = document.getElementById('schedule-recurrence').value;
    item.isEvent = true;
    item.lastRemindedDate = '';
    item.reminderSent = false;
    item.notes = document.getElementById('schedule-notes').value;
    saveData(data); closeProcessModal(); updateBadges(); renderView();
    toast('Added to Calendar');
});

// --- Process Immediate 2-Minute Timer ---
function startProcessTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerIsRunning = true;
    timerSecondsLeft = 120;
    document.getElementById('timer-toggle-btn').textContent = 'Pause';
    updateTimerUI();
    
    timerInterval = setInterval(() => {
        if (!timerIsRunning) return;
        timerSecondsLeft--;
        
        if (timerSecondsLeft <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            timerSecondsLeft = 0;
            updateTimerUI();
            toast('Time is up! Complete or skip and defer.', 'warning');
        } else {
            updateTimerUI();
        }
    }, 1000);
}

function updateTimerUI() {
    const min = Math.floor(timerSecondsLeft / 60);
    const sec = timerSecondsLeft % 60;
    document.getElementById('timer-display').textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    
    // Circle circumference is approx 440
    const offset = 440 * (1 - (timerSecondsLeft / 120));
    document.getElementById('timer-progress').setAttribute('stroke-dashoffset', offset);
}

function pauseResumeTimer() {
    timerIsRunning = !timerIsRunning;
    document.getElementById('timer-toggle-btn').textContent = timerIsRunning ? 'Pause' : 'Resume';
}

document.getElementById('timer-toggle-btn').addEventListener('click', pauseResumeTimer);
document.getElementById('timer-done-btn').addEventListener('click', () => {
    const item = data.items.find(i => i.id === processingItemId);
    if (item) {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        timerIsRunning = false;
        
        item.completed = true;
        item.completedAt = new Date().toISOString();
        saveData(data); closeProcessModal(); updateBadges(); renderView();
        toast('Marked as done! ⚡');
        if (smsSettings.onComplete && smsConfigured()) sendNotification(`✅ You completed: "${item.title}"\n\nRemaining to-do:\n${buildPendingList()}`);
    }
});
document.getElementById('timer-skip-btn').addEventListener('click', () => {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerIsRunning = false;
    showWizardStep('process-step-3b');
});

// --- Confetti Canvas Particles Celebration ---
function triggerConfettiCelebration() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const particles = [];
    
    for (let i = 0; i < 120; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height - height,
            r: Math.random() * 5 + 4,
            d: Math.random() * width,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.random() * 10 - 5,
            tiltAngleIncremental: Math.random() * 0.07 + 0.02,
            tiltAngle: 0
        });
    }
    
    let animationId = null;
    const startTime = Date.now();
    
    function draw() {
        ctx.clearRect(0, 0, width, height);
        let active = false;
        
        particles.forEach((p, idx) => {
            p.tiltAngle += p.tiltAngleIncremental;
            p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
            p.x += Math.sin(p.tiltAngle);
            p.tilt = Math.sin(p.tiltAngle - idx / 3) * 15;
            
            if (p.y < height) {
                active = true;
            }
            
            ctx.beginPath();
            ctx.lineWidth = p.r;
            ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
            ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
            ctx.stroke();
        });
        
        if (active && (Date.now() - startTime < 4000)) {
            animationId = requestAnimationFrame(draw);
        } else {
            cancelAnimationFrame(animationId);
            canvas.style.display = 'none';
            ctx.clearRect(0, 0, width, height);
        }
    }
    draw();
}

// --- Task Expand & Subtask Handling ---
function toggleExpandTask(id) {
    if (expandedTaskIds.has(id)) {
        expandedTaskIds.delete(id);
    } else {
        expandedTaskIds.add(id);
    }
    renderView();
}

function toggleSubtask(taskId, subtaskId) {
    const item = data.items.find(i => i.id === taskId);
    if (!item) return;
    const sub = (item.subtasks || []).find(s => s.id === subtaskId);
    if (!sub) return;
    sub.completed = !sub.completed;
    saveData(data);
    updateBadges();
    renderView();
}

function addSubtask(taskId) {
    const input = document.getElementById(`subtask-input-${taskId}`);
    if (!input) return;
    const title = input.value.trim();
    if (!title) return;
    const item = data.items.find(i => i.id === taskId);
    if (!item) return;
    if (!item.subtasks) item.subtasks = [];
    item.subtasks.push({ id: genId(), title, completed: false });
    saveData(data);
    input.value = '';
    updateBadges();
    renderView();
}

function deleteSubtask(taskId, subtaskId) {
    const item = data.items.find(i => i.id === taskId);
    if (!item) return;
    item.subtasks = (item.subtasks || []).filter(s => s.id !== subtaskId);
    saveData(data);
    updateBadges();
    renderView();
}

// Project Sequential Sequencing Badge Toggle Handler
function toggleProjectSequencing(id) {
    const p = data.projects.find(p => p.id === id);
    if (p) {
        p.isSequential = !p.isSequential;
        saveData(data);
        renderView();
        toast(p.isSequential ? 'Project set to Sequential' : 'Project set to Parallel');
    }
}

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
    
    const recGroup = document.getElementById('edit-recurrence-group');
    if (item.category === 'calendar') {
        if (recGroup) recGroup.style.display = 'block';
        document.getElementById('edit-recurrence').value = item.recurrence || 'none';
    } else {
        if (recGroup) recGroup.style.display = 'none';
    }
    
    document.getElementById('edit-modal').classList.add('show');
}

document.getElementById('edit-category').addEventListener('change', (e) => {
    const recGroup = document.getElementById('edit-recurrence-group');
    if (recGroup) {
        recGroup.style.display = (e.target.value === 'calendar') ? 'block' : 'none';
    }
});

document.getElementById('edit-modal-close').addEventListener('click', () => document.getElementById('edit-modal').classList.remove('show'));
document.getElementById('edit-modal').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('edit-modal').classList.remove('show'); });

document.getElementById('edit-save').addEventListener('click', () => {
    const item = data.items.find(i => i.id === editingItemId);
    if (!item) return;
    
    const newCategory = document.getElementById('edit-category').value;
    const newRecurrence = newCategory === 'calendar' ? document.getElementById('edit-recurrence').value : 'none';
    const newDueDate = document.getElementById('edit-due').value;
    const newDueTime = document.getElementById('edit-due-time').value;

    if (item.dueDate !== newDueDate || item.dueTime !== newDueTime || item.recurrence !== newRecurrence || item.category !== newCategory) {
        item.reminderSent = false;
        item.lastRemindedDate = '';
    }

    item.title = document.getElementById('edit-title').value.trim() || item.title;
    item.category = newCategory;
    item.recurrence = newRecurrence;
    item.context = document.getElementById('edit-context').value;
    item.projectId = document.getElementById('edit-project').value;
    item.energy = document.getElementById('edit-energy').value;
    item.timeEstimate = parseInt(document.getElementById('edit-time').value);
    item.delegatedTo = document.getElementById('edit-delegated').value;
    item.dueDate = newDueDate;
    item.dueTime = newDueTime;
    item.notes = document.getElementById('edit-notes').value;

    saveData(data);
    document.getElementById('edit-modal').classList.remove('show');
    updateBadges();
    renderView();
    toast('Item updated');
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
    data.projects.push({ id: genId(), title, outcome: document.getElementById('project-outcome').value.trim(), completed: false, isSequential: false, createdAt: new Date().toISOString() });
    saveData(data); document.getElementById('project-modal').classList.remove('show');
    updateBadges(); renderView(); toast('Project created');
});

function addTaskToProject(projectId) {
    const title = prompt('Enter task for this project:');
    if (!title || !title.trim()) return;
    
    // Parse using NLP for quick adding
    const parsed = parseNLP(title.trim());

    data.items.push({
        id: genId(), title: parsed.title, notes: '', category: 'next', context: parsed.context,
        projectId, energy: parsed.energy, timeEstimate: parsed.timeEstimate, delegatedTo: '',
        dueDate: '', dueTime: '', reminderSent: false, completed: false, createdAt: new Date().toISOString(), completedAt: null,
        subtasks: []
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

// --- Weekly Review Checklist Completion & Streaks ---
function toggleReview(id) {
    data.reviewChecklist[id] = !data.reviewChecklist[id];
    saveData(data);
    
    const checklistIds = ['collect', 'empty-head', 'process-inbox', 'review-next', 'review-projects', 'review-waiting', 'review-someday', 'review-calendar', 'creative'];
    const allCompleted = checklistIds.every(cid => data.reviewChecklist[cid]);
    
    if (allCompleted && !data.reviewCompletedThisWeek) {
        data.reviewCompletedThisWeek = true;
        data.reviewStreak = (data.reviewStreak || 0) + 1;
        saveData(data);
        triggerConfettiCelebration();
        toast(`🎉 Weekly Review Completed! Streak: ${data.reviewStreak} weeks!`);
    }
    
    renderView();
}
function resetReview() {
    data.reviewChecklist = {};
    data.reviewCompletedThisWeek = false;
    saveData(data);
    renderView(); toast('Checklist reset');
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
    msg += `\n\nYour checklist:\n${buildPendingList()}`;
    sendNotification(msg);
}

// --- SMS & Backup Tabbed Settings Modal ---
// --- SMS & Backup Tabbed Settings Modal ---
function updateWaProviderUI(provider) {
    document.querySelectorAll('.wa-provider-section').forEach(el => {
        el.style.display = 'none';
    });
    const activeSection = document.getElementById(`wa-section-${provider}`);
    if (activeSection) {
        activeSection.style.display = 'block';
    }
}

function readSettingsFromUI() {
    smsSettings.waProvider = document.getElementById('wa-provider').value;
    
    // CallMeBot properties
    smsSettings.waApiKey = document.getElementById('wa-api-key').value.trim();
    smsSettings.waPhone = document.getElementById('wa-phone').value.trim();
    
    // Twilio properties
    smsSettings.twilioSid = document.getElementById('twilio-sid').value.trim();
    smsSettings.twilioToken = document.getElementById('twilio-token').value.trim();
    smsSettings.twilioFrom = document.getElementById('twilio-from').value.trim();
    smsSettings.twilioTo = document.getElementById('twilio-to').value.trim();

    // Custom Webhook properties
    smsSettings.customMethod = document.getElementById('custom-method').value;
    smsSettings.customUrl = document.getElementById('custom-url').value.trim();
    smsSettings.customHeaders = document.getElementById('custom-headers').value.trim();
    smsSettings.customBody = document.getElementById('custom-body').value.trim();

    // SMS properties
    smsSettings.apiKey = document.getElementById('sms-api-key').value.trim();
    smsSettings.fromPhone = document.getElementById('sms-from-phone').value.trim();
    smsSettings.toPhone = document.getElementById('sms-to-phone').value.trim();
    
    // Switch checkboxes
    smsSettings.onCapture = document.getElementById('sms-on-capture').checked;
    smsSettings.onComplete = document.getElementById('sms-on-complete').checked;
    smsSettings.onDelegate = document.getElementById('sms-on-delegate').checked;
    if (document.getElementById('sms-on-calendar')) {
        smsSettings.onCalendar = document.getElementById('sms-on-calendar').checked;
    }
}

function showSmsSettings() {
    const provider = smsSettings.waProvider || 'callmebot';
    document.getElementById('wa-provider').value = provider;
    updateWaProviderUI(provider);

    // CallMeBot properties
    document.getElementById('wa-api-key').value = smsSettings.waApiKey || '';
    document.getElementById('wa-phone').value = smsSettings.waPhone || '';
    
    // Twilio properties
    document.getElementById('twilio-sid').value = smsSettings.twilioSid || '';
    document.getElementById('twilio-token').value = smsSettings.twilioToken || '';
    document.getElementById('twilio-from').value = smsSettings.twilioFrom || '';
    document.getElementById('twilio-to').value = smsSettings.twilioTo || '';

    // Custom Webhook properties
    document.getElementById('custom-method').value = smsSettings.customMethod || 'POST';
    document.getElementById('custom-url').value = smsSettings.customUrl || '';
    document.getElementById('custom-headers').value = smsSettings.customHeaders || '';
    document.getElementById('custom-body').value = smsSettings.customBody || '';

    // SMS properties
    document.getElementById('sms-api-key').value = smsSettings.apiKey || '';
    document.getElementById('sms-from-phone').value = smsSettings.fromPhone || '';
    document.getElementById('sms-to-phone').value = smsSettings.toPhone || '';
    
    // Switch checkboxes
    document.getElementById('sms-on-capture').checked = smsSettings.onCapture;
    document.getElementById('sms-on-complete').checked = smsSettings.onComplete;
    document.getElementById('sms-on-delegate').checked = smsSettings.onDelegate;
    if (document.getElementById('sms-on-calendar')) {
        document.getElementById('sms-on-calendar').checked = smsSettings.onCalendar !== false;
    }
    document.getElementById('sms-status').textContent = '';
    
    // Default to notifications settings tab open
    document.getElementById('tab-notifications').click();
    
    document.getElementById('sms-settings-modal').classList.add('show');
}

// Bind active toggler for change events
document.getElementById('wa-provider').addEventListener('change', e => {
    updateWaProviderUI(e.target.value);
});

document.getElementById('sms-settings-close').addEventListener('click', () => document.getElementById('sms-settings-modal').classList.remove('show'));
document.getElementById('sms-settings-modal').addEventListener('click', e => { if (e.target === e.currentTarget) document.getElementById('sms-settings-modal').classList.remove('show'); });

document.getElementById('sms-settings-save').addEventListener('click', () => {
    readSettingsFromUI();
    saveSmsSettings(smsSettings);
    toast('Settings saved');
    document.getElementById('sms-status').textContent = '✅ Settings saved!';
    document.getElementById('sms-status').style.color = 'var(--success)';
});

document.getElementById('sms-test').addEventListener('click', async () => {
    const statusEl = document.getElementById('sms-status');
    readSettingsFromUI();
    saveSmsSettings(smsSettings);
    if (!smsConfigured()) { statusEl.textContent = '❌ Fill in at least one API key, phone number, or Webhook URL'; statusEl.style.color = 'var(--danger)'; return; }
    statusEl.textContent = '⏳ Sending test notification...'; statusEl.style.color = 'var(--warning)';
    const result = await sendNotification('🧪 GTD Flow test — Notifications integration is working! Your tasks will now send reminders.');
    if (result.ok) { statusEl.textContent = '✅ Test notification sent successfully!'; statusEl.style.color = 'var(--success)'; }
    else { statusEl.textContent = '❌ Failed: ' + (result.error || 'Unknown error'); statusEl.style.color = 'var(--danger)'; }
});

// --- Tab Routing in Settings Modal ---
const tabNotifications = document.getElementById('tab-notifications');
const tabBackup = document.getElementById('tab-backup');
const bodyNotifications = document.getElementById('settings-notifications-body');
const bodyBackup = document.getElementById('settings-backup-body');

tabNotifications.addEventListener('click', () => {
    tabNotifications.classList.add('active');
    tabNotifications.style.borderBottom = '2px solid var(--accent)';
    tabNotifications.style.color = 'var(--text-primary)';
    
    tabBackup.classList.remove('active');
    tabBackup.style.borderBottom = '2px solid transparent';
    tabBackup.style.color = 'var(--text-secondary)';
    
    bodyNotifications.style.display = 'block';
    bodyBackup.style.display = 'none';
});

tabBackup.addEventListener('click', () => {
    tabBackup.classList.add('active');
    tabBackup.style.borderBottom = '2px solid var(--accent)';
    tabBackup.style.color = 'var(--text-primary)';
    
    tabNotifications.classList.remove('active');
    tabNotifications.style.borderBottom = '2px solid transparent';
    tabNotifications.style.color = 'var(--text-secondary)';
    
    bodyBackup.style.display = 'block';
    bodyNotifications.style.display = 'none';
});

// --- Export, Import (Drag/Drop), and Wipe Local Backups ---
document.getElementById('btn-export-data').addEventListener('click', () => {
    const backupObj = {
        gtd_flow_backup: true,
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: data,
        smsSettings: smsSettings
    };
    
    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `gtd_flow_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Database exported successfully!');
});

function importBackupData(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);
            if (!backup || backup.gtd_flow_backup !== true || !backup.data || !Array.isArray(backup.data.items) || !Array.isArray(backup.data.projects)) {
                toast('Invalid backup file structure!', 'error');
                return;
            }
            
            if (confirm('Importing will merge backup items and settings with your current system. Proceed?')) {
                const currentItemIds = new Set(data.items.map(i => i.id));
                backup.data.items.forEach(item => {
                    if (!currentItemIds.has(item.id)) {
                        if (!item.subtasks) item.subtasks = [];
                        data.items.push(item);
                    }
                });
                
                const currentProjectIds = new Set(data.projects.map(p => p.id));
                backup.data.projects.forEach(proj => {
                    if (!currentProjectIds.has(proj.id)) {
                        data.projects.push(proj);
                    }
                });
                
                if (backup.data.reviewChecklist) {
                    data.reviewChecklist = { ...data.reviewChecklist, ...backup.data.reviewChecklist };
                }
                if (backup.data.reviewStreak !== undefined) {
                    data.reviewStreak = Math.max(data.reviewStreak || 0, backup.data.reviewStreak);
                }
                
                if (backup.smsSettings) {
                    smsSettings = { ...smsSettings, ...backup.smsSettings };
                    saveSmsSettings(smsSettings);
                }
                
                saveData(data);
                updateBadges();
                renderView();
                toast('Database imported and merged successfully! 🎉');
                document.getElementById('sms-settings-modal').classList.remove('show');
            }
        } catch(err) {
            toast('Failed to parse backup JSON file.', 'error');
        }
    };
    reader.readAsText(file);
}

const dropzone = document.getElementById('backup-dropzone');
const fileInput = document.getElementById('backup-file-input');

dropzone.addEventListener('click', () => { fileInput.click(); });
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) { importBackupData(e.target.files[0]); }
});
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent)';
    dropzone.style.background = 'rgba(129,140,248,0.05)';
});
dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = ''; dropzone.style.background = '';
});
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = ''; dropzone.style.background = '';
    if (e.dataTransfer.files.length > 0) { importBackupData(e.dataTransfer.files[0]); }
});

document.getElementById('btn-reset-data').addEventListener('click', () => {
    if (confirm('💥 DANGER: Are you absolutely sure you want to delete all tasks, projects, settings, and review history? This action is permanent and cannot be undone!')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SMS_SETTINGS_KEY);
        data = defaultData();
        smsSettings = defaultSmsSettings();
        saveData(data);
        saveSmsSettings(smsSettings);
        updateBadges();
        renderView();
        toast('All system data wiped successfully!', 'warning');
        document.getElementById('sms-settings-modal').classList.remove('show');
    }
});

// --- Command Palette Command List ---
const commands = [
    { text: "Go to Inbox", keywords: ["go inbox", "inbox", "capture"], action: () => selectView('inbox') },
    { text: "Go to Next Actions", keywords: ["go next", "next actions", "next"], action: () => selectView('next-actions') },
    { text: "Go to Projects", keywords: ["go projects", "projects", "folder"], action: () => selectView('projects') },
    { text: "Go to Waiting For", keywords: ["go waiting", "waiting for", "delegated"], action: () => selectView('waiting-for') },
    { text: "Go to Calendar", keywords: ["go calendar", "calendar", "scheduled"], action: () => selectView('calendar') },
    { text: "Go to Someday / Maybe", keywords: ["go someday", "someday", "maybe"], action: () => selectView('someday') },
    { text: "Go to Reference", keywords: ["go reference", "reference", "notes"], action: () => selectView('reference') },
    { text: "Go to Weekly Review", keywords: ["go review", "weekly review", "review"], action: () => selectView('weekly-review') },
    { text: "Go to Completed", keywords: ["go completed", "completed", "done"], action: () => selectView('completed') },
    { text: "Open Settings", keywords: ["go settings", "settings", "backup", "sms"], action: () => showSmsSettings() }
];

function selectView(viewName) {
    const btn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (btn) btn.click();
}

function updatePaletteResults() {
    const val = document.getElementById('palette-search').value.toLowerCase().trim();
    
    let matchedCommands = [];
    if (val === '') {
        matchedCommands = [...commands];
    } else {
        matchedCommands = commands.filter(c => 
            c.text.toLowerCase().includes(val) || 
            c.keywords.some(kw => kw.includes(val))
        );
        
        if (val.length > 2) {
            matchedCommands.push({
                text: `➕ Add task: "${val}"`,
                action: () => {
                    quickAddTaskNLP(val);
                    closePalette();
                }
            });
        }
    }
    
    let matchedTasks = [];
    if (val !== '') {
        matchedTasks = data.items.filter(i => 
            !i.completed && i.title.toLowerCase().includes(val)
        ).slice(0, 5);
    }
    
    paletteVisibleResults = [];
    
    matchedCommands.forEach(c => {
        paletteVisibleResults.push({ type: 'command', text: c.text, action: c.action });
    });
    
    matchedTasks.forEach(t => {
        paletteVisibleResults.push({
            type: 'task',
            text: `📝 ${t.title} [${t.category}]`,
            action: () => { editItem(t.id); closePalette(); }
        });
    });
    
    if (paletteActiveIndex >= paletteVisibleResults.length) {
        paletteActiveIndex = Math.max(0, paletteVisibleResults.length - 1);
    }
    
    const cmdResultsEl = document.getElementById('palette-commands-results');
    if (matchedCommands.length === 0) {
        cmdResultsEl.innerHTML = '<div style="font-size:13px; color:var(--text-muted); padding:8px 12px;">No matching commands</div>';
    } else {
        cmdResultsEl.innerHTML = matchedCommands.map((c, i) => {
            const activeStyle = (i === paletteActiveIndex) ? 'background:rgba(129,140,248,0.15); border-left:3px solid var(--accent); color:var(--text-primary);' : '';
            return `
            <div class="palette-result-item" style="padding:8px 12px; font-size:13px; color:var(--text-secondary); border-radius:4px; cursor:pointer; transition:all 0.15s; ${activeStyle}" onclick="window.GTD.paletteSelect(${i})">
                ${escapeHtml(c.text)}
            </div>
            `;
        }).join('');
    }
    
    const taskResultsEl = document.getElementById('palette-tasks-results');
    const taskSectionEl = document.getElementById('palette-tasks-section');
    
    if (val === '') {
        taskSectionEl.style.display = 'none';
        taskResultsEl.innerHTML = '';
    } else {
        taskSectionEl.style.display = 'block';
        if (matchedTasks.length === 0) {
            taskResultsEl.innerHTML = '<div style="font-size:13px; color:var(--text-muted); padding:8px 12px;">No matching tasks found</div>';
        } else {
            taskResultsEl.innerHTML = matchedTasks.map((t, i) => {
                const globalIdx = matchedCommands.length + i;
                const activeStyle = (globalIdx === paletteActiveIndex) ? 'background:rgba(129,140,248,0.15); border-left:3px solid var(--accent); color:var(--text-primary);' : '';
                return `
                <div class="palette-result-item" style="padding:8px 12px; font-size:13px; color:var(--text-secondary); border-radius:4px; cursor:pointer; transition:all 0.15s; ${activeStyle}" onclick="window.GTD.paletteSelect(${globalIdx})">
                    📝 ${escapeHtml(t.title)} <span style="font-size:11px; opacity:0.6; margin-left:6px; background:var(--bg-glass); padding:1px 5px; border-radius:3px;">${t.category}</span>
                </div>
                `;
            }).join('');
        }
    }
}

function paletteSelect(idx) {
    if (paletteVisibleResults[idx]) {
        paletteVisibleResults[idx].action();
        closePalette();
    }
}

function quickAddTaskNLP(rawText) {
    let cleaned = rawText;
    if (cleaned.startsWith('add task ')) cleaned = cleaned.substring(9);
    else if (cleaned.startsWith('add ')) cleaned = cleaned.substring(4);
    
    const parsed = parseNLP(cleaned);
    if (!parsed.title) return;
    
    data.items.push({
        id: genId(), title: parsed.title, notes: '', category: 'inbox', context: parsed.context,
        projectId: '', energy: parsed.energy, timeEstimate: parsed.timeEstimate, delegatedTo: '',
        dueDate: '', dueTime: '', reminderSent: false, completed: false, createdAt: new Date().toISOString(), completedAt: null,
        subtasks: []
    });
    saveData(data); updateBadges(); renderView();
    toast(`Added "${parsed.title}" to Inbox`);
    if (smsSettings.onCapture && smsConfigured()) sendNotification(`📥 You added this to-do: "${parsed.title}"\n\nYour checklist:\n${buildPendingList()}`);
}

function openPalette() {
    paletteActiveIndex = 0;
    document.getElementById('palette-search').value = '';
    updatePaletteResults();
    document.getElementById('command-palette-modal').classList.add('show');
    setTimeout(() => { document.getElementById('palette-search').focus(); }, 50);
}

function closePalette() { document.getElementById('command-palette-modal').classList.remove('show'); }

const paletteModal = document.getElementById('command-palette-modal');
const paletteSearch = document.getElementById('palette-search');

paletteSearch.addEventListener('input', () => { paletteActiveIndex = 0; updatePaletteResults(); });
paletteSearch.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (paletteVisibleResults.length > 0) {
            paletteActiveIndex = (paletteActiveIndex + 1) % paletteVisibleResults.length;
            updatePaletteResults();
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (paletteVisibleResults.length > 0) {
            paletteActiveIndex = (paletteActiveIndex - 1 + paletteVisibleResults.length) % paletteVisibleResults.length;
            updatePaletteResults();
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (paletteVisibleResults[paletteActiveIndex]) { paletteSelect(paletteActiveIndex); }
    } else if (e.key === 'Escape') { closePalette(); }
});
paletteModal.addEventListener('click', e => { if (e.target === e.currentTarget) closePalette(); });

// --- Global Key Events (Keyboard Shortcuts & Vim Sequential Navigation) ---
let lastKeyG = false;

document.addEventListener('keydown', (e) => {
    const isEditingInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
        return;
    }
    
    if (e.key === 'Escape') {
        const modals = ['command-palette-modal', 'shortcuts-modal', 'process-modal', 'edit-modal', 'project-modal', 'sms-settings-modal', 'event-modal', 'alert-modal'];
        modals.forEach(mid => {
            const el = document.getElementById(mid);
            if (el) el.classList.remove('show');
        });
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; timerIsRunning = false; }
        return;
    }
    
    if (isEditingInput) return;
    
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const ci = document.getElementById('capture-input');
        if (ci) ci.focus();
        return;
    }
    if (e.key === '?') {
        e.preventDefault();
        document.getElementById('shortcuts-modal').classList.add('show');
        return;
    }
    
    if (lastKeyG) {
        lastKeyG = false;
        if (e.key.toLowerCase() === 'i') { e.preventDefault(); selectView('inbox'); return; }
        if (e.key.toLowerCase() === 'n') { e.preventDefault(); selectView('next-actions'); return; }
        if (e.key.toLowerCase() === 'p') { e.preventDefault(); selectView('projects'); return; }
        if (e.key.toLowerCase() === 'c') { e.preventDefault(); selectView('calendar'); return; }
        if (e.key.toLowerCase() === 'v') { e.preventDefault(); selectView('weekly-review'); return; }
    }
    
    if (e.key.toLowerCase() === 'g') {
        lastKeyG = true;
        setTimeout(() => { lastKeyG = false; }, 1000);
    }
});

const shortcutsClose = document.getElementById('shortcuts-close');
const shortcutsModal = document.getElementById('shortcuts-modal');
if (shortcutsClose) { shortcutsClose.addEventListener('click', () => { shortcutsModal.classList.remove('show'); }); }
if (shortcutsModal) { shortcutsModal.addEventListener('click', e => { if (e.target === e.currentTarget) shortcutsModal.classList.remove('show'); }); }

// --- Wire up Calendar List/Grid Toggle Buttons ---
const btnList = document.getElementById('btn-calendar-list');
const btnGrid = document.getElementById('btn-calendar-grid');

if (btnList && btnGrid) {
    btnList.addEventListener('click', () => {
        calendarViewMode = 'list';
        btnList.style.background = 'var(--bg-card-hover)';
        btnList.style.color = 'var(--text-primary)';
        btnGrid.style.background = '';
        btnGrid.style.color = '';
        renderView();
    });

    btnGrid.addEventListener('click', () => {
        calendarViewMode = 'grid';
        btnGrid.style.background = 'var(--bg-card-hover)';
        btnGrid.style.color = 'var(--text-primary)';
        btnList.style.background = '';
        btnList.style.color = '';
        renderView();
    });
}

// --- Global API ---
window.GTD = { 
    processItem, editItem, deleteItem, toggleComplete, showProjectModal, addTaskToProject, completeProject, deleteProject, toggleReview, resetReview, sendReminder, showSmsSettings,
    toggleExpandTask, toggleSubtask, addSubtask, deleteSubtask, toggleProjectSequencing, quickAddCalendarTask, prevMonth, nextMonth, paletteSelect, closeProcessModal, startProcessTimer,
    setCaptureMode
};

// --- Init ---
updateBadges();
renderView();

// --- Background Reminder Check ---
function checkReminders() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${date}`;

    data.items.forEach(item => {
        if (item.completed || item.category !== 'calendar' || !item.dueDate) return;

        // 1. Check if the event occurs on todayStr (handles recurrence check)
        if (!doesEventOccurOnDate(item, todayStr)) return;

        // 2. If it has a specific dueTime, check if we are at or past that time today
        let isDue = false;
        if (item.dueTime) {
            const targetDue = new Date(`${todayStr}T${item.dueTime}:00`);
            if (isNaN(targetDue)) return;
            isDue = (now >= targetDue);
        } else {
            // All-day event: trigger immediately when checked
            isDue = true;
        }

        if (!isDue) return;

        // 3. Check if we have already alerted/sent a reminder for *this occurrence* on todayStr.
        const recur = item.recurrence || 'none';
        let alreadyReminded = false;
        if (recur === 'none') {
            alreadyReminded = item.reminderSent;
        } else {
            alreadyReminded = (item.lastRemindedDate === todayStr);
        }

        if (alreadyReminded) return;

        // 4. Trigger reminders!
        if (recur === 'none') {
            item.reminderSent = true;
        }
        item.lastRemindedDate = todayStr;
        saveData(data);

        // A. Show In-App High-Contrast Alert Popup
        triggerInAppAlert(item, todayStr);

        // B. Trigger SMS/WhatsApp gateway notifications if smsSettings.onCalendar is enabled and configured
        if (smsSettings.onCalendar && smsConfigured()) {
            sendNotification(`⏰ Event Reminder: "${item.title}"\n${buildItemDetail(item)}`);
        }
    });
}
setInterval(checkReminders, 60000);
checkReminders();

})();
