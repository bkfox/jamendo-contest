
/*******************************************************************************
 *  WebRTC
 ******************************************************************************/
var RTC = {
  peerConnection: window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.RTCPeerConnection,
  iceCandidate: window.mozRTCIceCandidate || window.webkitRTCIceCandidate || window.RTCIceCandidate,
  sessionDescription: window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.RTCSessionDescription,
//  getUserMedia: navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.getUserMedia,
}

RTC.supported = !! RTC.peerConnection;
RTC.moz = !! window.mozRTCPeerConnection;


/*******************************************************************************
 *  DataChannel
 ******************************************************************************/
function DataChannel(server, name) {
  if(name)
    name = name.replace(/(\?|#|\/|\s)/gi, '');

  this.server = server;
  this.name = name;
  this.peers = {};
}


DataChannel.prototype = {
  //----------------------------------------------------------------------------
  _addPeer: function(id, data) {
    console.log(id + ' ' + this.peers[id]);
    if(this.peers[id])
      return;

    var p = new this.Peer(this, id, data);
    this.peers[id] = p;
    this.onpeer(p);
  },


  _onannounce: function (m) {
    var from;
    if(m.disconnected) {
      from = this.peers[m.from];
      if(!from)
        return;

      delete this.peers[m.from];
      this.ondisconnect(from);
      return;
    }


    if(m.connected) {
      // i am connected -- yessss!
      this.me = new this.Peer(this, m.id, -1);
      this.me.data = this.onconnect(m);
      this.onpeer(this.me);

      for(var i in m.peers)
        if(m.peers[i] != m.id)
          this._addPeer(m.peers[i]);
    }


    if(m.refuse) {
      delete this.peers[m.from];
      return;
    }


    if(m.candidate || m.sdp) {
      from = this.peers[m.from];
      if(from)
        from._set(m);
      else {
        var r = this.onpeerrequest(m);
        if(!r)
          return this.announce({ refuse: true, to: m.from });
        this._addPeer(m.from, m);
      }
      return;
    }
  },



  //----------------------------------------------------------------------------
  connect: function () {
    var dc = this;
    var ws = new WebSocket(this.server);

    this.ws = ws;
    ws.onopen = function(evt) {
      dc.announce({ 'join': dc.name });
    };

    ws.onmessage = function(evt) {
      console.log(evt.data);
      try {
        dc._onannounce(JSON.parse(evt.data));
      }
      catch(e) {
        console.log('ws.onmessage:' + e);
      }
    };

    ws.onclose = function(evt) {
      var me = dc.me;
      var peers = dc.peers;

      dc.me = null;
      dc.ws = null;
      dc.peers = {};
      dc.ondisconnect(me, peers);
    };
  },


  disconnect: function () {
    if(this.ws) {
      this.ws.close();
      delete this.ws;
    }
  },


  /**
   *  Message to the server - should not be used
   */
  announce: function(data) {
    this.ws.send(JSON.stringify(data));
  },


  /**
   *  Message to other players
   */
  broadcast: function(data) {
    for(var i in this.peers)
      if(this.me != this.peers[i])
        this.peers[i].send(data);
  },


  /**
   *  Broadcast a message as a string. If it is not a string,
   *  use JSON.stringify;
   */
  broadcastString: function(data) {
    for(var i in this.peers)
      if(this.me != this.peers[i])
        this.peers[i].sendString(data);
  },



  //----------------------------------------------------------------------------
  uniqueToken: function() {
    return parseInt((Date.now() / 10000) * parseInt(Math.random() * 650));
  },



  //----------------------------------------------------------------------------
  /**
   *  Connected to the room
   *  return: data to send to other peers (saved under DataChannel.me.data)
   */
  onconnect: function(message) { throw "unimplemented"; },

  /**
   *  A peer request to connect
   *  return: true if request is accepeted
   */
  onpeerrequest: function (data) { throw "unimplemented"; },

  /**
   *  Called at creation of the peer, use it to add streams
   */
  onpeercreation: function (peer) { throw "unimplemented"; },

  /**
   *  A peer is connected, or DataChannel.me has been created;
   *  Note: at this stage, the WebRTC negociation is not finished, so you
   *  should wait for the "default" datachannel to be opened on the Peer's
   *  connection before opening any stream;
   */
  onpeer: function (peer) { throw "unimplemented"; },

  /**
   *  Peer has been disconnected.
   *  If peer == me, then peers is a list of all peers;
   */
  ondisconnect: function (peer, peers) { throw "unimplemented"; },
}



/*******************************************************************************
 *  Peer
 ******************************************************************************/
/**
 *
 * Attributes:
 *  id:           attributed id by the server;
 *  me:           if the Peer is me;
 *  dc:           DataChannel that hold the Peer
 *
 *  Attributes for Peers that are not me:
 *  channels:     list of opened channels
 *  pc:           WebRtc PeerConnection object
 *
 */
DataChannel.prototype.Peer = function(dc, id, data) {
  this.id = id;
  this.me = (data == -1);
  this.dc = dc;

  if(this.me)
    return;

  var p = this;
  var pc = new RTC.peerConnection(null);

  this.pc = pc;
  this.channels = {}


  // events
  pc.onicecandidate = function (evt) {
    if(evt.candidate)
      dc.announce({ candidate: evt.candidate, data: dc.me.data, to: p.id });
  }

  pc.onaddstream = function (evt) {
    console.log('got a stream');
    p.onstream(evt, p);
  }

  pc.onremovestream = function (evt) {
    p.onremovestream(evt, p);
  }

  pc.ondatachannel = function (evt) {
    p._initDC(evt.channel, true);
  }


  // connection offer/answer - localdescription
  function gd(desc) {
    pc.setLocalDescription(desc);
    dc.announce({ sdp: desc, data: dc.me.data, to: p.id });
  }

  function err(e) {
    var t = 'Error with RTC createOffer OR createAnswer; Error informations:';
    for(var i in e)
      t += '\n\t' + i + ' = ' + e[i];
    console.log(t);
  }


  var dcc;
  if(data)
    // if we got rtc data
    this._set(data);
  else {
    // we are an offerer: create a default channel
    // the given data are our
    dcc = pc.createDataChannel('default');
    this._initDC(dcc);
  }

  dc.onpeercreation(this);

  // don't need it anymore
  delete this.addStream;
  delete this.addDataChannel;

  if(data)
    pc.createAnswer(gd, err);
  else
    pc.createOffer(gd, err);
}


DataChannel.prototype.Peer.prototype = {
  //----------------------------------------------------------------------------
  _initDC: function(channel, isIn) {
    var p = this;
    channel.onmessage = function (evt) {
      p.onmessage(evt.data, channel, p);
    }

    channel.onerror = function (evt) { }
    channel.onclose = function (evt) {
      delete p.channels[channel.label];
      p.onremovedatachannel(channel, p);
    }

    channel.onopen = function (evt) {
      p.channels[channel.label] = channel;
      p.ondatachannel(channel, p);
    }
  },


  _set: function (data) {
    if(data.data) {
      if(!this.data)
        this.data = data.data;
      else
        for(var i in data.data)
          this.data[i] = data.data[i];
    }

    if(data.sdp)
      this.pc.setRemoteDescription(new RTC.sessionDescription(data.sdp));
    else
      this.pc.addIceCandidate(new RTC.iceCandidate(data.candidate));
  },



  //----------------------------------------------------------------------------
  send: function (data, channel) {
    try {
      this.channels[channel || 'default' ].send(data);
    }
    catch(e) {}
  },


  sendString: function (data, channel) {
    if(!data.substr)
      data = JSON.stringify(data);
    this.send(data, channel);
  },


  addStream: function (stream) {
    console.log('Add Stream');
    if(stream.splice)
      for(var i = 0; i < stream.length; i++)
        this.pc.addStream(stream[i]);
    else
      this.pc.addStream(stream);
  },


  removeStream: function (stream) {
    if(stream.splice)
      for(var i = 0; i < stream.length; i++)
        this.pc.removeStream(stream[i]);
    else
      this.pc.removeStream(stream);
  },


  addDataChannel: function (name) {
    if(name.splice)
      for(var i = 0; i < name.length; i++)
        this.pc.createDataChannel(name[i]);
    else
      this.pc.createDataChannel(name);
  },


  removeDataChannel: function (name) {
    if(name.splice)
      for(var i = 0; i < name.length; i++)
        this.channels[name[i]].close();
    else
      this.channels[name].close();
  },


  disconnect: function() {
    delete this.pc;
    // removing is manager upstream for the moment
  },


  //----------------------------------------------------------------------------
  /**
   *
   */
  onmessage: function(msg, me) { throw "unimplemented"; },

  /**
   *
   */
  onstream: function(evt, me) { throw "unimplemented"; },

  /**
   *
   */
  onremovestream: function(evt, me) { throw "unimplemented"; },

  /**
   *
   */
  ondatachannel: function(evt, me) { throw "unimplemented"; },

  /**
   *
   */
  onremovedatachannel: function(evt, me) { throw "unimplemented"; },
}



