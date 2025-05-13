
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
  // #####################################################################################
  // #                                                                                   #
  // #  ¡¡¡ACCIÓN REQUERIDA!!! REEMPLAZA ESTO CON TU CONFIGURACIÓN REAL DE FIREBASE:   #
  // #                                                                                   #
  // #  Obtén estos valores de la Consola de Firebase:                                   #
  // #  1. Ve a tu proyecto en https://console.firebase.google.com/                      #
  // #  2. Haz clic en el ícono de engranaje (Configuración del proyecto) al lado de     #
  // #     "Descripción general del proyecto".                                           #
  // #  3. En la pestaña "General", baja hasta la sección "Tus apps".                     #
  // #  4. Si no tienes una app web, créala.                                             #
  // #  5. Selecciona tu app web y luego elige la opción "CDN" en "SDK setup and         #
  // #     configuration".                                                               #
  // #  6. Copia los valores de 'apiKey', 'authDomain', 'projectId', etc., aquí abajo.   #
  // #                                                                                   #
  // #  SI NO ACTUALIZAS ESTOS VALORES, EL CHAT NO FUNCIONARÁ.                           #
  // #                                                                                   #
  // #####################################################################################
  const firebaseConfig = {
    apiKey: "TU_API_KEY_DE_FIREBASE", // <-- REEMPLAZAR CON TU API KEY REAL
    authDomain: "TU_AUTH_DOMAIN_DE_FIREBASE", // <-- REEMPLAZAR
    projectId: "TU_PROJECT_ID_DE_FIREBASE", // <-- REEMPLAZAR
    storageBucket: "TU_STORAGE_BUCKET_DE_FIREBASE", // <-- REEMPLAZAR
    messagingSenderId: "TU_MESSAGING_SENDER_ID_DE_FIREBASE", // <-- REEMPLAZAR
    appId: "TU_APP_ID_DE_FIREBASE", // <-- REEMPLAZAR
    measurementId: "TU_MEASUREMENT_ID_DE_FIREBASE" // <-- REEMPLAZAR (Opcional)
  };
  // #####################################################################################
  // --- END FIREBASE CONFIG ---

  function initializeFirebase() {
    if (firebaseConfig.apiKey === "TU_API_KEY_DE_FIREBASE" || firebaseConfig.projectId === "TU_PROJECT_ID_DE_FIREBASE") {
        console.error("CRM Rápido: ERROR CRÍTICO - La configuración de Firebase (firebaseConfig) en live-chat-widget.js no ha sido actualizada. Debes reemplazar los valores de placeholder con tu configuración real de Firebase para que el chat funcione.");
        alert("Error de configuración del chat. Por favor, contacta al administrador del sitio. (FIREBASE_NOT_CONFIGURED)");
        return false;
    }

    if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
      console.warn("CRM Rápido: Firebase SDK no está cargado. Intentando cargar dinámicamente...");
      const firebaseScript = document.createElement('script');
      firebaseScript.src = "https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js";
      firebaseScript.onload = () => {
        const firestoreScript = document.createElement('script');
        firestoreScript.src = "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore-compat.js";
        firestoreScript.onload = () => {
          console.log("CRM Rápido: Firebase SDK cargado dinámicamente.");
          try {
            if (!firebase.apps.length) { // Evitar re-inicializar si ya está
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            console.log("CRM Rápido: Firebase inicializado después de carga dinámica.");
            if (db) {
                setupWidget();
            } else {
                console.error("CRM Rápido: Firestore (db) no se pudo inicializar después de la carga dinámica.");
                 alert("Error al inicializar la base de datos del chat. Por favor, inténtalo más tarde. (DB_INIT_FAIL_DYNAMIC)");
            }
          } catch (e) {
            console.error("CRM Rápido: Error inicializando Firebase tras carga dinámica. Verifica firebaseConfig.", e);
            alert("Error al inicializar el chat. Por favor, verifica la configuración de Firebase o contacta al soporte del sitio. (INIT_FAIL_DYNAMIC)");
          }
        };
        document.head.appendChild(firestoreScript);
      };
      document.head.appendChild(firebaseScript);
      return false; // Initialization will happen asynchronously
    }
    
    try {
        if (!firebase.apps.length) { // Evitar re-inicializar si ya está
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        if (db) {
            console.log("CRM Rápido: Firebase inicializado exitosamente.");
            return true;
        } else {
            console.error("CRM Rápido: Firestore (db) no se pudo inicializar.");
            alert("Error al inicializar la base de datos del chat. Por favor, inténtalo más tarde. (DB_INIT_FAIL_STATIC)");
            return false;
        }
    } catch (e) {
        console.error("CRM Rápido: Error al inicializar Firebase. Verifica tu firebaseConfig.", e);
        alert("Error al inicializar el chat. Por favor, contacta al soporte del sitio. (INIT_FAIL_STATIC)");
        return false;
    }
  }

  function setupWidget() {
    if (!db) {
        console.error("CRM Rápido: Firestore (db) no está inicializado. El widget no puede funcionar. Asegúrate de haber reemplazado los placeholders en `firebaseConfig` en `live-chat-widget.js` con tu configuración real de Firebase.");
        return;
    }
    visitorId = getOrSetVisitorId();
    console.log("CRM Rápido: Visitor ID:", visitorId);
    appendElementsToBody();
  }
  
  if (initializeFirebase()) { 
    setupWidget();
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
    if (!db) { console.error("CRM Rápido: Firestore no inicializado al intentar obtener sesión."); return null; }
    if (currentSessionId) {
        try {
            const sessionDoc = await db.collection('chatSessions').doc(currentSessionId).get();
            if (sessionDoc.exists && (sessionDoc.data().status === 'pending' || sessionDoc.data().status === 'active')) {
                return currentSessionId;
            }
        } catch (e) {
            console.error("CRM Rápido: Error verificando sesión activa existente:", e);
        }
        currentSessionId = null; 
        if(unsubscribeMessages) unsubscribeMessages(); 
        chatBody.innerHTML = ''; 
    }
    
    const existingSessionsQuery = db.collection('chatSessions')
        .where('visitorId', '==', visitorId)
        .where('status', 'in', ['pending', 'active'])
        .orderBy('createdAt', 'desc')
        .limit(1);

    try {
        const querySnapshot = await existingSessionsQuery.get();
        if (!querySnapshot.empty) {
            currentSessionId = querySnapshot.docs[0].id;
            console.log("CRM Rápido: Encontrada sesión existente:", currentSessionId);
            loadAndListenForMessages(currentSessionId);
            return currentSessionId;
        }
    } catch(error) {
        console.error("CRM Rápido: Error buscando sesión existente:", error);
    }

    console.log("CRM Rápido: Creando nueva sesión de chat.");
    const newSession = {
      visitorId: visitorId,
      visitorName: settings.defaultVisitorName || `Visitante ${visitorId.substring(0,4)}`,
      agentId: null,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      initialMessage: initialMessageText || settings.welcomeMessage,
      currentPageUrl: window.location.href,
    };

    try {
      const docRef = await db.collection('chatSessions').add(newSession);
      currentSessionId = docRef.id;
      console.log("CRM Rápido: Nueva sesión de chat creada:", currentSessionId);
      
      if(settings.welcomeMessage){
        addMessageToUI(settings.welcomeMessage, 'system');
      }

      loadAndListenForMessages(currentSessionId);
      return currentSessionId;
    } catch (error) {
      console.error("CRM Rápido: Error creando nueva sesión de chat:", error);
      return null;
    }
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
    if (!db) { console.error("CRM Rápido: Firestore no inicializado al enviar mensaje."); return; }
    const messageText = chatInput.value.trim();
    if (messageText === "") return;

    const sessionId = await getOrCreateChatSession(messageText); 
    if (!sessionId) {
      console.error("CRM Rápido: No se pudo obtener o crear la sesión de chat.");
      alert("Error al enviar mensaje. Intenta de nuevo.");
      return;
    }
    
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
      // Update lastMessageAt on the session for sorting/activity tracking
      // Also update initialMessage if it's the first message of a newly created session
      const sessionUpdateData = {
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      // Check if this message should also set/update the initialMessage for the session
      const sessionDoc = await db.collection('chatSessions').doc(sessionId).get();
      if (sessionDoc.exists() && !sessionDoc.data().initialMessage && messageText) {
          sessionUpdateData.initialMessage = messageText;
      }
      await db.collection('chatSessions').doc(sessionId).update(sessionUpdateData);

      chatInput.value = "";
    } catch (error) {
      console.error("CRM Rápido: Error enviando mensaje a Firestore:", error);
      addMessageToUI("Error al enviar tu mensaje. Intenta de nuevo.", 'system');
    }
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

})();
    

    

