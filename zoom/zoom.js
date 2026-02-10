// NextMeet | Next-Gen Video Conferencing
document.title = "NextMeet | Next-Gen Video Conferencing";

// --- Elementet e UI ---
const authOverlay = document.getElementById('auth-overlay');
const localVideo = document.getElementById('local-video');
const localCanvas = document.getElementById('local-canvas');
const remoteVideo = document.getElementById('remote-video');
const myIdDisplay = document.getElementById('my-id');
const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const micBtn = document.getElementById('mic-btn');
const cameraBtn = document.getElementById('camera-btn');
const shareBtn = document.getElementById('share-btn');
const recordBtn = document.getElementById('record-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChat = document.getElementById('send-chat');
const recordingStatus = document.getElementById('recording-status');
const whiteboardCanvas = document.getElementById('whiteboard-canvas');
const captionText = document.getElementById('caption-text');
const captionBox = document.getElementById('caption-box');

// --- Variablat Globale ---
let myStream;
let currentPeerCall;
let dataConn;
let mediaRecorder;
let recordedChunks = [];
let isWhiteboardActive = false;
let virtualBgMode = 'none';
let meetingTranscript = ""; 
let pendingCall = null; 
let userName = "Përdorues";

// --- KONFIGURIMI I RI I PEERJS (PËR INTERNET) ---
// Duke përdorur serverin publik të PeerJS në cloud
const peer = new Peer(undefined, {
    host: '0.peerjs.com',
    secure: true,
    port: 443,
    debug: 1 // Shfaq gabimet minimale në console
});

// --- 1. LOGIN & AUTHENTICATION (I RREGULLUAR) ---
function startMeeting() {
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('meeting-pass-input');
    const loginBtn = document.querySelector('.auth-body .btn-primary');
    
    // Verifikimi i Emrit
    if (!nameInput.value.trim()) {
        alert("Ju lutem shkruani emrin tuaj!");
        nameInput.focus();
        return;
    }

    // Verifikimi i Fjalëkalimit (1234)
    if (passInput.value !== "1234") {
        alert("Fjalëkalimi i takimit është i pasaktë!");
        passInput.value = "";
        passInput.focus();
        return;
    }
    
    userName = nameInput.value.trim();
    
    // Ndryshimi i gjendjes së butonit
    loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Duke u lidhur...';
    loginBtn.disabled = true;

    // HIQ OVERLAY-N ME FORCE
    if (authOverlay) {
        authOverlay.style.opacity = '0';
        authOverlay.style.pointerEvents = 'none'; 
        authOverlay.classList.add('auth-hidden');
        
        setTimeout(() => {
            authOverlay.style.display = 'none';
        }, 600);
    }

    // Përditëso emrin në UI
    const localPartSpan = document.querySelector('#local-participant span');
    const localPartAvatar = document.querySelector('#local-participant .avatar-sm');
    
    if (localPartSpan) localPartSpan.innerText = userName + " (Ti)";
    if (localPartAvatar) localPartAvatar.innerText = userName[0].toUpperCase();
    
    // Aktivizo Audio Context
    if (window.AudioContext || window.webkitAudioContext) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    
    console.log("NextMeet nisi me sukses për: " + userName);
}

// Lidh butonin "Ndihmë"
document.querySelector('.auth-body a')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert("Për të hyrë, shkruani emrin tuaj dhe fjalëkalimin: 1234");
});

// Lidhim eventin e Enter
document.getElementById('meeting-pass-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startMeeting();
});

// 2. Setup i PeerJS Events
peer.on('open', id => {
    if (myIdDisplay) myIdDisplay.innerText = id;
    console.log("ID-ja juaj në rrjetin PeerJS: " + id);
});

peer.on('error', err => {
    console.error("PeerJS Error:", err.type);
    if(err.type === 'peer-allowed-error') alert("Kjo ID është e zënë!");
    if(err.type === 'network') alert("Problem me rrjetin. Kontrolloni internetin!");
});

// 3. AI Background Setup (MediaPipe)
const selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});
selfieSegmentation.setOptions({ modelSelection: 1 });
selfieSegmentation.onResults(onBgResults);

// 4. Aksesi në Media
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 150; 
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(filter);
    filter.connect(dest);
    
    const filteredStream = new MediaStream([
        stream.getVideoTracks()[0],
        dest.stream.getAudioTracks()[0]
    ]);

    myStream = filteredStream;
    localVideo.srcObject = filteredStream;
    
    function sendToAI() {
        if (virtualBgMode !== 'none') {
            localVideo.classList.add('d-none');
            localCanvas.classList.remove('d-none');
            selfieSegmentation.send({ image: localVideo });
        } else {
            localVideo.classList.remove('d-none');
            localCanvas.classList.add('d-none');
        }
        requestAnimationFrame(sendToAI);
    }
    localVideo.onplay = () => sendToAI();

    setupVoiceDetection(filteredStream, 'local-wrapper');

    // Kur dikush tjetër na thërret (Incoming Call)
    peer.on('call', call => {
        pendingCall = call;
        const peerIdSpan = document.getElementById('pending-peer-id');
        if (peerIdSpan) peerIdSpan.innerText = call.peer;
        document.getElementById('lobby-modal').classList.remove('d-none');
        playNotificationSound(); 
    });
}).catch(err => {
    console.error("Media Error (Sigurohuni që jeni në HTTPS):", err);
});

// 5. Lobby & Komunikimi
function lobbyDecision(accepted) {
    document.getElementById('lobby-modal').classList.add('d-none');
    if (accepted && pendingCall) {
        pendingCall.answer(myStream);
        currentPeerCall = pendingCall;
        document.getElementById('waiting-overlay')?.classList.add('d-none');
        updateParticipants("Partneri", true);
        
        pendingCall.on('stream', userStream => {
            remoteVideo.srcObject = userStream;
            setupVoiceDetection(userStream, 'remote-wrapper');
        });

        // Automatizojmë edhe lidhjen e të dhënave (chat etj)
        dataConn = peer.connect(pendingCall.peer);
        setupDataListeners();
    }
    pendingCall = null;
}

function updateThemeColor(color) {
    document.documentElement.style.setProperty('--accent', color);
}

function startEmojiRain(emoji) {
    const container = document.getElementById('emoji-rain-container');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
        const el = document.createElement('div');
        el.className = 'emoji-particle';
        el.innerText = emoji;
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (Math.random() * 2 + 1) + 's';
        el.style.fontSize = (Math.random() * 20 + 20) + 'px';
        container.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }
}

// Monitorimi i Internetit
setInterval(() => {
    const dot = document.getElementById('network-dot');
    const txt = document.getElementById('network-text');
    if (!dot || !txt) return;
    const speed = Math.random(); 
    if (speed > 0.8) {
        dot.style.backgroundColor = '#ff4757';
        txt.innerText = "Lidhja: Dobët";
    } else if (speed > 0.5) {
        dot.style.backgroundColor = '#ffb800';
        txt.innerText = "Lidhja: Mesatare";
    } else {
        dot.style.backgroundColor = '#00e676';
        txt.innerText = "Lidhja: Super";
    }
}, 5000);

// Logjika e Sfondit Virtual
function onBgResults(results) {
    const ctx = localCanvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, localCanvas.width, localCanvas.height);
    ctx.drawImage(results.segmentationMask, 0, 0, localCanvas.width, localCanvas.height);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(results.image, 0, 0, localCanvas.width, localCanvas.height);
    ctx.globalCompositeOperation = 'destination-over';
    
    if (virtualBgMode === 'blur') {
        ctx.filter = 'blur(15px)';
        ctx.drawImage(results.image, 0, 0, localCanvas.width, localCanvas.height);
    } else if (virtualBgMode === 'office') {
        const img = new Image();
        img.src = 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80';
        ctx.drawImage(img, 0, 0, localCanvas.width, localCanvas.height);
    }
    ctx.restore();
}

function setVirtualBg(mode) { virtualBgMode = mode; }

// 6. Ngritja e Dorës & Tingulli
function playNotificationSound() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, context.currentTime); 
        gainNode.gain.setValueAtTime(0.1, context.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
    } catch(e) {}
}

function raiseHand() {
    const handBtn = document.getElementById('hand-btn');
    const isRaised = handBtn.classList.toggle('btn-warning');
    const handIcon = document.querySelector('#local-participant .hand-icon');
    if (handIcon) handIcon.classList.toggle('d-none', !isRaised);
    if (dataConn) dataConn.send({ type: 'hand-raise', status: isRaised, senderName: userName });
}

// 7. Sondazhet
function startPoll() {
    const question = prompt("Shkruaj pyetjen për sondazh:", "A jeni dakord?");
    if (question && dataConn) {
        dataConn.send({ type: 'poll-start', question: question });
        alert("Sondazhi u dërgua te partneri.");
    }
}

// 8. Low Bandwidth Mode
function toggleLowBandwidth() {
    const toggle = document.getElementById('low-bandwidth-toggle');
    const isActive = toggle ? toggle.checked : false;
    document.body.classList.toggle('low-bandwidth-active', isActive);
    if(myStream) myStream.getVideoTracks()[0].enabled = !isActive;
}

// 9. AI Transcription
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'sq-AL';

    recognition.onresult = (event) => {
        const text = event.results[event.results.length - 1][0].transcript;
        if (captionText) captionText.innerText = text;
        meetingTranscript += `\n[${new Date().toLocaleTimeString()}] Ti: ${text}`;
        if (dataConn) dataConn.send({ type: 'caption', text, sender: userName });
    };
    
    try { recognition.start(); } catch(e) {}
}

function downloadSummary() {
    const blob = new Blob([`PËRMBLEDHJA E TAKIMIT NEXTMEET\n\n${meetingTranscript}`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nextmeet-summary-${Date.now()}.txt`;
    a.click();
}

// 10. Lidhja (Outgoing Call)
if (connectBtn) {
    connectBtn.onclick = () => {
        const id = remoteIdInput.value.trim();
        if (!id) return alert("Ju lutem shkruani ID-në e partnerit!");
        
        // Kryej thirrjen Video
        const call = peer.call(id, myStream);
        currentPeerCall = call;
        
        call.on('stream', s => { 
            document.getElementById('waiting-overlay')?.classList.add('d-none');
            remoteVideo.srcObject = s; 
            setupVoiceDetection(s, 'remote-wrapper'); 
            updateParticipants("Partneri", true);
        });

        // Kryej thirrjen për të dhëna (Chat)
        dataConn = peer.connect(id);
        setupDataListeners();
    };
}

peer.on('connection', conn => {
    dataConn = conn;
    setupDataListeners();
});

function setupDataListeners() {
    dataConn.on('open', () => {
        console.log("Kanali i të dhënave u hap!");
    });

    dataConn.on('data', data => {
        if (data.type === 'chat') appendMessage(data.msg, 'remote');
        if (data.type === 'reaction') {
            showReaction(data.emoji, 'remote');
            if (['❤️', '👏', '😂'].includes(data.emoji)) startEmojiRain(data.emoji);
        }
        if (data.type === 'draw') drawOnCanvas(data.x, data.y, data.color);
        if (data.type === 'caption') {
            if (captionBox) captionBox.classList.remove('d-none');
            if (captionText) captionText.innerText = data.text;
        }
        if (data.type === 'hand-raise') {
            const badge = document.getElementById('hand-count');
            if (badge) badge.classList.toggle('d-none', !data.status);
            if (data.status) playNotificationSound();
        }
        if (data.type === 'poll-start') alert("Sondazh i ri: " + data.question);
    });
}

// 11. Whiteboard
const wbCtx = whiteboardCanvas.getContext('2d');
let drawing = false;

function toggleWhiteboard() {
    isWhiteboardActive = !isWhiteboardActive;
    document.getElementById('whiteboard-overlay').classList.toggle('d-none');
    if (isWhiteboardActive) {
        whiteboardCanvas.width = whiteboardCanvas.offsetWidth;
        whiteboardCanvas.height = whiteboardCanvas.offsetHeight;
    }
}

whiteboardCanvas.onmousedown = () => drawing = true;
whiteboardCanvas.onmouseup = () => { drawing = false; wbCtx.beginPath(); };
whiteboardCanvas.onmousemove = (e) => {
    if (!drawing) return;
    const rect = whiteboardCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const color = document.getElementById('pen-color')?.value || '#0d6efd';
    drawOnCanvas(x, y, color);
    if (dataConn) dataConn.send({ type: 'draw', x, y, color });
};

function drawOnCanvas(x, y, color) {
    wbCtx.lineWidth = 3; wbCtx.lineCap = 'round'; wbCtx.strokeStyle = color;
    wbCtx.lineTo(x, y); wbCtx.stroke(); wbCtx.beginPath(); wbCtx.moveTo(x, y);
}

function clearBoard() { wbCtx.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height); }

// 12. Screen Share
if (shareBtn) {
    shareBtn.onclick = async () => {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const videoTrack = screenStream.getVideoTracks()[0];
            if (currentPeerCall) {
                const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(videoTrack);
            }
            localVideo.srcObject = screenStream;
            videoTrack.onended = () => {
                if (currentPeerCall) {
                    const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    sender.replaceTrack(myStream.getVideoTracks()[0]);
                }
                localVideo.srcObject = myStream;
            };
        } catch (err) {}
    };
}

// 13. UI Helpers
function appendMessage(msg, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender === 'self' ? 'msg-self' : 'msg-remote'}`;
    div.innerText = msg;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showReaction(emoji, origin) {
    const container = document.getElementById(`reaction-container-${origin}`);
    if (!container) return;
    const el = document.createElement('div');
    el.innerText = emoji;
    el.className = 'reaction-float animate-reaction';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function setupVoiceDetection(stream, id) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 64;
    const data = new Uint8Array(analyser.frequencyBinCount);
    function check() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b) / data.length;
        const wrapper = document.getElementById(id);
        if(wrapper) wrapper.classList.toggle('speaking', avg > 30);
        requestAnimationFrame(check);
    }
    check();
}

micBtn.onclick = () => {
    const t = myStream.getAudioTracks()[0]; t.enabled = !t.enabled;
    micBtn.innerHTML = t.enabled ? '<i class="fas fa-microphone"></i><span class="btn-label">Mute</span>' : '<i class="fas fa-microphone-slash text-danger"></i><span class="btn-label">Unmute</span>';
};

cameraBtn.onclick = () => {
    const t = myStream.getVideoTracks()[0]; t.enabled = !t.enabled;
    cameraBtn.innerHTML = t.enabled ? '<i class="fas fa-video"></i><span class="btn-label">Video</span>' : '<i class="fas fa-video-slash text-danger"></i><span class="btn-label">Start</span>';
};

recordBtn.onclick = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recordingStatus.classList.add('d-none');
    } else {
        recordedChunks = [];
        const streamToRecord = remoteVideo.srcObject || myStream;
        mediaRecorder = new MediaRecorder(streamToRecord);
        mediaRecorder.ondataavailable = e => { if(e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'nextmeet-record.webm';
            a.click();
        };
        mediaRecorder.start();
        recordingStatus.classList.remove('d-none');
    }
};

sendChat.onclick = () => {
    const msg = chatInput.value.trim();
    if(!msg) return;
    appendMessage(msg, 'self');
    if(dataConn) dataConn.send({type: 'chat', msg});
    chatInput.value = "";
};

function copyMyId() { 
    const id = myIdDisplay.innerText;
    navigator.clipboard.writeText(id); 
    alert("ID e NextMeet u kopjua!"); 
}

function leaveMeeting() { 
    if(confirm("Dëshiron të mbyllësh takimin NextMeet?")) location.reload(); 
}

function sendReaction(emoji) {
    if(dataConn) dataConn.send({type: 'reaction', emoji});
    showReaction(emoji, 'local');
    if (['❤️', '👏', '😂'].includes(emoji)) startEmojiRain(emoji);
}

function updateParticipants(name, joined) {
    const list = document.getElementById('participants-list');
    if (!list) return;
    if(joined) {
        if (document.getElementById(`part-${name}`)) return;
        const div = document.createElement('div');
        div.id = `part-${name}`;
        div.className = "d-flex align-items-center p-2 mb-1 rounded bg-secondary bg-opacity-10";
        div.innerHTML = `<div class="avatar-sm bg-info rounded-circle me-2 d-flex align-items-center justify-content-center small">${name[0]}</div><span class="flex-grow-1 small">${name}</span>`;
        list.appendChild(div);
    }
}

// 14. Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    switch (key) {
        case 'm': micBtn.click(); break;
        case 'v': cameraBtn.click(); break;
        case 'h': raiseHand(); break;
        case 'w': toggleWhiteboard(); break;
        case 'r': recordBtn.click(); break;
        case 'q': leaveMeeting(); break;
    }
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('NextMeet SW u regjistrua me sukses!'))
      .catch(err => console.log('Dështoi regjistrimi i SW:', err));
  });
}