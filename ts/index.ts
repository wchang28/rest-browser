import {IError, ApiCallOptions, RESTReturn, HTTPMethod, ContentInfo, HTTPHeaders} from 'rest-api-interfaces';
import * as eventSource from 'eventsource-typings';
import * as $dr from 'rest-driver';
import * as $ from 'jquery';
export * from 'rest-driver';

// make sure the environment has the Promise object in the global space
require("es6-promise").polyfill();

// returns true it HTTP returns a "good" status code, false otherwise
// the logic comes from jquery
function goodHTTPStatusCode(statusCode: number) : boolean {
    return ((statusCode >= 200 && statusCode < 300) || (statusCode === 304)); 
}

type jQueryError = "timeout" | "error" | "abort" | "parsererror";

interface jQueryRESTReturn extends RESTReturn {
    jqError?: jQueryError;
}

// jQuery ajax call that throws jQueryRESTReturn on fail
function jAjax(settings: JQueryAjaxSettings) : Promise<jQueryRESTReturn> {
    return new Promise<jQueryRESTReturn>((resolve: (result: jQueryRESTReturn) => void, reject: (err: any) => void) => {
        $.ajax(settings)
        .done((data: any, textStatus: string, jqXHR: JQueryXHR) => {
            resolve({status: jqXHR.status, statusText: jqXHR.statusText, headers: parseResponseHeaders(jqXHR.getAllResponseHeaders()), data});
        }).fail((jqXHR: JQueryXHR, textStatus: jQueryError, errorThrown: string) => {
            reject({status: jqXHR.status, statusText: jqXHR.statusText, headers: parseResponseHeaders(jqXHR.getAllResponseHeaders()), data: jqXHR.responseText, jqError: textStatus});
        });
    });
}

function parseResponseHeaders(headerStr:string) : HTTPHeaders {
    let headers: HTTPHeaders = {};
    if (!headerStr) {
        return headers;
    }
    let headerPairs = headerStr.split('\u000d\u000a');
    for (let i = 0; i < headerPairs.length; i++) {
        let headerPair = headerPairs[i];
        // Can't use split() here because it does the wrong thing
        // if the header value has the string ": " in it.
        let index = headerPair.indexOf('\u003a\u0020');
        if (index > 0) {
            let key = headerPair.substring(0, index);
            let val = headerPair.substring(index + 2);
            headers[key] = val;
        }
    }
    return headers;
}

function jQueryRESTReturn2IError(ret: jQueryRESTReturn) : IError {
    let statusText = ret.statusText;
    let jqError = ret.jqError;
    let responseText = ret.data;
    let responseIsIError: boolean = false;
    let o: any = null;
    if (responseText) {
        try {
            let o = JSON.parse(responseText);
            if (o.error) responseIsIError = true;
        } catch(e) {}
    }
    if (responseIsIError)
        return o;
    else
        return {error: statusText||jqError||'unknown-error', error_description: responseText||jqError||statusText||'unknown error occured'};
}

function getBlobArrayBuffer(blob: Blob) : Promise<any> {
    return new Promise<any>((resolve: (result: any) => void, reject: (err: any) => void) => {
        let reader = new FileReader();
        reader.onloadend = (ev: ProgressEvent) => {
            resolve(reader.result);
        }
        reader.onerror = (ev: ErrorEvent) => {
            reject(reader.error);
        }
        reader.readAsArrayBuffer(blob);
    });
}

export function get() : $dr.$Driver {
    // jQuery Ajax call that throws IError on fail
    let jQueryAjax = (settings:JQueryAjaxSettings) : Promise<RESTReturn> => {
        return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject:(err: any) => void) => {
            jAjax(settings).then((ret: jQueryRESTReturn) => {
                resolve({status: ret.status, statusText: ret.statusText, headers: ret.headers, data: ret.data});
            }).catch((ret: jQueryRESTReturn) => {
                reject(jQueryRESTReturn2IError(ret));
            });
        });
    };
    // returns query string with ? in the front
    let searchString = (qs: any) : string => (qs && JSON.stringify(qs) != "{}" ? "?" + (typeof qs === "string" ? qs : $.param(qs)) : "");

    let driver:$dr.$Driver  = {
        $J: (method:string, url:string, data:any, options?: ApiCallOptions) : Promise<RESTReturn> => {
            let settings: JQueryAjaxSettings = {
                method
                ,url
                ,dataType: "json"
            };
            if (data) {
                if (method.toLowerCase() != 'get') {
                    settings.contentType = 'application/json; charset=UTF-8';
                    settings.data = typeof data === 'string' ? data : JSON.stringify(data);
                } else
                    settings.data = data;
            }
            if (options && options.headers) settings.headers = options.headers;
            return jQueryAjax(settings);
        }
        ,$E: (url: string, options?:ApiCallOptions) : Promise<$dr.I$EReturn> => {
            return new Promise<$dr.I$EReturn>((resolve: (value: $dr.I$EReturn) => void, reject:(err: any) => void) => {
                let initMsgs: eventSource.Message[] = [];
                let EventSource: eventSource.EventSourceConstructor = global['EventSource'];
                let es: eventSource.IEventSource = new EventSource(url, options);
                // It is possible that onmessage() is called BEFORE onopen() when some kind of EventSource polyfill
                // is used in browsers that don't support EventSource natively (IE for example). In this case, we must
                // cache all the messages recieved before the onopen() event
                es.onmessage = (message: eventSource.Message) => {
                    initMsgs.push(message);
                };
                es.onopen = () => {
                    let ret: $dr.I$EReturn = {eventSrc: es};
                    // wait for 300 ms for the initial msgs to arrive
                    setTimeout(() => {
                        if (initMsgs.length > 0) ret.initMsgs = initMsgs;
                        es.onmessage = null;
                        resolve(ret);
                    }, 300);
                }
                es.onerror = (err: eventSource.Error) => {
                    es.close();
                    reject(err);
                };
            });
        }
        ,$F: (method: HTTPMethod, url:string, formData: FormData, options?: ApiCallOptions) : Promise<RESTReturn> => {
            let settings: JQueryAjaxSettings = {
                method
                ,url
                ,contentType: false
                ,processData: false
                ,data: formData
                ,dataType: "json"
            };
            if (options && options.headers) settings.headers = options.headers;
            return jQueryAjax(settings);
        }
        ,$H: (url:string, qs?: any, options?: ApiCallOptions) : Promise<RESTReturn> => {
            let settings: JQueryAjaxSettings = {
                method: 'HEAD'
                ,url: url + searchString(qs)
            };
            if (options && options.headers) settings.headers = options.headers;
            return jQueryAjax(settings);
        }
        ,$B: (url:string, qs?: any, options?: ApiCallOptions) : Promise<RESTReturn> => {
            return new Promise<RESTReturn>((resolve: (value: RESTReturn) => void, reject:(err: any) => void) => {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState == xhr.DONE) {
                        let headers = parseResponseHeaders(xhr.getAllResponseHeaders());
                        if (goodHTTPStatusCode(xhr.status)) {
                            let blob: Blob = xhr.response;
                            resolve({status: xhr.status, statusText: xhr.statusText, headers, data: blob});
                        } else {
                            let ret: jQueryRESTReturn = {status: xhr.status, statusText: xhr.statusText, headers, data: xhr.responseText, jqError: null};
                            reject(jQueryRESTReturn2IError(ret));
                        }
                    }
                };
                xhr.open('GET', url + searchString(qs));
                if (options && options.headers) {
                    for (let fld in options.headers)
                        xhr.setRequestHeader(fld, options.headers[fld]);
                }
                xhr.responseType = 'blob';
                xhr.send();
            });
        }
        ,$U: (method: HTTPMethod, url:string, contentInfo: ContentInfo, blob: Blob, options?: ApiCallOptions) : Promise<RESTReturn> => {
            return getBlobArrayBuffer(blob).then((arrayBuffer: any) => {
                let settings: JQueryAjaxSettings = {
                    url
                    ,method
                    ,data: arrayBuffer
                    ,processData: false
                    ,contentType: contentInfo.type
                };
                if (options && options.headers) settings.headers = options.headers;
                return jQueryAjax(settings);
            });
        }
        ,createFormData: () : FormData => {return new FormData();}
    }
    return driver;
}
