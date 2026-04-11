// --- State Management (Step 2 & 9) ---
let tasks = JSON.parse(localStorage.getItem('ai_tasks')) || [
    { id: 1, title: 'Build the futuristic UI', tags: ['project'], due: 'Today', done: true },
    { id: 2, title: 'Connect Claude Sonnet', tags: ['ai', 'coding'], due: 'Tomorrow', done: false }
];
let nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;
let currentFilter = 'all';

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
}

function updateDOM(filteredTasks) {
    if (filteredTasks.length === 0) {
        taskListEl.innerHTML = `<div class="empty-state">No tasks found.</div>`;
        return;
    }

    taskListEl.innerHTML = filteredTasks.map(t => `
        <div class="task-card ${t.done ? 'done' : ''}" style="view-transition-name: task-${t.id}">
            <div class="checkbox" onclick="toggleTask(${t.id})"></div>
            <div class="task-content">
                <span class="task-title">${t.title}</span>
                <div class="task-meta">
                    ${t.due ? `<span>📅 ${t.due}</span>` : ''}
                    ${t.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
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

// --- AI Orchestration (Step 6, 7 & 8) ---

function buildPrompt() {
    const taskList = tasks.map(t =>
        `[ID: ${t.id}] ${t.title} (Tags: ${t.tags.join(',')}, Done: ${t.done})`
    ).join('\n');

    return `You are a futuristic voice task manager AI.
Current tasks:
${taskList || 'None'}

The user will give you a voice command. 
Analyze if they want to:
1. Add a task ('Add...', 'Remind me to...')
2. Complete/Check a task ('Complete task 5', 'Check off the report')
3. Delete a task ('Remove...', 'Delete...')
4. Filter/View ('Show work tasks', 'Filter by urgent')

Respond ONLY with valid JSON in this format:
{
  "action": "string description",
  "tasks_to_add": [{"title": "string", "tags": ["array"], "due": "string"}],
  "task_ids_to_complete": [number],
  "task_ids_to_delete": [number],
  "filter_to_apply": "string (all/work/urgent/pending or tag name)",
  "message": "A short, friendly confirmation message"
}`;
}

async function processCommand(text) {
    aiResponseBox.innerHTML = '<span class="placeholder">AI is thinking...</span>';

    try {
        const response = await fetch('http://localhost:3002/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                system: buildPrompt(),
                messages: [{ role: 'user', content: text }]
            })
        });

        const data = await response.json();

        // ADDED: Detailed logging to see exactly what came back
        console.log('Full API response:', JSON.stringify(data, null, 2));

        // Check for API-level errors
        if (data.error) {
            console.error('Anthropic API error:', data.error);
            aiResponseBox.textContent = 'Error: ' + data.error.message;
            return;
        }

        // Safe content extraction
        if (!data.content || !data.content[0] || !data.content[0].text) {
            console.error('Unexpected response shape:', data);
            aiResponseBox.textContent = 'Unexpected response from AI.';
            return;
        }

        const raw = data.content[0].text;

        let parsed;
        try {
            // Clean markdown tags if the AI includes them
            parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        } catch (parseErr) {
            console.error('JSON parse failed. Raw text was:', raw);
            aiResponseBox.textContent = 'AI response was not valid JSON.';
            return;
        }
        
        applyActions(parsed);
    } catch (err) {
        console.error('processCommand error:', err.message);
        aiResponseBox.textContent = "Connection error: " + err.message;
    }
}

function applyActions(parsed) {
    // Apply additions
    parsed.tasks_to_add?.forEach(t => {
        tasks.unshift({ id: nextId++, ...t, done: false });
    });

    // Apply completions
    parsed.task_ids_to_complete?.forEach(id => {
        const t = tasks.find(x => x.id === id);
        if (t) t.done = true;
    });

    // Apply deletions
    parsed.task_ids_to_delete?.forEach(id => {
        tasks = tasks.filter(x => x.id !== id);
    });

    // Apply filtering if suggested
    if (parsed.filter_to_apply) {
        currentFilter = parsed.filter_to_apply;
        updateActiveFilterUI();
    }

    render();

    if (parsed.message) {
        aiResponseBox.textContent = parsed.message;
    }
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

// Initial Render
updateActiveFilterUI();
render();
console.log("App initialized. Voice AI ready.");
