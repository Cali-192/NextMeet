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
let isRecording = false;
let captionsActive = false;

// Variablat për Record, AI Blur dhe Whiteboard
let mediaRecorder;
let recordedChunks = [];
let selfieSegmentation;
let isBlurActive = false;
let canvasElement, canvasCtx;
let wbCanvas, wbCtx, drawing = false;
let recognition; // Për Captions

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
    
    if (document.getElementById('local-name-display')) 
        document.getElementById('local-name-display').innerText = emri;
    if (document.getElementById('local-participant-name')) 
        document.getElementById('local-participant-name').innerText = emri + " (Ti)";
    
    if (authOverlay) {
        authOverlay.style.opacity = '0';
        setTimeout(() => {
            authOverlay.style.display = 'none';
        }, 500);
    }

    initMedia();
    monitorNetwork();
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
            localVideo.muted = true; // FIX: Mbron nga zhurma (Feedback Loop)
            localVideo.play().catch(e => console.warn("Video blocked"));
        }
        
        peer.on('call', call => {
            pendingCall = call;
            const lobby = document.getElementById('lobby-modal');
            if (lobby) lobby.classList.remove('d-none');
            playNotificationSound(); 
        });

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

// --- 3. PeerJS Setup & Network Monitoring ---
peer.on('open', id => {
    const myIdDisplay = document.getElementById('my-id');
    if (myIdDisplay) myIdDisplay.innerText = id;
});

function monitorNetwork() {
    const statusTag = document.getElementById('network-text');
    setInterval(() => {
        if (peer.disconnected || peer.destroyed) {
            statusTag.innerText = "LIDHJA: SHKËPUTUR";
            statusTag.style.color = "#ff4757";
        } else if (dataConn && dataConn.open) {
            statusTag.innerText = "LIDHJA: SUPER";
            statusTag.style.color = "#00e676";
        } else {
            statusTag.innerText = "LIDHJA: NE PRITJE";
            statusTag.style.color = "#ffb800";
        }
    }, 3000);
}

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
                if (waiting) waiting.classList.add('hidden'); // FIX: Zhduk overlay-n e pritjes
            }
        });

        dataConn = peer.connect(pendingCall.peer);
        setupDataListeners();
    }
};

// --- 4. Inicializimi i Eventeve ---
document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
        connectBtn.onclick = () => {
            const idInput = document.getElementById('remote-id-input');
            const id = idInput ? idInput.value.trim() : null;
            if (!id) return alert("Shkruaj ID-në e partnerit!");
            
            const call = peer.call(id, myStream);
            currentPeerCall = call;
            
            const waiting = document.getElementById('waiting-overlay');
            if (waiting) waiting.classList.remove('hidden');

            call.on('stream', s => { 
                const remoteVideo = document.getElementById('remote-video');
                if (remoteVideo) {
                    remoteVideo.srcObject = s; 
                    if (waiting) waiting.classList.add('hidden'); // FIX: Zhduk overlay-n
                }
            });

            dataConn = peer.connect(id);
            setupDataListeners();
        };
    }

    const sendBtn = document.getElementById('send-chat');
    if (sendBtn) {
        sendBtn.onclick = () => {
            const input = document.getElementById('chat-input');
            if(!input || !input.value.trim()) return;
            const mesazhi = input.value.trim();
            appendMessage(mesazhi, 'self');
            if(dataConn && dataConn.open) dataConn.send({type: 'chat', msg: mesazhi, user: userName});
            input.value = "";
        };
    }
});

// --- FUNKSIONET E KONTROLLIT TË BUTONAVE ---

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

window.toggleScreenShare = async function() {
    try {
        if (!screenStream) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const videoTrack = screenStream.getVideoTracks()[0];
            
            if (currentPeerCall) {
                const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(videoTrack);
            }

            document.getElementById('local-video').srcObject = screenStream;
            videoTrack.onended = () => stopScreenShare();
            document.getElementById('screen-btn').classList.add('btn-primary');
        } else {
            stopScreenShare();
        }
    } catch (err) { console.error(err); }
};

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }
    const videoTrack = myStream.getVideoTracks()[0];
    if (currentPeerCall) {
        const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
        sender.replaceTrack(videoTrack);
    }
    document.getElementById('local-video').srcObject = myStream;
    document.getElementById('screen-btn').classList.remove('btn-primary');
}

window.toggleWhiteboard = function() {
    const wb = document.getElementById('whiteboard-overlay');
    const isVisible = wb.style.display === 'flex';
    wb.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) setupWhiteboard();
};

window.toggleParticipants = function() {
    const panel = document.getElementById('participants-panel');
    panel.classList.toggle('d-none');
};

window.toggleBlur = function() {
    if (typeof SelfieSegmentation === 'undefined') return alert("Libraria AI po ngarkohet...");
    isBlurActive = !isBlurActive;
    const btn = document.getElementById('blur-btn');
    btn.classList.toggle('btn-primary', isBlurActive);
    if (!isBlurActive) document.getElementById('local-video').srcObject = myStream;
};

// FIX: Butoni 8 - Captions (Live Speech to Text)
window.toggleCaptions = function() {
    const btn = document.getElementById('caption-btn');
    if (!('webkitSpeechRecognition' in window)) {
        return alert("Shfletuesi nuk mbështet Captions. Përdorni Chrome.");
    }

    if (!captionsActive) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'sq-AL'; 

        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1][0].transcript;
            console.log("Speech:", result);
            // Këtu mund të shtohet një div që shfaq tekstin mbi video
        };

        recognition.start();
        captionsActive = true;
        btn.classList.add('btn-active-blue');
    } else {
        recognition.stop();
        captionsActive = false;
        btn.classList.remove('btn-active-blue');
    }
};

// FIX: Butoni 9 - Record (Regjistrim Takimi)
window.toggleRecord = function() {
    if (!isRecording) {
        recordedChunks = [];
        // Regjistrojmë rrymën e videos lokale (mund të shtohet edhe remoteStream)
        mediaRecorder = new MediaRecorder(myStream);
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `NextMeet_Rec_${Date.now()}.webm`;
            a.click();
        };
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('record-btn').classList.add('recording-active');
    } else {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('record-btn').classList.remove('recording-active');
    }
};

// --- LOGJIKA E WHITEBOARD ---
function setupWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    if (!wbCanvas) return;
    wbCtx = wbCanvas.getContext('2d');
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
        wbCtx.strokeStyle = document.getElementById('wb-color')?.value || "#0d6efd";
        wbCtx.lineTo(x, y);
        wbCtx.stroke();
        if(dataConn?.open) dataConn.send({type: 'draw', x: x, y: y, color: wbCtx.strokeStyle});
    };
}

// --- UTILITIES ---
function setupDataListeners() {
    if(!dataConn) return;
    dataConn.on('data', data => {
        if (data.type === 'chat') appendMessage(data.msg, 'remote', data.user);
        if (data.type === 'reaction') showReaction(data.emoji, 'remote');
        if (data.type === 'draw') {
            if(!wbCtx) return;
            wbCtx.strokeStyle = data.color;
            wbCtx.lineTo(data.x, data.y);
            wbCtx.stroke();
        }
    });
}

function appendMessage(msg, sender, remoteUser = "Partneri") {
    const chatMessages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-message shadow-sm`;
    div.innerHTML = `<span class="user">${sender === 'self' ? 'Ti' : remoteUser}</span><span class="text">${msg}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.copyMyId = function() {
    const idDisplay = document.getElementById('my-id');
    const id = idDisplay ? idDisplay.innerText : "";
    navigator.clipboard.writeText(id).then(() => alert("ID u kopjua!"));
};

window.sendReaction = function(emoji) {
    if(dataConn && dataConn.open) dataConn.send({type: 'reaction', emoji: emoji});
    showReaction(emoji, 'local');
};

function showReaction(emoji, origin) {
    const container = document.getElementById(`reaction-container-${origin}`);
    if (!container) return;
    const el = document.createElement('div');
    el.innerText = emoji;
    el.className = 'reaction-animate';
    // Pozicionim i rastësishëm horizontal për stil
    const randomOffset = Math.floor(Math.random() * 60) - 30;
    el.style.left = `calc(50% + ${randomOffset}px)`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function playNotificationSound() {
    new Audio('https://www.soundjay.com/buttons/beep-07a.mp3').play().catch(() => {});
}

window.clearWhiteboard = function() {
    if(wbCtx) wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
};

window.leaveMeeting = () => { if(confirm("Dëshiron të largohesh?")) location.reload(); };
