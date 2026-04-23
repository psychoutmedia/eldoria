const fs = require('fs');

const TASKS_FILE = 'tasks.json';

function loadTasks() {
    try {
        const data = fs.readFileSync(TASKS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

function saveTasks(tasks) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function addTask(description, priority = 'normal') {
    const tasks = loadTasks();
    tasks.push({ description, completed: false, priority });
    saveTasks(tasks);
    const priorityLabel = priority === 'high' ? ' (high priority)' : '';
    console.log(`Added: "${description}"${priorityLabel}`);
}

function listTasks() {
    const tasks = loadTasks();
    if (tasks.length === 0) {
        console.log('No tasks yet. Add one with: node task_manager.js add "your task"');
        return;
    }
    console.log('\n=== Your Tasks ===');
    tasks.forEach((task, index) => {
        const status = task.completed ? '✓' : ' ';
        const priority = task.priority === 'high' ? ' ⚠️' : '';
        console.log(`${index + 1}. [${status}] ${task.description}${priority}`);
    });
    console.log('');
}

function markDone(num) {
    const tasks = loadTasks();
    const index = num - 1;
    if (index < 0 || index >= tasks.length) {
        console.log(`Invalid task number. You have ${tasks.length} tasks.`);
        return;
    }
    tasks[index].completed = true;
    saveTasks(tasks);
    console.log(`Completed: "${tasks[index].description}"`);
}

function deleteTask(num) {
    const tasks = loadTasks();
    const index = num - 1;
    if (index < 0 || index >= tasks.length) {
        console.log(`Invalid task number. You have ${tasks.length} tasks.`);
        return;
    }
    const removed = tasks.splice(index, 1)[0];
    saveTasks(tasks);
    console.log(`Deleted: "${removed.description}"`);
}

function showHelp() {
    console.log(`
Task Manager CLI

Usage:
  node task_manager.js add "task" [high]  - Add a task (optional: high priority)
  node task_manager.js list               - Show all tasks
  node task_manager.js done [number]      - Mark task as complete
  node task_manager.js delete [number]    - Remove a task

Example:
  node task_manager.js add "Fix bug" high   - Adds with ⚠️ priority
`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'add':
        if (args[1]) {
            const priority = args[2] === 'high' ? 'high' : 'normal';
            addTask(args[1], priority);
        } else {
            console.log('Please provide a task description: node task_manager.js add "your task"');
        }
        break;
    case 'list':
        listTasks();
        break;
    case 'done':
        if (args[1]) {
            markDone(parseInt(args[1]));
        } else {
            console.log('Please provide a task number: node task_manager.js done 1');
        }
        break;
    case 'delete':
        if (args[1]) {
            deleteTask(parseInt(args[1]));
        } else {
            console.log('Please provide a task number: node task_manager.js delete 1');
        }
        break;
    default:
        showHelp();
}
