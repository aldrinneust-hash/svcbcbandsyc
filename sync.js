class BandSyncEngine {
  constructor() {
    this.peer = null;
    this.connections = []; // For Host: list of member connections
    this.hostConn = null;  // For Member: connection to host
    this.isHost = false;
    this.sessionCode = null;
    this.onStateReceived = null;
    this.onPeerCountChange = null;
  }

  initHost(sessionCode, callbacks) {
    this.isHost = true;
    this.sessionCode = sessionCode.toUpperCase();
    this.onPeerCountChange = callbacks.onPeerCountChange;
    const peerId = `bandsync-${this.sessionCode}`;
    this.peer = new Peer(peerId);
    this.peer.on('open', (id) => {
      console.log('Host session opened with ID:', id);
      if (callbacks.onHostReady) callbacks.onHostReady(this.sessionCode);
    });
    this.peer.on('connection', (conn) => {
      this.connections.push(conn);
      if (this.onPeerCountChange) this.onPeerCountChange(this.connections.length);
      conn.on('data', (data) => {
        console.log('Host received data from member:', data);
      });
      conn.on('close', () => {
        this.connections = this.connections.filter(c => c !== conn);
        if (this.onPeerCountChange) this.onPeerCountChange(this.connections.length);
      });
    });
    this.peer.on('error', (err) => {
      console.error('PeerJS Host Error:', err);
    });
  }

  joinSession(sessionCode, callbacks) {
    this.isHost = false;
    this.sessionCode = sessionCode.toUpperCase();
    this.onStateReceived = callbacks.onStateReceived;
    this.peer = new Peer(); // Random Member Peer ID
    this.peer.on('open', () => {
      const hostPeerId = `bandsync-${this.sessionCode}`;
      this.hostConn = this.peer.connect(hostPeerId);
      this.hostConn.on('open', () => {
        console.log('Successfully connected to Host:', hostPeerId);
        if (callbacks.onConnected) callbacks.onConnected();
      });
      this.hostConn.on('data', (payload) => {
        if (this.onStateReceived) this.onStateReceived(payload);
      });
      this.hostConn.on('close', () => {
        if (callbacks.onDisconnected) callbacks.onDisconnected();
      });
    });
    this.peer.on('error', (err) => {
      console.error('PeerJS Join Error:', err);
      if (callbacks.onError) callbacks.onError(err);
    });
  }

  broadcast(actionType, payload) {
    if (!this.isHost) return;
    const packet = {
      type: actionType,
      payload: payload,
      timestamp: Date.now()
    };
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send(packet);
      }
    });
  }

  generateQRCode(containerId, sessionCode) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const joinUrl = `${window.location.origin}${window.location.pathname}?join=${sessionCode}`;
    new QRCode(container, {
      text: joinUrl,
      width: 180,
      height: 180,
      colorDark: "#0f172a",
      colorLight: "#ffffff"
    });
  }
}

window.syncEngine = new BandSyncEngine();