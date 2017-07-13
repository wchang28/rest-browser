"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var $ = require("jquery");
// make sure the environment has the Promise object in the global space
require("es6-promise").polyfill();
// returns true it HTTP returns a "good" status code, false otherwise
// the logic comes from jquery
function goodHTTPStatusCode(statusCode) {
    return ((statusCode >= 200 && statusCode < 300) || (statusCode === 304));
}
// jQuery ajax call that throws jQueryRESTReturn on fail
function jAjax(settings) {
    return new Promise(function (resolve, reject) {
        $.ajax(settings)
            .done(function (data, textStatus, jqXHR) {
            resolve({ status: jqXHR.status, statusText: jqXHR.statusText, headers: parseResponseHeaders(jqXHR.getAllResponseHeaders()), data: data });
        }).fail(function (jqXHR, textStatus, errorThrown) {
            reject({ status: jqXHR.status, statusText: jqXHR.statusText, headers: parseResponseHeaders(jqXHR.getAllResponseHeaders()), data: jqXHR.responseText, jqError: textStatus });
        });
    });
}
function parseResponseHeaders(headerStr) {
    var headers = {};
    if (!headerStr) {
        return headers;
    }
    var headerPairs = headerStr.split('\u000d\u000a');
    for (var i = 0; i < headerPairs.length; i++) {
        var headerPair = headerPairs[i];
        // Can't use split() here because it does the wrong thing
        // if the header value has the string ": " in it.
        var index = headerPair.indexOf('\u003a\u0020');
        if (index > 0) {
            var key = headerPair.substring(0, index);
            var val = headerPair.substring(index + 2);
            headers[key] = val;
        }
    }
    return headers;
}
function jQueryRESTReturn2IError(ret) {
    var statusText = ret.statusText;
    var jqError = ret.jqError;
    var responseText = ret.data;
    var responseIsIError = false;
    var o = null;
    if (responseText) {
        try {
            var o_1 = JSON.parse(responseText);
            if (o_1.error)
                responseIsIError = true;
        }
        catch (e) { }
    }
    if (responseIsIError)
        return o;
    else
        return { error: statusText || jqError || 'unknown-error', error_description: responseText || jqError || statusText || 'unknown error occured' };
}
function getBlobArrayBuffer(blob) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function (ev) {
            resolve(reader.result);
        };
        reader.onerror = function (ev) {
            reject(reader.error);
        };
        reader.readAsArrayBuffer(blob);
    });
}
function get() {
    // jQuery Ajax call that throws IError on fail
    var jQueryAjax = function (settings) {
        return new Promise(function (resolve, reject) {
            jAjax(settings).then(function (ret) {
                resolve({ status: ret.status, statusText: ret.statusText, headers: ret.headers, data: ret.data });
            }).catch(function (ret) {
                reject(jQueryRESTReturn2IError(ret));
            });
        });
    };
    // returns query string with ? in the front
    var searchString = function (qs) { return (qs && JSON.stringify(qs) != "{}" ? "?" + (typeof qs === "string" ? qs : $.param(qs)) : ""); };
    var driver = {
        $J: function (method, url, data, options) {
            var settings = {
                method: method,
                url: url,
                dataType: "json"
            };
            if (data) {
                if (method.toLowerCase() != 'get') {
                    settings.contentType = 'application/json; charset=UTF-8';
                    settings.data = typeof data === 'string' ? data : JSON.stringify(data);
                }
                else
                    settings.data = data;
            }
            if (options && options.headers)
                settings.headers = options.headers;
            return jQueryAjax(settings);
        },
        $E: function (url, options) {
            return new Promise(function (resolve, reject) {
                var initMsgs = [];
                var EventSource = global['EventSource'];
                var es = new EventSource(url);
                // It is possible that onmessage() is called BEFORE onopen() when some kind of EventSource polyfill
                // is used in browsers that don't support EventSource natively (IE for example). In this case, we must
                // cache all the messages recieved before the onopen() event
                es.onmessage = function (message) {
                    initMsgs.push(message);
                };
                es.onopen = function () {
                    var ret = { eventSrc: es };
                    // wait for 300 ms for the initial msgs to arrive
                    setTimeout(function () {
                        if (initMsgs.length > 0)
                            ret.initMsgs = initMsgs;
                        es.onmessage = null;
                        resolve(ret);
                    }, 300);
                };
                es.onerror = function (err) {
                    es.close();
                    reject(err);
                };
            });
        },
        $F: function (method, url, formData, options) {
            var settings = {
                method: method,
                url: url,
                contentType: false,
                processData: false,
                data: formData,
                dataType: "json"
            };
            if (options && options.headers)
                settings.headers = options.headers;
            return jQueryAjax(settings);
        },
        $H: function (url, qs, options) {
            var settings = {
                method: 'HEAD',
                url: url + searchString(qs)
            };
            if (options && options.headers)
                settings.headers = options.headers;
            return jQueryAjax(settings);
        },
        $B: function (url, qs, options) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.onreadystatechange = function () {
                    if (xhr.readyState == xhr.DONE) {
                        var headers = parseResponseHeaders(xhr.getAllResponseHeaders());
                        if (goodHTTPStatusCode(xhr.status)) {
                            var blob = xhr.response;
                            resolve({ status: xhr.status, statusText: xhr.statusText, headers: headers, data: blob });
                        }
                        else {
                            var ret = { status: xhr.status, statusText: xhr.statusText, headers: headers, data: xhr.responseText, jqError: null };
                            reject(jQueryRESTReturn2IError(ret));
                        }
                    }
                };
                xhr.open('GET', url + searchString(qs));
                if (options && options.headers) {
                    for (var fld in options.headers)
                        xhr.setRequestHeader(fld, options.headers[fld]);
                }
                xhr.responseType = 'blob';
                xhr.send();
            });
        },
        $U: function (method, url, contentInfo, blob, options) {
            return getBlobArrayBuffer(blob).then(function (arrayBuffer) {
                var settings = {
                    url: url,
                    method: method,
                    data: arrayBuffer,
                    processData: false,
                    contentType: contentInfo.type
                };
                if (options && options.headers)
                    settings.headers = options.headers;
                return jQueryAjax(settings);
            });
        },
        createFormData: function () { return new FormData(); }
    };
    return driver;
}
exports.get = get;
