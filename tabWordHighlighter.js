var wordsArray = [];

var ReadyToFindWords = true; //indicates if not in a highlight execution
var Config={
    highlightLoopFrequency: 1000,
    //highlightWarmup: 300,
    fixedLoopTime: false,
    increaseLoop: 500,
    decreaseLoop: 50,
    maxLoopTime: 2500,
    minLoopTime: 500,
    highlightAtStart: false,
    updateOnDomChange: false
};

var Highlight=true; // indicates if the extension needs to highlight at start or due to a change. This is evaluated in a loop
var HighlightLoopFrequency=1000; // the frequency of checking if a highlight needs to occur
//var HighlightWarmup=300; // min time to wait before running a highlight execution

var HighlightLoop;


var alreadyNotified = false;
var wordsReceived = false;
var highlighterEnabled = true;
var searchEngines = {
    'google.com': 'q',
    'bing.com': 'q'
}
var markerCurrentPosition = -1;
var markerPositions = [];
var highlightMarkers = {};
var markerScroll = false;
var printHighlights = true;

var debugStats={findCount:0, loopCount:0, subTreeModCount:0};
var debug = false;

if(window.location == window.parent.location){
    //only listen for messages in the main page, not in iframes
    chrome.runtime.onMessage.addListener(
        function (request, sender, sendResponse) {
            debug && console.log("got a message", request);
            if (sender.id == "abcibokldhgkclhihipipbiaednfcpia" || sender.id == "fgmbnmjmbjenlhbefngfibmjkpbcljaj" || sender.id=="highlightthis@deboel.eu") {
                if (request.command == "ScrollHighlight") {
                    jumpNext();
                    showMarkers();
                    return false
                }
                if (request.command == "getMarkers") {
                    sendResponse(highlightMarkers);
                    return true;
                }
                if (request.command == "ClearHighlights") {
                    highlightMarkers = {};
                    return false;

                }
                if (request.command == "ReHighlight") {
                    reHighlight(request.words);
                    return false;

                }
            }
            return true;
        }

    );
}
else {
    debug&&console.log("not in main page",window.location)
}

function jumpNext() {
    if (markerCurrentPosition == markerPositions.length - 1 || markerCurrentPosition > markerPositions.length - 1) {
        markerCurrentPosition = -1;
    }
    markerCurrentPosition += 1;
    $(window).scrollTop(markerPositions[markerCurrentPosition] - (window.innerHeight / 2));
    //document.body.scrollTop=markerPositions[markerCurrentPosition]-(window.innerHeight/2);
}

function showMarkers() {
    var element = document.getElementById('HighlightThisMarkers');
    if (element) {
        element.parentNode.removeChild(element);
    }

    var containerElement = document.createElement("DIV");
    containerElement.id = "HighlightThisMarkers";

    for (marker in highlightMarkers) {
        var span = document.createElement("SPAN");
        span.className = "highlightThisMarker";
        span.style.backgroundColor = highlightMarkers[marker].color;
        var markerposition = document.body.scrollTop + (highlightMarkers[marker].offset / document.body.clientHeight) * window.innerHeight;
        span.style.top = markerposition + "px";
        containerElement.appendChild(span);
    }
    document.body.appendChild(containerElement);
    if (!markerScroll) {
        document.addEventListener("scroll", function () {
            showMarkers();
        });
        markerScroll = true;
    }
}

function reHighlight(words) {
    for (group in words) {
        if (words[group].Enabled) {
            for (word in words[group].Words) {
                wordsArray.push( {
                    word: words[group].Words[word].toLowerCase(),
                    "regex": globStringToRegex(words[group].Words[word]),
                    "Color": words[group].Color,
                    "Fcolor": words[group].Fcolor,
                    "FindWords": words[group].FindWords,
                    "ShowInEditableFields": words[group].ShowInEditableFields
                });
            }
        }
    }
    findWords();
}


chrome.runtime.sendMessage({command: "getStatus"}, function (response) {
    debug&&console.log('reponse from getStatus',window.location);
    highlighterEnabled = response.status;
    printHighlights = response.printHighlights;
    Config = response.config;
    Highlight = Config.highlightAtStart;
    HighlightLoopFrequency= Config.highlightLoopFrequency;
    debug&&console.log('reponse from getStatus', Config);

    if (highlighterEnabled) {
        debug&&console.log('about to get words',window.location);

        chrome.runtime.sendMessage({
            command: "getWords",
            url: location.href.replace(location.protocol + "//", "")
        }, function (response) {
            debug&&console.log('got words');

            for (group in response.words) {
                if (response.words[group].Enabled) {
                    for (word in response.words[group].Words) {
                        wordsArray.push({
                            word: response.words[group].Words[word].toLowerCase(),
                            "regex": globStringToRegex(response.words[group].Words[word]),
                            "Color": response.words[group].Color,
                            "Fcolor": response.words[group].Fcolor,
                            "FindWords": response.words[group].FindWords,
                            "ShowInEditableFields": response.words[group].ShowInEditableFields
                        });
                    }
                }
            }
            debug&&console.log('processed words');
            wordsReceived = true;

            //start the highlight loop
            highlightLoop();
        });

    }
});

$(document).ready(function () {
    Highlight=true;

    debug && console.log('setup binding of dom sub tree modification');
    if(Config.updateOnDomChange){
        $("body").bind("DOMSubtreeModified", function () {
            //debug && console.log("dom sub tree modified");
            debug&&(debugStats.subTreeModCount+=1);

            Highlight=true;
        });
    }
});


function highlightLoop(){

    ReadyToFindWords = true;
    debug&&console.log("in loop",debugStats);
    if(Highlight){
        findWords(); 
        //calucate new HighlightLoopFrequency
        if(!Config.fixedLoopTime&&HighlightLoopFrequency<Config.maxLoopTime){
            HighlightLoopFrequency+=Config.increaseLoop;
        }
    }
    else{
        if(!Config.fixedLoopTime&&HighlightLoopFrequency>Config.minLoopTime){
            HighlightLoopFrequency-=Config.decreaseLoop;
        } 
    }

    debug&&(debugStats.loopCount+=1);
    debug&&console.log("new loop frequency",HighlightLoopFrequency);

    HighlightLoop = setTimeout(function () {
        highlightLoop();
    }, HighlightLoopFrequency);

}


function getSearchKeyword() {
    var searchKeyword = null;
    if (document.referrer) {
        for (searchEngine in searchEngines) {
            if (document.referrer.indexOf(searchEngine)) {
                searchKeyword = getSearchParameter(searchEngines[searchEngine]);
            }
        }
    }
    return searchKeyword;
}
function getSearchParameter(n) {
    var half = document.referrer.split(n + '=')[1];
    return half !== undefined ? decodeURIComponent(half.split('&')[0]) : null;
}

/*function start() {
    debug && console.log("in start");
    if (wordsReceived == true) {
        debug && console.log("in start - words received");
        Highlight=true
        $("body").bind("DOMSubtreeModified", function () {
            debug && console.log("dom sub tree modified", readyToFindWords);
            Highlight=true;
        });
    }
    else {
        setTimeout(function () {
            debug&&console.log('waiting for words');
            start();
        }, 250);
    }
}*/


function findWords() {
    if (Object.keys(wordsArray).length > 0) {
        Highlight=false;

        //setTimeout(function () {
        debug&&console.log('finding words',window.location);

        ReadyToFindWords=false;
        
        var changed = false;
        var myHilitor = new Hilitor();
        var highlights = myHilitor.apply(wordsArray, printHighlights);
        if (highlights.numberOfHighlights > 0) {
            highlightMarkers = highlights.markers;
            markerPositions = [];
            for (marker in highlightMarkers) {
                if (markerPositions.indexOf(highlightMarkers[marker].offset) == -1) {
                    markerPositions.push(highlightMarkers[marker].offset);
                }
            }
            markerPositions.sort();


            chrome.runtime.sendMessage({
                command: "showHighlights",
                label: highlights.numberOfHighlights.toString()
            }, function (response) {
            });
        }
        debug&&console.log('finished finding words');
        debug&&(debugStats.findCount+=1);

        ReadyToFindWords = true;
        //}, HighlightWarmup);
    }

}


function globStringToRegex(str) {
    return preg_quote(str).replace(/\\\*/g, '\\S*').replace(/\\\?/g, '.');
}

function preg_quote (str,delimiter) {
  
    return (str + '').replace(new RegExp('[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\' + (delimiter || '') + '-]', 'g'), '\\$&'); 
}