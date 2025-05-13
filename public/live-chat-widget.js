
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
  const iconCloseSvg = createChatIcon("M18 6L6 18M6 6l12 12"); // X icon

  chatButton.appendChild(iconOpenSvg); // Start with open icon

  if (settings.widgetPosition === 'bottom-left') {
    chatButton.style.left = '20px';
    chatButton.style.bottom = '20px';
  } else { // Default to bottom-right
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
    chatWindow.style.bottom = '86px'; // Above button
  } else {
    chatWindow.style.right = '20px';
    chatWindow.style.bottom = '86px'; // Above button
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
  
  const welcomeMessageP = document.createElement('p');
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

  function toggleChatWindow() {
    isChatWindowOpen = !isChatWindowOpen;
    if (isChatWindowOpen) {
      chatWindow.style.display = 'flex';
      setTimeout(() => { // Allow display to apply before animating
        chatWindow.style.opacity = '1';
        chatWindow.style.transform = 'translateY(0px)';
      }, 10);
      chatButton.innerHTML = ''; // Clear previous icon
      chatButton.appendChild(iconCloseSvg);
      chatButton.style.transform = 'scale(0.95) rotate(180deg)';
    } else {
      chatWindow.style.opacity = '0';
      chatWindow.style.transform = 'translateY(20px)';
      setTimeout(() => {
         chatWindow.style.display = 'none';
      }, 300); // Match transition duration
      chatButton.innerHTML = ''; // Clear previous icon
      chatButton.appendChild(iconOpenSvg);
      chatButton.style.transform = 'scale(1) rotate(0deg)';
    }
  }

  // --- Event Listeners ---
  chatButton.addEventListener('click', toggleChatWindow);
  closeButtonHeader.addEventListener('click', toggleChatWindow);

  sendButton.addEventListener('click', () => {
    if (chatInput.value.trim() !== "") {
      const messageText = chatInput.value.trim();
      // Placeholder: In a real app, this would send the message via Firebase
      const userMessage = document.createElement('div');
      userMessage.style.display = 'flex';
      userMessage.style.justifyContent = 'flex-end';
      userMessage.style.marginBottom = '10px';

      const userMessageP = document.createElement('p');
      userMessageP.textContent = messageText;
      userMessageP.style.fontSize = '14px';
      userMessageP.style.padding = '8px 12px';
      userMessageP.style.backgroundColor = settings.primaryColor || '#29ABE2';
      userMessageP.style.color = 'white';
      userMessageP.style.borderRadius = '15px 15px 0 15px';
      userMessageP.style.maxWidth = '70%';
      userMessageP.style.wordWrap = 'break-word';
      
      userMessage.appendChild(userMessageP);
      chatBody.appendChild(userMessage);
      chatInput.value = "";
      chatBody.scrollTop = chatBody.scrollHeight;

      // Simulate agent reply
      setTimeout(() => {
        const agentReply = document.createElement('div');
        agentReply.style.display = 'flex';
        agentReply.style.justifyContent = 'flex-start';
        agentReply.style.marginBottom = '10px';
        
        const agentReplyP = document.createElement('p');
        agentReplyP.textContent = `Agente: Gracias por tu mensaje. (Respuesta simulada)`;
        agentReplyP.style.fontSize = '14px';
        agentReplyP.style.padding = '8px 12px';
        agentReplyP.style.backgroundColor = '#e9e9eb';
        agentReplyP.style.color = '#333';
        agentReplyP.style.borderRadius = '15px 15px 15px 0';
        agentReplyP.style.maxWidth = '70%';
        agentReplyP.style.wordWrap = 'break-word';

        agentReply.appendChild(agentReplyP);
        chatBody.appendChild(agentReply);
        chatBody.scrollTop = chatBody.scrollHeight;
      }, 1000);
    }
  });
  
  // --- Append to body ---
  document.body.appendChild(chatButton);
  document.body.appendChild(chatWindow);

  // TODO: Add logic here to:
  // 1. Generate a unique visitorId if one doesn't exist (store in localStorage).
  // 2. When chat is opened/first message sent:
  //    - Create a new chat session in Firestore in the `chatSessions` collection.
  //    - Include `visitorId`, `status: 'pending'`, `createdAt`, `lastMessageAt`, `initialMessage`.
  // 3. Implement sending/receiving messages via Firestore listeners.
  //    - Messages for a session go into `chatSessions/{sessionId}/messages`.
  //    - Agent panel will listen to `chatSessions` for new/active sessions.
  //    - Both widget and agent panel listen to message subcollections.

})();
