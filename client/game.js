var channel = null;

/** 
 *  TODO: - s'il n'y a pas les paroles, inventez-les
 *        - move body!
 */
var challenges = [
  ' must SING (INVENT if needed) on the music <small>(prepare the umbrella)</small>',
  ' must DANSE on the music <small>(follow him in his gigue)</small>',
  ' must DANSE ALONE on the music <small>(point the finger to him)</small>',
  ' must PLAYBACK on the music',
  ' must DO WHATEVER you want',
  ' must RICKROLL... &#9835; Yeah... &#9833; Yeah... &#9836;'
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
          game.newChallenge();
          break;

        // got a reward from someone
        case 'reward':
          game.reward(msg, peer);
          break

        case 'sync':
          game.onGameSync(msg.sync, peer);
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
      return Object.keys(channel.peers).length < 3 && !run.started;
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

      ui.notify(peer.data.nickname + ' is connected');
    }


    channel.onpeercreation = function (peer) {
      peer.addStream(run.stream);
    }

    // bye peer
    channel.ondisconnect = function (peer, peers) {
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
        game.reset(true);
        return;
      }

      if(run.current.me)
        game.checkDone();
      else if(peer == run.current) {
        // TODO
      }
    }

    // connect
    channel.connect();
  },


  reset: function(stay) {
    if(!stay) {
        ui.panel = 'index-panel';

      if(channel) {
        channel.close()
        channel = null;
      }

      $('players').innerHTML = "";
    }

    $('chat-content').innerHTML = "";
    $('guess-off').innerHTML = "";
    $('ann-panel').off();
    $('challenge-track').pause();

    run = {
      stream: run.stream
    };
  },


  start: function(peer) {
    if(run.started)
      return;

    if(Object.keys(channel.peers).length == 0) {
      alert('Dude, this game is made to be played with your friends.');
      return;
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
      game.newChallenge();
  },


  /**
   *  Create a new challenge, and take the hand
   */
  newChallenge: function(msg, peer) {
    var d = { challenge:  Math.floor(Math.random() * challenges.length),
              track:      tracks.pick() };
    var track = tracks.pick();
    if(!d.track) {
      ui.notify('Eyh, there is no track for the given types (' + config.filter + ') or Jamendo has a problem for the moment');
      return;
    }

    game.gameSync(d);
  },


  /**
   *  Start the current challenge
   */
  startChallenge: function() {
    $('ann-panel').on();
    $('challenge-track').style.display = "inline";

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
      if(channel.peers[i].data.reward == undefined &&
         channel.peer[i] != channel.me)
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
      peer.data.reward = msg.reward;
      if(msg.reward) {
        channel.me.data.score += msg.reward;
        run.totalReward += msg.reward;
        ui.notify('You got ' + msg.reward + ' points from ' + peer.data.nickname);
      }
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


  gameSync: function(data) {
    // run.peer == channel.me
    if(data.challenge) {
      run.started = true;
      channel.broadcastString({ sync: { challenge: data.challenge, track: data.track }});

      function foo(j) {
        window.setTimeout(function() {
          channel.broadcastString({ sync: { left: 10-j }});
          game.onGameSync({ left: 10-j }, channel.me);
        }, j*1000);
      }
      for(var i = 0; i < 11; i++)
        foo(i);

      game.onGameSync({ challenge: data.challenge, track: data.track }, channel.me);
      return;
    }

    if(data.play != undefined)
      channel.broadcastString({ sync: { play: data.play } });
    if(data.pause)
      channel.broadcastString({ sync: { pause: true } });
  },


  onGameSync: function(data, peer) {
    if(data.challenge) {
      run.track = data.track;
      run.challenge = challenges[data.challenge];
      run.current = peer;
      run.totalReward = 0;

      $('challenge-track').pause();
      $('challenge-track').src = run.track.stream;
      $('challenge-track').style.display = "none";
      $('guess').off();
      $('game-top').off();

      if(peer == channel.me)
        $('reward-panel').on();
      else
        $('reward-panel').off();

      $('guess-entry').removeAttribute('wrong', 'true');
      $('players').panel = null;

      for(var i in channel.peers)
        delete channel.peers[i].data.reward;

      return;
    }


    if(data.left != undefined) {
      $('time-count').setAttribute('active', 'true');
      $('time-count').innerHTML = data.left;
      window.setTimeout(function() {
        $('time-count').removeAttribute('active');
        if(data.left == 0)
          game.startChallenge();
      }, 500);
    }

    if(data.play != undefined) {
      $('challenge-track').play();
      $('challenge-track').currentTime = data.play;
    }

    if(data.pause != undefined) {
      $('challenge-track').pause();
      if(peer != channel.me)
        ui.notify(peer.data.nickname + ' has paused the music');
    }

    if(data.started != undefined) {
      // i know kinda weird
      peer.sendString({ reward: 0 });
      $('ann-panel').panel = 'game-started';
    }
  },
}


