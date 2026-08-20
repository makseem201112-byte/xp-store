let currentToken = '';
let isCloning = false;

// DOM Elements
const tokenInput = document.getElementById('token');
const verifyBtn = document.getElementById('verifyBtn');
const userInfo = document.getElementById('userInfo');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const sourceServer = document.getElementById('sourceServer');
const targetServer = document.getElementById('targetServer');
const cloneBtn = document.getElementById('cloneBtn');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressStatus = document.getElementById('progressStatus');
const logArea = document.getElementById('logArea');

// Verify Token
verifyBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
        addLog('الرجاء إدخال التوكن', 'error');
        return;
    }

    verifyBtn.disabled = true;
    verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';

    try {
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (data.success) {
            currentToken = token;
            userName.textContent = data.username;
            userAvatar.innerHTML = '<i class="fas fa-user"></i>';
            userInfo.classList.remove('hidden');
            addLog(`✅ تم التحقق بنجاح: ${data.username}`, 'success');
            
            // Load guilds
            await loadGuilds(token);
        } else {
            addLog(`❌ التوكن غير صالح: ${data.error}`, 'error');
            userInfo.classList.add('hidden');
        }
    } catch (error) {
        addLog(`❌ خطأ في التحقق: ${error.message}`, 'error');
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = '<i class="fas fa-check-circle"></i> تحقق من التوكن';
    }
});

// Load Guilds
async function loadGuilds(token) {
    try {
        const response = await fetch('/api/guilds', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (data.success) {
            // Clear existing options
            sourceServer.innerHTML = '<option value="">اختر سيرفر المصدر</option>';
            targetServer.innerHTML = '<option value="">اختر سيرفر الهدف</option>';

            // Add guilds to both selects
            data.guilds.forEach(guild => {
                const option1 = document.createElement('option');
                option1.value = guild.id;
                option1.textContent = guild.name;
                sourceServer.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = guild.id;
                option2.textContent = guild.name;
                targetServer.appendChild(option2);
            });

            addLog(`✅ تم تحميل ${data.guilds.length} سيرفر`, 'success');
        } else {
            addLog(`❌ فشل تحميل السيرفرات: ${data.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ خطأ في تحميل السيرفرات: ${error.message}`, 'error');
    }
}

// Clone Server
cloneBtn.addEventListener('click', async () => {
    if (isCloning) return;

    const sourceId = sourceServer.value;
    const targetId = targetServer.value;

    if (!sourceId || !targetId) {
        addLog('الرجاء اختيار سيرفر المصدر والهدف', 'error');
        return;
    }

    if (sourceId === targetId) {
        addLog('لا يمكن النسخ إلى نفس السيرفر', 'error');
        return;
    }

    isCloning = true;
    cloneBtn.disabled = true;
    cloneBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري النسخ...';
    progressSection.classList.remove('hidden');
    logArea.innerHTML = '';
    updateProgress(0, 'جاري التحضير...');

    try {
        const response = await fetch('/api/clone', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: currentToken,
                source_id: sourceId,
                target_id: targetId
            })
        });

        const data = await response.json();

        if (data.success) {
            addLog('🚀 بدأ عملية النسخ', 'info');
            startLogStreaming();
        } else {
            addLog(`❌ فشل بدء النسخ: ${data.error}`, 'error');
            resetCloning();
        }
    } catch (error) {
        addLog(`❌ خطأ في بدء النسخ: ${error.message}`, 'error');
        resetCloning();
    }
});

// Stream Logs
function startLogStreaming() {
    const eventSource = new EventSource('/api/logs');

    eventSource.onmessage = (event) => {
        const message = event.data.trim();
        
        if (message === 'CLONE_COMPLETE') {
            eventSource.close();
            addLog('🎉 اكتملت عملية النسخ بنجاح!', 'success');
            updateProgress(100);
            setTimeout(resetCloning, 2000);
        } else if (message) {
            addLog(message, 'info');
            
            // Update progress based on log content
            if (message.includes('Starting cloning')) {
                updateProgress(10, 'جاري بدء العملية...');
            } else if (message.includes('Cleaning target')) {
                updateProgress(20, 'جاري تنظيف السيرفر...');
            } else if (message.includes('Updating server info')) {
                updateProgress(30, 'جاري تحديث معلومات السيرفر...');
            } else if (message.includes('Copying roles')) {
                updateProgress(40, 'جاري نسخ الأدوار...');
            } else if (message.includes('Copying channels')) {
                updateProgress(60, 'جاري نسخ القنوات...');
            } else if (message.includes('Copying emojis')) {
                updateProgress(80, 'جاري نسخ الإيموجي...');
            } else if (message.includes('completed successfully')) {
                updateProgress(95, 'جاري الانتهاء...');
            }
        }
    };

    eventSource.onerror = () => {
        eventSource.close();
        addLog('❌ انقطع الاتصال بالسيرفر', 'error');
        resetCloning();
    };
}

// Add Log Entry
function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ar-EG');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'times-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    logEntry.innerHTML = `<i class="fas fa-${icon}"></i><span>[${timestamp}] ${message}</span>`;
    logArea.appendChild(logEntry);
    logArea.scrollTop = logArea.scrollHeight;
}

// Update Progress
function updateProgress(value, status = '') {
    progressFill.style.width = `${value}%`;
    progressText.textContent = `${value}%`;
    if (status) {
        progressStatus.textContent = status;
    }
}

// Reset Cloning State
function resetCloning() {
    isCloning = false;
    cloneBtn.disabled = false;
    cloneBtn.innerHTML = '<i class="fas fa-rocket"></i> بدء عملية النسخ';
    setTimeout(() => {
        progressSection.classList.add('hidden');
        updateProgress(0, 'جاري التحضير...');
    }, 3000);
}

// Toggle Password Visibility
function togglePassword() {
    const tokenInput = document.getElementById('token');
    const toggleBtn = document.querySelector('.toggle-password');
    
    if (tokenInput.type === 'password') {
        tokenInput.type = 'text';
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        tokenInput.type = 'password';
        toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// Clear Logs
function clearLogs() {
    logArea.innerHTML = '';
    addLog('👋 مرحباً بك في Discord Server Cloner', 'info');
    addLog('أدخل التوكن الخاص بك للبدء', 'info');
}

// Enable clone button when both servers are selected
sourceServer.addEventListener('change', checkCloneButton);
targetServer.addEventListener('change', checkCloneButton);

function checkCloneButton() {
    if (sourceServer.value && targetServer.value && currentToken) {
        cloneBtn.disabled = false;
    } else {
        cloneBtn.disabled = true;
    }
}

// Initial log
// Clear initial logs and add welcome message
logArea.innerHTML = '';
addLog('👋 مرحباً بك في Discord Server Cloner', 'info');
addLog('أدخل التوكن الخاص بك للبدء', 'info');
