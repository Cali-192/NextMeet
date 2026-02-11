// NextMeet | Next-Gen Video Conferencing
document.title = "NextMeet | Next-Gen Video Conferencing";

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

// --- KONFIGURIMI I PEERJS ---
const peer = new Peer(undefined, {
    host: '0.peerjs.com',
    secure: true,
    port: 443,
    debug: 1
});

// --- 1. LOGIN & AUTHENTICATION (Lidhja Globale për Butonin) ---
window.startMeeting = function() {
    console.log("Tentativa për të hyrë në takim...");
    
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('meeting-pass-input');
    const authOverlay = document.getElementById('auth-overlay');
    const loginBtn = document.getElementById('start-btn'); // Përdorim ID-në e re
    
    if (!nameInput || !passInput) {
        console.error("Elementet e loginit nuk u gjetën!");
        return;
    }

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
    if (loginBtn) {
        loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Duke u lidhur...';
        loginBtn.disabled = true;
    }

    // HIQ OVERLAY-N
    if (authOverlay) {
        authOverlay.style.transition = "opacity 0.6s ease";
        authOverlay.style.opacity = '0';
        authOverlay.style.pointerEvents = 'none'; 
        
        setTimeout(() => {
            authOverlay.style.display = 'none';
        }, 600);
    }

    // Përditëso emrin në UI
    const localPartSpan = document.querySelector('#local-participant span');
    const localPartAvatar = document.querySelector('#local-participant .avatar-sm');
    const localNameDisplay = document.getElementById('local-name-display');
    
    if (localPartSpan) localPartSpan.innerText = userName + " (Ti)";
    if (localPartAvatar) localPartAvatar.innerText = userName[0].toUpperCase();
    if (localNameDisplay) localNameDisplay.innerText = userName;
    
    // Aktivizo Audio Context
    if (window.AudioContext || window.webkitAudioContext) {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Nis median pasi shtypet butoni (për siguri në mobile)
    initMedia();
    
    console.log("NextMeet nisi me sukses për: " + userName);
};

// --- 2. Setup i PeerJS Events ---
peer.on('open', id => {
    const myIdDisplay = document.getElementById('my-id');
    if (myIdDisplay) myIdDisplay.innerText = id;
    console.log("ID-ja juaj: " + id);
});

peer.on('error', err => {
    console.error("PeerJS Error:", err.type);
    if(err.type === 'peer-disconnected') {
        console.log("U shkëputët nga serveri.");
    }
});

// --- 3. Aksesi në Media (Me kontroll gabimesh) ---
async function initMedia() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            }, 
            audio: true 
        });
        
        const localVideo = document.getElementById('local-video');
        
        // Noise Cancellation i thjeshtë
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
        if (localVideo) {
            localVideo.srcObject = filteredStream;
            localVideo.muted = true; // Sigurohu që veten mos ta dëgjosh (feedback loop)
        }
        
        setupVoiceDetection(filteredStream, 'local-wrapper');

        peer.on('call', call => {
            pendingCall = call;
            const peerIdSpan = document.getElementById('pending-peer-id');
            if (peerIdSpan) peerIdSpan.innerText = call.peer;
            const lobby = document.getElementById('lobby-modal');
            if (lobby) lobby.classList.remove('d-none');
            playNotificationSound(); 
        });

        // Setup AI Background (MediaPipe)
        if (typeof SelfieSegmentation !== 'undefined') {
            const selfieSegmentation = new SelfieSegmentation({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
            });
            selfieSegmentation.setOptions({ modelSelection: 1 });
            selfieSegmentation.onResults(onBgResults);

            function sendToAI() {
                const localCanvas = document.getElementById('local-canvas');
                if (virtualBgMode !== 'none' && localVideo) {
                    localVideo.classList.add('d-none');
                    if (localCanvas) {
                        localCanvas.classList.remove('d-none');
                        selfieSegmentation.send({ image: localVideo });
                    }
                } else if (localVideo) {
                    localVideo.classList.remove('d-none');
                    if (localCanvas) localCanvas.classList.add('d-none');
                }
                requestAnimationFrame(sendToAI);
            }
            if (localVideo) localVideo.onplay = () => sendToAI();
        }

    } catch (err) {
        console.error("Media Error:", err);
        alert("Nuk mund të hapet kamera ose mikrofoni. Ju lutem jepni leje në browser.");
    }
}

// --- 4. Funksionet e UI & Lobby ---
window.lobbyDecision = function(accepted) {
    const lobby = document.getElementById('lobby-modal');
    if (lobby) lobby.classList.add('d-none');
    if (accepted && pendingCall) {
        pendingCall.answer(myStream);
        currentPeerCall = pendingCall;
        document.getElementById('waiting-overlay')?.classList.add('d-none');
        updateParticipants("Partneri", true);
        
        pendingCall.on('stream', userStream => {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) remoteVideo.srcObject = userStream;
            setupVoiceDetection(userStream, 'remote-wrapper');
        });

        dataConn = peer.connect(pendingCall.peer);
        setupDataListeners();
    }
    pendingCall = null;
};

window.updateThemeColor = function(color) {
    document.documentElement.style.setProperty('--accent', color);
    const primaryEls = document.querySelectorAll('.bg-primary, .btn-primary');
    primaryEls.forEach(el => el.style.backgroundColor = color);
};

// --- 5. Emojit & Reagimet ---
function startEmojiRain(emoji) {
    const container = document.getElementById('emoji-rain-container');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
        const el = document.createElement('div');
        el.className = 'emoji-particle';
        el.innerText = emoji;
        el.style.position = 'fixed';
        el.style.top = '-50px';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animation = `fall ${Math.random() * 2 + 1}s linear forwards`;
        el.style.fontSize = (Math.random() * 20 + 20) + 'px';
        el.style.zIndex = '99999';
        el.style.pointerEvents = 'none';
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
    const localCanvas = document.getElementById('local-canvas');
    if (!localCanvas) return;
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
        ctx.fillStyle = '#2c3e50'; 
        ctx.fillRect(0, 0, localCanvas.width, localCanvas.height);
    }
    ctx.restore();
}

window.setVirtualBg = function(mode) { 
    virtualBgMode = mode; 
    console.log("Virtual BG set to: " + mode);
};

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

window.raiseHand = function() {
    const handBtn = document.getElementById('hand-btn');
    if (!handBtn) return;
    const isRaised = handBtn.classList.toggle('btn-warning');
    const handIcon = document.querySelector('#local-participant .hand-icon');
    if (handIcon) handIcon.classList.toggle('d-none', !isRaised);
    if (dataConn) dataConn.send({ type: 'hand-raise', status: isRaised, senderName: userName });
};

// --- 6. Chat & Lidhja Outgoing ---
const connectBtn = document.getElementById('connect-btn');
if (connectBtn) {
    connectBtn.onclick = () => {
        const remoteIdInput = document.getElementById('remote-id-input');
        const id = remoteIdInput ? remoteIdInput.value.trim() : null;
        if (!id) return alert("Ju lutem shkruani ID-në e partnerit!");
        
        const call = peer.call(id, myStream);
        currentPeerCall = call;
        
        call.on('stream', s => { 
            document.getElementById('waiting-overlay')?.classList.add('d-none');
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo) remoteVideo.srcObject = s; 
            setupVoiceDetection(s, 'remote-wrapper'); 
            updateParticipants("Partneri", true);
        });

        dataConn = peer.connect(id);
        setupDataListeners();
    };
}

peer.on('connection', conn => {
    dataConn = conn;
    setupDataListeners();
});

function setupDataListeners() {
    if(!dataConn) return;
    dataConn.on('data', data => {
        if (data.type === 'chat') appendMessage(data.msg, 'remote');
        if (data.type === 'reaction') {
            showReaction(data.emoji, 'remote');
            if (['❤️', '👏', '😂'].includes(data.emoji)) startEmojiRain(data.emoji);
        }
        if (data.type === 'hand-raise') {
            const badge = document.getElementById('hand-count');
            if (badge) badge.classList.toggle('d-none', !data.status);
            if (data.status) playNotificationSound();
        }
    });
}

function appendMessage(msg, sender) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    const div = document.createElement('div');
    div.className = `message ${sender === 'self' ? 'msg-self' : 'msg-remote'} mb-2 p-2 rounded shadow-sm`;
    div.style.background = sender === 'self' ? '#0d6efd' : '#333';
    div.style.color = "white";
    div.innerText = msg;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

const sendChat = document.getElementById('send-chat');
if (sendChat) {
    sendChat.onclick = () => {
        const chatInput = document.getElementById('chat-input');
        const msg = chatInput ? chatInput.value.trim() : "";
        if(!msg) return;
        appendMessage(msg, 'self');
        if(dataConn) dataConn.send({type: 'chat', msg});
        chatInput.value = "";
    };
}

// --- 7. Kontrollet e thjeshta ---
const micBtn = document.getElementById('mic-btn');
if (micBtn) {
    micBtn.onclick = () => {
        if (!myStream) return;
        const t = myStream.getAudioTracks()[0]; 
        t.enabled = !t.enabled;
        micBtn.innerHTML = t.enabled ? '<i class="fas fa-microphone"></i><span class="btn-label">Mute</span>' : '<i class="fas fa-microphone-slash text-danger"></i><span class="btn-label">Unmute</span>';
    };
}

const cameraBtn = document.getElementById('camera-btn');
if (cameraBtn) {
    cameraBtn.onclick = () => {
        if (!myStream) return;
        const t = myStream.getVideoTracks()[0]; 
        t.enabled = !t.enabled;
        cameraBtn.innerHTML = t.enabled ? '<i class="fas fa-video"></i><span class="btn-label">Video</span>' : '<i class="fas fa-video-slash text-danger"></i><span class="btn-label">Start</span>';
    };
}

window.copyMyId = function() { 
    const myIdDisplay = document.getElementById('my-id');
    if (!myIdDisplay) return;
    const id = myIdDisplay.innerText;
    navigator.clipboard.writeText(id).then(() => {
        alert("ID e NextMeet u kopjua: " + id); 
    });
};

window.leaveMeeting = function() { 
    if(confirm("Dëshiron të mbyllësh takimin NextMeet?")) location.reload(); 
};

window.sendReaction = function(emoji) {
    if(dataConn) dataConn.send({type: 'reaction', emoji});
    showReaction(emoji, 'local');
    if (['❤️', '👏', '😂'].includes(emoji)) startEmojiRain(emoji);
};

function showReaction(emoji, origin) {
    const container = document.getElementById(`reaction-container-${origin}`);
    if (!container) return;
    const el = document.createElement('div');
    el.innerText = emoji;
    el.className = 'reaction-float animate-reaction';
    el.style.position = 'absolute';
    el.style.bottom = '50px';
    el.style.fontSize = '30px';
    el.style.zIndex = "100";
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function setupVoiceDetection(stream, id) {
    try {
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
            if(wrapper) {
                if(avg > 30) wrapper.style.boxShadow = "0 0 20px #0d6efd";
                else wrapper.style.boxShadow = "none";
            }
            requestAnimationFrame(check);
        }
        check();
    } catch(e) {}
}

function updateParticipants(name, joined) {
    const list = document.getElementById('participants-list');
    if (!list) return;
    if(joined) {
        if (document.getElementById(`part-${name}`)) return;
        const div = document.createElement('div');
        div.id = `part-${name}`;
        div.className = "d-flex align-items-center p-2 mb-1 rounded bg-secondary bg-opacity-10";
        div.innerHTML = `<div class="avatar-sm bg-info rounded-circle me-2 d-flex align-items-center justify-content-center small fw-bold">${name[0]}</div><span class="flex-grow-1 small">${name}</span>`;
        list.appendChild(div);
    }
}

// Shortcuts
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (key === 'm') micBtn?.click();
    if (key === 'v') cameraBtn?.click();
});
