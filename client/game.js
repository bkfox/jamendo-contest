var channel = null;


var challenges = [
  ' must SING on the music <small>(prepare the umbrella)</small>',
  ' must DANSE on the music <small>(follow him in his gigue)</small>',
  ' must DANSE ALONE on the music <small>(point the finger to him)</small>',
  ' must PLAYBACK on the music',
  ' must CHOOSE A CHALLENGE and DO IT'
]



function defaultNick(id) {
  return 'anonymous-' + id.substr(0,7);
}



/*******************************************************************************
 *  Handlers & players
 ******************************************************************************/
var handlers = {
  onmessage: function (msg, channel, peer) {
    console.log('got a message...');
    message = msg;
    if(msg.substr)
      msg = JSON.parse(msg);

    for(var i in msg) {
      switch(i) {
        case 'status':
          for(var i in msg.status)
            peer.data[i] = msg.status[i];
          break;

        // someone has a too long tong
        case 'chat':
          ui.chat(peer, msg.chat);
          break;

        // the game starts
        case 'start':
          game.start(peer);
          break;

        // i am the next one
        case 'next':
          game.challenge();
          break;

        // new challenge
        case 'challenge':
          game.challenge(msg, peer);
          break;

        // got a reward from someone
        case 'reward':
          game.reward(msg, peer);
          break

        // TODO
        //case 'sync':
      }
    }
  },


  onstream: function (evt, peer) {
    console.log('eyh! we ve got a stream');
    peer.ui.set('stream', URL.createObjectURL(evt.stream));
  },


  onremovestream: function (evt) {
  },


  ondatachannel: function (channel, peer) {
    if(channel.label == 'default' && !peer.me)
      peer.addStream(run.stream);
  },


  onremovedatachannel: function (channel) {
    console.log('channel removed: ' + channel.label);
  },
}



/*******************************************************************************
 *  Game
 ******************************************************************************/
// Running game data
var run = {};

// Game interface
var game = {
  join: function(name) {
    if(channel)
      channel.close();

    var o = { audio: true, video: true }
    function foo (stream) {
      ui.panel = 'game-panel';

      run.stream = stream;
      game._join(name);
    }

    function err () {
      game.reset(true);
      ui.notify('Can\'t get media devices: did you accept it?');
    }

    if(run.stream)
      return foo(run.stream);

    if(navigator.mozGetUserMedia)       return navigator.mozGetUserMedia(o, foo, err);
    if(navigator.webkitGetUserMedia)    return navigator.webkitGetUserMedia(o, foo, err);
    if(navigator.getUserMedia)          return navigator.getUserMedia(o, foo, err);
    err();
  },


  _join: function(name) {
    if(name)
      name = name.replace(/(\?|#|\/|\s)/gi, '');
    else
      name = "plasmaquizz-" + DataChannel.prototype.uniqueToken();
    location.hash = '#' + name;

    channel = new DataChannel(config.server, name);

    // i am on the place!
    channel.onconnect = function (m, p) {
      ui.notify('Connected to the room, waiting for friends...');
      if(!config.nickname)
        config.nickname = defaultNick(m.id);

      return { nickname: config.nickname, score: 10 };
    }

    // hey, you wanna come?
    channel.onpeerrequest = function (m) {
      return Object.keys(channel.peers).length < 3;
    }

    // hello peer
    channel.onpeer = function (peer) {
      peer.onmessage =  handlers.onmessage;
      peer.onstream = handlers.onstream;
      peer.onremovestream = handlers.onremovestream;
      peer.ondatachannel = handlers.ondatachannel;
      peer.onremovedatachannel = handlers.onremovedatachannel;

      if(!peer.ui) {
        peer.ui = widgets.player();
        peer.ui.set('name', (peer.data && peer.data.nickname) || defaultNick(peer.id) )
               .set('score', (peer.data && peer.data.score) || 0);

        peer.data = {
          get nickname()  { return (peer.ui && peer.ui.getAttribute('name')); },
          set nickname(v) { peer.ui.set('name', v); if(peer.me) game.sync(); },
          get score()     { return (peer.ui && parseInt(peer.ui.getAttribute('score'))); },
          set score(v)    { peer.ui.set('score', v); if(peer.me) game.sync(); },
          color:          color(80, 250),
        }

        if(peer.me) {
          peer.ui.setAttribute('me','true');
          peer.ui.video.muted = true;
          peer.ui.set('stream', URL.createObjectURL(run.stream));
        }

        $('players').appendChild(peer.ui);
      }

      // TODO: send game state
      ui.notify(peer.data.nickname + ' is connected');
    }


    channel.onpeercreation = function (peer) {
      peer.addStream(run.stream);
    }

    // bye peer
    channel.ondisconnect = function (peer, peers) {
      // TODO: manage if the master leaves
      ui.notify(peer.data.nickname + ' left the game');

      if(peer.ui) {
        peer.ui.parentNode.removeChild(peer.ui);
        delete peer.ui;
      }

      if(peer.me) {
        game.reset(true);
        return;
      }

      if(!Object.keys(channel.peers).length) {
        $('ann-panel').off();
        $('challenge-track').pause();
        $('time-count').removeAttribute('active');
      }
      else if(run.current.me)
        game.checkDone();
    }


    // connect
    channel.connect();
  },


  reset: function() {
    ui.panel = 'index-panel';

    if(channel) {
      channel.close()
      channel = null;
    }

    $('players').innerHTML = "";
    $('chat-content').innerHTML = "";
    $('guess-off').innerHTML = "";
    $('ann-panel').off();
    $('challenge-track').pause();
    $('time-count').removeAttribute('active');

    run = {
      stream: run.stream
    };
  },


  start: function(peer) {
    if(run.started)
      return;

    if(Object.keys(channel.peers).length == 0) {
      alert('Dude, this game is made to be played with your friends.');
//      return;
    }

    run.started = true;

    if(!peer) {
      channel.broadcastString({ start: true });
      peer = channel.me;
    }

    peers = channel.peers;
    for(var i in peers)
      peers[i].data.score = 10;

    ui.notify(peer.data.nickname + " has started the game");
    $('ann-panel').on();

    if(peer.me)
      game.challenge();
  },


  challenge: function(msg, peer) {
    // if it is my challenge...
    if(!msg) {
      var n = Math.floor(Math.random() * challenges.length);
      run.challenge = challenges[n];
      run.track = tracks.pick();

      if(!run.track) {
        ui.notify('Eyh, there is no track for the given types (' + config.filter + ')');
        return tracks.load(null, game.challenge);
      }

      channel.broadcastString({ challenge: n, track: run.track });

      peer = channel.me;
    }
    else {
      run.track = msg.track;
      run.challenge = challenges[msg.challenge];
    }

    // temporary show
    $('challenge-track').pause();
    $('challenge-track').src = run.track.stream;
    $('guess').off();
    $('game-top').off();
    if(peer == channel.me)
      $('reward-panel').on();
    else
      $('reward-panel').off();
    $('guess-entry').removeAttribute('wrong', 'true');
    $('players').panel = null;

    for(var i in channel.peers)
      channel.peers[i].data.reward = 0;

    run.current = peer;
    run.totalReward = 0;

    $('time-count').setAttribute('active', 'true');
    window.setTimeout(function() {
      game._challenge();
    }, 11000);
  },


  _challenge: function() {
    $('time-count').removeAttribute('active');
    $('ann-panel').on();

    // start challenge itself
    var track = run.track;
    var peer = run.current;
    var challenge = run.challenge;

    ui.notify(peer.data.nickname + ' ' + challenge);
    $('game-top').on();
    $('challenge').innerHTML =
      '<span class="name">' + peer.data.nickname + '</span> ' + challenge;

    if(track.lyrics) {
      $('lyrics').innerHTML = track.lyrics.replace(/(\\n|\n)/gi,'<br>');
      $('lyrics-container').style.display = 'block';

      $('lyrics-container').removeAttribute('blink');
      $('lyrics-container').setAttribute('blink', 'true');
    }
    else
      $('lyrics-container').style.display = 'none';


    if(!peer.me)
      $('guess').on();

    $('guess-off').innerHTML =
      '<a href="http://www.jamendo.com/track/' + track.id + '">' +
      track.name + '</a>, by <a href="http://www.jamendo.com/artist/' +
      track.artist_id + '">' +
      track.artist_name + '</a>, in ' +
      '<a href="http://www.jamendo.com/list/a' + track.album_id + '">' +
      track.album_name + '<img src="' + track.album_image + '"></a>';


    $('challenge-track').play();
    $('players').panel = peer.ui;
  },


  checkDone: function () {
    var looser = channel.me;
    for(var i in channel.peers) {
      if(!channel.peers[i].data.reward && channel.peer[i] != channel.me)
        return false;
      if(channel.peers[i].data.score < looser.data.score)
        looser = channel.peers[i];
    }

    channel.broadcastString({ reward: run.totalReward });
    if(looser.me)
      this.challenge();
    else
      looser.sendString({ next: true });
    return true;
  },


  reward: function (msg, peer) {
    if(run.current.me) {
      // peer.data.score -= msg.reward; automatically done by the peer
      channel.me.data.score += msg.reward;
      peer.data.reward = msg.reward;
      run.totalReward += msg.reward;

      ui.notify('You got ' + msg.reward + ' points from ' + peer.data.nickname);
      this.checkDone();
    }
    else
      ui.notify(peer.data.nickname + ' got a total of ' + msg.reward + ' points');
  },


  doReward: function (note) {
    $('reward-panel').on();
    $('reward').innerHTML = 'You rewarded ' + run.current.data.nickname + ' of ' + note;

    channel.me.data.score -= note;
    run.current.sendString({ reward: note });
  },


  sync: function () {
    channel.broadcastString({ status: channel.me.data });
  },
}


