/*
Parasol.js
Copyright (c) 2011, bkfox.net
https://github.com/bkfox/parasol.js/

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

function $(id) {
   return document.getElementById(id);
}

function $on(item, event, cb, pre) {
  if(item.substr)
    item = $(item);
  item.addEventListener(event, cb, pre || false);
}



function parasol (source, onInit, sourceCode) {
  var src;

  if(!source) {
    var list = document.body.querySelectorAll('*[inheritable]');
    for(var i = 0; i < list.length; i++)
      parasol._prepare(list[i]);
    return;
  }

  if(source.parentNode)
    var src = source;
  else {
    src = document.createElement('div');
    src.innerHTML = sourceCode;
    src = src.firstChild;
  }

  parasol._prepare(src);


  return function (data) {
    var elm = src.cloneNode(true);
    elm.set = function(name, value) {
      parasol._set.apply(this, [elm, name, value]);
      return this;
    }
    if(onInit)
      onInit(elm, data);
    return elm;
  }
}

parasol._prepare = function (source) {
  // FIXME: why e._parasol isn't clone with src.cloneNode
  //        isn't that because not attached at creation to a node?
  var list = source.querySelectorAll("*[inherits]");
  var exp = /(\w+)(=(\w+))?/gi;
  for(var i = 0; i < list.length; i++) {
    var e = list[i];
    e.setAttribute('inherits', '{' + e.getAttribute('inherits').replace(exp, '"$1":"$3"') + '}');
  }


  source.set = function(aName, aValue) {
    parasol._set(source, aName, aValue);
    return this;
  };

}

parasol._exp = /(\w+)(=(\w+))?/gi;

parasol._set = function(aTarget, aName, aValue) {
  var list = aTarget.querySelectorAll("*[inherits*='" + aName + "']");
  var exp = this._exp;

  aTarget.setAttribute(aName, aValue);
  for(var i = 0; i < list.length; i++) {
    var e = list[i];
    if(!e._parasol)
      e._parasol = JSON.parse(e.getAttribute('inherits'));

    var prop = e._parasol[aName];
    if(prop == '')
      e.innerHTML = aValue;
    else
      e.setAttribute(prop, aValue);
  }
}

