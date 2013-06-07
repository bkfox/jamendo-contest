
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
  this.server = server;
  this.name = name;
  this.peers = {};
}


DataChannel.prototype = {
  //----------------------------------------------------------------------------
  _addPeer: function(id, data, offerer) {
    if(this.peers[id])
      return;

    var p = new this.Peer(this, id, data);
    var o = this.onpeer(p, offerer);
    if(!o)
      return this.announce({ refuse: true, to: id });

    this.peers[id] = p;
    p._setStreams(o);
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
      this.position = m.peers.length;
      this.me = new this.Peer(this, m.id, -1);
      this.me.data = this.onconnect(m);
      this.onpeer(this.me);

      // last one is always me
      for(var i = 0; i < m.peers.length-1; i++)
        this._addPeer(m.peers[i], null, true);
    }


    if(m.refuse) {
      delete this.peers[m.from];
      return;
    }


    if(m.candidate || m.sdp) {
      from = this.peers[m.from];
      if(from)
        from._set(m);
      else
        this._addPeer(m.from, m);
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
      dc._onannounce(JSON.parse(evt.data));
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
  broadcastAsString: function(data) {
    if(!data.substr)
      data = JSON.stringify(data);

    for(var i in this.peers)
      if(this.me != this.peers[i])
        this.peers[i].send(data);
  },



  get ready() {
    for(var i in this.peers)
      if(!this.peers[i].ready)
        return false;
    return true;
  },


  get count() {
    if(!this.me)
      return 0;

    return Object.keys(this.peers).length + 1;
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
   *  A peer is connected, or DataChannel.me has been created;
   *
   *  When peer is not me:
   *    If nothing is returned by this function, it refuse peer's connection
   *    Otherwise, an object with:
   *        {
   *          streams:      Array of string (for channel) or streams,
   *          incoming:     Number of expected incoming streams/channels
   *        }
   */
  onpeer: function (peer, offerer) { throw "unimplemented"; },

  /**
   *  A peer has been disconnected.
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
  this._data = data;
}


DataChannel.prototype.Peer.prototype = {
  _setStreams: function(streams) {
    if(this.me || this.channels)
      return;

    var p = this;
    var dc = this.dc;
    var data = this._data;

    var pc = new RTC.peerConnection(null);
    this.pc = pc;
    this.channels = {}


    // events
    pc.onicecandidate = function (evt) {
      if(evt.candidate)
        dc.announce({ candidate: evt.candidate, data: dc.me.data, to: p.id });
    }

    pc.onaddstream = function (evt) {
      p.onstream(evt, p);
      p._credit();
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

    // streams
    this._loading = streams.streams.length + streams.incoming;

    streams = streams.streams;
    for(var i = 0; i < streams.length; i++)
      if(streams[i].substr)
        this._initDC(pc.createDataChannel(streams[i]));
      else {
        pc.addStream(streams[i]);
        this._loading--;
      }

    if(data)
      pc.createAnswer(gd, err);
    else
      pc.createOffer(gd, err);

    delete this._data;
  },


  _initDC: function(channel, isIn) {
    var p = this;
    channel.onmessage = function (evt) { p.onmessage(evt.data, channel, p); }
    channel.onerror = function (evt) { p.onerror(evt, p); }
    channel.onclose = function (evt) {
      delete p.channels[channel.label];
      p.onremovedatachannel(channel, p);
    }

    channel.onopen = function (evt) {
      p.channels[channel.label] = channel;
      p.ondatachannel(channel, p);
      p._credit();
    }
  },


  _credit: function() {
    if(this._loading == undefined)
      return;

    this._loading--;
    if(!this._loading) {
      delete this._loading;
      this.ready = true;
      this.onready(this);
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
    else if(data.candidate)
      this.pc.addIceCandidate(new RTC.iceCandidate(data.candidate));
  },



  //----------------------------------------------------------------------------
  send: function (data, channel) {
    try {
      this.channels[channel || 'default' ].send(data);
    }
    catch(e) {}
  },


  sendAsString: function (data, channel) {
    if(!data.substr)
      data = JSON.stringify(data);
    this.send(data, channel);
  },


  removeStream: function (stream) {
    if(stream.splice)
      for(var i = 0; i < stream.length; i++)
        this.pc.removeStream(stream[i]);
    else
      this.pc.removeStream(stream);
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
  onstream: function(evt, me) {},
  onremovestream: function(evt, me) {},
  ondatachannel: function(channel, me) {},
  onremovedatachannel: function(evt, me) {},
  onerror: function(evt, me) {},
  onready: function(me) {},
}



