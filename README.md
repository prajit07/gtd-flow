# ✅ GTD Flow — Getting Things Done

A premium, high-performance, dark-themed productivity web application implementing **David Allen's Getting Things Done (GTD)** methodology. Capture, clarify, organize, reflect, and engage with your life's commitments—all from a single, beautifully animated, glassmorphic dashboard.

![GTD Flow Shield](https://img.shields.io/badge/Made%20With-HTML%20%7C%20CSS%20%7C%20JS-blueviolet?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🚀 Premium Features

### 1. Core GTD Workflow
*   **📥 Inbox (Quick-Capture)**: Instantly brain-dump anything on your mind. Supports quick toggle between **Task Flow** and **Calendar Events**.
*   **🔍 Interactive Process Wizard**: Walks you step-by-step through the official GTD decision tree:
    *   *Actionable?* &rarr; **Yes**: Immediate execution (2-minute timer), Defer to Next Actions, Delegate to others, or Schedule on Calendar.
    *   *Actionable?* &rarr; **No**: Trash it, park in Someday/Maybe, or save to Reference.
*   **⚡ Context-Aware Next Actions**: Group tasks dynamically by context (`@home`, `@work`, `@errands`, `@computer`, `@phone`, `@anywhere`).
*   **📂 Multi-Step Projects**: Group related actions under defined outcomes. Supports **Sequential** task progression (hides downstream actions until the current one is completed) and **Parallel** execution. Includes visual progress bars and dynamic percentage completion tracking.
*   **⏳ Waiting For (Delegation)**: Track tasks assigned to others with contact names and follow-up dates.
*   **📅 Comprehensive Calendar**: Date/time-specific scheduling with recurrence options (Daily, Weekly, Monthly, Yearly). Supports **Chronological List View**, **Interactive Month Grid View**, and 1-click **Google Calendar export**.
*   **💭 Someday / Maybe**: Keep track of aspirations, ideas, and items to review in the future.
*   **📚 Reference Library**: Store non-actionable but valuable information and notes for easy retrieval.

### 2. ⚡ Advanced Interactions
*   **🔍 Power Command Palette (`Ctrl + K`)**: Keyboard-friendly command center to search tasks, execute actions, navigate views, or capture items using natural syntax (e.g., `go next`, `add buy groceries @errands`).
*   **🎹 Keyboard Navigation Shortcuts**: Work lightning-fast without touching your mouse:
    *   `Ctrl + K` &mdash; Open Command Palette
    *   `/` &mdash; Quick Search (Focus filter)
    *   `c` &mdash; Focus Capture Input
    *   `?` &mdash; Toggle Keyboard Shortcuts Help
    *   `Esc` &mdash; Close Modals
    *   `g` then `i` &mdash; Go to **Inbox**
    *   `g` then `n` &mdash; Go to **Next Actions**
    *   `g` then `p` &mdash; Go to **Projects**
    *   `g` then `c` &mdash; Go to **Calendar**
    *   `g` then `v` &mdash; Go to **Weekly Review**
*   **⏱️ 2-Minute Rule Timer**: Integrated circular, customizable countdown timer to help you complete quick tasks immediately without breaking your flow.
*   **📋 Collapsible Checklists (Subtasks)**: Expand any task card to add, complete, or delete subtasks with real-time checklist progress tracking.

### 3. 📱 Unified Notifications & Webhook Integration
Receive automated updates and task reminders through your preferred channel. Configure triggers for **Inbox Capture**, **Task Completion**, **Task Delegation**, or **Calendar Reminders**:

*   **💬 WhatsApp (CallMeBot)**: Free, simple legacy WhatsApp notifications.
*   **💬 WhatsApp (Twilio Sandbox)**: Reliable, production-ready WhatsApp message delivery.
*   **🔗 Custom HTTP Webhooks (POST/GET)**: Connect to self-hosted servers, n8n, Make.com, Zapier, Telegram, or Discord. Uses the `{{message}}` placeholder for fully custom payloads and headers.
*   **📱 SMS Gateway (httpSMS)**: Sends high-priority SMS notifications and task reminders directly to your mobile device via an Android gateway.

### 4. 🔄 System Reflection (Weekly Review)
*   **📊 Review Dashboard**: Key performance statistics (Inbox size, Next Actions, Waiting For, active Projects, and weekly completion count).
*   **📝 Guided Checklist**: 9-step structured review based on David Allen’s methodology to clean, clarify, and update your system weekly.
*   **🔥 Streak Tracker**: Track and maintain your weekly review habits with a streak counter.

### 5. 💾 Security, Privacy & Design
*   **🎨 Premium Dark Aesthetics**: Modern glassmorphism design, beautiful gradients, subtle backdrop filters, interactive animations, and ambient background floating orbs.
*   **🎉 Gamified Achievements**: Animated confetti celebrations when you achieve **Inbox Zero** or complete tasks.
*   **🔒 100% Client-Side Privacy**: No external databases, trackers, or user logins. Your data never leaves your browser.
*   **💾 Robust Backup System**: Easily **Export Database (JSON)** to save a `gtd_backup.json` file locally, or drag-and-drop to **Restore Database** at any time.

---

## 📁 Project Structure

```
├── index.html     # Main application UI layout, modals, command palette, and settings
├── styles.css     # Premium dark theme styling, glassmorphism tokens, and keyframes
├── app.js         # Core application engine, NLP parsing, routing, and API connections
├── LICENSE        # MIT License
└── README.md      # You are here!
```

> [!NOTE]
> This is a zero-dependency project. It requires no bundlers, compilation, or web servers. Simply open `index.html` in any modern web browser to start using it!

---

## 🛠️ Getting Started

### Basic Setup
1.  **Clone / Download** this repository to your local machine:
    ```bash
    git clone https://github.com/prajit07/gtd-flow.git
    ```
2.  Open [index.html](file:///C:/Users/praji/OneDrive/Desktop/PROJECT/Getting%20Things%20Done%20Todo%20app/index.html) in your favorite browser.
3.  Add tasks in the top capture bar and click **🔍 (Process)** on any item in your Inbox to organize it.

### Notification Gateways Configuration
To configure reminders, click **📱 Notifications** in the sidebar settings menu.

#### Option A: WhatsApp via CallMeBot (Free & Quick)
1.  Add `+34 644 47 43 14` to your phone's contacts (name it "CallMeBot").
2.  Send the following WhatsApp message to it: `I allow callmebot to send me messages`.
3.  The bot will reply with your personal **API Key**.
4.  In the GTD Flow notifications modal, select **WhatsApp via CallMeBot**, enter your API Key and your phone number (including country code, e.g., `+1234567890`), and save.

#### Option B: WhatsApp via Twilio (Highly Reliable)
1.  Create a free account at [twilio.com](https://www.twilio.com).
2.  Navigate to the **Twilio Sandbox for WhatsApp** in the Twilio Console.
3.  Join the sandbox by sending the unique code (e.g., `join word-word`) to `+1 415 523 8886`.
4.  In the GTD Flow settings, select **WhatsApp via Twilio**, enter your **Account SID**, **Auth Token**, **Sandbox Sender Number**, and **Receiver Number**.

#### Option C: Custom HTTP Webhooks
Select **Custom HTTP Webhook API** in settings to integrate with automation tools like n8n or Make:
*   **Method**: `POST` or `GET`
*   **Request URL**: E.g., `https://n8n.yourdomain.com/webhook/gtd?msg={{message}}`
*   **Custom Headers**: Input as a valid JSON object (e.g., `{"Authorization": "Bearer token"}`).
*   **Request Body Template** (for POST): E.g., `{"text": "{{message}}"}`.

#### Option D: SMS via httpSMS
1.  Sign up for an account at [httpsms.com](https://httpsms.com).
2.  Install the **httpSMS Android application** on an active Android phone.
3.  In the GTD Flow settings, input your **httpSMS API Key**, your **Android Sender Phone Number**, and your **Receiver Phone Number**.

---

## 📖 The GTD Methodology

**Getting Things Done (GTD)** is the groundbreaking work-life management system by productivity pioneer David Allen. The core philosophy is simple:

> *"Your mind is for having ideas, not holding them."*

The system is built around 5 key steps practiced daily and weekly:
1.  **Capture**: Collect everything that has your attention into a trusted place outside your head.
2.  **Clarify**: Decide if items are actionable. If yes, determine the next physical action; if no, discard, incubate, or file.
3.  **Organize**: File actions, dates, projects, and reference items into their respective, clean lists.
4.  **Reflect**: Do regular reviews (Weekly Reviews) to update, clean, and align your commitments.
5.  **Engage**: Make trusted choices on what to do in any given moment based on your context, time, and energy.

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/prajit07">Prajit Janakiraman</a><br>
  <em>Designed to free your mind so you can focus on what matters.</em>
</p>
