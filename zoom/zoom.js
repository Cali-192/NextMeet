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
    const loginBtn = document.getElementById('start-btn'); 
    
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
    
    // 1. Fsheh overlay-in menjëherë që të mos mbetet "Duke u lidhur"
    if (authOverlay) {
        authOverlay.style.display = 'none';
        authOverlay.classList.add('auth-hidden');
    }

    // 2. Nis median
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
            localVideo.play().catch(e => console.warn("Video play blocked by browser"));
        }
        
        // Dëgjo për thirrje hyrëse
        peer.on('call', call => {
            pendingCall = call;
            const lobby = document.getElementById('lobby-modal');
            if (lobby) lobby.classList.remove('d-none');
            playNotificationSound(); 
        });

        // Inicializo funksionet tjera pa bllokuar rrjedhën
        setTimeout(() => {
            setupWhiteboard();
            if (typeof SelfieSegmentation !== 'undefined') setupAIBlur();
        }, 1000);

    } catch (err) {
        console.error("Media Error:", err);
        alert("Nuk u qasëm në kamerë. Mund të vazhdoni vetëm me chat.");
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

    // Butoni Chat
    const sendBtn = document.getElementById('send-chat');
    if (sendBtn) {
        sendBtn.onclick = () => {
            const input = document.getElementById('chat-input');
            if(!input || !input.value.trim()) return;
            appendMessage(input.value, 'self');
            if(dataConn) dataConn.send({type: 'chat', msg: input.value, user: userName});
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

window.toggleBlur = async function() {
    if (typeof SelfieSegmentation === 'undefined') return alert("Libraria AI nuk është gati.");
    isBlurActive = !isBlurActive;
    const blurBtn = document.getElementById('blur-btn');
    if(blurBtn) blurBtn.classList.toggle('btn-primary', isBlurActive);
    
    if (isBlurActive) {
        requestAnimationFrame(processBlur);
    } else {
        document.getElementById('local-video').srcObject = myStream;
    }
};

function setupAIBlur() {
    canvasElement = document.createElement('canvas');
    canvasCtx = canvasElement.getContext('2d');
    selfieSegmentation = new SelfieSegmentation({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`});
    selfieSegmentation.setOptions({modelSelection: 1});
    selfieSegmentation.onResults(onBlurResults);
}

async function processBlur() {
    if (!isBlurActive) return;
    const video = document.getElementById('local-video');
    if (video && video.readyState === 4) {
        await selfieSegmentation.send({image: video});
    }
    requestAnimationFrame(processBlur);
}

function onBlurResults(results) {
    canvasElement.width = 640; canvasElement.height = 360;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalCompositeOperation = 'source-in';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalCompositeOperation = 'destination-over';
    canvasCtx.filter = 'blur(10px)';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();
}

function setupWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    if (!wbCanvas) return;
    wbCtx = wbCanvas.getContext('2d');
    wbCanvas.width = window.innerWidth;
    wbCanvas.height = window.innerHeight;

    wbCanvas.onmousedown = () => drawing = true;
    wbCanvas.onmouseup = () => { drawing = false; wbCtx.beginPath(); };
    wbCanvas.onmousemove = (e) => {
        if (!drawing) return;
        wbCtx.lineWidth = 3;
        wbCtx.lineCap = 'round';
        wbCtx.strokeStyle = document.getElementById('wb-color')?.value || "#ffffff";
        wbCtx.lineTo(e.clientX, e.clientY - 50);
        wbCtx.stroke();
        if(dataConn) dataConn.send({type: 'draw', x: e.clientX, y: e.clientY - 50, color: wbCtx.strokeStyle});
    };
}

function setupDataListeners() {
    if(!dataConn) return;
    dataConn.on('data', data => {
        if (data.type === 'chat') appendMessage(data.msg, 'remote');
        if (data.type === 'reaction') showReaction(data.emoji, 'remote');
        if (data.type === 'draw') {
            wbCtx.strokeStyle = data.color;
            wbCtx.lineTo(data.x, data.y);
            wbCtx.stroke();
        }
    });
}

function appendMessage(msg, sender) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = `message ${sender === 'self' ? 'msg-self' : 'msg-remote'} mb-2 p-2 rounded shadow-sm`;
    div.innerHTML = `<strong>${sender === 'self' ? 'Ti' : 'Partneri'}:</strong> ${msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.copyMyId = function() {
    const id = document.getElementById('my-id').innerText;
    navigator.clipboard.writeText(id).then(() => alert("ID u kopjua!"));
};

window.sendReaction = function(emoji) {
    if(dataConn) dataConn.send({type: 'reaction', emoji: emoji});
    showReaction(emoji, 'local');
};

function showReaction(emoji, origin) {
    const container = document.getElementById(`reaction-container-${origin}`);
    if (!container) return;
    const el = document.createElement('div');
    el.innerText = emoji;
    el.className = 'reaction-animate';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function playNotificationSound() {
    const audio = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
    audio.play().catch(e => {});
}

window.leaveMeeting = () => { if(confirm("Dëshiron të largohesh?")) location.reload(); };
