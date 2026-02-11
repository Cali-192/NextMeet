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

// --- 1. LOGIN & HYRJA (E rregulluar për shpejtësi maksimale) ---
window.startMeeting = function() {
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('meeting-pass-input');
    const authOverlay = document.getElementById('auth-overlay');
    const loginBtn = document.getElementById('start-btn'); 
    
    if (!nameInput || !passInput) return;

    if (!nameInput.value.trim()) {
        alert("Shkruani emrin!");
        return;
    }

    if (passInput.value !== "1234") {
        alert("Fjalëkalimi i pasaktë!");
        return;
    }
    
    userName = nameInput.value.trim();
    
    if (loginBtn) {
        loginBtn.innerHTML = 'Duke u lidhur...';
        loginBtn.disabled = true;
    }

    // Hiq overlay-n menjëherë
    if (authOverlay) {
        authOverlay.style.display = 'none';
    }

    // Përditëso UI
    const localPartSpan = document.querySelector('#local-participant span');
    if (localPartSpan) localPartSpan.innerText = userName + " (Ti)";
    
    // Aktivizo Audio për Browserin
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        const audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    initMedia(); // Nis kamerën pasi klikohet butoni
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
        }
        
        // Prano thirrjet automatikisht pasi jemi brenda
        peer.on('call', call => {
            pendingCall = call;
            const lobby = document.getElementById('lobby-modal');
            if (lobby) lobby.classList.remove('d-none');
            playNotificationSound(); 
        });

    } catch (err) {
        console.error("Media Error:", err);
        alert("Ju lutem jepni leje për kamerën dhe mikrofonin!");
    }
}

// --- 3. PeerJS Setup ---
peer.on('open', id => {
    const myIdDisplay = document.getElementById('my-id');
    if (myIdDisplay) myIdDisplay.innerText = id;
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
    div.className = `message ${sender === 'self' ? 'msg-self' : 'msg-remote'} mb-2 p-2 rounded`;
    div.innerText = msg;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

const sendChat = document.getElementById('send-chat');
if (sendChat) {
    sendChat.onclick = () => {
        const chatInput = document.getElementById('chat-input');
        if(!chatInput.value.trim()) return;
        appendMessage(chatInput.value, 'self');
        if(dataConn) dataConn.send({type: 'chat', msg: chatInput.value});
        chatInput.value = "";
    };
}

// --- 5. Kontrollet ---
window.copyMyId = function() { 
    const id = document.getElementById('my-id').innerText;
    navigator.clipboard.writeText(id);
    alert("ID u kopjua!");
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
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const osc = context.createOscillator();
        osc.connect(context.destination);
        osc.start();
        osc.stop(context.currentTime + 0.1);
    } catch(e) {}
}
