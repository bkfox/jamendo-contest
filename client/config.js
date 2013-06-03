var config = {
  /**
   *  Set your configuration here
   */
  server: 'ws://127.0.0.1:8080',

  /**
   *  You don't have to modify it
   */
  save: function() {
    var e = {};
    for(var i in config)
      if(typeof(config[i]) != 'function')
        e[i] = config[i];

    localStorage.setItem('config', JSON.stringify(e));
  },


  load: function () {
    var e = JSON.parse(localStorage.getItem('config'));
    for(var i in e)
      config[i] = e[i];
  },
}

