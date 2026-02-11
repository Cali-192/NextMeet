// NextMeet | Next-Gen Video Conferencing - Professional Suite
document.title = "NextMeet | Pro Edition";

// --- Variablat Globale ---
let myStream;
let currentPeerCall;
let dataConn;
let virtualBgMode = 'none';
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
let isCaptionsActive = false;
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
    
    const emri = nameInput.value.trim();
    const pass = passInput.value.trim();

    if (!emri) return alert("Ju lutem shkruani emrin!");
    if (pass !== "1234") return alert("Fjalëkalimi i pasaktë!");
    
    userName = emri;
    
    document.getElementById('local-name-display').innerText = emri;
    document.getElementById('local-participant-name').innerText = emri + " (Ti)";
    
    if (loginBtn) {
        loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Duke u lidhur...';
        loginBtn.disabled = true;
    }

    if (authOverlay) authOverlay.classList.add('auth-hidden');

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
            localVideo.play();
        }
        
        peer.on('call', call => {
            pendingCall = call;
            document.getElementById('lobby-modal').classList.remove('d-none');
            playNotificationSound(); 
        });

        setupAIBlur();
        setupWhiteboard();

    } catch (err) {
        console.error("Media Error:", err);
        alert("Gabim në qasje të medias. Kontrollo lejet!");
    }
}

// --- 3. PeerJS Setup ---
peer.on('open', id => {
    document.getElementById('my-id').innerText = id;
});

window.lobbyDecision = function(accepted) {
    document.getElementById('lobby-modal').classList.add('d-none');
    
    if (accepted && pendingCall) {
        pendingCall.answer(myStream);
        currentPeerCall = pendingCall;
        
        pendingCall.on('stream', userStream => {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = userStream;
                document.getElementById('waiting-overlay').classList.add('d-none');
            }
        });

        dataConn = peer.connect(pendingCall.peer);
        setupDataListeners();
    }
};

// --- 4. Eventet & Kontrollet ---
document.addEventListener('DOMContentLoaded', () => {
    // Lidhu me ID
    document.getElementById('connect-btn').onclick = () => {
        const id = document.getElementById('remote-id-input').value.trim();
        if (!id) return alert("Shkruaj ID-në!");
        
        const call = peer.call(id, myStream);
        currentPeerCall = call;
        
        document.getElementById('waiting-overlay').classList.remove('d-none');

        call.on('stream', s => { 
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) {
                remoteVideo.srcObject = s; 
                document.getElementById('waiting-overlay').classList.add('d-none');
            }
        });

        dataConn = peer.connect(id);
        setupDataListeners();
    };

    // Chat
    document.getElementById('send-chat').onclick = () => {
        const input = document.getElementById('chat-input');
        if(!input.value.trim()) return;
        appendMessage(input.value, 'self');
        if(dataConn) dataConn.send({type: 'chat', msg: input.value, user: userName});
        input.value = "";
    };
});

// --- FUNKSIONET PRO ---

// AI Blur Background (Me dërgim te partneri)
async function processBlur() {
    if (!isBlurActive) return;
    const video = document.getElementById('local-video');
    await selfieSegmentation.send({image: video});
    requestAnimationFrame(processBlur);
}

function onBlurResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalCompositeOperation = 'source-in';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.globalCompositeOperation = 'destination-over';
    canvasCtx.filter = 'blur(15px)';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();
}

window.toggleBlur = async function() {
    isBlurActive = !isBlurActive;
    const btn = document.getElementById('blur-btn');
    btn.classList.toggle('active', isBlurActive);

    if (isBlurActive) {
        const canvasStream = canvasElement.captureStream(30);
        const videoTrack = canvasStream.getVideoTracks()[0];
        if (currentPeerCall) {
            const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(videoTrack);
        }
        document.getElementById('local-video').srcObject = canvasStream;
        processBlur();
    } else {
        const originalTrack = myStream.getVideoTracks()[0];
        if (currentPeerCall) {
            const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(originalTrack);
        }
        document.getElementById('local-video').srcObject = myStream;
    }
};

// Whiteboard
function setupWhiteboard() {
    wbCanvas = document.getElementById('whiteboard-canvas');
    wbCtx = wbCanvas.getContext('2d');
    wbCanvas.width = window.innerWidth;
    wbCanvas.height = window.innerHeight;

    wbCanvas.onmousedown = () => drawing = true;
    wbCanvas.onmouseup = () => { drawing = false; wbCtx.beginPath(); };
    wbCanvas.onmousemove = (e) => {
        if (!drawing) return;
        wbCtx.lineWidth = 3;
        wbCtx.lineCap = 'round';
        wbCtx.strokeStyle = document.getElementById('wb-color').value;
        wbCtx.lineTo(e.clientX, e.clientY - 40);
        wbCtx.stroke();
        if(dataConn) dataConn.send({type: 'draw', x: e.clientX, y: e.clientY - 40, color: wbCtx.strokeStyle});
    };
}

window.toggleWhiteboard = function() {
    const wb = document.getElementById('whiteboard-overlay');
    const isVisible = wb.style.display === 'flex';
    wb.style.display = isVisible ? 'none' : 'flex';
};

// AI Captions (Speech Recognition)
window.toggleCaptions = function() {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'sq-AL';
    isCaptionsActive = !isCaptionsActive;
    
    document.getElementById('caption-box').classList.toggle('d-none', !isCaptionsActive);
    document.getElementById('caption-btn').classList.toggle('btn-primary', isCaptionsActive);

    if (isCaptionsActive) {
        recognition.start();
        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            document.getElementById('caption-text').innerText = text;
            if(dataConn) dataConn.send({type: 'caption', msg: text});
        };
        recognition.onend = () => { if(isCaptionsActive) recognition.start(); };
    } else {
        recognition.stop();
    }
};

// --- DATA LISTENERS ---
function setupDataListeners() {
    if(!dataConn) return;
    dataConn.on('data', data => {
        switch(data.type) {
            case 'chat': appendMessage(data.msg, 'remote'); break;
            case 'reaction': showReaction(data.emoji, 'remote'); break;
            case 'draw': 
                wbCtx.strokeStyle = data.color;
                wbCtx.lineTo(data.x, data.y);
                wbCtx.stroke();
                break;
            case 'caption':
                document.getElementById('caption-box').classList.remove('d-none');
                document.getElementById('caption-text').innerText = data.msg;
                break;
        }
    });
}

// Kontrollet tjera (Mute, Cam, Screen)
window.toggleMic = function() {
    isMicOn = !isMicOn;
    myStream.getAudioTracks()[0].enabled = isMicOn;
    document.getElementById('mic-btn').classList.toggle('btn-danger', !isMicOn);
};

window.toggleCam = function() {
    isCamOn = !isCamOn;
    myStream.getVideoTracks()[0].enabled = isCamOn;
    document.getElementById('camera-btn').classList.toggle('btn-danger', !isCamOn);
};

window.copyMyId = function() {
    navigator.clipboard.writeText(document.getElementById('my-id').innerText);
    alert("ID u kopjua!");
};

window.sendReaction = function(emoji) {
    if(dataConn) dataConn.send({type: 'reaction', emoji: emoji});
    showReaction(emoji, 'local');
};

function showReaction(emoji, origin) {
    const container = document.getElementById(`reaction-container-${origin}`);
    const el = document.createElement('div');
    el.innerText = emoji;
    el.className = 'reaction-animate';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function appendMessage(msg, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender === 'self' ? 'msg-self' : 'msg-remote'} mb-2 p-2`;
    div.innerHTML = `<strong>${sender === 'self' ? 'Ti' : 'Partneri'}:</strong> <br> ${msg}`;
    document.getElementById('chat-messages').appendChild(div);
}

function setupAIBlur() {
    canvasElement = document.createElement('canvas');
    canvasElement.width = 1280; canvasElement.height = 720;
    canvasCtx = canvasElement.getContext('2d');
    selfieSegmentation = new SelfieSegmentation({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`});
    selfieSegmentation.setOptions({modelSelection: 1});
    selfieSegmentation.onResults(onBlurResults);
}

function playNotificationSound() {
    const audio = new Audio('https://www.soundjay.com/buttons/beep-07a.mp3');
    audio.play();
}

window.leaveMeeting = () => { if(confirm("Largohesh?")) location.reload(); };
