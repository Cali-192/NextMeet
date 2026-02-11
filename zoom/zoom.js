// NextMeet | Next-Gen Video Conferencing
document.title = "NextMeet | Next-Gen Video Conferencing";

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

// --- KONFIGURIMI I PEERJS ---
const peer = new Peer(undefined, {
    host: '0.peerjs.com',
    secure: true,
    port: 443,
    debug: 1
});

// --- 1. LOGIN & HYRJA ---
window.startMeeting = function() {
    console.log("Tentim për login...");
    
    const nameInput = document.getElementById('user-name-input');
    const passInput = document.getElementById('meeting-pass-input');
    const authOverlay = document.getElementById('auth-overlay');
    const loginBtn = document.getElementById('start-btn'); 
    
    if (!nameInput || !passInput) {
        console.error("Elementet e loginit nuk u gjetën në DOM!");
        return;
    }

    const emri = nameInput.value.trim();
    const pass = passInput.value.trim();

    if (!emri) {
        alert("Ju lutem shkruani emrin!");
        return;
    }

    if (pass !== "1234") {
        alert("Fjalëkalimi i pasaktë!");
        return;
    }
    
    userName = emri;
    
    // Përditëso emrin në ndërfaqe
    const localDisplayName = document.getElementById('local-name-display');
    const localPartName = document.getElementById('local-participant-name');
    if (localDisplayName) localDisplayName.innerText = emri;
    if (localPartName) localPartName.innerText = emri + " (Ti)";
    
    // Feedback vizual
    if (loginBtn) {
        loginBtn.innerHTML = 'Duke u lidhur...';
        loginBtn.disabled = true;
    }

    // Hiqet overlay
    if (authOverlay) {
        authOverlay.style.display = 'none';
    }

    // Aktivizimi i audios për mobil
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        const audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Nis median
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
            localVideo.setAttribute('playsinline', 'true');
            localVideo.play().catch(e => console.error("Video Play Error:", e));
        }
        
        peer.on('call', call => {
            pendingCall = call;
            const lobby = document.getElementById('lobby-modal');
            if (lobby) lobby.classList.remove('d-none');
            playNotificationSound(); 
        });

    } catch (err) {
        console.error("Media Error:", err);
        alert("Nuk u qasëm në kamerë. Sigurohu që ke dhënë leje (Allow).");
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
                remoteVideo.setAttribute('playsinline', 'true');
                const waiting = document.getElementById('waiting-overlay');
                if (waiting) waiting.classList.add('d-none');
            }
        });

        dataConn = peer.connect(pendingCall.peer);
        setupDataListeners();
    }
};

// --- 4. Inicializimi i Eventeve & Kontrollet ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Butoni Connect
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
                if (remoteVideo) {
                    remoteVideo.srcObject = s; 
                    remoteVideo.setAttribute('playsinline', 'true');
                    const waiting = document.getElementById('waiting-overlay');
                    if (waiting) waiting.classList.add('d-none');
                }
            });

            dataConn = peer.connect(id);
            setupDataListeners();
        };
    }

    // Butoni i Chat-it
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

    // --- Kontrollet e Butonave (Mic, Cam, Screen) ---
    
    // Mute/Unmute
    window.toggleMic = function() {
        if (!myStream) return;
        isMicOn = !isMicOn;
        myStream.getAudioTracks()[0].enabled = isMicOn;
        const btn = document.getElementById('mic-btn');
        btn.classList.toggle('btn-danger', !isMicOn);
        btn.innerHTML = isMicOn ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
    };

    // Camera On/Off
    window.toggleCam = function() {
        if (!myStream) return;
        isCamOn = !isCamOn;
        myStream.getVideoTracks()[0].enabled = isCamOn;
        const btn = document.getElementById('camera-btn');
        btn.classList.toggle('btn-danger', !isCamOn);
        btn.innerHTML = isCamOn ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
    };

    // Screen Share
    window.toggleScreenShare = async function() {
        try {
            if (!screenStream) {
                screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const videoTrack = screenStream.getVideoTracks()[0];
                
                // Zëvendëso track-un te thirrja aktive
                if (currentPeerCall) {
                    const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
                    sender.replaceTrack(videoTrack);
                }
                
                document.getElementById('local-video').srcObject = screenStream;
                
                videoTrack.onended = () => stopScreenShare();
            } else {
                stopScreenShare();
            }
        } catch (err) {
            console.error("Screen Share Error:", err);
        }
    };

    function stopScreenShare() {
        if (!screenStream) return;
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
        
        const videoTrack = myStream.getVideoTracks()[0];
        if (currentPeerCall) {
            const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(videoTrack);
        }
        document.getElementById('local-video').srcObject = myStream;
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

// --- 5. Kontrollet e tjera ---
window.copyMyId = function() { 
    const myIdEl = document.getElementById('my-id');
    if (!myIdEl) return;
    const id = myIdEl.innerText;
    navigator.clipboard.writeText(id).then(() => {
        alert("ID u kopjua!");
    });
};

window.leaveMeeting = function() { 
    if(confirm("Dëshiron të largohesh?")) location.reload(); 
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
    
    const randomOffset = Math.floor(Math.random() * 40) - 20;
    el.style.left = `calc(50% + ${randomOffset}px)`;
    
    container.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 2000);
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
