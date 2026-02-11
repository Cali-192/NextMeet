// NextMeet | Next-Gen Video Conferencing - Pro Suite
document.title = "NextMeet | Pro Edition";

// --- Variablat Globale ---
let myStream;
let currentPeerCall;
let dataConn;
let pendingCall = null; 
let userName = "Përdorues";
let isMicOn = true;
let isCamOn = true;
let screenStream = null;

// Variablat për Record, AI Blur dhe Whiteboard
let mediaRecorder;
let recordedChunks = [];
let selfieSegmentation;
let isBlurActive = false;
let canvasElement, canvasCtx;
let wbCanvas, wbCtx, drawing = false;

// --- KONFIGURIMI I PEERJS ---
const peer = new Peer(undefined, {
    host: '0.peerjs.com',
    secure: true,
    port: 443,
    debug: 1
});

// --- 1. LOGIN & HYRJA ---
window.startMeeting = function() {
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('meeting-pass-input');
    const authOverlay = document.getElementById('auth-overlay');
    
    if (!nameInput) return;

    const emri = nameInput.value.trim();
    const pass = passInput ? passInput.value.trim() : "";

    if (!emri) return alert("Ju lutem shkruani emrin!");
    if (pass !== "1234") return alert("Fjalëkalimi i pasaktë!");
    
    userName = emri;
    
    // Përditëso UI menjëherë
    if (document.getElementById('local-name-display')) 
        document.getElementById('local-name-display').innerText = emri;
    if (document.getElementById('local-participant-name')) 
        document.getElementById('local-participant-name').innerText = emri + " (Ti)";
    
    // Fsheh overlay-in
    if (authOverlay) {
        authOverlay.style.opacity = '0';
        setTimeout(() => {
            authOverlay.style.display = 'none';
        }, 500);
    }

    // Nis median
    initMedia();
};

// --- 2. Kamera dhe Mikrofoni ---
async function initMedia() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 }, 
            audio: true 
        });
        
        myStream = stream;
        const localVideo = document.getElementById('local-video');
        if (localVideo) {
            localVideo.srcObject = stream;
            localVideo.muted = true;
            localVideo.play().catch(e => console.warn("Video blocked"));
        }
        
        // Dëgjo për thirrje hyrëse
        peer.on('call', call => {
            pendingCall = call;
            const lobby = document.getElementById('lobby-modal');
            if (lobby) lobby.classList.remove('d-none');
            playNotificationSound(); 
        });

        // Dëgjo për lidhje të dhënash (Chat/Reactions)
        peer.on('connection', conn => {
            dataConn = conn;
            setupDataListeners();
        });

        setTimeout(() => {
            setupWhiteboard();
            if (typeof SelfieSegmentation !== 'undefined') setupAIBlur();
        }, 1000);

    } catch (err) {
        console.error("Media Error:", err);
        alert("Gabim në qasjen e medias. Kontrolloni lejet e kamerës.");
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
            if (remoteVideo) {
                remoteVideo.srcObject = userStream;
                const waiting = document.getElementById('waiting-overlay');
                if (waiting) waiting.classList.add('d-none');
            }
        });

        // Krijojmë lidhjen e të dhënave automatikisht pas pranimit të thirrjes
        dataConn = peer.connect(pendingCall.peer);
        setupDataListeners();
    }
};

// --- 4. Inicializimi i Eventeve ---
document.addEventListener('DOMContentLoaded', () => {
    // Butoni Connect
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
        connectBtn.onclick = () => {
            const idInput = document.getElementById('remote-id-input');
            const id = idInput ? idInput.value.trim() : null;
            if (!id) return alert("Shkruaj ID-në e partnerit!");
            
            const call = peer.call(id, myStream);
            currentPeerCall = call;
            
            const waiting = document.getElementById('waiting-overlay');
            if (waiting) waiting.classList.remove('d-none');

            call.on('stream', s => { 
                const remoteVideo = document.getElementById('remote-video');
                if (remoteVideo) {
                    remoteVideo.srcObject = s; 
                    if (waiting) waiting.classList.add('d-none');
                }
            });

            dataConn = peer.connect(id);
            setupDataListeners();
        };
    }

    // Butoni Chat (Enter key support)
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('send-chat').click();
        });
    }

    const sendBtn = document.getElementById('send-chat');
    if (sendBtn) {
        sendBtn.onclick = () => {
            const input = document.getElementById('chat-input');
            if(!input || !input.value.trim()) return;
            
            const mesazhi = input.value.trim();
            appendMessage(mesazhi, 'self');
            
            if(dataConn && dataConn.open) {
                dataConn.send({type: 'chat', msg: mesazhi, user: userName});
            }
            input.value = "";
        };
    }
});

// --- FUNKSIONET E KONTROLLIT ---

window.toggleMic = function() {
    if (!myStream) return;
    isMicOn = !isMicOn;
    myStream.getAudioTracks()[0].enabled = isMicOn;
    const btn = document.getElementById('mic-btn');
    if(btn) {
        btn.classList.toggle('btn-danger', !isMicOn);
        btn.innerHTML = isMicOn ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    }
};

window.toggleCam = function() {
    if (!myStream) return;
    isCamOn = !isCamOn;
    myStream.getVideoTracks()[0].enabled = isCamOn;
    const btn = document.getElementById('camera-btn');
    if(btn) {
        btn.classList.toggle('btn-danger', !isCamOn);
        btn.innerHTML = isCamOn ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    }
};

window.toggleWhiteboard = function() {
    const wb = document.getElementById('whiteboard-overlay');
    if (!wb) return;
    const isVisible = wb.style.display === 'flex';
    wb.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) setupWhiteboard(); // Sigurohemi që canvas ka përmasat e duhura
};

function setupWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    if (!wbCanvas) return;
    wbCtx = wbCanvas.getContext('2d');
    
    // Rregullo përmasat sipas dritares
    wbCanvas.width = wbCanvas.offsetWidth;
    wbCanvas.height = wbCanvas.offsetHeight;

    wbCanvas.onmousedown = () => { drawing = true; wbCtx.beginPath(); };
    wbCanvas.onmouseup = () => { drawing = false; };
    wbCanvas.onmousemove = (e) => {
        if (!drawing) return;
        const rect = wbCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        wbCtx.lineWidth = 3;
        wbCtx.lineCap = 'round';
        wbCtx.strokeStyle = document.getElementById('wb-color')?.value || "#0d6efd";
        
        wbCtx.lineTo(x, y);
        wbCtx.stroke();

        if(dataConn && dataConn.open) {
            dataConn.send({type: 'draw', x: x, y: y, color: wbCtx.strokeStyle, isNewPath: false});
        }
    };
}

function setupDataListeners() {
    if(!dataConn) return;
    dataConn.on('data', data => {
        if (data.type === 'chat') appendMessage(data.msg, 'remote', data.user);
        if (data.type === 'reaction') showReaction(data.emoji, 'remote');
        if (data.type === 'draw') {
            wbCtx.strokeStyle = data.color;
            wbCtx.lineTo(data.x, data.y);
            wbCtx.stroke();
        }
    });
}

function appendMessage(msg, sender, remoteUser = "Partneri") {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    
    const div = document.createElement('div');
    div.className = `chat-message shadow-sm`;
    div.innerHTML = `
        <span class="user">${sender === 'self' ? 'Ti' : remoteUser}</span>
        <span class="text">${msg}</span>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.copyMyId = function() {
    const id = document.getElementById('my-id').innerText;
    navigator.clipboard.writeText(id).then(() => {
        const btn = document.querySelector('[onclick="copyMyId()"] i');
        btn.className = "fas fa-check text-success";
        setTimeout(() => btn.className = "far fa-copy", 2000);
    });
};

window.sendReaction = function(emoji) {
    if(dataConn && dataConn.open) {
        dataConn.send({type: 'reaction', emoji: emoji});
    }
    showReaction(emoji, 'local');
};

function showReaction(emoji, origin) {
    const container = document.getElementById(`reaction-container-${origin}`);
    if (!container) return;
    
    const el = document.createElement('div');
    el.innerText = emoji;
    el.className = 'reaction-animate';
    
    // Pozicionim random paksa majtas/djathtas për efekt më natyral
    const randomOffset = Math.floor(Math.random() * 40) - 20;
    el.style.left = `calc(50% + ${randomOffset}px)`;
    
    container.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

function playNotificationSound() {
    const audio = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
    audio.play().catch(e => {});
}

window.clearWhiteboard = function() {
    if(wbCtx) wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
};

window.leaveMeeting = () => { 
    if(confirm("Dëshiron të largohesh nga ky takim?")) {
        location.reload(); 
    }
};
