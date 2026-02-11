// NextMeet | Next-Gen Video Conferencing
document.title = "NextMeet | Next-Gen Video Conferencing";

// --- Variablat Globale ---
let myStream;
let currentPeerCall;
let dataConn;
let virtualBgMode = 'none';
let pendingCall = null; 
let userName = "Përdorues";

// --- KONFIGURIMI I PEERJS ---
const peer = new Peer(undefined, {
    host: '0.peerjs.com',
    secure: true,
    port: 443,
    debug: 1
});

// --- 1. LOGIN & HYRJA (E lidhur direkt me window për mobil) ---
window.startMeeting = function() {
    console.log("Butoni u klikua...");
    
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('meeting-pass-input');
    const authOverlay = document.getElementById('auth-overlay');
    const loginBtn = document.getElementById('start-btn'); 
    
    // Sigurohemi që inputet ekzistojnë në DOM
    if (!nameInput || !passInput) {
        console.error("Elementet nuk u gjetën!");
        return;
    }

    if (!nameInput.value.trim()) {
        alert("Shkruani emrin!");
        nameInput.focus();
        return;
    }

    if (passInput.value !== "1234") {
        alert("Fjalëkalimi i pasaktë!");
        passInput.value = "";
        return;
    }
    
    userName = nameInput.value.trim();
    
    // Ndryshimi i gjendjes së butonit për feedback vizual
    if (loginBtn) {
        loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Duke u lidhur...';
        loginBtn.disabled = true;
    }

    // Hiq overlay-n
    if (authOverlay) {
        authOverlay.style.display = 'none';
    }

    // Përditëso UI
    const localPartSpan = document.querySelector('#local-participant span');
    if (localPartSpan) localPartSpan.innerText = userName + " (Ti)";
    
    // Zhblloko AudioContext për mobil (duhet klikim njerëzor)
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        const audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Nis kamerën
    initMedia();
};

// --- 2. Kamera dhe Mikrofoni ---
async function initMedia() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        
        myStream = stream;
        const localVideo = document.getElementById('local-video');
        if (localVideo) {
            localVideo.srcObject = stream;
            localVideo.muted = true;
            localVideo.play().catch(e => console.error("Autoplay failed:", e));
        }
        
        // Setup për thirrjet hyrëse
        peer.on('call', call => {
            pendingCall = call;
            const lobby = document.getElementById('lobby-modal');
            if (lobby) lobby.classList.remove('d-none');
            playNotificationSound(); 
        });

    } catch (err) {
        console.error("Media Error:", err);
        alert("Gabim në aksesimin e kamerës. Sigurohu që je në HTTPS dhe ke dhënë leje.");
        // Rikthe butonin në gjendje normale nëse dështon media
        const loginBtn = document.getElementById('start-btn');
        if (loginBtn) {
            loginBtn.innerHTML = 'HYR NË TAKIM';
            loginBtn.disabled = false;
        }
    }
}

// --- 3. PeerJS Setup ---
peer.on('open', id => {
    const myIdDisplay = document.getElementById('my-id');
    if (myIdDisplay) myIdDisplay.innerText = id;
    console.log("ID-ja ime PeerJS:", id);
});

window.lobbyDecision = function(accepted) {
    const lobby = document.getElementById('lobby-modal');
    if (lobby) lobby.classList.add('d-none');
    
    if (accepted && pendingCall) {
        pendingCall.answer(myStream);
        currentPeerCall = pendingCall;
        
        pendingCall.on('stream', userStream => {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) remoteVideo.srcObject = userStream;
        });

        dataConn = peer.connect(pendingCall.peer);
        setupDataListeners();
    }
};

// --- 4. Chat & Lidhja ---
// Përdorim event listener për siguri në elementet statike
document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
        connectBtn.onclick = () => {
            const remoteIdInput = document.getElementById('remote-id-input');
            const id = remoteIdInput ? remoteIdInput.value.trim() : null;
            if (!id) return alert("Shkruaj ID-në!");
            
            const call = peer.call(id, myStream);
            currentPeerCall = call;
            
            call.on('stream', s => { 
                const remoteVideo = document.getElementById('remote-video');
                if (remoteVideo) remoteVideo.srcObject = s; 
            });

            dataConn = peer.connect(id);
            setupDataListeners();
        };
    }
});

function setupDataListeners() {
    if(!dataConn) return;
    dataConn.on('data', data => {
        if (data.type === 'chat') appendMessage(data.msg, 'remote');
        if (data.type === 'reaction') showReaction(data.emoji, 'remote');
    });
}

function appendMessage(msg, sender) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = `message ${sender === 'self' ? 'msg-self' : 'msg-remote'} mb-2 p-2 rounded shadow-sm`;
    div.innerText = msg;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

const sendChat = document.getElementById('send-chat');
if (sendChat) {
    sendChat.onclick = () => {
        const chatInput = document.getElementById('chat-input');
        if(!chatInput || !chatInput.value.trim()) return;
        appendMessage(chatInput.value, 'self');
        if(dataConn) dataConn.send({type: 'chat', msg: chatInput.value});
        chatInput.value = "";
    };
}

// --- 5. Kontrollet ---
window.copyMyId = function() { 
    const myIdEl = document.getElementById('my-id');
    if (!myIdEl) return;
    const id = myIdEl.innerText;
    navigator.clipboard.writeText(id).then(() => {
        alert("ID u kopjua!");
    }).catch(err => {
        // Fallback për disa browsera mobilë
        const textArea = document.createElement("textarea");
        textArea.value = id;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert("ID u kopjua!");
    });
};

window.leaveMeeting = function() { 
    if(confirm("Dëshiron të largohesh?")) location.reload(); 
};

window.sendReaction = function(emoji) {
    if(dataConn) dataConn.send({type: 'reaction', emoji});
    showReaction(emoji, 'local');
};

function showReaction(emoji, origin) {
    const container = document.getElementById(`reaction-container-${origin}`);
    if (!container) return;
    const el = document.createElement('div');
    el.innerText = emoji;
    el.className = 'reaction-float animate-reaction';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const context = new AudioContext();
        const osc = context.createOscillator();
        osc.connect(context.destination);
        osc.start();
        osc.stop(context.currentTime + 0.1);
    } catch(e) {}
}
