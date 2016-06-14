/***************************************************************************
The MIT License (MIT)

Copyright (c) 2016 Bo Zou (boxzou@yahoo.com)
Part of source code is Copyright Nicolas Perriault, Joyent, Inc. and other
Node contributors.

The software under UglifyJS is
   Copyright 2010 (c) Mihai Bazon <mihai.bazon@gmail.com>

clientutils.js is
   Copyright (c) 2011-2012 Nicolas Perriault
   Part of it maybe Copyright Joyent, Inc. and other Node contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*****************************************************************************/

var system = require('system');
var fs = require('fs');

var flows = [];
var fid = 100;

function Flow(flowData, knysa, pid) {
  var flowData = flowData;
  var methods;
  var id = fid++;
  var pid = pid;
  var index = 0;
  var scopes = ['0'];
  var error;
  var errorMethod;
  var broken;
  var knysa = knysa;
  if (flowData.inputs != null) {
    for (var i = 0; i < flowData.inputs.length; i++) {
      flowData[flowData.inputs[i]] = arguments[i+1];
    }
  }
  var methods = [];
  for (var prop in flowData) {
    if( flowData.hasOwnProperty(prop) && prop.match(/^n\d+/)) {
      methods.push(prop);
    }
  }
  methods.sort();
  flows[id] = this;
  var thisFlow = this;
  
  function currentScope() {
    return scopes[scopes.length - 1];
  }  
  function scopeEnd(scope, method, control) {
    for (var i = index + 1; i < methods.length; i++) {
        var m2 = methods[i];
        if (m2.match(new RegExp("^n\\d+_" + control + "_" + scope))) {
            index = i + 1;
            // console.log('done ' + control + ': ' + method + ', scopes: ' + scopes);
            run();
            return;
        }
    }
    throw new Error("matching end not found for: " + method + ", scope=" + scope + ", methods: " + methods);
  }

  var isDone = function() {
    return index >= methods.length;
  }
  this.isDone = isDone;
  var resume = function resume(data) {
    if (isDone()) {
        // console.log("flow done (resume): " + id + ", scopes:" + scopes + ", methods: " + methods);
        return;
    }
    if (data != null && this.retCallback != null) {
      // console.log('set data: ' + this.retCallback + '(' + data + ')');
      this.retCallback(data);
      // console.log('set data: ' + this.retCallback + ' = ' + JSON.stringify(flowData));
      this.retCallback = null;
    }
    index++;
    run();
  }
  this.resume = resume;
  var handleBreak = function handleBreak(method, scope) {
      var oldScope = scope;
      while (true) {
        while (!scope.match(/^n\d+_try/) && !scope.match(/^n\d+_while/) && scopes.length > 1) {
          scopes.pop();
          scope = currentScope();
        }
        if (scopes.length <= 1) {
          throw new Error("no while for break: " + broken + ", scope=" + oldScope + ", methods: " + methods);
        }
        if (scope.match(/^n[0-9]+_while/)) {
          broken = null;
          scopeEnd(scope, method, "endwhile");
          return;
        }
        for (var i = index + 1; i < methods.length; i++) {
          var m2 = methods[i];
          if (m2.match(new RegExp("^n\\d+_finally_" + scope))) {
              index = i + 1;
              run();
              return;
          }
        }
        scopes.pop();
        scope = currentScope();
      }
  }
  this.handleBreak = handleBreak;
  var handleError = function handleError(method, scope) {
      var oldScope = scope;
      while (true) {
        while (!scope.match(/^n\d+_try/) && scopes.length > 1) {
          scopes.pop();
          scope = currentScope();
        }
        if (scopes.length <= 1) {
          throw new Error("no catch for err: " + errorMethod + ', ' + error.stack + ", scope=" + oldScope + ", methods: " + methods);
        }
        for (var i = index + 1; i < methods.length; i++) {
          var m2 = methods[i];
          if (m2.match(new RegExp("^n\\d+_catch_" + scope))) {
              flowData[m2](error);
              error = null;
              index = i + 1;
              run();
              return;
          } else if (m2.match(new RegExp("^n\\d+_finally_" + scope))) {
              index = i + 1;
              run();
              return;
          }
        }
        scopes.pop();
        scope = currentScope();
      }
  }
  this.handleError = handleError;
  var run = function run() {
    if (index >= methods.length) {
      return;
    }
    var method = methods[index];
    var scope = currentScope();
    //console.log("index: " + index + ", method: " + method + ", scope: " + scope + ", methods: " + methods);
    if (method.match(/^n\d+_break/)) {
      // console.log('break: ' + method);
      broken = method;
      handleBreak(method, scope);
    } else if (method.match(/^n\d+_try/)) {
        // console.log('try: ' + method + ', scopes: ' + scopes);
        scopes.push(method);
        resume();
        return;
    } else if (method.match(/^n\d+_catch/)) {
        // console.log('catch: ' + method + ', scopes: ' + scopes);
        for (var i = index + 1; i < methods.length; i++) {
            var m2 = methods[i];
            if (m2.match(new RegExp("^n\\d+_finally_" + scope))) {
                scopes.pop();  // remove n\d+_try
                scopes.push(m2);
                index = i + 1;
                run();
                return;
            } else if (m2.match(new RegExp("^n\\d+_endtry_" + scope))) {
                scopes.pop();
                index = i + 1;
                run();
                return;
            }
        }
        throw new Error("matching try not found for: " + method + ", scope=" + scope + ", methods: " + methods);
    } else if (method.match(/^n\d+_finally/)) {
        // console.log('finally: ' + method + ', scopes: ' + scopes);
        scopes.pop();  // remove n\d+_try or n\d+_catch
        scopes.push(method);
        resume();
        return;
    } else if (method.match(new RegExp('^n\\d+_endtry_n\\d+_try$'))) {
        // console.log('endtry: ' + method + ', scopes: ' + scopes + ', error=' + error + ', broken=' + broken);
        if (error != null) {
            scopes.pop();
            scope = currentScope();
            handleError(method, scope);
        } else if (broken != null) {
            scopes.pop();
            scope = currentScope();
            handleBreak(method, scope);
        } else {
            var pos = method.lastIndexOf('_n');
            var suffix = method.substring(pos + 1);
            pos = scope.lastIndexOf(suffix);
            if (pos < 0) {
                throw new Error('no matching try scope found for: ' + method + ', scope: ' + scope);
            }
            scopes.pop();  // pop [try or] catch or finally
            resume();
            return;
        }
    } else if (method.match(new RegExp('^n\\d+_endwhile_' + scope))) {
      // console.log('endwhile: ' + method);
      for (var i = index - 1; i >= 0; i--) {
        var m2 = methods[i];
        if (m2 == scope) {
            scopes.pop();
            index = i;
            run();
            return;
        }
      }
      throw new Error("endwhile reached but while not found: " + method + ", scope=" + scope
            + ", methods: " + methods);
    } else if (method.match(/^n[0-9]+_else_n/)) {
        // console.log('else: ' + method + ', scope: ' + scope);
        var pos = method.lastIndexOf("_n");
        var nth = method.substring(pos + 1);
        if (scope = nth) {
            scopes.pop();
            scopeEnd(scope, method, "endif");
            return;
        }
        throw new Error("no matching if for else: " + m + ", scope=" + scope + ", methods: " + methods);
    } else if (method.match(/^n[0-9]+_endif_n/)) {
        // console.log('endif: ' + method + ', scope: ' + scope);
        var pos = method.lastIndexOf("_n");
        var nth = method.substring(pos + 1);
        if (scope == nth) {
            scopes.pop();
            resume();
            return;
        }
        throw new Error("no matching if for endif: " + method + ", scope=" + scope + ", methods: " + methods);
    }
    
    // console.log("begin method: " + method);
    var ret;
    try {
      ret = flowData[method](thisFlow);
    } catch (err) {
      error = err;
      // console.log('caught err: ' + method + ', scopes: ' + scopes + " " + err.stack);
      handleError(method, scope);
    }
    // console.log("done method: " + method + ", ret:" + ret + ", type:" + typeof(ret));
    if (method.match(/^n[0-9]+_async/)) {
      return;
    } else if (method.match(/^n[0-9]+_if/) || method.match(/^n[0-9]+_while/)) {
        // console.log("if/while: " + method + ', scopes: ' + scopes);
        if (!(typeof ret == "boolean")) {
//            throw new Error("method is \"if/while\" but did not return boolean! " + method + ", ret:" + ret + ", type:" + typeof(ret));
        }
        if (ret) {
            scopes.push(method);
            resume();
            return;
        } else if (method.match(/^n[0-9]+_if/)) {
            for (var i = index + 1; i < methods.length; i++) {
                var m2 = methods[i];
                // console.log("looking for matching else/endif: ^n[0-9]+_endif_" + method + ', now: ' + m2);
                if (m2.match(new RegExp("^n[0-9]+_else_" + method))) {
                    scopes.push(method);
                    index = i + 1;
                    run();
                    return;
                } else if (m2.match("^n[0-9]+_endif_" + method)) {
                    index = i + 1;
                    run();
                    return;
                }
            }
            throw new Error("matching end not found for: " + method + ", scope=" + scope + ", methods: "
                    + methods);
        } else if (method.match(/^n[0-9]+_while/)) {
            // console.log('find endwhile: ' + method);
            scopeEnd(method, method, "endwhile");
            return;
        }
        // console.log('finish if/while: ' + method);
    } else if (method.match(/^n[0-9]+_sleep/)) {
        if (!(typeof ret ==='number') || ret <= 0 ) {
            throw new Error("wait must return int or long: " + method + ", ret=" + ret + ", scope=" + scope + ", methods: "
                + methods);
        }
        //console.log("sleep: " + ret);
        setTimeout(function(){ resume(); }, ret);
        return;
    } else { // next method
        resume();
    }
  }
  this.run = run;

  var getId = function getId() {
      return id;
  }
  this.getId = getId;

  var fork = function fork(childFlowData) {
    var childFlow = new Flow(childFlowData, id);
    childFlow.run();
  }
  this.fork = fork;
  
  var open = function open(url) {
    // console.log('knysa.page: ' + knysa.page + ", url=" + url);
    knysa.page.open(url, function(status) {
      // console.log(url + ': ' + status);
      try {
        resume();
      } catch (err) {
        console.log(err.stack);
      }
    });
  }
  this.knysa_open = open;
  
  var exists = function exists(selector) {
    return knysa.page.evaluate(function(selector) {
      try {
        // console.log("exists selector: " + selector);
        return document.querySelector(selector) != null;
      } catch (err) {
        console.log("error selecting " + selector + ":" + err.stack);
        return err.stack;
      }
    }, selector);
  }
  this.exists = exists;

  var mouseEvent = function mouseEvent(type, selector) {
    console.log("Mouse event '" + type + "' on selector: " + selector, "debug");
    if (!this.exists(selector)) {
        throw new Error("Cannot dispatch " + type + " event on nonexistent selector: " + selector);
    }
    if (this.callUtils("mouseEvent", type, selector)) {
        return true;
    }
    // fallback onto native QtWebKit mouse events
    try {
        return this.mouse.processEvent(type, selector);
    } catch (e) {
        console.log("Couldn't emulate '" + type + "' event on " + selector + ": " + e);
    }
    return false;
  };
  this.mouseEvent = mouseEvent;

  var click = function click(selector) {  // depends on jquery
    var success = this.mouseEvent('mousedown', selector) && this.mouseEvent('mouseup', selector);
    success = success && this.mouseEvent('click', selector);
    this.evaluate(function(selector) {
        var element = __utils__.findOne(selector);
        if (element) {
            element.focus();
        }
    }, selector);
    return success;
  }
  this.click = click;

  var knysa_click = function knysa_click(selector) {
      knysa.page.onLoadFinished = function(status) {
          //console.log('click status = ' + status);
          knysa.page.onLoadFinished = null;
          resume();
      }
      this.click(selector);
  }
  this.knysa_click = knysa_click;

  var render = function render(path) {
    knysa.page.render(path);
  }
  this.render = render;
  
  var fillForm = function fillForm(selector, vals, options) {
    "use strict";
    var selectorType = options && options.selectorType || "names",
        submit = !!(options && options.submit);

    var fillResults = this.evaluate(function _evaluate(selector, vals, selectorType) {
        try {
            return __utils__.fill(selector, vals, selectorType);
        } catch (exception) {
            return {exception: exception.toString()};
        }
    }, selector, vals, selectorType);

    if (!fillResults) {
        throw new Error("Unable to fill form");
    } else if (fillResults && fillResults.exception) {
        throw new Error("Unable to fill form: " + fillResults.exception);
    } else if (fillResults.errors.length > 0) {
        throw new Error('Errors encountered while filling form: ' + fillResults.errors.join('; '));
    }

    // File uploads
    if (fillResults.files && fillResults.files.length > 0) {
        if (utils.isObject(selector) && selector.type === 'xpath') {
            console.log('Filling file upload fields is currently not supported using ' +
                      'XPath selectors; Please use a CSS selector instead.');
        } else {
            fillResults.files.forEach(function _forEach(file) {
                if (!file || !file.path) {
                    return;
                }
                if (!fs.exists(file.path)) {
                    throw new Error('Cannot upload nonexistent file: ' + file.path);
                }
                var fileFieldSelector;
                if (file.type === "names") {
                    fileFieldSelector = [selector, 'input[name="' + file.selector + '"]'].join(' ');
                } else if (file.type === "css") {
                    fileFieldSelector = [selector, file.selector].join(' ');
                }
                this.page.uploadFile(fileFieldSelector, file.path);
            }.bind(this));
        }
    }
    // Form submission?
    if (submit) {
        this.evaluate(function _evaluate(selector) {
            var form = __utils__.findOne(selector);
            var method = (form.getAttribute('method') || "GET").toUpperCase();
            var action = form.getAttribute('action') || "unknown";
            __utils__.log('submitting form to ' + action + ', HTTP ' + method, 'info');
            var event = document.createEvent('Event');
            event.initEvent('submit', true, true);
            if (!form.dispatchEvent(event)) {
                __utils__.log('unable to submit form', 'warning');
                return;
            }
            if (typeof form.submit === "function") {
                form.submit();
            } else {
                // http://www.spiration.co.uk/post/1232/Submit-is-not-a-function
                form.submit.click();
            }
        }, selector);
    }
  }
  this.fillForm = fillForm;
  
  var fillNames = function fillNames(formSelector, vals, submit) {
    "use strict";
    return this.fillForm(formSelector, vals, {
        submit: submit,
        selectorType: 'names'
    });
  };
  this.fillNames = fillNames;
  this.fill = fillNames;

  var knysa_fill = function knysa_fill(formSelector, vals) {
      knysa.page.onLoadFinished = function(status) {
          // console.log('status = ' + status);
          knysa.page.onLoadFinished = null;
          resume();
      }
      this.fill(formSelector, vals, true);
  };
  this.knysa_fill = knysa_fill;
  
  var getHTML = function getHTML(selector, outer) {
    "use strict";
    if (!selector) {
        return this.page.frameContent;
    }
    if (!this.exists(selector)) {
        throw new Error("No element matching selector found: " + selector);
    }
    return this.evaluate(function getSelectorHTML(selector, outer) {
        var element = __utils__.findOne(selector);
        return outer ? element.outerHTML : element.innerHTML;
    }, selector, !!outer);
  };
  this.getHTML = getHTML;
  
  var evaluate = function evaluate(fn, context) {
    this.injectClientUtils();
    if (arguments.length === 1) {
        return knysa.page.evaluate(fn);
    } else {
        context = [].slice.call(arguments).slice(1);
    }
    return knysa.page.evaluate.apply(knysa.page, [fn].concat(context));
  }
  this.evaluate = evaluate;
  this.knysa_evaluate=evaluate;  // signal suspend execution

  var injectClientUtils = function injectClientUtils() {
    "use strict";
    var clientUtilsInjected = knysa.page.evaluate(function() {
        return typeof __utils__ === "object";
    });
    if (true === clientUtilsInjected) {
        return;
    }
    var clientUtilsPath = './clientutils.js';
    if (true === knysa.page.injectJs(clientUtilsPath)) {
        // console.log("Successfully injected client-side utilities", "debug");
    } else {
        console.log("Failed to inject client-side utilities");
    }
    knysa.page.evaluate(function() {
        window.__utils__ = new window.ClientUtils();
    });
  }
  this.injectClientUtils = injectClientUtils;

  var callUtils = function callUtils(method) {
    "use strict";
    var args = [].slice.call(arguments, 1);
    var result = this.evaluate(function(method, args) {
        return __utils__.__call(method, args);
    }, method, args);
    return result;
  }
  this.callUtils = callUtils;
  
  var base64encode = function base64encode(url, method, data) {
    "use strict";
    return this.callUtils("getBase64", url, method, data);
  }
  this.base64encode = base64encode;
  
  var download = function download(url, targetPath, method, data) {
    "use strict";
    var cu = require('./clientutils').create();
    try {
        fs.write(targetPath, cu.decode(this.base64encode(url, method, data)), 'wb');
        console.log("Downloaded and saved resource in " + targetPath);
    } catch (e) {
        console.log("Error while downloading " + url + " to " + targetPath + ": " + e.stack);
    }
    return this;
  }
  this.download = download;
}

function knysa() {
  var webPage = require('webpage');
  var page = webPage.create();
  this.page = page;
  page.onConsoleMessage = function(msg, lineNum, sourceId) {
    console.log('CONSOLE: ' + msg);
  };
  page.onCallback = function(data) {
    // console.log('onCallback: ' + JSON.stringify(data));
    if (data.kflowId != null) {
      knysa.prototype.resume.call(null, data.kflowId, data);
    }
    if (data.callback != null && page["onCallback_" + data.callback]!= null) {
      page["onCallback_" + data.callback](data);
    }
  }
}
knysa.prototype.knysa_exec = function knysa_exec(flowData) {
  // console.log('flowData: ' + JSON.stringify(flowData));
  // console.log('this: ' + JSON.stringify(this));
  var flow = new Flow(flowData, this);
  flow.run();
}
    
knysa.prototype.resume = function resume(flowId, data) {
  var flow = flows[flowId];
  if (flow == null) {
    print("flow does not exist: " + flowId + ", flows: " + flows);
    return;
  }
  flow.resume(data);
}

module.exports = new knysa();
