// --- State Management (Step 2 & 9) ---
let tasks = JSON.parse(localStorage.getItem('ai_tasks')) || [
    { id: 1, title: 'Build the futuristic UI', tags: ['project'], due: 'Today', done: true },
    { id: 2, title: 'Connect Claude Sonnet', tags: ['ai', 'coding'], due: 'Tomorrow', done: false }
];
let nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
let currentFilter = 'all';

// Global memory — stores full conversation
let conversationHistory = JSON.parse(localStorage.getItem('ai_history')) || [];
let taskMemory = JSON.parse(localStorage.getItem('ai_task_memory')) || []; // remembers everything spoken

// --- DOM Elements ---
const taskListEl = document.getElementById('task-list');
const micBtn = document.getElementById('mic-btn');
const transcriptBox = document.getElementById('transcript-box');
const aiResponseBox = document.getElementById('ai-response-box');

// --- Render Function (Step 3 & 10) ---
function render() {
    // Update Stats (Step 10)
    document.getElementById('stat-total').textContent = tasks.length;
    document.getElementById('stat-done').textContent = tasks.filter(t => t.done).length;
    document.getElementById('stat-pending').textContent = tasks.filter(t => !t.done).length;

    // Filter tasks (Step 9)
    const filteredTasks = getFiltered();

    // Use View Transitions API if available
    if (document.startViewTransition) {
        document.startViewTransition(() => updateDOM(filteredTasks));
    } else {
        updateDOM(filteredTasks);
    }

    // Persist
    localStorage.setItem('ai_tasks', JSON.stringify(tasks));
    localStorage.setItem('ai_history', JSON.stringify(conversationHistory));
    localStorage.setItem('ai_task_memory', JSON.stringify(taskMemory));
}

function updateDOM(filteredTasks) {
    if (filteredTasks.length === 0) {
        taskListEl.innerHTML = `<div class="empty-state">No tasks found.</div>`;
        return;
    }

    taskListEl.innerHTML = filteredTasks.map(t => `
        <div class="task-card ${t.done ? 'done' : ''}" style="view-transition-name: task-${t.id}">
            <div class="checkbox ${t.done ? 'checked' : ''}" onclick="toggleTask(${t.id})"></div>
            
            <div class="task-content">
                <span class="task-title">${t.title}</span>
                <div class="task-meta">
                    ${t.due ? `<span>📅 ${t.due}</span>` : ''}
                    ${t.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    
                    <!-- ALARM SECTION -->
                    ${t.alarm
                      ? `<span class="alarm-badge" onclick="cancelAlarm(${t.id})">
                           ⏰ ${t.alarm} ✕
                         </span>`
                      : `<input 
                           type="time" 
                           class="alarm-input"
                           title="Set alarm"
                           onchange="handleAlarmInput(${t.id}, this.value)"
                         />`
                    }
                </div>
            </div>
            <button class="delete-btn" onclick="deleteTask(${t.id})">✕</button>
        </div>
    `).join('');
}

function getFiltered() {
    if (currentFilter === 'all') return tasks;
    if (currentFilter === 'pending') return tasks.filter(t => !t.done);
    return tasks.filter(t => t.tags.includes(currentFilter));
}

// --- Action Functions (Step 4) ---
function toggleTask(id) {
    const t = tasks.find(x => x.id === id);
    if (t) {
        t.done = !t.done;
        render();
    }
}

function deleteTask(id) {
    tasks = tasks.filter(x => x.id !== id);
    render();
}

function addTask(title, tags = [], due = 'Today') {
    tasks.unshift({ id: nextId++, title, tags, due, done: false });
    render();
}

// --- Web Speech API (Step 5) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    micBtn.onclick = () => {
        recognition.start();
        micBtn.classList.add('recording');
        transcriptBox.innerHTML = '<span class="placeholder">Listening...</span>';
    };

    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        transcriptBox.textContent = `"${text}"`;
        micBtn.classList.remove('recording');
        processCommand(text);
    };

    recognition.onerror = () => {
        micBtn.classList.remove('recording');
        transcriptBox.textContent = "Error: Couldn't hear you clearly.";
    };

    recognition.onend = () => {
        micBtn.classList.remove('recording');
    };
} else {
    micBtn.disabled = true;
    micBtn.title = "Speech recognition not supported in this browser.";
}

// --- AI Daily Summary (Step 12) ---
async function speakDailySummary() {
  const taskList = tasks.map(t =>
    `${t.title}, tagged as ${t.tags.join(' and ')}, due ${t.due}, ${t.done ? 'completed' : 'pending'}`
  ).join('. ');

  aiResponseBox.innerHTML = '<span class="placeholder">AI is preparing your summary...</span>';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: 'You are a productivity assistant. Summarize the tasks in 2-3 spoken sentences. Be motivating and concise. Mention urgent ones first. Use a friendly, natural tone.',
        messages: [{ role: 'user', content: `My tasks: ${taskList}` }]
      })
    });

    const data = await response.json();
    if (data.error) {
       aiResponseBox.textContent = 'Error: ' + data.error.message;
       return;
    }

    const summary = data.choices[0].message.content;

    // Speak it out loud
    const utterance = new SpeechSynthesisUtterance(summary);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);

    aiResponseBox.textContent = summary;
  } catch (err) {
    aiResponseBox.textContent = 'Connection error: ' + err.message;
  }
}

// --- AI Orchestration (Step 6, 7 & 8) ---

function showMessage(msg) {
    aiResponseBox.textContent = msg;
}

function buildPrompt() {
  const taskList = tasks.length > 0
    ? tasks.map(t =>
        `[ID:${t.id}] "${t.title}" tags:${t.tags.join(',')} due:${t.due} alarm:${t.alarm || 'none'} done:${t.done}`
      ).join('\n')
    : 'No tasks yet.';

  const recentMemory = taskMemory.slice(-5)
    .map(m => `[${m.date} ${m.time}] "${m.text}"`)
    .join('\n');

  return `You are a smart voice task manager with memory.
You remember everything the user has said previously.
 
RECENT COMMANDS HISTORY:
${recentMemory}
 
CURRENT TASKS:
${taskList}
 
RULES:
- Understand casual and natural speech
- "remind me at 3pm", "alarm for 9am", "wake me at 7" → extract alarm time
- "add", "create", "new", "I need to" → add task
- "done", "completed", "finished" → complete task by keyword match
- "delete", "remove", "clear" → delete task
- "what did I say", "remember when" → use conversation history to answer
- If user references something from earlier conversation, use that context
- Always extract alarm time if mentioned anywhere in the command
- Guess tags: work / personal / health / urgent
 
RESPOND ONLY WITH THIS EXACT JSON (no markdown):
{
  "action": "add" | "complete" | "delete" | "query" | "none",
  "tasks_to_add": [
    {
      "title": "task title",
      "tags": ["work"],
      "due": "Today",
      "alarm": "15:00"
    }
  ],
  "task_ids_to_complete": [],
  "task_ids_to_delete": [],
  "message": "friendly response"
}`;
}

async function processCommand(text) {
  aiResponseBox.innerHTML = '<span class="placeholder">AI is thinking...</span>';

  // Save everything user says to memory
  taskMemory.push({
    text: text,
    time: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString()
  });

  // Add user message to conversation history
  conversationHistory.push({
    role: 'user',
    content: text
  });

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: buildPrompt(),
        messages: conversationHistory  // send full history not just one message
      })
    });

    const data = await response.json();
    console.log('Full API response:', JSON.stringify(data, null, 2));

    if (data.error) {
      showMessage('Error: ' + data.error.message);
      return;
    }

    const raw = data.choices[0].message.content;

    // Save AI reply to history so it remembers context
    conversationHistory.push({
      role: 'assistant',
      content: raw
    });

    // Keep history to last 20 messages to avoid token overflow
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      showMessage('Could not parse AI response.');
      return;
    }

    applyActions(parsed, text);

  } catch (err) {
    console.error('processCommand error:', err.message);
    showMessage('Connection error: ' + err.message);
  }
}

function applyActions(parsed, originalText) {
  const nothingDone =
    !parsed.tasks_to_add?.length &&
    !parsed.task_ids_to_complete?.length &&
    !parsed.task_ids_to_delete?.length;

  if (nothingDone && parsed.action !== 'query' && parsed.action !== 'none') {
    tasks.unshift({
      id: nextId++,
      title: originalText,
      tags: ['personal'],
      due: 'Today',
      alarm: null,
      done: false
    });
    render();
    showMessage(`Added "${originalText}" as a new task.`);
    return;
  }

  // Add tasks and set alarms
  parsed.tasks_to_add?.forEach(t => {
    const newTask = {
      id: nextId++,
      title: t.title,
      tags: t.tags || ['personal'],
      due: t.due || 'Soon',
      alarm: t.alarm || null,
      done: false
    };
    tasks.unshift(newTask);

    // Set alarm if time was provided
    if (t.alarm) {
      const alarmTime = setAlarm(newTask.id, newTask.title, t.alarm);
      showMessage(`Task added with alarm set for ${alarmTime}`);
    }
  });

  parsed.task_ids_to_complete?.forEach(id => {
    const t = tasks.find(x => x.id === id);
    if (t) {
      t.done = true;
      // Cancel alarm if task is completed
      if (activeAlarms[id]) {
        clearTimeout(activeAlarms[id]);
        delete activeAlarms[id];
      }
    }
  });

  parsed.task_ids_to_delete?.forEach(id => {
    tasks = tasks.filter(x => x.id !== id);
    if (activeAlarms[id]) {
      clearTimeout(activeAlarms[id]);
      delete activeAlarms[id];
    }
  });

  render();
  if (parsed.message) showMessage(parsed.message);
}

// ---- ALARM SYSTEM ----

// Request notification permission on load
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log('Notification permission:', permission);
    });
  }
}
requestNotificationPermission();

// Store active alarms
let activeAlarms = {};

function setAlarm(taskId, taskTitle, alarmTime) {
  if (!alarmTime) return;

  // Parse alarm time — expects "HH:MM" format
  const [hours, minutes] = alarmTime.split(':').map(Number);
  const now = new Date();
  const alarmDate = new Date();
  alarmDate.setHours(hours, minutes, 0, 0);

  // If time already passed today, set for tomorrow
  if (alarmDate <= now) {
    alarmDate.setDate(alarmDate.getDate() + 1);
  }

  const msUntilAlarm = alarmDate - now;
  const timeString = alarmDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  console.log(`Alarm set for task "${taskTitle}" at ${timeString} (in ${Math.round(msUntilAlarm / 60000)} minutes)`);

  // Clear existing alarm for this task if any
  if (activeAlarms[taskId]) {
    clearTimeout(activeAlarms[taskId]);
  }

  // Set the alarm
  activeAlarms[taskId] = setTimeout(() => {
    fireAlarm(taskTitle);
    delete activeAlarms[taskId];
  }, msUntilAlarm);

  return timeString;
}

function fireAlarm(taskTitle) {
  // Play sound
  playAlarmSound();

  // Show browser notification
  if (Notification.permission === 'granted') {
    const notification = new Notification('Task Reminder', {
      body: taskTitle,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'task-alarm',
      requireInteraction: true  // stays until user dismisses
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

  // Also show in-app alert
  showMessage(`ALARM: ${taskTitle}`);
  showAlarmBanner(taskTitle);
}

function playAlarmSound() {
  // Generate alarm beep using Web Audio API — no file needed
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  function beep(freq, start, duration) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration);
  }

  // Three beeps
  beep(880, 0,    0.2);
  beep(880, 0.3,  0.2);
  beep(1060, 0.6, 0.4);
}

function showAlarmBanner(taskTitle) {
  // Create a banner that appears at top of screen
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #7F77DD;
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 500;
    z-index: 9999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    text-align: center;
    max-width: 320px;
  `;
  banner.innerHTML = `
    <div style="font-size:11px;opacity:0.8;margin-bottom:4px">REMINDER</div>
    <div>${taskTitle}</div>
    <button onclick="this.parentElement.remove()" style="
      margin-top:10px;background:rgba(255,255,255,0.2);
      border:none;color:white;padding:6px 16px;
      border-radius:6px;cursor:pointer;font-size:12px
    ">Dismiss</button>
  `;
  document.body.appendChild(banner);

  // Auto remove after 30 seconds
  setTimeout(() => banner.remove(), 30000);
}

// --- UI Logic & Listeners ---

// Filter Buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
        currentFilter = btn.dataset.filter;
        updateActiveFilterUI();
        render();
    };
});

function updateActiveFilterUI() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === currentFilter);
    });
}

// Called when user picks a time from the input
function handleAlarmInput(taskId, timeValue) {
  if (!timeValue) return;

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Save alarm time to task
  task.alarm = timeValue;

  // Use your existing setAlarm function
  const alarmLabel = setAlarm(taskId, task.title, timeValue);

  showMessage(`Alarm set for "${task.title}" at ${alarmLabel}`);
  render();
}

// Called when user clicks the alarm badge to cancel
function cancelAlarm(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Clear the timeout
  if (activeAlarms[taskId]) {
    clearTimeout(activeAlarms[taskId]);
    delete activeAlarms[taskId];
  }

  // Remove alarm from task
  task.alarm = null;
  showMessage(`Alarm cancelled for "${task.title}"`);
  render();
}

// Initial Render & Restoration
function init() {
  updateActiveFilterUI();
  render();
  
  // Restore alarms for any tasks that have them
  tasks.forEach(t => {
    if (t.alarm && !t.done) {
      setAlarm(t.id, t.title, t.alarm);
    }
  });

  console.log("App initialized. Voice AI ready and Alarms restored.");
}

init();
