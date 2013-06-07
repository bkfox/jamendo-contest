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
    console.log("> " + msg);
    message = msg;
    if(msg.substr)
      msg = JSON.parse(msg);

    for(var i in msg)
      if(on[i])
        return on[i](msg, peer);
  },


  onstream: function (evt, peer) {
    peer.ui.set('stream', URL.createObjectURL(evt.stream));
  },


  onready: function (evt, peer) {
    if(channel.ready)
      $('start-button').removeAttribute('disabled');
  },
}



var on = {
  status: function(msg, peer) {
    for(var i in msg.status)
      peer.data[i] = msg.status[i];
  },


  chat: function(msg, peer) {
    ui.chat(peer, msg.chat);
  },


  reward: function(msg, peer) {
    if(run.current.me) {
      // peer.data.score -= msg.reward; automatically done by the peer
      peer.data.reward = msg.reward;
      if(msg.reward) {
        channel.me.data.score += msg.reward;
        run.totalReward += msg.reward;
        ui.notify('You got ' + msg.reward + ' points from ' + peer.data.nickname);
      }
      actions.checkDone();
    }
    else
      ui.notify(peer.data.nickname + ' got a total of ' + msg.reward + ' points');
  },


  start: function(msg, peer) {
    actions.start(peer);
  },


  next: function(msg, peer) {
    actions.newChallenge();
  },


  challenge: function(msg, peer) {
    run.track = msg.track;
    run.challenge = challenges[msg.challenge];
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
  },


  left: function(msg, peer) {
    $('time-count').setAttribute('active', 'true');
    $('time-count').innerHTML = msg.left;
    window.setTimeout(function() {
      $('time-count').removeAttribute('active');
      if(msg.left == 0)
        actions.startChallenge();
    }, 500);
  },


  play: function(msg, peer) {
    $('challenge-track').currentTime = msg.play;
    $('challenge-track').play();
    return;
  },


  pause: function(msg, peer) {
    $('challenge-track').pause();
    if(!peer.me)
      ui.notify(peer.data.nickname + ' has paused the music');
  },
}



/*******************************************************************************
 *  actions
 ******************************************************************************/
// Running actions data
var run = {};

// actions interface
var actions = {
  join: function(name) {
    if(channel)
      channel.close();

    var o = { audio: true, video: true }
    function foo (stream) {
      ui.panel = 'game-panel';
      $('start-button').setAttribute('disabled', 'true');
      $('options').setAttribute('blink', 'true');

      run.stream = stream;
      actions._join(name);
    }

    function err () {
      actions.reset(true);
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
    $('url-entry').value = location.toString();

    channel = new DataChannel(config.server, name);

    // i am on the place!
    channel.onconnect = function (m, p) {
      ui.notify('Connected to the room, waiting for friends...');
      if(!config.nickname)
        config.nickname = defaultNick(m.id);

      return { nickname: config.nickname, score: 10 };
    }


    // hello peer
    channel.onpeer = function (peer, offerer) {
      if(channel.count > 3 || run.started)
        return;

      peer.onmessage =  handlers.onmessage;
      peer.onstream = handlers.onstream;
      peer.onready = handlers.onready;

      if(!peer.ui) {
        peer.ui = widgets.player();
        peer.ui.set('name', (peer.data && peer.data.nickname) || defaultNick(peer.id) )
               .set('score', (peer.data && peer.data.score) || 0);

        peer.data = {
          get nickname()  { return (peer.ui && peer.ui.getAttribute('name')); },
          set nickname(v) { peer.ui.set('name', v); if(peer.me) actions.sync(); },
          get score()     { return (peer.ui && parseInt(peer.ui.getAttribute('score'))); },
          set score(v)    { peer.ui.set('score', v); if(peer.me) actions.sync(); },
          color:          color(80, 200),
        }

        if(peer.me) {
          peer.ui.setAttribute('me','true');
          peer.ui.video.muted = true;
          peer.ui.set('stream', URL.createObjectURL(run.stream));
        }

        $('players').appendChild(peer.ui);
      }

      ui.notify(peer.data.nickname + ' is connected');

      $('start-button').setAttribute('disabled', 'true');

      if(offerer)
        return { streams: [run.stream, "default"], incoming: 1 };
      else
        return { streams: [run.stream], incoming: 2 };
    }


    // bye peer
    channel.ondisconnect = function (peer, peers) {
      ui.notify(peer.data.nickname + ' left the actions');

      if(peer.ui) {
        peer.ui.parentNode.removeChild(peer.ui);
        delete peer.ui;
      }

      if(peer.me) {
        actions.reset(true);
        return;
      }

      if(!Object.keys(channel.peers).length) {
        actions.reset(true);
        return;
      }

      if(run.current.me)
        actions.checkDone();
      else if(peer == run.current) {
        // TODO
        actions.reset(true);
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
    $('time-count').removeAttribute('active');
    $('lyrics-container').style.display = 'none';
    $('start-button').setAttribute('disabled');

    run = {
      stream: run.stream
    };
  },


  start: function(peer) {
    if(run.started)
      return;

    if(Object.keys(channel.peers).length == 0) {
      alert('Dude, this actions is made to be played with your friends.');
      return;
    }

    run.started = true;

    if(!peer) {
      channel.broadcastAsString({ start: true });
      peer = channel.me;
    }

    peers = channel.peers;
    for(var i in peers)
      peers[i].data.score = 10;

    ui.notify(peer.data.nickname + " has started the actions");
    $('ann-panel').on();

    if(peer.me)
      actions.newChallenge();
  },


  /**
   *  Create a new challenge, and take the hand
   */
  newChallenge: function() {
    console.log('start a new challenge');
    var d = { challenge:  Math.floor(Math.random() * challenges.length),
              track:      tracks.pick() };
    var track = tracks.pick();
    if(!d.track) {
      ui.notify('Eyh, there is no track for the given types (' + config.filter + ') or Jamendo has a problem for the moment');
      return;
    }

    run.started = true;

    // challenge send
    channel.broadcastAsString({ challenge: d.challenge, track: d.track });

    // timer
    function foo(j) {
      window.setTimeout(function() {
        channel.broadcastAsString({ left: 10-j });
        on.left({ left: 10-j }, channel.me);
      }, j*1000);
    }
    for(var i = 0; i < 11; i++)
      foo(i);

    on.challenge({ challenge: d.challenge, track: d.track }, channel.me);
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
    channel.broadcastAsString({ play: 0 });
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

    console.log(looser.me + ' is the looser...');
    channel.broadcastAsString({ reward: run.totalReward });
    if(looser.me)
      this.newChallenge();
    else
      looser.sendAsString({ next: true });
    return true;
  },


  reward: function (note) {
    $('reward-panel').on();
    $('reward').innerHTML = 'You rewarded ' + run.current.data.nickname + ' of ' + note;

    channel.me.data.score -= note;
    run.current.sendAsString({ reward: note });
  },


  sync: function () {
    channel.broadcastAsString({ status: channel.me.data });
  },
}


