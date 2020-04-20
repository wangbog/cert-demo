(function () {
  'use strict';

  var support = {
    searchParams: 'URLSearchParams' in self,
    iterable: 'Symbol' in self && 'iterator' in Symbol,
    blob:
      'FileReader' in self &&
      'Blob' in self &&
      (function() {
        try {
          new Blob();
          return true
        } catch (e) {
          return false
        }
      })(),
    formData: 'FormData' in self,
    arrayBuffer: 'ArrayBuffer' in self
  };

  function isDataView(obj) {
    return obj && DataView.prototype.isPrototypeOf(obj)
  }

  if (support.arrayBuffer) {
    var viewClasses = [
      '[object Int8Array]',
      '[object Uint8Array]',
      '[object Uint8ClampedArray]',
      '[object Int16Array]',
      '[object Uint16Array]',
      '[object Int32Array]',
      '[object Uint32Array]',
      '[object Float32Array]',
      '[object Float64Array]'
    ];

    var isArrayBufferView =
      ArrayBuffer.isView ||
      function(obj) {
        return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
      };
  }

  function normalizeName(name) {
    if (typeof name !== 'string') {
      name = String(name);
    }
    if (/[^a-z0-9\-#$%&'*+.^_`|~]/i.test(name)) {
      throw new TypeError('Invalid character in header field name')
    }
    return name.toLowerCase()
  }

  function normalizeValue(value) {
    if (typeof value !== 'string') {
      value = String(value);
    }
    return value
  }

  // Build a destructive iterator for the value list
  function iteratorFor(items) {
    var iterator = {
      next: function() {
        var value = items.shift();
        return {done: value === undefined, value: value}
      }
    };

    if (support.iterable) {
      iterator[Symbol.iterator] = function() {
        return iterator
      };
    }

    return iterator
  }

  function Headers(headers) {
    this.map = {};

    if (headers instanceof Headers) {
      headers.forEach(function(value, name) {
        this.append(name, value);
      }, this);
    } else if (Array.isArray(headers)) {
      headers.forEach(function(header) {
        this.append(header[0], header[1]);
      }, this);
    } else if (headers) {
      Object.getOwnPropertyNames(headers).forEach(function(name) {
        this.append(name, headers[name]);
      }, this);
    }
  }

  Headers.prototype.append = function(name, value) {
    name = normalizeName(name);
    value = normalizeValue(value);
    var oldValue = this.map[name];
    this.map[name] = oldValue ? oldValue + ', ' + value : value;
  };

  Headers.prototype['delete'] = function(name) {
    delete this.map[normalizeName(name)];
  };

  Headers.prototype.get = function(name) {
    name = normalizeName(name);
    return this.has(name) ? this.map[name] : null
  };

  Headers.prototype.has = function(name) {
    return this.map.hasOwnProperty(normalizeName(name))
  };

  Headers.prototype.set = function(name, value) {
    this.map[normalizeName(name)] = normalizeValue(value);
  };

  Headers.prototype.forEach = function(callback, thisArg) {
    for (var name in this.map) {
      if (this.map.hasOwnProperty(name)) {
        callback.call(thisArg, this.map[name], name, this);
      }
    }
  };

  Headers.prototype.keys = function() {
    var items = [];
    this.forEach(function(value, name) {
      items.push(name);
    });
    return iteratorFor(items)
  };

  Headers.prototype.values = function() {
    var items = [];
    this.forEach(function(value) {
      items.push(value);
    });
    return iteratorFor(items)
  };

  Headers.prototype.entries = function() {
    var items = [];
    this.forEach(function(value, name) {
      items.push([name, value]);
    });
    return iteratorFor(items)
  };

  if (support.iterable) {
    Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
  }

  function consumed(body) {
    if (body.bodyUsed) {
      return Promise.reject(new TypeError('Already read'))
    }
    body.bodyUsed = true;
  }

  function fileReaderReady(reader) {
    return new Promise(function(resolve, reject) {
      reader.onload = function() {
        resolve(reader.result);
      };
      reader.onerror = function() {
        reject(reader.error);
      };
    })
  }

  function readBlobAsArrayBuffer(blob) {
    var reader = new FileReader();
    var promise = fileReaderReady(reader);
    reader.readAsArrayBuffer(blob);
    return promise
  }

  function readBlobAsText(blob) {
    var reader = new FileReader();
    var promise = fileReaderReady(reader);
    reader.readAsText(blob);
    return promise
  }

  function readArrayBufferAsText(buf) {
    var view = new Uint8Array(buf);
    var chars = new Array(view.length);

    for (var i = 0; i < view.length; i++) {
      chars[i] = String.fromCharCode(view[i]);
    }
    return chars.join('')
  }

  function bufferClone(buf) {
    if (buf.slice) {
      return buf.slice(0)
    } else {
      var view = new Uint8Array(buf.byteLength);
      view.set(new Uint8Array(buf));
      return view.buffer
    }
  }

  function Body() {
    this.bodyUsed = false;

    this._initBody = function(body) {
      this._bodyInit = body;
      if (!body) {
        this._bodyText = '';
      } else if (typeof body === 'string') {
        this._bodyText = body;
      } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
        this._bodyBlob = body;
      } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
        this._bodyFormData = body;
      } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
        this._bodyText = body.toString();
      } else if (support.arrayBuffer && support.blob && isDataView(body)) {
        this._bodyArrayBuffer = bufferClone(body.buffer);
        // IE 10-11 can't handle a DataView body.
        this._bodyInit = new Blob([this._bodyArrayBuffer]);
      } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
        this._bodyArrayBuffer = bufferClone(body);
      } else {
        this._bodyText = body = Object.prototype.toString.call(body);
      }

      if (!this.headers.get('content-type')) {
        if (typeof body === 'string') {
          this.headers.set('content-type', 'text/plain;charset=UTF-8');
        } else if (this._bodyBlob && this._bodyBlob.type) {
          this.headers.set('content-type', this._bodyBlob.type);
        } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
          this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
        }
      }
    };

    if (support.blob) {
      this.blob = function() {
        var rejected = consumed(this);
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return Promise.resolve(this._bodyBlob)
        } else if (this._bodyArrayBuffer) {
          return Promise.resolve(new Blob([this._bodyArrayBuffer]))
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as blob')
        } else {
          return Promise.resolve(new Blob([this._bodyText]))
        }
      };

      this.arrayBuffer = function() {
        if (this._bodyArrayBuffer) {
          return consumed(this) || Promise.resolve(this._bodyArrayBuffer)
        } else {
          return this.blob().then(readBlobAsArrayBuffer)
        }
      };
    }

    this.text = function() {
      var rejected = consumed(this);
      if (rejected) {
        return rejected
      }

      if (this._bodyBlob) {
        return readBlobAsText(this._bodyBlob)
      } else if (this._bodyArrayBuffer) {
        return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer))
      } else if (this._bodyFormData) {
        throw new Error('could not read FormData body as text')
      } else {
        return Promise.resolve(this._bodyText)
      }
    };

    if (support.formData) {
      this.formData = function() {
        return this.text().then(decode)
      };
    }

    this.json = function() {
      return this.text().then(JSON.parse)
    };

    return this
  }

  // HTTP methods whose capitalization should be normalized
  var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'];

  function normalizeMethod(method) {
    var upcased = method.toUpperCase();
    return methods.indexOf(upcased) > -1 ? upcased : method
  }

  function Request(input, options) {
    options = options || {};
    var body = options.body;

    if (input instanceof Request) {
      if (input.bodyUsed) {
        throw new TypeError('Already read')
      }
      this.url = input.url;
      this.credentials = input.credentials;
      if (!options.headers) {
        this.headers = new Headers(input.headers);
      }
      this.method = input.method;
      this.mode = input.mode;
      this.signal = input.signal;
      if (!body && input._bodyInit != null) {
        body = input._bodyInit;
        input.bodyUsed = true;
      }
    } else {
      this.url = String(input);
    }

    this.credentials = options.credentials || this.credentials || 'same-origin';
    if (options.headers || !this.headers) {
      this.headers = new Headers(options.headers);
    }
    this.method = normalizeMethod(options.method || this.method || 'GET');
    this.mode = options.mode || this.mode || null;
    this.signal = options.signal || this.signal;
    this.referrer = null;

    if ((this.method === 'GET' || this.method === 'HEAD') && body) {
      throw new TypeError('Body not allowed for GET or HEAD requests')
    }
    this._initBody(body);
  }

  Request.prototype.clone = function() {
    return new Request(this, {body: this._bodyInit})
  };

  function decode(body) {
    var form = new FormData();
    body
      .trim()
      .split('&')
      .forEach(function(bytes) {
        if (bytes) {
          var split = bytes.split('=');
          var name = split.shift().replace(/\+/g, ' ');
          var value = split.join('=').replace(/\+/g, ' ');
          form.append(decodeURIComponent(name), decodeURIComponent(value));
        }
      });
    return form
  }

  function parseHeaders(rawHeaders) {
    var headers = new Headers();
    // Replace instances of \r\n and \n followed by at least one space or horizontal tab with a space
    // https://tools.ietf.org/html/rfc7230#section-3.2
    var preProcessedHeaders = rawHeaders.replace(/\r?\n[\t ]+/g, ' ');
    preProcessedHeaders.split(/\r?\n/).forEach(function(line) {
      var parts = line.split(':');
      var key = parts.shift().trim();
      if (key) {
        var value = parts.join(':').trim();
        headers.append(key, value);
      }
    });
    return headers
  }

  Body.call(Request.prototype);

  function Response(bodyInit, options) {
    if (!options) {
      options = {};
    }

    this.type = 'default';
    this.status = options.status === undefined ? 200 : options.status;
    this.ok = this.status >= 200 && this.status < 300;
    this.statusText = 'statusText' in options ? options.statusText : 'OK';
    this.headers = new Headers(options.headers);
    this.url = options.url || '';
    this._initBody(bodyInit);
  }

  Body.call(Response.prototype);

  Response.prototype.clone = function() {
    return new Response(this._bodyInit, {
      status: this.status,
      statusText: this.statusText,
      headers: new Headers(this.headers),
      url: this.url
    })
  };

  Response.error = function() {
    var response = new Response(null, {status: 0, statusText: ''});
    response.type = 'error';
    return response
  };

  var redirectStatuses = [301, 302, 303, 307, 308];

  Response.redirect = function(url, status) {
    if (redirectStatuses.indexOf(status) === -1) {
      throw new RangeError('Invalid status code')
    }

    return new Response(null, {status: status, headers: {location: url}})
  };

  var DOMException = self.DOMException;
  try {
    new DOMException();
  } catch (err) {
    DOMException = function(message, name) {
      this.message = message;
      this.name = name;
      var error = Error(message);
      this.stack = error.stack;
    };
    DOMException.prototype = Object.create(Error.prototype);
    DOMException.prototype.constructor = DOMException;
  }

  function fetch$1(input, init) {
    return new Promise(function(resolve, reject) {
      var request = new Request(input, init);

      if (request.signal && request.signal.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'))
      }

      var xhr = new XMLHttpRequest();

      function abortXhr() {
        xhr.abort();
      }

      xhr.onload = function() {
        var options = {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parseHeaders(xhr.getAllResponseHeaders() || '')
        };
        options.url = 'responseURL' in xhr ? xhr.responseURL : options.headers.get('X-Request-URL');
        var body = 'response' in xhr ? xhr.response : xhr.responseText;
        resolve(new Response(body, options));
      };

      xhr.onerror = function() {
        reject(new TypeError('Network request failed'));
      };

      xhr.ontimeout = function() {
        reject(new TypeError('Network request failed'));
      };

      xhr.onabort = function() {
        reject(new DOMException('Aborted', 'AbortError'));
      };

      xhr.open(request.method, request.url, true);

      if (request.credentials === 'include') {
        xhr.withCredentials = true;
      } else if (request.credentials === 'omit') {
        xhr.withCredentials = false;
      }

      if ('responseType' in xhr && support.blob) {
        xhr.responseType = 'blob';
      }

      request.headers.forEach(function(value, name) {
        xhr.setRequestHeader(name, value);
      });

      if (request.signal) {
        request.signal.addEventListener('abort', abortXhr);

        xhr.onreadystatechange = function() {
          // DONE (success or failure)
          if (xhr.readyState === 4) {
            request.signal.removeEventListener('abort', abortXhr);
          }
        };
      }

      xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit);
    })
  }

  fetch$1.polyfill = true;

  if (!self.fetch) {
    self.fetch = fetch$1;
    self.Headers = Headers;
    self.Request = Request;
    self.Response = Response;
  }

  /* eslint no-extend-native: off */
  if (!Uint8Array.prototype.fill) {
    Uint8Array.prototype.fill = function (value) {
      // Steps 1-2.
      if (this == null) {
        throw new TypeError('this is null or not defined');
      }

      var O = Object(this);

      // Steps 3-5.
      var len = O.length >>> 0;

      // Steps 6-7.
      var start = arguments[1];
      var relativeStart = start >> 0;

      // Step 8.
      var k = relativeStart < 0
        ? Math.max(len + relativeStart, 0)
        : Math.min(relativeStart, len);

      // Steps 9-10.
      var end = arguments[2];
      var relativeEnd = end === undefined
        ? len : end >> 0;

      // Step 11.
      var final = relativeEnd < 0
        ? Math.max(len + relativeEnd, 0)
        : Math.min(relativeEnd, len);

      // Step 12.
      while (k < final) {
        O[k] = value;
        k++;
      }

      // Step 13.
      return O;
    };
  }

  /**
  @license
  Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  /* eslint-disable no-unused-vars */
  /**
   * When using Closure Compiler, JSCompiler_renameProperty(property, object) is replaced by the munged name for object[property]
   * We cannot alias this function, so we have to use a small shim that has the same behavior when not compiling.
   *
   * @param {string} prop Property name
   * @param {?Object} obj Reference object
   * @return {string} Potentially renamed property name
   */
  window.JSCompiler_renameProperty = function(prop, obj) {
    return prop;
  };

  /**
  @license
  Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  // unique global id for deduping mixins.
  let dedupeId = 0;

  /* eslint-disable valid-jsdoc */
  /**
   * Wraps an ES6 class expression mixin such that the mixin is only applied
   * if it has not already been applied its base argument. Also memoizes mixin
   * applications.
   *
   * @template T
   * @param {T} mixin ES6 class expression mixin to wrap
   * @return {T}
   * @suppress {invalidCasts}
   */
  const dedupingMixin = function(mixin) {
    let mixinApplications = /** @type {!MixinFunction} */(mixin).__mixinApplications;
    if (!mixinApplications) {
      mixinApplications = new WeakMap();
      /** @type {!MixinFunction} */(mixin).__mixinApplications = mixinApplications;
    }
    // maintain a unique id for each mixin
    let mixinDedupeId = dedupeId++;
    function dedupingMixin(base) {
      let baseSet = /** @type {!MixinFunction} */(base).__mixinSet;
      if (baseSet && baseSet[mixinDedupeId]) {
        return base;
      }
      let map = mixinApplications;
      let extended = map.get(base);
      if (!extended) {
        extended = /** @type {!Function} */(mixin)(base);
        map.set(base, extended);
      }
      // copy inherited mixin set from the extended class, or the base class
      // NOTE: we avoid use of Set here because some browser (IE11)
      // cannot extend a base Set via the constructor.
      let mixinSet = Object.create(/** @type {!MixinFunction} */(extended).__mixinSet || baseSet || null);
      mixinSet[mixinDedupeId] = true;
      /** @type {!MixinFunction} */(extended).__mixinSet = mixinSet;
      return extended;
    }

    return dedupingMixin;
  };
  /* eslint-enable valid-jsdoc */

  /**
  @license
  Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  /**
   * Registers a class prototype for telemetry purposes.
   * @param {!PolymerElementConstructor} prototype Element prototype to register
   * @protected
   */
  function register(prototype) {
  }

  /**
  @license
  Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  // Microtask implemented using Mutation Observer
  let microtaskCurrHandle = 0;
  let microtaskLastHandle = 0;
  let microtaskCallbacks = [];
  let microtaskNodeContent = 0;
  let microtaskNode = document.createTextNode('');
  new window.MutationObserver(microtaskFlush).observe(microtaskNode, {characterData: true});

  function microtaskFlush() {
    const len = microtaskCallbacks.length;
    for (let i = 0; i < len; i++) {
      let cb = microtaskCallbacks[i];
      if (cb) {
        try {
          cb();
        } catch (e) {
          setTimeout(() => { throw e; });
        }
      }
    }
    microtaskCallbacks.splice(0, len);
    microtaskLastHandle += len;
  }

  /**
   * Async interface for enqueuing callbacks that run at microtask timing.
   *
   * Note that microtask timing is achieved via a single `MutationObserver`,
   * and thus callbacks enqueued with this API will all run in a single
   * batch, and not interleaved with other microtasks such as promises.
   * Promises are avoided as an implementation choice for the time being
   * due to Safari bugs that cause Promises to lack microtask guarantees.
   *
   * @namespace
   * @summary Async interface for enqueuing callbacks that run at microtask
   *   timing.
   */
  const microTask = {

    /**
     * Enqueues a function called at microtask timing.
     *
     * @memberof microTask
     * @param {!Function=} callback Callback to run
     * @return {number} Handle used for canceling task
     */
    run(callback) {
      microtaskNode.textContent = microtaskNodeContent++;
      microtaskCallbacks.push(callback);
      return microtaskCurrHandle++;
    },

    /**
     * Cancels a previously enqueued `microTask` callback.
     *
     * @memberof microTask
     * @param {number} handle Handle returned from `run` of callback to cancel
     * @return {void}
     */
    cancel(handle) {
      const idx = handle - microtaskLastHandle;
      if (idx >= 0) {
        if (!microtaskCallbacks[idx]) {
          throw new Error('invalid async handle: ' + handle);
        }
        microtaskCallbacks[idx] = null;
      }
    }

  };

  /**
  @license
  Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  /* eslint-disable valid-jsdoc */
  /**
   * Node wrapper to ensure ShadowDOM safe operation regardless of polyfill
   * presence or mode. Note that with the introduction of `ShadyDOM.noPatch`,
   * a node wrapper must be used to access ShadowDOM API.
   * This is similar to using `Polymer.dom` but relies exclusively
   * on the presence of the ShadyDOM polyfill rather than requiring the loading
   * of legacy (Polymer.dom) API.
   * @type {function(Node):Node}
   */
  const wrap = (window['ShadyDOM'] && window['ShadyDOM']['noPatch'] && window['ShadyDOM']['wrap']) ?
    window['ShadyDOM']['wrap'] :
    (window['ShadyDOM'] ? (n) => ShadyDOM['patch'](n) : (n) => n);

  /**
  @license
  Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  /** @const {!AsyncInterface} */
  const microtask = microTask;

  /**
   * Element class mixin that provides basic meta-programming for creating one
   * or more property accessors (getter/setter pair) that enqueue an async
   * (batched) `_propertiesChanged` callback.
   *
   * For basic usage of this mixin, call `MyClass.createProperties(props)`
   * once at class definition time to create property accessors for properties
   * named in props, implement `_propertiesChanged` to react as desired to
   * property changes, and implement `static get observedAttributes()` and
   * include lowercase versions of any property names that should be set from
   * attributes. Last, call `this._enableProperties()` in the element's
   * `connectedCallback` to enable the accessors.
   *
   * @mixinFunction
   * @polymer
   * @summary Element class mixin for reacting to property changes from
   *   generated property accessors.
   * @template T
   * @param {function(new:T)} superClass Class to apply mixin to.
   * @return {function(new:T)} superClass with mixin applied.
   */
  const PropertiesChanged = dedupingMixin(
      /**
       * @template T
       * @param {function(new:T)} superClass Class to apply mixin to.
       * @return {function(new:T)} superClass with mixin applied.
       */
      (superClass) => {

    /**
     * @polymer
     * @mixinClass
     * @implements {Polymer_PropertiesChanged}
     * @unrestricted
     */
    class PropertiesChanged extends superClass {

      /**
       * Creates property accessors for the given property names.
       * @param {!Object} props Object whose keys are names of accessors.
       * @return {void}
       * @protected
       * @nocollapse
       */
      static createProperties(props) {
        const proto = this.prototype;
        for (let prop in props) {
          // don't stomp an existing accessor
          if (!(prop in proto)) {
            proto._createPropertyAccessor(prop);
          }
        }
      }

      /**
       * Returns an attribute name that corresponds to the given property.
       * The attribute name is the lowercased property name. Override to
       * customize this mapping.
       * @param {string} property Property to convert
       * @return {string} Attribute name corresponding to the given property.
       *
       * @protected
       * @nocollapse
       */
      static attributeNameForProperty(property) {
        return property.toLowerCase();
      }

      /**
       * Override point to provide a type to which to deserialize a value to
       * a given property.
       * @param {string} name Name of property
       *
       * @protected
       * @nocollapse
       */
      static typeForProperty(name) { } //eslint-disable-line no-unused-vars

      /**
       * Creates a setter/getter pair for the named property with its own
       * local storage.  The getter returns the value in the local storage,
       * and the setter calls `_setProperty`, which updates the local storage
       * for the property and enqueues a `_propertiesChanged` callback.
       *
       * This method may be called on a prototype or an instance.  Calling
       * this method may overwrite a property value that already exists on
       * the prototype/instance by creating the accessor.
       *
       * @param {string} property Name of the property
       * @param {boolean=} readOnly When true, no setter is created; the
       *   protected `_setProperty` function must be used to set the property
       * @return {void}
       * @protected
       * @override
       */
      _createPropertyAccessor(property, readOnly) {
        this._addPropertyToAttributeMap(property);
        if (!this.hasOwnProperty(JSCompiler_renameProperty('__dataHasAccessor', this))) {
          this.__dataHasAccessor = Object.assign({}, this.__dataHasAccessor);
        }
        if (!this.__dataHasAccessor[property]) {
          this.__dataHasAccessor[property] = true;
          this._definePropertyAccessor(property, readOnly);
        }
      }

      /**
       * Adds the given `property` to a map matching attribute names
       * to property names, using `attributeNameForProperty`. This map is
       * used when deserializing attribute values to properties.
       *
       * @param {string} property Name of the property
       * @override
       */
      _addPropertyToAttributeMap(property) {
        if (!this.hasOwnProperty(JSCompiler_renameProperty('__dataAttributes', this))) {
          this.__dataAttributes = Object.assign({}, this.__dataAttributes);
        }
        if (!this.__dataAttributes[property]) {
          const attr = this.constructor.attributeNameForProperty(property);
          this.__dataAttributes[attr] = property;
        }
      }

      /**
       * Defines a property accessor for the given property.
       * @param {string} property Name of the property
       * @param {boolean=} readOnly When true, no setter is created
       * @return {void}
       * @override
       */
       _definePropertyAccessor(property, readOnly) {
        Object.defineProperty(this, property, {
          /* eslint-disable valid-jsdoc */
          /** @this {PropertiesChanged} */
          get() {
            return this._getProperty(property);
          },
          /** @this {PropertiesChanged} */
          set: readOnly ? function () {} : function (value) {
            this._setProperty(property, value);
          }
          /* eslint-enable */
        });
      }

      constructor() {
        super();
        /** @type {boolean} */
        this.__dataEnabled = false;
        this.__dataReady = false;
        this.__dataInvalid = false;
        this.__data = {};
        this.__dataPending = null;
        this.__dataOld = null;
        this.__dataInstanceProps = null;
        this.__serializing = false;
        this._initializeProperties();
      }

      /**
       * Lifecycle callback called when properties are enabled via
       * `_enableProperties`.
       *
       * Users may override this function to implement behavior that is
       * dependent on the element having its property data initialized, e.g.
       * from defaults (initialized from `constructor`, `_initializeProperties`),
       * `attributeChangedCallback`, or values propagated from host e.g. via
       * bindings.  `super.ready()` must be called to ensure the data system
       * becomes enabled.
       *
       * @return {void}
       * @public
       * @override
       */
      ready() {
        this.__dataReady = true;
        this._flushProperties();
      }

      /**
       * Initializes the local storage for property accessors.
       *
       * Provided as an override point for performing any setup work prior
       * to initializing the property accessor system.
       *
       * @return {void}
       * @protected
       * @override
       */
      _initializeProperties() {
        // Capture instance properties; these will be set into accessors
        // during first flush. Don't set them here, since we want
        // these to overwrite defaults/constructor assignments
        for (let p in this.__dataHasAccessor) {
          if (this.hasOwnProperty(p)) {
            this.__dataInstanceProps = this.__dataInstanceProps || {};
            this.__dataInstanceProps[p] = this[p];
            delete this[p];
          }
        }
      }

      /**
       * Called at ready time with bag of instance properties that overwrote
       * accessors when the element upgraded.
       *
       * The default implementation sets these properties back into the
       * setter at ready time.  This method is provided as an override
       * point for customizing or providing more efficient initialization.
       *
       * @param {Object} props Bag of property values that were overwritten
       *   when creating property accessors.
       * @return {void}
       * @protected
       * @override
       */
      _initializeInstanceProperties(props) {
        Object.assign(this, props);
      }

      /**
       * Updates the local storage for a property (via `_setPendingProperty`)
       * and enqueues a `_proeprtiesChanged` callback.
       *
       * @param {string} property Name of the property
       * @param {*} value Value to set
       * @return {void}
       * @protected
       * @override
       */
      _setProperty(property, value) {
        if (this._setPendingProperty(property, value)) {
          this._invalidateProperties();
        }
      }

      /**
       * Returns the value for the given property.
       * @param {string} property Name of property
       * @return {*} Value for the given property
       * @protected
       * @override
       */
      _getProperty(property) {
        return this.__data[property];
      }

      /* eslint-disable no-unused-vars */
      /**
       * Updates the local storage for a property, records the previous value,
       * and adds it to the set of "pending changes" that will be passed to the
       * `_propertiesChanged` callback.  This method does not enqueue the
       * `_propertiesChanged` callback.
       *
       * @param {string} property Name of the property
       * @param {*} value Value to set
       * @param {boolean=} ext Not used here; affordance for closure
       * @return {boolean} Returns true if the property changed
       * @protected
       * @override
       */
      _setPendingProperty(property, value, ext) {
        let old = this.__data[property];
        let changed = this._shouldPropertyChange(property, value, old);
        if (changed) {
          if (!this.__dataPending) {
            this.__dataPending = {};
            this.__dataOld = {};
          }
          // Ensure old is captured from the last turn
          if (this.__dataOld && !(property in this.__dataOld)) {
            this.__dataOld[property] = old;
          }
          this.__data[property] = value;
          this.__dataPending[property] = value;
        }
        return changed;
      }
      /* eslint-enable */

      /**
       * Marks the properties as invalid, and enqueues an async
       * `_propertiesChanged` callback.
       *
       * @return {void}
       * @protected
       * @override
       */
      _invalidateProperties() {
        if (!this.__dataInvalid && this.__dataReady) {
          this.__dataInvalid = true;
          microtask.run(() => {
            if (this.__dataInvalid) {
              this.__dataInvalid = false;
              this._flushProperties();
            }
          });
        }
      }

      /**
       * Call to enable property accessor processing. Before this method is
       * called accessor values will be set but side effects are
       * queued. When called, any pending side effects occur immediately.
       * For elements, generally `connectedCallback` is a normal spot to do so.
       * It is safe to call this method multiple times as it only turns on
       * property accessors once.
       *
       * @return {void}
       * @protected
       * @override
       */
      _enableProperties() {
        if (!this.__dataEnabled) {
          this.__dataEnabled = true;
          if (this.__dataInstanceProps) {
            this._initializeInstanceProperties(this.__dataInstanceProps);
            this.__dataInstanceProps = null;
          }
          this.ready();
        }
      }

      /**
       * Calls the `_propertiesChanged` callback with the current set of
       * pending changes (and old values recorded when pending changes were
       * set), and resets the pending set of changes. Generally, this method
       * should not be called in user code.
       *
       * @return {void}
       * @protected
       * @override
       */
      _flushProperties() {
        const props = this.__data;
        const changedProps = this.__dataPending;
        const old = this.__dataOld;
        if (this._shouldPropertiesChange(props, changedProps, old)) {
          this.__dataPending = null;
          this.__dataOld = null;
          this._propertiesChanged(props, changedProps, old);
        }
      }

      /**
       * Called in `_flushProperties` to determine if `_propertiesChanged`
       * should be called. The default implementation returns true if
       * properties are pending. Override to customize when
       * `_propertiesChanged` is called.
       * @param {!Object} currentProps Bag of all current accessor values
       * @param {?Object} changedProps Bag of properties changed since the last
       *   call to `_propertiesChanged`
       * @param {?Object} oldProps Bag of previous values for each property
       *   in `changedProps`
       * @return {boolean} true if changedProps is truthy
       * @override
       */
      _shouldPropertiesChange(currentProps, changedProps, oldProps) { // eslint-disable-line no-unused-vars
        return Boolean(changedProps);
      }

      /**
       * Callback called when any properties with accessors created via
       * `_createPropertyAccessor` have been set.
       *
       * @param {!Object} currentProps Bag of all current accessor values
       * @param {?Object} changedProps Bag of properties changed since the last
       *   call to `_propertiesChanged`
       * @param {?Object} oldProps Bag of previous values for each property
       *   in `changedProps`
       * @return {void}
       * @protected
       * @override
       */
      _propertiesChanged(currentProps, changedProps, oldProps) { // eslint-disable-line no-unused-vars
      }

      /**
       * Method called to determine whether a property value should be
       * considered as a change and cause the `_propertiesChanged` callback
       * to be enqueued.
       *
       * The default implementation returns `true` if a strict equality
       * check fails. The method always returns false for `NaN`.
       *
       * Override this method to e.g. provide stricter checking for
       * Objects/Arrays when using immutable patterns.
       *
       * @param {string} property Property name
       * @param {*} value New property value
       * @param {*} old Previous property value
       * @return {boolean} Whether the property should be considered a change
       *   and enqueue a `_proeprtiesChanged` callback
       * @protected
       * @override
       */
      _shouldPropertyChange(property, value, old) {
        return (
          // Strict equality check
          (old !== value &&
            // This ensures (old==NaN, value==NaN) always returns false
            (old === old || value === value))
        );
      }

      /**
       * Implements native Custom Elements `attributeChangedCallback` to
       * set an attribute value to a property via `_attributeToProperty`.
       *
       * @param {string} name Name of attribute that changed
       * @param {?string} old Old attribute value
       * @param {?string} value New attribute value
       * @param {?string} namespace Attribute namespace.
       * @return {void}
       * @suppress {missingProperties} Super may or may not implement the callback
       * @override
       */
      attributeChangedCallback(name, old, value, namespace) {
        if (old !== value) {
          this._attributeToProperty(name, value);
        }
        if (super.attributeChangedCallback) {
          super.attributeChangedCallback(name, old, value, namespace);
        }
      }

      /**
       * Deserializes an attribute to its associated property.
       *
       * This method calls the `_deserializeValue` method to convert the string to
       * a typed value.
       *
       * @param {string} attribute Name of attribute to deserialize.
       * @param {?string} value of the attribute.
       * @param {*=} type type to deserialize to, defaults to the value
       * returned from `typeForProperty`
       * @return {void}
       * @override
       */
      _attributeToProperty(attribute, value, type) {
        if (!this.__serializing) {
          const map = this.__dataAttributes;
          const property = map && map[attribute] || attribute;
          this[property] = this._deserializeValue(value, type ||
            this.constructor.typeForProperty(property));
        }
      }

      /**
       * Serializes a property to its associated attribute.
       *
       * @suppress {invalidCasts} Closure can't figure out `this` is an element.
       *
       * @param {string} property Property name to reflect.
       * @param {string=} attribute Attribute name to reflect to.
       * @param {*=} value Property value to refect.
       * @return {void}
       * @override
       */
      _propertyToAttribute(property, attribute, value) {
        this.__serializing = true;
        value = (arguments.length < 3) ? this[property] : value;
        this._valueToNodeAttribute(/** @type {!HTMLElement} */(this), value,
          attribute || this.constructor.attributeNameForProperty(property));
        this.__serializing = false;
      }

      /**
       * Sets a typed value to an HTML attribute on a node.
       *
       * This method calls the `_serializeValue` method to convert the typed
       * value to a string.  If the `_serializeValue` method returns `undefined`,
       * the attribute will be removed (this is the default for boolean
       * type `false`).
       *
       * @param {Element} node Element to set attribute to.
       * @param {*} value Value to serialize.
       * @param {string} attribute Attribute name to serialize to.
       * @return {void}
       * @override
       */
      _valueToNodeAttribute(node, value, attribute) {
        const str = this._serializeValue(value);
        if (attribute === 'class' || attribute === 'name' || attribute === 'slot') {
          node = /** @type {?Element} */(wrap(node));
        }
        if (str === undefined) {
          node.removeAttribute(attribute);
        } else {
          node.setAttribute(attribute, str);
        }
      }

      /**
       * Converts a typed JavaScript value to a string.
       *
       * This method is called when setting JS property values to
       * HTML attributes.  Users may override this method to provide
       * serialization for custom types.
       *
       * @param {*} value Property value to serialize.
       * @return {string | undefined} String serialized from the provided
       * property  value.
       * @override
       */
      _serializeValue(value) {
        switch (typeof value) {
          case 'boolean':
            return value ? '' : undefined;
          default:
            return value != null ? value.toString() : undefined;
        }
      }

      /**
       * Converts a string to a typed JavaScript value.
       *
       * This method is called when reading HTML attribute values to
       * JS properties.  Users may override this method to provide
       * deserialization for custom `type`s. Types for `Boolean`, `String`,
       * and `Number` convert attributes to the expected types.
       *
       * @param {?string} value Value to deserialize.
       * @param {*=} type Type to deserialize the string to.
       * @return {*} Typed value deserialized from the provided string.
       * @override
       */
      _deserializeValue(value, type) {
        switch (type) {
          case Boolean:
            return (value !== null);
          case Number:
            return Number(value);
          default:
            return value;
        }
      }

    }

    return PropertiesChanged;
  });

  /**
  @license
  Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */

  /**
   * Creates a copy of `props` with each property normalized such that
   * upgraded it is an object with at least a type property { type: Type}.
   *
   * @param {Object} props Properties to normalize
   * @return {Object} Copy of input `props` with normalized properties that
   * are in the form {type: Type}
   * @private
   */
  function normalizeProperties(props) {
    const output = {};
    for (let p in props) {
      const o = props[p];
      output[p] = (typeof o === 'function') ? {type: o} : o;
    }
    return output;
  }

  /**
   * Mixin that provides a minimal starting point to using the PropertiesChanged
   * mixin by providing a mechanism to declare properties in a static
   * getter (e.g. static get properties() { return { foo: String } }). Changes
   * are reported via the `_propertiesChanged` method.
   *
   * This mixin provides no specific support for rendering. Users are expected
   * to create a ShadowRoot and put content into it and update it in whatever
   * way makes sense. This can be done in reaction to properties changing by
   * implementing `_propertiesChanged`.
   *
   * @mixinFunction
   * @polymer
   * @appliesMixin PropertiesChanged
   * @summary Mixin that provides a minimal starting point for using
   * the PropertiesChanged mixin by providing a declarative `properties` object.
   * @template T
   * @param {function(new:T)} superClass Class to apply mixin to.
   * @return {function(new:T)} superClass with mixin applied.
   */
  const PropertiesMixin = dedupingMixin(superClass => {

   /**
    * @constructor
    * @implements {Polymer_PropertiesChanged}
    * @private
    */
   const base = PropertiesChanged(superClass);

   /**
    * Returns the super class constructor for the given class, if it is an
    * instance of the PropertiesMixin.
    *
    * @param {!PropertiesMixinConstructor} constructor PropertiesMixin constructor
    * @return {?PropertiesMixinConstructor} Super class constructor
    */
   function superPropertiesClass(constructor) {
     const superCtor = Object.getPrototypeOf(constructor);

     // Note, the `PropertiesMixin` class below only refers to the class
     // generated by this call to the mixin; the instanceof test only works
     // because the mixin is deduped and guaranteed only to apply once, hence
     // all constructors in a proto chain will see the same `PropertiesMixin`
     return (superCtor.prototype instanceof PropertiesMixin) ?
       /** @type {!PropertiesMixinConstructor} */ (superCtor) : null;
   }

   /**
    * Returns a memoized version of the `properties` object for the
    * given class. Properties not in object format are converted to at
    * least {type}.
    *
    * @param {PropertiesMixinConstructor} constructor PropertiesMixin constructor
    * @return {Object} Memoized properties object
    */
   function ownProperties(constructor) {
     if (!constructor.hasOwnProperty(JSCompiler_renameProperty('__ownProperties', constructor))) {
       let props = null;

       if (constructor.hasOwnProperty(JSCompiler_renameProperty('properties', constructor))) {
         const properties = constructor.properties;

         if (properties) {
          props = normalizeProperties(properties);
         }
       }

       constructor.__ownProperties = props;
     }
     return constructor.__ownProperties;
   }

   /**
    * @polymer
    * @mixinClass
    * @extends {base}
    * @implements {Polymer_PropertiesMixin}
    * @unrestricted
    */
   class PropertiesMixin extends base {

     /**
      * Implements standard custom elements getter to observes the attributes
      * listed in `properties`.
      * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
      * @nocollapse
      */
     static get observedAttributes() {
       if (!this.hasOwnProperty(JSCompiler_renameProperty('__observedAttributes', this))) {
         register(this.prototype);
         const props = this._properties;
         this.__observedAttributes = props ? Object.keys(props).map(p => this.attributeNameForProperty(p)) : [];
       }
       return this.__observedAttributes;
     }

     /**
      * Finalizes an element definition, including ensuring any super classes
      * are also finalized. This includes ensuring property
      * accessors exist on the element prototype. This method calls
      * `_finalizeClass` to finalize each constructor in the prototype chain.
      * @return {void}
      * @nocollapse
      */
     static finalize() {
       if (!this.hasOwnProperty(JSCompiler_renameProperty('__finalized', this))) {
         const superCtor = superPropertiesClass(/** @type {!PropertiesMixinConstructor} */(this));
         if (superCtor) {
           superCtor.finalize();
         }
         this.__finalized = true;
         this._finalizeClass();
       }
     }

     /**
      * Finalize an element class. This includes ensuring property
      * accessors exist on the element prototype. This method is called by
      * `finalize` and finalizes the class constructor.
      *
      * @protected
      * @nocollapse
      */
     static _finalizeClass() {
       const props = ownProperties(/** @type {!PropertiesMixinConstructor} */(this));
       if (props) {
         /** @type {?} */ (this).createProperties(props);
       }
     }

     /**
      * Returns a memoized version of all properties, including those inherited
      * from super classes. Properties not in object format are converted to
      * at least {type}.
      *
      * @return {Object} Object containing properties for this class
      * @protected
      * @nocollapse
      */
     static get _properties() {
       if (!this.hasOwnProperty(
         JSCompiler_renameProperty('__properties', this))) {
         const superCtor = superPropertiesClass(/** @type {!PropertiesMixinConstructor} */(this));
         this.__properties = Object.assign({},
           superCtor && superCtor._properties,
           ownProperties(/** @type {PropertiesMixinConstructor} */(this)));
       }
       return this.__properties;
     }

     /**
      * Overrides `PropertiesChanged` method to return type specified in the
      * static `properties` object for the given property.
      * @param {string} name Name of property
      * @return {*} Type to which to deserialize attribute
      *
      * @protected
      * @nocollapse
      */
     static typeForProperty(name) {
       const info = this._properties[name];
       return info && info.type;
     }

     /**
      * Overrides `PropertiesChanged` method and adds a call to
      * `finalize` which lazily configures the element's property accessors.
      * @override
      * @return {void}
      */
     _initializeProperties() {
       this.constructor.finalize();
       super._initializeProperties();
     }

     /**
      * Called when the element is added to a document.
      * Calls `_enableProperties` to turn on property system from
      * `PropertiesChanged`.
      * @suppress {missingProperties} Super may or may not implement the callback
      * @return {void}
      * @override
      */
     connectedCallback() {
       if (super.connectedCallback) {
         super.connectedCallback();
       }
       this._enableProperties();
     }

     /**
      * Called when the element is removed from a document
      * @suppress {missingProperties} Super may or may not implement the callback
      * @return {void}
      * @override
      */
     disconnectedCallback() {
       if (super.disconnectedCallback) {
         super.disconnectedCallback();
       }
     }

   }

   return PropertiesMixin;

  });

  /**
   * @license
   * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
   * This code may only be used under the BSD style license found at
   * http://polymer.github.io/LICENSE.txt
   * The complete set of authors may be found at
   * http://polymer.github.io/AUTHORS.txt
   * The complete set of contributors may be found at
   * http://polymer.github.io/CONTRIBUTORS.txt
   * Code distributed by Google as part of the polymer project is also
   * subject to an additional IP rights grant found at
   * http://polymer.github.io/PATENTS.txt
   */
  // The first argument to JS template tags retain identity across multiple
  // calls to a tag for the same literal, so we can cache work done per literal
  // in a Map.
  const templateCaches = new Map();
  /**
   * The return type of `html`, which holds a Template and the values from
   * interpolated expressions.
   */
  class TemplateResult {
      constructor(strings, values, type, partCallback = defaultPartCallback) {
          this.strings = strings;
          this.values = values;
          this.type = type;
          this.partCallback = partCallback;
      }
      /**
       * Returns a string of HTML used to create a <template> element.
       */
      getHTML() {
          const l = this.strings.length - 1;
          let html = '';
          let isTextBinding = true;
          for (let i = 0; i < l; i++) {
              const s = this.strings[i];
              html += s;
              // We're in a text position if the previous string closed its tags.
              // If it doesn't have any tags, then we use the previous text position
              // state.
              const closing = findTagClose(s);
              isTextBinding = closing > -1 ? closing < s.length : isTextBinding;
              html += isTextBinding ? nodeMarker : marker;
          }
          html += this.strings[l];
          return html;
      }
      getTemplateElement() {
          const template = document.createElement('template');
          template.innerHTML = this.getHTML();
          return template;
      }
  }
  /**
   * An expression marker with embedded unique key to avoid collision with
   * possible text in templates.
   */
  const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
  /**
   * An expression marker used text-positions, not attribute positions,
   * in template.
   */
  const nodeMarker = `<!--${marker}-->`;
  const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
  /**
   * This regex extracts the attribute name preceding an attribute-position
   * expression. It does this by matching the syntax allowed for attributes
   * against the string literal directly preceding the expression, assuming that
   * the expression is in an attribute-value position.
   *
   * See attributes in the HTML spec:
   * https://www.w3.org/TR/html5/syntax.html#attributes-0
   *
   * "\0-\x1F\x7F-\x9F" are Unicode control characters
   *
   * " \x09\x0a\x0c\x0d" are HTML space characters:
   * https://www.w3.org/TR/html5/infrastructure.html#space-character
   *
   * So an attribute is:
   *  * The name: any character except a control character, space character, ('),
   *    ("), ">", "=", or "/"
   *  * Followed by zero or more space characters
   *  * Followed by "="
   *  * Followed by zero or more space characters
   *  * Followed by:
   *    * Any character except space, ('), ("), "<", ">", "=", (`), or
   *    * (") then any non-("), or
   *    * (') then any non-(')
   */
  const lastAttributeNameRegex = /[ \x09\x0a\x0c\x0d]([^\0-\x1F\x7F-\x9F \x09\x0a\x0c\x0d"'>=/]+)[ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*)$/;
  /**
   * Finds the closing index of the last closed HTML tag.
   * This has 3 possible return values:
   *   - `-1`, meaning there is no tag in str.
   *   - `string.length`, meaning the last opened tag is unclosed.
   *   - Some positive number < str.length, meaning the index of the closing '>'.
   */
  function findTagClose(str) {
      const close = str.lastIndexOf('>');
      const open = str.indexOf('<', close + 1);
      return open > -1 ? str.length : close;
  }
  /**
   * A placeholder for a dynamic expression in an HTML template.
   *
   * There are two built-in part types: AttributePart and NodePart. NodeParts
   * always represent a single dynamic expression, while AttributeParts may
   * represent as many expressions are contained in the attribute.
   *
   * A Template's parts are mutable, so parts can be replaced or modified
   * (possibly to implement different template semantics). The contract is that
   * parts can only be replaced, not removed, added or reordered, and parts must
   * always consume the correct number of values in their `update()` method.
   *
   * TODO(justinfagnani): That requirement is a little fragile. A
   * TemplateInstance could instead be more careful about which values it gives
   * to Part.update().
   */
  class TemplatePart {
      constructor(type, index, name, rawName, strings) {
          this.type = type;
          this.index = index;
          this.name = name;
          this.rawName = rawName;
          this.strings = strings;
      }
  }
  const isTemplatePartActive = (part) => part.index !== -1;
  /**
   * An updateable Template that tracks the location of dynamic parts.
   */
  class Template {
      constructor(result, element) {
          this.parts = [];
          this.element = element;
          const content = this.element.content;
          // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
          const walker = document.createTreeWalker(content, 133 /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT |
                 NodeFilter.SHOW_TEXT */, null, false);
          let index = -1;
          let partIndex = 0;
          const nodesToRemove = [];
          // The actual previous node, accounting for removals: if a node is removed
          // it will never be the previousNode.
          let previousNode;
          // Used to set previousNode at the top of the loop.
          let currentNode;
          while (walker.nextNode()) {
              index++;
              previousNode = currentNode;
              const node = currentNode = walker.currentNode;
              if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                  if (!node.hasAttributes()) {
                      continue;
                  }
                  const attributes = node.attributes;
                  // Per https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                  // attributes are not guaranteed to be returned in document order. In
                  // particular, Edge/IE can return them out of order, so we cannot assume
                  // a correspondance between part index and attribute index.
                  let count = 0;
                  for (let i = 0; i < attributes.length; i++) {
                      if (attributes[i].value.indexOf(marker) >= 0) {
                          count++;
                      }
                  }
                  while (count-- > 0) {
                      // Get the template literal section leading up to the first
                      // expression in this attribute
                      const stringForPart = result.strings[partIndex];
                      // Find the attribute name
                      const attributeNameInPart = lastAttributeNameRegex.exec(stringForPart)[1];
                      // Find the corresponding attribute
                      // TODO(justinfagnani): remove non-null assertion
                      const attribute = attributes.getNamedItem(attributeNameInPart);
                      const stringsForAttributeValue = attribute.value.split(markerRegex);
                      this.parts.push(new TemplatePart('attribute', index, attribute.name, attributeNameInPart, stringsForAttributeValue));
                      node.removeAttribute(attribute.name);
                      partIndex += stringsForAttributeValue.length - 1;
                  }
              }
              else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                  const nodeValue = node.nodeValue;
                  if (nodeValue.indexOf(marker) < 0) {
                      continue;
                  }
                  const parent = node.parentNode;
                  const strings = nodeValue.split(markerRegex);
                  const lastIndex = strings.length - 1;
                  // We have a part for each match found
                  partIndex += lastIndex;
                  // Generate a new text node for each literal section
                  // These nodes are also used as the markers for node parts
                  for (let i = 0; i < lastIndex; i++) {
                      parent.insertBefore((strings[i] === '')
                          ? document.createComment('')
                          : document.createTextNode(strings[i]), node);
                      this.parts.push(new TemplatePart('node', index++));
                  }
                  parent.insertBefore(strings[lastIndex] === '' ?
                      document.createComment('') :
                      document.createTextNode(strings[lastIndex]), node);
                  nodesToRemove.push(node);
              }
              else if (node.nodeType === 8 /* Node.COMMENT_NODE */ &&
                  node.nodeValue === marker) {
                  const parent = node.parentNode;
                  // Add a new marker node to be the startNode of the Part if any of the
                  // following are true:
                  //  * We don't have a previousSibling
                  //  * previousSibling is being removed (thus it's not the
                  //    `previousNode`)
                  //  * previousSibling is not a Text node
                  //
                  // TODO(justinfagnani): We should be able to use the previousNode here
                  // as the marker node and reduce the number of extra nodes we add to a
                  // template. See https://github.com/PolymerLabs/lit-html/issues/147
                  const previousSibling = node.previousSibling;
                  if (previousSibling === null || previousSibling !== previousNode ||
                      previousSibling.nodeType !== Node.TEXT_NODE) {
                      parent.insertBefore(document.createComment(''), node);
                  }
                  else {
                      index--;
                  }
                  this.parts.push(new TemplatePart('node', index++));
                  nodesToRemove.push(node);
                  // If we don't have a nextSibling add a marker node.
                  // We don't have to check if the next node is going to be removed,
                  // because that node will induce a new marker if so.
                  if (node.nextSibling === null) {
                      parent.insertBefore(document.createComment(''), node);
                  }
                  else {
                      index--;
                  }
                  currentNode = previousNode;
                  partIndex++;
              }
          }
          // Remove text binding nodes after the walk to not disturb the TreeWalker
          for (const n of nodesToRemove) {
              n.parentNode.removeChild(n);
          }
      }
  }
  /**
   * Returns a value ready to be inserted into a Part from a user-provided value.
   *
   * If the user value is a directive, this invokes the directive with the given
   * part. If the value is null, it's converted to undefined to work better
   * with certain DOM APIs, like textContent.
   */
  const getValue = (part, value) => {
      // `null` as the value of a Text node will render the string 'null'
      // so we convert it to undefined
      if (isDirective(value)) {
          value = value(part);
          return noChange;
      }
      return value === null ? undefined : value;
  };
  const directive = (f) => {
      f.__litDirective = true;
      return f;
  };
  const isDirective = (o) => typeof o === 'function' && o.__litDirective === true;
  /**
   * A sentinel value that signals that a value was handled by a directive and
   * should not be written to the DOM.
   */
  const noChange = {};
  const isPrimitiveValue = (value) => value === null ||
      !(typeof value === 'object' || typeof value === 'function');
  class AttributePart {
      constructor(instance, element, name, strings) {
          this.instance = instance;
          this.element = element;
          this.name = name;
          this.strings = strings;
          this.size = strings.length - 1;
          this._previousValues = [];
      }
      _interpolate(values, startIndex) {
          const strings = this.strings;
          const l = strings.length - 1;
          let text = '';
          for (let i = 0; i < l; i++) {
              text += strings[i];
              const v = getValue(this, values[startIndex + i]);
              if (v && v !== noChange &&
                  (Array.isArray(v) || typeof v !== 'string' && v[Symbol.iterator])) {
                  for (const t of v) {
                      // TODO: we need to recursively call getValue into iterables...
                      text += t;
                  }
              }
              else {
                  text += v;
              }
          }
          return text + strings[l];
      }
      _equalToPreviousValues(values, startIndex) {
          for (let i = startIndex; i < startIndex + this.size; i++) {
              if (this._previousValues[i] !== values[i] ||
                  !isPrimitiveValue(values[i])) {
                  return false;
              }
          }
          return true;
      }
      setValue(values, startIndex) {
          if (this._equalToPreviousValues(values, startIndex)) {
              return;
          }
          const s = this.strings;
          let value;
          if (s.length === 2 && s[0] === '' && s[1] === '') {
              // An expression that occupies the whole attribute value will leave
              // leading and trailing empty strings.
              value = getValue(this, values[startIndex]);
              if (Array.isArray(value)) {
                  value = value.join('');
              }
          }
          else {
              value = this._interpolate(values, startIndex);
          }
          if (value !== noChange) {
              this.element.setAttribute(this.name, value);
          }
          this._previousValues = values;
      }
  }
  class NodePart {
      constructor(instance, startNode, endNode) {
          this.instance = instance;
          this.startNode = startNode;
          this.endNode = endNode;
          this._previousValue = undefined;
      }
      setValue(value) {
          value = getValue(this, value);
          if (value === noChange) {
              return;
          }
          if (isPrimitiveValue(value)) {
              // Handle primitive values
              // If the value didn't change, do nothing
              if (value === this._previousValue) {
                  return;
              }
              this._setText(value);
          }
          else if (value instanceof TemplateResult) {
              this._setTemplateResult(value);
          }
          else if (Array.isArray(value) || value[Symbol.iterator]) {
              this._setIterable(value);
          }
          else if (value instanceof Node) {
              this._setNode(value);
          }
          else if (value.then !== undefined) {
              this._setPromise(value);
          }
          else {
              // Fallback, will render the string representation
              this._setText(value);
          }
      }
      _insert(node) {
          this.endNode.parentNode.insertBefore(node, this.endNode);
      }
      _setNode(value) {
          if (this._previousValue === value) {
              return;
          }
          this.clear();
          this._insert(value);
          this._previousValue = value;
      }
      _setText(value) {
          const node = this.startNode.nextSibling;
          value = value === undefined ? '' : value;
          if (node === this.endNode.previousSibling &&
              node.nodeType === Node.TEXT_NODE) {
              // If we only have a single text node between the markers, we can just
              // set its value, rather than replacing it.
              // TODO(justinfagnani): Can we just check if _previousValue is
              // primitive?
              node.textContent = value;
          }
          else {
              this._setNode(document.createTextNode(value));
          }
          this._previousValue = value;
      }
      _setTemplateResult(value) {
          const template = this.instance._getTemplate(value);
          let instance;
          if (this._previousValue && this._previousValue.template === template) {
              instance = this._previousValue;
          }
          else {
              instance = new TemplateInstance(template, this.instance._partCallback, this.instance._getTemplate);
              this._setNode(instance._clone());
              this._previousValue = instance;
          }
          instance.update(value.values);
      }
      _setIterable(value) {
          // For an Iterable, we create a new InstancePart per item, then set its
          // value to the item. This is a little bit of overhead for every item in
          // an Iterable, but it lets us recurse easily and efficiently update Arrays
          // of TemplateResults that will be commonly returned from expressions like:
          // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
          // If _previousValue is an array, then the previous render was of an
          // iterable and _previousValue will contain the NodeParts from the previous
          // render. If _previousValue is not an array, clear this part and make a new
          // array for NodeParts.
          if (!Array.isArray(this._previousValue)) {
              this.clear();
              this._previousValue = [];
          }
          // Lets us keep track of how many items we stamped so we can clear leftover
          // items from a previous render
          const itemParts = this._previousValue;
          let partIndex = 0;
          for (const item of value) {
              // Try to reuse an existing part
              let itemPart = itemParts[partIndex];
              // If no existing part, create a new one
              if (itemPart === undefined) {
                  // If we're creating the first item part, it's startNode should be the
                  // container's startNode
                  let itemStart = this.startNode;
                  // If we're not creating the first part, create a new separator marker
                  // node, and fix up the previous part's endNode to point to it
                  if (partIndex > 0) {
                      const previousPart = itemParts[partIndex - 1];
                      itemStart = previousPart.endNode = document.createTextNode('');
                      this._insert(itemStart);
                  }
                  itemPart = new NodePart(this.instance, itemStart, this.endNode);
                  itemParts.push(itemPart);
              }
              itemPart.setValue(item);
              partIndex++;
          }
          if (partIndex === 0) {
              this.clear();
              this._previousValue = undefined;
          }
          else if (partIndex < itemParts.length) {
              const lastPart = itemParts[partIndex - 1];
              // Truncate the parts array so _previousValue reflects the current state
              itemParts.length = partIndex;
              this.clear(lastPart.endNode.previousSibling);
              lastPart.endNode = this.endNode;
          }
      }
      _setPromise(value) {
          this._previousValue = value;
          value.then((v) => {
              if (this._previousValue === value) {
                  this.setValue(v);
              }
          });
      }
      clear(startNode = this.startNode) {
          removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
      }
  }
  const defaultPartCallback = (instance, templatePart, node) => {
      if (templatePart.type === 'attribute') {
          return new AttributePart(instance, node, templatePart.name, templatePart.strings);
      }
      else if (templatePart.type === 'node') {
          return new NodePart(instance, node, node.nextSibling);
      }
      throw new Error(`Unknown part type ${templatePart.type}`);
  };
  /**
   * An instance of a `Template` that can be attached to the DOM and updated
   * with new values.
   */
  class TemplateInstance {
      constructor(template, partCallback, getTemplate) {
          this._parts = [];
          this.template = template;
          this._partCallback = partCallback;
          this._getTemplate = getTemplate;
      }
      update(values) {
          let valueIndex = 0;
          for (const part of this._parts) {
              if (!part) {
                  valueIndex++;
              }
              else if (part.size === undefined) {
                  part.setValue(values[valueIndex]);
                  valueIndex++;
              }
              else {
                  part.setValue(values, valueIndex);
                  valueIndex += part.size;
              }
          }
      }
      _clone() {
          // Clone the node, rather than importing it, to keep the fragment in the
          // template's document. This leaves the fragment inert so custom elements
          // won't upgrade until after the main document adopts the node.
          const fragment = this.template.element.content.cloneNode(true);
          const parts = this.template.parts;
          if (parts.length > 0) {
              // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be
              // null
              const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT |
                     NodeFilter.SHOW_TEXT */, null, false);
              let index = -1;
              for (let i = 0; i < parts.length; i++) {
                  const part = parts[i];
                  const partActive = isTemplatePartActive(part);
                  // An inactive part has no coresponding Template node.
                  if (partActive) {
                      while (index < part.index) {
                          index++;
                          walker.nextNode();
                      }
                  }
                  this._parts.push(partActive ? this._partCallback(this, part, walker.currentNode) : undefined);
              }
          }
          return fragment;
      }
  }
  /**
   * Removes nodes, starting from `startNode` (inclusive) to `endNode`
   * (exclusive), from `container`.
   */
  const removeNodes = (container, startNode, endNode = null) => {
      let node = startNode;
      while (node !== endNode) {
          const n = node.nextSibling;
          container.removeChild(node);
          node = n;
      }
  };

  /**
   * @license
   * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
   * This code may only be used under the BSD style license found at
   * http://polymer.github.io/LICENSE.txt
   * The complete set of authors may be found at
   * http://polymer.github.io/AUTHORS.txt
   * The complete set of contributors may be found at
   * http://polymer.github.io/CONTRIBUTORS.txt
   * Code distributed by Google as part of the polymer project is also
   * subject to an additional IP rights grant found at
   * http://polymer.github.io/PATENTS.txt
   */
  const walkerNodeFilter = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT |
      NodeFilter.SHOW_TEXT;
  /**
   * Removes the list of nodes from a Template safely. In addition to removing
   * nodes from the Template, the Template part indices are updated to match
   * the mutated Template DOM.
   *
   * As the template is walked the removal state is tracked and
   * part indices are adjusted as needed.
   *
   * div
   *   div#1 (remove) <-- start removing (removing node is div#1)
   *     div
   *       div#2 (remove)  <-- continue removing (removing node is still div#1)
   *         div
   * div <-- stop removing since previous sibling is the removing node (div#1, removed 4 nodes)
   */
  function removeNodesFromTemplate(template, nodesToRemove) {
      const { element: { content }, parts } = template;
      const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
      let partIndex = 0;
      let part = parts[0];
      let nodeIndex = -1;
      let removeCount = 0;
      const nodesToRemoveInTemplate = [];
      let currentRemovingNode = null;
      while (walker.nextNode()) {
          nodeIndex++;
          const node = walker.currentNode;
          // End removal if stepped past the removing node
          if (node.previousSibling === currentRemovingNode) {
              currentRemovingNode = null;
          }
          // A node to remove was found in the template
          if (nodesToRemove.has(node)) {
              nodesToRemoveInTemplate.push(node);
              // Track node we're removing
              if (currentRemovingNode === null) {
                  currentRemovingNode = node;
              }
          }
          // When removing, increment count by which to adjust subsequent part indices
          if (currentRemovingNode !== null) {
              removeCount++;
          }
          while (part !== undefined && part.index === nodeIndex) {
              // If part is in a removed node deactivate it by setting index to -1 or
              // adjust the index as needed.
              part.index = currentRemovingNode !== null ? -1 : part.index - removeCount;
              part = parts[++partIndex];
          }
      }
      nodesToRemoveInTemplate.forEach((n) => n.parentNode.removeChild(n));
  }
  const countNodes = (node) => {
      let count = 1;
      const walker = document.createTreeWalker(node, walkerNodeFilter, null, false);
      while (walker.nextNode()) {
          count++;
      }
      return count;
  };
  const nextActiveIndexInTemplateParts = (parts, startIndex = -1) => {
      for (let i = startIndex + 1; i < parts.length; i++) {
          const part = parts[i];
          if (isTemplatePartActive(part)) {
              return i;
          }
      }
      return -1;
  };
  /**
   * Inserts the given node into the Template, optionally before the given
   * refNode. In addition to inserting the node into the Template, the Template
   * part indices are updated to match the mutated Template DOM.
   */
  function insertNodeIntoTemplate(template, node, refNode = null) {
      const { element: { content }, parts } = template;
      // If there's no refNode, then put node at end of template.
      // No part indices need to be shifted in this case.
      if (refNode === null || refNode === undefined) {
          content.appendChild(node);
          return;
      }
      const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
      let partIndex = nextActiveIndexInTemplateParts(parts);
      let insertCount = 0;
      let walkerIndex = -1;
      while (walker.nextNode()) {
          walkerIndex++;
          const walkerNode = walker.currentNode;
          if (walkerNode === refNode) {
              refNode.parentNode.insertBefore(node, refNode);
              insertCount = countNodes(node);
          }
          while (partIndex !== -1 && parts[partIndex].index === walkerIndex) {
              // If we've inserted the node, simply adjust all subsequent parts
              if (insertCount > 0) {
                  while (partIndex !== -1) {
                      parts[partIndex].index += insertCount;
                      partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                  }
                  return;
              }
              partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
          }
      }
  }

  /**
   * @license
   * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
   * This code may only be used under the BSD style license found at
   * http://polymer.github.io/LICENSE.txt
   * The complete set of authors may be found at
   * http://polymer.github.io/AUTHORS.txt
   * The complete set of contributors may be found at
   * http://polymer.github.io/CONTRIBUTORS.txt
   * Code distributed by Google as part of the polymer project is also
   * subject to an additional IP rights grant found at
   * http://polymer.github.io/PATENTS.txt
   */
  // Get a key to lookup in `templateCaches`.
  const getTemplateCacheKey = (type, scopeName) => `${type}--${scopeName}`;
  /**
   * Template factory which scopes template DOM using ShadyCSS.
   * @param scopeName {string}
   */
  const shadyTemplateFactory = (scopeName) => (result) => {
      const cacheKey = getTemplateCacheKey(result.type, scopeName);
      let templateCache = templateCaches.get(cacheKey);
      if (templateCache === undefined) {
          templateCache = new Map();
          templateCaches.set(cacheKey, templateCache);
      }
      let template = templateCache.get(result.strings);
      if (template === undefined) {
          const element = result.getTemplateElement();
          if (typeof window.ShadyCSS === 'object') {
              window.ShadyCSS.prepareTemplateDom(element, scopeName);
          }
          template = new Template(result, element);
          templateCache.set(result.strings, template);
      }
      return template;
  };
  const TEMPLATE_TYPES = ['html', 'svg'];
  /**
   * Removes all style elements from Templates for the given scopeName.
   */
  function removeStylesFromLitTemplates(scopeName) {
      TEMPLATE_TYPES.forEach((type) => {
          const templates = templateCaches.get(getTemplateCacheKey(type, scopeName));
          if (templates !== undefined) {
              templates.forEach((template) => {
                  const { element: { content } } = template;
                  const styles = content.querySelectorAll('style');
                  removeNodesFromTemplate(template, new Set(Array.from(styles)));
              });
          }
      });
  }
  const shadyRenderSet = new Set();
  /**
   * For the given scope name, ensures that ShadyCSS style scoping is performed.
   * This is done just once per scope name so the fragment and template cannot
   * be modified.
   * (1) extracts styles from the rendered fragment and hands them to ShadyCSS
   * to be scoped and appended to the document
   * (2) removes style elements from all lit-html Templates for this scope name.
   *
   * Note, <style> elements can only be placed into templates for the
   * initial rendering of the scope. If <style> elements are included in templates
   * dynamically rendered to the scope (after the first scope render), they will
   * not be scoped and the <style> will be left in the template and rendered output.
   */
  const ensureStylesScoped = (fragment, template, scopeName) => {
      // only scope element template once per scope name
      if (!shadyRenderSet.has(scopeName)) {
          shadyRenderSet.add(scopeName);
          const styleTemplate = document.createElement('template');
          Array.from(fragment.querySelectorAll('style')).forEach((s) => {
              styleTemplate.content.appendChild(s);
          });
          window.ShadyCSS.prepareTemplateStyles(styleTemplate, scopeName);
          // Fix templates: note the expectation here is that the given `fragment`
          // has been generated from the given `template` which contains
          // the set of templates rendered into this scope.
          // It is only from this set of initial templates from which styles
          // will be scoped and removed.
          removeStylesFromLitTemplates(scopeName);
          // ApplyShim case
          if (window.ShadyCSS.nativeShadow) {
              const style = styleTemplate.content.querySelector('style');
              if (style !== null) {
                  // Insert style into rendered fragment
                  fragment.insertBefore(style, fragment.firstChild);
                  // Insert into lit-template (for subsequent renders)
                  insertNodeIntoTemplate(template, style.cloneNode(true), template.element.content.firstChild);
              }
          }
      }
  };
  // NOTE: We're copying code from lit-html's `render` method here.
  // We're doing this explicitly because the API for rendering templates is likely
  // to change in the near term.
  function render(result, container, scopeName) {
      const templateFactory = shadyTemplateFactory(scopeName);
      const template = templateFactory(result);
      let instance = container.__templateInstance;
      // Repeat render, just call update()
      if (instance !== undefined && instance.template === template &&
          instance._partCallback === result.partCallback) {
          instance.update(result.values);
          return;
      }
      // First render, create a new TemplateInstance and append it
      instance =
          new TemplateInstance(template, result.partCallback, templateFactory);
      container.__templateInstance = instance;
      const fragment = instance._clone();
      instance.update(result.values);
      const host = container instanceof ShadowRoot ?
          container.host :
          undefined;
      // If there's a shadow host, do ShadyCSS scoping...
      if (host !== undefined && typeof window.ShadyCSS === 'object') {
          ensureStylesScoped(fragment, template, scopeName);
          window.ShadyCSS.styleElement(host);
      }
      removeNodes(container, container.firstChild);
      container.appendChild(fragment);
  }

  /**
   * @license
   * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
   * This code may only be used under the BSD style license found at
   * http://polymer.github.io/LICENSE.txt
   * The complete set of authors may be found at
   * http://polymer.github.io/AUTHORS.txt
   * The complete set of contributors may be found at
   * http://polymer.github.io/CONTRIBUTORS.txt
   * Code distributed by Google as part of the polymer project is also
   * subject to an additional IP rights grant found at
   * http://polymer.github.io/PATENTS.txt
   */
  /**
   * Interprets a template literal as a lit-extended HTML template.
   */
  const html = (strings, ...values) => new TemplateResult(strings, values, 'html', extendedPartCallback);
  /**
   * A PartCallback which allows templates to set properties and declarative
   * event handlers.
   *
   * Properties are set by default, instead of attributes. Attribute names in
   * lit-html templates preserve case, so properties are case sensitive. If an
   * expression takes up an entire attribute value, then the property is set to
   * that value. If an expression is interpolated with a string or other
   * expressions then the property is set to the string result of the
   * interpolation.
   *
   * To set an attribute instead of a property, append a `$` suffix to the
   * attribute name.
   *
   * Example:
   *
   *     html`<button class$="primary">Buy Now</button>`
   *
   * To set an event handler, prefix the attribute name with `on-`:
   *
   * Example:
   *
   *     html`<button on-click=${(e)=> this.onClickHandler(e)}>Buy Now</button>`
   *
   */
  const extendedPartCallback = (instance, templatePart, node) => {
      if (templatePart.type === 'attribute') {
          if (templatePart.rawName.substr(0, 3) === 'on-') {
              const eventName = templatePart.rawName.slice(3);
              return new EventPart(instance, node, eventName);
          }
          const lastChar = templatePart.name.substr(templatePart.name.length - 1);
          if (lastChar === '$') {
              const name = templatePart.name.slice(0, -1);
              return new AttributePart(instance, node, name, templatePart.strings);
          }
          if (lastChar === '?') {
              const name = templatePart.name.slice(0, -1);
              return new BooleanAttributePart(instance, node, name, templatePart.strings);
          }
          return new PropertyPart(instance, node, templatePart.rawName, templatePart.strings);
      }
      return defaultPartCallback(instance, templatePart, node);
  };
  /**
   * Implements a boolean attribute, roughly as defined in the HTML
   * specification.
   *
   * If the value is truthy, then the attribute is present with a value of
   * ''. If the value is falsey, the attribute is removed.
   */
  class BooleanAttributePart extends AttributePart {
      setValue(values, startIndex) {
          const s = this.strings;
          if (s.length === 2 && s[0] === '' && s[1] === '') {
              const value = getValue(this, values[startIndex]);
              if (value === noChange) {
                  return;
              }
              if (value) {
                  this.element.setAttribute(this.name, '');
              }
              else {
                  this.element.removeAttribute(this.name);
              }
          }
          else {
              throw new Error('boolean attributes can only contain a single expression');
          }
      }
  }
  class PropertyPart extends AttributePart {
      setValue(values, startIndex) {
          const s = this.strings;
          let value;
          if (this._equalToPreviousValues(values, startIndex)) {
              return;
          }
          if (s.length === 2 && s[0] === '' && s[1] === '') {
              // An expression that occupies the whole attribute value will leave
              // leading and trailing empty strings.
              value = getValue(this, values[startIndex]);
          }
          else {
              // Interpolation, so interpolate
              value = this._interpolate(values, startIndex);
          }
          if (value !== noChange) {
              this.element[this.name] = value;
          }
          this._previousValues = values;
      }
  }
  class EventPart {
      constructor(instance, element, eventName) {
          this.instance = instance;
          this.element = element;
          this.eventName = eventName;
      }
      setValue(value) {
          const listener = getValue(this, value);
          if (listener === this._listener) {
              return;
          }
          if (listener == null) {
              this.element.removeEventListener(this.eventName, this);
          }
          else if (this._listener == null) {
              this.element.addEventListener(this.eventName, this);
          }
          this._listener = listener;
      }
      handleEvent(event) {
          if (typeof this._listener === 'function') {
              this._listener.call(this.element, event);
          }
          else if (typeof this._listener.handleEvent === 'function') {
              this._listener.handleEvent(event);
          }
      }
  }

  class LitElement extends PropertiesMixin(HTMLElement) {
      constructor() {
          super(...arguments);
          this.__renderComplete = null;
          this.__resolveRenderComplete = null;
          this.__isInvalid = false;
          this.__isChanging = false;
      }
      /**
       * Override which sets up element rendering by calling* `_createRoot`
       * and `_firstRendered`.
       */
      ready() {
          this._root = this._createRoot();
          super.ready();
          this._firstRendered();
      }
      /**
       * Called after the element DOM is rendered for the first time.
       * Implement to perform tasks after first rendering like capturing a
       * reference to a static node which must be directly manipulated.
       * This should not be commonly needed. For tasks which should be performed
       * before first render, use the element constructor.
       */
      _firstRendered() { }
      /**
       * Implement to customize where the element's template is rendered by
       * returning an element into which to render. By default this creates
       * a shadowRoot for the element. To render into the element's childNodes,
       * return `this`.
       * @returns {Element|DocumentFragment} Returns a node into which to render.
       */
      _createRoot() {
          return this.attachShadow({ mode: 'open' });
      }
      /**
       * Override which returns the value of `_shouldRender` which users
       * should implement to control rendering. If this method returns false,
       * _propertiesChanged will not be called and no rendering will occur even
       * if property values change or `_requestRender` is called.
       * @param _props Current element properties
       * @param _changedProps Changing element properties
       * @param _prevProps Previous element properties
       * @returns {boolean} Default implementation always returns true.
       */
      _shouldPropertiesChange(_props, _changedProps, _prevProps) {
          const shouldRender = this._shouldRender(_props, _changedProps, _prevProps);
          if (!shouldRender && this.__resolveRenderComplete) {
              this.__resolveRenderComplete(false);
          }
          return shouldRender;
      }
      /**
       * Implement to control if rendering should occur when property values
       * change or `_requestRender` is called. By default, this method always
       * returns true, but this can be customized as an optimization to avoid
       * rendering work when changes occur which should not be rendered.
       * @param _props Current element properties
       * @param _changedProps Changing element properties
       * @param _prevProps Previous element properties
       * @returns {boolean} Default implementation always returns true.
       */
      _shouldRender(_props, _changedProps, _prevProps) {
          return true;
      }
      /**
       * Override which performs element rendering by calling
       * `_render`, `_applyRender`, and finally `_didRender`.
       * @param props Current element properties
       * @param changedProps Changing element properties
       * @param prevProps Previous element properties
       */
      _propertiesChanged(props, changedProps, prevProps) {
          super._propertiesChanged(props, changedProps, prevProps);
          const result = this._render(props);
          if (result && this._root !== undefined) {
              this._applyRender(result, this._root);
          }
          this._didRender(props, changedProps, prevProps);
          if (this.__resolveRenderComplete) {
              this.__resolveRenderComplete(true);
          }
      }
      _flushProperties() {
          this.__isChanging = true;
          this.__isInvalid = false;
          super._flushProperties();
          this.__isChanging = false;
      }
      /**
       * Override which warns when a user attempts to change a property during
       * the rendering lifecycle. This is an anti-pattern and should be avoided.
       * @param property {string}
       * @param value {any}
       * @param old {any}
       */
      _shouldPropertyChange(property, value, old) {
          const change = super._shouldPropertyChange(property, value, old);
          if (change && this.__isChanging) {
              console.trace(`Setting properties in response to other properties changing ` +
                  `considered harmful. Setting '${property}' from ` +
                  `'${this._getProperty(property)}' to '${value}'.`);
          }
          return change;
      }
      /**
       * Implement to describe the DOM which should be rendered in the element.
       * Ideally, the implementation is a pure function using only props to describe
       * the element template. The implementation must a `lit-html` TemplateResult.
       * By default this template is rendered into the element's shadowRoot.
       * This can be customized by implementing `_createRoot`. This method must be
       * implemented.
       * @param {*} _props Current element properties
       * @returns {TemplateResult} Must return a lit-html TemplateResult.
       */
      _render(_props) {
          throw new Error('_render() not implemented');
      }
      /**
       * Renders the given lit-html template `result` into the given `node`.
       * Implement to customize the way rendering is applied. This is should not
       * typically be needed and is provided for advanced use cases.
       * @param result {TemplateResult} `lit-html` template result to render
       * @param node {Element|DocumentFragment} node into which to render
       */
      _applyRender(result, node) {
          render(result, node, this.localName);
      }
      /**
       * Called after element DOM has been rendered. Implement to
       * directly control rendered DOM. Typically this is not needed as `lit-html`
       * can be used in the `_render` method to set properties, attributes, and
       * event listeners. However, it is sometimes useful for calling methods on
       * rendered elements, like calling `focus()` on an element to focus it.
       * @param _props Current element properties
       * @param _changedProps Changing element properties
       * @param _prevProps Previous element properties
       */
      _didRender(_props, _changedProps, _prevProps) { }
      /**
       * Call to request the element to asynchronously re-render regardless
       * of whether or not any property changes are pending.
       */
      _requestRender() { this._invalidateProperties(); }
      /**
       * Override which provides tracking of invalidated state.
       */
      _invalidateProperties() {
          this.__isInvalid = true;
          super._invalidateProperties();
      }
      /**
       * Returns a promise which resolves after the element next renders.
       * The promise resolves to `true` if the element rendered and `false` if the
       * element did not render.
       * This is useful when users (e.g. tests) need to react to the rendered state
       * of the element after a change is made.
       * This can also be useful in event handlers if it is desireable to wait
       * to send an event until after rendering. If possible implement the
       * `_didRender` method to directly respond to rendering within the
       * rendering lifecycle.
       */
      get renderComplete() {
          if (!this.__renderComplete) {
              this.__renderComplete = new Promise((resolve) => {
                  this.__resolveRenderComplete =
                      (value) => {
                          this.__resolveRenderComplete = this.__renderComplete = null;
                          resolve(value);
                      };
              });
              if (!this.__isInvalid && this.__resolveRenderComplete) {
                  Promise.resolve().then(() => this.__resolveRenderComplete(false));
              }
          }
          return this.__renderComplete;
      }
  }

  /**
  @license
  Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
  This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
  The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
  The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
  Code distributed by Google as part of the polymer project is also
  subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
  */
  const connect = (store) => (baseElement) => class extends baseElement {
      connectedCallback() {
          // Connect the element to the store.
          this.__storeUnsubscribe = store.subscribe(() => this._stateChanged(store.getState()));
          this._stateChanged(store.getState());
          if (super.connectedCallback) {
              super.connectedCallback();
          }
      }
      disconnectedCallback() {
          this.__storeUnsubscribe();
          if (super.disconnectedCallback) {
              super.disconnectedCallback();
          }
      }
      // This is called every time something is updated in the store.
      _stateChanged(_state) {
          throw new Error('_stateChanged() not implemented');
      }
  };

  function symbolObservablePonyfill(root) {
  	var result;
  	var Symbol = root.Symbol;

  	if (typeof Symbol === 'function') {
  		if (Symbol.observable) {
  			result = Symbol.observable;
  		} else {
  			result = Symbol('observable');
  			Symbol.observable = result;
  		}
  	} else {
  		result = '@@observable';
  	}

  	return result;
  }

  /* global window */

  var root;

  if (typeof self !== 'undefined') {
    root = self;
  } else if (typeof window !== 'undefined') {
    root = window;
  } else if (typeof global !== 'undefined') {
    root = global;
  } else if (typeof module !== 'undefined') {
    root = module;
  } else {
    root = Function('return this')();
  }

  var result = symbolObservablePonyfill(root);

  /**
   * These are private action types reserved by Redux.
   * For any unknown actions, you must return the current state.
   * If the current state is undefined, you must return the initial state.
   * Do not reference these action types directly in your code.
   */
  var randomString = function randomString() {
    return Math.random().toString(36).substring(7).split('').join('.');
  };

  var ActionTypes = {
    INIT: "@@redux/INIT" + randomString(),
    REPLACE: "@@redux/REPLACE" + randomString(),
    PROBE_UNKNOWN_ACTION: function PROBE_UNKNOWN_ACTION() {
      return "@@redux/PROBE_UNKNOWN_ACTION" + randomString();
    }
  };

  /**
   * @param {any} obj The object to inspect.
   * @returns {boolean} True if the argument appears to be a plain object.
   */
  function isPlainObject(obj) {
    if (typeof obj !== 'object' || obj === null) return false;
    var proto = obj;

    while (Object.getPrototypeOf(proto) !== null) {
      proto = Object.getPrototypeOf(proto);
    }

    return Object.getPrototypeOf(obj) === proto;
  }

  /**
   * Creates a Redux store that holds the state tree.
   * The only way to change the data in the store is to call `dispatch()` on it.
   *
   * There should only be a single store in your app. To specify how different
   * parts of the state tree respond to actions, you may combine several reducers
   * into a single reducer function by using `combineReducers`.
   *
   * @param {Function} reducer A function that returns the next state tree, given
   * the current state tree and the action to handle.
   *
   * @param {any} [preloadedState] The initial state. You may optionally specify it
   * to hydrate the state from the server in universal apps, or to restore a
   * previously serialized user session.
   * If you use `combineReducers` to produce the root reducer function, this must be
   * an object with the same shape as `combineReducers` keys.
   *
   * @param {Function} [enhancer] The store enhancer. You may optionally specify it
   * to enhance the store with third-party capabilities such as middleware,
   * time travel, persistence, etc. The only store enhancer that ships with Redux
   * is `applyMiddleware()`.
   *
   * @returns {Store} A Redux store that lets you read the state, dispatch actions
   * and subscribe to changes.
   */

  function createStore(reducer, preloadedState, enhancer) {
    var _ref2;

    if (typeof preloadedState === 'function' && typeof enhancer === 'function' || typeof enhancer === 'function' && typeof arguments[3] === 'function') {
      throw new Error('It looks like you are passing several store enhancers to ' + 'createStore(). This is not supported. Instead, compose them ' + 'together to a single function.');
    }

    if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
      enhancer = preloadedState;
      preloadedState = undefined;
    }

    if (typeof enhancer !== 'undefined') {
      if (typeof enhancer !== 'function') {
        throw new Error('Expected the enhancer to be a function.');
      }

      return enhancer(createStore)(reducer, preloadedState);
    }

    if (typeof reducer !== 'function') {
      throw new Error('Expected the reducer to be a function.');
    }

    var currentReducer = reducer;
    var currentState = preloadedState;
    var currentListeners = [];
    var nextListeners = currentListeners;
    var isDispatching = false;
    /**
     * This makes a shallow copy of currentListeners so we can use
     * nextListeners as a temporary list while dispatching.
     *
     * This prevents any bugs around consumers calling
     * subscribe/unsubscribe in the middle of a dispatch.
     */

    function ensureCanMutateNextListeners() {
      if (nextListeners === currentListeners) {
        nextListeners = currentListeners.slice();
      }
    }
    /**
     * Reads the state tree managed by the store.
     *
     * @returns {any} The current state tree of your application.
     */


    function getState() {
      if (isDispatching) {
        throw new Error('You may not call store.getState() while the reducer is executing. ' + 'The reducer has already received the state as an argument. ' + 'Pass it down from the top reducer instead of reading it from the store.');
      }

      return currentState;
    }
    /**
     * Adds a change listener. It will be called any time an action is dispatched,
     * and some part of the state tree may potentially have changed. You may then
     * call `getState()` to read the current state tree inside the callback.
     *
     * You may call `dispatch()` from a change listener, with the following
     * caveats:
     *
     * 1. The subscriptions are snapshotted just before every `dispatch()` call.
     * If you subscribe or unsubscribe while the listeners are being invoked, this
     * will not have any effect on the `dispatch()` that is currently in progress.
     * However, the next `dispatch()` call, whether nested or not, will use a more
     * recent snapshot of the subscription list.
     *
     * 2. The listener should not expect to see all state changes, as the state
     * might have been updated multiple times during a nested `dispatch()` before
     * the listener is called. It is, however, guaranteed that all subscribers
     * registered before the `dispatch()` started will be called with the latest
     * state by the time it exits.
     *
     * @param {Function} listener A callback to be invoked on every dispatch.
     * @returns {Function} A function to remove this change listener.
     */


    function subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new Error('Expected the listener to be a function.');
      }

      if (isDispatching) {
        throw new Error('You may not call store.subscribe() while the reducer is executing. ' + 'If you would like to be notified after the store has been updated, subscribe from a ' + 'component and invoke store.getState() in the callback to access the latest state. ' + 'See https://redux.js.org/api-reference/store#subscribelistener for more details.');
      }

      var isSubscribed = true;
      ensureCanMutateNextListeners();
      nextListeners.push(listener);
      return function unsubscribe() {
        if (!isSubscribed) {
          return;
        }

        if (isDispatching) {
          throw new Error('You may not unsubscribe from a store listener while the reducer is executing. ' + 'See https://redux.js.org/api-reference/store#subscribelistener for more details.');
        }

        isSubscribed = false;
        ensureCanMutateNextListeners();
        var index = nextListeners.indexOf(listener);
        nextListeners.splice(index, 1);
        currentListeners = null;
      };
    }
    /**
     * Dispatches an action. It is the only way to trigger a state change.
     *
     * The `reducer` function, used to create the store, will be called with the
     * current state tree and the given `action`. Its return value will
     * be considered the **next** state of the tree, and the change listeners
     * will be notified.
     *
     * The base implementation only supports plain object actions. If you want to
     * dispatch a Promise, an Observable, a thunk, or something else, you need to
     * wrap your store creating function into the corresponding middleware. For
     * example, see the documentation for the `redux-thunk` package. Even the
     * middleware will eventually dispatch plain object actions using this method.
     *
     * @param {Object} action A plain object representing “what changed”. It is
     * a good idea to keep actions serializable so you can record and replay user
     * sessions, or use the time travelling `redux-devtools`. An action must have
     * a `type` property which may not be `undefined`. It is a good idea to use
     * string constants for action types.
     *
     * @returns {Object} For convenience, the same action object you dispatched.
     *
     * Note that, if you use a custom middleware, it may wrap `dispatch()` to
     * return something else (for example, a Promise you can await).
     */


    function dispatch(action) {
      if (!isPlainObject(action)) {
        throw new Error('Actions must be plain objects. ' + 'Use custom middleware for async actions.');
      }

      if (typeof action.type === 'undefined') {
        throw new Error('Actions may not have an undefined "type" property. ' + 'Have you misspelled a constant?');
      }

      if (isDispatching) {
        throw new Error('Reducers may not dispatch actions.');
      }

      try {
        isDispatching = true;
        currentState = currentReducer(currentState, action);
      } finally {
        isDispatching = false;
      }

      var listeners = currentListeners = nextListeners;

      for (var i = 0; i < listeners.length; i++) {
        var listener = listeners[i];
        listener();
      }

      return action;
    }
    /**
     * Replaces the reducer currently used by the store to calculate the state.
     *
     * You might need this if your app implements code splitting and you want to
     * load some of the reducers dynamically. You might also need this if you
     * implement a hot reloading mechanism for Redux.
     *
     * @param {Function} nextReducer The reducer for the store to use instead.
     * @returns {void}
     */


    function replaceReducer(nextReducer) {
      if (typeof nextReducer !== 'function') {
        throw new Error('Expected the nextReducer to be a function.');
      }

      currentReducer = nextReducer; // This action has a similiar effect to ActionTypes.INIT.
      // Any reducers that existed in both the new and old rootReducer
      // will receive the previous state. This effectively populates
      // the new state tree with any relevant data from the old one.

      dispatch({
        type: ActionTypes.REPLACE
      });
    }
    /**
     * Interoperability point for observable/reactive libraries.
     * @returns {observable} A minimal observable of state changes.
     * For more information, see the observable proposal:
     * https://github.com/tc39/proposal-observable
     */


    function observable() {
      var _ref;

      var outerSubscribe = subscribe;
      return _ref = {
        /**
         * The minimal observable subscription method.
         * @param {Object} observer Any object that can be used as an observer.
         * The observer object should have a `next` method.
         * @returns {subscription} An object with an `unsubscribe` method that can
         * be used to unsubscribe the observable from the store, and prevent further
         * emission of values from the observable.
         */
        subscribe: function subscribe(observer) {
          if (typeof observer !== 'object' || observer === null) {
            throw new TypeError('Expected the observer to be an object.');
          }

          function observeState() {
            if (observer.next) {
              observer.next(getState());
            }
          }

          observeState();
          var unsubscribe = outerSubscribe(observeState);
          return {
            unsubscribe: unsubscribe
          };
        }
      }, _ref[result] = function () {
        return this;
      }, _ref;
    } // When a store is created, an "INIT" action is dispatched so that every
    // reducer returns their initial state. This effectively populates
    // the initial state tree.


    dispatch({
      type: ActionTypes.INIT
    });
    return _ref2 = {
      dispatch: dispatch,
      subscribe: subscribe,
      getState: getState,
      replaceReducer: replaceReducer
    }, _ref2[result] = observable, _ref2;
  }

  function bindActionCreator(actionCreator, dispatch) {
    return function () {
      return dispatch(actionCreator.apply(this, arguments));
    };
  }
  /**
   * Turns an object whose values are action creators, into an object with the
   * same keys, but with every function wrapped into a `dispatch` call so they
   * may be invoked directly. This is just a convenience method, as you can call
   * `store.dispatch(MyActionCreators.doSomething())` yourself just fine.
   *
   * For convenience, you can also pass an action creator as the first argument,
   * and get a dispatch wrapped function in return.
   *
   * @param {Function|Object} actionCreators An object whose values are action
   * creator functions. One handy way to obtain it is to use ES6 `import * as`
   * syntax. You may also pass a single function.
   *
   * @param {Function} dispatch The `dispatch` function available on your Redux
   * store.
   *
   * @returns {Function|Object} The object mimicking the original object, but with
   * every action creator wrapped into the `dispatch` call. If you passed a
   * function as `actionCreators`, the return value will also be a single
   * function.
   */


  function bindActionCreators(actionCreators, dispatch) {
    if (typeof actionCreators === 'function') {
      return bindActionCreator(actionCreators, dispatch);
    }

    if (typeof actionCreators !== 'object' || actionCreators === null) {
      throw new Error("bindActionCreators expected an object or a function, instead received " + (actionCreators === null ? 'null' : typeof actionCreators) + ". " + "Did you write \"import ActionCreators from\" instead of \"import * as ActionCreators from\"?");
    }

    var boundActionCreators = {};

    for (var key in actionCreators) {
      var actionCreator = actionCreators[key];

      if (typeof actionCreator === 'function') {
        boundActionCreators[key] = bindActionCreator(actionCreator, dispatch);
      }
    }

    return boundActionCreators;
  }

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);

    if (Object.getOwnPropertySymbols) {
      keys.push.apply(keys, Object.getOwnPropertySymbols(object));
    }

    if (enumerableOnly) keys = keys.filter(function (sym) {
      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
    });
    return keys;
  }

  function _objectSpread2(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i] != null ? arguments[i] : {};

      if (i % 2) {
        ownKeys(source, true).forEach(function (key) {
          _defineProperty(target, key, source[key]);
        });
      } else if (Object.getOwnPropertyDescriptors) {
        Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
      } else {
        ownKeys(source).forEach(function (key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
      }
    }

    return target;
  }

  /**
   * Composes single-argument functions from right to left. The rightmost
   * function can take multiple arguments as it provides the signature for
   * the resulting composite function.
   *
   * @param {...Function} funcs The functions to compose.
   * @returns {Function} A function obtained by composing the argument functions
   * from right to left. For example, compose(f, g, h) is identical to doing
   * (...args) => f(g(h(...args))).
   */
  function compose() {
    for (var _len = arguments.length, funcs = new Array(_len), _key = 0; _key < _len; _key++) {
      funcs[_key] = arguments[_key];
    }

    if (funcs.length === 0) {
      return function (arg) {
        return arg;
      };
    }

    if (funcs.length === 1) {
      return funcs[0];
    }

    return funcs.reduce(function (a, b) {
      return function () {
        return a(b.apply(void 0, arguments));
      };
    });
  }

  /**
   * Creates a store enhancer that applies middleware to the dispatch method
   * of the Redux store. This is handy for a variety of tasks, such as expressing
   * asynchronous actions in a concise manner, or logging every action payload.
   *
   * See `redux-thunk` package as an example of the Redux middleware.
   *
   * Because middleware is potentially asynchronous, this should be the first
   * store enhancer in the composition chain.
   *
   * Note that each middleware will be given the `dispatch` and `getState` functions
   * as named arguments.
   *
   * @param {...Function} middlewares The middleware chain to be applied.
   * @returns {Function} A store enhancer applying the middleware.
   */

  function applyMiddleware() {
    for (var _len = arguments.length, middlewares = new Array(_len), _key = 0; _key < _len; _key++) {
      middlewares[_key] = arguments[_key];
    }

    return function (createStore) {
      return function () {
        var store = createStore.apply(void 0, arguments);

        var _dispatch = function dispatch() {
          throw new Error('Dispatching while constructing your middleware is not allowed. ' + 'Other middleware would not be applied to this dispatch.');
        };

        var middlewareAPI = {
          getState: store.getState,
          dispatch: function dispatch() {
            return _dispatch.apply(void 0, arguments);
          }
        };
        var chain = middlewares.map(function (middleware) {
          return middleware(middlewareAPI);
        });
        _dispatch = compose.apply(void 0, chain)(store.dispatch);
        return _objectSpread2({}, store, {
          dispatch: _dispatch
        });
      };
    };
  }

  function createThunkMiddleware(extraArgument) {
    return function (_ref) {
      var dispatch = _ref.dispatch,
          getState = _ref.getState;
      return function (next) {
        return function (action) {
          if (typeof action === 'function') {
            return action(dispatch, getState, extraArgument);
          }

          return next(action);
        };
      };
    };
  }

  var thunk = createThunkMiddleware();
  thunk.withExtraArgument = createThunkMiddleware;

  var validKinds = ['N', 'E', 'A', 'D'];

  // nodejs compatible on server side and in the browser.
  function inherits (ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  }

  function Diff (kind, path) {
    Object.defineProperty(this, 'kind', {
      value: kind,
      enumerable: true
    });
    if (path && path.length) {
      Object.defineProperty(this, 'path', {
        value: path,
        enumerable: true
      });
    }
  }

  function DiffEdit (path, origin, value) {
    DiffEdit.super_.call(this, 'E', path);
    Object.defineProperty(this, 'lhs', {
      value: origin,
      enumerable: true
    });
    Object.defineProperty(this, 'rhs', {
      value: value,
      enumerable: true
    });
  }
  inherits(DiffEdit, Diff);

  function DiffNew (path, value) {
    DiffNew.super_.call(this, 'N', path);
    Object.defineProperty(this, 'rhs', {
      value: value,
      enumerable: true
    });
  }
  inherits(DiffNew, Diff);

  function DiffDeleted (path, value) {
    DiffDeleted.super_.call(this, 'D', path);
    Object.defineProperty(this, 'lhs', {
      value: value,
      enumerable: true
    });
  }
  inherits(DiffDeleted, Diff);

  function DiffArray (path, index, item) {
    DiffArray.super_.call(this, 'A', path);
    Object.defineProperty(this, 'index', {
      value: index,
      enumerable: true
    });
    Object.defineProperty(this, 'item', {
      value: item,
      enumerable: true
    });
  }
  inherits(DiffArray, Diff);

  function arrayRemove (arr, from, to) {
    var rest = arr.slice((to || from) + 1 || arr.length);
    arr.length = from < 0 ? arr.length + from : from;
    arr.push.apply(arr, rest);
    return arr;
  }

  function realTypeOf (subject) {
    var type = typeof subject;
    if (type !== 'object') {
      return type;
    }

    if (subject === Math) {
      return 'math';
    } else if (subject === null) {
      return 'null';
    } else if (Array.isArray(subject)) {
      return 'array';
    } else if (Object.prototype.toString.call(subject) === '[object Date]') {
      return 'date';
    } else if (typeof subject.toString === 'function' && /^\/.*\//.test(subject.toString())) {
      return 'regexp';
    }
    return 'object';
  }

  // http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
  function hashThisString (string) {
    var hash = 0;
    if (string.length === 0) { return hash; }
    for (var i = 0; i < string.length; i++) {
      var char = string.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  // Gets a hash of the given object in an array order-independent fashion
  // also object key order independent (easier since they can be alphabetized)
  function getOrderIndependentHash (object) {
    var accum = 0;
    var type = realTypeOf(object);

    if (type === 'array') {
      object.forEach(function (item) {
        // Addition is commutative so this is order indep
        accum += getOrderIndependentHash(item);
      });

      var arrayString = '[type: array, hash: ' + accum + ']';
      return accum + hashThisString(arrayString);
    }

    if (type === 'object') {
      for (var key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          var keyValueString = '[ type: object, key: ' + key + ', value hash: ' + getOrderIndependentHash(object[key]) + ']';
          accum += hashThisString(keyValueString);
        }
      }

      return accum;
    }

    // Non object, non array...should be good?
    var stringToHash = '[ type: ' + type + ' ; value: ' + object + ']';
    return accum + hashThisString(stringToHash);
  }

  function deepDiff (lhs, rhs, changes, prefilter, path, key, stack, orderIndependent) {
    changes = changes || [];
    path = path || [];
    stack = stack || [];
    var currentPath = path.slice(0);
    if (typeof key !== 'undefined' && key !== null) {
      if (prefilter) {
        if (typeof (prefilter) === 'function' && prefilter(currentPath, key)) {
          return;
        } else if (typeof (prefilter) === 'object') {
          if (prefilter.prefilter && prefilter.prefilter(currentPath, key)) {
            return;
          }
          if (prefilter.normalize) {
            var alt = prefilter.normalize(currentPath, key, lhs, rhs);
            if (alt) {
              lhs = alt[0];
              rhs = alt[1];
            }
          }
        }
      }
      currentPath.push(key);
    }

    // Use string comparison for regexes
    if (realTypeOf(lhs) === 'regexp' && realTypeOf(rhs) === 'regexp') {
      lhs = lhs.toString();
      rhs = rhs.toString();
    }

    var ltype = typeof lhs;
    var rtype = typeof rhs;
    var i, j, k, other;

    var ldefined = ltype !== 'undefined' ||
      (stack && (stack.length > 0) && stack[stack.length - 1].lhs &&
        Object.getOwnPropertyDescriptor(stack[stack.length - 1].lhs, key));
    var rdefined = rtype !== 'undefined' ||
      (stack && (stack.length > 0) && stack[stack.length - 1].rhs &&
        Object.getOwnPropertyDescriptor(stack[stack.length - 1].rhs, key));

    if (!ldefined && rdefined) {
      changes.push(new DiffNew(currentPath, rhs));
    } else if (!rdefined && ldefined) {
      changes.push(new DiffDeleted(currentPath, lhs));
    } else if (realTypeOf(lhs) !== realTypeOf(rhs)) {
      changes.push(new DiffEdit(currentPath, lhs, rhs));
    } else if (realTypeOf(lhs) === 'date' && (lhs - rhs) !== 0) {
      changes.push(new DiffEdit(currentPath, lhs, rhs));
    } else if (ltype === 'object' && lhs !== null && rhs !== null) {
      for (i = stack.length - 1; i > -1; --i) {
        if (stack[i].lhs === lhs) {
          other = true;
          break;
        }
      }
      if (!other) {
        stack.push({ lhs: lhs, rhs: rhs });
        if (Array.isArray(lhs)) {
          // If order doesn't matter, we need to sort our arrays
          if (orderIndependent) {
            lhs.sort(function (a, b) {
              return getOrderIndependentHash(a) - getOrderIndependentHash(b);
            });

            rhs.sort(function (a, b) {
              return getOrderIndependentHash(a) - getOrderIndependentHash(b);
            });
          }
          i = rhs.length - 1;
          j = lhs.length - 1;
          while (i > j) {
            changes.push(new DiffArray(currentPath, i, new DiffNew(undefined, rhs[i--])));
          }
          while (j > i) {
            changes.push(new DiffArray(currentPath, j, new DiffDeleted(undefined, lhs[j--])));
          }
          for (; i >= 0; --i) {
            deepDiff(lhs[i], rhs[i], changes, prefilter, currentPath, i, stack, orderIndependent);
          }
        } else {
          var akeys = Object.keys(lhs);
          var pkeys = Object.keys(rhs);
          for (i = 0; i < akeys.length; ++i) {
            k = akeys[i];
            other = pkeys.indexOf(k);
            if (other >= 0) {
              deepDiff(lhs[k], rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent);
              pkeys[other] = null;
            } else {
              deepDiff(lhs[k], undefined, changes, prefilter, currentPath, k, stack, orderIndependent);
            }
          }
          for (i = 0; i < pkeys.length; ++i) {
            k = pkeys[i];
            if (k) {
              deepDiff(undefined, rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent);
            }
          }
        }
        stack.length = stack.length - 1;
      } else if (lhs !== rhs) {
        // lhs is contains a cycle at this element and it differs from rhs
        changes.push(new DiffEdit(currentPath, lhs, rhs));
      }
    } else if (lhs !== rhs) {
      if (!(ltype === 'number' && isNaN(lhs) && isNaN(rhs))) {
        changes.push(new DiffEdit(currentPath, lhs, rhs));
      }
    }
  }

  function observableDiff (lhs, rhs, observer, prefilter, orderIndependent) {
    var changes = [];
    deepDiff(lhs, rhs, changes, prefilter, null, null, null, orderIndependent);
    if (observer) {
      for (var i = 0; i < changes.length; ++i) {
        observer(changes[i]);
      }
    }
    return changes;
  }

  function orderIndependentDeepDiff (lhs, rhs, changes, prefilter, path, key, stack) {
    return deepDiff(lhs, rhs, changes, prefilter, path, key, stack, true);
  }

  function accumulateDiff (lhs, rhs, prefilter, accum) {
    var observer = (accum)
      ? function (difference) {
        if (difference) {
          accum.push(difference);
        }
      } : undefined;
    var changes = observableDiff(lhs, rhs, observer, prefilter);
    return (accum) || ((changes.length) ? changes : undefined);
  }

  function accumulateOrderIndependentDiff (lhs, rhs, prefilter, accum) {
    var observer = (accum)
      ? function (difference) {
        if (difference) {
          accum.push(difference);
        }
      } : undefined;
    var changes = observableDiff(lhs, rhs, observer, prefilter, true);
    return (accum) || ((changes.length) ? changes : undefined);
  }

  function applyArrayChange (arr, index, change) {
    if (change.path && change.path.length) {
      var it = arr[index];
      var i;
      var u = change.path.length - 1;
      for (i = 0; i < u; i++) {
        it = it[change.path[i]];
      }
      switch (change.kind) {
        case 'A':
          applyArrayChange(it[change.path[i]], change.index, change.item);
          break;
        case 'D':
          delete it[change.path[i]];
          break;
        case 'E':
        case 'N':
          it[change.path[i]] = change.rhs;
          break;
      }
    } else {
      switch (change.kind) {
        case 'A':
          applyArrayChange(arr[index], change.index, change.item);
          break;
        case 'D':
          arr = arrayRemove(arr, index);
          break;
        case 'E':
        case 'N':
          arr[index] = change.rhs;
          break;
      }
    }
    return arr;
  }

  function applyChange (target, source, change) {
    if (typeof change === 'undefined' && source && ~validKinds.indexOf(source.kind)) {
      change = source;
    }
    if (target && change && change.kind) {
      var it = target;
      var i = -1;
      var last = change.path ? change.path.length - 1 : 0;
      while (++i < last) {
        if (typeof it[change.path[i]] === 'undefined') {
          it[change.path[i]] = (typeof change.path[i + 1] !== 'undefined' && typeof change.path[i + 1] === 'number') ? [] : {};
        }
        it = it[change.path[i]];
      }
      switch (change.kind) {
        case 'A':
          if (change.path && typeof it[change.path[i]] === 'undefined') {
            it[change.path[i]] = [];
          }
          applyArrayChange(change.path ? it[change.path[i]] : it, change.index, change.item);
          break;
        case 'D':
          delete it[change.path[i]];
          break;
        case 'E':
        case 'N':
          it[change.path[i]] = change.rhs;
          break;
      }
    }
  }

  function revertArrayChange (arr, index, change) {
    if (change.path && change.path.length) {
      // the structure of the object at the index has changed...
      var it = arr[index];
      var i;
      var u = change.path.length - 1;
      for (i = 0; i < u; i++) {
        it = it[change.path[i]];
      }
      switch (change.kind) {
        case 'A':
          revertArrayChange(it[change.path[i]], change.index, change.item);
          break;
        case 'D':
          it[change.path[i]] = change.lhs;
          break;
        case 'E':
          it[change.path[i]] = change.lhs;
          break;
        case 'N':
          delete it[change.path[i]];
          break;
      }
    } else {
      // the array item is different...
      switch (change.kind) {
        case 'A':
          revertArrayChange(arr[index], change.index, change.item);
          break;
        case 'D':
          arr[index] = change.lhs;
          break;
        case 'E':
          arr[index] = change.lhs;
          break;
        case 'N':
          arr = arrayRemove(arr, index);
          break;
      }
    }
    return arr;
  }

  function revertChange (target, source, change) {
    if (target && source && change && change.kind) {
      var it = target;
      var i;
      var u = change.path.length - 1;
      for (i = 0; i < u; i++) {
        if (typeof it[change.path[i]] === 'undefined') {
          it[change.path[i]] = {};
        }
        it = it[change.path[i]];
      }
      switch (change.kind) {
        case 'A':
          // Array was modified...
          // it will be an array...
          revertArrayChange(it[change.path[i]], change.index, change.item);
          break;
        case 'D':
          // Item was deleted...
          it[change.path[i]] = change.lhs;
          break;
        case 'E':
          // Item was edited...
          it[change.path[i]] = change.lhs;
          break;
        case 'N':
          // Item is new...
          delete it[change.path[i]];
          break;
      }
    }
  }

  function applyDiff (target, source, filter) {
    if (target && source) {
      var onChange = function (change) {
        if (!filter || filter(target, source, change)) {
          applyChange(target, source, change);
        }
      };
      observableDiff(target, source, onChange);
    }
  }

  Object.defineProperties(accumulateDiff, {

    diff: {
      value: accumulateDiff,
      enumerable: true
    },
    orderIndependentDiff: {
      value: accumulateOrderIndependentDiff,
      enumerable: true
    },
    observableDiff: {
      value: observableDiff,
      enumerable: true
    },
    orderIndependentObservableDiff: {
      value: orderIndependentDeepDiff,
      enumerable: true
    },
    orderIndepHash: {
      value: getOrderIndependentHash,
      enumerable: true
    },
    applyDiff: {
      value: applyDiff,
      enumerable: true
    },
    applyChange: {
      value: applyChange,
      enumerable: true
    },
    revertChange: {
      value: revertChange,
      enumerable: true
    },
    isConflict: {
      value: function () {
        return typeof $conflict !== 'undefined';
      },
      enumerable: true
    }
  });

  const AUTO_VERIFY = 'AUTO_VERIFY';
  const INITIALIZE = 'INITIALIZE';
  const UPDATE_CERTIFICATE_DEFINITION = 'UPDATE_CERTIFICATE_DEFINITION';
  const UPLOAD_CERTIFICATE_DEFINITION = 'UPLOAD_CERTIFICATE_DEFINITION';
  const RESET_CERTIFICATE_DEFINITION = 'RESET_CERTIFICATE_DEFINITION';
  const UPDATE_CERTIFICATE_URL = 'UPDATE_CERTIFICATE_URL';
  const VERIFY_CERTIFICATE = 'VERIFY_CERTIFICATE';
  const VALIDATE_URL_INPUT = 'VALIDATE_URL_INPUT';
  const CLEAR_VERIFIED_STEPS = 'CLEAR_VERIFIED_STEPS';
  const STEP_VERIFIED = 'STEP_VERIFIED';
  const UPDATE_PARENT_STEP_STATUS = 'UPDATE_PARENT_STEP_STATUS';
  const UPDATE_VERIFICATION_STATUS = 'UPDATE_VERIFICATION_STATUS';
  const UPDATE_FINAL_STEP = 'UPDATE_FINAL_STEP';
  const RESET_VERIFICATION_STATUS = 'RESET_VERIFICATION_STATUS';
  const SET_ERROR_MESSAGE = 'SET_ERROR_MESSAGE';
  const SHARE_SOCIAL_NETWORK = 'SHARE_SOCIAL_NETWORK';
  const SHOW_VERIFICATION_MODAL = 'SHOW_VERIFICATION_MODAL';
  const START_VERFICATION_PROCESS = 'START_VERFICATION_PROCESS';

  function updateCertificateUrl (state, action) {
    return {
      ...state,
      input: {
        ...state.input,
        certificateUrl: action.payload.url
      }
    };
  }

  function validateUrlInput (state, action) {
    return {
      ...state,
      input: {
        ...state.input,
        isValid: action.payload.isValid
      }
    };
  }

  /*
   * Copyright 2016 Google Inc. All rights reserved.
   *
   * Licensed under the Apache License, Version 2.0 (the "License"); you may not
   * use this file except in compliance with the License. You may obtain a copy of
   * the License at
   *
   *     http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
   * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
   * License for the specific language governing permissions and limitations under
   * the License.
   */

  function proxyPolyfill () {
    let lastRevokeFn = null;

    /**
     * @param {*} o
     * @return {boolean} whether this is probably a (non-null) Object
     */
    function isObject (o) {
      return o ? (typeof o === 'object' || typeof o === 'function') : false;
    }

    /**
     * @constructor
     * @param {!Object} target
     * @param {{apply, construct, get, set}} handler
     */
    const ProxyPolyfill = function (target, handler) {
      if (!isObject(target) || !isObject(handler)) {
        throw new TypeError('Cannot create proxy with a non-object as target or handler');
      }

      // Construct revoke function, and set lastRevokeFn so that Proxy.revocable can steal it.
      // The caller might get the wrong revoke function if a user replaces or wraps scope.Proxy
      // to call itself, but that seems unlikely especially when using the polyfill.
      let throwRevoked = function () {};
      lastRevokeFn = function () {
        throwRevoked = function (trap) {
          throw new TypeError(`Cannot perform '${trap}' on a proxy that has been revoked`);
        };
      };

      // Fail on unsupported traps: Chrome doesn't do this, but ensure that users of the polyfill
      // are a bit more careful. Copy the internal parts of handler to prevent user changes.
      const unsafeHandler = handler;
      handler = { get: null, set: null, apply: null, construct: null };
      for (const k in unsafeHandler) {
        if (!(k in handler)) ; else {
          handler[k] = unsafeHandler[k];
        }
      }
      if (typeof unsafeHandler === 'function') {
        // Allow handler to be a function (which has an 'apply' method). This matches what is
        // probably a bug in native versions. It treats the apply call as a trap to be configured.
        handler.apply = unsafeHandler.apply.bind(unsafeHandler);
      }

      // Define proxy as this, or a Function (if either it's callable, or apply is set).
      // TODO(samthor): Closure compiler doesn't know about 'construct', attempts to rename it.
      let proxy = this;
      let isMethod = false;
      let isArray = false;
      if (typeof target === 'function') {
        proxy = function ProxyPolyfill () {
          const usingNew = (this && this.constructor === proxy);
          const args = Array.prototype.slice.call(arguments);
          throwRevoked(usingNew ? 'construct' : 'apply');

          if (usingNew && handler.construct) {
            return handler.construct.call(this, target, args);
          } else if (!usingNew && handler.apply) {
            return handler.apply(target, this, args);
          }

          // since the target was a function, fallback to calling it directly.
          if (usingNew) {
            // inspired by answers to https://stackoverflow.com/q/1606797
            args.unshift(target); // pass class as first arg to constructor, although irrelevant
            // nb. cast to convince Closure compiler that this is a constructor
            const f = /** @type {!Function} */ (target.bind.apply(target, args));
            /* eslint new-cap: "off" */
            return new f();
          }
          return target.apply(this, args);
        };
        isMethod = true;
      } else if (target instanceof Array) {
        proxy = [];
        isArray = true;
      }

      // Create default getters/setters. Create different code paths as handler.get/handler.set can't
      // change after creation.
      const getter = handler.get ? function (prop) {
        throwRevoked('get');
        return handler.get(this, prop, proxy);
      } : function (prop) {
        throwRevoked('get');
        return this[prop];
      };
      const setter = handler.set ? function (prop, value) {
        throwRevoked('set');
        handler.set(this, prop, value, proxy);
      } : function (prop, value) {
        throwRevoked('set');
        this[prop] = value;
      };

      // Clone direct properties (i.e., not part of a prototype).
      const propertyNames = Object.getOwnPropertyNames(target);
      const propertyMap = {};
      propertyNames.forEach(function (prop) {
        if ((isMethod || isArray) && prop in proxy) {
          return; // ignore properties already here, e.g. 'bind', 'prototype' etc
        }
        const real = Object.getOwnPropertyDescriptor(target, prop);
        const desc = {
          enumerable: !!real.enumerable,
          get: getter.bind(target, prop),
          set: setter.bind(target, prop)
        };
        Object.defineProperty(proxy, prop, desc);
        propertyMap[prop] = true;
      });

      // Set the prototype, or clone all prototype methods (always required if a getter is provided).
      // TODO(samthor): We don't allow prototype methods to be set. It's (even more) awkward.
      // An alternative here would be to _just_ clone methods to keep behavior consistent.
      let prototypeOk = true;
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(proxy, Object.getPrototypeOf(target));
        /* eslint no-proto: "off" */
      } else if (proxy.__proto__) {
        proxy.__proto__ = target.__proto__;
      } else {
        prototypeOk = false;
      }
      if (handler.get || !prototypeOk) {
        for (const k in target) {
          if (propertyMap[k]) {
            continue;
          }
          Object.defineProperty(proxy, k, { get: getter.bind(target, k) });
        }
      }

      // The Proxy polyfill cannot handle adding new properties. Seal the target and proxy.
      Object.seal(target);
      Object.seal(proxy);

      return proxy; // nb. if isMethod is true, proxy != this
    };

    ProxyPolyfill.revocable = function (target, handler) {
      const p = new ProxyPolyfill(target, handler);
      return { proxy: p, revoke: lastRevokeFn };
    };

    return ProxyPolyfill;
  }

  // Proxy handler to intercept property calls
  const handler = {
    get: (target, name) => {
      const result = name in target
        ? target[name]
        : null;
      if (!result) console.warn('the service does not exist', name);
      return result;
    }
  };

  const compose$1 = (services = {}) => {
    // Creates a domain object enhanced with the proxy handler
    if (!window.Proxy) {
      const ProxyPolyfill = proxyPolyfill();
      return new ProxyPolyfill(services, handler);
    }
    return new Proxy(services, handler);
  };

  const downloadFlag = '?format=json';

  function download (url) {
    return url + downloadFlag;
  }

  function e(e,t){return "string"!=typeof e?(console.warn("Trying to test a non string variable"),!1):0===e.indexOf(t)}const t="bitpay",r="blockcypher",n="blockexplorer",i="blockstream",o="etherscan",a={[t]:{mainnet:"https://insight.bitpay.com/api/tx/{transaction_id}",testnet:"https://api.bitcore.io/api/BTC/testnet/tx/{transaction_id}"},[r]:{mainnet:"https://api.blockcypher.com/v1/btc/main/txs/{transaction_id}?limit=500",testnet:"https://api.blockcypher.com/v1/btc/test3/txs/{transaction_id}?limit=500"},[n]:{mainnet:"https://blockexplorer.com/api/tx/{transaction_id}",testnet:"https://testnet.blockexplorer.com/api/tx/{transaction_id}"},[i]:{mainnet:"https://blockstream.info/api/tx/{transaction_id}",testnet:"https://blockstream.info/testnet/api/tx/{transaction_id}"},[o]:{main:"https://api.etherscan.io/api?module=proxy&apikey=FJ3CZWH8PQBV8W5U6JR8TMKAYDHBKQ3B1D",ropsten:"https://api-ropsten.etherscan.io/api?module=proxy&apikey=FJ3CZWH8PQBV8W5U6JR8TMKAYDHBKQ3B1D"}};function s(e){return "3.0-alpha"===e}var c={V1_1:"1.1",V1_2:"1.2",V2_0:"2.0",V3_0_alpha:"3.0-alpha"};const u={formatValidation:{label:"Format validation",labelPending:"Validating format",subSteps:[]},hashComparison:{label:"Hash comparison",labelPending:"Comparing hash",subSteps:[]},statusCheck:{label:"Status check",labelPending:"Checking record status",subSteps:[]}};var l=Object.freeze({__proto__:null,final:"final",formatValidation:"formatValidation",hashComparison:"hashComparison",statusCheck:"statusCheck",language:u}),f={"en-US":{steps:{formatValidationLabel:"Format validation",formatValidationLabelPending:"Validating format",hashComparisonLabel:"Hash comparison",hashComparisonLabelPending:"Comparing hash",statusCheckLabel:"Status check",statusCheckLabelPending:"Checking record status"},subSteps:{getTransactionIdLabel:"Get transaction ID",getTransactionIdLabelPending:"Getting transaction ID",computeLocalHashLabel:"Compute local hash",computeLocalHashLabelPending:"Computing local hash",fetchRemoteHashLabel:"Fetch remote hash",fetchRemoteHashLabelPending:"Fetching remote hash",getIssuerProfileLabel:"Get issuer profile",getIssuerProfileLabelPending:"Getting issuer profile",parseIssuerKeysLabel:"Parse issuer keys",parseIssuerKeysLabelPending:"Parsing issuer keys",compareHashesLabel:"Compare hashes",compareHashesLabelPending:"Comparing hashes",checkMerkleRootLabel:"Check Merkle Root",checkMerkleRootLabelPending:"Checking Merkle Root",checkReceiptLabel:"Check Receipt",checkReceiptLabelPending:"Checking Receipt",checkIssuerSignatureLabel:"Check Issuer Signature",checkIssuerSignatureLabelPending:"Checking Issuer Signature",checkAuthenticityLabel:"Check Authenticity",checkAuthenticityLabelPending:"Checking Authenticity",checkRevokedStatusLabel:"Check Revoked Status",checkRevokedStatusLabelPending:"Checking Revoked Status",checkExpiresDateLabel:"Check Expiration Date",checkExpiresDateLabelPending:"Checking Expiration Date"},revocation:{preReason:"Reason given:",reason:"This certificate has been revoked by the issuer."},success:{mocknet:{label:"This Mocknet credential passed all checks",description:"Mocknet credentials are used for test purposes only. They are not recorded on a blockchain, and they should not be considered verified Blockcerts."},blockchain:{label:"Verified",description:"This is a valid ${chain} certificate.",linkText:"View transaction link"}},errors:{certificateNotValid:"This is not a valid certificate",getChain:"Didn't recognize chain value",getTransactionId:"Cannot verify this certificate without a transaction ID to compare against.",getIssuerProfile:"Unable to get issuer profile",getRevokedAssertions:"Unable to get revocation assertions",lookForTxInvalidChain:"Invalid chain; does not map to known BlockchainExplorers.",lookForTxInvalidAppConfig:"Invalid application configuration; check the CONFIG.MinimumBlockchainExplorers configuration value",lookForTxCouldNotConfirm:"Could not confirm the transaction. No blockchain apis returned a response. This could be because of rate limiting.",lookForTxDifferentAddresses:"Issuing addresses returned by the blockchain APIs were different",lookForTxDifferentRemoteHashes:"Remote hashes returned by the blockchain APIs were different",parseIssuerKeys:"Unable to parse JSON out of issuer identification data.",unableToGetRemoteHash:"Unable to get remote hash",parseBitpayResponse:"Number of transaction confirmations were less than the minimum required, according to Bitpay API",parseBlockCypherResponse:"Number of transaction confirmations were less than the minimum required, according to Blockcypher API",parseBlockexplorerResponse:"Number of transaction confirmations were less than the minimum required, according to Blockexplorer API",parseBlockstreamResponse:"Number of transaction confirmations were less than the minimum required, according to Blockstream API",checkEtherScanConfirmations:"Number of transaction confirmations were less than the minimum required, according to EtherScan API",couldNotConfirmTx:"Could not confirm the transaction",failedJsonLdNormalization:"Failed JSON-LD normalization",foundUnmappedFields:"Found unmapped fields during JSON-LD normalization",ensureHashesEqual:"Computed hash does not match remote hash",ensureIssuerSignature:"Issuer key does not match derived address.",ensureMerkleRootEqual:"Merkle root does not match remote hash.",ensureNotExpired:"This certificate has expired.",getCaseInsensitiveKey:"Transaction occurred at time when issuing address was not considered valid.",ensureValidReceipt:"The receipt is malformed. There was a problem navigating the merkle tree in the receipt.",invalidMerkleReceipt:"Invalid Merkle Receipt. Proof hash did not match Merkle root",invalidMerkleVersion:"Merkle version used for signature is incompatible with Blockcerts version.",isTransactionIdValid:"Cannot verify this certificate without a transaction ID to compare against."}},fr:{steps:{formatValidationLabel:"Validation du format",formatValidationLabelPending:"Validation du format",hashComparisonLabel:"Comparaison du hash",hashComparisonLabelPending:"Comparaison du hash",statusCheckLabel:"Vérification du status",statusCheckLabelPending:"Vérification du status"},subSteps:{getTransactionIdLabel:"Obtention de l'identifiant de transaction",getTransactionIdLabelPending:"Obtention de l'identifiant de transaction",computeLocalHashLabel:"Calcul du hash local",computeLocalHashLabelPending:"Calcul du hash local",fetchRemoteHashLabel:"Récupération du hash distant",fetchRemoteHashLabelPending:"Récupération du hash distant",getIssuerProfileLabel:"Obtention du profil de l'émetteur",getIssuerProfileLabelPending:"Obtention du profil de l'émetteur",parseIssuerKeysLabel:"Traitement des clés de l'émetteur",parseIssuerKeysLabelPending:"Traitement des clés de l'émetteur",compareHashesLabel:"Comparaison des hash",compareHashesLabelPending:"Comparaison des hashs",checkMerkleRootLabel:"Vérification du Merkle Root",checkMerkleRootLabelPending:"Vérification du  Merkle Root",checkReceiptLabel:"Vérification du reçu",checkReceiptLabelPending:"Vérification du reçu",checkIssuerSignatureLabel:"Vérification de la signature de l'émetteur",checkIssuerSignatureLabelPending:"Vérification de la signature de l'émetteur",checkAuthenticityLabel:"Vérification de l'authenticité",checkAuthenticityLabelPending:"Vérification de l'authenticité",checkRevokedStatusLabel:"Vérification du status de révocation",checkRevokedStatusLabelPending:"Vérification du status de révocation",checkExpiresDateLabel:"Vérification de la date d'expiration",checkExpiresDateLabelPending:"Vérification de la date d'expiration"},revocation:{preReason:"Raison :",reason:"Ce certificat a été révoqué par l'émetteur."},success:{mocknet:{label:"Cet enregistrement Mocknet a été vérifié",description:"Le mode Mocknet est utilisé à des fins de tests uniquement. Ce Blockcert n'a pas été enregistré sur une blockchain, et en tant que tel ne peut pas être considéré un Blockcert valide."},blockchain:{label:"Vérifié",description:"Ceci est un certificat ${chain} valide.",linkText:"Voir la transaction"}},errors:{certificateNotValid:"Certificat invalide",getChain:"Valeur de chaine non reconnue",getTransactionId:"Impossible de vérifier ce certificat sans un identifiant de transaction valide",getIssuerProfile:"Profil de l'émetteur indisponible",getRevokedAssertions:"Impossible d'obtenir les raisons de revocation",lookForTxInvalidChain:"Chaine invalide : non liée à un BlockchainExplorers connu",lookForTxInvalidAppConfig:"Configuration de l'application invalide : vérifiez la valeur de configuration de CONFIG.MinimumBlockchainExplorers",lookForTxCouldNotConfirm:"Impossible de confirmer la transaction. Aucune API blockchain n'a répondu. Potentiellement dû à une limite de débit réseau.",lookForTxDifferentAddresses:"Les adresses d'émission reçues de l'API blockchain ne concordent pas",lookForTxDifferentRemoteHashes:"Les hashs distants reçus de l'API blockchain ne concordent pas",parseIssuerKeys:"Impossible de lire le JSON d'identification de l'émetteur",unableToGetRemoteHash:"Impossible d'obtenir le hash distant",parseBitpayResponse:"Le nombre de confirmations de transaction n'atteint pas le minimum requis, d'après l'API Bitpay",parseBlockCypherResponse:"Le nombre de confirmations de transaction n'atteint pas le minimum requis, d'après l'API Blockcypher",parseBlockexplorerResponse:"Le nombre de confirmations de transaction n'atteint pas le minimum requis, d'après l'API Blockexplorer",parseBlockstreamResponse:"Le nombre de confirmations de transaction n'atteint pas le minimum requis, d'après l'API Blockstream",checkEtherScanConfirmations:"Le nombre de confirmations de transaction n'atteint pas le minimum requis, d'après l'API EtherScan",couldNotConfirmTx:"Impossible de confirmer la transaction",failedJsonLdNormalization:"Erreur de normalisation JSON-LD",foundUnmappedFields:"Champs non liés découverts durant la normalisation JSON-LD",ensureHashesEqual:"Calcul du hash local différent du hash distant",ensureIssuerSignature:"La clé de l'émetteur ne correspond pas à l'adresse dérivée",ensureMerkleRootEqual:"Le Merkle root ne correspond pas au hash distant",ensureNotExpired:"Certificat expiré",getCaseInsensitiveKey:"Transaction émise lorsque l'adresse de l'émetteur était considérée invalide",ensureValidReceipt:"Erreur d'écriture du reçu. Un problème est survenu lors de la navigation de l'arbre Merkle du reçu.",invalidMerkleReceipt:"Reçu Merkle invalide. Hash de preuve différent du Merkle root",invalidMerkleVersion:"La version du Merkle utilisé est incompatible avec la version Blockcerts.",isTransactionIdValid:"Impossible de vérifier ce certificat sans un identifiant de transaction valide"}},es:{steps:{formatValidationLabel:"Validación de formato",formatValidationLabelPending:"Validando el formato",hashComparisonLabel:"Comparación de cadena binaria",hashComparisonLabelPending:"Comparando cadena binaria",statusCheckLabel:"Estado de Verificación",statusCheckLabelPending:"Verificando Estado de Grabación"},subSteps:{getTransactionIdLabel:"Obtener Identificación de Transacción",getTransactionIdLabelPending:"Obteniendo Identificación de Transacción",computeLocalHashLabel:"Calcular cadena binaria local",computeLocalHashLabelPending:"Calculando cadena binaria local",fetchRemoteHashLabel:"Obtener cadena binaria remota",fetchRemoteHashLabelPending:"Obeniendo cadena binaria remota",getIssuerProfileLabel:"Obtener perfil de emisor",getIssuerProfileLabelPending:"Obteniendo perfil de emisor",parseIssuerKeysLabel:"Analizar claves del emisor",parseIssuerKeysLabelPending:"Analizando claves del emisor",compareHashesLabel:"Comparar cadenas binarias",compareHashesLabelPending:"Comparando cadenas binarias",checkMerkleRootLabel:"Verificar Merkle Root",checkMerkleRootLabelPending:"Verificando Merkle Root",checkReceiptLabel:"Verificar Recibo",checkReceiptLabelPending:"Verificando Recibo",checkIssuerSignatureLabel:"Verificar Firma del Emisor",checkIssuerSignatureLabelPending:"Verificando Firma del Emisor",checkAuthenticityLabel:"Verificar Autenticidad",checkAuthenticityLabelPending:"Verificando Autenticidad",checkRevokedStatusLabel:"Verificar Estado de Revocación",checkRevokedStatusLabelPending:"Verificando Estado de Revocación",checkExpiresDateLabel:"Verificar Fechas de Expiración",checkExpiresDateLabelPending:"Verificando Fechas de Expiración"},revocation:{preReason:"Razón dada:",reason:"Este certificado ha sido revocado por el emisor"},success:{mocknet:{label:"Esta credencial de Mocknet pasó todas las comprobaciones",description:"Las credenciales de Mocknet se usan solo con fines de prueba. No se graban en una cadena de bloques, y no se deben considerar Blockcerts Verificados."},blockchain:{label:"Verificado",description:"Este es un certificado válido de ${chain}.",linkText:"Ver enlace de transacción"}},errors:{certificateNotValid:"Este no es un certificado válido",getChain:"Valor de cadena no reconocido",getTransactionId:"No se puede verificar este certificado sin una identificación de transacción que sirva como comparación",getIssuerProfile:"No se ha podido obtener el perfil del emisor",getRevokedAssertions:"No se ha podido obtener aseveraciones de revocación",lookForTxInvalidChain:"Cadena inválida; no corresponde a BlockchainExplorers reconocidos",lookForTxInvalidAppConfig:"Configuración de aplicación inválida; cheque el valor de configuración CONFIG.MinimumBlockchainExplorers",lookForTxCouldNotConfirm:"No se ha podido confirmar la transacción. Ninguna del las APIs de blockchain generó una respuesta. Esto puede ser causado por limitaciones de tasa.",lookForTxDifferentAddresses:"Las direcciones emisoras generadas por las APIs del blockchain son distintas",lookForTxDifferentRemoteHashes:"Las cadenas binarias remotas generadas por las APIs del blockchain son distintas",parseIssuerKeys:"No se ha podido analizar el JSON de la información de identificación del emisor",unableToGetRemoteHash:"No se ha podido obtener la cadena binaria remota",parseBitpayResponse:"El número de transacciones confirmadas son menores que el mínimo requerido, de acuerdo al API Bitpay",parseBlockCypherResponse:"El número de transacciones confirmadas son menores que el mínimo requerido, de acuerdo al API Blockcypher",parseBlockexplorerResponse:"El número de transacciones confirmadas son menores que el mínimo requerido, de acuerdo al API Blockexplorer",parseBlockstreamResponse:"El número de transacciones confirmadas son menores que el mínimo requerido, de acuerdo al API Blockstream",checkEtherScanConfirmations:"El número de transacciones confirmadas son menores que el mínimo requerido, de acuerdo al API EtherScan",couldNotConfirmTx:"No se ha podido confirmar la transacción",failedJsonLdNormalization:"La normalización del JSON-LD ha fallado",foundUnmappedFields:"Se han encontrado campos no mapeados durante la normalización de JSON-LD",ensureHashesEqual:"La cadena binaria calculada no corresponde con la cadena binaria remota",ensureIssuerSignature:"La llave del emisor no corresponde con la dirección obtenida",ensureMerkleRootEqual:"La raíz Merkle no corresponde con la cadena binaria remota",ensureNotExpired:"Este certificado ha expirado",getCaseInsensitiveKey:"La dirección emisora no era considerada válida cuando la transacción ocurrió",ensureValidReceipt:"El recibo está malformado. Hubo un problema navegando el árbol Merkle en el recibo",invalidMerkleReceipt:"Recibo Merkle inválido. La cadena binaria de prueba no corresponde con la raíz Merkle",invalidMerkleVersion:"Merkle version used for signature is incompatible with Blockcerts version.",isTransactionIdValid:"No se puede verificar este certificado sin una identificación de transacción que sirva como comparación"}},mt:{steps:{formatValidationLabel:"Validazzjoni tal-format",formatValidationLabelPending:"Il-format qed jiġi vvalidat",hashComparisonLabel:"Paragun tal-Hash",hashComparisonLabelPending:"Il-hash qed jiġi pparagunat",statusCheckLabel:"Status check",statusCheckLabelPending:"Ir-record status qed jiġi ċċekkjat"},subSteps:{getTransactionIdLabel:"Ikseb l-ID ta' tranżazzjoni",getTransactionIdLabelPending:"L-ID ta' tranżazzjoni qed tiġi mniżżla",computeLocalHashLabel:"Ikkalkula l-hash lokali",computeLocalHashLabelPending:"Il-hash lokali qed jiġi kkalkulat",fetchRemoteHashLabel:"Fittex ir-remote hash",fetchRemoteHashLabelPending:"Ir-remote hash qed jiġi mfittex",getIssuerProfileLabel:"Ikseb il-profil tal-emittent",getIssuerProfileLabelPending:"Il-profil tal-emittent qed jiġi mniżżel",parseIssuerKeysLabel:"Estratta ċ-ċwievet tal-emittent",parseIssuerKeysLabelPending:"Iċ-ċwievet tal-emittent qed jiġu estratti",compareHashesLabel:"Ikkumpara l-hashes",compareHashesLabelPending:"Il-hashes qed jiġu kkomparati",checkMerkleRootLabel:"Iċċekkja l-Merkle Root",checkMerkleRootLabelPending:"Il-Merkle Root Qed Tiġi Ċċekkjata",checkReceiptLabel:"Iċċekkja l-Irċevuta",checkReceiptLabelPending:"L-Irċevuta Qed Tiġi Ċċekkjata",checkIssuerSignatureLabel:"Iċċekkja l-Firma tal-Emittent",checkIssuerSignatureLabelPending:"Il-Firma tal-Emittent Qed Tiġi Ċċekkjata",checkAuthenticityLabel:"Iċċekkja l-Awtentiċità",checkAuthenticityLabelPending:"L-Awtentiċità Qed Tiġi Ċċekkjata",checkRevokedStatusLabel:"Iċċekkja l-Istatus Revokat",checkRevokedStatusLabelPending:"L-Istatus Revokat Qed Jiġi Ċċekkjat",checkExpiresDateLabel:"Iċċekkja d-Data ta' Skadenza",checkExpiresDateLabelPending:"Id-Data ta' Skadenza Qed Tiġi Ċċekkjata"},revocation:{preReason:"Raġuni mogħtija:",reason:"Dan iċ-ċertifikat ġie revokat mill-emittent."},success:{mocknet:{label:"Din il-kredenzjali tal-Mocknet għaddiet il-kontrolli kollha",description:"Il-kredenzjali tal-Mocknet jintużaw biss għal skopijiet ta 'ttestjar. Dawn mhumiex irreġistrati fuq blockchain, u ma għandhomx jiġu kkunsidrati bħala blockcerts verifikati."},blockchain:{label:"Ivverifikat",description:"Dan huwa ċertifikat ${chain} huwa validu.",linkText:"Ara l-link tat-transazzjoni"}},errors:{certificateNotValid:"Dan mhux ċertifikat validu",getChain:"Iċ-chain value ma ntgħarafx",getTransactionId:"Dan iċ-ċertifikat ma jistax jiġi vverifikat mingħajr ID ta' tranżazzjoni mqabbla miegħu",getIssuerProfile:"Mhux possibbli jinkiseb il-profil tal-emittent",getRevokedAssertions:"Mhux possibbli jinkisbu dikjarazzjonijiet revokati",lookForTxInvalidChain:"Chain invalidu; BlockchainExplorers mhux qed isib chain magħrufa",lookForTxInvalidAppConfig:"Konfigurazzjoni tal-applikazzjoni invalida; Iċċekkja l-valur konfigurattiv f' CONFIG.MinimumBlockchainExplorers",lookForTxCouldNotConfirm:"It-tranżazzjoni ma setgħetx tiġi kkonferma. L-ebda blockchain apis ma rritorna rispons. Dan jista' jkun minħabba limitazzjoni tar-rata",lookForTxDifferentAddresses:"L-indirizzi tal-ħruġ mibgħuta lura mill-blockchain APIs kienu differenti",lookForTxDifferentRemoteHashes:"Ir-remote hashes mibgħuta lura mill-blockchain APIs kienu differenti",parseIssuerKeys:"Ma jistax jiġi estratt JSON mid-data tal-identifikazzjoni tal-emittent",unableToGetRemoteHash:"Mhux possibbli jinkiseb ir-remote hash",parseBitpayResponse:"In-numru ta' konfermi tat-tranżazzjonijiet kienu inqas mill-minimu meħtieġ, skont Bitpay API",parseBlockCypherResponse:"In-numru ta' konfermi tat-tranżazzjonijiet kienu inqas mill-minimu meħtieġ, skont Blockcypher API",parseBlockexplorerResponse:"In-numru ta' konfermi tat-tranżazzjonijiet kienu inqas mill-minimu meħtieġ, skont Blockexplorer API",parseBlockstreamResponse:"In-numru ta' konfermi tat-tranżazzjonijiet kienu inqas mill-minimu meħtieġ, skont Blockstream API",checkEtherScanConfirmations:"In-numru ta' konfermi tat-tranżazzjonijiet kienu inqas mill-minimu meħtieġ, skont EtherScan API",couldNotConfirmTx:"Ma setgħetx tiġi kkonfermata t-tranżazzjoni",failedJsonLdNormalization:"In-normalizzazzjoni ta' JSON-LD ma rnexxietx",foundUnmappedFields:"Instabu unmapped fields matul in-normalizzazzjoni JSON-LD",ensureHashesEqual:"Il-hash ikkalkulat ma jikkorrispondix mar-remote hash",ensureIssuerSignature:"Iċ-ċavetta tal-emittent ma taqbilx mal-indirizz derivat",ensureMerkleRootEqual:"Merkle root ma taqbilx mar-remote hash",ensureNotExpired:"Dan iċ-ċertifikat skada",getCaseInsensitiveKey:"It-tranżazzjoni seħħet fi żmiem meta l-indirizz tal-ħruġ ma tqiesx validu",ensureValidReceipt:"L-irċevuta hija malformata. Kien hemm problema fin-navigazzjoni tal-merkle tree fl-irċevuta",invalidMerkleReceipt:"Irċevuta Merkle invalida. Il-proof hash ma kienx jaqbel mal-Merkle root",invalidMerkleVersion:"Merkle version used for signature is incompatible with Blockcerts version.",isTransactionIdValid:"Dan iċ-ċertifikat ma jistax jiġi vverifikat mingħajr ID ta' tranżazzjoni mqabbla miegħu"}},"it-IT":{steps:{formatValidationLabel:"Convalidare formato",formatValidationLabelPending:"Convalida formato",hashComparisonLabel:"Confrontare hash",hashComparisonLabelPending:"Confronta hash",statusCheckLabel:"Verificare stato",statusCheckLabelPending:"Verifica stato del record"},subSteps:{getTransactionIdLabel:"Ottenere ID transazione",getTransactionIdLabelPending:"Ottieni ID transazione",computeLocalHashLabel:"Calcolare hash locale",computeLocalHashLabelPending:"Calcola hash locale",fetchRemoteHashLabel:"Recuperare hash remoto",fetchRemoteHashLabelPending:"Recupera hash remoto",getIssuerProfileLabel:"Ottenere profilo issuer",getIssuerProfileLabelPending:"Ottieni profilo issuer",parseIssuerKeysLabel:"Analizzare chiavi issuer",parseIssuerKeysLabelPending:"Analizza chiavi issuer",compareHashesLabel:"Confrontare gli hash",compareHashesLabelPending:"Confronto hash",checkMerkleRootLabel:"Controllare radice di Merkle",checkMerkleRootLabelPending:"Controllo radice di Merkle",checkReceiptLabel:"Verificare ricevuta",checkReceiptLabelPending:"Verifica ricevuta",checkIssuerSignatureLabel:"Verificare firma Issuer",checkIssuerSignatureLabelPending:"Verifica firma Issuer",checkAuthenticityLabel:"Verificare autenticità",checkAuthenticityLabelPending:"Verifica autenticità",checkRevokedStatusLabel:"Verificare stato revocato",checkRevokedStatusLabelPending:"Verifica stato revocato",checkExpiresDateLabel:"Verificare data di scadenza",checkExpiresDateLabelPending:"Verifica data di scadenza"},revocation:{preReason:"Motivo indicato:",reason:"Questo certificato è stato revocato dall'emittente."},success:{mocknet:{label:"Questo Blockcert simulato ha superato tutti i controlli.",description:"La modalità Mocknet è utilizzata solo dagli emittenti per testare il loro flusso di lavoro localmente. Questo Blockcert non è stato registrato su una blockchain e non dovrebbe essere considerato un Blockcert verificato."},blockchain:{label:"Verificato",description:"Questo è un certificato ${chain} valido.",linkText:"Vedi la transazione"}},errors:{certificateNotValid:"Questo non è un certificato valido",getChain:"Il valore della catena non è stato riconosciuto",getTransactionId:"Impossibile verificare questo certificato senza un ID transazione da confrontare.",getIssuerProfile:"Impossibile ottenere il profilo dell'emittente",getRevokedAssertions:"Impossibile ottenere le asserzioni di revoca",lookForTxInvalidChain:"Catena non valida; non mappa BlockchainExplorers noti.",lookForTxInvalidAppConfig:"Configurazione dell'applicazione non valida, verificare il valore di configurazione di CONFIG.MinimumBlockchainExplorers",lookForTxCouldNotConfirm:"Impossibile confermare la transazione. Nessuna API blockchain ha risposto. Potrebbe essere a causa della limitazione della velocità.",lookForTxDifferentAddresses:"Gli indirizzi di emissione restituiti dalle API blockchain erano diversi",lookForTxDifferentRemoteHashes:"Gli hash remoti restituiti dalle API blockchain erano diversi",parseIssuerKeys:"Impossibile analizzare JSON dai dati di identificazione dell'emittente.",unableToGetRemoteHash:"Impossibile ottenere l'hash remoto",parseBitpayResponse:"Il numero di conferme delle transazioni era inferiore al minimo richiesto, secondo l'API Bitpay",parseBlockCypherResponse:"Il numero di conferme delle transazioni era inferiore al minimo richiesto, secondo l'API Blockcypher",parseBlockexplorerResponse:"Il numero di conferme delle transazioni era inferiore al minimo richiesto, secondo l'API Blockexplorer",parseBlockstreamResponse:"Il numero di conferme delle transazioni era inferiore al minimo richiesto, secondo l'API Blockstream",checkEtherScanConfirmations:"Il numero di conferme delle transazioni era inferiore al minimo richiesto, secondo l'API EtherScan",couldNotConfirmTx:"Impossibile confermare la transazione",failedJsonLdNormalization:"Normalizzazione JSON-LD fallita",foundUnmappedFields:"Campi non mappati trovati durante la normalizzazione JSON-LD",ensureHashesEqual:"L'hash calcolato non corrisponde all'hash remoto",ensureIssuerSignature:"La chiave dell'issuer non corrisponde all'indirizzo derivato.",ensureMerkleRootEqual:"La radice di Merkle non corrisponde all'hash remoto.",ensureNotExpired:"Questo certificato è scaduto.",getCaseInsensitiveKey:"La transazione è avvenuta nel momento in cui l'indirizzo di emissione non era considerato valido.",ensureValidReceipt:"La ricevuta è malformata. C'è stato un problema nella navigazione dell'albero di Merkle nella ricevuta.",invalidMerkleReceipt:"Ricevuta Merkle non valida. L'hash di prova non corrisponde alla radice di Merkle",invalidMerkleVersion:"Merkle version used for signature is incompatible with Blockcerts version.",isTransactionIdValid:"Impossibile verificare questo certificato senza un ID transazione da confrontare."}},ja:{steps:{formatValidationLabel:"フォーマットの検証",formatValidationLabelPending:"フォーマットを検証しています",hashComparisonLabel:"ハッシュの照合",hashComparisonLabelPending:"ハッシュを照合しています",statusCheckLabel:"ステータスの確認",statusCheckLabelPending:"ステータスを確認しています"},subSteps:{getTransactionIdLabel:"取引IDの取得",getTransactionIdLabelPending:"取引IDを取得しています",computeLocalHashLabel:"ローカルハッシュの算出",computeLocalHashLabelPending:"ローカルハッシュを算出しています",fetchRemoteHashLabel:"リモートハッシュのフェッチ",fetchRemoteHashLabelPending:"リモートハッシュをフェッチしています",getIssuerProfileLabel:"発行者プロフィールの取得",getIssuerProfileLabelPending:"発行者プロフィールを取得しています",parseIssuerKeysLabel:"発行者の鍵のパース",parseIssuerKeysLabelPending:"発行者の鍵をパースしています",compareHashesLabel:"ハッシュの照合",compareHashesLabelPending:"ハッシュを照合しています",checkMerkleRootLabel:"Merkle Rootの確認",checkMerkleRootLabelPending:"Merkle Rootを確認しています",checkReceiptLabel:"レシートの確認",checkReceiptLabelPending:"レシートを確認しています",checkIssuerSignatureLabel:"発行者の署名の確認",checkIssuerSignatureLabelPending:"発行者の署名を確認しています",checkAuthenticityLabel:"真正性の確認",checkAuthenticityLabelPending:"真正性を確認しています",checkRevokedStatusLabel:"取消ステータスの確認",checkRevokedStatusLabelPending:"取消ステータスを確認しています",checkExpiresDateLabel:"有効期限の確認",checkExpiresDateLabelPending:"有効期限を確認しています"},revocation:{preReason:"理由：",reason:"この証明書は発行者によって取り消されました。"},success:{mocknet:{label:"このMocknetの証明書は全てのチェックを通過しました。",description:"Mocknetの証明書はテスト用のものです。ブロックチェーンに記録されませんし、認証済みのBlockcertとして扱われません。"},blockchain:{label:"認証されました",description:"この証明書は有効な${chain}証明書です。",linkText:"取引を確認する"}},errors:{certificateNotValid:"この証明書は有効ではありません",getChain:"チェーンの値を認識できませんでした",getTransactionId:"照合のための取引IDがないため、この証明書を認証できません。",getIssuerProfile:"発行者プロフィールを取得できません",getRevokedAssertions:"取消assertionsを取得できません",lookForTxInvalidChain:"チェーンが無効です。既知のBlockchainExplorersにマップできません。",lookForTxInvalidAppConfig:"アプリケーション設定が無効です。CONFIG.MinimumBlockchainExplorersの設定値を確認して下さい。",lookForTxCouldNotConfirm:"取引を確認できませんでした。全てのブロックチェーンAPIが返信しませんでした。 レート制限が原因になっている可能性があります。",lookForTxDifferentAddresses:"ブロックチェーンAPIから返された発行者アドレスが異なっていました",lookForTxDifferentRemoteHashes:"ブロックチェーンAPIから返されたリモートハッシュが異なっていました",parseIssuerKeys:"発行者識別データからJSONをパースできません",unableToGetRemoteHash:"リモートハッシュを取得できません",parseBitpayResponse:"Bitpay APIによると、必要最小限の取引確認の数に達しませんでした",parseBlockCypherResponse:"Blockcypher APIによると、必要最小限の取引確認の数に達しませんでした",parseBlockexplorerResponse:"Blockexplorer APIによると、必要最小限の取引確認の数に達しませんでした",parseBlockstreamResponse:"Blockstream APIによると、必要最小限の取引確認の数に達しませんでした",checkEtherScanConfirmations:"EtherScan APIによると、必要最小限の取引確認の数に達しませんでした",couldNotConfirmTx:"取引を確認できませんでした",failedJsonLdNormalization:"JSON-LDの正規化に失敗しました",foundUnmappedFields:"JSON-LDの正規化時にマップされていないフィールドを検出しました",ensureHashesEqual:"算出されたハッシュがリモートハッシュと一致しませんでした",ensureIssuerSignature:"発行者の鍵が得られたアドレスと一致しませんでした",ensureMerkleRootEqual:"Merkle rootがリモートハッシュと一致しませんでした",ensureNotExpired:"この証明書の有効期限が切れています",getCaseInsensitiveKey:"取引が発行アドレスの有効期間外に行われました",ensureValidReceipt:"レシートが異常です。レシート内のMerkle treeを辿る際に問題が発生しました。",invalidMerkleReceipt:"Merkleレシートが無効です。証明ハッシュがMerkle rootと一致しませんでした。",invalidMerkleVersion:"Merkle version used for signature is incompatible with Blockcerts version.",isTransactionIdValid:"照合するための取引IDがないため、この証明書を認証できません。"}},"zh-CN":{steps:{formatValidationLabel:"格式检验",formatValidationLabelPending:"正在检验格式",hashComparisonLabel:"哈希校验",hashComparisonLabelPending:"正在校验哈希",statusCheckLabel:"状态检查",statusCheckLabelPending:"正在检查记录状态"},subSteps:{getTransactionIdLabel:"获取交易ID",getTransactionIdLabelPending:"正在获取交易ID",computeLocalHashLabel:"计算本地哈希",computeLocalHashLabelPending:"正在计算本地哈希",fetchRemoteHashLabel:"获取远程哈希",fetchRemoteHashLabelPending:"正在获取远程哈希",getIssuerProfileLabel:"获取发布者资料",getIssuerProfileLabelPending:"正在获取发布者资料",parseIssuerKeysLabel:"解析发布者公钥",parseIssuerKeysLabelPending:"正在解析发布者公钥",compareHashesLabel:"对比哈希",compareHashesLabelPending:"正在对比哈希",checkMerkleRootLabel:"检验Merkle Root",checkMerkleRootLabelPending:"正在检验Merkle Root",checkReceiptLabel:"检验被授予者",checkReceiptLabelPending:"正在检验被授予者",checkIssuerSignatureLabel:"检验发布者签名",checkIssuerSignatureLabelPending:"正在检验发布者签名",checkAuthenticityLabel:"检验真实性",checkAuthenticityLabelPending:"正在检验真实性",checkRevokedStatusLabel:"检验撤销状态",checkRevokedStatusLabelPending:"正在检验撤销状态",checkExpiresDateLabel:"检验过期时间",checkExpiresDateLabelPending:"正在检验过期时间"},revocation:{preReason:"理由：",reason:"该证书已被发布者撤回。"},success:{mocknet:{label:"This Mocknet credential passed all checks",description:"Mocknet credentials are used for test purposes only. They are not recorded on a blockchain, and they should not be considered verified Blockcerts."},blockchain:{label:"已验证",description:"这是一个有效的 ${chain} 证书",linkText:"查看交易链接"}},errors:{certificateNotValid:"这不是一个有效的证书",getChain:"无法识别的区块链",getTransactionId:"缺少交易ID导致无法验证此证书。",getIssuerProfile:"无法获取发布者资料",getRevokedAssertions:"无法获取撤销断言",lookForTxInvalidChain:"无效的区块链；无法映射到已知的 BlockchainExplorers 类型。",lookForTxInvalidAppConfig:"无效的应用配置；请检查 CONFIG.MinimumBlockchainExplorers 配置",lookForTxCouldNotConfirm:"无法确认交易。当前的区块链API均无响应。这可能是因为网络或API提供方限速导致的。",lookForTxDifferentAddresses:"与区块链API返回的发布者地址不一致",lookForTxDifferentRemoteHashes:"与区块链API返回的远程哈希不一致",parseIssuerKeys:"无法解析发布者id的JSON信息。",unableToGetRemoteHash:"无法获取远程哈希",parseBitpayResponse:"交易的确认次数小于最低要求（基于 Bitpay API）",parseBlockCypherResponse:"交易的确认次数小于最低要求（基于 Blockcypher API）",parseBlockexplorerResponse:"交易的确认次数小于最低要求（基于 Blockexplorer API）",parseBlockstreamResponse:"交易的确认次数小于最低要求（基于 Blockstream API）",checkEtherScanConfirmations:"交易的确认次数小于最低要求（基于 EtherScan API）",couldNotConfirmTx:"无法确认交易",failedJsonLdNormalization:"JSON-LD 标准化时失败",foundUnmappedFields:"JSON-LD 标准化时发现未映射的字段",ensureHashesEqual:"重新计算的哈希与远程哈希不匹配",ensureIssuerSignature:"发布者公钥与导出地址不一致。",ensureMerkleRootEqual:"Merkle Root 与远程哈希不匹配。",ensureNotExpired:"该证书已过期。",getCaseInsensitiveKey:"交易发生时间早于发布者地址生效时间。",ensureValidReceipt:"被授予人格式不正确。在浏览收据中的Merkle树时遇到错误。",invalidMerkleReceipt:"无效的 Merkle 收据。校验哈希与 Merkle Root不一致",invalidMerkleVersion:"用于签名的 Merkle 版本与 Blockcerts 使用的版本不兼容。",isTransactionIdValid:"缺少交易ID导致无法验证此证书。"}}};const h="fetchRemoteHash";function d(e,t){return f["zh-CN"].subSteps[`${e}${t}`]}const p={formatValidation:["getTransactionId","computeLocalHash",h,"getIssuerProfile","parseIssuerKeys"],hashComparison:["compareHashes","checkMerkleRoot","checkReceipt"],statusCheck:["checkIssuerSignature","checkAuthenticity","checkRevokedStatus","checkExpiresDate"]};const m=Object.keys(p).reduce((e,t)=>{return Object.assign(e,p[r=t].reduce((e,t)=>(e[t]={code:t,label:d(t,"Label"),labelPending:d(t,"LabelPending"),parentStep:r},e),{}));var r;},{});var v=Object.freeze({__proto__:null,getTransactionId:"getTransactionId",computeLocalHash:"computeLocalHash",fetchRemoteHash:h,getIssuerProfile:"getIssuerProfile",parseIssuerKeys:"parseIssuerKeys",compareHashes:"compareHashes",checkMerkleRoot:"checkMerkleRoot",checkReceipt:"checkReceipt",checkIssuerSignature:"checkIssuerSignature",checkAuthenticity:"checkAuthenticity",checkRevokedStatus:"checkRevokedStatus",checkExpiresDate:"checkExpiresDate",language:m});var g=Object.freeze({__proto__:null,FAILURE:"failure",STARTING:"starting",SUCCESS:"success"});const y={bitcoin:{code:"bitcoin",name:"Bitcoin",prefixes:["6a20","OP_RETURN "],signatureValue:"bitcoinMainnet",transactionTemplates:{full:"https://blockchain.info/tx/{TRANSACTION_ID}",raw:"https://blockchain.info/rawtx/{TRANSACTION_ID}"}},ethmain:{code:"ethmain",name:"Ethereum",prefixes:["0x"],signatureValue:"ethereumMainnet",transactionTemplates:{full:"https://etherscan.io/tx/{TRANSACTION_ID}",raw:"https://etherscan.io/tx/{TRANSACTION_ID}"}},ethropst:{code:"ethropst",name:"Ethereum Testnet",signatureValue:"ethereumRopsten",transactionTemplates:{full:"https://ropsten.etherscan.io/tx/{TRANSACTION_ID}",raw:"https://ropsten.etherscan.io/getRawTx?tx={TRANSACTION_ID}"}},ethrinkeby:{code:"ethrinkeby",name:"Ethereum Testnet",signatureValue:"ethereumRinkeby",transactionTemplates:{full:"https://rinkeby.etherscan.io/tx/{TRANSACTION_ID}",raw:"https://rinkeby.etherscan.io/getRawTx?tx={TRANSACTION_ID}"}},mocknet:{code:"mocknet",name:"Mocknet",test:!0,signatureValue:"mockchain",transactionTemplates:{full:"",raw:""}},regtest:{code:"regtest",name:"Mocknet",test:!0,signatureValue:"bitcoinRegtest",transactionTemplates:{full:"",raw:""}},testnet:{code:"testnet",name:"Bitcoin Testnet",signatureValue:"bitcoinTestnet",transactionTemplates:{full:"https://testnet.blockchain.info/tx/{TRANSACTION_ID}",raw:"https://testnet.blockchain.info/rawtx/{TRANSACTION_ID}"}}},b="mainnet",w="testnet";var _=1,S=1,E=!0,x="ecdsa-koblitz-pubkey:1";const I={locale:"zh-CN"};var k=Object.freeze({__proto__:null,isMainnet:function(t){return e(t,"1")||e(t,x)}});var P={locale:"zh-CN"};function O(e,t){return e&&t?f[P.locale]?f[P.locale][e]?f[P.locale][e][t]?f[P.locale][e][t]||"":"[missing locale item data]":"[missing locale group data]":"[missing locale data]":""}function T(){return Object.keys(f)}var A=Object.freeze({__proto__:null,detectLocale:function(){return navigator.language||navigator.userLanguage||navigator.browserLanguage||I.locale},ensureIsSupported:function(e){let t;const r=_i.i18n.getSupportedLanguages().map(e=>e.toLowerCase());if(t=r.indexOf(e.toLowerCase())>-1,!t){const n=e.substr(0,2).toLowerCase(),i=r.map(e=>e.split("-")[0]).indexOf(n);t=i>-1,t&&(e=r[i]);}return t||(e=I.locale),function(e){const t=e.split("-");return t.length>1?`${t[0].toLowerCase()}-${t[1].toUpperCase()}`:t[0].toLowerCase()}(e)},getText:O,getSupportedLanguages:T});function C(e=""){return k.isMainnet(e)?y.bitcoin:y.testnet}function R(e){const t=Object.entries(y).find(t=>t[1].signatureValue===e);if(void 0===t)throw new Error(O("errors","getChain"));return t[1]}class N{constructor(e,t,r,n){this.publicKey=e,this.created=t,this.revoked=r,this.expires=n;}}class L{constructor(e,t,r){this.image=e,this.jobTitle=t,this.name=r;}}class M{constructor(e,t,r,n){this.remoteHash=e,this.issuingAddress=t,this.time=r,this.revokedAddresses=n;}}class j extends Error{constructor(e,t){super(t),this.stepCode=e;}}var D=Object.freeze({__proto__:null,isMockChain:function(e){if(e){const t="string"==typeof e?e:e.code;return Object.keys(y).some(e=>e===t)?!!y[t].test:null}return null}});const B={[b]:["getTransactionId","computeLocalHash",h,"getIssuerProfile","parseIssuerKeys","compareHashes","checkMerkleRoot","checkReceipt","checkRevokedStatus","checkAuthenticity","checkExpiresDate"],[w]:["computeLocalHash","compareHashes","checkReceipt","checkExpiresDate"]};function U(e){const t=function(e){const t=JSON.parse(JSON.stringify(u));return e.forEach(e=>t[e.parentStep].subSteps.push(e)),t}(e.map(e=>({...Object.assign({},m[e]),label:O("subSteps",`${e}Label`),labelPending:O("subSteps",`${e}LabelPending`)})));return r=t,Object.keys(r).map(e=>({...r[e],code:e,label:O("steps",`${e}Label`),labelPending:O("steps",`${e}LabelPending`)}));var r;}var F=Object.freeze({__proto__:null,getChain:function(e,t=null){const r=t||{};if(r.anchors){const e=r.anchors[0];if(e.chain){return R(e.chain)}if("string"==typeof e)return function(e){const t={btc:{chainName:y.bitcoin.name},eth:{chainName:y.ethmain.name}},r=e.split(":"),n=r.findIndex(e=>Object.keys(t).indexOf(e)>-1);if(n>-1){const e=r[n],i=r[n+1];return R(t[e].chainName.toLowerCase()+function(e){const t=e.substr(0,1),r=e.substr(1,e.length-1);return t.toUpperCase()+r.toLowerCase()}(i))}return C()}(e)}return C(e)},generateRevocationReason:function(e){return e=(e=e.trim()).length>0?` ${O("revocation","preReason")} ${e}${"."!==e.slice(-1)?".":""}`:"",`${O("revocation","reason")}${e}`},getTransactionId:function(e={}){try{const{anchors:t}=e,r=t[0];if(r.sourceId)return r.sourceId;if("string"==typeof r){return r.split(":").pop()}}catch(e){throw new j("",O("errors","getTransactionId"))}},getTransactionLink:function(e,t,r=!1){return e&&t?t.transactionTemplates[r?"raw":"full"].replace("{TRANSACTION_ID}",e):""},getVerificationMap:function(e){if(!e)return [];const t=D.isMockChain(e)?w:b;return U(Object.assign(B)[t])}}),H="undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{},z=[],V=[],q="undefined"!=typeof Uint8Array?Uint8Array:Array,K=!1;function $(){K=!0;for(var e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",t=0,r=e.length;t<r;++t)z[t]=e[t],V[e.charCodeAt(t)]=t;V["-".charCodeAt(0)]=62,V["_".charCodeAt(0)]=63;}function G(e,t,r){for(var n,i,o=[],a=t;a<r;a+=3)n=(e[a]<<16)+(e[a+1]<<8)+e[a+2],o.push(z[(i=n)>>18&63]+z[i>>12&63]+z[i>>6&63]+z[63&i]);return o.join("")}function J(e){var t;K||$();for(var r=e.length,n=r%3,i="",o=[],a=0,s=r-n;a<s;a+=16383)o.push(G(e,a,a+16383>s?s:a+16383));return 1===n?(t=e[r-1],i+=z[t>>2],i+=z[t<<4&63],i+="=="):2===n&&(t=(e[r-2]<<8)+e[r-1],i+=z[t>>10],i+=z[t>>4&63],i+=z[t<<2&63],i+="="),o.push(i),o.join("")}function W(e,t,r,n,i){var o,a,s=8*i-n-1,c=(1<<s)-1,u=c>>1,l=-7,f=r?i-1:0,h=r?-1:1,d=e[t+f];for(f+=h,o=d&(1<<-l)-1,d>>=-l,l+=s;l>0;o=256*o+e[t+f],f+=h,l-=8);for(a=o&(1<<-l)-1,o>>=-l,l+=n;l>0;a=256*a+e[t+f],f+=h,l-=8);if(0===o)o=1-u;else {if(o===c)return a?NaN:1/0*(d?-1:1);a+=Math.pow(2,n),o-=u;}return (d?-1:1)*a*Math.pow(2,o-n)}function X(e,t,r,n,i,o){var a,s,c,u=8*o-i-1,l=(1<<u)-1,f=l>>1,h=23===i?Math.pow(2,-24)-Math.pow(2,-77):0,d=n?0:o-1,p=n?1:-1,m=t<0||0===t&&1/t<0?1:0;for(t=Math.abs(t),isNaN(t)||t===1/0?(s=isNaN(t)?1:0,a=l):(a=Math.floor(Math.log(t)/Math.LN2),t*(c=Math.pow(2,-a))<1&&(a--,c*=2),(t+=a+f>=1?h/c:h*Math.pow(2,1-f))*c>=2&&(a++,c/=2),a+f>=l?(s=0,a=l):a+f>=1?(s=(t*c-1)*Math.pow(2,i),a+=f):(s=t*Math.pow(2,f-1)*Math.pow(2,i),a=0));i>=8;e[r+d]=255&s,d+=p,s/=256,i-=8);for(a=a<<i|s,u+=i;u>0;e[r+d]=255&a,d+=p,a/=256,u-=8);e[r+d-p]|=128*m;}var Y={}.toString,Q=Array.isArray||function(e){return "[object Array]"==Y.call(e)};re.TYPED_ARRAY_SUPPORT=void 0===H.TYPED_ARRAY_SUPPORT||H.TYPED_ARRAY_SUPPORT;var Z=ee();function ee(){return re.TYPED_ARRAY_SUPPORT?2147483647:1073741823}function te(e,t){if(ee()<t)throw new RangeError("Invalid typed array length");return re.TYPED_ARRAY_SUPPORT?(e=new Uint8Array(t)).__proto__=re.prototype:(null===e&&(e=new re(t)),e.length=t),e}function re(e,t,r){if(!(re.TYPED_ARRAY_SUPPORT||this instanceof re))return new re(e,t,r);if("number"==typeof e){if("string"==typeof t)throw new Error("If encoding is specified then the first argument must be a string");return oe(this,e)}return ne(this,e,t,r)}function ne(e,t,r,n){if("number"==typeof t)throw new TypeError('"value" argument must not be a number');return "undefined"!=typeof ArrayBuffer&&t instanceof ArrayBuffer?function(e,t,r,n){if(t.byteLength,r<0||t.byteLength<r)throw new RangeError("'offset' is out of bounds");if(t.byteLength<r+(n||0))throw new RangeError("'length' is out of bounds");t=void 0===r&&void 0===n?new Uint8Array(t):void 0===n?new Uint8Array(t,r):new Uint8Array(t,r,n);re.TYPED_ARRAY_SUPPORT?(e=t).__proto__=re.prototype:e=ae(e,t);return e}(e,t,r,n):"string"==typeof t?function(e,t,r){"string"==typeof r&&""!==r||(r="utf8");if(!re.isEncoding(r))throw new TypeError('"encoding" must be a valid string encoding');var n=0|ue(t,r),i=(e=te(e,n)).write(t,r);i!==n&&(e=e.slice(0,i));return e}(e,t,r):function(e,t){if(ce(t)){var r=0|se(t.length);return 0===(e=te(e,r)).length||t.copy(e,0,0,r),e}if(t){if("undefined"!=typeof ArrayBuffer&&t.buffer instanceof ArrayBuffer||"length"in t)return "number"!=typeof t.length||(n=t.length)!=n?te(e,0):ae(e,t);if("Buffer"===t.type&&Q(t.data))return ae(e,t.data)}var n;throw new TypeError("First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.")}(e,t)}function ie(e){if("number"!=typeof e)throw new TypeError('"size" argument must be a number');if(e<0)throw new RangeError('"size" argument must not be negative')}function oe(e,t){if(ie(t),e=te(e,t<0?0:0|se(t)),!re.TYPED_ARRAY_SUPPORT)for(var r=0;r<t;++r)e[r]=0;return e}function ae(e,t){var r=t.length<0?0:0|se(t.length);e=te(e,r);for(var n=0;n<r;n+=1)e[n]=255&t[n];return e}function se(e){if(e>=ee())throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x"+ee().toString(16)+" bytes");return 0|e}function ce(e){return !(null==e||!e._isBuffer)}function ue(e,t){if(ce(e))return e.length;if("undefined"!=typeof ArrayBuffer&&"function"==typeof ArrayBuffer.isView&&(ArrayBuffer.isView(e)||e instanceof ArrayBuffer))return e.byteLength;"string"!=typeof e&&(e=""+e);var r=e.length;if(0===r)return 0;for(var n=!1;;)switch(t){case"ascii":case"latin1":case"binary":return r;case"utf8":case"utf-8":case void 0:return Me(e).length;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return 2*r;case"hex":return r>>>1;case"base64":return je(e).length;default:if(n)return Me(e).length;t=(""+t).toLowerCase(),n=!0;}}function le(e,t,r){var n=!1;if((void 0===t||t<0)&&(t=0),t>this.length)return "";if((void 0===r||r>this.length)&&(r=this.length),r<=0)return "";if((r>>>=0)<=(t>>>=0))return "";for(e||(e="utf8");;)switch(e){case"hex":return xe(this,t,r);case"utf8":case"utf-8":return _e(this,t,r);case"ascii":return Se(this,t,r);case"latin1":case"binary":return Ee(this,t,r);case"base64":return we(this,t,r);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return Ie(this,t,r);default:if(n)throw new TypeError("Unknown encoding: "+e);e=(e+"").toLowerCase(),n=!0;}}function fe(e,t,r){var n=e[t];e[t]=e[r],e[r]=n;}function he(e,t,r,n,i){if(0===e.length)return -1;if("string"==typeof r?(n=r,r=0):r>2147483647?r=2147483647:r<-2147483648&&(r=-2147483648),r=+r,isNaN(r)&&(r=i?0:e.length-1),r<0&&(r=e.length+r),r>=e.length){if(i)return -1;r=e.length-1;}else if(r<0){if(!i)return -1;r=0;}if("string"==typeof t&&(t=re.from(t,n)),ce(t))return 0===t.length?-1:de(e,t,r,n,i);if("number"==typeof t)return t&=255,re.TYPED_ARRAY_SUPPORT&&"function"==typeof Uint8Array.prototype.indexOf?i?Uint8Array.prototype.indexOf.call(e,t,r):Uint8Array.prototype.lastIndexOf.call(e,t,r):de(e,[t],r,n,i);throw new TypeError("val must be string, number or Buffer")}function de(e,t,r,n,i){var o,a=1,s=e.length,c=t.length;if(void 0!==n&&("ucs2"===(n=String(n).toLowerCase())||"ucs-2"===n||"utf16le"===n||"utf-16le"===n)){if(e.length<2||t.length<2)return -1;a=2,s/=2,c/=2,r/=2;}function u(e,t){return 1===a?e[t]:e.readUInt16BE(t*a)}if(i){var l=-1;for(o=r;o<s;o++)if(u(e,o)===u(t,-1===l?0:o-l)){if(-1===l&&(l=o),o-l+1===c)return l*a}else -1!==l&&(o-=o-l),l=-1;}else for(r+c>s&&(r=s-c),o=r;o>=0;o--){for(var f=!0,h=0;h<c;h++)if(u(e,o+h)!==u(t,h)){f=!1;break}if(f)return o}return -1}function pe(e,t,r,n){r=Number(r)||0;var i=e.length-r;n?(n=Number(n))>i&&(n=i):n=i;var o=t.length;if(o%2!=0)throw new TypeError("Invalid hex string");n>o/2&&(n=o/2);for(var a=0;a<n;++a){var s=parseInt(t.substr(2*a,2),16);if(isNaN(s))return a;e[r+a]=s;}return a}function me(e,t,r,n){return De(Me(t,e.length-r),e,r,n)}function ve(e,t,r,n){return De(function(e){for(var t=[],r=0;r<e.length;++r)t.push(255&e.charCodeAt(r));return t}(t),e,r,n)}function ge(e,t,r,n){return ve(e,t,r,n)}function ye(e,t,r,n){return De(je(t),e,r,n)}function be(e,t,r,n){return De(function(e,t){for(var r,n,i,o=[],a=0;a<e.length&&!((t-=2)<0);++a)r=e.charCodeAt(a),n=r>>8,i=r%256,o.push(i),o.push(n);return o}(t,e.length-r),e,r,n)}function we(e,t,r){return 0===t&&r===e.length?J(e):J(e.slice(t,r))}function _e(e,t,r){r=Math.min(e.length,r);for(var n=[],i=t;i<r;){var o,a,s,c,u=e[i],l=null,f=u>239?4:u>223?3:u>191?2:1;if(i+f<=r)switch(f){case 1:u<128&&(l=u);break;case 2:128==(192&(o=e[i+1]))&&(c=(31&u)<<6|63&o)>127&&(l=c);break;case 3:o=e[i+1],a=e[i+2],128==(192&o)&&128==(192&a)&&(c=(15&u)<<12|(63&o)<<6|63&a)>2047&&(c<55296||c>57343)&&(l=c);break;case 4:o=e[i+1],a=e[i+2],s=e[i+3],128==(192&o)&&128==(192&a)&&128==(192&s)&&(c=(15&u)<<18|(63&o)<<12|(63&a)<<6|63&s)>65535&&c<1114112&&(l=c);}null===l?(l=65533,f=1):l>65535&&(l-=65536,n.push(l>>>10&1023|55296),l=56320|1023&l),n.push(l),i+=f;}return function(e){var t=e.length;if(t<=4096)return String.fromCharCode.apply(String,e);var r="",n=0;for(;n<t;)r+=String.fromCharCode.apply(String,e.slice(n,n+=4096));return r}(n)}re.poolSize=8192,re._augment=function(e){return e.__proto__=re.prototype,e},re.from=function(e,t,r){return ne(null,e,t,r)},re.TYPED_ARRAY_SUPPORT&&(re.prototype.__proto__=Uint8Array.prototype,re.__proto__=Uint8Array),re.alloc=function(e,t,r){return function(e,t,r,n){return ie(t),t<=0?te(e,t):void 0!==r?"string"==typeof n?te(e,t).fill(r,n):te(e,t).fill(r):te(e,t)}(null,e,t,r)},re.allocUnsafe=function(e){return oe(null,e)},re.allocUnsafeSlow=function(e){return oe(null,e)},re.isBuffer=Be,re.compare=function(e,t){if(!ce(e)||!ce(t))throw new TypeError("Arguments must be Buffers");if(e===t)return 0;for(var r=e.length,n=t.length,i=0,o=Math.min(r,n);i<o;++i)if(e[i]!==t[i]){r=e[i],n=t[i];break}return r<n?-1:n<r?1:0},re.isEncoding=function(e){switch(String(e).toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"latin1":case"binary":case"base64":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return !0;default:return !1}},re.concat=function(e,t){if(!Q(e))throw new TypeError('"list" argument must be an Array of Buffers');if(0===e.length)return re.alloc(0);var r;if(void 0===t)for(t=0,r=0;r<e.length;++r)t+=e[r].length;var n=re.allocUnsafe(t),i=0;for(r=0;r<e.length;++r){var o=e[r];if(!ce(o))throw new TypeError('"list" argument must be an Array of Buffers');o.copy(n,i),i+=o.length;}return n},re.byteLength=ue,re.prototype._isBuffer=!0,re.prototype.swap16=function(){var e=this.length;if(e%2!=0)throw new RangeError("Buffer size must be a multiple of 16-bits");for(var t=0;t<e;t+=2)fe(this,t,t+1);return this},re.prototype.swap32=function(){var e=this.length;if(e%4!=0)throw new RangeError("Buffer size must be a multiple of 32-bits");for(var t=0;t<e;t+=4)fe(this,t,t+3),fe(this,t+1,t+2);return this},re.prototype.swap64=function(){var e=this.length;if(e%8!=0)throw new RangeError("Buffer size must be a multiple of 64-bits");for(var t=0;t<e;t+=8)fe(this,t,t+7),fe(this,t+1,t+6),fe(this,t+2,t+5),fe(this,t+3,t+4);return this},re.prototype.toString=function(){var e=0|this.length;return 0===e?"":0===arguments.length?_e(this,0,e):le.apply(this,arguments)},re.prototype.equals=function(e){if(!ce(e))throw new TypeError("Argument must be a Buffer");return this===e||0===re.compare(this,e)},re.prototype.inspect=function(){var e="";return this.length>0&&(e=this.toString("hex",0,50).match(/.{2}/g).join(" "),this.length>50&&(e+=" ... ")),"<Buffer "+e+">"},re.prototype.compare=function(e,t,r,n,i){if(!ce(e))throw new TypeError("Argument must be a Buffer");if(void 0===t&&(t=0),void 0===r&&(r=e?e.length:0),void 0===n&&(n=0),void 0===i&&(i=this.length),t<0||r>e.length||n<0||i>this.length)throw new RangeError("out of range index");if(n>=i&&t>=r)return 0;if(n>=i)return -1;if(t>=r)return 1;if(this===e)return 0;for(var o=(i>>>=0)-(n>>>=0),a=(r>>>=0)-(t>>>=0),s=Math.min(o,a),c=this.slice(n,i),u=e.slice(t,r),l=0;l<s;++l)if(c[l]!==u[l]){o=c[l],a=u[l];break}return o<a?-1:a<o?1:0},re.prototype.includes=function(e,t,r){return -1!==this.indexOf(e,t,r)},re.prototype.indexOf=function(e,t,r){return he(this,e,t,r,!0)},re.prototype.lastIndexOf=function(e,t,r){return he(this,e,t,r,!1)},re.prototype.write=function(e,t,r,n){if(void 0===t)n="utf8",r=this.length,t=0;else if(void 0===r&&"string"==typeof t)n=t,r=this.length,t=0;else {if(!isFinite(t))throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");t|=0,isFinite(r)?(r|=0,void 0===n&&(n="utf8")):(n=r,r=void 0);}var i=this.length-t;if((void 0===r||r>i)&&(r=i),e.length>0&&(r<0||t<0)||t>this.length)throw new RangeError("Attempt to write outside buffer bounds");n||(n="utf8");for(var o=!1;;)switch(n){case"hex":return pe(this,e,t,r);case"utf8":case"utf-8":return me(this,e,t,r);case"ascii":return ve(this,e,t,r);case"latin1":case"binary":return ge(this,e,t,r);case"base64":return ye(this,e,t,r);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return be(this,e,t,r);default:if(o)throw new TypeError("Unknown encoding: "+n);n=(""+n).toLowerCase(),o=!0;}},re.prototype.toJSON=function(){return {type:"Buffer",data:Array.prototype.slice.call(this._arr||this,0)}};function Se(e,t,r){var n="";r=Math.min(e.length,r);for(var i=t;i<r;++i)n+=String.fromCharCode(127&e[i]);return n}function Ee(e,t,r){var n="";r=Math.min(e.length,r);for(var i=t;i<r;++i)n+=String.fromCharCode(e[i]);return n}function xe(e,t,r){var n=e.length;(!t||t<0)&&(t=0),(!r||r<0||r>n)&&(r=n);for(var i="",o=t;o<r;++o)i+=Le(e[o]);return i}function Ie(e,t,r){for(var n=e.slice(t,r),i="",o=0;o<n.length;o+=2)i+=String.fromCharCode(n[o]+256*n[o+1]);return i}function ke(e,t,r){if(e%1!=0||e<0)throw new RangeError("offset is not uint");if(e+t>r)throw new RangeError("Trying to access beyond buffer length")}function Pe(e,t,r,n,i,o){if(!ce(e))throw new TypeError('"buffer" argument must be a Buffer instance');if(t>i||t<o)throw new RangeError('"value" argument is out of bounds');if(r+n>e.length)throw new RangeError("Index out of range")}function Oe(e,t,r,n){t<0&&(t=65535+t+1);for(var i=0,o=Math.min(e.length-r,2);i<o;++i)e[r+i]=(t&255<<8*(n?i:1-i))>>>8*(n?i:1-i);}function Te(e,t,r,n){t<0&&(t=4294967295+t+1);for(var i=0,o=Math.min(e.length-r,4);i<o;++i)e[r+i]=t>>>8*(n?i:3-i)&255;}function Ae(e,t,r,n,i,o){if(r+n>e.length)throw new RangeError("Index out of range");if(r<0)throw new RangeError("Index out of range")}function Ce(e,t,r,n,i){return i||Ae(e,0,r,4),X(e,t,r,n,23,4),r+4}function Re(e,t,r,n,i){return i||Ae(e,0,r,8),X(e,t,r,n,52,8),r+8}re.prototype.slice=function(e,t){var r,n=this.length;if((e=~~e)<0?(e+=n)<0&&(e=0):e>n&&(e=n),(t=void 0===t?n:~~t)<0?(t+=n)<0&&(t=0):t>n&&(t=n),t<e&&(t=e),re.TYPED_ARRAY_SUPPORT)(r=this.subarray(e,t)).__proto__=re.prototype;else {var i=t-e;r=new re(i,void 0);for(var o=0;o<i;++o)r[o]=this[o+e];}return r},re.prototype.readUIntLE=function(e,t,r){e|=0,t|=0,r||ke(e,t,this.length);for(var n=this[e],i=1,o=0;++o<t&&(i*=256);)n+=this[e+o]*i;return n},re.prototype.readUIntBE=function(e,t,r){e|=0,t|=0,r||ke(e,t,this.length);for(var n=this[e+--t],i=1;t>0&&(i*=256);)n+=this[e+--t]*i;return n},re.prototype.readUInt8=function(e,t){return t||ke(e,1,this.length),this[e]},re.prototype.readUInt16LE=function(e,t){return t||ke(e,2,this.length),this[e]|this[e+1]<<8},re.prototype.readUInt16BE=function(e,t){return t||ke(e,2,this.length),this[e]<<8|this[e+1]},re.prototype.readUInt32LE=function(e,t){return t||ke(e,4,this.length),(this[e]|this[e+1]<<8|this[e+2]<<16)+16777216*this[e+3]},re.prototype.readUInt32BE=function(e,t){return t||ke(e,4,this.length),16777216*this[e]+(this[e+1]<<16|this[e+2]<<8|this[e+3])},re.prototype.readIntLE=function(e,t,r){e|=0,t|=0,r||ke(e,t,this.length);for(var n=this[e],i=1,o=0;++o<t&&(i*=256);)n+=this[e+o]*i;return n>=(i*=128)&&(n-=Math.pow(2,8*t)),n},re.prototype.readIntBE=function(e,t,r){e|=0,t|=0,r||ke(e,t,this.length);for(var n=t,i=1,o=this[e+--n];n>0&&(i*=256);)o+=this[e+--n]*i;return o>=(i*=128)&&(o-=Math.pow(2,8*t)),o},re.prototype.readInt8=function(e,t){return t||ke(e,1,this.length),128&this[e]?-1*(255-this[e]+1):this[e]},re.prototype.readInt16LE=function(e,t){t||ke(e,2,this.length);var r=this[e]|this[e+1]<<8;return 32768&r?4294901760|r:r},re.prototype.readInt16BE=function(e,t){t||ke(e,2,this.length);var r=this[e+1]|this[e]<<8;return 32768&r?4294901760|r:r},re.prototype.readInt32LE=function(e,t){return t||ke(e,4,this.length),this[e]|this[e+1]<<8|this[e+2]<<16|this[e+3]<<24},re.prototype.readInt32BE=function(e,t){return t||ke(e,4,this.length),this[e]<<24|this[e+1]<<16|this[e+2]<<8|this[e+3]},re.prototype.readFloatLE=function(e,t){return t||ke(e,4,this.length),W(this,e,!0,23,4)},re.prototype.readFloatBE=function(e,t){return t||ke(e,4,this.length),W(this,e,!1,23,4)},re.prototype.readDoubleLE=function(e,t){return t||ke(e,8,this.length),W(this,e,!0,52,8)},re.prototype.readDoubleBE=function(e,t){return t||ke(e,8,this.length),W(this,e,!1,52,8)},re.prototype.writeUIntLE=function(e,t,r,n){(e=+e,t|=0,r|=0,n)||Pe(this,e,t,r,Math.pow(2,8*r)-1,0);var i=1,o=0;for(this[t]=255&e;++o<r&&(i*=256);)this[t+o]=e/i&255;return t+r},re.prototype.writeUIntBE=function(e,t,r,n){(e=+e,t|=0,r|=0,n)||Pe(this,e,t,r,Math.pow(2,8*r)-1,0);var i=r-1,o=1;for(this[t+i]=255&e;--i>=0&&(o*=256);)this[t+i]=e/o&255;return t+r},re.prototype.writeUInt8=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,1,255,0),re.TYPED_ARRAY_SUPPORT||(e=Math.floor(e)),this[t]=255&e,t+1},re.prototype.writeUInt16LE=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,2,65535,0),re.TYPED_ARRAY_SUPPORT?(this[t]=255&e,this[t+1]=e>>>8):Oe(this,e,t,!0),t+2},re.prototype.writeUInt16BE=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,2,65535,0),re.TYPED_ARRAY_SUPPORT?(this[t]=e>>>8,this[t+1]=255&e):Oe(this,e,t,!1),t+2},re.prototype.writeUInt32LE=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,4,4294967295,0),re.TYPED_ARRAY_SUPPORT?(this[t+3]=e>>>24,this[t+2]=e>>>16,this[t+1]=e>>>8,this[t]=255&e):Te(this,e,t,!0),t+4},re.prototype.writeUInt32BE=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,4,4294967295,0),re.TYPED_ARRAY_SUPPORT?(this[t]=e>>>24,this[t+1]=e>>>16,this[t+2]=e>>>8,this[t+3]=255&e):Te(this,e,t,!1),t+4},re.prototype.writeIntLE=function(e,t,r,n){if(e=+e,t|=0,!n){var i=Math.pow(2,8*r-1);Pe(this,e,t,r,i-1,-i);}var o=0,a=1,s=0;for(this[t]=255&e;++o<r&&(a*=256);)e<0&&0===s&&0!==this[t+o-1]&&(s=1),this[t+o]=(e/a>>0)-s&255;return t+r},re.prototype.writeIntBE=function(e,t,r,n){if(e=+e,t|=0,!n){var i=Math.pow(2,8*r-1);Pe(this,e,t,r,i-1,-i);}var o=r-1,a=1,s=0;for(this[t+o]=255&e;--o>=0&&(a*=256);)e<0&&0===s&&0!==this[t+o+1]&&(s=1),this[t+o]=(e/a>>0)-s&255;return t+r},re.prototype.writeInt8=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,1,127,-128),re.TYPED_ARRAY_SUPPORT||(e=Math.floor(e)),e<0&&(e=255+e+1),this[t]=255&e,t+1},re.prototype.writeInt16LE=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,2,32767,-32768),re.TYPED_ARRAY_SUPPORT?(this[t]=255&e,this[t+1]=e>>>8):Oe(this,e,t,!0),t+2},re.prototype.writeInt16BE=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,2,32767,-32768),re.TYPED_ARRAY_SUPPORT?(this[t]=e>>>8,this[t+1]=255&e):Oe(this,e,t,!1),t+2},re.prototype.writeInt32LE=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,4,2147483647,-2147483648),re.TYPED_ARRAY_SUPPORT?(this[t]=255&e,this[t+1]=e>>>8,this[t+2]=e>>>16,this[t+3]=e>>>24):Te(this,e,t,!0),t+4},re.prototype.writeInt32BE=function(e,t,r){return e=+e,t|=0,r||Pe(this,e,t,4,2147483647,-2147483648),e<0&&(e=4294967295+e+1),re.TYPED_ARRAY_SUPPORT?(this[t]=e>>>24,this[t+1]=e>>>16,this[t+2]=e>>>8,this[t+3]=255&e):Te(this,e,t,!1),t+4},re.prototype.writeFloatLE=function(e,t,r){return Ce(this,e,t,!0,r)},re.prototype.writeFloatBE=function(e,t,r){return Ce(this,e,t,!1,r)},re.prototype.writeDoubleLE=function(e,t,r){return Re(this,e,t,!0,r)},re.prototype.writeDoubleBE=function(e,t,r){return Re(this,e,t,!1,r)},re.prototype.copy=function(e,t,r,n){if(r||(r=0),n||0===n||(n=this.length),t>=e.length&&(t=e.length),t||(t=0),n>0&&n<r&&(n=r),n===r)return 0;if(0===e.length||0===this.length)return 0;if(t<0)throw new RangeError("targetStart out of bounds");if(r<0||r>=this.length)throw new RangeError("sourceStart out of bounds");if(n<0)throw new RangeError("sourceEnd out of bounds");n>this.length&&(n=this.length),e.length-t<n-r&&(n=e.length-t+r);var i,o=n-r;if(this===e&&r<t&&t<n)for(i=o-1;i>=0;--i)e[i+t]=this[i+r];else if(o<1e3||!re.TYPED_ARRAY_SUPPORT)for(i=0;i<o;++i)e[i+t]=this[i+r];else Uint8Array.prototype.set.call(e,this.subarray(r,r+o),t);return o},re.prototype.fill=function(e,t,r,n){if("string"==typeof e){if("string"==typeof t?(n=t,t=0,r=this.length):"string"==typeof r&&(n=r,r=this.length),1===e.length){var i=e.charCodeAt(0);i<256&&(e=i);}if(void 0!==n&&"string"!=typeof n)throw new TypeError("encoding must be a string");if("string"==typeof n&&!re.isEncoding(n))throw new TypeError("Unknown encoding: "+n)}else "number"==typeof e&&(e&=255);if(t<0||this.length<t||this.length<r)throw new RangeError("Out of range index");if(r<=t)return this;var o;if(t>>>=0,r=void 0===r?this.length:r>>>0,e||(e=0),"number"==typeof e)for(o=t;o<r;++o)this[o]=e;else {var a=ce(e)?e:Me(new re(e,n).toString()),s=a.length;for(o=0;o<r-t;++o)this[o+t]=a[o%s];}return this};var Ne=/[^+\/0-9A-Za-z-_]/g;function Le(e){return e<16?"0"+e.toString(16):e.toString(16)}function Me(e,t){var r;t=t||1/0;for(var n=e.length,i=null,o=[],a=0;a<n;++a){if((r=e.charCodeAt(a))>55295&&r<57344){if(!i){if(r>56319){(t-=3)>-1&&o.push(239,191,189);continue}if(a+1===n){(t-=3)>-1&&o.push(239,191,189);continue}i=r;continue}if(r<56320){(t-=3)>-1&&o.push(239,191,189),i=r;continue}r=65536+(i-55296<<10|r-56320);}else i&&(t-=3)>-1&&o.push(239,191,189);if(i=null,r<128){if((t-=1)<0)break;o.push(r);}else if(r<2048){if((t-=2)<0)break;o.push(r>>6|192,63&r|128);}else if(r<65536){if((t-=3)<0)break;o.push(r>>12|224,r>>6&63|128,63&r|128);}else {if(!(r<1114112))throw new Error("Invalid code point");if((t-=4)<0)break;o.push(r>>18|240,r>>12&63|128,r>>6&63|128,63&r|128);}}return o}function je(e){return function(e){var t,r,n,i,o,a;K||$();var s=e.length;if(s%4>0)throw new Error("Invalid string. Length must be a multiple of 4");o="="===e[s-2]?2:"="===e[s-1]?1:0,a=new q(3*s/4-o),n=o>0?s-4:s;var c=0;for(t=0,r=0;t<n;t+=4,r+=3)i=V[e.charCodeAt(t)]<<18|V[e.charCodeAt(t+1)]<<12|V[e.charCodeAt(t+2)]<<6|V[e.charCodeAt(t+3)],a[c++]=i>>16&255,a[c++]=i>>8&255,a[c++]=255&i;return 2===o?(i=V[e.charCodeAt(t)]<<2|V[e.charCodeAt(t+1)]>>4,a[c++]=255&i):1===o&&(i=V[e.charCodeAt(t)]<<10|V[e.charCodeAt(t+1)]<<4|V[e.charCodeAt(t+2)]>>2,a[c++]=i>>8&255,a[c++]=255&i),a}(function(e){if((e=function(e){return e.trim?e.trim():e.replace(/^\s+|\s+$/g,"")}(e).replace(Ne,"")).length<2)return "";for(;e.length%4!=0;)e+="=";return e}(e))}function De(e,t,r,n){for(var i=0;i<n&&!(i+r>=t.length||i>=e.length);++i)t[i+r]=e[i];return i}function Be(e){return null!=e&&(!!e._isBuffer||Ue(e)||function(e){return "function"==typeof e.readFloatLE&&"function"==typeof e.slice&&Ue(e.slice(0,0))}(e))}function Ue(e){return !!e.constructor&&"function"==typeof e.constructor.isBuffer&&e.constructor.isBuffer(e)}var Fe=Object.freeze({__proto__:null,INSPECT_MAX_BYTES:50,kMaxLength:Z,Buffer:re,SlowBuffer:function(e){return +e!=e&&(e=0),re.alloc(+e)},isBuffer:Be});function He(){throw new Error("setTimeout has not been defined")}function ze(){throw new Error("clearTimeout has not been defined")}var Ve=He,qe=ze;function Ke(e){if(Ve===setTimeout)return setTimeout(e,0);if((Ve===He||!Ve)&&setTimeout)return Ve=setTimeout,setTimeout(e,0);try{return Ve(e,0)}catch(t){try{return Ve.call(null,e,0)}catch(t){return Ve.call(this,e,0)}}}"function"==typeof H.setTimeout&&(Ve=setTimeout),"function"==typeof H.clearTimeout&&(qe=clearTimeout);var $e,Ge=[],Je=!1,We=-1;function Xe(){Je&&$e&&(Je=!1,$e.length?Ge=$e.concat(Ge):We=-1,Ge.length&&Ye());}function Ye(){if(!Je){var e=Ke(Xe);Je=!0;for(var t=Ge.length;t;){for($e=Ge,Ge=[];++We<t;)$e&&$e[We].run();We=-1,t=Ge.length;}$e=null,Je=!1,function(e){if(qe===clearTimeout)return clearTimeout(e);if((qe===ze||!qe)&&clearTimeout)return qe=clearTimeout,clearTimeout(e);try{qe(e);}catch(t){try{return qe.call(null,e)}catch(t){return qe.call(this,e)}}}(e);}}function Qe(e){var t=new Array(arguments.length-1);if(arguments.length>1)for(var r=1;r<arguments.length;r++)t[r-1]=arguments[r];Ge.push(new Ze(e,t)),1!==Ge.length||Je||Ke(Ye);}function Ze(e,t){this.fun=e,this.array=t;}Ze.prototype.run=function(){this.fun.apply(null,this.array);};function et(){}var tt=et,rt=et,nt=et,it=et,ot=et,at=et,st=et;var ct=H.performance||{},ut=ct.now||ct.mozNow||ct.msNow||ct.oNow||ct.webkitNow||function(){return (new Date).getTime()};var lt=new Date;var ft={nextTick:Qe,title:"browser",browser:!0,env:{},argv:[],version:"11.0.0",versions:{},on:tt,addListener:rt,once:nt,off:it,removeListener:ot,removeAllListeners:at,emit:st,binding:function(e){throw new Error("process.binding is not supported")},cwd:function(){return "/"},chdir:function(e){throw new Error("process.chdir is not supported")},umask:function(){return 0},hrtime:function(e){var t=.001*ut.call(ct),r=Math.floor(t),n=Math.floor(t%1*1e9);return e&&(r-=e[0],(n-=e[1])<0&&(r--,n+=1e9)),[r,n]},platform:"browser",release:{},config:{},uptime:function(){return (new Date-lt)/1e3}},ht=/[^\x20-\x7E]/,dt=/[\x2E\u3002\uFF0E\uFF61]/g,pt={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},mt=Math.floor,vt=String.fromCharCode;
  /*! https://mths.be/punycode v1.4.1 by @mathias */function gt(e){throw new RangeError(pt[e])}function yt(e,t){return e+22+75*(e<26)-((0!=t)<<5)}function bt(e,t,r){var n=0;for(e=r?mt(e/700):e>>1,e+=mt(e/t);e>455;n+=36)e=mt(e/35);return mt(n+36*e/(e+38))}function wt(e){return function(e,t){var r=e.split("@"),n="";r.length>1&&(n=r[0]+"@",e=r[1]);var i=function(e,t){for(var r=e.length,n=[];r--;)n[r]=t(e[r]);return n}((e=e.replace(dt,".")).split("."),t).join(".");return n+i}(e,(function(e){return ht.test(e)?"xn--"+function(e){var t,r,n,i,o,a,s,c,u,l,f,h,d,p,m,v=[];for(h=(e=function(e){for(var t,r,n=[],i=0,o=e.length;i<o;)(t=e.charCodeAt(i++))>=55296&&t<=56319&&i<o?56320==(64512&(r=e.charCodeAt(i++)))?n.push(((1023&t)<<10)+(1023&r)+65536):(n.push(t),i--):n.push(t);return n}(e)).length,t=128,r=0,o=72,a=0;a<h;++a)(f=e[a])<128&&v.push(vt(f));for(n=i=v.length,i&&v.push("-");n<h;){for(s=2147483647,a=0;a<h;++a)(f=e[a])>=t&&f<s&&(s=f);for(s-t>mt((2147483647-r)/(d=n+1))&&gt("overflow"),r+=(s-t)*d,t=s,a=0;a<h;++a)if((f=e[a])<t&&++r>2147483647&&gt("overflow"),f==t){for(c=r,u=36;!(c<(l=u<=o?1:u>=o+26?26:u-o));u+=36)m=c-l,p=36-l,v.push(vt(yt(l+m%p,0))),c=mt(m/p);v.push(vt(yt(c,0))),o=bt(r,d,n==i),r=0,++n;}++r,++t;}return v.join("")}(e):e}))}var _t="function"==typeof Object.create?function(e,t){e.super_=t,e.prototype=Object.create(t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}});}:function(e,t){e.super_=t;var r=function(){};r.prototype=t.prototype,e.prototype=new r,e.prototype.constructor=e;},St=/%[sdj%]/g;function Et(e){if(!Ut(e)){for(var t=[],r=0;r<arguments.length;r++)t.push(Ot(arguments[r]));return t.join(" ")}r=1;for(var n=arguments,i=n.length,o=String(e).replace(St,(function(e){if("%%"===e)return "%";if(r>=i)return e;switch(e){case"%s":return String(n[r++]);case"%d":return Number(n[r++]);case"%j":try{return JSON.stringify(n[r++])}catch(e){return "[Circular]"}default:return e}})),a=n[r];r<i;a=n[++r])jt(a)||!zt(a)?o+=" "+a:o+=" "+Ot(a);return o}function xt(e,t){if(Ft(H.process))return function(){return xt(e,t).apply(this,arguments)};var r=!1;return function(){return r||(console.error(t),r=!0),e.apply(this,arguments)}}var It,kt={};function Pt(e){if(Ft(It)&&(It=""),e=e.toUpperCase(),!kt[e])if(new RegExp("\\b"+e+"\\b","i").test(It)){kt[e]=function(){var t=Et.apply(null,arguments);console.error("%s %d: %s",e,0,t);};}else kt[e]=function(){};return kt[e]}function Ot(e,t){var r={seen:[],stylize:At};return arguments.length>=3&&(r.depth=arguments[2]),arguments.length>=4&&(r.colors=arguments[3]),Mt(t)?r.showHidden=t:t&&Xt(r,t),Ft(r.showHidden)&&(r.showHidden=!1),Ft(r.depth)&&(r.depth=2),Ft(r.colors)&&(r.colors=!1),Ft(r.customInspect)&&(r.customInspect=!0),r.colors&&(r.stylize=Tt),Ct(r,e,r.depth)}function Tt(e,t){var r=Ot.styles[t];return r?"["+Ot.colors[r][0]+"m"+e+"["+Ot.colors[r][1]+"m":e}function At(e,t){return e}function Ct(e,t,r){if(e.customInspect&&t&&Kt(t.inspect)&&t.inspect!==Ot&&(!t.constructor||t.constructor.prototype!==t)){var n=t.inspect(r,e);return Ut(n)||(n=Ct(e,n,r)),n}var i=function(e,t){if(Ft(t))return e.stylize("undefined","undefined");if(Ut(t)){var r="'"+JSON.stringify(t).replace(/^"|"$/g,"").replace(/'/g,"\\'").replace(/\\"/g,'"')+"'";return e.stylize(r,"string")}if(Bt(t))return e.stylize(""+t,"number");if(Mt(t))return e.stylize(""+t,"boolean");if(jt(t))return e.stylize("null","null")}(e,t);if(i)return i;var o=Object.keys(t),a=function(e){var t={};return e.forEach((function(e,r){t[e]=!0;})),t}(o);if(e.showHidden&&(o=Object.getOwnPropertyNames(t)),qt(t)&&(o.indexOf("message")>=0||o.indexOf("description")>=0))return Rt(t);if(0===o.length){if(Kt(t)){var s=t.name?": "+t.name:"";return e.stylize("[Function"+s+"]","special")}if(Ht(t))return e.stylize(RegExp.prototype.toString.call(t),"regexp");if(Vt(t))return e.stylize(Date.prototype.toString.call(t),"date");if(qt(t))return Rt(t)}var c,u="",l=!1,f=["{","}"];(Lt(t)&&(l=!0,f=["[","]"]),Kt(t))&&(u=" [Function"+(t.name?": "+t.name:"")+"]");return Ht(t)&&(u=" "+RegExp.prototype.toString.call(t)),Vt(t)&&(u=" "+Date.prototype.toUTCString.call(t)),qt(t)&&(u=" "+Rt(t)),0!==o.length||l&&0!=t.length?r<0?Ht(t)?e.stylize(RegExp.prototype.toString.call(t),"regexp"):e.stylize("[Object]","special"):(e.seen.push(t),c=l?function(e,t,r,n,i){for(var o=[],a=0,s=t.length;a<s;++a)Yt(t,String(a))?o.push(Nt(e,t,r,n,String(a),!0)):o.push("");return i.forEach((function(i){i.match(/^\d+$/)||o.push(Nt(e,t,r,n,i,!0));})),o}(e,t,r,a,o):o.map((function(n){return Nt(e,t,r,a,n,l)})),e.seen.pop(),function(e,t,r){if(e.reduce((function(e,t){return t.indexOf("\n"),e+t.replace(/\u001b\[\d\d?m/g,"").length+1}),0)>60)return r[0]+(""===t?"":t+"\n ")+" "+e.join(",\n  ")+" "+r[1];return r[0]+t+" "+e.join(", ")+" "+r[1]}(c,u,f)):f[0]+u+f[1]}function Rt(e){return "["+Error.prototype.toString.call(e)+"]"}function Nt(e,t,r,n,i,o){var a,s,c;if((c=Object.getOwnPropertyDescriptor(t,i)||{value:t[i]}).get?s=c.set?e.stylize("[Getter/Setter]","special"):e.stylize("[Getter]","special"):c.set&&(s=e.stylize("[Setter]","special")),Yt(n,i)||(a="["+i+"]"),s||(e.seen.indexOf(c.value)<0?(s=jt(r)?Ct(e,c.value,null):Ct(e,c.value,r-1)).indexOf("\n")>-1&&(s=o?s.split("\n").map((function(e){return "  "+e})).join("\n").substr(2):"\n"+s.split("\n").map((function(e){return "   "+e})).join("\n")):s=e.stylize("[Circular]","special")),Ft(a)){if(o&&i.match(/^\d+$/))return s;(a=JSON.stringify(""+i)).match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)?(a=a.substr(1,a.length-2),a=e.stylize(a,"name")):(a=a.replace(/'/g,"\\'").replace(/\\"/g,'"').replace(/(^"|"$)/g,"'"),a=e.stylize(a,"string"));}return a+": "+s}function Lt(e){return Array.isArray(e)}function Mt(e){return "boolean"==typeof e}function jt(e){return null===e}function Dt(e){return null==e}function Bt(e){return "number"==typeof e}function Ut(e){return "string"==typeof e}function Ft(e){return void 0===e}function Ht(e){return zt(e)&&"[object RegExp]"===$t(e)}function zt(e){return "object"==typeof e&&null!==e}function Vt(e){return zt(e)&&"[object Date]"===$t(e)}function qt(e){return zt(e)&&("[object Error]"===$t(e)||e instanceof Error)}function Kt(e){return "function"==typeof e}function $t(e){return Object.prototype.toString.call(e)}function Gt(e){return e<10?"0"+e.toString(10):e.toString(10)}Ot.colors={bold:[1,22],italic:[3,23],underline:[4,24],inverse:[7,27],white:[37,39],grey:[90,39],black:[30,39],blue:[34,39],cyan:[36,39],green:[32,39],magenta:[35,39],red:[31,39],yellow:[33,39]},Ot.styles={special:"cyan",number:"yellow",boolean:"yellow",undefined:"grey",null:"bold",string:"green",date:"magenta",regexp:"red"};var Jt=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];function Wt(){var e=new Date,t=[Gt(e.getHours()),Gt(e.getMinutes()),Gt(e.getSeconds())].join(":");return [e.getDate(),Jt[e.getMonth()],t].join(" ")}function Xt(e,t){if(!t||!zt(t))return e;for(var r=Object.keys(t),n=r.length;n--;)e[r[n]]=t[r[n]];return e}function Yt(e,t){return Object.prototype.hasOwnProperty.call(e,t)}var Qt={inherits:_t,_extend:Xt,log:function(){console.log("%s - %s",Wt(),Et.apply(null,arguments));},isBuffer:function(e){return Be(e)},isPrimitive:function(e){return null===e||"boolean"==typeof e||"number"==typeof e||"string"==typeof e||"symbol"==typeof e||void 0===e},isFunction:Kt,isError:qt,isDate:Vt,isObject:zt,isRegExp:Ht,isUndefined:Ft,isSymbol:function(e){return "symbol"==typeof e},isString:Ut,isNumber:Bt,isNullOrUndefined:Dt,isNull:jt,isBoolean:Mt,isArray:Lt,inspect:Ot,deprecate:xt,format:Et,debuglog:Pt};function Zt(e,t){return Object.prototype.hasOwnProperty.call(e,t)}var er=Array.isArray||function(e){return "[object Array]"===Object.prototype.toString.call(e)};function tr(e){switch(typeof e){case"string":return e;case"boolean":return e?"true":"false";case"number":return isFinite(e)?e:"";default:return ""}}function rr(e,t){if(e.map)return e.map(t);for(var r=[],n=0;n<e.length;n++)r.push(t(e[n],n));return r}var nr=Object.keys||function(e){var t=[];for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&t.push(r);return t};function ir(e,t,r,n){t=t||"&",r=r||"=";var i={};if("string"!=typeof e||0===e.length)return i;var o=/\+/g;e=e.split(t);var a=1e3;n&&"number"==typeof n.maxKeys&&(a=n.maxKeys);var s=e.length;a>0&&s>a&&(s=a);for(var c=0;c<s;++c){var u,l,f,h,d=e[c].replace(o,"%20"),p=d.indexOf(r);p>=0?(u=d.substr(0,p),l=d.substr(p+1)):(u=d,l=""),f=decodeURIComponent(u),h=decodeURIComponent(l),Zt(i,f)?er(i[f])?i[f].push(h):i[f]=[i[f],h]:i[f]=h;}return i}var or={parse:br,resolve:function(e,t){return br(e,!1,!0).resolve(t)},resolveObject:function(e,t){return e?br(e,!1,!0).resolveObject(t):t},format:function(e){Ut(e)&&(e=wr({},e));return _r(e)},Url:ar};function ar(){this.protocol=null,this.slashes=null,this.auth=null,this.host=null,this.port=null,this.hostname=null,this.hash=null,this.search=null,this.query=null,this.pathname=null,this.path=null,this.href=null;}var sr=/^([a-z0-9.+-]+:)/i,cr=/:[0-9]*$/,ur=/^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,lr=["{","}","|","\\","^","`"].concat(["<",">",'"',"`"," ","\r","\n","\t"]),fr=["'"].concat(lr),hr=["%","/","?",";","#"].concat(fr),dr=["/","?","#"],pr=/^[+a-z0-9A-Z_-]{0,63}$/,mr=/^([+a-z0-9A-Z_-]{0,63})(.*)$/,vr={javascript:!0,"javascript:":!0},gr={javascript:!0,"javascript:":!0},yr={http:!0,https:!0,ftp:!0,gopher:!0,file:!0,"http:":!0,"https:":!0,"ftp:":!0,"gopher:":!0,"file:":!0};function br(e,t,r){if(e&&zt(e)&&e instanceof ar)return e;var n=new ar;return n.parse(e,t,r),n}function wr(e,t,r,n){if(!Ut(t))throw new TypeError("Parameter 'url' must be a string, not "+typeof t);var i=t.indexOf("?"),o=-1!==i&&i<t.indexOf("#")?"?":"#",a=t.split(o);a[0]=a[0].replace(/\\/g,"/");var s=t=a.join(o);if(s=s.trim(),!n&&1===t.split("#").length){var c=ur.exec(s);if(c)return e.path=s,e.href=s,e.pathname=c[1],c[2]?(e.search=c[2],e.query=r?ir(e.search.substr(1)):e.search.substr(1)):r&&(e.search="",e.query={}),e}var u,l,f,h,d=sr.exec(s);if(d){var p=(d=d[0]).toLowerCase();e.protocol=p,s=s.substr(d.length);}if(n||d||s.match(/^\/\/[^@\/]+@[^@\/]+/)){var m="//"===s.substr(0,2);!m||d&&gr[d]||(s=s.substr(2),e.slashes=!0);}if(!gr[d]&&(m||d&&!yr[d])){var v,g,y=-1;for(u=0;u<dr.length;u++)-1!==(l=s.indexOf(dr[u]))&&(-1===y||l<y)&&(y=l);for(-1!==(g=-1===y?s.lastIndexOf("@"):s.lastIndexOf("@",y))&&(v=s.slice(0,g),s=s.slice(g+1),e.auth=decodeURIComponent(v)),y=-1,u=0;u<hr.length;u++)-1!==(l=s.indexOf(hr[u]))&&(-1===y||l<y)&&(y=l);-1===y&&(y=s.length),e.host=s.slice(0,y),s=s.slice(y),Sr(e),e.hostname=e.hostname||"";var b="["===e.hostname[0]&&"]"===e.hostname[e.hostname.length-1];if(!b){var w=e.hostname.split(/\./);for(u=0,f=w.length;u<f;u++){var _=w[u];if(_&&!_.match(pr)){for(var S="",E=0,x=_.length;E<x;E++)_.charCodeAt(E)>127?S+="x":S+=_[E];if(!S.match(pr)){var I=w.slice(0,u),k=w.slice(u+1),P=_.match(mr);P&&(I.push(P[1]),k.unshift(P[2])),k.length&&(s="/"+k.join(".")+s),e.hostname=I.join(".");break}}}}e.hostname.length>255?e.hostname="":e.hostname=e.hostname.toLowerCase(),b||(e.hostname=wt(e.hostname)),h=e.port?":"+e.port:"";var O=e.hostname||"";e.host=O+h,e.href+=e.host,b&&(e.hostname=e.hostname.substr(1,e.hostname.length-2),"/"!==s[0]&&(s="/"+s));}if(!vr[p])for(u=0,f=fr.length;u<f;u++){var T=fr[u];if(-1!==s.indexOf(T)){var A=encodeURIComponent(T);A===T&&(A=escape(T)),s=s.split(T).join(A);}}var C=s.indexOf("#");-1!==C&&(e.hash=s.substr(C),s=s.slice(0,C));var R=s.indexOf("?");if(-1!==R?(e.search=s.substr(R),e.query=s.substr(R+1),r&&(e.query=ir(e.query)),s=s.slice(0,R)):r&&(e.search="",e.query={}),s&&(e.pathname=s),yr[p]&&e.hostname&&!e.pathname&&(e.pathname="/"),e.pathname||e.search){h=e.pathname||"";var N=e.search||"";e.path=h+N;}return e.href=_r(e),e}function _r(e){var t=e.auth||"";t&&(t=(t=encodeURIComponent(t)).replace(/%3A/i,":"),t+="@");var r=e.protocol||"",n=e.pathname||"",i=e.hash||"",o=!1,a="";e.host?o=t+e.host:e.hostname&&(o=t+(-1===e.hostname.indexOf(":")?e.hostname:"["+this.hostname+"]"),e.port&&(o+=":"+e.port)),e.query&&zt(e.query)&&Object.keys(e.query).length&&(a=function(e,t,r,n){return t=t||"&",r=r||"=",null===e&&(e=void 0),"object"==typeof e?rr(nr(e),(function(n){var i=encodeURIComponent(tr(n))+r;return er(e[n])?rr(e[n],(function(e){return i+encodeURIComponent(tr(e))})).join(t):i+encodeURIComponent(tr(e[n]))})).join(t):n?encodeURIComponent(tr(n))+r+encodeURIComponent(tr(e)):""}(e.query));var s=e.search||a&&"?"+a||"";return r&&":"!==r.substr(-1)&&(r+=":"),e.slashes||(!r||yr[r])&&!1!==o?(o="//"+(o||""),n&&"/"!==n.charAt(0)&&(n="/"+n)):o||(o=""),i&&"#"!==i.charAt(0)&&(i="#"+i),s&&"?"!==s.charAt(0)&&(s="?"+s),r+o+(n=n.replace(/[?#]/g,(function(e){return encodeURIComponent(e)})))+(s=s.replace("#","%23"))+i}function Sr(e){var t=e.host,r=cr.exec(t);r&&(":"!==(r=r[0])&&(e.port=r.substr(1)),t=t.substr(0,t.length-r.length)),t&&(e.hostname=t);}ar.prototype.parse=function(e,t,r){return wr(this,e,t,r)},ar.prototype.format=function(){return _r(this)},ar.prototype.resolve=function(e){return this.resolveObject(br(e,!1,!0)).format()},ar.prototype.resolveObject=function(e){if(Ut(e)){var t=new ar;t.parse(e,!1,!0),e=t;}for(var r,n=new ar,i=Object.keys(this),o=0;o<i.length;o++){var a=i[o];n[a]=this[a];}if(n.hash=e.hash,""===e.href)return n.href=n.format(),n;if(e.slashes&&!e.protocol){for(var s=Object.keys(e),c=0;c<s.length;c++){var u=s[c];"protocol"!==u&&(n[u]=e[u]);}return yr[n.protocol]&&n.hostname&&!n.pathname&&(n.path=n.pathname="/"),n.href=n.format(),n}if(e.protocol&&e.protocol!==n.protocol){if(!yr[e.protocol]){for(var l=Object.keys(e),f=0;f<l.length;f++){var h=l[f];n[h]=e[h];}return n.href=n.format(),n}if(n.protocol=e.protocol,e.host||gr[e.protocol])n.pathname=e.pathname;else {for(r=(e.pathname||"").split("/");r.length&&!(e.host=r.shift()););e.host||(e.host=""),e.hostname||(e.hostname=""),""!==r[0]&&r.unshift(""),r.length<2&&r.unshift(""),n.pathname=r.join("/");}if(n.search=e.search,n.query=e.query,n.host=e.host||"",n.auth=e.auth,n.hostname=e.hostname||e.host,n.port=e.port,n.pathname||n.search){var d=n.pathname||"",p=n.search||"";n.path=d+p;}return n.slashes=n.slashes||e.slashes,n.href=n.format(),n}var m,v=n.pathname&&"/"===n.pathname.charAt(0),g=e.host||e.pathname&&"/"===e.pathname.charAt(0),y=g||v||n.host&&e.pathname,b=y,w=n.pathname&&n.pathname.split("/")||[],_=n.protocol&&!yr[n.protocol];if(r=e.pathname&&e.pathname.split("/")||[],_&&(n.hostname="",n.port=null,n.host&&(""===w[0]?w[0]=n.host:w.unshift(n.host)),n.host="",e.protocol&&(e.hostname=null,e.port=null,e.host&&(""===r[0]?r[0]=e.host:r.unshift(e.host)),e.host=null),y=y&&(""===r[0]||""===w[0])),g)n.host=e.host||""===e.host?e.host:n.host,n.hostname=e.hostname||""===e.hostname?e.hostname:n.hostname,n.search=e.search,n.query=e.query,w=r;else if(r.length)w||(w=[]),w.pop(),w=w.concat(r),n.search=e.search,n.query=e.query;else if(!Dt(e.search))return _&&(n.hostname=n.host=w.shift(),(m=!!(n.host&&n.host.indexOf("@")>0)&&n.host.split("@"))&&(n.auth=m.shift(),n.host=n.hostname=m.shift())),n.search=e.search,n.query=e.query,jt(n.pathname)&&jt(n.search)||(n.path=(n.pathname?n.pathname:"")+(n.search?n.search:"")),n.href=n.format(),n;if(!w.length)return n.pathname=null,n.search?n.path="/"+n.search:n.path=null,n.href=n.format(),n;for(var S=w.slice(-1)[0],E=(n.host||e.host||w.length>1)&&("."===S||".."===S)||""===S,x=0,I=w.length;I>=0;I--)"."===(S=w[I])?w.splice(I,1):".."===S?(w.splice(I,1),x++):x&&(w.splice(I,1),x--);if(!y&&!b)for(;x--;x)w.unshift("..");!y||""===w[0]||w[0]&&"/"===w[0].charAt(0)||w.unshift(""),E&&"/"!==w.join("/").substr(-1)&&w.push("");var k=""===w[0]||w[0]&&"/"===w[0].charAt(0);return _&&(n.hostname=n.host=k?"":w.length?w.shift():"",(m=!!(n.host&&n.host.indexOf("@")>0)&&n.host.split("@"))&&(n.auth=m.shift(),n.host=n.hostname=m.shift())),(y=y||n.host&&w.length)&&!k&&w.unshift(""),w.length?n.pathname=w.join("/"):(n.pathname=null,n.path=null),jt(n.pathname)&&jt(n.search)||(n.path=(n.pathname?n.pathname:"")+(n.search?n.search:"")),n.auth=e.auth||n.auth,n.slashes=n.slashes||e.slashes,n.href=n.format(),n},ar.prototype.parseHost=function(){return Sr(this)};var Er,xr,Ir={},kr=Mr(H.fetch)&&Mr(H.ReadableStream);function Pr(e){xr||(xr=new H.XMLHttpRequest).open("GET",H.location.host?"/":"https://example.com");try{return xr.responseType=e,xr.responseType===e}catch(e){return !1}}var Or=void 0!==H.ArrayBuffer,Tr=Or&&Mr(H.ArrayBuffer.prototype.slice),Ar=Or&&Pr("arraybuffer"),Cr=!kr&&Tr&&Pr("ms-stream"),Rr=!kr&&Or&&Pr("moz-chunked-arraybuffer"),Nr=Mr(xr.overrideMimeType),Lr=Mr(H.VBArray);function Mr(e){return "function"==typeof e}function jr(){}function Dr(){Dr.init.call(this);}function Br(e){return void 0===e._maxListeners?Dr.defaultMaxListeners:e._maxListeners}function Ur(e,t,r){if(t)e.call(r);else for(var n=e.length,i=Gr(e,n),o=0;o<n;++o)i[o].call(r);}function Fr(e,t,r,n){if(t)e.call(r,n);else for(var i=e.length,o=Gr(e,i),a=0;a<i;++a)o[a].call(r,n);}function Hr(e,t,r,n,i){if(t)e.call(r,n,i);else for(var o=e.length,a=Gr(e,o),s=0;s<o;++s)a[s].call(r,n,i);}function zr(e,t,r,n,i,o){if(t)e.call(r,n,i,o);else for(var a=e.length,s=Gr(e,a),c=0;c<a;++c)s[c].call(r,n,i,o);}function Vr(e,t,r,n){if(t)e.apply(r,n);else for(var i=e.length,o=Gr(e,i),a=0;a<i;++a)o[a].apply(r,n);}function qr(e,t,r,n){var i,o,a,s;if("function"!=typeof r)throw new TypeError('"listener" argument must be a function');if((o=e._events)?(o.newListener&&(e.emit("newListener",t,r.listener?r.listener:r),o=e._events),a=o[t]):(o=e._events=new jr,e._eventsCount=0),a){if("function"==typeof a?a=o[t]=n?[r,a]:[a,r]:n?a.unshift(r):a.push(r),!a.warned&&(i=Br(e))&&i>0&&a.length>i){a.warned=!0;var c=new Error("Possible EventEmitter memory leak detected. "+a.length+" "+t+" listeners added. Use emitter.setMaxListeners() to increase limit");c.name="MaxListenersExceededWarning",c.emitter=e,c.type=t,c.count=a.length,s=c,"function"==typeof console.warn?console.warn(s):console.log(s);}}else a=o[t]=r,++e._eventsCount;return e}function Kr(e,t,r){var n=!1;function i(){e.removeListener(t,i),n||(n=!0,r.apply(e,arguments));}return i.listener=r,i}function $r(e){var t=this._events;if(t){var r=t[e];if("function"==typeof r)return 1;if(r)return r.length}return 0}function Gr(e,t){for(var r=new Array(t);t--;)r[t]=e[t];return r}function Jr(){this.head=null,this.tail=null,this.length=0;}xr=null,jr.prototype=Object.create(null),Dr.EventEmitter=Dr,Dr.usingDomains=!1,Dr.prototype.domain=void 0,Dr.prototype._events=void 0,Dr.prototype._maxListeners=void 0,Dr.defaultMaxListeners=10,Dr.init=function(){this.domain=null,Dr.usingDomains&&(void 0).active,this._events&&this._events!==Object.getPrototypeOf(this)._events||(this._events=new jr,this._eventsCount=0),this._maxListeners=this._maxListeners||void 0;},Dr.prototype.setMaxListeners=function(e){if("number"!=typeof e||e<0||isNaN(e))throw new TypeError('"n" argument must be a positive number');return this._maxListeners=e,this},Dr.prototype.getMaxListeners=function(){return Br(this)},Dr.prototype.emit=function(e){var t,r,n,i,o,a,s,c="error"===e;if(a=this._events)c=c&&null==a.error;else if(!c)return !1;if(s=this.domain,c){if(t=arguments[1],!s){if(t instanceof Error)throw t;var u=new Error('Uncaught, unspecified "error" event. ('+t+")");throw u.context=t,u}return t||(t=new Error('Uncaught, unspecified "error" event')),t.domainEmitter=this,t.domain=s,t.domainThrown=!1,s.emit("error",t),!1}if(!(r=a[e]))return !1;var l="function"==typeof r;switch(n=arguments.length){case 1:Ur(r,l,this);break;case 2:Fr(r,l,this,arguments[1]);break;case 3:Hr(r,l,this,arguments[1],arguments[2]);break;case 4:zr(r,l,this,arguments[1],arguments[2],arguments[3]);break;default:for(i=new Array(n-1),o=1;o<n;o++)i[o-1]=arguments[o];Vr(r,l,this,i);}return !0},Dr.prototype.addListener=function(e,t){return qr(this,e,t,!1)},Dr.prototype.on=Dr.prototype.addListener,Dr.prototype.prependListener=function(e,t){return qr(this,e,t,!0)},Dr.prototype.once=function(e,t){if("function"!=typeof t)throw new TypeError('"listener" argument must be a function');return this.on(e,Kr(this,e,t)),this},Dr.prototype.prependOnceListener=function(e,t){if("function"!=typeof t)throw new TypeError('"listener" argument must be a function');return this.prependListener(e,Kr(this,e,t)),this},Dr.prototype.removeListener=function(e,t){var r,n,i,o,a;if("function"!=typeof t)throw new TypeError('"listener" argument must be a function');if(!(n=this._events))return this;if(!(r=n[e]))return this;if(r===t||r.listener&&r.listener===t)0==--this._eventsCount?this._events=new jr:(delete n[e],n.removeListener&&this.emit("removeListener",e,r.listener||t));else if("function"!=typeof r){for(i=-1,o=r.length;o-- >0;)if(r[o]===t||r[o].listener&&r[o].listener===t){a=r[o].listener,i=o;break}if(i<0)return this;if(1===r.length){if(r[0]=void 0,0==--this._eventsCount)return this._events=new jr,this;delete n[e];}else !function(e,t){for(var r=t,n=r+1,i=e.length;n<i;r+=1,n+=1)e[r]=e[n];e.pop();}(r,i);n.removeListener&&this.emit("removeListener",e,a||t);}return this},Dr.prototype.removeAllListeners=function(e){var t,r;if(!(r=this._events))return this;if(!r.removeListener)return 0===arguments.length?(this._events=new jr,this._eventsCount=0):r[e]&&(0==--this._eventsCount?this._events=new jr:delete r[e]),this;if(0===arguments.length){for(var n,i=Object.keys(r),o=0;o<i.length;++o)"removeListener"!==(n=i[o])&&this.removeAllListeners(n);return this.removeAllListeners("removeListener"),this._events=new jr,this._eventsCount=0,this}if("function"==typeof(t=r[e]))this.removeListener(e,t);else if(t)do{this.removeListener(e,t[t.length-1]);}while(t[0]);return this},Dr.prototype.listeners=function(e){var t,r=this._events;return r&&(t=r[e])?"function"==typeof t?[t.listener||t]:function(e){for(var t=new Array(e.length),r=0;r<t.length;++r)t[r]=e[r].listener||e[r];return t}(t):[]},Dr.listenerCount=function(e,t){return "function"==typeof e.listenerCount?e.listenerCount(t):$r.call(e,t)},Dr.prototype.listenerCount=$r,Dr.prototype.eventNames=function(){return this._eventsCount>0?Reflect.ownKeys(this._events):[]},Jr.prototype.push=function(e){var t={data:e,next:null};this.length>0?this.tail.next=t:this.head=t,this.tail=t,++this.length;},Jr.prototype.unshift=function(e){var t={data:e,next:this.head};0===this.length&&(this.tail=t),this.head=t,++this.length;},Jr.prototype.shift=function(){if(0!==this.length){var e=this.head.data;return 1===this.length?this.head=this.tail=null:this.head=this.head.next,--this.length,e}},Jr.prototype.clear=function(){this.head=this.tail=null,this.length=0;},Jr.prototype.join=function(e){if(0===this.length)return "";for(var t=this.head,r=""+t.data;t=t.next;)r+=e+t.data;return r},Jr.prototype.concat=function(e){if(0===this.length)return re.alloc(0);if(1===this.length)return this.head.data;for(var t=re.allocUnsafe(e>>>0),r=this.head,n=0;r;)r.data.copy(t,n),n+=r.data.length,r=r.next;return t};var Wr=re.isEncoding||function(e){switch(e&&e.toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"binary":case"base64":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":case"raw":return !0;default:return !1}};function Xr(e){switch(this.encoding=(e||"utf8").toLowerCase().replace(/[-_]/,""),function(e){if(e&&!Wr(e))throw new Error("Unknown encoding: "+e)}(e),this.encoding){case"utf8":this.surrogateSize=3;break;case"ucs2":case"utf16le":this.surrogateSize=2,this.detectIncompleteChar=Qr;break;case"base64":this.surrogateSize=3,this.detectIncompleteChar=Zr;break;default:return void(this.write=Yr)}this.charBuffer=new re(6),this.charReceived=0,this.charLength=0;}function Yr(e){return e.toString(this.encoding)}function Qr(e){this.charReceived=e.length%2,this.charLength=this.charReceived?2:0;}function Zr(e){this.charReceived=e.length%3,this.charLength=this.charReceived?3:0;}Xr.prototype.write=function(e){for(var t="";this.charLength;){var r=e.length>=this.charLength-this.charReceived?this.charLength-this.charReceived:e.length;if(e.copy(this.charBuffer,this.charReceived,0,r),this.charReceived+=r,this.charReceived<this.charLength)return "";if(e=e.slice(r,e.length),!((i=(t=this.charBuffer.slice(0,this.charLength).toString(this.encoding)).charCodeAt(t.length-1))>=55296&&i<=56319)){if(this.charReceived=this.charLength=0,0===e.length)return t;break}this.charLength+=this.surrogateSize,t="";}this.detectIncompleteChar(e);var n=e.length;this.charLength&&(e.copy(this.charBuffer,0,e.length-this.charReceived,n),n-=this.charReceived);var i;n=(t+=e.toString(this.encoding,0,n)).length-1;if((i=t.charCodeAt(n))>=55296&&i<=56319){var o=this.surrogateSize;return this.charLength+=o,this.charReceived+=o,this.charBuffer.copy(this.charBuffer,o,0,o),e.copy(this.charBuffer,0,0,o),t.substring(0,n)}return t},Xr.prototype.detectIncompleteChar=function(e){for(var t=e.length>=3?3:e.length;t>0;t--){var r=e[e.length-t];if(1==t&&r>>5==6){this.charLength=2;break}if(t<=2&&r>>4==14){this.charLength=3;break}if(t<=3&&r>>3==30){this.charLength=4;break}}this.charReceived=t;},Xr.prototype.end=function(e){var t="";if(e&&e.length&&(t=this.write(e)),this.charReceived){var r=this.charReceived,n=this.charBuffer,i=this.encoding;t+=n.slice(0,r).toString(i);}return t};var en=Object.freeze({__proto__:null,StringDecoder:Xr});nn.ReadableState=rn;var tn=Pt("stream");function rn(e,t){e=e||{},this.objectMode=!!e.objectMode,t instanceof Cn&&(this.objectMode=this.objectMode||!!e.readableObjectMode);var r=e.highWaterMark,n=this.objectMode?16:16384;this.highWaterMark=r||0===r?r:n,this.highWaterMark=~~this.highWaterMark,this.buffer=new Jr,this.length=0,this.pipes=null,this.pipesCount=0,this.flowing=null,this.ended=!1,this.endEmitted=!1,this.reading=!1,this.sync=!0,this.needReadable=!1,this.emittedReadable=!1,this.readableListening=!1,this.resumeScheduled=!1,this.defaultEncoding=e.defaultEncoding||"utf8",this.ranOut=!1,this.awaitDrain=0,this.readingMore=!1,this.decoder=null,this.encoding=null,e.encoding&&(this.decoder=new Xr(e.encoding),this.encoding=e.encoding);}function nn(e){if(!(this instanceof nn))return new nn(e);this._readableState=new rn(e,this),this.readable=!0,e&&"function"==typeof e.read&&(this._read=e.read),Dr.call(this);}function on(e,t,r,n,i){var o=function(e,t){var r=null;Be(t)||"string"==typeof t||null==t||e.objectMode||(r=new TypeError("Invalid non-string/buffer chunk"));return r}(t,r);if(o)e.emit("error",o);else if(null===r)t.reading=!1,function(e,t){if(t.ended)return;if(t.decoder){var r=t.decoder.end();r&&r.length&&(t.buffer.push(r),t.length+=t.objectMode?1:r.length);}t.ended=!0,sn(e);}(e,t);else if(t.objectMode||r&&r.length>0)if(t.ended&&!i){var a=new Error("stream.push() after EOF");e.emit("error",a);}else if(t.endEmitted&&i){var s=new Error("stream.unshift() after end event");e.emit("error",s);}else {var c;!t.decoder||i||n||(r=t.decoder.write(r),c=!t.objectMode&&0===r.length),i||(t.reading=!1),c||(t.flowing&&0===t.length&&!t.sync?(e.emit("data",r),e.read(0)):(t.length+=t.objectMode?1:r.length,i?t.buffer.unshift(r):t.buffer.push(r),t.needReadable&&sn(e))),function(e,t){t.readingMore||(t.readingMore=!0,Qe(un,e,t));}(e,t);}else i||(t.reading=!1);return function(e){return !e.ended&&(e.needReadable||e.length<e.highWaterMark||0===e.length)}(t)}_t(nn,Dr),nn.prototype.push=function(e,t){var r=this._readableState;return r.objectMode||"string"!=typeof e||(t=t||r.defaultEncoding)!==r.encoding&&(e=re.from(e,t),t=""),on(this,r,e,t,!1)},nn.prototype.unshift=function(e){return on(this,this._readableState,e,"",!0)},nn.prototype.isPaused=function(){return !1===this._readableState.flowing},nn.prototype.setEncoding=function(e){return this._readableState.decoder=new Xr(e),this._readableState.encoding=e,this};function an(e,t){return e<=0||0===t.length&&t.ended?0:t.objectMode?1:e!=e?t.flowing&&t.length?t.buffer.head.data.length:t.length:(e>t.highWaterMark&&(t.highWaterMark=function(e){return e>=8388608?e=8388608:(e--,e|=e>>>1,e|=e>>>2,e|=e>>>4,e|=e>>>8,e|=e>>>16,e++),e}(e)),e<=t.length?e:t.ended?t.length:(t.needReadable=!0,0))}function sn(e){var t=e._readableState;t.needReadable=!1,t.emittedReadable||(tn("emitReadable",t.flowing),t.emittedReadable=!0,t.sync?Qe(cn,e):cn(e));}function cn(e){tn("emit readable"),e.emit("readable"),hn(e);}function un(e,t){for(var r=t.length;!t.reading&&!t.flowing&&!t.ended&&t.length<t.highWaterMark&&(tn("maybeReadMore read 0"),e.read(0),r!==t.length);)r=t.length;t.readingMore=!1;}function ln(e){tn("readable nexttick read 0"),e.read(0);}function fn(e,t){t.reading||(tn("resume read 0"),e.read(0)),t.resumeScheduled=!1,t.awaitDrain=0,e.emit("resume"),hn(e),t.flowing&&!t.reading&&e.read(0);}function hn(e){var t=e._readableState;for(tn("flow",t.flowing);t.flowing&&null!==e.read(););}function dn(e,t){return 0===t.length?null:(t.objectMode?r=t.buffer.shift():!e||e>=t.length?(r=t.decoder?t.buffer.join(""):1===t.buffer.length?t.buffer.head.data:t.buffer.concat(t.length),t.buffer.clear()):r=function(e,t,r){var n;e<t.head.data.length?(n=t.head.data.slice(0,e),t.head.data=t.head.data.slice(e)):n=e===t.head.data.length?t.shift():r?function(e,t){var r=t.head,n=1,i=r.data;e-=i.length;for(;r=r.next;){var o=r.data,a=e>o.length?o.length:e;if(a===o.length?i+=o:i+=o.slice(0,e),0===(e-=a)){a===o.length?(++n,r.next?t.head=r.next:t.head=t.tail=null):(t.head=r,r.data=o.slice(a));break}++n;}return t.length-=n,i}(e,t):function(e,t){var r=re.allocUnsafe(e),n=t.head,i=1;n.data.copy(r),e-=n.data.length;for(;n=n.next;){var o=n.data,a=e>o.length?o.length:e;if(o.copy(r,r.length-e,0,a),0===(e-=a)){a===o.length?(++i,n.next?t.head=n.next:t.head=t.tail=null):(t.head=n,n.data=o.slice(a));break}++i;}return t.length-=i,r}(e,t);return n}(e,t.buffer,t.decoder),r);var r;}function pn(e){var t=e._readableState;if(t.length>0)throw new Error('"endReadable()" called on non-empty stream');t.endEmitted||(t.ended=!0,Qe(mn,t,e));}function mn(e,t){e.endEmitted||0!==e.length||(e.endEmitted=!0,t.readable=!1,t.emit("end"));}function vn(e,t){for(var r=0,n=e.length;r<n;r++)if(e[r]===t)return r;return -1}function gn(){}function yn(e,t,r){this.chunk=e,this.encoding=t,this.callback=r,this.next=null;}function bn(e,t){Object.defineProperty(this,"buffer",{get:xt((function(){return this.getBuffer()}),"_writableState.buffer is deprecated. Use _writableState.getBuffer instead.")}),e=e||{},this.objectMode=!!e.objectMode,t instanceof Cn&&(this.objectMode=this.objectMode||!!e.writableObjectMode);var r=e.highWaterMark,n=this.objectMode?16:16384;this.highWaterMark=r||0===r?r:n,this.highWaterMark=~~this.highWaterMark,this.needDrain=!1,this.ending=!1,this.ended=!1,this.finished=!1;var i=!1===e.decodeStrings;this.decodeStrings=!i,this.defaultEncoding=e.defaultEncoding||"utf8",this.length=0,this.writing=!1,this.corked=0,this.sync=!0,this.bufferProcessing=!1,this.onwrite=function(e){!function(e,t){var r=e._writableState,n=r.sync,i=r.writecb;if(function(e){e.writing=!1,e.writecb=null,e.length-=e.writelen,e.writelen=0;}(r),t)!function(e,t,r,n,i){--t.pendingcb,r?Qe(i,n):i(n);e._writableState.errorEmitted=!0,e.emit("error",n);}(e,r,n,t,i);else {var o=xn(r);o||r.corked||r.bufferProcessing||!r.bufferedRequest||En(e,r),n?Qe(Sn,e,r,o,i):Sn(e,r,o,i);}}(t,e);},this.writecb=null,this.writelen=0,this.bufferedRequest=null,this.lastBufferedRequest=null,this.pendingcb=0,this.prefinished=!1,this.errorEmitted=!1,this.bufferedRequestCount=0,this.corkedRequestsFree=new Pn(this);}function wn(e){if(!(this instanceof wn||this instanceof Cn))return new wn(e);this._writableState=new bn(e,this),this.writable=!0,e&&("function"==typeof e.write&&(this._write=e.write),"function"==typeof e.writev&&(this._writev=e.writev)),Dr.call(this);}function _n(e,t,r,n,i,o,a){t.writelen=n,t.writecb=a,t.writing=!0,t.sync=!0,r?e._writev(i,t.onwrite):e._write(i,o,t.onwrite),t.sync=!1;}function Sn(e,t,r,n){r||function(e,t){0===t.length&&t.needDrain&&(t.needDrain=!1,e.emit("drain"));}(e,t),t.pendingcb--,n(),kn(e,t);}function En(e,t){t.bufferProcessing=!0;var r=t.bufferedRequest;if(e._writev&&r&&r.next){var n=t.bufferedRequestCount,i=new Array(n),o=t.corkedRequestsFree;o.entry=r;for(var a=0;r;)i[a]=r,r=r.next,a+=1;_n(e,t,!0,t.length,i,"",o.finish),t.pendingcb++,t.lastBufferedRequest=null,o.next?(t.corkedRequestsFree=o.next,o.next=null):t.corkedRequestsFree=new Pn(t);}else {for(;r;){var s=r.chunk,c=r.encoding,u=r.callback;if(_n(e,t,!1,t.objectMode?1:s.length,s,c,u),r=r.next,t.writing)break}null===r&&(t.lastBufferedRequest=null);}t.bufferedRequestCount=0,t.bufferedRequest=r,t.bufferProcessing=!1;}function xn(e){return e.ending&&0===e.length&&null===e.bufferedRequest&&!e.finished&&!e.writing}function In(e,t){t.prefinished||(t.prefinished=!0,e.emit("prefinish"));}function kn(e,t){var r=xn(t);return r&&(0===t.pendingcb?(In(e,t),t.finished=!0,e.emit("finish")):In(e,t)),r}function Pn(e){var t=this;this.next=null,this.entry=null,this.finish=function(r){var n=t.entry;for(t.entry=null;n;){var i=n.callback;e.pendingcb--,i(r),n=n.next;}e.corkedRequestsFree?e.corkedRequestsFree.next=t:e.corkedRequestsFree=t;};}nn.prototype.read=function(e){tn("read",e),e=parseInt(e,10);var t=this._readableState,r=e;if(0!==e&&(t.emittedReadable=!1),0===e&&t.needReadable&&(t.length>=t.highWaterMark||t.ended))return tn("read: emitReadable",t.length,t.ended),0===t.length&&t.ended?pn(this):sn(this),null;if(0===(e=an(e,t))&&t.ended)return 0===t.length&&pn(this),null;var n,i=t.needReadable;return tn("need readable",i),(0===t.length||t.length-e<t.highWaterMark)&&tn("length less than watermark",i=!0),t.ended||t.reading?tn("reading or ended",i=!1):i&&(tn("do read"),t.reading=!0,t.sync=!0,0===t.length&&(t.needReadable=!0),this._read(t.highWaterMark),t.sync=!1,t.reading||(e=an(r,t))),null===(n=e>0?dn(e,t):null)?(t.needReadable=!0,e=0):t.length-=e,0===t.length&&(t.ended||(t.needReadable=!0),r!==e&&t.ended&&pn(this)),null!==n&&this.emit("data",n),n},nn.prototype._read=function(e){this.emit("error",new Error("not implemented"));},nn.prototype.pipe=function(e,t){var r=this,n=this._readableState;switch(n.pipesCount){case 0:n.pipes=e;break;case 1:n.pipes=[n.pipes,e];break;default:n.pipes.push(e);}n.pipesCount+=1,tn("pipe count=%d opts=%j",n.pipesCount,t);var i=!t||!1!==t.end?a:u;function o(e){tn("onunpipe"),e===r&&u();}function a(){tn("onend"),e.end();}n.endEmitted?Qe(i):r.once("end",i),e.on("unpipe",o);var s=function(e){return function(){var t=e._readableState;tn("pipeOnDrain",t.awaitDrain),t.awaitDrain&&t.awaitDrain--,0===t.awaitDrain&&e.listeners("data").length&&(t.flowing=!0,hn(e));}}(r);e.on("drain",s);var c=!1;function u(){tn("cleanup"),e.removeListener("close",d),e.removeListener("finish",p),e.removeListener("drain",s),e.removeListener("error",h),e.removeListener("unpipe",o),r.removeListener("end",a),r.removeListener("end",u),r.removeListener("data",f),c=!0,!n.awaitDrain||e._writableState&&!e._writableState.needDrain||s();}var l=!1;function f(t){tn("ondata"),l=!1,!1!==e.write(t)||l||((1===n.pipesCount&&n.pipes===e||n.pipesCount>1&&-1!==vn(n.pipes,e))&&!c&&(tn("false write response, pause",r._readableState.awaitDrain),r._readableState.awaitDrain++,l=!0),r.pause());}function h(t){tn("onerror",t),m(),e.removeListener("error",h),0===function(e,t){return e.listeners(t).length}(e,"error")&&e.emit("error",t);}function d(){e.removeListener("finish",p),m();}function p(){tn("onfinish"),e.removeListener("close",d),m();}function m(){tn("unpipe"),r.unpipe(e);}return r.on("data",f),function(e,t,r){if("function"==typeof e.prependListener)return e.prependListener(t,r);e._events&&e._events[t]?Array.isArray(e._events[t])?e._events[t].unshift(r):e._events[t]=[r,e._events[t]]:e.on(t,r);}(e,"error",h),e.once("close",d),e.once("finish",p),e.emit("pipe",r),n.flowing||(tn("pipe resume"),r.resume()),e},nn.prototype.unpipe=function(e){var t=this._readableState;if(0===t.pipesCount)return this;if(1===t.pipesCount)return e&&e!==t.pipes||(e||(e=t.pipes),t.pipes=null,t.pipesCount=0,t.flowing=!1,e&&e.emit("unpipe",this)),this;if(!e){var r=t.pipes,n=t.pipesCount;t.pipes=null,t.pipesCount=0,t.flowing=!1;for(var i=0;i<n;i++)r[i].emit("unpipe",this);return this}var o=vn(t.pipes,e);return -1===o||(t.pipes.splice(o,1),t.pipesCount-=1,1===t.pipesCount&&(t.pipes=t.pipes[0]),e.emit("unpipe",this)),this},nn.prototype.on=function(e,t){var r=Dr.prototype.on.call(this,e,t);if("data"===e)!1!==this._readableState.flowing&&this.resume();else if("readable"===e){var n=this._readableState;n.endEmitted||n.readableListening||(n.readableListening=n.needReadable=!0,n.emittedReadable=!1,n.reading?n.length&&sn(this):Qe(ln,this));}return r},nn.prototype.addListener=nn.prototype.on,nn.prototype.resume=function(){var e=this._readableState;return e.flowing||(tn("resume"),e.flowing=!0,function(e,t){t.resumeScheduled||(t.resumeScheduled=!0,Qe(fn,e,t));}(this,e)),this},nn.prototype.pause=function(){return tn("call pause flowing=%j",this._readableState.flowing),!1!==this._readableState.flowing&&(tn("pause"),this._readableState.flowing=!1,this.emit("pause")),this},nn.prototype.wrap=function(e){var t=this._readableState,r=!1,n=this;for(var i in e.on("end",(function(){if(tn("wrapped end"),t.decoder&&!t.ended){var e=t.decoder.end();e&&e.length&&n.push(e);}n.push(null);})),e.on("data",(function(i){(tn("wrapped data"),t.decoder&&(i=t.decoder.write(i)),t.objectMode&&null==i)||(t.objectMode||i&&i.length)&&(n.push(i)||(r=!0,e.pause()));})),e)void 0===this[i]&&"function"==typeof e[i]&&(this[i]=function(t){return function(){return e[t].apply(e,arguments)}}(i));return function(e,t){for(var r=0,n=e.length;r<n;r++)t(e[r],r);}(["error","close","destroy","pause","resume"],(function(t){e.on(t,n.emit.bind(n,t));})),n._read=function(t){tn("wrapped _read",t),r&&(r=!1,e.resume());},n},nn._fromList=dn,wn.WritableState=bn,_t(wn,Dr),bn.prototype.getBuffer=function(){for(var e=this.bufferedRequest,t=[];e;)t.push(e),e=e.next;return t},wn.prototype.pipe=function(){this.emit("error",new Error("Cannot pipe, not readable"));},wn.prototype.write=function(e,t,r){var n=this._writableState,i=!1;return "function"==typeof t&&(r=t,t=null),re.isBuffer(e)?t="buffer":t||(t=n.defaultEncoding),"function"!=typeof r&&(r=gn),n.ended?function(e,t){var r=new Error("write after end");e.emit("error",r),Qe(t,r);}(this,r):function(e,t,r,n){var i=!0,o=!1;return null===r?o=new TypeError("May not write null values to stream"):re.isBuffer(r)||"string"==typeof r||void 0===r||t.objectMode||(o=new TypeError("Invalid non-string/buffer chunk")),o&&(e.emit("error",o),Qe(n,o),i=!1),i}(this,n,e,r)&&(n.pendingcb++,i=function(e,t,r,n,i){r=function(e,t,r){e.objectMode||!1===e.decodeStrings||"string"!=typeof t||(t=re.from(t,r));return t}(t,r,n),re.isBuffer(r)&&(n="buffer");var o=t.objectMode?1:r.length;t.length+=o;var a=t.length<t.highWaterMark;a||(t.needDrain=!0);if(t.writing||t.corked){var s=t.lastBufferedRequest;t.lastBufferedRequest=new yn(r,n,i),s?s.next=t.lastBufferedRequest:t.bufferedRequest=t.lastBufferedRequest,t.bufferedRequestCount+=1;}else _n(e,t,!1,o,r,n,i);return a}(this,n,e,t,r)),i},wn.prototype.cork=function(){this._writableState.corked++;},wn.prototype.uncork=function(){var e=this._writableState;e.corked&&(e.corked--,e.writing||e.corked||e.finished||e.bufferProcessing||!e.bufferedRequest||En(this,e));},wn.prototype.setDefaultEncoding=function(e){if("string"==typeof e&&(e=e.toLowerCase()),!(["hex","utf8","utf-8","ascii","binary","base64","ucs2","ucs-2","utf16le","utf-16le","raw"].indexOf((e+"").toLowerCase())>-1))throw new TypeError("Unknown encoding: "+e);return this._writableState.defaultEncoding=e,this},wn.prototype._write=function(e,t,r){r(new Error("not implemented"));},wn.prototype._writev=null,wn.prototype.end=function(e,t,r){var n=this._writableState;"function"==typeof e?(r=e,e=null,t=null):"function"==typeof t&&(r=t,t=null),null!=e&&this.write(e,t),n.corked&&(n.corked=1,this.uncork()),n.ending||n.finished||function(e,t,r){t.ending=!0,kn(e,t),r&&(t.finished?Qe(r):e.once("finish",r));t.ended=!0,e.writable=!1;}(this,n,r);},_t(Cn,nn);for(var On=Object.keys(wn.prototype),Tn=0;Tn<On.length;Tn++){var An=On[Tn];Cn.prototype[An]||(Cn.prototype[An]=wn.prototype[An]);}function Cn(e){if(!(this instanceof Cn))return new Cn(e);nn.call(this,e),wn.call(this,e),e&&!1===e.readable&&(this.readable=!1),e&&!1===e.writable&&(this.writable=!1),this.allowHalfOpen=!0,e&&!1===e.allowHalfOpen&&(this.allowHalfOpen=!1),this.once("end",Rn);}function Rn(){this.allowHalfOpen||this._writableState.ended||Qe(Nn,this);}function Nn(e){e.end();}function Ln(e){this.afterTransform=function(t,r){return function(e,t,r){var n=e._transformState;n.transforming=!1;var i=n.writecb;if(!i)return e.emit("error",new Error("no writecb in Transform class"));n.writechunk=null,n.writecb=null,null!=r&&e.push(r);i(t);var o=e._readableState;o.reading=!1,(o.needReadable||o.length<o.highWaterMark)&&e._read(o.highWaterMark);}(e,t,r)},this.needTransform=!1,this.transforming=!1,this.writecb=null,this.writechunk=null,this.writeencoding=null;}function Mn(e){if(!(this instanceof Mn))return new Mn(e);Cn.call(this,e),this._transformState=new Ln(this);var t=this;this._readableState.needReadable=!0,this._readableState.sync=!1,e&&("function"==typeof e.transform&&(this._transform=e.transform),"function"==typeof e.flush&&(this._flush=e.flush)),this.once("prefinish",(function(){"function"==typeof this._flush?this._flush((function(e){jn(t,e);})):jn(t);}));}function jn(e,t){if(t)return e.emit("error",t);var r=e._writableState,n=e._transformState;if(r.length)throw new Error("Calling transform done when ws.length != 0");if(n.transforming)throw new Error("Calling transform done when still transforming");return e.push(null)}function Dn(e){if(!(this instanceof Dn))return new Dn(e);Mn.call(this,e);}function Bn(){Dr.call(this);}_t(Mn,Cn),Mn.prototype.push=function(e,t){return this._transformState.needTransform=!1,Cn.prototype.push.call(this,e,t)},Mn.prototype._transform=function(e,t,r){throw new Error("Not implemented")},Mn.prototype._write=function(e,t,r){var n=this._transformState;if(n.writecb=r,n.writechunk=e,n.writeencoding=t,!n.transforming){var i=this._readableState;(n.needTransform||i.needReadable||i.length<i.highWaterMark)&&this._read(i.highWaterMark);}},Mn.prototype._read=function(e){var t=this._transformState;null!==t.writechunk&&t.writecb&&!t.transforming?(t.transforming=!0,this._transform(t.writechunk,t.writeencoding,t.afterTransform)):t.needTransform=!0;},_t(Dn,Mn),Dn.prototype._transform=function(e,t,r){r(null,e);},_t(Bn,Dr),Bn.Readable=nn,Bn.Writable=wn,Bn.Duplex=Cn,Bn.Transform=Mn,Bn.PassThrough=Dn,Bn.Stream=Bn,Bn.prototype.pipe=function(e,t){var r=this;function n(t){e.writable&&!1===e.write(t)&&r.pause&&r.pause();}function i(){r.readable&&r.resume&&r.resume();}r.on("data",n),e.on("drain",i),e._isStdio||t&&!1===t.end||(r.on("end",a),r.on("close",s));var o=!1;function a(){o||(o=!0,e.end());}function s(){o||(o=!0,"function"==typeof e.destroy&&e.destroy());}function c(e){if(u(),0===Dr.listenerCount(this,"error"))throw e}function u(){r.removeListener("data",n),e.removeListener("drain",i),r.removeListener("end",a),r.removeListener("close",s),r.removeListener("error",c),e.removeListener("error",c),r.removeListener("end",u),r.removeListener("close",u),e.removeListener("close",u);}return r.on("error",c),e.on("error",c),r.on("end",u),r.on("close",u),e.on("close",u),e.emit("pipe",r),e};var Un=3,Fn=4;function Hn(e,t,r){var n,i=this;if(nn.call(i),i._mode=r,i.headers={},i.rawHeaders=[],i.trailers={},i.rawTrailers=[],i.on("end",(function(){Qe((function(){i.emit("close");}));})),"fetch"===r){i._fetchResponse=t,i.url=t.url,i.statusCode=t.status,i.statusMessage=t.statusText;for(var o,a,s=t.headers[Symbol.iterator]();o=(a=s.next()).value,!a.done;)i.headers[o[0].toLowerCase()]=o[1],i.rawHeaders.push(o[0],o[1]);var c=t.body.getReader();(n=function(){c.read().then((function(e){i._destroyed||(e.done?i.push(null):(i.push(new re(e.value)),n()));}));})();}else {if(i._xhr=e,i._pos=0,i.url=e.responseURL,i.statusCode=e.status,i.statusMessage=e.statusText,e.getAllResponseHeaders().split(/\r?\n/).forEach((function(e){var t=e.match(/^([^:]+):\s*(.*)/);if(t){var r=t[1].toLowerCase();"set-cookie"===r?(void 0===i.headers[r]&&(i.headers[r]=[]),i.headers[r].push(t[2])):void 0!==i.headers[r]?i.headers[r]+=", "+t[2]:i.headers[r]=t[2],i.rawHeaders.push(t[1],t[2]);}})),i._charset="x-user-defined",!Nr){var u=i.rawHeaders["mime-type"];if(u){var l=u.match(/;\s*charset=([^;])(;|$)/);l&&(i._charset=l[1].toLowerCase());}i._charset||(i._charset="utf-8");}}}function zn(e){var t,r=this;wn.call(r),r._opts=e,r._body=[],r._headers={},e.auth&&r.setHeader("Authorization","Basic "+new re(e.auth).toString("base64")),Object.keys(e.headers).forEach((function(t){r.setHeader(t,e.headers[t]);}));var n=!0;if("disable-fetch"===e.mode)n=!1,t=!0;else if("prefer-streaming"===e.mode)t=!1;else if("allow-wrong-content-type"===e.mode)t=!Nr;else {if(e.mode&&"default"!==e.mode&&"prefer-fast"!==e.mode)throw new Error("Invalid value for opts.mode");t=!0;}r._mode=function(e,t){return kr&&t?"fetch":Rr?"moz-chunked-arraybuffer":Cr?"ms-stream":Ar&&e?"arraybuffer":Lr&&e?"text:vbarray":"text"}(t,n),r.on("finish",(function(){r._onFinish();}));}_t(Hn,nn),Hn.prototype._read=function(){},Hn.prototype._onXHRProgress=function(){var e=this,t=e._xhr,r=null;switch(e._mode){case"text:vbarray":if(t.readyState!==Fn)break;try{r=new H.VBArray(t.responseBody).toArray();}catch(e){}if(null!==r){e.push(new re(r));break}case"text":try{r=t.responseText;}catch(t){e._mode="text:vbarray";break}if(r.length>e._pos){var n=r.substr(e._pos);if("x-user-defined"===e._charset){for(var i=new re(n.length),o=0;o<n.length;o++)i[o]=255&n.charCodeAt(o);e.push(i);}else e.push(n,e._charset);e._pos=r.length;}break;case"arraybuffer":if(t.readyState!==Fn||!t.response)break;r=t.response,e.push(new re(new Uint8Array(r)));break;case"moz-chunked-arraybuffer":if(r=t.response,t.readyState!==Un||!r)break;e.push(new re(new Uint8Array(r)));break;case"ms-stream":if(r=t.response,t.readyState!==Un)break;var a=new H.MSStreamReader;a.onprogress=function(){a.result.byteLength>e._pos&&(e.push(new re(new Uint8Array(a.result.slice(e._pos)))),e._pos=a.result.byteLength);},a.onload=function(){e.push(null);},a.readAsArrayBuffer(r);}e._xhr.readyState===Fn&&"ms-stream"!==e._mode&&e.push(null);},_t(zn,wn);var Vn=["accept-charset","accept-encoding","access-control-request-headers","access-control-request-method","connection","content-length","cookie","cookie2","date","dnt","expect","host","keep-alive","origin","referer","te","trailer","transfer-encoding","upgrade","user-agent","via"];function qn(e,t){"string"==typeof e&&(e=br(e));var r=-1===H.location.protocol.search(/^https?:$/)?"http:":"",n=e.protocol||r,i=e.hostname||e.host,o=e.port,a=e.path||"/";i&&-1!==i.indexOf(":")&&(i="["+i+"]"),e.url=(i?n+"//"+i:"")+(o?":"+o:"")+a,e.method=(e.method||"GET").toUpperCase(),e.headers=e.headers||{};var s=new zn(e);return t&&s.on("response",t),s}function Kn(){}zn.prototype.setHeader=function(e,t){var r=e.toLowerCase();-1===Vn.indexOf(r)&&(this._headers[r]={name:e,value:t});},zn.prototype.getHeader=function(e){return this._headers[e.toLowerCase()].value},zn.prototype.removeHeader=function(e){delete this._headers[e.toLowerCase()];},zn.prototype._onFinish=function(){var e=this;if(!e._destroyed){var t,r=e._opts,n=e._headers;if("POST"!==r.method&&"PUT"!==r.method&&"PATCH"!==r.method||(t=function(){if(void 0!==Er)return Er;try{new H.Blob([new ArrayBuffer(1)]),Er=!0;}catch(e){Er=!1;}return Er}()?new H.Blob(e._body.map((function(e){return function(e){if(e instanceof Uint8Array){if(0===e.byteOffset&&e.byteLength===e.buffer.byteLength)return e.buffer;if("function"==typeof e.buffer.slice)return e.buffer.slice(e.byteOffset,e.byteOffset+e.byteLength)}if(Be(e)){for(var t=new Uint8Array(e.length),r=e.length,n=0;n<r;n++)t[n]=e[n];return t.buffer}throw new Error("Argument must be a Buffer")}(e)})),{type:(n["content-type"]||{}).value||""}):re.concat(e._body).toString()),"fetch"===e._mode){var i=Object.keys(n).map((function(e){return [n[e].name,n[e].value]}));H.fetch(e._opts.url,{method:e._opts.method,headers:i,body:t,mode:"cors",credentials:r.withCredentials?"include":"same-origin"}).then((function(t){e._fetchResponse=t,e._connect();}),(function(t){e.emit("error",t);}));}else {var o=e._xhr=new H.XMLHttpRequest;try{o.open(e._opts.method,e._opts.url,!0);}catch(t){return void Qe((function(){e.emit("error",t);}))}"responseType"in o&&(o.responseType=e._mode.split(":")[0]),"withCredentials"in o&&(o.withCredentials=!!r.withCredentials),"text"===e._mode&&"overrideMimeType"in o&&o.overrideMimeType("text/plain; charset=x-user-defined"),Object.keys(n).forEach((function(e){o.setRequestHeader(n[e].name,n[e].value);})),e._response=null,o.onreadystatechange=function(){switch(o.readyState){case Un:case Fn:e._onXHRProgress();}},"moz-chunked-arraybuffer"===e._mode&&(o.onprogress=function(){e._onXHRProgress();}),o.onerror=function(){e._destroyed||e.emit("error",new Error("XHR error"));};try{o.send(t);}catch(t){return void Qe((function(){e.emit("error",t);}))}}}},zn.prototype._onXHRProgress=function(){(function(e){try{var t=e.status;return null!==t&&0!==t}catch(e){return !1}})(this._xhr)&&!this._destroyed&&(this._response||this._connect(),this._response._onXHRProgress());},zn.prototype._connect=function(){this._destroyed||(this._response=new Hn(this._xhr,this._fetchResponse,this._mode),this.emit("response",this._response));},zn.prototype._write=function(e,t,r){this._body.push(e),r();},zn.prototype.abort=zn.prototype.destroy=function(){this._destroyed=!0,this._response&&(this._response._destroyed=!0),this._xhr&&this._xhr.abort();},zn.prototype.end=function(e,t,r){"function"==typeof e&&(r=e,e=void 0),wn.prototype.end.call(this,e,t,r);},zn.prototype.flushHeaders=function(){},zn.prototype.setTimeout=function(){},zn.prototype.setNoDelay=function(){},zn.prototype.setSocketKeepAlive=function(){},Kn.defaultMaxSockets=4;var $n={request:qn,get:function(e,t){var r=qn(e,t);return r.end(),r},Agent:Kn,METHODS:["CHECKOUT","CONNECT","COPY","DELETE","GET","HEAD","LOCK","M-SEARCH","MERGE","MKACTIVITY","MKCOL","MOVE","NOTIFY","OPTIONS","PATCH","POST","PROPFIND","PROPPATCH","PURGE","PUT","REPORT","SEARCH","SUBSCRIBE","TRACE","UNLOCK","UNSUBSCRIBE"],STATUS_CODES:{100:"Continue",101:"Switching Protocols",102:"Processing",200:"OK",201:"Created",202:"Accepted",203:"Non-Authoritative Information",204:"No Content",205:"Reset Content",206:"Partial Content",207:"Multi-Status",300:"Multiple Choices",301:"Moved Permanently",302:"Moved Temporarily",303:"See Other",304:"Not Modified",305:"Use Proxy",307:"Temporary Redirect",400:"Bad Request",401:"Unauthorized",402:"Payment Required",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",406:"Not Acceptable",407:"Proxy Authentication Required",408:"Request Time-out",409:"Conflict",410:"Gone",411:"Length Required",412:"Precondition Failed",413:"Request Entity Too Large",414:"Request-URI Too Large",415:"Unsupported Media Type",416:"Requested Range Not Satisfiable",417:"Expectation Failed",418:"I'm a teapot",422:"Unprocessable Entity",423:"Locked",424:"Failed Dependency",425:"Unordered Collection",426:"Upgrade Required",428:"Precondition Required",429:"Too Many Requests",431:"Request Header Fields Too Large",500:"Internal Server Error",501:"Not Implemented",502:"Bad Gateway",503:"Service Unavailable",504:"Gateway Time-out",505:"HTTP Version Not Supported",506:"Variant Also Negotiates",507:"Insufficient Storage",509:"Bandwidth Limit Exceeded",510:"Not Extended",511:"Network Authentication Required"}},Gn=Ir.spawn,Jn=function(){var e,t,r=this,n=$n,i=$n,o={},a=!1,s={"User-Agent":"node-XMLHttpRequest",Accept:"*/*"},c={},u={},l=["accept-charset","accept-encoding","access-control-request-headers","access-control-request-method","connection","content-length","content-transfer-encoding","cookie","cookie2","date","expect","host","keep-alive","origin","referer","te","trailer","transfer-encoding","upgrade","via"],f=["TRACE","TRACK","CONNECT"],h=!1,d=!1,p={};this.UNSENT=0,this.OPENED=1,this.HEADERS_RECEIVED=2,this.LOADING=3,this.DONE=4,this.readyState=this.UNSENT,this.onreadystatechange=null,this.responseText="",this.responseXML="",this.status=null,this.statusText=null,this.withCredentials=!1;this.open=function(e,t,r,n,i){if(this.abort(),d=!1,!function(e){return e&&-1===f.indexOf(e)}(e))throw new Error("SecurityError: Request method not allowed");o={method:e,url:t.toString(),async:"boolean"!=typeof r||r,user:n||null,password:i||null},m(this.OPENED);},this.setDisableHeaderCheck=function(e){a=e;},this.setRequestHeader=function(e,t){if(this.readyState!==this.OPENED)throw new Error("INVALID_STATE_ERR: setRequestHeader can only be called when state is OPEN");if(function(e){return a||e&&-1===l.indexOf(e.toLowerCase())}(e)){if(h)throw new Error("INVALID_STATE_ERR: send flag is true");e=u[e.toLowerCase()]||e,u[e.toLowerCase()]=e,c[e]=c[e]?c[e]+", "+t:t;}else console.warn('Refused to set unsafe header "'+e+'"');},this.getResponseHeader=function(e){return "string"==typeof e&&this.readyState>this.OPENED&&t&&t.headers&&t.headers[e.toLowerCase()]&&!d?t.headers[e.toLowerCase()]:null},this.getAllResponseHeaders=function(){if(this.readyState<this.HEADERS_RECEIVED||d)return "";var e="";for(var r in t.headers)"set-cookie"!==r&&"set-cookie2"!==r&&(e+=r+": "+t.headers[r]+"\r\n");return e.substr(0,e.length-2)},this.getRequestHeader=function(e){return "string"==typeof e&&u[e.toLowerCase()]?c[u[e.toLowerCase()]]:""},this.send=function(a){if(this.readyState!==this.OPENED)throw new Error("INVALID_STATE_ERR: connection must be opened before send() is called");if(h)throw new Error("INVALID_STATE_ERR: send has already been called");var l,f=!1,p=!1,v=or.parse(o.url);switch(v.protocol){case"https:":f=!0;case"http:":l=v.hostname;break;case"file:":p=!0;break;case void 0:case null:case"":l="localhost";break;default:throw new Error("Protocol not supported.")}if(p){if("GET"!==o.method)throw new Error("XMLHttpRequest: Only GET method is supported");if(o.async)Ir.readFile(v.pathname,"utf8",(function(e,t){e?r.handleError(e):(r.status=200,r.responseText=t,m(r.DONE));}));else try{this.responseText=Ir.readFileSync(v.pathname,"utf8"),this.status=200,m(r.DONE);}catch(e){this.handleError(e);}}else {var g=v.port||(f?443:80),y=v.pathname+(v.search?v.search:"");for(var b in s)u[b.toLowerCase()]||(c[b]=s[b]);if(c.Host=l,f&&443===g||80===g||(c.Host+=":"+v.port),o.user){void 0===o.password&&(o.password="");var w=new re(o.user+":"+o.password);c.Authorization="Basic "+w.toString("base64");}"GET"===o.method||"HEAD"===o.method?a=null:a?(c["Content-Length"]=Be(a)?a.length:re.byteLength(a),c["Content-Type"]||(c["Content-Type"]="text/plain;charset=UTF-8")):"POST"===o.method&&(c["Content-Length"]=0);var _={host:l,port:g,path:y,method:o.method,headers:c,agent:!1,withCredentials:r.withCredentials};if(d=!1,o.async){var S=f?i.request:n.request;h=!0,r.dispatchEvent("readystatechange");var E=function(e){r.handleError(e);};e=S(_,(function n(i){if(301!==(t=i).statusCode&&302!==t.statusCode&&303!==t.statusCode&&307!==t.statusCode)t.setEncoding("utf8"),m(r.HEADERS_RECEIVED),r.status=t.statusCode,t.on("data",(function(e){e&&(r.responseText+=e),h&&m(r.LOADING);})),t.on("end",(function(){h&&(m(r.DONE),h=!1);})),t.on("error",(function(e){r.handleError(e);}));else {o.url=t.headers.location;var a=or.parse(o.url);l=a.hostname;var s={hostname:a.hostname,port:a.port,path:a.path,method:303===t.statusCode?"GET":o.method,headers:c,withCredentials:r.withCredentials};(e=S(s,n).on("error",E)).end();}})).on("error",E),a&&e.write(a),e.end(),r.dispatchEvent("loadstart");}else {var x=".node-xmlhttprequest-content-"+ft.pid,I=".node-xmlhttprequest-sync-"+ft.pid;Ir.writeFileSync(I,"","utf8");for(var k="var http = require('http'), https = require('https'), fs = require('fs');var doRequest = http"+(f?"s":"")+".request;var options = "+JSON.stringify(_)+";var responseText = '';var req = doRequest(options, function(response) {response.setEncoding('utf8');response.on('data', function(chunk) {  responseText += chunk;});response.on('end', function() {fs.writeFileSync('"+x+"', JSON.stringify({err: null, data: {statusCode: response.statusCode, headers: response.headers, text: responseText}}), 'utf8');fs.unlinkSync('"+I+"');});response.on('error', function(error) {fs.writeFileSync('"+x+"', JSON.stringify({err: error}), 'utf8');fs.unlinkSync('"+I+"');});}).on('error', function(error) {fs.writeFileSync('"+x+"', JSON.stringify({err: error}), 'utf8');fs.unlinkSync('"+I+"');});"+(a?"req.write('"+JSON.stringify(a).slice(1,-1).replace(/'/g,"\\'")+"');":"")+"req.end();",P=Gn(ft.argv[0],["-e",k]);Ir.existsSync(I););var O=JSON.parse(Ir.readFileSync(x,"utf8"));P.stdin.end(),Ir.unlinkSync(x),O.err?r.handleError(O.err):(t=O.data,r.status=O.data.statusCode,r.responseText=O.data.text,m(r.DONE));}}},this.handleError=function(e){this.status=0,this.statusText=e,this.responseText=e.stack,d=!0,m(this.DONE),this.dispatchEvent("error");},this.abort=function(){e&&(e.abort(),e=null),c=s,this.status=0,this.responseText="",this.responseXML="",d=!0,this.readyState===this.UNSENT||this.readyState===this.OPENED&&!h||this.readyState===this.DONE||(h=!1,m(this.DONE)),this.readyState=this.UNSENT,this.dispatchEvent("abort");},this.addEventListener=function(e,t){e in p||(p[e]=[]),p[e].push(t);},this.removeEventListener=function(e,t){e in p&&(p[e]=p[e].filter((function(e){return e!==t})));},this.dispatchEvent=function(e){if("function"==typeof r["on"+e]&&r["on"+e](),e in p)for(var t=0,n=p[e].length;t<n;t++)p[e][t].call(r);};var m=function(e){e!=r.LOADING&&r.readyState===e||(r.readyState=e,(o.async||r.readyState<r.OPENED||r.readyState===r.DONE)&&r.dispatchEvent("readystatechange"),r.readyState!==r.DONE||d||(r.dispatchEvent("load"),r.dispatchEvent("loadend")));};},Wn="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:{};function Xn(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}function Yn(e,t){return e(t={exports:{}},t.exports),t.exports}function Qn(e){return e&&e.default||e}var Zn=1e3,ei=6e4,ti=36e5,ri=24*ti,ni=function(e,t){t=t||{};var r=typeof e;if("string"===r&&e.length>0)return function(e){if((e=String(e)).length>100)return;var t=/^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(e);if(!t)return;var r=parseFloat(t[1]);switch((t[2]||"ms").toLowerCase()){case"years":case"year":case"yrs":case"yr":case"y":return 315576e5*r;case"weeks":case"week":case"w":return 6048e5*r;case"days":case"day":case"d":return r*ri;case"hours":case"hour":case"hrs":case"hr":case"h":return r*ti;case"minutes":case"minute":case"mins":case"min":case"m":return r*ei;case"seconds":case"second":case"secs":case"sec":case"s":return r*Zn;case"milliseconds":case"millisecond":case"msecs":case"msec":case"ms":return r;default:return}}(e);if("number"===r&&isFinite(e))return t.long?function(e){var t=Math.abs(e);if(t>=ri)return ii(e,t,ri,"day");if(t>=ti)return ii(e,t,ti,"hour");if(t>=ei)return ii(e,t,ei,"minute");if(t>=Zn)return ii(e,t,Zn,"second");return e+" ms"}(e):function(e){var t=Math.abs(e);if(t>=ri)return Math.round(e/ri)+"d";if(t>=ti)return Math.round(e/ti)+"h";if(t>=ei)return Math.round(e/ei)+"m";if(t>=Zn)return Math.round(e/Zn)+"s";return e+"ms"}(e);throw new Error("val is not a non-empty string or a valid number. val="+JSON.stringify(e))};function ii(e,t,r,n){var i=t>=1.5*r;return Math.round(e/r)+" "+n+(i?"s":"")}var oi=function(e){function t(e){let t=0;for(let r=0;r<e.length;r++)t=(t<<5)-t+e.charCodeAt(r),t|=0;return r.colors[Math.abs(t)%r.colors.length]}function r(e){let o;function a(...e){if(!a.enabled)return;const t=a,n=Number(new Date),i=n-(o||n);t.diff=i,t.prev=o,t.curr=n,o=n,e[0]=r.coerce(e[0]),"string"!=typeof e[0]&&e.unshift("%O");let s=0;e[0]=e[0].replace(/%([a-zA-Z%])/g,(n,i)=>{if("%%"===n)return n;s++;const o=r.formatters[i];if("function"==typeof o){const r=e[s];n=o.call(t,r),e.splice(s,1),s--;}return n}),r.formatArgs.call(t,e),(t.log||r.log).apply(t,e);}return a.namespace=e,a.enabled=r.enabled(e),a.useColors=r.useColors(),a.color=t(e),a.destroy=n,a.extend=i,"function"==typeof r.init&&r.init(a),r.instances.push(a),a}function n(){const e=r.instances.indexOf(this);return -1!==e&&(r.instances.splice(e,1),!0)}function i(e,t){const n=r(this.namespace+(void 0===t?":":t)+e);return n.log=this.log,n}function o(e){return e.toString().substring(2,e.toString().length-2).replace(/\.\*\?$/,"*")}return r.debug=r,r.default=r,r.coerce=function(e){if(e instanceof Error)return e.stack||e.message;return e},r.disable=function(){const e=[...r.names.map(o),...r.skips.map(o).map(e=>"-"+e)].join(",");return r.enable(""),e},r.enable=function(e){let t;r.save(e),r.names=[],r.skips=[];const n=("string"==typeof e?e:"").split(/[\s,]+/),i=n.length;for(t=0;t<i;t++)n[t]&&("-"===(e=n[t].replace(/\*/g,".*?"))[0]?r.skips.push(new RegExp("^"+e.substr(1)+"$")):r.names.push(new RegExp("^"+e+"$")));for(t=0;t<r.instances.length;t++){const e=r.instances[t];e.enabled=r.enabled(e.namespace);}},r.enabled=function(e){if("*"===e[e.length-1])return !0;let t,n;for(t=0,n=r.skips.length;t<n;t++)if(r.skips[t].test(e))return !1;for(t=0,n=r.names.length;t<n;t++)if(r.names[t].test(e))return !0;return !1},r.humanize=ni,Object.keys(e).forEach(t=>{r[t]=e[t];}),r.instances=[],r.names=[],r.skips=[],r.formatters={},r.selectColor=t,r.enable(r.load()),r},ai=Yn((function(e,t){t.log=function(...e){return "object"==typeof console&&console.log&&console.log(...e)},t.formatArgs=function(t){if(t[0]=(this.useColors?"%c":"")+this.namespace+(this.useColors?" %c":" ")+t[0]+(this.useColors?"%c ":" ")+"+"+e.exports.humanize(this.diff),!this.useColors)return;const r="color: "+this.color;t.splice(1,0,r,"color: inherit");let n=0,i=0;t[0].replace(/%[a-zA-Z%]/g,e=>{"%%"!==e&&(n++,"%c"===e&&(i=n));}),t.splice(i,0,r);},t.save=function(e){try{e?t.storage.setItem("debug",e):t.storage.removeItem("debug");}catch(e){}},t.load=function(){let e;try{e=t.storage.getItem("debug");}catch(e){}!e&&void 0!==ft&&"env"in ft&&(e=ft.env.DEBUG);return e},t.useColors=function(){if("undefined"!=typeof window&&window.process&&("renderer"===window.process.type||window.process.__nwjs))return !0;if("undefined"!=typeof navigator&&navigator.userAgent&&navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/))return !1;return "undefined"!=typeof document&&document.documentElement&&document.documentElement.style&&document.documentElement.style.WebkitAppearance||"undefined"!=typeof window&&window.console&&(window.console.firebug||window.console.exception&&window.console.table)||"undefined"!=typeof navigator&&navigator.userAgent&&navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)&&parseInt(RegExp.$1,10)>=31||"undefined"!=typeof navigator&&navigator.userAgent&&navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/)},t.storage=function(){try{return localStorage}catch(e){}}(),t.colors=["#0000CC","#0000FF","#0033CC","#0033FF","#0066CC","#0066FF","#0099CC","#0099FF","#00CC00","#00CC33","#00CC66","#00CC99","#00CCCC","#00CCFF","#3300CC","#3300FF","#3333CC","#3333FF","#3366CC","#3366FF","#3399CC","#3399FF","#33CC00","#33CC33","#33CC66","#33CC99","#33CCCC","#33CCFF","#6600CC","#6600FF","#6633CC","#6633FF","#66CC00","#66CC33","#9900CC","#9900FF","#9933CC","#9933FF","#99CC00","#99CC33","#CC0000","#CC0033","#CC0066","#CC0099","#CC00CC","#CC00FF","#CC3300","#CC3333","#CC3366","#CC3399","#CC33CC","#CC33FF","#CC6600","#CC6633","#CC9900","#CC9933","#CCCC00","#CCCC33","#FF0000","#FF0033","#FF0066","#FF0099","#FF00CC","#FF00FF","#FF3300","#FF3333","#FF3366","#FF3399","#FF33CC","#FF33FF","#FF6600","#FF6633","#FF9900","#FF9933","#FFCC00","#FFCC33"],e.exports=oi(t);const{formatters:r}=e.exports;r.j=function(e){try{return JSON.stringify(e)}catch(e){return "[UnexpectedJSONParseError]: "+e.message}};}));ai.log,ai.formatArgs,ai.save,ai.load,ai.useColors,ai.storage,ai.colors;const si=ai("request");function ci(e){return new Promise((t,r)=>{const n=e.url;n||r(new Error("URL is missing"));const i=new("undefined"==typeof XMLHttpRequest?Jn:XMLHttpRequest);i.onload=()=>{if(i.status>=200&&i.status<300)t(i.responseText);else {const e=`Error fetching url:${n}; status code:${i.status}`;r(new Error(e));}},i.ontimeout=e=>{console.log("ontimeout",e);},i.onreadystatechange=()=>{404===i.status&&r(new Error(`Error fetching url:${n}; status code:${i.status}`));},i.onerror=()=>{si(`Request failed with error ${i.responseText}`),r(new Error(i.responseText));},i.open(e.method||"GET",n),e.body?i.send(JSON.stringify(e.body)):i.send();})}function ui(t,r){for(let n=0;n<r.length;n++){const i=r[n];if(e(t,i))return t.slice(i.length)}return t}function li(e,t){const r="&action=eth_getTransactionByHash&txhash=";let n;return n=t===y.ethmain.code?a[o].main+r+e:a[o].ropsten+r+e,new Promise((e,r)=>ci({url:n}).then((function(n){const i=JSON.parse(n);try{(function(e,t){const r=e.result.blockNumber,n="&action=eth_getBlockByNumber&boolean=true&tag=";let i;i=t===y.ethmain.code?a[o].main+n+r:a[o].ropsten+n+r;return new Promise((e,n)=>ci({url:i}).then((function(i){const s=JSON.parse(i).result;try{(function(e,t){const r="&action=eth_blockNumber";let n;n=e===y.ethmain.code?a[o].main+r:a[o].ropsten+r;return new Promise((e,r)=>ci({url:n}).then((function(n){const i=JSON.parse(n).result;try{i-t<_&&r(new j(h,O("errors","checkEtherScanConfirmations"))),e(i);}catch(e){r(new j(h,O("errors","unableToGetRemoteHash")));}})).catch((function(){r(new j(h,O("errors","unableToGetRemoteHash")));})))})(t,r).then((function(){e(s);})).catch((function(){n(new j(h,O("errors","unableToGetRemoteHash")));}));}catch(e){n(new j(h,O("errors","unableToGetRemoteHash")));}})).catch((function(){n(new j(h,O("errors","unableToGetRemoteHash")));})))})(i,t).then((function(t){const r=function(e,t){const r=e.result,n=new Date(1e3*parseInt(t.timestamp,16)),i=r.from,o=ui(r.input,y.ethmain.prefixes);return new M(o,i,n,void 0)}(i,t);e(r);})).catch((function(){r(new j(h,O("errors","unableToGetRemoteHash")));}));}catch(e){r(new j(h,O("errors","unableToGetRemoteHash")));}})).catch((function(){r(new j(h,O("errors","unableToGetRemoteHash")));})))}function fi(e){const t=Date.parse(e);if(t)return new Date(t);const r=function(e){let t=e.slice(0,-5).split(/\D/).map((function(e){return parseInt(e,10)||0}));t[1]-=1,t=new Date(Date.UTC.apply(Date,t));const r=e.slice(-5);let n=parseInt(r,10)/100;return "+"===r.slice(0,1)&&(n*=-1),t.setHours(t.getHours()+n),t.getTime()}(e);return r||function(e){let t,r;const n=/^(\d{4}\-\d\d\-\d\d([tT][\d:\.]*)?)([zZ]|([+\-])(\d\d):?(\d\d))?$/.exec(e)||[];return n[1]?(t=n[1].split(/\D/).map((function(e){return parseInt(e,10)||0})),t[1]-=1,t=new Date(Date.UTC.apply(Date,t)),t.getDate()?(n[5]&&(r=parseInt(n[5],10)/100*60,n[6]&&(r+=parseInt(n[6],10)),"+"===n[4]&&(r*=-1),r&&t.setUTCMinutes(t.getUTCMinutes()+r)),t):NaN):NaN}(e)}function hi(e){return ""===e?"":fi(`${e}`)}function di(e){return new Date(1e3*e)}async function pi(e,t,r){const n=r!==y.bitcoin.code,i=function(e,t,r=!1){const n=a[e];if(!n)throw new Error(`API ${e} is not listed`);return (r?n.testnet:n.mainnet).replace("{transaction_id}",t)}(e,t,n);return new Promise((t,r)=>ci({url:i}).then(n=>{try{const r=function(e){const t=mi[e];if(!t)throw new Error(`API ${e} is not listed`);return t}(e)(JSON.parse(n));t(r);}catch(e){r(e.message);}}).catch(()=>{r(new j(h,O("errors","unableToGetRemoteHash")));}))}const mi={[t]:function(e){if(e.confirmations<_)throw new j(h,O("errors","parseBitpayResponse"));const t=di(e.blocktime),r=e.vout,n=r[r.length-1],i=e.vout[0].scriptPubKey.addresses[0],o=ui(n.scriptPubKey.hex,y.bitcoin.prefixes),a=r.filter(e=>!!e.spentTxId).map(e=>e.scriptPubKey.addresses[0]);return new M(o,i,t,a)},[r]:function(e){if(e.confirmations<_)throw new j(h,O("errors","parseBlockCypherResponse"));const t=hi(e.received),r=e.outputs,n=r[r.length-1],i=e.inputs[0].addresses[0],o=ui(n.script,y.bitcoin.prefixes),a=r.filter(e=>!!e.spent_by).map(e=>e.addresses[0]);return new M(o,i,t,a)},[n]:function(e){if(e.confirmations<_)throw new j(h,O("errors","parseBlockexplorerResponse"));const t=di(e.blocktime),r=e.vout,n=r[r.length-1],i=e.vout[0].scriptPubKey.addresses[0],o=ui(n.scriptPubKey.hex,y.bitcoin.prefixes),a=r.filter(e=>!!e.spentTxId).map(e=>e.scriptPubKey.addresses[0]);return new M(o,i,t,a)},[i]:function(e){if(!e.status.confirmed)throw new j(h,O("errors","parseBlockstreamResponse"));const t=di(e.status.block_time),r=e.vout,n=r[r.length-1],i=e.vout[0].scriptpubkey_address,o=ui(n.scriptpubkey,y.bitcoin.prefixes),a=r.filter(e=>!!e.scriptpubkey_address).map(e=>e.scriptpubkey_address);return new M(o,i,t,a)}};const vi=[(e,t)=>pi(r,e,t),(e,r)=>pi(t,e,r),(e,t)=>pi(n,e,t),(e,t)=>pi(i,e,t)],gi=[(e,t)=>li(e,t)],yi=[(e,t)=>pi(r,e,t)],bi=ai("blockchainConnectors");function wi(e,t=null){const r=e.created?hi(e.created):null,n=e.revoked?hi(e.revoked):null,i=e.expires?hi(e.expires):null;let o=t;if(!t){o=(e.id||e.publicKey).replace("ecdsa-koblitz-pubkey:","");}return new N(o,r,n,i)}var _i={addresses:k,certificates:F,chains:D,i18n:A,verifier:Object.freeze({__proto__:null,getIssuerProfile:async function(e){const t=O("errors","getIssuerProfile");if(!e)throw new j("getIssuerProfile",t);"object"==typeof e&&(e=e.id);const r=await ci({url:e}).catch(()=>{throw new j("getIssuerProfile",t)});return JSON.parse(r)},getRevokedAssertions:async function(e){if(!e)return Promise.resolve([]);const t=O("errors","getRevokedAssertions"),r=await ci({url:e}).catch(()=>{throw new j("parseIssuerKeys",t)}),n=JSON.parse(r);return n.revokedAssertions?n.revokedAssertions:[]},lookForTx:function(e,t,r){let n;switch(t){case y.bitcoin.code:case y.regtest.code:case y.testnet.code:case y.mocknet.code:n=vi;break;case y.ethmain.code:case y.ethropst.code:n=gi;break;default:return Promise.reject(new j(h,O("errors","lookForTxInvalidChain")))}if(S>n.length)return Promise.reject(new j(h,O("errors","lookForTxInvalidAppConfig")));if(S>yi.length&&(r===c.V1_1||r===c.V1_2))return Promise.reject(new j(h,O("errors","lookForTxInvalidAppConfig")));const i=[];let o;if(r===c.V1_1||r===c.V1_2){o=yi.length;for(let r=0;r<o;r++)i.push(yi[r](e,t));}else {o=n.length;for(let r=0;r<o;r++)i.push(n[r](e,t));}return new Promise((e,t)=>function e(t,r,n=[]){if((t=Array.from(t)).length<r)return Promise.reject(new j(h,O("errors","couldNotConfirmTx")));const i=t.map((e,t)=>e.then(()=>t).catch(e=>{throw bi(e),t}));return Promise.race(i).then(i=>(t.splice(i,1)[0].then(e=>n.push(e)),1===r?n:e(t,r-1,n))).catch(i=>(t.splice(i,1),e(t,r,n)))}(i,S).then(t=>{if(!t||0===t.length)return Promise.reject(new j(h,O("errors","lookForTxCouldNotConfirm")));const r=t[0];for(let e=1;e<t.length;e++){const n=t[e];if(r.issuingAddress!==n.issuingAddress)throw new j(h,O("errors","lookForTxDifferentAddresses"));if(r.remoteHash!==n.remoteHash)throw new j(h,O("errors","lookForTxDifferentRemoteHashes"))}e(r);}).catch(e=>{t(new j(h,e.message));}))},parseIssuerKeys:function(e){try{const t={};if("@context"in e){const r=e.publicKey||e.publicKeys;for(let e=0;e<r.length;e++){const n=wi(r[e]);t[n.publicKey]=n;}}else {const r=wi({},(e.issuerKeys||[])[0].key);t[r.publicKey]=r;}return t}catch(e){throw new j("parseIssuerKeys",O("errors","parseIssuerKeys"))}},parseRevocationKey:function(e){return e&&e.hasOwnProperty("revocationKeys")&&e.revocationKeys.length>0?e.revocationKeys[0].key:null}})},Si=["merkleRoot","targetHash","anchors"],Ei={merkleRoot:{type:"string",minLength:64,maxLength:64},targetHash:{type:"string",minLength:64,maxLength:64},anchors:{type:"array",minLength:1,items:{type:"string"}}},xi={type:"object",required:Si,properties:Ei},Ii=Object.freeze({__proto__:null,type:"object",required:Si,properties:Ei,default:xi}),ki=Yn((function(e,t){
  /** @license URI.js v4.2.1 (c) 2011 Gary Court. License: http://github.com/garycourt/uri-js */
  !function(e){function t(){for(var e=arguments.length,t=Array(e),r=0;r<e;r++)t[r]=arguments[r];if(t.length>1){t[0]=t[0].slice(0,-1);for(var n=t.length-1,i=1;i<n;++i)t[i]=t[i].slice(1,-1);return t[n]=t[n].slice(1),t.join("")}return t[0]}function r(e){return "(?:"+e+")"}function n(e){return void 0===e?"undefined":null===e?"null":Object.prototype.toString.call(e).split(" ").pop().split("]").shift().toLowerCase()}function i(e){return e.toUpperCase()}function o(e){var n=t("[0-9]","[A-Fa-f]"),i=r(r("%[EFef]"+n+"%"+n+n+"%"+n+n)+"|"+r("%[89A-Fa-f]"+n+"%"+n+n)+"|"+r("%"+n+n)),o="[\\!\\$\\&\\'\\(\\)\\*\\+\\,\\;\\=]",a=t("[\\:\\/\\?\\#\\[\\]\\@]",o),s=e?"[\\uE000-\\uF8FF]":"[]",c=t("[A-Za-z]","[0-9]","[\\-\\.\\_\\~]",e?"[\\xA0-\\u200D\\u2010-\\u2029\\u202F-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF]":"[]"),u=(r("[A-Za-z]"+t("[A-Za-z]","[0-9]","[\\+\\-\\.]")+"*"),r(r(i+"|"+t(c,o,"[\\:]"))+"*"),r(r("25[0-5]")+"|"+r("2[0-4][0-9]")+"|"+r("1[0-9][0-9]")+"|"+r("0?[1-9][0-9]")+"|0?0?[0-9]")),l=r(u+"\\."+u+"\\."+u+"\\."+u),f=r(n+"{1,4}"),h=r(r(f+"\\:"+f)+"|"+l),d=r(r(f+"\\:")+"{6}"+h),p=r("\\:\\:"+r(f+"\\:")+"{5}"+h),m=r(r(f)+"?\\:\\:"+r(f+"\\:")+"{4}"+h),v=r(r(r(f+"\\:")+"{0,1}"+f)+"?\\:\\:"+r(f+"\\:")+"{3}"+h),g=r(r(r(f+"\\:")+"{0,2}"+f)+"?\\:\\:"+r(f+"\\:")+"{2}"+h),y=r(r(r(f+"\\:")+"{0,3}"+f)+"?\\:\\:"+f+"\\:"+h),b=r(r(r(f+"\\:")+"{0,4}"+f)+"?\\:\\:"+h),w=r(r(r(f+"\\:")+"{0,5}"+f)+"?\\:\\:"+f),_=r(r(r(f+"\\:")+"{0,6}"+f)+"?\\:\\:"),S=r([d,p,m,v,g,y,b,w,_].join("|")),E=r(r(c+"|"+i)+"+"),x=(r("[vV]"+n+"+\\."+t(c,o,"[\\:]")+"+"),r(r(i+"|"+t(c,o))+"*"),r(i+"|"+t(c,o,"[\\:\\@]")));return r(r(i+"|"+t(c,o,"[\\@]"))+"+"),r(r(x+"|"+t("[\\/\\?]",s))+"*"),{NOT_SCHEME:new RegExp(t("[^]","[A-Za-z]","[0-9]","[\\+\\-\\.]"),"g"),NOT_USERINFO:new RegExp(t("[^\\%\\:]",c,o),"g"),NOT_HOST:new RegExp(t("[^\\%\\[\\]\\:]",c,o),"g"),NOT_PATH:new RegExp(t("[^\\%\\/\\:\\@]",c,o),"g"),NOT_PATH_NOSCHEME:new RegExp(t("[^\\%\\/\\@]",c,o),"g"),NOT_QUERY:new RegExp(t("[^\\%]",c,o,"[\\:\\@\\/\\?]",s),"g"),NOT_FRAGMENT:new RegExp(t("[^\\%]",c,o,"[\\:\\@\\/\\?]"),"g"),ESCAPE:new RegExp(t("[^]",c,o),"g"),UNRESERVED:new RegExp(c,"g"),OTHER_CHARS:new RegExp(t("[^\\%]",c,a),"g"),PCT_ENCODED:new RegExp(i,"g"),IPV4ADDRESS:new RegExp("^("+l+")$"),IPV6ADDRESS:new RegExp("^\\[?("+S+")"+r(r("\\%25|\\%(?!"+n+"{2})")+"("+E+")")+"?\\]?$")}}var a=o(!1),s=o(!0),c=function(e,t){if(Array.isArray(e))return e;if(Symbol.iterator in Object(e))return function(e,t){var r=[],n=!0,i=!1,o=void 0;try{for(var a,s=e[Symbol.iterator]();!(n=(a=s.next()).done)&&(r.push(a.value),!t||r.length!==t);n=!0);}catch(e){i=!0,o=e;}finally{try{!n&&s.return&&s.return();}finally{if(i)throw o}}return r}(e,t);throw new TypeError("Invalid attempt to destructure non-iterable instance")},u=2147483647,l=/^xn--/,f=/[^\0-\x7E]/,h=/[\x2E\u3002\uFF0E\uFF61]/g,d={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},p=Math.floor,m=String.fromCharCode;function v(e){throw new RangeError(d[e])}function g(e,t){var r=e.split("@"),n="";r.length>1&&(n=r[0]+"@",e=r[1]);var i=function(e,t){for(var r=[],n=e.length;n--;)r[n]=t(e[n]);return r}((e=e.replace(h,".")).split("."),t).join(".");return n+i}function y(e){for(var t=[],r=0,n=e.length;r<n;){var i=e.charCodeAt(r++);if(i>=55296&&i<=56319&&r<n){var o=e.charCodeAt(r++);56320==(64512&o)?t.push(((1023&i)<<10)+(1023&o)+65536):(t.push(i),r--);}else t.push(i);}return t}var b=function(e,t){return e+22+75*(e<26)-((0!=t)<<5)},w=function(e,t,r){var n=0;for(e=r?p(e/700):e>>1,e+=p(e/t);e>455;n+=36)e=p(e/35);return p(n+36*e/(e+38))},_=function(e){var t,r=[],n=e.length,i=0,o=128,a=72,s=e.lastIndexOf("-");s<0&&(s=0);for(var c=0;c<s;++c)e.charCodeAt(c)>=128&&v("not-basic"),r.push(e.charCodeAt(c));for(var l=s>0?s+1:0;l<n;){for(var f=i,h=1,d=36;;d+=36){l>=n&&v("invalid-input");var m=(t=e.charCodeAt(l++))-48<10?t-22:t-65<26?t-65:t-97<26?t-97:36;(m>=36||m>p((u-i)/h))&&v("overflow"),i+=m*h;var g=d<=a?1:d>=a+26?26:d-a;if(m<g)break;var y=36-g;h>p(u/y)&&v("overflow"),h*=y;}var b=r.length+1;a=w(i-f,b,0==f),p(i/b)>u-o&&v("overflow"),o+=p(i/b),i%=b,r.splice(i++,0,o);}return String.fromCodePoint.apply(String,r)},S=function(e){var t=[],r=(e=y(e)).length,n=128,i=0,o=72,a=!0,s=!1,c=void 0;try{for(var l,f=e[Symbol.iterator]();!(a=(l=f.next()).done);a=!0){var h=l.value;h<128&&t.push(m(h));}}catch(e){s=!0,c=e;}finally{try{!a&&f.return&&f.return();}finally{if(s)throw c}}var d=t.length,g=d;for(d&&t.push("-");g<r;){var _=u,S=!0,E=!1,x=void 0;try{for(var I,k=e[Symbol.iterator]();!(S=(I=k.next()).done);S=!0){var P=I.value;P>=n&&P<_&&(_=P);}}catch(e){E=!0,x=e;}finally{try{!S&&k.return&&k.return();}finally{if(E)throw x}}var O=g+1;_-n>p((u-i)/O)&&v("overflow"),i+=(_-n)*O,n=_;var T=!0,A=!1,C=void 0;try{for(var R,N=e[Symbol.iterator]();!(T=(R=N.next()).done);T=!0){var L=R.value;if(L<n&&++i>u&&v("overflow"),L==n){for(var M=i,j=36;;j+=36){var D=j<=o?1:j>=o+26?26:j-o;if(M<D)break;var B=M-D,U=36-D;t.push(m(b(D+B%U,0))),M=p(B/U);}t.push(m(b(M,0))),o=w(i,O,g==d),i=0,++g;}}}catch(e){A=!0,C=e;}finally{try{!T&&N.return&&N.return();}finally{if(A)throw C}}++i,++n;}return t.join("")},E=function(e){return g(e,(function(e){return f.test(e)?"xn--"+S(e):e}))},x=function(e){return g(e,(function(e){return l.test(e)?_(e.slice(4).toLowerCase()):e}))},I={};function k(e){var t=e.charCodeAt(0);return t<16?"%0"+t.toString(16).toUpperCase():t<128?"%"+t.toString(16).toUpperCase():t<2048?"%"+(t>>6|192).toString(16).toUpperCase()+"%"+(63&t|128).toString(16).toUpperCase():"%"+(t>>12|224).toString(16).toUpperCase()+"%"+(t>>6&63|128).toString(16).toUpperCase()+"%"+(63&t|128).toString(16).toUpperCase()}function P(e){for(var t="",r=0,n=e.length;r<n;){var i=parseInt(e.substr(r+1,2),16);if(i<128)t+=String.fromCharCode(i),r+=3;else if(i>=194&&i<224){if(n-r>=6){var o=parseInt(e.substr(r+4,2),16);t+=String.fromCharCode((31&i)<<6|63&o);}else t+=e.substr(r,6);r+=6;}else if(i>=224){if(n-r>=9){var a=parseInt(e.substr(r+4,2),16),s=parseInt(e.substr(r+7,2),16);t+=String.fromCharCode((15&i)<<12|(63&a)<<6|63&s);}else t+=e.substr(r,9);r+=9;}else t+=e.substr(r,3),r+=3;}return t}function O(e,t){function r(e){var r=P(e);return r.match(t.UNRESERVED)?r:e}return e.scheme&&(e.scheme=String(e.scheme).replace(t.PCT_ENCODED,r).toLowerCase().replace(t.NOT_SCHEME,"")),void 0!==e.userinfo&&(e.userinfo=String(e.userinfo).replace(t.PCT_ENCODED,r).replace(t.NOT_USERINFO,k).replace(t.PCT_ENCODED,i)),void 0!==e.host&&(e.host=String(e.host).replace(t.PCT_ENCODED,r).toLowerCase().replace(t.NOT_HOST,k).replace(t.PCT_ENCODED,i)),void 0!==e.path&&(e.path=String(e.path).replace(t.PCT_ENCODED,r).replace(e.scheme?t.NOT_PATH:t.NOT_PATH_NOSCHEME,k).replace(t.PCT_ENCODED,i)),void 0!==e.query&&(e.query=String(e.query).replace(t.PCT_ENCODED,r).replace(t.NOT_QUERY,k).replace(t.PCT_ENCODED,i)),void 0!==e.fragment&&(e.fragment=String(e.fragment).replace(t.PCT_ENCODED,r).replace(t.NOT_FRAGMENT,k).replace(t.PCT_ENCODED,i)),e}function T(e){return e.replace(/^0*(.*)/,"$1")||"0"}function A(e,t){var r=e.match(t.IPV4ADDRESS)||[],n=c(r,2)[1];return n?n.split(".").map(T).join("."):e}function C(e,t){var r=e.match(t.IPV6ADDRESS)||[],n=c(r,3),i=n[1],o=n[2];if(i){for(var a=i.toLowerCase().split("::").reverse(),s=c(a,2),u=s[0],l=s[1],f=l?l.split(":").map(T):[],h=u.split(":").map(T),d=t.IPV4ADDRESS.test(h[h.length-1]),p=d?7:8,m=h.length-p,v=Array(p),g=0;g<p;++g)v[g]=f[g]||h[m+g]||"";d&&(v[p-1]=A(v[p-1],t));var y=v.reduce((function(e,t,r){if(!t||"0"===t){var n=e[e.length-1];n&&n.index+n.length===r?n.length++:e.push({index:r,length:1});}return e}),[]).sort((function(e,t){return t.length-e.length}))[0],b=void 0;if(y&&y.length>1){var w=v.slice(0,y.index),_=v.slice(y.index+y.length);b=w.join(":")+"::"+_.join(":");}else b=v.join(":");return o&&(b+="%"+o),b}return e}var R=/^(?:([^:\/?#]+):)?(?:\/\/((?:([^\/?#@]*)@)?(\[[^\/?#\]]+\]|[^\/?#:]*)(?:\:(\d*))?))?([^?#]*)(?:\?([^#]*))?(?:#((?:.|\n|\r)*))?/i,N=void 0==="".match(/(){0}/)[1];function L(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},r={},n=!1!==t.iri?s:a;"suffix"===t.reference&&(e=(t.scheme?t.scheme+":":"")+"//"+e);var i=e.match(R);if(i){N?(r.scheme=i[1],r.userinfo=i[3],r.host=i[4],r.port=parseInt(i[5],10),r.path=i[6]||"",r.query=i[7],r.fragment=i[8],isNaN(r.port)&&(r.port=i[5])):(r.scheme=i[1]||void 0,r.userinfo=-1!==e.indexOf("@")?i[3]:void 0,r.host=-1!==e.indexOf("//")?i[4]:void 0,r.port=parseInt(i[5],10),r.path=i[6]||"",r.query=-1!==e.indexOf("?")?i[7]:void 0,r.fragment=-1!==e.indexOf("#")?i[8]:void 0,isNaN(r.port)&&(r.port=e.match(/\/\/(?:.|\n)*\:(?:\/|\?|\#|$)/)?i[4]:void 0)),r.host&&(r.host=C(A(r.host,n),n)),void 0!==r.scheme||void 0!==r.userinfo||void 0!==r.host||void 0!==r.port||r.path||void 0!==r.query?void 0===r.scheme?r.reference="relative":void 0===r.fragment?r.reference="absolute":r.reference="uri":r.reference="same-document",t.reference&&"suffix"!==t.reference&&t.reference!==r.reference&&(r.error=r.error||"URI is not a "+t.reference+" reference.");var o=I[(t.scheme||r.scheme||"").toLowerCase()];if(t.unicodeSupport||o&&o.unicodeSupport)O(r,n);else {if(r.host&&(t.domainHost||o&&o.domainHost))try{r.host=E(r.host.replace(n.PCT_ENCODED,P).toLowerCase());}catch(e){r.error=r.error||"Host's domain name can not be converted to ASCII via punycode: "+e;}O(r,a);}o&&o.parse&&o.parse(r,t);}else r.error=r.error||"URI can not be parsed.";return r}function M(e,t){var r=!1!==t.iri?s:a,n=[];return void 0!==e.userinfo&&(n.push(e.userinfo),n.push("@")),void 0!==e.host&&n.push(C(A(String(e.host),r),r).replace(r.IPV6ADDRESS,(function(e,t,r){return "["+t+(r?"%25"+r:"")+"]"}))),"number"==typeof e.port&&(n.push(":"),n.push(e.port.toString(10))),n.length?n.join(""):void 0}var j=/^\.\.?\//,D=/^\/\.(\/|$)/,B=/^\/\.\.(\/|$)/,U=/^\/?(?:.|\n)*?(?=\/|$)/;function F(e){for(var t=[];e.length;)if(e.match(j))e=e.replace(j,"");else if(e.match(D))e=e.replace(D,"/");else if(e.match(B))e=e.replace(B,"/"),t.pop();else if("."===e||".."===e)e="";else {var r=e.match(U);if(!r)throw new Error("Unexpected dot segment condition");var n=r[0];e=e.slice(n.length),t.push(n);}return t.join("")}function H(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{},r=t.iri?s:a,n=[],i=I[(t.scheme||e.scheme||"").toLowerCase()];if(i&&i.serialize&&i.serialize(e,t),e.host)if(r.IPV6ADDRESS.test(e.host));else if(t.domainHost||i&&i.domainHost)try{e.host=t.iri?x(e.host):E(e.host.replace(r.PCT_ENCODED,P).toLowerCase());}catch(r){e.error=e.error||"Host's domain name can not be converted to "+(t.iri?"Unicode":"ASCII")+" via punycode: "+r;}O(e,r),"suffix"!==t.reference&&e.scheme&&(n.push(e.scheme),n.push(":"));var o=M(e,t);if(void 0!==o&&("suffix"!==t.reference&&n.push("//"),n.push(o),e.path&&"/"!==e.path.charAt(0)&&n.push("/")),void 0!==e.path){var c=e.path;t.absolutePath||i&&i.absolutePath||(c=F(c)),void 0===o&&(c=c.replace(/^\/\//,"/%2F")),n.push(c);}return void 0!==e.query&&(n.push("?"),n.push(e.query)),void 0!==e.fragment&&(n.push("#"),n.push(e.fragment)),n.join("")}function z(e,t){var r=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{},n=arguments[3],i={};return n||(e=L(H(e,r),r),t=L(H(t,r),r)),!(r=r||{}).tolerant&&t.scheme?(i.scheme=t.scheme,i.userinfo=t.userinfo,i.host=t.host,i.port=t.port,i.path=F(t.path||""),i.query=t.query):(void 0!==t.userinfo||void 0!==t.host||void 0!==t.port?(i.userinfo=t.userinfo,i.host=t.host,i.port=t.port,i.path=F(t.path||""),i.query=t.query):(t.path?("/"===t.path.charAt(0)?i.path=F(t.path):(void 0===e.userinfo&&void 0===e.host&&void 0===e.port||e.path?e.path?i.path=e.path.slice(0,e.path.lastIndexOf("/")+1)+t.path:i.path=t.path:i.path="/"+t.path,i.path=F(i.path)),i.query=t.query):(i.path=e.path,void 0!==t.query?i.query=t.query:i.query=e.query),i.userinfo=e.userinfo,i.host=e.host,i.port=e.port),i.scheme=e.scheme),i.fragment=t.fragment,i}function V(e,t){return e&&e.toString().replace(t&&t.iri?s.PCT_ENCODED:a.PCT_ENCODED,P)}var q={scheme:"http",domainHost:!0,parse:function(e,t){return e.host||(e.error=e.error||"HTTP URIs must have a host."),e},serialize:function(e,t){return e.port!==("https"!==String(e.scheme).toLowerCase()?80:443)&&""!==e.port||(e.port=void 0),e.path||(e.path="/"),e}},K={scheme:"https",domainHost:q.domainHost,parse:q.parse,serialize:q.serialize},$={},G="[A-Za-z0-9\\-\\.\\_\\~\\xA0-\\u200D\\u2010-\\u2029\\u202F-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF]",J="[0-9A-Fa-f]",W=r(r("%[EFef][0-9A-Fa-f]%"+J+J+"%"+J+J)+"|"+r("%[89A-Fa-f][0-9A-Fa-f]%"+J+J)+"|"+r("%"+J+J)),X=t("[\\!\\$\\%\\'\\(\\)\\*\\+\\,\\-\\.0-9\\<\\>A-Z\\x5E-\\x7E]",'[\\"\\\\]'),Y=new RegExp(G,"g"),Q=new RegExp(W,"g"),Z=new RegExp(t("[^]","[A-Za-z0-9\\!\\$\\%\\'\\*\\+\\-\\^\\_\\`\\{\\|\\}\\~]","[\\.]",'[\\"]',X),"g"),ee=new RegExp(t("[^]",G,"[\\!\\$\\'\\(\\)\\*\\+\\,\\;\\:\\@]"),"g"),te=ee;function re(e){var t=P(e);return t.match(Y)?t:e}var ne={scheme:"mailto",parse:function(e,t){var r=e,n=r.to=r.path?r.path.split(","):[];if(r.path=void 0,r.query){for(var i=!1,o={},a=r.query.split("&"),s=0,c=a.length;s<c;++s){var u=a[s].split("=");switch(u[0]){case"to":for(var l=u[1].split(","),f=0,h=l.length;f<h;++f)n.push(l[f]);break;case"subject":r.subject=V(u[1],t);break;case"body":r.body=V(u[1],t);break;default:i=!0,o[V(u[0],t)]=V(u[1],t);}}i&&(r.headers=o);}r.query=void 0;for(var d=0,p=n.length;d<p;++d){var m=n[d].split("@");if(m[0]=V(m[0]),t.unicodeSupport)m[1]=V(m[1],t).toLowerCase();else try{m[1]=E(V(m[1],t).toLowerCase());}catch(e){r.error=r.error||"Email address's domain name can not be converted to ASCII via punycode: "+e;}n[d]=m.join("@");}return r},serialize:function(e,t){var r,n=e,o=null!=(r=e.to)?r instanceof Array?r:"number"!=typeof r.length||r.split||r.setInterval||r.call?[r]:Array.prototype.slice.call(r):[];if(o){for(var a=0,s=o.length;a<s;++a){var c=String(o[a]),u=c.lastIndexOf("@"),l=c.slice(0,u).replace(Q,re).replace(Q,i).replace(Z,k),f=c.slice(u+1);try{f=t.iri?x(f):E(V(f,t).toLowerCase());}catch(e){n.error=n.error||"Email address's domain name can not be converted to "+(t.iri?"Unicode":"ASCII")+" via punycode: "+e;}o[a]=l+"@"+f;}n.path=o.join(",");}var h=e.headers=e.headers||{};e.subject&&(h.subject=e.subject),e.body&&(h.body=e.body);var d=[];for(var p in h)h[p]!==$[p]&&d.push(p.replace(Q,re).replace(Q,i).replace(ee,k)+"="+h[p].replace(Q,re).replace(Q,i).replace(te,k));return d.length&&(n.query=d.join("&")),n}},ie=/^([^\:]+)\:(.*)/,oe={scheme:"urn",parse:function(e,t){var r=e.path&&e.path.match(ie),n=e;if(r){var i=t.scheme||n.scheme||"urn",o=r[1].toLowerCase(),a=r[2],s=i+":"+(t.nid||o),c=I[s];n.nid=o,n.nss=a,n.path=void 0,c&&(n=c.parse(n,t));}else n.error=n.error||"URN can not be parsed.";return n},serialize:function(e,t){var r=t.scheme||e.scheme||"urn",n=e.nid,i=r+":"+(t.nid||n),o=I[i];o&&(e=o.serialize(e,t));var a=e,s=e.nss;return a.path=(n||t.nid)+":"+s,a}},ae=/^[0-9A-Fa-f]{8}(?:\-[0-9A-Fa-f]{4}){3}\-[0-9A-Fa-f]{12}$/,se={scheme:"urn:uuid",parse:function(e,t){var r=e;return r.uuid=r.nss,r.nss=void 0,t.tolerant||r.uuid&&r.uuid.match(ae)||(r.error=r.error||"UUID is not valid."),r},serialize:function(e,t){var r=e;return r.nss=(e.uuid||"").toLowerCase(),r}};I[q.scheme]=q,I[K.scheme]=K,I[ne.scheme]=ne,I[oe.scheme]=oe,I[se.scheme]=se,e.SCHEMES=I,e.pctEncChar=k,e.pctDecChars=P,e.parse=L,e.removeDotSegments=F,e.serialize=H,e.resolveComponents=z,e.resolve=function(e,t,r){var n=function(e,t){var r=e;if(t)for(var n in t)r[n]=t[n];return r}({scheme:"null"},r);return H(z(L(e,n),L(t,n),n,!0),n)},e.normalize=function(e,t){return "string"==typeof e?e=H(L(e,t),t):"object"===n(e)&&(e=L(H(e,t),t)),e},e.equal=function(e,t,r){return "string"==typeof e?e=H(L(e,r),r):"object"===n(e)&&(e=H(e,r)),"string"==typeof t?t=H(L(t,r),r):"object"===n(t)&&(t=H(t,r)),e===t},e.escapeComponent=function(e,t){return e&&e.toString().replace(t&&t.iri?s.ESCAPE:a.ESCAPE,k)},e.unescapeComponent=V,Object.defineProperty(e,"__esModule",{value:!0});}(t);}));Xn(ki);var Pi=Array.isArray,Oi=Object.keys,Ti=Object.prototype.hasOwnProperty,Ai=function e(t,r){if(t===r)return !0;if(t&&r&&"object"==typeof t&&"object"==typeof r){var n,i,o,a=Pi(t),s=Pi(r);if(a&&s){if((i=t.length)!=r.length)return !1;for(n=i;0!=n--;)if(!e(t[n],r[n]))return !1;return !0}if(a!=s)return !1;var c=t instanceof Date,u=r instanceof Date;if(c!=u)return !1;if(c&&u)return t.getTime()==r.getTime();var l=t instanceof RegExp,f=r instanceof RegExp;if(l!=f)return !1;if(l&&f)return t.toString()==r.toString();var h=Oi(t);if((i=h.length)!==Oi(r).length)return !1;for(n=i;0!=n--;)if(!Ti.call(r,h[n]))return !1;for(n=i;0!=n--;)if(!e(t[o=h[n]],r[o]))return !1;return !0}return t!=t&&r!=r},Ci={copy:function(e,t){for(var r in t=t||{},e)t[r]=e[r];return t},checkDataType:Ri,checkDataTypes:function(e,t){switch(e.length){case 1:return Ri(e[0],t,!0);default:var r="",n=Li(e);for(var i in n.array&&n.object&&(r=n.null?"(":"(!"+t+" || ",r+="typeof "+t+' !== "object")',delete n.null,delete n.array,delete n.object),n.number&&delete n.integer,n)r+=(r?" && ":"")+Ri(i,t,!0);return r}},coerceToTypes:function(e,t){if(Array.isArray(t)){for(var r=[],n=0;n<t.length;n++){var i=t[n];(Ni[i]||"array"===e&&"array"===i)&&(r[r.length]=i);}if(r.length)return r}else {if(Ni[t])return [t];if("array"===e&&"array"===t)return ["array"]}},toHash:Li,getProperty:Di,escapeQuotes:Bi,equal:Ai,ucs2length:function(e){for(var t,r=0,n=e.length,i=0;i<n;)r++,(t=e.charCodeAt(i++))>=55296&&t<=56319&&i<n&&56320==(64512&(t=e.charCodeAt(i)))&&i++;return r},varOccurences:function(e,t){t+="[^0-9]";var r=e.match(new RegExp(t,"g"));return r?r.length:0},varReplace:function(e,t,r){return t+="([^0-9])",r=r.replace(/\$/g,"$$$$"),e.replace(new RegExp(t,"g"),r+"$1")},cleanUpCode:function(e){return e.replace(Ui,"").replace(Fi,"").replace(Hi,"if (!($1))")},finalCleanUpCode:function(e,t){var r=e.match(zi);r&&2==r.length&&(e=t?e.replace(qi,"").replace(Ki,"return data;"):e.replace(Vi,"").replace("return errors === 0;","validate.errors = null; return true;"));return (r=e.match($i))&&3===r.length?e.replace(Gi,""):e},schemaHasRules:function(e,t){if("boolean"==typeof e)return !e;for(var r in e)if(t[r])return !0},schemaHasRulesExcept:function(e,t,r){if("boolean"==typeof e)return !e&&"not"!=r;for(var n in e)if(n!=r&&t[n])return !0},schemaUnknownRules:function(e,t){if("boolean"==typeof e)return;for(var r in e)if(!t[r])return r},toQuotedString:Ji,getPathExpr:function(e,t,r,n){return Yi(e,r?"'/' + "+t+(n?"":".replace(/~/g, '~0').replace(/\\//g, '~1')"):n?"'[' + "+t+" + ']'":"'[\\'' + "+t+" + '\\']'")},getPath:function(e,t,r){var n=Ji(r?"/"+Qi(t):Di(t));return Yi(e,n)},getData:function(e,t,r){var n,i,o,a;if(""===e)return "rootData";if("/"==e[0]){if(!Wi.test(e))throw new Error("Invalid JSON-pointer: "+e);i=e,o="rootData";}else {if(!(a=e.match(Xi)))throw new Error("Invalid JSON-pointer: "+e);if(n=+a[1],"#"==(i=a[2])){if(n>=t)throw new Error("Cannot access property/index "+n+" levels up, current level is "+t);return r[t-n]}if(n>t)throw new Error("Cannot access data "+n+" levels up, current level is "+t);if(o="data"+(t-n||""),!i)return o}for(var s=o,c=i.split("/"),u=0;u<c.length;u++){var l=c[u];l&&(o+=Di(Zi(l)),s+=" && "+o);}return s},unescapeFragment:function(e){return Zi(decodeURIComponent(e))},unescapeJsonPointer:Zi,escapeFragment:function(e){return encodeURIComponent(Qi(e))},escapeJsonPointer:Qi};function Ri(e,t,r){var n=r?" !== ":" === ",i=r?" || ":" && ",o=r?"!":"",a=r?"":"!";switch(e){case"null":return t+n+"null";case"array":return o+"Array.isArray("+t+")";case"object":return "("+o+t+i+"typeof "+t+n+'"object"'+i+a+"Array.isArray("+t+"))";case"integer":return "(typeof "+t+n+'"number"'+i+a+"("+t+" % 1)"+i+t+n+t+")";default:return "typeof "+t+n+'"'+e+'"'}}var Ni=Li(["string","number","integer","boolean","null"]);function Li(e){for(var t={},r=0;r<e.length;r++)t[e[r]]=!0;return t}var Mi=/^[a-z$_][a-z$_0-9]*$/i,ji=/'|\\/g;function Di(e){return "number"==typeof e?"["+e+"]":Mi.test(e)?"."+e:"['"+Bi(e)+"']"}function Bi(e){return e.replace(ji,"\\$&").replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/\f/g,"\\f").replace(/\t/g,"\\t")}var Ui=/else\s*{\s*}/g,Fi=/if\s*\([^)]+\)\s*\{\s*\}(?!\s*else)/g,Hi=/if\s*\(([^)]+)\)\s*\{\s*\}\s*else(?!\s*if)/g;var zi=/[^v.]errors/g,Vi=/var errors = 0;|var vErrors = null;|validate.errors = vErrors;/g,qi=/var errors = 0;|var vErrors = null;/g,Ki=/if \(errors === 0\) return data;\s*else throw new ValidationError\(vErrors\);/,$i=/[^A-Za-z_$]rootData[^A-Za-z0-9_$]/g,Gi=/if \(rootData === undefined\) rootData = data;/;function Ji(e){return "'"+Bi(e)+"'"}var Wi=/^\/(?:[^~]|~0|~1)*$/,Xi=/^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;function Yi(e,t){return '""'==e?t:(e+" + "+t).replace(/' \+ '/g,"")}function Qi(e){return e.replace(/~/g,"~0").replace(/\//g,"~1")}function Zi(e){return e.replace(/~1/g,"/").replace(/~0/g,"~")}var eo=function(e){Ci.copy(e,this);};var to=Yn((function(e){var t=e.exports=function(e,r,n){"function"==typeof r&&(n=r,r={}),function e(r,n,i,o,a,s,c,u,l,f){if(o&&"object"==typeof o&&!Array.isArray(o)){for(var h in n(o,a,s,c,u,l,f),o){var d=o[h];if(Array.isArray(d)){if(h in t.arrayKeywords)for(var p=0;p<d.length;p++)e(r,n,i,d[p],a+"/"+h+"/"+p,s,a,h,o,p);}else if(h in t.propsKeywords){if(d&&"object"==typeof d)for(var m in d)e(r,n,i,d[m],a+"/"+h+"/"+m.replace(/~/g,"~0").replace(/\//g,"~1"),s,a,h,o,m);}else (h in t.keywords||r.allKeys&&!(h in t.skipKeywords))&&e(r,n,i,d,a+"/"+h,s,a,h,o);}i(o,a,s,c,u,l,f);}}(r,"function"==typeof(n=r.cb||n)?n:n.pre||function(){},n.post||function(){},e,"",e);};t.keywords={additionalItems:!0,items:!0,contains:!0,additionalProperties:!0,propertyNames:!0,not:!0},t.arrayKeywords={items:!0,allOf:!0,anyOf:!0,oneOf:!0},t.propsKeywords={definitions:!0,properties:!0,patternProperties:!0,dependencies:!0},t.skipKeywords={default:!0,enum:!0,const:!0,required:!0,maximum:!0,minimum:!0,exclusiveMaximum:!0,exclusiveMinimum:!0,multipleOf:!0,maxLength:!0,minLength:!0,pattern:!0,format:!0,maxItems:!0,minItems:!0,uniqueItems:!0,maxProperties:!0,minProperties:!0};})),ro=no;function no(e,t,r){var n=this._refs[r];if("string"==typeof n){if(!this._refs[n])return no.call(this,e,t,n);n=this._refs[n];}if((n=n||this._schemas[r])instanceof eo)return uo(n.schema,this._opts.inlineRefs)?n.schema:n.validate||this._compile(n);var i,o,a,s=io.call(this,t,r);return s&&(i=s.schema,t=s.root,a=s.baseId),i instanceof eo?o=i.validate||e.call(this,i.schema,t,void 0,a):void 0!==i&&(o=uo(i,this._opts.inlineRefs)?i:e.call(this,i,t,void 0,a)),o}function io(e,t){var r=ki.parse(t),n=fo(r),i=lo(this._getId(e.schema));if(0===Object.keys(e.schema).length||n!==i){var o=po(n),a=this._refs[o];if("string"==typeof a)return oo.call(this,e,a,r);if(a instanceof eo)a.validate||this._compile(a),e=a;else {if(!((a=this._schemas[o])instanceof eo))return;if(a.validate||this._compile(a),o==po(t))return {schema:a,root:e,baseId:i};e=a;}if(!e.schema)return;i=lo(this._getId(e.schema));}return so.call(this,r,i,e.schema,e)}function oo(e,t,r){var n=io.call(this,e,t);if(n){var i=n.schema,o=n.baseId;e=n.root;var a=this._getId(i);return a&&(o=mo(o,a)),so.call(this,r,o,i,e)}}no.normalizeId=po,no.fullPath=lo,no.url=mo,no.ids=function(e){var t=po(this._getId(e)),r={"":t},n={"":lo(t,!1)},i={},o=this;return to(e,{allKeys:!0},(function(e,t,a,s,c,u,l){if(""!==t){var f=o._getId(e),h=r[s],d=n[s]+"/"+c;if(void 0!==l&&(d+="/"+("number"==typeof l?l:Ci.escapeFragment(l))),"string"==typeof f){f=h=po(h?ki.resolve(h,f):f);var p=o._refs[f];if("string"==typeof p&&(p=o._refs[p]),p&&p.schema){if(!Ai(e,p.schema))throw new Error('id "'+f+'" resolves to more than one schema')}else if(f!=po(d))if("#"==f[0]){if(i[f]&&!Ai(e,i[f]))throw new Error('id "'+f+'" resolves to more than one schema');i[f]=e;}else o._refs[f]=d;}r[t]=h,n[t]=d;}})),i},no.inlineRef=uo,no.schema=io;var ao=Ci.toHash(["properties","patternProperties","enum","dependencies","definitions"]);function so(e,t,r,n){if(e.fragment=e.fragment||"","/"==e.fragment.slice(0,1)){for(var i=e.fragment.split("/"),o=1;o<i.length;o++){var a=i[o];if(a){if(void 0===(r=r[a=Ci.unescapeFragment(a)]))break;var s;if(!ao[a]&&((s=this._getId(r))&&(t=mo(t,s)),r.$ref)){var c=mo(t,r.$ref),u=io.call(this,n,c);u&&(r=u.schema,n=u.root,t=u.baseId);}}}return void 0!==r&&r!==n.schema?{schema:r,root:n,baseId:t}:void 0}}var co=Ci.toHash(["type","format","pattern","maxLength","minLength","maxProperties","minProperties","maxItems","minItems","maximum","minimum","uniqueItems","multipleOf","required","enum"]);function uo(e,t){return !1!==t&&(void 0===t||!0===t?function e(t){var r;if(Array.isArray(t)){for(var n=0;n<t.length;n++)if("object"==typeof(r=t[n])&&!e(r))return !1}else for(var i in t){if("$ref"==i)return !1;if("object"==typeof(r=t[i])&&!e(r))return !1}return !0}(e):t?function e(t){var r,n=0;if(Array.isArray(t)){for(var i=0;i<t.length;i++)if("object"==typeof(r=t[i])&&(n+=e(r)),n==1/0)return 1/0}else for(var o in t){if("$ref"==o)return 1/0;if(co[o])n++;else if("object"==typeof(r=t[o])&&(n+=e(r)+1),n==1/0)return 1/0}return n}(e)<=t:void 0)}function lo(e,t){return !1!==t&&(e=po(e)),fo(ki.parse(e))}function fo(e){return ki.serialize(e).split("#")[0]+"#"}var ho=/#\/?$/;function po(e){return e?e.replace(ho,""):""}function mo(e,t){return t=po(t),ki.resolve(e,t)}var vo={Validation:yo((function(e){this.message="validation failed",this.errors=e,this.ajv=this.validation=!0;})),MissingRef:yo(go)};function go(e,t,r){this.message=r||go.message(e,t),this.missingRef=ro.url(e,t),this.missingSchema=ro.normalizeId(ro.fullPath(this.missingRef));}function yo(e){return e.prototype=Object.create(Error.prototype),e.prototype.constructor=e,e}go.message=function(e,t){return "can't resolve reference "+t+" from id "+e};var bo=function(e,t){t||(t={}),"function"==typeof t&&(t={cmp:t});var r="boolean"==typeof t.cycles&&t.cycles,n=t.cmp&&function(e){return function(t){return function(r,n){var i={key:r,value:t[r]},o={key:n,value:t[n]};return e(i,o)}}}(t.cmp),i=[];return function e(t){if(t&&t.toJSON&&"function"==typeof t.toJSON&&(t=t.toJSON()),void 0!==t){if("number"==typeof t)return isFinite(t)?""+t:"null";if("object"!=typeof t)return JSON.stringify(t);var o,a;if(Array.isArray(t)){for(a="[",o=0;o<t.length;o++)o&&(a+=","),a+=e(t[o])||"null";return a+"]"}if(null===t)return "null";if(-1!==i.indexOf(t)){if(r)return JSON.stringify("__cycle__");throw new TypeError("Converting circular structure to JSON")}var s=i.push(t)-1,c=Object.keys(t).sort(n&&n(t));for(a="",o=0;o<c.length;o++){var u=c[o],l=e(t[u]);l&&(a&&(a+=","),a+=JSON.stringify(u)+":"+l);}return i.splice(s,1),"{"+a+"}"}}(e)},wo=function(e,t,r){var n="",i=!0===e.schema.$async,o=e.util.schemaHasRulesExcept(e.schema,e.RULES.all,"$ref"),a=e.self._getId(e.schema);if(e.opts.strictKeywords){var s=e.util.schemaUnknownRules(e.schema,e.RULES.keywords);if(s){var c="unknown keyword: "+s;if("log"!==e.opts.strictKeywords)throw new Error(c);e.logger.warn(c);}}if(e.isTop&&(n+=" var validate = ",i&&(e.async=!0,n+="async "),n+="function(data, dataPath, parentData, parentDataProperty, rootData) { 'use strict'; ",a&&(e.opts.sourceCode||e.opts.processCode)&&(n+=" /*# sourceURL="+a+" */ ")),"boolean"==typeof e.schema||!o&&!e.schema.$ref){var u=e.level,l=e.dataLevel,f=e.schema["false schema"],h=e.schemaPath+e.util.getProperty("false schema"),d=e.errSchemaPath+"/false schema",p=!e.opts.allErrors,m="data"+(l||""),v="valid"+u;if(!1===e.schema){e.isTop?p=!0:n+=" var "+v+" = false; ",(Y=Y||[]).push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'false schema' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(d)+" , params: {} ",!1!==e.opts.messages&&(n+=" , message: 'boolean schema is false' "),e.opts.verbose&&(n+=" , schema: false , parentSchema: validate.schema"+e.schemaPath+" , data: "+m+" "),n+=" } "):n+=" {} ";var g=n;n=Y.pop(),!e.compositeRule&&p?e.async?n+=" throw new ValidationError(["+g+"]); ":n+=" validate.errors = ["+g+"]; return false; ":n+=" var err = "+g+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";}else e.isTop?n+=i?" return data; ":" validate.errors = null; return true; ":n+=" var "+v+" = true; ";return e.isTop&&(n+=" }; return validate; "),n}if(e.isTop){var y=e.isTop;u=e.level=0,l=e.dataLevel=0,m="data";if(e.rootId=e.resolve.fullPath(e.self._getId(e.root.schema)),e.baseId=e.baseId||e.rootId,delete e.isTop,e.dataPathArr=[void 0],void 0!==e.schema.default&&e.opts.useDefaults&&e.opts.strictDefaults){var b="default is ignored in the schema root";if("log"!==e.opts.strictDefaults)throw new Error(b);e.logger.warn(b);}n+=" var vErrors = null; ",n+=" var errors = 0;     ",n+=" if (rootData === undefined) rootData = data; ";}else {u=e.level,m="data"+((l=e.dataLevel)||"");if(a&&(e.baseId=e.resolve.url(e.baseId,a)),i&&!e.async)throw new Error("async schema in sync schema");n+=" var errs_"+u+" = errors;";}v="valid"+u,p=!e.opts.allErrors;var w="",_="",S=e.schema.type,E=Array.isArray(S);if(S&&e.opts.nullable&&!0===e.schema.nullable&&(E?-1==S.indexOf("null")&&(S=S.concat("null")):"null"!=S&&(S=[S,"null"],E=!0)),E&&1==S.length&&(S=S[0],E=!1),e.schema.$ref&&o){if("fail"==e.opts.extendRefs)throw new Error('$ref: validation keywords used in schema at path "'+e.errSchemaPath+'" (see option extendRefs)');!0!==e.opts.extendRefs&&(o=!1,e.logger.warn('$ref: keywords ignored in schema at path "'+e.errSchemaPath+'"'));}if(e.schema.$comment&&e.opts.$comment&&(n+=" "+e.RULES.all.$comment.code(e,"$comment")),S){if(e.opts.coerceTypes)var x=e.util.coerceToTypes(e.opts.coerceTypes,S);var I=e.RULES.types[S];if(x||E||!0===I||I&&!Q(I)){h=e.schemaPath+".type",d=e.errSchemaPath+"/type",h=e.schemaPath+".type",d=e.errSchemaPath+"/type";var k=E?"checkDataTypes":"checkDataType";if(n+=" if ("+e.util[k](S,m,!0)+") { ",x){var P="dataType"+u,O="coerced"+u;n+=" var "+P+" = typeof "+m+"; ","array"==e.opts.coerceTypes&&(n+=" if ("+P+" == 'object' && Array.isArray("+m+")) "+P+" = 'array'; "),n+=" var "+O+" = undefined; ";var T="",A=x;if(A)for(var C,R=-1,N=A.length-1;R<N;)C=A[R+=1],R&&(n+=" if ("+O+" === undefined) { ",T+="}"),"array"==e.opts.coerceTypes&&"array"!=C&&(n+=" if ("+P+" == 'array' && "+m+".length == 1) { "+O+" = "+m+" = "+m+"[0]; "+P+" = typeof "+m+";  } "),"string"==C?n+=" if ("+P+" == 'number' || "+P+" == 'boolean') "+O+" = '' + "+m+"; else if ("+m+" === null) "+O+" = ''; ":"number"==C||"integer"==C?(n+=" if ("+P+" == 'boolean' || "+m+" === null || ("+P+" == 'string' && "+m+" && "+m+" == +"+m+" ","integer"==C&&(n+=" && !("+m+" % 1)"),n+=")) "+O+" = +"+m+"; "):"boolean"==C?n+=" if ("+m+" === 'false' || "+m+" === 0 || "+m+" === null) "+O+" = false; else if ("+m+" === 'true' || "+m+" === 1) "+O+" = true; ":"null"==C?n+=" if ("+m+" === '' || "+m+" === 0 || "+m+" === false) "+O+" = null; ":"array"==e.opts.coerceTypes&&"array"==C&&(n+=" if ("+P+" == 'string' || "+P+" == 'number' || "+P+" == 'boolean' || "+m+" == null) "+O+" = ["+m+"]; ");n+=" "+T+" if ("+O+" === undefined) {   ",(Y=Y||[]).push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'type' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(d)+" , params: { type: '",n+=E?""+S.join(","):""+S,n+="' } ",!1!==e.opts.messages&&(n+=" , message: 'should be ",n+=E?""+S.join(","):""+S,n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+h+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+m+" "),n+=" } "):n+=" {} ";g=n;n=Y.pop(),!e.compositeRule&&p?e.async?n+=" throw new ValidationError(["+g+"]); ":n+=" validate.errors = ["+g+"]; return false; ":n+=" var err = "+g+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" } else {  ";var L=l?"data"+(l-1||""):"parentData";n+=" "+m+" = "+O+"; ",l||(n+="if ("+L+" !== undefined)"),n+=" "+L+"["+(l?e.dataPathArr[l]:"parentDataProperty")+"] = "+O+"; } ";}else {(Y=Y||[]).push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'type' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(d)+" , params: { type: '",n+=E?""+S.join(","):""+S,n+="' } ",!1!==e.opts.messages&&(n+=" , message: 'should be ",n+=E?""+S.join(","):""+S,n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+h+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+m+" "),n+=" } "):n+=" {} ";g=n;n=Y.pop(),!e.compositeRule&&p?e.async?n+=" throw new ValidationError(["+g+"]); ":n+=" validate.errors = ["+g+"]; return false; ":n+=" var err = "+g+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";}n+=" } ";}}if(e.schema.$ref&&!o)n+=" "+e.RULES.all.$ref.code(e,"$ref")+" ",p&&(n+=" } if (errors === ",n+=y?"0":"errs_"+u,n+=") { ",_+="}");else {var M=e.RULES;if(M)for(var j=-1,D=M.length-1;j<D;)if(Q(I=M[j+=1])){if(I.type&&(n+=" if ("+e.util.checkDataType(I.type,m)+") { "),e.opts.useDefaults)if("object"==I.type&&e.schema.properties){f=e.schema.properties;var B=Object.keys(f);if(B)for(var U,F=-1,H=B.length-1;F<H;){if(void 0!==(q=f[U=B[F+=1]]).default){var z=m+e.util.getProperty(U);if(e.compositeRule){if(e.opts.strictDefaults){b="default is ignored for: "+z;if("log"!==e.opts.strictDefaults)throw new Error(b);e.logger.warn(b);}}else n+=" if ("+z+" === undefined ","empty"==e.opts.useDefaults&&(n+=" || "+z+" === null || "+z+" === '' "),n+=" ) "+z+" = ","shared"==e.opts.useDefaults?n+=" "+e.useDefault(q.default)+" ":n+=" "+JSON.stringify(q.default)+" ",n+="; ";}}}else if("array"==I.type&&Array.isArray(e.schema.items)){var V=e.schema.items;if(V){R=-1;for(var q,K=V.length-1;R<K;)if(void 0!==(q=V[R+=1]).default){z=m+"["+R+"]";if(e.compositeRule){if(e.opts.strictDefaults){b="default is ignored for: "+z;if("log"!==e.opts.strictDefaults)throw new Error(b);e.logger.warn(b);}}else n+=" if ("+z+" === undefined ","empty"==e.opts.useDefaults&&(n+=" || "+z+" === null || "+z+" === '' "),n+=" ) "+z+" = ","shared"==e.opts.useDefaults?n+=" "+e.useDefault(q.default)+" ":n+=" "+JSON.stringify(q.default)+" ",n+="; ";}}}var $=I.rules;if($)for(var G,J=-1,W=$.length-1;J<W;)if(Z(G=$[J+=1])){var X=G.code(e,G.keyword,I.type);X&&(n+=" "+X+" ",p&&(w+="}"));}if(p&&(n+=" "+w+" ",w=""),I.type&&(n+=" } ",S&&S===I.type&&!x)){n+=" else { ";var Y;h=e.schemaPath+".type",d=e.errSchemaPath+"/type";(Y=Y||[]).push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'type' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(d)+" , params: { type: '",n+=E?""+S.join(","):""+S,n+="' } ",!1!==e.opts.messages&&(n+=" , message: 'should be ",n+=E?""+S.join(","):""+S,n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+h+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+m+" "),n+=" } "):n+=" {} ";g=n;n=Y.pop(),!e.compositeRule&&p?e.async?n+=" throw new ValidationError(["+g+"]); ":n+=" validate.errors = ["+g+"]; return false; ":n+=" var err = "+g+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" } ";}p&&(n+=" if (errors === ",n+=y?"0":"errs_"+u,n+=") { ",_+="}");}}function Q(e){for(var t=e.rules,r=0;r<t.length;r++)if(Z(t[r]))return !0}function Z(t){return void 0!==e.schema[t.keyword]||t.implements&&function(t){for(var r=t.implements,n=0;n<r.length;n++)if(void 0!==e.schema[r[n]])return !0}(t)}return p&&(n+=" "+_+" "),y?(i?(n+=" if (errors === 0) return data;           ",n+=" else throw new ValidationError(vErrors); "):(n+=" validate.errors = vErrors; ",n+=" return errors === 0;       "),n+=" }; return validate;"):n+=" var "+v+" = errors === errs_"+u+";",n=e.util.cleanUpCode(n),y&&(n=e.util.finalCleanUpCode(n,i)),n},_o=Ci.ucs2length,So=vo.Validation,Eo=function e(t,r,n,i){var o=this,a=this._opts,s=[void 0],c={},u=[],l={},f=[],h={},d=[];r=r||{schema:t,refVal:s,refs:c};var p=xo.call(this,t,r,i),m=this._compilations[p.index];if(p.compiling)return m.callValidate=function e(){var t=m.validate,r=t.apply(this,arguments);return e.errors=t.errors,r};var v=this._formats,g=this.RULES;try{var y=w(t,r,n,i);m.validate=y;var b=m.callValidate;return b&&(b.schema=y.schema,b.errors=null,b.refs=y.refs,b.refVal=y.refVal,b.root=y.root,b.$async=y.$async,a.sourceCode&&(b.source=y.source)),y}finally{Io.call(this,t,r,i);}function w(t,n,i,l){var h=!n||n&&n.schema==t;if(n.schema!=r.schema)return e.call(o,t,n,i,l);var p,m=!0===t.$async,y=wo({isTop:!0,schema:t,isRoot:h,baseId:l,root:n,schemaPath:"",errSchemaPath:"#",errorPath:'""',MissingRefError:vo.MissingRef,RULES:g,validate:wo,util:Ci,resolve:ro,resolveRef:_,usePattern:x,useDefault:I,useCustomRule:k,opts:a,formats:v,logger:o.logger,self:o});y=Co(s,To)+Co(u,Po)+Co(f,Oo)+Co(d,Ao)+y,a.processCode&&(y=a.processCode(y));try{p=new Function("self","RULES","formats","root","refVal","defaults","customRules","equal","ucs2length","ValidationError",y)(o,g,v,r,s,f,d,Ai,_o,So),s[0]=p;}catch(e){throw o.logger.error("Error compiling schema, function code:",y),e}return p.schema=t,p.errors=null,p.refs=c,p.refVal=s,p.root=h?p:n,m&&(p.$async=!0),!0===a.sourceCode&&(p.source={code:y,patterns:u,defaults:f}),p}function _(t,i,u){i=ro.url(t,i);var l,f,h=c[i];if(void 0!==h)return E(l=s[h],f="refVal["+h+"]");if(!u&&r.refs){var d=r.refs[i];if(void 0!==d)return E(l=r.refVal[d],f=S(i,l))}f=S(i);var p=ro.call(o,w,r,i);if(void 0===p){var m=n&&n[i];m&&(p=ro.inlineRef(m,a.inlineRefs)?m:e.call(o,m,r,n,t));}if(void 0!==p)return function(e,t){var r=c[e];s[r]=t;}(i,p),E(p,f);!function(e){delete c[e];}(i);}function S(e,t){var r=s.length;return s[r]=t,c[e]=r,"refVal"+r}function E(e,t){return "object"==typeof e||"boolean"==typeof e?{code:t,schema:e,inline:!0}:{code:t,$async:e&&!!e.$async}}function x(e){var t=l[e];return void 0===t&&(t=l[e]=u.length,u[t]=e),"pattern"+t}function I(e){switch(typeof e){case"boolean":case"number":return ""+e;case"string":return Ci.toQuotedString(e);case"object":if(null===e)return "null";var t=bo(e),r=h[t];return void 0===r&&(r=h[t]=f.length,f[r]=e),"default"+r}}function k(e,t,r,n){if(!1!==o._opts.validateSchema){var i=e.definition.dependencies;if(i&&!i.every((function(e){return Object.prototype.hasOwnProperty.call(r,e)})))throw new Error("parent schema must have all required keywords: "+i.join(","));var s=e.definition.validateSchema;if(s)if(!s(t)){var c="keyword schema is invalid: "+o.errorsText(s.errors);if("log"!=o._opts.validateSchema)throw new Error(c);o.logger.error(c);}}var u,l=e.definition.compile,f=e.definition.inline,h=e.definition.macro;if(l)u=l.call(o,t,r,n);else if(h)u=h.call(o,t,r,n),!1!==a.validateSchema&&o.validateSchema(u,!0);else if(f)u=f.call(o,n,e.keyword,t,r);else if(!(u=e.definition.validate))return;if(void 0===u)throw new Error('custom keyword "'+e.keyword+'"failed to compile');var p=d.length;return d[p]=u,{code:"customRule"+p,validate:u}}};function xo(e,t,r){var n=ko.call(this,e,t,r);return n>=0?{index:n,compiling:!0}:(n=this._compilations.length,this._compilations[n]={schema:e,root:t,baseId:r},{index:n,compiling:!1})}function Io(e,t,r){var n=ko.call(this,e,t,r);n>=0&&this._compilations.splice(n,1);}function ko(e,t,r){for(var n=0;n<this._compilations.length;n++){var i=this._compilations[n];if(i.schema==e&&i.root==t&&i.baseId==r)return n}return -1}function Po(e,t){return "var pattern"+e+" = new RegExp("+Ci.toQuotedString(t[e])+");"}function Oo(e){return "var default"+e+" = defaults["+e+"];"}function To(e,t){return void 0===t[e]?"":"var refVal"+e+" = refVal["+e+"];"}function Ao(e){return "var customRule"+e+" = customRules["+e+"];"}function Co(e,t){if(!e.length)return "";for(var r="",n=0;n<e.length;n++)r+=t(n,e);return r}var Ro=Yn((function(e){var t=e.exports=function(){this._cache={};};t.prototype.put=function(e,t){this._cache[e]=t;},t.prototype.get=function(e){return this._cache[e]},t.prototype.del=function(e){delete this._cache[e];},t.prototype.clear=function(){this._cache={};};})),No=/^(\d\d\d\d)-(\d\d)-(\d\d)$/,Lo=[0,31,28,31,30,31,30,31,31,30,31,30,31],Mo=/^(\d\d):(\d\d):(\d\d)(\.\d+)?(z|[+-]\d\d:\d\d)?$/i,jo=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*$/i,Do=/^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,Bo=/^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,Uo=/^(?:(?:http[s\u017F]?|ftp):\/\/)(?:(?:[\0-\x08\x0E-\x1F!-\x9F\xA1-\u167F\u1681-\u1FFF\u200B-\u2027\u202A-\u202E\u2030-\u205E\u2060-\u2FFF\u3001-\uD7FF\uE000-\uFEFE\uFF00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+(?::(?:[\0-\x08\x0E-\x1F!-\x9F\xA1-\u167F\u1681-\u1FFF\u200B-\u2027\u202A-\u202E\u2030-\u205E\u2060-\u2FFF\u3001-\uD7FF\uE000-\uFEFE\uFF00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])*)?@)?(?:(?!10(?:\.[0-9]{1,3}){3})(?!127(?:\.[0-9]{1,3}){3})(?!169\.254(?:\.[0-9]{1,3}){2})(?!192\.168(?:\.[0-9]{1,3}){2})(?!172\.(?:1[6-9]|2[0-9]|3[01])(?:\.[0-9]{1,3}){2})(?:[1-9][0-9]?|1[0-9][0-9]|2[01][0-9]|22[0-3])(?:\.(?:1?[0-9]{1,2}|2[0-4][0-9]|25[0-5])){2}(?:\.(?:[1-9][0-9]?|1[0-9][0-9]|2[0-4][0-9]|25[0-4]))|(?:(?:(?:[0-9KSa-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+-?)*(?:[0-9KSa-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+)(?:\.(?:(?:[0-9KSa-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+-?)*(?:[0-9KSa-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])+)*(?:\.(?:(?:[KSa-z\xA1-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]){2,})))(?::[0-9]{2,5})?(?:\/(?:[\0-\x08\x0E-\x1F!-\x9F\xA1-\u167F\u1681-\u1FFF\u200B-\u2027\u202A-\u202E\u2030-\u205E\u2060-\u2FFF\u3001-\uD7FF\uE000-\uFEFE\uFF00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])*)?$/i,Fo=/^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,Ho=/^(?:\/(?:[^~/]|~0|~1)*)*$/,zo=/^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,Vo=/^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,qo=Ko;function Ko(e){return e="full"==e?"full":"fast",Ci.copy(Ko[e])}function $o(e){var t=e.match(No);if(!t)return !1;var r=+t[1],n=+t[2],i=+t[3];return n>=1&&n<=12&&i>=1&&i<=(2==n&&function(e){return e%4==0&&(e%100!=0||e%400==0)}(r)?29:Lo[n])}function Go(e,t){var r=e.match(Mo);if(!r)return !1;var n=r[1],i=r[2],o=r[3],a=r[5];return (n<=23&&i<=59&&o<=59||23==n&&59==i&&60==o)&&(!t||a)}Ko.fast={date:/^\d\d\d\d-[0-1]\d-[0-3]\d$/,time:/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d:\d\d)?$/i,"date-time":/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d:\d\d)$/i,uri:/^(?:[a-z][a-z0-9+-.]*:)(?:\/?\/)?[^\s]*$/i,"uri-reference":/^(?:(?:[a-z][a-z0-9+-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,"uri-template":Bo,url:Uo,email:/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i,hostname:jo,ipv4:/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,ipv6:/^\s*(?:(?:(?:[0-9a-f]{1,4}:){7}(?:[0-9a-f]{1,4}|:))|(?:(?:[0-9a-f]{1,4}:){6}(?::[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(?:(?:[0-9a-f]{1,4}:){5}(?:(?:(?::[0-9a-f]{1,4}){1,2})|:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(?:(?:[0-9a-f]{1,4}:){4}(?:(?:(?::[0-9a-f]{1,4}){1,3})|(?:(?::[0-9a-f]{1,4})?:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){3}(?:(?:(?::[0-9a-f]{1,4}){1,4})|(?:(?::[0-9a-f]{1,4}){0,2}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){2}(?:(?:(?::[0-9a-f]{1,4}){1,5})|(?:(?::[0-9a-f]{1,4}){0,3}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){1}(?:(?:(?::[0-9a-f]{1,4}){1,6})|(?:(?::[0-9a-f]{1,4}){0,4}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?::(?:(?:(?::[0-9a-f]{1,4}){1,7})|(?:(?::[0-9a-f]{1,4}){0,5}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(?:%.+)?\s*$/i,regex:Yo,uuid:Fo,"json-pointer":Ho,"json-pointer-uri-fragment":zo,"relative-json-pointer":Vo},Ko.full={date:$o,time:Go,"date-time":function(e){var t=e.split(Jo);return 2==t.length&&$o(t[0])&&Go(t[1],!0)},uri:function(e){return Wo.test(e)&&Do.test(e)},"uri-reference":/^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,"uri-template":Bo,url:Uo,email:/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,hostname:function(e){return e.length<=255&&jo.test(e)},ipv4:/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,ipv6:/^\s*(?:(?:(?:[0-9a-f]{1,4}:){7}(?:[0-9a-f]{1,4}|:))|(?:(?:[0-9a-f]{1,4}:){6}(?::[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(?:(?:[0-9a-f]{1,4}:){5}(?:(?:(?::[0-9a-f]{1,4}){1,2})|:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(?:(?:[0-9a-f]{1,4}:){4}(?:(?:(?::[0-9a-f]{1,4}){1,3})|(?:(?::[0-9a-f]{1,4})?:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){3}(?:(?:(?::[0-9a-f]{1,4}){1,4})|(?:(?::[0-9a-f]{1,4}){0,2}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){2}(?:(?:(?::[0-9a-f]{1,4}){1,5})|(?:(?::[0-9a-f]{1,4}){0,3}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?:(?:[0-9a-f]{1,4}:){1}(?:(?:(?::[0-9a-f]{1,4}){1,6})|(?:(?::[0-9a-f]{1,4}){0,4}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(?::(?:(?:(?::[0-9a-f]{1,4}){1,7})|(?:(?::[0-9a-f]{1,4}){0,5}:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(?:%.+)?\s*$/i,regex:Yo,uuid:Fo,"json-pointer":Ho,"json-pointer-uri-fragment":zo,"relative-json-pointer":Vo};var Jo=/t|\s/i;var Wo=/\/|:/;var Xo=/[^\\]\\Z/;function Yo(e){if(Xo.test(e))return !1;try{return new RegExp(e),!0}catch(e){return !1}}var Qo=function(e,t,r){var n,i=" ",o=e.level,a=e.dataLevel,s=e.schema[t],c=e.schemaPath+e.util.getProperty(t),u=e.errSchemaPath+"/"+t,l=!e.opts.allErrors,f="data"+(a||""),h=e.opts.$data&&s&&s.$data;h?(i+=" var schema"+o+" = "+e.util.getData(s.$data,a,e.dataPathArr)+"; ",n="schema"+o):n=s;var d="maximum"==t,p=d?"exclusiveMaximum":"exclusiveMinimum",m=e.schema[p],v=e.opts.$data&&m&&m.$data,g=d?"<":">",y=d?">":"<",b=void 0;if(v){var w=e.util.getData(m.$data,a,e.dataPathArr),_="exclusive"+o,S="exclType"+o,E="exclIsNumber"+o,x="' + "+(P="op"+o)+" + '";i+=" var schemaExcl"+o+" = "+w+"; ",i+=" var "+_+"; var "+S+" = typeof "+(w="schemaExcl"+o)+"; if ("+S+" != 'boolean' && "+S+" != 'undefined' && "+S+" != 'number') { ";var I;b=p;(I=I||[]).push(i),i="",!1!==e.createErrors?(i+=" { keyword: '"+(b||"_exclusiveLimit")+"' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: {} ",!1!==e.opts.messages&&(i+=" , message: '"+p+" should be boolean' "),e.opts.verbose&&(i+=" , schema: validate.schema"+c+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),i+=" } "):i+=" {} ";var k=i;i=I.pop(),!e.compositeRule&&l?e.async?i+=" throw new ValidationError(["+k+"]); ":i+=" validate.errors = ["+k+"]; return false; ":i+=" var err = "+k+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",i+=" } else if ( ",h&&(i+=" ("+n+" !== undefined && typeof "+n+" != 'number') || "),i+=" "+S+" == 'number' ? ( ("+_+" = "+n+" === undefined || "+w+" "+g+"= "+n+") ? "+f+" "+y+"= "+w+" : "+f+" "+y+" "+n+" ) : ( ("+_+" = "+w+" === true) ? "+f+" "+y+"= "+n+" : "+f+" "+y+" "+n+" ) || "+f+" !== "+f+") { var op"+o+" = "+_+" ? '"+g+"' : '"+g+"='; ",void 0===s&&(b=p,u=e.errSchemaPath+"/"+p,n=w,h=v);}else {x=g;if((E="number"==typeof m)&&h){var P="'"+x+"'";i+=" if ( ",h&&(i+=" ("+n+" !== undefined && typeof "+n+" != 'number') || "),i+=" ( "+n+" === undefined || "+m+" "+g+"= "+n+" ? "+f+" "+y+"= "+m+" : "+f+" "+y+" "+n+" ) || "+f+" !== "+f+") { ";}else {E&&void 0===s?(_=!0,b=p,u=e.errSchemaPath+"/"+p,n=m,y+="="):(E&&(n=Math[d?"min":"max"](m,s)),m===(!E||n)?(_=!0,b=p,u=e.errSchemaPath+"/"+p,y+="="):(_=!1,x+="="));P="'"+x+"'";i+=" if ( ",h&&(i+=" ("+n+" !== undefined && typeof "+n+" != 'number') || "),i+=" "+f+" "+y+" "+n+" || "+f+" !== "+f+") { ";}}b=b||t,(I=I||[]).push(i),i="",!1!==e.createErrors?(i+=" { keyword: '"+(b||"_limit")+"' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: { comparison: "+P+", limit: "+n+", exclusive: "+_+" } ",!1!==e.opts.messages&&(i+=" , message: 'should be "+x+" ",i+=h?"' + "+n:n+"'"),e.opts.verbose&&(i+=" , schema:  ",i+=h?"validate.schema"+c:""+s,i+="         , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),i+=" } "):i+=" {} ";k=i;return i=I.pop(),!e.compositeRule&&l?e.async?i+=" throw new ValidationError(["+k+"]); ":i+=" validate.errors = ["+k+"]; return false; ":i+=" var err = "+k+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",i+=" } ",l&&(i+=" else { "),i},Zo=function(e,t,r){var n,i=" ",o=e.level,a=e.dataLevel,s=e.schema[t],c=e.schemaPath+e.util.getProperty(t),u=e.errSchemaPath+"/"+t,l=!e.opts.allErrors,f="data"+(a||""),h=e.opts.$data&&s&&s.$data;h?(i+=" var schema"+o+" = "+e.util.getData(s.$data,a,e.dataPathArr)+"; ",n="schema"+o):n=s,i+="if ( ",h&&(i+=" ("+n+" !== undefined && typeof "+n+" != 'number') || "),i+=" "+f+".length "+("maxItems"==t?">":"<")+" "+n+") { ";var d=t,p=p||[];p.push(i),i="",!1!==e.createErrors?(i+=" { keyword: '"+(d||"_limitItems")+"' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: { limit: "+n+" } ",!1!==e.opts.messages&&(i+=" , message: 'should NOT have ",i+="maxItems"==t?"more":"fewer",i+=" than ",i+=h?"' + "+n+" + '":""+s,i+=" items' "),e.opts.verbose&&(i+=" , schema:  ",i+=h?"validate.schema"+c:""+s,i+="         , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),i+=" } "):i+=" {} ";var m=i;return i=p.pop(),!e.compositeRule&&l?e.async?i+=" throw new ValidationError(["+m+"]); ":i+=" validate.errors = ["+m+"]; return false; ":i+=" var err = "+m+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",i+="} ",l&&(i+=" else { "),i},ea=function(e,t,r){var n,i=" ",o=e.level,a=e.dataLevel,s=e.schema[t],c=e.schemaPath+e.util.getProperty(t),u=e.errSchemaPath+"/"+t,l=!e.opts.allErrors,f="data"+(a||""),h=e.opts.$data&&s&&s.$data;h?(i+=" var schema"+o+" = "+e.util.getData(s.$data,a,e.dataPathArr)+"; ",n="schema"+o):n=s;var d="maxLength"==t?">":"<";i+="if ( ",h&&(i+=" ("+n+" !== undefined && typeof "+n+" != 'number') || "),!1===e.opts.unicode?i+=" "+f+".length ":i+=" ucs2length("+f+") ",i+=" "+d+" "+n+") { ";var p=t,m=m||[];m.push(i),i="",!1!==e.createErrors?(i+=" { keyword: '"+(p||"_limitLength")+"' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: { limit: "+n+" } ",!1!==e.opts.messages&&(i+=" , message: 'should NOT be ",i+="maxLength"==t?"longer":"shorter",i+=" than ",i+=h?"' + "+n+" + '":""+s,i+=" characters' "),e.opts.verbose&&(i+=" , schema:  ",i+=h?"validate.schema"+c:""+s,i+="         , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),i+=" } "):i+=" {} ";var v=i;return i=m.pop(),!e.compositeRule&&l?e.async?i+=" throw new ValidationError(["+v+"]); ":i+=" validate.errors = ["+v+"]; return false; ":i+=" var err = "+v+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",i+="} ",l&&(i+=" else { "),i},ta=function(e,t,r){var n,i=" ",o=e.level,a=e.dataLevel,s=e.schema[t],c=e.schemaPath+e.util.getProperty(t),u=e.errSchemaPath+"/"+t,l=!e.opts.allErrors,f="data"+(a||""),h=e.opts.$data&&s&&s.$data;h?(i+=" var schema"+o+" = "+e.util.getData(s.$data,a,e.dataPathArr)+"; ",n="schema"+o):n=s,i+="if ( ",h&&(i+=" ("+n+" !== undefined && typeof "+n+" != 'number') || "),i+=" Object.keys("+f+").length "+("maxProperties"==t?">":"<")+" "+n+") { ";var d=t,p=p||[];p.push(i),i="",!1!==e.createErrors?(i+=" { keyword: '"+(d||"_limitProperties")+"' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: { limit: "+n+" } ",!1!==e.opts.messages&&(i+=" , message: 'should NOT have ",i+="maxProperties"==t?"more":"fewer",i+=" than ",i+=h?"' + "+n+" + '":""+s,i+=" properties' "),e.opts.verbose&&(i+=" , schema:  ",i+=h?"validate.schema"+c:""+s,i+="         , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),i+=" } "):i+=" {} ";var m=i;return i=p.pop(),!e.compositeRule&&l?e.async?i+=" throw new ValidationError(["+m+"]); ":i+=" validate.errors = ["+m+"]; return false; ":i+=" var err = "+m+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",i+="} ",l&&(i+=" else { "),i},ra={$ref:function(e,t,r){var n,i,o=" ",a=e.level,s=e.dataLevel,c=e.schema[t],u=e.errSchemaPath+"/"+t,l=!e.opts.allErrors,f="data"+(s||""),h="valid"+a;if("#"==c||"#/"==c)e.isRoot?(n=e.async,i="validate"):(n=!0===e.root.schema.$async,i="root.refVal[0]");else {var d=e.resolveRef(e.baseId,c,e.isRoot);if(void 0===d){var p=e.MissingRefError.message(e.baseId,c);if("fail"==e.opts.missingRefs){e.logger.error(p),(y=y||[]).push(o),o="",!1!==e.createErrors?(o+=" { keyword: '$ref' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: { ref: '"+e.util.escapeQuotes(c)+"' } ",!1!==e.opts.messages&&(o+=" , message: 'can\\'t resolve reference "+e.util.escapeQuotes(c)+"' "),e.opts.verbose&&(o+=" , schema: "+e.util.toQuotedString(c)+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),o+=" } "):o+=" {} ";var m=o;o=y.pop(),!e.compositeRule&&l?e.async?o+=" throw new ValidationError(["+m+"]); ":o+=" validate.errors = ["+m+"]; return false; ":o+=" var err = "+m+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",l&&(o+=" if (false) { ");}else {if("ignore"!=e.opts.missingRefs)throw new e.MissingRefError(e.baseId,c,p);e.logger.warn(p),l&&(o+=" if (true) { ");}}else if(d.inline){var v=e.util.copy(e);v.level++;var g="valid"+v.level;v.schema=d.schema,v.schemaPath="",v.errSchemaPath=c,o+=" "+e.validate(v).replace(/validate\.schema/g,d.code)+" ",l&&(o+=" if ("+g+") { ");}else n=!0===d.$async||e.async&&!1!==d.$async,i=d.code;}if(i){var y;(y=y||[]).push(o),o="",e.opts.passContext?o+=" "+i+".call(this, ":o+=" "+i+"( ",o+=" "+f+", (dataPath || '')",'""'!=e.errorPath&&(o+=" + "+e.errorPath);var b=o+=" , "+(s?"data"+(s-1||""):"parentData")+" , "+(s?e.dataPathArr[s]:"parentDataProperty")+", rootData)  ";if(o=y.pop(),n){if(!e.async)throw new Error("async schema referenced by sync schema");l&&(o+=" var "+h+"; "),o+=" try { await "+b+"; ",l&&(o+=" "+h+" = true; "),o+=" } catch (e) { if (!(e instanceof ValidationError)) throw e; if (vErrors === null) vErrors = e.errors; else vErrors = vErrors.concat(e.errors); errors = vErrors.length; ",l&&(o+=" "+h+" = false; "),o+=" } ",l&&(o+=" if ("+h+") { ");}else o+=" if (!"+b+") { if (vErrors === null) vErrors = "+i+".errors; else vErrors = vErrors.concat("+i+".errors); errors = vErrors.length; } ",l&&(o+=" else { ");}return o},allOf:function(e,t,r){var n=" ",i=e.schema[t],o=e.schemaPath+e.util.getProperty(t),a=e.errSchemaPath+"/"+t,s=!e.opts.allErrors,c=e.util.copy(e),u="";c.level++;var l="valid"+c.level,f=c.baseId,h=!0,d=i;if(d)for(var p,m=-1,v=d.length-1;m<v;)p=d[m+=1],(e.opts.strictKeywords?"object"==typeof p&&Object.keys(p).length>0:e.util.schemaHasRules(p,e.RULES.all))&&(h=!1,c.schema=p,c.schemaPath=o+"["+m+"]",c.errSchemaPath=a+"/"+m,n+="  "+e.validate(c)+" ",c.baseId=f,s&&(n+=" if ("+l+") { ",u+="}"));return s&&(n+=h?" if (true) { ":" "+u.slice(0,-1)+" "),n=e.util.cleanUpCode(n)},anyOf:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="valid"+i,h="errs__"+i,d=e.util.copy(e),p="";d.level++;var m="valid"+d.level;if(a.every((function(t){return e.opts.strictKeywords?"object"==typeof t&&Object.keys(t).length>0:e.util.schemaHasRules(t,e.RULES.all)}))){var v=d.baseId;n+=" var "+h+" = errors; var "+f+" = false;  ";var g=e.compositeRule;e.compositeRule=d.compositeRule=!0;var y=a;if(y)for(var b,w=-1,_=y.length-1;w<_;)b=y[w+=1],d.schema=b,d.schemaPath=s+"["+w+"]",d.errSchemaPath=c+"/"+w,n+="  "+e.validate(d)+" ",d.baseId=v,n+=" "+f+" = "+f+" || "+m+"; if (!"+f+") { ",p+="}";e.compositeRule=d.compositeRule=g,n+=" "+p+" if (!"+f+") {   var err =   ",!1!==e.createErrors?(n+=" { keyword: 'anyOf' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: {} ",!1!==e.opts.messages&&(n+=" , message: 'should match some schema in anyOf' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",!e.compositeRule&&u&&(e.async?n+=" throw new ValidationError(vErrors); ":n+=" validate.errors = vErrors; return false; "),n+=" } else {  errors = "+h+"; if (vErrors !== null) { if ("+h+") vErrors.length = "+h+"; else vErrors = null; } ",e.opts.allErrors&&(n+=" } "),n=e.util.cleanUpCode(n);}else u&&(n+=" if (true) { ");return n},$comment:function(e,t,r){var n=" ",i=e.schema[t],o=e.errSchemaPath+"/"+t,a=(e.opts.allErrors,e.util.toQuotedString(i));return !0===e.opts.$comment?n+=" console.log("+a+");":"function"==typeof e.opts.$comment&&(n+=" self._opts.$comment("+a+", "+e.util.toQuotedString(o)+", validate.root.schema);"),n},const:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="valid"+i,h=e.opts.$data&&a&&a.$data;h&&(n+=" var schema"+i+" = "+e.util.getData(a.$data,o,e.dataPathArr)+"; "),h||(n+=" var schema"+i+" = validate.schema"+s+";"),n+="var "+f+" = equal("+l+", schema"+i+"); if (!"+f+") {   ";var d=d||[];d.push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'const' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { allowedValue: schema"+i+" } ",!1!==e.opts.messages&&(n+=" , message: 'should be equal to constant' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var p=n;return n=d.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+p+"]); ":n+=" validate.errors = ["+p+"]; return false; ":n+=" var err = "+p+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" }",u&&(n+=" else { "),n},contains:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="valid"+i,h="errs__"+i,d=e.util.copy(e);d.level++;var p="valid"+d.level,m="i"+i,v=d.dataLevel=e.dataLevel+1,g="data"+v,y=e.baseId,b=e.opts.strictKeywords?"object"==typeof a&&Object.keys(a).length>0:e.util.schemaHasRules(a,e.RULES.all);if(n+="var "+h+" = errors;var "+f+";",b){var w=e.compositeRule;e.compositeRule=d.compositeRule=!0,d.schema=a,d.schemaPath=s,d.errSchemaPath=c,n+=" var "+p+" = false; for (var "+m+" = 0; "+m+" < "+l+".length; "+m+"++) { ",d.errorPath=e.util.getPathExpr(e.errorPath,m,e.opts.jsonPointers,!0);var _=l+"["+m+"]";d.dataPathArr[v]=m;var S=e.validate(d);d.baseId=y,e.util.varOccurences(S,g)<2?n+=" "+e.util.varReplace(S,g,_)+" ":n+=" var "+g+" = "+_+"; "+S+" ",n+=" if ("+p+") break; }  ",e.compositeRule=d.compositeRule=w,n+="  if (!"+p+") {";}else n+=" if ("+l+".length == 0) {";var E=E||[];E.push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'contains' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: {} ",!1!==e.opts.messages&&(n+=" , message: 'should contain a valid item' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var x=n;return n=E.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+x+"]); ":n+=" validate.errors = ["+x+"]; return false; ":n+=" var err = "+x+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" } else { ",b&&(n+="  errors = "+h+"; if (vErrors !== null) { if ("+h+") vErrors.length = "+h+"; else vErrors = null; } "),e.opts.allErrors&&(n+=" } "),n=e.util.cleanUpCode(n)},dependencies:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="errs__"+i,h=e.util.copy(e),d="";h.level++;var p="valid"+h.level,m={},v={},g=e.opts.ownProperties;for(_ in a){var y=a[_],b=Array.isArray(y)?v:m;b[_]=y;}n+="var "+f+" = errors;";var w=e.errorPath;for(var _ in n+="var missing"+i+";",v)if((b=v[_]).length){if(n+=" if ( "+l+e.util.getProperty(_)+" !== undefined ",g&&(n+=" && Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(_)+"') "),u){n+=" && ( ";var S=b;if(S)for(var E=-1,x=S.length-1;E<x;){A=S[E+=1],E&&(n+=" || "),n+=" ( ( "+(L=l+(N=e.util.getProperty(A)))+" === undefined ",g&&(n+=" || ! Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(A)+"') "),n+=") && (missing"+i+" = "+e.util.toQuotedString(e.opts.jsonPointers?A:N)+") ) ";}n+=")) {  ";var I="missing"+i,k="' + "+I+" + '";e.opts._errorDataPathProperty&&(e.errorPath=e.opts.jsonPointers?e.util.getPathExpr(w,I,!0):w+" + "+I);var P=P||[];P.push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'dependencies' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { property: '"+e.util.escapeQuotes(_)+"', missingProperty: '"+k+"', depsCount: "+b.length+", deps: '"+e.util.escapeQuotes(1==b.length?b[0]:b.join(", "))+"' } ",!1!==e.opts.messages&&(n+=" , message: 'should have ",1==b.length?n+="property "+e.util.escapeQuotes(b[0]):n+="properties "+e.util.escapeQuotes(b.join(", ")),n+=" when property "+e.util.escapeQuotes(_)+" is present' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var O=n;n=P.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+O+"]); ":n+=" validate.errors = ["+O+"]; return false; ":n+=" var err = "+O+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";}else {n+=" ) { ";var T=b;if(T)for(var A,C=-1,R=T.length-1;C<R;){A=T[C+=1];var N=e.util.getProperty(A),L=(k=e.util.escapeQuotes(A),l+N);e.opts._errorDataPathProperty&&(e.errorPath=e.util.getPath(w,A,e.opts.jsonPointers)),n+=" if ( "+L+" === undefined ",g&&(n+=" || ! Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(A)+"') "),n+=") {  var err =   ",!1!==e.createErrors?(n+=" { keyword: 'dependencies' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { property: '"+e.util.escapeQuotes(_)+"', missingProperty: '"+k+"', depsCount: "+b.length+", deps: '"+e.util.escapeQuotes(1==b.length?b[0]:b.join(", "))+"' } ",!1!==e.opts.messages&&(n+=" , message: 'should have ",1==b.length?n+="property "+e.util.escapeQuotes(b[0]):n+="properties "+e.util.escapeQuotes(b.join(", ")),n+=" when property "+e.util.escapeQuotes(_)+" is present' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; } ";}}n+=" }   ",u&&(d+="}",n+=" else { ");}e.errorPath=w;var M=h.baseId;for(var _ in m){y=m[_];(e.opts.strictKeywords?"object"==typeof y&&Object.keys(y).length>0:e.util.schemaHasRules(y,e.RULES.all))&&(n+=" "+p+" = true; if ( "+l+e.util.getProperty(_)+" !== undefined ",g&&(n+=" && Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(_)+"') "),n+=") { ",h.schema=y,h.schemaPath=s+e.util.getProperty(_),h.errSchemaPath=c+"/"+e.util.escapeFragment(_),n+="  "+e.validate(h)+" ",h.baseId=M,n+=" }  ",u&&(n+=" if ("+p+") { ",d+="}"));}return u&&(n+="   "+d+" if ("+f+" == errors) {"),n=e.util.cleanUpCode(n)},enum:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="valid"+i,h=e.opts.$data&&a&&a.$data;h&&(n+=" var schema"+i+" = "+e.util.getData(a.$data,o,e.dataPathArr)+"; ");var d="i"+i,p="schema"+i;h||(n+=" var "+p+" = validate.schema"+s+";"),n+="var "+f+";",h&&(n+=" if (schema"+i+" === undefined) "+f+" = true; else if (!Array.isArray(schema"+i+")) "+f+" = false; else {"),n+=f+" = false;for (var "+d+"=0; "+d+"<"+p+".length; "+d+"++) if (equal("+l+", "+p+"["+d+"])) { "+f+" = true; break; }",h&&(n+="  }  "),n+=" if (!"+f+") {   ";var m=m||[];m.push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'enum' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { allowedValues: schema"+i+" } ",!1!==e.opts.messages&&(n+=" , message: 'should be equal to one of the allowed values' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var v=n;return n=m.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+v+"]); ":n+=" validate.errors = ["+v+"]; return false; ":n+=" var err = "+v+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" }",u&&(n+=" else { "),n},format:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||"");if(!1===e.opts.format)return u&&(n+=" if (true) { "),n;var f,h=e.opts.$data&&a&&a.$data;h?(n+=" var schema"+i+" = "+e.util.getData(a.$data,o,e.dataPathArr)+"; ",f="schema"+i):f=a;var d=e.opts.unknownFormats,p=Array.isArray(d);if(h){n+=" var "+(m="format"+i)+" = formats["+f+"]; var "+(v="isObject"+i)+" = typeof "+m+" == 'object' && !("+m+" instanceof RegExp) && "+m+".validate; var "+(g="formatType"+i)+" = "+v+" && "+m+".type || 'string'; if ("+v+") { ",e.async&&(n+=" var async"+i+" = "+m+".async; "),n+=" "+m+" = "+m+".validate; } if (  ",h&&(n+=" ("+f+" !== undefined && typeof "+f+" != 'string') || "),n+=" (","ignore"!=d&&(n+=" ("+f+" && !"+m+" ",p&&(n+=" && self._opts.unknownFormats.indexOf("+f+") == -1 "),n+=") || "),n+=" ("+m+" && "+g+" == '"+r+"' && !(typeof "+m+" == 'function' ? ",e.async?n+=" (async"+i+" ? await "+m+"("+l+") : "+m+"("+l+")) ":n+=" "+m+"("+l+") ",n+=" : "+m+".test("+l+"))))) {";}else {var m;if(!(m=e.formats[a])){if("ignore"==d)return e.logger.warn('unknown format "'+a+'" ignored in schema at path "'+e.errSchemaPath+'"'),u&&(n+=" if (true) { "),n;if(p&&d.indexOf(a)>=0)return u&&(n+=" if (true) { "),n;throw new Error('unknown format "'+a+'" is used in schema at path "'+e.errSchemaPath+'"')}var v,g=(v="object"==typeof m&&!(m instanceof RegExp)&&m.validate)&&m.type||"string";if(v){var y=!0===m.async;m=m.validate;}if(g!=r)return u&&(n+=" if (true) { "),n;if(y){if(!e.async)throw new Error("async format in sync schema");n+=" if (!(await "+(b="formats"+e.util.getProperty(a)+".validate")+"("+l+"))) { ";}else {n+=" if (! ";var b="formats"+e.util.getProperty(a);v&&(b+=".validate"),n+="function"==typeof m?" "+b+"("+l+") ":" "+b+".test("+l+") ",n+=") { ";}}var w=w||[];w.push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'format' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { format:  ",n+=h?""+f:""+e.util.toQuotedString(a),n+="  } ",!1!==e.opts.messages&&(n+=" , message: 'should match format \"",n+=h?"' + "+f+" + '":""+e.util.escapeQuotes(a),n+="\"' "),e.opts.verbose&&(n+=" , schema:  ",n+=h?"validate.schema"+s:""+e.util.toQuotedString(a),n+="         , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var _=n;return n=w.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+_+"]); ":n+=" validate.errors = ["+_+"]; return false; ":n+=" var err = "+_+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" } ",u&&(n+=" else { "),n},if:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="valid"+i,h="errs__"+i,d=e.util.copy(e);d.level++;var p="valid"+d.level,m=e.schema.then,v=e.schema.else,g=void 0!==m&&(e.opts.strictKeywords?"object"==typeof m&&Object.keys(m).length>0:e.util.schemaHasRules(m,e.RULES.all)),y=void 0!==v&&(e.opts.strictKeywords?"object"==typeof v&&Object.keys(v).length>0:e.util.schemaHasRules(v,e.RULES.all)),b=d.baseId;if(g||y){var w;d.createErrors=!1,d.schema=a,d.schemaPath=s,d.errSchemaPath=c,n+=" var "+h+" = errors; var "+f+" = true;  ";var _=e.compositeRule;e.compositeRule=d.compositeRule=!0,n+="  "+e.validate(d)+" ",d.baseId=b,d.createErrors=!0,n+="  errors = "+h+"; if (vErrors !== null) { if ("+h+") vErrors.length = "+h+"; else vErrors = null; }  ",e.compositeRule=d.compositeRule=_,g?(n+=" if ("+p+") {  ",d.schema=e.schema.then,d.schemaPath=e.schemaPath+".then",d.errSchemaPath=e.errSchemaPath+"/then",n+="  "+e.validate(d)+" ",d.baseId=b,n+=" "+f+" = "+p+"; ",g&&y?n+=" var "+(w="ifClause"+i)+" = 'then'; ":w="'then'",n+=" } ",y&&(n+=" else { ")):n+=" if (!"+p+") { ",y&&(d.schema=e.schema.else,d.schemaPath=e.schemaPath+".else",d.errSchemaPath=e.errSchemaPath+"/else",n+="  "+e.validate(d)+" ",d.baseId=b,n+=" "+f+" = "+p+"; ",g&&y?n+=" var "+(w="ifClause"+i)+" = 'else'; ":w="'else'",n+=" } "),n+=" if (!"+f+") {   var err =   ",!1!==e.createErrors?(n+=" { keyword: 'if' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { failingKeyword: "+w+" } ",!1!==e.opts.messages&&(n+=" , message: 'should match \"' + "+w+" + '\" schema' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",!e.compositeRule&&u&&(e.async?n+=" throw new ValidationError(vErrors); ":n+=" validate.errors = vErrors; return false; "),n+=" }   ",u&&(n+=" else { "),n=e.util.cleanUpCode(n);}else u&&(n+=" if (true) { ");return n},items:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="valid"+i,h="errs__"+i,d=e.util.copy(e),p="";d.level++;var m="valid"+d.level,v="i"+i,g=d.dataLevel=e.dataLevel+1,y="data"+g,b=e.baseId;if(n+="var "+h+" = errors;var "+f+";",Array.isArray(a)){var w=e.schema.additionalItems;if(!1===w){n+=" "+f+" = "+l+".length <= "+a.length+"; ";var _=c;c=e.errSchemaPath+"/additionalItems",n+="  if (!"+f+") {   ";var S=S||[];S.push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'additionalItems' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { limit: "+a.length+" } ",!1!==e.opts.messages&&(n+=" , message: 'should NOT have more than "+a.length+" items' "),e.opts.verbose&&(n+=" , schema: false , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var E=n;n=S.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+E+"]); ":n+=" validate.errors = ["+E+"]; return false; ":n+=" var err = "+E+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" } ",c=_,u&&(p+="}",n+=" else { ");}var x=a;if(x)for(var I,k=-1,P=x.length-1;k<P;)if(I=x[k+=1],e.opts.strictKeywords?"object"==typeof I&&Object.keys(I).length>0:e.util.schemaHasRules(I,e.RULES.all)){n+=" "+m+" = true; if ("+l+".length > "+k+") { ";var O=l+"["+k+"]";d.schema=I,d.schemaPath=s+"["+k+"]",d.errSchemaPath=c+"/"+k,d.errorPath=e.util.getPathExpr(e.errorPath,k,e.opts.jsonPointers,!0),d.dataPathArr[g]=k;var T=e.validate(d);d.baseId=b,e.util.varOccurences(T,y)<2?n+=" "+e.util.varReplace(T,y,O)+" ":n+=" var "+y+" = "+O+"; "+T+" ",n+=" }  ",u&&(n+=" if ("+m+") { ",p+="}");}if("object"==typeof w&&(e.opts.strictKeywords?"object"==typeof w&&Object.keys(w).length>0:e.util.schemaHasRules(w,e.RULES.all))){d.schema=w,d.schemaPath=e.schemaPath+".additionalItems",d.errSchemaPath=e.errSchemaPath+"/additionalItems",n+=" "+m+" = true; if ("+l+".length > "+a.length+") {  for (var "+v+" = "+a.length+"; "+v+" < "+l+".length; "+v+"++) { ",d.errorPath=e.util.getPathExpr(e.errorPath,v,e.opts.jsonPointers,!0);O=l+"["+v+"]";d.dataPathArr[g]=v;T=e.validate(d);d.baseId=b,e.util.varOccurences(T,y)<2?n+=" "+e.util.varReplace(T,y,O)+" ":n+=" var "+y+" = "+O+"; "+T+" ",u&&(n+=" if (!"+m+") break; "),n+=" } }  ",u&&(n+=" if ("+m+") { ",p+="}");}}else if(e.opts.strictKeywords?"object"==typeof a&&Object.keys(a).length>0:e.util.schemaHasRules(a,e.RULES.all)){d.schema=a,d.schemaPath=s,d.errSchemaPath=c,n+="  for (var "+v+" = 0; "+v+" < "+l+".length; "+v+"++) { ",d.errorPath=e.util.getPathExpr(e.errorPath,v,e.opts.jsonPointers,!0);O=l+"["+v+"]";d.dataPathArr[g]=v;T=e.validate(d);d.baseId=b,e.util.varOccurences(T,y)<2?n+=" "+e.util.varReplace(T,y,O)+" ":n+=" var "+y+" = "+O+"; "+T+" ",u&&(n+=" if (!"+m+") break; "),n+=" }";}return u&&(n+=" "+p+" if ("+h+" == errors) {"),n=e.util.cleanUpCode(n)},maximum:Qo,minimum:Qo,maxItems:Zo,minItems:Zo,maxLength:ea,minLength:ea,maxProperties:ta,minProperties:ta,multipleOf:function(e,t,r){var n,i=" ",o=e.level,a=e.dataLevel,s=e.schema[t],c=e.schemaPath+e.util.getProperty(t),u=e.errSchemaPath+"/"+t,l=!e.opts.allErrors,f="data"+(a||""),h=e.opts.$data&&s&&s.$data;h?(i+=" var schema"+o+" = "+e.util.getData(s.$data,a,e.dataPathArr)+"; ",n="schema"+o):n=s,i+="var division"+o+";if (",h&&(i+=" "+n+" !== undefined && ( typeof "+n+" != 'number' || "),i+=" (division"+o+" = "+f+" / "+n+", ",e.opts.multipleOfPrecision?i+=" Math.abs(Math.round(division"+o+") - division"+o+") > 1e-"+e.opts.multipleOfPrecision+" ":i+=" division"+o+" !== parseInt(division"+o+") ",i+=" ) ",h&&(i+="  )  "),i+=" ) {   ";var d=d||[];d.push(i),i="",!1!==e.createErrors?(i+=" { keyword: 'multipleOf' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: { multipleOf: "+n+" } ",!1!==e.opts.messages&&(i+=" , message: 'should be multiple of ",i+=h?"' + "+n:n+"'"),e.opts.verbose&&(i+=" , schema:  ",i+=h?"validate.schema"+c:""+s,i+="         , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),i+=" } "):i+=" {} ";var p=i;return i=d.pop(),!e.compositeRule&&l?e.async?i+=" throw new ValidationError(["+p+"]); ":i+=" validate.errors = ["+p+"]; return false; ":i+=" var err = "+p+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",i+="} ",l&&(i+=" else { "),i},not:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="errs__"+i,h=e.util.copy(e);h.level++;var d="valid"+h.level;if(e.opts.strictKeywords?"object"==typeof a&&Object.keys(a).length>0:e.util.schemaHasRules(a,e.RULES.all)){h.schema=a,h.schemaPath=s,h.errSchemaPath=c,n+=" var "+f+" = errors;  ";var p,m=e.compositeRule;e.compositeRule=h.compositeRule=!0,h.createErrors=!1,h.opts.allErrors&&(p=h.opts.allErrors,h.opts.allErrors=!1),n+=" "+e.validate(h)+" ",h.createErrors=!0,p&&(h.opts.allErrors=p),e.compositeRule=h.compositeRule=m,n+=" if ("+d+") {   ";var v=v||[];v.push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'not' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: {} ",!1!==e.opts.messages&&(n+=" , message: 'should NOT be valid' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var g=n;n=v.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+g+"]); ":n+=" validate.errors = ["+g+"]; return false; ":n+=" var err = "+g+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" } else {  errors = "+f+"; if (vErrors !== null) { if ("+f+") vErrors.length = "+f+"; else vErrors = null; } ",e.opts.allErrors&&(n+=" } ");}else n+="  var err =   ",!1!==e.createErrors?(n+=" { keyword: 'not' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: {} ",!1!==e.opts.messages&&(n+=" , message: 'should NOT be valid' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",u&&(n+=" if (false) { ");return n},oneOf:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="valid"+i,h="errs__"+i,d=e.util.copy(e),p="";d.level++;var m="valid"+d.level,v=d.baseId,g="prevValid"+i,y="passingSchemas"+i;n+="var "+h+" = errors , "+g+" = false , "+f+" = false , "+y+" = null; ";var b=e.compositeRule;e.compositeRule=d.compositeRule=!0;var w=a;if(w)for(var _,S=-1,E=w.length-1;S<E;)_=w[S+=1],(e.opts.strictKeywords?"object"==typeof _&&Object.keys(_).length>0:e.util.schemaHasRules(_,e.RULES.all))?(d.schema=_,d.schemaPath=s+"["+S+"]",d.errSchemaPath=c+"/"+S,n+="  "+e.validate(d)+" ",d.baseId=v):n+=" var "+m+" = true; ",S&&(n+=" if ("+m+" && "+g+") { "+f+" = false; "+y+" = ["+y+", "+S+"]; } else { ",p+="}"),n+=" if ("+m+") { "+f+" = "+g+" = true; "+y+" = "+S+"; }";return e.compositeRule=d.compositeRule=b,n+=p+"if (!"+f+") {   var err =   ",!1!==e.createErrors?(n+=" { keyword: 'oneOf' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { passingSchemas: "+y+" } ",!1!==e.opts.messages&&(n+=" , message: 'should match exactly one schema in oneOf' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",!e.compositeRule&&u&&(e.async?n+=" throw new ValidationError(vErrors); ":n+=" validate.errors = vErrors; return false; "),n+="} else {  errors = "+h+"; if (vErrors !== null) { if ("+h+") vErrors.length = "+h+"; else vErrors = null; }",e.opts.allErrors&&(n+=" } "),n},pattern:function(e,t,r){var n,i=" ",o=e.level,a=e.dataLevel,s=e.schema[t],c=e.schemaPath+e.util.getProperty(t),u=e.errSchemaPath+"/"+t,l=!e.opts.allErrors,f="data"+(a||""),h=e.opts.$data&&s&&s.$data;h?(i+=" var schema"+o+" = "+e.util.getData(s.$data,a,e.dataPathArr)+"; ",n="schema"+o):n=s,i+="if ( ",h&&(i+=" ("+n+" !== undefined && typeof "+n+" != 'string') || "),i+=" !"+(h?"(new RegExp("+n+"))":e.usePattern(s))+".test("+f+") ) {   ";var d=d||[];d.push(i),i="",!1!==e.createErrors?(i+=" { keyword: 'pattern' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: { pattern:  ",i+=h?""+n:""+e.util.toQuotedString(s),i+="  } ",!1!==e.opts.messages&&(i+=" , message: 'should match pattern \"",i+=h?"' + "+n+" + '":""+e.util.escapeQuotes(s),i+="\"' "),e.opts.verbose&&(i+=" , schema:  ",i+=h?"validate.schema"+c:""+e.util.toQuotedString(s),i+="         , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),i+=" } "):i+=" {} ";var p=i;return i=d.pop(),!e.compositeRule&&l?e.async?i+=" throw new ValidationError(["+p+"]); ":i+=" validate.errors = ["+p+"]; return false; ":i+=" var err = "+p+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",i+="} ",l&&(i+=" else { "),i},properties:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="errs__"+i,h=e.util.copy(e),d="";h.level++;var p="valid"+h.level,m="key"+i,v="idx"+i,g=h.dataLevel=e.dataLevel+1,y="data"+g,b="dataProperties"+i,w=Object.keys(a||{}),_=e.schema.patternProperties||{},S=Object.keys(_),E=e.schema.additionalProperties,x=w.length||S.length,I=!1===E,k="object"==typeof E&&Object.keys(E).length,P=e.opts.removeAdditional,O=I||k||P,T=e.opts.ownProperties,A=e.baseId,C=e.schema.required;if(C&&(!e.opts.$data||!C.$data)&&C.length<e.opts.loopRequired)var R=e.util.toHash(C);if(n+="var "+f+" = errors;var "+p+" = true;",T&&(n+=" var "+b+" = undefined;"),O){if(n+=T?" "+b+" = "+b+" || Object.keys("+l+"); for (var "+v+"=0; "+v+"<"+b+".length; "+v+"++) { var "+m+" = "+b+"["+v+"]; ":" for (var "+m+" in "+l+") { ",x){if(n+=" var isAdditional"+i+" = !(false ",w.length)if(w.length>8)n+=" || validate.schema"+s+".hasOwnProperty("+m+") ";else {var N=w;if(N)for(var L=-1,M=N.length-1;L<M;)J=N[L+=1],n+=" || "+m+" == "+e.util.toQuotedString(J)+" ";}if(S.length){var j=S;if(j)for(var D=-1,B=j.length-1;D<B;)ie=j[D+=1],n+=" || "+e.usePattern(ie)+".test("+m+") ";}n+=" ); if (isAdditional"+i+") { ";}if("all"==P)n+=" delete "+l+"["+m+"]; ";else {var U=e.errorPath,F="' + "+m+" + '";if(e.opts._errorDataPathProperty&&(e.errorPath=e.util.getPathExpr(e.errorPath,m,e.opts.jsonPointers)),I)if(P)n+=" delete "+l+"["+m+"]; ";else {n+=" "+p+" = false; ";var H=c;c=e.errSchemaPath+"/additionalProperties",(te=te||[]).push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'additionalProperties' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { additionalProperty: '"+F+"' } ",!1!==e.opts.messages&&(n+=" , message: '",e.opts._errorDataPathProperty?n+="is an invalid additional property":n+="should NOT have additional properties",n+="' "),e.opts.verbose&&(n+=" , schema: false , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var z=n;n=te.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+z+"]); ":n+=" validate.errors = ["+z+"]; return false; ":n+=" var err = "+z+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",c=H,u&&(n+=" break; ");}else if(k)if("failing"==P){n+=" var "+f+" = errors;  ";var V=e.compositeRule;e.compositeRule=h.compositeRule=!0,h.schema=E,h.schemaPath=e.schemaPath+".additionalProperties",h.errSchemaPath=e.errSchemaPath+"/additionalProperties",h.errorPath=e.opts._errorDataPathProperty?e.errorPath:e.util.getPathExpr(e.errorPath,m,e.opts.jsonPointers);var q=l+"["+m+"]";h.dataPathArr[g]=m;var K=e.validate(h);h.baseId=A,e.util.varOccurences(K,y)<2?n+=" "+e.util.varReplace(K,y,q)+" ":n+=" var "+y+" = "+q+"; "+K+" ",n+=" if (!"+p+") { errors = "+f+"; if (validate.errors !== null) { if (errors) validate.errors.length = errors; else validate.errors = null; } delete "+l+"["+m+"]; }  ",e.compositeRule=h.compositeRule=V;}else {h.schema=E,h.schemaPath=e.schemaPath+".additionalProperties",h.errSchemaPath=e.errSchemaPath+"/additionalProperties",h.errorPath=e.opts._errorDataPathProperty?e.errorPath:e.util.getPathExpr(e.errorPath,m,e.opts.jsonPointers);q=l+"["+m+"]";h.dataPathArr[g]=m;K=e.validate(h);h.baseId=A,e.util.varOccurences(K,y)<2?n+=" "+e.util.varReplace(K,y,q)+" ":n+=" var "+y+" = "+q+"; "+K+" ",u&&(n+=" if (!"+p+") break; ");}e.errorPath=U;}x&&(n+=" } "),n+=" }  ",u&&(n+=" if ("+p+") { ",d+="}");}var $=e.opts.useDefaults&&!e.compositeRule;if(w.length){var G=w;if(G)for(var J,W=-1,X=G.length-1;W<X;){var Y=a[J=G[W+=1]];if(e.opts.strictKeywords?"object"==typeof Y&&Object.keys(Y).length>0:e.util.schemaHasRules(Y,e.RULES.all)){var Q=e.util.getProperty(J),Z=(q=l+Q,$&&void 0!==Y.default);h.schema=Y,h.schemaPath=s+Q,h.errSchemaPath=c+"/"+e.util.escapeFragment(J),h.errorPath=e.util.getPath(e.errorPath,J,e.opts.jsonPointers),h.dataPathArr[g]=e.util.toQuotedString(J);K=e.validate(h);if(h.baseId=A,e.util.varOccurences(K,y)<2){K=e.util.varReplace(K,y,q);var ee=q;}else {ee=y;n+=" var "+y+" = "+q+"; ";}if(Z)n+=" "+K+" ";else {if(R&&R[J]){n+=" if ( "+ee+" === undefined ",T&&(n+=" || ! Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(J)+"') "),n+=") { "+p+" = false; ";U=e.errorPath,H=c;var te,re=e.util.escapeQuotes(J);e.opts._errorDataPathProperty&&(e.errorPath=e.util.getPath(U,J,e.opts.jsonPointers)),c=e.errSchemaPath+"/required",(te=te||[]).push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'required' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { missingProperty: '"+re+"' } ",!1!==e.opts.messages&&(n+=" , message: '",e.opts._errorDataPathProperty?n+="is a required property":n+="should have required property \\'"+re+"\\'",n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";z=n;n=te.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+z+"]); ":n+=" validate.errors = ["+z+"]; return false; ":n+=" var err = "+z+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",c=H,e.errorPath=U,n+=" } else { ";}else u?(n+=" if ( "+ee+" === undefined ",T&&(n+=" || ! Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(J)+"') "),n+=") { "+p+" = true; } else { "):(n+=" if ("+ee+" !== undefined ",T&&(n+=" &&   Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(J)+"') "),n+=" ) { ");n+=" "+K+" } ";}}u&&(n+=" if ("+p+") { ",d+="}");}}if(S.length){var ne=S;if(ne)for(var ie,oe=-1,ae=ne.length-1;oe<ae;){Y=_[ie=ne[oe+=1]];if(e.opts.strictKeywords?"object"==typeof Y&&Object.keys(Y).length>0:e.util.schemaHasRules(Y,e.RULES.all)){h.schema=Y,h.schemaPath=e.schemaPath+".patternProperties"+e.util.getProperty(ie),h.errSchemaPath=e.errSchemaPath+"/patternProperties/"+e.util.escapeFragment(ie),n+=T?" "+b+" = "+b+" || Object.keys("+l+"); for (var "+v+"=0; "+v+"<"+b+".length; "+v+"++) { var "+m+" = "+b+"["+v+"]; ":" for (var "+m+" in "+l+") { ",n+=" if ("+e.usePattern(ie)+".test("+m+")) { ",h.errorPath=e.util.getPathExpr(e.errorPath,m,e.opts.jsonPointers);q=l+"["+m+"]";h.dataPathArr[g]=m;K=e.validate(h);h.baseId=A,e.util.varOccurences(K,y)<2?n+=" "+e.util.varReplace(K,y,q)+" ":n+=" var "+y+" = "+q+"; "+K+" ",u&&(n+=" if (!"+p+") break; "),n+=" } ",u&&(n+=" else "+p+" = true; "),n+=" }  ",u&&(n+=" if ("+p+") { ",d+="}");}}}return u&&(n+=" "+d+" if ("+f+" == errors) {"),n=e.util.cleanUpCode(n)},propertyNames:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="errs__"+i,h=e.util.copy(e);h.level++;var d="valid"+h.level;if(n+="var "+f+" = errors;",e.opts.strictKeywords?"object"==typeof a&&Object.keys(a).length>0:e.util.schemaHasRules(a,e.RULES.all)){h.schema=a,h.schemaPath=s,h.errSchemaPath=c;var p="key"+i,m="idx"+i,v="i"+i,g="' + "+p+" + '",y="data"+(h.dataLevel=e.dataLevel+1),b="dataProperties"+i,w=e.opts.ownProperties,_=e.baseId;w&&(n+=" var "+b+" = undefined; "),n+=w?" "+b+" = "+b+" || Object.keys("+l+"); for (var "+m+"=0; "+m+"<"+b+".length; "+m+"++) { var "+p+" = "+b+"["+m+"]; ":" for (var "+p+" in "+l+") { ",n+=" var startErrs"+i+" = errors; ";var S=p,E=e.compositeRule;e.compositeRule=h.compositeRule=!0;var x=e.validate(h);h.baseId=_,e.util.varOccurences(x,y)<2?n+=" "+e.util.varReplace(x,y,S)+" ":n+=" var "+y+" = "+S+"; "+x+" ",e.compositeRule=h.compositeRule=E,n+=" if (!"+d+") { for (var "+v+"=startErrs"+i+"; "+v+"<errors; "+v+"++) { vErrors["+v+"].propertyName = "+p+"; }   var err =   ",!1!==e.createErrors?(n+=" { keyword: 'propertyNames' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { propertyName: '"+g+"' } ",!1!==e.opts.messages&&(n+=" , message: 'property name \\'"+g+"\\' is invalid' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",!e.compositeRule&&u&&(e.async?n+=" throw new ValidationError(vErrors); ":n+=" validate.errors = vErrors; return false; "),u&&(n+=" break; "),n+=" } }";}return u&&(n+="  if ("+f+" == errors) {"),n=e.util.cleanUpCode(n)},required:function(e,t,r){var n=" ",i=e.level,o=e.dataLevel,a=e.schema[t],s=e.schemaPath+e.util.getProperty(t),c=e.errSchemaPath+"/"+t,u=!e.opts.allErrors,l="data"+(o||""),f="valid"+i,h=e.opts.$data&&a&&a.$data;h&&(n+=" var schema"+i+" = "+e.util.getData(a.$data,o,e.dataPathArr)+"; ");var d="schema"+i;if(!h)if(a.length<e.opts.loopRequired&&e.schema.properties&&Object.keys(e.schema.properties).length){var p=[],m=a;if(m)for(var v,g=-1,y=m.length-1;g<y;){v=m[g+=1];var b=e.schema.properties[v];b&&(e.opts.strictKeywords?"object"==typeof b&&Object.keys(b).length>0:e.util.schemaHasRules(b,e.RULES.all))||(p[p.length]=v);}}else p=a;if(h||p.length){var w=e.errorPath,_=h||p.length>=e.opts.loopRequired,S=e.opts.ownProperties;if(u)if(n+=" var missing"+i+"; ",_){h||(n+=" var "+d+" = validate.schema"+s+"; ");var E="' + "+(T="schema"+i+"["+(k="i"+i)+"]")+" + '";e.opts._errorDataPathProperty&&(e.errorPath=e.util.getPathExpr(w,T,e.opts.jsonPointers)),n+=" var "+f+" = true; ",h&&(n+=" if (schema"+i+" === undefined) "+f+" = true; else if (!Array.isArray(schema"+i+")) "+f+" = false; else {"),n+=" for (var "+k+" = 0; "+k+" < "+d+".length; "+k+"++) { "+f+" = "+l+"["+d+"["+k+"]] !== undefined ",S&&(n+=" &&   Object.prototype.hasOwnProperty.call("+l+", "+d+"["+k+"]) "),n+="; if (!"+f+") break; } ",h&&(n+="  }  "),n+="  if (!"+f+") {   ",(O=O||[]).push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'required' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { missingProperty: '"+E+"' } ",!1!==e.opts.messages&&(n+=" , message: '",e.opts._errorDataPathProperty?n+="is a required property":n+="should have required property \\'"+E+"\\'",n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";var x=n;n=O.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+x+"]); ":n+=" validate.errors = ["+x+"]; return false; ":n+=" var err = "+x+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" } else { ";}else {n+=" if ( ";var I=p;if(I)for(var k=-1,P=I.length-1;k<P;){C=I[k+=1],k&&(n+=" || "),n+=" ( ( "+(M=l+(L=e.util.getProperty(C)))+" === undefined ",S&&(n+=" || ! Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(C)+"') "),n+=") && (missing"+i+" = "+e.util.toQuotedString(e.opts.jsonPointers?C:L)+") ) ";}n+=") {  ";var O;E="' + "+(T="missing"+i)+" + '";e.opts._errorDataPathProperty&&(e.errorPath=e.opts.jsonPointers?e.util.getPathExpr(w,T,!0):w+" + "+T),(O=O||[]).push(n),n="",!1!==e.createErrors?(n+=" { keyword: 'required' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { missingProperty: '"+E+"' } ",!1!==e.opts.messages&&(n+=" , message: '",e.opts._errorDataPathProperty?n+="is a required property":n+="should have required property \\'"+E+"\\'",n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ";x=n;n=O.pop(),!e.compositeRule&&u?e.async?n+=" throw new ValidationError(["+x+"]); ":n+=" validate.errors = ["+x+"]; return false; ":n+=" var err = "+x+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",n+=" } else { ";}else if(_){h||(n+=" var "+d+" = validate.schema"+s+"; ");var T;E="' + "+(T="schema"+i+"["+(k="i"+i)+"]")+" + '";e.opts._errorDataPathProperty&&(e.errorPath=e.util.getPathExpr(w,T,e.opts.jsonPointers)),h&&(n+=" if ("+d+" && !Array.isArray("+d+")) {  var err =   ",!1!==e.createErrors?(n+=" { keyword: 'required' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { missingProperty: '"+E+"' } ",!1!==e.opts.messages&&(n+=" , message: '",e.opts._errorDataPathProperty?n+="is a required property":n+="should have required property \\'"+E+"\\'",n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; } else if ("+d+" !== undefined) { "),n+=" for (var "+k+" = 0; "+k+" < "+d+".length; "+k+"++) { if ("+l+"["+d+"["+k+"]] === undefined ",S&&(n+=" || ! Object.prototype.hasOwnProperty.call("+l+", "+d+"["+k+"]) "),n+=") {  var err =   ",!1!==e.createErrors?(n+=" { keyword: 'required' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { missingProperty: '"+E+"' } ",!1!==e.opts.messages&&(n+=" , message: '",e.opts._errorDataPathProperty?n+="is a required property":n+="should have required property \\'"+E+"\\'",n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; } } ",h&&(n+="  }  ");}else {var A=p;if(A)for(var C,R=-1,N=A.length-1;R<N;){C=A[R+=1];var L=e.util.getProperty(C),M=(E=e.util.escapeQuotes(C),l+L);e.opts._errorDataPathProperty&&(e.errorPath=e.util.getPath(w,C,e.opts.jsonPointers)),n+=" if ( "+M+" === undefined ",S&&(n+=" || ! Object.prototype.hasOwnProperty.call("+l+", '"+e.util.escapeQuotes(C)+"') "),n+=") {  var err =   ",!1!==e.createErrors?(n+=" { keyword: 'required' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(c)+" , params: { missingProperty: '"+E+"' } ",!1!==e.opts.messages&&(n+=" , message: '",e.opts._errorDataPathProperty?n+="is a required property":n+="should have required property \\'"+E+"\\'",n+="' "),e.opts.verbose&&(n+=" , schema: validate.schema"+s+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+l+" "),n+=" } "):n+=" {} ",n+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; } ";}}e.errorPath=w;}else u&&(n+=" if (true) {");return n},uniqueItems:function(e,t,r){var n,i=" ",o=e.level,a=e.dataLevel,s=e.schema[t],c=e.schemaPath+e.util.getProperty(t),u=e.errSchemaPath+"/"+t,l=!e.opts.allErrors,f="data"+(a||""),h="valid"+o,d=e.opts.$data&&s&&s.$data;if(d?(i+=" var schema"+o+" = "+e.util.getData(s.$data,a,e.dataPathArr)+"; ",n="schema"+o):n=s,(s||d)&&!1!==e.opts.uniqueItems){d&&(i+=" var "+h+"; if ("+n+" === false || "+n+" === undefined) "+h+" = true; else if (typeof "+n+" != 'boolean') "+h+" = false; else { "),i+=" var i = "+f+".length , "+h+" = true , j; if (i > 1) { ";var p=e.schema.items&&e.schema.items.type,m=Array.isArray(p);if(!p||"object"==p||"array"==p||m&&(p.indexOf("object")>=0||p.indexOf("array")>=0))i+=" outer: for (;i--;) { for (j = i; j--;) { if (equal("+f+"[i], "+f+"[j])) { "+h+" = false; break outer; } } } ";else {i+=" var itemIndices = {}, item; for (;i--;) { var item = "+f+"[i]; ";var v="checkDataType"+(m?"s":"");i+=" if ("+e.util[v](p,"item",!0)+") continue; ",m&&(i+=" if (typeof item == 'string') item = '\"' + item; "),i+=" if (typeof itemIndices[item] == 'number') { "+h+" = false; j = itemIndices[item]; break; } itemIndices[item] = i; } ";}i+=" } ",d&&(i+="  }  "),i+=" if (!"+h+") {   ";var g=g||[];g.push(i),i="",!1!==e.createErrors?(i+=" { keyword: 'uniqueItems' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(u)+" , params: { i: i, j: j } ",!1!==e.opts.messages&&(i+=" , message: 'should NOT have duplicate items (items ## ' + j + ' and ' + i + ' are identical)' "),e.opts.verbose&&(i+=" , schema:  ",i+=d?"validate.schema"+c:""+s,i+="         , parentSchema: validate.schema"+e.schemaPath+" , data: "+f+" "),i+=" } "):i+=" {} ";var y=i;i=g.pop(),!e.compositeRule&&l?e.async?i+=" throw new ValidationError(["+y+"]); ":i+=" validate.errors = ["+y+"]; return false; ":i+=" var err = "+y+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",i+=" } ",l&&(i+=" else { ");}else l&&(i+=" if (true) { ");return i},validate:wo},na=Ci.toHash,ia=["multipleOf","maximum","exclusiveMaximum","minimum","exclusiveMinimum","maxLength","minLength","pattern","additionalItems","maxItems","minItems","uniqueItems","maxProperties","minProperties","required","additionalProperties","enum","format","const"],oa=function(e,t){for(var r=0;r<t.length;r++){e=JSON.parse(JSON.stringify(e));var n,i=t[r].split("/"),o=e;for(n=1;n<i.length;n++)o=o[i[n]];for(n=0;n<ia.length;n++){var a=ia[n],s=o[a];s&&(o[a]={anyOf:[s,{$ref:"https://raw.githubusercontent.com/epoberezkin/ajv/master/lib/refs/data.json#"}]});}}return e},aa=vo.MissingRef,sa=function e(t,r,n){var i=this;if("function"!=typeof this._opts.loadSchema)throw new Error("options.loadSchema should be a function");"function"==typeof r&&(n=r,r=void 0);var o=a(t).then((function(){var e=i._addSchema(t,void 0,r);return e.validate||function e(t){try{return i._compile(t)}catch(e){if(e instanceof aa)return n(e);throw e}function n(n){var o=n.missingSchema;if(u(o))throw new Error("Schema "+o+" is loaded but "+n.missingRef+" cannot be resolved");var s=i._loadingSchemas[o];return s||(s=i._loadingSchemas[o]=i._opts.loadSchema(o)).then(c,c),s.then((function(e){if(!u(o))return a(e).then((function(){u(o)||i.addSchema(e,o,void 0,r);}))})).then((function(){return e(t)}));function c(){delete i._loadingSchemas[o];}function u(e){return i._refs[e]||i._schemas[e]}}}(e)}));n&&o.then((function(e){n(null,e);}),n);return o;function a(t){var r=t.$schema;return r&&!i.getSchema(r)?e.call(i,{$ref:r},!0):Promise.resolve()}};var ca=function(e,t,r){var n,i,o=" ",a=e.level,s=e.dataLevel,c=e.schema[t],u=e.schemaPath+e.util.getProperty(t),l=e.errSchemaPath+"/"+t,f=!e.opts.allErrors,h="data"+(s||""),d="valid"+a,p="errs__"+a,m=e.opts.$data&&c&&c.$data;m?(o+=" var schema"+a+" = "+e.util.getData(c.$data,s,e.dataPathArr)+"; ",i="schema"+a):i=c;var v,g,y,b,w,_="definition"+a,S=this.definition,E="";if(m&&S.$data){w="keywordValidate"+a;var x=S.validateSchema;o+=" var "+_+" = RULES.custom['"+t+"'].definition; var "+w+" = "+_+".validate;";}else {if(!(b=e.useCustomRule(this,c,e.schema,e)))return;i="validate.schema"+u,w=b.code,v=S.compile,g=S.inline,y=S.macro;}var I=w+".errors",k="i"+a,P="ruleErr"+a,O=S.async;if(O&&!e.async)throw new Error("async keyword in sync schema");if(g||y||(o+=I+" = null;"),o+="var "+p+" = errors;var "+d+";",m&&S.$data&&(E+="}",o+=" if ("+i+" === undefined) { "+d+" = true; } else { ",x&&(E+="}",o+=" "+d+" = "+_+".validateSchema("+i+"); if ("+d+") { ")),g)S.statements?o+=" "+b.validate+" ":o+=" "+d+" = "+b.validate+"; ";else if(y){var T=e.util.copy(e);E="";T.level++;var A="valid"+T.level;T.schema=b.validate,T.schemaPath="";var C=e.compositeRule;e.compositeRule=T.compositeRule=!0;var R=e.validate(T).replace(/validate\.schema/g,w);e.compositeRule=T.compositeRule=C,o+=" "+R;}else {(j=j||[]).push(o),o="",o+="  "+w+".call( ",e.opts.passContext?o+="this":o+="self",v||!1===S.schema?o+=" , "+h+" ":o+=" , "+i+" , "+h+" , validate.schema"+e.schemaPath+" ",o+=" , (dataPath || '')",'""'!=e.errorPath&&(o+=" + "+e.errorPath);var N=s?"data"+(s-1||""):"parentData",L=s?e.dataPathArr[s]:"parentDataProperty",M=o+=" , "+N+" , "+L+" , rootData )  ";o=j.pop(),!1===S.errors?(o+=" "+d+" = ",O&&(o+="await "),o+=M+"; "):o+=O?" var "+(I="customErrors"+a)+" = null; try { "+d+" = await "+M+"; } catch (e) { "+d+" = false; if (e instanceof ValidationError) "+I+" = e.errors; else throw e; } ":" "+I+" = null; "+d+" = "+M+"; ";}if(S.modifying&&(o+=" if ("+N+") "+h+" = "+N+"["+L+"];"),o+=""+E,S.valid)f&&(o+=" if (true) { ");else {var j;o+=" if ( ",void 0===S.valid?(o+=" !",o+=y?""+A:""+d):o+=" "+!S.valid+" ",o+=") { ",n=this.keyword,(j=j||[]).push(o),o="",(j=j||[]).push(o),o="",!1!==e.createErrors?(o+=" { keyword: '"+(n||"custom")+"' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(l)+" , params: { keyword: '"+this.keyword+"' } ",!1!==e.opts.messages&&(o+=" , message: 'should pass \""+this.keyword+"\" keyword validation' "),e.opts.verbose&&(o+=" , schema: validate.schema"+u+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+h+" "),o+=" } "):o+=" {} ";var D=o;o=j.pop(),!e.compositeRule&&f?e.async?o+=" throw new ValidationError(["+D+"]); ":o+=" validate.errors = ["+D+"]; return false; ":o+=" var err = "+D+";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ";var B=o;o=j.pop(),g?S.errors?"full"!=S.errors&&(o+="  for (var "+k+"="+p+"; "+k+"<errors; "+k+"++) { var "+P+" = vErrors["+k+"]; if ("+P+".dataPath === undefined) "+P+".dataPath = (dataPath || '') + "+e.errorPath+"; if ("+P+".schemaPath === undefined) { "+P+'.schemaPath = "'+l+'"; } ',e.opts.verbose&&(o+=" "+P+".schema = "+i+"; "+P+".data = "+h+"; "),o+=" } "):!1===S.errors?o+=" "+B+" ":(o+=" if ("+p+" == errors) { "+B+" } else {  for (var "+k+"="+p+"; "+k+"<errors; "+k+"++) { var "+P+" = vErrors["+k+"]; if ("+P+".dataPath === undefined) "+P+".dataPath = (dataPath || '') + "+e.errorPath+"; if ("+P+".schemaPath === undefined) { "+P+'.schemaPath = "'+l+'"; } ',e.opts.verbose&&(o+=" "+P+".schema = "+i+"; "+P+".data = "+h+"; "),o+=" } } "):y?(o+="   var err =   ",!1!==e.createErrors?(o+=" { keyword: '"+(n||"custom")+"' , dataPath: (dataPath || '') + "+e.errorPath+" , schemaPath: "+e.util.toQuotedString(l)+" , params: { keyword: '"+this.keyword+"' } ",!1!==e.opts.messages&&(o+=" , message: 'should pass \""+this.keyword+"\" keyword validation' "),e.opts.verbose&&(o+=" , schema: validate.schema"+u+" , parentSchema: validate.schema"+e.schemaPath+" , data: "+h+" "),o+=" } "):o+=" {} ",o+=";  if (vErrors === null) vErrors = [err]; else vErrors.push(err); errors++; ",!e.compositeRule&&f&&(e.async?o+=" throw new ValidationError(vErrors); ":o+=" validate.errors = vErrors; return false; ")):!1===S.errors?o+=" "+B+" ":(o+=" if (Array.isArray("+I+")) { if (vErrors === null) vErrors = "+I+"; else vErrors = vErrors.concat("+I+"); errors = vErrors.length;  for (var "+k+"="+p+"; "+k+"<errors; "+k+"++) { var "+P+" = vErrors["+k+"]; if ("+P+".dataPath === undefined) "+P+".dataPath = (dataPath || '') + "+e.errorPath+";  "+P+'.schemaPath = "'+l+'";  ',e.opts.verbose&&(o+=" "+P+".schema = "+i+"; "+P+".data = "+h+"; "),o+=" } } else { "+B+" } "),o+=" } ",f&&(o+=" else { ");}return o},ua="http://json-schema.org/draft-07/schema#",la="http://json-schema.org/draft-07/schema#",fa="Core schema meta-schema",ha={schemaArray:{type:"array",minItems:1,items:{$ref:"#"}},nonNegativeInteger:{type:"integer",minimum:0},nonNegativeIntegerDefault0:{allOf:[{$ref:"#/definitions/nonNegativeInteger"},{default:0}]},simpleTypes:{enum:["array","boolean","integer","null","number","object","string"]},stringArray:{type:"array",items:{type:"string"},uniqueItems:!0,default:[]}},da=["object","boolean"],pa={$id:{type:"string",format:"uri-reference"},$schema:{type:"string",format:"uri"},$ref:{type:"string",format:"uri-reference"},$comment:{type:"string"},title:{type:"string"},description:{type:"string"},default:!0,readOnly:{type:"boolean",default:!1},examples:{type:"array",items:!0},multipleOf:{type:"number",exclusiveMinimum:0},maximum:{type:"number"},exclusiveMaximum:{type:"number"},minimum:{type:"number"},exclusiveMinimum:{type:"number"},maxLength:{$ref:"#/definitions/nonNegativeInteger"},minLength:{$ref:"#/definitions/nonNegativeIntegerDefault0"},pattern:{type:"string",format:"regex"},additionalItems:{$ref:"#"},items:{anyOf:[{$ref:"#"},{$ref:"#/definitions/schemaArray"}],default:!0},maxItems:{$ref:"#/definitions/nonNegativeInteger"},minItems:{$ref:"#/definitions/nonNegativeIntegerDefault0"},uniqueItems:{type:"boolean",default:!1},contains:{$ref:"#"},maxProperties:{$ref:"#/definitions/nonNegativeInteger"},minProperties:{$ref:"#/definitions/nonNegativeIntegerDefault0"},required:{$ref:"#/definitions/stringArray"},additionalProperties:{$ref:"#"},definitions:{type:"object",additionalProperties:{$ref:"#"},default:{}},properties:{type:"object",additionalProperties:{$ref:"#"},default:{}},patternProperties:{type:"object",additionalProperties:{$ref:"#"},propertyNames:{format:"regex"},default:{}},dependencies:{type:"object",additionalProperties:{anyOf:[{$ref:"#"},{$ref:"#/definitions/stringArray"}]}},propertyNames:{$ref:"#"},const:!0,enum:{type:"array",items:!0,minItems:1,uniqueItems:!0},type:{anyOf:[{$ref:"#/definitions/simpleTypes"},{type:"array",items:{$ref:"#/definitions/simpleTypes"},minItems:1,uniqueItems:!0}]},format:{type:"string"},contentMediaType:{type:"string"},contentEncoding:{type:"string"},if:{$ref:"#"},then:{$ref:"#"},else:{$ref:"#"},allOf:{$ref:"#/definitions/schemaArray"},anyOf:{$ref:"#/definitions/schemaArray"},oneOf:{$ref:"#/definitions/schemaArray"},not:{$ref:"#"}},ma={$schema:ua,$id:la,title:fa,definitions:ha,type:da,properties:pa,default:!0},va=Qn(Object.freeze({__proto__:null,$schema:ua,$id:la,title:fa,definitions:ha,type:da,properties:pa,default:ma})),ga={$id:"https://github.com/epoberezkin/ajv/blob/master/lib/definition_schema.js",definitions:{simpleTypes:va.definitions.simpleTypes},type:"object",dependencies:{schema:["validate"],$data:["validate"],statements:["inline"],valid:{not:{required:["macro"]}}},properties:{type:va.properties.type,schema:{type:"boolean"},statements:{type:"boolean"},dependencies:{type:"array",items:{type:"string"}},metaSchema:{type:"object"},modifying:{type:"boolean"},valid:{type:"boolean"},$data:{type:"boolean"},async:{type:"boolean"},errors:{anyOf:[{type:"boolean"},{const:"full"}]}}},ya=/^[a-z_$][a-z0-9_$-]*$/i,ba=function(e,t){var r=this.RULES;if(r.keywords[e])throw new Error("Keyword "+e+" is already defined");if(!ya.test(e))throw new Error("Keyword "+e+" is not a valid identifier");if(t){this.validateKeyword(t,!0);var n=t.type;if(Array.isArray(n))for(var i=0;i<n.length;i++)a(e,n[i],t);else a(e,n,t);var o=t.metaSchema;o&&(t.$data&&this._opts.$data&&(o={anyOf:[o,{$ref:"https://raw.githubusercontent.com/epoberezkin/ajv/master/lib/refs/data.json#"}]}),t.validateSchema=this.compile(o,!0));}function a(e,t,n){for(var i,o=0;o<r.length;o++){var a=r[o];if(a.type==t){i=a;break}}i||(i={type:t,rules:[]},r.push(i));var s={keyword:e,definition:n,custom:!0,code:ca,implements:n.implements};i.rules.push(s),r.custom[e]=s;}return r.keywords[e]=r.all[e]=!0,this},wa=function(e){var t=this.RULES.custom[e];return t?t.definition:this.RULES.keywords[e]||!1},_a=function(e){var t=this.RULES;delete t.keywords[e],delete t.all[e],delete t.custom[e];for(var r=0;r<t.length;r++)for(var n=t[r].rules,i=0;i<n.length;i++)if(n[i].keyword==e){n.splice(i,1);break}return this},Sa=function e(t,r){e.errors=null;var n=this._validateKeyword=this._validateKeyword||this.compile(ga,!0);if(n(t))return !0;if(e.errors=n.errors,r)throw new Error("custom keyword definition is invalid: "+this.errorsText(n.errors));return !1};var Ea="http://json-schema.org/draft-07/schema#",xa="https://raw.githubusercontent.com/epoberezkin/ajv/master/lib/refs/data.json#",Ia="Meta-schema for $data reference (JSON Schema extension proposal)",ka=["$data"],Pa={$data:{type:"string",anyOf:[{format:"relative-json-pointer"},{format:"json-pointer"}]}},Oa={$schema:Ea,$id:xa,description:Ia,type:"object",required:ka,properties:Pa,additionalProperties:!1},Ta=Qn(Object.freeze({__proto__:null,$schema:Ea,$id:xa,description:Ia,type:"object",required:ka,properties:Pa,additionalProperties:!1,default:Oa})),Aa=La;La.prototype.validate=function(e,t){var r;if("string"==typeof e){if(!(r=this.getSchema(e)))throw new Error('no schema with key or ref "'+e+'"')}else {var n=this._addSchema(e);r=n.validate||this._compile(n);}var i=r(t);!0!==r.$async&&(this.errors=r.errors);return i},La.prototype.compile=function(e,t){var r=this._addSchema(e,void 0,t);return r.validate||this._compile(r)},La.prototype.addSchema=function(e,t,r,n){if(Array.isArray(e)){for(var i=0;i<e.length;i++)this.addSchema(e[i],void 0,r,n);return this}var o=this._getId(e);if(void 0!==o&&"string"!=typeof o)throw new Error("schema id must be string");return Fa(this,t=ro.normalizeId(t||o)),this._schemas[t]=this._addSchema(e,r,n,!0),this},La.prototype.addMetaSchema=function(e,t,r){return this.addSchema(e,t,r,!0),this},La.prototype.validateSchema=function(e,t){var r=e.$schema;if(void 0!==r&&"string"!=typeof r)throw new Error("$schema must be a string");if(!(r=r||this._opts.defaultMeta||function(e){var t=e._opts.meta;return e._opts.defaultMeta="object"==typeof t?e._getId(t)||t:e.getSchema(Ca)?Ca:void 0,e._opts.defaultMeta}(this)))return this.logger.warn("meta-schema not available"),this.errors=null,!0;var n=this.validate(r,e);if(!n&&t){var i="schema is invalid: "+this.errorsText();if("log"!=this._opts.validateSchema)throw new Error(i);this.logger.error(i);}return n},La.prototype.getSchema=function(e){var t=Ma(this,e);switch(typeof t){case"object":return t.validate||this._compile(t);case"string":return this.getSchema(t);case"undefined":return function(e,t){var r=ro.schema.call(e,{schema:{}},t);if(r){var n=r.schema,i=r.root,o=r.baseId,a=Eo.call(e,n,i,void 0,o);return e._fragments[t]=new eo({ref:t,fragment:!0,schema:n,root:i,baseId:o,validate:a}),a}}(this,e)}},La.prototype.removeSchema=function(e){if(e instanceof RegExp)return ja(this,this._schemas,e),ja(this,this._refs,e),this;switch(typeof e){case"undefined":return ja(this,this._schemas),ja(this,this._refs),this._cache.clear(),this;case"string":var t=Ma(this,e);return t&&this._cache.del(t.cacheKey),delete this._schemas[e],delete this._refs[e],this;case"object":var r=this._opts.serialize,n=r?r(e):e;this._cache.del(n);var i=this._getId(e);i&&(i=ro.normalizeId(i),delete this._schemas[i],delete this._refs[i]);}return this},La.prototype.addFormat=function(e,t){"string"==typeof t&&(t=new RegExp(t));return this._formats[e]=t,this},La.prototype.errorsText=function(e,t){if(!(e=e||this.errors))return "No errors";for(var r=void 0===(t=t||{}).separator?", ":t.separator,n=void 0===t.dataVar?"data":t.dataVar,i="",o=0;o<e.length;o++){var a=e[o];a&&(i+=n+a.dataPath+" "+a.message+r);}return i.slice(0,-r.length)},La.prototype._addSchema=function(e,t,r,n){if("object"!=typeof e&&"boolean"!=typeof e)throw new Error("schema should be object or boolean");var i=this._opts.serialize,o=i?i(e):e,a=this._cache.get(o);if(a)return a;n=n||!1!==this._opts.addUsedSchema;var s=ro.normalizeId(this._getId(e));s&&n&&Fa(this,s);var c,u=!1!==this._opts.validateSchema&&!t;u&&!(c=s&&s==ro.normalizeId(e.$schema))&&this.validateSchema(e,!0);var l=ro.ids.call(this,e),f=new eo({id:s,schema:e,localRefs:l,cacheKey:o,meta:r});"#"!=s[0]&&n&&(this._refs[s]=f);this._cache.put(o,f),u&&c&&this.validateSchema(e,!0);return f},La.prototype._compile=function(e,t){if(e.compiling)return e.validate=i,i.schema=e.schema,i.errors=null,i.root=t||i,!0===e.schema.$async&&(i.$async=!0),i;var r,n;e.compiling=!0,e.meta&&(r=this._opts,this._opts=this._metaOpts);try{n=Eo.call(this,e.schema,t,e.localRefs);}catch(t){throw delete e.validate,t}finally{e.compiling=!1,e.meta&&(this._opts=r);}return e.validate=n,e.refs=n.refs,e.refVal=n.refVal,e.root=n.root,n;function i(){var t=e.validate,r=t.apply(this,arguments);return i.errors=t.errors,r}},La.prototype.compileAsync=sa,La.prototype.addKeyword=ba,La.prototype.getKeyword=wa,La.prototype.removeKeyword=_a,La.prototype.validateKeyword=Sa,La.ValidationError=vo.Validation,La.MissingRefError=vo.MissingRef,La.$dataMetaSchema=oa;var Ca="http://json-schema.org/draft-07/schema",Ra=["removeAdditional","useDefaults","coerceTypes","strictDefaults"],Na=["/properties"];function La(e){if(!(this instanceof La))return new La(e);var t,r;e=this._opts=Ci.copy(e)||{},function(e){var t=e._opts.logger;if(!1===t)e.logger={log:Ha,warn:Ha,error:Ha};else {if(void 0===t&&(t=console),!("object"==typeof t&&t.log&&t.warn&&t.error))throw new Error("logger must implement log, warn and error methods");e.logger=t;}}(this),this._schemas={},this._refs={},this._fragments={},this._formats=qo(e.format),this._cache=e.cache||new Ro,this._loadingSchemas={},this._compilations=[],this.RULES=((t=[{type:"number",rules:[{maximum:["exclusiveMaximum"]},{minimum:["exclusiveMinimum"]},"multipleOf","format"]},{type:"string",rules:["maxLength","minLength","pattern","format"]},{type:"array",rules:["maxItems","minItems","items","contains","uniqueItems"]},{type:"object",rules:["maxProperties","minProperties","required","dependencies","propertyNames",{properties:["additionalProperties","patternProperties"]}]},{rules:["$ref","const","enum","not","anyOf","oneOf","allOf","if"]}]).all=na(r=["type","$comment"]),t.types=na(["number","integer","string","array","object","boolean","null"]),t.forEach((function(e){e.rules=e.rules.map((function(e){var n;if("object"==typeof e){var i=Object.keys(e)[0];n=e[i],e=i,n.forEach((function(e){r.push(e),t.all[e]=!0;}));}return r.push(e),t.all[e]={keyword:e,code:ra[e],implements:n}})),t.all.$comment={keyword:"$comment",code:ra.$comment},e.type&&(t.types[e.type]=e);})),t.keywords=na(r.concat(["$schema","$id","id","$data","$async","title","description","default","definitions","examples","readOnly","writeOnly","contentMediaType","contentEncoding","additionalItems","then","else"])),t.custom={},t),this._getId=function(e){switch(e.schemaId){case"auto":return Ua;case"id":return Da;default:return Ba}}(e),e.loopRequired=e.loopRequired||1/0,"property"==e.errorDataPath&&(e._errorDataPathProperty=!0),void 0===e.serialize&&(e.serialize=bo),this._metaOpts=function(e){for(var t=Ci.copy(e._opts),r=0;r<Ra.length;r++)delete t[Ra[r]];return t}(this),e.formats&&function(e){for(var t in e._opts.formats){var r=e._opts.formats[t];e.addFormat(t,r);}}(this),function(e){var t;e._opts.$data&&(t=Ta,e.addMetaSchema(t,t.$id,!0));if(!1===e._opts.meta)return;var r=va;e._opts.$data&&(r=oa(r,Na));e.addMetaSchema(r,Ca,!0),e._refs["http://json-schema.org/schema"]=Ca;}(this),"object"==typeof e.meta&&this.addMetaSchema(e.meta),e.nullable&&this.addKeyword("nullable",{metaSchema:{type:"boolean"}}),function(e){var t=e._opts.schemas;if(!t)return;if(Array.isArray(t))e.addSchema(t);else for(var r in t)e.addSchema(t[r],r);}(this);}function Ma(e,t){return t=ro.normalizeId(t),e._schemas[t]||e._refs[t]||e._fragments[t]}function ja(e,t,r){for(var n in t){var i=t[n];i.meta||r&&!r.test(n)||(e._cache.del(i.cacheKey),delete t[n]);}}function Da(e){return e.$id&&this.logger.warn("schema $id ignored",e.$id),e.id}function Ba(e){return e.id&&this.logger.warn("schema id ignored",e.id),e.$id}function Ua(e){if(e.$id&&e.id&&e.$id!=e.id)throw new Error("schema $id is different from id");return e.$id||e.id}function Fa(e,t){if(e._schemas[t]||e._refs[t])throw new Error('schema with key or id "'+t+'" already exists')}function Ha(){}var za=Qn(Ii);var Va={validate:(new Aa).compile(za)};var qa={root:{merkleRoot:0,targetHash:1,anchors:2,path:3},path:{left:0,right:1},chain:{btc:{id:0,networks:{mainnet:1,testnet:3}},eth:{id:1,networks:{mainnet:1,ropsten:3,rinkeby:4}}}},Ka=Yn((function(e){!function(t){var r,n=/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i,i=Math.ceil,o=Math.floor,a="[BigNumber Error] ",s=a+"Number primitive has more than 15 significant digits: ",c=[1,10,100,1e3,1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11,1e12,1e13];function u(e){var t=0|e;return e>0||e===t?t:t-1}function l(e){for(var t,r,n=1,i=e.length,o=e[0]+"";n<i;){for(r=14-(t=e[n++]+"").length;r--;t="0"+t);o+=t;}for(i=o.length;48===o.charCodeAt(--i););return o.slice(0,i+1||1)}function f(e,t){var r,n,i=e.c,o=t.c,a=e.s,s=t.s,c=e.e,u=t.e;if(!a||!s)return null;if(r=i&&!i[0],n=o&&!o[0],r||n)return r?n?0:-s:a;if(a!=s)return a;if(r=a<0,n=c==u,!i||!o)return n?0:!i^r?1:-1;if(!n)return c>u^r?1:-1;for(s=(c=i.length)<(u=o.length)?c:u,a=0;a<s;a++)if(i[a]!=o[a])return i[a]>o[a]^r?1:-1;return c==u?0:c>u^r?1:-1}function h(e,t,r,n){if(e<t||e>r||e!==o(e))throw Error(a+(n||"Argument")+("number"==typeof e?e<t||e>r?" out of range: ":" not an integer: ":" not a primitive number: ")+String(e))}function d(e){var t=e.c.length-1;return u(e.e/14)==t&&e.c[t]%2!=0}function p(e,t){return (e.length>1?e.charAt(0)+"."+e.slice(1):e)+(t<0?"e":"e+")+t}function m(e,t,r){var n,i;if(t<0){for(i=r+".";++t;i+=r);e=i+e;}else if(++t>(n=e.length)){for(i=r,t-=n;--t;i+=r);e+=i;}else t<n&&(e=e.slice(0,t)+"."+e.slice(t));return e}(r=function e(t){var r,v,g,y,b,w,_,S,E,x=D.prototype={constructor:D,toString:null,valueOf:null},I=new D(1),k=20,P=4,O=-7,T=21,A=-1e7,C=1e7,R=!1,N=1,L=0,M={prefix:"",groupSize:3,secondaryGroupSize:0,groupSeparator:",",decimalSeparator:".",fractionGroupSize:0,fractionGroupSeparator:" ",suffix:""},j="0123456789abcdefghijklmnopqrstuvwxyz";function D(e,t){var r,i,a,c,u,l,f,d,p=this;if(!(p instanceof D))return new D(e,t);if(null==t){if(e&&!0===e._isBigNumber)return p.s=e.s,void(!e.c||e.e>C?p.c=p.e=null:e.e<A?p.c=[p.e=0]:(p.e=e.e,p.c=e.c.slice()));if((l="number"==typeof e)&&0*e==0){if(p.s=1/e<0?(e=-e,-1):1,e===~~e){for(c=0,u=e;u>=10;u/=10,c++);return void(c>C?p.c=p.e=null:(p.e=c,p.c=[e]))}d=String(e);}else {if(!n.test(d=String(e)))return g(p,d,l);p.s=45==d.charCodeAt(0)?(d=d.slice(1),-1):1;}(c=d.indexOf("."))>-1&&(d=d.replace(".","")),(u=d.search(/e/i))>0?(c<0&&(c=u),c+=+d.slice(u+1),d=d.substring(0,u)):c<0&&(c=d.length);}else {if(h(t,2,j.length,"Base"),10==t)return H(p=new D(e),k+p.e+1,P);if(d=String(e),l="number"==typeof e){if(0*e!=0)return g(p,d,l,t);if(p.s=1/e<0?(d=d.slice(1),-1):1,D.DEBUG&&d.replace(/^0\.0*|\./,"").length>15)throw Error(s+e)}else p.s=45===d.charCodeAt(0)?(d=d.slice(1),-1):1;for(r=j.slice(0,t),c=u=0,f=d.length;u<f;u++)if(r.indexOf(i=d.charAt(u))<0){if("."==i){if(u>c){c=f;continue}}else if(!a&&(d==d.toUpperCase()&&(d=d.toLowerCase())||d==d.toLowerCase()&&(d=d.toUpperCase()))){a=!0,u=-1,c=0;continue}return g(p,String(e),l,t)}l=!1,(c=(d=v(d,t,10,p.s)).indexOf("."))>-1?d=d.replace(".",""):c=d.length;}for(u=0;48===d.charCodeAt(u);u++);for(f=d.length;48===d.charCodeAt(--f););if(d=d.slice(u,++f)){if(f-=u,l&&D.DEBUG&&f>15&&(e>9007199254740991||e!==o(e)))throw Error(s+p.s*e);if((c=c-u-1)>C)p.c=p.e=null;else if(c<A)p.c=[p.e=0];else {if(p.e=c,p.c=[],u=(c+1)%14,c<0&&(u+=14),u<f){for(u&&p.c.push(+d.slice(0,u)),f-=14;u<f;)p.c.push(+d.slice(u,u+=14));u=14-(d=d.slice(u)).length;}else u-=f;for(;u--;d+="0");p.c.push(+d);}}else p.c=[p.e=0];}function B(e,t,r,n){var i,o,a,s,c;if(null==r?r=P:h(r,0,8),!e.c)return e.toString();if(i=e.c[0],a=e.e,null==t)c=l(e.c),c=1==n||2==n&&(a<=O||a>=T)?p(c,a):m(c,a,"0");else if(o=(e=H(new D(e),t,r)).e,s=(c=l(e.c)).length,1==n||2==n&&(t<=o||o<=O)){for(;s<t;c+="0",s++);c=p(c,o);}else if(t-=a,c=m(c,o,"0"),o+1>s){if(--t>0)for(c+=".";t--;c+="0");}else if((t+=o-s)>0)for(o+1==s&&(c+=".");t--;c+="0");return e.s<0&&i?"-"+c:c}function U(e,t){for(var r,n=1,i=new D(e[0]);n<e.length;n++){if(!(r=new D(e[n])).s){i=r;break}t.call(i,r)&&(i=r);}return i}function F(e,t,r){for(var n=1,i=t.length;!t[--i];t.pop());for(i=t[0];i>=10;i/=10,n++);return (r=n+14*r-1)>C?e.c=e.e=null:r<A?e.c=[e.e=0]:(e.e=r,e.c=t),e}function H(e,t,r,n){var a,s,u,l,f,h,d,p=e.c,m=c;if(p){e:{for(a=1,l=p[0];l>=10;l/=10,a++);if((s=t-a)<0)s+=14,u=t,d=(f=p[h=0])/m[a-u-1]%10|0;else if((h=i((s+1)/14))>=p.length){if(!n)break e;for(;p.length<=h;p.push(0));f=d=0,a=1,u=(s%=14)-14+1;}else {for(f=l=p[h],a=1;l>=10;l/=10,a++);d=(u=(s%=14)-14+a)<0?0:f/m[a-u-1]%10|0;}if(n=n||t<0||null!=p[h+1]||(u<0?f:f%m[a-u-1]),n=r<4?(d||n)&&(0==r||r==(e.s<0?3:2)):d>5||5==d&&(4==r||n||6==r&&(s>0?u>0?f/m[a-u]:0:p[h-1])%10&1||r==(e.s<0?8:7)),t<1||!p[0])return p.length=0,n?(t-=e.e+1,p[0]=m[(14-t%14)%14],e.e=-t||0):p[0]=e.e=0,e;if(0==s?(p.length=h,l=1,h--):(p.length=h+1,l=m[14-s],p[h]=u>0?o(f/m[a-u]%m[u])*l:0),n)for(;;){if(0==h){for(s=1,u=p[0];u>=10;u/=10,s++);for(u=p[0]+=l,l=1;u>=10;u/=10,l++);s!=l&&(e.e++,1e14==p[0]&&(p[0]=1));break}if(p[h]+=l,1e14!=p[h])break;p[h--]=0,l=1;}for(s=p.length;0===p[--s];p.pop());}e.e>C?e.c=e.e=null:e.e<A&&(e.c=[e.e=0]);}return e}function z(e){var t,r=e.e;return null===r?e.toString():(t=l(e.c),t=r<=O||r>=T?p(t,r):m(t,r,"0"),e.s<0?"-"+t:t)}return D.clone=e,D.ROUND_UP=0,D.ROUND_DOWN=1,D.ROUND_CEIL=2,D.ROUND_FLOOR=3,D.ROUND_HALF_UP=4,D.ROUND_HALF_DOWN=5,D.ROUND_HALF_EVEN=6,D.ROUND_HALF_CEIL=7,D.ROUND_HALF_FLOOR=8,D.EUCLID=9,D.config=D.set=function(e){var t,r;if(null!=e){if("object"!=typeof e)throw Error(a+"Object expected: "+e);if(e.hasOwnProperty(t="DECIMAL_PLACES")&&(h(r=e[t],0,1e9,t),k=r),e.hasOwnProperty(t="ROUNDING_MODE")&&(h(r=e[t],0,8,t),P=r),e.hasOwnProperty(t="EXPONENTIAL_AT")&&((r=e[t])&&r.pop?(h(r[0],-1e9,0,t),h(r[1],0,1e9,t),O=r[0],T=r[1]):(h(r,-1e9,1e9,t),O=-(T=r<0?-r:r))),e.hasOwnProperty(t="RANGE"))if((r=e[t])&&r.pop)h(r[0],-1e9,-1,t),h(r[1],1,1e9,t),A=r[0],C=r[1];else {if(h(r,-1e9,1e9,t),!r)throw Error(a+t+" cannot be zero: "+r);A=-(C=r<0?-r:r);}if(e.hasOwnProperty(t="CRYPTO")){if((r=e[t])!==!!r)throw Error(a+t+" not true or false: "+r);if(r){if("undefined"==typeof crypto||!crypto||!crypto.getRandomValues&&!crypto.randomBytes)throw R=!r,Error(a+"crypto unavailable");R=r;}else R=r;}if(e.hasOwnProperty(t="MODULO_MODE")&&(h(r=e[t],0,9,t),N=r),e.hasOwnProperty(t="POW_PRECISION")&&(h(r=e[t],0,1e9,t),L=r),e.hasOwnProperty(t="FORMAT")){if("object"!=typeof(r=e[t]))throw Error(a+t+" not an object: "+r);M=r;}if(e.hasOwnProperty(t="ALPHABET")){if("string"!=typeof(r=e[t])||/^.$|[+-.\s]|(.).*\1/.test(r))throw Error(a+t+" invalid: "+r);j=r;}}return {DECIMAL_PLACES:k,ROUNDING_MODE:P,EXPONENTIAL_AT:[O,T],RANGE:[A,C],CRYPTO:R,MODULO_MODE:N,POW_PRECISION:L,FORMAT:M,ALPHABET:j}},D.isBigNumber=function(e){if(!e||!0!==e._isBigNumber)return !1;if(!D.DEBUG)return !0;var t,r,n=e.c,i=e.e,s=e.s;e:if("[object Array]"=={}.toString.call(n)){if((1===s||-1===s)&&i>=-1e9&&i<=1e9&&i===o(i)){if(0===n[0]){if(0===i&&1===n.length)return !0;break e}if((t=(i+1)%14)<1&&(t+=14),String(n[0]).length==t){for(t=0;t<n.length;t++)if((r=n[t])<0||r>=1e14||r!==o(r))break e;if(0!==r)return !0}}}else if(null===n&&null===i&&(null===s||1===s||-1===s))return !0;throw Error(a+"Invalid BigNumber: "+e)},D.maximum=D.max=function(){return U(arguments,x.lt)},D.minimum=D.min=function(){return U(arguments,x.gt)},D.random=(y=9007199254740992*Math.random()&2097151?function(){return o(9007199254740992*Math.random())}:function(){return 8388608*(1073741824*Math.random()|0)+(8388608*Math.random()|0)},function(e){var t,r,n,s,u,l=0,f=[],d=new D(I);if(null==e?e=k:h(e,0,1e9),s=i(e/14),R)if(crypto.getRandomValues){for(t=crypto.getRandomValues(new Uint32Array(s*=2));l<s;)(u=131072*t[l]+(t[l+1]>>>11))>=9e15?(r=crypto.getRandomValues(new Uint32Array(2)),t[l]=r[0],t[l+1]=r[1]):(f.push(u%1e14),l+=2);l=s/2;}else {if(!crypto.randomBytes)throw R=!1,Error(a+"crypto unavailable");for(t=crypto.randomBytes(s*=7);l<s;)(u=281474976710656*(31&t[l])+1099511627776*t[l+1]+4294967296*t[l+2]+16777216*t[l+3]+(t[l+4]<<16)+(t[l+5]<<8)+t[l+6])>=9e15?crypto.randomBytes(7).copy(t,l):(f.push(u%1e14),l+=7);l=s/7;}if(!R)for(;l<s;)(u=y())<9e15&&(f[l++]=u%1e14);for(e%=14,(s=f[--l])&&e&&(u=c[14-e],f[l]=o(s/u)*u);0===f[l];f.pop(),l--);if(l<0)f=[n=0];else {for(n=-1;0===f[0];f.splice(0,1),n-=14);for(l=1,u=f[0];u>=10;u/=10,l++);l<14&&(n-=14-l);}return d.e=n,d.c=f,d}),D.sum=function(){for(var e=1,t=arguments,r=new D(t[0]);e<t.length;)r=r.plus(t[e++]);return r},v=function(){function e(e,t,r,n){for(var i,o,a=[0],s=0,c=e.length;s<c;){for(o=a.length;o--;a[o]*=t);for(a[0]+=n.indexOf(e.charAt(s++)),i=0;i<a.length;i++)a[i]>r-1&&(null==a[i+1]&&(a[i+1]=0),a[i+1]+=a[i]/r|0,a[i]%=r);}return a.reverse()}return function(t,n,i,o,a){var s,c,u,f,h,d,p,v,g=t.indexOf("."),y=k,b=P;for(g>=0&&(f=L,L=0,t=t.replace(".",""),d=(v=new D(n)).pow(t.length-g),L=f,v.c=e(m(l(d.c),d.e,"0"),10,i,"0123456789"),v.e=v.c.length),u=f=(p=e(t,n,i,a?(s=j,"0123456789"):(s="0123456789",j))).length;0==p[--f];p.pop());if(!p[0])return s.charAt(0);if(g<0?--u:(d.c=p,d.e=u,d.s=o,p=(d=r(d,v,y,b,i)).c,h=d.r,u=d.e),g=p[c=u+y+1],f=i/2,h=h||c<0||null!=p[c+1],h=b<4?(null!=g||h)&&(0==b||b==(d.s<0?3:2)):g>f||g==f&&(4==b||h||6==b&&1&p[c-1]||b==(d.s<0?8:7)),c<1||!p[0])t=h?m(s.charAt(1),-y,s.charAt(0)):s.charAt(0);else {if(p.length=c,h)for(--i;++p[--c]>i;)p[c]=0,c||(++u,p=[1].concat(p));for(f=p.length;!p[--f];);for(g=0,t="";g<=f;t+=s.charAt(p[g++]));t=m(t,u,s.charAt(0));}return t}}(),r=function(){function e(e,t,r){var n,i,o,a,s=0,c=e.length,u=t%1e7,l=t/1e7|0;for(e=e.slice();c--;)s=((i=u*(o=e[c]%1e7)+(n=l*o+(a=e[c]/1e7|0)*u)%1e7*1e7+s)/r|0)+(n/1e7|0)+l*a,e[c]=i%r;return s&&(e=[s].concat(e)),e}function t(e,t,r,n){var i,o;if(r!=n)o=r>n?1:-1;else for(i=o=0;i<r;i++)if(e[i]!=t[i]){o=e[i]>t[i]?1:-1;break}return o}function r(e,t,r,n){for(var i=0;r--;)e[r]-=i,i=e[r]<t[r]?1:0,e[r]=i*n+e[r]-t[r];for(;!e[0]&&e.length>1;e.splice(0,1));}return function(n,i,a,s,c){var l,f,h,d,p,m,v,g,y,b,w,_,S,E,x,I,k,P=n.s==i.s?1:-1,O=n.c,T=i.c;if(!(O&&O[0]&&T&&T[0]))return new D(n.s&&i.s&&(O?!T||O[0]!=T[0]:T)?O&&0==O[0]||!T?0*P:P/0:NaN);for(y=(g=new D(P)).c=[],P=a+(f=n.e-i.e)+1,c||(c=1e14,f=u(n.e/14)-u(i.e/14),P=P/14|0),h=0;T[h]==(O[h]||0);h++);if(T[h]>(O[h]||0)&&f--,P<0)y.push(1),d=!0;else {for(E=O.length,I=T.length,h=0,P+=2,(p=o(c/(T[0]+1)))>1&&(T=e(T,p,c),O=e(O,p,c),I=T.length,E=O.length),S=I,w=(b=O.slice(0,I)).length;w<I;b[w++]=0);k=T.slice(),k=[0].concat(k),x=T[0],T[1]>=c/2&&x++;do{if(p=0,(l=t(T,b,I,w))<0){if(_=b[0],I!=w&&(_=_*c+(b[1]||0)),(p=o(_/x))>1)for(p>=c&&(p=c-1),v=(m=e(T,p,c)).length,w=b.length;1==t(m,b,v,w);)p--,r(m,I<v?k:T,v,c),v=m.length,l=1;else 0==p&&(l=p=1),v=(m=T.slice()).length;if(v<w&&(m=[0].concat(m)),r(b,m,w,c),w=b.length,-1==l)for(;t(T,b,I,w)<1;)p++,r(b,I<w?k:T,w,c),w=b.length;}else 0===l&&(p++,b=[0]);y[h++]=p,b[0]?b[w++]=O[S]||0:(b=[O[S]],w=1);}while((S++<E||null!=b[0])&&P--);d=null!=b[0],y[0]||y.splice(0,1);}if(1e14==c){for(h=1,P=y[0];P>=10;P/=10,h++);H(g,a+(g.e=h+14*f-1)+1,s,d);}else g.e=f,g.r=+d;return g}}(),b=/^(-?)0([xbo])(?=\w[\w.]*$)/i,w=/^([^.]+)\.$/,_=/^\.([^.]+)$/,S=/^-?(Infinity|NaN)$/,E=/^\s*\+(?=[\w.])|^\s+|\s+$/g,g=function(e,t,r,n){var i,o=r?t:t.replace(E,"");if(S.test(o))e.s=isNaN(o)?null:o<0?-1:1;else {if(!r&&(o=o.replace(b,(function(e,t,r){return i="x"==(r=r.toLowerCase())?16:"b"==r?2:8,n&&n!=i?e:t})),n&&(i=n,o=o.replace(w,"$1").replace(_,"0.$1")),t!=o))return new D(o,i);if(D.DEBUG)throw Error(a+"Not a"+(n?" base "+n:"")+" number: "+t);e.s=null;}e.c=e.e=null;},x.absoluteValue=x.abs=function(){var e=new D(this);return e.s<0&&(e.s=1),e},x.comparedTo=function(e,t){return f(this,new D(e,t))},x.decimalPlaces=x.dp=function(e,t){var r,n,i,o=this;if(null!=e)return h(e,0,1e9),null==t?t=P:h(t,0,8),H(new D(o),e+o.e+1,t);if(!(r=o.c))return null;if(n=14*((i=r.length-1)-u(this.e/14)),i=r[i])for(;i%10==0;i/=10,n--);return n<0&&(n=0),n},x.dividedBy=x.div=function(e,t){return r(this,new D(e,t),k,P)},x.dividedToIntegerBy=x.idiv=function(e,t){return r(this,new D(e,t),0,1)},x.exponentiatedBy=x.pow=function(e,t){var r,n,s,c,u,l,f,h,p=this;if((e=new D(e)).c&&!e.isInteger())throw Error(a+"Exponent not an integer: "+z(e));if(null!=t&&(t=new D(t)),u=e.e>14,!p.c||!p.c[0]||1==p.c[0]&&!p.e&&1==p.c.length||!e.c||!e.c[0])return h=new D(Math.pow(+z(p),u?2-d(e):+z(e))),t?h.mod(t):h;if(l=e.s<0,t){if(t.c?!t.c[0]:!t.s)return new D(NaN);(n=!l&&p.isInteger()&&t.isInteger())&&(p=p.mod(t));}else {if(e.e>9&&(p.e>0||p.e<-1||(0==p.e?p.c[0]>1||u&&p.c[1]>=24e7:p.c[0]<8e13||u&&p.c[0]<=9999975e7)))return c=p.s<0&&d(e)?-0:0,p.e>-1&&(c=1/c),new D(l?1/c:c);L&&(c=i(L/14+2));}for(u?(r=new D(.5),l&&(e.s=1),f=d(e)):f=(s=Math.abs(+z(e)))%2,h=new D(I);;){if(f){if(!(h=h.times(p)).c)break;c?h.c.length>c&&(h.c.length=c):n&&(h=h.mod(t));}if(s){if(0===(s=o(s/2)))break;f=s%2;}else if(H(e=e.times(r),e.e+1,1),e.e>14)f=d(e);else {if(0===(s=+z(e)))break;f=s%2;}p=p.times(p),c?p.c&&p.c.length>c&&(p.c.length=c):n&&(p=p.mod(t));}return n?h:(l&&(h=I.div(h)),t?h.mod(t):c?H(h,L,P,void 0):h)},x.integerValue=function(e){var t=new D(this);return null==e?e=P:h(e,0,8),H(t,t.e+1,e)},x.isEqualTo=x.eq=function(e,t){return 0===f(this,new D(e,t))},x.isFinite=function(){return !!this.c},x.isGreaterThan=x.gt=function(e,t){return f(this,new D(e,t))>0},x.isGreaterThanOrEqualTo=x.gte=function(e,t){return 1===(t=f(this,new D(e,t)))||0===t},x.isInteger=function(){return !!this.c&&u(this.e/14)>this.c.length-2},x.isLessThan=x.lt=function(e,t){return f(this,new D(e,t))<0},x.isLessThanOrEqualTo=x.lte=function(e,t){return -1===(t=f(this,new D(e,t)))||0===t},x.isNaN=function(){return !this.s},x.isNegative=function(){return this.s<0},x.isPositive=function(){return this.s>0},x.isZero=function(){return !!this.c&&0==this.c[0]},x.minus=function(e,t){var r,n,i,o,a=this,s=a.s;if(t=(e=new D(e,t)).s,!s||!t)return new D(NaN);if(s!=t)return e.s=-t,a.plus(e);var c=a.e/14,l=e.e/14,f=a.c,h=e.c;if(!c||!l){if(!f||!h)return f?(e.s=-t,e):new D(h?a:NaN);if(!f[0]||!h[0])return h[0]?(e.s=-t,e):new D(f[0]?a:3==P?-0:0)}if(c=u(c),l=u(l),f=f.slice(),s=c-l){for((o=s<0)?(s=-s,i=f):(l=c,i=h),i.reverse(),t=s;t--;i.push(0));i.reverse();}else for(n=(o=(s=f.length)<(t=h.length))?s:t,s=t=0;t<n;t++)if(f[t]!=h[t]){o=f[t]<h[t];break}if(o&&(i=f,f=h,h=i,e.s=-e.s),(t=(n=h.length)-(r=f.length))>0)for(;t--;f[r++]=0);for(t=1e14-1;n>s;){if(f[--n]<h[n]){for(r=n;r&&!f[--r];f[r]=t);--f[r],f[n]+=1e14;}f[n]-=h[n];}for(;0==f[0];f.splice(0,1),--l);return f[0]?F(e,f,l):(e.s=3==P?-1:1,e.c=[e.e=0],e)},x.modulo=x.mod=function(e,t){var n,i,o=this;return e=new D(e,t),!o.c||!e.s||e.c&&!e.c[0]?new D(NaN):!e.c||o.c&&!o.c[0]?new D(o):(9==N?(i=e.s,e.s=1,n=r(o,e,0,3),e.s=i,n.s*=i):n=r(o,e,0,N),(e=o.minus(n.times(e))).c[0]||1!=N||(e.s=o.s),e)},x.multipliedBy=x.times=function(e,t){var r,n,i,o,a,s,c,l,f,h,d,p,m,v=this,g=v.c,y=(e=new D(e,t)).c;if(!(g&&y&&g[0]&&y[0]))return !v.s||!e.s||g&&!g[0]&&!y||y&&!y[0]&&!g?e.c=e.e=e.s=null:(e.s*=v.s,g&&y?(e.c=[0],e.e=0):e.c=e.e=null),e;for(n=u(v.e/14)+u(e.e/14),e.s*=v.s,(c=g.length)<(h=y.length)&&(m=g,g=y,y=m,i=c,c=h,h=i),i=c+h,m=[];i--;m.push(0));for(i=h;--i>=0;){for(r=0,d=y[i]%1e7,p=y[i]/1e7|0,o=i+(a=c);o>i;)r=((l=d*(l=g[--a]%1e7)+(s=p*l+(f=g[a]/1e7|0)*d)%1e7*1e7+m[o]+r)/1e14|0)+(s/1e7|0)+p*f,m[o--]=l%1e14;m[o]=r;}return r?++n:m.splice(0,1),F(e,m,n)},x.negated=function(){var e=new D(this);return e.s=-e.s||null,e},x.plus=function(e,t){var r,n=this,i=n.s;if(t=(e=new D(e,t)).s,!i||!t)return new D(NaN);if(i!=t)return e.s=-t,n.minus(e);var o=n.e/14,a=e.e/14,s=n.c,c=e.c;if(!o||!a){if(!s||!c)return new D(i/0);if(!s[0]||!c[0])return c[0]?e:new D(s[0]?n:0*i)}if(o=u(o),a=u(a),s=s.slice(),i=o-a){for(i>0?(a=o,r=c):(i=-i,r=s),r.reverse();i--;r.push(0));r.reverse();}for((i=s.length)-(t=c.length)<0&&(r=c,c=s,s=r,t=i),i=0;t;)i=(s[--t]=s[t]+c[t]+i)/1e14|0,s[t]=1e14===s[t]?0:s[t]%1e14;return i&&(s=[i].concat(s),++a),F(e,s,a)},x.precision=x.sd=function(e,t){var r,n,i,o=this;if(null!=e&&e!==!!e)return h(e,1,1e9),null==t?t=P:h(t,0,8),H(new D(o),e,t);if(!(r=o.c))return null;if(n=14*(i=r.length-1)+1,i=r[i]){for(;i%10==0;i/=10,n--);for(i=r[0];i>=10;i/=10,n++);}return e&&o.e+1>n&&(n=o.e+1),n},x.shiftedBy=function(e){return h(e,-9007199254740991,9007199254740991),this.times("1e"+e)},x.squareRoot=x.sqrt=function(){var e,t,n,i,o,a=this,s=a.c,c=a.s,f=a.e,h=k+4,d=new D("0.5");if(1!==c||!s||!s[0])return new D(!c||c<0&&(!s||s[0])?NaN:s?a:1/0);if(0==(c=Math.sqrt(+z(a)))||c==1/0?(((t=l(s)).length+f)%2==0&&(t+="0"),c=Math.sqrt(+t),f=u((f+1)/2)-(f<0||f%2),n=new D(t=c==1/0?"1e"+f:(t=c.toExponential()).slice(0,t.indexOf("e")+1)+f)):n=new D(c+""),n.c[0])for((c=(f=n.e)+h)<3&&(c=0);;)if(o=n,n=d.times(o.plus(r(a,o,h,1))),l(o.c).slice(0,c)===(t=l(n.c)).slice(0,c)){if(n.e<f&&--c,"9999"!=(t=t.slice(c-3,c+1))&&(i||"4999"!=t)){+t&&(+t.slice(1)||"5"!=t.charAt(0))||(H(n,n.e+k+2,1),e=!n.times(n).eq(a));break}if(!i&&(H(o,o.e+k+2,0),o.times(o).eq(a))){n=o;break}h+=4,c+=4,i=1;}return H(n,n.e+k+1,P,e)},x.toExponential=function(e,t){return null!=e&&(h(e,0,1e9),e++),B(this,e,t,1)},x.toFixed=function(e,t){return null!=e&&(h(e,0,1e9),e=e+this.e+1),B(this,e,t)},x.toFormat=function(e,t,r){var n,i=this;if(null==r)null!=e&&t&&"object"==typeof t?(r=t,t=null):e&&"object"==typeof e?(r=e,e=t=null):r=M;else if("object"!=typeof r)throw Error(a+"Argument not an object: "+r);if(n=i.toFixed(e,t),i.c){var o,s=n.split("."),c=+r.groupSize,u=+r.secondaryGroupSize,l=r.groupSeparator||"",f=s[0],h=s[1],d=i.s<0,p=d?f.slice(1):f,m=p.length;if(u&&(o=c,c=u,u=o,m-=o),c>0&&m>0){for(o=m%c||c,f=p.substr(0,o);o<m;o+=c)f+=l+p.substr(o,c);u>0&&(f+=l+p.slice(o)),d&&(f="-"+f);}n=h?f+(r.decimalSeparator||"")+((u=+r.fractionGroupSize)?h.replace(new RegExp("\\d{"+u+"}\\B","g"),"$&"+(r.fractionGroupSeparator||"")):h):f;}return (r.prefix||"")+n+(r.suffix||"")},x.toFraction=function(e){var t,n,i,o,s,u,f,h,d,p,m,v,g=this,y=g.c;if(null!=e&&(!(f=new D(e)).isInteger()&&(f.c||1!==f.s)||f.lt(I)))throw Error(a+"Argument "+(f.isInteger()?"out of range: ":"not an integer: ")+z(f));if(!y)return new D(g);for(t=new D(I),d=n=new D(I),i=h=new D(I),v=l(y),s=t.e=v.length-g.e-1,t.c[0]=c[(u=s%14)<0?14+u:u],e=!e||f.comparedTo(t)>0?s>0?t:d:f,u=C,C=1/0,f=new D(v),h.c[0]=0;p=r(f,t,0,1),1!=(o=n.plus(p.times(i))).comparedTo(e);)n=i,i=o,d=h.plus(p.times(o=d)),h=o,t=f.minus(p.times(o=t)),f=o;return o=r(e.minus(n),i,0,1),h=h.plus(o.times(d)),n=n.plus(o.times(i)),h.s=d.s=g.s,m=r(d,i,s*=2,P).minus(g).abs().comparedTo(r(h,n,s,P).minus(g).abs())<1?[d,i]:[h,n],C=u,m},x.toNumber=function(){return +z(this)},x.toPrecision=function(e,t){return null!=e&&h(e,1,1e9),B(this,e,t,2)},x.toString=function(e){var t,r=this,n=r.s,i=r.e;return null===i?n?(t="Infinity",n<0&&(t="-"+t)):t="NaN":(null==e?t=i<=O||i>=T?p(l(r.c),i):m(l(r.c),i,"0"):10===e?t=m(l((r=H(new D(r),k+i+1,P)).c),r.e,"0"):(h(e,2,j.length,"Base"),t=v(m(l(r.c),i,"0"),10,e,n,!0)),n<0&&r.c[0]&&(t="-"+t)),t},x.valueOf=x.toJSON=function(){return z(this)},x._isBigNumber=!0,null!=t&&D.set(t),D}()).default=r.BigNumber=r,e.exports?e.exports=r:(t||(t="undefined"!=typeof self&&self?self:window),t.BigNumber=r);}(Wn);})),$a={MT:{POS_INT:0,NEG_INT:1,BYTE_STRING:2,UTF8_STRING:3,ARRAY:4,MAP:5,TAG:6,SIMPLE_FLOAT:7},TAG:{DATE_STRING:0,DATE_EPOCH:1,POS_BIGINT:2,NEG_BIGINT:3,DECIMAL_FRAC:4,BIGFLOAT:5,BASE64URL_EXPECTED:21,BASE64_EXPECTED:22,BASE16_EXPECTED:23,CBOR:24,URI:32,BASE64URL:33,BASE64:34,REGEXP:35,MIME:36},NUMBYTES:{ZERO:0,ONE:24,TWO:25,FOUR:26,EIGHT:27,INDEFINITE:31},SIMPLE:{FALSE:20,TRUE:21,NULL:22,UNDEFINED:23},SYMS:{NULL:Symbol("null"),UNDEFINED:Symbol("undef"),PARENT:Symbol("parent"),BREAK:Symbol("break"),STREAM:Symbol("stream")},SHIFT32:Math.pow(2,32)},Ga=Yn((function(e,t){const r=Ka.BigNumber,n=$a.NUMBYTES,i=$a.SHIFT32;t.hasBigInt="function"==typeof BigInt;const o="function"==typeof TextDecoder?TextDecoder:Qt.TextDecoder;if(o){const e=new o("utf8",{fatal:!0,ignoreBOM:!0});t.utf8=t=>e.decode(t),t.utf8.checksUTF8=!0;}else t.utf8=e=>e.toString("utf8"),t.utf8.checksUTF8=!1;t.parseCBORint=function(e,t){switch(e){case n.ONE:return t.readUInt8(0);case n.TWO:return t.readUInt16BE(0);case n.FOUR:return t.readUInt32BE(0);case n.EIGHT:const o=t.readUInt32BE(0),a=t.readUInt32BE(4);return o>2097151?new r(o).times(i).plus(a):o*i+a;default:throw new Error("Invalid additional info for int: "+e)}},t.writeHalf=function(e,t){const r=re.allocUnsafe(4);r.writeFloatBE(t,0);const n=r.readUInt32BE(0);if(0!=(8191&n))return !1;let i=n>>16&32768;const o=n>>23&255,a=8388607&n;if(o>=113&&o<=142)i+=(o-112<<10)+(a>>13);else {if(!(o>=103&&o<113))return !1;if(a&(1<<126-o)-1)return !1;i+=a+8388608>>126-o;}return e.writeUInt16BE(i),!0},t.parseHalf=function(e){const t=128&e[0]?-1:1,r=(124&e[0])>>2,n=(3&e[0])<<8|e[1];return r?31===r?t*(n?NaN:Infinity):t*Math.pow(2,r-25)*(1024+n):5.960464477539063e-8*t*n},t.parseCBORfloat=function(e){switch(e.length){case 2:return t.parseHalf(e);case 4:return e.readFloatBE(0);case 8:return e.readDoubleBE(0);default:throw new Error("Invalid float size: "+e.length)}},t.hex=function(e){return re.from(e.replace(/^0x/,""),"hex")},t.bin=function(e){let t=0,r=(e=e.replace(/\s/g,"")).length%8||8;const n=[];for(;r<=e.length;)n.push(parseInt(e.slice(t,r),2)),t=r,r+=8;return re.from(n)},t.extend=function(e={},...t){const r=t.length;for(let n=0;n<r;n++){const r=t[n];for(const t in r){const n=r[t];e[t]=n;}}return e},t.arrayEqual=function(e,t){return null==e&&null==t||null!=e&&null!=t&&(e.length===t.length&&e.every((e,r)=>e===t[r]))},t.bufferEqual=function(e,t){if(null==e&&null==t)return !0;if(null==e||null==t)return !1;if(!Be(e)||!Be(t)||e.length!==t.length)return !1;const r=e.length;let n,i,o=!0;for(n=i=0;i<r;n=++i){const r=e[n];o=o&&t[n]===r;}return !!o},t.bufferToBignumber=function(e){return new r(e.toString("hex"),16)},t.bufferToBigInt=function(e){return BigInt("0x"+e.toString("hex"))},t.guessEncoding=function(e){if("string"==typeof e)return "hex";if(!Be(e))throw new Error("Unknown input type")};}));Ga.hasBigInt,Ga.utf8,Ga.parseCBORint,Ga.writeHalf,Ga.parseHalf,Ga.parseCBORfloat,Ga.hex,Ga.bin,Ga.extend,Ga.arrayEqual,Ga.bufferEqual,Ga.bufferToBignumber,Ga.bufferToBigInt,Ga.guessEncoding;const Ja=$a.MT,Wa=$a.SIMPLE,Xa=$a.SYMS;class Ya{constructor(e){if("number"!=typeof e)throw new Error("Invalid Simple type: "+typeof e);if(e<0||e>255||(0|e)!==e)throw new Error("value must be a small positive integer: "+e);this.value=e;}toString(){return "simple("+this.value+")"}[Qt.inspect.custom](e,t){return "simple("+this.value+")"}inspect(e,t){return "simple("+this.value+")"}encodeCBOR(e){return e._pushInt(this.value,Ja.SIMPLE_FLOAT)}static isSimple(e){return e instanceof Ya}static decode(e,t=!0,r=!1){switch(e){case Wa.FALSE:return !1;case Wa.TRUE:return !0;case Wa.NULL:return t?null:Xa.NULL;case Wa.UNDEFINED:return t?void 0:Xa.UNDEFINED;case-1:if(!t||!r)throw new Error("Invalid BREAK");return Xa.BREAK;default:return new Ya(e)}}}var Qa=Ya;class Za extends Bn.Transform{constructor(e,t,r){let n,i;switch(null==r&&(r={}),typeof e){case"object":Be(e)?(n=e,null!=t&&"object"==typeof t&&(r=t)):r=e;break;case"string":n=e,null!=t&&"object"==typeof t?r=t:i=t;}null==r&&(r={}),null==n&&(n=r.input),null==i&&(i=r.inputEncoding),delete r.input,delete r.inputEncoding;const o=null==r.watchPipe||r.watchPipe;delete r.watchPipe;const a=!!r.readError;delete r.readError,super(r),this.readError=a,o&&this.on("pipe",e=>{const t=e._readableState.objectMode;if(this.length>0&&t!==this._readableState.objectMode)throw new Error("Do not switch objectMode in the middle of the stream");return this._readableState.objectMode=t,this._writableState.objectMode=t}),null!=n&&this.end(n,i);}static isNoFilter(e){return e instanceof this}static compare(e,t){if(!(e instanceof this))throw new TypeError("Arguments must be NoFilters");return e===t?0:e.compare(t)}static concat(e,t){if(!Array.isArray(e))throw new TypeError("list argument must be an Array of NoFilters");if(0===e.length||0===t)return re.alloc(0);null==t&&(t=e.reduce((e,t)=>{if(!(t instanceof Za))throw new TypeError("list argument must be an Array of NoFilters");return e+t.length},0));let r=!0,n=!0;const i=e.map(e=>{if(!(e instanceof Za))throw new TypeError("list argument must be an Array of NoFilters");const t=e.slice();return Be(t)?n=!1:r=!1,t});if(r)return re.concat(i,t);if(n)return [].concat(...i).slice(0,t);throw new Error("Concatenating mixed object and byte streams not supported")}_transform(e,t,r){this._readableState.objectMode||Be(e)||(e=re.from(e,t)),this.push(e),r();}_bufArray(){let e=this._readableState.buffer;if(!Array.isArray(e)){let t=e.head;for(e=[];null!=t;)e.push(t.data),t=t.next;}return e}read(e){const t=super.read(e);if(null!=t){if(this.emit("read",t),this.readError&&t.length<e)throw new Error(`Read ${t.length}, wanted ${e}`)}else if(this.readError)throw new Error(`No data available, wanted ${e}`);return t}promise(e){let t=!1;return new Promise((r,n)=>{this.on("finish",()=>{const n=this.read();null==e||t||(t=!0,e(null,n)),r(n);}),this.on("error",r=>{null==e||t||(t=!0,e(r)),n(r);});})}compare(e){if(!(e instanceof Za))throw new TypeError("Arguments must be NoFilters");if(this===e)return 0;{const t=this.slice(),r=e.slice();if(Be(t)&&Be(r))return t.compare(r);throw new Error("Cannot compare streams in object mode")}}equals(e){return 0===this.compare(e)}slice(e,t){if(this._readableState.objectMode)return this._bufArray().slice(e,t);const r=this._bufArray();switch(r.length){case 0:return re.alloc(0);case 1:return r[0].slice(e,t);default:return re.concat(r).slice(e,t)}}get(e){return this.slice()[e]}toJSON(){const e=this.slice();return Be(e)?e.toJSON():e}toString(e,t,r){const n=this.slice(t,r);if(!Be(n))return JSON.stringify(n);if((!e||"utf8"===e)&&Qt.TextDecoder){return new Qt.TextDecoder("utf8",{fatal:!0,ignoreBOM:!0}).decode(n)}return n.toString(e,t,r)}inspect(e,t){return this[Qt.inspect.custom](e,t)}[Qt.inspect.custom](e,t){const r=this._bufArray().map(e=>Be(e)?(null!=t?t.stylize:void 0)?t.stylize(e.toString("hex"),"string"):e.toString("hex"):Qt.inspect(e,t)).join(", ");return `${this.constructor.name} [${r}]`}get length(){return this._readableState.length}writeBigInt(e){let t=e.toString(16);if(e<0){const r=BigInt(Math.floor(t.length/2));t=(e=(BigInt(1)<<r*BigInt(8))+e).toString(16);}return t.length%2&&(t="0"+t),this.push(re.from(t,"hex"))}readUBigInt(e){const t=this.read(e);return Be(t)?BigInt("0x"+t.toString("hex")):null}readBigInt(e){const t=this.read(e);if(!Be(t))return null;let r=BigInt("0x"+t.toString("hex"));if(128&t[0]){r-=BigInt(1)<<BigInt(t.length)*BigInt(8);}return r}}function es(e,t){return function(r){const n=this.read(t);return Be(n)?n[e].call(n,0,!0):null}}function ts(e,t){return function(r){const n=re.alloc(t);return n[e].call(n,r,0,!0),this.push(n)}}Object.assign(Za.prototype,{writeUInt8:ts("writeUInt8",1),writeUInt16LE:ts("writeUInt16LE",2),writeUInt16BE:ts("writeUInt16BE",2),writeUInt32LE:ts("writeUInt32LE",4),writeUInt32BE:ts("writeUInt32BE",4),writeInt8:ts("writeInt8",1),writeInt16LE:ts("writeInt16LE",2),writeInt16BE:ts("writeInt16BE",2),writeInt32LE:ts("writeInt32LE",4),writeInt32BE:ts("writeInt32BE",4),writeFloatLE:ts("writeFloatLE",4),writeFloatBE:ts("writeFloatBE",4),writeDoubleLE:ts("writeDoubleLE",8),writeDoubleBE:ts("writeDoubleBE",8),readUInt8:es("readUInt8",1),readUInt16LE:es("readUInt16LE",2),readUInt16BE:es("readUInt16BE",2),readUInt32LE:es("readUInt32LE",4),readUInt32BE:es("readUInt32BE",4),readInt8:es("readInt8",1),readInt16LE:es("readInt16LE",2),readInt16BE:es("readInt16BE",2),readInt32LE:es("readInt32LE",4),readInt32BE:es("readInt32BE",4),readFloatLE:es("readFloatLE",4),readFloatBE:es("readFloatBE",4),readDoubleLE:es("readDoubleLE",8),readDoubleBE:es("readDoubleBE",8)});var rs=Za;const ns=Bn.Transform;var is=class extends ns{constructor(e){super(e),this._writableState.objectMode=!1,this._readableState.objectMode=!0,this.bs=new rs,this.__restart();}_transform(e,t,r){for(this.bs.write(e);this.bs.length>=this.__needed;){let e;const t=null===this.__needed?void 0:this.bs.read(this.__needed);try{e=this.__parser.next(t);}catch(e){return r(e)}this.__needed&&(this.__fresh=!1),e.done?(this.push(e.value),this.__restart()):this.__needed=e.value||0;}return r()}*_parse(){throw new Error("Must be implemented in subclass")}__restart(){this.__needed=null,this.__parser=this._parse(),this.__fresh=!0;}_flush(e){e(this.__fresh?null:new Error("unexpected end of input"));}};const os=Ka.BigNumber,as=new os(-1),ss=new os(10),cs=new os(2);class us{constructor(e,t,r){if(this.tag=e,this.value=t,this.err=r,"number"!=typeof this.tag)throw new Error("Invalid tag type ("+typeof this.tag+")");if(this.tag<0||(0|this.tag)!==this.tag)throw new Error("Tag must be a positive integer: "+this.tag)}toString(){return `${this.tag}(${JSON.stringify(this.value)})`}encodeCBOR(e){return e._pushTag(this.tag),e.pushAny(this.value)}convert(e){let t=null!=e?e[this.tag]:void 0;if("function"!=typeof t&&(t=us["_tag_"+this.tag],"function"!=typeof t))return this;try{return t.call(us,this.value)}catch(e){return this.err=e,this}}static _tag_0(e){return new Date(e)}static _tag_1(e){return new Date(1e3*e)}static _tag_2(e){return Ga.bufferToBignumber(e)}static _tag_3(e){return as.minus(Ga.bufferToBignumber(e))}static _tag_4(e){return ss.pow(e[0]).times(e[1])}static _tag_5(e){return cs.pow(e[0]).times(e[1])}static _tag_32(e){return or.parse(e)}static _tag_35(e){return new RegExp(e)}}var ls=us;const fs=Ka.BigNumber,hs=$a.MT,ds=$a.NUMBYTES,ps=$a.SYMS,ms=new fs(-1),vs=ms.minus(new fs(Number.MAX_SAFE_INTEGER.toString(16),16)),gs=Symbol("count"),ys=Symbol("major type"),bs=Symbol("error"),ws=Symbol("not found");function _s(e,t,r){const n=[];return n[gs]=r,n[ps.PARENT]=e,n[ys]=t,n}function Ss(e,t){const r=new rs;return r[gs]=-1,r[ps.PARENT]=e,r[ys]=t,r}function Es(e){return Ga.bufferToBigInt(e)}function xs(e){return BigInt("-1")-Ga.bufferToBigInt(e)}class Is extends is{constructor(e){const t=(e=e||{}).tags;delete e.tags;const r=null!=e.max_depth?e.max_depth:-1;delete e.max_depth;const n=!!Ga.hasBigInt&&!!e.bigint;delete e.bigint,super(e),this.running=!0,this.max_depth=r,this.tags=t,n&&(null==this.tags&&(this.tags={}),this.tags[2]=Es,this.tags[3]=xs);}static nullcheck(e){switch(e){case ps.NULL:return null;case ps.UNDEFINED:return;case ws:throw new Error("Value not found");default:return e}}static decodeFirstSync(e,t){let r,n={};switch(typeof(t=t||{encoding:"hex"})){case"string":r=t;break;case"object":n=Ga.extend({},t),r=n.encoding,delete n.encoding;}const i=new Is(n),o=new rs(e,null!=r?r:Ga.guessEncoding(e)),a=i._parse();let s=a.next();for(;!s.done;){const e=o.read(s.value);if(null==e||e.length!==s.value)throw new Error("Insufficient data");s=a.next(e);}return Is.nullcheck(s.value)}static decodeAllSync(e,t){let r,n={};switch(typeof(t=t||{encoding:"hex"})){case"string":r=t;break;case"object":n=Ga.extend({},t),r=n.encoding,delete n.encoding;}const i=new Is(n),o=new rs(e,null!=r?r:Ga.guessEncoding(e)),a=[];for(;o.length>0;){const e=i._parse();let t=e.next();for(;!t.done;){const r=o.read(t.value);if(null==r||r.length!==t.value)throw new Error("Insufficient data");t=e.next(r);}a.push(Is.nullcheck(t.value));}return a}static decodeFirst(e,t,r){let n={},i=!1,o="hex";switch(typeof t){case"function":r=t,o=Ga.guessEncoding(e);break;case"string":o=t;break;case"object":n=Ga.extend({},t),o=null!=n.encoding?n.encoding:Ga.guessEncoding(e),delete n.encoding,i=null!=n.required&&n.required,delete n.required;}const a=new Is(n);let s,c=ws;return a.on("data",e=>{c=Is.nullcheck(e),a.close();}),"function"==typeof r?(a.once("error",e=>{const t=c;return c=bs,a.close(),r(e,t)}),a.once("end",()=>{switch(c){case ws:return i?r(new Error("No CBOR found")):r(null,c);case bs:return;default:return r(null,c)}})):s=new Promise((e,t)=>(a.once("error",e=>(c=bs,a.close(),t(e))),a.once("end",()=>{switch(c){case ws:return i?t(new Error("No CBOR found")):e(c);case bs:return;default:return e(c)}}))),a.end(e,o),s}static decodeAll(e,t,r){let n={},i="hex";switch(typeof t){case"function":r=t,i=Ga.guessEncoding(e);break;case"string":i=t;break;case"object":n=Ga.extend({},t),i=null!=n.encoding?n.encoding:Ga.guessEncoding(e),delete n.encoding;}const o=new Is(n);let a;const s=[];return o.on("data",e=>s.push(Is.nullcheck(e))),"function"==typeof r?(o.on("error",r),o.on("end",()=>r(null,s))):a=new Promise((e,t)=>{o.on("error",t),o.on("end",()=>e(s));}),o.end(e,i),a}close(){this.running=!1,this.__fresh=!0;}*_parse(){let e=null,t=0,r=null;for(;;){if(this.max_depth>=0&&t>this.max_depth)throw new Error("Maximum depth "+this.max_depth+" exceeded");const n=(yield 1)[0];if(!this.running)throw new Error("Unexpected data: 0x"+n.toString(16));const i=n>>5,o=31&n,a=null!=e?e[ys]:void 0,s=null!=e?e.length:void 0;switch(o){case ds.ONE:this.emit("more-bytes",i,1,a,s),r=(yield 1)[0];break;case ds.TWO:case ds.FOUR:case ds.EIGHT:const e=1<<o-24;this.emit("more-bytes",i,e,a,s);const t=yield e;r=i===hs.SIMPLE_FLOAT?t:Ga.parseCBORint(o,t);break;case 28:case 29:case 30:throw this.running=!1,new Error("Additional info not implemented: "+o);case ds.INDEFINITE:switch(i){case hs.POS_INT:case hs.NEG_INT:case hs.TAG:throw new Error(`Invalid indefinite encoding for MT ${i}`)}r=-1;break;default:r=o;}switch(i){case hs.POS_INT:break;case hs.NEG_INT:r=r===Number.MAX_SAFE_INTEGER?vs:r instanceof fs?ms.minus(r):-1-r;break;case hs.BYTE_STRING:case hs.UTF8_STRING:switch(r){case 0:this.emit("start-string",i,r,a,s),r=i===hs.BYTE_STRING?re.allocUnsafe(0):"";break;case-1:this.emit("start",i,ps.STREAM,a,s),e=Ss(e,i),t++;continue;default:this.emit("start-string",i,r,a,s),r=yield r,i===hs.UTF8_STRING&&(r=Ga.utf8(r));}break;case hs.ARRAY:case hs.MAP:switch(r){case 0:r=i===hs.MAP?{}:[];break;case-1:this.emit("start",i,ps.STREAM,a,s),e=_s(e,i,-1),t++;continue;default:this.emit("start",i,r,a,s),e=_s(e,i,r*(i-3)),t++;continue}break;case hs.TAG:this.emit("start",i,r,a,s),e=_s(e,i,1),e.push(r),t++;continue;case hs.SIMPLE_FLOAT:if("number"==typeof r){if(o===ds.ONE&&r<32)throw new Error(`Invalid two-byte encoding of simple value ${r}`);const t=null!=e;r=Qa.decode(r,t,t&&e[gs]<0);}else r=Ga.parseCBORfloat(r);}this.emit("value",r,a,s,o);let c=!1;for(;null!=e;){switch(!1){case r!==ps.BREAK:e[gs]=1;break;case!Array.isArray(e):e.push(r);break;case!(e instanceof rs):const t=e[ys];if(null!=t&&t!==i)throw this.running=!1,new Error("Invalid major type in indefinite encoding");e.write(r);}if(0!=--e[gs]){c=!0;break}if(--t,delete e[gs],this.emit("stop",e[ys]),Array.isArray(e))switch(e[ys]){case hs.ARRAY:r=e;break;case hs.MAP:let t=!0;if(e.length%2!=0)throw new Error("Invalid map length: "+e.length);for(let r=0,n=e.length;r<n;r+=2)if("string"!=typeof e[r]){t=!1;break}if(t){r={};for(let t=0,n=e.length;t<n;t+=2)r[e[t]]=e[t+1];}else {r=new Map;for(let t=0,n=e.length;t<n;t+=2)r.set(e[t],e[t+1]);}break;case hs.TAG:r=new ls(e[0],e[1]).convert(this.tags);}else if(e instanceof rs)switch(e[ys]){case hs.BYTE_STRING:r=e.slice();break;case hs.UTF8_STRING:r=e.toString("utf-8");}const n=e;e=e[ps.PARENT],delete n[ps.PARENT],delete n[ys];}if(!c)return r}}}Is.NOT_FOUND=ws;var ks=Is;const Ps=Ka.BigNumber,Os=$a.MT,Ts=$a.NUMBYTES,As=$a.SYMS;function Cs(e){return e>1?"s":""}class Rs extends Bn.Transform{constructor(e){const t=Object.assign({max_depth:10},e,{readableObjectMode:!1,writableObjectMode:!1}),r=t.max_depth;delete t.max_depth,super(t),this.depth=1,this.max_depth=r,this.all=new rs,this.parser=new ks(t),this.parser.on("value",this._on_value.bind(this)),this.parser.on("start",this._on_start.bind(this)),this.parser.on("start-string",this._on_start_string.bind(this)),this.parser.on("stop",this._on_stop.bind(this)),this.parser.on("more-bytes",this._on_more.bind(this)),this.parser.on("error",this._on_error.bind(this)),this.parser.on("data",this._on_data.bind(this)),this.parser.bs.on("read",this._on_read.bind(this));}_transform(e,t,r){this.parser.write(e,t,r);}_flush(e){return this.parser._flush(e)}static comment(e,t,r){if(null==e)throw new Error("input required");let n="string"==typeof e?"hex":void 0,i=10;switch(typeof t){case"function":r=t;break;case"string":n=t;break;case"number":i=t;break;case"object":const e=t.encoding,o=t.max_depth;n=null!=e?e:n,i=null!=o?o:i;break;case"undefined":break;default:throw new Error("Unknown option type")}const o=new rs,a=new Rs({max_depth:i});let s=null;return "function"==typeof r?(a.on("end",()=>{r(null,o.toString("utf8"));}),a.on("error",r)):s=new Promise((e,t)=>(a.on("end",()=>{e(o.toString("utf8"));}),a.on("error",t))),a.pipe(o),a.end(e,n),s}_on_error(e){return this.push("ERROR: ")&&this.push(e.toString())&&this.push("\n")}_on_read(e){this.all.write(e);const t=e.toString("hex");this.push(new Array(this.depth+1).join("  ")),this.push(t);let r=2*(this.max_depth-this.depth);return r-=t.length,r<1&&(r=1),this.push(new Array(r+1).join(" ")),this.push("-- ")}_on_more(e,t,r,n){this.depth++;let i="";switch(e){case Os.POS_INT:i="Positive number,";break;case Os.NEG_INT:i="Negative number,";break;case Os.ARRAY:i="Array, length";break;case Os.MAP:i="Map, count";break;case Os.BYTE_STRING:i="Bytes, length";break;case Os.UTF8_STRING:i="String, length";break;case Os.SIMPLE_FLOAT:i=1===t?"Simple value,":"Float,";}return this.push(i+" next "+t+" byte"+Cs(t)+"\n")}_on_start_string(e,t,r,n){this.depth++;let i="";switch(e){case Os.BYTE_STRING:i="Bytes, length: "+t;break;case Os.UTF8_STRING:i="String, length: "+t.toString();}return this.push(i+"\n")}_on_start(e,t,r,n){if(this.depth++,t!==As.BREAK)switch(r){case Os.ARRAY:this.push(`[${n}], `);break;case Os.MAP:n%2?this.push(`{Val:${Math.floor(n/2)}}, `):this.push(`{Key:${Math.floor(n/2)}}, `);}switch(e){case Os.TAG:this.push(`Tag #${t}`);break;case Os.ARRAY:t===As.STREAM?this.push("Array (streaming)"):this.push(`Array, ${t} item${Cs(t)}`);break;case Os.MAP:t===As.STREAM?this.push("Map (streaming)"):this.push(`Map, ${t} pair${Cs(t)}`);break;case Os.BYTE_STRING:this.push("Bytes (streaming)");break;case Os.UTF8_STRING:this.push("String (streaming)");}return this.push("\n")}_on_stop(e){return this.depth--}_on_value(e,t,r,n){if(e!==As.BREAK)switch(t){case Os.ARRAY:this.push(`[${r}], `);break;case Os.MAP:r%2?this.push(`{Val:${Math.floor(r/2)}}, `):this.push(`{Key:${Math.floor(r/2)}}, `);}switch(e===As.BREAK?this.push("BREAK\n"):e===As.NULL?this.push("null\n"):e===As.UNDEFINED?this.push("undefined\n"):"string"==typeof e?(this.depth--,e.length>0&&(this.push(JSON.stringify(e)),this.push("\n"))):Be(e)?(this.depth--,e.length>0&&(this.push(e.toString("hex")),this.push("\n"))):e instanceof Ps?(this.push(e.toString()),this.push("\n")):(this.push(Qt.inspect(e)),this.push("\n")),n){case Ts.ONE:case Ts.TWO:case Ts.FOUR:case Ts.EIGHT:this.depth--;}}_on_data(){return this.push("0x"),this.push(this.all.read().toString("hex")),this.push("\n")}}var Ns=Rs;const Ls=Ka.BigNumber,Ms=$a.MT,js=$a.SYMS;class Ds extends Bn.Transform{constructor(e){const t=Object.assign({separator:"\n",stream_errors:!1},e,{readableObjectMode:!1,writableObjectMode:!1}),r=t.separator;delete t.separator;const n=t.stream_errors;delete t.stream_errors,super(t),this.float_bytes=-1,this.separator=r,this.stream_errors=n,this.parser=new ks(t),this.parser.on("more-bytes",this._on_more.bind(this)),this.parser.on("value",this._on_value.bind(this)),this.parser.on("start",this._on_start.bind(this)),this.parser.on("stop",this._on_stop.bind(this)),this.parser.on("data",this._on_data.bind(this)),this.parser.on("error",this._on_error.bind(this));}_transform(e,t,r){return this.parser.write(e,t,r)}_flush(e){return this.parser._flush(t=>this.stream_errors?(t&&this._on_error(t),e()):e(t))}static diagnose(e,t,r){if(null==e)throw new Error("input required");let n={},i="hex";switch(typeof t){case"function":r=t,i=Ga.guessEncoding(e);break;case"object":n=Ga.extend({},t),i=null!=n.encoding?n.encoding:Ga.guessEncoding(e),delete n.encoding;break;default:i=null!=t?t:"hex";}const o=new rs,a=new Ds(n);let s=null;return "function"==typeof r?(a.on("end",()=>r(null,o.toString("utf8"))),a.on("error",r)):s=new Promise((e,t)=>(a.on("end",()=>e(o.toString("utf8"))),a.on("error",t))),a.pipe(o),a.end(e,i),s}_on_error(e){return this.stream_errors?this.push(e.toString()):this.emit("error",e)}_on_more(e,t,r,n){if(e===Ms.SIMPLE_FLOAT)return this.float_bytes={2:1,4:2,8:3}[t]}_fore(e,t){switch(e){case Ms.BYTE_STRING:case Ms.UTF8_STRING:case Ms.ARRAY:if(t>0)return this.push(", ");break;case Ms.MAP:if(t>0)return t%2?this.push(": "):this.push(", ")}}_on_value(e,t,r){if(e!==js.BREAK)return this._fore(t,r),this.push((()=>{switch(!1){case e!==js.NULL:return "null";case e!==js.UNDEFINED:return "undefined";case"string"!=typeof e:return JSON.stringify(e);case!(this.float_bytes>0):const t=this.float_bytes;return this.float_bytes=-1,Qt.inspect(e)+"_"+t;case!Be(e):return "h'"+e.toString("hex")+"'";case!(e instanceof Ls):return e.toString();default:return Qt.inspect(e)}})())}_on_start(e,t,r,n){switch(this._fore(r,n),e){case Ms.TAG:this.push(`${t}(`);break;case Ms.ARRAY:this.push("[");break;case Ms.MAP:this.push("{");break;case Ms.BYTE_STRING:case Ms.UTF8_STRING:this.push("(");}if(t===js.STREAM)return this.push("_ ")}_on_stop(e){switch(e){case Ms.TAG:return this.push(")");case Ms.ARRAY:return this.push("]");case Ms.MAP:return this.push("}");case Ms.BYTE_STRING:case Ms.UTF8_STRING:return this.push(")")}}_on_data(){return this.push(this.separator)}}var Bs=Ds;const Us=Ka.BigNumber,Fs=$a.MT,Hs=$a.NUMBYTES,zs=$a.SHIFT32,Vs=$a.SYMS,qs=$a.TAG,Ks=$a.MT.SIMPLE_FLOAT<<5|$a.NUMBYTES.TWO,$s=$a.MT.SIMPLE_FLOAT<<5|$a.NUMBYTES.FOUR,Gs=$a.MT.SIMPLE_FLOAT<<5|$a.NUMBYTES.EIGHT,Js=$a.MT.SIMPLE_FLOAT<<5|$a.SIMPLE.TRUE,Ws=$a.MT.SIMPLE_FLOAT<<5|$a.SIMPLE.FALSE,Xs=$a.MT.SIMPLE_FLOAT<<5|$a.SIMPLE.UNDEFINED,Ys=$a.MT.SIMPLE_FLOAT<<5|$a.SIMPLE.NULL,Qs=new Us("0x20000000000000"),Zs=re.from("f97e00","hex"),ec=re.from("f9fc00","hex"),tc=re.from("f97c00","hex"),rc=re.from("f98000","hex"),nc=Symbol("CBOR_LOOP_DETECT");class ic extends Bn.Transform{constructor(e){const t=Object.assign({},e,{readableObjectMode:!1,writableObjectMode:!0});super(t),this.canonical=t.canonical,this.encodeUndefined=t.encodeUndefined,this.disallowUndefinedKeys=!!t.disallowUndefinedKeys,this.dateType=null!=t.dateType?t.dateType.toLowerCase():"number","symbol"==typeof t.detectLoops?this.detectLoops=t.detectLoops:this.detectLoops=t.detectLoops?Symbol("CBOR_DETECT"):null,this.semanticTypes=[Array,this._pushArray,Date,this._pushDate,re,this._pushBuffer,Map,this._pushMap,rs,this._pushNoFilter,RegExp,this._pushRegexp,Set,this._pushSet,Us,this._pushBigNumber,ArrayBuffer,this._pushUint8Array,Uint8ClampedArray,this._pushUint8Array,Uint8Array,this._pushUint8Array,Uint16Array,this._pushArray,Uint32Array,this._pushArray,Int8Array,this._pushArray,Int16Array,this._pushArray,Int32Array,this._pushArray,Float32Array,this._pushFloat32Array,Float64Array,this._pushFloat64Array],or.Url&&this.semanticTypes.push(or.Url,this._pushUrl),or.URL&&this.semanticTypes.push(or.URL,this._pushURL);const r=t.genTypes||[];for(let e=0,t=r.length;e<t;e+=2)this.addSemanticType(r[e],r[e+1]);}_transform(e,t,r){return r(!1===this.pushAny(e)?new Error("Push Error"):void 0)}_flush(e){return e()}addSemanticType(e,t){for(let r=0,n=this.semanticTypes.length;r<n;r+=2){if(this.semanticTypes[r]===e){const e=this.semanticTypes[r+1];return this.semanticTypes[r+1]=t,e}}return this.semanticTypes.push(e,t),null}_pushUInt8(e){const t=re.allocUnsafe(1);return t.writeUInt8(e,0),this.push(t)}_pushUInt16BE(e){const t=re.allocUnsafe(2);return t.writeUInt16BE(e,0),this.push(t)}_pushUInt32BE(e){const t=re.allocUnsafe(4);return t.writeUInt32BE(e,0),this.push(t)}_pushFloatBE(e){const t=re.allocUnsafe(4);return t.writeFloatBE(e,0),this.push(t)}_pushDoubleBE(e){const t=re.allocUnsafe(8);return t.writeDoubleBE(e,0),this.push(t)}_pushNaN(){return this.push(Zs)}_pushInfinity(e){const t=e<0?ec:tc;return this.push(t)}_pushFloat(e){if(this.canonical){const t=re.allocUnsafe(2);if(Ga.writeHalf(t,e)&&Ga.parseHalf(t)===e)return this._pushUInt8(Ks)&&this.push(t)}return Math.fround(e)===e?this._pushUInt8($s)&&this._pushFloatBE(e):this._pushUInt8(Gs)&&this._pushDoubleBE(e)}_pushInt(e,t,r){const n=t<<5;switch(!1){case!(e<24):return this._pushUInt8(n|e);case!(e<=255):return this._pushUInt8(n|Hs.ONE)&&this._pushUInt8(e);case!(e<=65535):return this._pushUInt8(n|Hs.TWO)&&this._pushUInt16BE(e);case!(e<=4294967295):return this._pushUInt8(n|Hs.FOUR)&&this._pushUInt32BE(e);case!(e<=Number.MAX_SAFE_INTEGER):return this._pushUInt8(n|Hs.EIGHT)&&this._pushUInt32BE(Math.floor(e/zs))&&this._pushUInt32BE(e%zs);default:return t===Fs.NEG_INT?this._pushFloat(r):this._pushFloat(e)}}_pushIntNum(e){return Object.is(e,-0)?this.push(rc):e<0?this._pushInt(-e-1,Fs.NEG_INT,e):this._pushInt(e,Fs.POS_INT)}_pushNumber(e){switch(!1){case!isNaN(e):return this._pushNaN();case isFinite(e):return this._pushInfinity(e);case Math.round(e)!==e:return this._pushIntNum(e);default:return this._pushFloat(e)}}_pushString(e){const t=re.byteLength(e,"utf8");return this._pushInt(t,Fs.UTF8_STRING)&&this.push(e,"utf8")}_pushBoolean(e){return this._pushUInt8(e?Js:Ws)}_pushUndefined(e){switch(typeof this.encodeUndefined){case"undefined":return this._pushUInt8(Xs);case"function":return this.pushAny(this.encodeUndefined.call(this,e));case"object":if(Be(this.encodeUndefined))return this.push(this.encodeUndefined)}return this.pushAny(this.encodeUndefined)}_pushNull(e){return this._pushUInt8(Ys)}_pushArray(e,t){const r=t.length;if(!e._pushInt(r,Fs.ARRAY))return !1;for(let n=0;n<r;n++)if(!e.pushAny(t[n]))return !1;return !0}_pushTag(e){return this._pushInt(e,Fs.TAG)}_pushDate(e,t){switch(e.dateType){case"string":return e._pushTag(qs.DATE_STRING)&&e._pushString(t.toISOString());case"int":case"integer":return e._pushTag(qs.DATE_EPOCH)&&e._pushIntNum(Math.round(t/1e3));case"float":return e._pushTag(qs.DATE_EPOCH)&&e._pushFloat(t/1e3);case"number":default:return e._pushTag(qs.DATE_EPOCH)&&e.pushAny(t/1e3)}}_pushBuffer(e,t){return e._pushInt(t.length,Fs.BYTE_STRING)&&e.push(t)}_pushNoFilter(e,t){return e._pushBuffer(e,t.slice())}_pushRegexp(e,t){return e._pushTag(qs.REGEXP)&&e.pushAny(t.source)}_pushSet(e,t){if(!e._pushInt(t.size,Fs.ARRAY))return !1;for(const r of t)if(!e.pushAny(r))return !1;return !0}_pushUrl(e,t){return e._pushTag(qs.URI)&&e.pushAny(t.format())}_pushURL(e,t){return e._pushTag(qs.URI)&&e.pushAny(t.toString())}_pushBigint(e){let t=qs.POS_BIGINT;e.isNegative()&&(e=e.negated().minus(1),t=qs.NEG_BIGINT);let r=e.toString(16);r.length%2&&(r="0"+r);const n=re.from(r,"hex");return this._pushTag(t)&&this._pushBuffer(this,n)}_pushJSBigint(e){let t=qs.POS_BIGINT;e<0&&(e=-e+BigInt("-1"),t=qs.NEG_BIGINT);let r=e.toString(16);r.length%2&&(r="0"+r);const n=re.from(r,"hex");return this._pushTag(t)&&this._pushBuffer(this,n)}_pushBigNumber(e,t){if(t.isNaN())return e._pushNaN();if(!t.isFinite())return e._pushInfinity(t.isNegative()?-1/0:1/0);if(t.isInteger())return e._pushBigint(t);if(!e._pushTag(qs.DECIMAL_FRAC)||!e._pushInt(2,Fs.ARRAY))return !1;const r=t.decimalPlaces(),n=t.times(new Us(10).pow(r));return !!e._pushIntNum(-r)&&(n.abs().isLessThan(Qs)?e._pushIntNum(n.toNumber()):e._pushBigint(n))}_pushMap(e,t){if(!e._pushInt(t.size,Fs.MAP))return !1;if(e.canonical){const r=[...t.entries()],n=new ic(this),i=new rs({highWaterMark:this.readableHighWaterMark});n.pipe(i),r.sort(([e],[t])=>{n.pushAny(e);const r=i.read();n.pushAny(t);const o=i.read();return r.compare(o)});for(const[t,n]of r){if(e.disallowUndefinedKeys&&void 0===t)throw new Error("Invalid Map key: undefined");if(!e.pushAny(t)||!e.pushAny(n))return !1}}else for(const[r,n]of t){if(e.disallowUndefinedKeys&&void 0===r)throw new Error("Invalid Map key: undefined");if(!e.pushAny(r)||!e.pushAny(n))return !1}return !0}_pushUint8Array(e,t){return e._pushBuffer(e,re.from(t))}_pushFloat32Array(e,t){const r=t.length;if(!e._pushInt(r,Fs.ARRAY))return !1;for(let n=0;n<r;n++)if(!e._pushUInt8($s)||!e._pushFloatBE(t[n]))return !1;return !0}_pushFloat64Array(e,t){const r=t.length;if(!e._pushInt(r,Fs.ARRAY))return !1;for(let n=0;n<r;n++)if(!e._pushUInt8(Gs)||!e._pushDoubleBE(t[n]))return !1;return !0}removeLoopDetectors(e){if(!this.detectLoops||"object"!=typeof e||!e)return !1;const t=e[nc];if(!t||t!==this.detectLoops)return !1;if(delete e[nc],Array.isArray(e))for(const t of e)this.removeLoopDetectors(t);else for(const t in e)this.removeLoopDetectors(e[t]);return !0}_pushObject(e){if(!e)return this._pushNull(e);if(this.detectLoops){if(e[nc]===this.detectLoops)throw new Error("Loop detected while CBOR encoding");e[nc]=this.detectLoops;}const t=e.encodeCBOR;if("function"==typeof t)return t.call(e,this);for(let t=0,r=this.semanticTypes.length;t<r;t+=2){if(e instanceof this.semanticTypes[t])return this.semanticTypes[t+1].call(e,this,e)}const r=Object.keys(e),n={};if(this.canonical&&r.sort((e,t)=>{const r=n[e]||(n[e]=ic.encode(e)),i=n[t]||(n[t]=ic.encode(t));return r.compare(i)}),!this._pushInt(r.length,Fs.MAP))return !1;let i;for(let t=0,o=r.length;t<o;t++){const o=r[t];if(this.canonical&&(i=n[o])){if(!this.push(i))return !1}else if(!this._pushString(o))return !1;if(!this.pushAny(e[o]))return !1}return !0}pushAny(e){switch(typeof e){case"number":return this._pushNumber(e);case"bigint":return this._pushJSBigint(e);case"string":return this._pushString(e);case"boolean":return this._pushBoolean(e);case"undefined":return this._pushUndefined(e);case"object":return this._pushObject(e);case"symbol":switch(e){case Vs.NULL:return this._pushNull(null);case Vs.UNDEFINED:return this._pushUndefined(void 0);default:throw new Error("Unknown symbol: "+e.toString())}default:throw new Error("Unknown type: "+typeof e+", "+(e?e.toString():""))}}_pushAny(e){return this.pushAny(e)}_encodeAll(e){const t=new rs({highWaterMark:this.readableHighWaterMark});this.pipe(t);for(const t of e)this.pushAny(t);return this.end(),t.read()}static encode(...e){return (new ic)._encodeAll(e)}static encodeCanonical(...e){return new ic({canonical:!0})._encodeAll(e)}static encodeOne(e,t){return new ic(t)._encodeAll([e])}static encodeAsync(e,t){return new Promise((r,n)=>{const i=[],o=new ic(t);o.on("data",e=>i.push(e)),o.on("error",n),o.on("finish",()=>r(re.concat(i))),o.pushAny(e),o.end();})}}var oc=ic;const ac=$a.MT;class sc extends Map{constructor(e){super(e);}static _encode(e){return oc.encodeCanonical(e).toString("base64")}static _decode(e){return ks.decodeFirstSync(e,"base64")}get(e){return super.get(sc._encode(e))}set(e,t){return super.set(sc._encode(e),t)}delete(e){return super.delete(sc._encode(e))}has(e){return super.has(sc._encode(e))}*keys(){for(const e of super.keys())yield sc._decode(e);}*entries(){for(const e of super.entries())yield [sc._decode(e[0]),e[1]];}[Symbol.iterator](){return this.entries()}forEach(e,t){if("function"!=typeof e)throw new TypeError("Must be function");for(const t of super.entries())e.call(this,t[1],sc._decode(t[0]),this);}encodeCBOR(e){if(!e._pushInt(this.size,ac.MAP))return !1;if(e.canonical){const t=Array.from(super.entries()).map(e=>[re.from(e[0],"base64"),e[1]]);t.sort((e,t)=>e[0].compare(t[0]));for(const r of t)if(!e.push(r[0])||!e.pushAny(r[1]))return !1}else for(const t of super.entries())if(!e.push(re.from(t[0],"base64"))||!e.pushAny(t[1]))return !1;return !0}}var cc=sc,uc=Yn((function(e,t){t.Commented=Ns,t.Diagnose=Bs,t.Decoder=ks,t.Encoder=oc,t.Simple=Qa,t.Tagged=ls,t.Map=cc,t.comment=t.Commented.comment,t.decodeAll=t.Decoder.decodeAll,t.decodeFirst=t.Decoder.decodeFirst,t.decodeAllSync=t.Decoder.decodeAllSync,t.decodeFirstSync=t.Decoder.decodeFirstSync,t.diagnose=t.Diagnose.diagnose,t.encode=t.Encoder.encode,t.encodeCanonical=t.Encoder.encodeCanonical,t.encodeOne=t.Encoder.encodeOne,t.encodeAsync=t.Encoder.encodeAsync,t.decode=t.Decoder.decodeFirstSync,t.leveldb={decode:t.Decoder.decodeAllSync,encode:t.Encoder.encode,buffer:!0,name:"cbor"},t.hasBigInt=Ga.hasBigInt;}));uc.Commented,uc.Diagnose,uc.Decoder,uc.Encoder,uc.Simple,uc.Tagged,uc.Map,uc.comment,uc.decodeAll,uc.decodeFirst,uc.decodeAllSync,uc.decodeFirstSync,uc.diagnose,uc.encode,uc.encodeCanonical,uc.encodeOne,uc.encodeAsync,uc.decode,uc.leveldb,uc.hasBigInt;var lc=class{constructor(e,t,r,n){this.name=e,this.code=t,this.alphabet=n,r&&n&&(this.engine=r(n));}encode(e){return this.engine.encode(e)}decode(e){return this.engine.decode(e)}isImplemented(){return this.engine}},fc=Yn((function(e,t){var r=Fe.Buffer;function n(e,t){for(var r in e)t[r]=e[r];}function i(e,t,n){return r(e,t,n)}r.from&&r.alloc&&r.allocUnsafe&&r.allocUnsafeSlow?e.exports=Fe:(n(Fe,t),t.Buffer=i),i.prototype=Object.create(r.prototype),n(r,i),i.from=function(e,t,n){if("number"==typeof e)throw new TypeError("Argument must not be a number");return r(e,t,n)},i.alloc=function(e,t,n){if("number"!=typeof e)throw new TypeError("Argument must be a number");var i=r(e);return void 0!==t?"string"==typeof n?i.fill(t,n):i.fill(t):i.fill(0),i},i.allocUnsafe=function(e){if("number"!=typeof e)throw new TypeError("Argument must be a number");return r(e)},i.allocUnsafeSlow=function(e){if("number"!=typeof e)throw new TypeError("Argument must be a number");return Fe.SlowBuffer(e)};})),hc=(fc.Buffer,fc.Buffer),dc=function(e){for(var t={},r=e.length,n=e.charAt(0),i=0;i<e.length;i++){var o=e.charAt(i);if(void 0!==t[o])throw new TypeError(o+" is ambiguous");t[o]=i;}function a(e){if("string"!=typeof e)throw new TypeError("Expected String");if(0===e.length)return hc.allocUnsafe(0);for(var i=[0],o=0;o<e.length;o++){var a=t[e[o]];if(void 0===a)return;for(var s=0,c=a;s<i.length;++s)c+=i[s]*r,i[s]=255&c,c>>=8;for(;c>0;)i.push(255&c),c>>=8;}for(var u=0;e[u]===n&&u<e.length-1;++u)i.push(0);return hc.from(i.reverse())}return {encode:function(t){if(0===t.length)return "";for(var i=[0],o=0;o<t.length;++o){for(var a=0,s=t[o];a<i.length;++a)s+=i[a]<<8,i[a]=s%r,s=s/r|0;for(;s>0;)i.push(s%r),s=s/r|0;}for(var c="",u=0;0===t[u]&&u<t.length-1;++u)c+=n;for(var l=i.length-1;l>=0;--l)c+=e[i[l]];return c},decodeUnsafe:a,decode:function(e){var t=a(e);if(t)return t;throw new Error("Non-base"+r+" character")}}};function pc(e,t){let r=e.byteLength,n=new Uint8Array(e),i=t.indexOf("=")===t.length-1;i&&(t=t.substring(0,t.length-2));let o=0,a=0,s="";for(let e=0;e<r;e++)for(a=a<<8|n[e],o+=8;o>=5;)s+=t[a>>>o-5&31],o-=5;if(o>0&&(s+=t[a<<5-o&31]),i)for(;s.length%8!=0;)s+="=";return s}var mc=function(e){return {encode:t=>pc("string"==typeof t?re.from(t):t,e),decode(t){for(let r of t)if(e.indexOf(r)<0)throw new Error("invalid base32 character");return function(e,t){let r=(e=e.replace(new RegExp("=","g"),"")).length,n=0,i=0,o=0,a=new Uint8Array(5*r/8|0);for(let s=0;s<r;s++)i=i<<5|t.indexOf(e[s]),n+=5,n>=8&&(a[o++]=i>>>n-8&255,n-=8);return a.buffer}(t,e)}}},vc=function(e){const t=e.indexOf("=")>-1,r=e.indexOf("-")>-1&&e.indexOf("_")>-1;return {encode(e){let n="";n="string"==typeof e?re.from(e).toString("base64"):e.toString("base64"),r&&(n=n.replace(/\+/g,"-").replace(/\//g,"_"));const i=n.indexOf("=");return i>0&&!t&&(n=n.substring(0,i)),n},decode(t){for(let r of t)if(e.indexOf(r)<0)throw new Error("invalid base64 character");return re.from(t,"base64")}}};const gc=[["base1","1","","1"],["base2","0",dc,"01"],["base8","7",dc,"01234567"],["base10","9",dc,"0123456789"],["base16","f",function(e){return {encode:e=>"string"==typeof e?re.from(e).toString("hex"):e.toString("hex"),decode(t){for(let r of t)if(e.indexOf(r)<0)throw new Error("invalid base16 character");return re.from(t,"hex")}}},"0123456789abcdef"],["base32","b",mc,"abcdefghijklmnopqrstuvwxyz234567"],["base32pad","c",mc,"abcdefghijklmnopqrstuvwxyz234567="],["base32hex","v",mc,"0123456789abcdefghijklmnopqrstuv"],["base32hexpad","t",mc,"0123456789abcdefghijklmnopqrstuv="],["base32z","h",mc,"ybndrfg8ejkmcpqxot1uwisza345h769"],["base58flickr","Z",dc,"123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"],["base58btc","z",dc,"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"],["base64","m",vc,"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"],["base64pad","M",vc,"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="],["base64url","u",vc,"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"],["base64urlpad","U",vc,"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_="]],yc=gc.reduce((e,t)=>(e[t[0]]=new lc(t[0],t[1],t[2],t[3]),e),{}),bc=gc.reduce((e,t)=>(e[t[1]]=yc[t[0]],e),{});var wc={names:yc,codes:bc},_c=Yn((function(e,t){(t=e.exports=n).encode=function(e,t){const r=i(e);return n(r.name,re.from(r.encode(t)))},t.decode=function(e){Be(e)&&(e=e.toString());const t=e.substring(0,1);"string"==typeof(e=e.substring(1,e.length))&&(e=re.from(e));const r=i(t);return re.from(r.decode(e.toString()))},t.isEncoded=function(e){Be(e)&&(e=e.toString());if("[object String]"!==Object.prototype.toString.call(e))return !1;const t=e.substring(0,1);try{return i(t).name}catch(e){return !1}},t.names=Object.freeze(Object.keys(wc.names)),t.codes=Object.freeze(Object.keys(wc.codes));const r=new Error("Unsupported encoding");function n(e,t){if(!t)throw new Error("requires an encoded buffer");const r=i(e),n=re.from(r.code);return function(e,t){i(e).decode(t.toString());}(r.name,t),re.concat([n,t])}function i(e){let t;if(wc.names[e])t=wc.names[e];else {if(!wc.codes[e])throw r;t=wc.codes[e];}if(!t.isImplemented())throw new Error("Base "+e+" is not implemented yet");return t}})),Sc=(_c.encode,_c.decode,_c.isEncoded,_c.names,_c.codes,Yn((function(e,t){(function(){var r="Expected a function",n="__lodash_placeholder__",i=[["ary",128],["bind",1],["bindKey",2],["curry",8],["curryRight",16],["flip",512],["partial",32],["partialRight",64],["rearg",256]],o="[object Arguments]",a="[object Array]",s="[object Boolean]",c="[object Date]",u="[object Error]",l="[object Function]",f="[object GeneratorFunction]",h="[object Map]",d="[object Number]",p="[object Object]",m="[object RegExp]",v="[object Set]",g="[object String]",y="[object Symbol]",b="[object WeakMap]",w="[object ArrayBuffer]",_="[object DataView]",S="[object Float32Array]",E="[object Float64Array]",x="[object Int8Array]",I="[object Int16Array]",k="[object Int32Array]",P="[object Uint8Array]",O="[object Uint16Array]",T="[object Uint32Array]",A=/\b__p \+= '';/g,C=/\b(__p \+=) '' \+/g,R=/(__e\(.*?\)|\b__t\)) \+\n'';/g,N=/&(?:amp|lt|gt|quot|#39);/g,L=/[&<>"']/g,M=RegExp(N.source),j=RegExp(L.source),D=/<%-([\s\S]+?)%>/g,B=/<%([\s\S]+?)%>/g,U=/<%=([\s\S]+?)%>/g,F=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,H=/^\w*$/,z=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,V=/[\\^$.*+?()[\]{}|]/g,q=RegExp(V.source),K=/^\s+|\s+$/g,$=/^\s+/,G=/\s+$/,J=/\{(?:\n\/\* \[wrapped with .+\] \*\/)?\n?/,W=/\{\n\/\* \[wrapped with (.+)\] \*/,X=/,? & /,Y=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,Q=/\\(\\)?/g,Z=/\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,ee=/\w*$/,te=/^[-+]0x[0-9a-f]+$/i,re=/^0b[01]+$/i,ne=/^\[object .+?Constructor\]$/,ie=/^0o[0-7]+$/i,oe=/^(?:0|[1-9]\d*)$/,ae=/[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g,se=/($^)/,ce=/['\n\r\u2028\u2029\\]/g,ue="\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff",le="\\xac\\xb1\\xd7\\xf7\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf\\u2000-\\u206f \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",fe="[\\ud800-\\udfff]",he="["+le+"]",de="["+ue+"]",pe="\\d+",me="[\\u2700-\\u27bf]",ve="[a-z\\xdf-\\xf6\\xf8-\\xff]",ge="[^\\ud800-\\udfff"+le+pe+"\\u2700-\\u27bfa-z\\xdf-\\xf6\\xf8-\\xffA-Z\\xc0-\\xd6\\xd8-\\xde]",ye="\\ud83c[\\udffb-\\udfff]",be="[^\\ud800-\\udfff]",we="(?:\\ud83c[\\udde6-\\uddff]){2}",_e="[\\ud800-\\udbff][\\udc00-\\udfff]",Se="[A-Z\\xc0-\\xd6\\xd8-\\xde]",Ee="(?:"+ve+"|"+ge+")",xe="(?:"+Se+"|"+ge+")",Ie="(?:"+de+"|"+ye+")"+"?",ke="[\\ufe0e\\ufe0f]?"+Ie+("(?:\\u200d(?:"+[be,we,_e].join("|")+")[\\ufe0e\\ufe0f]?"+Ie+")*"),Pe="(?:"+[me,we,_e].join("|")+")"+ke,Oe="(?:"+[be+de+"?",de,we,_e,fe].join("|")+")",Te=RegExp("['’]","g"),Ae=RegExp(de,"g"),Ce=RegExp(ye+"(?="+ye+")|"+Oe+ke,"g"),Re=RegExp([Se+"?"+ve+"+(?:['’](?:d|ll|m|re|s|t|ve))?(?="+[he,Se,"$"].join("|")+")",xe+"+(?:['’](?:D|LL|M|RE|S|T|VE))?(?="+[he,Se+Ee,"$"].join("|")+")",Se+"?"+Ee+"+(?:['’](?:d|ll|m|re|s|t|ve))?",Se+"+(?:['’](?:D|LL|M|RE|S|T|VE))?","\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])","\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])",pe,Pe].join("|"),"g"),Ne=RegExp("[\\u200d\\ud800-\\udfff"+ue+"\\ufe0e\\ufe0f]"),Le=/[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,Me=["Array","Buffer","DataView","Date","Error","Float32Array","Float64Array","Function","Int8Array","Int16Array","Int32Array","Map","Math","Object","Promise","RegExp","Set","String","Symbol","TypeError","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","WeakMap","_","clearTimeout","isFinite","parseInt","setTimeout"],je=-1,De={};De[S]=De[E]=De[x]=De[I]=De[k]=De[P]=De["[object Uint8ClampedArray]"]=De[O]=De[T]=!0,De[o]=De[a]=De[w]=De[s]=De[_]=De[c]=De[u]=De[l]=De[h]=De[d]=De[p]=De[m]=De[v]=De[g]=De[b]=!1;var Be={};Be[o]=Be[a]=Be[w]=Be[_]=Be[s]=Be[c]=Be[S]=Be[E]=Be[x]=Be[I]=Be[k]=Be[h]=Be[d]=Be[p]=Be[m]=Be[v]=Be[g]=Be[y]=Be[P]=Be["[object Uint8ClampedArray]"]=Be[O]=Be[T]=!0,Be[u]=Be[l]=Be[b]=!1;var Ue={"\\":"\\","'":"'","\n":"n","\r":"r","\u2028":"u2028","\u2029":"u2029"},Fe=parseFloat,He=parseInt,ze="object"==typeof Wn&&Wn&&Wn.Object===Object&&Wn,Ve="object"==typeof self&&self&&self.Object===Object&&self,qe=ze||Ve||Function("return this")(),Ke=t&&!t.nodeType&&t,$e=Ke&&e&&!e.nodeType&&e,Ge=$e&&$e.exports===Ke,Je=Ge&&ze.process,We=function(){try{var e=$e&&$e.require&&$e.require("util").types;return e||Je&&Je.binding&&Je.binding("util")}catch(e){}}(),Xe=We&&We.isArrayBuffer,Ye=We&&We.isDate,Qe=We&&We.isMap,Ze=We&&We.isRegExp,et=We&&We.isSet,tt=We&&We.isTypedArray;function rt(e,t,r){switch(r.length){case 0:return e.call(t);case 1:return e.call(t,r[0]);case 2:return e.call(t,r[0],r[1]);case 3:return e.call(t,r[0],r[1],r[2])}return e.apply(t,r)}function nt(e,t,r,n){for(var i=-1,o=null==e?0:e.length;++i<o;){var a=e[i];t(n,a,r(a),e);}return n}function it(e,t){for(var r=-1,n=null==e?0:e.length;++r<n&&!1!==t(e[r],r,e););return e}function ot(e,t){for(var r=null==e?0:e.length;r--&&!1!==t(e[r],r,e););return e}function at(e,t){for(var r=-1,n=null==e?0:e.length;++r<n;)if(!t(e[r],r,e))return !1;return !0}function st(e,t){for(var r=-1,n=null==e?0:e.length,i=0,o=[];++r<n;){var a=e[r];t(a,r,e)&&(o[i++]=a);}return o}function ct(e,t){return !!(null==e?0:e.length)&&yt(e,t,0)>-1}function ut(e,t,r){for(var n=-1,i=null==e?0:e.length;++n<i;)if(r(t,e[n]))return !0;return !1}function lt(e,t){for(var r=-1,n=null==e?0:e.length,i=Array(n);++r<n;)i[r]=t(e[r],r,e);return i}function ft(e,t){for(var r=-1,n=t.length,i=e.length;++r<n;)e[i+r]=t[r];return e}function ht(e,t,r,n){var i=-1,o=null==e?0:e.length;for(n&&o&&(r=e[++i]);++i<o;)r=t(r,e[i],i,e);return r}function dt(e,t,r,n){var i=null==e?0:e.length;for(n&&i&&(r=e[--i]);i--;)r=t(r,e[i],i,e);return r}function pt(e,t){for(var r=-1,n=null==e?0:e.length;++r<n;)if(t(e[r],r,e))return !0;return !1}var mt=St("length");function vt(e,t,r){var n;return r(e,(function(e,r,i){if(t(e,r,i))return n=r,!1})),n}function gt(e,t,r,n){for(var i=e.length,o=r+(n?1:-1);n?o--:++o<i;)if(t(e[o],o,e))return o;return -1}function yt(e,t,r){return t==t?function(e,t,r){var n=r-1,i=e.length;for(;++n<i;)if(e[n]===t)return n;return -1}(e,t,r):gt(e,wt,r)}function bt(e,t,r,n){for(var i=r-1,o=e.length;++i<o;)if(n(e[i],t))return i;return -1}function wt(e){return e!=e}function _t(e,t){var r=null==e?0:e.length;return r?It(e,t)/r:NaN}function St(e){return function(t){return null==t?void 0:t[e]}}function Et(e){return function(t){return null==e?void 0:e[t]}}function xt(e,t,r,n,i){return i(e,(function(e,i,o){r=n?(n=!1,e):t(r,e,i,o);})),r}function It(e,t){for(var r,n=-1,i=e.length;++n<i;){var o=t(e[n]);void 0!==o&&(r=void 0===r?o:r+o);}return r}function kt(e,t){for(var r=-1,n=Array(e);++r<e;)n[r]=t(r);return n}function Pt(e){return function(t){return e(t)}}function Ot(e,t){return lt(t,(function(t){return e[t]}))}function Tt(e,t){return e.has(t)}function At(e,t){for(var r=-1,n=e.length;++r<n&&yt(t,e[r],0)>-1;);return r}function Ct(e,t){for(var r=e.length;r--&&yt(t,e[r],0)>-1;);return r}function Rt(e,t){for(var r=e.length,n=0;r--;)e[r]===t&&++n;return n}var Nt=Et({"À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A","à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","Ç":"C","ç":"c","Ð":"D","ð":"d","È":"E","É":"E","Ê":"E","Ë":"E","è":"e","é":"e","ê":"e","ë":"e","Ì":"I","Í":"I","Î":"I","Ï":"I","ì":"i","í":"i","î":"i","ï":"i","Ñ":"N","ñ":"n","Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o","Ù":"U","Ú":"U","Û":"U","Ü":"U","ù":"u","ú":"u","û":"u","ü":"u","Ý":"Y","ý":"y","ÿ":"y","Æ":"Ae","æ":"ae","Þ":"Th","þ":"th","ß":"ss","Ā":"A","Ă":"A","Ą":"A","ā":"a","ă":"a","ą":"a","Ć":"C","Ĉ":"C","Ċ":"C","Č":"C","ć":"c","ĉ":"c","ċ":"c","č":"c","Ď":"D","Đ":"D","ď":"d","đ":"d","Ē":"E","Ĕ":"E","Ė":"E","Ę":"E","Ě":"E","ē":"e","ĕ":"e","ė":"e","ę":"e","ě":"e","Ĝ":"G","Ğ":"G","Ġ":"G","Ģ":"G","ĝ":"g","ğ":"g","ġ":"g","ģ":"g","Ĥ":"H","Ħ":"H","ĥ":"h","ħ":"h","Ĩ":"I","Ī":"I","Ĭ":"I","Į":"I","İ":"I","ĩ":"i","ī":"i","ĭ":"i","į":"i","ı":"i","Ĵ":"J","ĵ":"j","Ķ":"K","ķ":"k","ĸ":"k","Ĺ":"L","Ļ":"L","Ľ":"L","Ŀ":"L","Ł":"L","ĺ":"l","ļ":"l","ľ":"l","ŀ":"l","ł":"l","Ń":"N","Ņ":"N","Ň":"N","Ŋ":"N","ń":"n","ņ":"n","ň":"n","ŋ":"n","Ō":"O","Ŏ":"O","Ő":"O","ō":"o","ŏ":"o","ő":"o","Ŕ":"R","Ŗ":"R","Ř":"R","ŕ":"r","ŗ":"r","ř":"r","Ś":"S","Ŝ":"S","Ş":"S","Š":"S","ś":"s","ŝ":"s","ş":"s","š":"s","Ţ":"T","Ť":"T","Ŧ":"T","ţ":"t","ť":"t","ŧ":"t","Ũ":"U","Ū":"U","Ŭ":"U","Ů":"U","Ű":"U","Ų":"U","ũ":"u","ū":"u","ŭ":"u","ů":"u","ű":"u","ų":"u","Ŵ":"W","ŵ":"w","Ŷ":"Y","ŷ":"y","Ÿ":"Y","Ź":"Z","Ż":"Z","Ž":"Z","ź":"z","ż":"z","ž":"z","Ĳ":"IJ","ĳ":"ij","Œ":"Oe","œ":"oe","ŉ":"'n","ſ":"s"}),Lt=Et({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"});function Mt(e){return "\\"+Ue[e]}function jt(e){return Ne.test(e)}function Dt(e){var t=-1,r=Array(e.size);return e.forEach((function(e,n){r[++t]=[n,e];})),r}function Bt(e,t){return function(r){return e(t(r))}}function Ut(e,t){for(var r=-1,i=e.length,o=0,a=[];++r<i;){var s=e[r];s!==t&&s!==n||(e[r]=n,a[o++]=r);}return a}function Ft(e){var t=-1,r=Array(e.size);return e.forEach((function(e){r[++t]=e;})),r}function Ht(e){var t=-1,r=Array(e.size);return e.forEach((function(e){r[++t]=[e,e];})),r}function zt(e){return jt(e)?function(e){var t=Ce.lastIndex=0;for(;Ce.test(e);)++t;return t}(e):mt(e)}function Vt(e){return jt(e)?function(e){return e.match(Ce)||[]}(e):function(e){return e.split("")}(e)}var qt=Et({"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'"});var Kt=function e(t){var ue,le=(t=null==t?qe:Kt.defaults(qe.Object(),t,Kt.pick(qe,Me))).Array,fe=t.Date,he=t.Error,de=t.Function,pe=t.Math,me=t.Object,ve=t.RegExp,ge=t.String,ye=t.TypeError,be=le.prototype,we=de.prototype,_e=me.prototype,Se=t["__core-js_shared__"],Ee=we.toString,xe=_e.hasOwnProperty,Ie=0,ke=(ue=/[^.]+$/.exec(Se&&Se.keys&&Se.keys.IE_PROTO||""))?"Symbol(src)_1."+ue:"",Pe=_e.toString,Oe=Ee.call(me),Ce=qe._,Ne=ve("^"+Ee.call(xe).replace(V,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$"),Ue=Ge?t.Buffer:void 0,ze=t.Symbol,Ve=t.Uint8Array,Ke=Ue?Ue.allocUnsafe:void 0,$e=Bt(me.getPrototypeOf,me),Je=me.create,We=_e.propertyIsEnumerable,mt=be.splice,Et=ze?ze.isConcatSpreadable:void 0,$t=ze?ze.iterator:void 0,Gt=ze?ze.toStringTag:void 0,Jt=function(){try{var e=Zi(me,"defineProperty");return e({},"",{}),e}catch(e){}}(),Wt=t.clearTimeout!==qe.clearTimeout&&t.clearTimeout,Xt=fe&&fe.now!==qe.Date.now&&fe.now,Yt=t.setTimeout!==qe.setTimeout&&t.setTimeout,Qt=pe.ceil,Zt=pe.floor,er=me.getOwnPropertySymbols,tr=Ue?Ue.isBuffer:void 0,rr=t.isFinite,nr=be.join,ir=Bt(me.keys,me),or=pe.max,ar=pe.min,sr=fe.now,cr=t.parseInt,ur=pe.random,lr=be.reverse,fr=Zi(t,"DataView"),hr=Zi(t,"Map"),dr=Zi(t,"Promise"),pr=Zi(t,"Set"),mr=Zi(t,"WeakMap"),vr=Zi(me,"create"),gr=mr&&new mr,yr={},br=Po(fr),wr=Po(hr),_r=Po(dr),Sr=Po(pr),Er=Po(mr),xr=ze?ze.prototype:void 0,Ir=xr?xr.valueOf:void 0,kr=xr?xr.toString:void 0;function Pr(e){if(qa(e)&&!Na(e)&&!(e instanceof Cr)){if(e instanceof Ar)return e;if(xe.call(e,"__wrapped__"))return Oo(e)}return new Ar(e)}var Or=function(){function e(){}return function(t){if(!Va(t))return {};if(Je)return Je(t);e.prototype=t;var r=new e;return e.prototype=void 0,r}}();function Tr(){}function Ar(e,t){this.__wrapped__=e,this.__actions__=[],this.__chain__=!!t,this.__index__=0,this.__values__=void 0;}function Cr(e){this.__wrapped__=e,this.__actions__=[],this.__dir__=1,this.__filtered__=!1,this.__iteratees__=[],this.__takeCount__=4294967295,this.__views__=[];}function Rr(e){var t=-1,r=null==e?0:e.length;for(this.clear();++t<r;){var n=e[t];this.set(n[0],n[1]);}}function Nr(e){var t=-1,r=null==e?0:e.length;for(this.clear();++t<r;){var n=e[t];this.set(n[0],n[1]);}}function Lr(e){var t=-1,r=null==e?0:e.length;for(this.clear();++t<r;){var n=e[t];this.set(n[0],n[1]);}}function Mr(e){var t=-1,r=null==e?0:e.length;for(this.__data__=new Lr;++t<r;)this.add(e[t]);}function jr(e){var t=this.__data__=new Nr(e);this.size=t.size;}function Dr(e,t){var r=Na(e),n=!r&&Ra(e),i=!r&&!n&&Da(e),o=!r&&!n&&!i&&Qa(e),a=r||n||i||o,s=a?kt(e.length,ge):[],c=s.length;for(var u in e)!t&&!xe.call(e,u)||a&&("length"==u||i&&("offset"==u||"parent"==u)||o&&("buffer"==u||"byteLength"==u||"byteOffset"==u)||ao(u,c))||s.push(u);return s}function Br(e){var t=e.length;return t?e[jn(0,t-1)]:void 0}function Ur(e,t){return xo(gi(e),Jr(t,0,e.length))}function Fr(e){return xo(gi(e))}function Hr(e,t,r){(void 0===r||Ta(e[t],r))&&(void 0!==r||t in e)||$r(e,t,r);}function zr(e,t,r){var n=e[t];xe.call(e,t)&&Ta(n,r)&&(void 0!==r||t in e)||$r(e,t,r);}function Vr(e,t){for(var r=e.length;r--;)if(Ta(e[r][0],t))return r;return -1}function qr(e,t,r,n){return Zr(e,(function(e,i,o){t(n,e,r(e),o);})),n}function Kr(e,t){return e&&yi(t,ws(t),e)}function $r(e,t,r){"__proto__"==t&&Jt?Jt(e,t,{configurable:!0,enumerable:!0,value:r,writable:!0}):e[t]=r;}function Gr(e,t){for(var r=-1,n=t.length,i=le(n),o=null==e;++r<n;)i[r]=o?void 0:ms(e,t[r]);return i}function Jr(e,t,r){return e==e&&(void 0!==r&&(e=e<=r?e:r),void 0!==t&&(e=e>=t?e:t)),e}function Wr(e,t,r,n,i,a){var u,b=1&t,A=2&t,C=4&t;if(r&&(u=i?r(e,n,i,a):r(e)),void 0!==u)return u;if(!Va(e))return e;var R=Na(e);if(R){if(u=function(e){var t=e.length,r=new e.constructor(t);t&&"string"==typeof e[0]&&xe.call(e,"index")&&(r.index=e.index,r.input=e.input);return r}(e),!b)return gi(e,u)}else {var N=ro(e),L=N==l||N==f;if(Da(e))return fi(e,b);if(N==p||N==o||L&&!i){if(u=A||L?{}:io(e),!b)return A?function(e,t){return yi(e,to(e),t)}(e,function(e,t){return e&&yi(t,_s(t),e)}(u,e)):function(e,t){return yi(e,eo(e),t)}(e,Kr(u,e))}else {if(!Be[N])return i?e:{};u=function(e,t,r){var n=e.constructor;switch(t){case w:return hi(e);case s:case c:return new n(+e);case _:return function(e,t){var r=t?hi(e.buffer):e.buffer;return new e.constructor(r,e.byteOffset,e.byteLength)}(e,r);case S:case E:case x:case I:case k:case P:case"[object Uint8ClampedArray]":case O:case T:return di(e,r);case h:return new n;case d:case g:return new n(e);case m:return function(e){var t=new e.constructor(e.source,ee.exec(e));return t.lastIndex=e.lastIndex,t}(e);case v:return new n;case y:return i=e,Ir?me(Ir.call(i)):{}}var i;}(e,N,b);}}a||(a=new jr);var M=a.get(e);if(M)return M;a.set(e,u),Wa(e)?e.forEach((function(n){u.add(Wr(n,t,r,n,e,a));})):Ka(e)&&e.forEach((function(n,i){u.set(i,Wr(n,t,r,i,e,a));}));var j=R?void 0:(C?A?$i:Ki:A?_s:ws)(e);return it(j||e,(function(n,i){j&&(n=e[i=n]),zr(u,i,Wr(n,t,r,i,e,a));})),u}function Xr(e,t,r){var n=r.length;if(null==e)return !n;for(e=me(e);n--;){var i=r[n],o=t[i],a=e[i];if(void 0===a&&!(i in e)||!o(a))return !1}return !0}function Yr(e,t,n){if("function"!=typeof e)throw new ye(r);return wo((function(){e.apply(void 0,n);}),t)}function Qr(e,t,r,n){var i=-1,o=ct,a=!0,s=e.length,c=[],u=t.length;if(!s)return c;r&&(t=lt(t,Pt(r))),n?(o=ut,a=!1):t.length>=200&&(o=Tt,a=!1,t=new Mr(t));e:for(;++i<s;){var l=e[i],f=null==r?l:r(l);if(l=n||0!==l?l:0,a&&f==f){for(var h=u;h--;)if(t[h]===f)continue e;c.push(l);}else o(t,f,n)||c.push(l);}return c}Pr.templateSettings={escape:D,evaluate:B,interpolate:U,variable:"",imports:{_:Pr}},Pr.prototype=Tr.prototype,Pr.prototype.constructor=Pr,Ar.prototype=Or(Tr.prototype),Ar.prototype.constructor=Ar,Cr.prototype=Or(Tr.prototype),Cr.prototype.constructor=Cr,Rr.prototype.clear=function(){this.__data__=vr?vr(null):{},this.size=0;},Rr.prototype.delete=function(e){var t=this.has(e)&&delete this.__data__[e];return this.size-=t?1:0,t},Rr.prototype.get=function(e){var t=this.__data__;if(vr){var r=t[e];return "__lodash_hash_undefined__"===r?void 0:r}return xe.call(t,e)?t[e]:void 0},Rr.prototype.has=function(e){var t=this.__data__;return vr?void 0!==t[e]:xe.call(t,e)},Rr.prototype.set=function(e,t){var r=this.__data__;return this.size+=this.has(e)?0:1,r[e]=vr&&void 0===t?"__lodash_hash_undefined__":t,this},Nr.prototype.clear=function(){this.__data__=[],this.size=0;},Nr.prototype.delete=function(e){var t=this.__data__,r=Vr(t,e);return !(r<0)&&(r==t.length-1?t.pop():mt.call(t,r,1),--this.size,!0)},Nr.prototype.get=function(e){var t=this.__data__,r=Vr(t,e);return r<0?void 0:t[r][1]},Nr.prototype.has=function(e){return Vr(this.__data__,e)>-1},Nr.prototype.set=function(e,t){var r=this.__data__,n=Vr(r,e);return n<0?(++this.size,r.push([e,t])):r[n][1]=t,this},Lr.prototype.clear=function(){this.size=0,this.__data__={hash:new Rr,map:new(hr||Nr),string:new Rr};},Lr.prototype.delete=function(e){var t=Yi(this,e).delete(e);return this.size-=t?1:0,t},Lr.prototype.get=function(e){return Yi(this,e).get(e)},Lr.prototype.has=function(e){return Yi(this,e).has(e)},Lr.prototype.set=function(e,t){var r=Yi(this,e),n=r.size;return r.set(e,t),this.size+=r.size==n?0:1,this},Mr.prototype.add=Mr.prototype.push=function(e){return this.__data__.set(e,"__lodash_hash_undefined__"),this},Mr.prototype.has=function(e){return this.__data__.has(e)},jr.prototype.clear=function(){this.__data__=new Nr,this.size=0;},jr.prototype.delete=function(e){var t=this.__data__,r=t.delete(e);return this.size=t.size,r},jr.prototype.get=function(e){return this.__data__.get(e)},jr.prototype.has=function(e){return this.__data__.has(e)},jr.prototype.set=function(e,t){var r=this.__data__;if(r instanceof Nr){var n=r.__data__;if(!hr||n.length<199)return n.push([e,t]),this.size=++r.size,this;r=this.__data__=new Lr(n);}return r.set(e,t),this.size=r.size,this};var Zr=_i(cn),en=_i(un,!0);function tn(e,t){var r=!0;return Zr(e,(function(e,n,i){return r=!!t(e,n,i)})),r}function rn(e,t,r){for(var n=-1,i=e.length;++n<i;){var o=e[n],a=t(o);if(null!=a&&(void 0===s?a==a&&!Ya(a):r(a,s)))var s=a,c=o;}return c}function nn(e,t){var r=[];return Zr(e,(function(e,n,i){t(e,n,i)&&r.push(e);})),r}function on(e,t,r,n,i){var o=-1,a=e.length;for(r||(r=oo),i||(i=[]);++o<a;){var s=e[o];t>0&&r(s)?t>1?on(s,t-1,r,n,i):ft(i,s):n||(i[i.length]=s);}return i}var an=Si(),sn=Si(!0);function cn(e,t){return e&&an(e,t,ws)}function un(e,t){return e&&sn(e,t,ws)}function ln(e,t){return st(t,(function(t){return Fa(e[t])}))}function fn(e,t){for(var r=0,n=(t=si(t,e)).length;null!=e&&r<n;)e=e[ko(t[r++])];return r&&r==n?e:void 0}function hn(e,t,r){var n=t(e);return Na(e)?n:ft(n,r(e))}function dn(e){return null==e?void 0===e?"[object Undefined]":"[object Null]":Gt&&Gt in me(e)?function(e){var t=xe.call(e,Gt),r=e[Gt];try{e[Gt]=void 0;var n=!0;}catch(e){}var i=Pe.call(e);n&&(t?e[Gt]=r:delete e[Gt]);return i}(e):function(e){return Pe.call(e)}(e)}function pn(e,t){return e>t}function mn(e,t){return null!=e&&xe.call(e,t)}function vn(e,t){return null!=e&&t in me(e)}function gn(e,t,r){for(var n=r?ut:ct,i=e[0].length,o=e.length,a=o,s=le(o),c=1/0,u=[];a--;){var l=e[a];a&&t&&(l=lt(l,Pt(t))),c=ar(l.length,c),s[a]=!r&&(t||i>=120&&l.length>=120)?new Mr(a&&l):void 0;}l=e[0];var f=-1,h=s[0];e:for(;++f<i&&u.length<c;){var d=l[f],p=t?t(d):d;if(d=r||0!==d?d:0,!(h?Tt(h,p):n(u,p,r))){for(a=o;--a;){var m=s[a];if(!(m?Tt(m,p):n(e[a],p,r)))continue e}h&&h.push(p),u.push(d);}}return u}function yn(e,t,r){var n=null==(e=vo(e,t=si(t,e)))?e:e[ko(Uo(t))];return null==n?void 0:rt(n,e,r)}function bn(e){return qa(e)&&dn(e)==o}function wn(e,t,r,n,i){return e===t||(null==e||null==t||!qa(e)&&!qa(t)?e!=e&&t!=t:function(e,t,r,n,i,l){var f=Na(e),b=Na(t),S=f?a:ro(e),E=b?a:ro(t),x=(S=S==o?p:S)==p,I=(E=E==o?p:E)==p,k=S==E;if(k&&Da(e)){if(!Da(t))return !1;f=!0,x=!1;}if(k&&!x)return l||(l=new jr),f||Qa(e)?Vi(e,t,r,n,i,l):function(e,t,r,n,i,o,a){switch(r){case _:if(e.byteLength!=t.byteLength||e.byteOffset!=t.byteOffset)return !1;e=e.buffer,t=t.buffer;case w:return !(e.byteLength!=t.byteLength||!o(new Ve(e),new Ve(t)));case s:case c:case d:return Ta(+e,+t);case u:return e.name==t.name&&e.message==t.message;case m:case g:return e==t+"";case h:var l=Dt;case v:var f=1&n;if(l||(l=Ft),e.size!=t.size&&!f)return !1;var p=a.get(e);if(p)return p==t;n|=2,a.set(e,t);var b=Vi(l(e),l(t),n,i,o,a);return a.delete(e),b;case y:if(Ir)return Ir.call(e)==Ir.call(t)}return !1}(e,t,S,r,n,i,l);if(!(1&r)){var P=x&&xe.call(e,"__wrapped__"),O=I&&xe.call(t,"__wrapped__");if(P||O){var T=P?e.value():e,A=O?t.value():t;return l||(l=new jr),i(T,A,r,n,l)}}if(!k)return !1;return l||(l=new jr),function(e,t,r,n,i,o){var a=1&r,s=Ki(e),c=s.length,u=Ki(t).length;if(c!=u&&!a)return !1;var l=c;for(;l--;){var f=s[l];if(!(a?f in t:xe.call(t,f)))return !1}var h=o.get(e);if(h&&o.get(t))return h==t;var d=!0;o.set(e,t),o.set(t,e);var p=a;for(;++l<c;){f=s[l];var m=e[f],v=t[f];if(n)var g=a?n(v,m,f,t,e,o):n(m,v,f,e,t,o);if(!(void 0===g?m===v||i(m,v,r,n,o):g)){d=!1;break}p||(p="constructor"==f);}if(d&&!p){var y=e.constructor,b=t.constructor;y!=b&&"constructor"in e&&"constructor"in t&&!("function"==typeof y&&y instanceof y&&"function"==typeof b&&b instanceof b)&&(d=!1);}return o.delete(e),o.delete(t),d}(e,t,r,n,i,l)}(e,t,r,n,wn,i))}function _n(e,t,r,n){var i=r.length,o=i,a=!n;if(null==e)return !o;for(e=me(e);i--;){var s=r[i];if(a&&s[2]?s[1]!==e[s[0]]:!(s[0]in e))return !1}for(;++i<o;){var c=(s=r[i])[0],u=e[c],l=s[1];if(a&&s[2]){if(void 0===u&&!(c in e))return !1}else {var f=new jr;if(n)var h=n(u,l,c,e,t,f);if(!(void 0===h?wn(l,u,3,n,f):h))return !1}}return !0}function Sn(e){return !(!Va(e)||(t=e,ke&&ke in t))&&(Fa(e)?Ne:ne).test(Po(e));var t;}function En(e){return "function"==typeof e?e:null==e?$s:"object"==typeof e?Na(e)?Tn(e[0],e[1]):On(e):tc(e)}function xn(e){if(!fo(e))return ir(e);var t=[];for(var r in me(e))xe.call(e,r)&&"constructor"!=r&&t.push(r);return t}function In(e){if(!Va(e))return function(e){var t=[];if(null!=e)for(var r in me(e))t.push(r);return t}(e);var t=fo(e),r=[];for(var n in e)("constructor"!=n||!t&&xe.call(e,n))&&r.push(n);return r}function kn(e,t){return e<t}function Pn(e,t){var r=-1,n=Ma(e)?le(e.length):[];return Zr(e,(function(e,i,o){n[++r]=t(e,i,o);})),n}function On(e){var t=Qi(e);return 1==t.length&&t[0][2]?po(t[0][0],t[0][1]):function(r){return r===e||_n(r,e,t)}}function Tn(e,t){return co(e)&&ho(t)?po(ko(e),t):function(r){var n=ms(r,e);return void 0===n&&n===t?vs(r,e):wn(t,n,3)}}function An(e,t,r,n,i){e!==t&&an(t,(function(o,a){if(i||(i=new jr),Va(o))!function(e,t,r,n,i,o,a){var s=yo(e,r),c=yo(t,r),u=a.get(c);if(u)return void Hr(e,r,u);var l=o?o(s,c,r+"",e,t,a):void 0,f=void 0===l;if(f){var h=Na(c),d=!h&&Da(c),p=!h&&!d&&Qa(c);l=c,h||d||p?Na(s)?l=s:ja(s)?l=gi(s):d?(f=!1,l=fi(c,!0)):p?(f=!1,l=di(c,!0)):l=[]:Ga(c)||Ra(c)?(l=s,Ra(s)?l=as(s):Va(s)&&!Fa(s)||(l=io(c))):f=!1;}f&&(a.set(c,l),i(l,c,n,o,a),a.delete(c));Hr(e,r,l);}(e,t,a,r,An,n,i);else {var s=n?n(yo(e,a),o,a+"",e,t,i):void 0;void 0===s&&(s=o),Hr(e,a,s);}}),_s);}function Cn(e,t){var r=e.length;if(r)return ao(t+=t<0?r:0,r)?e[t]:void 0}function Rn(e,t,r){var n=-1;return t=lt(t.length?t:[$s],Pt(Xi())),function(e,t){var r=e.length;for(e.sort(t);r--;)e[r]=e[r].value;return e}(Pn(e,(function(e,r,i){return {criteria:lt(t,(function(t){return t(e)})),index:++n,value:e}})),(function(e,t){return function(e,t,r){var n=-1,i=e.criteria,o=t.criteria,a=i.length,s=r.length;for(;++n<a;){var c=pi(i[n],o[n]);if(c){if(n>=s)return c;var u=r[n];return c*("desc"==u?-1:1)}}return e.index-t.index}(e,t,r)}))}function Nn(e,t,r){for(var n=-1,i=t.length,o={};++n<i;){var a=t[n],s=fn(e,a);r(s,a)&&Hn(o,si(a,e),s);}return o}function Ln(e,t,r,n){var i=n?bt:yt,o=-1,a=t.length,s=e;for(e===t&&(t=gi(t)),r&&(s=lt(e,Pt(r)));++o<a;)for(var c=0,u=t[o],l=r?r(u):u;(c=i(s,l,c,n))>-1;)s!==e&&mt.call(s,c,1),mt.call(e,c,1);return e}function Mn(e,t){for(var r=e?t.length:0,n=r-1;r--;){var i=t[r];if(r==n||i!==o){var o=i;ao(i)?mt.call(e,i,1):Zn(e,i);}}return e}function jn(e,t){return e+Zt(ur()*(t-e+1))}function Dn(e,t){var r="";if(!e||t<1||t>9007199254740991)return r;do{t%2&&(r+=e),(t=Zt(t/2))&&(e+=e);}while(t);return r}function Bn(e,t){return _o(mo(e,t,$s),e+"")}function Un(e){return Br(Ts(e))}function Fn(e,t){var r=Ts(e);return xo(r,Jr(t,0,r.length))}function Hn(e,t,r,n){if(!Va(e))return e;for(var i=-1,o=(t=si(t,e)).length,a=o-1,s=e;null!=s&&++i<o;){var c=ko(t[i]),u=r;if(i!=a){var l=s[c];void 0===(u=n?n(l,c,s):void 0)&&(u=Va(l)?l:ao(t[i+1])?[]:{});}zr(s,c,u),s=s[c];}return e}var zn=gr?function(e,t){return gr.set(e,t),e}:$s,Vn=Jt?function(e,t){return Jt(e,"toString",{configurable:!0,enumerable:!1,value:Vs(t),writable:!0})}:$s;function qn(e){return xo(Ts(e))}function Kn(e,t,r){var n=-1,i=e.length;t<0&&(t=-t>i?0:i+t),(r=r>i?i:r)<0&&(r+=i),i=t>r?0:r-t>>>0,t>>>=0;for(var o=le(i);++n<i;)o[n]=e[n+t];return o}function $n(e,t){var r;return Zr(e,(function(e,n,i){return !(r=t(e,n,i))})),!!r}function Gn(e,t,r){var n=0,i=null==e?n:e.length;if("number"==typeof t&&t==t&&i<=2147483647){for(;n<i;){var o=n+i>>>1,a=e[o];null!==a&&!Ya(a)&&(r?a<=t:a<t)?n=o+1:i=o;}return i}return Jn(e,t,$s,r)}function Jn(e,t,r,n){t=r(t);for(var i=0,o=null==e?0:e.length,a=t!=t,s=null===t,c=Ya(t),u=void 0===t;i<o;){var l=Zt((i+o)/2),f=r(e[l]),h=void 0!==f,d=null===f,p=f==f,m=Ya(f);if(a)var v=n||p;else v=u?p&&(n||h):s?p&&h&&(n||!d):c?p&&h&&!d&&(n||!m):!d&&!m&&(n?f<=t:f<t);v?i=l+1:o=l;}return ar(o,4294967294)}function Wn(e,t){for(var r=-1,n=e.length,i=0,o=[];++r<n;){var a=e[r],s=t?t(a):a;if(!r||!Ta(s,c)){var c=s;o[i++]=0===a?0:a;}}return o}function Xn(e){return "number"==typeof e?e:Ya(e)?NaN:+e}function Yn(e){if("string"==typeof e)return e;if(Na(e))return lt(e,Yn)+"";if(Ya(e))return kr?kr.call(e):"";var t=e+"";return "0"==t&&1/e==-1/0?"-0":t}function Qn(e,t,r){var n=-1,i=ct,o=e.length,a=!0,s=[],c=s;if(r)a=!1,i=ut;else if(o>=200){var u=t?null:Di(e);if(u)return Ft(u);a=!1,i=Tt,c=new Mr;}else c=t?[]:s;e:for(;++n<o;){var l=e[n],f=t?t(l):l;if(l=r||0!==l?l:0,a&&f==f){for(var h=c.length;h--;)if(c[h]===f)continue e;t&&c.push(f),s.push(l);}else i(c,f,r)||(c!==s&&c.push(f),s.push(l));}return s}function Zn(e,t){return null==(e=vo(e,t=si(t,e)))||delete e[ko(Uo(t))]}function ei(e,t,r,n){return Hn(e,t,r(fn(e,t)),n)}function ti(e,t,r,n){for(var i=e.length,o=n?i:-1;(n?o--:++o<i)&&t(e[o],o,e););return r?Kn(e,n?0:o,n?o+1:i):Kn(e,n?o+1:0,n?i:o)}function ri(e,t){var r=e;return r instanceof Cr&&(r=r.value()),ht(t,(function(e,t){return t.func.apply(t.thisArg,ft([e],t.args))}),r)}function ni(e,t,r){var n=e.length;if(n<2)return n?Qn(e[0]):[];for(var i=-1,o=le(n);++i<n;)for(var a=e[i],s=-1;++s<n;)s!=i&&(o[i]=Qr(o[i]||a,e[s],t,r));return Qn(on(o,1),t,r)}function ii(e,t,r){for(var n=-1,i=e.length,o=t.length,a={};++n<i;){var s=n<o?t[n]:void 0;r(a,e[n],s);}return a}function oi(e){return ja(e)?e:[]}function ai(e){return "function"==typeof e?e:$s}function si(e,t){return Na(e)?e:co(e,t)?[e]:Io(ss(e))}var ci=Bn;function ui(e,t,r){var n=e.length;return r=void 0===r?n:r,!t&&r>=n?e:Kn(e,t,r)}var li=Wt||function(e){return qe.clearTimeout(e)};function fi(e,t){if(t)return e.slice();var r=e.length,n=Ke?Ke(r):new e.constructor(r);return e.copy(n),n}function hi(e){var t=new e.constructor(e.byteLength);return new Ve(t).set(new Ve(e)),t}function di(e,t){var r=t?hi(e.buffer):e.buffer;return new e.constructor(r,e.byteOffset,e.length)}function pi(e,t){if(e!==t){var r=void 0!==e,n=null===e,i=e==e,o=Ya(e),a=void 0!==t,s=null===t,c=t==t,u=Ya(t);if(!s&&!u&&!o&&e>t||o&&a&&c&&!s&&!u||n&&a&&c||!r&&c||!i)return 1;if(!n&&!o&&!u&&e<t||u&&r&&i&&!n&&!o||s&&r&&i||!a&&i||!c)return -1}return 0}function mi(e,t,r,n){for(var i=-1,o=e.length,a=r.length,s=-1,c=t.length,u=or(o-a,0),l=le(c+u),f=!n;++s<c;)l[s]=t[s];for(;++i<a;)(f||i<o)&&(l[r[i]]=e[i]);for(;u--;)l[s++]=e[i++];return l}function vi(e,t,r,n){for(var i=-1,o=e.length,a=-1,s=r.length,c=-1,u=t.length,l=or(o-s,0),f=le(l+u),h=!n;++i<l;)f[i]=e[i];for(var d=i;++c<u;)f[d+c]=t[c];for(;++a<s;)(h||i<o)&&(f[d+r[a]]=e[i++]);return f}function gi(e,t){var r=-1,n=e.length;for(t||(t=le(n));++r<n;)t[r]=e[r];return t}function yi(e,t,r,n){var i=!r;r||(r={});for(var o=-1,a=t.length;++o<a;){var s=t[o],c=n?n(r[s],e[s],s,r,e):void 0;void 0===c&&(c=e[s]),i?$r(r,s,c):zr(r,s,c);}return r}function bi(e,t){return function(r,n){var i=Na(r)?nt:qr,o=t?t():{};return i(r,e,Xi(n,2),o)}}function wi(e){return Bn((function(t,r){var n=-1,i=r.length,o=i>1?r[i-1]:void 0,a=i>2?r[2]:void 0;for(o=e.length>3&&"function"==typeof o?(i--,o):void 0,a&&so(r[0],r[1],a)&&(o=i<3?void 0:o,i=1),t=me(t);++n<i;){var s=r[n];s&&e(t,s,n,o);}return t}))}function _i(e,t){return function(r,n){if(null==r)return r;if(!Ma(r))return e(r,n);for(var i=r.length,o=t?i:-1,a=me(r);(t?o--:++o<i)&&!1!==n(a[o],o,a););return r}}function Si(e){return function(t,r,n){for(var i=-1,o=me(t),a=n(t),s=a.length;s--;){var c=a[e?s:++i];if(!1===r(o[c],c,o))break}return t}}function Ei(e){return function(t){var r=jt(t=ss(t))?Vt(t):void 0,n=r?r[0]:t.charAt(0),i=r?ui(r,1).join(""):t.slice(1);return n[e]()+i}}function xi(e){return function(t){return ht(Fs(Rs(t).replace(Te,"")),e,"")}}function Ii(e){return function(){var t=arguments;switch(t.length){case 0:return new e;case 1:return new e(t[0]);case 2:return new e(t[0],t[1]);case 3:return new e(t[0],t[1],t[2]);case 4:return new e(t[0],t[1],t[2],t[3]);case 5:return new e(t[0],t[1],t[2],t[3],t[4]);case 6:return new e(t[0],t[1],t[2],t[3],t[4],t[5]);case 7:return new e(t[0],t[1],t[2],t[3],t[4],t[5],t[6])}var r=Or(e.prototype),n=e.apply(r,t);return Va(n)?n:r}}function ki(e){return function(t,r,n){var i=me(t);if(!Ma(t)){var o=Xi(r,3);t=ws(t),r=function(e){return o(i[e],e,i)};}var a=e(t,r,n);return a>-1?i[o?t[a]:a]:void 0}}function Pi(e){return qi((function(t){var n=t.length,i=n,o=Ar.prototype.thru;for(e&&t.reverse();i--;){var a=t[i];if("function"!=typeof a)throw new ye(r);if(o&&!s&&"wrapper"==Ji(a))var s=new Ar([],!0);}for(i=s?i:n;++i<n;){var c=Ji(a=t[i]),u="wrapper"==c?Gi(a):void 0;s=u&&uo(u[0])&&424==u[1]&&!u[4].length&&1==u[9]?s[Ji(u[0])].apply(s,u[3]):1==a.length&&uo(a)?s[c]():s.thru(a);}return function(){var e=arguments,r=e[0];if(s&&1==e.length&&Na(r))return s.plant(r).value();for(var i=0,o=n?t[i].apply(this,e):r;++i<n;)o=t[i].call(this,o);return o}}))}function Oi(e,t,r,n,i,o,a,s,c,u){var l=128&t,f=1&t,h=2&t,d=24&t,p=512&t,m=h?void 0:Ii(e);return function v(){for(var g=arguments.length,y=le(g),b=g;b--;)y[b]=arguments[b];if(d)var w=Wi(v),_=Rt(y,w);if(n&&(y=mi(y,n,i,d)),o&&(y=vi(y,o,a,d)),g-=_,d&&g<u){var S=Ut(y,w);return Mi(e,t,Oi,v.placeholder,r,y,S,s,c,u-g)}var E=f?r:this,x=h?E[e]:e;return g=y.length,s?y=go(y,s):p&&g>1&&y.reverse(),l&&c<g&&(y.length=c),this&&this!==qe&&this instanceof v&&(x=m||Ii(x)),x.apply(E,y)}}function Ti(e,t){return function(r,n){return function(e,t,r,n){return cn(e,(function(e,i,o){t(n,r(e),i,o);})),n}(r,e,t(n),{})}}function Ai(e,t){return function(r,n){var i;if(void 0===r&&void 0===n)return t;if(void 0!==r&&(i=r),void 0!==n){if(void 0===i)return n;"string"==typeof r||"string"==typeof n?(r=Yn(r),n=Yn(n)):(r=Xn(r),n=Xn(n)),i=e(r,n);}return i}}function Ci(e){return qi((function(t){return t=lt(t,Pt(Xi())),Bn((function(r){var n=this;return e(t,(function(e){return rt(e,n,r)}))}))}))}function Ri(e,t){var r=(t=void 0===t?" ":Yn(t)).length;if(r<2)return r?Dn(t,e):t;var n=Dn(t,Qt(e/zt(t)));return jt(t)?ui(Vt(n),0,e).join(""):n.slice(0,e)}function Ni(e){return function(t,r,n){return n&&"number"!=typeof n&&so(t,r,n)&&(r=n=void 0),t=rs(t),void 0===r?(r=t,t=0):r=rs(r),function(e,t,r,n){for(var i=-1,o=or(Qt((t-e)/(r||1)),0),a=le(o);o--;)a[n?o:++i]=e,e+=r;return a}(t,r,n=void 0===n?t<r?1:-1:rs(n),e)}}function Li(e){return function(t,r){return "string"==typeof t&&"string"==typeof r||(t=os(t),r=os(r)),e(t,r)}}function Mi(e,t,r,n,i,o,a,s,c,u){var l=8&t;t|=l?32:64,4&(t&=~(l?64:32))||(t&=-4);var f=[e,t,i,l?o:void 0,l?a:void 0,l?void 0:o,l?void 0:a,s,c,u],h=r.apply(void 0,f);return uo(e)&&bo(h,f),h.placeholder=n,So(h,e,t)}function ji(e){var t=pe[e];return function(e,r){if(e=os(e),(r=null==r?0:ar(ns(r),292))&&rr(e)){var n=(ss(e)+"e").split("e");return +((n=(ss(t(n[0]+"e"+(+n[1]+r)))+"e").split("e"))[0]+"e"+(+n[1]-r))}return t(e)}}var Di=pr&&1/Ft(new pr([,-0]))[1]==1/0?function(e){return new pr(e)}:Ys;function Bi(e){return function(t){var r=ro(t);return r==h?Dt(t):r==v?Ht(t):function(e,t){return lt(t,(function(t){return [t,e[t]]}))}(t,e(t))}}function Ui(e,t,i,o,a,s,c,u){var l=2&t;if(!l&&"function"!=typeof e)throw new ye(r);var f=o?o.length:0;if(f||(t&=-97,o=a=void 0),c=void 0===c?c:or(ns(c),0),u=void 0===u?u:ns(u),f-=a?a.length:0,64&t){var h=o,d=a;o=a=void 0;}var p=l?void 0:Gi(e),m=[e,t,i,o,a,h,d,s,c,u];if(p&&function(e,t){var r=e[1],i=t[1],o=r|i,a=o<131,s=128==i&&8==r||128==i&&256==r&&e[7].length<=t[8]||384==i&&t[7].length<=t[8]&&8==r;if(!a&&!s)return e;1&i&&(e[2]=t[2],o|=1&r?0:4);var c=t[3];if(c){var u=e[3];e[3]=u?mi(u,c,t[4]):c,e[4]=u?Ut(e[3],n):t[4];}(c=t[5])&&(u=e[5],e[5]=u?vi(u,c,t[6]):c,e[6]=u?Ut(e[5],n):t[6]);(c=t[7])&&(e[7]=c);128&i&&(e[8]=null==e[8]?t[8]:ar(e[8],t[8]));null==e[9]&&(e[9]=t[9]);e[0]=t[0],e[1]=o;}(m,p),e=m[0],t=m[1],i=m[2],o=m[3],a=m[4],!(u=m[9]=void 0===m[9]?l?0:e.length:or(m[9]-f,0))&&24&t&&(t&=-25),t&&1!=t)v=8==t||16==t?function(e,t,r){var n=Ii(e);return function i(){for(var o=arguments.length,a=le(o),s=o,c=Wi(i);s--;)a[s]=arguments[s];var u=o<3&&a[0]!==c&&a[o-1]!==c?[]:Ut(a,c);if((o-=u.length)<r)return Mi(e,t,Oi,i.placeholder,void 0,a,u,void 0,void 0,r-o);var l=this&&this!==qe&&this instanceof i?n:e;return rt(l,this,a)}}(e,t,u):32!=t&&33!=t||a.length?Oi.apply(void 0,m):function(e,t,r,n){var i=1&t,o=Ii(e);return function t(){for(var a=-1,s=arguments.length,c=-1,u=n.length,l=le(u+s),f=this&&this!==qe&&this instanceof t?o:e;++c<u;)l[c]=n[c];for(;s--;)l[c++]=arguments[++a];return rt(f,i?r:this,l)}}(e,t,i,o);else var v=function(e,t,r){var n=1&t,i=Ii(e);return function t(){var o=this&&this!==qe&&this instanceof t?i:e;return o.apply(n?r:this,arguments)}}(e,t,i);return So((p?zn:bo)(v,m),e,t)}function Fi(e,t,r,n){return void 0===e||Ta(e,_e[r])&&!xe.call(n,r)?t:e}function Hi(e,t,r,n,i,o){return Va(e)&&Va(t)&&(o.set(t,e),An(e,t,void 0,Hi,o),o.delete(t)),e}function zi(e){return Ga(e)?void 0:e}function Vi(e,t,r,n,i,o){var a=1&r,s=e.length,c=t.length;if(s!=c&&!(a&&c>s))return !1;var u=o.get(e);if(u&&o.get(t))return u==t;var l=-1,f=!0,h=2&r?new Mr:void 0;for(o.set(e,t),o.set(t,e);++l<s;){var d=e[l],p=t[l];if(n)var m=a?n(p,d,l,t,e,o):n(d,p,l,e,t,o);if(void 0!==m){if(m)continue;f=!1;break}if(h){if(!pt(t,(function(e,t){if(!Tt(h,t)&&(d===e||i(d,e,r,n,o)))return h.push(t)}))){f=!1;break}}else if(d!==p&&!i(d,p,r,n,o)){f=!1;break}}return o.delete(e),o.delete(t),f}function qi(e){return _o(mo(e,void 0,Lo),e+"")}function Ki(e){return hn(e,ws,eo)}function $i(e){return hn(e,_s,to)}var Gi=gr?function(e){return gr.get(e)}:Ys;function Ji(e){for(var t=e.name+"",r=yr[t],n=xe.call(yr,t)?r.length:0;n--;){var i=r[n],o=i.func;if(null==o||o==e)return i.name}return t}function Wi(e){return (xe.call(Pr,"placeholder")?Pr:e).placeholder}function Xi(){var e=Pr.iteratee||Gs;return e=e===Gs?En:e,arguments.length?e(arguments[0],arguments[1]):e}function Yi(e,t){var r=e.__data__;return function(e){var t=typeof e;return "string"==t||"number"==t||"symbol"==t||"boolean"==t?"__proto__"!==e:null===e}(t)?r["string"==typeof t?"string":"hash"]:r.map}function Qi(e){for(var t=ws(e),r=t.length;r--;){var n=t[r],i=e[n];t[r]=[n,i,ho(i)];}return t}function Zi(e,t){var r=function(e,t){return null==e?void 0:e[t]}(e,t);return Sn(r)?r:void 0}var eo=er?function(e){return null==e?[]:(e=me(e),st(er(e),(function(t){return We.call(e,t)})))}:ic,to=er?function(e){for(var t=[];e;)ft(t,eo(e)),e=$e(e);return t}:ic,ro=dn;function no(e,t,r){for(var n=-1,i=(t=si(t,e)).length,o=!1;++n<i;){var a=ko(t[n]);if(!(o=null!=e&&r(e,a)))break;e=e[a];}return o||++n!=i?o:!!(i=null==e?0:e.length)&&za(i)&&ao(a,i)&&(Na(e)||Ra(e))}function io(e){return "function"!=typeof e.constructor||fo(e)?{}:Or($e(e))}function oo(e){return Na(e)||Ra(e)||!!(Et&&e&&e[Et])}function ao(e,t){var r=typeof e;return !!(t=null==t?9007199254740991:t)&&("number"==r||"symbol"!=r&&oe.test(e))&&e>-1&&e%1==0&&e<t}function so(e,t,r){if(!Va(r))return !1;var n=typeof t;return !!("number"==n?Ma(r)&&ao(t,r.length):"string"==n&&t in r)&&Ta(r[t],e)}function co(e,t){if(Na(e))return !1;var r=typeof e;return !("number"!=r&&"symbol"!=r&&"boolean"!=r&&null!=e&&!Ya(e))||(H.test(e)||!F.test(e)||null!=t&&e in me(t))}function uo(e){var t=Ji(e),r=Pr[t];if("function"!=typeof r||!(t in Cr.prototype))return !1;if(e===r)return !0;var n=Gi(r);return !!n&&e===n[0]}(fr&&ro(new fr(new ArrayBuffer(1)))!=_||hr&&ro(new hr)!=h||dr&&"[object Promise]"!=ro(dr.resolve())||pr&&ro(new pr)!=v||mr&&ro(new mr)!=b)&&(ro=function(e){var t=dn(e),r=t==p?e.constructor:void 0,n=r?Po(r):"";if(n)switch(n){case br:return _;case wr:return h;case _r:return "[object Promise]";case Sr:return v;case Er:return b}return t});var lo=Se?Fa:oc;function fo(e){var t=e&&e.constructor;return e===("function"==typeof t&&t.prototype||_e)}function ho(e){return e==e&&!Va(e)}function po(e,t){return function(r){return null!=r&&(r[e]===t&&(void 0!==t||e in me(r)))}}function mo(e,t,r){return t=or(void 0===t?e.length-1:t,0),function(){for(var n=arguments,i=-1,o=or(n.length-t,0),a=le(o);++i<o;)a[i]=n[t+i];i=-1;for(var s=le(t+1);++i<t;)s[i]=n[i];return s[t]=r(a),rt(e,this,s)}}function vo(e,t){return t.length<2?e:fn(e,Kn(t,0,-1))}function go(e,t){for(var r=e.length,n=ar(t.length,r),i=gi(e);n--;){var o=t[n];e[n]=ao(o,r)?i[o]:void 0;}return e}function yo(e,t){if(("constructor"!==t||"function"!=typeof e[t])&&"__proto__"!=t)return e[t]}var bo=Eo(zn),wo=Yt||function(e,t){return qe.setTimeout(e,t)},_o=Eo(Vn);function So(e,t,r){var n=t+"";return _o(e,function(e,t){var r=t.length;if(!r)return e;var n=r-1;return t[n]=(r>1?"& ":"")+t[n],t=t.join(r>2?", ":" "),e.replace(J,"{\n/* [wrapped with "+t+"] */\n")}(n,function(e,t){return it(i,(function(r){var n="_."+r[0];t&r[1]&&!ct(e,n)&&e.push(n);})),e.sort()}(function(e){var t=e.match(W);return t?t[1].split(X):[]}(n),r)))}function Eo(e){var t=0,r=0;return function(){var n=sr(),i=16-(n-r);if(r=n,i>0){if(++t>=800)return arguments[0]}else t=0;return e.apply(void 0,arguments)}}function xo(e,t){var r=-1,n=e.length,i=n-1;for(t=void 0===t?n:t;++r<t;){var o=jn(r,i),a=e[o];e[o]=e[r],e[r]=a;}return e.length=t,e}var Io=function(e){var t=Ea(e,(function(e){return 500===r.size&&r.clear(),e})),r=t.cache;return t}((function(e){var t=[];return 46===e.charCodeAt(0)&&t.push(""),e.replace(z,(function(e,r,n,i){t.push(n?i.replace(Q,"$1"):r||e);})),t}));function ko(e){if("string"==typeof e||Ya(e))return e;var t=e+"";return "0"==t&&1/e==-1/0?"-0":t}function Po(e){if(null!=e){try{return Ee.call(e)}catch(e){}try{return e+""}catch(e){}}return ""}function Oo(e){if(e instanceof Cr)return e.clone();var t=new Ar(e.__wrapped__,e.__chain__);return t.__actions__=gi(e.__actions__),t.__index__=e.__index__,t.__values__=e.__values__,t}var To=Bn((function(e,t){return ja(e)?Qr(e,on(t,1,ja,!0)):[]})),Ao=Bn((function(e,t){var r=Uo(t);return ja(r)&&(r=void 0),ja(e)?Qr(e,on(t,1,ja,!0),Xi(r,2)):[]})),Co=Bn((function(e,t){var r=Uo(t);return ja(r)&&(r=void 0),ja(e)?Qr(e,on(t,1,ja,!0),void 0,r):[]}));function Ro(e,t,r){var n=null==e?0:e.length;if(!n)return -1;var i=null==r?0:ns(r);return i<0&&(i=or(n+i,0)),gt(e,Xi(t,3),i)}function No(e,t,r){var n=null==e?0:e.length;if(!n)return -1;var i=n-1;return void 0!==r&&(i=ns(r),i=r<0?or(n+i,0):ar(i,n-1)),gt(e,Xi(t,3),i,!0)}function Lo(e){return (null==e?0:e.length)?on(e,1):[]}function Mo(e){return e&&e.length?e[0]:void 0}var jo=Bn((function(e){var t=lt(e,oi);return t.length&&t[0]===e[0]?gn(t):[]})),Do=Bn((function(e){var t=Uo(e),r=lt(e,oi);return t===Uo(r)?t=void 0:r.pop(),r.length&&r[0]===e[0]?gn(r,Xi(t,2)):[]})),Bo=Bn((function(e){var t=Uo(e),r=lt(e,oi);return (t="function"==typeof t?t:void 0)&&r.pop(),r.length&&r[0]===e[0]?gn(r,void 0,t):[]}));function Uo(e){var t=null==e?0:e.length;return t?e[t-1]:void 0}var Fo=Bn(Ho);function Ho(e,t){return e&&e.length&&t&&t.length?Ln(e,t):e}var zo=qi((function(e,t){var r=null==e?0:e.length,n=Gr(e,t);return Mn(e,lt(t,(function(e){return ao(e,r)?+e:e})).sort(pi)),n}));function Vo(e){return null==e?e:lr.call(e)}var qo=Bn((function(e){return Qn(on(e,1,ja,!0))})),Ko=Bn((function(e){var t=Uo(e);return ja(t)&&(t=void 0),Qn(on(e,1,ja,!0),Xi(t,2))})),$o=Bn((function(e){var t=Uo(e);return t="function"==typeof t?t:void 0,Qn(on(e,1,ja,!0),void 0,t)}));function Go(e){if(!e||!e.length)return [];var t=0;return e=st(e,(function(e){if(ja(e))return t=or(e.length,t),!0})),kt(t,(function(t){return lt(e,St(t))}))}function Jo(e,t){if(!e||!e.length)return [];var r=Go(e);return null==t?r:lt(r,(function(e){return rt(t,void 0,e)}))}var Wo=Bn((function(e,t){return ja(e)?Qr(e,t):[]})),Xo=Bn((function(e){return ni(st(e,ja))})),Yo=Bn((function(e){var t=Uo(e);return ja(t)&&(t=void 0),ni(st(e,ja),Xi(t,2))})),Qo=Bn((function(e){var t=Uo(e);return t="function"==typeof t?t:void 0,ni(st(e,ja),void 0,t)})),Zo=Bn(Go);var ea=Bn((function(e){var t=e.length,r=t>1?e[t-1]:void 0;return r="function"==typeof r?(e.pop(),r):void 0,Jo(e,r)}));function ta(e){var t=Pr(e);return t.__chain__=!0,t}function ra(e,t){return t(e)}var na=qi((function(e){var t=e.length,r=t?e[0]:0,n=this.__wrapped__,i=function(t){return Gr(t,e)};return !(t>1||this.__actions__.length)&&n instanceof Cr&&ao(r)?((n=n.slice(r,+r+(t?1:0))).__actions__.push({func:ra,args:[i],thisArg:void 0}),new Ar(n,this.__chain__).thru((function(e){return t&&!e.length&&e.push(void 0),e}))):this.thru(i)}));var ia=bi((function(e,t,r){xe.call(e,r)?++e[r]:$r(e,r,1);}));var oa=ki(Ro),aa=ki(No);function sa(e,t){return (Na(e)?it:Zr)(e,Xi(t,3))}function ca(e,t){return (Na(e)?ot:en)(e,Xi(t,3))}var ua=bi((function(e,t,r){xe.call(e,r)?e[r].push(t):$r(e,r,[t]);}));var la=Bn((function(e,t,r){var n=-1,i="function"==typeof t,o=Ma(e)?le(e.length):[];return Zr(e,(function(e){o[++n]=i?rt(t,e,r):yn(e,t,r);})),o})),fa=bi((function(e,t,r){$r(e,r,t);}));function ha(e,t){return (Na(e)?lt:Pn)(e,Xi(t,3))}var da=bi((function(e,t,r){e[r?0:1].push(t);}),(function(){return [[],[]]}));var pa=Bn((function(e,t){if(null==e)return [];var r=t.length;return r>1&&so(e,t[0],t[1])?t=[]:r>2&&so(t[0],t[1],t[2])&&(t=[t[0]]),Rn(e,on(t,1),[])})),ma=Xt||function(){return qe.Date.now()};function va(e,t,r){return t=r?void 0:t,Ui(e,128,void 0,void 0,void 0,void 0,t=e&&null==t?e.length:t)}function ga(e,t){var n;if("function"!=typeof t)throw new ye(r);return e=ns(e),function(){return --e>0&&(n=t.apply(this,arguments)),e<=1&&(t=void 0),n}}var ya=Bn((function(e,t,r){var n=1;if(r.length){var i=Ut(r,Wi(ya));n|=32;}return Ui(e,n,t,r,i)})),ba=Bn((function(e,t,r){var n=3;if(r.length){var i=Ut(r,Wi(ba));n|=32;}return Ui(t,n,e,r,i)}));function wa(e,t,n){var i,o,a,s,c,u,l=0,f=!1,h=!1,d=!0;if("function"!=typeof e)throw new ye(r);function p(t){var r=i,n=o;return i=o=void 0,l=t,s=e.apply(n,r)}function m(e){return l=e,c=wo(g,t),f?p(e):s}function v(e){var r=e-u;return void 0===u||r>=t||r<0||h&&e-l>=a}function g(){var e=ma();if(v(e))return y(e);c=wo(g,function(e){var r=t-(e-u);return h?ar(r,a-(e-l)):r}(e));}function y(e){return c=void 0,d&&i?p(e):(i=o=void 0,s)}function b(){var e=ma(),r=v(e);if(i=arguments,o=this,u=e,r){if(void 0===c)return m(u);if(h)return li(c),c=wo(g,t),p(u)}return void 0===c&&(c=wo(g,t)),s}return t=os(t)||0,Va(n)&&(f=!!n.leading,a=(h="maxWait"in n)?or(os(n.maxWait)||0,t):a,d="trailing"in n?!!n.trailing:d),b.cancel=function(){void 0!==c&&li(c),l=0,i=u=o=c=void 0;},b.flush=function(){return void 0===c?s:y(ma())},b}var _a=Bn((function(e,t){return Yr(e,1,t)})),Sa=Bn((function(e,t,r){return Yr(e,os(t)||0,r)}));function Ea(e,t){if("function"!=typeof e||null!=t&&"function"!=typeof t)throw new ye(r);var n=function(){var r=arguments,i=t?t.apply(this,r):r[0],o=n.cache;if(o.has(i))return o.get(i);var a=e.apply(this,r);return n.cache=o.set(i,a)||o,a};return n.cache=new(Ea.Cache||Lr),n}function xa(e){if("function"!=typeof e)throw new ye(r);return function(){var t=arguments;switch(t.length){case 0:return !e.call(this);case 1:return !e.call(this,t[0]);case 2:return !e.call(this,t[0],t[1]);case 3:return !e.call(this,t[0],t[1],t[2])}return !e.apply(this,t)}}Ea.Cache=Lr;var Ia=ci((function(e,t){var r=(t=1==t.length&&Na(t[0])?lt(t[0],Pt(Xi())):lt(on(t,1),Pt(Xi()))).length;return Bn((function(n){for(var i=-1,o=ar(n.length,r);++i<o;)n[i]=t[i].call(this,n[i]);return rt(e,this,n)}))})),ka=Bn((function(e,t){return Ui(e,32,void 0,t,Ut(t,Wi(ka)))})),Pa=Bn((function(e,t){return Ui(e,64,void 0,t,Ut(t,Wi(Pa)))})),Oa=qi((function(e,t){return Ui(e,256,void 0,void 0,void 0,t)}));function Ta(e,t){return e===t||e!=e&&t!=t}var Aa=Li(pn),Ca=Li((function(e,t){return e>=t})),Ra=bn(function(){return arguments}())?bn:function(e){return qa(e)&&xe.call(e,"callee")&&!We.call(e,"callee")},Na=le.isArray,La=Xe?Pt(Xe):function(e){return qa(e)&&dn(e)==w};function Ma(e){return null!=e&&za(e.length)&&!Fa(e)}function ja(e){return qa(e)&&Ma(e)}var Da=tr||oc,Ba=Ye?Pt(Ye):function(e){return qa(e)&&dn(e)==c};function Ua(e){if(!qa(e))return !1;var t=dn(e);return t==u||"[object DOMException]"==t||"string"==typeof e.message&&"string"==typeof e.name&&!Ga(e)}function Fa(e){if(!Va(e))return !1;var t=dn(e);return t==l||t==f||"[object AsyncFunction]"==t||"[object Proxy]"==t}function Ha(e){return "number"==typeof e&&e==ns(e)}function za(e){return "number"==typeof e&&e>-1&&e%1==0&&e<=9007199254740991}function Va(e){var t=typeof e;return null!=e&&("object"==t||"function"==t)}function qa(e){return null!=e&&"object"==typeof e}var Ka=Qe?Pt(Qe):function(e){return qa(e)&&ro(e)==h};function $a(e){return "number"==typeof e||qa(e)&&dn(e)==d}function Ga(e){if(!qa(e)||dn(e)!=p)return !1;var t=$e(e);if(null===t)return !0;var r=xe.call(t,"constructor")&&t.constructor;return "function"==typeof r&&r instanceof r&&Ee.call(r)==Oe}var Ja=Ze?Pt(Ze):function(e){return qa(e)&&dn(e)==m};var Wa=et?Pt(et):function(e){return qa(e)&&ro(e)==v};function Xa(e){return "string"==typeof e||!Na(e)&&qa(e)&&dn(e)==g}function Ya(e){return "symbol"==typeof e||qa(e)&&dn(e)==y}var Qa=tt?Pt(tt):function(e){return qa(e)&&za(e.length)&&!!De[dn(e)]};var Za=Li(kn),es=Li((function(e,t){return e<=t}));function ts(e){if(!e)return [];if(Ma(e))return Xa(e)?Vt(e):gi(e);if($t&&e[$t])return function(e){for(var t,r=[];!(t=e.next()).done;)r.push(t.value);return r}(e[$t]());var t=ro(e);return (t==h?Dt:t==v?Ft:Ts)(e)}function rs(e){return e?(e=os(e))===1/0||e===-1/0?17976931348623157e292*(e<0?-1:1):e==e?e:0:0===e?e:0}function ns(e){var t=rs(e),r=t%1;return t==t?r?t-r:t:0}function is(e){return e?Jr(ns(e),0,4294967295):0}function os(e){if("number"==typeof e)return e;if(Ya(e))return NaN;if(Va(e)){var t="function"==typeof e.valueOf?e.valueOf():e;e=Va(t)?t+"":t;}if("string"!=typeof e)return 0===e?e:+e;e=e.replace(K,"");var r=re.test(e);return r||ie.test(e)?He(e.slice(2),r?2:8):te.test(e)?NaN:+e}function as(e){return yi(e,_s(e))}function ss(e){return null==e?"":Yn(e)}var cs=wi((function(e,t){if(fo(t)||Ma(t))yi(t,ws(t),e);else for(var r in t)xe.call(t,r)&&zr(e,r,t[r]);})),us=wi((function(e,t){yi(t,_s(t),e);})),ls=wi((function(e,t,r,n){yi(t,_s(t),e,n);})),fs=wi((function(e,t,r,n){yi(t,ws(t),e,n);})),hs=qi(Gr);var ds=Bn((function(e,t){e=me(e);var r=-1,n=t.length,i=n>2?t[2]:void 0;for(i&&so(t[0],t[1],i)&&(n=1);++r<n;)for(var o=t[r],a=_s(o),s=-1,c=a.length;++s<c;){var u=a[s],l=e[u];(void 0===l||Ta(l,_e[u])&&!xe.call(e,u))&&(e[u]=o[u]);}return e})),ps=Bn((function(e){return e.push(void 0,Hi),rt(Es,void 0,e)}));function ms(e,t,r){var n=null==e?void 0:fn(e,t);return void 0===n?r:n}function vs(e,t){return null!=e&&no(e,t,vn)}var gs=Ti((function(e,t,r){null!=t&&"function"!=typeof t.toString&&(t=Pe.call(t)),e[t]=r;}),Vs($s)),ys=Ti((function(e,t,r){null!=t&&"function"!=typeof t.toString&&(t=Pe.call(t)),xe.call(e,t)?e[t].push(r):e[t]=[r];}),Xi),bs=Bn(yn);function ws(e){return Ma(e)?Dr(e):xn(e)}function _s(e){return Ma(e)?Dr(e,!0):In(e)}var Ss=wi((function(e,t,r){An(e,t,r);})),Es=wi((function(e,t,r,n){An(e,t,r,n);})),xs=qi((function(e,t){var r={};if(null==e)return r;var n=!1;t=lt(t,(function(t){return t=si(t,e),n||(n=t.length>1),t})),yi(e,$i(e),r),n&&(r=Wr(r,7,zi));for(var i=t.length;i--;)Zn(r,t[i]);return r}));var Is=qi((function(e,t){return null==e?{}:function(e,t){return Nn(e,t,(function(t,r){return vs(e,r)}))}(e,t)}));function ks(e,t){if(null==e)return {};var r=lt($i(e),(function(e){return [e]}));return t=Xi(t),Nn(e,r,(function(e,r){return t(e,r[0])}))}var Ps=Bi(ws),Os=Bi(_s);function Ts(e){return null==e?[]:Ot(e,ws(e))}var As=xi((function(e,t,r){return t=t.toLowerCase(),e+(r?Cs(t):t)}));function Cs(e){return Us(ss(e).toLowerCase())}function Rs(e){return (e=ss(e))&&e.replace(ae,Nt).replace(Ae,"")}var Ns=xi((function(e,t,r){return e+(r?"-":"")+t.toLowerCase()})),Ls=xi((function(e,t,r){return e+(r?" ":"")+t.toLowerCase()})),Ms=Ei("toLowerCase");var js=xi((function(e,t,r){return e+(r?"_":"")+t.toLowerCase()}));var Ds=xi((function(e,t,r){return e+(r?" ":"")+Us(t)}));var Bs=xi((function(e,t,r){return e+(r?" ":"")+t.toUpperCase()})),Us=Ei("toUpperCase");function Fs(e,t,r){return e=ss(e),void 0===(t=r?void 0:t)?function(e){return Le.test(e)}(e)?function(e){return e.match(Re)||[]}(e):function(e){return e.match(Y)||[]}(e):e.match(t)||[]}var Hs=Bn((function(e,t){try{return rt(e,void 0,t)}catch(e){return Ua(e)?e:new he(e)}})),zs=qi((function(e,t){return it(t,(function(t){t=ko(t),$r(e,t,ya(e[t],e));})),e}));function Vs(e){return function(){return e}}var qs=Pi(),Ks=Pi(!0);function $s(e){return e}function Gs(e){return En("function"==typeof e?e:Wr(e,1))}var Js=Bn((function(e,t){return function(r){return yn(r,e,t)}})),Ws=Bn((function(e,t){return function(r){return yn(e,r,t)}}));function Xs(e,t,r){var n=ws(t),i=ln(t,n);null!=r||Va(t)&&(i.length||!n.length)||(r=t,t=e,e=this,i=ln(t,ws(t)));var o=!(Va(r)&&"chain"in r&&!r.chain),a=Fa(e);return it(i,(function(r){var n=t[r];e[r]=n,a&&(e.prototype[r]=function(){var t=this.__chain__;if(o||t){var r=e(this.__wrapped__),i=r.__actions__=gi(this.__actions__);return i.push({func:n,args:arguments,thisArg:e}),r.__chain__=t,r}return n.apply(e,ft([this.value()],arguments))});})),e}function Ys(){}var Qs=Ci(lt),Zs=Ci(at),ec=Ci(pt);function tc(e){return co(e)?St(ko(e)):function(e){return function(t){return fn(t,e)}}(e)}var rc=Ni(),nc=Ni(!0);function ic(){return []}function oc(){return !1}var ac=Ai((function(e,t){return e+t}),0),sc=ji("ceil"),cc=Ai((function(e,t){return e/t}),1),uc=ji("floor");var lc,fc=Ai((function(e,t){return e*t}),1),hc=ji("round"),dc=Ai((function(e,t){return e-t}),0);return Pr.after=function(e,t){if("function"!=typeof t)throw new ye(r);return e=ns(e),function(){if(--e<1)return t.apply(this,arguments)}},Pr.ary=va,Pr.assign=cs,Pr.assignIn=us,Pr.assignInWith=ls,Pr.assignWith=fs,Pr.at=hs,Pr.before=ga,Pr.bind=ya,Pr.bindAll=zs,Pr.bindKey=ba,Pr.castArray=function(){if(!arguments.length)return [];var e=arguments[0];return Na(e)?e:[e]},Pr.chain=ta,Pr.chunk=function(e,t,r){t=(r?so(e,t,r):void 0===t)?1:or(ns(t),0);var n=null==e?0:e.length;if(!n||t<1)return [];for(var i=0,o=0,a=le(Qt(n/t));i<n;)a[o++]=Kn(e,i,i+=t);return a},Pr.compact=function(e){for(var t=-1,r=null==e?0:e.length,n=0,i=[];++t<r;){var o=e[t];o&&(i[n++]=o);}return i},Pr.concat=function(){var e=arguments.length;if(!e)return [];for(var t=le(e-1),r=arguments[0],n=e;n--;)t[n-1]=arguments[n];return ft(Na(r)?gi(r):[r],on(t,1))},Pr.cond=function(e){var t=null==e?0:e.length,n=Xi();return e=t?lt(e,(function(e){if("function"!=typeof e[1])throw new ye(r);return [n(e[0]),e[1]]})):[],Bn((function(r){for(var n=-1;++n<t;){var i=e[n];if(rt(i[0],this,r))return rt(i[1],this,r)}}))},Pr.conforms=function(e){return function(e){var t=ws(e);return function(r){return Xr(r,e,t)}}(Wr(e,1))},Pr.constant=Vs,Pr.countBy=ia,Pr.create=function(e,t){var r=Or(e);return null==t?r:Kr(r,t)},Pr.curry=function e(t,r,n){var i=Ui(t,8,void 0,void 0,void 0,void 0,void 0,r=n?void 0:r);return i.placeholder=e.placeholder,i},Pr.curryRight=function e(t,r,n){var i=Ui(t,16,void 0,void 0,void 0,void 0,void 0,r=n?void 0:r);return i.placeholder=e.placeholder,i},Pr.debounce=wa,Pr.defaults=ds,Pr.defaultsDeep=ps,Pr.defer=_a,Pr.delay=Sa,Pr.difference=To,Pr.differenceBy=Ao,Pr.differenceWith=Co,Pr.drop=function(e,t,r){var n=null==e?0:e.length;return n?Kn(e,(t=r||void 0===t?1:ns(t))<0?0:t,n):[]},Pr.dropRight=function(e,t,r){var n=null==e?0:e.length;return n?Kn(e,0,(t=n-(t=r||void 0===t?1:ns(t)))<0?0:t):[]},Pr.dropRightWhile=function(e,t){return e&&e.length?ti(e,Xi(t,3),!0,!0):[]},Pr.dropWhile=function(e,t){return e&&e.length?ti(e,Xi(t,3),!0):[]},Pr.fill=function(e,t,r,n){var i=null==e?0:e.length;return i?(r&&"number"!=typeof r&&so(e,t,r)&&(r=0,n=i),function(e,t,r,n){var i=e.length;for((r=ns(r))<0&&(r=-r>i?0:i+r),(n=void 0===n||n>i?i:ns(n))<0&&(n+=i),n=r>n?0:is(n);r<n;)e[r++]=t;return e}(e,t,r,n)):[]},Pr.filter=function(e,t){return (Na(e)?st:nn)(e,Xi(t,3))},Pr.flatMap=function(e,t){return on(ha(e,t),1)},Pr.flatMapDeep=function(e,t){return on(ha(e,t),1/0)},Pr.flatMapDepth=function(e,t,r){return r=void 0===r?1:ns(r),on(ha(e,t),r)},Pr.flatten=Lo,Pr.flattenDeep=function(e){return (null==e?0:e.length)?on(e,1/0):[]},Pr.flattenDepth=function(e,t){return (null==e?0:e.length)?on(e,t=void 0===t?1:ns(t)):[]},Pr.flip=function(e){return Ui(e,512)},Pr.flow=qs,Pr.flowRight=Ks,Pr.fromPairs=function(e){for(var t=-1,r=null==e?0:e.length,n={};++t<r;){var i=e[t];n[i[0]]=i[1];}return n},Pr.functions=function(e){return null==e?[]:ln(e,ws(e))},Pr.functionsIn=function(e){return null==e?[]:ln(e,_s(e))},Pr.groupBy=ua,Pr.initial=function(e){return (null==e?0:e.length)?Kn(e,0,-1):[]},Pr.intersection=jo,Pr.intersectionBy=Do,Pr.intersectionWith=Bo,Pr.invert=gs,Pr.invertBy=ys,Pr.invokeMap=la,Pr.iteratee=Gs,Pr.keyBy=fa,Pr.keys=ws,Pr.keysIn=_s,Pr.map=ha,Pr.mapKeys=function(e,t){var r={};return t=Xi(t,3),cn(e,(function(e,n,i){$r(r,t(e,n,i),e);})),r},Pr.mapValues=function(e,t){var r={};return t=Xi(t,3),cn(e,(function(e,n,i){$r(r,n,t(e,n,i));})),r},Pr.matches=function(e){return On(Wr(e,1))},Pr.matchesProperty=function(e,t){return Tn(e,Wr(t,1))},Pr.memoize=Ea,Pr.merge=Ss,Pr.mergeWith=Es,Pr.method=Js,Pr.methodOf=Ws,Pr.mixin=Xs,Pr.negate=xa,Pr.nthArg=function(e){return e=ns(e),Bn((function(t){return Cn(t,e)}))},Pr.omit=xs,Pr.omitBy=function(e,t){return ks(e,xa(Xi(t)))},Pr.once=function(e){return ga(2,e)},Pr.orderBy=function(e,t,r,n){return null==e?[]:(Na(t)||(t=null==t?[]:[t]),Na(r=n?void 0:r)||(r=null==r?[]:[r]),Rn(e,t,r))},Pr.over=Qs,Pr.overArgs=Ia,Pr.overEvery=Zs,Pr.overSome=ec,Pr.partial=ka,Pr.partialRight=Pa,Pr.partition=da,Pr.pick=Is,Pr.pickBy=ks,Pr.property=tc,Pr.propertyOf=function(e){return function(t){return null==e?void 0:fn(e,t)}},Pr.pull=Fo,Pr.pullAll=Ho,Pr.pullAllBy=function(e,t,r){return e&&e.length&&t&&t.length?Ln(e,t,Xi(r,2)):e},Pr.pullAllWith=function(e,t,r){return e&&e.length&&t&&t.length?Ln(e,t,void 0,r):e},Pr.pullAt=zo,Pr.range=rc,Pr.rangeRight=nc,Pr.rearg=Oa,Pr.reject=function(e,t){return (Na(e)?st:nn)(e,xa(Xi(t,3)))},Pr.remove=function(e,t){var r=[];if(!e||!e.length)return r;var n=-1,i=[],o=e.length;for(t=Xi(t,3);++n<o;){var a=e[n];t(a,n,e)&&(r.push(a),i.push(n));}return Mn(e,i),r},Pr.rest=function(e,t){if("function"!=typeof e)throw new ye(r);return Bn(e,t=void 0===t?t:ns(t))},Pr.reverse=Vo,Pr.sampleSize=function(e,t,r){return t=(r?so(e,t,r):void 0===t)?1:ns(t),(Na(e)?Ur:Fn)(e,t)},Pr.set=function(e,t,r){return null==e?e:Hn(e,t,r)},Pr.setWith=function(e,t,r,n){return n="function"==typeof n?n:void 0,null==e?e:Hn(e,t,r,n)},Pr.shuffle=function(e){return (Na(e)?Fr:qn)(e)},Pr.slice=function(e,t,r){var n=null==e?0:e.length;return n?(r&&"number"!=typeof r&&so(e,t,r)?(t=0,r=n):(t=null==t?0:ns(t),r=void 0===r?n:ns(r)),Kn(e,t,r)):[]},Pr.sortBy=pa,Pr.sortedUniq=function(e){return e&&e.length?Wn(e):[]},Pr.sortedUniqBy=function(e,t){return e&&e.length?Wn(e,Xi(t,2)):[]},Pr.split=function(e,t,r){return r&&"number"!=typeof r&&so(e,t,r)&&(t=r=void 0),(r=void 0===r?4294967295:r>>>0)?(e=ss(e))&&("string"==typeof t||null!=t&&!Ja(t))&&!(t=Yn(t))&&jt(e)?ui(Vt(e),0,r):e.split(t,r):[]},Pr.spread=function(e,t){if("function"!=typeof e)throw new ye(r);return t=null==t?0:or(ns(t),0),Bn((function(r){var n=r[t],i=ui(r,0,t);return n&&ft(i,n),rt(e,this,i)}))},Pr.tail=function(e){var t=null==e?0:e.length;return t?Kn(e,1,t):[]},Pr.take=function(e,t,r){return e&&e.length?Kn(e,0,(t=r||void 0===t?1:ns(t))<0?0:t):[]},Pr.takeRight=function(e,t,r){var n=null==e?0:e.length;return n?Kn(e,(t=n-(t=r||void 0===t?1:ns(t)))<0?0:t,n):[]},Pr.takeRightWhile=function(e,t){return e&&e.length?ti(e,Xi(t,3),!1,!0):[]},Pr.takeWhile=function(e,t){return e&&e.length?ti(e,Xi(t,3)):[]},Pr.tap=function(e,t){return t(e),e},Pr.throttle=function(e,t,n){var i=!0,o=!0;if("function"!=typeof e)throw new ye(r);return Va(n)&&(i="leading"in n?!!n.leading:i,o="trailing"in n?!!n.trailing:o),wa(e,t,{leading:i,maxWait:t,trailing:o})},Pr.thru=ra,Pr.toArray=ts,Pr.toPairs=Ps,Pr.toPairsIn=Os,Pr.toPath=function(e){return Na(e)?lt(e,ko):Ya(e)?[e]:gi(Io(ss(e)))},Pr.toPlainObject=as,Pr.transform=function(e,t,r){var n=Na(e),i=n||Da(e)||Qa(e);if(t=Xi(t,4),null==r){var o=e&&e.constructor;r=i?n?new o:[]:Va(e)&&Fa(o)?Or($e(e)):{};}return (i?it:cn)(e,(function(e,n,i){return t(r,e,n,i)})),r},Pr.unary=function(e){return va(e,1)},Pr.union=qo,Pr.unionBy=Ko,Pr.unionWith=$o,Pr.uniq=function(e){return e&&e.length?Qn(e):[]},Pr.uniqBy=function(e,t){return e&&e.length?Qn(e,Xi(t,2)):[]},Pr.uniqWith=function(e,t){return t="function"==typeof t?t:void 0,e&&e.length?Qn(e,void 0,t):[]},Pr.unset=function(e,t){return null==e||Zn(e,t)},Pr.unzip=Go,Pr.unzipWith=Jo,Pr.update=function(e,t,r){return null==e?e:ei(e,t,ai(r))},Pr.updateWith=function(e,t,r,n){return n="function"==typeof n?n:void 0,null==e?e:ei(e,t,ai(r),n)},Pr.values=Ts,Pr.valuesIn=function(e){return null==e?[]:Ot(e,_s(e))},Pr.without=Wo,Pr.words=Fs,Pr.wrap=function(e,t){return ka(ai(t),e)},Pr.xor=Xo,Pr.xorBy=Yo,Pr.xorWith=Qo,Pr.zip=Zo,Pr.zipObject=function(e,t){return ii(e||[],t||[],zr)},Pr.zipObjectDeep=function(e,t){return ii(e||[],t||[],Hn)},Pr.zipWith=ea,Pr.entries=Ps,Pr.entriesIn=Os,Pr.extend=us,Pr.extendWith=ls,Xs(Pr,Pr),Pr.add=ac,Pr.attempt=Hs,Pr.camelCase=As,Pr.capitalize=Cs,Pr.ceil=sc,Pr.clamp=function(e,t,r){return void 0===r&&(r=t,t=void 0),void 0!==r&&(r=(r=os(r))==r?r:0),void 0!==t&&(t=(t=os(t))==t?t:0),Jr(os(e),t,r)},Pr.clone=function(e){return Wr(e,4)},Pr.cloneDeep=function(e){return Wr(e,5)},Pr.cloneDeepWith=function(e,t){return Wr(e,5,t="function"==typeof t?t:void 0)},Pr.cloneWith=function(e,t){return Wr(e,4,t="function"==typeof t?t:void 0)},Pr.conformsTo=function(e,t){return null==t||Xr(e,t,ws(t))},Pr.deburr=Rs,Pr.defaultTo=function(e,t){return null==e||e!=e?t:e},Pr.divide=cc,Pr.endsWith=function(e,t,r){e=ss(e),t=Yn(t);var n=e.length,i=r=void 0===r?n:Jr(ns(r),0,n);return (r-=t.length)>=0&&e.slice(r,i)==t},Pr.eq=Ta,Pr.escape=function(e){return (e=ss(e))&&j.test(e)?e.replace(L,Lt):e},Pr.escapeRegExp=function(e){return (e=ss(e))&&q.test(e)?e.replace(V,"\\$&"):e},Pr.every=function(e,t,r){var n=Na(e)?at:tn;return r&&so(e,t,r)&&(t=void 0),n(e,Xi(t,3))},Pr.find=oa,Pr.findIndex=Ro,Pr.findKey=function(e,t){return vt(e,Xi(t,3),cn)},Pr.findLast=aa,Pr.findLastIndex=No,Pr.findLastKey=function(e,t){return vt(e,Xi(t,3),un)},Pr.floor=uc,Pr.forEach=sa,Pr.forEachRight=ca,Pr.forIn=function(e,t){return null==e?e:an(e,Xi(t,3),_s)},Pr.forInRight=function(e,t){return null==e?e:sn(e,Xi(t,3),_s)},Pr.forOwn=function(e,t){return e&&cn(e,Xi(t,3))},Pr.forOwnRight=function(e,t){return e&&un(e,Xi(t,3))},Pr.get=ms,Pr.gt=Aa,Pr.gte=Ca,Pr.has=function(e,t){return null!=e&&no(e,t,mn)},Pr.hasIn=vs,Pr.head=Mo,Pr.identity=$s,Pr.includes=function(e,t,r,n){e=Ma(e)?e:Ts(e),r=r&&!n?ns(r):0;var i=e.length;return r<0&&(r=or(i+r,0)),Xa(e)?r<=i&&e.indexOf(t,r)>-1:!!i&&yt(e,t,r)>-1},Pr.indexOf=function(e,t,r){var n=null==e?0:e.length;if(!n)return -1;var i=null==r?0:ns(r);return i<0&&(i=or(n+i,0)),yt(e,t,i)},Pr.inRange=function(e,t,r){return t=rs(t),void 0===r?(r=t,t=0):r=rs(r),function(e,t,r){return e>=ar(t,r)&&e<or(t,r)}(e=os(e),t,r)},Pr.invoke=bs,Pr.isArguments=Ra,Pr.isArray=Na,Pr.isArrayBuffer=La,Pr.isArrayLike=Ma,Pr.isArrayLikeObject=ja,Pr.isBoolean=function(e){return !0===e||!1===e||qa(e)&&dn(e)==s},Pr.isBuffer=Da,Pr.isDate=Ba,Pr.isElement=function(e){return qa(e)&&1===e.nodeType&&!Ga(e)},Pr.isEmpty=function(e){if(null==e)return !0;if(Ma(e)&&(Na(e)||"string"==typeof e||"function"==typeof e.splice||Da(e)||Qa(e)||Ra(e)))return !e.length;var t=ro(e);if(t==h||t==v)return !e.size;if(fo(e))return !xn(e).length;for(var r in e)if(xe.call(e,r))return !1;return !0},Pr.isEqual=function(e,t){return wn(e,t)},Pr.isEqualWith=function(e,t,r){var n=(r="function"==typeof r?r:void 0)?r(e,t):void 0;return void 0===n?wn(e,t,void 0,r):!!n},Pr.isError=Ua,Pr.isFinite=function(e){return "number"==typeof e&&rr(e)},Pr.isFunction=Fa,Pr.isInteger=Ha,Pr.isLength=za,Pr.isMap=Ka,Pr.isMatch=function(e,t){return e===t||_n(e,t,Qi(t))},Pr.isMatchWith=function(e,t,r){return r="function"==typeof r?r:void 0,_n(e,t,Qi(t),r)},Pr.isNaN=function(e){return $a(e)&&e!=+e},Pr.isNative=function(e){if(lo(e))throw new he("Unsupported core-js use. Try https://npms.io/search?q=ponyfill.");return Sn(e)},Pr.isNil=function(e){return null==e},Pr.isNull=function(e){return null===e},Pr.isNumber=$a,Pr.isObject=Va,Pr.isObjectLike=qa,Pr.isPlainObject=Ga,Pr.isRegExp=Ja,Pr.isSafeInteger=function(e){return Ha(e)&&e>=-9007199254740991&&e<=9007199254740991},Pr.isSet=Wa,Pr.isString=Xa,Pr.isSymbol=Ya,Pr.isTypedArray=Qa,Pr.isUndefined=function(e){return void 0===e},Pr.isWeakMap=function(e){return qa(e)&&ro(e)==b},Pr.isWeakSet=function(e){return qa(e)&&"[object WeakSet]"==dn(e)},Pr.join=function(e,t){return null==e?"":nr.call(e,t)},Pr.kebabCase=Ns,Pr.last=Uo,Pr.lastIndexOf=function(e,t,r){var n=null==e?0:e.length;if(!n)return -1;var i=n;return void 0!==r&&(i=(i=ns(r))<0?or(n+i,0):ar(i,n-1)),t==t?function(e,t,r){for(var n=r+1;n--;)if(e[n]===t)return n;return n}(e,t,i):gt(e,wt,i,!0)},Pr.lowerCase=Ls,Pr.lowerFirst=Ms,Pr.lt=Za,Pr.lte=es,Pr.max=function(e){return e&&e.length?rn(e,$s,pn):void 0},Pr.maxBy=function(e,t){return e&&e.length?rn(e,Xi(t,2),pn):void 0},Pr.mean=function(e){return _t(e,$s)},Pr.meanBy=function(e,t){return _t(e,Xi(t,2))},Pr.min=function(e){return e&&e.length?rn(e,$s,kn):void 0},Pr.minBy=function(e,t){return e&&e.length?rn(e,Xi(t,2),kn):void 0},Pr.stubArray=ic,Pr.stubFalse=oc,Pr.stubObject=function(){return {}},Pr.stubString=function(){return ""},Pr.stubTrue=function(){return !0},Pr.multiply=fc,Pr.nth=function(e,t){return e&&e.length?Cn(e,ns(t)):void 0},Pr.noConflict=function(){return qe._===this&&(qe._=Ce),this},Pr.noop=Ys,Pr.now=ma,Pr.pad=function(e,t,r){e=ss(e);var n=(t=ns(t))?zt(e):0;if(!t||n>=t)return e;var i=(t-n)/2;return Ri(Zt(i),r)+e+Ri(Qt(i),r)},Pr.padEnd=function(e,t,r){e=ss(e);var n=(t=ns(t))?zt(e):0;return t&&n<t?e+Ri(t-n,r):e},Pr.padStart=function(e,t,r){e=ss(e);var n=(t=ns(t))?zt(e):0;return t&&n<t?Ri(t-n,r)+e:e},Pr.parseInt=function(e,t,r){return r||null==t?t=0:t&&(t=+t),cr(ss(e).replace($,""),t||0)},Pr.random=function(e,t,r){if(r&&"boolean"!=typeof r&&so(e,t,r)&&(t=r=void 0),void 0===r&&("boolean"==typeof t?(r=t,t=void 0):"boolean"==typeof e&&(r=e,e=void 0)),void 0===e&&void 0===t?(e=0,t=1):(e=rs(e),void 0===t?(t=e,e=0):t=rs(t)),e>t){var n=e;e=t,t=n;}if(r||e%1||t%1){var i=ur();return ar(e+i*(t-e+Fe("1e-"+((i+"").length-1))),t)}return jn(e,t)},Pr.reduce=function(e,t,r){var n=Na(e)?ht:xt,i=arguments.length<3;return n(e,Xi(t,4),r,i,Zr)},Pr.reduceRight=function(e,t,r){var n=Na(e)?dt:xt,i=arguments.length<3;return n(e,Xi(t,4),r,i,en)},Pr.repeat=function(e,t,r){return t=(r?so(e,t,r):void 0===t)?1:ns(t),Dn(ss(e),t)},Pr.replace=function(){var e=arguments,t=ss(e[0]);return e.length<3?t:t.replace(e[1],e[2])},Pr.result=function(e,t,r){var n=-1,i=(t=si(t,e)).length;for(i||(i=1,e=void 0);++n<i;){var o=null==e?void 0:e[ko(t[n])];void 0===o&&(n=i,o=r),e=Fa(o)?o.call(e):o;}return e},Pr.round=hc,Pr.runInContext=e,Pr.sample=function(e){return (Na(e)?Br:Un)(e)},Pr.size=function(e){if(null==e)return 0;if(Ma(e))return Xa(e)?zt(e):e.length;var t=ro(e);return t==h||t==v?e.size:xn(e).length},Pr.snakeCase=js,Pr.some=function(e,t,r){var n=Na(e)?pt:$n;return r&&so(e,t,r)&&(t=void 0),n(e,Xi(t,3))},Pr.sortedIndex=function(e,t){return Gn(e,t)},Pr.sortedIndexBy=function(e,t,r){return Jn(e,t,Xi(r,2))},Pr.sortedIndexOf=function(e,t){var r=null==e?0:e.length;if(r){var n=Gn(e,t);if(n<r&&Ta(e[n],t))return n}return -1},Pr.sortedLastIndex=function(e,t){return Gn(e,t,!0)},Pr.sortedLastIndexBy=function(e,t,r){return Jn(e,t,Xi(r,2),!0)},Pr.sortedLastIndexOf=function(e,t){if(null==e?0:e.length){var r=Gn(e,t,!0)-1;if(Ta(e[r],t))return r}return -1},Pr.startCase=Ds,Pr.startsWith=function(e,t,r){return e=ss(e),r=null==r?0:Jr(ns(r),0,e.length),t=Yn(t),e.slice(r,r+t.length)==t},Pr.subtract=dc,Pr.sum=function(e){return e&&e.length?It(e,$s):0},Pr.sumBy=function(e,t){return e&&e.length?It(e,Xi(t,2)):0},Pr.template=function(e,t,r){var n=Pr.templateSettings;r&&so(e,t,r)&&(t=void 0),e=ss(e),t=ls({},t,n,Fi);var i,o,a=ls({},t.imports,n.imports,Fi),s=ws(a),c=Ot(a,s),u=0,l=t.interpolate||se,f="__p += '",h=ve((t.escape||se).source+"|"+l.source+"|"+(l===U?Z:se).source+"|"+(t.evaluate||se).source+"|$","g"),d="//# sourceURL="+(xe.call(t,"sourceURL")?(t.sourceURL+"").replace(/[\r\n]/g," "):"lodash.templateSources["+ ++je+"]")+"\n";e.replace(h,(function(t,r,n,a,s,c){return n||(n=a),f+=e.slice(u,c).replace(ce,Mt),r&&(i=!0,f+="' +\n__e("+r+") +\n'"),s&&(o=!0,f+="';\n"+s+";\n__p += '"),n&&(f+="' +\n((__t = ("+n+")) == null ? '' : __t) +\n'"),u=c+t.length,t})),f+="';\n";var p=xe.call(t,"variable")&&t.variable;p||(f="with (obj) {\n"+f+"\n}\n"),f=(o?f.replace(A,""):f).replace(C,"$1").replace(R,"$1;"),f="function("+(p||"obj")+") {\n"+(p?"":"obj || (obj = {});\n")+"var __t, __p = ''"+(i?", __e = _.escape":"")+(o?", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n":";\n")+f+"return __p\n}";var m=Hs((function(){return de(s,d+"return "+f).apply(void 0,c)}));if(m.source=f,Ua(m))throw m;return m},Pr.times=function(e,t){if((e=ns(e))<1||e>9007199254740991)return [];var r=4294967295,n=ar(e,4294967295);e-=4294967295;for(var i=kt(n,t=Xi(t));++r<e;)t(r);return i},Pr.toFinite=rs,Pr.toInteger=ns,Pr.toLength=is,Pr.toLower=function(e){return ss(e).toLowerCase()},Pr.toNumber=os,Pr.toSafeInteger=function(e){return e?Jr(ns(e),-9007199254740991,9007199254740991):0===e?e:0},Pr.toString=ss,Pr.toUpper=function(e){return ss(e).toUpperCase()},Pr.trim=function(e,t,r){if((e=ss(e))&&(r||void 0===t))return e.replace(K,"");if(!e||!(t=Yn(t)))return e;var n=Vt(e),i=Vt(t);return ui(n,At(n,i),Ct(n,i)+1).join("")},Pr.trimEnd=function(e,t,r){if((e=ss(e))&&(r||void 0===t))return e.replace(G,"");if(!e||!(t=Yn(t)))return e;var n=Vt(e);return ui(n,0,Ct(n,Vt(t))+1).join("")},Pr.trimStart=function(e,t,r){if((e=ss(e))&&(r||void 0===t))return e.replace($,"");if(!e||!(t=Yn(t)))return e;var n=Vt(e);return ui(n,At(n,Vt(t))).join("")},Pr.truncate=function(e,t){var r=30,n="...";if(Va(t)){var i="separator"in t?t.separator:i;r="length"in t?ns(t.length):r,n="omission"in t?Yn(t.omission):n;}var o=(e=ss(e)).length;if(jt(e)){var a=Vt(e);o=a.length;}if(r>=o)return e;var s=r-zt(n);if(s<1)return n;var c=a?ui(a,0,s).join(""):e.slice(0,s);if(void 0===i)return c+n;if(a&&(s+=c.length-s),Ja(i)){if(e.slice(s).search(i)){var u,l=c;for(i.global||(i=ve(i.source,ss(ee.exec(i))+"g")),i.lastIndex=0;u=i.exec(l);)var f=u.index;c=c.slice(0,void 0===f?s:f);}}else if(e.indexOf(Yn(i),s)!=s){var h=c.lastIndexOf(i);h>-1&&(c=c.slice(0,h));}return c+n},Pr.unescape=function(e){return (e=ss(e))&&M.test(e)?e.replace(N,qt):e},Pr.uniqueId=function(e){var t=++Ie;return ss(e)+t},Pr.upperCase=Bs,Pr.upperFirst=Us,Pr.each=sa,Pr.eachRight=ca,Pr.first=Mo,Xs(Pr,(lc={},cn(Pr,(function(e,t){xe.call(Pr.prototype,t)||(lc[t]=e);})),lc),{chain:!1}),Pr.VERSION="4.17.15",it(["bind","bindKey","curry","curryRight","partial","partialRight"],(function(e){Pr[e].placeholder=Pr;})),it(["drop","take"],(function(e,t){Cr.prototype[e]=function(r){r=void 0===r?1:or(ns(r),0);var n=this.__filtered__&&!t?new Cr(this):this.clone();return n.__filtered__?n.__takeCount__=ar(r,n.__takeCount__):n.__views__.push({size:ar(r,4294967295),type:e+(n.__dir__<0?"Right":"")}),n},Cr.prototype[e+"Right"]=function(t){return this.reverse()[e](t).reverse()};})),it(["filter","map","takeWhile"],(function(e,t){var r=t+1,n=1==r||3==r;Cr.prototype[e]=function(e){var t=this.clone();return t.__iteratees__.push({iteratee:Xi(e,3),type:r}),t.__filtered__=t.__filtered__||n,t};})),it(["head","last"],(function(e,t){var r="take"+(t?"Right":"");Cr.prototype[e]=function(){return this[r](1).value()[0]};})),it(["initial","tail"],(function(e,t){var r="drop"+(t?"":"Right");Cr.prototype[e]=function(){return this.__filtered__?new Cr(this):this[r](1)};})),Cr.prototype.compact=function(){return this.filter($s)},Cr.prototype.find=function(e){return this.filter(e).head()},Cr.prototype.findLast=function(e){return this.reverse().find(e)},Cr.prototype.invokeMap=Bn((function(e,t){return "function"==typeof e?new Cr(this):this.map((function(r){return yn(r,e,t)}))})),Cr.prototype.reject=function(e){return this.filter(xa(Xi(e)))},Cr.prototype.slice=function(e,t){e=ns(e);var r=this;return r.__filtered__&&(e>0||t<0)?new Cr(r):(e<0?r=r.takeRight(-e):e&&(r=r.drop(e)),void 0!==t&&(r=(t=ns(t))<0?r.dropRight(-t):r.take(t-e)),r)},Cr.prototype.takeRightWhile=function(e){return this.reverse().takeWhile(e).reverse()},Cr.prototype.toArray=function(){return this.take(4294967295)},cn(Cr.prototype,(function(e,t){var r=/^(?:filter|find|map|reject)|While$/.test(t),n=/^(?:head|last)$/.test(t),i=Pr[n?"take"+("last"==t?"Right":""):t],o=n||/^find/.test(t);i&&(Pr.prototype[t]=function(){var t=this.__wrapped__,a=n?[1]:arguments,s=t instanceof Cr,c=a[0],u=s||Na(t),l=function(e){var t=i.apply(Pr,ft([e],a));return n&&f?t[0]:t};u&&r&&"function"==typeof c&&1!=c.length&&(s=u=!1);var f=this.__chain__,h=!!this.__actions__.length,d=o&&!f,p=s&&!h;if(!o&&u){t=p?t:new Cr(this);var m=e.apply(t,a);return m.__actions__.push({func:ra,args:[l],thisArg:void 0}),new Ar(m,f)}return d&&p?e.apply(this,a):(m=this.thru(l),d?n?m.value()[0]:m.value():m)});})),it(["pop","push","shift","sort","splice","unshift"],(function(e){var t=be[e],r=/^(?:push|sort|unshift)$/.test(e)?"tap":"thru",n=/^(?:pop|shift)$/.test(e);Pr.prototype[e]=function(){var e=arguments;if(n&&!this.__chain__){var i=this.value();return t.apply(Na(i)?i:[],e)}return this[r]((function(r){return t.apply(Na(r)?r:[],e)}))};})),cn(Cr.prototype,(function(e,t){var r=Pr[t];if(r){var n=r.name+"";xe.call(yr,n)||(yr[n]=[]),yr[n].push({name:t,func:r});}})),yr[Oi(void 0,2).name]=[{name:"wrapper",func:void 0}],Cr.prototype.clone=function(){var e=new Cr(this.__wrapped__);return e.__actions__=gi(this.__actions__),e.__dir__=this.__dir__,e.__filtered__=this.__filtered__,e.__iteratees__=gi(this.__iteratees__),e.__takeCount__=this.__takeCount__,e.__views__=gi(this.__views__),e},Cr.prototype.reverse=function(){if(this.__filtered__){var e=new Cr(this);e.__dir__=-1,e.__filtered__=!0;}else (e=this.clone()).__dir__*=-1;return e},Cr.prototype.value=function(){var e=this.__wrapped__.value(),t=this.__dir__,r=Na(e),n=t<0,i=r?e.length:0,o=function(e,t,r){var n=-1,i=r.length;for(;++n<i;){var o=r[n],a=o.size;switch(o.type){case"drop":e+=a;break;case"dropRight":t-=a;break;case"take":t=ar(t,e+a);break;case"takeRight":e=or(e,t-a);}}return {start:e,end:t}}(0,i,this.__views__),a=o.start,s=o.end,c=s-a,u=n?s:a-1,l=this.__iteratees__,f=l.length,h=0,d=ar(c,this.__takeCount__);if(!r||!n&&i==c&&d==c)return ri(e,this.__actions__);var p=[];e:for(;c--&&h<d;){for(var m=-1,v=e[u+=t];++m<f;){var g=l[m],y=g.iteratee,b=g.type,w=y(v);if(2==b)v=w;else if(!w){if(1==b)continue e;break e}}p[h++]=v;}return p},Pr.prototype.at=na,Pr.prototype.chain=function(){return ta(this)},Pr.prototype.commit=function(){return new Ar(this.value(),this.__chain__)},Pr.prototype.next=function(){void 0===this.__values__&&(this.__values__=ts(this.value()));var e=this.__index__>=this.__values__.length;return {done:e,value:e?void 0:this.__values__[this.__index__++]}},Pr.prototype.plant=function(e){for(var t,r=this;r instanceof Tr;){var n=Oo(r);n.__index__=0,n.__values__=void 0,t?i.__wrapped__=n:t=n;var i=n;r=r.__wrapped__;}return i.__wrapped__=e,t},Pr.prototype.reverse=function(){var e=this.__wrapped__;if(e instanceof Cr){var t=e;return this.__actions__.length&&(t=new Cr(this)),(t=t.reverse()).__actions__.push({func:ra,args:[Vo],thisArg:void 0}),new Ar(t,this.__chain__)}return this.thru(Vo)},Pr.prototype.toJSON=Pr.prototype.valueOf=Pr.prototype.value=function(){return ri(this.__wrapped__,this.__actions__)},Pr.prototype.first=Pr.prototype.head,$t&&(Pr.prototype[$t]=function(){return this}),Pr}();$e?(($e.exports=Kt)._=Kt,Ke._=Kt):qe._=Kt;}).call(Wn);})));const{validate:Ec}=Va;var xc={Encoder:class{constructor(e){if(!Ec(e))throw new Error("JSON is invalid. Cannot construct Encoder.");this.json=e;}constructRootMap(){return Object.keys(this.json).map(e=>{let t=this.json[e];return "string"==typeof t&&(t=uc.encode(re.from(t,"hex"))),t instanceof Array&&("anchors"===e&&(t=this.constructAnchorsMap(t)),"path"===e&&(t=this.constructPathMap(t))),[qa.root[e],t]})}constructAnchorsMap(e){return e.map(e=>{let t=e.split(":");return t.shift(),t.map((e,r)=>0===r?[r,qa.chain[e].id]:1===r?[r,qa.chain[t[r-1]].networks[e]]:[r,uc.encode(re.from(e,"hex"))])})}constructPathMap(e){return Sc.flatten(e.map(e=>Object.keys(e).map(t=>[qa.path[t],uc.encode(re.from(e[t],"hex"))])))}encode(){const e=this.constructRootMap(),t=uc.encode(e);return _c.encode("base58btc",t)}},Decoder:class{constructor(e){if(!_c.isEncoded(e))throw new Error("Base58 string is invalid. Cannot construct Decoder.");this.base58=e;}constructRootJSON(e){const t=Sc.invert(qa.root);return e.reduce((e,r)=>{const n=t[r[0]];let i=r[1];return i instanceof Array&&("anchors"===n&&(i=this.constructAnchorsJSON(i)),"path"===n&&(i=this.constructPathJSON(i))),i instanceof re&&(i=uc.decode(i).toString("hex")),e[n]=i,e},{})}constructAnchorsJSON(e){const t=Sc.invertBy(qa.chain,e=>e.id);return e.map(e=>e.reduce((e,r)=>{if(0===r[0])return `${e}:${t[r[1]]}`;if(1===r[0]){const t=e.split(":").pop();return `${e}:${Sc.invert(qa.chain[t].networks)[r[1]]}`}return `${e}:${uc.decode(r[1]).toString("hex")}`},"blink"))}constructPathJSON(e){const t=Sc.invert(qa.path);return e.map(e=>({[t[e[0]]]:uc.decode(e[1]).toString("hex")}))}decode(){const e=_c.decode(this.base58),t=uc.decode(e);return this.constructRootJSON(t)}}}.Decoder;function Ic(e,t){const r=[];switch(t){case c.V1_1:case c.V1_2:if(e.constructor===Array)for(const t in e){const n=e[t],i="jobTitle"in n?n.jobTitle:null,o="name"in n?n.name:null,a=new L(n.image,i,o);r.push(a);}else {const t=new L(e,null,null);r.push(t);}break;case c.V2_0:for(const t in e){const n=e[t],i=new L(n.image,n.jobTitle,n.name);r.push(i);}}return r}const kc={1:function(e){const t=e.certificate||e.document.certificate,r=e.recipient||e.document.recipient,n=e.document.assertion,i=e.receipt,o=void 0===i?c.V1_1:c.V1_2;let{image:a,description:s,issuer:u,subtitle:l}=t;const f=r.publicKey,h=_i.certificates.getChain(f),d=n.expires,p=n.uid,m=n.issuedOn,v=n.metadataJson,g=`${r.givenName} ${r.familyName}`,y=n.id,b=r.revocationKey||null,w=u.image,_=e.document.signature,S=Ic(e.document&&e.document.assertion&&e.document.assertion["image:signature"],o);return "object"==typeof l&&(l=l.display?l.content:""),{certificateImage:a,chain:h,description:s,expires:d,id:p,issuedOn:m,issuer:u,metadataJson:v,name:t.title||t.name,publicKey:f,receipt:i,recipientFullName:g,recordLink:y,revocationKey:b,sealImage:w,signature:_,signatureImage:S,subtitle:l,version:o}},2:function(e){const{id:t,expires:r,signature:n,badge:i}=e,{image:o,name:a,description:s,subtitle:u,issuer:l}=i,f=e.verification.publicKey||e.verification.creator,h=e.recipientProfile||e.recipient.recipientProfile,d=c.V2_0;return {certificateImage:o,chain:_i.certificates.getChain(f,e.signature),description:s,expires:r,id:t,issuedOn:e.issuedOn,issuer:l,metadataJson:e.metadataJson,name:a,publicKey:h.publicKey,receipt:n,recipientFullName:h.name,recordLink:e.id,revocationKey:null,sealImage:l.image,signature:null,signatureImage:Ic(i.signatureLines,d),subtitle:u,version:d}},3:function(e){const t=function(e){return new xc(e.proofValue).decode()}(e.proof),{issuer:r}=e;return {chain:_i.certificates.getChain("",t),issuer:r,receipt:t,version:c.V3_0_alpha}}};function Pc(e){try{const t=function(e){"string"==typeof e&&(e=[e]);const t=e.filter(e=>"string"==typeof e).find(e=>e.toLowerCase().indexOf("blockcerts")>0).split("/").filter(e=>""!==e);return Object.keys(kc).filter(e=>function(e,t){return e.some(e=>e.indexOf(`v${t}`)>-1||e.indexOf(`${t}.`)>-1)}(t,e))[0]}(e["@context"]),r=kc[t](e);return r.isFormatValid=!0,r}catch(e){return {isFormatValid:!1}}}var Oc=Yn((function(e,t){var r;t=e.exports=$,r="object"==typeof ft&&ft.env&&ft.env.NODE_DEBUG&&/\bsemver\b/i.test(ft.env.NODE_DEBUG)?function(){var e=Array.prototype.slice.call(arguments,0);e.unshift("SEMVER"),console.log.apply(console,e);}:function(){},t.SEMVER_SPEC_VERSION="2.0.0";var n=Number.MAX_SAFE_INTEGER||9007199254740991,i=t.re=[],o=t.src=[],a=0,s=a++;o[s]="0|[1-9]\\d*";var c=a++;o[c]="[0-9]+";var u=a++;o[u]="\\d*[a-zA-Z-][a-zA-Z0-9-]*";var l=a++;o[l]="("+o[s]+")\\.("+o[s]+")\\.("+o[s]+")";var f=a++;o[f]="("+o[c]+")\\.("+o[c]+")\\.("+o[c]+")";var h=a++;o[h]="(?:"+o[s]+"|"+o[u]+")";var d=a++;o[d]="(?:"+o[c]+"|"+o[u]+")";var p=a++;o[p]="(?:-("+o[h]+"(?:\\."+o[h]+")*))";var m=a++;o[m]="(?:-?("+o[d]+"(?:\\."+o[d]+")*))";var v=a++;o[v]="[0-9A-Za-z-]+";var g=a++;o[g]="(?:\\+("+o[v]+"(?:\\."+o[v]+")*))";var y=a++,b="v?"+o[l]+o[p]+"?"+o[g]+"?";o[y]="^"+b+"$";var w="[v=\\s]*"+o[f]+o[m]+"?"+o[g]+"?",_=a++;o[_]="^"+w+"$";var S=a++;o[S]="((?:<|>)?=?)";var E=a++;o[E]=o[c]+"|x|X|\\*";var x=a++;o[x]=o[s]+"|x|X|\\*";var I=a++;o[I]="[v=\\s]*("+o[x]+")(?:\\.("+o[x]+")(?:\\.("+o[x]+")(?:"+o[p]+")?"+o[g]+"?)?)?";var k=a++;o[k]="[v=\\s]*("+o[E]+")(?:\\.("+o[E]+")(?:\\.("+o[E]+")(?:"+o[m]+")?"+o[g]+"?)?)?";var P=a++;o[P]="^"+o[S]+"\\s*"+o[I]+"$";var O=a++;o[O]="^"+o[S]+"\\s*"+o[k]+"$";var T=a++;o[T]="(?:^|[^\\d])(\\d{1,16})(?:\\.(\\d{1,16}))?(?:\\.(\\d{1,16}))?(?:$|[^\\d])";var A=a++;o[A]="(?:~>?)";var C=a++;o[C]="(\\s*)"+o[A]+"\\s+",i[C]=new RegExp(o[C],"g");var R=a++;o[R]="^"+o[A]+o[I]+"$";var N=a++;o[N]="^"+o[A]+o[k]+"$";var L=a++;o[L]="(?:\\^)";var M=a++;o[M]="(\\s*)"+o[L]+"\\s+",i[M]=new RegExp(o[M],"g");var j=a++;o[j]="^"+o[L]+o[I]+"$";var D=a++;o[D]="^"+o[L]+o[k]+"$";var B=a++;o[B]="^"+o[S]+"\\s*("+w+")$|^$";var U=a++;o[U]="^"+o[S]+"\\s*("+b+")$|^$";var F=a++;o[F]="(\\s*)"+o[S]+"\\s*("+w+"|"+o[I]+")",i[F]=new RegExp(o[F],"g");var H=a++;o[H]="^\\s*("+o[I]+")\\s+-\\s+("+o[I]+")\\s*$";var z=a++;o[z]="^\\s*("+o[k]+")\\s+-\\s+("+o[k]+")\\s*$";var V=a++;o[V]="(<|>)?=?\\s*\\*";for(var q=0;q<35;q++)r(q,o[q]),i[q]||(i[q]=new RegExp(o[q]));function K(e,t){if(t&&"object"==typeof t||(t={loose:!!t,includePrerelease:!1}),e instanceof $)return e;if("string"!=typeof e)return null;if(e.length>256)return null;if(!(t.loose?i[_]:i[y]).test(e))return null;try{return new $(e,t)}catch(e){return null}}function $(e,t){if(t&&"object"==typeof t||(t={loose:!!t,includePrerelease:!1}),e instanceof $){if(e.loose===t.loose)return e;e=e.version;}else if("string"!=typeof e)throw new TypeError("Invalid Version: "+e);if(e.length>256)throw new TypeError("version is longer than 256 characters");if(!(this instanceof $))return new $(e,t);r("SemVer",e,t),this.options=t,this.loose=!!t.loose;var o=e.trim().match(t.loose?i[_]:i[y]);if(!o)throw new TypeError("Invalid Version: "+e);if(this.raw=e,this.major=+o[1],this.minor=+o[2],this.patch=+o[3],this.major>n||this.major<0)throw new TypeError("Invalid major version");if(this.minor>n||this.minor<0)throw new TypeError("Invalid minor version");if(this.patch>n||this.patch<0)throw new TypeError("Invalid patch version");o[4]?this.prerelease=o[4].split(".").map((function(e){if(/^[0-9]+$/.test(e)){var t=+e;if(t>=0&&t<n)return t}return e})):this.prerelease=[],this.build=o[5]?o[5].split("."):[],this.format();}t.parse=K,t.valid=function(e,t){var r=K(e,t);return r?r.version:null},t.clean=function(e,t){var r=K(e.trim().replace(/^[=v]+/,""),t);return r?r.version:null},t.SemVer=$,$.prototype.format=function(){return this.version=this.major+"."+this.minor+"."+this.patch,this.prerelease.length&&(this.version+="-"+this.prerelease.join(".")),this.version},$.prototype.toString=function(){return this.version},$.prototype.compare=function(e){return r("SemVer.compare",this.version,this.options,e),e instanceof $||(e=new $(e,this.options)),this.compareMain(e)||this.comparePre(e)},$.prototype.compareMain=function(e){return e instanceof $||(e=new $(e,this.options)),J(this.major,e.major)||J(this.minor,e.minor)||J(this.patch,e.patch)},$.prototype.comparePre=function(e){if(e instanceof $||(e=new $(e,this.options)),this.prerelease.length&&!e.prerelease.length)return -1;if(!this.prerelease.length&&e.prerelease.length)return 1;if(!this.prerelease.length&&!e.prerelease.length)return 0;var t=0;do{var n=this.prerelease[t],i=e.prerelease[t];if(r("prerelease compare",t,n,i),void 0===n&&void 0===i)return 0;if(void 0===i)return 1;if(void 0===n)return -1;if(n!==i)return J(n,i)}while(++t)},$.prototype.inc=function(e,t){switch(e){case"premajor":this.prerelease.length=0,this.patch=0,this.minor=0,this.major++,this.inc("pre",t);break;case"preminor":this.prerelease.length=0,this.patch=0,this.minor++,this.inc("pre",t);break;case"prepatch":this.prerelease.length=0,this.inc("patch",t),this.inc("pre",t);break;case"prerelease":0===this.prerelease.length&&this.inc("patch",t),this.inc("pre",t);break;case"major":0===this.minor&&0===this.patch&&0!==this.prerelease.length||this.major++,this.minor=0,this.patch=0,this.prerelease=[];break;case"minor":0===this.patch&&0!==this.prerelease.length||this.minor++,this.patch=0,this.prerelease=[];break;case"patch":0===this.prerelease.length&&this.patch++,this.prerelease=[];break;case"pre":if(0===this.prerelease.length)this.prerelease=[0];else {for(var r=this.prerelease.length;--r>=0;)"number"==typeof this.prerelease[r]&&(this.prerelease[r]++,r=-2);-1===r&&this.prerelease.push(0);}t&&(this.prerelease[0]===t?isNaN(this.prerelease[1])&&(this.prerelease=[t,0]):this.prerelease=[t,0]);break;default:throw new Error("invalid increment argument: "+e)}return this.format(),this.raw=this.version,this},t.inc=function(e,t,r,n){"string"==typeof r&&(n=r,r=void 0);try{return new $(e,r).inc(t,n).version}catch(e){return null}},t.diff=function(e,t){if(Q(e,t))return null;var r=K(e),n=K(t),i="";if(r.prerelease.length||n.prerelease.length){i="pre";var o="prerelease";}for(var a in r)if(("major"===a||"minor"===a||"patch"===a)&&r[a]!==n[a])return i+a;return o},t.compareIdentifiers=J;var G=/^[0-9]+$/;function J(e,t){var r=G.test(e),n=G.test(t);return r&&n&&(e=+e,t=+t),e===t?0:r&&!n?-1:n&&!r?1:e<t?-1:1}function W(e,t,r){return new $(e,r).compare(new $(t,r))}function X(e,t,r){return W(e,t,r)>0}function Y(e,t,r){return W(e,t,r)<0}function Q(e,t,r){return 0===W(e,t,r)}function Z(e,t,r){return 0!==W(e,t,r)}function ee(e,t,r){return W(e,t,r)>=0}function te(e,t,r){return W(e,t,r)<=0}function re(e,t,r,n){switch(t){case"===":return "object"==typeof e&&(e=e.version),"object"==typeof r&&(r=r.version),e===r;case"!==":return "object"==typeof e&&(e=e.version),"object"==typeof r&&(r=r.version),e!==r;case"":case"=":case"==":return Q(e,r,n);case"!=":return Z(e,r,n);case">":return X(e,r,n);case">=":return ee(e,r,n);case"<":return Y(e,r,n);case"<=":return te(e,r,n);default:throw new TypeError("Invalid operator: "+t)}}function ne(e,t){if(t&&"object"==typeof t||(t={loose:!!t,includePrerelease:!1}),e instanceof ne){if(e.loose===!!t.loose)return e;e=e.value;}if(!(this instanceof ne))return new ne(e,t);r("comparator",e,t),this.options=t,this.loose=!!t.loose,this.parse(e),this.semver===ie?this.value="":this.value=this.operator+this.semver.version,r("comp",this);}t.rcompareIdentifiers=function(e,t){return J(t,e)},t.major=function(e,t){return new $(e,t).major},t.minor=function(e,t){return new $(e,t).minor},t.patch=function(e,t){return new $(e,t).patch},t.compare=W,t.compareLoose=function(e,t){return W(e,t,!0)},t.rcompare=function(e,t,r){return W(t,e,r)},t.sort=function(e,r){return e.sort((function(e,n){return t.compare(e,n,r)}))},t.rsort=function(e,r){return e.sort((function(e,n){return t.rcompare(e,n,r)}))},t.gt=X,t.lt=Y,t.eq=Q,t.neq=Z,t.gte=ee,t.lte=te,t.cmp=re,t.Comparator=ne;var ie={};function oe(e,t){if(t&&"object"==typeof t||(t={loose:!!t,includePrerelease:!1}),e instanceof oe)return e.loose===!!t.loose&&e.includePrerelease===!!t.includePrerelease?e:new oe(e.raw,t);if(e instanceof ne)return new oe(e.value,t);if(!(this instanceof oe))return new oe(e,t);if(this.options=t,this.loose=!!t.loose,this.includePrerelease=!!t.includePrerelease,this.raw=e,this.set=e.split(/\s*\|\|\s*/).map((function(e){return this.parseRange(e.trim())}),this).filter((function(e){return e.length})),!this.set.length)throw new TypeError("Invalid SemVer Range: "+e);this.format();}function ae(e){return !e||"x"===e.toLowerCase()||"*"===e}function se(e,t,r,n,i,o,a,s,c,u,l,f,h){return ((t=ae(r)?"":ae(n)?">="+r+".0.0":ae(i)?">="+r+"."+n+".0":">="+t)+" "+(s=ae(c)?"":ae(u)?"<"+(+c+1)+".0.0":ae(l)?"<"+c+"."+(+u+1)+".0":f?"<="+c+"."+u+"."+l+"-"+f:"<="+s)).trim()}function ce(e,t,n){for(var i=0;i<e.length;i++)if(!e[i].test(t))return !1;if(t.prerelease.length&&!n.includePrerelease){for(i=0;i<e.length;i++)if(r(e[i].semver),e[i].semver!==ie&&e[i].semver.prerelease.length>0){var o=e[i].semver;if(o.major===t.major&&o.minor===t.minor&&o.patch===t.patch)return !0}return !1}return !0}function ue(e,t,r){try{t=new oe(t,r);}catch(e){return !1}return t.test(e)}function le(e,t,r,n){var i,o,a,s,c;switch(e=new $(e,n),t=new oe(t,n),r){case">":i=X,o=te,a=Y,s=">",c=">=";break;case"<":i=Y,o=ee,a=X,s="<",c="<=";break;default:throw new TypeError('Must provide a hilo val of "<" or ">"')}if(ue(e,t,n))return !1;for(var u=0;u<t.set.length;++u){var l=t.set[u],f=null,h=null;if(l.forEach((function(e){e.semver===ie&&(e=new ne(">=0.0.0")),f=f||e,h=h||e,i(e.semver,f.semver,n)?f=e:a(e.semver,h.semver,n)&&(h=e);})),f.operator===s||f.operator===c)return !1;if((!h.operator||h.operator===s)&&o(e,h.semver))return !1;if(h.operator===c&&a(e,h.semver))return !1}return !0}ne.prototype.parse=function(e){var t=this.options.loose?i[B]:i[U],r=e.match(t);if(!r)throw new TypeError("Invalid comparator: "+e);this.operator=r[1],"="===this.operator&&(this.operator=""),r[2]?this.semver=new $(r[2],this.options.loose):this.semver=ie;},ne.prototype.toString=function(){return this.value},ne.prototype.test=function(e){return r("Comparator.test",e,this.options.loose),this.semver===ie||("string"==typeof e&&(e=new $(e,this.options)),re(e,this.operator,this.semver,this.options))},ne.prototype.intersects=function(e,t){if(!(e instanceof ne))throw new TypeError("a Comparator is required");var r;if(t&&"object"==typeof t||(t={loose:!!t,includePrerelease:!1}),""===this.operator)return r=new oe(e.value,t),ue(this.value,r,t);if(""===e.operator)return r=new oe(this.value,t),ue(e.semver,r,t);var n=!(">="!==this.operator&&">"!==this.operator||">="!==e.operator&&">"!==e.operator),i=!("<="!==this.operator&&"<"!==this.operator||"<="!==e.operator&&"<"!==e.operator),o=this.semver.version===e.semver.version,a=!(">="!==this.operator&&"<="!==this.operator||">="!==e.operator&&"<="!==e.operator),s=re(this.semver,"<",e.semver,t)&&(">="===this.operator||">"===this.operator)&&("<="===e.operator||"<"===e.operator),c=re(this.semver,">",e.semver,t)&&("<="===this.operator||"<"===this.operator)&&(">="===e.operator||">"===e.operator);return n||i||o&&a||s||c},t.Range=oe,oe.prototype.format=function(){return this.range=this.set.map((function(e){return e.join(" ").trim()})).join("||").trim(),this.range},oe.prototype.toString=function(){return this.range},oe.prototype.parseRange=function(e){var t=this.options.loose;e=e.trim();var n=t?i[z]:i[H];e=e.replace(n,se),r("hyphen replace",e),e=e.replace(i[F],"$1$2$3"),r("comparator trim",e,i[F]),e=(e=(e=e.replace(i[C],"$1~")).replace(i[M],"$1^")).split(/\s+/).join(" ");var o=t?i[B]:i[U],a=e.split(" ").map((function(e){return function(e,t){return r("comp",e,t),e=function(e,t){return e.trim().split(/\s+/).map((function(e){return function(e,t){r("caret",e,t);var n=t.loose?i[D]:i[j];return e.replace(n,(function(t,n,i,o,a){var s;return r("caret",e,t,n,i,o,a),ae(n)?s="":ae(i)?s=">="+n+".0.0 <"+(+n+1)+".0.0":ae(o)?s="0"===n?">="+n+"."+i+".0 <"+n+"."+(+i+1)+".0":">="+n+"."+i+".0 <"+(+n+1)+".0.0":a?(r("replaceCaret pr",a),s="0"===n?"0"===i?">="+n+"."+i+"."+o+"-"+a+" <"+n+"."+i+"."+(+o+1):">="+n+"."+i+"."+o+"-"+a+" <"+n+"."+(+i+1)+".0":">="+n+"."+i+"."+o+"-"+a+" <"+(+n+1)+".0.0"):(r("no pr"),s="0"===n?"0"===i?">="+n+"."+i+"."+o+" <"+n+"."+i+"."+(+o+1):">="+n+"."+i+"."+o+" <"+n+"."+(+i+1)+".0":">="+n+"."+i+"."+o+" <"+(+n+1)+".0.0"),r("caret return",s),s}))}(e,t)})).join(" ")}(e,t),r("caret",e),e=function(e,t){return e.trim().split(/\s+/).map((function(e){return function(e,t){var n=t.loose?i[N]:i[R];return e.replace(n,(function(t,n,i,o,a){var s;return r("tilde",e,t,n,i,o,a),ae(n)?s="":ae(i)?s=">="+n+".0.0 <"+(+n+1)+".0.0":ae(o)?s=">="+n+"."+i+".0 <"+n+"."+(+i+1)+".0":a?(r("replaceTilde pr",a),s=">="+n+"."+i+"."+o+"-"+a+" <"+n+"."+(+i+1)+".0"):s=">="+n+"."+i+"."+o+" <"+n+"."+(+i+1)+".0",r("tilde return",s),s}))}(e,t)})).join(" ")}(e,t),r("tildes",e),e=function(e,t){return r("replaceXRanges",e,t),e.split(/\s+/).map((function(e){return function(e,t){e=e.trim();var n=t.loose?i[O]:i[P];return e.replace(n,(function(t,n,i,o,a,s){r("xRange",e,t,n,i,o,a,s);var c=ae(i),u=c||ae(o),l=u||ae(a);return "="===n&&l&&(n=""),c?t=">"===n||"<"===n?"<0.0.0":"*":n&&l?(u&&(o=0),a=0,">"===n?(n=">=",u?(i=+i+1,o=0,a=0):(o=+o+1,a=0)):"<="===n&&(n="<",u?i=+i+1:o=+o+1),t=n+i+"."+o+"."+a):u?t=">="+i+".0.0 <"+(+i+1)+".0.0":l&&(t=">="+i+"."+o+".0 <"+i+"."+(+o+1)+".0"),r("xRange return",t),t}))}(e,t)})).join(" ")}(e,t),r("xrange",e),e=function(e,t){return r("replaceStars",e,t),e.trim().replace(i[V],"")}(e,t),r("stars",e),e}(e,this.options)}),this).join(" ").split(/\s+/);return this.options.loose&&(a=a.filter((function(e){return !!e.match(o)}))),a=a.map((function(e){return new ne(e,this.options)}),this)},oe.prototype.intersects=function(e,t){if(!(e instanceof oe))throw new TypeError("a Range is required");return this.set.some((function(r){return r.every((function(r){return e.set.some((function(e){return e.every((function(e){return r.intersects(e,t)}))}))}))}))},t.toComparators=function(e,t){return new oe(e,t).set.map((function(e){return e.map((function(e){return e.value})).join(" ").trim().split(" ")}))},oe.prototype.test=function(e){if(!e)return !1;"string"==typeof e&&(e=new $(e,this.options));for(var t=0;t<this.set.length;t++)if(ce(this.set[t],e,this.options))return !0;return !1},t.satisfies=ue,t.maxSatisfying=function(e,t,r){var n=null,i=null;try{var o=new oe(t,r);}catch(e){return null}return e.forEach((function(e){o.test(e)&&(n&&-1!==i.compare(e)||(i=new $(n=e,r)));})),n},t.minSatisfying=function(e,t,r){var n=null,i=null;try{var o=new oe(t,r);}catch(e){return null}return e.forEach((function(e){o.test(e)&&(n&&1!==i.compare(e)||(i=new $(n=e,r)));})),n},t.minVersion=function(e,t){e=new oe(e,t);var r=new $("0.0.0");if(e.test(r))return r;if(r=new $("0.0.0-0"),e.test(r))return r;r=null;for(var n=0;n<e.set.length;++n){e.set[n].forEach((function(e){var t=new $(e.semver.version);switch(e.operator){case">":0===t.prerelease.length?t.patch++:t.prerelease.push(0),t.raw=t.format();case"":case">=":r&&!X(r,t)||(r=t);break;case"<":case"<=":break;default:throw new Error("Unexpected operation: "+e.operator)}}));}if(r&&e.test(r))return r;return null},t.validRange=function(e,t){try{return new oe(e,t).range||"*"}catch(e){return null}},t.ltr=function(e,t,r){return le(e,t,"<",r)},t.gtr=function(e,t,r){return le(e,t,">",r)},t.outside=le,t.prerelease=function(e,t){var r=K(e,t);return r&&r.prerelease.length?r.prerelease:null},t.intersects=function(e,t,r){return e=new oe(e,r),t=new oe(t,r),e.intersects(t)},t.coerce=function(e){if(e instanceof $)return e;if("string"!=typeof e)return null;var t=e.match(i[T]);if(null==t)return null;return K(t[1]+"."+(t[2]||"0")+"."+(t[3]||"0"))};}));Oc.SEMVER_SPEC_VERSION,Oc.re,Oc.src,Oc.parse,Oc.valid,Oc.clean,Oc.SemVer,Oc.inc,Oc.diff,Oc.compareIdentifiers,Oc.rcompareIdentifiers,Oc.major,Oc.minor,Oc.patch,Oc.compare,Oc.compareLoose,Oc.rcompare,Oc.sort,Oc.rsort,Oc.gt,Oc.lt,Oc.eq,Oc.neq,Oc.gte,Oc.lte,Oc.cmp,Oc.Comparator,Oc.Range,Oc.toComparators,Oc.satisfies,Oc.maxSatisfying,Oc.minSatisfying,Oc.minVersion,Oc.validRange,Oc.ltr,Oc.gtr,Oc.outside,Oc.prerelease,Oc.intersects,Oc.coerce;const Tc={};var Ac=Tc;const Cc="function"==typeof setImmediate&&setImmediate,Rc=Cc?e=>Cc(e):e=>setTimeout(e,0);function Nc(e,t,r){try{return e(t,r)}catch(e){Qe(()=>{throw e});}}Tc.nextTick="object"==typeof ft?Qe:Rc,Tc.setImmediate=Cc?Rc:Tc.nextTick,Tc.clone=function(e){if(e&&"object"==typeof e){let t;if(Array.isArray(e)){t=[];for(let r=0;r<e.length;++r)t[r]=Tc.clone(e[r]);}else if(Tc.isObject(e)){t={};for(const r in e)t[r]=Tc.clone(e[r]);}else t=e.toString();return t}return e},Tc.isObject=e=>"[object Object]"===Object.prototype.toString.call(e),Tc.isUndefined=e=>void 0===e,Tc.callbackify=e=>async function(...t){const r=t[t.length-1];let n;"function"==typeof r&&t.pop();try{n=await e.apply(null,t);}catch(e){if("function"==typeof r)return Nc(r,e);throw e}return "function"==typeof r?Nc(r,null,n):n};var Lc=class e{constructor(e){this.prefix=e,this.counter=0,this.existing={};}clone(){const t=new e(this.prefix);return t.counter=this.counter,t.existing=Ac.clone(this.existing),t}getId(e){if(e&&e in this.existing)return this.existing[e];const t=this.prefix+this.counter;return this.counter+=1,e&&(this.existing[e]=t),t}hasId(e){return e in this.existing}},Mc={options:{usePureJavaScript:!1}};Mc.md=Mc.md||{};Mc.md.algorithms=Mc.md.algorithms||{};var jc={},Dc=jc,Bc={};jc.encode=function(e,t,r){if("string"!=typeof t)throw new TypeError('"alphabet" must be a string.');if(void 0!==r&&"number"!=typeof r)throw new TypeError('"maxline" must be a number.');var n="";if(e instanceof Uint8Array){var i=0,o=t.length,a=t.charAt(0),s=[0];for(i=0;i<e.length;++i){for(var c=0,u=e[i];c<s.length;++c)u+=s[c]<<8,s[c]=u%o,u=u/o|0;for(;u>0;)s.push(u%o),u=u/o|0;}for(i=0;0===e[i]&&i<e.length-1;++i)n+=a;for(i=s.length-1;i>=0;--i)n+=t[s[i]];}else n=function(e,t){var r=0,n=t.length,i=t.charAt(0),o=[0];for(r=0;r<e.length();++r){for(var a=0,s=e.at(r);a<o.length;++a)s+=o[a]<<8,o[a]=s%n,s=s/n|0;for(;s>0;)o.push(s%n),s=s/n|0;}var c="";for(r=0;0===e.at(r)&&r<e.length()-1;++r)c+=i;for(r=o.length-1;r>=0;--r)c+=t[o[r]];return c}(e,t);if(r){var l=new RegExp(".{1,"+r+"}","g");n=n.match(l).join("\r\n");}return n},jc.decode=function(e,t){if("string"!=typeof e)throw new TypeError('"input" must be a string.');if("string"!=typeof t)throw new TypeError('"alphabet" must be a string.');var r=Bc[t];if(!r){r=Bc[t]=[];for(var n=0;n<t.length;++n)r[t.charCodeAt(n)]=n;}e=e.replace(/\s/g,"");var i=t.length,o=t.charAt(0),a=[0];for(n=0;n<e.length;n++){var s=r[e.charCodeAt(n)];if(void 0===s)return;for(var c=0,u=s;c<a.length;++c)u+=a[c]*i,a[c]=255&u,u>>=8;for(;u>0;)a.push(255&u),u>>=8;}for(var l=0;e[l]===o&&l<e.length-1;++l)a.push(0);return re.from(a.reverse())};Yn((function(e){var t=e.exports=Mc.util=Mc.util||{};function r(e){if(8!==e&&16!==e&&24!==e&&32!==e)throw new Error("Only 8, 16, 24, or 32 bits supported: "+e)}function n(e){if(this.data="",this.read=0,"string"==typeof e)this.data=e;else if(t.isArrayBuffer(e)||t.isArrayBufferView(e))if(e instanceof re)this.data=e.toString("binary");else {var r=new Uint8Array(e);try{this.data=String.fromCharCode.apply(null,r);}catch(e){for(var i=0;i<r.length;++i)this.putByte(r[i]);}}else (e instanceof n||"object"==typeof e&&"string"==typeof e.data&&"number"==typeof e.read)&&(this.data=e.data,this.read=e.read);this._constructedStringLength=0;}!function(){if("function"==typeof setImmediate)return t.setImmediate=function(){return setImmediate.apply(void 0,arguments)},void(t.nextTick=function(e){return setImmediate(e)});if(t.setImmediate=function(e){setTimeout(e,0);},"undefined"!=typeof window&&"function"==typeof window.postMessage){var e="forge.setImmediate",r=[];t.setImmediate=function(t){r.push(t),1===r.length&&window.postMessage(e,"*");},window.addEventListener("message",(function(t){if(t.source===window&&t.data===e){t.stopPropagation();var n=r.slice();r.length=0,n.forEach((function(e){e();}));}}),!0);}if("undefined"!=typeof MutationObserver){var n=Date.now(),i=!0,o=document.createElement("div");r=[];new MutationObserver((function(){var e=r.slice();r.length=0,e.forEach((function(e){e();}));})).observe(o,{attributes:!0});var a=t.setImmediate;t.setImmediate=function(e){Date.now()-n>15?(n=Date.now(),a(e)):(r.push(e),1===r.length&&o.setAttribute("a",i=!i));};}t.nextTick=t.setImmediate;}(),t.isNodejs=void 0!==ft&&ft.versions&&ft.versions.node,t.globalScope=t.isNodejs?Wn:"undefined"==typeof self?window:self,t.isArray=Array.isArray||function(e){return "[object Array]"===Object.prototype.toString.call(e)},t.isArrayBuffer=function(e){return "undefined"!=typeof ArrayBuffer&&e instanceof ArrayBuffer},t.isArrayBufferView=function(e){return e&&t.isArrayBuffer(e.buffer)&&void 0!==e.byteLength},t.ByteBuffer=n,t.ByteStringBuffer=n;t.ByteStringBuffer.prototype._optimizeConstructedString=function(e){this._constructedStringLength+=e,this._constructedStringLength>4096&&(this.data.substr(0,1),this._constructedStringLength=0);},t.ByteStringBuffer.prototype.length=function(){return this.data.length-this.read},t.ByteStringBuffer.prototype.isEmpty=function(){return this.length()<=0},t.ByteStringBuffer.prototype.putByte=function(e){return this.putBytes(String.fromCharCode(e))},t.ByteStringBuffer.prototype.fillWithByte=function(e,t){e=String.fromCharCode(e);for(var r=this.data;t>0;)1&t&&(r+=e),(t>>>=1)>0&&(e+=e);return this.data=r,this._optimizeConstructedString(t),this},t.ByteStringBuffer.prototype.putBytes=function(e){return this.data+=e,this._optimizeConstructedString(e.length),this},t.ByteStringBuffer.prototype.putString=function(e){return this.putBytes(t.encodeUtf8(e))},t.ByteStringBuffer.prototype.putInt16=function(e){return this.putBytes(String.fromCharCode(e>>8&255)+String.fromCharCode(255&e))},t.ByteStringBuffer.prototype.putInt24=function(e){return this.putBytes(String.fromCharCode(e>>16&255)+String.fromCharCode(e>>8&255)+String.fromCharCode(255&e))},t.ByteStringBuffer.prototype.putInt32=function(e){return this.putBytes(String.fromCharCode(e>>24&255)+String.fromCharCode(e>>16&255)+String.fromCharCode(e>>8&255)+String.fromCharCode(255&e))},t.ByteStringBuffer.prototype.putInt16Le=function(e){return this.putBytes(String.fromCharCode(255&e)+String.fromCharCode(e>>8&255))},t.ByteStringBuffer.prototype.putInt24Le=function(e){return this.putBytes(String.fromCharCode(255&e)+String.fromCharCode(e>>8&255)+String.fromCharCode(e>>16&255))},t.ByteStringBuffer.prototype.putInt32Le=function(e){return this.putBytes(String.fromCharCode(255&e)+String.fromCharCode(e>>8&255)+String.fromCharCode(e>>16&255)+String.fromCharCode(e>>24&255))},t.ByteStringBuffer.prototype.putInt=function(e,t){r(t);var n="";do{t-=8,n+=String.fromCharCode(e>>t&255);}while(t>0);return this.putBytes(n)},t.ByteStringBuffer.prototype.putSignedInt=function(e,t){return e<0&&(e+=2<<t-1),this.putInt(e,t)},t.ByteStringBuffer.prototype.putBuffer=function(e){return this.putBytes(e.getBytes())},t.ByteStringBuffer.prototype.getByte=function(){return this.data.charCodeAt(this.read++)},t.ByteStringBuffer.prototype.getInt16=function(){var e=this.data.charCodeAt(this.read)<<8^this.data.charCodeAt(this.read+1);return this.read+=2,e},t.ByteStringBuffer.prototype.getInt24=function(){var e=this.data.charCodeAt(this.read)<<16^this.data.charCodeAt(this.read+1)<<8^this.data.charCodeAt(this.read+2);return this.read+=3,e},t.ByteStringBuffer.prototype.getInt32=function(){var e=this.data.charCodeAt(this.read)<<24^this.data.charCodeAt(this.read+1)<<16^this.data.charCodeAt(this.read+2)<<8^this.data.charCodeAt(this.read+3);return this.read+=4,e},t.ByteStringBuffer.prototype.getInt16Le=function(){var e=this.data.charCodeAt(this.read)^this.data.charCodeAt(this.read+1)<<8;return this.read+=2,e},t.ByteStringBuffer.prototype.getInt24Le=function(){var e=this.data.charCodeAt(this.read)^this.data.charCodeAt(this.read+1)<<8^this.data.charCodeAt(this.read+2)<<16;return this.read+=3,e},t.ByteStringBuffer.prototype.getInt32Le=function(){var e=this.data.charCodeAt(this.read)^this.data.charCodeAt(this.read+1)<<8^this.data.charCodeAt(this.read+2)<<16^this.data.charCodeAt(this.read+3)<<24;return this.read+=4,e},t.ByteStringBuffer.prototype.getInt=function(e){r(e);var t=0;do{t=(t<<8)+this.data.charCodeAt(this.read++),e-=8;}while(e>0);return t},t.ByteStringBuffer.prototype.getSignedInt=function(e){var t=this.getInt(e),r=2<<e-2;return t>=r&&(t-=r<<1),t},t.ByteStringBuffer.prototype.getBytes=function(e){var t;return e?(e=Math.min(this.length(),e),t=this.data.slice(this.read,this.read+e),this.read+=e):0===e?t="":(t=0===this.read?this.data:this.data.slice(this.read),this.clear()),t},t.ByteStringBuffer.prototype.bytes=function(e){return void 0===e?this.data.slice(this.read):this.data.slice(this.read,this.read+e)},t.ByteStringBuffer.prototype.at=function(e){return this.data.charCodeAt(this.read+e)},t.ByteStringBuffer.prototype.setAt=function(e,t){return this.data=this.data.substr(0,this.read+e)+String.fromCharCode(t)+this.data.substr(this.read+e+1),this},t.ByteStringBuffer.prototype.last=function(){return this.data.charCodeAt(this.data.length-1)},t.ByteStringBuffer.prototype.copy=function(){var e=t.createBuffer(this.data);return e.read=this.read,e},t.ByteStringBuffer.prototype.compact=function(){return this.read>0&&(this.data=this.data.slice(this.read),this.read=0),this},t.ByteStringBuffer.prototype.clear=function(){return this.data="",this.read=0,this},t.ByteStringBuffer.prototype.truncate=function(e){var t=Math.max(0,this.length()-e);return this.data=this.data.substr(this.read,t),this.read=0,this},t.ByteStringBuffer.prototype.toHex=function(){for(var e="",t=this.read;t<this.data.length;++t){var r=this.data.charCodeAt(t);r<16&&(e+="0"),e+=r.toString(16);}return e},t.ByteStringBuffer.prototype.toString=function(){return t.decodeUtf8(this.bytes())},t.DataBuffer=function(e,r){r=r||{},this.read=r.readOffset||0,this.growSize=r.growSize||1024;var n=t.isArrayBuffer(e),i=t.isArrayBufferView(e);if(n||i)return this.data=n?new DataView(e):new DataView(e.buffer,e.byteOffset,e.byteLength),void(this.write="writeOffset"in r?r.writeOffset:this.data.byteLength);this.data=new DataView(new ArrayBuffer(0)),this.write=0,null!=e&&this.putBytes(e),"writeOffset"in r&&(this.write=r.writeOffset);},t.DataBuffer.prototype.length=function(){return this.write-this.read},t.DataBuffer.prototype.isEmpty=function(){return this.length()<=0},t.DataBuffer.prototype.accommodate=function(e,t){if(this.length()>=e)return this;t=Math.max(t||this.growSize,e);var r=new Uint8Array(this.data.buffer,this.data.byteOffset,this.data.byteLength),n=new Uint8Array(this.length()+t);return n.set(r),this.data=new DataView(n.buffer),this},t.DataBuffer.prototype.putByte=function(e){return this.accommodate(1),this.data.setUint8(this.write++,e),this},t.DataBuffer.prototype.fillWithByte=function(e,t){this.accommodate(t);for(var r=0;r<t;++r)this.data.setUint8(e);return this},t.DataBuffer.prototype.putBytes=function(e,r){if(t.isArrayBufferView(e)){var n=(i=new Uint8Array(e.buffer,e.byteOffset,e.byteLength)).byteLength-i.byteOffset;return this.accommodate(n),new Uint8Array(this.data.buffer,this.write).set(i),this.write+=n,this}if(t.isArrayBuffer(e)){var i=new Uint8Array(e);return this.accommodate(i.byteLength),new Uint8Array(this.data.buffer).set(i,this.write),this.write+=i.byteLength,this}if(e instanceof t.DataBuffer||"object"==typeof e&&"number"==typeof e.read&&"number"==typeof e.write&&t.isArrayBufferView(e.data)){i=new Uint8Array(e.data.byteLength,e.read,e.length());return this.accommodate(i.byteLength),new Uint8Array(e.data.byteLength,this.write).set(i),this.write+=i.byteLength,this}if(e instanceof t.ByteStringBuffer&&(e=e.data,r="binary"),r=r||"binary","string"==typeof e){var o;if("hex"===r)return this.accommodate(Math.ceil(e.length/2)),o=new Uint8Array(this.data.buffer,this.write),this.write+=t.binary.hex.decode(e,o,this.write),this;if("base64"===r)return this.accommodate(3*Math.ceil(e.length/4)),o=new Uint8Array(this.data.buffer,this.write),this.write+=t.binary.base64.decode(e,o,this.write),this;if("utf8"===r&&(e=t.encodeUtf8(e),r="binary"),"binary"===r||"raw"===r)return this.accommodate(e.length),o=new Uint8Array(this.data.buffer,this.write),this.write+=t.binary.raw.decode(o),this;if("utf16"===r)return this.accommodate(2*e.length),o=new Uint16Array(this.data.buffer,this.write),this.write+=t.text.utf16.encode(o),this;throw new Error("Invalid encoding: "+r)}throw Error("Invalid parameter: "+e)},t.DataBuffer.prototype.putBuffer=function(e){return this.putBytes(e),e.clear(),this},t.DataBuffer.prototype.putString=function(e){return this.putBytes(e,"utf16")},t.DataBuffer.prototype.putInt16=function(e){return this.accommodate(2),this.data.setInt16(this.write,e),this.write+=2,this},t.DataBuffer.prototype.putInt24=function(e){return this.accommodate(3),this.data.setInt16(this.write,e>>8&65535),this.data.setInt8(this.write,e>>16&255),this.write+=3,this},t.DataBuffer.prototype.putInt32=function(e){return this.accommodate(4),this.data.setInt32(this.write,e),this.write+=4,this},t.DataBuffer.prototype.putInt16Le=function(e){return this.accommodate(2),this.data.setInt16(this.write,e,!0),this.write+=2,this},t.DataBuffer.prototype.putInt24Le=function(e){return this.accommodate(3),this.data.setInt8(this.write,e>>16&255),this.data.setInt16(this.write,e>>8&65535,!0),this.write+=3,this},t.DataBuffer.prototype.putInt32Le=function(e){return this.accommodate(4),this.data.setInt32(this.write,e,!0),this.write+=4,this},t.DataBuffer.prototype.putInt=function(e,t){r(t),this.accommodate(t/8);do{t-=8,this.data.setInt8(this.write++,e>>t&255);}while(t>0);return this},t.DataBuffer.prototype.putSignedInt=function(e,t){return r(t),this.accommodate(t/8),e<0&&(e+=2<<t-1),this.putInt(e,t)},t.DataBuffer.prototype.getByte=function(){return this.data.getInt8(this.read++)},t.DataBuffer.prototype.getInt16=function(){var e=this.data.getInt16(this.read);return this.read+=2,e},t.DataBuffer.prototype.getInt24=function(){var e=this.data.getInt16(this.read)<<8^this.data.getInt8(this.read+2);return this.read+=3,e},t.DataBuffer.prototype.getInt32=function(){var e=this.data.getInt32(this.read);return this.read+=4,e},t.DataBuffer.prototype.getInt16Le=function(){var e=this.data.getInt16(this.read,!0);return this.read+=2,e},t.DataBuffer.prototype.getInt24Le=function(){var e=this.data.getInt8(this.read)^this.data.getInt16(this.read+1,!0)<<8;return this.read+=3,e},t.DataBuffer.prototype.getInt32Le=function(){var e=this.data.getInt32(this.read,!0);return this.read+=4,e},t.DataBuffer.prototype.getInt=function(e){r(e);var t=0;do{t=(t<<8)+this.data.getInt8(this.read++),e-=8;}while(e>0);return t},t.DataBuffer.prototype.getSignedInt=function(e){var t=this.getInt(e),r=2<<e-2;return t>=r&&(t-=r<<1),t},t.DataBuffer.prototype.getBytes=function(e){var t;return e?(e=Math.min(this.length(),e),t=this.data.slice(this.read,this.read+e),this.read+=e):0===e?t="":(t=0===this.read?this.data:this.data.slice(this.read),this.clear()),t},t.DataBuffer.prototype.bytes=function(e){return void 0===e?this.data.slice(this.read):this.data.slice(this.read,this.read+e)},t.DataBuffer.prototype.at=function(e){return this.data.getUint8(this.read+e)},t.DataBuffer.prototype.setAt=function(e,t){return this.data.setUint8(e,t),this},t.DataBuffer.prototype.last=function(){return this.data.getUint8(this.write-1)},t.DataBuffer.prototype.copy=function(){return new t.DataBuffer(this)},t.DataBuffer.prototype.compact=function(){if(this.read>0){var e=new Uint8Array(this.data.buffer,this.read),t=new Uint8Array(e.byteLength);t.set(e),this.data=new DataView(t),this.write-=this.read,this.read=0;}return this},t.DataBuffer.prototype.clear=function(){return this.data=new DataView(new ArrayBuffer(0)),this.read=this.write=0,this},t.DataBuffer.prototype.truncate=function(e){return this.write=Math.max(0,this.length()-e),this.read=Math.min(this.read,this.write),this},t.DataBuffer.prototype.toHex=function(){for(var e="",t=this.read;t<this.data.byteLength;++t){var r=this.data.getUint8(t);r<16&&(e+="0"),e+=r.toString(16);}return e},t.DataBuffer.prototype.toString=function(e){var r=new Uint8Array(this.data,this.read,this.length());if("binary"===(e=e||"utf8")||"raw"===e)return t.binary.raw.encode(r);if("hex"===e)return t.binary.hex.encode(r);if("base64"===e)return t.binary.base64.encode(r);if("utf8"===e)return t.text.utf8.decode(r);if("utf16"===e)return t.text.utf16.decode(r);throw new Error("Invalid encoding: "+e)},t.createBuffer=function(e,r){return r=r||"raw",void 0!==e&&"utf8"===r&&(e=t.encodeUtf8(e)),new t.ByteBuffer(e)},t.fillString=function(e,t){for(var r="";t>0;)1&t&&(r+=e),(t>>>=1)>0&&(e+=e);return r},t.xorBytes=function(e,t,r){for(var n="",i="",o="",a=0,s=0;r>0;--r,++a)i=e.charCodeAt(a)^t.charCodeAt(a),s>=10&&(n+=o,o="",s=0),o+=String.fromCharCode(i),++s;return n+=o},t.hexToBytes=function(e){var t="",r=0;for(!0&e.length&&(r=1,t+=String.fromCharCode(parseInt(e[0],16)));r<e.length;r+=2)t+=String.fromCharCode(parseInt(e.substr(r,2),16));return t},t.bytesToHex=function(e){return t.createBuffer(e).toHex()},t.int32ToBytes=function(e){return String.fromCharCode(e>>24&255)+String.fromCharCode(e>>16&255)+String.fromCharCode(e>>8&255)+String.fromCharCode(255&e)};var i="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",o=[62,-1,-1,-1,63,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,64,-1,-1,-1,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,-1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51],a="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";t.encode64=function(e,t){for(var r,n,o,a="",s="",c=0;c<e.length;)r=e.charCodeAt(c++),n=e.charCodeAt(c++),o=e.charCodeAt(c++),a+=i.charAt(r>>2),a+=i.charAt((3&r)<<4|n>>4),isNaN(n)?a+="==":(a+=i.charAt((15&n)<<2|o>>6),a+=isNaN(o)?"=":i.charAt(63&o)),t&&a.length>t&&(s+=a.substr(0,t)+"\r\n",a=a.substr(t));return s+=a},t.decode64=function(e){e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");for(var t,r,n,i,a="",s=0;s<e.length;)t=o[e.charCodeAt(s++)-43],r=o[e.charCodeAt(s++)-43],n=o[e.charCodeAt(s++)-43],i=o[e.charCodeAt(s++)-43],a+=String.fromCharCode(t<<2|r>>4),64!==n&&(a+=String.fromCharCode((15&r)<<4|n>>2),64!==i&&(a+=String.fromCharCode((3&n)<<6|i)));return a},t.encodeUtf8=function(e){return unescape(encodeURIComponent(e))},t.decodeUtf8=function(e){return decodeURIComponent(escape(e))},t.binary={raw:{},hex:{},base64:{},base58:{},baseN:{encode:Dc.encode,decode:Dc.decode}},t.binary.raw.encode=function(e){return String.fromCharCode.apply(null,e)},t.binary.raw.decode=function(e,t,r){var n=t;n||(n=new Uint8Array(e.length));for(var i=r=r||0,o=0;o<e.length;++o)n[i++]=e.charCodeAt(o);return t?i-r:n},t.binary.hex.encode=t.bytesToHex,t.binary.hex.decode=function(e,t,r){var n=t;n||(n=new Uint8Array(Math.ceil(e.length/2)));var i=0,o=r=r||0;for(1&e.length&&(i=1,n[o++]=parseInt(e[0],16));i<e.length;i+=2)n[o++]=parseInt(e.substr(i,2),16);return t?o-r:n},t.binary.base64.encode=function(e,t){for(var r,n,o,a="",s="",c=0;c<e.byteLength;)r=e[c++],n=e[c++],o=e[c++],a+=i.charAt(r>>2),a+=i.charAt((3&r)<<4|n>>4),isNaN(n)?a+="==":(a+=i.charAt((15&n)<<2|o>>6),a+=isNaN(o)?"=":i.charAt(63&o)),t&&a.length>t&&(s+=a.substr(0,t)+"\r\n",a=a.substr(t));return s+=a},t.binary.base64.decode=function(e,t,r){var n,i,a,s,c=t;c||(c=new Uint8Array(3*Math.ceil(e.length/4))),e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");for(var u=0,l=r=r||0;u<e.length;)n=o[e.charCodeAt(u++)-43],i=o[e.charCodeAt(u++)-43],a=o[e.charCodeAt(u++)-43],s=o[e.charCodeAt(u++)-43],c[l++]=n<<2|i>>4,64!==a&&(c[l++]=(15&i)<<4|a>>2,64!==s&&(c[l++]=(3&a)<<6|s));return t?l-r:c.subarray(0,l)},t.binary.base58.encode=function(e,r){return t.binary.baseN.encode(e,a,r)},t.binary.base58.decode=function(e,r){return t.binary.baseN.decode(e,a,r)},t.text={utf8:{},utf16:{}},t.text.utf8.encode=function(e,r,n){e=t.encodeUtf8(e);var i=r;i||(i=new Uint8Array(e.length));for(var o=n=n||0,a=0;a<e.length;++a)i[o++]=e.charCodeAt(a);return r?o-n:i},t.text.utf8.decode=function(e){return t.decodeUtf8(String.fromCharCode.apply(null,e))},t.text.utf16.encode=function(e,t,r){var n=t;n||(n=new Uint8Array(2*e.length));for(var i=new Uint16Array(n.buffer),o=r=r||0,a=r,s=0;s<e.length;++s)i[a++]=e.charCodeAt(s),o+=2;return t?o-r:n},t.text.utf16.decode=function(e){return String.fromCharCode.apply(null,new Uint16Array(e.buffer))},t.deflate=function(e,r,n){if(r=t.decode64(e.deflate(t.encode64(r)).rval),n){var i=2;32&r.charCodeAt(1)&&(i=6),r=r.substring(i,r.length-4);}return r},t.inflate=function(e,r,n){var i=e.inflate(t.encode64(r)).rval;return null===i?null:t.decode64(i)};var s=function(e,r,n){if(!e)throw new Error("WebStorage not available.");var i;if(null===n?i=e.removeItem(r):(n=t.encode64(JSON.stringify(n)),i=e.setItem(r,n)),void 0!==i&&!0!==i.rval){var o=new Error(i.error.message);throw o.id=i.error.id,o.name=i.error.name,o}},c=function(e,r){if(!e)throw new Error("WebStorage not available.");var n=e.getItem(r);if(e.init)if(null===n.rval){if(n.error){var i=new Error(n.error.message);throw i.id=n.error.id,i.name=n.error.name,i}n=null;}else n=n.rval;return null!==n&&(n=JSON.parse(t.decode64(n))),n},u=function(e,t,r,n){var i=c(e,t);null===i&&(i={}),i[r]=n,s(e,t,i);},l=function(e,t,r){var n=c(e,t);return null!==n&&(n=r in n?n[r]:null),n},f=function(e,t,r){var n=c(e,t);if(null!==n&&r in n){delete n[r];var i=!0;for(var o in n){i=!1;break}i&&(n=null),s(e,t,n);}},h=function(e,t){s(e,t,null);},d=function(e,t,r){var n,i=null;void 0===r&&(r=["web","flash"]);var o=!1,a=null;for(var s in r){n=r[s];try{if("flash"===n||"both"===n){if(null===t[0])throw new Error("Flash local storage not available.");i=e.apply(this,t),o="flash"===n;}"web"!==n&&"both"!==n||(t[0]=localStorage,i=e.apply(this,t),o=!0);}catch(e){a=e;}if(o)break}if(!o)throw a;return i};t.setItem=function(e,t,r,n,i){d(u,arguments,i);},t.getItem=function(e,t,r,n){return d(l,arguments,n)},t.removeItem=function(e,t,r,n){d(f,arguments,n);},t.clearItems=function(e,t,r){d(h,arguments,r);},t.parseUrl=function(e){var t=/^(https?):\/\/([^:&^\/]*):?(\d*)(.*)$/g;t.lastIndex=0;var r=t.exec(e),n=null===r?null:{full:e,scheme:r[1],host:r[2],port:r[3],path:r[4]};return n&&(n.fullHost=n.host,n.port?(80!==n.port&&"http"===n.scheme||443!==n.port&&"https"===n.scheme)&&(n.fullHost+=":"+n.port):"http"===n.scheme?n.port=80:"https"===n.scheme&&(n.port=443),n.full=n.scheme+"://"+n.fullHost),n};var p=null;t.getQueryVariables=function(e){var t,r=function(e){for(var t={},r=e.split("&"),n=0;n<r.length;n++){var i,o,a=r[n].indexOf("=");a>0?(i=r[n].substring(0,a),o=r[n].substring(a+1)):(i=r[n],o=null),i in t||(t[i]=[]),i in Object.prototype||null===o||t[i].push(unescape(o));}return t};return void 0===e?(null===p&&(p="undefined"!=typeof window&&window.location&&window.location.search?r(window.location.search.substring(1)):{}),t=p):t=r(e),t},t.parseFragment=function(e){var r=e,n="",i=e.indexOf("?");i>0&&(r=e.substring(0,i),n=e.substring(i+1));var o=r.split("/");return o.length>0&&""===o[0]&&o.shift(),{pathString:r,queryString:n,path:o,query:""===n?{}:t.getQueryVariables(n)}},t.makeRequest=function(e){var r=t.parseFragment(e),n={path:r.pathString,query:r.queryString,getPath:function(e){return void 0===e?r.path:r.path[e]},getQuery:function(e,t){var n;return void 0===e?n=r.query:(n=r.query[e])&&void 0!==t&&(n=n[t]),n},getQueryLast:function(e,t){var r=n.getQuery(e);return r?r[r.length-1]:t}};return n},t.makeLink=function(e,t,r){e=jQuery.isArray(e)?e.join("/"):e;var n=jQuery.param(t||{});return r=r||"",e+(n.length>0?"?"+n:"")+(r.length>0?"#"+r:"")},t.setPath=function(e,t,r){if("object"==typeof e&&null!==e)for(var n=0,i=t.length;n<i;){var o=t[n++];if(n==i)e[o]=r;else {var a=o in e;(!a||a&&"object"!=typeof e[o]||a&&null===e[o])&&(e[o]={}),e=e[o];}}},t.getPath=function(e,t,r){for(var n=0,i=t.length,o=!0;o&&n<i&&"object"==typeof e&&null!==e;){var a=t[n++];(o=a in e)&&(e=e[a]);}return o?e:r},t.deletePath=function(e,t){if("object"==typeof e&&null!==e)for(var r=0,n=t.length;r<n;){var i=t[r++];if(r==n)delete e[i];else {if(!(i in e)||"object"!=typeof e[i]||null===e[i])break;e=e[i];}}},t.isEmpty=function(e){for(var t in e)if(e.hasOwnProperty(t))return !1;return !0},t.format=function(e){for(var t,r,n=/%./g,i=0,o=[],a=0;t=n.exec(e);){(r=e.substring(a,n.lastIndex-2)).length>0&&o.push(r),a=n.lastIndex;var s=t[0][1];switch(s){case"s":case"o":i<arguments.length?o.push(arguments[1+i++]):o.push("<?>");break;case"%":o.push("%");break;default:o.push("<%"+s+"?>");}}return o.push(e.substring(a)),o.join("")},t.formatNumber=function(e,t,r,n){var i=e,o=isNaN(t=Math.abs(t))?2:t,a=void 0===r?",":r,s=void 0===n?".":n,c=i<0?"-":"",u=parseInt(i=Math.abs(+i||0).toFixed(o),10)+"",l=u.length>3?u.length%3:0;return c+(l?u.substr(0,l)+s:"")+u.substr(l).replace(/(\d{3})(?=\d)/g,"$1"+s)+(o?a+Math.abs(i-u).toFixed(o).slice(2):"")},t.formatSize=function(e){return e=e>=1073741824?t.formatNumber(e/1073741824,2,".","")+" GiB":e>=1048576?t.formatNumber(e/1048576,2,".","")+" MiB":e>=1024?t.formatNumber(e/1024,0)+" KiB":t.formatNumber(e,0)+" bytes"},t.bytesFromIP=function(e){return -1!==e.indexOf(".")?t.bytesFromIPv4(e):-1!==e.indexOf(":")?t.bytesFromIPv6(e):null},t.bytesFromIPv4=function(e){if(4!==(e=e.split(".")).length)return null;for(var r=t.createBuffer(),n=0;n<e.length;++n){var i=parseInt(e[n],10);if(isNaN(i))return null;r.putByte(i);}return r.getBytes()},t.bytesFromIPv6=function(e){for(var r=0,n=2*(8-(e=e.split(":").filter((function(e){return 0===e.length&&++r,!0}))).length+r),i=t.createBuffer(),o=0;o<8;++o)if(e[o]&&0!==e[o].length){var a=t.hexToBytes(e[o]);a.length<2&&i.putByte(0),i.putBytes(a);}else i.fillWithByte(0,n),n=0;return i.getBytes()},t.bytesToIP=function(e){return 4===e.length?t.bytesToIPv4(e):16===e.length?t.bytesToIPv6(e):null},t.bytesToIPv4=function(e){if(4!==e.length)return null;for(var t=[],r=0;r<e.length;++r)t.push(e.charCodeAt(r));return t.join(".")},t.bytesToIPv6=function(e){if(16!==e.length)return null;for(var r=[],n=[],i=0,o=0;o<e.length;o+=2){for(var a=t.bytesToHex(e[o]+e[o+1]);"0"===a[0]&&"0"!==a;)a=a.substr(1);if("0"===a){var s=n[n.length-1],c=r.length;s&&c===s.end+1?(s.end=c,s.end-s.start>n[i].end-n[i].start&&(i=n.length-1)):n.push({start:c,end:c});}r.push(a);}if(n.length>0){var u=n[i];u.end-u.start>0&&(r.splice(u.start,u.end-u.start+1,""),0===u.start&&r.unshift(""),7===u.end&&r.push(""));}return r.join(":")},t.estimateCores=function(e,r){if("function"==typeof e&&(r=e,e={}),e=e||{},"cores"in t&&!e.update)return r(null,t.cores);if("undefined"!=typeof navigator&&"hardwareConcurrency"in navigator&&navigator.hardwareConcurrency>0)return t.cores=navigator.hardwareConcurrency,r(null,t.cores);if("undefined"==typeof Worker)return t.cores=1,r(null,t.cores);if("undefined"==typeof Blob)return t.cores=2,r(null,t.cores);var n=URL.createObjectURL(new Blob(["(",function(){self.addEventListener("message",(function(e){var t=Date.now(),r=t+4;self.postMessage({st:t,et:r});}));}.toString(),")()"],{type:"application/javascript"}));!function e(i,o,a){if(0===o){var s=Math.floor(i.reduce((function(e,t){return e+t}),0)/i.length);return t.cores=Math.max(1,s),URL.revokeObjectURL(n),r(null,t.cores)}!function(e,t){for(var r=[],i=[],o=0;o<e;++o){var a=new Worker(n);a.addEventListener("message",(function(n){if(i.push(n.data),i.length===e){for(var o=0;o<e;++o)r[o].terminate();t(null,i);}})),r.push(a);}for(o=0;o<e;++o)r[o].postMessage(o);}(a,(function(t,r){i.push(function(e,t){for(var r=[],n=0;n<e;++n)for(var i=t[n],o=r[n]=[],a=0;a<e;++a)if(n!==a){var s=t[a];(i.st>s.st&&i.st<s.et||s.st>i.st&&s.st<i.et)&&o.push(a);}return r.reduce((function(e,t){return Math.max(e,t.length)}),0)}(a,r)),e(i,o-1,a);}));}([],5,16);};})),Yn((function(e){var t=e.exports=Mc.sha1=Mc.sha1||{};Mc.md.sha1=Mc.md.algorithms.sha1=t,t.create=function(){n||(r=String.fromCharCode(128),r+=Mc.util.fillString(String.fromCharCode(0),64),n=!0);var e=null,t=Mc.util.createBuffer(),o=new Array(80),a={algorithm:"sha1",blockLength:64,digestLength:20,messageLength:0,fullMessageLength:null,messageLengthSize:8,start:function(){a.messageLength=0,a.fullMessageLength=a.messageLength64=[];for(var r=a.messageLengthSize/4,n=0;n<r;++n)a.fullMessageLength.push(0);return t=Mc.util.createBuffer(),e={h0:1732584193,h1:4023233417,h2:2562383102,h3:271733878,h4:3285377520},a}};return a.start(),a.update=function(r,n){"utf8"===n&&(r=Mc.util.encodeUtf8(r));var s=r.length;a.messageLength+=s,s=[s/4294967296>>>0,s>>>0];for(var c=a.fullMessageLength.length-1;c>=0;--c)a.fullMessageLength[c]+=s[1],s[1]=s[0]+(a.fullMessageLength[c]/4294967296>>>0),a.fullMessageLength[c]=a.fullMessageLength[c]>>>0,s[0]=s[1]/4294967296>>>0;return t.putBytes(r),i(e,o,t),(t.read>2048||0===t.length())&&t.compact(),a},a.digest=function(){var n=Mc.util.createBuffer();n.putBytes(t.bytes());var s,c=a.fullMessageLength[a.fullMessageLength.length-1]+a.messageLengthSize&a.blockLength-1;n.putBytes(r.substr(0,a.blockLength-c));for(var u=8*a.fullMessageLength[0],l=0;l<a.fullMessageLength.length-1;++l)u+=(s=8*a.fullMessageLength[l+1])/4294967296>>>0,n.putInt32(u>>>0),u=s>>>0;n.putInt32(u);var f={h0:e.h0,h1:e.h1,h2:e.h2,h3:e.h3,h4:e.h4};i(f,o,n);var h=Mc.util.createBuffer();return h.putInt32(f.h0),h.putInt32(f.h1),h.putInt32(f.h2),h.putInt32(f.h3),h.putInt32(f.h4),h},a};var r=null,n=!1;function i(e,t,r){for(var n,i,o,a,s,c,u,l=r.length();l>=64;){for(i=e.h0,o=e.h1,a=e.h2,s=e.h3,c=e.h4,u=0;u<16;++u)n=r.getInt32(),t[u]=n,n=(i<<5|i>>>27)+(s^o&(a^s))+c+1518500249+n,c=s,s=a,a=(o<<30|o>>>2)>>>0,o=i,i=n;for(;u<20;++u)n=(n=t[u-3]^t[u-8]^t[u-14]^t[u-16])<<1|n>>>31,t[u]=n,n=(i<<5|i>>>27)+(s^o&(a^s))+c+1518500249+n,c=s,s=a,a=(o<<30|o>>>2)>>>0,o=i,i=n;for(;u<32;++u)n=(n=t[u-3]^t[u-8]^t[u-14]^t[u-16])<<1|n>>>31,t[u]=n,n=(i<<5|i>>>27)+(o^a^s)+c+1859775393+n,c=s,s=a,a=(o<<30|o>>>2)>>>0,o=i,i=n;for(;u<40;++u)n=(n=t[u-6]^t[u-16]^t[u-28]^t[u-32])<<2|n>>>30,t[u]=n,n=(i<<5|i>>>27)+(o^a^s)+c+1859775393+n,c=s,s=a,a=(o<<30|o>>>2)>>>0,o=i,i=n;for(;u<60;++u)n=(n=t[u-6]^t[u-16]^t[u-28]^t[u-32])<<2|n>>>30,t[u]=n,n=(i<<5|i>>>27)+(o&a|s&(o^a))+c+2400959708+n,c=s,s=a,a=(o<<30|o>>>2)>>>0,o=i,i=n;for(;u<80;++u)n=(n=t[u-6]^t[u-16]^t[u-28]^t[u-32])<<2|n>>>30,t[u]=n,n=(i<<5|i>>>27)+(o^a^s)+c+3395469782+n,c=s,s=a,a=(o<<30|o>>>2)>>>0,o=i,i=n;e.h0=e.h0+i|0,e.h1=e.h1+o|0,e.h2=e.h2+a|0,e.h3=e.h3+s|0,e.h4=e.h4+c|0,l-=64;}}})),Yn((function(e){var t=e.exports=Mc.sha256=Mc.sha256||{};Mc.md.sha256=Mc.md.algorithms.sha256=t,t.create=function(){n||(r=String.fromCharCode(128),r+=Mc.util.fillString(String.fromCharCode(0),64),i=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298],n=!0);var e=null,t=Mc.util.createBuffer(),a=new Array(64),s={algorithm:"sha256",blockLength:64,digestLength:32,messageLength:0,fullMessageLength:null,messageLengthSize:8,start:function(){s.messageLength=0,s.fullMessageLength=s.messageLength64=[];for(var r=s.messageLengthSize/4,n=0;n<r;++n)s.fullMessageLength.push(0);return t=Mc.util.createBuffer(),e={h0:1779033703,h1:3144134277,h2:1013904242,h3:2773480762,h4:1359893119,h5:2600822924,h6:528734635,h7:1541459225},s}};return s.start(),s.update=function(r,n){"utf8"===n&&(r=Mc.util.encodeUtf8(r));var i=r.length;s.messageLength+=i,i=[i/4294967296>>>0,i>>>0];for(var c=s.fullMessageLength.length-1;c>=0;--c)s.fullMessageLength[c]+=i[1],i[1]=i[0]+(s.fullMessageLength[c]/4294967296>>>0),s.fullMessageLength[c]=s.fullMessageLength[c]>>>0,i[0]=i[1]/4294967296>>>0;return t.putBytes(r),o(e,a,t),(t.read>2048||0===t.length())&&t.compact(),s},s.digest=function(){var n=Mc.util.createBuffer();n.putBytes(t.bytes());var i,c=s.fullMessageLength[s.fullMessageLength.length-1]+s.messageLengthSize&s.blockLength-1;n.putBytes(r.substr(0,s.blockLength-c));for(var u=8*s.fullMessageLength[0],l=0;l<s.fullMessageLength.length-1;++l)u+=(i=8*s.fullMessageLength[l+1])/4294967296>>>0,n.putInt32(u>>>0),u=i>>>0;n.putInt32(u);var f={h0:e.h0,h1:e.h1,h2:e.h2,h3:e.h3,h4:e.h4,h5:e.h5,h6:e.h6,h7:e.h7};o(f,a,n);var h=Mc.util.createBuffer();return h.putInt32(f.h0),h.putInt32(f.h1),h.putInt32(f.h2),h.putInt32(f.h3),h.putInt32(f.h4),h.putInt32(f.h5),h.putInt32(f.h6),h.putInt32(f.h7),h},s};var r=null,n=!1,i=null;function o(e,t,r){for(var n,o,a,s,c,u,l,f,h,d,p,m,v,g=r.length();g>=64;){for(c=0;c<16;++c)t[c]=r.getInt32();for(;c<64;++c)n=((n=t[c-2])>>>17|n<<15)^(n>>>19|n<<13)^n>>>10,o=((o=t[c-15])>>>7|o<<25)^(o>>>18|o<<14)^o>>>3,t[c]=n+t[c-7]+o+t[c-16]|0;for(u=e.h0,l=e.h1,f=e.h2,h=e.h3,d=e.h4,p=e.h5,m=e.h6,v=e.h7,c=0;c<64;++c)a=(u>>>2|u<<30)^(u>>>13|u<<19)^(u>>>22|u<<10),s=u&l|f&(u^l),n=v+((d>>>6|d<<26)^(d>>>11|d<<21)^(d>>>25|d<<7))+(m^d&(p^m))+i[c]+t[c],v=m,m=p,p=d,d=h+n>>>0,h=f,f=l,l=u,u=n+(o=a+s)>>>0;e.h0=e.h0+u|0,e.h1=e.h1+l|0,e.h2=e.h2+f|0,e.h3=e.h3+h|0,e.h4=e.h4+d|0,e.h5=e.h5+p|0,e.h6=e.h6+m|0,e.h7=e.h7+v|0,g-=64;}}}));var Uc=class{constructor(e){this.md=Mc.md[e].create();}update(e){this.md.update(e,"utf8");}digest(){return this.md.digest().toHex()}},Fc=class{constructor(e){this.list=e.sort(),this.done=!1,this.left={};for(let t=0;t<e.length;++t)this.left[e[t]]=!0;}hasNext(){return !this.done}next(){const e=this.list.slice();let t=null,r=0;const n=this.list.length;for(let e=0;e<n;++e){const i=this.list[e],o=this.left[i];(null===t||i>t)&&(o&&e>0&&i>this.list[e-1]||!o&&e<n-1&&i>this.list[e+1])&&(t=i,r=e);}if(null===t)this.done=!0;else {const e=this.left[t]?r-1:r+1;this.list[r]=this.list[e],this.list[e]=t;for(let e=0;e<n;++e)this.list[e]>t&&(this.left[this.list[e]]=!this.left[this.list[e]]);}return e}};const Hc="http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",zc="http://www.w3.org/2001/XMLSchema#string",Vc={eoln:/(?:\r\n)|(?:\n)|(?:\r)/g};Vc.empty=new RegExp("^[ \\t]*$"),Vc.quad=new RegExp('^[ \\t]*(?:(?:<([^:]+:[^>]*)>)|(_:(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9])(?:(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9-·̀-ͯ‿-⁀.])*(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9-·̀-ͯ‿-⁀]))?))[ \\t]+(?:<([^:]+:[^>]*)>)[ \\t]+(?:(?:<([^:]+:[^>]*)>)|(_:(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9])(?:(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9-·̀-ͯ‿-⁀.])*(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9-·̀-ͯ‿-⁀]))?)|(?:"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"(?:(?:\\^\\^(?:<([^:]+:[^>]*)>))|(?:@([a-zA-Z]+(?:-[a-zA-Z0-9]+)*)))?))[ \\t]*(?:\\.|(?:(?:(?:<([^:]+:[^>]*)>)|(_:(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9])(?:(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9-·̀-ͯ‿-⁀.])*(?:[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�_0-9-·̀-ͯ‿-⁀]))?))[ \\t]*\\.))[ \\t]*$');var qc=class e{static parse(e){const t=[],r={},n=e.split(Vc.eoln);let i=0;for(const e of n){if(i++,Vc.empty.test(e))continue;const n=e.match(Vc.quad);if(null===n)throw new Error("N-Quads parse error on line "+i+".");const o={};if(void 0!==n[1]?o.subject={termType:"NamedNode",value:n[1]}:o.subject={termType:"BlankNode",value:n[2]},o.predicate={termType:"NamedNode",value:n[3]},void 0!==n[4]?o.object={termType:"NamedNode",value:n[4]}:void 0!==n[5]?o.object={termType:"BlankNode",value:n[5]}:(o.object={termType:"Literal",value:void 0,datatype:{termType:"NamedNode"}},void 0!==n[7]?o.object.datatype.value=n[7]:void 0!==n[8]?(o.object.datatype.value=Hc,o.object.language=n[8]):o.object.datatype.value=zc,o.object.value=Jc(n[6])),void 0!==n[9]?o.graph={termType:"NamedNode",value:n[9]}:void 0!==n[10]?o.graph={termType:"BlankNode",value:n[10]}:o.graph={termType:"DefaultGraph",value:""},o.graph.value in r){let e=!0;const n=r[o.graph.value];for(const t of n)if(Kc(t,o)){e=!1;break}e&&(n.push(o),t.push(o));}else r[o.graph.value]=[o],t.push(o);}return t}static serialize(t){Array.isArray(t)||(t=e.legacyDatasetToQuads(t));const r=[];for(const n of t)r.push(e.serializeQuad(n));return r.sort().join("")}static serializeQuad(e){const t=e.subject,r=e.predicate,n=e.object,i=e.graph;let o="";return [t,r].forEach(e=>{"NamedNode"===e.termType?o+="<"+e.value+">":o+=e.value,o+=" ";}),"NamedNode"===n.termType?o+="<"+n.value+">":"BlankNode"===n.termType?o+=n.value:(o+='"'+function(e){return e.replace($c,(function(e){switch(e){case'"':return '\\"';case"\\":return "\\\\";case"\n":return "\\n";case"\r":return "\\r"}}))}(n.value)+'"',n.datatype.value===Hc?n.language&&(o+="@"+n.language):n.datatype.value!==zc&&(o+="^^<"+n.datatype.value+">")),"NamedNode"===i.termType?o+=" <"+i.value+">":"BlankNode"===i.termType&&(o+=" "+i.value),o+=" .\n",o}static legacyDatasetToQuads(e){const t=[],r={"blank node":"BlankNode",IRI:"NamedNode",literal:"Literal"};for(const n in e){e[n].forEach(e=>{const i={};for(const t in e){const n=e[t],o={termType:r[n.type],value:n.value};"Literal"===o.termType&&(o.datatype={termType:"NamedNode"},"datatype"in n&&(o.datatype.value=n.datatype),"language"in n?("datatype"in n||(o.datatype.value=Hc),o.language=n.language):"datatype"in n||(o.datatype.value=zc)),i[t]=o;}i.graph="@default"===n?{termType:"DefaultGraph",value:""}:{termType:n.startsWith("_:")?"BlankNode":"NamedNode",value:n},t.push(i);});}return t}};function Kc(e,t){for(const r in e)if(e[r].termType!==t[r].termType||e[r].value!==t[r].value)return !1;return "Literal"!==e.object.termType||e.object.datatype.termType===t.object.datatype.termType&&e.object.datatype.value===t.object.datatype.value&&e.object.language===t.object.language}const $c=/["\\\n\r]/g;const Gc=/(?:\\([tbnrf"'\\]))|(?:\\u([0-9A-Fa-f]{4}))|(?:\\U([0-9A-Fa-f]{8}))/g;function Jc(e){return e.replace(Gc,(function(e,t,r,n){if(t)switch(t){case"t":return "\t";case"b":return "\b";case"n":return "\n";case"r":return "\r";case"f":return "\f";case'"':return '"';case"'":return "'";case"\\":return "\\"}if(r)return String.fromCharCode(parseInt(r,16));if(n)throw new Error("Unsupported U escape")}))}const Wc={subject:"s",object:"o",graph:"g"};var Xc=class extends class{constructor({maxCallStackDepth:e=500,maxTotalCallStackDepth:t=4294967295,timeSlice:r=10}={}){this.schedule={},this.schedule.MAX_DEPTH=e,this.schedule.MAX_TOTAL_DEPTH=t,this.schedule.depth=0,this.schedule.totalDepth=0,this.schedule.timeSlice=r;}doWork(e,t){const r=this.schedule;if(r.totalDepth>=r.MAX_TOTAL_DEPTH)return t(new Error("Maximum total call stack depth exceeded; canonicalization aborting."));!function n(){if(r.depth===r.MAX_DEPTH)return r.depth=0,r.running=!1,Ac.nextTick(n);const i=Date.now();if(r.running||(r.start=Date.now(),r.deadline=r.start+r.timeSlice),i<r.deadline)return r.running=!0,r.depth++,r.totalDepth++,e((e,n)=>{r.depth--,r.totalDepth--,t(e,n);});r.depth=0,r.running=!1,Ac.setImmediate(n);}();}forEach(e,t,r){const n=this;let i,o,a=0;if(Array.isArray(e))o=e.length,i=()=>a!==o&&(i.value=e[a++],i.key=a,!0);else {const t=Object.keys(e);o=t.length,i=()=>a!==o&&(i.key=t[a++],i.value=e[i.key],!0);}!function e(o){return o?r(o):i()?n.doWork(()=>t(i.value,i.key,e)):void r()}();}waterfall(e,t){const r=this;r.forEach(e,(e,t,n)=>r.doWork(e,n),t);}whilst(e,t,r){const n=this;!function i(o){return o?r(o):e()?void n.doWork(t,i):r()}();}}{constructor(e){super(e=e||{}),this.name="URDNA2015",this.options=Object.assign({},e),this.blankNodeInfo={},this.hashToBlankNodes={},this.canonicalIssuer=new Lc("_:c14n"),this.hashAlgorithm="sha256",this.quads;}main(e,t){const r=this;let n;r.schedule.start=Date.now(),r.quads=e;const i={};r.waterfall([t=>{r.forEach(e,(e,t,n)=>{r.forEachComponent(e,t=>{if("BlankNode"!==t.termType)return;const n=t.value;n in r.blankNodeInfo?r.blankNodeInfo[n].quads.push(e):(i[n]=!0,r.blankNodeInfo[n]={quads:[e]});}),n();},t);},e=>{let t=!0;r.whilst(()=>t,e=>{t=!1,r.hashToBlankNodes={},r.waterfall([e=>{r.forEach(i,(e,t,n)=>{r.hashFirstDegreeQuads(t,(e,i)=>{if(e)return n(e);i in r.hashToBlankNodes?r.hashToBlankNodes[i].push(t):r.hashToBlankNodes[i]=[t],n();});},e);},e=>{const n=Object.keys(r.hashToBlankNodes).sort();r.forEach(n,(e,n,o)=>{const a=r.hashToBlankNodes[e];if(a.length>1)return o();const s=a[0];r.canonicalIssuer.getId(s),delete i[s],delete r.hashToBlankNodes[e],t=!0,o();},e);}],e);},e);},e=>{const t=Object.keys(r.hashToBlankNodes).sort();r.forEach(t,(e,t,n)=>{const i=[],o=r.hashToBlankNodes[e];r.waterfall([e=>{r.forEach(o,(e,t,n)=>{if(r.canonicalIssuer.hasId(e))return n();const o=new Lc("_:b");o.getId(e),r.hashNDegreeQuads(e,o,(e,t)=>{if(e)return n(e);i.push(t),n();});},e);},e=>{i.sort((e,t)=>e.hash<t.hash?-1:e.hash>t.hash?1:0),r.forEach(i,(e,t,n)=>{for(const t in e.issuer.existing)r.canonicalIssuer.getId(t);n();},e);}],n);},e);},e=>{const t=[];r.waterfall([e=>{r.forEach(r.quads,(e,n,i)=>{r.forEachComponent(e,e=>{"BlankNode"!==e.termType||e.value.startsWith(r.canonicalIssuer.prefix)||(e.value=r.canonicalIssuer.getId(e.value));}),t.push(qc.serializeQuad(e)),i();},e);},e=>(t.sort(),n=t.join(""),e())],e);}],e=>t(e,n));}hashFirstDegreeQuads(e,t){const r=this,n=r.blankNodeInfo[e];if("hash"in n)return t(null,n.hash);const i=[],o=n.quads;r.forEach(o,(t,n,o)=>{const a={predicate:t.predicate};r.forEachComponent(t,(t,n)=>{a[n]=r.modifyFirstDegreeComponent(e,t,n);}),i.push(qc.serializeQuad(a)),o();},e=>{if(e)return t(e);i.sort();const o=new Uc(r.hashAlgorithm);for(let e=0;e<i.length;++e)o.update(i[e]);n.hash=o.digest(),t(null,n.hash);});}hashRelatedBlankNode(e,t,r,n,i){const o=this;let a;o.waterfall([t=>o.canonicalIssuer.hasId(e)?(a=o.canonicalIssuer.getId(e),t()):r.hasId(e)?(a=r.getId(e),t()):void o.hashFirstDegreeQuads(e,(e,r)=>{if(e)return t(e);a=r,t();})],e=>{if(e)return i(e);const r=new Uc(o.hashAlgorithm);return r.update(n),"g"!==n&&r.update(o.getRelatedPredicate(t)),r.update(a),i(null,r.digest())});}hashNDegreeQuads(e,t,r){const n=this;let i;const o=new Uc(n.hashAlgorithm);n.waterfall([r=>n.createHashToRelated(e,t,(e,t)=>{if(e)return r(e);i=t,r();}),e=>{const r=Object.keys(i).sort();n.forEach(r,(e,r,a)=>{o.update(e);let s,c="";const u=new Fc(i[e]);n.whilst(()=>u.hasNext(),e=>{const r=u.next();let i=t.clone(),o="";const a=[];n.waterfall([t=>{n.forEach(r,(t,r,s)=>{if(n.canonicalIssuer.hasId(t)?o+=n.canonicalIssuer.getId(t):(i.hasId(t)||a.push(t),o+=i.getId(t)),0!==c.length&&o>c)return e();s();},t);},t=>{n.forEach(a,(t,r,a)=>{n.hashNDegreeQuads(t,i,(r,n)=>r?a(r):(o+=i.getId(t),o+="<"+n.hash+">",i=n.issuer,0!==c.length&&o>c?e():void a()));},t);},e=>{(0===c.length||o<c)&&(c=o,s=i),e();}],e);},e=>{if(e)return a(e);o.update(c),t=s,a();});},e);}],e=>{r(e,{hash:o.digest(),issuer:t});});}modifyFirstDegreeComponent(e,t){return "BlankNode"!==t.termType||((t=Ac.clone(t)).value=t.value===e?"_:a":"_:z"),t}getRelatedPredicate(e){return "<"+e.predicate.value+">"}createHashToRelated(e,t,r){const n=this,i={},o=n.blankNodeInfo[e].quads;n.forEach(o,(r,o,a)=>{n.forEach(r,(o,a,s)=>{if("predicate"===a||"BlankNode"!==o.termType||o.value===e)return s();const c=o.value,u=Wc[a];n.hashRelatedBlankNode(c,r,t,u,(e,t)=>{if(e)return s(e);t in i?i[t].push(c):i[t]=[c],s();});},a);},e=>r(e,i));}forEachComponent(e,t){for(const r in e)"predicate"!==r&&t(e[r],r,e);}},Yc=class extends Xc{constructor(e){super(e),this.name="URGNA2012",this.hashAlgorithm="sha1";}modifyFirstDegreeComponent(e,t,r){return "BlankNode"!==t.termType||((t=Ac.clone(t)).value="name"===r?"_:g":t.value===e?"_:a":"_:z"),t}getRelatedPredicate(e){return e.predicate.value}createHashToRelated(e,t,r){const n=this,i={},o=n.blankNodeInfo[e].quads;n.forEach(o,(r,o,a)=>{let s,c;if("BlankNode"===r.subject.termType&&r.subject.value!==e)c=r.subject.value,s="p";else {if("BlankNode"!==r.object.termType||r.object.value===e)return a();c=r.object.value,s="r";}n.hashRelatedBlankNode(c,r,t,s,(e,t)=>{if(e)return a(e);t in i?i[t].push(c):i[t]=[c],a();});},e=>r(e,i));}};const Qc={subject:"s",object:"o",graph:"g"};var Zc=class{constructor(){this.name="URDNA2015",this.blankNodeInfo={},this.hashToBlankNodes={},this.canonicalIssuer=new Lc("_:c14n"),this.hashAlgorithm="sha256",this.quads;}main(e){const t=this;t.quads=e;const r={};for(const n of e)t.forEachComponent(n,e=>{if("BlankNode"!==e.termType)return;const i=e.value;i in t.blankNodeInfo?t.blankNodeInfo[i].quads.push(n):(r[i]=!0,t.blankNodeInfo[i]={quads:[n]});});let n=!0;for(;n;){n=!1,t.hashToBlankNodes={};for(const e in r){const r=t.hashFirstDegreeQuads(e);r in t.hashToBlankNodes?t.hashToBlankNodes[r].push(e):t.hashToBlankNodes[r]=[e];}const e=Object.keys(t.hashToBlankNodes).sort();for(let i=0;i<e.length;++i){const o=e[i],a=t.hashToBlankNodes[o];if(a.length>1)continue;const s=a[0];t.canonicalIssuer.getId(s),delete r[s],delete t.hashToBlankNodes[o],n=!0;}}const i=Object.keys(t.hashToBlankNodes).sort();for(let e=0;e<i.length;++e){const r=[],n=i[e],o=t.hashToBlankNodes[n];for(let e=0;e<o.length;++e){const n=o[e];if(t.canonicalIssuer.hasId(n))continue;const i=new Lc("_:b");i.getId(n);const a=t.hashNDegreeQuads(n,i);r.push(a);}r.sort((e,t)=>e.hash<t.hash?-1:e.hash>t.hash?1:0);for(let e=0;e<r.length;++e){const n=r[e];for(const e in n.issuer.existing)t.canonicalIssuer.getId(e);}}const o=[];for(let e=0;e<t.quads.length;++e){const r=t.quads[e];t.forEachComponent(r,e=>{"BlankNode"!==e.termType||e.value.startsWith(t.canonicalIssuer.prefix)||(e.value=t.canonicalIssuer.getId(e.value));}),o.push(qc.serializeQuad(r));}return o.sort(),o.join("")}hashFirstDegreeQuads(e){const t=this,r=t.blankNodeInfo[e];if("hash"in r)return r.hash;const n=[],i=r.quads;for(let r=0;r<i.length;++r){const o=i[r],a={predicate:o.predicate};t.forEachComponent(o,(r,n)=>{a[n]=t.modifyFirstDegreeComponent(e,r,n);}),n.push(qc.serializeQuad(a));}n.sort();const o=new Uc(t.hashAlgorithm);for(let e=0;e<n.length;++e)o.update(n[e]);return r.hash=o.digest(),r.hash}hashRelatedBlankNode(e,t,r,n){const i=this;let o;o=i.canonicalIssuer.hasId(e)?i.canonicalIssuer.getId(e):r.hasId(e)?r.getId(e):i.hashFirstDegreeQuads(e);const a=new Uc(i.hashAlgorithm);return a.update(n),"g"!==n&&a.update(i.getRelatedPredicate(t)),a.update(o),a.digest()}hashNDegreeQuads(e,t){const r=this,n=new Uc(r.hashAlgorithm),i=r.createHashToRelated(e,t),o=Object.keys(i).sort();for(let e=0;e<o.length;++e){const a=o[e];n.update(a);let s,c="";const u=new Fc(i[a]);for(;u.hasNext();){const e=u.next();let n=t.clone(),i="";const o=[];let a=!1;for(let t=0;t<e.length;++t){const s=e[t];if(r.canonicalIssuer.hasId(s)?i+=r.canonicalIssuer.getId(s):(n.hasId(s)||o.push(s),i+=n.getId(s)),0!==c.length&&i>c){a=!0;break}}if(!a){for(let e=0;e<o.length;++e){const t=o[e],s=r.hashNDegreeQuads(t,n);if(i+=n.getId(t),i+="<"+s.hash+">",n=s.issuer,0!==c.length&&i>c){a=!0;break}}a||(0===c.length||i<c)&&(c=i,s=n);}}n.update(c),t=s;}return {hash:n.digest(),issuer:t}}modifyFirstDegreeComponent(e,t){return "BlankNode"!==t.termType||((t=Ac.clone(t)).value=t.value===e?"_:a":"_:z"),t}getRelatedPredicate(e){return "<"+e.predicate.value+">"}createHashToRelated(e,t){const r=this,n={},i=r.blankNodeInfo[e].quads;for(let o=0;o<i.length;++o){const a=i[o];for(const i in a){const o=a[i];if("predicate"===i||"BlankNode"!==o.termType||o.value===e)continue;const s=o.value,c=Qc[i],u=r.hashRelatedBlankNode(s,a,t,c);u in n?n[u].push(s):n[u]=[s];}}return n}forEachComponent(e,t){for(const r in e)"predicate"!==r&&t(e[r],r,e);}},eu=class extends Zc{constructor(){super(),this.name="URGNA2012",this.hashAlgorithm="sha1";}modifyFirstDegreeComponent(e,t,r){return "BlankNode"!==t.termType||((t=Ac.clone(t)).value="name"===r?"_:g":t.value===e?"_:a":"_:z"),t}getRelatedPredicate(e){return e.predicate.value}createHashToRelated(e,t){const r=this,n={},i=r.blankNodeInfo[e].quads;for(let o=0;o<i.length;++o){const a=i[o];let s,c;if("BlankNode"===a.subject.termType&&a.subject.value!==e)c=a.subject.value,s="p";else {if("BlankNode"!==a.object.termType||a.object.value===e)continue;c=a.object.value,s="r";}const u=r.hashRelatedBlankNode(c,a,t,s);u in n?n[u].push(c):n[u]=[c];}return n}},tu=Qn(Object.freeze({__proto__:null,default:{}}));let ru;try{ru=tu;}catch(e){}const nu={};var iu=nu;nu.NQuads=qc,nu.IdentifierIssuer=Lc,nu._rdfCanonizeNative=function(e){return e&&(ru=e),ru},nu.canonize=Ac.callbackify((async function(e,t){let r;const n=new Promise((e,t)=>{r=(r,n)=>{if(r)return t(r);e(n);};});if(Array.isArray(e)||(e=nu.NQuads.legacyDatasetToQuads(e)),t.useNative){if(!ru)throw new Error("rdf-canonize-native not available");ru.canonize(e,t,r);}else if("URDNA2015"===t.algorithm)new Xc(t).main(e,r);else {if("URGNA2012"!==t.algorithm)throw "algorithm"in t?new Error("Invalid RDF Dataset Canonicalization algorithm: "+t.algorithm):new Error("No RDF Dataset Canonicalization algorithm specified.");new Yc(t).main(e,r);}return n})),nu.canonizeSync=function(e,t){if(Array.isArray(e)||(e=nu.NQuads.legacyDatasetToQuads(e)),t.useNative){if(ru)return ru.canonizeSync(e,t);throw new Error("rdf-canonize-native not available")}if("URDNA2015"===t.algorithm)return new Zc(t).main(e);if("URGNA2012"===t.algorithm)return new eu(t).main(e);if(!("algorithm"in t))throw new Error("No RDF Dataset Canonicalization algorithm specified.");throw new Error("Invalid RDF Dataset Canonicalization algorithm: "+t.algorithm)};const ou={};var au=ou;ou.isArray=Array.isArray,ou.isBoolean=e=>"boolean"==typeof e||"[object Boolean]"===Object.prototype.toString.call(e),ou.isDouble=e=>ou.isNumber(e)&&-1!==String(e).indexOf("."),ou.isEmptyObject=e=>ou.isObject(e)&&0===Object.keys(e).length,ou.isNumber=e=>"number"==typeof e||"[object Number]"===Object.prototype.toString.call(e),ou.isNumeric=e=>!isNaN(parseFloat(e))&&isFinite(e),ou.isObject=e=>"[object Object]"===Object.prototype.toString.call(e),ou.isString=e=>"string"==typeof e||"[object String]"===Object.prototype.toString.call(e),ou.isUndefined=e=>void 0===e;const su={};var cu=su;su.isSubject=e=>{if(au.isObject(e)&&!("@value"in e||"@set"in e||"@list"in e)){return Object.keys(e).length>1||!("@id"in e)}return !1},su.isSubjectReference=e=>au.isObject(e)&&1===Object.keys(e).length&&"@id"in e,su.isValue=e=>au.isObject(e)&&"@value"in e,su.isList=e=>au.isObject(e)&&"@list"in e,su.isGraph=e=>au.isObject(e)&&"@graph"in e&&1===Object.keys(e).filter(e=>"@id"!==e&&"@index"!==e).length,su.isSimpleGraph=e=>su.isGraph(e)&&!("@id"in e),su.isBlankNode=e=>!!au.isObject(e)&&("@id"in e?0===e["@id"].indexOf("_:"):0===Object.keys(e).length||!("@value"in e||"@set"in e||"@list"in e));var uu=class extends Error{constructor(e="An unspecified JSON-LD error occurred.",t="jsonld.Error",r={}){super(e),this.name=t,this.message=e,this.details=r;}};const lu=iu.IdentifierIssuer,fu=/(?:<[^>]*?>|"[^"]*?"|[^,])+/g,hu=/\s*<([^>]*?)>\s*(?:;\s*(.*))?/,du=/(.*?)=(?:(?:"([^"]*?)")|([^"]*?))\s*(?:(?:;\s*)|$)/g,pu={accept:"application/ld+json, application/json"},mu={};var vu=mu;mu.IdentifierIssuer=lu;const gu="function"==typeof setImmediate&&setImmediate,yu=gu?e=>gu(e):e=>setTimeout(e,0);function bu(e,t,r){mu.nextTick(()=>e(t,r));}mu.nextTick="object"==typeof ft?Qe:yu,mu.setImmediate=gu?yu:mu.nextTick,mu.clone=function(e){if(e&&"object"==typeof e){let t;if(au.isArray(e)){t=[];for(let r=0;r<e.length;++r)t[r]=mu.clone(e[r]);}else if(e instanceof Map){t=new Map;for(const[r,n]of e)t.set(r,mu.clone(n));}else if(e instanceof Set){t=new Set;for(const r of e)t.add(mu.clone(r));}else if(au.isObject(e)){t={};for(const r in e)t[r]=mu.clone(e[r]);}else t=e.toString();return t}return e},mu.asArray=function(e){return Array.isArray(e)?e:[e]},mu.buildHeaders=(e={})=>{if(Object.keys(e).some(e=>"accept"===e.toLowerCase()))throw new RangeError('Accept header may not be specified; only "'+pu.accept+'" is supported.');return Object.assign({Accept:pu.accept},e)},mu.parseLinkHeader=e=>{const t={},r=e.match(fu);for(let e=0;e<r.length;++e){let n=r[e].match(hu);if(!n)continue;const i={target:n[1]},o=n[2];for(;n=du.exec(o);)i[n[1]]=void 0===n[2]?n[3]:n[2];const a=i.rel||"";Array.isArray(t[a])?t[a].push(i):t.hasOwnProperty(a)?t[a]=[t[a],i]:t[a]=i;}return t},mu.validateTypeValue=e=>{if(au.isString(e)||au.isEmptyObject(e))return;let t=!1;if(au.isArray(e)){t=!0;for(let r=0;r<e.length;++r)if(!au.isString(e[r])){t=!1;break}}if(!t)throw new uu('Invalid JSON-LD syntax; "@type" value must a string, an array of strings, or an empty object.',"jsonld.SyntaxError",{code:"invalid type value",value:e})},mu.hasProperty=(e,t)=>{if(e.hasOwnProperty(t)){const r=e[t];return !au.isArray(r)||r.length>0}return !1},mu.hasValue=(e,t,r)=>{if(mu.hasProperty(e,t)){let n=e[t];const i=cu.isList(n);if(au.isArray(n)||i){i&&(n=n["@list"]);for(let e=0;e<n.length;++e)if(mu.compareValues(r,n[e]))return !0}else if(!au.isArray(r))return mu.compareValues(r,n)}return !1},mu.addValue=(e,t,r,n)=>{if("propertyIsArray"in(n=n||{})||(n.propertyIsArray=!1),"valueIsArray"in n||(n.valueIsArray=!1),"allowDuplicate"in n||(n.allowDuplicate=!0),n.valueIsArray)e[t]=r;else if(au.isArray(r)){0===r.length&&n.propertyIsArray&&!e.hasOwnProperty(t)&&(e[t]=[]);for(let i=0;i<r.length;++i)mu.addValue(e,t,r[i],n);}else if(e.hasOwnProperty(t)){const i=!n.allowDuplicate&&mu.hasValue(e,t,r);au.isArray(e[t])||i&&!n.propertyIsArray||(e[t]=[e[t]]),i||e[t].push(r);}else e[t]=n.propertyIsArray?[r]:r;},mu.getValues=(e,t)=>[].concat(e[t]||[]),mu.removeProperty=(e,t)=>{delete e[t];},mu.removeValue=(e,t,r,n)=>{"propertyIsArray"in(n=n||{})||(n.propertyIsArray=!1);const i=mu.getValues(e,t).filter(e=>!mu.compareValues(e,r));0===i.length?mu.removeProperty(e,t):1!==i.length||n.propertyIsArray?e[t]=i:e[t]=i[0];},mu.relabelBlankNodes=(e,t)=>function e(t,r){if(au.isArray(r))for(let n=0;n<r.length;++n)r[n]=e(t,r[n]);else if(cu.isList(r))r["@list"]=e(t,r["@list"]);else if(au.isObject(r)){cu.isBlankNode(r)&&(r["@id"]=t.getId(r["@id"]));const n=Object.keys(r).sort();for(let i=0;i<n.length;++i){const o=n[i];"@id"!==o&&(r[o]=e(t,r[o]));}}return r}((t=t||{}).issuer||new lu("_:b"),e),mu.compareValues=(e,t)=>e===t||(!(!cu.isValue(e)||!cu.isValue(t)||e["@value"]!==t["@value"]||e["@type"]!==t["@type"]||e["@language"]!==t["@language"]||e["@index"]!==t["@index"])||!!(au.isObject(e)&&"@id"in e&&au.isObject(t)&&"@id"in t)&&e["@id"]===t["@id"]),mu.compareShortestLeast=(e,t)=>e.length<t.length?-1:t.length<e.length?1:e===t?0:e<t?-1:1,mu.normalizeDocumentLoader=e=>e.length<2?mu.callbackify(e):async function(t){const r=arguments[1];return new Promise((n,i)=>{try{e(t,(e,t)=>{if("function"==typeof r)return bu(r,e,t);e?i(e):n(t);});}catch(e){if("function"==typeof r)return bu(r,e);i(e);}})},mu.callbackify=e=>async function(...t){const r=t[t.length-1];let n;"function"==typeof r&&t.pop();try{n=await e.apply(null,t);}catch(e){if("function"==typeof r)return bu(r,e);throw e}return "function"==typeof r?bu(r,null,n):n};var wu=iu.NQuads;const _u="http://www.w3.org/1999/02/22-rdf-syntax-ns#",Su="http://www.w3.org/2001/XMLSchema#";var Eu={LINK_HEADER_REL:"http://www.w3.org/ns/json-ld#context",RDF:_u,RDF_LIST:_u+"List",RDF_FIRST:_u+"first",RDF_REST:_u+"rest",RDF_NIL:_u+"nil",RDF_TYPE:_u+"type",RDF_PLAIN_LITERAL:_u+"PlainLiteral",RDF_XML_LITERAL:_u+"XMLLiteral",RDF_JSON_LITERAL:_u+"JSON",RDF_OBJECT:_u+"object",RDF_LANGSTRING:_u+"langString",XSD:Su,XSD_BOOLEAN:Su+"boolean",XSD_DOUBLE:Su+"double",XSD_INTEGER:Su+"integer",XSD_STRING:Su+"string"};const{RDF_LANGSTRING:xu,RDF_PLAIN_LITERAL:Iu,RDF_OBJECT:ku,RDF_XML_LITERAL:Pu,XSD_STRING:Ou}=Eu;let Tu;Tu="undefined"!=typeof Node?Node:{ELEMENT_NODE:1,ATTRIBUTE_NODE:2,TEXT_NODE:3,CDATA_SECTION_NODE:4,ENTITY_REFERENCE_NODE:5,ENTITY_NODE:6,PROCESSING_INSTRUCTION_NODE:7,COMMENT_NODE:8,DOCUMENT_NODE:9,DOCUMENT_TYPE_NODE:10,DOCUMENT_FRAGMENT_NODE:11,NOTATION_NODE:12};function Au(){return "undefined"==typeof XMLSerializer?tu.XMLSerializer:XMLSerializer}const{clone:Cu}=vu;const Ru={};var Nu=Ru;Ru.parsers={simple:{keys:["href","scheme","authority","path","query","fragment"],regex:/^(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?/},full:{keys:["href","protocol","scheme","authority","auth","user","password","hostname","port","path","directory","file","query","fragment"],regex:/^(([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?(?:(((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/}},Ru.parse=(e,t)=>{const r={},n=Ru.parsers[t||"full"],i=n.regex.exec(e);let o=n.keys.length;for(;o--;)r[n.keys[o]]=void 0===i[o]?null:i[o];return ("https"===r.scheme&&"443"===r.port||"http"===r.scheme&&"80"===r.port)&&(r.href=r.href.replace(":"+r.port,""),r.authority=r.authority.replace(":"+r.port,""),r.port=null),r.normalizedPath=Ru.removeDotSegments(r.path),r},Ru.prependBase=(e,t)=>{if(null===e)return t;if(-1!==t.indexOf(":"))return t;au.isString(e)&&(e=Ru.parse(e||""));const r=Ru.parse(t),n={protocol:e.protocol||""};if(null!==r.authority)n.authority=r.authority,n.path=r.path,n.query=r.query;else if(n.authority=e.authority,""===r.path)n.path=e.path,null!==r.query?n.query=r.query:n.query=e.query;else {if(0===r.path.indexOf("/"))n.path=r.path;else {let t=e.path;t=t.substr(0,t.lastIndexOf("/")+1),t.length>0&&"/"!==t.substr(-1)&&(t+="/"),t+=r.path,n.path=t;}n.query=r.query;}""!==r.path&&(n.path=Ru.removeDotSegments(n.path));let i=n.protocol;return null!==n.authority&&(i+="//"+n.authority),i+=n.path,null!==n.query&&(i+="?"+n.query),null!==r.fragment&&(i+="#"+r.fragment),""===i&&(i="./"),i},Ru.removeBase=(e,t)=>{if(null===e)return t;au.isString(e)&&(e=Ru.parse(e||""));let r="";if(""!==e.href?r+=(e.protocol||"")+"//"+(e.authority||""):t.indexOf("//")&&(r+="//"),0!==t.indexOf(r))return t;const n=Ru.parse(t.substr(r.length)),i=e.normalizedPath.split("/"),o=n.normalizedPath.split("/"),a=n.fragment||n.query?0:1;for(;i.length>0&&o.length>a&&i[0]===o[0];)i.shift(),o.shift();let s="";if(i.length>0){i.pop();for(let e=0;e<i.length;++e)s+="../";}return s+=o.join("/"),null!==n.query&&(s+="?"+n.query),null!==n.fragment&&(s+="#"+n.fragment),""===s&&(s="./"),s},Ru.removeDotSegments=e=>{if(0===e.length)return "";const t=e.split("/"),r=[];for(;t.length>0;){const e=t.shift(),n=0===t.length;"."!==e?".."!==e?r.push(e):(r.pop(),n&&r.push("")):n&&r.push("");}return r.length>0&&""!==r[0]&&r.unshift(""),1===r.length&&""===r[0]?"/":r.join("/")};const Lu=/^([A-Za-z][A-Za-z0-9+-.]*|_):/;Ru.isAbsolute=e=>au.isString(e)&&Lu.test(e),Ru.isRelative=e=>au.isString(e);const{isArray:Mu,isObject:ju,isString:Du,isUndefined:Bu}=au,{isAbsolute:Uu,isRelative:Fu,prependBase:Hu,parse:zu}=Nu,{asArray:Vu,compareShortestLeast:qu}=vu,Ku=new Map,$u={};var Gu=$u;function Ju(e,t,r,n,i,o){if(null===t||!Du(t)||$u.isKeyword(t))return t;if(n&&n.hasOwnProperty(t)&&!0!==i.get(t)&&$u.createTermDefinition(e,n,t,i,o),e.isPropertyTermScoped&&e.previousContext&&(e=e.previousContext),(r=r||{}).vocab){const r=e.mappings.get(t);if(null===r)return null;if(r)return r["@id"]}const a=t.indexOf(":");if(-1!==a){const r=t.substr(0,a),s=t.substr(a+1);if("_"===r||0===s.indexOf("//"))return t;if(n&&n.hasOwnProperty(r)&&$u.createTermDefinition(e,n,r,i,o),e.mappings.has(r)){return e.mappings.get(r)["@id"]+s}return t}return r.vocab&&"@vocab"in e?e["@vocab"]+t:r.base?Hu(e["@base"],t):t}function Wu(e,t,r,n){if(Mu(e))for(const i of e)Wu(i,t,r,n);else if(ju(e))for(const i in e){if("@context"!==i){Wu(e[i],t,r,n);continue}const o=e[i];if(Mu(o)){let e=o.length;for(let i=0;i<e;++i){const a=o[i];if(Du(a)){const s=Hu(n,a),c=t.get(s);r?Mu(c)?(Array.prototype.splice.apply(o,[i,1].concat(c)),i+=c.length-1,e=o.length):!1!==c&&(o[i]=c):void 0===c&&t.set(s,!1);}else for(const e in a)ju(a[e])&&Wu(a[e],t,r,n);}}else if(Du(o)){const a=Hu(n,o),s=t.get(a);r?!1!==s&&(e[i]=s):void 0===s&&t.set(a,!1);}else for(const e in o)ju(o[e])&&Wu(o[e],t,r,n);}}$u.cache=new class{constructor(e=100){this.order=[],this.cache=new Map,this.size=e;}get(e,t){const r=this.cache.get(e);if(r){const e=JSON.stringify(t);return r.get(e)||null}return null}set(e,t,r){if(this.order.length===this.size){const e=this.order.shift();this.cache.get(e.activeCtx).delete(e.localCtx);}const n=JSON.stringify(t);this.order.push({activeCtx:e,localCtx:n});let i=this.cache.get(e);i||(i=new Map,this.cache.set(e,i)),i.set(n,Cu(r));}},$u.process=({activeCtx:e,localCtx:t,options:r,isPropertyTermScopedContext:n=!1,isTypeScopedContext:i=!1})=>{ju(t)&&"@context"in t&&Mu(t["@context"])&&(t=t["@context"]);const o=Vu(t);if(0===o.length)return e;const a=e.previousContext||e;if(n&&e.previousContext)return (e=e.clone()).isPropertyTermScoped=!0,e.previousContext=$u.process({activeCtx:e.previousContext,localCtx:o,options:r,isPropertyTermScopedContext:n}),e;let s=e;for(let c=0;c<o.length;++c){let u=o[c];if(e=s,null===u){if(!n&&0!==Object.keys(e.protected).length){const n=r&&r.protectedMode||"error";if("error"===n)throw new uu("Tried to nullify a context with protected terms outside of a term definition.","jsonld.SyntaxError",{code:"invalid context nullification"});if("warn"===n){console.warn("WARNING: invalid context nullification");const t=e;s=e=$u.getInitialContext(r).clone();for(const[r,n]of Object.entries(t.protected))n&&(e.mappings[r]=vu.clone(t.mappings[r]));e.protected=vu.clone(t.protected),$u.cache&&$u.cache.set(t,u,s);continue}throw new uu("Invalid protectedMode.","jsonld.SyntaxError",{code:"invalid protected mode",context:t,protectedMode:n})}s=e=$u.getInitialContext(r).clone(),i&&(s.previousContext=a.clone());continue}if($u.cache){const t=$u.cache.get(e,u);if(t){s=e=t;continue}}if(ju(u)&&"@context"in u&&(u=u["@context"]),!ju(u))throw new uu("Invalid JSON-LD syntax; @context must be an object.","jsonld.SyntaxError",{code:"invalid local context",context:u});s=s.clone();const l=new Map;if("@version"in u){if(1.1!==u["@version"])throw new uu("Unsupported JSON-LD version: "+u["@version"],"jsonld.UnsupportedVersion",{code:"invalid @version value",context:u});if(e.processingMode&&"json-ld-1.0"===e.processingMode)throw new uu("@version: "+u["@version"]+" not compatible with "+e.processingMode,"jsonld.ProcessingModeConflict",{code:"processing mode conflict",context:u});s.processingMode="json-ld-1.1",s["@version"]=u["@version"],l.set("@version",!0);}if(s.processingMode=s.processingMode||e.processingMode||"json-ld-1.0","@base"in u){let t=u["@base"];if(null===t);else if(Uu(t))t=zu(t);else {if(!Fu(t))throw new uu('Invalid JSON-LD syntax; the value of "@base" in a @context must be an absolute IRI, a relative IRI, or null.',"jsonld.SyntaxError",{code:"invalid base IRI",context:u});t=zu(Hu(e["@base"].href,t));}s["@base"]=t,l.set("@base",!0);}if("@vocab"in u){const e=u["@vocab"];if(null===e)delete s["@vocab"];else {if(!Du(e))throw new uu('Invalid JSON-LD syntax; the value of "@vocab" in a @context must be a string or null.',"jsonld.SyntaxError",{code:"invalid vocab mapping",context:u});if(!Uu(e))throw new uu('Invalid JSON-LD syntax; the value of "@vocab" in a @context must be an absolute IRI.',"jsonld.SyntaxError",{code:"invalid vocab mapping",context:u});s["@vocab"]=e;}l.set("@vocab",!0);}if("@language"in u){const e=u["@language"];if(null===e)delete s["@language"];else {if(!Du(e))throw new uu('Invalid JSON-LD syntax; the value of "@language" in a @context must be a string or null.',"jsonld.SyntaxError",{code:"invalid default language",context:u});s["@language"]=e.toLowerCase();}l.set("@language",!0);}l.set("@protected",u["@protected"]||!1);for(const e in u)$u.createTermDefinition(s,u,e,l,r,n);i&&!s.previousContext&&(s.previousContext=a.clone()),$u.cache&&$u.cache.set(e,u,s);}return s},$u.createTermDefinition=(e,t,r,n,i,o=!1)=>{if(n.has(r)){if(n.get(r))return;throw new uu("Cyclical context definition detected.","jsonld.CyclicalContext",{code:"cyclic IRI mapping",context:t,term:r})}if(n.set(r,!1),$u.isKeyword(r))throw new uu("Invalid JSON-LD syntax; keywords cannot be overridden.","jsonld.SyntaxError",{code:"keyword redefinition",context:t,term:r});if(""===r)throw new uu("Invalid JSON-LD syntax; a term cannot be an empty string.","jsonld.SyntaxError",{code:"invalid term definition",context:t});const a=e.mappings.get(r);let s;if(e.mappings.has(r)&&e.mappings.delete(r),t.hasOwnProperty(r)&&(s=t[r]),null===s||ju(s)&&null===s["@id"])return e.mappings.set(r,null),void n.set(r,!0);let c=!1;if(Du(s)&&(c=!0,s={"@id":s}),!ju(s))throw new uu("Invalid JSON-LD syntax; @context term values must be strings or objects.","jsonld.SyntaxError",{code:"invalid term definition",context:t});const u={};e.mappings.set(r,u),u.reverse=!1;const l=["@container","@id","@language","@reverse","@type"];$u.processingMode(e,1.1)&&l.push("@context","@nest","@prefix","@protected");for(const e in s)if(!l.includes(e))throw new uu("Invalid JSON-LD syntax; a term definition must not contain "+e,"jsonld.SyntaxError",{code:"invalid term definition",context:t});const f=r.indexOf(":");if(u._termHasColon=-1!==f,"@reverse"in s){if("@id"in s)throw new uu("Invalid JSON-LD syntax; a @reverse term definition must not contain @id.","jsonld.SyntaxError",{code:"invalid reverse property",context:t});if("@nest"in s)throw new uu("Invalid JSON-LD syntax; a @reverse term definition must not contain @nest.","jsonld.SyntaxError",{code:"invalid reverse property",context:t});const r=s["@reverse"];if(!Du(r))throw new uu("Invalid JSON-LD syntax; a @context @reverse value must be a string.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t});const o=Ju(e,r,{vocab:!0,base:!1},t,n,i);if(!Uu(o))throw new uu("Invalid JSON-LD syntax; a @context @reverse value must be an absolute IRI or a blank node identifier.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t});u["@id"]=o,u.reverse=!0;}else if("@id"in s){let o=s["@id"];if(!Du(o))throw new uu("Invalid JSON-LD syntax; a @context @id value must be an array of strings or a string.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t});if(o!==r){if(o=Ju(e,o,{vocab:!0,base:!1},t,n,i),!Uu(o)&&!$u.isKeyword(o))throw new uu("Invalid JSON-LD syntax; a @context @id value must be an absolute IRI, a blank node identifier, or a keyword.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t});u["@id"]=o,u._prefix=!u._termHasColon&&o.match(/[:\/\?#\[\]@]$/)&&(c||$u.processingMode(e,1));}}if(!("@id"in u))if(u._termHasColon){const o=r.substr(0,f);if(t.hasOwnProperty(o)&&$u.createTermDefinition(e,t,o,n,i),e.mappings.has(o)){const t=r.substr(f+1);u["@id"]=e.mappings.get(o)["@id"]+t;}else u["@id"]=r;}else {if(!("@vocab"in e))throw new uu("Invalid JSON-LD syntax; @context terms must define an @id.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t,term:r});u["@id"]=e["@vocab"]+r;}if((!0===s["@protected"]||!0===n.get("@protected")&&!1!==s["@protected"])&&(e.protected[r]=!0,u.protected=!0),n.set(r,!0),"@type"in s){let r=s["@type"];if(!Du(r))throw new uu("Invalid JSON-LD syntax; an @context @type value must be a string.","jsonld.SyntaxError",{code:"invalid type mapping",context:t});if("@id"!==r&&"@vocab"!==r&&"@json"!==r){if(r=Ju(e,r,{vocab:!0,base:!1},t,n,i),!Uu(r))throw new uu("Invalid JSON-LD syntax; an @context @type value must be an absolute IRI.","jsonld.SyntaxError",{code:"invalid type mapping",context:t});if(0===r.indexOf("_:"))throw new uu("Invalid JSON-LD syntax; an @context @type value must be an IRI, not a blank node identifier.","jsonld.SyntaxError",{code:"invalid type mapping",context:t})}u["@type"]=r;}if("@container"in s){const r=Du(s["@container"])?[s["@container"]]:s["@container"]||[],n=["@list","@set","@index","@language"];let i=!0;const o=r.includes("@set");if($u.processingMode(e,1.1))if(n.push("@graph","@id","@type"),r.includes("@list")){if(1!==r.length)throw new uu("Invalid JSON-LD syntax; @context @container with @list must have no other values","jsonld.SyntaxError",{code:"invalid container mapping",context:t})}else if(r.includes("@graph")){if(r.some(e=>"@graph"!==e&&"@id"!==e&&"@index"!==e&&"@set"!==e))throw new uu("Invalid JSON-LD syntax; @context @container with @graph must have no other values other than @id, @index, and @set","jsonld.SyntaxError",{code:"invalid container mapping",context:t})}else i&=r.length<=(o?2:1);else i&=!Mu(s["@container"]),i&=r.length<=1;if(i&=r.every(e=>n.includes(e)),i&=!(o&&r.includes("@list")),!i)throw new uu("Invalid JSON-LD syntax; @context @container value must be one of the following: "+n.join(", "),"jsonld.SyntaxError",{code:"invalid container mapping",context:t});if(u.reverse&&!r.every(e=>["@index","@set"].includes(e)))throw new uu("Invalid JSON-LD syntax; @context @container value for a @reverse type definition must be @index or @set.","jsonld.SyntaxError",{code:"invalid reverse property",context:t});u["@container"]=r;}if("@context"in s&&(u["@context"]=s["@context"]),"@language"in s&&!("@type"in s)){let e=s["@language"];if(null!==e&&!Du(e))throw new uu("Invalid JSON-LD syntax; @context @language value must be a string or null.","jsonld.SyntaxError",{code:"invalid language mapping",context:t});null!==e&&(e=e.toLowerCase()),u["@language"]=e;}if("@prefix"in s){if(u._termHasColon)throw new uu("Invalid JSON-LD syntax; @context @prefix used on a compact IRI term","jsonld.SyntaxError",{code:"invalid term definition",context:t});if("boolean"!=typeof s["@prefix"])throw new uu("Invalid JSON-LD syntax; @context value for @prefix must be boolean","jsonld.SyntaxError",{code:"invalid @prefix value",context:t});u._prefix=!0===s["@prefix"];}if("@nest"in s){const e=s["@nest"];if(!Du(e)||"@nest"!==e&&0===e.indexOf("@"))throw new uu("Invalid JSON-LD syntax; @context @nest value must be a string which is not a keyword other than @nest.","jsonld.SyntaxError",{code:"invalid @nest value",context:t});u["@nest"]=e;}
  // disallow aliasing @context and @preserve
  const h=u["@id"];if("@context"===h||"@preserve"===h)throw new uu("Invalid JSON-LD syntax; @context and @preserve cannot be aliased.","jsonld.SyntaxError",{code:"invalid keyword alias",context:t});if(a&&a.protected&&!o&&(e.protected[r]=!0,u.protected=!0,!function e(t,r){if(!t||"object"!=typeof t||!r||"object"!=typeof r)return t===r;const n=Array.isArray(t);if(n!==Array.isArray(r))return !1;if(n){if(t.length!==r.length)return !1;for(let n=0;n<t.length;++n)if(!e(t[n],r[n]))return !1;return !0}const i=Object.keys(t),o=Object.keys(r);if(i.length!==o.length)return !1;for(const n in t){let i=t[n],o=r[n];if("@container"===n&&Array.isArray(i)&&Array.isArray(o)&&(i=i.slice().sort(),o=o.slice().sort()),!e(i,o))return !1}return !0}(a,u))){const e=i&&i.protectedMode||"error";if("error"===e)throw new uu("Invalid JSON-LD syntax; tried to redefine a protected term.","jsonld.SyntaxError",{code:"protected term redefinition",context:t,term:r});if("warn"===e)return void console.warn("WARNING: protected term redefinition",{term:r});throw new uu("Invalid protectedMode.","jsonld.SyntaxError",{code:"invalid protected mode",context:t,term:r,protectedMode:e})}},$u.expandIri=(e,t,r,n)=>Ju(e,t,r,void 0,void 0,n),$u.getInitialContext=e=>{const t=zu(e.base||""),r=JSON.stringify({base:t,processingMode:e.processingMode}),n=Ku.get(r);if(n)return n;const i={"@base":t,processingMode:e.processingMode,mappings:new Map,inverse:null,getInverse:function(){const e=this;if(e.inverse)return e.inverse;const t=e.inverse={},r=e.fastCurieMap={},n={},i=e["@language"]||"@none",s=e.mappings,c=[...s.keys()].sort(qu);for(const e of c){const o=s.get(e);if(null===o)continue;let c=o["@container"]||"@none";c=[].concat(c).sort().join("");const u=Vu(o["@id"]);for(const s of u){let u=t[s];const l=$u.isKeyword(s);if(u)l||o._termHasColon||n[s].push(e);else if(t[s]=u={},!l&&!o._termHasColon){n[s]=[e];const t={iri:s,terms:n[s]};s[0]in r?r[s[0]].push(t):r[s[0]]=[t];}if(u[c]||(u[c]={"@language":{},"@type":{},"@any":{}}),u=u[c],a(e,u["@any"],"@none"),o.reverse)a(e,u["@type"],"@reverse");else if("@type"in o)a(e,u["@type"],o["@type"]);else if("@language"in o){const t=o["@language"]||"@null";a(e,u["@language"],t);}else a(e,u["@language"],i),a(e,u["@type"],"@none"),a(e,u["@language"],"@none");}}for(const e in r)o(r,e,1);return t},clone:function(){const e={};e["@base"]=this["@base"],e.mappings=vu.clone(this.mappings),e.clone=this.clone,e.inverse=null,e.getInverse=this.getInverse,e.protected=vu.clone(this.protected),this.previousContext&&(e.isPropertyTermScoped=this.previousContext.isPropertyTermScoped,e.previousContext=this.previousContext.clone());e.revertTypeScopedContext=this.revertTypeScopedContext,"@language"in this&&(e["@language"]=this["@language"]);"@vocab"in this&&(e["@vocab"]=this["@vocab"]);return e},revertTypeScopedContext:function(){if(!this.previousContext)return this;return this.previousContext.clone()},protected:{}};return 1e4===Ku.size&&Ku.clear(),Ku.set(r,i),i;function o(e,t,r){const n=e[t],i=e[t]={};let a,s;for(const e of n)a=e.iri,s=r>=a.length?"":a[r],s in i?i[s].push(e):i[s]=[e];for(const e in i)""!==e&&o(i,e,r+1);}function a(e,t,r){t.hasOwnProperty(r)||(t[r]=e);}},$u.getContextValue=(e,t,r)=>{if(null===t){if("@context"===r)return;return null}if(e.mappings.has(t)){const n=e.mappings.get(t);if(Bu(r))return n;if(n.hasOwnProperty(r))return n[r]}return "@language"===r&&e.hasOwnProperty(r)?e[r]:"@context"!==r?null:void 0},$u.getAllContexts=async(e,t)=>async function(e,t){const r=vu.normalizeDocumentLoader(t.documentLoader);return await n(e,new Set,r),e;async function n(e,r,i){if(r.size>10)throw new uu("Maximum number of @context URLs exceeded.","jsonld.ContextUrlError",{code:"loading remote context failed",max:10});const o=new Map;if(Wu(e,o,!1,t.base),0===o.size)return;const a=[...o.keys()].filter(e=>!1===o.get(e));return Promise.all(a.map(async a=>{if(r.has(a))throw new uu("Cyclical @context URLs detected.","jsonld.ContextUrlError",{code:"recursive context inclusion",url:a});const s=new Set(r);let c,u;s.add(a);try{c=await i(a),u=c.document||null,Du(u)&&(u=JSON.parse(u));}catch(e){throw new uu("Dereferencing a URL did not result in a valid JSON-LD object. Possible causes are an inaccessible URL perhaps due to a same-origin policy (ensure the server uses CORS if you are using client-side JavaScript), too many redirects, a non-JSON response, or more than one HTTP Link Header was provided for a remote context.","jsonld.InvalidUrl",{code:"loading remote context failed",url:a,cause:e})}if(!ju(u))throw new uu("Dereferencing a URL did not result in a JSON object. The response was valid JSON, but it was not a JSON object.","jsonld.InvalidUrl",{code:"invalid remote context",url:a});u="@context"in u?{"@context":u["@context"]}:{"@context":{}},c.contextUrl&&(Mu(u["@context"])||(u["@context"]=[u["@context"]]),u["@context"].push(c.contextUrl)),await n(u,s,i),o.set(a,u["@context"]),Wu(e,o,!0,t.base);}))}}(e,t),$u.processingMode=(e,t)=>t.toString()>="1.1"?e.processingMode&&e.processingMode>="json-ld-"+t.toString():!e.processingMode||"json-ld-1.0"===e.processingMode,$u.isKeyword=e=>{if(!Du(e))return !1;switch(e){case"@base":case"@container":case"@context":case"@default":case"@embed":case"@explicit":case"@graph":case"@id":case"@index":case"@json":case"@language":case"@list":case"@nest":case"@none":case"@omitDefault":case"@prefix":case"@preserve":case"@protected":case"@requireAll":case"@reverse":case"@set":case"@type":case"@value":case"@version":case"@vocab":return !0}return !1};const{isArray:Xu,isObject:Yu,isEmptyObject:Qu,isString:Zu,isUndefined:el}=au,{isList:tl,isValue:rl,isGraph:nl}=cu,{expandIri:il,getContextValue:ol,isKeyword:al,process:sl,processingMode:cl}=Gu,{isAbsolute:ul}=Nu,{addValue:ll,asArray:fl,getValues:hl,validateTypeValue:dl}=vu,pl={};var ml=pl;function vl(e,t,r){const n=[],i=Object.keys(t).sort();for(const o of i){const i=il(e,o,{vocab:!0},r);let a=t[o];Xu(a)||(a=[a]);for(const e of a){if(null===e)continue;if(!Zu(e))throw new uu("Invalid JSON-LD syntax; language map values must be strings.","jsonld.SyntaxError",{code:"invalid language map value",languageMap:t});const r={"@value":e};"@none"!==i&&(r["@language"]=o.toLowerCase()),n.push(r);}}return n}function gl({activeCtx:e,options:t,activeProperty:r,value:n,expansionMap:i,asGraph:o,indexKey:a}){const s=[],c=Object.keys(n).sort(),u="@type"===a;for(let l of c){if(u){const r=ol(e,l,"@context");el(r)||(e=sl({activeCtx:e,localCtx:r,isTypeScopedContext:!0,options:t}));}let c=n[l];Xu(c)||(c=[c]);const f=il(e,l,{vocab:!0},t);"@id"===a?l=il(e,l,{base:!0},t):u&&(l=f),c=pl.expand({activeCtx:e,activeProperty:r,element:c,options:t,insideList:!1,insideIndex:!0,expansionMap:i});for(let e of c)o&&!nl(e)&&(e={"@graph":[e]}),"@type"===a?"@none"===f||(e["@type"]?e["@type"]=[l].concat(e["@type"]):e["@type"]=[l]):"@none"===f||a in e||(e[a]=l),s.push(e);}return s}pl.expand=({activeCtx:e,activeProperty:t=null,element:r,options:n={},insideList:i=!1,insideIndex:o=!1,typeScopedContext:a=null,expansionMap:s=(()=>{})})=>{if(null==r)return null;if("@default"===t&&(n=Object.assign({},n,{isFrame:!1})),!Xu(r)&&!Yu(r)){if(!i&&(null===t||"@graph"===il(e,t,{vocab:!0},n))){const o=s({unmappedValue:r,activeCtx:e,activeProperty:t,options:n,insideList:i});return void 0===o?null:o}return function({activeCtx:e,activeProperty:t,value:r,options:n}){if(null==r)return null;const i=il(e,t,{vocab:!0},n);if("@id"===i)return il(e,r,{base:!0},n);if("@type"===i)return il(e,r,{vocab:!0,base:!0},n);const o=ol(e,t,"@type");if(("@id"===o||"@graph"===i)&&Zu(r))return {"@id":il(e,r,{base:!0},n)};if("@vocab"===o&&Zu(r))return {"@id":il(e,r,{vocab:!0,base:!0},n)};if(al(i))return r;const a={};if(o&&!["@id","@vocab"].includes(o))a["@type"]=o;else if(Zu(r)){const r=ol(e,t,"@language");null!==r&&(a["@language"]=r);}["boolean","number","string"].includes(typeof r)||(r=r.toString());return a["@value"]=r,a}({activeCtx:e,activeProperty:t,value:r,options:n})}if(Xu(r)){let c=[];const u=ol(e,t,"@container")||[];i=i||u.includes("@list");for(let u=0;u<r.length;++u){let l=pl.expand({activeCtx:e,activeProperty:t,element:r[u],options:n,expansionMap:s,insideIndex:o,typeScopedContext:a});i&&Xu(l)&&(l={"@list":l}),null===l&&(l=s({unmappedValue:r[u],activeCtx:e,activeProperty:t,parent:r,index:u,options:n,expandedParent:c,insideList:i}),void 0===l)||(Xu(l)?c=c.concat(l):c.push(l));}return c}const c=il(e,t,{vocab:!0},n);a=a||(e.previousContext?e:null);let u=Object.keys(r).sort(),l=!o;if(l&&a&&u.length<=2&&!u.includes("@context"))for(const t of u){const r=il(a,t,{vocab:!0},n);if("@value"===r){l=!1,e=a;break}if("@id"===r&&1===u.length){l=!1;break}}l&&(e=e.revertTypeScopedContext()),"@context"in r&&(e=sl({activeCtx:e,localCtx:r["@context"],options:n}));for(const t of u){if("@type"===il(e,t,{vocab:!0},n)){const i=r[t],o=Array.isArray(i)?i.length>1?i.slice().sort():i:[i];for(const t of o){const r=ol(e.previousContext||e,t,"@context");el(r)||(e=sl({activeCtx:e,localCtx:r,options:n,isTypeScopedContext:!0}));}}}let f={};!function e({activeCtx:t,activeProperty:r,expandedActiveProperty:n,element:i,expandedParent:o,options:a={},insideList:s,expansionMap:c}){const u=Object.keys(i).sort(),l=[];for(const e of u){let u,f=i[e];if("@context"===e)continue;let h=il(t,e,{vocab:!0},a);if((null===h||!ul(h)&&!al(h))&&(h=c({unmappedProperty:e,activeCtx:t,activeProperty:r,parent:i,options:a,insideList:s,value:f,expandedParent:o}),void 0===h))continue;if(al(h)){if("@reverse"===n)throw new uu("Invalid JSON-LD syntax; a keyword cannot be used as a @reverse property.","jsonld.SyntaxError",{code:"invalid reverse property map",value:f});if(h in o)throw new uu("Invalid JSON-LD syntax; colliding keywords detected.","jsonld.SyntaxError",{code:"colliding keywords",keyword:h})}if("@id"===h){if(!Zu(f)){if(!a.isFrame)throw new uu('Invalid JSON-LD syntax; "@id" value must a string.',"jsonld.SyntaxError",{code:"invalid @id value",value:f});if(Yu(f)){if(!Qu(f))throw new uu('Invalid JSON-LD syntax; "@id" value an empty object or array of strings, if framing',"jsonld.SyntaxError",{code:"invalid @id value",value:f})}else {if(!Xu(f))throw new uu('Invalid JSON-LD syntax; "@id" value an empty object or array of strings, if framing',"jsonld.SyntaxError",{code:"invalid @id value",value:f});if(!f.every(e=>Zu(e)))throw new uu('Invalid JSON-LD syntax; "@id" value an empty object or array of strings, if framing',"jsonld.SyntaxError",{code:"invalid @id value",value:f})}}ll(o,"@id",fl(f).map(e=>Zu(e)?il(t,e,{base:!0},a):e),{propertyIsArray:a.isFrame});continue}if("@type"===h){dl(f),ll(o,"@type",fl(f).map(e=>Zu(e)?il(t.previousContext||t,e,{base:!0,vocab:!0},a):e),{propertyIsArray:a.isFrame});continue}if("@graph"===h&&!Yu(f)&&!Xu(f))throw new uu('Invalid JSON-LD syntax; "@graph" value must not be an object or an array.',"jsonld.SyntaxError",{code:"invalid @graph value",value:f});if("@value"===h){ll(o,"@value",f,{propertyIsArray:a.isFrame});continue}if("@language"===h){if(null===f)continue;if(!Zu(f)&&!a.isFrame)throw new uu('Invalid JSON-LD syntax; "@language" value must be a string.',"jsonld.SyntaxError",{code:"invalid language-tagged string",value:f});f=fl(f).map(e=>Zu(e)?e.toLowerCase():e),ll(o,"@language",f,{propertyIsArray:a.isFrame});continue}if("@index"===h){if(!Zu(f))throw new uu('Invalid JSON-LD syntax; "@index" value must be a string.',"jsonld.SyntaxError",{code:"invalid @index value",value:f});ll(o,"@index",f);continue}if("@reverse"===h){if(!Yu(f))throw new uu('Invalid JSON-LD syntax; "@reverse" value must be an object.',"jsonld.SyntaxError",{code:"invalid @reverse value",value:f});if(u=pl.expand({activeCtx:t,activeProperty:"@reverse",element:f,options:a,expansionMap:c}),"@reverse"in u)for(const e in u["@reverse"])ll(o,e,u["@reverse"][e],{propertyIsArray:!0});let e=o["@reverse"]||null;for(const t in u){if("@reverse"===t)continue;null===e&&(e=o["@reverse"]={}),ll(e,t,[],{propertyIsArray:!0});const r=u[t];for(let n=0;n<r.length;++n){const i=r[n];if(rl(i)||tl(i))throw new uu('Invalid JSON-LD syntax; "@reverse" value must not be a @value or an @list.',"jsonld.SyntaxError",{code:"invalid reverse property value",value:u});ll(e,t,i,{propertyIsArray:!0});}}continue}if("@nest"===h){l.push(e);continue}let d=t;const p=ol(t,e,"@context");el(p)||(d=sl({activeCtx:t,localCtx:p,isPropertyTermScopedContext:!0,options:a}));const m=ol(d,e,"@container")||[];if(m.includes("@language")&&Yu(f))u=vl(d,f,a);else if(m.includes("@index")&&Yu(f)){const t=m.includes("@graph");u=gl({activeCtx:d,options:a,activeProperty:e,value:f,expansionMap:c,asGraph:t,indexKey:"@index"});}else if(m.includes("@id")&&Yu(f)){const t=m.includes("@graph");u=gl({activeCtx:d,options:a,activeProperty:e,value:f,expansionMap:c,asGraph:t,indexKey:"@id"});}else if(m.includes("@type")&&Yu(f))u=gl({activeCtx:d.revertTypeScopedContext(),options:a,activeProperty:e,value:f,expansionMap:c,asGraph:!1,indexKey:"@type"});else {const i="@list"===h;if(i||"@set"===h){let e=r;i&&"@graph"===n&&(e=null),u=pl.expand({activeCtx:d,activeProperty:e,element:f,options:a,insideList:i,expansionMap:c});}else u="@json"===ol(t,e,"@type")?{"@type":"@json","@value":f}:pl.expand({activeCtx:d,activeProperty:e,element:f,options:a,insideList:!1,expansionMap:c});}if(null===u&&"@value"!==h&&(u=c({unmappedValue:f,expandedProperty:h,activeCtx:d,activeProperty:r,parent:i,options:a,insideList:s,key:e,expandedParent:o}),void 0===u))continue;if("@list"!==h&&!tl(u)&&m.includes("@list")&&(u={"@list":fl(u)}),m.includes("@graph")&&!m.some(e=>"@id"===e||"@index"===e)&&(u=fl(u).map(e=>nl(e)?e:{"@graph":fl(e)})),d.mappings.has(e)&&d.mappings.get(e).reverse){const e=o["@reverse"]=o["@reverse"]||{};u=fl(u);for(let t=0;t<u.length;++t){const r=u[t];if(rl(r)||tl(r))throw new uu('Invalid JSON-LD syntax; "@reverse" value must not be a @value or an @list.',"jsonld.SyntaxError",{code:"invalid reverse property value",value:u});ll(e,h,r,{propertyIsArray:!0});}continue}const v=!["@index","@id","@type","@value","@language"].includes(h);ll(o,h,u,{propertyIsArray:v});}if("@value"in i){const e=i["@value"];if("@json"===i["@type"]&&cl(t,1.1));else if((Yu(e)||Xu(e))&&!a.isFrame)throw new uu('Invalid JSON-LD syntax; "@value" value must not be an object or an array.',"jsonld.SyntaxError",{code:"invalid value object value",value:e})}for(const u of l){const l=Xu(i[u])?i[u]:[i[u]];for(const i of l){if(!Yu(i)||Object.keys(i).some(e=>"@value"===il(t,e,{vocab:!0},a)))throw new uu("Invalid JSON-LD syntax; nested value must be a node object.","jsonld.SyntaxError",{code:"invalid @nest value",value:i});e({activeCtx:t,activeProperty:r,expandedActiveProperty:n,element:i,expandedParent:o,options:a,insideList:s,expansionMap:c});}}}({activeCtx:e,activeProperty:t,expandedActiveProperty:c,element:r,expandedParent:f,options:n,insideList:i,typeScopedContext:a,expansionMap:s}),u=Object.keys(f);let h=u.length;if("@value"in f){if("@type"in f&&"@language"in f)throw new uu('Invalid JSON-LD syntax; an element containing "@value" may not contain both "@type" and "@language".',"jsonld.SyntaxError",{code:"invalid value object",element:f});let o=h-1;if("@type"in f&&(o-=1),"@index"in f&&(o-=1),"@language"in f&&(o-=1),0!==o)throw new uu('Invalid JSON-LD syntax; an element containing "@value" may only have an "@index" property and at most one other property which can be "@type" or "@language".',"jsonld.SyntaxError",{code:"invalid value object",element:f});const a=null===f["@value"]?[]:fl(f["@value"]),c=hl(f,"@type");if(0===a.length){const o=s({unmappedValue:f,activeCtx:e,activeProperty:t,element:r,options:n,insideList:i});f=void 0!==o?o:null;}else {if(!a.every(e=>Zu(e)||Qu(e))&&"@language"in f)throw new uu("Invalid JSON-LD syntax; only strings may be language-tagged.","jsonld.SyntaxError",{code:"invalid language-tagged value",element:f});if(cl(e,1.1)&&c.includes("@json")&&1===c.length);else if(!c.every(e=>ul(e)&&!(Zu(e)&&0===e.indexOf("_:"))||Qu(e)))throw new uu('Invalid JSON-LD syntax; an element containing "@value" and "@type" must have an absolute IRI for the value of "@type".',"jsonld.SyntaxError",{code:"invalid typed value",element:f})}}else if("@type"in f&&!Xu(f["@type"]))f["@type"]=[f["@type"]];else if("@set"in f||"@list"in f){if(h>1&&!(2===h&&"@index"in f))throw new uu('Invalid JSON-LD syntax; if an element has the property "@set" or "@list", then it can have at most one other property that is "@index".',"jsonld.SyntaxError",{code:"invalid set or list object",element:f});"@set"in f&&(f=f["@set"],u=Object.keys(f),h=u.length);}else if(1===h&&"@language"in f){const o=s(f,{unmappedValue:f,activeCtx:e,activeProperty:t,element:r,options:n,insideList:i});f=void 0!==o?o:null;}if(Yu(f)&&!n.keepFreeFloatingNodes&&!i&&(null===t||"@graph"===c)&&(0===h||"@value"in f||"@list"in f||1===h&&"@id"in f)){const o=s({unmappedValue:f,activeCtx:e,activeProperty:t,element:r,options:n,insideList:i});f=void 0!==o?o:null;}return f};const{isKeyword:yl}=Gu,bl={};var wl=bl;bl.createMergedNodeMap=(e,t)=>{const r=(t=t||{}).issuer||new vu.IdentifierIssuer("_:b"),n={"@default":{}};return bl.createNodeMap(e,n,"@default",r),bl.mergeNodeMaps(n)},bl.createNodeMap=(e,t,r,n,i,o)=>{if(au.isArray(e)){for(const i of e)bl.createNodeMap(i,t,r,n,void 0,o);return}if(!au.isObject(e))return void(o&&o.push(e));if(cu.isValue(e)){if("@type"in e){let t=e["@type"];0===t.indexOf("_:")&&(e["@type"]=t=n.getId(t));}return void(o&&o.push(e))}if(o&&cu.isList(e)){const a=[];return bl.createNodeMap(e["@list"],t,r,n,i,a),void o.push({"@list":a})}if("@type"in e){const t=e["@type"];for(const e of t)0===e.indexOf("_:")&&n.getId(e);}au.isUndefined(i)&&(i=cu.isBlankNode(e)?n.getId(e["@id"]):e["@id"]),o&&o.push({"@id":i});const a=t[r],s=a[i]=a[i]||{};s["@id"]=i;const c=Object.keys(e).sort();for(let o of c){if("@id"===o)continue;if("@reverse"===o){const o={"@id":i},s=e["@reverse"];for(const e in s){const i=s[e];for(const s of i){let i=s["@id"];cu.isBlankNode(s)&&(i=n.getId(i)),bl.createNodeMap(s,t,r,n,i),vu.addValue(a[i],e,o,{propertyIsArray:!0,allowDuplicate:!1});}}continue}if("@graph"===o){i in t||(t[i]={}),bl.createNodeMap(e[o],t,i,n);continue}if("@type"!==o&&yl(o)){if("@index"===o&&o in s&&(e[o]!==s[o]||e[o]["@id"]!==s[o]["@id"]))throw new uu("Invalid JSON-LD syntax; conflicting @index property detected.","jsonld.SyntaxError",{code:"conflicting indexes",subject:s});s[o]=e[o];continue}const c=e[o];if(0===o.indexOf("_:")&&(o=n.getId(o)),0!==c.length)for(let e of c)if("@type"===o&&(e=0===e.indexOf("_:")?n.getId(e):e),cu.isSubject(e)||cu.isSubjectReference(e)){const i=cu.isBlankNode(e)?n.getId(e["@id"]):e["@id"];vu.addValue(s,o,{"@id":i},{propertyIsArray:!0,allowDuplicate:!1}),bl.createNodeMap(e,t,r,n,i);}else if(cu.isValue(e))vu.addValue(s,o,e,{propertyIsArray:!0,allowDuplicate:!1});else if(cu.isList(e)){const a=[];bl.createNodeMap(e["@list"],t,r,n,i,a),e={"@list":a},vu.addValue(s,o,e,{propertyIsArray:!0,allowDuplicate:!1});}else bl.createNodeMap(e,t,r,n,i),vu.addValue(s,o,e,{propertyIsArray:!0,allowDuplicate:!1});else vu.addValue(s,o,[],{propertyIsArray:!0});}},bl.mergeNodeMapGraphs=e=>{const t={};for(const r of Object.keys(e).sort())for(const n of Object.keys(e[r]).sort()){const i=e[r][n];n in t||(t[n]={"@id":n});const o=t[n];for(const e of Object.keys(i).sort())if(yl(e))o[e]=vu.clone(i[e]);else for(const t of i[e])vu.addValue(o,e,vu.clone(t),{propertyIsArray:!0,allowDuplicate:!1});}return t},bl.mergeNodeMaps=e=>{const t=e["@default"],r=Object.keys(e).sort();for(const n of r){if("@default"===n)continue;const r=e[n];let i=t[n];i?"@graph"in i||(i["@graph"]=[]):t[n]=i={"@id":n,"@graph":[]};const o=i["@graph"];for(const e of Object.keys(r).sort()){const t=r[e];cu.isSubjectReference(t)||o.push(t);}}return t};const{isSubjectReference:_l}=cu,{createMergedNodeMap:Sl}=wl,El={};var xl=El;El.flatten=e=>{const t=Sl(e),r=[],n=Object.keys(t).sort();for(let e=0;e<n.length;++e){const i=t[n[e]];_l(i)||r.push(i);}return r};const{RDF_LIST:Il,RDF_FIRST:kl,RDF_REST:Pl,RDF_NIL:Ol,RDF_TYPE:Tl,RDF_JSON_LITERAL:Al,XSD_BOOLEAN:Cl,XSD_DOUBLE:Rl,XSD_INTEGER:Nl,XSD_STRING:Ll}=Eu,Ml={};var jl=Ml;function Dl(e,t){if(e.termType.endsWith("Node"))return {"@id":e.value};const r={"@value":e.value};if(e.language)r["@language"]=e.language;else {let n=e.datatype.value;if(n||(n=Ll),n===Al){n="@json";try{r["@value"]=JSON.parse(r["@value"]);}catch(e){throw new uu("JSON literal could not be parsed.","jsonld.InvalidJsonLiteral",{code:"invalid JSON literal",value:r["@value"],cause:e})}}if(t){if(n===Cl)"true"===r["@value"]?r["@value"]=!0:"false"===r["@value"]&&(r["@value"]=!1);else if(au.isNumeric(r["@value"]))if(n===Nl){const e=parseInt(r["@value"],10);e.toFixed(0)===r["@value"]&&(r["@value"]=e);}else n===Rl&&(r["@value"]=parseFloat(r["@value"]));[Cl,Nl,Rl,Ll].includes(n)||(r["@type"]=n);}else n!==Ll&&(r["@type"]=n);}return r}Ml.fromRDF=async(e,{useRdfType:t=!1,useNativeTypes:r=!1})=>{const n={},i={"@default":n},o={};for(const a of e){const e="DefaultGraph"===a.graph.termType?"@default":a.graph.value;e in i||(i[e]={}),"@default"===e||e in n||(n[e]={"@id":e});const s=i[e],c=a.subject.value,u=a.predicate.value,l=a.object;c in s||(s[c]={"@id":c});const f=s[c],h=l.termType.endsWith("Node");if(!h||l.value in s||(s[l.value]={"@id":l.value}),u===Tl&&!t&&h){vu.addValue(f,"@type",l.value,{propertyIsArray:!0});continue}const d=Dl(l,r);if(vu.addValue(f,u,d,{propertyIsArray:!0}),h)if(l.value===Ol){const e=s[l.value];"usages"in e||(e.usages=[]),e.usages.push({node:f,property:u,value:d});}else l.value in o?o[l.value]=!1:o[l.value]={node:f,property:u,value:d};}for(const e in i){const t=i[e];if(!(Ol in t))continue;const r=t[Ol];if(r.usages){for(let e of r.usages){let r=e.node,n=e.property,i=e.value;const a=[],s=[];let c=Object.keys(r).length;for(;n===Pl&&au.isObject(o[r["@id"]])&&au.isArray(r[kl])&&1===r[kl].length&&au.isArray(r[Pl])&&1===r[Pl].length&&(3===c||4===c&&au.isArray(r["@type"])&&1===r["@type"].length&&r["@type"][0]===Il)&&(a.push(r[kl][0]),s.push(r["@id"]),e=o[r["@id"]],r=e.node,n=e.property,i=e.value,c=Object.keys(r).length,cu.isBlankNode(r)););delete i["@id"],i["@list"]=a.reverse();for(const e of s)delete t[e];}delete r.usages;}}const a=[],s=Object.keys(n).sort();for(const e of s){const t=n[e];if(e in i){const r=t["@graph"]=[],n=i[e],o=Object.keys(n).sort();for(const e of o){const t=n[e];cu.isSubjectReference(t)||r.push(t);}}cu.isSubjectReference(t)||a.push(t);}return a};var Bl=function(e){return function e(t){if(null===t||"object"!=typeof t||null!=t.toJSON)return JSON.stringify(t);if(Array.isArray(t)&&0===t.length)return "[]";if(Array.isArray(t)&&1===t.length)return "["+e(t[0])+"]";if(Array.isArray(t))return "["+t.reduce((t,r,n)=>(t=1===n?e(t):t)+","+e(r))+"]";const r=Object.keys(t);if(0===r.length)return "{}";if(1===r.length)return "{"+e(r[0])+":"+e(t[r[0]])+"}";return "{"+r.sort().reduce((r,n,i)=>(r=1===i?e(r)+":"+e(t[r]):r)+","+e(n)+":"+e(t[n]))+"}"}(e)};const{createNodeMap:Ul}=wl,{isKeyword:Fl}=Gu,{RDF_FIRST:Hl,RDF_REST:zl,RDF_NIL:Vl,RDF_TYPE:ql,RDF_JSON_LITERAL:Kl,RDF_LANGSTRING:$l,XSD_BOOLEAN:Gl,XSD_DOUBLE:Jl,XSD_INTEGER:Wl,XSD_STRING:Xl}=Eu,{isAbsolute:Yl}=Nu,Ql={};var Zl=Ql;function ef(e,t,r,n,i){const o=Object.keys(t).sort();for(const a of o){const o=t[a],s=Object.keys(o).sort();for(let t of s){const s=o[t];if("@type"===t)t=ql;else if(Fl(t))continue;for(const o of s){const s={termType:a.startsWith("_:")?"BlankNode":"NamedNode",value:a};if(!Yl(a))continue;const c={termType:t.startsWith("_:")?"BlankNode":"NamedNode",value:t};if(!Yl(t))continue;if("BlankNode"===c.termType&&!i.produceGeneralizedRdf)continue;const u=tf(o,n,e,r);u&&e.push({subject:s,predicate:c,object:u,graph:r});}}}}function tf(e,t,r,n){const i={};if(cu.isValue(e)){i.termType="Literal",i.value=void 0,i.datatype={termType:"NamedNode"};let t=e["@value"];const r=e["@type"]||null;"@json"===r?(i.value=Bl(t),i.datatype.value=Kl):au.isBoolean(t)?(i.value=t.toString(),i.datatype.value=r||Gl):au.isDouble(t)||r===Jl?(au.isDouble(t)||(t=parseFloat(t)),i.value=t.toExponential(15).replace(/(\d)0*e\+?/,"$1E"),i.datatype.value=r||Jl):au.isNumber(t)?(i.value=t.toFixed(0),i.datatype.value=r||Wl):"@language"in e?(i.value=t,i.datatype.value=r||$l,i.language=e["@language"]):(i.value=t,i.datatype.value=r||Xl);}else if(cu.isList(e)){const o=function(e,t,r,n){const i={termType:"NamedNode",value:Hl},o={termType:"NamedNode",value:zl},a={termType:"NamedNode",value:Vl},s=e.pop(),c=s?{termType:"BlankNode",value:t.getId()}:a;let u=c;for(const a of e){const e=tf(a,t,r,n),s={termType:"BlankNode",value:t.getId()};r.push({subject:u,predicate:i,object:e,graph:n}),r.push({subject:u,predicate:o,object:s,graph:n}),u=s;}if(s){const e=tf(s,t,r,n);r.push({subject:u,predicate:i,object:e,graph:n}),r.push({subject:u,predicate:o,object:a,graph:n});}return c}(e["@list"],t,r,n);i.termType=o.termType,i.value=o.value;}else {const t=au.isObject(e)?e["@id"]:e;i.termType=t.startsWith("_:")?"BlankNode":"NamedNode",i.value=t;}return "NamedNode"!==i.termType||Yl(i.value)?i:null}Ql.toRDF=(e,t)=>{const r=new vu.IdentifierIssuer("_:b"),n={"@default":{}};Ul(e,n,"@default",r);const i=[],o=Object.keys(n).sort();for(const e of o){let o;if("@default"===e)o={termType:"DefaultGraph",value:""};else {if(!Yl(e))continue;o=e.startsWith("_:")?{termType:"BlankNode"}:{termType:"NamedNode"},o.value=e;}ef(i,n[e],o,r,t);}return i};const{isKeyword:rf}=Gu,{createNodeMap:nf,mergeNodeMapGraphs:of}=wl,af={};var sf=af;function cf(e){const t={};for(const r in e)void 0!==e[r]&&(t["@"+r]=[e[r]]);return [t]}function uf(e,t,r){for(let n=r.length-1;n>=0;--n){const i=r[n];if(i.graph===t&&i.subject["@id"]===e["@id"])return !0}return !1}function lf(e,t,r){const n="@"+r;let i=n in e?e[n][0]:t[r];return "embed"===r&&(!0===i?i="@last":!1===i?i="@never":"@always"!==i&&"@never"!==i&&"@link"!==i&&(i="@last")),i}function ff(e){if(!au.isArray(e)||1!==e.length||!au.isObject(e[0]))throw new uu("Invalid JSON-LD syntax; a JSON-LD frame must be a single object.","jsonld.SyntaxError",{frame:e})}function hf(e,t,r,n){let i=!0,o=!1;for(const a in r){let s=!1;const c=vu.getValues(t,a),u=0===vu.getValues(r,a).length;if(rf(a)){if("@id"!==a&&"@type"!==a)continue;if(i=!1,"@id"===a){if(r["@id"].length>=0&&!au.isEmptyObject(r["@id"][0]))return r["@id"].includes(c[0]);s=!0;continue}if("@type"in r)if(u){if(c.length>0)return !1;s=!0;}else {if(1!==r["@type"].length||!au.isEmptyObject(r["@type"][0])){for(const e of r["@type"])if(c.some(t=>t===e))return !0;return !1}s=c.length>0;}}const l=vu.getValues(r,a)[0];let f=!1;if(l&&(ff([l]),f="@default"in l),i=!1,0!==c.length||!f){if(c.length>0&&u)return !1;if(void 0===l){if(c.length>0)return !1;s=!0;}else if(au.isObject(l))s=c.length>0;else if(cu.isValue(l))s=c.some(e=>vf(l,e));else if(cu.isSubject(l)||cu.isSubjectReference(l))s=c.some(t=>mf(e,l,t,n));else if(cu.isList(l)){const t=l["@list"][0];if(cu.isList(c[0])){const r=c[0]["@list"];cu.isValue(t)?s=r.some(e=>vf(t,e)):(cu.isSubject(t)||cu.isSubjectReference(t))&&(s=r.some(r=>mf(e,t,r,n)));}else s=!1;}if(!s&&n.requireAll)return !1;o=o||s;}}return i||o}function df(e,t){const r=e.uniqueEmbeds[e.graph],n=r[t],i=n.parent,o=n.property,a={"@id":t};if(au.isArray(i)){for(let e=0;e<i.length;++e)if(vu.compareValues(i[e],a)){i[e]=a;break}}else {const e=au.isArray(i[o]);vu.removeValue(i,o,a,{propertyIsArray:e}),vu.addValue(i,o,a,{propertyIsArray:e});}const s=e=>{const t=Object.keys(r);for(const n of t)n in r&&au.isObject(r[n].parent)&&r[n].parent["@id"]===e&&(delete r[n],s(n));};s(t);}function pf(e,t,r){au.isObject(e)?vu.addValue(e,t,r,{propertyIsArray:!0}):e.push(r);}function mf(e,t,r,n){if(!("@id"in r))return !1;const i=e.subjects[r["@id"]];return i&&hf(e,i,t,n)}function vf(e,t){const r=t["@value"],n=t["@type"],i=t["@language"],o=e["@value"]?au.isArray(e["@value"])?e["@value"]:[e["@value"]]:[],a=e["@type"]?au.isArray(e["@type"])?e["@type"]:[e["@type"]]:[],s=e["@language"]?au.isArray(e["@language"])?e["@language"]:[e["@language"]]:[];return 0===o.length&&0===a.length&&0===s.length||!(!o.includes(r)&&!au.isEmptyObject(o[0]))&&(!!(!n&&0===a.length||a.includes(n)||n&&au.isEmptyObject(a[0]))&&!!(!i&&0===s.length||s.includes(i)||i&&au.isEmptyObject(s[0])))}af.frameMergedOrDefault=(e,t,r)=>{const n={options:r,graph:"@default",graphMap:{"@default":{}},graphStack:[],subjectStack:[],link:{},bnodeMap:{}},i=new vu.IdentifierIssuer("_:b");nf(e,n.graphMap,"@default",i),r.merged&&(n.graphMap["@merged"]=of(n.graphMap),n.graph="@merged"),n.subjects=n.graphMap[n.graph];const o=[];return af.frame(n,Object.keys(n.subjects).sort(),t,o),r.pruneBlankNodeIdentifiers&&(r.bnodesToClear=Object.keys(n.bnodeMap).filter(e=>1===n.bnodeMap[e].length)),o},af.frame=(e,t,r,n,i=null)=>{ff(r),r=r[0];const o=e.options,a={embed:lf(r,o,"embed"),explicit:lf(r,o,"explicit"),requireAll:lf(r,o,"requireAll")},s=function(e,t,r,n){const i={};for(const o of t){const t=e.graphMap[e.graph][o];hf(e,t,r,n)&&(i[o]=t);}return i}(e,t,r,a),c=Object.keys(s).sort();for(const t of c){const c=s[t];if("@link"===a.embed&&t in e.link){pf(n,i,e.link[t]);continue}null===i?e.uniqueEmbeds={[e.graph]:{}}:e.uniqueEmbeds[e.graph]=e.uniqueEmbeds[e.graph]||{};const u={};if(u["@id"]=t,0===t.indexOf("_:")&&vu.addValue(e.bnodeMap,t,u,{propertyIsArray:!0}),e.link[t]=u,"@never"===a.embed||uf(c,e.graph,e.subjectStack))pf(n,i,u);else {if("@last"===a.embed&&(t in e.uniqueEmbeds[e.graph]&&df(e,t),e.uniqueEmbeds[e.graph][t]={parent:n,property:i}),e.subjectStack.push({subject:c,graph:e.graph}),t in e.graphMap){let n=!1,i=null;"@graph"in r?(i=r["@graph"][0],au.isObject(i)||(i={}),n=!("@merged"===t||"@default"===t)):(n="@merged"!==e.graph,i={}),n&&(e.graphStack.push(e.graph),e.graph=t,af.frame(e,Object.keys(e.graphMap[t]).sort(),[i],u,"@graph"),e.graph=e.graphStack.pop);}for(const t of Object.keys(c).sort())if(rf(t)){if(u[t]=vu.clone(c[t]),"@type"===t)for(const t of c["@type"])0===t.indexOf("_:")&&vu.addValue(e.bnodeMap,t,u,{propertyIsArray:!0});}else if(!a.explicit||t in r)for(let n of c[t]){const i=t in r?r[t]:cf(a);if(cu.isList(n)){const i={"@list":[]};pf(u,t,i);const o=n["@list"];for(const s in o)if(n=o[s],cu.isSubjectReference(n)){const o=t in r?r[t][0]["@list"]:cf(a);af.frame(e,[n["@id"]],o,i,"@list");}else pf(i,"@list",vu.clone(n));}else cu.isSubjectReference(n)?af.frame(e,[n["@id"]],i,u,t):vf(i[0],n)&&pf(u,t,vu.clone(n));}for(const e of Object.keys(r).sort()){if(rf(e))continue;const t=r[e][0]||{};if(!(lf(t,o,"omitDefault")||e in u)){let r="@null";"@default"in t&&(r=vu.clone(t["@default"])),au.isArray(r)||(r=[r]),u[e]=[{"@preserve":r}];}}if("@reverse"in r)for(const n of Object.keys(r["@reverse"]).sort()){const o=r["@reverse"][n];for(const r of Object.keys(e.subjects)){vu.getValues(e.subjects[r],n).some(e=>e["@id"]===t)&&(u["@reverse"]=u["@reverse"]||{},vu.addValue(u["@reverse"],n,[],{propertyIsArray:!0}),af.frame(e,[r],o,u["@reverse"][n],i));}}pf(n,i,u),e.subjectStack.pop();}}};const{isArray:gf,isObject:yf,isString:bf,isUndefined:wf}=au,{isList:_f,isValue:Sf,isGraph:Ef,isSimpleGraph:xf,isSubjectReference:If}=cu,{expandIri:kf,getContextValue:Pf,isKeyword:Of,process:Tf}=Gu,{removeBase:Af}=Nu,{addValue:Cf,asArray:Rf,compareShortestLeast:Nf}=vu,Lf={};var Mf=Lf;function jf(e,t,r){if("@nest"!==kf(e,t,{vocab:!0},r))throw new uu("JSON-LD compact error; nested property must have an @nest value resolving to @nest.","jsonld.SyntaxError",{code:"invalid @nest value"})}Lf.compact=({activeCtx:e,activeProperty:t=null,element:r,options:n={},compactionMap:i=(()=>{})})=>{if(gf(r)){let o=[];for(let a=0;a<r.length;++a){let s=Lf.compact({activeCtx:e,activeProperty:t,element:r[a],options:n,compactionMap:i});null===s&&(s=i({unmappedValue:r[a],activeCtx:e,activeProperty:t,parent:r,index:a,options:n}),void 0===s)||o.push(s);}if(n.compactArrays&&1===o.length){0===(Pf(e,t,"@container")||[]).length&&(o=o[0]);}return o}const o=Pf(e,t,"@context");if(wf(o)||(e=Tf({activeCtx:e,localCtx:o,isPropertyTermScopedContext:!0,options:n})),yf(r)){if(n.link&&"@id"in r&&n.link.hasOwnProperty(r["@id"])){const e=n.link[r["@id"]];for(let t=0;t<e.length;++t)if(e[t].expanded===r)return e[t].compacted}if(Sf(r)||If(r)){const i=Lf.compactValue({activeCtx:e,activeProperty:t,value:r,options:n});return n.link&&If(r)&&(n.link.hasOwnProperty(r["@id"])||(n.link[r["@id"]]=[]),n.link[r["@id"]].push({expanded:r,compacted:i})),i}if(_f(r)){if((Pf(e,t,"@container")||[]).includes("@list"))return Lf.compact({activeCtx:e,activeProperty:t,element:r["@list"],options:n,compactionMap:i})}const o="@reverse"===t,a={};e=e.revertTypeScopedContext(),n.link&&"@id"in r&&(n.link.hasOwnProperty(r["@id"])||(n.link[r["@id"]]=[]),n.link[r["@id"]].push({expanded:r,compacted:a}));let s=r["@type"]||[];s.length>1&&(s=Array.from(s).sort());const c=e;for(const t of s){const r=Lf.compactIri({activeCtx:c,iri:t,relativeTo:{vocab:!0}}),i=Pf(c,r,"@context");wf(i)||(e=Tf({activeCtx:e,localCtx:i,options:n,isTypeScopedContext:!0}));}const u=Object.keys(r).sort();for(const s of u){const c=r[s];if("@id"!==s&&"@type"!==s)if("@reverse"!==s)if("@preserve"!==s)if("@index"!==s)if("@graph"!==s&&"@list"!==s&&Of(s)){const t=Lf.compactIri({activeCtx:e,iri:s,relativeTo:{vocab:!0}});Cf(a,t,c);}else {if(!gf(c))throw new uu("JSON-LD expansion error; expanded value must be an array.","jsonld.SyntaxError");if(0===c.length){const t=Lf.compactIri({activeCtx:e,iri:s,value:c,relativeTo:{vocab:!0},reverse:o}),r=e.mappings.has(t)?e.mappings.get(t)["@nest"]:null;let i=a;r&&(jf(e,r,n),yf(a[r])||(a[r]={}),i=a[r]),Cf(i,t,c,{propertyIsArray:!0});}for(const t of c){const r=Lf.compactIri({activeCtx:e,iri:s,value:t,relativeTo:{vocab:!0},reverse:o}),c=e.mappings.has(r)?e.mappings.get(r)["@nest"]:null;let u=a;c&&(jf(e,c,n),yf(a[c])||(a[c]={}),u=a[c]);const l=Pf(e,r,"@container")||[],f=Ef(t),h=_f(t);let d;h?d=t["@list"]:f&&(d=t["@graph"]);let p=Lf.compact({activeCtx:e,activeProperty:r,element:h||f?d:t,options:n,compactionMap:i});if(h){if(gf(p)||(p=[p]),l.includes("@list")){Cf(u,r,p,{valueIsArray:!0,allowDuplicate:!0});continue}p={[Lf.compactIri({activeCtx:e,iri:"@list",relativeTo:{vocab:!0}})]:p},"@index"in t&&(p[Lf.compactIri({activeCtx:e,iri:"@index",relativeTo:{vocab:!0}})]=t["@index"]);}if(f)if(l.includes("@graph")&&(l.includes("@id")||l.includes("@index")&&xf(t))){let i;u.hasOwnProperty(r)?i=u[r]:u[r]=i={};const o=(l.includes("@id")?t["@id"]:t["@index"])||Lf.compactIri({activeCtx:e,iri:"@none",vocab:!0});Cf(i,o,p,{propertyIsArray:!n.compactArrays||l.includes("@set")});}else l.includes("@graph")&&xf(t)||(gf(p)&&1===p.length&&n.compactArrays&&(p=p[0]),p={[Lf.compactIri({activeCtx:e,iri:"@graph",relativeTo:{vocab:!0}})]:p},"@id"in t&&(p[Lf.compactIri({activeCtx:e,iri:"@id",relativeTo:{vocab:!0}})]=t["@id"]),"@index"in t&&(p[Lf.compactIri({activeCtx:e,iri:"@index",relativeTo:{vocab:!0}})]=t["@index"])),Cf(u,r,p,{propertyIsArray:!n.compactArrays||l.includes("@set")});else if(l.includes("@language")||l.includes("@index")||l.includes("@id")||l.includes("@type")){let n,i;if(u.hasOwnProperty(r)?n=u[r]:u[r]=n={},l.includes("@language"))Sf(p)&&(p=p["@value"]),i=t["@language"];else if(l.includes("@index"))i=t["@index"];else if(l.includes("@id")){const t=Lf.compactIri({activeCtx:e,iri:"@id",vocab:!0});i=p[t],delete p[t];}else if(l.includes("@type")){const t=Lf.compactIri({activeCtx:e,iri:"@type",vocab:!0});let r;switch([i,...r]=Rf(p[t]||[]),r.length){case 0:delete p[t];break;case 1:p[t]=r[0];break;default:p[t]=r;}}i||(i=Lf.compactIri({activeCtx:e,iri:"@none",vocab:!0})),Cf(n,i,p,{propertyIsArray:l.includes("@set")});}else {const e=!n.compactArrays||l.includes("@set")||l.includes("@list")||gf(p)&&0===p.length||"@list"===s||"@graph"===s;Cf(u,r,p,{propertyIsArray:e});}}}else {if((Pf(e,t,"@container")||[]).includes("@index"))continue;const r=Lf.compactIri({activeCtx:e,iri:s,relativeTo:{vocab:!0}});Cf(a,r,c);}else {const r=Lf.compact({activeCtx:e,activeProperty:t,element:c,options:n,compactionMap:i});gf(r)&&0===r.length||Cf(a,s,r);}else {const t=Lf.compact({activeCtx:e,activeProperty:"@reverse",element:c,options:n,compactionMap:i});for(const r in t)if(e.mappings.has(r)&&e.mappings.get(r).reverse){const i=t[r],o=(Pf(e,r,"@container")||[]).includes("@set")||!n.compactArrays;Cf(a,r,i,{propertyIsArray:o}),delete t[r];}if(Object.keys(t).length>0){const r=Lf.compactIri({activeCtx:e,iri:s,relativeTo:{vocab:!0}});Cf(a,r,t);}}else {const t="@type"===s,r=t&&e.previousContext||e;let n=Rf(c).map(e=>Lf.compactIri({activeCtx:r,iri:e,relativeTo:{vocab:t}}));1===n.length&&(n=n[0]);const i=Lf.compactIri({activeCtx:e,iri:s,relativeTo:{vocab:!0}}),o=gf(n)&&0===c.length;Cf(a,i,n,{propertyIsArray:o});}}return a}return r},Lf.compactIri=({activeCtx:e,iri:t,value:r=null,relativeTo:n={vocab:!1},reverse:i=!1})=>{if(null===t)return t;e.isPropertyTermScoped&&e.previousContext&&(e=e.previousContext);const o=e.getInverse();if(Of(t)&&t in o&&"@none"in o[t]&&"@type"in o[t]["@none"]&&"@none"in o[t]["@none"]["@type"])return o[t]["@none"]["@type"]["@none"];if(n.vocab&&t in o){const n=e["@language"]||"@none",o=[];yf(r)&&"@index"in r&&!("@graph"in r)&&o.push("@index","@index@set"),yf(r)&&"@preserve"in r&&(r=r["@preserve"][0]),Ef(r)?("@index"in r&&o.push("@graph@index","@graph@index@set","@index","@index@set"),"@id"in r&&o.push("@graph@id","@graph@id@set"),o.push("@graph","@graph@set","@set"),"@index"in r||o.push("@graph@index","@graph@index@set","@index","@index@set"),"@id"in r||o.push("@graph@id","@graph@id@set")):yf(r)&&!Sf(r)&&o.push("@id","@id@set","@type","@set@type");let a="@language",s="@null";if(i)a="@type",s="@reverse",o.push("@set");else if(_f(r)){"@index"in r||o.push("@list");const e=r["@list"];if(0===e.length)a="@any",s="@none";else {let t=0===e.length?n:null,r=null;for(let n=0;n<e.length;++n){const i=e[n];let o="@none",a="@none";if(Sf(i)?"@language"in i?o=i["@language"]:"@type"in i?a=i["@type"]:o="@null":a="@id",null===t?t=o:o!==t&&Sf(i)&&(t="@none"),null===r?r=a:a!==r&&(r="@none"),"@none"===t&&"@none"===r)break}t=t||"@none",r=r||"@none","@none"!==r?(a="@type",s=r):s=t;}}else Sf(r)?"@language"in r&&!("@index"in r)?(o.push("@language","@language@set"),s=r["@language"]):"@type"in r&&(a="@type",s=r["@type"]):(a="@type",s="@id"),o.push("@set");o.push("@none"),!yf(r)||"@index"in r||o.push("@index","@index@set"),Sf(r)&&1===Object.keys(r).length&&o.push("@language","@language@set");const c=function(e,t,r,n,i,o){null===o&&(o="@null");const a=[];if("@id"!==o&&"@reverse"!==o||!If(r))a.push(o);else {"@reverse"===o&&a.push("@reverse");const t=Lf.compactIri({activeCtx:e,iri:r["@id"],relativeTo:{vocab:!0}});e.mappings.has(t)&&e.mappings.get(t)&&e.mappings.get(t)["@id"]===r["@id"]?a.push.apply(a,["@vocab","@id"]):a.push.apply(a,["@id","@vocab"]);}a.push("@none");const s=e.inverse[t];for(let e=0;e<n.length;++e){const t=n[e];if(!(t in s))continue;const r=s[t][i];for(let e=0;e<a.length;++e){const t=a[e];if(t in r)return r[t]}}return null}(e,t,r,o,a,s);if(null!==c)return c}if(n.vocab&&"@vocab"in e){const r=e["@vocab"];if(0===t.indexOf(r)&&t!==r){const n=t.substr(r.length);if(!e.mappings.has(n))return n}}let a=null;const s=[];let c=e.fastCurieMap;const u=t.length-1;for(let e=0;e<u&&t[e]in c;++e)c=c[t[e]],""in c&&s.push(c[""][0]);for(let n=s.length-1;n>=0;--n){const i=s[n],o=i.terms;for(const n of o){const o=n+":"+t.substr(i.iri.length);e.mappings.get(n)._prefix&&(!e.mappings.has(o)||null===r&&e.mappings.get(o)["@id"]===t)&&(null===a||Nf(o,a)<0)&&(a=o);}}return null!==a?a:n.vocab?t:Af(e["@base"],t)},Lf.compactValue=({activeCtx:e,activeProperty:t,value:r,options:n})=>{if(Sf(r)){const n=Pf(e,t,"@type"),i=Pf(e,t,"@language"),o=Pf(e,t,"@container")||[],a="@index"in r&&!o.includes("@index");if(!a&&(r["@type"]===n||r["@language"]===i))return r["@value"];const s=Object.keys(r).length,c=1===s||2===s&&"@index"in r&&!a,u="@language"in e,l=bf(r["@value"]),f=e.mappings.has(t)&&null===e.mappings.get(t)["@language"];if(c&&(!u||!l||f))return r["@value"];const h={};return a&&(h[Lf.compactIri({activeCtx:e,iri:"@index",relativeTo:{vocab:!0}})]=r["@index"]),"@type"in r?h[Lf.compactIri({activeCtx:e,iri:"@type",relativeTo:{vocab:!0}})]=Lf.compactIri({activeCtx:e,iri:r["@type"],relativeTo:{vocab:!0}}):"@language"in r&&(h[Lf.compactIri({activeCtx:e,iri:"@language",relativeTo:{vocab:!0}})]=r["@language"]),h[Lf.compactIri({activeCtx:e,iri:"@value",relativeTo:{vocab:!0}})]=r["@value"],h}const i=kf(e,t,{vocab:!0},n),o=Pf(e,t,"@type"),a=Lf.compactIri({activeCtx:e,iri:r["@id"],relativeTo:{vocab:"@vocab"===o}});return "@id"===o||"@vocab"===o||"@graph"===i?a:{[Lf.compactIri({activeCtx:e,iri:"@id",relativeTo:{vocab:!0}})]:a}},
  /**
   * Removes the @preserve keywords as the last step of the compaction
   * algorithm when it is running on framed output.
   *
   * @param ctx the active context used to compact the input.
   * @param input the framed, compacted output.
   * @param options the compaction options used.
   *
   * @return the resulting output.
   */
  Lf.removePreserve=(e,t,r)=>{if(gf(t)){const n=[];for(let i=0;i<t.length;++i){const o=Lf.removePreserve(e,t[i],r);null!==o&&n.push(o);}t=n;}else if(yf(t)){
  // remove @preserve
  if("@preserve"in t)return "@null"===t["@preserve"]?null:t["@preserve"];if(Sf(t))return t;if(_f(t))return t["@list"]=Lf.removePreserve(e,t["@list"],r),t;const n=Lf.compactIri({activeCtx:e,iri:"@id",relativeTo:{vocab:!0}});if(t.hasOwnProperty(n)){const e=t[n];if(r.link.hasOwnProperty(e)){const n=r.link[e].indexOf(t);if(-1!==n)return r.link[e][n];r.link[e].push(t);}else r.link[e]=[t];}const i=Lf.compactIri({activeCtx:e,iri:"@graph",relativeTo:{vocab:!0}});for(const o in t){if(o===n&&r.bnodesToClear.includes(t[o])){delete t[n];continue}let a=Lf.removePreserve(e,t[o],r);const s=Pf(e,o,"@container")||[];r.compactArrays&&gf(a)&&1===a.length&&0===s.length&&o!==i&&(a=a[0]),t[o]=a;}}return t};const{callbackify:Df,normalizeDocumentLoader:Bf}=vu;var Uf=class{constructor(){this._requests={},this.add=Df(this.add.bind(this));}wrapLoader(e){const t=this;return t._loader=Bf(e),function(){return t.add.apply(t,arguments)}}async add(e){const t=this;let r=t._requests[e];if(r)return Promise.resolve(r);r=t._requests[e]=t._loader(e);try{return await r}finally{delete t._requests[e];}}};const{parseLinkHeader:Ff,buildHeaders:Hf}=vu,{LINK_HEADER_REL:zf}=Eu;var Vf=({secure:e,strictSSL:t=!0,maxRedirects:r=-1,request:n,headers:i={}}={strictSSL:!0,maxRedirects:-1,headers:{}})=>{i=Hf(i),n=n||tu;const o=tu;return (new Uf).wrapLoader((function(a){return async function a(s,c){if(0!==s.indexOf("http:")&&0!==s.indexOf("https:"))throw new uu('URL could not be dereferenced; only "http" and "https" URLs are supported.',"jsonld.InvalidUrl",{code:"loading document failed",url:s});if(e&&0!==s.indexOf("https"))throw new uu('URL could not be dereferenced; secure mode is enabled and the URL\'s scheme is not "https".',"jsonld.InvalidUrl",{code:"loading document failed",url:s});let u,l=null;if(null!==l)return l;try{u=await function(e,t){return new Promise((r,n)=>{e(t,(e,t,i)=>{e?n(e):r({res:t,body:i});});})}(n,{url:s,headers:i,strictSSL:t,followRedirect:!1});}catch(e){throw new uu("URL could not be dereferenced, an error occurred.","jsonld.LoadDocumentError",{code:"loading document failed",url:s,cause:e})}const{res:f,body:h}=u;l={contextUrl:null,documentUrl:s,document:h||null};const d=o.STATUS_CODES[f.statusCode];if(f.statusCode>=400)throw new uu("URL could not be dereferenced: "+d,"jsonld.InvalidUrl",{code:"loading document failed",url:s,httpStatusCode:f.statusCode});if(f.headers.link&&"application/ld+json"!==f.headers["content-type"]){const e=Ff(f.headers.link)[zf];if(Array.isArray(e))throw new uu("URL could not be dereferenced, it has more than one associated HTTP Link Header.","jsonld.InvalidUrl",{code:"multiple context link headers",url:s});e&&(l.contextUrl=e.target);}if(f.statusCode>=300&&f.statusCode<400&&f.headers.location){if(c.length===r)throw new uu("URL could not be dereferenced; there were too many redirects.","jsonld.TooManyRedirects",{code:"loading document failed",url:s,httpStatusCode:f.statusCode,redirects:c});if(-1!==c.indexOf(s))throw new uu("URL could not be dereferenced; infinite redirection was detected.","jsonld.InfiniteRedirectDetected",{code:"recursive context inclusion",url:s,httpStatusCode:f.statusCode,redirects:c});return c.push(s),a(f.headers.location,c)}return c.push(s),l}(a,[])}))};const{parseLinkHeader:qf,buildHeaders:Kf}=vu,{LINK_HEADER_REL:$f}=Eu,Gf=/(^|(\r\n))link:/i;var Jf=({secure:e,headers:t={},xhr:r}={headers:{}})=>(t=Kf(t),(new Uf).wrapLoader((async function(n){if(0!==n.indexOf("http:")&&0!==n.indexOf("https:"))throw new uu('URL could not be dereferenced; only "http" and "https" URLs are supported.',"jsonld.InvalidUrl",{code:"loading document failed",url:n});if(e&&0!==n.indexOf("https"))throw new uu('URL could not be dereferenced; secure mode is enabled and the URL\'s scheme is not "https".',"jsonld.InvalidUrl",{code:"loading document failed",url:n});let i;try{i=await function(e,t,r){const n=new(e=e||XMLHttpRequest);return new Promise((e,i)=>{n.onload=()=>e(n),n.onerror=e=>i(e),n.open("GET",t,!0);for(const e in r)n.setRequestHeader(e,r[e]);n.send();})}(r,n,t);}catch(e){throw new uu("URL could not be dereferenced, an error occurred.","jsonld.LoadDocumentError",{code:"loading document failed",url:n,cause:e})}if(i.status>=400)throw new uu("URL could not be dereferenced: "+i.statusText,"jsonld.LoadDocumentError",{code:"loading document failed",url:n,httpStatusCode:i.status});const o={contextUrl:null,documentUrl:n,document:i.response},a=i.getResponseHeader("Content-Type");let s;Gf.test(i.getAllResponseHeaders())&&(s=i.getResponseHeader("Link"));if(s&&"application/ld+json"!==a){if(s=qf(s)[$f],Array.isArray(s))throw new uu("URL could not be dereferenced, it has more than one associated HTTP Link Header.","jsonld.InvalidUrl",{code:"multiple context link headers",url:n});s&&(o.contextUrl=s.target);}return o})));
  /**
   * A JavaScript implementation of the JSON-LD API.
   *
   * @author Dave Longley
   *
   * @license BSD 3-Clause License
   * Copyright (c) 2011-2017 Digital Bazaar, Inc.
   * All rights reserved.
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * Redistributions of source code must retain the above copyright notice,
   * this list of conditions and the following disclaimer.
   *
   * Redistributions in binary form must reproduce the above copyright
   * notice, this list of conditions and the following disclaimer in the
   * documentation and/or other materials provided with the distribution.
   *
   * Neither the name of the Digital Bazaar, Inc. nor the names of its
   * contributors may be used to endorse or promote products derived from
   * this software without specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
   * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
   * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
   * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
   * HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
   * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
   * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   */
  const Wf=vu.IdentifierIssuer,{expand:Xf}=ml,{flatten:Yf}=xl,{fromRDF:Qf}=jl,{toRDF:Zf}=Zl,{frameMergedOrDefault:eh}=sf,{isArray:th,isObject:rh,isString:nh}=au,{isSubjectReference:ih}=cu,{getInitialContext:oh,process:ah,getAllContexts:sh}=Gu,{compact:ch,compactIri:uh,removePreserve:lh}=Mf,{createNodeMap:fh,createMergedNodeMap:hh,mergeNodeMaps:dh}=wl,ph=void 0!==ft&&ft.versions&&ft.versions.node,mh=!ph&&("undefined"!=typeof window||"undefined"!=typeof self),vh=function(e){const t={};function r(t,{documentLoader:r=e.documentLoader,...n}){return Object.assign({},{documentLoader:r},n,t)}return e.compact=vu.callbackify((async function(t,n,i){if(arguments.length<2)throw new TypeError("Could not compact, too few arguments.");if(null===n)throw new uu("The compaction context must not be null.","jsonld.CompactError",{code:"invalid local context"});if(null===t)return null;let o;(i=r(i,{base:nh(t)?t:"",compactArrays:!0,compactToRelative:!0,graph:!1,skipExpansion:!1,link:!1,issuer:new Wf("_:b")})).link&&(i.skipExpansion=!0),i.compactToRelative||delete i.base,o=i.skipExpansion?t:await e.expand(t,i);const a=await e.processContext(oh(i),n,i);let s=ch({activeCtx:a,element:o,options:i,compactionMap:i.compactionMap});i.compactArrays&&!i.graph&&th(s)?1===s.length?s=s[0]:0===s.length&&(s={}):i.graph&&rh(s)&&(s=[s]),rh(n)&&"@context"in n&&(n=n["@context"]),n=vu.clone(n),th(n)||(n=[n]);const c=n;n=[];for(let e=0;e<c.length;++e)(!rh(c[e])||Object.keys(c[e]).length>0)&&n.push(c[e]);const u=n.length>0;if(1===n.length&&(n=n[0]),th(s)){const e=uh({activeCtx:a,iri:"@graph",relativeTo:{vocab:!0}}),t=s;s={},u&&(s["@context"]=n),s[e]=t;}else if(rh(s)&&u){const e=s;s={"@context":n};for(const t in e)s[t]=e[t];}if(i.framing){const e=uh({activeCtx:a,iri:"@graph",relativeTo:{vocab:!0}});
  // remove @preserve from results
  i.link={},s[e]=lh(a,s[e],i);}return s})),e.expand=vu.callbackify((async function(t,n){if(arguments.length<1)throw new TypeError("Could not expand, too few arguments.");!1===(n=r(n,{keepFreeFloatingNodes:!1})).expansionMap&&(n.expansionMap=void 0);const i={},o=[];if("expandContext"in n){const e=vu.clone(n.expandContext);rh(e)&&"@context"in e?i.expandContext=e:i.expandContext={"@context":e},o.push(i.expandContext);}let a;if(nh(t)){const r=await e.get(t,n);a=r.documentUrl,i.input=r.document,r.contextUrl&&(i.remoteContext={"@context":r.contextUrl},o.push(i.remoteContext));}else i.input=vu.clone(t);"base"in n||(n.base=a||""),await sh(i,n);let s=oh(n);o.forEach(e=>{s=ah({activeCtx:s,localCtx:e,options:n});});let c=Xf({activeCtx:s,element:i.input,options:n,expansionMap:n.expansionMap});return rh(c)&&"@graph"in c&&1===Object.keys(c).length?c=c["@graph"]:null===c&&(c=[]),th(c)||(c=[c]),c})),e.flatten=vu.callbackify((async function(t,n,i){if(arguments.length<1)return new TypeError("Could not flatten, too few arguments.");n="function"==typeof n?null:n||null,i=r(i,{base:nh(t)?t:""});const o=await e.expand(t,i),a=Yf(o);if(null===n)return a;i.graph=!0,i.skipExpansion=!0;const s=await e.compact(a,n,i);return s})),e.frame=vu.callbackify((async function(t,n,i){if(arguments.length<2)throw new TypeError("Could not frame, too few arguments.");if(i=r(i,{base:nh(t)?t:"",embed:"@last",explicit:!1,requireAll:!0,omitDefault:!1,pruneBlankNodeIdentifiers:!0,bnodesToClear:[]}),nh(n)){const t=await e.get(n,i);if(n=t.document,t.contextUrl){let e=n["@context"];e?th(e)?e.push(t.contextUrl):e=[e,t.contextUrl]:e=t.contextUrl,n["@context"]=e;}}const o=n&&n["@context"]||{},a=await e.expand(t,i),s=vu.clone(i);s.isFrame=!0,s.keepFreeFloatingNodes=!0;const c=await e.expand(n,s);s.merged=!("@graph"in n);const u=eh(a,c,s);s.graph=!0,s.skipExpansion=!0,s.link={},s.framing=!0;const l=await e.compact(u,o,s);return l})),e.link=vu.callbackify((async function(t,r,n){const i={};return r&&(i["@context"]=r),i["@embed"]="@link",e.frame(t,i,n)})),e.normalize=e.canonize=vu.callbackify((async function(t,n){if(arguments.length<1)throw new TypeError("Could not canonize, too few arguments.");if("inputFormat"in(n=r(n,{base:nh(t)?t:"",algorithm:"URDNA2015",skipExpansion:!1}))){if("application/n-quads"!==n.inputFormat&&"application/nquads"!==n.inputFormat)throw new uu("Unknown canonicalization input format.","jsonld.CanonizeError");const e=wu.parse(t);return iu.canonize(e,n)}const i=vu.clone(n);delete i.format,i.produceGeneralizedRdf=!1;const o=await e.toRDF(t,i);return iu.canonize(o,n)})),e.fromRDF=vu.callbackify((async function(e,n){if(arguments.length<1)throw new TypeError("Could not convert from RDF, too few arguments.");n=r(n,{format:nh(e)?"application/n-quads":void 0});const{format:i}=n;let o,{rdfParser:a}=n;if(i){if(a=a||t[i],!a)throw new uu("Unknown input format.","jsonld.UnknownFormat",{format:i})}else a=()=>e;return o=a.length>1?new Promise((t,r)=>{a(e,(e,n)=>{e?r(e):t(n);});}):Promise.resolve(a(e)),o=await o,Array.isArray(o)||(o=wu.legacyDatasetToQuads(o)),Qf(o,n)})),e.toRDF=vu.callbackify((async function(t,n){if(arguments.length<1)throw new TypeError("Could not convert to RDF, too few arguments.");let i;i=(n=r(n,{base:nh(t)?t:"",skipExpansion:!1})).skipExpansion?t:await e.expand(t,n);const o=Zf(i,n);if(n.format){if("application/n-quads"===n.format||"application/nquads"===n.format)return await wu.serialize(o);throw new uu("Unknown output format.","jsonld.UnknownFormat",{format:n.format})}return o})),e.createNodeMap=vu.callbackify((async function(t,n){if(arguments.length<1)throw new TypeError("Could not create node map, too few arguments.");n=r(n,{base:nh(t)?t:""});const i=await e.expand(t,n);return hh(i,n)})),e.merge=vu.callbackify((async function(t,n,i){if(arguments.length<1)throw new TypeError("Could not merge, too few arguments.");if(!th(t))throw new TypeError('Could not merge, "docs" must be an array.');n="function"==typeof n?null:n||null,i=r(i,{});const o=await Promise.all(t.map(t=>{const r=Object.assign({},i);return e.expand(t,r)}));let a=!0;"mergeNodes"in i&&(a=i.mergeNodes);const s=i.issuer||new Wf("_:b"),c={"@default":{}};for(let e=0;e<o.length;++e){const t=vu.relabelBlankNodes(o[e],{issuer:new Wf("_:b"+e+"-")}),r=a||0===e?c:{"@default":{}};if(fh(t,r,"@default",s),r!==c)for(const e in r){const t=r[e];if(!(e in c)){c[e]=t;continue}const n=c[e];for(const e in t)e in n||(n[e]=t[e]);}}const u=dh(c),l=[],f=Object.keys(u).sort();for(let e=0;e<f.length;++e){const t=u[f[e]];ih(t)||l.push(t);}if(null===n)return l;i.graph=!0,i.skipExpansion=!0;const h=await e.compact(l,n,i);return h})),Object.defineProperty(e,"documentLoader",{get:()=>e._documentLoader,set:t=>e._documentLoader=vu.normalizeDocumentLoader(t)}),e.documentLoader=async e=>{throw new uu("Could not retrieve a JSON-LD document from the URL. URL dereferencing not implemented.","jsonld.LoadDocumentError",{code:"loading document failed",url:e})},e.loadDocument=vu.callbackify((async function(){return e.documentLoader.apply(null,arguments)})),e.get=vu.callbackify((async function(t,r){let n;n="function"==typeof r.documentLoader?vu.normalizeDocumentLoader(r.documentLoader):e.documentLoader;const i=await n(t);try{if(!i.document)throw new uu("No remote document found at the given URL.","jsonld.NullRemoteDocument");nh(i.document)&&(i.document=JSON.parse(i.document));}catch(e){throw new uu("Could not retrieve a JSON-LD document from the URL.","jsonld.LoadDocumentError",{code:"loading document failed",cause:e,remoteDoc:i})}return i})),e.processContext=vu.callbackify((async function(e,t,n){if(n=r(n,{base:""}),null===t)return oh(n);t=vu.clone(t),rh(t)&&"@context"in t||(t={"@context":t});const i=await sh(t,n);return ah({activeCtx:e,localCtx:i,options:n})})),e.getContextValue=Gu.getContextValue,e.documentLoaders={},e.documentLoaders.node=Vf,e.documentLoaders.xhr=Jf,e.useDocumentLoader=function(t){if(!(t in e.documentLoaders))throw new uu('Unknown document loader type: "'+t+'"',"jsonld.UnknownDocumentLoader",{type:t});e.documentLoader=e.documentLoaders[t].apply(e,Array.prototype.slice.call(arguments,1));},e.registerRDFParser=function(e,r){t[e]=r;},e.unregisterRDFParser=function(e){delete t[e];},e.registerRDFParser("application/n-quads",wu.parse),e.registerRDFParser("application/nquads",wu.parse),e.registerRDFParser("rdfa-api",class{parse(e){const t={"@default":[]},r=e.getSubjects();for(let n=0;n<r.length;++n){const i=r[n];if(null===i)continue;const o=e.getSubjectTriples(i);if(null===o)continue;const a=o.predicates;for(const e in a){const r=a[e].objects;for(let n=0;n<r.length;++n){const o=r[n],a={};0===i.indexOf("_:")?a.subject={type:"blank node",value:i}:a.subject={type:"IRI",value:i},0===e.indexOf("_:")?a.predicate={type:"blank node",value:e}:a.predicate={type:"IRI",value:e};let s=o.value;if(o.type===Pu){const e=new(Au());s="";for(let t=0;t<o.value.length;t++)o.value[t].nodeType===Tu.ELEMENT_NODE?s+=e.serializeToString(o.value[t]):o.value[t].nodeType===Tu.TEXT_NODE&&(s+=o.value[t].nodeValue);}a.object={},o.type===ku?0===o.value.indexOf("_:")?a.object.type="blank node":a.object.type="IRI":(a.object.type="literal",o.type===Iu?o.language?(a.object.datatype=xu,a.object.language=o.language):a.object.datatype=Ou:a.object.datatype=o.type),a.object.value=s,t["@default"].push(a);}}}return t}}.parse),e.url=Nu,e.util=vu,Object.assign(e,vu),e.promises=e,e.RequestQueue=Uf,e.JsonLdProcessor=(e=>{class t{toString(){return "[object JsonLdProcessor]"}}return Object.defineProperty(t,"prototype",{writable:!1,enumerable:!1}),Object.defineProperty(t.prototype,"constructor",{writable:!0,enumerable:!1,configurable:!0,value:t}),t.compact=function(t,r){return arguments.length<2?Promise.reject(new TypeError("Could not compact, too few arguments.")):e.compact(t,r)},t.expand=function(t){return arguments.length<1?Promise.reject(new TypeError("Could not expand, too few arguments.")):e.expand(t)},t.flatten=function(t){return arguments.length<1?Promise.reject(new TypeError("Could not flatten, too few arguments.")):e.flatten(t)},t})(e),mh&&void 0===Wn.JsonLdProcessor&&Object.defineProperty(Wn,"JsonLdProcessor",{writable:!0,enumerable:!1,configurable:!0,value:e.JsonLdProcessor}),ph?e.useDocumentLoader("node"):"undefined"!=typeof XMLHttpRequest&&e.useDocumentLoader("xhr"),e},gh=function(){return vh((function(){return gh()}))};vh(gh);var yh=gh;const bh={};var wh=bh;bh.isArray=Array.isArray,bh.isBoolean=e=>"boolean"==typeof e||"[object Boolean]"===Object.prototype.toString.call(e),bh.isDouble=e=>bh.isNumber(e)&&-1!==String(e).indexOf("."),bh.isEmptyObject=e=>bh.isObject(e)&&0===Object.keys(e).length,bh.isNumber=e=>"number"==typeof e||"[object Number]"===Object.prototype.toString.call(e),bh.isNumeric=e=>!isNaN(parseFloat(e))&&isFinite(e),bh.isObject=e=>"[object Object]"===Object.prototype.toString.call(e),bh.isString=e=>"string"==typeof e||"[object String]"===Object.prototype.toString.call(e),bh.isUndefined=e=>void 0===e;const _h={};var Sh=_h;_h.isSubject=e=>{if(wh.isObject(e)&&!("@value"in e||"@set"in e||"@list"in e)){return Object.keys(e).length>1||!("@id"in e)}return !1},_h.isSubjectReference=e=>wh.isObject(e)&&1===Object.keys(e).length&&"@id"in e,_h.isValue=e=>wh.isObject(e)&&"@value"in e,_h.isList=e=>wh.isObject(e)&&"@list"in e,_h.isGraph=e=>wh.isObject(e)&&"@graph"in e&&1===Object.keys(e).filter(e=>"@id"!==e&&"@index"!==e).length,_h.isSimpleGraph=e=>_h.isGraph(e)&&!("@id"in e),_h.isBlankNode=e=>!!wh.isObject(e)&&("@id"in e?0===e["@id"].indexOf("_:"):0===Object.keys(e).length||!("@value"in e||"@set"in e||"@list"in e));var Eh=class extends Error{constructor(e="An unspecified JSON-LD error occurred.",t="jsonld.Error",r={}){super(e),this.name=t,this.message=e,this.details=r;}};function xh(e,t,r,n,i,o,a){try{var s=e[o](a),c=s.value;}catch(e){return void r(e)}s.done?t(c):Promise.resolve(c).then(n,i);}function Ih(e){return function(){var t=this,r=arguments;return new Promise((function(n,i){var o=e.apply(t,r);function a(e){xh(o,n,i,a,s,"next",e);}function s(e){xh(o,n,i,a,s,"throw",e);}a(void 0);}))}}const kh=iu.IdentifierIssuer,Ph=/(?:<[^>]*?>|"[^"]*?"|[^,])+/g,Oh=/\s*<([^>]*?)>\s*(?:;\s*(.*))?/,Th=/(.*?)=(?:(?:"([^"]*?)")|([^"]*?))\s*(?:(?:;\s*)|$)/g,Ah={accept:"application/ld+json, application/json"},Ch={};var Rh=Ch;Ch.IdentifierIssuer=kh;const Nh="function"==typeof setImmediate&&setImmediate,Lh=Nh?e=>Nh(e):e=>setTimeout(e,0);function Mh(e,t,r){Ch.nextTick(()=>e(t,r));}Ch.nextTick="object"==typeof ft?Qe:Lh,Ch.setImmediate=Nh?Lh:Ch.nextTick,Ch.clone=function(e){if(e&&"object"==typeof e){let t;if(wh.isArray(e)){t=[];for(let r=0;r<e.length;++r)t[r]=Ch.clone(e[r]);}else if(e instanceof Map){t=new Map;for(const[r,n]of e)t.set(r,Ch.clone(n));}else if(e instanceof Set){t=new Set;for(const r of e)t.add(Ch.clone(r));}else if(wh.isObject(e)){t={};for(const r in e)t[r]=Ch.clone(e[r]);}else t=e.toString();return t}return e},Ch.asArray=function(e){return Array.isArray(e)?e:[e]},Ch.buildHeaders=(e={})=>{if(Object.keys(e).some(e=>"accept"===e.toLowerCase()))throw new RangeError('Accept header may not be specified; only "'+Ah.accept+'" is supported.');return Object.assign({Accept:Ah.accept},e)},Ch.parseLinkHeader=e=>{const t={},r=e.match(Ph);for(let e=0;e<r.length;++e){let n=r[e].match(Oh);if(!n)continue;const i={target:n[1]},o=n[2];for(;n=Th.exec(o);)i[n[1]]=void 0===n[2]?n[3]:n[2];const a=i.rel||"";Array.isArray(t[a])?t[a].push(i):t.hasOwnProperty(a)?t[a]=[t[a],i]:t[a]=i;}return t},Ch.validateTypeValue=e=>{if(wh.isString(e)||wh.isEmptyObject(e))return;let t=!1;if(wh.isArray(e)){t=!0;for(let r=0;r<e.length;++r)if(!wh.isString(e[r])){t=!1;break}}if(!t)throw new Eh('Invalid JSON-LD syntax; "@type" value must a string, an array of strings, or an empty object.',"jsonld.SyntaxError",{code:"invalid type value",value:e})},Ch.hasProperty=(e,t)=>{if(e.hasOwnProperty(t)){const r=e[t];return !wh.isArray(r)||r.length>0}return !1},Ch.hasValue=(e,t,r)=>{if(Ch.hasProperty(e,t)){let n=e[t];const i=Sh.isList(n);if(wh.isArray(n)||i){i&&(n=n["@list"]);for(let e=0;e<n.length;++e)if(Ch.compareValues(r,n[e]))return !0}else if(!wh.isArray(r))return Ch.compareValues(r,n)}return !1},Ch.addValue=(e,t,r,n)=>{if("propertyIsArray"in(n=n||{})||(n.propertyIsArray=!1),"valueIsArray"in n||(n.valueIsArray=!1),"allowDuplicate"in n||(n.allowDuplicate=!0),n.valueIsArray)e[t]=r;else if(wh.isArray(r)){0===r.length&&n.propertyIsArray&&!e.hasOwnProperty(t)&&(e[t]=[]);for(let i=0;i<r.length;++i)Ch.addValue(e,t,r[i],n);}else if(e.hasOwnProperty(t)){const i=!n.allowDuplicate&&Ch.hasValue(e,t,r);wh.isArray(e[t])||i&&!n.propertyIsArray||(e[t]=[e[t]]),i||e[t].push(r);}else e[t]=n.propertyIsArray?[r]:r;},Ch.getValues=(e,t)=>[].concat(e[t]||[]),Ch.removeProperty=(e,t)=>{delete e[t];},Ch.removeValue=(e,t,r,n)=>{"propertyIsArray"in(n=n||{})||(n.propertyIsArray=!1);const i=Ch.getValues(e,t).filter(e=>!Ch.compareValues(e,r));0===i.length?Ch.removeProperty(e,t):1!==i.length||n.propertyIsArray?e[t]=i:e[t]=i[0];},Ch.relabelBlankNodes=(e,t)=>function e(t,r){if(wh.isArray(r))for(let n=0;n<r.length;++n)r[n]=e(t,r[n]);else if(Sh.isList(r))r["@list"]=e(t,r["@list"]);else if(wh.isObject(r)){Sh.isBlankNode(r)&&(r["@id"]=t.getId(r["@id"]));const n=Object.keys(r).sort();for(let i=0;i<n.length;++i){const o=n[i];"@id"!==o&&(r[o]=e(t,r[o]));}}return r}((t=t||{}).issuer||new kh("_:b"),e),Ch.compareValues=(e,t)=>e===t||(!(!Sh.isValue(e)||!Sh.isValue(t)||e["@value"]!==t["@value"]||e["@type"]!==t["@type"]||e["@language"]!==t["@language"]||e["@index"]!==t["@index"])||!!(wh.isObject(e)&&"@id"in e&&wh.isObject(t)&&"@id"in t)&&e["@id"]===t["@id"]),Ch.compareShortestLeast=(e,t)=>e.length<t.length?-1:t.length<e.length?1:e===t?0:e<t?-1:1,Ch.normalizeDocumentLoader=e=>e.length<2?Ch.callbackify(e):function(){var t=Ih((function*(t){const r=arguments[1];return new Promise((n,i)=>{try{e(t,(e,t)=>{if("function"==typeof r)return Mh(r,e,t);e?i(e):n(t);});}catch(e){if("function"==typeof r)return Mh(r,e);i(e);}})}));return function(e){return t.apply(this,arguments)}}(),Ch.callbackify=e=>function(){var t=Ih((function*(...t){const r=t[t.length-1];let n;"function"==typeof r&&t.pop();try{n=yield e.apply(null,t);}catch(e){if("function"==typeof r)return Mh(r,e);throw e}return "function"==typeof r?Mh(r,null,n):n}));return function(){return t.apply(this,arguments)}}();var jh=iu.NQuads;const Dh="http://www.w3.org/1999/02/22-rdf-syntax-ns#",Bh="http://www.w3.org/2001/XMLSchema#";var Uh={LINK_HEADER_REL:"http://www.w3.org/ns/json-ld#context",RDF:Dh,RDF_LIST:Dh+"List",RDF_FIRST:Dh+"first",RDF_REST:Dh+"rest",RDF_NIL:Dh+"nil",RDF_TYPE:Dh+"type",RDF_PLAIN_LITERAL:Dh+"PlainLiteral",RDF_XML_LITERAL:Dh+"XMLLiteral",RDF_JSON_LITERAL:Dh+"JSON",RDF_OBJECT:Dh+"object",RDF_LANGSTRING:Dh+"langString",XSD:Bh,XSD_BOOLEAN:Bh+"boolean",XSD_DOUBLE:Bh+"double",XSD_INTEGER:Bh+"integer",XSD_STRING:Bh+"string"};const{RDF_LANGSTRING:Fh,RDF_PLAIN_LITERAL:Hh,RDF_OBJECT:zh,RDF_XML_LITERAL:Vh,XSD_STRING:qh}=Uh;let Kh;Kh="undefined"!=typeof Node?Node:{ELEMENT_NODE:1,ATTRIBUTE_NODE:2,TEXT_NODE:3,CDATA_SECTION_NODE:4,ENTITY_REFERENCE_NODE:5,ENTITY_NODE:6,PROCESSING_INSTRUCTION_NODE:7,COMMENT_NODE:8,DOCUMENT_NODE:9,DOCUMENT_TYPE_NODE:10,DOCUMENT_FRAGMENT_NODE:11,NOTATION_NODE:12};function $h(){return "undefined"==typeof XMLSerializer?tu.XMLSerializer:XMLSerializer}const{clone:Gh}=Rh;const Jh={};var Wh=Jh;Jh.parsers={simple:{keys:["href","scheme","authority","path","query","fragment"],regex:/^(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?/},full:{keys:["href","protocol","scheme","authority","auth","user","password","hostname","port","path","directory","file","query","fragment"],regex:/^(([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?(?:(((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/}},Jh.parse=(e,t)=>{const r={},n=Jh.parsers[t||"full"],i=n.regex.exec(e);let o=n.keys.length;for(;o--;)r[n.keys[o]]=void 0===i[o]?null:i[o];return ("https"===r.scheme&&"443"===r.port||"http"===r.scheme&&"80"===r.port)&&(r.href=r.href.replace(":"+r.port,""),r.authority=r.authority.replace(":"+r.port,""),r.port=null),r.normalizedPath=Jh.removeDotSegments(r.path),r},Jh.prependBase=(e,t)=>{if(null===e)return t;if(-1!==t.indexOf(":"))return t;wh.isString(e)&&(e=Jh.parse(e||""));const r=Jh.parse(t),n={protocol:e.protocol||""};if(null!==r.authority)n.authority=r.authority,n.path=r.path,n.query=r.query;else if(n.authority=e.authority,""===r.path)n.path=e.path,null!==r.query?n.query=r.query:n.query=e.query;else {if(0===r.path.indexOf("/"))n.path=r.path;else {let t=e.path;t=t.substr(0,t.lastIndexOf("/")+1),t.length>0&&"/"!==t.substr(-1)&&(t+="/"),t+=r.path,n.path=t;}n.query=r.query;}""!==r.path&&(n.path=Jh.removeDotSegments(n.path));let i=n.protocol;return null!==n.authority&&(i+="//"+n.authority),i+=n.path,null!==n.query&&(i+="?"+n.query),null!==r.fragment&&(i+="#"+r.fragment),""===i&&(i="./"),i},Jh.removeBase=(e,t)=>{if(null===e)return t;wh.isString(e)&&(e=Jh.parse(e||""));let r="";if(""!==e.href?r+=(e.protocol||"")+"//"+(e.authority||""):t.indexOf("//")&&(r+="//"),0!==t.indexOf(r))return t;const n=Jh.parse(t.substr(r.length)),i=e.normalizedPath.split("/"),o=n.normalizedPath.split("/"),a=n.fragment||n.query?0:1;for(;i.length>0&&o.length>a&&i[0]===o[0];)i.shift(),o.shift();let s="";if(i.length>0){i.pop();for(let e=0;e<i.length;++e)s+="../";}return s+=o.join("/"),null!==n.query&&(s+="?"+n.query),null!==n.fragment&&(s+="#"+n.fragment),""===s&&(s="./"),s},Jh.removeDotSegments=e=>{if(0===e.length)return "";const t=e.split("/"),r=[];for(;t.length>0;){const e=t.shift(),n=0===t.length;"."!==e?".."!==e?r.push(e):(r.pop(),n&&r.push("")):n&&r.push("");}return r.length>0&&""!==r[0]&&r.unshift(""),1===r.length&&""===r[0]?"/":r.join("/")};const Xh=/^([A-Za-z][A-Za-z0-9+-.]*|_):/;function Yh(e,t,r,n,i,o,a){try{var s=e[o](a),c=s.value;}catch(e){return void r(e)}s.done?t(c):Promise.resolve(c).then(n,i);}function Qh(e){return function(){var t=this,r=arguments;return new Promise((function(n,i){var o=e.apply(t,r);function a(e){Yh(o,n,i,a,s,"next",e);}function s(e){Yh(o,n,i,a,s,"throw",e);}a(void 0);}))}}Jh.isAbsolute=e=>wh.isString(e)&&Xh.test(e),Jh.isRelative=e=>wh.isString(e);const{isArray:Zh,isObject:ed,isString:td,isUndefined:rd}=wh,{isAbsolute:nd,isRelative:id,prependBase:od,parse:ad}=Wh,{asArray:sd,compareShortestLeast:cd}=Rh,ud=new Map,ld={};var fd=ld;function hd(e,t,r,n,i,o){if(null===t||!td(t)||ld.isKeyword(t))return t;if(n&&n.hasOwnProperty(t)&&!0!==i.get(t)&&ld.createTermDefinition(e,n,t,i,o),e.isPropertyTermScoped&&e.previousContext&&(e=e.previousContext),(r=r||{}).vocab){const r=e.mappings.get(t);if(null===r)return null;if(r)return r["@id"]}const a=t.indexOf(":");if(-1!==a){const r=t.substr(0,a),s=t.substr(a+1);if("_"===r||0===s.indexOf("//"))return t;if(n&&n.hasOwnProperty(r)&&ld.createTermDefinition(e,n,r,i,o),e.mappings.has(r)){return e.mappings.get(r)["@id"]+s}return t}return r.vocab&&"@vocab"in e?e["@vocab"]+t:r.base?od(e["@base"],t):t}function dd(){return (dd=Qh((function*(e,t){const r=Rh.normalizeDocumentLoader(t.documentLoader);return yield n(e,new Set,r),e;function n(e,t,r){return i.apply(this,arguments)}function i(){return (i=Qh((function*(e,r,i){if(r.size>10)throw new Eh("Maximum number of @context URLs exceeded.","jsonld.ContextUrlError",{code:"loading remote context failed",max:10});const o=new Map;if(pd(e,o,!1,t.base),0===o.size)return;const a=[...o.keys()].filter(e=>!1===o.get(e));return Promise.all(a.map(function(){var a=Qh((function*(a){if(r.has(a))throw new Eh("Cyclical @context URLs detected.","jsonld.ContextUrlError",{code:"recursive context inclusion",url:a});const s=new Set(r);let c,u;s.add(a);try{c=yield i(a),u=c.document||null,td(u)&&(u=JSON.parse(u));}catch(e){throw new Eh("Dereferencing a URL did not result in a valid JSON-LD object. Possible causes are an inaccessible URL perhaps due to a same-origin policy (ensure the server uses CORS if you are using client-side JavaScript), too many redirects, a non-JSON response, or more than one HTTP Link Header was provided for a remote context.","jsonld.InvalidUrl",{code:"loading remote context failed",url:a,cause:e})}if(!ed(u))throw new Eh("Dereferencing a URL did not result in a JSON object. The response was valid JSON, but it was not a JSON object.","jsonld.InvalidUrl",{code:"invalid remote context",url:a});u="@context"in u?{"@context":u["@context"]}:{"@context":{}},c.contextUrl&&(Zh(u["@context"])||(u["@context"]=[u["@context"]]),u["@context"].push(c.contextUrl)),yield n(u,s,i),o.set(a,u["@context"]),pd(e,o,!0,t.base);}));return function(e){return a.apply(this,arguments)}}()))}))).apply(this,arguments)}}))).apply(this,arguments)}function pd(e,t,r,n){if(Zh(e))for(const i of e)pd(i,t,r,n);else if(ed(e))for(const i in e){if("@context"!==i){pd(e[i],t,r,n);continue}const o=e[i];if(Zh(o)){let e=o.length;for(let i=0;i<e;++i){const a=o[i];if(td(a)){const s=od(n,a),c=t.get(s);r?Zh(c)?(Array.prototype.splice.apply(o,[i,1].concat(c)),i+=c.length-1,e=o.length):!1!==c&&(o[i]=c):void 0===c&&t.set(s,!1);}else for(const e in a)ed(a[e])&&pd(a[e],t,r,n);}}else if(td(o)){const a=od(n,o),s=t.get(a);r?!1!==s&&(e[i]=s):void 0===s&&t.set(a,!1);}else for(const e in o)ed(o[e])&&pd(o[e],t,r,n);}}ld.cache=new class{constructor(e=100){this.order=[],this.cache=new Map,this.size=e;}get(e,t){const r=this.cache.get(e);if(r){const e=JSON.stringify(t);return r.get(e)||null}return null}set(e,t,r){if(this.order.length===this.size){const e=this.order.shift();this.cache.get(e.activeCtx).delete(e.localCtx);}const n=JSON.stringify(t);this.order.push({activeCtx:e,localCtx:n});let i=this.cache.get(e);i||(i=new Map,this.cache.set(e,i)),i.set(n,Gh(r));}},ld.process=({activeCtx:e,localCtx:t,options:r,isPropertyTermScopedContext:n=!1,isTypeScopedContext:i=!1})=>{ed(t)&&"@context"in t&&Zh(t["@context"])&&(t=t["@context"]);const o=sd(t);if(0===o.length)return e;const a=e.previousContext||e;if(n&&e.previousContext)return (e=e.clone()).isPropertyTermScoped=!0,e.previousContext=ld.process({activeCtx:e.previousContext,localCtx:o,options:r,isPropertyTermScopedContext:n}),e;let s=e;for(let c=0;c<o.length;++c){let u=o[c];if(e=s,null===u){if(!n&&0!==Object.keys(e.protected).length){const n=r&&r.protectedMode||"error";if("error"===n)throw new Eh("Tried to nullify a context with protected terms outside of a term definition.","jsonld.SyntaxError",{code:"invalid context nullification"});if("warn"===n){console.warn("WARNING: invalid context nullification");const t=e;s=e=ld.getInitialContext(r).clone();for(const[r,n]of Object.entries(t.protected))n&&(e.mappings[r]=Rh.clone(t.mappings[r]));e.protected=Rh.clone(t.protected),ld.cache&&ld.cache.set(t,u,s);continue}throw new Eh("Invalid protectedMode.","jsonld.SyntaxError",{code:"invalid protected mode",context:t,protectedMode:n})}s=e=ld.getInitialContext(r).clone(),i&&(s.previousContext=a.clone());continue}if(ld.cache){const t=ld.cache.get(e,u);if(t){s=e=t;continue}}if(ed(u)&&"@context"in u&&(u=u["@context"]),!ed(u))throw new Eh("Invalid JSON-LD syntax; @context must be an object.","jsonld.SyntaxError",{code:"invalid local context",context:u});s=s.clone();const l=new Map;if("@version"in u){if(1.1!==u["@version"])throw new Eh("Unsupported JSON-LD version: "+u["@version"],"jsonld.UnsupportedVersion",{code:"invalid @version value",context:u});if(e.processingMode&&"json-ld-1.0"===e.processingMode)throw new Eh("@version: "+u["@version"]+" not compatible with "+e.processingMode,"jsonld.ProcessingModeConflict",{code:"processing mode conflict",context:u});s.processingMode="json-ld-1.1",s["@version"]=u["@version"],l.set("@version",!0);}if(s.processingMode=s.processingMode||e.processingMode||"json-ld-1.0","@base"in u){let t=u["@base"];if(null===t);else if(nd(t))t=ad(t);else {if(!id(t))throw new Eh('Invalid JSON-LD syntax; the value of "@base" in a @context must be an absolute IRI, a relative IRI, or null.',"jsonld.SyntaxError",{code:"invalid base IRI",context:u});t=ad(od(e["@base"].href,t));}s["@base"]=t,l.set("@base",!0);}if("@vocab"in u){const e=u["@vocab"];if(null===e)delete s["@vocab"];else {if(!td(e))throw new Eh('Invalid JSON-LD syntax; the value of "@vocab" in a @context must be a string or null.',"jsonld.SyntaxError",{code:"invalid vocab mapping",context:u});if(!nd(e))throw new Eh('Invalid JSON-LD syntax; the value of "@vocab" in a @context must be an absolute IRI.',"jsonld.SyntaxError",{code:"invalid vocab mapping",context:u});s["@vocab"]=e;}l.set("@vocab",!0);}if("@language"in u){const e=u["@language"];if(null===e)delete s["@language"];else {if(!td(e))throw new Eh('Invalid JSON-LD syntax; the value of "@language" in a @context must be a string or null.',"jsonld.SyntaxError",{code:"invalid default language",context:u});s["@language"]=e.toLowerCase();}l.set("@language",!0);}l.set("@protected",u["@protected"]||!1);for(const e in u)ld.createTermDefinition(s,u,e,l,r,n);i&&!s.previousContext&&(s.previousContext=a.clone()),ld.cache&&ld.cache.set(e,u,s);}return s},ld.createTermDefinition=(e,t,r,n,i,o=!1)=>{if(n.has(r)){if(n.get(r))return;throw new Eh("Cyclical context definition detected.","jsonld.CyclicalContext",{code:"cyclic IRI mapping",context:t,term:r})}if(n.set(r,!1),ld.isKeyword(r))throw new Eh("Invalid JSON-LD syntax; keywords cannot be overridden.","jsonld.SyntaxError",{code:"keyword redefinition",context:t,term:r});if(""===r)throw new Eh("Invalid JSON-LD syntax; a term cannot be an empty string.","jsonld.SyntaxError",{code:"invalid term definition",context:t});const a=e.mappings.get(r);let s;if(e.mappings.has(r)&&e.mappings.delete(r),t.hasOwnProperty(r)&&(s=t[r]),null===s||ed(s)&&null===s["@id"])return e.mappings.set(r,null),void n.set(r,!0);let c=!1;if(td(s)&&(c=!0,s={"@id":s}),!ed(s))throw new Eh("Invalid JSON-LD syntax; @context term values must be strings or objects.","jsonld.SyntaxError",{code:"invalid term definition",context:t});const u={};e.mappings.set(r,u),u.reverse=!1;const l=["@container","@id","@language","@reverse","@type"];ld.processingMode(e,1.1)&&l.push("@context","@nest","@prefix","@protected");for(const e in s)if(!l.includes(e))throw new Eh("Invalid JSON-LD syntax; a term definition must not contain "+e,"jsonld.SyntaxError",{code:"invalid term definition",context:t});const f=r.indexOf(":");if(u._termHasColon=-1!==f,"@reverse"in s){if("@id"in s)throw new Eh("Invalid JSON-LD syntax; a @reverse term definition must not contain @id.","jsonld.SyntaxError",{code:"invalid reverse property",context:t});if("@nest"in s)throw new Eh("Invalid JSON-LD syntax; a @reverse term definition must not contain @nest.","jsonld.SyntaxError",{code:"invalid reverse property",context:t});const r=s["@reverse"];if(!td(r))throw new Eh("Invalid JSON-LD syntax; a @context @reverse value must be a string.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t});const o=hd(e,r,{vocab:!0,base:!1},t,n,i);if(!nd(o))throw new Eh("Invalid JSON-LD syntax; a @context @reverse value must be an absolute IRI or a blank node identifier.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t});u["@id"]=o,u.reverse=!0;}else if("@id"in s){let o=s["@id"];if(!td(o))throw new Eh("Invalid JSON-LD syntax; a @context @id value must be an array of strings or a string.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t});if(o!==r){if(o=hd(e,o,{vocab:!0,base:!1},t,n,i),!nd(o)&&!ld.isKeyword(o))throw new Eh("Invalid JSON-LD syntax; a @context @id value must be an absolute IRI, a blank node identifier, or a keyword.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t});u["@id"]=o,u._prefix=!u._termHasColon&&o.match(/[:\/\?#\[\]@]$/)&&(c||ld.processingMode(e,1));}}if(!("@id"in u))if(u._termHasColon){const o=r.substr(0,f);if(t.hasOwnProperty(o)&&ld.createTermDefinition(e,t,o,n,i),e.mappings.has(o)){const t=r.substr(f+1);u["@id"]=e.mappings.get(o)["@id"]+t;}else u["@id"]=r;}else {if(!("@vocab"in e))throw new Eh("Invalid JSON-LD syntax; @context terms must define an @id.","jsonld.SyntaxError",{code:"invalid IRI mapping",context:t,term:r});u["@id"]=e["@vocab"]+r;}if((!0===s["@protected"]||!0===n.get("@protected")&&!1!==s["@protected"])&&(e.protected[r]=!0,u.protected=!0),n.set(r,!0),"@type"in s){let r=s["@type"];if(!td(r))throw new Eh("Invalid JSON-LD syntax; an @context @type value must be a string.","jsonld.SyntaxError",{code:"invalid type mapping",context:t});if("@id"!==r&&"@vocab"!==r&&"@json"!==r){if(r=hd(e,r,{vocab:!0,base:!1},t,n,i),!nd(r))throw new Eh("Invalid JSON-LD syntax; an @context @type value must be an absolute IRI.","jsonld.SyntaxError",{code:"invalid type mapping",context:t});if(0===r.indexOf("_:"))throw new Eh("Invalid JSON-LD syntax; an @context @type value must be an IRI, not a blank node identifier.","jsonld.SyntaxError",{code:"invalid type mapping",context:t})}u["@type"]=r;}if("@container"in s){const r=td(s["@container"])?[s["@container"]]:s["@container"]||[],n=["@list","@set","@index","@language"];let i=!0;const o=r.includes("@set");if(ld.processingMode(e,1.1))if(n.push("@graph","@id","@type"),r.includes("@list")){if(1!==r.length)throw new Eh("Invalid JSON-LD syntax; @context @container with @list must have no other values","jsonld.SyntaxError",{code:"invalid container mapping",context:t})}else if(r.includes("@graph")){if(r.some(e=>"@graph"!==e&&"@id"!==e&&"@index"!==e&&"@set"!==e))throw new Eh("Invalid JSON-LD syntax; @context @container with @graph must have no other values other than @id, @index, and @set","jsonld.SyntaxError",{code:"invalid container mapping",context:t})}else i&=r.length<=(o?2:1);else i&=!Zh(s["@container"]),i&=r.length<=1;if(i&=r.every(e=>n.includes(e)),i&=!(o&&r.includes("@list")),!i)throw new Eh("Invalid JSON-LD syntax; @context @container value must be one of the following: "+n.join(", "),"jsonld.SyntaxError",{code:"invalid container mapping",context:t});if(u.reverse&&!r.every(e=>["@index","@set"].includes(e)))throw new Eh("Invalid JSON-LD syntax; @context @container value for a @reverse type definition must be @index or @set.","jsonld.SyntaxError",{code:"invalid reverse property",context:t});u["@container"]=r;}if("@context"in s&&(u["@context"]=s["@context"]),"@language"in s&&!("@type"in s)){let e=s["@language"];if(null!==e&&!td(e))throw new Eh("Invalid JSON-LD syntax; @context @language value must be a string or null.","jsonld.SyntaxError",{code:"invalid language mapping",context:t});null!==e&&(e=e.toLowerCase()),u["@language"]=e;}if("@prefix"in s){if(u._termHasColon)throw new Eh("Invalid JSON-LD syntax; @context @prefix used on a compact IRI term","jsonld.SyntaxError",{code:"invalid term definition",context:t});if("boolean"!=typeof s["@prefix"])throw new Eh("Invalid JSON-LD syntax; @context value for @prefix must be boolean","jsonld.SyntaxError",{code:"invalid @prefix value",context:t});u._prefix=!0===s["@prefix"];}if("@nest"in s){const e=s["@nest"];if(!td(e)||"@nest"!==e&&0===e.indexOf("@"))throw new Eh("Invalid JSON-LD syntax; @context @nest value must be a string which is not a keyword other than @nest.","jsonld.SyntaxError",{code:"invalid @nest value",context:t});u["@nest"]=e;}// disallow aliasing @context and @preserve
  const h=u["@id"];if("@context"===h||"@preserve"===h)throw new Eh("Invalid JSON-LD syntax; @context and @preserve cannot be aliased.","jsonld.SyntaxError",{code:"invalid keyword alias",context:t});if(a&&a.protected&&!o&&(e.protected[r]=!0,u.protected=!0,!function e(t,r){if(!t||"object"!=typeof t||!r||"object"!=typeof r)return t===r;const n=Array.isArray(t);if(n!==Array.isArray(r))return !1;if(n){if(t.length!==r.length)return !1;for(let n=0;n<t.length;++n)if(!e(t[n],r[n]))return !1;return !0}const i=Object.keys(t),o=Object.keys(r);if(i.length!==o.length)return !1;for(const n in t){let i=t[n],o=r[n];if("@container"===n&&Array.isArray(i)&&Array.isArray(o)&&(i=i.slice().sort(),o=o.slice().sort()),!e(i,o))return !1}return !0}(a,u))){const e=i&&i.protectedMode||"error";if("error"===e)throw new Eh("Invalid JSON-LD syntax; tried to redefine a protected term.","jsonld.SyntaxError",{code:"protected term redefinition",context:t,term:r});if("warn"===e)return void console.warn("WARNING: protected term redefinition",{term:r});throw new Eh("Invalid protectedMode.","jsonld.SyntaxError",{code:"invalid protected mode",context:t,term:r,protectedMode:e})}},ld.expandIri=(e,t,r,n)=>hd(e,t,r,void 0,void 0,n),ld.getInitialContext=e=>{const t=ad(e.base||""),r=JSON.stringify({base:t,processingMode:e.processingMode}),n=ud.get(r);if(n)return n;const i={"@base":t,processingMode:e.processingMode,mappings:new Map,inverse:null,getInverse:function(){const e=this;if(e.inverse)return e.inverse;const t=e.inverse={},r=e.fastCurieMap={},n={},i=e["@language"]||"@none",s=e.mappings,c=[...s.keys()].sort(cd);for(const e of c){const o=s.get(e);if(null===o)continue;let c=o["@container"]||"@none";c=[].concat(c).sort().join("");const u=sd(o["@id"]);for(const s of u){let u=t[s];const l=ld.isKeyword(s);if(u)l||o._termHasColon||n[s].push(e);else if(t[s]=u={},!l&&!o._termHasColon){n[s]=[e];const t={iri:s,terms:n[s]};s[0]in r?r[s[0]].push(t):r[s[0]]=[t];}if(u[c]||(u[c]={"@language":{},"@type":{},"@any":{}}),u=u[c],a(e,u["@any"],"@none"),o.reverse)a(e,u["@type"],"@reverse");else if("@type"in o)a(e,u["@type"],o["@type"]);else if("@language"in o){const t=o["@language"]||"@null";a(e,u["@language"],t);}else a(e,u["@language"],i),a(e,u["@type"],"@none"),a(e,u["@language"],"@none");}}for(const e in r)o(r,e,1);return t},clone:function(){const e={};e["@base"]=this["@base"],e.mappings=Rh.clone(this.mappings),e.clone=this.clone,e.inverse=null,e.getInverse=this.getInverse,e.protected=Rh.clone(this.protected),this.previousContext&&(e.isPropertyTermScoped=this.previousContext.isPropertyTermScoped,e.previousContext=this.previousContext.clone());e.revertTypeScopedContext=this.revertTypeScopedContext,"@language"in this&&(e["@language"]=this["@language"]);"@vocab"in this&&(e["@vocab"]=this["@vocab"]);return e},revertTypeScopedContext:function(){if(!this.previousContext)return this;return this.previousContext.clone()},protected:{}};return 1e4===ud.size&&ud.clear(),ud.set(r,i),i;function o(e,t,r){const n=e[t],i=e[t]={};let a,s;for(const e of n)a=e.iri,s=r>=a.length?"":a[r],s in i?i[s].push(e):i[s]=[e];for(const e in i)""!==e&&o(i,e,r+1);}function a(e,t,r){t.hasOwnProperty(r)||(t[r]=e);}},ld.getContextValue=(e,t,r)=>{if(null===t){if("@context"===r)return;return null}if(e.mappings.has(t)){const n=e.mappings.get(t);if(rd(r))return n;if(n.hasOwnProperty(r))return n[r]}return "@language"===r&&e.hasOwnProperty(r)?e[r]:"@context"!==r?null:void 0},ld.getAllContexts=function(){var e=Qh((function*(e,t){return function(e,t){return dd.apply(this,arguments)}(e,t)}));return function(t,r){return e.apply(this,arguments)}}(),ld.processingMode=(e,t)=>t.toString()>="1.1"?e.processingMode&&e.processingMode>="json-ld-"+t.toString():!e.processingMode||"json-ld-1.0"===e.processingMode,ld.isKeyword=e=>{if(!td(e))return !1;switch(e){case"@base":case"@container":case"@context":case"@default":case"@embed":case"@explicit":case"@graph":case"@id":case"@index":case"@json":case"@language":case"@list":case"@nest":case"@none":case"@omitDefault":case"@prefix":case"@preserve":case"@protected":case"@requireAll":case"@reverse":case"@set":case"@type":case"@value":case"@version":case"@vocab":return !0}return !1};const{isArray:md,isObject:vd,isEmptyObject:gd,isString:yd,isUndefined:bd}=wh,{isList:wd,isValue:_d,isGraph:Sd}=Sh,{expandIri:Ed,getContextValue:xd,isKeyword:Id,process:kd,processingMode:Pd}=fd,{isAbsolute:Od}=Wh,{addValue:Td,asArray:Ad,getValues:Cd,validateTypeValue:Rd}=Rh,Nd={};var Ld=Nd;function Md(e,t,r){const n=[],i=Object.keys(t).sort();for(const o of i){const i=Ed(e,o,{vocab:!0},r);let a=t[o];md(a)||(a=[a]);for(const e of a){if(null===e)continue;if(!yd(e))throw new Eh("Invalid JSON-LD syntax; language map values must be strings.","jsonld.SyntaxError",{code:"invalid language map value",languageMap:t});const r={"@value":e};"@none"!==i&&(r["@language"]=o.toLowerCase()),n.push(r);}}return n}function jd({activeCtx:e,options:t,activeProperty:r,value:n,expansionMap:i,asGraph:o,indexKey:a}){const s=[],c=Object.keys(n).sort(),u="@type"===a;for(let l of c){if(u){const r=xd(e,l,"@context");bd(r)||(e=kd({activeCtx:e,localCtx:r,isTypeScopedContext:!0,options:t}));}let c=n[l];md(c)||(c=[c]);const f=Ed(e,l,{vocab:!0},t);"@id"===a?l=Ed(e,l,{base:!0},t):u&&(l=f),c=Nd.expand({activeCtx:e,activeProperty:r,element:c,options:t,insideList:!1,insideIndex:!0,expansionMap:i});for(let e of c)o&&!Sd(e)&&(e={"@graph":[e]}),"@type"===a?"@none"===f||(e["@type"]?e["@type"]=[l].concat(e["@type"]):e["@type"]=[l]):"@none"===f||a in e||(e[a]=l),s.push(e);}return s}Nd.expand=({activeCtx:e,activeProperty:t=null,element:r,options:n={},insideList:i=!1,insideIndex:o=!1,typeScopedContext:a=null,expansionMap:s=(()=>{})})=>{if(null==r)return null;if("@default"===t&&(n=Object.assign({},n,{isFrame:!1})),!md(r)&&!vd(r)){if(!i&&(null===t||"@graph"===Ed(e,t,{vocab:!0},n))){const o=s({unmappedValue:r,activeCtx:e,activeProperty:t,options:n,insideList:i});return void 0===o?null:o}return function({activeCtx:e,activeProperty:t,value:r,options:n}){if(null==r)return null;const i=Ed(e,t,{vocab:!0},n);if("@id"===i)return Ed(e,r,{base:!0},n);if("@type"===i)return Ed(e,r,{vocab:!0,base:!0},n);const o=xd(e,t,"@type");if(("@id"===o||"@graph"===i)&&yd(r))return {"@id":Ed(e,r,{base:!0},n)};if("@vocab"===o&&yd(r))return {"@id":Ed(e,r,{vocab:!0,base:!0},n)};if(Id(i))return r;const a={};if(o&&!["@id","@vocab"].includes(o))a["@type"]=o;else if(yd(r)){const r=xd(e,t,"@language");null!==r&&(a["@language"]=r);}["boolean","number","string"].includes(typeof r)||(r=r.toString());return a["@value"]=r,a}({activeCtx:e,activeProperty:t,value:r,options:n})}if(md(r)){let c=[];const u=xd(e,t,"@container")||[];i=i||u.includes("@list");for(let u=0;u<r.length;++u){let l=Nd.expand({activeCtx:e,activeProperty:t,element:r[u],options:n,expansionMap:s,insideIndex:o,typeScopedContext:a});i&&md(l)&&(l={"@list":l}),null===l&&(l=s({unmappedValue:r[u],activeCtx:e,activeProperty:t,parent:r,index:u,options:n,expandedParent:c,insideList:i}),void 0===l)||(md(l)?c=c.concat(l):c.push(l));}return c}const c=Ed(e,t,{vocab:!0},n);a=a||(e.previousContext?e:null);let u=Object.keys(r).sort(),l=!o;if(l&&a&&u.length<=2&&!u.includes("@context"))for(const t of u){const r=Ed(a,t,{vocab:!0},n);if("@value"===r){l=!1,e=a;break}if("@id"===r&&1===u.length){l=!1;break}}l&&(e=e.revertTypeScopedContext()),"@context"in r&&(e=kd({activeCtx:e,localCtx:r["@context"],options:n}));for(const t of u){if("@type"===Ed(e,t,{vocab:!0},n)){const i=r[t],o=Array.isArray(i)?i.length>1?i.slice().sort():i:[i];for(const t of o){const r=xd(e.previousContext||e,t,"@context");bd(r)||(e=kd({activeCtx:e,localCtx:r,options:n,isTypeScopedContext:!0}));}}}let f={};!function e({activeCtx:t,activeProperty:r,expandedActiveProperty:n,element:i,expandedParent:o,options:a={},insideList:s,expansionMap:c}){const u=Object.keys(i).sort(),l=[];for(const e of u){let u,f=i[e];if("@context"===e)continue;let h=Ed(t,e,{vocab:!0},a);if((null===h||!Od(h)&&!Id(h))&&(h=c({unmappedProperty:e,activeCtx:t,activeProperty:r,parent:i,options:a,insideList:s,value:f,expandedParent:o}),void 0===h))continue;if(Id(h)){if("@reverse"===n)throw new Eh("Invalid JSON-LD syntax; a keyword cannot be used as a @reverse property.","jsonld.SyntaxError",{code:"invalid reverse property map",value:f});if(h in o)throw new Eh("Invalid JSON-LD syntax; colliding keywords detected.","jsonld.SyntaxError",{code:"colliding keywords",keyword:h})}if("@id"===h){if(!yd(f)){if(!a.isFrame)throw new Eh('Invalid JSON-LD syntax; "@id" value must a string.',"jsonld.SyntaxError",{code:"invalid @id value",value:f});if(vd(f)){if(!gd(f))throw new Eh('Invalid JSON-LD syntax; "@id" value an empty object or array of strings, if framing',"jsonld.SyntaxError",{code:"invalid @id value",value:f})}else {if(!md(f))throw new Eh('Invalid JSON-LD syntax; "@id" value an empty object or array of strings, if framing',"jsonld.SyntaxError",{code:"invalid @id value",value:f});if(!f.every(e=>yd(e)))throw new Eh('Invalid JSON-LD syntax; "@id" value an empty object or array of strings, if framing',"jsonld.SyntaxError",{code:"invalid @id value",value:f})}}Td(o,"@id",Ad(f).map(e=>yd(e)?Ed(t,e,{base:!0},a):e),{propertyIsArray:a.isFrame});continue}if("@type"===h){Rd(f),Td(o,"@type",Ad(f).map(e=>yd(e)?Ed(t.previousContext||t,e,{base:!0,vocab:!0},a):e),{propertyIsArray:a.isFrame});continue}if("@graph"===h&&!vd(f)&&!md(f))throw new Eh('Invalid JSON-LD syntax; "@graph" value must not be an object or an array.',"jsonld.SyntaxError",{code:"invalid @graph value",value:f});if("@value"===h){Td(o,"@value",f,{propertyIsArray:a.isFrame});continue}if("@language"===h){if(null===f)continue;if(!yd(f)&&!a.isFrame)throw new Eh('Invalid JSON-LD syntax; "@language" value must be a string.',"jsonld.SyntaxError",{code:"invalid language-tagged string",value:f});f=Ad(f).map(e=>yd(e)?e.toLowerCase():e),Td(o,"@language",f,{propertyIsArray:a.isFrame});continue}if("@index"===h){if(!yd(f))throw new Eh('Invalid JSON-LD syntax; "@index" value must be a string.',"jsonld.SyntaxError",{code:"invalid @index value",value:f});Td(o,"@index",f);continue}if("@reverse"===h){if(!vd(f))throw new Eh('Invalid JSON-LD syntax; "@reverse" value must be an object.',"jsonld.SyntaxError",{code:"invalid @reverse value",value:f});if(u=Nd.expand({activeCtx:t,activeProperty:"@reverse",element:f,options:a,expansionMap:c}),"@reverse"in u)for(const e in u["@reverse"])Td(o,e,u["@reverse"][e],{propertyIsArray:!0});let e=o["@reverse"]||null;for(const t in u){if("@reverse"===t)continue;null===e&&(e=o["@reverse"]={}),Td(e,t,[],{propertyIsArray:!0});const r=u[t];for(let n=0;n<r.length;++n){const i=r[n];if(_d(i)||wd(i))throw new Eh('Invalid JSON-LD syntax; "@reverse" value must not be a @value or an @list.',"jsonld.SyntaxError",{code:"invalid reverse property value",value:u});Td(e,t,i,{propertyIsArray:!0});}}continue}if("@nest"===h){l.push(e);continue}let d=t;const p=xd(t,e,"@context");bd(p)||(d=kd({activeCtx:t,localCtx:p,isPropertyTermScopedContext:!0,options:a}));const m=xd(d,e,"@container")||[];if(m.includes("@language")&&vd(f))u=Md(d,f,a);else if(m.includes("@index")&&vd(f)){const t=m.includes("@graph");u=jd({activeCtx:d,options:a,activeProperty:e,value:f,expansionMap:c,asGraph:t,indexKey:"@index"});}else if(m.includes("@id")&&vd(f)){const t=m.includes("@graph");u=jd({activeCtx:d,options:a,activeProperty:e,value:f,expansionMap:c,asGraph:t,indexKey:"@id"});}else if(m.includes("@type")&&vd(f))u=jd({activeCtx:d.revertTypeScopedContext(),options:a,activeProperty:e,value:f,expansionMap:c,asGraph:!1,indexKey:"@type"});else {const i="@list"===h;if(i||"@set"===h){let e=r;i&&"@graph"===n&&(e=null),u=Nd.expand({activeCtx:d,activeProperty:e,element:f,options:a,insideList:i,expansionMap:c});}else u="@json"===xd(t,e,"@type")?{"@type":"@json","@value":f}:Nd.expand({activeCtx:d,activeProperty:e,element:f,options:a,insideList:!1,expansionMap:c});}if(null===u&&"@value"!==h&&(u=c({unmappedValue:f,expandedProperty:h,activeCtx:d,activeProperty:r,parent:i,options:a,insideList:s,key:e,expandedParent:o}),void 0===u))continue;if("@list"!==h&&!wd(u)&&m.includes("@list")&&(u={"@list":Ad(u)}),m.includes("@graph")&&!m.some(e=>"@id"===e||"@index"===e)&&(u=Ad(u).map(e=>Sd(e)?e:{"@graph":Ad(e)})),d.mappings.has(e)&&d.mappings.get(e).reverse){const e=o["@reverse"]=o["@reverse"]||{};u=Ad(u);for(let t=0;t<u.length;++t){const r=u[t];if(_d(r)||wd(r))throw new Eh('Invalid JSON-LD syntax; "@reverse" value must not be a @value or an @list.',"jsonld.SyntaxError",{code:"invalid reverse property value",value:u});Td(e,h,r,{propertyIsArray:!0});}continue}const v=!["@index","@id","@type","@value","@language"].includes(h);Td(o,h,u,{propertyIsArray:v});}if("@value"in i){const e=i["@value"];if("@json"===i["@type"]&&Pd(t,1.1));else if((vd(e)||md(e))&&!a.isFrame)throw new Eh('Invalid JSON-LD syntax; "@value" value must not be an object or an array.',"jsonld.SyntaxError",{code:"invalid value object value",value:e})}for(const u of l){const l=md(i[u])?i[u]:[i[u]];for(const i of l){if(!vd(i)||Object.keys(i).some(e=>"@value"===Ed(t,e,{vocab:!0},a)))throw new Eh("Invalid JSON-LD syntax; nested value must be a node object.","jsonld.SyntaxError",{code:"invalid @nest value",value:i});e({activeCtx:t,activeProperty:r,expandedActiveProperty:n,element:i,expandedParent:o,options:a,insideList:s,expansionMap:c});}}}({activeCtx:e,activeProperty:t,expandedActiveProperty:c,element:r,expandedParent:f,options:n,insideList:i,typeScopedContext:a,expansionMap:s}),u=Object.keys(f);let h=u.length;if("@value"in f){if("@type"in f&&"@language"in f)throw new Eh('Invalid JSON-LD syntax; an element containing "@value" may not contain both "@type" and "@language".',"jsonld.SyntaxError",{code:"invalid value object",element:f});let o=h-1;if("@type"in f&&(o-=1),"@index"in f&&(o-=1),"@language"in f&&(o-=1),0!==o)throw new Eh('Invalid JSON-LD syntax; an element containing "@value" may only have an "@index" property and at most one other property which can be "@type" or "@language".',"jsonld.SyntaxError",{code:"invalid value object",element:f});const a=null===f["@value"]?[]:Ad(f["@value"]),c=Cd(f,"@type");if(0===a.length){const o=s({unmappedValue:f,activeCtx:e,activeProperty:t,element:r,options:n,insideList:i});f=void 0!==o?o:null;}else {if(!a.every(e=>yd(e)||gd(e))&&"@language"in f)throw new Eh("Invalid JSON-LD syntax; only strings may be language-tagged.","jsonld.SyntaxError",{code:"invalid language-tagged value",element:f});if(Pd(e,1.1)&&c.includes("@json")&&1===c.length);else if(!c.every(e=>Od(e)&&!(yd(e)&&0===e.indexOf("_:"))||gd(e)))throw new Eh('Invalid JSON-LD syntax; an element containing "@value" and "@type" must have an absolute IRI for the value of "@type".',"jsonld.SyntaxError",{code:"invalid typed value",element:f})}}else if("@type"in f&&!md(f["@type"]))f["@type"]=[f["@type"]];else if("@set"in f||"@list"in f){if(h>1&&!(2===h&&"@index"in f))throw new Eh('Invalid JSON-LD syntax; if an element has the property "@set" or "@list", then it can have at most one other property that is "@index".',"jsonld.SyntaxError",{code:"invalid set or list object",element:f});"@set"in f&&(f=f["@set"],u=Object.keys(f),h=u.length);}else if(1===h&&"@language"in f){const o=s(f,{unmappedValue:f,activeCtx:e,activeProperty:t,element:r,options:n,insideList:i});f=void 0!==o?o:null;}if(vd(f)&&!n.keepFreeFloatingNodes&&!i&&(null===t||"@graph"===c)&&(0===h||"@value"in f||"@list"in f||1===h&&"@id"in f)){const o=s({unmappedValue:f,activeCtx:e,activeProperty:t,element:r,options:n,insideList:i});f=void 0!==o?o:null;}return f};const{isKeyword:Dd}=fd,Bd={};var Ud=Bd;Bd.createMergedNodeMap=(e,t)=>{const r=(t=t||{}).issuer||new Rh.IdentifierIssuer("_:b"),n={"@default":{}};return Bd.createNodeMap(e,n,"@default",r),Bd.mergeNodeMaps(n)},Bd.createNodeMap=(e,t,r,n,i,o)=>{if(wh.isArray(e)){for(const i of e)Bd.createNodeMap(i,t,r,n,void 0,o);return}if(!wh.isObject(e))return void(o&&o.push(e));if(Sh.isValue(e)){if("@type"in e){let t=e["@type"];0===t.indexOf("_:")&&(e["@type"]=t=n.getId(t));}return void(o&&o.push(e))}if(o&&Sh.isList(e)){const a=[];return Bd.createNodeMap(e["@list"],t,r,n,i,a),void o.push({"@list":a})}if("@type"in e){const t=e["@type"];for(const e of t)0===e.indexOf("_:")&&n.getId(e);}wh.isUndefined(i)&&(i=Sh.isBlankNode(e)?n.getId(e["@id"]):e["@id"]),o&&o.push({"@id":i});const a=t[r],s=a[i]=a[i]||{};s["@id"]=i;const c=Object.keys(e).sort();for(let o of c){if("@id"===o)continue;if("@reverse"===o){const o={"@id":i},s=e["@reverse"];for(const e in s){const i=s[e];for(const s of i){let i=s["@id"];Sh.isBlankNode(s)&&(i=n.getId(i)),Bd.createNodeMap(s,t,r,n,i),Rh.addValue(a[i],e,o,{propertyIsArray:!0,allowDuplicate:!1});}}continue}if("@graph"===o){i in t||(t[i]={}),Bd.createNodeMap(e[o],t,i,n);continue}if("@type"!==o&&Dd(o)){if("@index"===o&&o in s&&(e[o]!==s[o]||e[o]["@id"]!==s[o]["@id"]))throw new Eh("Invalid JSON-LD syntax; conflicting @index property detected.","jsonld.SyntaxError",{code:"conflicting indexes",subject:s});s[o]=e[o];continue}const c=e[o];if(0===o.indexOf("_:")&&(o=n.getId(o)),0!==c.length)for(let e of c)if("@type"===o&&(e=0===e.indexOf("_:")?n.getId(e):e),Sh.isSubject(e)||Sh.isSubjectReference(e)){const i=Sh.isBlankNode(e)?n.getId(e["@id"]):e["@id"];Rh.addValue(s,o,{"@id":i},{propertyIsArray:!0,allowDuplicate:!1}),Bd.createNodeMap(e,t,r,n,i);}else if(Sh.isValue(e))Rh.addValue(s,o,e,{propertyIsArray:!0,allowDuplicate:!1});else if(Sh.isList(e)){const a=[];Bd.createNodeMap(e["@list"],t,r,n,i,a),e={"@list":a},Rh.addValue(s,o,e,{propertyIsArray:!0,allowDuplicate:!1});}else Bd.createNodeMap(e,t,r,n,i),Rh.addValue(s,o,e,{propertyIsArray:!0,allowDuplicate:!1});else Rh.addValue(s,o,[],{propertyIsArray:!0});}},Bd.mergeNodeMapGraphs=e=>{const t={};for(const r of Object.keys(e).sort())for(const n of Object.keys(e[r]).sort()){const i=e[r][n];n in t||(t[n]={"@id":n});const o=t[n];for(const e of Object.keys(i).sort())if(Dd(e))o[e]=Rh.clone(i[e]);else for(const t of i[e])Rh.addValue(o,e,Rh.clone(t),{propertyIsArray:!0,allowDuplicate:!1});}return t},Bd.mergeNodeMaps=e=>{const t=e["@default"],r=Object.keys(e).sort();for(const n of r){if("@default"===n)continue;const r=e[n];let i=t[n];i?"@graph"in i||(i["@graph"]=[]):t[n]=i={"@id":n,"@graph":[]};const o=i["@graph"];for(const e of Object.keys(r).sort()){const t=r[e];Sh.isSubjectReference(t)||o.push(t);}}return t};const{isSubjectReference:Fd}=Sh,{createMergedNodeMap:Hd}=Ud,zd={};var Vd=zd;function qd(e,t,r,n,i,o,a){try{var s=e[o](a),c=s.value;}catch(e){return void r(e)}s.done?t(c):Promise.resolve(c).then(n,i);}zd.flatten=e=>{const t=Hd(e),r=[],n=Object.keys(t).sort();for(let e=0;e<n.length;++e){const i=t[n[e]];Fd(i)||r.push(i);}return r};const{RDF_LIST:Kd,RDF_FIRST:$d,RDF_REST:Gd,RDF_NIL:Jd,RDF_TYPE:Wd,RDF_JSON_LITERAL:Xd,XSD_BOOLEAN:Yd,XSD_DOUBLE:Qd,XSD_INTEGER:Zd,XSD_STRING:ep}=Uh,tp={};var rp=tp;function np(e,t){if(e.termType.endsWith("Node"))return {"@id":e.value};const r={"@value":e.value};if(e.language)r["@language"]=e.language;else {let n=e.datatype.value;if(n||(n=ep),n===Xd){n="@json";try{r["@value"]=JSON.parse(r["@value"]);}catch(e){throw new Eh("JSON literal could not be parsed.","jsonld.InvalidJsonLiteral",{code:"invalid JSON literal",value:r["@value"],cause:e})}}if(t){if(n===Yd)"true"===r["@value"]?r["@value"]=!0:"false"===r["@value"]&&(r["@value"]=!1);else if(wh.isNumeric(r["@value"]))if(n===Zd){const e=parseInt(r["@value"],10);e.toFixed(0)===r["@value"]&&(r["@value"]=e);}else n===Qd&&(r["@value"]=parseFloat(r["@value"]));[Yd,Zd,Qd,ep].includes(n)||(r["@type"]=n);}else n!==ep&&(r["@type"]=n);}return r}tp.fromRDF=function(){var e,t=(e=function*(e,{useRdfType:t=!1,useNativeTypes:r=!1}){const n={},i={"@default":n},o={};for(const a of e){const e="DefaultGraph"===a.graph.termType?"@default":a.graph.value;e in i||(i[e]={}),"@default"===e||e in n||(n[e]={"@id":e});const s=i[e],c=a.subject.value,u=a.predicate.value,l=a.object;c in s||(s[c]={"@id":c});const f=s[c],h=l.termType.endsWith("Node");if(!h||l.value in s||(s[l.value]={"@id":l.value}),u===Wd&&!t&&h){Rh.addValue(f,"@type",l.value,{propertyIsArray:!0});continue}const d=np(l,r);if(Rh.addValue(f,u,d,{propertyIsArray:!0}),h)if(l.value===Jd){const e=s[l.value];"usages"in e||(e.usages=[]),e.usages.push({node:f,property:u,value:d});}else l.value in o?o[l.value]=!1:o[l.value]={node:f,property:u,value:d};}for(const e in i){const t=i[e];if(!(Jd in t))continue;const r=t[Jd];if(r.usages){for(let e of r.usages){let r=e.node,n=e.property,i=e.value;const a=[],s=[];let c=Object.keys(r).length;for(;n===Gd&&wh.isObject(o[r["@id"]])&&wh.isArray(r[$d])&&1===r[$d].length&&wh.isArray(r[Gd])&&1===r[Gd].length&&(3===c||4===c&&wh.isArray(r["@type"])&&1===r["@type"].length&&r["@type"][0]===Kd)&&(a.push(r[$d][0]),s.push(r["@id"]),e=o[r["@id"]],r=e.node,n=e.property,i=e.value,c=Object.keys(r).length,Sh.isBlankNode(r)););delete i["@id"],i["@list"]=a.reverse();for(const e of s)delete t[e];}delete r.usages;}}const a=[],s=Object.keys(n).sort();for(const e of s){const t=n[e];if(e in i){const r=t["@graph"]=[],n=i[e],o=Object.keys(n).sort();for(const e of o){const t=n[e];Sh.isSubjectReference(t)||r.push(t);}}Sh.isSubjectReference(t)||a.push(t);}return a},function(){var t=this,r=arguments;return new Promise((function(n,i){var o=e.apply(t,r);function a(e){qd(o,n,i,a,s,"next",e);}function s(e){qd(o,n,i,a,s,"throw",e);}a(void 0);}))});return function(e,r){return t.apply(this,arguments)}}();const{createNodeMap:ip}=Ud,{isKeyword:op}=fd,{RDF_FIRST:ap,RDF_REST:sp,RDF_NIL:cp,RDF_TYPE:up,RDF_JSON_LITERAL:lp,RDF_LANGSTRING:fp,XSD_BOOLEAN:hp,XSD_DOUBLE:dp,XSD_INTEGER:pp,XSD_STRING:mp}=Uh,{isAbsolute:vp}=Wh,gp={};var yp=gp;function bp(e,t,r,n,i){const o=Object.keys(t).sort();for(const a of o){const o=t[a],s=Object.keys(o).sort();for(let t of s){const s=o[t];if("@type"===t)t=up;else if(op(t))continue;for(const o of s){const s={termType:a.startsWith("_:")?"BlankNode":"NamedNode",value:a};if(!vp(a))continue;const c={termType:t.startsWith("_:")?"BlankNode":"NamedNode",value:t};if(!vp(t))continue;if("BlankNode"===c.termType&&!i.produceGeneralizedRdf)continue;const u=wp(o,n,e,r);u&&e.push({subject:s,predicate:c,object:u,graph:r});}}}}function wp(e,t,r,n){const i={};if(Sh.isValue(e)){i.termType="Literal",i.value=void 0,i.datatype={termType:"NamedNode"};let t=e["@value"];const r=e["@type"]||null;"@json"===r?(i.value=Bl(t),i.datatype.value=lp):wh.isBoolean(t)?(i.value=t.toString(),i.datatype.value=r||hp):wh.isDouble(t)||r===dp?(wh.isDouble(t)||(t=parseFloat(t)),i.value=t.toExponential(15).replace(/(\d)0*e\+?/,"$1E"),i.datatype.value=r||dp):wh.isNumber(t)?(i.value=t.toFixed(0),i.datatype.value=r||pp):"@language"in e?(i.value=t,i.datatype.value=r||fp,i.language=e["@language"]):(i.value=t,i.datatype.value=r||mp);}else if(Sh.isList(e)){const o=function(e,t,r,n){const i={termType:"NamedNode",value:ap},o={termType:"NamedNode",value:sp},a={termType:"NamedNode",value:cp},s=e.pop(),c=s?{termType:"BlankNode",value:t.getId()}:a;let u=c;for(const a of e){const e=wp(a,t,r,n),s={termType:"BlankNode",value:t.getId()};r.push({subject:u,predicate:i,object:e,graph:n}),r.push({subject:u,predicate:o,object:s,graph:n}),u=s;}if(s){const e=wp(s,t,r,n);r.push({subject:u,predicate:i,object:e,graph:n}),r.push({subject:u,predicate:o,object:a,graph:n});}return c}(e["@list"],t,r,n);i.termType=o.termType,i.value=o.value;}else {const t=wh.isObject(e)?e["@id"]:e;i.termType=t.startsWith("_:")?"BlankNode":"NamedNode",i.value=t;}return "NamedNode"!==i.termType||vp(i.value)?i:null}gp.toRDF=(e,t)=>{const r=new Rh.IdentifierIssuer("_:b"),n={"@default":{}};ip(e,n,"@default",r);const i=[],o=Object.keys(n).sort();for(const e of o){let o;if("@default"===e)o={termType:"DefaultGraph",value:""};else {if(!vp(e))continue;o=e.startsWith("_:")?{termType:"BlankNode"}:{termType:"NamedNode"},o.value=e;}bp(i,n[e],o,r,t);}return i};const{isKeyword:_p}=fd,{createNodeMap:Sp,mergeNodeMapGraphs:Ep}=Ud,xp={};var Ip=xp;function kp(e){const t={};for(const r in e)void 0!==e[r]&&(t["@"+r]=[e[r]]);return [t]}function Pp(e,t,r){for(let n=r.length-1;n>=0;--n){const i=r[n];if(i.graph===t&&i.subject["@id"]===e["@id"])return !0}return !1}function Op(e,t,r){const n="@"+r;let i=n in e?e[n][0]:t[r];return "embed"===r&&(!0===i?i="@last":!1===i?i="@never":"@always"!==i&&"@never"!==i&&"@link"!==i&&(i="@last")),i}function Tp(e){if(!wh.isArray(e)||1!==e.length||!wh.isObject(e[0]))throw new Eh("Invalid JSON-LD syntax; a JSON-LD frame must be a single object.","jsonld.SyntaxError",{frame:e})}function Ap(e,t,r,n){let i=!0,o=!1;for(const a in r){let s=!1;const c=Rh.getValues(t,a),u=0===Rh.getValues(r,a).length;if(_p(a)){if("@id"!==a&&"@type"!==a)continue;if(i=!1,"@id"===a){if(r["@id"].length>=0&&!wh.isEmptyObject(r["@id"][0]))return r["@id"].includes(c[0]);s=!0;continue}if("@type"in r)if(u){if(c.length>0)return !1;s=!0;}else {if(1!==r["@type"].length||!wh.isEmptyObject(r["@type"][0])){for(const e of r["@type"])if(c.some(t=>t===e))return !0;return !1}s=c.length>0;}}const l=Rh.getValues(r,a)[0];let f=!1;if(l&&(Tp([l]),f="@default"in l),i=!1,0!==c.length||!f){if(c.length>0&&u)return !1;if(void 0===l){if(c.length>0)return !1;s=!0;}else if(wh.isObject(l))s=c.length>0;else if(Sh.isValue(l))s=c.some(e=>Lp(l,e));else if(Sh.isSubject(l)||Sh.isSubjectReference(l))s=c.some(t=>Np(e,l,t,n));else if(Sh.isList(l)){const t=l["@list"][0];if(Sh.isList(c[0])){const r=c[0]["@list"];Sh.isValue(t)?s=r.some(e=>Lp(t,e)):(Sh.isSubject(t)||Sh.isSubjectReference(t))&&(s=r.some(r=>Np(e,t,r,n)));}else s=!1;}if(!s&&n.requireAll)return !1;o=o||s;}}return i||o}function Cp(e,t){const r=e.uniqueEmbeds[e.graph],n=r[t],i=n.parent,o=n.property,a={"@id":t};if(wh.isArray(i)){for(let e=0;e<i.length;++e)if(Rh.compareValues(i[e],a)){i[e]=a;break}}else {const e=wh.isArray(i[o]);Rh.removeValue(i,o,a,{propertyIsArray:e}),Rh.addValue(i,o,a,{propertyIsArray:e});}const s=e=>{const t=Object.keys(r);for(const n of t)n in r&&wh.isObject(r[n].parent)&&r[n].parent["@id"]===e&&(delete r[n],s(n));};s(t);}function Rp(e,t,r){wh.isObject(e)?Rh.addValue(e,t,r,{propertyIsArray:!0}):e.push(r);}function Np(e,t,r,n){if(!("@id"in r))return !1;const i=e.subjects[r["@id"]];return i&&Ap(e,i,t,n)}function Lp(e,t){const r=t["@value"],n=t["@type"],i=t["@language"],o=e["@value"]?wh.isArray(e["@value"])?e["@value"]:[e["@value"]]:[],a=e["@type"]?wh.isArray(e["@type"])?e["@type"]:[e["@type"]]:[],s=e["@language"]?wh.isArray(e["@language"])?e["@language"]:[e["@language"]]:[];return 0===o.length&&0===a.length&&0===s.length||!(!o.includes(r)&&!wh.isEmptyObject(o[0]))&&(!!(!n&&0===a.length||a.includes(n)||n&&wh.isEmptyObject(a[0]))&&!!(!i&&0===s.length||s.includes(i)||i&&wh.isEmptyObject(s[0])))}xp.frameMergedOrDefault=(e,t,r)=>{const n={options:r,graph:"@default",graphMap:{"@default":{}},graphStack:[],subjectStack:[],link:{},bnodeMap:{}},i=new Rh.IdentifierIssuer("_:b");Sp(e,n.graphMap,"@default",i),r.merged&&(n.graphMap["@merged"]=Ep(n.graphMap),n.graph="@merged"),n.subjects=n.graphMap[n.graph];const o=[];return xp.frame(n,Object.keys(n.subjects).sort(),t,o),r.pruneBlankNodeIdentifiers&&(r.bnodesToClear=Object.keys(n.bnodeMap).filter(e=>1===n.bnodeMap[e].length)),o},xp.frame=(e,t,r,n,i=null)=>{Tp(r),r=r[0];const o=e.options,a={embed:Op(r,o,"embed"),explicit:Op(r,o,"explicit"),requireAll:Op(r,o,"requireAll")},s=function(e,t,r,n){const i={};for(const o of t){const t=e.graphMap[e.graph][o];Ap(e,t,r,n)&&(i[o]=t);}return i}(e,t,r,a),c=Object.keys(s).sort();for(const t of c){const c=s[t];if("@link"===a.embed&&t in e.link){Rp(n,i,e.link[t]);continue}null===i?e.uniqueEmbeds={[e.graph]:{}}:e.uniqueEmbeds[e.graph]=e.uniqueEmbeds[e.graph]||{};const u={};if(u["@id"]=t,0===t.indexOf("_:")&&Rh.addValue(e.bnodeMap,t,u,{propertyIsArray:!0}),e.link[t]=u,"@never"===a.embed||Pp(c,e.graph,e.subjectStack))Rp(n,i,u);else {if("@last"===a.embed&&(t in e.uniqueEmbeds[e.graph]&&Cp(e,t),e.uniqueEmbeds[e.graph][t]={parent:n,property:i}),e.subjectStack.push({subject:c,graph:e.graph}),t in e.graphMap){let n=!1,i=null;"@graph"in r?(i=r["@graph"][0],wh.isObject(i)||(i={}),n=!("@merged"===t||"@default"===t)):(n="@merged"!==e.graph,i={}),n&&(e.graphStack.push(e.graph),e.graph=t,xp.frame(e,Object.keys(e.graphMap[t]).sort(),[i],u,"@graph"),e.graph=e.graphStack.pop);}for(const t of Object.keys(c).sort())if(_p(t)){if(u[t]=Rh.clone(c[t]),"@type"===t)for(const t of c["@type"])0===t.indexOf("_:")&&Rh.addValue(e.bnodeMap,t,u,{propertyIsArray:!0});}else if(!a.explicit||t in r)for(let n of c[t]){const i=t in r?r[t]:kp(a);if(Sh.isList(n)){const i={"@list":[]};Rp(u,t,i);const o=n["@list"];for(const s in o)if(n=o[s],Sh.isSubjectReference(n)){const o=t in r?r[t][0]["@list"]:kp(a);xp.frame(e,[n["@id"]],o,i,"@list");}else Rp(i,"@list",Rh.clone(n));}else Sh.isSubjectReference(n)?xp.frame(e,[n["@id"]],i,u,t):Lp(i[0],n)&&Rp(u,t,Rh.clone(n));}for(const e of Object.keys(r).sort()){if(_p(e))continue;const t=r[e][0]||{};if(!(Op(t,o,"omitDefault")||e in u)){let r="@null";"@default"in t&&(r=Rh.clone(t["@default"])),wh.isArray(r)||(r=[r]),u[e]=[{"@preserve":r}];}}if("@reverse"in r)for(const n of Object.keys(r["@reverse"]).sort()){const o=r["@reverse"][n];for(const r of Object.keys(e.subjects)){Rh.getValues(e.subjects[r],n).some(e=>e["@id"]===t)&&(u["@reverse"]=u["@reverse"]||{},Rh.addValue(u["@reverse"],n,[],{propertyIsArray:!0}),xp.frame(e,[r],o,u["@reverse"][n],i));}}Rp(n,i,u),e.subjectStack.pop();}}};const{isArray:Mp,isObject:jp,isString:Dp,isUndefined:Bp}=wh,{isList:Up,isValue:Fp,isGraph:Hp,isSimpleGraph:zp,isSubjectReference:Vp}=Sh,{expandIri:qp,getContextValue:Kp,isKeyword:$p,process:Gp}=fd,{removeBase:Jp}=Wh,{addValue:Wp,asArray:Xp,compareShortestLeast:Yp}=Rh,Qp={};var Zp=Qp;function em(e,t,r){if("@nest"!==qp(e,t,{vocab:!0},r))throw new Eh("JSON-LD compact error; nested property must have an @nest value resolving to @nest.","jsonld.SyntaxError",{code:"invalid @nest value"})}function tm(e,t,r,n,i,o,a){try{var s=e[o](a),c=s.value;}catch(e){return void r(e)}s.done?t(c):Promise.resolve(c).then(n,i);}Qp.compact=({activeCtx:e,activeProperty:t=null,element:r,options:n={},compactionMap:i=(()=>{})})=>{if(Mp(r)){let o=[];for(let a=0;a<r.length;++a){let s=Qp.compact({activeCtx:e,activeProperty:t,element:r[a],options:n,compactionMap:i});null===s&&(s=i({unmappedValue:r[a],activeCtx:e,activeProperty:t,parent:r,index:a,options:n}),void 0===s)||o.push(s);}if(n.compactArrays&&1===o.length){0===(Kp(e,t,"@container")||[]).length&&(o=o[0]);}return o}const o=Kp(e,t,"@context");if(Bp(o)||(e=Gp({activeCtx:e,localCtx:o,isPropertyTermScopedContext:!0,options:n})),jp(r)){if(n.link&&"@id"in r&&n.link.hasOwnProperty(r["@id"])){const e=n.link[r["@id"]];for(let t=0;t<e.length;++t)if(e[t].expanded===r)return e[t].compacted}if(Fp(r)||Vp(r)){const i=Qp.compactValue({activeCtx:e,activeProperty:t,value:r,options:n});return n.link&&Vp(r)&&(n.link.hasOwnProperty(r["@id"])||(n.link[r["@id"]]=[]),n.link[r["@id"]].push({expanded:r,compacted:i})),i}if(Up(r)){if((Kp(e,t,"@container")||[]).includes("@list"))return Qp.compact({activeCtx:e,activeProperty:t,element:r["@list"],options:n,compactionMap:i})}const o="@reverse"===t,a={};e=e.revertTypeScopedContext(),n.link&&"@id"in r&&(n.link.hasOwnProperty(r["@id"])||(n.link[r["@id"]]=[]),n.link[r["@id"]].push({expanded:r,compacted:a}));let s=r["@type"]||[];s.length>1&&(s=Array.from(s).sort());const c=e;for(const t of s){const r=Qp.compactIri({activeCtx:c,iri:t,relativeTo:{vocab:!0}}),i=Kp(c,r,"@context");Bp(i)||(e=Gp({activeCtx:e,localCtx:i,options:n,isTypeScopedContext:!0}));}const u=Object.keys(r).sort();for(const s of u){const c=r[s];if("@id"!==s&&"@type"!==s)if("@reverse"!==s)if("@preserve"!==s)if("@index"!==s)if("@graph"!==s&&"@list"!==s&&$p(s)){const t=Qp.compactIri({activeCtx:e,iri:s,relativeTo:{vocab:!0}});Wp(a,t,c);}else {if(!Mp(c))throw new Eh("JSON-LD expansion error; expanded value must be an array.","jsonld.SyntaxError");if(0===c.length){const t=Qp.compactIri({activeCtx:e,iri:s,value:c,relativeTo:{vocab:!0},reverse:o}),r=e.mappings.has(t)?e.mappings.get(t)["@nest"]:null;let i=a;r&&(em(e,r,n),jp(a[r])||(a[r]={}),i=a[r]),Wp(i,t,c,{propertyIsArray:!0});}for(const t of c){const r=Qp.compactIri({activeCtx:e,iri:s,value:t,relativeTo:{vocab:!0},reverse:o}),c=e.mappings.has(r)?e.mappings.get(r)["@nest"]:null;let u=a;c&&(em(e,c,n),jp(a[c])||(a[c]={}),u=a[c]);const l=Kp(e,r,"@container")||[],f=Hp(t),h=Up(t);let d;h?d=t["@list"]:f&&(d=t["@graph"]);let p=Qp.compact({activeCtx:e,activeProperty:r,element:h||f?d:t,options:n,compactionMap:i});if(h){if(Mp(p)||(p=[p]),l.includes("@list")){Wp(u,r,p,{valueIsArray:!0,allowDuplicate:!0});continue}p={[Qp.compactIri({activeCtx:e,iri:"@list",relativeTo:{vocab:!0}})]:p},"@index"in t&&(p[Qp.compactIri({activeCtx:e,iri:"@index",relativeTo:{vocab:!0}})]=t["@index"]);}if(f)if(l.includes("@graph")&&(l.includes("@id")||l.includes("@index")&&zp(t))){let i;u.hasOwnProperty(r)?i=u[r]:u[r]=i={};const o=(l.includes("@id")?t["@id"]:t["@index"])||Qp.compactIri({activeCtx:e,iri:"@none",vocab:!0});Wp(i,o,p,{propertyIsArray:!n.compactArrays||l.includes("@set")});}else l.includes("@graph")&&zp(t)||(Mp(p)&&1===p.length&&n.compactArrays&&(p=p[0]),p={[Qp.compactIri({activeCtx:e,iri:"@graph",relativeTo:{vocab:!0}})]:p},"@id"in t&&(p[Qp.compactIri({activeCtx:e,iri:"@id",relativeTo:{vocab:!0}})]=t["@id"]),"@index"in t&&(p[Qp.compactIri({activeCtx:e,iri:"@index",relativeTo:{vocab:!0}})]=t["@index"])),Wp(u,r,p,{propertyIsArray:!n.compactArrays||l.includes("@set")});else if(l.includes("@language")||l.includes("@index")||l.includes("@id")||l.includes("@type")){let n,i;if(u.hasOwnProperty(r)?n=u[r]:u[r]=n={},l.includes("@language"))Fp(p)&&(p=p["@value"]),i=t["@language"];else if(l.includes("@index"))i=t["@index"];else if(l.includes("@id")){const t=Qp.compactIri({activeCtx:e,iri:"@id",vocab:!0});i=p[t],delete p[t];}else if(l.includes("@type")){const t=Qp.compactIri({activeCtx:e,iri:"@type",vocab:!0});let r;switch([i,...r]=Xp(p[t]||[]),r.length){case 0:delete p[t];break;case 1:p[t]=r[0];break;default:p[t]=r;}}i||(i=Qp.compactIri({activeCtx:e,iri:"@none",vocab:!0})),Wp(n,i,p,{propertyIsArray:l.includes("@set")});}else {const e=!n.compactArrays||l.includes("@set")||l.includes("@list")||Mp(p)&&0===p.length||"@list"===s||"@graph"===s;Wp(u,r,p,{propertyIsArray:e});}}}else {if((Kp(e,t,"@container")||[]).includes("@index"))continue;const r=Qp.compactIri({activeCtx:e,iri:s,relativeTo:{vocab:!0}});Wp(a,r,c);}else {const r=Qp.compact({activeCtx:e,activeProperty:t,element:c,options:n,compactionMap:i});Mp(r)&&0===r.length||Wp(a,s,r);}else {const t=Qp.compact({activeCtx:e,activeProperty:"@reverse",element:c,options:n,compactionMap:i});for(const r in t)if(e.mappings.has(r)&&e.mappings.get(r).reverse){const i=t[r],o=(Kp(e,r,"@container")||[]).includes("@set")||!n.compactArrays;Wp(a,r,i,{propertyIsArray:o}),delete t[r];}if(Object.keys(t).length>0){const r=Qp.compactIri({activeCtx:e,iri:s,relativeTo:{vocab:!0}});Wp(a,r,t);}}else {const t="@type"===s,r=t&&e.previousContext||e;let n=Xp(c).map(e=>Qp.compactIri({activeCtx:r,iri:e,relativeTo:{vocab:t}}));1===n.length&&(n=n[0]);const i=Qp.compactIri({activeCtx:e,iri:s,relativeTo:{vocab:!0}}),o=Mp(n)&&0===c.length;Wp(a,i,n,{propertyIsArray:o});}}return a}return r},Qp.compactIri=({activeCtx:e,iri:t,value:r=null,relativeTo:n={vocab:!1},reverse:i=!1})=>{if(null===t)return t;e.isPropertyTermScoped&&e.previousContext&&(e=e.previousContext);const o=e.getInverse();if($p(t)&&t in o&&"@none"in o[t]&&"@type"in o[t]["@none"]&&"@none"in o[t]["@none"]["@type"])return o[t]["@none"]["@type"]["@none"];if(n.vocab&&t in o){const n=e["@language"]||"@none",o=[];jp(r)&&"@index"in r&&!("@graph"in r)&&o.push("@index","@index@set"),jp(r)&&"@preserve"in r&&(r=r["@preserve"][0]),Hp(r)?("@index"in r&&o.push("@graph@index","@graph@index@set","@index","@index@set"),"@id"in r&&o.push("@graph@id","@graph@id@set"),o.push("@graph","@graph@set","@set"),"@index"in r||o.push("@graph@index","@graph@index@set","@index","@index@set"),"@id"in r||o.push("@graph@id","@graph@id@set")):jp(r)&&!Fp(r)&&o.push("@id","@id@set","@type","@set@type");let a="@language",s="@null";if(i)a="@type",s="@reverse",o.push("@set");else if(Up(r)){"@index"in r||o.push("@list");const e=r["@list"];if(0===e.length)a="@any",s="@none";else {let t=0===e.length?n:null,r=null;for(let n=0;n<e.length;++n){const i=e[n];let o="@none",a="@none";if(Fp(i)?"@language"in i?o=i["@language"]:"@type"in i?a=i["@type"]:o="@null":a="@id",null===t?t=o:o!==t&&Fp(i)&&(t="@none"),null===r?r=a:a!==r&&(r="@none"),"@none"===t&&"@none"===r)break}t=t||"@none",r=r||"@none","@none"!==r?(a="@type",s=r):s=t;}}else Fp(r)?"@language"in r&&!("@index"in r)?(o.push("@language","@language@set"),s=r["@language"]):"@type"in r&&(a="@type",s=r["@type"]):(a="@type",s="@id"),o.push("@set");o.push("@none"),!jp(r)||"@index"in r||o.push("@index","@index@set"),Fp(r)&&1===Object.keys(r).length&&o.push("@language","@language@set");const c=function(e,t,r,n,i,o){null===o&&(o="@null");const a=[];if("@id"!==o&&"@reverse"!==o||!Vp(r))a.push(o);else {"@reverse"===o&&a.push("@reverse");const t=Qp.compactIri({activeCtx:e,iri:r["@id"],relativeTo:{vocab:!0}});e.mappings.has(t)&&e.mappings.get(t)&&e.mappings.get(t)["@id"]===r["@id"]?a.push.apply(a,["@vocab","@id"]):a.push.apply(a,["@id","@vocab"]);}a.push("@none");const s=e.inverse[t];for(let e=0;e<n.length;++e){const t=n[e];if(!(t in s))continue;const r=s[t][i];for(let e=0;e<a.length;++e){const t=a[e];if(t in r)return r[t]}}return null}(e,t,r,o,a,s);if(null!==c)return c}if(n.vocab&&"@vocab"in e){const r=e["@vocab"];if(0===t.indexOf(r)&&t!==r){const n=t.substr(r.length);if(!e.mappings.has(n))return n}}let a=null;const s=[];let c=e.fastCurieMap;const u=t.length-1;for(let e=0;e<u&&t[e]in c;++e)c=c[t[e]],""in c&&s.push(c[""][0]);for(let n=s.length-1;n>=0;--n){const i=s[n],o=i.terms;for(const n of o){const o=n+":"+t.substr(i.iri.length);e.mappings.get(n)._prefix&&(!e.mappings.has(o)||null===r&&e.mappings.get(o)["@id"]===t)&&(null===a||Yp(o,a)<0)&&(a=o);}}return null!==a?a:n.vocab?t:Jp(e["@base"],t)},Qp.compactValue=({activeCtx:e,activeProperty:t,value:r,options:n})=>{if(Fp(r)){const n=Kp(e,t,"@type"),i=Kp(e,t,"@language"),o=Kp(e,t,"@container")||[],a="@index"in r&&!o.includes("@index");if(!a&&(r["@type"]===n||r["@language"]===i))return r["@value"];const s=Object.keys(r).length,c=1===s||2===s&&"@index"in r&&!a,u="@language"in e,l=Dp(r["@value"]),f=e.mappings.has(t)&&null===e.mappings.get(t)["@language"];if(c&&(!u||!l||f))return r["@value"];const h={};return a&&(h[Qp.compactIri({activeCtx:e,iri:"@index",relativeTo:{vocab:!0}})]=r["@index"]),"@type"in r?h[Qp.compactIri({activeCtx:e,iri:"@type",relativeTo:{vocab:!0}})]=Qp.compactIri({activeCtx:e,iri:r["@type"],relativeTo:{vocab:!0}}):"@language"in r&&(h[Qp.compactIri({activeCtx:e,iri:"@language",relativeTo:{vocab:!0}})]=r["@language"]),h[Qp.compactIri({activeCtx:e,iri:"@value",relativeTo:{vocab:!0}})]=r["@value"],h}const i=qp(e,t,{vocab:!0},n),o=Kp(e,t,"@type"),a=Qp.compactIri({activeCtx:e,iri:r["@id"],relativeTo:{vocab:"@vocab"===o}});return "@id"===o||"@vocab"===o||"@graph"===i?a:{[Qp.compactIri({activeCtx:e,iri:"@id",relativeTo:{vocab:!0}})]:a}},
  /**
   * Removes the @preserve keywords as the last step of the compaction
   * algorithm when it is running on framed output.
   *
   * @param ctx the active context used to compact the input.
   * @param input the framed, compacted output.
   * @param options the compaction options used.
   *
   * @return the resulting output.
   */
  Qp.removePreserve=(e,t,r)=>{if(Mp(t)){const n=[];for(let i=0;i<t.length;++i){const o=Qp.removePreserve(e,t[i],r);null!==o&&n.push(o);}t=n;}else if(jp(t)){
  // remove @preserve
  if("@preserve"in t)return "@null"===t["@preserve"]?null:t["@preserve"];if(Fp(t))return t;if(Up(t))return t["@list"]=Qp.removePreserve(e,t["@list"],r),t;const n=Qp.compactIri({activeCtx:e,iri:"@id",relativeTo:{vocab:!0}});if(t.hasOwnProperty(n)){const e=t[n];if(r.link.hasOwnProperty(e)){const n=r.link[e].indexOf(t);if(-1!==n)return r.link[e][n];r.link[e].push(t);}else r.link[e]=[t];}const i=Qp.compactIri({activeCtx:e,iri:"@graph",relativeTo:{vocab:!0}});for(const o in t){if(o===n&&r.bnodesToClear.includes(t[o])){delete t[n];continue}let a=Qp.removePreserve(e,t[o],r);const s=Kp(e,o,"@container")||[];r.compactArrays&&Mp(a)&&1===a.length&&0===s.length&&o!==i&&(a=a[0]),t[o]=a;}}return t};const{callbackify:rm,normalizeDocumentLoader:nm}=Rh;var im=class{constructor(){this._requests={},this.add=rm(this.add.bind(this));}wrapLoader(e){const t=this;return t._loader=nm(e),function(){return t.add.apply(t,arguments)}}add(e){var t,r=this;return (t=function*(){const t=r;let n=t._requests[e];if(n)return Promise.resolve(n);n=t._requests[e]=t._loader(e);try{return yield n}finally{delete t._requests[e];}},function(){var e=this,r=arguments;return new Promise((function(n,i){var o=t.apply(e,r);function a(e){tm(o,n,i,a,s,"next",e);}function s(e){tm(o,n,i,a,s,"throw",e);}a(void 0);}))})()}};function om(e,t,r,n,i,o,a){try{var s=e[o](a),c=s.value;}catch(e){return void r(e)}s.done?t(c):Promise.resolve(c).then(n,i);}function am(e){return function(){var t=this,r=arguments;return new Promise((function(n,i){var o=e.apply(t,r);function a(e){om(o,n,i,a,s,"next",e);}function s(e){om(o,n,i,a,s,"throw",e);}a(void 0);}))}}const{parseLinkHeader:sm,buildHeaders:cm}=Rh,{LINK_HEADER_REL:um}=Uh;var lm=({secure:e,strictSSL:t=!0,maxRedirects:r=-1,request:n,headers:i={}}={strictSSL:!0,maxRedirects:-1,headers:{}})=>{i=cm(i),n=n||tu;const o=tu;return (new im).wrapLoader((function(e){return a(e,[])}));function a(e,t){return s.apply(this,arguments)}function s(){return (s=am((function*(s,c){if(0!==s.indexOf("http:")&&0!==s.indexOf("https:"))throw new Eh('URL could not be dereferenced; only "http" and "https" URLs are supported.',"jsonld.InvalidUrl",{code:"loading document failed",url:s});if(e&&0!==s.indexOf("https"))throw new Eh('URL could not be dereferenced; secure mode is enabled and the URL\'s scheme is not "https".',"jsonld.InvalidUrl",{code:"loading document failed",url:s});let u,l=null;if(null!==l)return l;try{u=yield fm(n,{url:s,headers:i,strictSSL:t,followRedirect:!1});}catch(e){throw new Eh("URL could not be dereferenced, an error occurred.","jsonld.LoadDocumentError",{code:"loading document failed",url:s,cause:e})}const{res:f,body:h}=u;l={contextUrl:null,documentUrl:s,document:h||null};const d=o.STATUS_CODES[f.statusCode];if(f.statusCode>=400)throw new Eh("URL could not be dereferenced: "+d,"jsonld.InvalidUrl",{code:"loading document failed",url:s,httpStatusCode:f.statusCode});if(f.headers.link&&"application/ld+json"!==f.headers["content-type"]){const e=sm(f.headers.link)[um];if(Array.isArray(e))throw new Eh("URL could not be dereferenced, it has more than one associated HTTP Link Header.","jsonld.InvalidUrl",{code:"multiple context link headers",url:s});e&&(l.contextUrl=e.target);}if(f.statusCode>=300&&f.statusCode<400&&f.headers.location){if(c.length===r)throw new Eh("URL could not be dereferenced; there were too many redirects.","jsonld.TooManyRedirects",{code:"loading document failed",url:s,httpStatusCode:f.statusCode,redirects:c});if(-1!==c.indexOf(s))throw new Eh("URL could not be dereferenced; infinite redirection was detected.","jsonld.InfiniteRedirectDetected",{code:"recursive context inclusion",url:s,httpStatusCode:f.statusCode,redirects:c});return c.push(s),a(f.headers.location,c)}return c.push(s),l}))).apply(this,arguments)}};function fm(e,t){return new Promise((r,n)=>{e(t,(e,t,i)=>{e?n(e):r({res:t,body:i});});})}function hm(e,t,r,n,i,o,a){try{var s=e[o](a),c=s.value;}catch(e){return void r(e)}s.done?t(c):Promise.resolve(c).then(n,i);}function dm(e){return function(){var t=this,r=arguments;return new Promise((function(n,i){var o=e.apply(t,r);function a(e){hm(o,n,i,a,s,"next",e);}function s(e){hm(o,n,i,a,s,"throw",e);}a(void 0);}))}}const{parseLinkHeader:pm,buildHeaders:mm}=Rh,{LINK_HEADER_REL:vm}=Uh,gm=/(^|(\r\n))link:/i;var ym=({secure:e,headers:t={},xhr:r}={headers:{}})=>{return t=mm(t),(new im).wrapLoader((function(e){return n.apply(this,arguments)}));function n(){return (n=dm((function*(n){if(0!==n.indexOf("http:")&&0!==n.indexOf("https:"))throw new Eh('URL could not be dereferenced; only "http" and "https" URLs are supported.',"jsonld.InvalidUrl",{code:"loading document failed",url:n});if(e&&0!==n.indexOf("https"))throw new Eh('URL could not be dereferenced; secure mode is enabled and the URL\'s scheme is not "https".',"jsonld.InvalidUrl",{code:"loading document failed",url:n});let i;try{i=yield bm(r,n,t);}catch(e){throw new Eh("URL could not be dereferenced, an error occurred.","jsonld.LoadDocumentError",{code:"loading document failed",url:n,cause:e})}if(i.status>=400)throw new Eh("URL could not be dereferenced: "+i.statusText,"jsonld.LoadDocumentError",{code:"loading document failed",url:n,httpStatusCode:i.status});const o={contextUrl:null,documentUrl:n,document:i.response},a=i.getResponseHeader("Content-Type");let s;if(gm.test(i.getAllResponseHeaders())&&(s=i.getResponseHeader("Link")),s&&"application/ld+json"!==a){if(s=pm(s)[vm],Array.isArray(s))throw new Eh("URL could not be dereferenced, it has more than one associated HTTP Link Header.","jsonld.InvalidUrl",{code:"multiple context link headers",url:n});s&&(o.contextUrl=s.target);}return o}))).apply(this,arguments)}};function bm(e,t,r){const n=new(e=e||XMLHttpRequest);return new Promise((e,i)=>{n.onload=()=>e(n),n.onerror=e=>i(e),n.open("GET",t,!0);for(const e in r)n.setRequestHeader(e,r[e]);n.send();})}function wm(e,t){if(null==e)return {};var r,n,i=function(e,t){if(null==e)return {};var r,n,i={},o=Object.keys(e);for(n=0;n<o.length;n++)r=o[n],t.indexOf(r)>=0||(i[r]=e[r]);return i}(e,t);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);for(n=0;n<o.length;n++)r=o[n],t.indexOf(r)>=0||Object.prototype.propertyIsEnumerable.call(e,r)&&(i[r]=e[r]);}return i}function _m(e,t,r,n,i,o,a){try{var s=e[o](a),c=s.value;}catch(e){return void r(e)}s.done?t(c):Promise.resolve(c).then(n,i);}function Sm(e){return function(){var t=this,r=arguments;return new Promise((function(n,i){var o=e.apply(t,r);function a(e){_m(o,n,i,a,s,"next",e);}function s(e){_m(o,n,i,a,s,"throw",e);}a(void 0);}))}}
  /**
   * A JavaScript implementation of the JSON-LD API.
   *
   * @author Dave Longley
   *
   * @license BSD 3-Clause License
   * Copyright (c) 2011-2017 Digital Bazaar, Inc.
   * All rights reserved.
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * Redistributions of source code must retain the above copyright notice,
   * this list of conditions and the following disclaimer.
   *
   * Redistributions in binary form must reproduce the above copyright
   * notice, this list of conditions and the following disclaimer in the
   * documentation and/or other materials provided with the distribution.
   *
   * Neither the name of the Digital Bazaar, Inc. nor the names of its
   * contributors may be used to endorse or promote products derived from
   * this software without specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
   * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
   * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
   * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
   * HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
   * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
   * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   */const Em=Rh.IdentifierIssuer,{expand:xm}=Ld,{flatten:Im}=Vd,{fromRDF:km}=rp,{toRDF:Pm}=yp,{frameMergedOrDefault:Om}=Ip,{isArray:Tm,isObject:Am,isString:Cm}=wh,{isSubjectReference:Rm}=Sh,{getInitialContext:Nm,process:Lm,getAllContexts:Mm}=fd,{compact:jm,compactIri:Dm,removePreserve:Bm}=Zp,{createNodeMap:Um,createMergedNodeMap:Fm,mergeNodeMaps:Hm}=Ud,zm=void 0!==ft&&ft.versions&&ft.versions.node,Vm=!zm&&("undefined"!=typeof window||"undefined"!=typeof self),qm=function(e){const t={};function r(t,r){let{documentLoader:n=e.documentLoader}=r,i=wm(r,["documentLoader"]);return Object.assign({},{documentLoader:n},i,t)}return e.compact=Rh.callbackify(function(){var t=Sm((function*(t,n,i){if(arguments.length<2)throw new TypeError("Could not compact, too few arguments.");if(null===n)throw new Eh("The compaction context must not be null.","jsonld.CompactError",{code:"invalid local context"});if(null===t)return null;let o;(i=r(i,{base:Cm(t)?t:"",compactArrays:!0,compactToRelative:!0,graph:!1,skipExpansion:!1,link:!1,issuer:new Em("_:b")})).link&&(i.skipExpansion=!0),i.compactToRelative||delete i.base,o=i.skipExpansion?t:yield e.expand(t,i);const a=yield e.processContext(Nm(i),n,i);let s=jm({activeCtx:a,element:o,options:i,compactionMap:i.compactionMap});i.compactArrays&&!i.graph&&Tm(s)?1===s.length?s=s[0]:0===s.length&&(s={}):i.graph&&Am(s)&&(s=[s]),Am(n)&&"@context"in n&&(n=n["@context"]),n=Rh.clone(n),Tm(n)||(n=[n]);const c=n;n=[];for(let e=0;e<c.length;++e)(!Am(c[e])||Object.keys(c[e]).length>0)&&n.push(c[e]);const u=n.length>0;if(1===n.length&&(n=n[0]),Tm(s)){const e=Dm({activeCtx:a,iri:"@graph",relativeTo:{vocab:!0}}),t=s;s={},u&&(s["@context"]=n),s[e]=t;}else if(Am(s)&&u){const e=s;s={"@context":n};for(const t in e)s[t]=e[t];}if(i.framing){const e=Dm({activeCtx:a,iri:"@graph",relativeTo:{vocab:!0}});// remove @preserve from results

  const DEFAULT = 'standby';
  // TODO: refactor to use VERIFICATION_STATUSES.STARTING
  const STARTED = 'started';

  const VERIFICATION_STATUS = {
    ...g,
    DEFAULT,
    STARTED
  };

  function initializeVerificationSteps (definition) {
    const steps = JSON.parse(JSON.stringify(definition.verificationSteps));
    return steps.map((step, i) => ({
      ...step,
      isLast: i === steps.length - 1,
      status: VERIFICATION_STATUS.DEFAULT
    }));
  }

  function isValidUrl (url) {
    // https://stackoverflow.com/a/15734347/4064775
    const regex = /^(ftp|http|https):\/\/[^ "]+$/;
    return regex.test(url);
  }

  function isValidLocalPath (path) {
    const regex = /^(\.\/|\.\.\/|[A-Z]:\/\/|\/)[^ "]+$/;
    return regex.test(path);
  }

  function handleError (error) {
    const errorMessage = 'errors.invalidBlockcertsUrl';
    console.error(error);
    return {
      certificateDefinition: null,
      errorMessage
    };
  }

  function retrieve (url) {
    if (!(isValidUrl(url) || isValidLocalPath(url))) {
      console.error('Invalid url to retrieve:', url);
      return null;
    }

    const urlWithParam = url + downloadFlag;

    return fetch(urlWithParam)
      .then(res => res.text())
      .then(text => {
        try {
          return {
            certificateDefinition: JSON.parse(text)
          };
        } catch (err) {
          return handleError(err);
        }
      })
      .catch(handleError);
  }

  function readFile (file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (e) {
        resolve(e.target.result);
      };
      reader.onerror = reader.onabort = reject;
      reader.readAsText(file);
    });
  }

  async function read (file) {
    if (!file) {
      return;
    }

    const result = await readFile(file);

    return result;
  }

  function parse (definition, options = {}) {
    if (!options.locale) {
      options.locale = 'auto';
    }

    try {
      /* eslint no-new: off */
      const certificateDefinition = new ex(definition, options);

      return {
        certificateDefinition
      };
    } catch (e) {
      // console.error(e);
      return {
        certificateDefinition: null,
        errorMessage: 'errors.invalidBlockcerts'
      };
    }
  }

  var certificates = /*#__PURE__*/Object.freeze({
    __proto__: null,
    download: download,
    initializeVerificationSteps: initializeVerificationSteps,
    retrieve: retrieve,
    read: read,
    parse: parse
  });

  function dispatch (eventType = '', certificateDefinition = null, details) {
    if (!eventType || typeof eventType !== 'string') {
      return;
    }

    if (!certificateDefinition || typeof certificateDefinition !== 'object') {
      return;
    }

    const event = new CustomEvent(eventType, {
      detail: {
        certificateDefinition,
        ...details
      }
    });

    window.dispatchEvent(event);
  }

  var events = /*#__PURE__*/Object.freeze({
    __proto__: null,
    dispatch: dispatch
  });

  var domain = compose$1({
    certificates,
    events
  });

  function updateCertificateDefinition (state, action) {
    return {
      ...state,
      ...action.payload,
      ...action.payload.certificateDefinition && {
        verifiedSteps: domain.certificates.initializeVerificationSteps(action.payload.certificateDefinition)
      }
    };
  }

  /**
   * @warning
   *
   * THIS IS AN AUTO GENERATED FILE. IF YOU WISH TO WHITELIST PROPERTIES / TAGS, PLEASE DO IT SO IN sanitizer/index.js 
   *
   * More Information: https://github.com/blockchain-certificates/blockcerts-verifier#modifying-the-sanitizer
   **/

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  /**
   * cssfilter
   *
   * @author 老雷<leizongmin@gmail.com>
   */

  function getDefaultWhiteList () {
    // 白名单值说明：
    // true: 允许该属性
    // Function: function (val) { } 返回true表示允许该属性，其他值均表示不允许
    // RegExp: regexp.test(val) 返回true表示允许该属性，其他值均表示不允许
    // 除上面列出的值外均表示不允许
    var whiteList = {};

    whiteList['align-content'] = false; // default: auto
    whiteList['align-items'] = false; // default: auto
    whiteList['align-self'] = false; // default: auto
    whiteList['alignment-adjust'] = false; // default: auto
    whiteList['alignment-baseline'] = false; // default: baseline
    whiteList['all'] = false; // default: depending on individual properties
    whiteList['anchor-point'] = false; // default: none
    whiteList['animation'] = false; // default: depending on individual properties
    whiteList['animation-delay'] = false; // default: 0
    whiteList['animation-direction'] = false; // default: normal
    whiteList['animation-duration'] = false; // default: 0
    whiteList['animation-fill-mode'] = false; // default: none
    whiteList['animation-iteration-count'] = false; // default: 1
    whiteList['animation-name'] = false; // default: none
    whiteList['animation-play-state'] = false; // default: running
    whiteList['animation-timing-function'] = false; // default: ease
    whiteList['azimuth'] = false; // default: center
    whiteList['backface-visibility'] = false; // default: visible
    whiteList['background'] = true; // default: depending on individual properties
    whiteList['background-attachment'] = true; // default: scroll
    whiteList['background-clip'] = true; // default: border-box
    whiteList['background-color'] = true; // default: transparent
    whiteList['background-image'] = true; // default: none
    whiteList['background-origin'] = true; // default: padding-box
    whiteList['background-position'] = true; // default: 0% 0%
    whiteList['background-repeat'] = true; // default: repeat
    whiteList['background-size'] = true; // default: auto
    whiteList['baseline-shift'] = false; // default: baseline
    whiteList['binding'] = false; // default: none
    whiteList['bleed'] = false; // default: 6pt
    whiteList['bookmark-label'] = false; // default: content()
    whiteList['bookmark-level'] = false; // default: none
    whiteList['bookmark-state'] = false; // default: open
    whiteList['border'] = true; // default: depending on individual properties
    whiteList['border-bottom'] = true; // default: depending on individual properties
    whiteList['border-bottom-color'] = true; // default: current color
    whiteList['border-bottom-left-radius'] = true; // default: 0
    whiteList['border-bottom-right-radius'] = true; // default: 0
    whiteList['border-bottom-style'] = true; // default: none
    whiteList['border-bottom-width'] = true; // default: medium
    whiteList['border-collapse'] = true; // default: separate
    whiteList['border-color'] = true; // default: depending on individual properties
    whiteList['border-image'] = true; // default: none
    whiteList['border-image-outset'] = true; // default: 0
    whiteList['border-image-repeat'] = true; // default: stretch
    whiteList['border-image-slice'] = true; // default: 100%
    whiteList['border-image-source'] = true; // default: none
    whiteList['border-image-width'] = true; // default: 1
    whiteList['border-left'] = true; // default: depending on individual properties
    whiteList['border-left-color'] = true; // default: current color
    whiteList['border-left-style'] = true; // default: none
    whiteList['border-left-width'] = true; // default: medium
    whiteList['border-radius'] = true; // default: 0
    whiteList['border-right'] = true; // default: depending on individual properties
    whiteList['border-right-color'] = true; // default: current color
    whiteList['border-right-style'] = true; // default: none
    whiteList['border-right-width'] = true; // default: medium
    whiteList['border-spacing'] = true; // default: 0
    whiteList['border-style'] = true; // default: depending on individual properties
    whiteList['border-top'] = true; // default: depending on individual properties
    whiteList['border-top-color'] = true; // default: current color
    whiteList['border-top-left-radius'] = true; // default: 0
    whiteList['border-top-right-radius'] = true; // default: 0
    whiteList['border-top-style'] = true; // default: none
    whiteList['border-top-width'] = true; // default: medium
    whiteList['border-width'] = true; // default: depending on individual properties
    whiteList['bottom'] = false; // default: auto
    whiteList['box-decoration-break'] = true; // default: slice
    whiteList['box-shadow'] = true; // default: none
    whiteList['box-sizing'] = true; // default: content-box
    whiteList['box-snap'] = true; // default: none
    whiteList['box-suppress'] = true; // default: show
    whiteList['break-after'] = true; // default: auto
    whiteList['break-before'] = true; // default: auto
    whiteList['break-inside'] = true; // default: auto
    whiteList['caption-side'] = false; // default: top
    whiteList['chains'] = false; // default: none
    whiteList['clear'] = true; // default: none
    whiteList['clip'] = false; // default: auto
    whiteList['clip-path'] = false; // default: none
    whiteList['clip-rule'] = false; // default: nonzero
    whiteList['color'] = true; // default: implementation dependent
    whiteList['color-interpolation-filters'] = true; // default: auto
    whiteList['column-count'] = false; // default: auto
    whiteList['column-fill'] = false; // default: balance
    whiteList['column-gap'] = false; // default: normal
    whiteList['column-rule'] = false; // default: depending on individual properties
    whiteList['column-rule-color'] = false; // default: current color
    whiteList['column-rule-style'] = false; // default: medium
    whiteList['column-rule-width'] = false; // default: medium
    whiteList['column-span'] = false; // default: none
    whiteList['column-width'] = false; // default: auto
    whiteList['columns'] = false; // default: depending on individual properties
    whiteList['contain'] = false; // default: none
    whiteList['content'] = false; // default: normal
    whiteList['counter-increment'] = false; // default: none
    whiteList['counter-reset'] = false; // default: none
    whiteList['counter-set'] = false; // default: none
    whiteList['crop'] = false; // default: auto
    whiteList['cue'] = false; // default: depending on individual properties
    whiteList['cue-after'] = false; // default: none
    whiteList['cue-before'] = false; // default: none
    whiteList['cursor'] = false; // default: auto
    whiteList['direction'] = false; // default: ltr
    whiteList['display'] = true; // default: depending on individual properties
    whiteList['display-inside'] = true; // default: auto
    whiteList['display-list'] = true; // default: none
    whiteList['display-outside'] = true; // default: inline-level
    whiteList['dominant-baseline'] = false; // default: auto
    whiteList['elevation'] = false; // default: level
    whiteList['empty-cells'] = false; // default: show
    whiteList['filter'] = false; // default: none
    whiteList['flex'] = false; // default: depending on individual properties
    whiteList['flex-basis'] = false; // default: auto
    whiteList['flex-direction'] = false; // default: row
    whiteList['flex-flow'] = false; // default: depending on individual properties
    whiteList['flex-grow'] = false; // default: 0
    whiteList['flex-shrink'] = false; // default: 1
    whiteList['flex-wrap'] = false; // default: nowrap
    whiteList['float'] = false; // default: none
    whiteList['float-offset'] = false; // default: 0 0
    whiteList['flood-color'] = false; // default: black
    whiteList['flood-opacity'] = false; // default: 1
    whiteList['flow-from'] = false; // default: none
    whiteList['flow-into'] = false; // default: none
    whiteList['font'] = true; // default: depending on individual properties
    whiteList['font-family'] = true; // default: implementation dependent
    whiteList['font-feature-settings'] = true; // default: normal
    whiteList['font-kerning'] = true; // default: auto
    whiteList['font-language-override'] = true; // default: normal
    whiteList['font-size'] = true; // default: medium
    whiteList['font-size-adjust'] = true; // default: none
    whiteList['font-stretch'] = true; // default: normal
    whiteList['font-style'] = true; // default: normal
    whiteList['font-synthesis'] = true; // default: weight style
    whiteList['font-variant'] = true; // default: normal
    whiteList['font-variant-alternates'] = true; // default: normal
    whiteList['font-variant-caps'] = true; // default: normal
    whiteList['font-variant-east-asian'] = true; // default: normal
    whiteList['font-variant-ligatures'] = true; // default: normal
    whiteList['font-variant-numeric'] = true; // default: normal
    whiteList['font-variant-position'] = true; // default: normal
    whiteList['font-weight'] = true; // default: normal
    whiteList['grid'] = false; // default: depending on individual properties
    whiteList['grid-area'] = false; // default: depending on individual properties
    whiteList['grid-auto-columns'] = false; // default: auto
    whiteList['grid-auto-flow'] = false; // default: none
    whiteList['grid-auto-rows'] = false; // default: auto
    whiteList['grid-column'] = false; // default: depending on individual properties
    whiteList['grid-column-end'] = false; // default: auto
    whiteList['grid-column-start'] = false; // default: auto
    whiteList['grid-row'] = false; // default: depending on individual properties
    whiteList['grid-row-end'] = false; // default: auto
    whiteList['grid-row-start'] = false; // default: auto
    whiteList['grid-template'] = false; // default: depending on individual properties
    whiteList['grid-template-areas'] = false; // default: none
    whiteList['grid-template-columns'] = false; // default: none
    whiteList['grid-template-rows'] = false; // default: none
    whiteList['hanging-punctuation'] = false; // default: none
    whiteList['height'] = true; // default: auto
    whiteList['hyphens'] = false; // default: manual
    whiteList['icon'] = false; // default: auto
    whiteList['image-orientation'] = false; // default: auto
    whiteList['image-resolution'] = false; // default: normal
    whiteList['ime-mode'] = false; // default: auto
    whiteList['initial-letters'] = false; // default: normal
    whiteList['inline-box-align'] = false; // default: last
    whiteList['justify-content'] = false; // default: auto
    whiteList['justify-items'] = false; // default: auto
    whiteList['justify-self'] = false; // default: auto
    whiteList['left'] = false; // default: auto
    whiteList['letter-spacing'] = true; // default: normal
    whiteList['lighting-color'] = true; // default: white
    whiteList['line-box-contain'] = false; // default: block inline replaced
    whiteList['line-break'] = false; // default: auto
    whiteList['line-grid'] = false; // default: match-parent
    whiteList['line-height'] = false; // default: normal
    whiteList['line-snap'] = false; // default: none
    whiteList['line-stacking'] = false; // default: depending on individual properties
    whiteList['line-stacking-ruby'] = false; // default: exclude-ruby
    whiteList['line-stacking-shift'] = false; // default: consider-shifts
    whiteList['line-stacking-strategy'] = false; // default: inline-line-height
    whiteList['list-style'] = true; // default: depending on individual properties
    whiteList['list-style-image'] = true; // default: none
    whiteList['list-style-position'] = true; // default: outside
    whiteList['list-style-type'] = true; // default: disc
    whiteList['margin'] = true; // default: depending on individual properties
    whiteList['margin-bottom'] = true; // default: 0
    whiteList['margin-left'] = true; // default: 0
    whiteList['margin-right'] = true; // default: 0
    whiteList['margin-top'] = true; // default: 0
    whiteList['marker-offset'] = false; // default: auto
    whiteList['marker-side'] = false; // default: list-item
    whiteList['marks'] = false; // default: none
    whiteList['mask'] = false; // default: border-box
    whiteList['mask-box'] = false; // default: see individual properties
    whiteList['mask-box-outset'] = false; // default: 0
    whiteList['mask-box-repeat'] = false; // default: stretch
    whiteList['mask-box-slice'] = false; // default: 0 fill
    whiteList['mask-box-source'] = false; // default: none
    whiteList['mask-box-width'] = false; // default: auto
    whiteList['mask-clip'] = false; // default: border-box
    whiteList['mask-image'] = false; // default: none
    whiteList['mask-origin'] = false; // default: border-box
    whiteList['mask-position'] = false; // default: center
    whiteList['mask-repeat'] = false; // default: no-repeat
    whiteList['mask-size'] = false; // default: border-box
    whiteList['mask-source-type'] = false; // default: auto
    whiteList['mask-type'] = false; // default: luminance
    whiteList['max-height'] = true; // default: none
    whiteList['max-lines'] = false; // default: none
    whiteList['max-width'] = true; // default: none
    whiteList['min-height'] = true; // default: 0
    whiteList['min-width'] = true; // default: 0
    whiteList['move-to'] = false; // default: normal
    whiteList['nav-down'] = false; // default: auto
    whiteList['nav-index'] = false; // default: auto
    whiteList['nav-left'] = false; // default: auto
    whiteList['nav-right'] = false; // default: auto
    whiteList['nav-up'] = false; // default: auto
    whiteList['object-fit'] = false; // default: fill
    whiteList['object-position'] = false; // default: 50% 50%
    whiteList['opacity'] = false; // default: 1
    whiteList['order'] = false; // default: 0
    whiteList['orphans'] = false; // default: 2
    whiteList['outline'] = false; // default: depending on individual properties
    whiteList['outline-color'] = false; // default: invert
    whiteList['outline-offset'] = false; // default: 0
    whiteList['outline-style'] = false; // default: none
    whiteList['outline-width'] = false; // default: medium
    whiteList['overflow'] = false; // default: depending on individual properties
    whiteList['overflow-wrap'] = false; // default: normal
    whiteList['overflow-x'] = false; // default: visible
    whiteList['overflow-y'] = false; // default: visible
    whiteList['padding'] = true; // default: depending on individual properties
    whiteList['padding-bottom'] = true; // default: 0
    whiteList['padding-left'] = true; // default: 0
    whiteList['padding-right'] = true; // default: 0
    whiteList['padding-top'] = true; // default: 0
    whiteList['page'] = false; // default: auto
    whiteList['page-break-after'] = false; // default: auto
    whiteList['page-break-before'] = false; // default: auto
    whiteList['page-break-inside'] = false; // default: auto
    whiteList['page-policy'] = false; // default: start
    whiteList['pause'] = false; // default: implementation dependent
    whiteList['pause-after'] = false; // default: implementation dependent
    whiteList['pause-before'] = false; // default: implementation dependent
    whiteList['perspective'] = false; // default: none
    whiteList['perspective-origin'] = false; // default: 50% 50%
    whiteList['pitch'] = false; // default: medium
    whiteList['pitch-range'] = false; // default: 50
    whiteList['play-during'] = false; // default: auto
    whiteList['position'] = false; // default: static
    whiteList['presentation-level'] = false; // default: 0
    whiteList['quotes'] = false; // default: text
    whiteList['region-fragment'] = false; // default: auto
    whiteList['resize'] = false; // default: none
    whiteList['rest'] = false; // default: depending on individual properties
    whiteList['rest-after'] = false; // default: none
    whiteList['rest-before'] = false; // default: none
    whiteList['richness'] = false; // default: 50
    whiteList['right'] = false; // default: auto
    whiteList['rotation'] = false; // default: 0
    whiteList['rotation-point'] = false; // default: 50% 50%
    whiteList['ruby-align'] = false; // default: auto
    whiteList['ruby-merge'] = false; // default: separate
    whiteList['ruby-position'] = false; // default: before
    whiteList['shape-image-threshold'] = false; // default: 0.0
    whiteList['shape-outside'] = false; // default: none
    whiteList['shape-margin'] = false; // default: 0
    whiteList['size'] = false; // default: auto
    whiteList['speak'] = false; // default: auto
    whiteList['speak-as'] = false; // default: normal
    whiteList['speak-header'] = false; // default: once
    whiteList['speak-numeral'] = false; // default: continuous
    whiteList['speak-punctuation'] = false; // default: none
    whiteList['speech-rate'] = false; // default: medium
    whiteList['stress'] = false; // default: 50
    whiteList['string-set'] = false; // default: none
    whiteList['tab-size'] = false; // default: 8
    whiteList['table-layout'] = false; // default: auto
    whiteList['text-align'] = true; // default: start
    whiteList['text-align-last'] = true; // default: auto
    whiteList['text-combine-upright'] = true; // default: none
    whiteList['text-decoration'] = true; // default: none
    whiteList['text-decoration-color'] = true; // default: currentColor
    whiteList['text-decoration-line'] = true; // default: none
    whiteList['text-decoration-skip'] = true; // default: objects
    whiteList['text-decoration-style'] = true; // default: solid
    whiteList['text-emphasis'] = true; // default: depending on individual properties
    whiteList['text-emphasis-color'] = true; // default: currentColor
    whiteList['text-emphasis-position'] = true; // default: over right
    whiteList['text-emphasis-style'] = true; // default: none
    whiteList['text-height'] = true; // default: auto
    whiteList['text-indent'] = true; // default: 0
    whiteList['text-justify'] = true; // default: auto
    whiteList['text-orientation'] = true; // default: mixed
    whiteList['text-overflow'] = true; // default: clip
    whiteList['text-shadow'] = true; // default: none
    whiteList['text-space-collapse'] = true; // default: collapse
    whiteList['text-transform'] = true; // default: none
    whiteList['text-underline-position'] = true; // default: auto
    whiteList['text-wrap'] = true; // default: normal
    whiteList['top'] = false; // default: auto
    whiteList['transform'] = false; // default: none
    whiteList['transform-origin'] = false; // default: 50% 50% 0
    whiteList['transform-style'] = false; // default: flat
    whiteList['transition'] = false; // default: depending on individual properties
    whiteList['transition-delay'] = false; // default: 0s
    whiteList['transition-duration'] = false; // default: 0s
    whiteList['transition-property'] = false; // default: all
    whiteList['transition-timing-function'] = false; // default: ease
    whiteList['unicode-bidi'] = false; // default: normal
    whiteList['vertical-align'] = false; // default: baseline
    whiteList['visibility'] = false; // default: visible
    whiteList['voice-balance'] = false; // default: center
    whiteList['voice-duration'] = false; // default: auto
    whiteList['voice-family'] = false; // default: implementation dependent
    whiteList['voice-pitch'] = false; // default: medium
    whiteList['voice-range'] = false; // default: medium
    whiteList['voice-rate'] = false; // default: normal
    whiteList['voice-stress'] = false; // default: normal
    whiteList['voice-volume'] = false; // default: medium
    whiteList['volume'] = false; // default: medium
    whiteList['white-space'] = false; // default: normal
    whiteList['widows'] = false; // default: 2
    whiteList['width'] = true; // default: auto
    whiteList['will-change'] = false; // default: auto
    whiteList['word-break'] = true; // default: normal
    whiteList['word-spacing'] = true; // default: normal
    whiteList['word-wrap'] = true; // default: normal
    whiteList['wrap-flow'] = false; // default: auto
    whiteList['wrap-through'] = false; // default: wrap
    whiteList['writing-mode'] = false; // default: horizontal-tb
    whiteList['z-index'] = false; // default: auto

    return whiteList;
  }


  /**
   * 匹配到白名单上的一个属性时
   *
   * @param {String} name
   * @param {String} value
   * @param {Object} options
   * @return {String}
   */
  function onAttr (name, value, options) {
    // do nothing
  }

  /**
   * 匹配到不在白名单上的一个属性时
   *
   * @param {String} name
   * @param {String} value
   * @param {Object} options
   * @return {String}
   */
  function onIgnoreAttr (name, value, options) {
    // do nothing
  }

  var REGEXP_URL_JAVASCRIPT = /javascript\s*\:/img;

  /**
   * 过滤属性值
   *
   * @param {String} name
   * @param {String} value
   * @return {String}
   */
  function safeAttrValue(name, value) {
    if (REGEXP_URL_JAVASCRIPT.test(value)) return '';
    return value;
  }


  var whiteList = getDefaultWhiteList();
  var getDefaultWhiteList_1 = getDefaultWhiteList;
  var onAttr_1 = onAttr;
  var onIgnoreAttr_1 = onIgnoreAttr;
  var safeAttrValue_1 = safeAttrValue;

  var _default = {
  	whiteList: whiteList,
  	getDefaultWhiteList: getDefaultWhiteList_1,
  	onAttr: onAttr_1,
  	onIgnoreAttr: onIgnoreAttr_1,
  	safeAttrValue: safeAttrValue_1
  };

  var util = {
    indexOf: function (arr, item) {
      var i, j;
      if (Array.prototype.indexOf) {
        return arr.indexOf(item);
      }
      for (i = 0, j = arr.length; i < j; i++) {
        if (arr[i] === item) {
          return i;
        }
      }
      return -1;
    },
    forEach: function (arr, fn, scope) {
      var i, j;
      if (Array.prototype.forEach) {
        return arr.forEach(fn, scope);
      }
      for (i = 0, j = arr.length; i < j; i++) {
        fn.call(scope, arr[i], i, arr);
      }
    },
    trim: function (str) {
      if (String.prototype.trim) {
        return str.trim();
      }
      return str.replace(/(^\s*)|(\s*$)/g, '');
    },
    trimRight: function (str) {
      if (String.prototype.trimRight) {
        return str.trimRight();
      }
      return str.replace(/(\s*$)/g, '');
    }
  };

  /**
   * cssfilter
   *
   * @author 老雷<leizongmin@gmail.com>
   */




  /**
   * 解析style
   *
   * @param {String} css
   * @param {Function} onAttr 处理属性的函数
   *   参数格式： function (sourcePosition, position, name, value, source)
   * @return {String}
   */
  function parseStyle (css, onAttr) {
    css = util.trimRight(css);
    if (css[css.length - 1] !== ';') css += ';';
    var cssLength = css.length;
    var isParenthesisOpen = false;
    var lastPos = 0;
    var i = 0;
    var retCSS = '';

    function addNewAttr () {
      // 如果没有正常的闭合圆括号，则直接忽略当前属性
      if (!isParenthesisOpen) {
        var source = util.trim(css.slice(lastPos, i));
        var j = source.indexOf(':');
        if (j !== -1) {
          var name = util.trim(source.slice(0, j));
          var value = util.trim(source.slice(j + 1));
          // 必须有属性名称
          if (name) {
            var ret = onAttr(lastPos, retCSS.length, name, value, source);
            if (ret) retCSS += ret + '; ';
          }
        }
      }
      lastPos = i + 1;
    }

    for (; i < cssLength; i++) {
      var c = css[i];
      if (c === '/' && css[i + 1] === '*') {
        // 备注开始
        var j = css.indexOf('*/', i + 2);
        // 如果没有正常的备注结束，则后面的部分全部跳过
        if (j === -1) break;
        // 直接将当前位置调到备注结尾，并且初始化状态
        i = j + 1;
        lastPos = i + 1;
        isParenthesisOpen = false;
      } else if (c === '(') {
        isParenthesisOpen = true;
      } else if (c === ')') {
        isParenthesisOpen = false;
      } else if (c === ';') {
        if (isParenthesisOpen) ; else {
          addNewAttr();
        }
      } else if (c === '\n') {
        addNewAttr();
      }
    }

    return util.trim(retCSS);
  }

  var parser = parseStyle;

  /**
   * cssfilter
   *
   * @author 老雷<leizongmin@gmail.com>
   */






  /**
   * 返回值是否为空
   *
   * @param {Object} obj
   * @return {Boolean}
   */
  function isNull (obj) {
    return (obj === undefined || obj === null);
  }

  /**
   * 浅拷贝对象
   *
   * @param {Object} obj
   * @return {Object}
   */
  function shallowCopyObject (obj) {
    var ret = {};
    for (var i in obj) {
      ret[i] = obj[i];
    }
    return ret;
  }

  /**
   * 创建CSS过滤器
   *
   * @param {Object} options
   *   - {Object} whiteList
   *   - {Function} onAttr
   *   - {Function} onIgnoreAttr
   *   - {Function} safeAttrValue
   */
  function FilterCSS (options) {
    options = shallowCopyObject(options || {});
    options.whiteList = options.whiteList || _default.whiteList;
    options.onAttr = options.onAttr || _default.onAttr;
    options.onIgnoreAttr = options.onIgnoreAttr || _default.onIgnoreAttr;
    options.safeAttrValue = options.safeAttrValue || _default.safeAttrValue;
    this.options = options;
  }

  FilterCSS.prototype.process = function (css) {
    // 兼容各种奇葩输入
    css = css || '';
    css = css.toString();
    if (!css) return '';

    var me = this;
    var options = me.options;
    var whiteList = options.whiteList;
    var onAttr = options.onAttr;
    var onIgnoreAttr = options.onIgnoreAttr;
    var safeAttrValue = options.safeAttrValue;

    var retCSS = parser(css, function (sourcePosition, position, name, value, source) {

      var check = whiteList[name];
      var isWhite = false;
      if (check === true) isWhite = check;
      else if (typeof check === 'function') isWhite = check(value);
      else if (check instanceof RegExp) isWhite = check.test(value);
      if (isWhite !== true) isWhite = false;

      // 如果过滤后 value 为空则直接忽略
      value = safeAttrValue(name, value);
      if (!value) return;

      var opts = {
        position: position,
        sourcePosition: sourcePosition,
        source: source,
        isWhite: isWhite
      };

      if (isWhite) {

        var ret = onAttr(name, value, opts);
        if (isNull(ret)) {
          return name + ':' + value;
        } else {
          return ret;
        }

      } else {

        var ret = onIgnoreAttr(name, value, opts);
        if (!isNull(ret)) {
          return ret;
        }

      }
    });

    return retCSS;
  };


  var css = FilterCSS;

  var lib = createCommonjsModule(function (module, exports) {
  /**
   * cssfilter
   *
   * @author 老雷<leizongmin@gmail.com>
   */





  /**
   * XSS过滤
   *
   * @param {String} css 要过滤的CSS代码
   * @param {Object} options 选项：whiteList, onAttr, onIgnoreAttr
   * @return {String}
   */
  function filterCSS (html, options) {
    var xss = new css(options);
    return xss.process(html);
  }


  // 输出
  exports = module.exports = filterCSS;
  exports.FilterCSS = css;
  for (var i in _default) exports[i] = _default[i];

  // 在浏览器端使用
  if (typeof window !== 'undefined') {
    window.filterCSS = module.exports;
  }
  });
  var lib_1 = lib.cssfilter;
  var lib_2 = lib.FilterCSS;

  var util$1 = {
    indexOf: function(arr, item) {
      var i, j;
      if (Array.prototype.indexOf) {
        return arr.indexOf(item);
      }
      for (i = 0, j = arr.length; i < j; i++) {
        if (arr[i] === item) {
          return i;
        }
      }
      return -1;
    },
    forEach: function(arr, fn, scope) {
      var i, j;
      if (Array.prototype.forEach) {
        return arr.forEach(fn, scope);
      }
      for (i = 0, j = arr.length; i < j; i++) {
        fn.call(scope, arr[i], i, arr);
      }
    },
    trim: function(str) {
      if (String.prototype.trim) {
        return str.trim();
      }
      return str.replace(/(^\s*)|(\s*$)/g, "");
    },
    spaceIndex: function(str) {
      var reg = /\s|\n|\t/;
      var match = reg.exec(str);
      return match ? match.index : -1;
    }
  };

  /**
   * default settings
   *
   * @author Zongmin Lei<leizongmin@gmail.com>
   */

  var FilterCSS$1 = lib.FilterCSS;
  var getDefaultCSSWhiteList = lib.getDefaultWhiteList;


  function getDefaultWhiteList$1() {
    return {
      a: ["target", "href", "title"],
      abbr: ["title"],
      address: [],
      area: ["shape", "coords", "href", "alt"],
      article: [],
      aside: [],
      audio: ["autoplay", "controls", "loop", "preload", "src"],
      b: [],
      bdi: ["dir"],
      bdo: ["dir"],
      big: [],
      blockquote: ["cite"],
      br: [],
      caption: [],
      center: [],
      cite: [],
      code: [],
      col: ["align", "valign", "span", "width"],
      colgroup: ["align", "valign", "span", "width"],
      dd: [],
      del: ["datetime"],
      details: ["open"],
      div: [],
      dl: [],
      dt: [],
      em: [],
      font: ["color", "size", "face"],
      footer: [],
      h1: [],
      h2: [],
      h3: [],
      h4: [],
      h5: [],
      h6: [],
      header: [],
      hr: [],
      i: [],
      img: ["src", "alt", "title", "width", "height"],
      ins: ["datetime"],
      li: [],
      mark: [],
      nav: [],
      ol: [],
      p: [],
      pre: [],
      s: [],
      section: [],
      small: [],
      span: [],
      sub: [],
      sup: [],
      strong: [],
      table: ["width", "border", "align", "valign"],
      tbody: ["align", "valign"],
      td: ["width", "rowspan", "colspan", "align", "valign"],
      tfoot: ["align", "valign"],
      th: ["width", "rowspan", "colspan", "align", "valign"],
      thead: ["align", "valign"],
      tr: ["rowspan", "align", "valign"],
      tt: [],
      u: [],
      ul: [],
      video: ["autoplay", "controls", "loop", "preload", "src", "height", "width"]
    };
  }

  var defaultCSSFilter = new FilterCSS$1();

  /**
   * default onTag function
   *
   * @param {String} tag
   * @param {String} html
   * @param {Object} options
   * @return {String}
   */
  function onTag(tag, html, options) {
    // do nothing
  }

  /**
   * default onIgnoreTag function
   *
   * @param {String} tag
   * @param {String} html
   * @param {Object} options
   * @return {String}
   */
  function onIgnoreTag(tag, html, options) {
    // do nothing
  }

  /**
   * default onTagAttr function
   *
   * @param {String} tag
   * @param {String} name
   * @param {String} value
   * @return {String}
   */
  function onTagAttr(tag, name, value) {
    // do nothing
  }

  /**
   * default onIgnoreTagAttr function
   *
   * @param {String} tag
   * @param {String} name
   * @param {String} value
   * @return {String}
   */
  function onIgnoreTagAttr(tag, name, value) {
    // do nothing
  }

  /**
   * default escapeHtml function
   *
   * @param {String} html
   */
  function escapeHtml(html) {
    return html.replace(REGEXP_LT, "&lt;").replace(REGEXP_GT, "&gt;");
  }

  /**
   * default safeAttrValue function
   *
   * @param {String} tag
   * @param {String} name
   * @param {String} value
   * @param {Object} cssFilter
   * @return {String}
   */
  function safeAttrValue$1(tag, name, value, cssFilter) {
    // unescape attribute value firstly
    value = friendlyAttrValue(value);

    if (name === "href" || name === "src") {
      // filter `href` and `src` attribute
      // only allow the value that starts with `http://` | `https://` | `mailto:` | `/` | `#`
      value = util$1.trim(value);
      if (value === "#") return "#";
      if (
        !(
          value.substr(0, 7) === "http://" ||
          value.substr(0, 8) === "https://" ||
          value.substr(0, 7) === "mailto:" ||
          value.substr(0, 4) === "tel:" ||
          value[0] === "#" ||
          value[0] === "/"
        )
      ) {
        return "";
      }
    } else if (name === "background") {
      // filter `background` attribute (maybe no use)
      // `javascript:`
      REGEXP_DEFAULT_ON_TAG_ATTR_4.lastIndex = 0;
      if (REGEXP_DEFAULT_ON_TAG_ATTR_4.test(value)) {
        return "";
      }
    } else if (name === "style") {
      // `expression()`
      REGEXP_DEFAULT_ON_TAG_ATTR_7.lastIndex = 0;
      if (REGEXP_DEFAULT_ON_TAG_ATTR_7.test(value)) {
        return "";
      }
      // `url()`
      REGEXP_DEFAULT_ON_TAG_ATTR_8.lastIndex = 0;
      if (REGEXP_DEFAULT_ON_TAG_ATTR_8.test(value)) {
        REGEXP_DEFAULT_ON_TAG_ATTR_4.lastIndex = 0;
        if (REGEXP_DEFAULT_ON_TAG_ATTR_4.test(value)) {
          return "";
        }
      }
      if (cssFilter !== false) {
        cssFilter = cssFilter || defaultCSSFilter;
        value = cssFilter.process(value);
      }
    }

    // escape `<>"` before returns
    value = escapeAttrValue(value);
    return value;
  }

  // RegExp list
  var REGEXP_LT = /</g;
  var REGEXP_GT = />/g;
  var REGEXP_QUOTE = /"/g;
  var REGEXP_QUOTE_2 = /&quot;/g;
  var REGEXP_ATTR_VALUE_1 = /&#([a-zA-Z0-9]*);?/gim;
  var REGEXP_ATTR_VALUE_COLON = /&colon;?/gim;
  var REGEXP_ATTR_VALUE_NEWLINE = /&newline;?/gim;
  var REGEXP_DEFAULT_ON_TAG_ATTR_4 = /((j\s*a\s*v\s*a|v\s*b|l\s*i\s*v\s*e)\s*s\s*c\s*r\s*i\s*p\s*t\s*|m\s*o\s*c\s*h\s*a)\:/gi;
  var REGEXP_DEFAULT_ON_TAG_ATTR_7 = /e\s*x\s*p\s*r\s*e\s*s\s*s\s*i\s*o\s*n\s*\(.*/gi;
  var REGEXP_DEFAULT_ON_TAG_ATTR_8 = /u\s*r\s*l\s*\(.*/gi;

  /**
   * escape doube quote
   *
   * @param {String} str
   * @return {String} str
   */
  function escapeQuote(str) {
    return str.replace(REGEXP_QUOTE, "&quot;");
  }

  /**
   * unescape double quote
   *
   * @param {String} str
   * @return {String} str
   */
  function unescapeQuote(str) {
    return str.replace(REGEXP_QUOTE_2, '"');
  }

  /**
   * escape html entities
   *
   * @param {String} str
   * @return {String}
   */
  function escapeHtmlEntities(str) {
    return str.replace(REGEXP_ATTR_VALUE_1, function replaceUnicode(str, code) {
      return code[0] === "x" || code[0] === "X"
        ? String.fromCharCode(parseInt(code.substr(1), 16))
        : String.fromCharCode(parseInt(code, 10));
    });
  }

  /**
   * escape html5 new danger entities
   *
   * @param {String} str
   * @return {String}
   */
  function escapeDangerHtml5Entities(str) {
    return str
      .replace(REGEXP_ATTR_VALUE_COLON, ":")
      .replace(REGEXP_ATTR_VALUE_NEWLINE, " ");
  }

  /**
   * clear nonprintable characters
   *
   * @param {String} str
   * @return {String}
   */
  function clearNonPrintableCharacter(str) {
    var str2 = "";
    for (var i = 0, len = str.length; i < len; i++) {
      str2 += str.charCodeAt(i) < 32 ? " " : str.charAt(i);
    }
    return util$1.trim(str2);
  }

  /**
   * get friendly attribute value
   *
   * @param {String} str
   * @return {String}
   */
  function friendlyAttrValue(str) {
    str = unescapeQuote(str);
    str = escapeHtmlEntities(str);
    str = escapeDangerHtml5Entities(str);
    str = clearNonPrintableCharacter(str);
    return str;
  }

  /**
   * unescape attribute value
   *
   * @param {String} str
   * @return {String}
   */
  function escapeAttrValue(str) {
    str = escapeQuote(str);
    str = escapeHtml(str);
    return str;
  }

  /**
   * `onIgnoreTag` function for removing all the tags that are not in whitelist
   */
  function onIgnoreTagStripAll() {
    return "";
  }

  /**
   * remove tag body
   * specify a `tags` list, if the tag is not in the `tags` list then process by the specify function (optional)
   *
   * @param {array} tags
   * @param {function} next
   */
  function StripTagBody(tags, next) {
    if (typeof next !== "function") {
      next = function() {};
    }

    var isRemoveAllTag = !Array.isArray(tags);
    function isRemoveTag(tag) {
      if (isRemoveAllTag) return true;
      return util$1.indexOf(tags, tag) !== -1;
    }

    var removeList = [];
    var posStart = false;

    return {
      onIgnoreTag: function(tag, html, options) {
        if (isRemoveTag(tag)) {
          if (options.isClosing) {
            var ret = "[/removed]";
            var end = options.position + ret.length;
            removeList.push([
              posStart !== false ? posStart : options.position,
              end
            ]);
            posStart = false;
            return ret;
          } else {
            if (!posStart) {
              posStart = options.position;
            }
            return "[removed]";
          }
        } else {
          return next(tag, html, options);
        }
      },
      remove: function(html) {
        var rethtml = "";
        var lastPos = 0;
        util$1.forEach(removeList, function(pos) {
          rethtml += html.slice(lastPos, pos[0]);
          lastPos = pos[1];
        });
        rethtml += html.slice(lastPos);
        return rethtml;
      }
    };
  }

  /**
   * remove html comments
   *
   * @param {String} html
   * @return {String}
   */
  function stripCommentTag(html) {
    return html.replace(STRIP_COMMENT_TAG_REGEXP, "");
  }
  var STRIP_COMMENT_TAG_REGEXP = /<!--[\s\S]*?-->/g;

  /**
   * remove invisible characters
   *
   * @param {String} html
   * @return {String}
   */
  function stripBlankChar(html) {
    var chars = html.split("");
    chars = chars.filter(function(char) {
      var c = char.charCodeAt(0);
      if (c === 127) return false;
      if (c <= 31) {
        if (c === 10 || c === 13) return true;
        return false;
      }
      return true;
    });
    return chars.join("");
  }

  var whiteList$1 = getDefaultWhiteList$1();
  var getDefaultWhiteList_1$1 = getDefaultWhiteList$1;
  var onTag_1 = onTag;
  var onIgnoreTag_1 = onIgnoreTag;
  var onTagAttr_1 = onTagAttr;
  var onIgnoreTagAttr_1 = onIgnoreTagAttr;
  var safeAttrValue_1$1 = safeAttrValue$1;
  var escapeHtml_1 = escapeHtml;
  var escapeQuote_1 = escapeQuote;
  var unescapeQuote_1 = unescapeQuote;
  var escapeHtmlEntities_1 = escapeHtmlEntities;
  var escapeDangerHtml5Entities_1 = escapeDangerHtml5Entities;
  var clearNonPrintableCharacter_1 = clearNonPrintableCharacter;
  var friendlyAttrValue_1 = friendlyAttrValue;
  var escapeAttrValue_1 = escapeAttrValue;
  var onIgnoreTagStripAll_1 = onIgnoreTagStripAll;
  var StripTagBody_1 = StripTagBody;
  var stripCommentTag_1 = stripCommentTag;
  var stripBlankChar_1 = stripBlankChar;
  var cssFilter = defaultCSSFilter;
  var getDefaultCSSWhiteList_1 = getDefaultCSSWhiteList;

  var _default$1 = {
  	whiteList: whiteList$1,
  	getDefaultWhiteList: getDefaultWhiteList_1$1,
  	onTag: onTag_1,
  	onIgnoreTag: onIgnoreTag_1,
  	onTagAttr: onTagAttr_1,
  	onIgnoreTagAttr: onIgnoreTagAttr_1,
  	safeAttrValue: safeAttrValue_1$1,
  	escapeHtml: escapeHtml_1,
  	escapeQuote: escapeQuote_1,
  	unescapeQuote: unescapeQuote_1,
  	escapeHtmlEntities: escapeHtmlEntities_1,
  	escapeDangerHtml5Entities: escapeDangerHtml5Entities_1,
  	clearNonPrintableCharacter: clearNonPrintableCharacter_1,
  	friendlyAttrValue: friendlyAttrValue_1,
  	escapeAttrValue: escapeAttrValue_1,
  	onIgnoreTagStripAll: onIgnoreTagStripAll_1,
  	StripTagBody: StripTagBody_1,
  	stripCommentTag: stripCommentTag_1,
  	stripBlankChar: stripBlankChar_1,
  	cssFilter: cssFilter,
  	getDefaultCSSWhiteList: getDefaultCSSWhiteList_1
  };

  /**
   * Simple HTML Parser
   *
   * @author Zongmin Lei<leizongmin@gmail.com>
   */



  /**
   * get tag name
   *
   * @param {String} html e.g. '<a hef="#">'
   * @return {String}
   */
  function getTagName(html) {
    var i = util$1.spaceIndex(html);
    if (i === -1) {
      var tagName = html.slice(1, -1);
    } else {
      var tagName = html.slice(1, i + 1);
    }
    tagName = util$1.trim(tagName).toLowerCase();
    if (tagName.slice(0, 1) === "/") tagName = tagName.slice(1);
    if (tagName.slice(-1) === "/") tagName = tagName.slice(0, -1);
    return tagName;
  }

  /**
   * is close tag?
   *
   * @param {String} html 如：'<a hef="#">'
   * @return {Boolean}
   */
  function isClosing(html) {
    return html.slice(0, 2) === "</";
  }

  /**
   * parse input html and returns processed html
   *
   * @param {String} html
   * @param {Function} onTag e.g. function (sourcePosition, position, tag, html, isClosing)
   * @param {Function} escapeHtml
   * @return {String}
   */
  function parseTag(html, onTag, escapeHtml) {
    "user strict";

    var rethtml = "";
    var lastPos = 0;
    var tagStart = false;
    var quoteStart = false;
    var currentPos = 0;
    var len = html.length;
    var currentTagName = "";
    var currentHtml = "";

    for (currentPos = 0; currentPos < len; currentPos++) {
      var c = html.charAt(currentPos);
      if (tagStart === false) {
        if (c === "<") {
          tagStart = currentPos;
          continue;
        }
      } else {
        if (quoteStart === false) {
          if (c === "<") {
            rethtml += escapeHtml(html.slice(lastPos, currentPos));
            tagStart = currentPos;
            lastPos = currentPos;
            continue;
          }
          if (c === ">") {
            rethtml += escapeHtml(html.slice(lastPos, tagStart));
            currentHtml = html.slice(tagStart, currentPos + 1);
            currentTagName = getTagName(currentHtml);
            rethtml += onTag(
              tagStart,
              rethtml.length,
              currentTagName,
              currentHtml,
              isClosing(currentHtml)
            );
            lastPos = currentPos + 1;
            tagStart = false;
            continue;
          }
          if ((c === '"' || c === "'") && html.charAt(currentPos - 1) === "=") {
            quoteStart = c;
            continue;
          }
        } else {
          if (c === quoteStart) {
            quoteStart = false;
            continue;
          }
        }
      }
    }
    if (lastPos < html.length) {
      rethtml += escapeHtml(html.substr(lastPos));
    }

    return rethtml;
  }

  var REGEXP_ILLEGAL_ATTR_NAME = /[^a-zA-Z0-9_:\.\-]/gim;

  /**
   * parse input attributes and returns processed attributes
   *
   * @param {String} html e.g. `href="#" target="_blank"`
   * @param {Function} onAttr e.g. `function (name, value)`
   * @return {String}
   */
  function parseAttr(html, onAttr) {
    "user strict";

    var lastPos = 0;
    var retAttrs = [];
    var tmpName = false;
    var len = html.length;

    function addAttr(name, value) {
      name = util$1.trim(name);
      name = name.replace(REGEXP_ILLEGAL_ATTR_NAME, "").toLowerCase();
      if (name.length < 1) return;
      var ret = onAttr(name, value || "");
      if (ret) retAttrs.push(ret);
    }

    // 逐个分析字符
    for (var i = 0; i < len; i++) {
      var c = html.charAt(i);
      var v, j;
      if (tmpName === false && c === "=") {
        tmpName = html.slice(lastPos, i);
        lastPos = i + 1;
        continue;
      }
      if (tmpName !== false) {
        if (
          i === lastPos &&
          (c === '"' || c === "'") &&
          html.charAt(i - 1) === "="
        ) {
          j = html.indexOf(c, i + 1);
          if (j === -1) {
            break;
          } else {
            v = util$1.trim(html.slice(lastPos + 1, j));
            addAttr(tmpName, v);
            tmpName = false;
            i = j;
            lastPos = i + 1;
            continue;
          }
        }
      }
      if (/\s|\n|\t/.test(c)) {
        html = html.replace(/\s|\n|\t/g, " ");
        if (tmpName === false) {
          j = findNextEqual(html, i);
          if (j === -1) {
            v = util$1.trim(html.slice(lastPos, i));
            addAttr(v);
            tmpName = false;
            lastPos = i + 1;
            continue;
          } else {
            i = j - 1;
            continue;
          }
        } else {
          j = findBeforeEqual(html, i - 1);
          if (j === -1) {
            v = util$1.trim(html.slice(lastPos, i));
            v = stripQuoteWrap(v);
            addAttr(tmpName, v);
            tmpName = false;
            lastPos = i + 1;
            continue;
          } else {
            continue;
          }
        }
      }
    }

    if (lastPos < html.length) {
      if (tmpName === false) {
        addAttr(html.slice(lastPos));
      } else {
        addAttr(tmpName, stripQuoteWrap(util$1.trim(html.slice(lastPos))));
      }
    }

    return util$1.trim(retAttrs.join(" "));
  }

  function findNextEqual(str, i) {
    for (; i < str.length; i++) {
      var c = str[i];
      if (c === " ") continue;
      if (c === "=") return i;
      return -1;
    }
  }

  function findBeforeEqual(str, i) {
    for (; i > 0; i--) {
      var c = str[i];
      if (c === " ") continue;
      if (c === "=") return i;
      return -1;
    }
  }

  function isQuoteWrapString(text) {
    if (
      (text[0] === '"' && text[text.length - 1] === '"') ||
      (text[0] === "'" && text[text.length - 1] === "'")
    ) {
      return true;
    } else {
      return false;
    }
  }

  function stripQuoteWrap(text) {
    if (isQuoteWrapString(text)) {
      return text.substr(1, text.length - 2);
    } else {
      return text;
    }
  }

  var parseTag_1 = parseTag;
  var parseAttr_1 = parseAttr;

  var parser$1 = {
  	parseTag: parseTag_1,
  	parseAttr: parseAttr_1
  };

  /**
   * filter xss
   *
   * @author Zongmin Lei<leizongmin@gmail.com>
   */

  var FilterCSS$2 = lib.FilterCSS;


  var parseTag$1 = parser$1.parseTag;
  var parseAttr$1 = parser$1.parseAttr;


  /**
   * returns `true` if the input value is `undefined` or `null`
   *
   * @param {Object} obj
   * @return {Boolean}
   */
  function isNull$1(obj) {
    return obj === undefined || obj === null;
  }

  /**
   * get attributes for a tag
   *
   * @param {String} html
   * @return {Object}
   *   - {String} html
   *   - {Boolean} closing
   */
  function getAttrs(html) {
    var i = util$1.spaceIndex(html);
    if (i === -1) {
      return {
        html: "",
        closing: html[html.length - 2] === "/"
      };
    }
    html = util$1.trim(html.slice(i + 1, -1));
    var isClosing = html[html.length - 1] === "/";
    if (isClosing) html = util$1.trim(html.slice(0, -1));
    return {
      html: html,
      closing: isClosing
    };
  }

  /**
   * shallow copy
   *
   * @param {Object} obj
   * @return {Object}
   */
  function shallowCopyObject$1(obj) {
    var ret = {};
    for (var i in obj) {
      ret[i] = obj[i];
    }
    return ret;
  }

  /**
   * FilterXSS class
   *
   * @param {Object} options
   *        whiteList, onTag, onTagAttr, onIgnoreTag,
   *        onIgnoreTagAttr, safeAttrValue, escapeHtml
   *        stripIgnoreTagBody, allowCommentTag, stripBlankChar
   *        css{whiteList, onAttr, onIgnoreAttr} `css=false` means don't use `cssfilter`
   */
  function FilterXSS(options) {
    options = shallowCopyObject$1(options || {});

    if (options.stripIgnoreTag) {
      if (options.onIgnoreTag) {
        console.error(
          'Notes: cannot use these two options "stripIgnoreTag" and "onIgnoreTag" at the same time'
        );
      }
      options.onIgnoreTag = _default$1.onIgnoreTagStripAll;
    }

    options.whiteList = options.whiteList || _default$1.whiteList;
    options.onTag = options.onTag || _default$1.onTag;
    options.onTagAttr = options.onTagAttr || _default$1.onTagAttr;
    options.onIgnoreTag = options.onIgnoreTag || _default$1.onIgnoreTag;
    options.onIgnoreTagAttr = options.onIgnoreTagAttr || _default$1.onIgnoreTagAttr;
    options.safeAttrValue = options.safeAttrValue || _default$1.safeAttrValue;
    options.escapeHtml = options.escapeHtml || _default$1.escapeHtml;
    this.options = options;

    if (options.css === false) {
      this.cssFilter = false;
    } else {
      options.css = options.css || {};
      this.cssFilter = new FilterCSS$2(options.css);
    }
  }

  /**
   * start process and returns result
   *
   * @param {String} html
   * @return {String}
   */
  FilterXSS.prototype.process = function(html) {
    // compatible with the input
    html = html || "";
    html = html.toString();
    if (!html) return "";

    var me = this;
    var options = me.options;
    var whiteList = options.whiteList;
    var onTag = options.onTag;
    var onIgnoreTag = options.onIgnoreTag;
    var onTagAttr = options.onTagAttr;
    var onIgnoreTagAttr = options.onIgnoreTagAttr;
    var safeAttrValue = options.safeAttrValue;
    var escapeHtml = options.escapeHtml;
    var cssFilter = me.cssFilter;

    // remove invisible characters
    if (options.stripBlankChar) {
      html = _default$1.stripBlankChar(html);
    }

    // remove html comments
    if (!options.allowCommentTag) {
      html = _default$1.stripCommentTag(html);
    }

    // if enable stripIgnoreTagBody
    var stripIgnoreTagBody = false;
    if (options.stripIgnoreTagBody) {
      var stripIgnoreTagBody = _default$1.StripTagBody(
        options.stripIgnoreTagBody,
        onIgnoreTag
      );
      onIgnoreTag = stripIgnoreTagBody.onIgnoreTag;
    }

    var retHtml = parseTag$1(
      html,
      function(sourcePosition, position, tag, html, isClosing) {
        var info = {
          sourcePosition: sourcePosition,
          position: position,
          isClosing: isClosing,
          isWhite: whiteList.hasOwnProperty(tag)
        };

        // call `onTag()`
        var ret = onTag(tag, html, info);
        if (!isNull$1(ret)) return ret;

        if (info.isWhite) {
          if (info.isClosing) {
            return "</" + tag + ">";
          }

          var attrs = getAttrs(html);
          var whiteAttrList = whiteList[tag];
          var attrsHtml = parseAttr$1(attrs.html, function(name, value) {
            // call `onTagAttr()`
            var isWhiteAttr = util$1.indexOf(whiteAttrList, name) !== -1;
            var ret = onTagAttr(tag, name, value, isWhiteAttr);
            if (!isNull$1(ret)) return ret;

            if (isWhiteAttr) {
              // call `safeAttrValue()`
              value = safeAttrValue(tag, name, value, cssFilter);
              if (value) {
                return name + '="' + value + '"';
              } else {
                return name;
              }
            } else {
              // call `onIgnoreTagAttr()`
              var ret = onIgnoreTagAttr(tag, name, value, isWhiteAttr);
              if (!isNull$1(ret)) return ret;
              return;
            }
          });

          // build new tag html
          var html = "<" + tag;
          if (attrsHtml) html += " " + attrsHtml;
          if (attrs.closing) html += " /";
          html += ">";
          return html;
        } else {
          // call `onIgnoreTag()`
          var ret = onIgnoreTag(tag, html, info);
          if (!isNull$1(ret)) return ret;
          return escapeHtml(html);
        }
      },
      escapeHtml
    );

    // if enable stripIgnoreTagBody
    if (stripIgnoreTagBody) {
      retHtml = stripIgnoreTagBody.remove(retHtml);
    }

    return retHtml;
  };

  var xss = FilterXSS;

  var lib$1 = createCommonjsModule(function (module, exports) {
  /**
   * xss
   *
   * @author Zongmin Lei<leizongmin@gmail.com>
   */





  /**
   * filter xss function
   *
   * @param {String} html
   * @param {Object} options { whiteList, onTag, onTagAttr, onIgnoreTag, onIgnoreTagAttr, safeAttrValue, escapeHtml }
   * @return {String}
   */
  function filterXSS(html, options) {
    var xss$1 = new xss(options);
    return xss$1.process(html);
  }

  exports = module.exports = filterXSS;
  exports.filterXSS = filterXSS;
  exports.FilterXSS = xss;
  for (var i in _default$1) exports[i] = _default$1[i];
  for (var i in parser$1) exports[i] = parser$1[i];

  // using `xss` on the browser, output `filterXSS` to the globals
  if (typeof window !== "undefined") {
    window.filterXSS = module.exports;
  }

  // using `xss` on the WebWorker, output `filterXSS` to the globals
  function isWorkerEnv() {
    return typeof self !== 'undefined' && typeof DedicatedWorkerGlobalScope !== 'undefined' && self instanceof DedicatedWorkerGlobalScope;
  }
  if (isWorkerEnv()) {
    self.filterXSS = module.exports;
  }
  });
  var lib_1$1 = lib$1.xss;
  var lib_2$1 = lib$1.filterXSS;
  var lib_3 = lib$1.FilterXSS;

  function isBase64 (value) {
    const test = /^data:.+;base64,/;
    return !!value.match(test);
  }

  function getBase64Data (value) {
    const data = value.split('base64,')[1];
    return data;
  }

  const whiteListedCssProperties = {
    ...lib.getDefaultWhiteList(),
    bottom: true,
    left: true,
    overflow: true,
    position: true,
    right: true,
    top: true,
    transform: true,
    opacity: true,
    'transform-origin': true,
    'flex-direction': true,
    'flex-wrap': true,
    'justify-content': true,
    'align-items': true,
    'white-space': true,
    'line-height': true
  };

  function modifyWhiteList () {
    const whiteList = lib$1.getDefaultWhiteList();
    Object.keys(whiteList).forEach(el => {
      whiteList[el].push('style');
      whiteList[el].push('class');
      whiteList[el].push('download');
    });
    return whiteList;
  }

  function handleTagAttr (tag, name, value, isWhiteAttr) {
    if (name === 'style') {
      return `${name}="${lib(value, {
      whiteList: whiteListedCssProperties
    }).replace(/; /g, ';')}"`;
    }

    if (tag === 'img' && name === 'src') {
      if (isBase64(value)) {
        const data = getBase64Data(value);
        try {
          atob(data);
          return `${name}="${value}"`;
        } catch (e) {
          return name;
        }
      }
    }
  }

  function handleAttrValue (tag, name, value, cssFilter) {
    // unescape attribute value firstly
    value = lib$1.friendlyAttrValue(value);

    if (name === 'href' || name === 'src') {
      // filter `href` and `src` attribute
      // only allow the value that starts with `http://` | `https://` | `mailto:` | `data:` | `/` | `#`
      value = utilTrim(value);
      if (value === '#') return '#';
      if (!isWhiteListedHref(value)) {
        return '';
      }
    } else if (name === 'background') {
      // filter `background` attribute (maybe no use)
      // `javascript:`
      REGEXP_DEFAULT_ON_TAG_ATTR_4$1.lastIndex = 0;
      if (REGEXP_DEFAULT_ON_TAG_ATTR_4$1.test(value)) {
        return '';
      }
    } else if (name === 'style') {
      // `expression()`
      REGEXP_DEFAULT_ON_TAG_ATTR_7$1.lastIndex = 0;
      if (REGEXP_DEFAULT_ON_TAG_ATTR_7$1.test(value)) {
        return '';
      }
      // `url()`
      REGEXP_DEFAULT_ON_TAG_ATTR_8$1.lastIndex = 0;
      if (REGEXP_DEFAULT_ON_TAG_ATTR_8$1.test(value)) {
        REGEXP_DEFAULT_ON_TAG_ATTR_4$1.lastIndex = 0;
        if (REGEXP_DEFAULT_ON_TAG_ATTR_4$1.test(value)) {
          return '';
        }
      }
      if (cssFilter !== false) {
        cssFilter = cssFilter || lib$1.getDefaultCSSWhiteList();
        value = cssFilter.process(value);
      }
    }

    // escape `<>"` before returns
    value = lib$1.escapeAttrValue(value);
    return value;
  }

  function isWhiteListedHref (value) {
    const whiteList = ['http://', 'https://', 'mailto:', 'tel:', 'data:', '#', '/'];
    return whiteList.some(item => value.substr(0, item.length) === item);
  }

  // utility trim from xss
  function utilTrim (str) {
    if (String.prototype.trim) {
      return str.trim();
    }
    return str.replace(/(^\s*)|(\s*$)/g, '');
  }

  // RegExp list from xss
  var REGEXP_DEFAULT_ON_TAG_ATTR_4$1 = /((j\s*a\s*v\s*a|v\s*b|l\s*i\s*v\s*e)\s*s\s*c\s*r\s*i\s*p\s*t\s*|m\s*o\s*c\s*h\s*a):/gi;
  var REGEXP_DEFAULT_ON_TAG_ATTR_7$1 = /e\s*x\s*p\s*r\s*e\s*s\s*s\s*i\s*o\s*n\s*\(.*/gi;
  var REGEXP_DEFAULT_ON_TAG_ATTR_8$1 = /u\s*r\s*l\s*\(.*/gi;

  const options = {
    whiteList: modifyWhiteList(),
    css: false,
    stripIgnoreTagBody: true,
    onTagAttr: handleTagAttr,
    safeAttrValue: handleAttrValue
  };
  const sanitizer = new lib$1.FilterXSS(options);

  function sanitize (html) {
    return sanitizer.process(html);
  }

  const defaultLocale = 'en';

  function detectLocale () {
    return navigator.language || navigator.userLanguage || navigator.browserLanguage || defaultLocale;
  }

  var currentLocale = {
    locale: defaultLocale
  };

  var en$1 = {
    errors: {
      errorLabel: 'Error',
      invalidBlockcerts: 'Not a valid Blockcerts credential. Please check with the issuer or recipient that has provided this credential.',
      invalidBlockcertsUrl: 'Not a valid credential URL.',
      invalidFormatDragAndDrop: 'Only JSON files are accepted',
      invalidUrl: 'This does not seem to be a valid URL.',
      noDownloadLink: 'No link provided for download!',
      noMetadata: 'No metadata specified for this record',
      noShareUrl: 'No URL to share!',
      noTransactionId: 'No transaction ID'
    },
    text: {
      brandName: 'Blockcerts',
      blockcertsHint: 'Visit Blockcerts website',
      by: 'by',
      certified: 'Certified by',
      closeButton: 'Click to close',
      downloadLink: 'Download Record in JSON format',
      dragAndDropHint: '(you can also drag & drop your file).',
      fileUpload: 'Choose JSON file',
      issued: 'Issued on',
      issueDate: 'Issue Date',
      issuerName: 'Issuer',
      issuerPublicKey: 'Issuer\'s public key',
      item: 'Item',
      itemPlural: 'Items',
      metadataButton: 'View Metadata',
      metadataTitle: 'Certificate Metadata',
      motto: 'Blockcerts, The Open Standard for Blockchain Credentials',
      recipient: 'Recipient',
      share: 'Share on',
      shareButton: 'Share on Social Networks',
      signed: 'Signed by',
      substepsListClose: 'Hide',
      substepsListHint: 'Toggle open list of substeps',
      transactionId: 'Transaction ID',
      urlInput: 'Enter the certificate URL',
      urlInputPlaceholder: 'Certificate URL',
      verificationStepProgress: 'Verifying step...',
      verify: 'Verify',
      verifyAgain: 'Verify again',
      verifyOther: 'Verify another record',
      viewRecord: 'View Record'
    },
    date: {
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'],
      pattern: 'MM DD, YYYY'
    }
  };

  var es$1 = {
    errors: {
      errorLabel: 'Error',
      invalidBlockcerts: 'No es una credencial válida de Blockcerts. Verifique con el emisor o el destinatario que ha proporcionado esta credencial.',
      invalidBlockcertsUrl: 'No es URL de certificado valido.',
      invalidFormatDragAndDrop: 'Solo se aceptan archivos JSON',
      invalidUrl: 'Esto no parece ser un URL válido.',
      noDownloadLink: 'Enlace para descargar no proporcionado!',
      noMetadata: 'No se han especificado metadatos para este registro',
      noShareUrl: 'No hay URL para compartir!',
      noTransactionId: 'No ID de transacción'
    },
    text: {
      brandName: 'Blockcerts',
      blockcertsHint: 'Visite el sitio web de Blockcerts',
      by: 'por',
      certified: 'Certificado por',
      closeButton: 'Haz Click para cerrar',
      downloadLink: 'Descarga el Registro en formato JSON',
      dragAndDropHint: '(también puedes arrastrar y soltar tu archivo).',
      fileUpload: 'Escoge archivo JSON',
      issued: 'Emitido el',
      issueDate: 'Fecha de Emisión',
      issuerName: 'Emisor',
      issuerPublicKey: 'Llave publica del Emisor',
      item: 'Elemento',
      itemPlural: 'Elementos',
      metadataButton: 'Ver Metadata',
      metadataTitle: 'Certificado Metadata',
      motto: 'Blockcerts, El Estándar Abierto para Credenciales Blockchain',
      recipient: 'Recipiente',
      share: 'Comparte en',
      shareButton: 'Comparte en Redes Sociales',
      signed: 'Firmado Por',
      substepsListClose: 'Esconde',
      substepsListHint: 'Pasa lista abierta de sub-pasos',
      transactionId: 'ID de Transacción',
      urlInput: 'Ingrese el URL del certificado',
      urlInputPlaceholder: 'Certificado del URL',
      verificationStepProgress: 'Paso de verificación...',
      verify: 'Verifica',
      verifyAgain: 'Verifica nuevamente',
      verifyOther: 'Verifica otro registro',
      viewRecord: 'Ver Registro'
    },
    date: {
      months: ['enero', 'feb', 'marzo', 'abr', 'mayo', 'jun', 'jul', 'agosto', 'set', 'oct', 'nov', 'dic'],
      pattern: 'MM DD, YYYY'
    }
  };

  var fr$1 = {
    errors: {
      errorLabel: 'Erreur',
      invalidBlockcerts: 'Ceci n\'est pas un certificat Blockcerts valide. Veuillez s\'il vous plaît contrôler avec l\'organisme émetteur ou le récipiendaire de ce certificat.',
      invalidBlockcertsUrl: 'Ceci n\'est pas une URL de certificat valide.',
      invalidFormatDragAndDrop: 'Seul le format JSON est accepté',
      invalidUrl: 'URL invalide',
      noDownloadLink: 'Aucun lien disponible pour le téléchargement!',
      noMetadata: 'Ce certificat ne contient pas de métadata',
      noShareUrl: 'Pas d\'URL à partager!',
      noTransactionId: 'Pas d\'identifiant de transaction'
    },
    text: {
      brandName: 'Blockcerts',
      blockcertsHint: 'Visiter le site de Blockcerts',
      by: 'par',
      certified: 'Certifié par',
      closeButton: 'Cliquer pour fermer',
      downloadLink: 'Télécharger le certificat au format JSON',
      dragAndDropHint: '(vous pouvez aussi glisser et déposer votre fichier).',
      fileUpload: 'Choisir un fichier JSON',
      issued: 'Émis le',
      issueDate: 'Date d\'émission',
      issuerName: 'Émetteur',
      issuerPublicKey: 'Clé publique de l\'émetteur',
      item: 'point contrôlé',
      itemPlural: 'points contrôlés',
      metadataButton: 'Voir les métadata',
      metadataTitle: 'Métadata du certificat',
      motto: 'Blockcerts, The Open Standard for Blockchain Credentials',
      recipient: 'Titulaire',
      share: 'Partager sur',
      shareButton: 'Partager sur les réseaux sociaux',
      signed: 'Signé par',
      substepsListClose: 'Fermer',
      substepsListHint: 'Afficher les sous-étapes',
      transactionId: 'Identifiant de transaction',
      urlInput: 'Entrez l\'URL du certificat',
      urlInputPlaceholder: 'URL du certificat',
      verificationStepProgress: 'Vérification en cours...',
      verify: 'Vérifier',
      verifyAgain: 'Vérifier de nouveau',
      verifyOther: 'Vérifier un autre certificat',
      viewRecord: 'Voir le certificat'
    },
    date: {
      months: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sept', 'Oct', 'Nov', 'Déc'],
      pattern: 'DD MM YYYY'
    }
  };

  var it$1 = {
    errors: {
      errorLabel: 'Errore',
      invalidBlockcerts: 'Non è una definizione valida di Blockcerts.',
      invalidBlockcertsUrl: 'Non è un URL di certificato valido.',
      invalidFormatDragAndDrop: 'Sono accettati solo file JSON',
      invalidUrl: 'Questo non sembra essere un URL valido.',
      noDownloadLink: 'Link per il download non fornito!',
      noMetadata: 'Nessun Metadata specificato per questo record',
      noShareUrl: 'Non c\'è un URL da condividere!',
      noTransactionId: 'Nessun ID transazione'
    },
    text: {
      brandName: 'Blockcerts',
      blockcertsHint: 'Visita il sito Web Blockcerts',
      by: 'da',
      certified: 'Certificato da',
      closeButton: 'Fai clic per chiudere',
      downloadLink: 'Scarica il Record in formato JSON',
      dragAndDropHint: '(puoi anche trascinare il file).',
      fileUpload: 'Scegli il file JSON',
      issued: 'Rilasciato il',
      issueDate: 'Data',
      issuerName: 'Organizzazione Issuer',
      issuerPublicKey: 'Chiave pubblica del Issuer',
      item: 'Elemento',
      itemPlural: 'Elementi',
      metadataButton: 'Visualizza Metadata',
      metadataTitle: 'Metadata del Certificato',
      motto: 'Blockcerts, The Open Standard for Blockchain Credentials',
      recipient: 'Titolare',
      share: 'Condividi',
      shareButton: 'Condividi sui Social Network',
      signed: 'Firmato da',
      substepsListClose: 'Nascondi',
      substepsListHint: 'Mostra gli step secondari',
      transactionId: 'ID transazione',
      urlInput: 'Inserisci l\'URL del certificato',
      urlInputPlaceholder: 'URL del certificato',
      verificationStepProgress: 'Step di verifica...',
      verify: 'Verifica',
      verifyAgain: 'Verifica di nuovo',
      verifyOther: 'Verifica un altro record',
      viewRecord: 'Visualizza il Record'
    },
    date: {
      months: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
      pattern: 'DD MM YYYY'
    }
  };

  var zh$1 = {
    errors: {
      errorLabel: '错误',
      invalidBlockcerts: '不是有效的凭证URL。请与该凭证的发布者或被授予者确认。',
      invalidBlockcertsUrl: '不是有效的凭证URL。',
      invalidFormatDragAndDrop: '仅接受JSON文件',
      invalidUrl: '该URL不是有效的URL。',
      noDownloadLink: '没有用于下载的URL!',
      noMetadata: '该记录没有元数据信息',
      noShareUrl: '没有用于分享的URL!',
      noTransactionId: '没有交易ID'
    },
    text: {
      brandName: 'Blockcerts',
      blockcertsHint: '访问Blockcerts官网',
      by: '于',
      certified: '认证于',
      closeButton: '点击关闭',
      downloadLink: '下载JSON格式的记录',
      dragAndDropHint: '（您也可以拖拽证书文件到此处）',
      fileUpload: '选择证书JSON文件',
      issued: '发布于',
      issueDate: '发布日期',
      issuerName: '发布者',
      issuerPublicKey: '发布者公钥',
      item: 'Item',
      itemPlural: '项目',
      metadataButton: '查看元数据',
      metadataTitle: '证书元数据',
      motto: 'Blockcerts, The Open Standard for Blockchain Credentials',
      recipient: '被授予者',
      share: '分享于',
      shareButton: '分享到社交网络',
      signed: '签名于',
      substepsListClose: '隐藏',
      substepsListHint: '展开/隐藏子项目',
      transactionId: '交易ID',
      urlInput: '输入证书URL',
      urlInputPlaceholder: '证书URL',
      verificationStepProgress: '验证步骤...',
      verify: '验证',
      verifyAgain: '重新验证',
      verifyOther: '验证其它记录',
      viewRecord: '验证记录'
    },
    date: {
      months: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
      pattern: 'YYYY年MM月DD日'
    }
  };

  const i18n = {
    en: en$1,
    es: es$1,
    fr: fr$1,
    it: it$1,
    zh: zh$1
  };

  function getSupportedLanguages () {
    return Object.keys(i18n);
  }

  function getLanguagesTexts () {
    return i18n;
  }

  function getText (group, item = '', usePlural = false, count = 0) {
    if (!group) {
      return '';
    }

    if (group.indexOf('.') > -1) {
      const splittedGroup = group.split('.');
      group = splittedGroup[0];
      item = splittedGroup[1];
    }

    if (!item) {
      return '';
    }

    if (usePlural && count > 1) {
      item += 'Plural';
    }

    const i18n = getLanguagesTexts();

    if (!i18n[currentLocale.locale]) {
      return '[missing locale data]';
    }

    if (!i18n[currentLocale.locale][group]) {
      return '[missing locale group data]';
    }

    if (!i18n[currentLocale.locale][group][item]) {
      return '[missing locale item data]';
    }

    return i18n[currentLocale.locale][group][item] || '';
  }

  function replaceMonth (pattern, monthIndex) {
    const months = getText('date', 'months');
    return pattern.replace('MM', months[monthIndex]);
  }

  function replaceDay (pattern, day) {
    return pattern.replace('DD', day);
  }

  function replaceYear (pattern, year) {
    return pattern.replace('YYYY', year);
  }

  function getDateFormat (date) {
    const pattern = getText('date', 'pattern');
    const objDate = new Date(date);

    let formattedDate = replaceMonth(pattern, objDate.getMonth());
    formattedDate = replaceDay(formattedDate, objDate.getDate());
    formattedDate = replaceYear(formattedDate, objDate.getFullYear());
    return formattedDate;
  }

  function getCertificateDefinition (state) {
    return state.certificateDefinition;
  }

  function getIssuedOn (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.issuedOn;
    }

    return '';
  }

  function getIssueDate (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return getDateFormat(getIssuedOn(state));
    }

    return '';
  }

  function getRecipientName (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.recipientFullName;
    }

    return '';
  }

  function getCertificateTitle (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.name;
    }

    return '';
  }

  function getIssuerName (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.issuer.name;
    }

    return '';
  }

  function getIssuerLogo (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.issuer.image;
    }

    return '';
  }

  function getDisplayHTML (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return sanitize(certificateDefinition.certificateJson.displayHtml);
    }

    return '';
  }

  function getRecordLink (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition && isValidUrl(certificateDefinition.recordLink)) {
      return certificateDefinition.recordLink;
    }

    return '';
  }

  function getDownloadLink (state) {
    const url = getRecordLink(state);

    if (url) {
      return domain.certificates.download(url);
    }

    return '';
  }

  function getMetadataJson (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      try {
        return JSON.parse(certificateDefinition.metadataJson);
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  function getTransactionLink (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.transactionLink;
    }

    return '';
  }

  function getTransactionId (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.transactionId;
    }

    return '';
  }

  function getChain (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      const { chain } = certificateDefinition;
      return chain.name;
    }

    return '';
  }

  function isTestChain (state) {
    const chain = getChain(state);

    return chain === 'Mocknet' || chain.indexOf('Testnet') > -1;
  }

  function getVerifiedSteps (state) {
    return state.verifiedSteps || [];
  }

  function getParentStep (state, parentStepCode) {
    return getVerifiedSteps(state).find(step => step.code === parentStepCode);
  }

  function getHasError (state) {
    return getVerifiedSteps(state).some(s => s.status === VERIFICATION_STATUS.FAILURE);
  }

  /* V1 SPECIFIC */
  function getCertificateImage (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.certificateImage;
    }

    return '';
  }

  function getCertificateSubtitle (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.subtitle;
    }

    return '';
  }

  function getCertificateDescription (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.description;
    }

    return '';
  }

  function getCertificateSignatures (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.signatureImage;
    }

    return '';
  }

  function getCertificateSeal (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.sealImage;
    }

    return '';
  }

  function getFinalStep (state) {
    return state.finalStep;
  }

  function getIssuerPublicKey (state) {
    const certificateDefinition = getCertificateDefinition(state);

    if (certificateDefinition) {
      return certificateDefinition.certificateJson.verification.publicKey;
    }

    return '';
  }

  function updateSubstepIn (parent, substep) {
    const substepIndex = parent.subSteps.findIndex(s => s.code === substep.code);
    parent.subSteps[substepIndex] = substep;
  }

  function stepVerified (state, action) {
    const { parentStep } = action.payload;
    const storedParentState = getParentStep(state, parentStep);
    updateSubstepIn(storedParentState, action.payload);

    return state;
  }

  function updateParentStepStatus (state, action) {
    const { parentStepCode, status } = action.payload;

    const parentStep = getParentStep(state, parentStepCode);

    parentStep.status = status;

    return state;
  }

  function clearVerifiedSteps (state, action) {
    const { resetSteps } = action.payload;

    return {
      ...state,
      verifiedSteps: resetSteps
    };
  }

  function setErrorMessage (state, action) {
    const { errorMessage } = action.payload;

    return {
      ...state,
      errorMessage
    };
  }

  function initialize (state, action) {
    return {
      ...state,
      ...action.payload.options
    };
  }

  function resetCertificateDefinition (state, action) {
    return {
      ...state,
      certificateDefinition: action.payload.definition
    };
  }

  function updateVerificationStatus (state, action) {
    return {
      ...state,
      verificationStatus: action.payload.status
    };
  }

  function updateFinalStep (state, action) {
    return {
      ...state,
      finalStep: action.payload.finalStep
    };
  }

  function showVerificationModal (state, action) {
    return {
      ...state,
      showVerificationModal: action.payload.showVerificationModal
    };
  }

  function app (state, action) {
    switch (action.type) {
      case CLEAR_VERIFIED_STEPS:
        return clearVerifiedSteps(state, action);

      case INITIALIZE:
        return initialize(state, action);

      case UPDATE_CERTIFICATE_DEFINITION:
        return updateCertificateDefinition(state, action);

      case RESET_CERTIFICATE_DEFINITION:
        return resetCertificateDefinition(state, action);

      case UPDATE_CERTIFICATE_URL:
        return updateCertificateUrl(state, action);

      case UPDATE_PARENT_STEP_STATUS:
        return updateParentStepStatus(state, action);

      case VALIDATE_URL_INPUT:
        return validateUrlInput(state, action);

      case SET_ERROR_MESSAGE:
        return setErrorMessage(state, action);

      case SHOW_VERIFICATION_MODAL:
        return showVerificationModal(state, action);

      case STEP_VERIFIED:
        return stepVerified(state, action);

      case UPDATE_VERIFICATION_STATUS:
        return updateVerificationStatus(state, action);

      case UPDATE_FINAL_STEP:
        return updateFinalStep(state, action);

      default:
        return state;
    }
  }

  const CARD = 'card';
  const FULL = 'full';
  const FULLSCREEN = 'fullscreen';

  const BRIGHT = 'bright';
  const DARK = 'dark';

  // TODO: implement typescript
  // TODO: export this typing from cert-verifier-js
  // export interface IFinalStep = {
  //   description: string;
  //   label: string;
  //   linkText?: string;
  // }

  function getInitialState (apiConfiguration = {}) {
    return {
      input: {},
      verifiedSteps: [],
      finalStep: null,
      verificationStatus: VERIFICATION_STATUS.DEFAULT,
      showVerificationModal: false,
      displayMode: CARD,
      theme: BRIGHT,
      ...apiConfiguration
    };
  }

  function configureStore (initialState = getInitialState()) {
    const middlewares = [thunk];

    return createStore(
      app,
      initialState,
      applyMiddleware(...middlewares)
    );
  }

  const store = configureStore();

  function connector (component, { mapDispatchToProps = {}, mapStateToProps = () => {}, ownProps = {} }) {
    return class extends connect(store)(LitElement) {
      mapDispatchToProps () {
        return bindActionCreators(mapDispatchToProps, store.dispatch);
      }

      mapStateToProps () {
        return mapStateToProps(store.getState());
      }

      static get properties () {
        return ownProps;
      }

      _render (_props) {
        const componentProps = {
          ...this.mapDispatchToProps(),
          ...this.mapStateToProps(),
          ..._props
        };

        return html`${component(componentProps)}`;
      }

      _stateChanged (state) {
        this._requestRender();
      }
    };
  }

  function setErrorMessage$1 (errorMessage) {
    return {
      type: SET_ERROR_MESSAGE,
      payload: {
        errorMessage
      }
    };
  }

  function validateUrlInput$1 (isValid) {
    return function (dispatch) {
      dispatch({
        type: VALIDATE_URL_INPUT,
        payload: {
          isValid
        }
      });

      const errorMessage = isValid ? null : 'errors.invalidUrl';
      dispatch(setErrorMessage$1(errorMessage));
    };
  }

  const CERTIFICATE_LOAD = 'certificate-load';
  const CERTIFICATE_VERIFY = 'certificate-verify';
  const CERTIFICATE_SHARE = 'certificate-share';

  function oneChildIsSuccess (parent) {
    return parent.subSteps.some(s => s.status === VERIFICATION_STATUS.SUCCESS);
  }

  function allChildrenAreSuccess (parent) {
    return parent.subSteps.every(s => s.status === VERIFICATION_STATUS.SUCCESS);
  }

  function oneChildIsFailure (parent) {
    return parent.subSteps.some(s => s.status === VERIFICATION_STATUS.FAILURE);
  }

  function updateParentStepStatus$1 (parentStepCode) {
    return function (dispatch, getState) {
      if (parentStepCode == null) {
        return;
      }

      const state = getState();

      const parent = getParentStep(state, parentStepCode);
      let status = parent.status;

      if (status === VERIFICATION_STATUS.DEFAULT && oneChildIsSuccess(parent)) {
        status = VERIFICATION_STATUS.STARTED;
      }

      if (status !== VERIFICATION_STATUS.DEFAULT && allChildrenAreSuccess(parent)) {
        status = VERIFICATION_STATUS.SUCCESS;
      }

      if (oneChildIsFailure(parent)) {
        status = VERIFICATION_STATUS.FAILURE;
      }

      dispatch({
        type: UPDATE_PARENT_STEP_STATUS,
        payload: {
          parentStepCode,
          status
        }
      });
    };
  }

  class StepQueue {
    constructor () {
      this.queue = [];
      this.dispatchCb = null;
      this.isExecuting = false;
      this.intervalId = null;
      this.dispatchNext = this.dispatchNext.bind(this);
    }

    registerCb (dispatchCb) {
      this.dispatchCb = dispatchCb;
    }

    push (step) {
      this.queue.push(step);
    }

    dispatchNext () {
      const step = this.queue.shift();
      if (step) {
        this.dispatchCb(step);
      } else if (this.intervalId) {
        this.isExecuting = false;
        clearInterval(this.intervalId);
      }
    }

    execute () {
      if (!this.isExecuting && this.queue.length) {
        this.isExecuting = true;
        this.intervalId = setInterval(this.dispatchNext, 200);
      }
    }
  }

  const stepQueueFactory = () => {
    return new StepQueue();
  };

  const stepQueue = stepQueueFactory();

  function dispatchActionsFactory (dispatch) {
    return function dispatchActions (step) {
      dispatch({
        type: STEP_VERIFIED,
        payload: step
      });

      dispatch(updateParentStepStatus$1(step.parentStep));
    };
  }

  function stepVerified$1 (stepDefinition) {
    return function (dispatch, getState) {
      const state = getState();

      const parentStepCode = state.verifiedSteps.find(step => step.subSteps.some(substep => substep.code === stepDefinition.code)).code;

      const step = {
        ...stepDefinition,
        ...stepDefinition.errorMessage && {
          errorMessage: stepDefinition.errorMessage
        },
        parentStep: parentStepCode
      };

      const dispatchActions = dispatchActionsFactory(dispatch);

      if (!stepQueue.dispatchCb) {
        // register only once
        stepQueue.registerCb(dispatchActions);
      }
      stepQueue.push(step);
      stepQueue.execute();
    };
  }

  function clearVerifiedSteps$1 () {
    return function (dispatch, getState) {
      const certificateDefinition = getCertificateDefinition(getState());
      let resetSteps = [];

      if (certificateDefinition) {
        resetSteps = domain.certificates.initializeVerificationSteps(certificateDefinition);
      }

      dispatch({
        type: CLEAR_VERIFIED_STEPS,
        payload: {
          resetSteps
        }
      });
    };
  }

  function updateVerificationStatus$1 (status) {
    return {
      type: UPDATE_VERIFICATION_STATUS,
      payload: {
        status
      }
    };
  }

  function getDisableAutoVerify (state) {
    return state.disableAutoVerify;
  }

  function getDisableVerify (state) {
    return state.disableVerify;
  }

  function getAllowDownload (state) {
    return state.allowDownload;
  }

  function getAllowSocialShare (state) {
    return state.allowSocialShare;
  }

  function getShowMetadata (state) {
    return state.showMetadata;
  }

  function getDisplayMode (state) {
    return state.displayMode;
  }

  function getTheme (state) {
    return state.theme;
  }

  function getLocale (state) {
    return state.locale;
  }

  // TODO: move this responsibility to cert-verifier-js
  function updateFinalStep$1 (finalStep) {
    if (typeof finalStep === 'string') {
      finalStep = {
        label: finalStep
      };
    }
    return {
      type: UPDATE_FINAL_STEP,
      payload: {
        finalStep
      }
    };
  }

  function verifyCertificate () {
    return async function (dispatch, getState) {
      const state = getState();

      if (getDisableVerify(state)) {
        console.warn('Verification is disabled');
        return;
      }

      dispatch({
        type: VERIFY_CERTIFICATE
      });

      dispatch(updateVerificationStatus$1(VERIFICATION_STATUS.STARTED));

      dispatch(clearVerifiedSteps$1());
      const certificateDefinition = getCertificateDefinition(state);

      if (certificateDefinition) {
        domain.events.dispatch(CERTIFICATE_VERIFY, certificateDefinition);
        const finalStep = await certificateDefinition.verify(stepDefinition => {
          dispatch(stepVerified$1(stepDefinition));
        });

        dispatch(updateFinalStep$1(finalStep.message));
        dispatch(updateVerificationStatus$1(finalStep.status));
      }
    };
  }

  function showVerificationModal$1 (show) {
    return {
      type: SHOW_VERIFICATION_MODAL,
      payload: {
        showVerificationModal: show
      }
    };
  }

  function updateCertificateDefinition$1 (definition) {
    return async function (dispatch, getState) {
      const locale = getLocale(getState());
      const { certificateDefinition, errorMessage } = domain.certificates.parse(definition, { locale });

      dispatch(setErrorMessage$1(errorMessage));

      dispatch({
        type: UPDATE_CERTIFICATE_DEFINITION,
        payload: {
          certificateDefinition
        }
      });

      domain.events.dispatch(CERTIFICATE_LOAD, certificateDefinition);

      if (certificateDefinition != null) {
        await dispatch(autoVerify());
      }
    };
  }

  function autoVerify () {
    return async function (dispatch, getState) {
      if (!getDisableAutoVerify(getState())) {
        dispatch({
          type: AUTO_VERIFY
        });
        dispatch(showVerificationModal$1(true));
      }
      await dispatch(verifyCertificate());
    };
  }

  function updateCertificateUrl$1 (url) {
    return async function (dispatch) {
      const isUrlValid = isValidUrl(url) || isValidLocalPath(url);
      dispatch(validateUrlInput$1(isUrlValid));

      if (!isUrlValid) {
        return null;
      }

      dispatch({
        type: UPDATE_CERTIFICATE_URL,
        payload: {
          url
        }
      });

      const retrievedData = await domain.certificates.retrieve(url);

      if (retrievedData.certificateDefinition) {
        dispatch(updateCertificateDefinition$1(retrievedData.certificateDefinition));
      } else {
        dispatch(setErrorMessage$1(retrievedData.errorMessage));
      }
    };
  }

  const dashes = /(-\w)/g;
  const convertToUpperCase = matches => matches[1].toUpperCase();

  function snakeToCamelCase (string) {
    return string.replace(dashes, convertToUpperCase);
  }

  const APIKeys = {
    src: String,
    'disable-auto-verify': Boolean,
    'disable-verify': Boolean,
    'allow-download': Boolean,
    'allow-social-share': Boolean,
    'display-mode': String,
    'show-metadata': Boolean,
    theme: DARK | BRIGHT,
    locale: String
  };

  const APICamelCase = Object.keys(APIKeys)
    .map(snakeToCamelCase)
    .reduce((acc, key) => {
      acc[key] = APIKeys[key];
      return acc;
    }, {});

  function getAPIOptions (options) {
    return Object.keys(APICamelCase)
      .reduce((acc, key) => {
        if (options[key]) {
          acc[key] = options[key];
        }
        return acc;
      }, {});
  }

  function setLocaleValidCase (locale) {
    const localeParts = locale.split('-');
    return localeParts.length > 1
      ? `${localeParts[0].toLowerCase()}-${localeParts[1].toUpperCase()}`
      : localeParts[0].toLowerCase();
  }

  function ensureIsSupported (locale) {
    let isSupported;

    const supportedLanguages = getSupportedLanguages().map(language => language.toLowerCase());

    // Test RFC 3066 language
    isSupported = supportedLanguages.indexOf(locale.toLowerCase()) > -1;

    // Test RFC 3066 language-country
    if (!isSupported) {
      const isoLocale = locale.substr(0, 2).toLowerCase();
      const indexIsoLocale = supportedLanguages.map(language => language.split('-')[0]).indexOf(isoLocale);
      isSupported = indexIsoLocale > -1;

      if (isSupported) {
        locale = supportedLanguages[indexIsoLocale];
      }
    }

    if (!isSupported) {
      locale = defaultLocale;
    }

    // Get default locale otherwise
    return setLocaleValidCase(locale);
  }

  function setLocale (locale) {
    if (locale === 'auto' || !locale) {
      locale = detectLocale();
    }

    currentLocale.locale = ensureIsSupported(locale);
  }

  function initialize$1 (options = {}) {
    return function (dispatch) {
      const APIOptions = getAPIOptions(options);

      dispatch({
        type: INITIALIZE,
        payload: {
          options: APIOptions
        }
      });

      if (APIOptions.src) {
        dispatch(updateCertificateUrl$1(APIOptions.src));
      }

      setLocale(APIOptions.locale);
    };
  }

  var CSS = html`<style>.buv-c-input{font-size:15px;color:#031532;border-radius:2px 0 0 2px;padding:12px 15px;background-color:#f3f4f5;border:solid 1px rgba(3,21,50,0.13);box-sizing:border-box;width:100%}.buv-c-input.is-invalid{border:2px solid #f00}.buv-c-input::-moz-placeholder{font-family:'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;color:rgba(3,21,50,0.3);letter-spacing:-.25px}.buv-c-input::-webkit-input-placeholder{font-family:'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;color:rgba(3,21,50,0.3);letter-spacing:-.25px}.buv-c-input:-moz-placeholder{font-family:'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;color:rgba(3,21,50,0.3);letter-spacing:-.25px}.buv-c-input:-ms-input-placeholder{font-family:'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;color:rgba(3,21,50,0.3);letter-spacing:-.25px}.buv-u-visually-hidden{position:absolute !important;clip:rect(1px 1px 1px 1px);clip:rect(1px, 1px, 1px, 1px);padding:0 !important;border:0 !important;height:1px !important;width:1px !important;overflow:hidden}
</style>`;

  const Input = ({ onInput = () => {}, isValid = true } = {}) => {
    // TODO: better handle this dynamic class (cf npm classnames)
    const inputClass = `buv-c-input ${isValid ? '' : 'is-invalid'}`;

    return html`
    ${CSS}
    <label 
      for='certificate-json-url'
      class='buv-u-visually-hidden'>${getText('text.urlInput')}</label>
    <input 
      type='text'
      id='certificate-json-url'
      placeholder='${getText('text.urlInputPlaceholder')}'
      class$='${inputClass}'
      on-input='${(e) => { onInput(e.target.value); }}'
    />
  `;
  };

  function getUrlIsValid (state) {
    if (typeof state.input.isValid === 'undefined') {
      return true;
    }
    return state.input.isValid;
  }

  const mapDispatchToProps = {
    onInput: updateCertificateUrl$1
  };

  const mapStateToProps = (state) => ({
    isValid: getUrlIsValid(state)
  });

  const InputContainer = connector(Input, { mapDispatchToProps, mapStateToProps });

  window.customElements.define('buv-input', InputContainer);

  var CSS$1 = html`<style>.buv-c-verify-button{background-color:#2ab27b;border-radius:0 2px 2px 0;color:#fff;cursor:pointer;display:block;font-size:15px;font-weight:400;padding:12px 38px;border:1px solid #2ab27b;width:120%}.buv-c-verify-button__label{cursor:pointer}.buv-c-verify-button--hollow{background:#fff;color:#2ab27b;font-weight:100;text-transform:uppercase;padding:12px 30px;font-size:13px}.buv-c-verify-button--link{background:none;color:#031532;border:0;text-decoration:underline;padding:0;margin-top:5px;font-size:13px}.buv-c-verify-button.is-disabled{pointer-events:none}
</style>`;

  function VerifyButton ({ isHollow = false, isDisabled = false, onClick = () => {}, type = '' } = {}) {
    const buttonClass = [
      'buv-c-verify-button',
      isHollow ? 'buv-c-verify-button--hollow' : '',
      isDisabled ? 'is-disabled' : '',
      type === 'link' ? 'buv-c-verify-button--link' : ''
    ].join(' ');

    return html`
    ${CSS$1}
    <button class$='${buttonClass}' on-click='${onClick}' disabled?='${isDisabled}'>
      <label class='buv-c-verify-button__label'><slot>${getText('text.verify')}</slot></label>
    </button>
  `;
  }

  function startVerificationProcess () {
    return function (dispatch, getState) {
      dispatch({
        type: START_VERFICATION_PROCESS
      });

      dispatch(showVerificationModal$1(true));
      dispatch(verifyCertificate());
    };
  }

  const mapDispatchToProps$1 = {
    onClick: startVerificationProcess
  };

  const mapStateToProps$1 = (state) => ({
    isDisabled: getDisableVerify(state) || !getCertificateDefinition(state)
  });

  const ownProps = {
    isHollow: Boolean,
    type: String
  };

  const VerifyButtonContainer = connector(VerifyButton, { mapDispatchToProps: mapDispatchToProps$1, mapStateToProps: mapStateToProps$1, ownProps });

  window.customElements.define('buv-verify-button', VerifyButtonContainer);

  var CSS$2 = html`<style>.buv-c-certificate-input{display:flex;width:100%;padding:40px 30px;background-color:rgba(255,255,255,0.1);border:1px solid rgba(0,0,0,0.1);box-sizing:border-box}@media only screen and (max-width: 600px){.buv-c-certificate-input{flex-direction:column;grid-row-gap:10px;height:162px;padding:30px;justify-content:space-between}}.buv-c-certificate-input__input{width:100%}
</style>`;

  const CertificateInput = ({ showInput = true }) => {
    if (!showInput) {
      return null;
    }

    return html`
    ${CSS$2}
    <section class="buv-c-certificate-input  buv-qa-certificate-input">
        <buv-input class="buv-c-certificate-input__input"></buv-input><buv-verify-button></buv-verify-button>     
    </section>
`;
  };

  const mapStateToProps$2 = (state) => ({
    showInput: !getCertificateDefinition(state)
  });

  const CertificateInputContainer = connector(CertificateInput, { mapStateToProps: mapStateToProps$2 });

  window.customElements.define('buv-certificate-input', CertificateInputContainer);

  var CSS$3 = html`<style>.buv-o-button-link{display:block;cursor:pointer;border:0;background-color:transparent}.buv-o-button-link__label{display:block;font-size:13px;cursor:pointer}.buv-o-button-link.is-disabled,.buv-o-button-link:disabled{cursor:help;opacity:.6}.buv-c-download-link{text-decoration:none;color:currentColor}.buv-c-download-link--icon{background-image:url("data:image/svg+xml,%3Csvg%20version%3D%221.1%22%20id%3D%22Capa%5f1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%20x%3D%220px%22%20y%3D%220px%22%0A%09%20width%3D%22433.5px%22%20height%3D%22433.5px%22%20fill%3D%22%236e7e8e%22%20viewBox%3D%220%200%20433.5%20433.5%22%20style%3D%22enable-background%3Anew%200%200%20433.5%20433.5%3B%22%20xml%3Aspace%3D%22preserve%22%0A%09%3E%3Cg%3E%3Cg%20id%3D%22file-download%22%3E%3Cpath%20d%3D%22M395.25%2C153h-102V0h-153v153h-102l178.5%2C178.5L395.25%2C153z%20M38.25%2C382.5v51h357v-51H38.25z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E");width:17px;height:17px;background-size:17px}.buv-c-download-link.is-disabled{pointer-events:none}.buv-u-visually-hidden{position:absolute !important;clip:rect(1px 1px 1px 1px);clip:rect(1px, 1px, 1px, 1px);padding:0 !important;border:0 !important;height:1px !important;width:1px !important;overflow:hidden}
</style>`;

  function DownloadLink ({ downloadLink, display = '' }) {
    const isPlainText = display === 'plaintext';
    const info = downloadLink ? getText('text.downloadLink') : getText('errors.noDownloadLink');

    // TODO: better handle this dynamic class (cf npm classnames)
    const classes = [
      'buv-c-download-link',
      'buv-o-button-link',
      !downloadLink ? 'is-disabled' : '',
      isPlainText ? '' : 'buv-c-download-link--icon'
    ].join(' ');

    return html`
    ${CSS$3}
    <a class$='${classes}' href='${downloadLink}' title$='${info}' aria-disabled?='${!downloadLink}'>
      <span class$='${isPlainText ? 'buv-o-button-link__label' : 'buv-u-visually-hidden'}'>${info}</span>
    </a>`;
  }

  const mapStateToProps$3 = (state) => ({
    downloadLink: getDownloadLink(state)
  });

  const ownProps$1 = {
    display: String
  };

  const DownloadLinkContainer = connector(DownloadLink, { mapStateToProps: mapStateToProps$3, ownProps: ownProps$1 });

  window.customElements.define('buv-download-link', DownloadLinkContainer);

  const SEPARATOR = '.';

  /** getValueFrom
   * parses an object to find the value of the entry
   * @param list: Object
   * @param entry: String. Is the form of 'path.to.my.key'
   * @returns {*}
   *    if list.path.to.my.key exists, will return its value
   *    otherwise undefined
   */

  function getValueFrom (list, entry) {
    const entryPath = entry.split(SEPARATOR);

    function getListSubkey (list, key, path) {
      const nextIndex = path.indexOf(key) + 1;
      const nextKey = path[nextIndex];

      if (!nextKey) {
        return list[key];
      }

      if (Object.prototype.hasOwnProperty.call(list[key], nextKey)) {
        return getListSubkey(list[key], nextKey, path);
      }
    }

    return getListSubkey(list, entryPath[0], entryPath);
  }

  var CSS$4 = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-o-button-link{display:block;cursor:pointer;border:0;background-color:transparent}.buv-o-button-link__label{display:block;font-size:13px;cursor:pointer}.buv-o-button-link.is-disabled,.buv-o-button-link:disabled{cursor:help;opacity:.6}.buv-o-overlay{z-index:100;box-shadow:0 0 30px rgba(0,0,0,0.25);background-color:#fff}.buv-c-metadata-container{box-sizing:border-box;padding:47px;height:100%;width:400px;position:fixed;top:0;right:-400px;display:flex;flex-direction:column}.buv-c-metadata-container__close-button{top:52px;right:47px}.buv-c-metadata-container__title{border-bottom:solid 1px #e8e9eb;padding-bottom:38px;font-weight:300;margin:0 0 38px}.buv-c-metadata-link{padding:0}.buv-c-metadata-link--icon{background-image:url("data:image/svg+xml,%3Csvg%20version%3D%221.1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%20x%3D%220px%22%20y%3D%220px%22%0A%0A%09%20width%3D%22512px%22%20fill%3D%22%236e7e8e%22%20height%3D%22512px%22%20viewBox%3D%220%200%20512%20512%22%20enable-background%3D%22new%200%200%20512%20512%22%20xml%3Aspace%3D%22preserve%22%3E%0A%0A%3Cpath%20id%3D%22info-2-icon%22%20d%3D%22M255.998%2C90.001c91.74%2C0%2C166.002%2C74.241%2C166.002%2C165.998c0%2C91.741-74.245%2C166-166.002%2C166%0A%0A%09c-91.74%2C0-165.998-74.243-165.998-166C90%2C164.259%2C164.243%2C90.001%2C255.998%2C90.001%20M255.998%2C50.001%0A%0A%09C142.229%2C50.001%2C50%2C142.229%2C50%2C255.999c0%2C113.771%2C92.229%2C206%2C205.998%2C206c113.771%2C0%2C206.002-92.229%2C206.002-206%0A%0A%09C462%2C142.229%2C369.77%2C50.001%2C255.998%2C50.001L255.998%2C50.001z%20M285.822%2C367.567h-57.646V230.6h57.646V367.567z%20M257%2C202.268%0A%09c-17.522%2C0-31.729-14.206-31.729-31.73c0-17.522%2C14.206-31.729%2C31.729-31.729c17.524%2C0%2C31.728%2C14.206%2C31.728%2C31.729%0A%09C288.728%2C188.062%2C274.524%2C202.268%2C257%2C202.268z%22%2F%3E%3C%2Fsvg%3E");width:22px;height:22px;background-size:22px}.buv-c-metadata-list{margin:0;overflow:auto;flex:1}.buv-c-metadata-list__title{color:#999;line-height:15px}.buv-c-metadata-list__detail{margin:0 0 20px}.buv-c-metadata-list__detail-text{white-space:pre-wrap;word-wrap:break-word;font:inherit;margin:0}.buv-u-visually-hidden{position:absolute !important;clip:rect(1px 1px 1px 1px);clip:rect(1px, 1px, 1px, 1px);padding:0 !important;border:0 !important;height:1px !important;width:1px !important;overflow:hidden}.buv-u-slide-from-right{opacity:0;-webkit-transition:right ease .5s, opacity .2s;-moz-transition:right ease .5s, opacity .2s;-ms-transition:right ease .5s, opacity .2s;-o-transition:right ease .5s, opacity .2s;transition:right ease .5s, opacity .2s}.buv-u-slide-from-right.is-active{right:0;opacity:1}
</style>`;

  var CSS$5 = html`<style>.buv-c-close-button{display:inline-block;overflow:hidden;cursor:pointer;border:0;width:20px;height:20px;position:absolute;background-color:transparent}.buv-c-close-button::before,.buv-c-close-button::after{content:'';position:absolute;height:2px;width:100%;top:50%;left:0;margin-top:-1px;background:#000}.buv-c-close-button::before{transform:rotate(45deg)}.buv-c-close-button::after{transform:rotate(-45deg)}.buv-c-close-button--big{transform:scale(3)}.buv-c-close-button--hairline::before,.buv-c-close-button--hairline::after{height:1px}.buv-c-close-button--thick::before,.buv-c-close-button--thick::after{height:4px;margin-top:-2px}.buv-c-close-button--black::before,.buv-c-close-button--black::after{height:8px;margin-top:-4px}.buv-c-close-button--heavy::before,.buv-c-close-button--heavy::after{height:12px;margin-top:-6px}.buv-c-close-button--pointy::before,.buv-c-close-button--pointy::after{width:200%;left:-50%}.buv-c-close-button--rounded::before,.buv-c-close-button--rounded::after{border-radius:5px}.buv-c-close-button--blades::before,.buv-c-close-button--blades::after{border-radius:5px 0}.buv-c-close-button--warp::before,.buv-c-close-button--warp::after{border-radius:120% 0}.buv-c-close-button--fat::before,.buv-c-close-button--fat::after{border-radius:100%}.buv-c-close-button--position{position:relative}.buv-u-visually-hidden{position:absolute !important;clip:rect(1px 1px 1px 1px);clip:rect(1px, 1px, 1px, 1px);padding:0 !important;border:0 !important;height:1px !important;width:1px !important;overflow:hidden}
</style>`;

  const CloseButton = ({ onClick = () => {}, className = '' } = {}) => {
    const classes = `buv-c-close-button  buv-c-close-button--hairline  ${className || 'buv-c-close-button--position'} `;
    return html`
    ${CSS$5}
    <button onclick='${onClick}' class$='${classes}'>
      <label class='buv-u-visually-hidden'>${getText('text.closeButton')}</label>
    </button>
  `;
  };

  /** FormattedMetadataItem
   * return link for uri, email, phone number to apply in Metadata viewer
   * @param metadataObject: the object to be rendered.
   * @param value: String. link value
   * @returns string
   */

  function FormattedMetadataItem (metadataObject, value) {
    const title = metadataObject.title;
    const type = metadataObject.type[0];
    const format = metadataObject.format;

    const titleHtml = html`<dt class='buv-c-metadata-list__title'>${title}</dt>`;

    let useTargetBlank = false;
    let hrefValue = '';
    let linkWrap = value;
    if (type === 'string') {
      switch (format) {
        case 'uri':
          useTargetBlank = true;
          hrefValue = value;
          break;
        case 'email':
          hrefValue = `mailto:${value}`;
          break;
        case 'phoneNumber':
          hrefValue = `tel:${value}`;
          break;
      }
    }

    if (hrefValue) {
      linkWrap = html`<a href="${hrefValue}" target="${useTargetBlank ? '_blank' : ''}" >${value}</a>`;
    }
    // TODO: check for types other than string

    const valueHtml = html`<dd class='buv-c-metadata-list__detail'>
            <pre class='buv-c-metadata-list__detail-text'>${linkWrap}</pre></dd>`;
    return html`${titleHtml}${valueHtml}`;
  }

  function getProperties (metadataList) {
    return metadataList.schema.properties.certificate.properties;
  }

  class Metadata extends LitElement {
    constructor () {
      super();
      this.isOpen = false;
      this.toggleOpen = this.toggleOpen.bind(this);
    }

    static get properties () {
      return {
        isOpen: Boolean,
        metadataList: Object,
        display: String
      };
    }

    toggleOpen () {
      this.isOpen = !this.isOpen;
    }

    _render ({ metadataList, display }) {
      // TODO: better handle this dynamic class (cf npm classnames)
      const panelClasses = [
        'buv-o-overlay',
        'buv-c-metadata-container',
        'buv-u-slide-from-right',
        this.isOpen ? 'is-active' : ''
      ].join(' ');

      let innerHTML = '';
      if (metadataList) {
        const properties = getProperties(metadataList);
        innerHTML = metadataList.displayOrder.map(entry => {
          const key = entry.split('.')[1]; // get key name
          const value = getValueFrom(metadataList, entry);
          return FormattedMetadataItem(properties[key], value);
        });
      }

      const isPlainText = display === 'plaintext';

      const info = metadataList ? getText('text.metadataButton') : getText('errors.noMetadata');
      const buttonClasses = [
        'buv-c-metadata-link',
        'buv-o-button-link',
        isPlainText ? '' : 'buv-c-metadata-link--icon'
      ].join(' ');

      return html`
      ${CSS$4}
      <button onclick='${this.toggleOpen}' 
        class$='${buttonClasses}' 
        disabled?='${!metadataList}' 
        aria-disabled?='${!metadataList}'
        title$=${info}>
        <label class$='${isPlainText ? 'buv-o-button-link__label' : 'buv-u-visually-hidden'}'>${info}</label>
      </button>
      <section class$='${panelClasses}'>
        <h1 class='buv-c-metadata-container__title'>${getText('text.metadataTitle')}</h1>
        ${CloseButton({
    onClick: this.toggleOpen,
    className: 'buv-c-metadata-container__close-button'
  })}
        <dl class='buv-c-metadata-list  buv-o-text-12'>${innerHTML}</dl>
      </section>
    `;
    }
  }

  window.customElements.define('buv-metadata-raw', Metadata);

  function MetadataWrapper (props) {
    return html`
    <buv-metadata-raw
      metadataList='${props.metadataList}'
      display='${props.display}'
    ></buv-metadata-raw>`;
  }

  const mapStateToProps$4 = (state) => ({
    metadataList: getMetadataJson(state)
  });

  const ownProps$2 = {
    display: String
  };

  const MetadataContainer = connector(MetadataWrapper, { mapStateToProps: mapStateToProps$4, ownProps: ownProps$2 });

  window.customElements.define('buv-metadata', MetadataContainer);

  var CSS$6 = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-o-button-link{display:block;cursor:pointer;border:0;background-color:transparent}.buv-o-button-link__label{display:block;font-size:13px;cursor:pointer}.buv-o-button-link.is-disabled,.buv-o-button-link:disabled{cursor:help;opacity:.6}.buv-o-link{cursor:pointer;text-decoration:none;color:currentColor}.buv-o-link__text--underline{border-bottom:1px solid}.buv-o-overlay{z-index:100;box-shadow:0 0 30px rgba(0,0,0,0.25);background-color:#fff}.buv-c-social-share-link{width:17px;height:17px;background-size:17px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' id='Capa_1' x='0px' y='0px' viewBox='0 0 473.932 473.932' style='enable-background:new 0 0 473.932 473.932;' xml:space='preserve' width='24px' height='24px'%3E%3Cg%3E%3Cg%3E%3Cpath d='M385.513,301.214c-27.438,0-51.64,13.072-67.452,33.09l-146.66-75.002 c1.92-7.161,3.3-14.56,3.3-22.347c0-8.477-1.639-16.458-3.926-24.224l146.013-74.656c15.725,20.924,40.553,34.6,68.746,34.6 c47.758,0,86.391-38.633,86.391-86.348C471.926,38.655,433.292,0,385.535,0c-47.65,0-86.326,38.655-86.326,86.326 c0,7.809,1.381,15.229,3.322,22.412L155.892,183.74c-15.833-20.039-40.079-33.154-67.56-33.154 c-47.715,0-86.326,38.676-86.326,86.369s38.612,86.348,86.326,86.348c28.236,0,53.043-13.719,68.832-34.664l145.948,74.656 c-2.287,7.744-3.947,15.79-3.947,24.289c0,47.693,38.676,86.348,86.326,86.348c47.758,0,86.391-38.655,86.391-86.348 C471.904,339.848,433.271,301.214,385.513,301.214z' fill='%236e7e8e'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E%0A")}.buv-c-social-share-modal{position:absolute;padding:38px 34px 34px;width:120px}.buv-c-social-share-modal__close-button{top:10px;right:10px}.buv-c-social-share-modal__list{list-style-type:none;margin:0;padding:0}.buv-c-social-share-modal__list-item{margin-bottom:24px}.buv-c-social-share-modal__list-item--plaintext{margin-bottom:5px;font-size:13px}.buv-c-social-share-modal__list-item:last-child{margin-bottom:0}.buv-c-social-share-modal__link{text-decoration:none}.buv-u-visually-hidden{position:absolute !important;clip:rect(1px 1px 1px 1px);clip:rect(1px, 1px, 1px, 1px);padding:0 !important;border:0 !important;height:1px !important;width:1px !important;overflow:hidden}
</style>`;

  class SocialShare extends LitElement {
    constructor () {
      super();
      this.isOpen = false;
      this.toggleOpen = this.toggleOpen.bind(this);
    }

    static get properties () {
      return {
        url: String,
        isOpen: String,
        onShare: Function,
        display: String
      };
    }

    toggleOpen () {
      this.isOpen = !this.isOpen;
    }

    sharingTemplate ({ url, onShare, display }) {
      if (!this.isOpen) {
        return;
      }

      if (!url) {
        return;
      }
      const isPlainText = display === 'plaintext';
      const socialServices = [
        {
          name: 'LinkedIn',
          shareUrl: `https://www.linkedin.com/shareArticle?url=${url}&mini=true`
        },
        {
          name: 'Facebook',
          shareUrl: `https://www.facebook.com/sharer/sharer.php?u=${url}`
        },
        {
          name: 'Twitter',
          shareUrl: `https://twitter.com/intent/tweet?url=${url}`
        }
      ];

      const innerHTMLList = socialServices.map(service =>
        html`<li class$='buv-c-social-share-modal__list-item  ${isPlainText ? 'buv-c-social-share-modal__list-item--plaintext' : ''}'>
            <a
              href='${service.shareUrl}'
              title='Share on ${service.name}'
              class='buv-o-link  buv-c-social-share-modal__link'
              target='_blank'
              onclick='${() => { onShare(service.name); }}'
            >
              <span>${getText('text.share')} ${service.name}</span>
            </a>
          </li>`
      );

      const list = html`<ul class='buv-c-social-share-modal__list'>
        ${innerHTMLList}
      </ul>`;

      if (isPlainText) {
        return list;
      }

      return html`<div class='buv-c-social-share-modal  buv-o-text-12  buv-o-overlay'>
      ${CloseButton({
    onClick: this.toggleOpen,
    className: 'buv-c-social-share-modal__close-button'
  })}
      ${list}
    </div>`;
    }

    sharingButton ({ url, display }) {
      const isPlainText = display === 'plaintext';
      if (isPlainText) {
        this.isOpen = true;
        return;
      }

      const hasUrl = !!url;
      const info = hasUrl ? getText('text.shareButton') : getText('text.noShareUrl');
      return html`<button 
        onclick='${this.toggleOpen}'
        class='buv-c-social-share-link  buv-o-button-link'
        disabled?='${!hasUrl}'
        aria-disabled?='${!hasUrl}'
        title$='${info}'
      >
      <label class='buv-u-visually-hidden'>${info}</label>
    </button>`;
    }

    _render (props) {
      return html`
      ${CSS$6}
      ${this.sharingButton(props)}
      ${this.sharingTemplate(props)}
    `;
    }
  }

  window.customElements.define('buv-social-share-raw', SocialShare);

  // wrap SocialShare in order to plug into Container
  // necessary trade-off to deal with class component in the store connector
  function SocialShareWrapper (props) {
    return html`
  <buv-social-share-raw
    url='${props.url}'
    onShare='${props.onShare}'
    display='${props.display}'
  ></buv-social-share-raw>`;
  }

  function shareSocialNetwork (socialNetwork) {
    return function (dispatch, getState) {
      const certificateDefinition = getCertificateDefinition(getState());

      domain.events.dispatch(CERTIFICATE_SHARE, certificateDefinition, { socialNetwork });

      dispatch({
        type: SHARE_SOCIAL_NETWORK
      });
    };
  }

  const mapDispatchToProps$2 = {
    onShare: shareSocialNetwork
  };

  const mapStateToProps$5 = (state) => ({
    url: getRecordLink(state)
  });

  const ownProps$3 = {
    display: String
  };

  const SocialShareContainer = connector(SocialShareWrapper, { mapDispatchToProps: mapDispatchToProps$2, mapStateToProps: mapStateToProps$5, ownProps: ownProps$3 });

  window.customElements.define('buv-social-share', SocialShareContainer);

  var CSS$7 = html`<style>.buv-c-action-menu{display:flex;align-items:center;padding:0}.buv-c-action-menu-item{flex-basis:30px}
</style>`;

  const ActionMenu = ({ allowDownload, allowSocialShare, showMetadata, isVisible }) => {
    if (!allowDownload && !allowSocialShare && !showMetadata) {
      isVisible = false;
    }

    if (!isVisible) {
      return null;
    }

    return html`
    ${CSS$7}
    <menu class='buv-c-action-menu'>
      ${showMetadata ? html`<menuitem class='buv-c-action-menu-item'><buv-metadata></buv-metadata></menuitem>` : ''}
      ${allowDownload ? html`<menuitem class='buv-c-action-menu-item'><buv-download-link></buv-download-link></menuitem>` : ''}
      ${allowSocialShare ? html`<menuitem class='buv-c-action-menu-item'><buv-social-share></buv-social-share></menuitem>` : ''}
    </menu>
  `;
  };

  const mapStateToProps$6 = (state) => ({
    allowDownload: getAllowDownload(state),
    allowSocialShare: getAllowSocialShare(state),
    showMetadata: getShowMetadata(state),
    isVisible: getDisplayMode(state) === FULL && !!getCertificateDefinition(state)
  });

  const ActionMenuContainer = connector(ActionMenu, { mapStateToProps: mapStateToProps$6 });

  window.customElements.define('buv-action-menu', ActionMenuContainer);

  var CSS$8 = html`<style>.buv-c-verification-modal__process{display:flex;justify-content:space-around}.buv-c-verification-modal__separator{margin-bottom:30px;background-color:rgba(3,21,50,0.05);height:1px;border:0 none}.buv-c-verification-modal__content{max-height:100vh;padding-bottom:43px;box-sizing:border-box;overflow:auto}@media only screen and (max-width: 600px){.buv-c-verification-modal__content{max-height:calc(100vh - 120px)}}
</style>`;

  var CSS$9 = html`<style>.buv-o-link{cursor:pointer;text-decoration:none;color:currentColor}.buv-o-link__text--underline{border-bottom:1px solid}.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-u-visually-hidden{position:absolute !important;clip:rect(1px 1px 1px 1px);clip:rect(1px, 1px, 1px, 1px);padding:0 !important;border:0 !important;height:1px !important;width:1px !important;overflow:hidden}
</style>`;

  let testedOnce = false;
  let canDragAndDropCache = false;

  function canDragAndDrop () {
    if (testedOnce) {
      return canDragAndDropCache;
    }
    testedOnce = true;

    const testDiv = document.createElement('div');

    if (!('ontouchstart' in testDiv)) { // check if most likely mobile device.
      canDragAndDropCache = true;
      return canDragAndDropCache;
    }

    return false;
  }

  function FileUpload ({ onChange = () => {}, hideFileUpload = false }) {
    if (hideFileUpload) {
      return null;
    }

    return html`
    ${CSS$9}
    <label for='buv-json-file-upload' class='buv-o-link  buv-o-text-12'>
      <span class='buv-o-link__text--underline'>${getText('text.fileUpload')}</span>
      <input
        type='file'
        accept='application/json'
        id='buv-json-file-upload'
        class='buv-u-visually-hidden'
        onchange='${(e) => { onChange(e.target.files[0]); }}'
      />
    </label>
    ${canDragAndDrop() ? html`<span class="buv-o-text-12  qa-drag-and-drop-hint">${getText('text.dragAndDropHint')}</span>` : ''}`;
  }

  function uploadCertificateDefinition (file) {
    return async function (dispatch) {
      dispatch({
        type: UPLOAD_CERTIFICATE_DEFINITION
      });
      const definition = await domain.certificates.read(file);

      dispatch(updateCertificateDefinition$1(JSON.parse(definition)));
    };
  }

  const mapDispatchToProps$3 = {
    onChange: uploadCertificateDefinition
  };

  const mapStateToProps$7 = state => ({
    hideFileUpload: getCertificateDefinition(state)
  });

  const FileUploadContainer = connector(FileUpload, { mapDispatchToProps: mapDispatchToProps$3, mapStateToProps: mapStateToProps$7 });

  window.customElements.define('buv-file-upload', FileUploadContainer);

  function resetVerificationStatus () {
    return function (dispatch) {
      dispatch({
        type: RESET_VERIFICATION_STATUS
      });

      dispatch(updateVerificationStatus$1(VERIFICATION_STATUS.DEFAULT));
      dispatch(updateFinalStep$1(null));
    };
  }

  function resetCertificateDefinition$1 () {
    return function (dispatch) {
      dispatch(clearVerifiedSteps$1());
      dispatch(resetVerificationStatus());

      dispatch({
        type: RESET_CERTIFICATE_DEFINITION,
        payload: {
          definition: null
        }
      });
    };
  }

  var CSS$a = html`<style>.buv-o-link{cursor:pointer;text-decoration:none;color:currentColor}.buv-o-link__text--underline{border-bottom:1px solid}.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-verify-other-certificate{display:block}
</style>`;

  function VerifyOtherCertificateLink ({ onClick = () => {}, isVisible = false } = {}) {
    if (!isVisible) {
      return null;
    }

    return html`
    ${CSS$a}
    <a onclick='${onClick}' class='buv-o-text-12  buv-o-link  buv-c-verify-other-certificate  buv-qa-verify-other-certificate'>
      <span class='buv-o-link__text--underline'>${getText('text.verifyOther')}</span>
    </a>
  `;
  }

  const mapDispatchToProps$4 = {
    onClick: resetCertificateDefinition$1
  };

  const mapStateToProps$8 = (state) => ({
    isVisible: !!getCertificateDefinition(state)
  });

  const VerifyOtherCertificateLinkContainer = connector(VerifyOtherCertificateLink, { mapDispatchToProps: mapDispatchToProps$4, mapStateToProps: mapStateToProps$8 });

  window.customElements.define('buv-verify-other-certificate', VerifyOtherCertificateLinkContainer);

  var CSS$b = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-footer{width:100%;height:60px;background-color:rgba(0,0,0,0.1);color:#031532;fill:#111;display:flex;justify-content:space-between;align-items:center;padding:0 30px;box-sizing:border-box}.buv-c-footer a{line-height:1}.buv-c-footer--dark{color:#fff;fill:#fff}.buv-c-footer--forced{position:absolute;bottom:0;left:0;margin-top:0;justify-content:flex-end}
</style>`;

  var CSS$c = html`<style>.buv-u-visually-hidden{position:absolute !important;clip:rect(1px 1px 1px 1px);clip:rect(1px, 1px, 1px, 1px);padding:0 !important;border:0 !important;height:1px !important;width:1px !important;overflow:hidden}.buv-c-logo{color:currentColor;text-decoration:none}.buv-c-logo--small{width:113px;height:16px}.buv-c-logo--medium{width:66%}.buv-c-logo__motto{font-size:12px}
</style>`;

  /*function simpleLogo () {
    return html`
      <svg class='buv-qa-logo--simple  buv-c-logo--small' viewBox="0 0 113 16" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <defs></defs>
          <g id="Page-1" stroke="none" stroke-width="1" fill-rule="evenodd" fill-opacity="0.37">
            <g id="blockcerts-logo" transform="translate(0.000000, -2.000000)" fill-rule="nonzero" fill="inherit">
              <path d="M19.5,5.06256945 L22.9958467,5.06256945 C24.617584,5.06256945 25.789567,5.29884552 26.5118308,5.77140473 C27.2340946,6.24396395 27.5952211,6.99038151 27.5952211,8.01067982 C27.5952211,8.69803869 27.4180141,9.26993416 27.0635947,9.72638339 C26.7091752,10.1828327 26.1990337,10.4701229 25.5331548,10.5882627 L25.5331548,10.6688121 C26.3601335,10.8245419 26.9682758,11.1319693 27.3576002,11.5911035 C27.7469246,12.0502377 27.9415838,12.6718049 27.9415838,13.4558236 C27.9415838,14.5137118 27.5724025,15.3420205 26.8340287,15.9407745 C26.0956549,16.5395285 25.0686595,16.8389011 23.7530117,16.8389011 L19.5,16.8389011 L19.5,5.06256945 Z M21.4251322,9.92775706 L23.2777698,9.92775706 C24.0832685,9.92775706 24.6712737,9.80022169 25.0418031,9.54514712 C25.4123325,9.29007254 25.5975944,8.85645225 25.5975944,8.24427327 C25.5975944,7.69116419 25.3975653,7.29110585 24.9975009,7.04408626 C24.5974366,6.79706667 23.9624447,6.67355873 23.0925061,6.67355873 L21.4251322,6.67355873 L21.4251322,9.92775706 Z M21.4251322,11.4904167 L21.4251322,15.2198568 L23.4710886,15.2198568 C24.2765872,15.2198568 24.8847296,15.0654719 25.2955339,14.7566974 C25.7063383,14.4479229 25.9117373,13.9606036 25.9117373,13.2947247 C25.9117373,12.6825457 25.7023108,12.2287882 25.2834515,11.9334387 C24.8645922,11.6380892 24.2282578,11.4904167 23.3744292,11.4904167 L21.4251322,11.4904167 Z M29.8953916,16.8389011 L29.8953916,5.06256945 L31.8205237,5.06256945 L31.8205237,15.1876371 L36.8065356,15.1876371 L36.8065356,16.8389011 L29.8953916,16.8389011 Z M48.4665536,10.9346254 C48.4665536,12.8517122 47.9872891,14.3418624 47.0287457,15.4051206 C46.0702024,16.4683789 44.7129575,17 42.9569704,17 C41.1795033,17 39.8142036,16.4724063 38.8610302,15.417203 C37.9078567,14.3619998 37.4312772,12.8624522 37.4312772,10.9185155 C37.4312772,8.97457869 37.9105417,7.48174356 38.8690851,6.43996528 C39.8276285,5.39818701 41.1956132,4.87730568 42.9730803,4.87730568 C44.7236973,4.87730568 46.0769148,5.40624187 47.0327734,6.46413012 C47.9886317,7.52201836 48.4665536,9.01216855 48.4665536,10.9346254 Z M39.4772336,10.9346254 C39.4772336,12.384523 39.7698937,13.4840121 40.3552227,14.2331259 C40.9405517,14.9822397 41.8077923,15.3567909 42.9569704,15.3567909 C44.1007786,15.3567909 44.9639915,14.9862671 45.5466357,14.2452083 C46.1292796,13.5041496 46.4205973,12.4006329 46.4205973,10.9346254 C46.4205973,9.49009776 46.1319648,8.39463599 45.5546906,7.64820724 C44.9774165,6.90177847 44.1168884,6.52856969 42.9730803,6.52856969 C41.8185322,6.52856969 40.9472642,6.90177847 40.3592502,7.64820724 C39.7712361,8.39463599 39.4772336,9.49009776 39.4772336,10.9346254 Z M55.5110875,6.54467959 C54.4048694,6.54467959 53.5349439,6.93668306 52.9012851,7.72070175 C52.267626,8.50472046 51.9508013,9.58675743 51.9508013,10.9668451 C51.9508013,12.4113727 52.2555437,13.5041496 52.8650377,14.2452083 C53.4745317,14.9862671 54.3565394,15.3567909 55.5110875,15.3567909 C56.0104969,15.3567909 56.4937888,15.3071193 56.960978,15.2077744 C57.4281673,15.1084296 57.9141441,14.9808942 58.4189233,14.8251645 L58.4189233,16.4764285 C57.4952848,16.8254779 56.4481523,17 55.2774942,17 C53.5537269,17 52.230044,16.4777762 51.3064055,15.4333129 C50.3827671,14.3888497 49.9209548,12.894672 49.9209548,10.9507353 C49.9209548,9.72637727 50.1451485,8.65508014 50.5935427,7.73681166 C51.041937,6.81854317 51.6903538,6.11508489 52.5388124,5.6264157 C53.3872709,5.13774651 54.3833893,4.89341558 55.5271976,4.89341558 C56.7300756,4.89341558 57.841647,5.14580137 58.8619454,5.65058054 L58.1692199,7.25351487 C57.7718405,7.06556518 57.3516451,6.90044043 56.9086208,6.75813566 C56.4655966,6.6158309 55.9997568,6.54467959 55.5110875,6.54467959 Z M69.4506556,16.8389011 L67.2194355,16.8389011 L63.522215,11.5065265 L62.3864676,12.4328454 L62.3864676,16.8389011 L60.4613353,16.8389011 L60.4613353,5.06256945 L62.3864676,5.06256945 L62.3864676,10.684922 C62.9127266,10.0405231 63.4362929,9.42029843 63.9571822,8.82422942 L67.1388858,5.06256945 L69.3298314,5.06256945 C67.2731248,7.47906546 65.7990842,9.20012177 64.9076657,10.2257901 L69.4506556,16.8389011 Z M75.6494201,5.63447064 C74.1726725,5.63447064 73.0100869,6.10702277 72.1616284,7.05214121 C71.3131696,7.99725964 70.8889467,9.29140808 70.8889467,10.9346254 C70.8889467,12.6154326 71.2890051,13.9203209 72.0891337,14.8493293 C72.8892625,15.7783378 74.0330533,16.242835 75.5205409,16.242835 C76.5086192,16.242835 77.4161342,16.1166421 78.2431127,15.8642525 L78.2431127,16.5891977 C77.4644642,16.8630673 76.4925103,17 75.3272222,17 C73.673265,17 72.3710617,16.4656939 71.4205732,15.3970657 C70.4700848,14.3284374 69.9948476,12.8356023 69.9948476,10.9185155 C69.9948476,9.72100746 70.2217264,8.66582002 70.6754907,7.75292154 C71.129255,6.84002305 71.781699,6.13522229 72.6328427,5.63849812 C73.4839862,5.14177394 74.4733922,4.89341558 75.6010904,4.89341558 C76.7502684,4.89341558 77.7786064,5.108212 78.6861348,5.53781129 L78.355882,6.27886635 C77.4966834,5.84926707 76.5945384,5.63447064 75.6494201,5.63447064 Z M86.8100316,16.8389011 L80.3741293,16.8389011 L80.3741293,5.06256945 L86.8100316,5.06256945 L86.8100316,5.81973441 L81.1957339,5.81973441 L81.1957339,10.2741198 L86.4958886,10.2741198 L86.4958886,11.0312847 L81.1957339,11.0312847 L81.1957339,16.0817361 L86.8100316,16.0817361 L86.8100316,16.8389011 Z M89.8029274,11.7079002 L89.8029274,16.8389011 L88.9813228,16.8389011 L88.9813228,5.06256945 L91.7844442,5.06256945 C93.2450817,5.06256945 94.3244339,5.33240746 95.0225327,5.87209156 C95.7206316,6.41177567 96.0696758,7.22397464 96.0696758,8.30871284 C96.0696758,9.09810153 95.8615917,9.76397044 95.4454173,10.3063395 C95.0292429,10.8487086 94.396936,11.2380272 93.5484774,11.4743068 L96.7462912,16.8389011 L95.7635877,16.8389011 L92.726873,11.7079002 L89.8029274,11.7079002 Z M89.8029274,10.9990649 L92.0502574,10.9990649 C93.0437059,10.9990649 93.814288,10.7775561 94.3620271,10.3345318 C94.909766,9.8915076 95.1836315,9.23772099 95.1836315,8.37315242 C95.1836315,7.4763639 94.9151361,6.82391977 94.378137,6.41580044 C93.8411379,6.00768112 92.9658423,5.80362452 91.7522245,5.80362452 L89.8029274,5.80362452 L89.8029274,10.9990649 Z M101.358231,16.8389011 L100.528572,16.8389011 L100.528572,5.8358443 L96.7024723,5.8358443 L96.7024723,5.06256945 L105.184331,5.06256945 L105.184331,5.8358443 L101.358231,5.8358443 L101.358231,16.8389011 Z M112.9377,13.8021863 C112.9377,14.7848947 112.576573,15.5635317 111.85431,16.1381207 C111.132046,16.7127098 110.172174,17 108.974666,17 C107.535509,17 106.431992,16.8415876 105.664083,16.5247582 L105.664083,15.7031536 C106.512542,16.062943 107.594579,16.242835 108.910227,16.242835 C109.876825,16.242835 110.64338,16.0213262 111.209914,15.5783019 C111.776448,15.1352777 112.059711,14.5539849 112.059711,13.8344061 C112.059711,13.3886968 111.965737,13.0195154 111.777788,12.7268509 C111.589838,12.4341864 111.283753,12.1670334 110.859524,11.9253838 C110.435294,11.6837342 109.812385,11.4232935 108.990776,11.144054 C107.787898,10.7305647 106.956904,10.2835196 106.49777,9.80290539 C106.038636,9.32229119 105.809072,8.68192935 105.809072,7.88180069 C105.809072,7.00112214 106.154089,6.28289661 106.844133,5.72710253 C107.534177,5.17130845 108.421555,4.89341558 109.506293,4.89341558 C110.612511,4.89341558 111.651589,5.10284209 112.623557,5.52170139 L112.325524,6.23053668 C111.348186,5.82241735 110.413821,5.61836075 109.522403,5.61836075 C108.652464,5.61836075 107.959746,5.8197324 107.444226,6.22248173 C106.928707,6.62523106 106.670952,7.17296194 106.670952,7.86569079 C106.670952,8.30066007 106.750158,8.65775912 106.908573,8.93699866 C107.066987,9.2162382 107.326085,9.46728151 107.685875,9.69013615 C108.045664,9.91299077 108.663204,10.1801438 109.538513,10.4916033 C110.456781,10.8084328 111.146815,11.1158602 111.608634,11.4138947 C112.070453,11.7119292 112.407415,12.0502335 112.619529,12.4288179 C112.831644,12.8074023 112.9377,13.2651872 112.9377,13.8021863 Z" id="BLOCKCERTS"></path>
              <path d="M10.9580699,13.4113689 C10.9580699,13.8630088 10.5919434,14.2291353 10.1403035,14.2291353 L0.81776652,14.2291353 C0.366126608,14.2291353 1.20000012e-07,13.8630088 1.2000001e-07,13.4113689 C1.2000001e-07,12.959729 0.366126608,12.5936025 0.81776652,12.5936025 L10.1403035,12.5936025 C10.5919434,12.5936025 10.9580699,12.959729 10.9580699,13.4113689 Z"></path>
              <path d="M14.2291354,13.411369 C14.2291354,13.8630089 13.8630089,14.2291354 13.411369,14.2291354 C12.9597291,14.2291354 12.5936026,13.8630089 12.5936026,13.411369 C12.5936026,12.9597291 12.9597291,12.5936026 13.411369,12.5936026 C13.8630089,12.5936026 14.2291354,12.9597291 14.2291354,13.411369 Z"></path>
              <path d="M9.4860908,16.6824348 C9.4860908,17.1340748 9.11996431,17.5002012 8.6683244,17.5002012 C8.21668449,17.5002012 7.850558,17.1340748 7.850558,16.6824348 C7.850558,16.2307949 8.21668449,15.8646684 8.6683244,15.8646684 C9.11996431,15.8646684 9.4860908,16.2307949 9.4860908,16.6824348 Z"></path>
              <path d="M14.2291356,6.869238 C14.2291356,7.32087791 13.8630092,7.6870044 13.4113692,7.6870044 C12.9597293,7.6870044 12.5936028,7.32087791 12.5936028,6.869238 C12.5936028,6.41759809 12.9597293,6.0514716 13.4113692,6.0514716 C13.8630092,6.0514716 14.2291356,6.41759809 14.2291356,6.869238 Z"></path>
              <path d="M1.63553264,6.8692384 C1.63553264,7.32087831 1.26940615,7.6870048 0.81776624,7.6870048 C0.366126328,7.6870048 -1.60000013e-07,7.32087831 -1.60000013e-07,6.8692384 C-1.60000013e-07,6.41759849 0.366126328,6.051472 0.81776624,6.051472 C1.26940615,6.051472 1.63553264,6.41759849 1.63553264,6.8692384 Z"></path><rect transform="translate(7.196344, 3.598172) rotate(90.000000) translate(-7.196344, -3.598172) " x="6.37857744" y="2.78040592" width="1.6355328" height="1.6355328" rx="0.8177664"></rect>
              <path d="M6.37857804,10.1403025 C6.37857804,10.5919424 6.01245155,10.9580689 5.56081164,10.9580689 C5.10917173,10.9580689 4.74304524,10.5919424 4.74304524,10.1403025 C4.74304524,9.68866261 5.10917173,9.32253612 5.56081164,9.32253612 C6.01245155,9.32253612 6.37857804,9.68866261 6.37857804,10.1403025 Z"></path>
              <path d="M14.2291348,3.5981724 C14.2291348,4.04981231 13.8630083,4.4159388 13.4113684,4.4159388 L10.4674093,4.4159388 C10.0157694,4.4159388 9.64964292,4.04981231 9.64964292,3.5981724 C9.64964292,3.14653249 10.0157694,2.780406 10.4674093,2.780406 L13.4113684,2.780406 C13.8630083,2.780406 14.2291348,3.14653249 14.2291348,3.5981724 Z"></path><rect transform="translate(2.371523, 3.598172) rotate(90.000000) translate(-2.371523, -3.598172) " x="1.55375644" y="1.226649" width="1.6355328" height="4.74304512" rx="0.8177664"></rect>
              <path d="M14.229135,10.140303 C14.229135,10.5919429 13.8630085,10.9580694 13.4113686,10.9580694 L8.83187672,10.9580694 C8.38023681,10.9580694 8.01411032,10.5919429 8.01411032,10.140303 C8.01411032,9.68866309 8.38023681,9.3225366 8.83187672,9.3225366 L13.4113686,9.3225366 C13.8630085,9.3225366 14.229135,9.68866309 14.229135,10.140303 Z"></path>
              <path d="M3.1075118,10.1403032 C3.1075118,10.5919431 2.74138531,10.9580696 2.2897454,10.9580696 L0.81776588,10.9580696 C0.366125968,10.9580696 -5.20000015e-07,10.5919431 -5.20000015e-07,10.1403032 C-5.20000015e-07,9.68866325 0.366125968,9.32253676 0.81776588,9.32253676 L2.2897454,9.32253676 C2.74138531,9.32253676 3.1075118,9.68866325 3.1075118,10.1403032 Z"></path>
              <path d="M14.2291356,16.6824352 C14.2291356,17.1340751 13.8630091,17.5002016 13.4113692,17.5002016 L11.9393897,17.5002016 C11.4877498,17.5002016 11.1216233,17.1340751 11.1216233,16.6824352 C11.1216233,16.2307953 11.4877498,15.8646688 11.9393897,15.8646688 L13.4113692,15.8646688 C13.8630091,15.8646688 14.2291356,16.2307953 14.2291356,16.6824352 Z"></path>
              <path d="M6.2150248,16.6824353 C6.2150248,17.1340752 5.84889831,17.5002017 5.3972584,17.5002017 L0.81776656,17.5002017 C0.366126648,17.5002017 1.59999985e-07,17.1340752 1.59999985e-07,16.6824353 C1.59999985e-07,16.2307954 0.366126648,15.8646689 0.81776656,15.8646689 L5.3972584,15.8646689 C5.84889831,15.8646689 6.2150248,16.2307954 6.2150248,16.6824353 Z"></path>
              <path d="M10.9580703,6.86923768 C10.9580703,7.32087759 10.5919438,7.68700408 10.1403039,7.68700408 L4.08883256,7.68700408 C3.63719265,7.68700408 3.27106616,7.32087759 3.27106616,6.86923768 C3.27106616,6.41759777 3.63719265,6.05147128 4.08883256,6.05147128 L10.1403039,6.05147128 C10.5919438,6.05147128 10.9580703,6.41759777 10.9580703,6.86923768 Z">
              </path> 
            </g>
        </g> 
      </svg>
      <span class='buv-u-visually-hidden'>${getText('text.brandname')}</span>
    `;
  }*/

  function simpleLogo () {
    return html`
    <svg class='buv-qa-logo--simple  buv-c-logo--small' viewBox="0 0 113 13" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <embed src="https://www.pku.edu.cn/Uploads/Picture/2019/12/26/s5e04176fbbfa3.png" style="display:block;width:114px;height:32px" />
    </svg>
    <span class='buv-u-visually-hidden'>${getText('text.brandname')}</span>
  `;
  }

  /*function logoWithBranding () {
    return html`
      <svg class='buv-qa-logo--branded  buv-c-logo--medium' version="1.1" viewBox="0 0 686 163" xmlns="http://www.w3.org/2000/svg">
        <g fill="none" fill-rule="evenodd">
          <g transform="translate(-76 -70)">
            <g transform="translate(76 53)">
              <path d="m119.52 35.613h21.191c9.8308 0 16.935 1.4323 21.313 4.2969 4.3783 2.8646 6.5674 7.3893 6.5674 13.574 0 4.1667-1.0742 7.6334-3.2227 10.4-2.1484 2.7669-5.2409 4.5085-9.2773 5.2246v0.48828c5.013 0.94402 8.6995 2.8076 11.06 5.5908 2.36 2.7832 3.54 6.5511 3.54 11.304 0 6.4128-2.2379 11.434-6.7139 15.063-4.4759 3.6296-10.701 5.4443-18.677 5.4443h-25.781v-71.387zm11.67 29.492h11.23c4.8828 0 8.4473-0.7731 10.693-2.3193s3.3691-4.1748 3.3691-7.8857c0-3.3529-1.2126-5.778-3.6377-7.2754-2.4251-1.4974-6.2744-2.2461-11.548-2.2461h-10.107v19.727zm0 9.4727v22.607h12.402c4.8828 0 8.5693-0.93586 11.06-2.8076 2.4902-1.8718 3.7354-4.8258 3.7354-8.8623 0-3.711-1.2695-6.4616-3.8086-8.252-2.5391-1.7904-6.3965-2.6855-11.572-2.6855h-11.816zm51.346 32.422v-71.387h11.67v61.377h30.225v10.01h-41.895zm112.58-35.791c0 11.621-2.9052 20.654-8.7158 27.1-5.8106 6.4453-14.038 9.668-24.683 9.668-10.775 0-19.051-3.1982-24.829-9.5947-5.778-6.3965-8.667-15.487-8.667-27.271s2.9052-20.833 8.7158-27.148c5.8106-6.3151 14.103-9.4727 24.878-9.4727 10.612 0 18.815 3.2063 24.609 9.6191s8.6914 15.446 8.6914 27.1zm-54.492 0c0 8.7891 1.7741 15.454 5.3223 19.995 3.5482 4.541 8.8053 6.8115 15.771 6.8115 6.9336 0 12.166-2.2461 15.698-6.7383 3.5319-4.4922 5.2979-11.182 5.2979-20.068 0-8.7566-1.7497-15.397-5.249-19.922-3.4994-4.5248-8.7158-6.7871-15.649-6.7871-6.9987 0-12.28 2.2623-15.845 6.7871s-5.3467 11.165-5.3467 19.922zm97.195-26.611c-6.7058 0-11.979 2.3763-15.82 7.1289-3.8412 4.7526-5.7617 11.312-5.7617 19.678 0 8.7566 1.8473 15.381 5.542 19.873 3.6947 4.4922 9.0413 6.7383 16.04 6.7383 3.0274 0 5.957-0.3011 8.7891-0.90332 2.832-0.60222 5.778-1.3753 8.8379-2.3193v10.01c-5.599 2.1159-11.947 3.1738-19.043 3.1738-10.449 0-18.473-3.1657-24.072-9.4971-5.599-6.3314-8.3984-15.389-8.3984-27.173 0-7.4219 1.359-13.916 4.0771-19.482 2.7181-5.5664 6.6487-9.8307 11.792-12.793s11.182-4.4434 18.115-4.4434c7.2917 0 14.03 1.5299 20.215 4.5898l-4.1992 9.7168c-2.4089-1.1393-4.956-2.1403-7.6416-3.0029-2.6856-0.86263-5.5094-1.2939-8.4717-1.2939zm84.5 62.402h-13.525l-22.412-32.324-6.8848 5.6152v26.709h-11.67v-71.387h11.67v34.082c3.1901-3.9063 6.3639-7.666 9.5215-11.279l19.287-22.803h13.281c-12.468 14.649-21.403 25.081-26.807 31.299l27.539 40.088zm37.576-67.92c-8.9519 0-15.999 2.8646-21.143 8.5938s-7.7148 13.574-7.7148 23.535c0 10.189 2.4251 18.099 7.2754 23.73 4.8503 5.6315 11.784 8.4473 20.801 8.4473 5.9896 0 11.491-0.76497 16.504-2.2949v4.3945c-4.7201 1.6602-10.612 2.4902-17.676 2.4902-10.026 0-17.92-3.2389-23.682-9.7168-5.7617-6.4779-8.6426-15.527-8.6426-27.148 0-7.2592 1.3753-13.656 4.126-19.189 2.7507-5.5339 6.7057-9.8063 11.865-12.817s11.157-4.5166 17.993-4.5166c6.9662 0 13.2 1.3021 18.701 3.9062l-2.002 4.4922c-5.2084-2.6042-10.677-3.9062-16.406-3.9062zm67.654 67.92h-39.014v-71.387h39.014v4.5898h-34.033v27.002h32.129v4.5898h-32.129v30.615h34.033v4.5898zm18.143-31.104v31.104h-4.9805v-71.387h16.992c8.8542 0 15.397 1.6357 19.629 4.9072s6.3477 8.195 6.3477 14.771c0 4.7852-1.2614 8.8216-3.7842 12.109-2.5228 3.2878-6.3558 5.6478-11.499 7.0801l19.385 32.52h-5.957l-18.408-31.104h-17.725zm0-4.2969h13.623c6.0222 0 10.693-1.3428 14.014-4.0283s4.9805-6.6487 4.9805-11.89c0-5.4362-1.6276-9.3913-4.8828-11.865-3.2552-2.474-8.5612-3.7109-15.918-3.7109h-11.816v31.494zm70.047 35.4h-5.0293v-66.699h-23.193v-4.6875h51.416v4.6875h-23.193v66.699zm70.193-18.408c0 5.9571-2.1891 10.677-6.5674 14.16-4.3783 3.4831-10.197 5.2246-17.456 5.2246-8.724 0-15.413-0.96028-20.068-2.8809v-4.9805c5.1433 2.181 11.702 3.2715 19.678 3.2715 5.8594 0 10.506-1.3428 13.94-4.0283 3.4343-2.6856 5.1514-6.2093 5.1514-10.571 0-2.7018-0.56966-4.9398-1.709-6.7139-1.1393-1.7741-2.9948-3.3935-5.5664-4.8584-2.5716-1.4649-6.3476-3.0436-11.328-4.7363-7.2917-2.5065-12.329-5.2165-15.112-8.1299s-4.1748-6.7952-4.1748-11.646c0-5.3386 2.0914-9.6924 6.2744-13.062 4.183-3.3692 9.5621-5.0537 16.138-5.0537 6.7058 0 13.005 1.2695 18.896 3.8086l-1.8066 4.2969c-5.9245-2.474-11.589-3.7109-16.992-3.7109-5.2735 0-9.4726 1.2207-12.598 3.6621-3.125 2.4414-4.6875 5.7617-4.6875 9.9609 0 2.6367 0.48014 4.8014 1.4404 6.4941 0.96029 1.6927 2.5309 3.2145 4.7119 4.5654 2.181 1.3509 5.9245 2.9704 11.23 4.8584 5.5664 1.9206 9.7493 3.7842 12.549 5.5908 2.7995 1.8066 4.8421 3.8574 6.1279 6.1523 1.2858 2.2949 1.9287 5.07 1.9287 8.3252z" fill="#182650" fill-rule="nonzero"/>
              <rect transform="translate(33.5 82) rotate(90) translate(-33.5 -82)" x="28.5" y="48.5" width="10" height="67" rx="5" fill="#2AB27B"/>
              <rect transform="translate(82 82) rotate(90) translate(-82 -82)" x="77" y="77" width="10" height="10" rx="5" fill="#2AB27B"/>
              <rect transform="translate(53 102) rotate(90) translate(-53 -102)" x="48" y="97" width="10" height="10" rx="5" fill="#2AB27B"/>
              <rect transform="translate(82 42) rotate(90) translate(-82 -42)" x="77" y="37" width="10" height="10" rx="5" fill="#2AB27B"/>
              <rect transform="translate(5 42) rotate(90) translate(-5 -42)" y="37" width="10" height="10" rx="5" fill="#2AB27B"/>
              <rect transform="translate(44 22) rotate(90) translate(-44 -22)" x="39" y="17" width="10" height="10" rx="5" fill="#2AB27B"/>
              <rect transform="translate(34 62) rotate(90) translate(-34 -62)" x="29" y="57" width="10" height="10" rx="5" fill="#2AB27B"/>
              <rect transform="translate(73 22) rotate(90) translate(-73 -22)" x="68" y="8" width="10" height="28" rx="5" fill="#2AB27B"/>
              <rect transform="translate(14.5 22) rotate(90) translate(-14.5 -22)" x="9.5" y="7.5" width="10" height="29" rx="5" fill="#2AB27B"/>
              <rect transform="translate(68 62) rotate(90) translate(-68 -62)" x="63" y="43" width="10" height="38" rx="5" fill="#2AB27B"/>
              <rect transform="translate(9.5 62) rotate(90) translate(-9.5 -62)" x="4.5" y="52.5" width="10" height="19" rx="5" fill="#2AB27B"/>
              <rect transform="translate(77.5 102) rotate(90) translate(-77.5 -102)" x="72.5" y="92.5" width="10" height="19" rx="5" fill="#2AB27B"/>
              <rect transform="translate(19 102) rotate(90) translate(-19 -102)" x="14" y="83" width="10" height="38" rx="5" fill="#2AB27B"/>
              <rect transform="translate(43.5 42) rotate(90) translate(-43.5 -42)" x="38.5" y="18.5" width="10" height="47" rx="5" fill="#2AB27B"/>
              <path d="m10.013 172h-2.6147v-20.164h-7.1213v-2.3225h16.857v2.3225h-7.1213v20.164zm21.656 0v-10.905c0-1.374-0.31274-2.3994-0.93823-3.0762s-1.6047-1.0151-2.9377-1.0151c-1.7739 0-3.0685 0.48193-3.8837 1.4458s-1.2228 2.543-1.2228 4.7373v8.8132h-2.5532v-23.933h2.5532v7.2444c0 0.87159-0.041015 1.5945-0.12305 2.1687h0.15381c0.50244-0.81006 1.2176-1.4484 2.1456-1.9149 0.92798-0.46656 1.9867-0.69983 3.1761-0.69983 2.061 0 3.6068 0.48962 4.6373 1.4689 1.0305 0.97925 1.5458 2.5353 1.5458 4.6681v10.997h-2.5532zm14.919 0.30762c-2.4917 0-4.4579-0.75878-5.8986-2.2764-1.4407-1.5176-2.161-3.6247-2.161-6.3215 0-2.7173 0.66906-4.8757 2.0072-6.4753 1.3381-1.5996 3.1351-2.3994 5.391-2.3994 2.1123 0 3.7837 0.6947 5.0142 2.0841 1.2305 1.3894 1.8457 3.2223 1.8457 5.4987v1.615h-11.613c0.05127 1.979 0.55114 3.4812 1.4996 4.5066 0.94849 1.0254 2.284 1.5381 4.0067 1.5381 1.815 0 3.6094-0.37939 5.3833-1.1382v2.2764c-0.90235 0.38965-1.756 0.66907-2.5609 0.83826s-1.7765 0.25378-2.9147 0.25378zm-0.69214-15.335c-1.3535 0-2.4327 0.44091-3.2377 1.3228-0.80494 0.88184-1.2792 2.102-1.4227 3.6606h8.8132c0-1.6099-0.35888-2.8429-1.0767-3.6991-0.71778-0.8562-1.7432-1.2843-3.0762-1.2843zm39.329 3.7529c0 3.5991-0.91003 6.4292-2.7301 8.4902-1.8201 2.061-4.3502 3.0916-7.5905 3.0916-3.312 0-5.8678-1.0126-7.6674-3.0377-1.7996-2.0252-2.6993-4.8834-2.6993-8.5748 0-3.6607 0.90233-6.4984 2.707-8.5133 1.8047-2.0149 4.3681-3.0223 7.6904-3.0223 3.23 0 5.7524 1.0254 7.5674 3.0762 1.815 2.0508 2.7224 4.8808 2.7224 8.4902zm-17.919 0c0 3.0454 0.64855 5.3551 1.9457 6.9291 1.2971 1.574 3.1813 2.361 5.6525 2.361 2.4917 0 4.3733-0.78442 5.6448-2.3533 1.2715-1.5689 1.9072-3.8811 1.9072-6.9368 0-3.0249-0.63317-5.3192-1.8995-6.8829-1.2664-1.5637-3.1402-2.3456-5.6217-2.3456-2.4917 0-4.3861 0.78698-5.6832 2.361-1.2971 1.574-1.9457 3.8631-1.9457 6.8676zm30.393 11.582c-1.0972 0-2.0995-0.20251-3.007-0.60754-0.90748-0.40503-1.6688-1.028-2.2841-1.8688h-0.18457c0.12305 0.98438 0.18457 1.9175 0.18457 2.7993v6.9368h-2.5532v-24.425h2.0764l0.35376 2.3071h0.12305c0.65625-0.92286 1.4202-1.5894 2.2917-1.9995 0.87159-0.41016 1.8713-0.61523 2.9993-0.61523 2.2354 0 3.9606 0.76391 5.1757 2.2917s1.8226 3.6709 1.8226 6.4292c0 2.7686-0.61779 4.9193-1.8534 6.4523-1.2356 1.533-2.9506 2.2994-5.1449 2.2994zm-0.36914-15.304c-1.7227 0-2.9685 0.4768-3.7375 1.4304s-1.1638 2.4712-1.1843 4.5527v0.56909c0 2.3687 0.39477 4.0631 1.1843 5.0834s2.0559 1.5304 3.7991 1.5304c1.4561 0 2.5968-0.58959 3.4222-1.7688 0.82544-1.1792 1.2382-2.8044 1.2382-4.8757 0-2.1021-0.41272-3.7145-1.2382-4.8373-0.82544-1.1228-1.9867-1.6842-3.4838-1.6842zm18.949 15.304c-2.4917 0-4.4579-0.75878-5.8986-2.2764s-2.161-3.6247-2.161-6.3215c0-2.7173 0.66906-4.8757 2.0072-6.4753 1.3381-1.5996 3.1351-2.3994 5.391-2.3994 2.1123 0 3.7837 0.6947 5.0142 2.0841 1.2305 1.3894 1.8457 3.2223 1.8457 5.4987v1.615h-11.613c0.05127 1.979 0.55114 3.4812 1.4996 4.5066 0.94849 1.0254 2.284 1.5381 4.0067 1.5381 1.815 0 3.6094-0.37939 5.3833-1.1382v2.2764c-0.90235 0.38965-1.756 0.66907-2.5609 0.83826-0.80494 0.16919-1.7765 0.25378-2.9147 0.25378zm-0.69214-15.335c-1.3535 0-2.4327 0.44091-3.2377 1.3228-0.80494 0.88184-1.2792 2.102-1.4227 3.6606h8.8132c0-1.6099-0.35888-2.8429-1.0767-3.6991-0.71778-0.8562-1.7432-1.2843-3.0762-1.2843zm22.779 15.027v-10.905c0-1.374-0.31274-2.3994-0.93823-3.0762-0.62549-0.67676-1.6047-1.0151-2.9377-1.0151-1.7637 0-3.0557 0.4768-3.876 1.4304-0.82032 0.95362-1.2305 2.5276-1.2305 4.7219v8.844h-2.5532v-16.857h2.0764l0.41528 2.3071h0.12305c0.52295-0.83057 1.2561-1.474 2.1995-1.9303s1.9944-0.68445 3.1531-0.68445c2.0303 0 3.5581 0.48962 4.5835 1.4689 1.0254 0.97925 1.5381 2.5455 1.5381 4.6989v10.997h-2.5532zm29.054-5.9832c0 1.979-0.71777 3.5222-2.1533 4.6296-1.4356 1.1074-3.3838 1.6611-5.8447 1.6611-2.666 0-4.7168-0.3435-6.1523-1.0305v-2.5225c0.92286 0.38965 1.9277 0.69726 3.0146 0.92285 1.0869 0.22559 2.1636 0.33838 3.23 0.33838 1.7432 0 3.0557-0.33068 3.9375-0.99206 0.88184-0.66138 1.3228-1.5817 1.3228-2.7609 0-0.7793-0.15637-1.4176-0.46912-1.9149-0.31274-0.49732-0.83569-0.95617-1.5688-1.3766-0.73316-0.42041-1.8483-0.89722-3.3453-1.4304-2.0918-0.74854-3.5863-1.6355-4.4835-2.6609s-1.3458-2.3635-1.3458-4.0144c0-1.7329 0.65112-3.1121 1.9534-4.1375 1.3023-1.0254 3.0249-1.5381 5.168-1.5381 2.2354 0 4.2912 0.41015 6.1677 1.2305l-0.81518 2.2764c-1.856-0.7793-3.6606-1.1689-5.4141-1.1689-1.3843 0-2.4661 0.29736-3.2454 0.89209s-1.1689 1.4202-1.1689 2.4763c0 0.7793 0.14355 1.4176 0.43066 1.9149s0.7716 0.95361 1.4535 1.3689 1.7252 0.87414 3.13 1.3766c2.3584 0.84082 3.9811 1.7432 4.868 2.707s1.3304 2.2148 1.3304 3.7529zm9.6592 4.1836c0.45117 0 0.88696-0.033324 1.3074-0.099975s0.75366-0.13586 0.99976-0.20764v1.9534c-0.27686 0.1333-0.68445 0.24353-1.2228 0.33069-0.53833 0.087159-1.0228 0.13074-1.4535 0.13074-3.2608 0-4.8911-1.7175-4.8911-5.1526v-10.028h-2.4148v-1.2305l2.4148-1.0613 1.0767-3.5991h1.4766v3.9067h4.8911v1.9841h-4.8911v9.9207c0 1.0151 0.24096 1.7944 0.7229 2.3379s1.1433 0.81518 1.9841 0.81518zm16.042 1.7996l-0.50757-2.3994h-0.12305c-0.84082 1.0562-1.6791 1.7714-2.5148 2.1456-0.8357 0.37427-1.879 0.5614-3.13 0.5614-1.6714 0-2.9813-0.43066-3.9298-1.292s-1.4227-2.0867-1.4227-3.676c0-3.4043 2.7224-5.1885 8.1672-5.3525l2.8608-0.092286v-1.0459c0-1.3228-0.28454-2.2994-0.85364-2.9301-0.5691-0.63062-1.4791-0.94592-2.7301-0.94592-1.4048 0-2.9941 0.43066-4.7681 1.292l-0.78442-1.9534c0.83057-0.45117 1.7406-0.80493 2.7301-1.0613s1.9816-0.38452 2.9762-0.38452c2.0098 0 3.4991 0.44604 4.4681 1.3381 0.969 0.8921 1.4535 2.3225 1.4535 4.2913v11.505h-1.8918zm-5.7678-1.7996c1.5894 0 2.8378-0.43579 3.7452-1.3074 0.90748-0.87159 1.3612-2.0918 1.3612-3.6606v-1.5227l-2.5532 0.10767c-2.0303 0.071778-3.494 0.38708-4.3912 0.94592-0.89722 0.55884-1.3458 1.4278-1.3458 2.6071 0 0.92286 0.27942 1.6252 0.83826 2.1072s1.3407 0.7229 2.3456 0.7229zm24.456 1.7996v-10.905c0-1.374-0.31274-2.3994-0.93823-3.0762s-1.6047-1.0151-2.9377-1.0151c-1.7637 0-3.0557 0.4768-3.876 1.4304-0.82032 0.95362-1.2305 2.5276-1.2305 4.7219v8.844h-2.5532v-16.857h2.0764l0.41528 2.3071h0.12305c0.52295-0.83057 1.2561-1.474 2.1995-1.9303s1.9944-0.68445 3.1531-0.68445c2.0303 0 3.5581 0.48962 4.5835 1.4689s1.5381 2.5455 1.5381 4.6989v10.997h-2.5532zm19.272-2.261h-0.13843c-1.1792 1.7124-2.9429 2.5686-5.291 2.5686-2.2046 0-3.9196-0.75365-5.1449-2.261-1.2253-1.5073-1.838-3.6504-1.838-6.4292 0-2.7788 0.61523-4.9372 1.8457-6.4753 1.2305-1.5381 2.9429-2.3071 5.1372-2.3071 2.2866 0 4.04 0.83056 5.2603 2.4917h0.19995l-0.10767-1.2151-0.061523-1.1843v-6.8599h2.5532v23.933h-2.0764l-0.33838-2.261zm-5.1064 0.43066c1.7432 0 3.007-0.47424 3.7914-1.4227s1.1766-2.4789 1.1766-4.5912v-0.53833c0-2.3892-0.39734-4.0939-1.192-5.1141s-2.0636-1.5304-3.8068-1.5304c-1.4971 0-2.6429 0.5819-3.4376 1.7457s-1.192 2.807-1.192 4.9296c0 2.1533 0.39477 3.7786 1.1843 4.8757 0.78955 1.0972 1.9482 1.6458 3.4761 1.6458zm23.302 1.8303l-0.50757-2.3994h-0.12305c-0.84082 1.0562-1.6791 1.7714-2.5148 2.1456-0.8357 0.37427-1.879 0.5614-3.13 0.5614-1.6714 0-2.9813-0.43066-3.9298-1.292s-1.4227-2.0867-1.4227-3.676c0-3.4043 2.7224-5.1885 8.1672-5.3525l2.8608-0.092286v-1.0459c0-1.3228-0.28454-2.2994-0.85364-2.9301-0.5691-0.63062-1.4791-0.94592-2.7301-0.94592-1.4048 0-2.9941 0.43066-4.7681 1.292l-0.78442-1.9534c0.83057-0.45117 1.7406-0.80493 2.7301-1.0613 0.98951-0.25635 1.9816-0.38452 2.9762-0.38452 2.0098 0 3.4991 0.44604 4.4681 1.3381 0.969 0.8921 1.4535 2.3225 1.4535 4.2913v11.505h-1.8918zm-5.7678-1.7996c1.5894 0 2.8378-0.43579 3.7452-1.3074 0.90748-0.87159 1.3612-2.0918 1.3612-3.6606v-1.5227l-2.5532 0.10767c-2.0303 0.071778-3.494 0.38708-4.3912 0.94592-0.89722 0.55884-1.3458 1.4278-1.3458 2.6071 0 0.92286 0.27942 1.6252 0.83826 2.1072 0.55884 0.48194 1.3407 0.7229 2.3456 0.7229zm20.61-15.365c0.74854 0 1.4202 0.061523 2.0149 0.18457l-0.35376 2.3687c-0.69727-0.15381-1.3125-0.23071-1.8457-0.23071-1.3638 0-2.5301 0.5537-3.4991 1.6611-0.969 1.1074-1.4535 2.4866-1.4535 4.1375v9.0439h-2.5532v-16.857h2.1072l0.29224 3.1223h0.12305c0.62549-1.0972 1.3791-1.9431 2.261-2.5378 0.88184-0.59473 1.8508-0.89209 2.907-0.89209zm16.011 14.904h-0.13843c-1.1792 1.7124-2.9429 2.5686-5.291 2.5686-2.2046 0-3.9195-0.75365-5.1449-2.261s-1.838-3.6504-1.838-6.4292c0-2.7788 0.61523-4.9372 1.8457-6.4753 1.2305-1.5381 2.9429-2.3071 5.1372-2.3071 2.2866 0 4.04 0.83056 5.2603 2.4917h0.19995l-0.10767-1.2151-0.061524-1.1843v-6.8599h2.5532v23.933h-2.0764l-0.33838-2.261zm-5.1064 0.43066c1.7432 0 3.007-0.47424 3.7914-1.4227 0.78443-0.94849 1.1766-2.4789 1.1766-4.5912v-0.53833c0-2.3892-0.39734-4.0939-1.192-5.1141-0.79468-1.0203-2.0636-1.5304-3.8068-1.5304-1.4971 0-2.6429 0.5819-3.4376 1.7457-0.79468 1.1638-1.192 2.807-1.192 4.9296 0 2.1533 0.39477 3.7786 1.1843 4.8757 0.78956 1.0972 1.9482 1.6458 3.4761 1.6458zm24.117 1.8303h-2.6147v-22.487h12.535v2.3225h-9.9207v8.2288h9.3208v2.3225h-9.3208v9.613zm27.809-8.4441c0 2.7481-0.69213 4.8937-2.0764 6.4369-1.3843 1.5432-3.2966 2.3148-5.7371 2.3148-1.5073 0-2.8455-0.35376-4.0144-1.0613s-2.0713-1.7226-2.707-3.0454c-0.63575-1.3228-0.95361-2.8711-0.95361-4.645 0-2.7481 0.687-4.8885 2.061-6.4215 1.374-1.533 3.2812-2.2994 5.7217-2.2994 2.3584 0 4.2323 0.78442 5.6217 2.3533 1.3894 1.5689 2.0841 3.6914 2.0841 6.3677zm-12.843 0c0 2.1533 0.43066 3.7939 1.292 4.9219 0.86133 1.1279 2.1277 1.6919 3.7991 1.6919s2.9403-0.5614 3.8068-1.6842c0.86646-1.1228 1.2997-2.766 1.2997-4.9296 0-2.1431-0.43322-3.7709-1.2997-4.8834-0.86646-1.1126-2.1456-1.6688-3.8375-1.6688-1.6714 0-2.9326 0.54858-3.7837 1.6458-0.85108 1.0972-1.2766 2.7327-1.2766 4.9065zm25.009-8.7209c0.74854 0 1.4202 0.061523 2.0149 0.18457l-0.35376 2.3687c-0.69727-0.15381-1.3125-0.23071-1.8457-0.23071-1.3638 0-2.5301 0.5537-3.4991 1.6611-0.969 1.1074-1.4535 2.4866-1.4535 4.1375v9.0439h-2.5532v-16.857h2.1072l0.29224 3.1223h0.12305c0.62549-1.0972 1.3791-1.9431 2.261-2.5378 0.88184-0.59473 1.8508-0.89209 2.907-0.89209zm13.735-5.3218h6.3523c2.9839 0 5.1423 0.44604 6.4753 1.3381 1.333 0.8921 1.9995 2.302 1.9995 4.2297 0 1.333-0.3717 2.4327-1.1151 3.2992s-1.8278 1.4279-3.2531 1.6842v0.15381c3.4146 0.58448 5.1218 2.3789 5.1218 5.3833 0 2.0098-0.67931 3.5786-2.038 4.7065-1.3586 1.1279-3.2582 1.6919-5.6986 1.6919h-7.8442v-22.487zm2.6147 9.6284h4.3066c1.8457 0 3.1736-0.28967 3.9836-0.86902 0.81006-0.57935 1.2151-1.556 1.2151-2.9301 0-1.2612-0.45117-2.1713-1.3535-2.7301-0.90235-0.55884-2.3379-0.83826-4.3066-0.83826h-3.8452v7.3674zm0 2.2148v8.4133h4.6912c1.815 0 3.1813-0.35119 4.099-1.0536 0.91773-0.7024 1.3766-1.8021 1.3766-3.2992 0-1.3945-0.46911-2.4199-1.4073-3.0762-0.93824-0.65625-2.3661-0.98438-4.2836-0.98438h-4.4758zm19.964 10.644h-2.5532v-23.933h2.5532v23.933zm19.964-8.4441c0 2.7481-0.69213 4.8937-2.0764 6.4369-1.3843 1.5432-3.2966 2.3148-5.7371 2.3148-1.5073 0-2.8455-0.35376-4.0144-1.0613s-2.0713-1.7226-2.707-3.0454c-0.63575-1.3228-0.95361-2.8711-0.95361-4.645 0-2.7481 0.687-4.8885 2.061-6.4215 1.374-1.533 3.2812-2.2994 5.7217-2.2994 2.3584 0 4.2323 0.78442 5.6217 2.3533 1.3894 1.5689 2.0841 3.6914 2.0841 6.3677zm-12.843 0c0 2.1533 0.43066 3.7939 1.292 4.9219 0.86133 1.1279 2.1277 1.6919 3.7991 1.6919s2.9403-0.5614 3.8068-1.6842c0.86646-1.1228 1.2997-2.766 1.2997-4.9296 0-2.1431-0.43322-3.7709-1.2997-4.8834-0.86646-1.1126-2.1456-1.6688-3.8375-1.6688-1.6714 0-2.9326 0.54858-3.7837 1.6458-0.85108 1.0972-1.2766 2.7327-1.2766 4.9065zm24.056 8.7517c-2.4404 0-4.3297-0.75109-5.6678-2.2533-1.3381-1.5022-2.0072-3.6273-2.0072-6.3754 0-2.8198 0.67931-4.9988 2.038-6.5369 1.3586-1.5381 3.2941-2.3071 5.8063-2.3071 0.81006 0 1.6201 0.087157 2.4302 0.26148 0.81006 0.17432 1.4458 0.37939 1.9072 0.61523l-0.78442 2.1687c-0.56397-0.22559-1.1792-0.41272-1.8457-0.5614-0.66651-0.14868-1.2561-0.22302-1.7688-0.22302-3.4248 0-5.1372 2.1841-5.1372 6.5522 0 2.0713 0.41784 3.6606 1.2535 4.7681 0.8357 1.1074 2.0738 1.6611 3.7145 1.6611 1.4048 0 2.8455-0.30249 4.322-0.90747v2.261c-1.1279 0.58448-2.5481 0.87671-4.2605 0.87671zm10.782-8.9363c0.44092-0.62549 1.1125-1.4458 2.0149-2.4609l5.4448-5.7678h3.03l-6.8291 7.1829 7.3059 9.6746h-3.0916l-5.9524-7.9673-1.9226 1.6611v6.3062h-2.5225v-23.933h2.5225v12.689c0 0.56397-0.041015 1.4355-0.12305 2.6147h0.12305zm20.118 8.9363c-2.4404 0-4.3297-0.75109-5.6678-2.2533-1.3381-1.5022-2.0072-3.6273-2.0072-6.3754 0-2.8198 0.67932-4.9988 2.038-6.5369 1.3586-1.5381 3.2941-2.3071 5.8063-2.3071 0.81006 0 1.6201 0.087157 2.4302 0.26148 0.81006 0.17432 1.4458 0.37939 1.9072 0.61523l-0.78442 2.1687c-0.56397-0.22559-1.1792-0.41272-1.8457-0.5614-0.66651-0.14868-1.2561-0.22302-1.7688-0.22302-3.4248 0-5.1372 2.1841-5.1372 6.5522 0 2.0713 0.41784 3.6606 1.2535 4.7681 0.8357 1.1074 2.0738 1.6611 3.7145 1.6611 1.4048 0 2.8455-0.30249 4.322-0.90747v2.261c-1.1279 0.58448-2.5481 0.87671-4.2605 0.87671zm19.795-0.30762v-10.905c0-1.374-0.31274-2.3994-0.93823-3.0762-0.62549-0.67676-1.6047-1.0151-2.9377-1.0151-1.7739 0-3.0685 0.48193-3.8837 1.4458-0.81519 0.96387-1.2228 2.543-1.2228 4.7373v8.8132h-2.5532v-23.933h2.5532v7.2444c0 0.87159-0.041015 1.5945-0.12305 2.1687h0.15381c0.50244-0.81006 1.2176-1.4484 2.1456-1.9149s1.9867-0.69983 3.1761-0.69983c2.061 0 3.6068 0.48962 4.6373 1.4689s1.5458 2.5353 1.5458 4.6681v10.997h-2.5532zm18.165 0l-0.50757-2.3994h-0.12305c-0.84082 1.0562-1.6791 1.7714-2.5148 2.1456-0.8357 0.37427-1.879 0.5614-3.13 0.5614-1.6714 0-2.9813-0.43066-3.9298-1.292s-1.4227-2.0867-1.4227-3.676c0-3.4043 2.7224-5.1885 8.1672-5.3525l2.8608-0.092286v-1.0459c0-1.3228-0.28454-2.2994-0.85364-2.9301-0.5691-0.63062-1.4791-0.94592-2.7301-0.94592-1.4048 0-2.9941 0.43066-4.7681 1.292l-0.78442-1.9534c0.83057-0.45117 1.7406-0.80493 2.7301-1.0613 0.98951-0.25635 1.9816-0.38452 2.9762-0.38452 2.0098 0 3.4991 0.44604 4.4681 1.3381 0.969 0.8921 1.4535 2.3225 1.4535 4.2913v11.505h-1.8918zm-5.7678-1.7996c1.5894 0 2.8378-0.43579 3.7452-1.3074 0.90748-0.87159 1.3612-2.0918 1.3612-3.6606v-1.5227l-2.5532 0.10767c-2.0303 0.071778-3.494 0.38708-4.3912 0.94592-0.89722 0.55884-1.3458 1.4278-1.3458 2.6071 0 0.92286 0.27942 1.6252 0.83826 2.1072 0.55884 0.48194 1.3407 0.7229 2.3456 0.7229zm15.473 1.7996h-2.5532v-16.857h2.5532v16.857zm-2.7686-21.426c0-0.58448 0.14355-1.0126 0.43066-1.2843 0.28711-0.27173 0.64599-0.40759 1.0767-0.40759 0.41016 0 0.76391 0.13843 1.0613 0.41528 0.29736 0.27686 0.44604 0.70239 0.44604 1.2766s-0.14868 1.0023-0.44604 1.2843c-0.29736 0.28198-0.65112 0.42297-1.0613 0.42297-0.43067 0-0.78955-0.14099-1.0767-0.42297-0.28711-0.28198-0.43066-0.71008-0.43066-1.2843zm19.718 21.426v-10.905c0-1.374-0.31274-2.3994-0.93823-3.0762-0.62549-0.67676-1.6047-1.0151-2.9377-1.0151-1.7637 0-3.0557 0.4768-3.876 1.4304s-1.2305 2.5276-1.2305 4.7219v8.844h-2.5532v-16.857h2.0764l0.41528 2.3071h0.12305c0.52295-0.83057 1.2561-1.474 2.1995-1.9303s1.9944-0.68445 3.1531-0.68445c2.0303 0 3.5581 0.48962 4.5835 1.4689s1.5381 2.5455 1.5381 4.6989v10.997h-2.5532zm25.994-20.472c-2.4712 0-4.422 0.82287-5.8524 2.4686-1.4304 1.6458-2.1456 3.899-2.1456 6.7599 0 2.9429 0.68957 5.2167 2.0687 6.8214s3.3453 2.4071 5.8986 2.4071c1.5689 0 3.3581-0.28198 5.3679-0.84595v2.2917c-1.5586 0.58448-3.4812 0.87671-5.7678 0.87671-3.312 0-5.8678-1.0049-7.6674-3.0146-1.7996-2.0098-2.6993-4.8655-2.6993-8.5671 0-2.3174 0.43322-4.3476 1.2997-6.0908 0.86646-1.7432 2.1174-3.0864 3.7529-4.0298 1.6355-0.94336 3.5607-1.415 5.7755-1.415 2.3584 0 4.4194 0.43066 6.1831 1.292l-1.1074 2.2456c-1.7022-0.79981-3.4043-1.1997-5.1064-1.1997zm17.55 3.3069c0.74854 0 1.4202 0.061523 2.0149 0.18457l-0.35376 2.3687c-0.69727-0.15381-1.3125-0.23071-1.8457-0.23071-1.3638 0-2.5301 0.5537-3.4991 1.6611-0.969 1.1074-1.4535 2.4866-1.4535 4.1375v9.0439h-2.5532v-16.857h2.1072l0.29224 3.1223h0.12305c0.62549-1.0972 1.3791-1.9431 2.261-2.5378 0.88184-0.59473 1.8508-0.89209 2.907-0.89209zm11.659 17.473c-2.4917 0-4.4579-0.75878-5.8986-2.2764s-2.161-3.6247-2.161-6.3215c0-2.7173 0.66906-4.8757 2.0072-6.4753 1.3381-1.5996 3.1351-2.3994 5.391-2.3994 2.1123 0 3.7837 0.6947 5.0142 2.0841 1.2305 1.3894 1.8457 3.2223 1.8457 5.4987v1.615h-11.613c0.05127 1.979 0.55114 3.4812 1.4996 4.5066 0.94849 1.0254 2.284 1.5381 4.0067 1.5381 1.815 0 3.6094-0.37939 5.3833-1.1382v2.2764c-0.90235 0.38965-1.756 0.66907-2.5609 0.83826-0.80494 0.16919-1.7765 0.25378-2.9147 0.25378zm-0.69214-15.335c-1.3535 0-2.4327 0.44091-3.2377 1.3228-0.80494 0.88184-1.2792 2.102-1.4227 3.6606h8.8132c0-1.6099-0.35888-2.8429-1.0767-3.6991-0.71778-0.8562-1.7432-1.2843-3.0762-1.2843zm22.718 12.766h-0.13843c-1.1792 1.7124-2.9429 2.5686-5.291 2.5686-2.2046 0-3.9196-0.75365-5.1449-2.261s-1.838-3.6504-1.838-6.4292c0-2.7788 0.61523-4.9372 1.8457-6.4753 1.2305-1.5381 2.9429-2.3071 5.1372-2.3071 2.2866 0 4.04 0.83056 5.2603 2.4917h0.19995l-0.10767-1.2151-0.061524-1.1843v-6.8599h2.5532v23.933h-2.0764l-0.33838-2.261zm-5.1064 0.43066c1.7432 0 3.007-0.47424 3.7914-1.4227 0.78443-0.94849 1.1766-2.4789 1.1766-4.5912v-0.53833c0-2.3892-0.39734-4.0939-1.192-5.1141-0.79468-1.0203-2.0636-1.5304-3.8068-1.5304-1.4971 0-2.6429 0.5819-3.4376 1.7457s-1.192 2.807-1.192 4.9296c0 2.1533 0.39477 3.7786 1.1843 4.8757 0.78955 1.0972 1.9482 1.6458 3.4761 1.6458zm20.057 2.1379c-2.4917 0-4.4579-0.75878-5.8986-2.2764s-2.161-3.6247-2.161-6.3215c0-2.7173 0.66906-4.8757 2.0072-6.4753 1.3381-1.5996 3.1351-2.3994 5.391-2.3994 2.1123 0 3.7837 0.6947 5.0142 2.0841 1.2305 1.3894 1.8457 3.2223 1.8457 5.4987v1.615h-11.613c0.05127 1.979 0.55114 3.4812 1.4996 4.5066 0.94849 1.0254 2.284 1.5381 4.0067 1.5381 1.815 0 3.6094-0.37939 5.3833-1.1382v2.2764c-0.90235 0.38965-1.756 0.66907-2.5609 0.83826-0.80494 0.16919-1.7765 0.25378-2.9147 0.25378zm-0.69214-15.335c-1.3535 0-2.4327 0.44091-3.2377 1.3228-0.80494 0.88184-1.2792 2.102-1.4227 3.6606h8.8132c0-1.6099-0.35888-2.8429-1.0767-3.6991-0.71778-0.8562-1.7432-1.2843-3.0762-1.2843zm22.779 15.027v-10.905c0-1.374-0.31274-2.3994-0.93823-3.0762s-1.6047-1.0151-2.9377-1.0151c-1.7637 0-3.0557 0.4768-3.876 1.4304-0.82032 0.95362-1.2305 2.5276-1.2305 4.7219v8.844h-2.5532v-16.857h2.0764l0.41528 2.3071h0.12305c0.52295-0.83057 1.2561-1.474 2.1995-1.9303s1.9944-0.68445 3.1531-0.68445c2.0303 0 3.5581 0.48962 4.5835 1.4689s1.5381 2.5455 1.5381 4.6989v10.997h-2.5532zm13.243-1.7996c0.45118 0 0.88696-0.033324 1.3074-0.099975 0.42041-0.066651 0.75366-0.13586 0.99976-0.20764v1.9534c-0.27686 0.1333-0.68444 0.24353-1.2228 0.33069s-1.0228 0.13074-1.4535 0.13074c-3.2608 0-4.8911-1.7175-4.8911-5.1526v-10.028h-2.4148v-1.2305l2.4148-1.0613 1.0767-3.5991h1.4766v3.9067h4.8911v1.9841h-4.8911v9.9207c0 1.0151 0.24096 1.7944 0.7229 2.3379s1.1433 0.81518 1.9841 0.81518zm8.2288 1.7996h-2.5532v-16.857h2.5532v16.857zm-2.7686-21.426c0-0.58448 0.14355-1.0126 0.43066-1.2843 0.28711-0.27173 0.64599-0.40759 1.0767-0.40759 0.41016 0 0.76391 0.13843 1.0613 0.41528 0.29736 0.27686 0.44604 0.70239 0.44604 1.2766s-0.14868 1.0023-0.44604 1.2843c-0.29736 0.28198-0.65112 0.42297-1.0613 0.42297-0.43067 0-0.78955-0.14099-1.0767-0.42297-0.28711-0.28198-0.43066-0.71008-0.43066-1.2843zm18.549 21.426l-0.50757-2.3994h-0.12305c-0.84082 1.0562-1.6791 1.7714-2.5148 2.1456-0.8357 0.37427-1.879 0.5614-3.13 0.5614-1.6714 0-2.9813-0.43066-3.9298-1.292s-1.4227-2.0867-1.4227-3.676c0-3.4043 2.7224-5.1885 8.1672-5.3525l2.8608-0.092286v-1.0459c0-1.3228-0.28454-2.2994-0.85364-2.9301-0.5691-0.63062-1.4791-0.94592-2.7301-0.94592-1.4048 0-2.9941 0.43066-4.7681 1.292l-0.78442-1.9534c0.83057-0.45117 1.7406-0.80493 2.7301-1.0613 0.98951-0.25635 1.9816-0.38452 2.9762-0.38452 2.0098 0 3.4991 0.44604 4.4681 1.3381 0.969 0.8921 1.4535 2.3225 1.4535 4.2913v11.505h-1.8918zm-5.7678-1.7996c1.5894 0 2.8378-0.43579 3.7452-1.3074 0.90748-0.87159 1.3612-2.0918 1.3612-3.6606v-1.5227l-2.5532 0.10767c-2.0303 0.071778-3.494 0.38708-4.3912 0.94592-0.89722 0.55884-1.3458 1.4278-1.3458 2.6071 0 0.92286 0.27942 1.6252 0.83826 2.1072 0.55884 0.48194 1.3407 0.7229 2.3456 0.7229zm15.473 1.7996h-2.5532v-23.933h2.5532v23.933zm16.288-4.5989c0 1.5689-0.58447 2.7788-1.7534 3.6299-1.169 0.85108-2.8096 1.2766-4.9219 1.2766-2.2354 0-3.9785-0.35376-5.2295-1.0613v-2.3687c0.81006 0.41016 1.6791 0.73315 2.6071 0.96899s1.8226 0.35376 2.684 0.35376c1.333 0 2.3584-0.21277 3.0762-0.6383s1.0767-1.0741 1.0767-1.9457c0-0.65625-0.28454-1.2176-0.85364-1.6842s-1.6791-1.0177-3.33-1.6534c-1.5689-0.58448-2.684-1.0946-3.3453-1.5304s-1.1536-0.93054-1.4766-1.4843c-0.323-0.55371-0.4845-1.2151-0.4845-1.9841 0-1.374 0.55883-2.4584 1.6765-3.2531 1.1177-0.79468 2.6506-1.192 4.5989-1.192 1.815 0 3.5889 0.36914 5.3218 1.1074l-0.90747 2.0764c-1.6919-0.69727-3.2248-1.0459-4.5989-1.0459-1.21 0-2.1226 0.1897-2.7378 0.56909-0.61524 0.3794-0.92285 0.90234-0.92285 1.5688 0 0.45117 0.11536 0.83569 0.34607 1.1536 0.23071 0.31787 0.60241 0.62036 1.1151 0.90747s1.4971 0.70239 2.9531 1.2458c1.9995 0.72803 3.3505 1.4612 4.0529 2.1995 0.7024 0.73828 1.0536 1.6663 1.0536 2.7839z" fill="#182650" fill-rule="nonzero"/>
            </g>
          </g>
        </g>
      </svg>
      <span class='buv-u-visually-hidden'>${getText('text.motto')}</span>
    `;
  }*/

  function logoWithBranding () {
    return html`
    <svg class='buv-qa-logo--branded  buv-c-logo--medium' version="1.1" viewBox="0 0 113 16" xmlns="http://www.w3.org/2000/svg">
      <embed src="https://www.pku.edu.cn/Uploads/Picture/2019/12/26/s5e04176fbbfa3.png" style="display:block;width:114px;height:32px" />
    </svg>
    <span class='buv-u-visually-hidden'>${getText('text.motto')}</span>
  `;
  }

  /*const BlockcertsLogo = ({ className, showMotto = false } = {}) => {
    return html`
    ${CSS}
    <a href='https://www.blockcerts.org' title='${getText('text.blockcertsHint')}' class$='buv-c-logo  ${className}'>
      ${
    showMotto
      ? logoWithBranding()
      : simpleLogo()
  }
    </a>`;
  };*/

  const BlockcertsLogo = ({ className, showMotto = false } = {}) => {
    return html`
  ${CSS$c}
  <a href='https://www.pku.edu.cn' title='${getText('text.blockcertsHint')}' class$='buv-c-logo  ${className}'>
    ${
  showMotto
    ? logoWithBranding()
    : simpleLogo()
}
  </a>`;
  };

  const Footer = ({ forceInPlace = false, interactive = false, theme } = {}) => {
    const classes = [
      'buv-c-footer',
      forceInPlace ? 'buv-c-footer--forced' : '',
      theme === DARK ? 'buv-c-footer--dark' : ''
    ].join(' ');

    return html`
  ${CSS$b}
  <footer class$='${classes}'>
    ${interactive
    ? html`<section>
      <buv-file-upload></buv-file-upload>
      <buv-verify-other-certificate></buv-verify-other-certificate>
    </section>`
    : ''
}
    ${BlockcertsLogo()}
  </footer>`;
  };

  const mapStateToProps$9 = (state) => ({
    theme: getTheme(state)
  });

  const ownProps$4 = {
    forceInPlace: Boolean,
    interactive: Boolean
  };

  const FooterContainer = connector(Footer, { mapStateToProps: mapStateToProps$9, ownProps: ownProps$4 });

  window.customElements.define('buv-footer', FooterContainer);

  var CSS$d = html`<style>.buv-o-overlay{z-index:100;box-shadow:0 0 30px rgba(0,0,0,0.25);background-color:#fff}.buv-c-modal{position:fixed;width:100%;height:100%;background-color:rgba(3,21,50,0.7);top:0;left:0;z-index:1000}.buv-c-modal.is-hidden{display:none}.buv-c-modal__content{position:fixed;top:50%;left:50%;transform:translate(-50%, -50%);width:100vw;min-width:300px;max-width:600px;min-height:calc(600px - 50px);padding:38px 38px 98px;box-sizing:border-box}@media only screen and (max-width: 600px){.buv-c-modal__content{height:100vh;min-height:100vh}}.buv-c-modal__close-button{top:20px;right:20px}
</style>`;

  class Modal extends LitElement {
    constructor () {
      super();
      this.isOpen = false;
      this.handleClick = this.handleClick.bind(this);
    }

    static get properties () {
      return {
        isOpen: Boolean,
        onClose: Function
      };
    }

    close () {
      this.isOpen = false;
    }

    handleClick () {
      this.close();
      this._props.onClose();
    }

    _propertiesChanged (props, changedProps, prevProps) {
      this._props = props;
      super._propertiesChanged(props, changedProps, prevProps);
    }

    _render () {
      const classes = [
        'buv-c-modal',
        'buv-qa-modal',
        this.isOpen ? '' : 'is-hidden'
      ].join(' ');

      return html`
      ${CSS$d}
      <div class$='${classes}' onclick='${this.handleClick}'>
        <div class='buv-c-modal__content  buv-o-overlay' onclick='${e => { e.stopPropagation(); }}'>
          ${CloseButton({
    className: 'buv-c-modal__close-button',
    onClick: this.handleClick
  })}
          <slot></slot>
        </div>  
      </div>
    `;
    }
  }

  window.customElements.define('buv-modal', Modal);

  var CSS$e = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-badge{position:relative}.buv-c-badge::before{content:'';position:absolute;left:-32px;top:0;width:12px;height:12px;background-color:#fff;border-radius:50%;-webkit-transition:all .2s ease-out;-o-transition:all .2s ease-out;transition:all .2s ease-out;z-index:2;box-sizing:content-box;box-shadow:0 2px 4px 0 rgba(22,40,55,0.21)}.buv-c-badge--medium::before{left:-38px;top:-4px;width:24px;height:24px}.buv-c-badge--large::before{width:38px;height:38px;left:-45px;top:-9px}.buv-c-verification-step{position:relative;margin:15px 0 5px;font-weight:600}.buv-c-verification-step.is-first{margin-top:0}.buv-c-verification-substep{margin:0;font-weight:400;color:rgba(3,21,50,0.7);padding:3px 0 0;line-height:1.71428571}.buv-c-verification-step.is-success::before,.buv-c-verification-step.is-failure::before{left:-38px;top:-4px;width:24px;height:24px}.buv-c-verification-substep::before{left:-28px;top:10px;width:4px;height:4px;background-color:rgba(255,255,255,0.8)}.buv-c-verification-step::after{content:'';position:absolute;z-index:3;-webkit-transition:opacity .3s ease-out .2s;-o-transition:opacity .3s ease-out .2s;transition:opacity .3s ease-out .2s;opacity:0}.buv-c-verification-step.is-success::after,.buv-c-verification-step.is-failure::after{opacity:1}.buv-c-verification-step.is-success::after{border:solid #2ab27b;border-width:0 2px 2px 0;left:-29px;width:5px;height:11px;transform:rotate(45deg)}.buv-c-verification-step.is-success.is-test::after{border-color:#031532}.buv-c-verification-step.is-failure::after{content:'\\274C';left:-32px;top:-1px;font-size:11px;color:#d0021b}@supports (-ms-ime-align: auto){.buv-c-verification-step.is-failure::after{left:-34px}}
</style>`;

  var CSS$f = html`<style>.buv-c-error-message{background:rgba(208,2,27,0.1);border-radius:2px;letter-spacing:.05px;padding:10px}.buv-c-error-message--solid{background:#fff;border-radius:2px 2px 0 0;margin:0}.buv-c-error-message-title{color:#d0021b;font-weight:bold;display:block;margin-bottom:5px;font-size:15px}
</style>`;

  function isMessageTranslatable (message) {
    return message.indexOf('.') > -1 && message.indexOf(' ') === -1;
  }

  function translate (message) {
    if (isMessageTranslatable(message)) {
      return getText(message);
    }
    return message;
  }

  function ErrorMessage (message, solidBackground = false) {
    if (message == null) {
      return null;
    }

    const classes = [
      'buv-c-error-message',
      'buv-qa-error-message',
      solidBackground ? 'buv-c-error-message--solid' : ''
    ].join(' ');

    return html`
    ${CSS$f}
    <p class$='${classes}'>
      <span class='buv-c-error-message-title'>${getText('errors.errorLabel')}</span>
      ${translate(message)}
    </p>`;
  }

  function VerificationStep ({ label, code, status, errorMessage, isParent, isFirst, isTestChain }) {
    // TODO: better handle this dynamic class (cf npm classnames)
    const parentStepClasses = [
      'buv-o-text-15',
      'buv-c-verification-step',
      'buv-c-badge',
      isFirst ? 'is-first' : '',
      `is-${status}`,
      isTestChain ? 'is-test' : ''
    ].join(' ');

    let innerHTML;
    if (isParent) {
      innerHTML = html`${CSS$e}<dt class$='${parentStepClasses}'>${label}</dt>`;
    } else {
      innerHTML = html`${CSS$e}<dd class='buv-c-verification-step  buv-c-verification-substep  buv-o-text-12'>
      ${label}
      ${ErrorMessage(errorMessage)}
    </dd>`;
    }
    return html`${innerHTML}`;
  }

  var CSS$g = html`<style>.buv-o-link{cursor:pointer;text-decoration:none;color:currentColor}.buv-o-link__text--underline{border-bottom:1px solid}.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-badge{position:relative}.buv-c-badge::before{content:'';position:absolute;left:-32px;top:0;width:12px;height:12px;background-color:#fff;border-radius:50%;-webkit-transition:all .2s ease-out;-o-transition:all .2s ease-out;transition:all .2s ease-out;z-index:2;box-sizing:content-box;box-shadow:0 2px 4px 0 rgba(22,40,55,0.21)}.buv-c-badge--medium::before{left:-38px;top:-4px;width:24px;height:24px}.buv-c-badge--large::before{width:38px;height:38px;left:-45px;top:-9px}.buv-c-verification-step{position:relative;margin:15px 0 5px;font-weight:600}.buv-c-verification-step.is-first{margin-top:0}.buv-c-verification-substep{margin:0;font-weight:400;color:rgba(3,21,50,0.7);padding:3px 0 0;line-height:1.71428571}.buv-c-verification-step.is-success::before,.buv-c-verification-step.is-failure::before{left:-38px;top:-4px;width:24px;height:24px}.buv-c-verification-substep::before{left:-28px;top:10px;width:4px;height:4px;background-color:rgba(255,255,255,0.8)}.buv-c-verification-step::after{content:'';position:absolute;z-index:3;-webkit-transition:opacity .3s ease-out .2s;-o-transition:opacity .3s ease-out .2s;transition:opacity .3s ease-out .2s;opacity:0}.buv-c-verification-step.is-success::after,.buv-c-verification-step.is-failure::after{opacity:1}.buv-c-verification-step.is-success::after{border:solid #2ab27b;border-width:0 2px 2px 0;left:-29px;width:5px;height:11px;transform:rotate(45deg)}.buv-c-verification-step.is-success.is-test::after{border-color:#031532}.buv-c-verification-step.is-failure::after{content:'\\274C';left:-32px;top:-1px;font-size:11px;color:#d0021b}@supports (-ms-ime-align: auto){.buv-c-verification-step.is-failure::after{left:-34px}}.buv-c-final-verification-step{white-space:nowrap;opacity:0;position:relative;font-weight:600;font-size:15px;color:#031532;margin-top:15px}.buv-c-final-verification-step.is-success{font-size:21px;color:#2ab27b;line-height:19px}.buv-c-final-verification-step--standalone{margin-top:0}.buv-c-final-verification-step.is-test,.buv-c-final-verification-step--standalone.is-success{font-size:15px;color:#031532}.buv-c-final-verification-step.is-failure{font-size:13px;font-weight:400}.buv-c-verification-step__description{margin:0}.buv-c-final-verification-step.is-visible{opacity:1}.buv-c-final-verification-step.is-visible::after{opacity:1}.buv-c-final-verification-step::after{position:absolute;content:'';height:26px;width:23px;left:-37px;top:-3px;background-image:url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjBweCIgaGVpZ2h0PSIyM3B4IiB2aWV3Qm94PSIwIDAgMjAgMjMiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgICA8ZyBpZD0iVmVyaWZpY2F0aW9uIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMSIgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj4KICAgICAgICA8ZyBpZD0iMyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTI1NC4wMDAwMDAsIC00NzQuMDAwMDAwKSIgZmlsbD0iIzJBQjI3QiI+CiAgICAgICAgICAgIDxnIGlkPSJHcm91cCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjQ4LjAwMDAwMCwgNDY5LjAwMDAwMCkiPgogICAgICAgICAgICAgICAgPHBhdGggZD0iTTE2LDUgTDYsOS4xODE4MTgxOCBMNiwxNS40NTQ1NDU1IEM2LDIxLjI1NjgxODIgMTAuMjY2NjY2NywyNi42ODI3MjczIDE2LDI4IEMyMS43MzMzMzMzLDI2LjY4MjcyNzMgMjYsMjEuMjU2ODE4MiAyNiwxNS40NTQ1NDU1IEwyNiw5LjE4MTgxODE4IEwxNiw1IEwxNiw1IFogTTksMTcuNzUzNzE1NSBMMTAuNTI3NSwxNi4yNTY5MDAyIEwxMy4zMzMzMzMzLDE4Ljk5NTc1MzcgTDIwLjQ3MjUsMTIgTDIyLDEzLjUwNzQzMSBMMTMuMzMzMzMzMywyMiBMOSwxNy43NTM3MTU1IFoiIGlkPSJTaGFwZSI+PC9wYXRoPgogICAgICAgICAgICA8L2c+CiAgICAgICAgPC9nPgogICAgPC9nPgo8L3N2Zz4=");background-repeat:no-repeat;background-position:center;background-size:contain;z-index:3}.buv-c-final-verification-step.is-test::after{background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDE4IDE4IiBmaWxsPSIjRjVBNjIzIj48cGF0aCBkPSJNLjUgMTZoMTdMOSAxIC41IDE2em05LjUtMkg4di0yaDJ2MnptMC0zSDhWN2gydjR6Ii8+PC9zdmc+IA==")}.buv-c-final-verification-step.is-failure::after{content:'\\274C';font-size:17px;top:-1px;color:#d0021b;background:none}.buv-c-final-verification-step--standalone-wrapper{padding:10px;box-sizing:border-box;border-left:3px solid}.buv-c-final-verification-step--standalone-wrapper.is-success{background-color:rgba(42,178,123,0.1);border-color:#2ab27b}.buv-c-final-verification-step--standalone-wrapper.is-failure{background-color:rgba(208,2,27,0.1);border-color:#d0021b}.buv-c-final-verification-step--standalone-wrapper.is-test{background-color:rgba(245,166,35,0.1);border-color:#f5a623}.buv-c-final-verification-step--standalone{margin:0 0 5px 30px;white-space:unset}.buv-c-final-verification-step--standalone.is-failure{margin-bottom:0}.buv-c-final-verification-step--standalone::after{left:-30px}.buv-c-verification-substep.is-final{display:none;line-height:1.35}.buv-c-verification-substep.is-final.is-visible{display:block}.buv-c-verification-substep::after{display:none}.buv-u-excluded-from-flow{position:absolute}.buv-u-full-width{width:100%}
</style>`;

  function getDetails (finalStep, chain) {
    return finalStep.description
      // eslint-disable-next-line no-template-curly-in-string
      ? html`<p class='buv-c-verification-step__description  buv-qa-final-step-description'>${finalStep.description.replace('${chain}', chain)}</p>`
      : '';
  }

  function FinalVerificationStep ({
    chain = '',
    transactionLink = '',
    isTestChain,
    isVisible = false,
    finalStep = null,
    hideLink = false,
    status = false,
    standalone = false
  } = {}) {
    if (!finalStep) {
      return;
    }

    const wrapperClasses = [
      standalone ? 'buv-c-final-verification-step--standalone-wrapper' : '',
      `is-${status}`,
      isTestChain ? 'is-test' : ''
    ].join(' ');

    // TODO: better handle this dynamic class (cf npm classnames)
    const titleClasses = [
      'buv-c-final-verification-step',
      'buv-qa-final-verification-step',
      standalone ? 'buv-c-final-verification-step--standalone' : '',
      'buv-qa-verification-step',
      isVisible ? 'is-visible' : '',
      isTestChain ? 'is-test' : '',
      `is-${status}`,
      status && !standalone ? 'buv-c-badge  buv-c-badge--large' : ''
    ].join(' ');

    const detailsClasses = [
      'buv-c-verification-substep',
      !standalone ? 'buv-u-excluded-from-flow' : '',
      'buv-u-full-width',
      'buv-o-text-12',
      'is-final',
      isVisible ? 'is-visible' : ''
    ].join(' ');

    const title = finalStep.label;
    const details = getDetails(finalStep, chain);
    const link = !hideLink && finalStep.linkText
      ? html`<a class='buv-o-link' href='${transactionLink}' hidden?='${!transactionLink}'>
        <span class='buv-o-link__text--underline  buv-qa-transaction-link'>${finalStep.linkText}</span>
      </a>`
      : '';

    return html`
    ${CSS$g}
    <div class$='${wrapperClasses}'>
      <dt class$='${titleClasses}'>${title}</dt>
      <dd class$='${detailsClasses}'>
        ${details}
        ${link}
      </dd>
      <slot></slot>
    </div>
  `;
  }

  function getVerificationStatus (state) {
    return state.verificationStatus;
  }

  function getShowVerificationModal (state) {
    return state.showVerificationModal;
  }

  const mapStateToProps$a = (state) => ({
    finalStep: getFinalStep(state),
    chain: getChain(state),
    transactionLink: getTransactionLink(state),
    isTestChain: isTestChain(state),
    status: getVerificationStatus(state)
  });

  const ownProps$5 = {
    isVisible: Boolean,
    hideLink: Boolean,
    standalone: Boolean
  };

  const FinalVerificationStepContainer = connector(FinalVerificationStep, { mapStateToProps: mapStateToProps$a, ownProps: ownProps$5 });

  window.customElements.define('buv-final-verification-step', FinalVerificationStepContainer);

  var CSS$h = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-o-link{cursor:pointer;text-decoration:none;color:currentColor}.buv-o-link__text--underline{border-bottom:1px solid}.buv-c-substeps-list__link::after{content:'';width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:4px solid #768087;display:inline-block;vertical-align:2px;margin:0 6px;-webkit-transition:-webkit-transform .3s ease-in;-o-transition:transform .3s ease-in;transition:transform .3s ease-in}.buv-c-substeps-list__link.is-open::after{transform:rotate(180deg)}.buv-c-substeps-list__list{max-height:0;overflow:hidden;-webkit-transition:max-height .3s ease-in;-o-transition:max-height .3s ease-in;transition:max-height .3s ease-in;padding-left:50px;margin-left:-50px;padding-top:5px}.buv-c-substeps-list__list.is-open{height:auto}
</style>`;

  class SubstepsList extends LitElement {
    constructor () {
      super();
      this.isOpen = false;

      // 2 properties below are a trick to manage the force opening without triggering contempt from LitElement
      // one allows us to know we have forced an opening
      // the second one allows us to make sure isOpen is at the correct state.
      // We can't modify isOpen directly otherwise we get console poluted with warnings.
      this.wasForcedOpen = false;
      this.resetOpen = false;
      this.toggleOpen = this.toggleOpen.bind(this);
      // when we force open, we don't have access to the initial height, so we are forcing it onto the list after
      // its first render. We only want to do this once in the lifecycle. See ADR-005.
      this.totalHeight = 0;
      this.heightWasReset = false;
    }

    static get properties () {
      return {
        subSteps: [],
        isOpen: Boolean,
        hasError: Boolean
      };
    }

    toggleOpen () {
      if (this.wasForcedOpen && !this.resetOpen) {
        this.isOpen = true;
        this.resetOpen = true;
      }
      this.isOpen = !this.isOpen;
    }

    _didRender () {
      if (!this.totalHeight) {
        const listParent = this.shadowRoot.querySelectorAll('.buv-js-substeps-list__list')[0];
        const listElements = listParent ? Array.from(listParent.childNodes) : [];
        this.totalHeight = listElements.reduce((acc, element) => {
          if (element.getBoundingClientRect) {
            return acc + element.getBoundingClientRect().height;
          }
          return acc;
        }, 0);

        if (this.wasForcedOpen && !this.heightWasReset) {
          // only do it once.
          listParent.style.maxHeight = this.totalHeight + 'px';
          this.heightWasReset = true;
        }
      }
    }

    _render ({ subSteps, hasError }) {
      if (!subSteps) {
        return null;
      }

      let isOpen = this.isOpen;

      if (!this.wasForcedOpen && hasError) {
        isOpen = true;
        this.wasForcedOpen = true;
      }

      const renderedSubSteps = subSteps.filter(subStep => subStep.status);
      const itemsLength = renderedSubSteps.length;
      // TODO: translate with plural Item
      const itemString = `${itemsLength} ${getText('text', 'item', true, itemsLength)}`;
      // we are setting the closing height to 1px so that we can trigger a closing action on the first click on hide button.
      const maxHeight = isOpen ? this.totalHeight : 1;

      // TODO: better handle this dynamic class (cf npm classnames)
      const linkClasses = [
        'buv-o-text-12',
        'buv-o-link',
        'buv-c-substeps-list__link',
        isOpen ? 'is-open' : ''
      ].join(' ');

      const listClasses = [
        'buv-c-substeps-list__list',
        'buv-js-substeps-list__list',
        isOpen ? 'is-open' : ''
      ].join(' ');

      return html`
    ${CSS$h}
    <a title='${getText('text.substepsListHint')}' onclick='${this.toggleOpen}' class$='${linkClasses}'>
      <span class='buv-o-link__text--underline'>${isOpen ? getText('text.substepsListClose') : itemString}</span>
    </a>
    <div class$='${listClasses}' style$='max-height: ${maxHeight}px'>
      ${renderedSubSteps.map(subStep => html`${VerificationStep(subStep)}`)}
    </div>
    `;
    }
  }

  window.customElements.define('buv-substeps-list', SubstepsList);

  var CSS$i = html`<style>.buv-c-verification-process{position:relative}.buv-c-verification-progress-bar{position:absolute;left:13px;top:0;width:14px;display:flex;flex-direction:column;height:100%}.buv-c-verification-progress-bar__tube{min-height:14px;transition:flex .4s ease-in-out, max-height .4s ease-in;background-color:#2ab27b;border-radius:7px;flex-grow:0;opacity:0}.buv-c-verification-progress-bar__tube.has-started{flex-grow:1;opacity:1}.buv-c-verification-progress-bar__tube.is-test{background-color:#d8d8d8}.buv-c-verification-progress-bar__tube.has-errored{background-color:#d0021b}.buv-c-verification-progress-bar.no-transition{-webkit-transition:none;-moz-transition:none;-o-transition:none;transition:none}.buv-c-verification-process__step-list{padding-left:46px;margin-top:0}.buv-u-visually-hidden{position:absolute !important;clip:rect(1px 1px 1px 1px);clip:rect(1px, 1px, 1px, 1px);padding:0 !important;border:0 !important;height:1px !important;width:1px !important;overflow:hidden}
</style>`;

  class VerificationProcess extends LitElement {
    static get properties () {
      return {
        steps: [],
        transactionLink: String,
        hasError: Boolean,
        isTestChain: Boolean
      };
    }

    verificationInProgressTemplate () {
      return html`
        <span class='buv-u-visually-hidden'>${getText('text.verificationStepProgress')}</span>
        <svg width='20' height='7' viewBox='0 0 120 30' xmlns='http://www.w3.org/2000/svg'><circle cx='15' cy='15' r='15'><animate attributeName='r' from='15' to='15' begin='0s' dur='0.8s' values='15;9;15' calcMode='linear' repeatCount='indefinite'/><animate attributeName='fill-opacity' from='1' to='1' begin='0s' dur='0.8s' values='1;.5;1' calcMode='linear' repeatCount='indefinite'/></circle><circle cx='60' cy='15' r='9' fill-opacity=''.9'><animate attributeName='r' from='9' to='9' begin='0s' dur='0.8s' values='9;15;9' calcMode='linear' repeatCount='indefinite'/><animate attributeName='fill-opacity' from=''.5' to='.5' begin='0s' dur='0.8s' values='.5;1;.5' calcMode='linear' repeatCount='indefinite'/></circle><circle cx='105' cy='15' r='15'><animate attributeName='r' from='15' to='15' begin='0s' dur='0.8s' values='15;9;15' calcMode='linear' repeatCount='indefinite'/><animate attributeName='fill-opacity' from='1' to='1' begin='0s' dur='0.8s' values='1;.5;1' calcMode='linear' repeatCount='indefinite'/></circle></svg>
    `;
    }

    _didRender () {
      if (!this.listElement) {
        this.listElement = this.shadowRoot.querySelectorAll('.buv-js-verification-process__step-list')[0];
      }
    }

    _render ({ steps, transactionLink, hasError, isTestChain }) {
      const innerHTML = steps
        .filter(step => step.status !== VERIFICATION_STATUS.DEFAULT)
        .map((step, i) => html`
      ${VerificationStep({
    ...step,
    isParent: true,
    isFirst: i === 0,
    isTestChain
  })}
      ${step.status === VERIFICATION_STATUS.STARTED
    ? html`${this.verificationInProgressTemplate()}`
    : html`<buv-substeps-list subSteps='${step.subSteps}' hasError?='${hasError}'></buv-substeps-list>`
}
    `);

      // TODO: better handle this dynamic class (cf npm classnames)
      const progressBarClasses = [
        'buv-c-verification-progress-bar__tube',
        'buv-qa-verification-progress-bar__tube',
        hasError ? 'has-errored' : '',
        isTestChain ? 'is-test' : '',
        innerHTML.length ? 'has-started' : ''
      ].join(' ');

      let maxHeight = `${this.listElement ? this.listElement.getBoundingClientRect().height : 0}px`;

      const allStepsAreRendered = steps.every(step => step.status === VERIFICATION_STATUS.SUCCESS) ||
        steps.some(step => step.status === VERIFICATION_STATUS.FAILURE);
      if (allStepsAreRendered) {
        maxHeight = '100%';
      }

      return html`
    ${CSS$i}
    <section class='buv-c-verification-process'>
      <div class='buv-c-verification-progress-bar' >
        <div class$='${progressBarClasses}' style$='max-height: ${maxHeight}'></div>
      </div>  
      <dl class='buv-c-verification-process__step-list  buv-js-verification-process__step-list'>
        ${innerHTML}
        <buv-final-verification-step isVisible='${allStepsAreRendered && !hasError}'></buv-final-verification-step>
      </dl>
    </section>
  `;
    }
  }

  window.customElements.define('buv-verification-process-raw', VerificationProcess);

  // wrap VerificationProcess in order to plug into Container
  // necessary trade-off to deal with class component in the store connector
  function VerificationProcessWrapper ({ steps, transactionLink, hasError, isTestChain }) {
    return html`<buv-verification-process-raw
    steps='${steps}'
    hasError?='${hasError}'
    isTestChain?='${isTestChain}'
    style='max-width: 100%;'
    ></buv-verification-process-raw>`;
  }

  const mapStateToProps$b = (state) => {
    return {
      steps: JSON.parse(JSON.stringify(getVerifiedSteps(state))),
      isTestChain: isTestChain(state),
      hasError: getHasError(state)
    };
  };

  const VerificationProcessContainer = connector(VerificationProcessWrapper, { mapStateToProps: mapStateToProps$b });

  window.customElements.define('buv-verification-process', VerificationProcessContainer);

  function VerificationModal ({ isOpen, onClose }) {
    return html`
    ${CSS$8}
    <buv-modal isOpen?='${isOpen}' onClose='${onClose}'>
      <div class='buv-c-verification-modal__content'>
        <buv-card-certificate class='buv-c-verification-modal__certificate' hideRecordLink hideVerifyButton></buv-card-certificate>
        <hr class='buv-c-verification-modal__separator'/>
        <buv-verification-process class='buv-c-verification-modal__process'></buv-verification-process>
      </div>
      <buv-footer forceInPlace></buv-footer>
    </buv-modal>
  `;
  }

  const mapStateToProps$c = (state) => ({
    isOpen: getShowVerificationModal(state)
  });

  const mapDispatchToProps$5 = {
    onClose: showVerificationModal$1.bind(null, false)
  };

  const VerificationModalContainer = connector(VerificationModal, { mapDispatchToProps: mapDispatchToProps$5, mapStateToProps: mapStateToProps$c });

  window.customElements.define('buv-verification-modal', VerificationModalContainer);

  var CSS$j = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-drag-and-drop__droparea{z-index:100;background-color:rgba(0,0,0,0.1);display:none;position:absolute;top:0;left:0;width:100%;height:100%}.buv-c-drag-and-drop__droparea.is-active{display:block}
</style>`;

  function isJson (file) {
    const { name } = file;
    return name.substr(name.length - 4, 4) === 'json';
  }

  class DragAndDrop extends LitElement {
    constructor () {
      super();
      this.isDraggedOver = false;
      this.denyDrop = false;
      this.handleDragEnter = this.handleDragEnter.bind(this);
      this.handleDragOver = this.handleDragOver.bind(this);
      this.handleDragLeave = this.handleDragLeave.bind(this);
      this.handleDrop = this.handleDrop.bind(this);
    }

    static get properties () {
      return {
        isDraggedOver: Boolean,
        denyDrop: Boolean,
        onDrop: Function
      };
    }

    handleDragEnter () {
      this.isDraggedOver = true;
    }

    handleDragOver (e) {
      e.preventDefault();
    }

    handleDragLeave () {
      this.isDraggedOver = false;
    }

    handleDrop (e) {
      e.preventDefault();
      this.isDraggedOver = false;

      const file = e.dataTransfer.files[0];
      this.denyDrop = !isJson(file);

      if (this.denyDrop) {
        return;
      }

      this._props.onDrop(file);
    }

    _propertiesChanged (props, changedProps, prevProps) {
      this._props = props;
      super._propertiesChanged(props, changedProps, prevProps);
    }

    _render () {
      const classes = [
        'buv-c-drag-and-drop__droparea',
        this.isDraggedOver ? 'is-active' : ''
      ].join(' ');

      const denyText = this.denyDrop ? getText('errors.invalidFormatDragAndDrop') : '';

      return html`
    ${CSS$j}
    <div ondragenter='${this.handleDragEnter}'>
      <div class$='${classes}'
        ondragover='${this.handleDragOver}'
        ondragleave='${this.handleDragLeave}'
        ondrop='${this.handleDrop}'
      ></div>
      <span>${denyText}</span>
      <slot></slot>
    </div>`;
    }
  }

  window.customElements.define('buv-drag-and-drop-raw', DragAndDrop);

  // wrap DragAndDrop in order to plug into Container
  // necessary trade-off to deal with class component in the store connector
  function DragAndDropWrapper (props) {
    return html`
  <buv-drag-and-drop-raw
    onDrop='${props.onDrop}'
  >
  <slot></slot>
</buv-drag-and-drop-raw>`;
  }

  const mapDispatchToProps$6 = {
    onDrop: uploadCertificateDefinition
  };

  const DragAndDropContainer = connector(DragAndDropWrapper, { mapDispatchToProps: mapDispatchToProps$6 });

  window.customElements.define('buv-drag-and-drop', DragAndDropContainer);

  var GlobalStyleSheet = html`<style>.buv-c-verifier-main{font-family:'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;color:#031532;position:relative}.buv-c-verifier-layout{display:flex;flex-direction:column}.buv-c-verifier-body{background-color:#fff;flex-grow:1}.buv-c-verifier-body--padded{padding:20px}
</style>`;

  var CSS$k = html`<style>.buv-o-link{cursor:pointer;text-decoration:none;color:currentColor}.buv-o-link__text--underline{border-bottom:1px solid}.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-card{position:relative;display:flex;margin-bottom:20px}.buv-c-card__img-wrapper{margin-right:1.5vw;min-width:50px;width:20%}.buv-c-card__img{max-width:100%;max-height:100%}.buv-c-card__title-wrapper{display:flex;flex-direction:column;justify-content:center}.buv-c-card__title{font-size:calc(16px + 0.5vw);margin-top:0;margin-bottom:0;font-weight:400;padding-right:100px}.buv-c-card__title--no-padding{padding:0}.buv-c-card__recipient{font-weight:600;margin:6px 0 12px}.buv-c-card__record-link{position:absolute;top:0;right:0;line-height:30px}.buv-c-card__record-link::after{content:'';border:solid currentColor;border-width:0 2px 2px 0;width:5px;height:5px;transform:rotate(-45deg);font-weight:bold;display:inline-block;margin-left:5px}.buv-c-card__verify-button{float:right}@media only screen and (max-width: 600px){.buv-c-card__title{font-size:16px}.buv-c-card__recipient{margin:6px 0}.buv-c-card__img-wrapper{margin-right:18px}}
</style>`;

  function loadImage (props) {
    return new Promise((resolve) => {
      const tester = new Image();
      tester.addEventListener('load', () => {
        resolve(html`<img src='${props.issuerLogo}' alt='${props.issuerName}' class='buv-c-card__img'/>`);
      });
      tester.addEventListener('error', () => {
        resolve(html`<p class='buv-o-text-15'>${props.issuerName}</p>`);
      });
      tester.src = props.issuerLogo;
    });
  }

  function CardCertificate (props) {
    const {
      hasCertificateDefinition,
      recipientName,
      certificateTitle,
      issuedOn,
      issueDate,
      issuerName,
      recordLink,
      hideVerifyButton
    } = props;

    let { hideRecordLink } = props;

    if (!hasCertificateDefinition) {
      return null;
    }

    if (!recordLink && !hideRecordLink) {
      hideRecordLink = true;
    }

    const titleClass = [
      'buv-c-card__title',
      hideRecordLink ? 'buv-c-card__title--no-padding' : ''
    ].join(' ');

    return html`
      ${CSS$k}
      <section class='buv-c-card'>
        <div class='buv-c-card__img-wrapper'>
          ${loadImage(props)}
        </div>
        <div class='buv-c-card__title-wrapper'>
          <h1 class$=${titleClass}>${certificateTitle}</h1>
          <h2 class$='${titleClass}  buv-c-card__recipient'>${recipientName}</h2>
          <span class='buv-o-text-12'>${getText('text.issued')} <time datetime$='${issuedOn}'>${issueDate}</time> ${getText('text.by')} ${issuerName}</span>
        </div>
      ${
  hideRecordLink
    ? ''
    : html`<a class='buv-o-text-12  buv-o-link  buv-c-card__record-link  qa-card-record-link' href='${recordLink}' target='_blank'>
    <span class='buv-o-link__text--underline'>${getText('text.viewRecord')}</span>
    </a>`
}
      </section>
      ${hideVerifyButton
    ? ''
    : html`<buv-final-verification-step class='buv-c-fullscreen-certificate__verification-status' isVisible hideLink standalone>
      <buv-verify-button type='link'>${getText('text.verifyAgain')}</buv-verify-button>
    </buv-final-verification-step>`
}
    `;
  }

  const mapStateToProps$d = (state) => ({
    hasCertificateDefinition: !!getCertificateDefinition(state),
    recipientName: getRecipientName(state),
    certificateTitle: getCertificateTitle(state),
    issueDate: getIssueDate(state),
    issuedOn: getIssuedOn(state),
    issuerName: getIssuerName(state),
    issuerLogo: getIssuerLogo(state),
    recordLink: getRecordLink(state)
  });

  const ownProps$6 = {
    hideRecordLink: Boolean,
    hideVerifyButton: Boolean
  };

  const CardCertificateContainer = connector(CardCertificate, { mapStateToProps: mapStateToProps$d, ownProps: ownProps$6 });

  window.customElements.define('buv-card-certificate', CardCertificateContainer);

  /**
   * @license
   * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
   * This code may only be used under the BSD style license found at
   * http://polymer.github.io/LICENSE.txt
   * The complete set of authors may be found at
   * http://polymer.github.io/AUTHORS.txt
   * The complete set of contributors may be found at
   * http://polymer.github.io/CONTRIBUTORS.txt
   * Code distributed by Google as part of the polymer project is also
   * subject to an additional IP rights grant found at
   * http://polymer.github.io/PATENTS.txt
   */
  /**
   * Renders the result as HTML, rather than text.
   *
   * Note, this is unsafe to use with any user-provided input that hasn't been
   * sanitized or escaped, as it may lead to cross-site-scripting
   * vulnerabilities.
   */
  const unsafeHTML = (value) => directive((part) => {
      const tmp = document.createElement('template');
      tmp.innerHTML = value;
      part.setValue(document.importNode(tmp.content, true));
  });

  var CSS$l = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-full-certificate{box-shadow:0 1px 5px rgba(0,0,0,0.15);padding:20px;background-color:#fff;display:block;font-family:serif;text-align:center;color:#49555f;font-size:12px;overflow:auto;word-wrap:break-word;max-height:calc(100vh - 150px);line-height:initial}.buv-c-full-certificate section{max-width:100%;padding:0}.buv-c-full-certificate img{max-width:100%;height:auto;width:inherit}@media only screen and (min-width: 640px){.buv-c-full-certificate{min-height:550px;font-size:16px}}.buv-c-full-certificate__button{margin-top:15px}.buv-c-full-certificate__details{display:flex;justify-content:space-between;margin-top:15px}.buv-c-full-certificate__details-list{min-width:calc(100% - 190px);width:calc(100% - 105px)}
</style>`;

  var CSS$m = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-certificate-details{display:flex;margin:0;position:relative;padding-bottom:60px}@media only screen and (max-width: 750px){.buv-c-certificate-details{flex-direction:column;padding-bottom:0}}.buv-c-certificate-details--column{flex-direction:column;padding-bottom:0}.buv-c-certificate-details__group{box-sizing:border-box;padding-right:15px;margin-top:15px}.buv-c-certificate-details__group--row{max-width:33%;margin-top:0}@media only screen and (max-width: 750px){.buv-c-certificate-details__group--row{max-width:100%}}.buv-c-certificate-details__title{margin-bottom:5px;text-transform:uppercase;font-weight:600}.buv-c-certificate-details__value{margin:0;word-break:break-all}.buv-c-certificate-details__standalone{position:absolute;bottom:0}@media only screen and (max-width: 750px){.buv-c-certificate-details__standalone{position:initial;margin-top:15px}}.buv-c-certificate-details--inline{display:inline-block;margin:0 0 5px}
</style>`;

  const isValidLink = (link) => link.indexOf(' ') === -1;

  function renderListDetail ({ title, value, isDisplayColumn, renderInline = false }) {
    const classes = [
      'buv-c-certificate-details__group',
      isDisplayColumn ? '' : 'buv-c-certificate-details__group--row'
    ].join(' ');

    const titleClasses = [
      'buv-c-certificate-details__title',
      isDisplayColumn ? '' : 'buv-o-text-11'
    ].join(' ');

    const ddClasses = [
      'buv-c-certificate-details__value',
      renderInline ? 'buv-c-certificate-details--inline' : ''
    ].join(' ');

    return html`<div class$='${classes}'>
    <dt class$='${titleClasses}'>${title}</dt>
    <dd class$='${ddClasses}'>${value}</dd>
  </div>`;
  }

  function renderTransactionId ({ title, value, transactionLink, isDisplayColumn }) {
    if (isValidLink(transactionLink)) {
      if (isDisplayColumn) {
        return renderListDetail({ title, value, isDisplayColumn, renderInline: true });
      }

      return html`
      <div class='buv-c-certificate-details__standalone  buv-o-text-11'>
        <dt class='buv-c-certificate-details__title  buv-c-certificate-details--inline'>${title}</dt>
        <dd class='buv-c-certificate-details--inline'>${value}</dd>
      </div>`;
    } else {
      return html`<span>${getText('errors.noTransactionId')}</span>`;
    }
  }

  function CertificateDetails ({
    recipientName,
    issuedOn,
    issueDate,
    issuerName,
    issuerPublicKey,
    transactionLink,
    transactionId,
    direction,
    hideRecipientName
  }) {
    const details = [];
    if (!hideRecipientName) {
      details.push({
        title: getText('text.recipient'),
        value: recipientName
      });
    }

    details.push(
      {
        title: getText('text.issueDate'),
        value: html`<time datetime$='${issuedOn}'>${issueDate}</time>`
      },
      {
        title: getText('text.issuerName'),
        value: issuerName
      },
      {
        title: getText('text.issuerPublicKey'),
        value: issuerPublicKey
      }
    );

    const isDisplayColumn = direction === 'column';
    const definitionListDetails = details.map(detail => renderListDetail({ ...detail, isDisplayColumn }));

    const classes = [
      'buv-c-certificate-details',
      'buv-o-text-13',
      isDisplayColumn ? 'buv-c-certificate-details--column' : ''
    ].join(' ');

    return html`
    ${CSS$m}
    <dl class$='${classes}'>
        ${definitionListDetails}
        ${renderTransactionId({ transactionLink, title: `${getText('text.transactionId')}:`, value: transactionId, isDisplayColumn })}
    </dl>
  `;
  }

  const mapStateToProps$e = (state) => ({
    recipientName: getRecipientName(state),
    issueDate: getIssueDate(state),
    issuedOn: getIssuedOn(state),
    issuerName: getIssuerName(state),
    issuerLogo: getIssuerLogo(state),
    transactionLink: getTransactionLink(state),
    transactionId: getTransactionId(state),
    issuerPublicKey: getIssuerPublicKey(state)
  });

  const ownProps$7 = {
    direction: String,
    hideRecipientName: Boolean
  };

  const CertificateDetailsContainer = connector(CertificateDetails, { mapStateToProps: mapStateToProps$e, ownProps: ownProps$7 });

  window.customElements.define('buv-certificate-details', CertificateDetailsContainer);

  var CSS$n = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-full-certificate{box-shadow:0 1px 5px rgba(0,0,0,0.15);padding:20px;background-color:#fff;display:block;font-family:serif;text-align:center;color:#49555f;font-size:12px;overflow:auto;word-wrap:break-word;max-height:calc(100vh - 150px);line-height:initial}.buv-c-full-certificate section{max-width:100%;padding:0}.buv-c-full-certificate img{max-width:100%;height:auto;width:inherit}@media only screen and (min-width: 640px){.buv-c-full-certificate{min-height:550px;font-size:16px}}.buv-c-full-certificate__button{margin-top:15px}.buv-c-full-certificate__details{display:flex;justify-content:space-between;margin-top:15px}.buv-c-full-certificate__details-list{min-width:calc(100% - 190px);width:calc(100% - 105px)}.buv-c-full-certificate .buv-c-full-certificate-img{max-width:125px;max-height:125px}.buv-c-full-certificate__titles::before,.buv-c-full-certificate__titles::after{content:' ';display:block;background-color:#edf1f4;width:30%;text-align:center;margin:20px auto;height:2px}.buv-c-full-certificate__title{font-weight:normal;margin:0}.buv-c-full-certificate__title--name{color:#000;font-size:30px;margin-bottom:10px}.buv-c-full-certificate__title--main{font-size:21px;margin-bottom:10px}.buv-c-full-certificate__title--sub{font-size:16px;font-style:italic}.buv-c-full-certificate__description{margin:0 0 40px;line-height:1.5}.buv-c-full-certificate-signatures{list-style-type:none;display:flex;justify-content:space-around;width:100%;margin:0 0 20px;padding:0}.buv-c-full-certificate-signatures__signature{margin-right:30px;display:flex;flex-direction:column;justify-content:center}.buv-c-full-certificate-signatures__signature:last-child{margin:0}.buv-c-full-certificate-img--secondary{max-width:150px;max-height:150px}
</style>`;

  function FullCertificateV1 ({
    hasCertificateDefinition,
    certificateImage,
    certificateTitle,
    certificateSeal,
    certificateSignatures,
    certificateSubtitle,
    certificateDescription,
    recipientName,
    issuerName
  }) {
    if (!hasCertificateDefinition) {
      return null;
    }

    const signatureList = certificateSignatures.map(signature => html`
    <li class='buv-c-full-certificate-signatures__signature'>
        <img class='buv-c-full-certificate-img--secondary' src='${signature.image}' alt='${getText('text.signed')} ${signature.jobTitle}'/>
        <span class='buv-o-text-12'>${signature.jobTitle}</span>
    </li>
  `);

    return html`
    ${CSS$n}
    <section class='buv-c-full-certificate'>
      <img class='buv-c-full-certificate-img' src='${certificateImage}' alt='${certificateTitle}'/>
      <div class='buv-c-full-certificate__titles'>
        <h1 class='buv-c-full-certificate__title  buv-c-full-certificate__title--name'>${recipientName}</h1>
        <h2 class='buv-c-full-certificate__title  buv-c-full-certificate__title--main'>${certificateTitle}</h2>
        <h3 class='buv-c-full-certificate__title  buv-c-full-certificate__title--sub'>${certificateSubtitle}</h3>
      </div>
      <p class='buv-c-full-certificate__description'>${certificateDescription}</p>
      <ul class='buv-c-full-certificate-signatures'>
        ${signatureList}
      </ul>
      <img class='buv-c-full-certificate-img--secondary' src='${certificateSeal}' alt='${getText('text.certified')} ${issuerName}'/>
    </section>
  `;
  }

  const mapStateToProps$f = (state) => ({
    hasCertificateDefinition: !!getCertificateDefinition(state),
    certificateImage: getCertificateImage(state),
    certificateTitle: getCertificateTitle(state),
    certificateSubtitle: getCertificateSubtitle(state),
    certificateDescription: getCertificateDescription(state),
    certificateSeal: getCertificateSeal(state),
    certificateSignatures: getCertificateSignatures(state),
    recipientName: getRecipientName(state),
    issuerName: getIssuerName(state)
  });

  const FullCertificateV1Container = connector(FullCertificateV1, { mapStateToProps: mapStateToProps$f });

  window.customElements.define('buv-full-certificate-v1', FullCertificateV1Container);

  function renderDisplayHTML (displayHTML) {
    return html`<section class='buv-c-full-certificate qa-full-certificate'>${unsafeHTML(displayHTML)}</section>`;
  }

  function FullCertificate ({
    hasCertificateDefinition,
    displayHTML
  }) {
    if (!hasCertificateDefinition) {
      return null;
    }

    return html`
    ${CSS$l}
    ${displayHTML ? renderDisplayHTML(displayHTML) : html`<buv-full-certificate-v1></buv-full-certificate-v1>`}
    <div class='buv-c-full-certificate__details'>
      <buv-certificate-details class='buv-c-full-certificate__details-list'></buv-certificate-details>
      <buv-final-verification-step class='buv-c-fullscreen-certificate__verification-status' isVisible hideLink standalone>
        <buv-verify-button type='link'>${getText('text.verifyAgain')}</buv-verify-button>
      </buv-final-verification-step>
    </div>
  `;
  }

  const mapStateToProps$g = (state) => ({
    hasCertificateDefinition: !!getCertificateDefinition(state),
    displayHTML: getDisplayHTML(state)
  });

  const FullCertificateContainer = connector(FullCertificate, { mapStateToProps: mapStateToProps$g });

  window.customElements.define('buv-full-certificate', FullCertificateContainer);

  var CSS$o = html`<style>.buv-o-text-11{font-size:11px}.buv-o-text-12{font-size:12px}.buv-o-text-13{font-size:13px}.buv-o-text-15{font-size:15px;line-height:20px}.buv-c-fullscreen-certificate{z-index:200;position:fixed;top:0;left:0;background-color:#fff;width:100vw;height:100vh;overflow:auto;box-sizing:border-box}@media only screen and (max-width: 750px){.buv-c-fullscreen-certificate{padding-top:170px}}.buv-c-fullscreen-certificate-header{box-shadow:0 1px 5px rgba(0,0,0,0.15);width:100%;background-color:#fff}@media only screen and (max-width: 750px){.buv-c-fullscreen-certificate-header{position:fixed;top:0;z-index:10}}.buv-c-fullscreen-certificate-header__content{max-width:1440px;margin:0 auto;padding:20px;display:flex;align-items:center;position:relative;box-sizing:border-box}@media only screen and (max-width: 750px){.buv-c-fullscreen-certificate-header__content{flex-direction:column;justify-content:left;align-items:unset}}.buv-c-fullscreen-certificate__title{margin:0 30px 0 0}@media only screen and (max-width: 750px){.buv-c-fullscreen-certificate__title{margin-bottom:10px}}.buv-c-fullscreen-certificate__close{right:20px}.buv-c-fullscreen-certificate__content{padding:20px;display:flex;max-width:1440px;margin:20px auto 0}@media only screen and (max-width: 750px){.buv-c-fullscreen-certificate__content{flex-direction:column-reverse;margin-top:0}}.buv-c-fullscreen-certificate__details{display:flex;flex-grow:1;flex-direction:column;max-width:280px;min-width:220px;margin-right:20px}@media only screen and (max-width: 750px){.buv-c-fullscreen-certificate__details{max-width:100vw;margin:20px 0 0}}.buv-c-fullscreen-certificate__verification-status{margin-bottom:15px}@media only screen and (max-width: 750px){.buv-c-fullscreen-certificate__verification-status{position:absolute;top:90px;width:calc(100% - 40px);margin:0}}.buv-c-fullscreen-certificate__details-item{margin-top:5px}.buv-c-fullscreen-certificate__separator{margin-top:30px;padding-top:30px;border-top:1px solid #f1f2f3}.buv-c-fullscreen-certificate__certificate{box-shadow:0 1px 5px rgba(0,0,0,0.15);padding:20px;background-color:#fff;font-family:serif;text-align:center;color:#49555f;font-size:12px;word-wrap:break-word;min-height:calc(100vh - 145px);box-sizing:border-box;margin:0 auto;min-width:600px;line-height:initial}@media only screen and (max-width: 750px){.buv-c-fullscreen-certificate__certificate{min-width:unset;width:100%;overflow:auto}}.buv-c-fullscreen-certificate__verify-other{margin-top:20px}
</style>`;

  function renderDisplayHTML$1 (displayHTML) {
    return html`<div class='buv-c-fullscreen-certificate__certificate  qa-fullscreen-certificate'>${unsafeHTML(displayHTML)}</div>`;
  }

  function FullScreenCertificate ({
    hasCertificateDefinition,
    recipientName,
    displayHTML,
    onClose
  }) {
    if (!hasCertificateDefinition) {
      return null;
    }

    return html`
    ${CSS$o}
    <section class='buv-c-fullscreen-certificate'>
      <header class='buv-c-fullscreen-certificate-header'>
        <div class='buv-c-fullscreen-certificate-header__content'>
          <h1 class='buv-c-fullscreen-certificate__title'>${recipientName}</h1>
          ${CloseButton({ onClick: onClose, className: 'buv-c-fullscreen-certificate__close' })}
        </div>  
      </header>
      <section class='buv-c-fullscreen-certificate__content'>
        <div class='buv-c-fullscreen-certificate__details'>
          <buv-final-verification-step class='buv-c-fullscreen-certificate__verification-status' isVisible hideLink standalone>
            <buv-verify-button type='link'>${getText('text.verifyAgain')}</buv-verify-button>
          </buv-final-verification-step>
          <buv-certificate-details direction='column' hideRecipientName></buv-certificate-details>
          <buv-metadata class='buv-c-fullscreen-certificate__details-item  buv-c-fullscreen-certificate__separator' display='plaintext'></buv-metadata>
          <buv-download-link class='buv-c-fullscreen-certificate__details-item' display='plaintext'></buv-download-link>
          <buv-social-share class='buv-c-fullscreen-certificate__details-item' display='plaintext'></buv-social-share>
          ${BlockcertsLogo({ className: 'buv-c-fullscreen-certificate__separator', showMotto: true, logoSize: 'medium' })}
          <buv-verify-other-certificate class='buv-c-fullscreen-certificate__verify-other'></buv-verify-other-certificate>
        </div>
        <div class='buv-c-fullscreen-certificate__certificate'>
          ${displayHTML ? renderDisplayHTML$1(displayHTML) : html`<buv-full-certificate-v1></buv-full-certificate-v1>`}
        </div>
      </section>
    </section>
  `;
  }

  const mapDispatchToProps$7 = {
    onClose: resetCertificateDefinition$1
  };

  const mapStateToProps$h = (state) => ({
    recipientName: getRecipientName(state),
    hasCertificateDefinition: !!getCertificateDefinition(state),
    displayHTML: getDisplayHTML(state)
  });

  const FullScreenCertificateContainer = connector(FullScreenCertificate, { mapDispatchToProps: mapDispatchToProps$7, mapStateToProps: mapStateToProps$h });

  window.customElements.define('buv-fullscreen-certificate', FullScreenCertificateContainer);

  class BlockcertsVerifier extends LitElement {
    constructor () {
      super();
      this.hasRenderedOnce = false;
    }

    static get properties () {
      return {
        onLoad: Function,
        errorMessage: String,
        hasCertificate: Boolean,
        ...APICamelCase
      };
    }

    _firstRendered () {
      this.onLoad(this._props);
      this.hasRenderedOnce = true;
    }

    _propertiesChanged (props, changedProps, prevProps) {
      this._props = props;
      super._propertiesChanged(props, changedProps, prevProps);

      if (changedProps.src !== prevProps.src && this.hasRenderedOnce) {
        this.onLoad({
          src: changedProps.src
        });
      }
    }

    renderCertificate (_props) {
      switch (_props.displayMode) {
        case FULL:
          return html`<buv-full-certificate></buv-full-certificate>`;
        case FULLSCREEN:
          return html`<buv-fullscreen-certificate></buv-fullscreen-certificate>`;
        default:
          return html`<buv-card-certificate></buv-card-certificate>`;
      }
    }

    _render (_props) {
      const bodyClass = _props.hasCertificate ? 'buv-c-verifier-body  buv-c-verifier-body--padded' : '';

      return html`
      ${GlobalStyleSheet}
      <section class='buv-c-verifier-main'>
        <buv-drag-and-drop>
          <div class='buv-c-verifier-layout'>
            <section class$='${bodyClass}'>
              ${ErrorMessage(_props.errorMessage, true)}
              <buv-certificate-input></buv-certificate-input>
              <buv-action-menu></buv-action-menu>
              ${this.renderCertificate(_props)}
              <buv-verification-modal></buv-verification-modal>
            </section>
            <buv-footer interactive></buv-footer>
          </div>
        </buv-drag-and-drop>
      </section>
    `;
    }
  }

  window.customElements.define('buv-raw', BlockcertsVerifier);

  // wrap Button in order to plug into Container
  // necessary trade-off to deal with class component in the store connector
  function BUVWrapper (props = {}) {
    return html`<buv-raw
          src='${props.src}'
          onLoad='${props.onLoad}'
          errorMessage='${props.errorMessage}'
          hasCertificate='${props.hasCertificate}'
          disableAutoVerify='${props['disable-auto-verify']}'
          disableVerify='${props['disable-verify']}'
          allowDownload='${props['allow-download']}'
          allowSocialShare='${props['allow-social-share']}'
          displayMode='${props['display-mode']}'
          showMetadata='${props['show-metadata']}'
          theme='${props.theme}'
          locale='${props.locale}'
        ></buv-raw>`;
  }

  function getErrorMessage (state) {
    return state.errorMessage;
  }

  const mapDispatchToProps$8 = {
    onLoad: initialize$1
  };

  const mapStateToProps$i = (state) => {
    return {
      errorMessage: getErrorMessage(state),
      hasCertificate: !!getCertificateDefinition(state)
    };
  };

  const ownProps$8 = {
    ...BlockcertsVerifier.properties,
    // make polymer detect external API value
    ...APIKeys
  };

  const BlockcertsVerifierContainer = connector(BUVWrapper, { mapDispatchToProps: mapDispatchToProps$8, mapStateToProps: mapStateToProps$i, ownProps: ownProps$8 });

  window.customElements.define('blockcerts-verifier', BlockcertsVerifierContainer);

}());