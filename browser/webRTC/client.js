// WebRTC Logic for Client


/** You should probably use a different stun server doing commercial stuff **/
/** Also see: https://gist.github.com/zziuni/3741933 **/
const ICE_SERVERS = [
  { url: 'stun:stun.l.google.com:19302' }
];

// This will be our socket connection
let signalingSocket = null;
let localMediaStream = null; // Our microphone
let peers = {}; // keep track of our peer connections, indexed by peer_id (aka socket.io id)
let peerMediaElements = {};  // keep track of our <audio> tags, indexed by peer_id



// When a "Reactified" A-Frame Scene hits the componentDidMount lifecycle hook, it calls
//   the joinChatRoom function, passing in a unique string matching the name of the React
//   component (e.g. /vr/joey/ passes in 'joey'). First, joinChatRoom checks to see if the
//   microphone audio stream is already active, and if it is, it immediately
//   invokes the 'joinChatRoom' socket event to the server, which triggers the client to
//   join the socket.io room matching the string passed in. It then also instructs the
//   clients in the same VR scene / socket.io room to initiate WebRTC peer-to-peer connections
//   for voice. If the microphone audio stream was instead not yet active, the client invokes
//   getUserMedia to obtain an audio stream, saves the stream to the external var localMediaStream,
//   and sets the stream as the srcObject of an AUDIO tag of ID localAudio, which is immediately
//   muted. Finally, the client invokes 'joinChatRoom' as above.
// If the user decides not to share their microphone, they are presented with an error
//   informing them that voice is unavailable.

export function joinChatRoom (room, errorback) {
  if (!room) {
    console.log('No room was provided');
    return;
  }
  if (signalingSocket === null) {
    signalingSocket = window.socket;
  }
  if (localMediaStream != null) {  /* ie, if we've already been initialized */
    signalingSocket.emit('joinChatRoom', room);
    return;
  }
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
  console.log('Requesting access to local audio / video inputs');
  navigator.getUserMedia({ 'audio': true, 'video': false }, function (stream) {
    console.log('Access granted to audio');
    localMediaStream = stream;
    const audioEl = document.getElementById('localAudio');
    audioEl.muted = true;
    audioEl.srcObject = stream;
    signalingSocket.emit('joinChatRoom', room);
  },
    function () { /* user denied access to a/v */
      console.log('Access denied for audio/video');
      window.alert('You chose not to provide access to your microphone, so real-time voice chat is unavailable.');
      if (errorback) errorback();
    });
}

// When a "Reactified" A-Frame Scene hits the componentWillUnmount lifecycle hook, it calls
//   the leaveChatRoom function, passing in a unique string matching the name of the React
//   component (e.g. /vr/joey/ passes in 'joey'). This triggers server-side logic to leave
//   the matching socket.io room and tear down existing WebRTC connections.
export function leaveChatRoom (room) {
  signalingSocket.emit('leaveChatRoom', room);
}

// accepts conifg
export function addPeerConn (config) {
  console.log('Signaling server said to add peer:', config);
  const peerId = config.peer_id;
  // If for some reason, this client aready is connected to the peer, return
  if (peerId in peers) {
    console.log('Already connected to peer ', peerId);
    return;
  }

  // Create a webRTC peer connection to the ICE servers
  const peerConnection = new webkitRTCPeerConnection(
    { 'iceServers': ICE_SERVERS },
    { 'optional': [{ 'DtlsSrtpKeyAgreement': true }] }
    /* this will no longer be needed by chrome
    * eventually (supposedly), but is necessary
    * for now to get firefox to talk to chrome */
  );
  peers[peerId] = peerConnection;

  // I'm not 100% sure what this does, but it sets up ice candidates ¯\_(ツ)_/¯
  peerConnection.onicecandidate = function (event) {
    if (event.candidate) {
      signalingSocket.emit('relayICECandidate', {
        'peer_id': peerId,
        'ice_candidate': {
          'sdpMLineIndex': event.candidate.sdpMLineIndex,
          'candidate': event.candidate.candidate
        }
      });
    }
  };

  // When we recieve a remote audio stream from the peer, create an audio tag and append it to the
  //   body tag of the DOM. Set the audio tag with an ID equal to the peerID, set it to autoplay,
  //   and save the audio stream to the peerMediaElements object
  peerConnection.onaddstream = function (event) {
    console.log('onAddStream', event);
    const remoteAudio = document.createElement('audio');
    const bodyTag = document.getElementsByTagName('body')[0];
    bodyTag.appendChild(remoteAudio);
    remoteAudio.setAttribute('id', peerId);
    remoteAudio.setAttribute('autoplay', 'autoplay');
    peerMediaElements[peerId] = remoteAudio;
    remoteAudio.srcObject = event.stream;
  };
  /* Add our local stream */
  peerConnection.addStream(localMediaStream);
  /* Only one side of the peer connection should create the
  * offer, the signaling server picks one to be the offerer.
  * The other user will get a 'sessionDescription' event and will
  * create an offer, then send back an answer 'sessionDescription' to us
  */
  if (config.should_create_offer) {
    console.log('Creating RTC offer to ', peerId);
    peerConnection.createOffer(
      function (localDescription) {
        console.log('Local offer description is: ', localDescription);
        peerConnection.setLocalDescription(localDescription,
          function () {
            signalingSocket.emit('relaySessionDescription',
              { 'peer_id': peerId, 'session_description': localDescription });
            console.log('Offer setLocalDescription succeeded');
          },
          function () { window.alert('Offer setLocalDescription failed!'); }
        );
      },
      function (error) {
        console.log('Error sending offer: ', error);
      }
    );
  }
}

export function removePeerConn (config) {
  console.log('Signaling server said to remove peer:', config);
  const peerId = config.peer_id;
  if (peerId in peerMediaElements) {
    peerMediaElements[peerId].remove();
  }
  if (peerId in peers) {
    peers[peerId].close();
  }
  delete peers[peerId];
  delete peerMediaElements[config.peerId];
}

export function setRemoteAnswer (config) {
  console.log('Remote description received: ', config);
  const peerId = config.peer_id;
  const peer = peers[peerId];
  const remoteDescription = config.session_description;
  console.log(config.session_description);
  const desc = new RTCSessionDescription(remoteDescription);
  const stuff = peer.setRemoteDescription(desc,
    function () {
      console.log('setRemoteDescription succeeded');
      if (remoteDescription.type === 'offer') {
        console.log('Creating answer');
        peer.createAnswer(
          function (localDescription) {
            console.log('Answer description is: ', localDescription);
            peer.setLocalDescription(localDescription,
              function () {
                signalingSocket.emit('relaySessionDescription',
                  { 'peer_id': peerId, 'session_description': localDescription });
                console.log('Answer setLocalDescription succeeded');
              },
              function () { window.alert('Answer setLocalDescription failed!'); }
            );
          },
          function (error) {
            console.log('Error creating answer: ', error);
            console.log(peer);
          }
        );
      }
    },
    function (error) {
      console.log('setRemoteDescription error: ', error);
    }
  );
  console.log('Description Object: ', desc);
}

export function setIceCandidate (config) {
  const peer = peers[config.peer_id];
  const iceCandidate = config.ice_candidate;
  peer.addIceCandidate(new RTCIceCandidate(iceCandidate));
}

export function disconnectUser () {
  for (const peerId in peerMediaElements) {
    peerMediaElements[peerId].remove();
  }
  for (const peerId in peers) {
    peers[peerId].close();
  }
  peers = {};
  peerMediaElements = {};
}
