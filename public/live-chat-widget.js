// public/live-chat-widget.js
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
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
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
    chatToggle.id = "crm-rapido-chat-toggle";
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
    chatToggle.addEventListener("click", toggleChatWindow);
  }

  function toggleChatWindow() {
    const chat = document.getElementById("crm-rapido-chat-window");
    if (!chat) return;
    const isHidden = chat.style.display === "none" || !chat.style.display;
    chat.style.display = isHidden ? "flex" : "none";
    chat.style.opacity = isHidden ? "1" : "0";
    chat.style.transform = isHidden ? "translateY(0)" : "translateY(20px)";
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

  async function getOrCreateChatSession() {
    if (!db) return null;
    if (currentSessionId) return currentSessionId;

    const snapshot = await db.collection("chatSessions")
      .where("visitorId", "==", visitorId)
      .where("status", "in", ["pending", "active"]) 
      .limit(1)
      .get();

    if (!snapshot.empty) {
      currentSessionId = snapshot.docs[0].id;
      listenForAgentAssignment(currentSessionId);
      return currentSessionId;
    }

    const docRef = await db.collection("chatSessions").add({
      visitorId,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    currentSessionId = docRef.id;
    showWelcomeMessages();
    listenForAgentAssignment(currentSessionId);
    return currentSessionId;
  }

  // (Resto: creación de chatWindow, chatBody, chatInput, sendButton, handlers, etc.)

  // Inicialización
  if (initializeFirebase()) setupWidget();
})();
