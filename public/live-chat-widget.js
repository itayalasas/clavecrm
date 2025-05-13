
// public/live-chat-widget.js
(function() {
  if (typeof window.CRMRapidoChatSettings === 'undefined') {
    console.error("CRM Rápido: Configuración del widget de chat no encontrada. Asegúrate de que window.CRMRapidoChatSettings esté definido antes de cargar este script.");
    return;
  }

  const settings = window.CRMRapidoChatSettings;

  if (!settings.widgetEnabled) {
    console.log("CRM Rápido: El widget de chat está deshabilitado.");
    return;
  }

  console.log("CRM Rápido: Widget de Chat en Vivo JS cargado.", settings);

  let isChatWindowOpen = false;
  let visitorId = null;
  let currentSessionId = null;
  let db = null; // Firestore instance
  let unsubscribeMessages = null; // To stop listening to messages when chat closes

  // --- START FIREBASE CONFIG ---
  // IMPORTANT: Replace with your actual Firebase config object
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // REPLACE
    authDomain: "YOUR_AUTH_DOMAIN", // REPLACE
    projectId: "YOUR_PROJECT_ID", // REPLACE
    storageBucket: "YOUR_STORAGE_BUCKET", // REPLACE
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // REPLACE
    appId: "YOUR_APP_ID", // REPLACE
    measurementId: "YOUR_MEASUREMENT_ID" // Optional
  };
  // --- END FIREBASE CONFIG ---

  function initializeFirebase() {
    if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
      console.error("CRM Rápido: Firebase SDK no está cargado. Intenta incluirlo en tu página antes de este script.");
      // Attempt to load Firebase SDK dynamically if not present
      const firebaseScript = document.createElement('script');
      firebaseScript.src = "https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js"; // Use compat for easier syntax in plain JS
      firebaseScript.onload = () => {
        const firestoreScript = document.createElement('script');
        firestoreScript.src = "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore-compat.js";
        firestoreScript.onload = () => {
          console.log("CRM Rápido: Firebase SDK cargado dinámicamente.");
          firebase.initializeApp(firebaseConfig);
          db = firebase.firestore();
          setupWidget();
        };
        document.head.appendChild(firestoreScript);
      };
      document.head.appendChild(firebaseScript);
      return false;
    }
    
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        console.log("CRM Rápido: Firebase inicializado exitosamente.");
        return true;
    } catch (e) {
        console.error("CRM Rápido: Error al inicializar Firebase. Verifica tu firebaseConfig.", e);
        alert("Error al inicializar el chat. Por favor, contacta al soporte del sitio.");
        return false;
    }
  }

  function setupWidget() {
    visitorId = getOrSetVisitorId();
    console.log("CRM Rápido: Visitor ID:", visitorId);
    appendElementsToBody();
  }
  
  if (initializeFirebase()) {
    setupWidget();
  }


  // --- Create Chat Button ---
  const chatButton = document.createElement('button');
  // ... (chatButton styles and icon setup - no changes needed here for Firebase integration) ...
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
  // ... (chatWindow styles - no changes here) ...
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
  // ... (chatHeader styles - no changes) ...
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
  // ... (headerText styles - no changes) ...
  headerText.style.fontSize = '16px';
  headerText.style.fontWeight = '600';
  headerText.style.margin = '0';
  headerText.style.lineHeight = '1.2';


  const closeButtonHeader = document.createElement('button');
  // ... (closeButtonHeader styles - no changes) ...
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
  // ... (chatBody styles - no changes) ...
  chatBody.style.flexGrow = '1';
  chatBody.style.padding = '15px';
  chatBody.style.overflowY = 'auto';
  chatBody.style.backgroundColor = '#f9f9f9';
  
  const welcomeMessageP = document.createElement('p');
  // ... (welcomeMessageP styles - no changes) ...
  welcomeMessageP.textContent = settings.welcomeMessage || '¡Hola! ¿En qué podemos ayudarte hoy?';
  welcomeMessageP.style.fontSize = '14px';
  welcomeMessageP.style.color = '#333';
  welcomeMessageP.style.padding = '10px';
  welcomeMessageP.style.backgroundColor = '#e9f5ff';
  welcomeMessageP.style.borderRadius = '8px 8px 8px 0';
  welcomeMessageP.style.maxWidth = '80%';
  welcomeMessageP.style.wordWrap = 'break-word';

  chatBody.appendChild(welcomeMessageP);
  chatWindow.appendChild(chatBody);

  // Chat Window Input Area
  const chatInputContainer = document.createElement('div');
  // ... (chatInputContainer styles - no changes) ...
  chatInputContainer.style.padding = '15px';
  chatInputContainer.style.borderTop = '1px solid #e0e0e0';
  chatInputContainer.style.backgroundColor = 'white';
  chatInputContainer.style.display = 'flex';
  chatInputContainer.style.alignItems = 'center';

  const chatInput = document.createElement('input');
  chatInput.type = 'text';
  chatInput.placeholder = 'Escribe tu mensaje...';
  // ... (chatInput styles - no changes) ...
  chatInput.style.flexGrow = '1';
  chatInput.style.padding = '10px';
  chatInput.style.border = '1px solid #ccc';
  chatInput.style.borderRadius = '20px';
  chatInput.style.fontSize = '14px';
  chatInput.style.outline = 'none';


  const sendButton = document.createElement('button');
  // ... (sendButton styles and icon - no changes) ...
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

  function generateUUID() { // Simple UUID generator
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
    if (!db) { console.error("Firestore not initialized"); return null; }
    if (currentSessionId) {
        // Check if session still exists and is active/pending
        const sessionDoc = await db.collection('chatSessions').doc(currentSessionId).get();
        if (sessionDoc.exists && (sessionDoc.data().status === 'pending' || sessionDoc.data().status === 'active')) {
            return currentSessionId;
        }
        currentSessionId = null; // Reset if session is closed or doesn't exist
    }

    // Try to find an existing pending/active session for this visitor
    const existingSessionsQuery = db.collection('chatSessions')
        .where('visitorId', '==', visitorId)
        .where('status', 'in', ['pending', 'active'])
        .orderBy('createdAt', 'desc')
        .limit(1);

    try {
        const querySnapshot = await existingSessionsQuery.get();
        if (!querySnapshot.empty) {
            currentSessionId = querySnapshot.docs[0].id;
            console.log("CRM Rápido: Found existing session:", currentSessionId);
            listenForMessages(currentSessionId);
            return currentSessionId;
        }
    } catch(error) {
        console.error("CRM Rápido: Error finding existing session:", error);
    }


    // No active/pending session found, create a new one
    const newSession = {
      visitorId: visitorId,
      visitorName: settings.defaultVisitorName || `Visitante ${visitorId.substring(0,4)}`, // Optional: Get visitor name
      agentId: null,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      initialMessage: initialMessageText,
      currentPageUrl: window.location.href,
    };

    try {
      const docRef = await db.collection('chatSessions').add(newSession);
      currentSessionId = docRef.id;
      console.log("CRM Rápido: New chat session created:", currentSessionId);
      listenForMessages(currentSessionId);
      return currentSessionId;
    } catch (error) {
      console.error("CRM Rápido: Error creating new chat session:", error);
      return null;
    }
  }

  function addMessageToUI(text, senderType) {
    const messageContainer = document.createElement('div');
    messageContainer.style.display = 'flex';
    messageContainer.style.marginBottom = '10px';

    const messageP = document.createElement('p');
    messageP.textContent = text;
    messageP.style.fontSize = '14px';
    messageP.style.padding = '8px 12px';
    messageP.style.maxWidth = '70%';
    messageP.style.wordWrap = 'break-word';

    if (senderType === 'visitor') {
      messageContainer.style.justifyContent = 'flex-end';
      messageP.style.backgroundColor = settings.primaryColor || '#29ABE2';
      messageP.style.color = 'white';
      messageP.style.borderRadius = '15px 15px 0 15px';
    } else { // agent
      messageContainer.style.justifyContent = 'flex-start';
      messageP.style.backgroundColor = '#e9e9eb';
      messageP.style.color = '#333';
      messageP.style.borderRadius = '15px 15px 15px 0';
    }
    
    messageContainer.appendChild(messageP);
    chatBody.appendChild(messageContainer);
    chatBody.scrollTop = chatBody.scrollHeight;
  }


  async function handleSendMessage() {
    if (!db) { console.error("Firestore not initialized"); return; }
    const messageText = chatInput.value.trim();
    if (messageText === "") return;

    const sessionId = await getOrCreateChatSession(messageText);
    if (!sessionId) {
      console.error("CRM Rápido: No se pudo obtener o crear la sesión de chat.");
      alert("Error al enviar mensaje. Intenta de nuevo.");
      return;
    }
    
    addMessageToUI(messageText, 'visitor'); // Add visitor message to UI immediately

    const messageData = {
      sessionId: sessionId,
      senderId: visitorId,
      senderName: settings.defaultVisitorName || `Visitante ${visitorId.substring(0,4)}`,
      senderType: 'visitor',
      text: messageText,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await db.collection('chatSessions').doc(sessionId).collection('messages').add(messageData);
      await db.collection('chatSessions').doc(sessionId).update({
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(currentSessionId ? {} : {initialMessage: messageText}) // Update initial message only if it's a new session effectively
      });
      chatInput.value = "";
    } catch (error) {
      console.error("CRM Rápido: Error enviando mensaje a Firestore:", error);
      // Optionally, display an error to the user in the chat window
    }
  }
  
  function listenForMessages(sessionId) {
    if (unsubscribeMessages) {
      unsubscribeMessages(); // Stop listening to previous session if any
    }
    if (!db) { console.error("Firestore not initialized for listening"); return; }

    unsubscribeMessages = db.collection('chatSessions').doc(sessionId).collection('messages')
      .orderBy('timestamp', 'asc') // Get messages in order
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const messageData = change.doc.data();
            // Avoid re-adding the visitor's own messages if they were added optimistically
            if (messageData.senderType === 'agent') {
                // Check if message already displayed (simple check based on text and approx time)
                // This is a basic way to avoid duplicates if UI updated before Firestore echo.
                // A more robust way would be to use local IDs and reconcile.
                const existingMessages = chatBody.querySelectorAll('p');
                let alreadyDisplayed = false;
                existingMessages.forEach(p => {
                    if(p.textContent === messageData.text) { // Super simple check
                        alreadyDisplayed = true;
                    }
                });
                if(!alreadyDisplayed) {
                    addMessageToUI(messageData.text, 'agent');
                }
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
      
      // If opening for the first time and there's no active session ID,
      // or if trying to get an existing session.
      if (!currentSessionId) {
          getOrCreateChatSession("Chat iniciado por el visitante").then(sessionId => {
              if (sessionId) {
                // Messages for new or existing session will be loaded by listenForMessages
              } else {
                // Could display an error in chat window if session can't be established
              }
          });
      } else {
        listenForMessages(currentSessionId); // Ensure listener is active if window re-opened
      }

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
        unsubscribeMessages(); // Stop listening when chat is closed
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
    if (document.getElementById('crm-rapido-chat-button')) return; // Avoid appending multiple times
    document.body.appendChild(chatButton);
    document.body.appendChild(chatWindow);
  }

})();

    