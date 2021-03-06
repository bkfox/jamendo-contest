![Jamendo Logo / Jamendo App Contest repository](http://blog.jamendo.com.s3.amazonaws.com/wp-content/uploads/2012/04/jamendo_logo2.png "Jamendo App Contest 2013")

PlasmaQuizz
===========

PlasmaQuizz is a video-chat web game, where players must complete challenges on the music to get points from other players.

It encourage cooperation in the way that players give their own points to score the others, and help to discover a lot of artists from Jamendo.

**Important Note**: Because it uses WebRTC, that is a technology not yet stabilized, only beta versions of web browsers, such as Firefox Nightly ( http://nightly.mozilla.org ) can run this game for the moment.

The game music content comes from Jamendo ( http://jamendo.com )

It has been made for a contest, and is no more maintained.


Screenshots
-----------

![Index](https://raw.github.com/bkfox/jamendo-contest/master/screenshots/index.png)

![Waiting for players](https://raw.github.com/bkfox/jamendo-contest/master/screenshots/stage0.png)

![Page of the challenger](https://raw.github.com/bkfox/jamendo-contest/master/screenshots/stage1.png)

![Page of the non-challengers](https://raw.github.com/bkfox/jamendo-contest/master/screenshots/stage2.png)

![Details on lyrics](https://raw.github.com/bkfox/jamendo-contest/master/screenshots/lyrics.png)

![Details on configuration](https://raw.github.com/bkfox/jamendo-contest/master/screenshots/configuration.png)

Technical
=========

Clients
-------
Because it uses WebRTC, that is a technology not yet stabilized, only beta versions of web browsers, such as Firefox Nightly can run this game for the moment. The game is in total peer-to-peer (except for the handshake);

Server
------
About the server, a NodeJS server is used for the signaling system between peers; It is found in the ./server folder;

For statics files that can be served as usual, the directory is ./client

Configuration
-------------
The configuration is done through different files: server/config.js, client/config.js, and client/jamendo_api_credentials.js; This last file must have the following syntax:

```javascript
config.jamendoID = "";          // your jamendo api identifier
config.jamendoSecret = "";      // your jamendo client's secret (not really needed)
```

Thanks
======

Thanks to Piks3l, Link Mauve, and Sonny for their long distance help;

