# ✅ GTD Flow — Getting Things Done

A premium, dark-themed productivity web app implementing **David Allen's Getting Things Done (GTD)** methodology. Capture, clarify, organize, reflect, and engage with your tasks — all from a single page.

![GTD Flow Screenshot](https://img.shields.io/badge/Made%20With-HTML%20%7C%20CSS%20%7C%20JS-blueviolet?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🚀 Features

### Core GTD Workflow
- **📥 Inbox** — Quick-capture bar to brain-dump anything on your mind
- **🔍 Process** — Interactive modal walks you through the GTD decision tree:
  - *Actionable?* → Do it now (< 2 min), Delegate, Defer, or Schedule
  - *Not actionable?* → Trash, Someday/Maybe, or Reference
- **⚡ Next Actions** — Tasks grouped by context (`@home`, `@work`, `@errands`, `@computer`, `@phone`, `@anywhere`)
- **📂 Projects** — Multi-step outcomes with visual progress bars and linked tasks
- **⏳ Waiting For** — Track delegated items with follow-up dates
- **📅 Calendar** — Date and time-specific actions sorted chronologically, with 1-click **Google Calendar export**
- **💭 Someday / Maybe** — Park ideas for future consideration
- **📚 Reference** — File non-actionable info for later use

### Weekly Review
- Dashboard with live stats (inbox count, next actions, waiting, projects, completed this week)
- 9-step review checklist based on David Allen's process
- Resettable each week

### 📱 SMS Notifications (httpSMS)
- Integrates with [httpSMS](https://httpsms.com) open-source SMS gateway
- **Auto-notifications** when you:
  - Capture a new to-do
  - Complete a task
  - Delegate a task
- **Per-task SMS reminders** — click 📱 on any task to send yourself a reminder
- **Automated Event Reminders** — receive an SMS exactly at the scheduled time of a calendar event (requires app to remain open)
- Every SMS includes your **full pending checklist** and deadline details
- **Send Test SMS** button to verify your setup

### Data & Design
- 💾 **Persistent** — All data saved in `localStorage` (survives page refreshes)
- 🎨 **Premium dark theme** — Glassmorphism, ambient floating orbs, smooth animations
- 📱 **Responsive** — Works on desktop and mobile
- 🔍 **Search** — Filter tasks across all views
- 🔒 **Private** — No server, no tracking, everything stays in your browser

---

## 📁 Project Structure

```
├── index.html    # Main HTML — layout, sidebar, modals
├── styles.css    # Premium dark glassmorphism theme
├── app.js        # Full GTD logic + httpSMS integration
└── README.md     # You are here
```

**Zero dependencies. No build step. Just open `index.html` in your browser.**

---

## 🛠️ Getting Started

### Basic Usage
1. Clone or download this repo
2. Open `index.html` in any modern browser
3. Start capturing tasks in the inbox
4. Process them using the GTD decision tree

### SMS Setup (Optional)
1. Sign up at [httpsms.com](https://httpsms.com)
2. Install the **httpSMS Android app** on your phone
3. Sign in with your API key in the app
4. In GTD Flow, click **📱 SMS Settings** in the sidebar
5. Enter your API key, sender phone (your Android device), and receiver phone
6. Enable the notification triggers you want
7. Click **Send Test SMS** to verify

---

## 📖 About GTD

**Getting Things Done (GTD)** is a productivity methodology by David Allen. The core idea:

> *"Your mind is for having ideas, not holding them."*

The 5 steps:
1. **Capture** — Collect everything that has your attention
2. **Clarify** — Determine what each item means and what action is required
3. **Organize** — Put items where they belong
4. **Reflect** — Review your system regularly
5. **Engage** — Take action with confidence

This app digitizes the entire workflow.

---

## 📸 Screenshots

| Inbox | Process Modal | SMS Settings |
|-------|---------------|--------------|
| Capture thoughts instantly | GTD decision tree | httpSMS integration |

---

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Open issues for bugs or feature requests
- Submit pull requests
- Suggest UI/UX improvements

---

## 📄 License

This project is licensed under the **MIT License** — free to use, modify, and distribute.

---

<p align="center">
  Built with ❤️ using vanilla HTML, CSS, and JavaScript<br>
  <em>Inspired by David Allen's "Getting Things Done"</em>
</p>
