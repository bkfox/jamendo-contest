var http = require('http');
var url = require('url');
var crypto = require('crypto');
var config = require("./config.js");


// Global
var count = 0;
var channels = {};

function uniqueToken() {
  if(!this.count)
    this.count = 0;

  var shasum = crypto.createHash('sha1');
  shasum.update(Date.now() + ":" + (this.count++) + ':' + Math.random());
  return shasum.digest('hex');
}


// Channel
function Channel(name) {
  this.name = name;
  this.peers = {};
  channels[name] = this;
}

Channel.prototype = {
  addRef: function(p) {
    this.peers[p.id] = p;
  },

  rmRef: function(p) {
    delete this.peers[p.id];
    if(Object.keys(this.peers).length)
      try {
        this.broadcast({ 'disconnected': true, from: p.id });
      }
      catch(e) { console.log(e + '\n' + JSON.stringify(this.getPublicPeers())); this.peers = {}; }
    else
//    if(!Object.keys(this.peers).length)
      delete channels[this.name];
  },


  broadcast: function(d, dst) {
    ds = JSON.stringify(d);

    if(dst) {
      if(this.peers[dst])
        this.peers[dst].ws.send(ds);
      return;
    }

    if(d.from) {
      for(var i in this.peers)
        if(i != d.from)
          this.peers[i].ws.send(ds);
      return;
    }

    for(var i in this.peers)
      this.peers[i].ws.send(ds);
  },


  getPublicPeers: function () {
    var e = [];
    for(var i in this.peers)
      e.push(this.peers[i].id);
    return e;
  },
}


// Client Session
function Client(ws) {
  var client = this;
  var channel, channelName;

  client.ws = ws;
  ws.on('message', function (m) {
    try {
      var z = JSON.parse(m);

      if(z.join) {
        client.id = uniqueToken();
        channelName = z.join || uniqueToken();
        channel = channels[channelName];
        if(!channel)
          channel = new Channel(channelName);

        channel.addRef(client);
        channel.broadcast({
          connected: true,
          id: client.id,
          channel: channelName,
          peers: channel.getPublicPeers()
        }, client.id);
        return;
      }

      z.from = client.id;
      return channel.broadcast(z, z.to);
    }
    catch(e){
      ws.send('{"error":"invalid-stanza"}');
      console.log(e);
      ws.close();
    }
  });

  ws.on('close', function () {
    if(channel)
      channel.rmRef(client);
  });
}



var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: config.port,
                                host: config.host });

wss.on('connection', function(ws) {
  try {
    new Client(ws);
  }
  catch(e) {
    console.log(e);
    ws.send('{"error":"internal"}');
  }
});


