
/*
 *  Generate a new color
 */
function color(min, max, delta) {
  if(!min)
    min = 0;
  if(!max)
    max = 255;

  max -= min;

  r = Math.floor(Math.random() * max) + min;
  g = Math.floor(Math.random() * max) + min;
  b = Math.floor(Math.random() * max) + min;

  if(delta) {
    return [ 'rgb(' + r + ',' + g + ',' + b + ')',
             'rgb(' + (r + delta) + ',' + (g + delta) + ',' + (b + delta) + ')' ];
  }

  return 'rgb(' + r + ',' + g + ',' + b + ')';
}





/*******************************************************************************
 *  Widgets
 ******************************************************************************/
var widgets = {
  init: function() {
    this.player = parasol($('model-player'), function (item) {
      item.video = item.querySelector('video');
    });
  },


  entry: function(item, cb, noonchange) {
    if(item.substr)
      item = $(item);

    if(!noonchange)
      $on(item, 'change', function(e) {
        cb(item, e);
      });

    $on(item, 'keypress', function(e) {
      if(e.keyCode == 13)
        cb(item, e);
    });
  },


  panel: function(item) {
    if(item.substr)
      item = $(item);

    item.className += " panel";

    item.__defineSetter__('panel', function(v) {
      if(v && v.substr)
        v = $(v);

      item._panel = v;
      for(var i = 0; i < item.children.length; i++) {
        var it = item.children[i];
        if(it == v)
          it.setAttribute('active', 'true');
        else
          it.removeAttribute('active');
      }
    });


    item.__defineGetter__('panel', function () {
      return this._panel;
    });


    item.on = function () {
      item.panel = item.children[1];
    };

    item.off = function () {
      item.panel = item.children[0];
    };


    item.off();
  },
}



/*******************************************************************************
 *  UI
 ******************************************************************************/
var ui = {
  init: function () {
    widgets.init();

    // properties
    if(config.nickname)   $('nickname').value = config.nickname;
    if(config.filter)     $('filter').value = config.filter || '';

    $('challenge-track').volume = 0.6;


    // widgets & events
    widgets.panel('main-container');
    widgets.panel('ann-panel');
    widgets.panel('reward-panel');
    widgets.panel('guess');
    widgets.panel('game-top');
    widgets.panel('players'); // yep, that is easier...


    widgets.entry('nickname', function(i, e) {
      channel.me.data.nickname = i.value;
      ui.defaultFocus();
    });

    widgets.entry('chat-input', function(i, e) {
      if(!i.value.length)
        return;

      channel.broadcastString({ chat: i.value });
      ui.chat(channel.me, i.value);
      i.value = "";
    }, true);

    widgets.entry('filter', function(i, e) {
      tracks.load(i.value);
    });


    widgets.entry('guess-entry', function(i, e) {
      n = tracks.guess(i.value, run.track, channel.me);
      if(n == 0)
        $('guess-entry').setAttribute('wrong', 'true');
      else
        $('guess').off();
    }, true);


    $on('start-button', 'click', function() { actions.start(); });
    $on('guess-cancel', 'click', function() { $('guess').off(); });

    for(var i = 1; i <= 5; i++) {
      $on('reward-' + i, 'click', function(e) {
        actions.reward(parseInt(e.currentTarget.value));
      });
    }


    $on('challenge-track', 'click', function() {
      if($('challenge-track').paused)
        channel.broadcastString({ play: $('challenge-track').currentTime });
      else
        channel.broadcastString({ pause: true });
    });
  },


  safe: function (v) {
    return v.replace(/</gi, '&lt;').replace(/>/gi, '&gt;');
  },


  defaultFocus: function () {
    var e = ui.panel.querySelector('[defaultFocus]');
    if(e)
      e.focus();
  },


  /**
   * Current Panel
   */
  set panel (id) {
    if(this._panel == $(id))
      return;

    if(this._panel.substr)
      this._panel = $(this._panel);


    this._panel.removeAttribute('active');
    this._panel = $(id);
    this._panel.setAttribute('active','true');
  },


  get panel() {
    return this._panel;
  },


  _panel: "index-panel",

  /**
   * Notifications
   */
  notify: function(text) {
    console.log(text);

    if(this.panel == $('game-panel')) {
      var e = document.createElement("div");
      e.innerHTML = text;
      e.className = 'notification';
      $('chat-content').appendChild(e);
      e.scrollIntoView();
    }
  },


  chat: function(player, text) {
    var e = document.createElement("div");
    e.innerHTML = this.safe(player.data.nickname) + ': ' +
                  this.safe(text);
    e.style.color = player.data.color;

    $('chat-content').appendChild(e);
    e.scrollIntoView();
  },
}


