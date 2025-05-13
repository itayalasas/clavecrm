(function() {
  if (typeof window.CRMRapidoChatSettings === 'undefined') return;
  const settings = window.CRMRapidoChatSettings;
  if (!settings.widgetEnabled) return;

  let visitorId = null;
  let currentSessionId = null;
  let db = null;
  let unsubscribeMessages = null;

  let assignedAgent = {
    name: "Asistente Virtual",
    avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712027.png"
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
      const script = document.createElement('script');
      script.src = "https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js";
      script.onload = () => {
        const script2 = document.createElement('script');
        script2.src = "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore-compat.js";
        script2.onload = () => {
          firebase.initializeApp(firebaseConfig);
          db = firebase.firestore();
          setupWidget();
        };
        document.head.appendChild(script2);
      };
      document.head.appendChild(script);
      return false;
    } else {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      return true;
    }
  }

  function setupWidget() {
    visitorId = getOrSetVisitorId();
    appendToggleButton();
    appendElementsToBody();
    showWelcomeMessages();
  }

  function showWelcomeMessages() {
    addAgentMessage("Nuestros expertos están aquí para ayudarte. ¿Estás buscando algo o necesitas ayuda?");
    addAgentMessage("Mientras te conecto con alguien, ¿podrías por favor darme más detalles sobre lo que estás buscando?");
  }

  function addAgentMessage(text) {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "flex-start";
    wrap.style.marginBottom = "10px";
  
    const avatar = document.createElement("img");
    avatar.src = assignedAgent.avatar;
    avatar.style.width = "24px";
    avatar.style.height = "24px";
    avatar.style.borderRadius = "50%";
    avatar.style.marginRight = "8px";
  
    const bubble = document.createElement("div");
    bubble.style.background = "#e5f1fb";
    bubble.style.color = "#333";
    bubble.style.padding = "10px";
    bubble.style.borderRadius = "10px";
    bubble.style.maxWidth = "80%";
    bubble.innerText = text;
  
    const time = document.createElement("div");
    time.style.fontSize = "10px";
    time.style.color = "#555";
    time.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
    const content = document.createElement("div");
    content.appendChild(bubble);
    content.appendChild(time);
  
    wrap.appendChild(avatar);
    wrap.appendChild(content);
    chatBody.appendChild(wrap);
    chatBody.scrollTop = chatBody.scrollHeight;
  }
  

  function appendToggleButton() {
    const chatToggle = document.createElement("button");
    chatToggle.id = "chat-toggle-btn";
    chatToggle.innerText = "💬";
    chatToggle.style.position = "fixed";
    chatToggle.style.bottom = "20px";
    chatToggle.style.right = "20px";
    chatToggle.style.backgroundColor = settings.primaryColor || "#29ABE2";
    chatToggle.style.color = "white";
    chatToggle.style.border = "none";
    chatToggle.style.borderRadius = "50%";
    chatToggle.style.width = "56px";
    chatToggle.style.height = "56px";
    chatToggle.style.fontSize = "24px";
    chatToggle.style.cursor = "pointer";
    chatToggle.style.zIndex = "10000";
  
    document.body.appendChild(chatToggle);
  
    chatToggle.addEventListener("click", function () {
      const chat = document.getElementById("crm-chat");
      if (!chat) return;
      const isHidden = chat.style.display === "none";
      chat.style.display = isHidden ? "flex" : "none";
    });
  }

  function updateAgentHeader() {
    if (!headerText) return;
    headerText.textContent = assignedAgent.name;
    let existingAvatar = document.getElementById("crm-rapido-agent-avatar");
    if (!existingAvatar) {
      const avatarImg = document.createElement("img");
      avatarImg.id = "crm-rapido-agent-avatar";
      avatarImg.style.width = "24px";
      avatarImg.style.height = "24px";
      avatarImg.style.borderRadius = "50%";
      avatarImg.style.marginRight = "8px";
      avatarImg.src = assignedAgent.avatar;
      headerText.prepend(avatarImg);
    } else {
      existingAvatar.src = assignedAgent.avatar;
    }
  }

  async function listenForAgentAssignment(sessionId) {
    if (!db || !sessionId) return;
    const sessionRef = db.collection("chatSessions").doc(sessionId);
    sessionRef.onSnapshot((doc) => {
      const data = doc.data();
      if (data && data.agentId && data.agentName && data.agentAvatar) {
        assignedAgent.name = data.agentName;
        assignedAgent.avatar = data.agentAvatar;
        updateAgentHeader();
        addMessageToUI(`Hola, soy ${data.agentName}. ¿En qué puedo ayudarte hoy?`, "agent", new Date());
      }
    });
  }

  async function getOrCreateChatSession(initialMessageText) {
    const sessionRef = db.collection("chatSessions")
      .where("visitorId", "==", visitorId)
      .where("status", "in", ["pending", "active"]);
    const snapshot = await sessionRef.get();
    if (!snapshot.empty) {
      currentSessionId = snapshot.docs[0].id;
      listenForAgentAssignment(currentSessionId);
      return currentSessionId;
    }
    const newSession = {
      visitorId,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db.collection("chatSessions").add(newSession);
    currentSessionId = docRef.id;
    addInitialBotMessages();
    listenForAgentAssignment(currentSessionId);
    return currentSessionId;
  }

  function addInitialBotMessages() {
    addMessageToUI("Nuestros expertos están aquí para ayudarte. ¿Estás buscando algo o necesitas ayuda?", "agent", new Date());
    addMessageToUI("Mientras te conecto con alguien, ¿podrías por favor darme más detalles sobre lo que estás buscando?", "agent", new Date());
  }

  async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    chatInput.value = "";
    addMessageToUI(message, "visitor", new Date());
    const sessionId = await getOrCreateChatSession();
    await db.collection("chatSessions").doc(sessionId).collection("messages").add({
      text: message,
      senderType: "visitor",
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    addMessageToUI("Gracias. Hemos pasado esta información. Un miembro de nuestro equipo se pondrá en contacto contigo en breve.", "agent", new Date());
  }

  function addMessageToUI(text, senderType, timestamp) {
    const div = document.createElement("div");
    div.className = `chat-message ${senderType}`;
    const p = document.createElement("p");
    p.textContent = text;
    const time = document.createElement("div");
    time.className = "timestamp";
    time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.appendChild(p);
    div.appendChild(time);
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function getOrSetVisitorId() {
    let id = localStorage.getItem('crmRapidoVisitorId');
    if (!id) {
      id = 'xxxxxxx'.replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));
      localStorage.setItem('crmRapidoVisitorId', id);
    }
    return id;
  }


  // --- Create Chat Button ---
  const chatButton = document.createElement('button');
  chatButton.id = 'crm-rapido-chat-button';
  chatButton.setAttribute('aria-label', settings.chatHeaderText || 'Abrir chat');
  chatButton.style.position = 'fixed';
  chatButton.style.zIndex = '9999';
  chatButton.style.border = 'none';
  chatButton.style.borderRadius = '50%';
  chatButton.style.cursor = 'pointer';
  chatButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  chatButton.style.transition = 'transform 0.2s ease-out, background-color 0.2s ease-out';
  chatButton.style.display = 'flex';
  chatButton.style.alignItems = 'center';
  chatButton.style.justifyContent = 'center';
  chatButton.style.width = '56px';
  chatButton.style.height = '56px';
  chatButton.style.backgroundColor = settings.primaryColor || '#29ABE2';
  chatButton.onmouseover = function() { this.style.backgroundColor = darkenColor(settings.primaryColor || '#29ABE2', 10); };
  chatButton.onmouseout = function() { this.style.backgroundColor = settings.primaryColor || '#29ABE2'; };

  const svgNS = "http://www.w3.org/2000/svg";
  const iconOpenSvg = createChatIcon("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z");
  const iconCloseSvg = createChatIcon("M18 6L6 18M6 6l12 12"); 

  chatButton.appendChild(iconOpenSvg); 

  if (settings.widgetPosition === 'bottom-left') {
    chatButton.style.left = '20px';
    chatButton.style.bottom = '20px';
  } else { 
    chatButton.style.right = '20px';
    chatButton.style.bottom = '20px';
  }

  // --- Create Chat Window ---
  const chatWindow = document.createElement('div');
  chatWindow.id = 'crm-rapido-chat-window';
  chatWindow.style.position = 'fixed';
  chatWindow.style.zIndex = '9998';
  chatWindow.style.width = '350px';
  chatWindow.style.maxWidth = 'calc(100% - 40px)';
  chatWindow.style.height = '500px';
  chatWindow.style.maxHeight = 'calc(100% - 90px)';
  chatWindow.style.backgroundColor = 'white';
  chatWindow.style.borderRadius = '8px';
  chatWindow.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)';
  chatWindow.style.display = 'none';
  chatWindow.style.flexDirection = 'column';
  chatWindow.style.overflow = 'hidden';
  chatWindow.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
  chatWindow.style.opacity = '0';
  chatWindow.style.transform = 'translateY(20px)';

  if (settings.widgetPosition === 'bottom-left') {
    chatWindow.style.left = '20px';
    chatWindow.style.bottom = '86px'; 
  } else {
    chatWindow.style.right = '20px';
    chatWindow.style.bottom = '86px'; 
  }

  // Chat Window Header
  const chatHeader = document.createElement('div');
  chatHeader.style.backgroundColor = settings.primaryColor || '#29ABE2';
  chatHeader.style.color = 'white';
  chatHeader.style.padding = '12px 15px';
  chatHeader.style.display = 'flex';
  chatHeader.style.justifyContent = 'space-between';
  chatHeader.style.alignItems = 'center';
  chatHeader.style.borderTopLeftRadius = '8px';
  chatHeader.style.borderTopRightRadius = '8px';

  const headerText = document.createElement('h3');
  headerText.textContent = settings.chatHeaderText || 'Chatea con Nosotros';
  headerText.style.fontSize = '16px';
  headerText.style.fontWeight = '600';
  headerText.style.margin = '0';
  headerText.style.lineHeight = '1.2';

  const closeButtonHeader = document.createElement('button');
  closeButtonHeader.innerHTML = '&times;';
  closeButtonHeader.style.background = 'none';
  closeButtonHeader.style.border = 'none';
  closeButtonHeader.style.color = 'white';
  closeButtonHeader.style.fontSize = '24px';
  closeButtonHeader.style.cursor = 'pointer';
  closeButtonHeader.style.lineHeight = '1';
  closeButtonHeader.setAttribute('aria-label', 'Cerrar chat');

  chatHeader.appendChild(headerText);
  chatHeader.appendChild(closeButtonHeader);
  chatWindow.appendChild(chatHeader);

  // Chat Window Body
  const chatBody = document.createElement('div');
  chatBody.id = 'crm-rapido-chat-body';
  chatBody.style.flexGrow = '1';
  chatBody.style.padding = '15px';
  chatBody.style.overflowY = 'auto';
  chatBody.style.backgroundColor = '#f9f9f9';
  
  chatWindow.appendChild(chatBody);


  // Chat Window Input Area
  const chatInputContainer = document.createElement('div');
  chatInputContainer.style.padding = '15px';
  chatInputContainer.style.borderTop = '1px solid #e0e0e0';
  chatInputContainer.style.backgroundColor = 'white';
  chatInputContainer.style.display = 'flex';
  chatInputContainer.style.alignItems = 'center';

  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.placeholder = 'Escribe tu mensaje...';
  chatInput.style.flexGrow = '1';
  chatInput.style.padding = '10px';
  chatInput.style.border = '1px solid #ccc';
  chatInput.style.borderRadius = '20px';
  chatInput.style.fontSize = '14px';
  chatInput.style.outline = 'none';

  const sendButton = document.createElement('button');
  sendButton.style.marginLeft = '10px';
  sendButton.style.padding = '10px';
  sendButton.style.border = 'none';
  sendButton.style.backgroundColor = settings.primaryColor || '#29ABE2';
  sendButton.style.color = 'white';
  sendButton.style.borderRadius = '50%';
  sendButton.style.cursor = 'pointer';
  sendButton.style.width = '40px';
  sendButton.style.height = '40px';
  sendButton.style.display = 'flex';
  sendButton.style.alignItems = 'center';
  sendButton.style.justifyContent = 'center';
  sendButton.innerHTML = `<svg xmlns="${svgNS}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`; // Send Icon
  sendButton.onmouseover = function() { this.style.backgroundColor = darkenColor(settings.primaryColor || '#29ABE2', 10); };
  sendButton.onmouseout = function() { this.style.backgroundColor = settings.primaryColor || '#29ABE2'; };

  chatInputContainer.appendChild(chatInput);
  chatInputContainer.appendChild(sendButton);
  chatWindow.appendChild(chatInputContainer);

  // --- Helper Functions ---
  function createChatIcon(dAttribute) {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", svgNS);
    svg.setAttribute("width", "28");
    svg.setAttribute("height", "28");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "white");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", dAttribute);
    svg.appendChild(path);
    return svg;
  }

  function darkenColor(hex, percent) {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    r = Math.max(0, Math.floor(r * (1 - percent / 100)));
    g = Math.max(0, Math.floor(g * (1 - percent / 100)));
    b = Math.max(0, Math.floor(b * (1 - percent / 100)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getOrSetVisitorId() {
    let id = localStorage.getItem('crmRapidoVisitorId');
    if (!id) {
      id = generateUUID();
      localStorage.setItem('crmRapidoVisitorId', id);
    }
    return id;
  }
  
  async function getOrCreateChatSession(initialMessageText) {
    if (!db) return null;
    if (currentSessionId) {
      const sessionDoc = await db.collection('chatSessions').doc(currentSessionId).get();
      if (sessionDoc.exists && (sessionDoc.data().status === 'pending' || sessionDoc.data().status === 'active')) {
        return currentSessionId;
      }
      currentSessionId = null;
      if (unsubscribeMessages) unsubscribeMessages();
      chatBody.innerHTML = '';
    }

    const existingSessionsQuery = db.collection('chatSessions')
      .where('visitorId', '==', visitorId)
      .where('status', 'in', ['pending', 'active'])
      .orderBy('createdAt', 'desc')
      .limit(1);

    const querySnapshot = await existingSessionsQuery.get();
    if (!querySnapshot.empty) {
      currentSessionId = querySnapshot.docs[0].id;
      loadAndListenForMessages(currentSessionId);
      return currentSessionId;
    }

    const newSession = { visitorId, visitorName: settings.defaultVisitorName || `Visitante ${visitorId.substring(0,4)}`, agentId: null, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp(), lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(), initialMessage: initialMessageText || settings.welcomeMessage, currentPageUrl: window.location.href };
    const docRef = await db.collection('chatSessions').add(newSession);
    currentSessionId = docRef.id;
    if (settings.welcomeMessage) addMessageToUI(settings.welcomeMessage, 'system');
    loadAndListenForMessages(currentSessionId);
    return currentSessionId;
  }

  function addMessageToUI(text, senderType, timestamp) {
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.marginBottom = '10px';

    const messageP = document.createElement('p');
    messageP.textContent = text;
    messageP.style.fontSize = '14px';
    messageP.style.padding = '8px 12px';
    messageP.style.maxWidth = '70%';
    messageP.style.wordWrap = 'break-word';

    const timeP = document.createElement('span');
    timeP.style.fontSize = '10px';
    timeP.style.display = 'block';
    timeP.style.marginTop = '4px';

    if (timestamp) {
        try {
            let dateObj = timestamp;
            if(timestamp.toDate) { 
                dateObj = timestamp.toDate();
            } else if (typeof timestamp === 'string') {
                dateObj = new Date(timestamp);
            }
            timeP.textContent = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'});
        } catch (e) {
            console.warn("CRM Rápido: Error formateando timestamp del mensaje", e);
            timeP.textContent = "ahora";
        }
    }


    if (senderType === 'visitor') {
      messageContainer.style.justifyContent = 'flex-end';
      messageP.style.backgroundColor = settings.primaryColor || '#29ABE2';
      messageP.style.color = 'white';
      messageP.style.borderRadius = '15px 15px 0 15px';
      timeP.style.color = 'rgba(255,255,255,0.7)';
      timeP.style.textAlign = 'right';
    } else if (senderType === 'agent') {
      messageContainer.style.justifyContent = 'flex-start';
      messageP.style.backgroundColor = '#e9e9eb';
      messageP.style.color = '#333';
      messageP.style.borderRadius = '15px 15px 15px 0';
      timeP.style.color = '#666';
    } else { // system message
      messageContainer.style.justifyContent = 'center';
      messageP.style.backgroundColor = 'transparent';
      messageP.style.color = '#555';
      messageP.style.fontStyle = 'italic';
      messageP.style.fontSize = '12px';
      messageP.style.borderRadius = '0';
      messageP.style.textAlign = 'center';
      timeP.style.display = 'none'; 
    }
    
    messageP.appendChild(timeP);
    messageContainer.appendChild(messageP);
    chatBody.appendChild(messageContainer);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function handleSendMessage() {
    if (!db) return;
    const messageText = chatInput.value.trim();
    if (!messageText) return;

    const sessionId = await getOrCreateChatSession(messageText);
    if (!sessionId) return;

    const messageData = { sessionId, senderId: visitorId, senderName: settings.defaultVisitorName || `Visitante ${visitorId.substring(0,4)}`, senderType: 'visitor', text: messageText, timestamp: firebase.firestore.FieldValue.serverTimestamp() };

    await db.collection('chatSessions').doc(sessionId).collection('messages').add(messageData);

    const sessionDoc = await db.collection('chatSessions').doc(sessionId).get();
    if (sessionDoc.exists && !sessionDoc.data().initialMessage && messageText) {
      await db.collection('chatSessions').doc(sessionId).update({ lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(), initialMessage: messageText });
    } else {
      await db.collection('chatSessions').doc(sessionId).update({ lastMessageAt: firebase.firestore.FieldValue.serverTimestamp() });
    }

    chatInput.value = '';
  }
  
  function loadAndListenForMessages(sessionId) {
    if (unsubscribeMessages) {
      unsubscribeMessages(); 
    }
    if (!db) { console.error("CRM Rápido: Firestore no inicializado para escuchar mensajes."); return; }
    
    chatBody.innerHTML = ''; 
    if (settings.welcomeMessage && sessionId === currentSessionId) { 
        addMessageToUI(settings.welcomeMessage, 'system');
    }


    const messagesQuery = db.collection('chatSessions').doc(sessionId).collection('messages')
      .orderBy('timestamp', 'asc');
    
    unsubscribeMessages = messagesQuery.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const messageData = change.doc.data();
                // To avoid re-adding a visitor's own just-sent message (if also handled optimistically)
                // This check can be improved with a local message ID or more robust diffing
                if (messageData.senderType !== 'visitor' || change.doc.metadata.hasPendingWrites === false) {
                    addMessageToUI(messageData.text, messageData.senderType, messageData.timestamp);
                }
            }
        });
    }, error => {
        console.error("CRM Rápido: Error escuchando mensajes:", error);
    });
  }

  function toggleChatWindow() {
    isChatWindowOpen = !isChatWindowOpen;
    if (isChatWindowOpen) {
      chatWindow.style.display = 'flex';
      setTimeout(() => { 
        chatWindow.style.opacity = '1';
        chatWindow.style.transform = 'translateY(0px)';
      }, 10);
      chatButton.innerHTML = ''; 
      chatButton.appendChild(iconCloseSvg);
      chatButton.style.transform = 'scale(0.95) rotate(180deg)';
      
      if (!db) {
          console.warn("CRM Rápido: Firestore no está listo al abrir ventana. Intentando inicializar...");
          if (initializeFirebase()) setupWidget(); 
          if (!db) { 
              addMessageToUI("El servicio de chat no está disponible en este momento. Por favor, inténtalo más tarde.", 'system');
              return;
          }
      }

      getOrCreateChatSession(null).then(sessionId => {
          if (sessionId) {
            // Messages for new or existing session will be loaded by loadAndListenForMessages
          } else {
            addMessageToUI("No se pudo iniciar la sesión de chat. Intenta de nuevo.", 'system');
          }
      });

    } else {
      chatWindow.style.opacity = '0';
      chatWindow.style.transform = 'translateY(20px)';
      setTimeout(() => {
         chatWindow.style.display = 'none';
      }, 300); 
      chatButton.innerHTML = ''; 
      chatButton.appendChild(iconOpenSvg);
      chatButton.style.transform = 'scale(1) rotate(0deg)';
      if (unsubscribeMessages) {
        unsubscribeMessages(); 
        unsubscribeMessages = null;
      }
    }
  }

  // --- Event Listeners ---
  chatButton.addEventListener('click', toggleChatWindow);
  closeButtonHeader.addEventListener('click', toggleChatWindow);
  sendButton.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  });
  
  // --- Append to body ---
  function appendElementsToBody() {
    if (document.getElementById('crm-rapido-chat-button')) return; 
    document.body.appendChild(chatButton);
    document.body.appendChild(chatWindow);
  }
  
  if (initializeFirebase()) setupWidget();
})();
    

    

