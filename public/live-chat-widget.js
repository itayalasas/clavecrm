(function() {
  if (typeof window.CRMRapidoChatSettings === 'undefined') return;
  const settings = window.CRMRapidoChatSettings;
  if (!settings.widgetEnabled) return;

  let visitorId = null;
  let currentSessionId = null;
  let db = null;
  let unsubscribeMessages = null;

  let assignedAgent = {
    name: settings.agentName || "Asistente Virtual",
    avatar: settings.agentAvatarUrl || "https://cdn-icons-png.flaticon.com/512/4712/4712027.png"
  };

  const firebaseConfig = {
    apiKey: "AIzaSyA1PIzHg0qgOhXvHIp5duq6VgbuV3WIniE",
    authDomain: "minicrm-express.firebaseapp.com",
    projectId: "minicrm-express",
    storageBucket: "minicrm-express.firebasestorage.app",
    messagingSenderId: "600153365017",
    appId: "1:600153365017:web:7be7b7109ddc0ccab4e888",
    measurementId: "G-XXXXXXXXXX"
  };

  function initializeFirebase() {
    if (typeof firebase === 'undefined') {
      const s1 = document.createElement('script');
      s1.src = 'https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js';
      s1.onload = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore-compat.js';
        s2.onload = () => {
          firebase.initializeApp(firebaseConfig);
          db = firebase.firestore();
          setupWidget();
        };
        document.head.appendChild(s2);
      };
      document.head.appendChild(s1);
      return false;
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    return true;
  }

  function setupWidget() {
    visitorId = getOrSetVisitorId();
    createChatWindow();
    appendToggleButton();
  }

  function createChatWindow() {
    const chatWindow = document.createElement('div');
    chatWindow.id = 'crm-rapido-chat-window';
    Object.assign(chatWindow.style, {
      position: 'fixed', bottom: '86px', right: settings.widgetPosition === 'bottom-left' ? '' : '20px',
      left: settings.widgetPosition === 'bottom-left' ? '20px' : '',
      width: '350px', maxWidth: 'calc(100% - 40px)',
      height: '500px', maxHeight: 'calc(100% - 90px)',
      backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
      display: 'none', flexDirection: 'column', overflow: 'hidden', zIndex: '9998',
      opacity: '0', transform: 'translateY(20px)', transition: 'opacity 0.3s, transform 0.3s'
    });

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', padding: '12px', backgroundColor: settings.primaryColor, color: '#fff', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' });
    const avatar = document.createElement('img');
    avatar.src = assignedAgent.avatar;
    Object.assign(avatar.style, { width: '32px', height: '32px', borderRadius: '50%', marginRight: '10px' });
    const name = document.createElement('span');
    name.id = 'crm-rapido-agent-name';
    name.textContent = assignedAgent.name;
    name.style.fontWeight = '600';
    header.appendChild(avatar);
    header.appendChild(name);
    if (settings.showAgentStatus) {
      const dot = document.createElement('span');
      Object.assign(dot.style, { display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#4CAF50', borderRadius: '50%', marginLeft: '8px' });
      header.appendChild(dot);
    }
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    Object.assign(closeBtn.style, { marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' });
    closeBtn.onclick = toggleChatWindow;
    header.appendChild(closeBtn);

    const chatBody = document.createElement('div');
    chatBody.id = 'crm-rapido-chat-body';
    Object.assign(chatBody.style, { flexGrow: '1', padding: '10px', overflowY: 'auto', backgroundColor: '#f9f9f9' });

    const inputContainer = document.createElement('div');
    Object.assign(inputContainer.style, { padding: '10px', borderTop: '1px solid #ddd', display: 'flex', alignItems: 'center', backgroundColor: '#fff' });
    const chatInput = document.createElement('input');
    chatInput.id = 'crm-rapido-chat-input';
    chatInput.type = 'text';
    chatInput.placeholder = 'Escribe tu mensaje...';
    Object.assign(chatInput.style, { flexGrow: '1', padding: '8px', border: '1px solid #ccc', borderRadius: '20px', outline: 'none' });
    const sendBtn = document.createElement('button');
    sendBtn.innerHTML = '➡️';
    Object.assign(sendBtn.style, { marginLeft: '8px', padding: '8px', backgroundColor: settings.primaryColor, border: 'none', borderRadius: '50%', cursor: 'pointer', color: '#fff' });
    sendBtn.onclick = handleSendMessage;
    inputContainer.appendChild(chatInput);
    inputContainer.appendChild(sendBtn);

    chatWindow.appendChild(header);
    chatWindow.appendChild(chatBody);
    chatWindow.appendChild(inputContainer);
    document.body.appendChild(chatWindow);

    if (settings.welcomeMessage) {
      setTimeout(() => addSystemMessage(settings.welcomeMessage), 500);
    }
  }

  function appendToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'crm-rapido-chat-toggle';
    btn.textContent = '💬';
    Object.assign(btn.style, { position: 'fixed', bottom: '20px', right: '20px', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: settings.primaryColor, color: '#fff', border: 'none', fontSize: '24px', cursor: 'pointer', zIndex: '10000' });
    btn.onclick = toggleChatWindow;
    document.body.appendChild(btn);
  }

  function toggleChatWindow() {
    const chat = document.getElementById('crm-rapido-chat-window');
    if (!chat) return;
    const open = chat.style.display === 'none' || chat.style.display === '';
    chat.style.display = open ? 'flex' : 'none';
    chat.style.opacity = open ? '1' : '0';
    chat.style.transform = open ? 'translateY(0)' : 'translateY(20px)';
  }

  function addSystemMessage(text) {
    const body = document.getElementById('crm-rapido-chat-body');
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.margin = '8px 0';
    div.style.color = '#555';
    div.style.fontStyle = 'italic';
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  async function handleSendMessage() {
    const input = document.getElementById('crm-rapido-chat-input');
    const text = input.value.trim();
    if (!text || !db) return;
    input.value = '';
    const sessionId = await getOrCreateChatSession(text);
    await db.collection('chatSessions').doc(sessionId).collection('messages').add({
      senderType: 'visitor',
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('chatSessions').doc(sessionId).update({
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    addVisitorMessage(text);
  }

  function addVisitorMessage(text) {
    const body = document.getElementById('crm-rapido-chat-body');
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.justifyContent = 'flex-end';
    wrap.style.margin = '8px';
    const bubble = document.createElement('div');
    bubble.style.background = settings.primaryColor;
    bubble.style.color = '#fff';
    bubble.style.padding = '8px';
    bubble.style.borderRadius = '10px';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  }

  async function getOrCreateChatSession(initialText) {
    if (currentSessionId) return currentSessionId;
    const q = await db.collection('chatSessions')
      .where('visitorId','==',visitorId)
      .where('status','in',['pending','active'])
      .limit(1)
      .get();
    if (!q.empty) {
      currentSessionId = q.docs[0].id;
      return currentSessionId;
    }
    const doc = await db.collection('chatSessions').add({
      visitorId,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      initialMessage: initialText,
      currentPageUrl: window.location.href,
      visitorName: localStorage.getItem('crmRapidoVisitorName') || settings.defaultVisitorName || ("Visitante " + visitorId.substring(0, 4))
    });
    currentSessionId = doc.id;
    return currentSessionId;
  }

  function getOrSetVisitorId() {
    let id = localStorage.getItem('crmRapidoVisitorId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('crmRapidoVisitorId', id);
    }
    return id;
  }

  if (initializeFirebase()) {
    setupWidget();
  }
})();
