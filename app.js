// Untitled Dice v0.0.6

// Customize these configuration settings:

var config = {
  // - Your app's id on moneypot.com
  app_id: 18,                             // <----------------------------- EDIT ME!
  // - Displayed in the navbar
  app_name: 'Sharp Dice',
  // - For your faucet to work, you must register your site at Recaptcha
  // - https://www.google.com/recaptcha/intro/index.html
  recaptcha_sitekey: '6LfI_QUTAAAAACrjjuzmLw0Cjx9uABxb8uguLbph',  // <----- EDIT ME!
  redirect_uri: 'https://untitled-dice.github.io',
  //redirect_uri: 'http://localhost:5000',
  mp_browser_uri: 'https://www.moneypot.com',
  mp_api_uri: 'https://api.moneypot.com',
  chat_uri: 'https://a-chat-server.herokuapp.com',
  // - Show debug output only if running on localhost
  debug: isRunningLocally(),
  // - Set this to true if you want users that come to http:// to be redirected
  //   to https://
  force_https_redirect: !isRunningLocally()
};

////////////////////////////////////////////////////////////
// You shouldn't have to edit anything below this line
////////////////////////////////////////////////////////////

if (config.force_https_redirect && window.location.protocol !== "https:") {
  window.location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}

// Hoist it. It's impl'd at bottom of page.
var socket;
var allBetsArray;
// :: Bool
function isRunningLocally() {
  return /^localhost/.test(window.location.host);
}

var el = React.DOM;

// Generates UUID for uniquely tagging components
var genUuid = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

var maxBankRoll;
var helpers = {};

helpers.houseEdge = function(){
    //a
    var profit = betStore.state.wager.num * (betStore.state.multiplier.num - 1);
    return helpers.roundDown(1- (profit * 100 / Number(maxBankRoll)), 3) ;
};

helpers.roundDown = function(number, quantityZero) {
    var totalMultiplier = 1;
    for(i = 0; i< quantityZero; i++){
        totalMultiplier = totalMultiplier * 10;
    }
    return (Math.floor(number*totalMultiplier)) / totalMultiplier;
};

//get a total of bankRoll and set in maxBankRoll
helpers.calcHouseEdge = function(){
    if(worldStore.state.user){
        MoneyPot.getBankRoll({
          success: function(data) {
            console.log('Successfully loaded Bank roll', data);
            maxBankRoll = data.balance;
          },
          error: function(err) {
            console.log('Error:', err);
          },
          complete: function() {
            console.log('complete');
          }
        },worldStore.state.access_token);
    }
    
};

// Number -> Number in range (0, 1)
helpers.multiplierToWinProb = function(multiplier) {
    console.assert(typeof multiplier === 'number');
    console.assert(multiplier > 0);
    //houseEdge in decimals format
    // the min value is 0.1
    var he = (100 - (helpers.houseEdge() * 100)).toFixed(2);
    if(he < 1){
        he = he * 1.05;
        //again with decimals
        he = (100 - he) / 100;
    }
    return he / multiplier;
};

helpers.calcNumber = function(cond, winProb) {
  console.assert(cond === '<' || cond === '>');
  console.assert(typeof winProb === 'number');

  if (cond === '<') {
    return helpers.roundDown(winProb, 4) * 100;
  } else {
    return 100 - (helpers.roundDown(winProb, 4) * 100);
  }
};

helpers.roleToLabelElement = function(role) {
  switch(role) {
    case 'admin':
      return el.span({className: 'label label-danger'}, 'MP Staff');
    case 'mod':
      return el.span({className: 'label label-info'}, 'Mod');
    case 'owner':
      return el.span({className: 'label label-primary'}, 'Owner');
    default:
      return '';
  }
};

// -> Object
helpers.getHashParams = function() {
  var hashParams = {};
  var e,
      a = /\+/g,  // Regex for replacing addition symbol with a space
      r = /([^&;=]+)=?([^&;]*)/g,
      d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
      q = window.location.hash.substring(1);
  while (e = r.exec(q))
    hashParams[d(e[1])] = d(e[2]);
  return hashParams;
};

// getPrecision('1') -> 0
// getPrecision('.05') -> 2
// getPrecision('25e-100') -> 100
// getPrecision('2.5e-99') -> 100
helpers.getPrecision = function(num) {
  var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) { return 0; }
  return Math.max(
    0,
    // Number of digits right of decimal point.
    (match[1] ? match[1].length : 0) -
    // Adjust for scientific notation.
    (match[2] ? +match[2] : 0));
};

////////////////////////////////////////////////////////////

// A weak MoneyPot API abstraction
var MoneyPot = (function() {

  var o = {};

  o.apiVersion = 'v1';

  // method: 'GET' | 'POST' | ...
  // endpoint: '/tokens/abcd-efgh-...'
  var noop = function() {};
  var makeMPRequest = function(method, bodyParams, endpoint, callbacks, params) {

    if (!worldStore.state.accessToken)
      throw new Error('Must have accessToken set to call MoneyPot API');
    
    var queryStringParams = '';
    if (params !== undefined) {
        for ( var ind in params) {
            queryStringParams += '&' + params[ind].field + '=' + params[ind].value;
        }
    }
    
    var url = config.mp_api_uri + '/' + o.apiVersion + endpoint +
              '?access_token=' + worldStore.state.accessToken + queryStringParams;

    $.ajax({
      url:      url,
      dataType: 'json', // data type of response
      method:   method,
      data:     bodyParams ? JSON.stringify(bodyParams) : undefined,
      headers: {
        'Content-Type': 'text/plain'
      },
      // Callbacks
      success:  callbacks.success  || noop,
      error:    callbacks.error    || noop,
      complete: callbacks.complete || noop
    });
  };

  o.getTokenInfo = function(callbacks) {
    var endpoint = '/token';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };

  o.generateBetHash = function(callbacks) {
    var endpoint = '/hashes';
    makeMPRequest('POST', undefined, endpoint, callbacks);
  };

  o.getDepositAddress = function(callbacks) {
    var endpoint = '/deposit-address';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };

  // gRecaptchaResponse is string response from google server
  // `callbacks.success` signature	is fn({ claim_id: Int, amoutn: Satoshis })
  o.claimFaucet = function(gRecaptchaResponse, callbacks) {
    console.log('Hitting POST /claim-faucet');
    var endpoint = '/claim-faucet';
    var body = { response: gRecaptchaResponse };
    makeMPRequest('POST', body, endpoint, callbacks);
  };

  // bodyParams is an object:
  // - wager: Int in satoshis
  // - client_seed: Int in range [0, 0^32)
  // - hash: BetHash
  // - cond: '<' | '>'
  // - number: Int in range [0, 99.99] that cond applies to
  // - payout: how many satoshis to pay out total on win (wager * multiplier)
  o.placeSimpleDiceBet = function(bodyParams, callbacks) {
    var endpoint = '/bets/simple-dice';
    makeMPRequest('POST', bodyParams, endpoint, callbacks);
  };

  // get list of betsa plication
  o.getListBets = function(callbacks, limit) {
    var endpoint = '/list-bets';
    
    var params = [
            {
                field: "app_id",
                value: config.app_id
            },
            {
                field: "limit",
                value: limit
            }
        ];
        
    makeMPRequest('GET', undefined, endpoint, callbacks, params);
  };
  
  o.getBankRoll = function(callbacks) {
    var endpoint = '/bankroll';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };
  
  return o;
})();

////////////////////////////////////////////////////////////

var Dispatcher = new (function() {
  // Map of actionName -> [Callback]
  this.callbacks = {};

  var self = this;

  // Hook up a store's callback to receive dispatched actions from dispatcher
  //
  // Ex: Dispatcher.registerCallback('NEW_MESSAGE', function(message) {
  //       console.log('store received new message');
  //       self.state.messages.push(message);
  //       self.emitter.emit('change', self.state);
  //     });
  this.registerCallback = function(actionName, cb) {
    console.log('[Dispatcher] registering callback for:', actionName);

    if (!self.callbacks[actionName]) {
      self.callbacks[actionName] = [cb];
    } else {
      self.callbacks[actionName].push(cb);
    }
  };

  this.sendAction = function(actionName, payload) {
    console.log('[Dispatcher] received action:', actionName, payload);

    // Ensure this action has 1+ registered callbacks
    if (!self.callbacks[actionName]) {
      throw new Error('Unsupported actionName: ' + actionName);
    }

    // Dispatch payload to each registered callback for this action
    self.callbacks[actionName].forEach(function(cb) {
      cb(payload);
    });
  };
});

////////////////////////////////////////////////////////////

var Store = function(storeName, initState, initCallback) {

  this.state = initState;
  this.emitter = new EventEmitter();

  // Execute callback immediately once store (above state) is setup
  // This callback should be used by the store to register its callbacks
  // to the dispatcher upon initialization
  initCallback.call(this);

  var self = this;

  // Allow components to listen to store events (i.e. its 'change' event)
  this.on = function(eventName, cb) {
    self.emitter.on(eventName, cb);
  };

  this.off = function(eventName, cb) {
    self.emitter.off(eventName, cb);
  };
};

////////////////////////////////////////////////////////////

// Manage access_token //////////////////////////////////////
//
// - If access_token is in url, save it into localStorage.
//   `expires_in` (seconds until expiration) will also exist in url
//   so turn it into a date that we can compare

var access_token, expires_in, expires_at;

if (helpers.getHashParams().access_token) {
  console.log('[token manager] access_token in hash params');
  access_token = helpers.getHashParams().access_token;
  expires_in = helpers.getHashParams().expires_in;
  expires_at = new Date(Date.now() + (expires_in * 1000));

  localStorage.setItem('access_token', access_token);
  localStorage.setItem('expires_at', expires_at);
} else if (localStorage.access_token) {
  console.log('[token manager] access_token in localStorage');
  expires_at = localStorage.expires_at;
  // Only get access_token from localStorage if it expires
  // in a week or more. access_tokens are valid for two weeks
  if (expires_at && new Date(expires_at) > new Date(Date.now() + (1000 * 60 * 60 * 24 * 7))) {
    access_token = localStorage.access_token;
  } else {
    localStorage.removeItem('expires_at');
    localStorage.removeItem('access_token');
  }
} else {
  console.log('[token manager] no access token');
}

// Scrub fragment params from url.
if (window.history && window.history.replaceState) {
  window.history.replaceState({}, document.title, "/");
} else {
  // For browsers that don't support html5 history api, just do it the old
  // fashioned way that leaves a trailing '#' in the url
  window.location.hash = '#';
}

////////////////////////////////////////////////////////////

var chatStore = new Store('chat', {
  messages: new CBuffer(250),
  waitingForServer: false,
  userList: {},
  showUserList: false,
  loadingInitialMessages: true
}, function() {
  var self = this;

  // `data` is object received from socket auth
  Dispatcher.registerCallback('INIT_CHAT', function(data) {
    console.log('[ChatStore] received INIT_CHAT');
    // Give each one unique id
    var messages = data.room.history.map(function(message) {
      message.id = genUuid();
      return message;
    });

    self.state.messages.push.apply(self.state.messages, messages);

    // Indicate that we're done with initial fetch
    self.state.loadingInitialMessages = false;

    // Load userList
    self.state.userList = data.room.users;
    self.emitter.emit('change', self.state);
    self.emitter.emit('init');
  });

  Dispatcher.registerCallback('NEW_MESSAGE', function(message) {
    console.log('[ChatStore] received NEW_MESSAGE');
    message.id = genUuid();
    self.state.messages.push(message);

    self.emitter.emit('change', self.state);
    self.emitter.emit('new_message');
  });

  Dispatcher.registerCallback('TOGGLE_CHAT_USERLIST', function() {
    console.log('[ChatStore] received TOGGLE_CHAT_USERLIST');
    self.state.showUserList = !self.state.showUserList;
    self.emitter.emit('change', self.state);
  });

  // user is { id: Int, uname: String, role: 'admin' | 'mod' | 'owner' | 'member' }
  Dispatcher.registerCallback('USER_JOINED', function(user) {
    console.log('[ChatStore] received USER_JOINED:', user);
    self.state.userList[user.uname] = user;
    self.emitter.emit('change', self.state);
  });

  // user is { id: Int, uname: String, role: 'admin' | 'mod' | 'owner' | 'member' }
  Dispatcher.registerCallback('USER_LEFT', function(user) {
    console.log('[ChatStore] received USER_LEFT:', user);
    delete self.state.userList[user.uname];
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('NEW_SYSTEM_MESSAGE', function(text) {
    console.log('[ChatStore] received NEW_SYSTEM_MESSAGE');
    self.state.messages.push({
      id: genUuid(),
      text: text,
      user: {uname: '[SYSTEM]'}
    });
    self.emitter.emit('change', self.state);
    self.emitter.emit('new_message');
  });

  // Message is { text: String }
  Dispatcher.registerCallback('SEND_MESSAGE', function(text) {
    console.log('[ChatStore] received SEND_MESSAGE');
    self.state.waitingForServer = true;
    self.emitter.emit('change', self.state);
    socket.emit('new_message', text);
  });
});

var betStore = new Store('bet', {
  nextHash: undefined,
  wager: {
    str: '1',
    num: 1,
    error: undefined
  },
  multiplier: {
    str: '2.00',
    num: 2.00,
    error: undefined
  },
  hotkeysEnabled: false,
  automaticWager: {
      str: '1',
      num: 1,
      error: undefined
  },
  automaticMultiplierWager: {
      str: '2.00',
      num: 2.00,
      error: undefined
  },
  showAutomaticRoll: false,
  automaticToggle: false,
  increaseOnWin: false,
  increaseOnLose: false,
  percentOnWin:0,
  percentOnLose:0,
  betCounter: 1,
  checkBoxNumberOfBet: 'false',
  disableNumberOfBet: false,
  NumberOfBetLimit:{
    str: '',
    num: 0,
    error: undefined
  },
  profitGained:{
    str: '',
    num: 1,
    error: undefined
  },
  showHashPopup: false
  
}, function() {
  var self = this;

    Dispatcher.registerCallback('SET_NEXT_HASH', function(hexString) {
        self.state.nextHash = hexString;
        self.emitter.emit('change', self.state);
    });

    Dispatcher.registerCallback('UPDATE_WAGER', function(newWager) {
        self.state.wager = _.merge({}, self.state.wager, newWager);
        
        var n = parseInt(self.state.wager.str, 10);
        
        // If n is a number, ensure it's at least 1 bit
        if (isFinite(n)) {
          n = Math.max(n, 1);
          self.state.wager.str = n.toString();
        }
        
        // Ensure wagerString is a number
        if (isNaN(n) || /[^\d]/.test(n.toString())) {
          self.state.wager.error = 'INVALID_WAGER';
        // Ensure user can afford balance
        } else if (n * 100 > worldStore.state.user.balance) {
          self.state.wager.error = 'CANNOT_AFFORD_WAGER';
          self.state.wager.num = n;
        } else {
          // wagerString is valid
          self.state.wager.error = null;
          self.state.wager.str = n.toString();
          self.state.wager.num = n;
        }
        
        self.emitter.emit('change', self.state);
    });
    
    Dispatcher.registerCallback('UPDATE_AUTOMATIC_WAGER', function(newWager) {
        self.state.automaticWager = _.merge({}, self.state.automaticWager, newWager);
        
        var n = parseInt(self.state.automaticWager.str, 10);
        
        // If n is a number, ensure it's at least 1 bit
        if (isFinite(n)) {
          n = Math.max(n, 1);
          self.state.automaticWager.str = n.toString();
        }
        
        // Ensure wagerString is a number
        if (isNaN(n) || /[^\d]/.test(n.toString())) {
          self.state.automaticWager.error = 'INVALID_WAGER';
        // Ensure user can afford balance
        } else if (n * 100 > worldStore.state.user.balance) {
          self.state.automaticWager.error = 'CANNOT_AFFORD_WAGER';
          self.state.automaticWager.num = n;
        } else {
          // wagerString is valid
          self.state.automaticWager.error = null;
          self.state.automaticWager.str = n.toString();
          self.state.automaticWager.num = n;
        }
        
        self.emitter.emit('change', self.state);
    });
    
    Dispatcher.registerCallback('AUTOMATIC_BET_WAGER_STATE', function() {
        console.log('[BetStore] received AUTOMATIC_BET_WAGER_STATE');
        betStore.state.automaticToggle = !betStore.state.automaticToggle;
        self.emitter.emit('change', self.state);
    });
    
    Dispatcher.registerCallback('AUTOMATE_TOGGLE_ROLL', function() {
        console.log('[BetStore] received AUTOMATE_TOGGLE_ROLL');
        betStore.state.automaticToggle = true;
        if(betStore.state.checkBoxNumberOfBet === 'true' && betStore.state.betCounter == self.state.NumberOfBetLimit.str){
            Dispatcher.sendAction('STOP_ROLL');
        }else{
            betStore.state.betCounter++;
        }
        self.emitter.emit('change', self.state);
    });
    
    Dispatcher.registerCallback('TOGGLE_SHOW_AUTOMATIC_ROLL', function() {
        console.log('[BetStore] received TOGGLE_SHOW_AUTOMATIC_ROLL');
        betStore.state.showAutomaticRoll = !betStore.state.showAutomaticRoll;
        betStore.state.increaseOnWin = false;
        betStore.state.increaseOnLose = false;
        betStore.state.checkBoxNumberOfBet = false;
        
        self.emitter.emit('change', self.state);
    });
  
    Dispatcher.registerCallback("SET_AUTOMATIC_NUMBER_OF_BETS", function(stateNumberOfBet){
        betStore.state.checkBoxNumberOfBet = stateNumberOfBet;
        if(betStore.state.checkBoxNumberOfBet === 'true'){
            betStore.state.disableNumberOfBet = false;
        }else{
            betStore.state.disableNumberOfBet = true;
        }
        self.emitter.emit('change', self.state);
    });
    
    Dispatcher.registerCallback("SET_INCREASE_ON_WIN", function(increaseOnWin){
        betStore.state.increaseOnWin = increaseOnWin;
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("SET_INCREASE_ON_LOSE", function(increaseOnLose){
        betStore.state.increaseOnLose = increaseOnLose;
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("AUGMENT_PROFIT", function(percent){
        var profitQuantity = betStore.state.profitGained.num + (betStore.state.profitGained.num * Number(percent) / 100);
        var balanceQuantity = worldStore.state.user.balance / 100;
        if(balanceQuantity > profitQuantity){
            betStore.state.profitGained.num = profitQuantity;
            betStore.state.profitGained.num = Number(betStore.state.profitGained.num.toFixed(0));
        }else{
            Dispatcher.sendAction("STOP_ROLL");
        }
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("SET_PERCENT_ON_WIN", function(percentOnWin){
        betStore.state.percentOnWin = percentOnWin;
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("SET_PERCENT_ON_LOSE", function(percentOnLose){
        betStore.state.percentOnLose = percentOnLose;
        self.emitter.emit('change', self.state);
    });
    
    Dispatcher.registerCallback("STOP_ROLL", function(){
        betStore.state.automaticToggle = false;
        betStore.state.betCounter = 1;
        betStore.state.profitGained.num = betStore.state.wager.num;
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("RETURN_BASE_BET", function(){
        betStore.state.profitGained.num = betStore.state.wager.num;
    });
   
    Dispatcher.registerCallback('UPDATE_NUMBER_OF_BETS_LIMIT', function(limit) {
        self.state.NumberOfBetLimit = _.merge({}, self.state.automaticMultiplierWager, limit);
        self.emitter.emit('change', self.state);
    });
    
    
    Dispatcher.registerCallback('UPDATE_MULTIPLIER', function(newMult) {
        self.state.multiplier = _.merge({}, self.state.multiplier, newMult);
        self.emitter.emit('change', self.state);
    });
    //show hash popup
    Dispatcher.registerCallback('TOGGLE_NEXT_HASH_POPUP', function() {
        console.log('[ChatStore] received TOGGLE_CHAT_USERLIST');
        self.state.showHashPopup = !self.state.showHashPopup;
        self.emitter.emit('change', self.state);
    });
});

// The general store that holds all things until they are separated
// into smaller stores for performance.
var worldStore = new Store('world', {
  isLoading: true,
  user: undefined,
  accessToken: access_token,
  isRefreshingUser: false,
  hotkeysEnabled: false,
  currTab: 'MY_BETS',
  bets: new CBuffer(25),
  allBets: new CBuffer(25),
  grecaptcha: undefined,
  bankRoll : 0
}, function() {
  var self = this;

  // TODO: Consider making these emit events unique to each callback
  // for more granular reaction.

  // data is object, note, assumes user is already an object
  Dispatcher.registerCallback('UPDATE_USER', function(data) {
    self.state.user = _.merge({}, self.state.user, data);
    self.emitter.emit('change', self.state);
  });

  // deprecate in favor of SET_USER
  Dispatcher.registerCallback('USER_LOGIN', function(user) {
    self.state.user = user;
    self.emitter.emit('change', self.state);
    self.emitter.emit('user_update');
  });

  // Replace with CLEAR_USER
  Dispatcher.registerCallback('USER_LOGOUT', function() {
    self.state.user = undefined;
    self.state.accessToken = undefined;
    localStorage.removeItem('expires_at');
    localStorage.removeItem('access_token');
    self.state.bets.empty();
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('START_LOADING', function() {
    self.state.isLoading = true;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('STOP_LOADING', function() {
    self.state.isLoading = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('CHANGE_TAB', function(tabName) {
    console.assert(typeof tabName === 'string');
    self.state.currTab = tabName;
    self.emitter.emit('change', self.state);
    console.log(self.state);
    if(tabName == 'ALL_BETS')
    {
        console.log("tab all bets selected");
        Dispatcher.sendAction('REFERSH_ALL_BETS');
    }
    
  });

  Dispatcher.registerCallback('REFERSH_ALL_BETS',function(){
    self.state.isRefreshingUser = true;
    self.emitter.emit('change', self.state);
    
    MoneyPot.getListBets({
      success: function(data) {
          
          self.state.allBets = new CBuffer(25);
        for(var i in data){
            self.state.allBets.push(data[i]);
        }
        
        console.log('Successfully loaded list of bets', data);
        self.emitter.emit('change', self.state);
      },
      error: function(err) {
        console.log('Error:', err);
      },
      complete: function() {
        console.log('complete');
      }
    },
    25);
    
  });

  Dispatcher.registerCallback('NEW_BET', function(bet) {
    console.assert(typeof bet === 'object');
    self.state.bets.push(bet);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('TOGGLE_HOTKEYS', function() {
    self.state.hotkeysEnabled = !self.state.hotkeysEnabled;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('DISABLE_HOTKEYS', function() {
    self.state.hotkeysEnabled = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('START_REFRESHING_USER', function() {
    self.state.isRefreshingUser = true;
    self.emitter.emit('change', self.state);
    MoneyPot.getTokenInfo({
      success: function(data) {
        console.log('Successfully loaded user from tokens endpoint', data);
        var user = data.auth.user;
        self.state.user = user;
        self.emitter.emit('change', self.state);
        self.emitter.emit('user_update');
      },
      error: function(err) {
        console.log('Error:', err);
      },
      complete: function() {
        Dispatcher.sendAction('STOP_REFRESHING_USER');
      }
    });
  });

  Dispatcher.registerCallback('STOP_REFRESHING_USER', function() {
    self.state.isRefreshingUser = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('GRECAPTCHA_LOADED', function(_grecaptcha) {
    self.state.grecaptcha = _grecaptcha;
    self.emitter.emit('grecaptcha_loaded');
  });

});

////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////

var UserBox = React.createClass({
  displayName: 'UserBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
    betStore.on('change', this._onStoreChange);
  },
  componentWillUnount: function() {
    worldStore.off('change', this._onStoreChange);
    betStore.off('change', this._onStoreChange);
  },
  _onLogout: function() {
    Dispatcher.sendAction('USER_LOGOUT');
  },
  _onChangeHash: function(){
      Dispatcher.sendAction('TOGGLE_NEXT_HASH_POPUP');
  },
  _onRefreshUser: function() {
    Dispatcher.sendAction('START_REFRESHING_USER');
  },
  _openWithdrawPopup: function() {
    var windowUrl = config.mp_browser_uri + '/dialog/withdraw?app_id=' + config.app_id;
    var windowName = 'manage-auth';
    var windowOpts = [
      'width=420',
      'height=350',
      'left=100',
      'top=100'
    ].join(',');
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
    return false;
  },
  _openDepositPopup: function() {
    var windowUrl = config.mp_browser_uri + '/dialog/deposit?app_id=' + config.app_id;
    var windowName = 'manage-auth';
    var windowOpts = [
      'width=420',
      'height=350',
      'left=100',
      'top=100'
    ].join(',');
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
    return false;
  },
  render: function() {

    var innerNode;
    if (worldStore.state.isLoading) {
      innerNode = el.p(
        {className: 'navbar-text'},
        'Loading...'
      );
    } else if (worldStore.state.user) {
      innerNode = 
		el.div({className: 'row'},
					el.div({className: 'col-lg-7 col-md-7 col-sm-12 col-xs-12'},
						el.div({className: 'row'},
							el.div({className: 'col-lg-6 col-md-6 col-sm-8 col-xs-8'},
								el.div({className: 'deposit-withdraw'},
									// Deposit/Withdraw popup buttons
									el.a(
										{
										href: '/',
										type: 'button',
										className: 'dps-drw-left ' + (betStore.state.wager.error === 'CANNOT_AFFORD_WAGER' ? 'deposit-success' : 'deposit'),
										onClick: this._openDepositPopup
										},
										el.span(null,'Deposit')
										
									),
									el.a(
										{
										href: '/',
										type: 'button',
										className: 'dps-drw-right deposit',
										onClick: this._openWithdrawPopup
										},
										el.span(null,'Withdraw')
										
									),
                                    el.div({className: 'availableBits'},
                                        // Balance
                                        el.div(
                                            {
                                                className: 'navbar-text',
                                                style: {marginRight: '5px', width:'100%'}
                                            },
                                            el.span(null,
                                                Number(worldStore.state.user.balance.toFixed(0)) / 100 + ' bits',
                                                el.button(
                                                    {
                                                    className: 'buttonRefresh',
                                                    title: 'Refresh Balance',
                                                    disabled: worldStore.state.isRefreshingUser,
                                                    onClick: this._onRefreshUser
                                                    },
                                                    el.span({className: 'glyphicon glyphicon-refresh'})
                                                )
                                            
                                            )
                                        )
                                        
                                    )
        								// Refresh button
								)
							),
                			el.div({className: 'col-lg-6 col-md-6 col-sm-4 col-xs-4'},
                				// Logged in as...
                				el.span({className: 'navbar-text userName'},
                				  'Logged in as ',
                				  el.code(null, worldStore.state.user.uname)
                				)
                			)	
						)
					),
					el.div({className: 'col-lg-5 col-md-5 col-sm-12 col-xs-12'},
					    el.div({className:'row'},
					        el.div({className: 'col-lg-3 col-md-3 col-sm-6 col-xs-6'},
            						// popup hash
        						el.a(
        							{
        							href: '#',
        							onClick: this._onChangeHash,
        							className: 'blue'
        							},
        							el.span({className: 'balance'})
        							
        						)
            					),
            					el.div({className: 'col-lg-6 col-md-6 col-sm-6 col-xs-6'},
            						el.div(null,
            							el.a({
            								href: config.mp_browser_uri + '/apps/' + config.app_id,
            								target: '_blank',
            								className: 'blue'
            								},
            								// External site glyphicon
            								el.span({className: 'glyphicon glyphicon-new-window'}
            								),
            								el.span(null,
            									
            									'View on Moneypot'
            								)
            							)
            						)
            					),
            					el.div({className: 'col-lg-3 col-md-3 col-sm-12 col-xs-12'},
            						// Logout button
            						el.a(
            							{
            							href: '/',
            							onClick: this._onLogout,
            							className: 'red'
            							},
            							el.span({className: 'glyphicon glyphicon-off'})
            							
        						)
        					)
					    )
					
					)
					
		
		);
    } else {
		innerNode = 
		el.div({className: 'row'},
			el.div({className: 'col-lg-4 col-md-4 col-sm-0 col-xs-0'}),
			el.div({className: 'col-lg-4 col-md-4 col-sm-6 col-xs-6'},
				el.div(null,
					el.a({
						href: config.mp_browser_uri + '/apps/' + config.app_id,
						target: '_blank',
						className: 'blue'
						},
						// External site glyphicon
						el.span({className: 'glyphicon glyphicon-new-window'}
						),
						el.span(null,
							
							'View on Moneypot'
						)
					)
				)
			),
      // User needs to login
			el.div({className: 'col-lg-4 col-md-4 col-sm-6 col-xs-6'},
				el.div(null,
					el.a({
						href: config.mp_browser_uri + '/oauth/authorize' +
							'?app_id=' + config.app_id +
							'&redirect_uri=' + config.redirect_uri,
						className: 'blue'
						},
						// External site glyphicon
						el.span({className: 'glyphicon glyphicon-new-window'}
						),
						el.span(null,
							'Login with Moneypot'
						)
					)
				)
			)
		)
    }

    return innerNode;
  }
});


var Navbar = React.createClass({
  displayName: 'Navbar',
  render: function() {
    return el.div({className: 'row'},
		el.div({className: 'col-lg-3 col-md-3 col-sm-12 col-xs-12'},
			el.div(null,
				el.img({className:"img-responsive", src: "img/sharpdice.png"}
				)
			)
		),
		
		el.div({className: 'col-lg-9 col-md-9 col-sm-12 col-xs-12'},
			el.div({id: 'containerHeader'},
				// Userbox
				React.createElement(UserBox, null)
			)
		)
	
	);

  }
});

var ChatBoxInput = React.createClass({
  displayName: 'ChatBoxInput',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    chatStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    chatStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  getInitialState: function() {
    return { text: '' };
  },
  // Whenever input changes
  _onChange: function(e) {
    this.setState({ text: e.target.value });
  },
  // When input contents are submitted to chat server
  _onSend: function() {
    var self = this;
    Dispatcher.sendAction('SEND_MESSAGE', this.state.text);
    this.setState({ text: '' });
  },
  _onFocus: function() {
    // When users click the chat input, turn off bet hotkeys so they
    // don't accidentally bet
    if (worldStore.state.hotkeysEnabled) {
      Dispatcher.sendAction('DISABLE_HOTKEYS');
    }
  },
  _onKeyPress: function(e) {
    var ENTER = 13;
    if (e.which === ENTER) {
      if (this.state.text.trim().length > 0) {
        this._onSend();
      }
    }
  },
  render: function() {
  return (	el.ul({className:'row'},
			el.li({className:'col-lg-9 col-md-9 col-sm-9 col-xs-9'},
				chatStore.state.loadingInitialMessages ?
					el.div({
							style: {marginTop: '7px'},
							className: 'text-muted'
					},
					el.span({className: 'glyphicon glyphicon-refresh rotate'}),
						' Loading...'
					)
				:
				el.input({
						type:'text',
						className:'chatText',
						value: this.state.text,
						placeholder: worldStore.state.user ?
							'Click here and begin typing...' :
							'Login to chat',
						onChange: this._onChange,
						onKeyPress: this._onKeyPress,
						onFocus: this._onFocus,
						ref: 'input',
						// TODO: disable while fetching messages
						disabled: !worldStore.state.user || chatStore.state.loadingInitialMessages
				})
				
			),
			el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
				el.input({
						type:'button',
						value:'send',
						className:'blue',
						disabled: !worldStore.state.user ||
						chatStore.state.waitingForServer ||
						this.state.text.trim().length === 0,
						onClick: this._onSend
				})
			)
		)
    );
  }
});

var ChatBox = React.createClass({
  displayName: 'ChatBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  // New messages should only force scroll if user is scrolled near the bottom
  // already. This allows users to scroll back to earlier convo without being
  // forced to scroll to bottom when new messages arrive
  _onNewMessage: function() {
    var node = this.refs.chatListRef.getDOMNode();

    // Only scroll if user is within 100 pixels of last message
    var shouldScroll = function() {
      var distanceFromBottom = node.scrollHeight - ($(node).scrollTop() + $(node).innerHeight());
      console.log('DistanceFromBottom:', distanceFromBottom);
      return distanceFromBottom <= 100;
    };

    if (shouldScroll()) {
      this._scrollChat();
    }
  },
  _scrollChat: function() {
    var node = this.refs.chatListRef.getDOMNode();
    $(node).scrollTop(node.scrollHeight);
  },
  componentDidMount: function() {
    chatStore.on('change', this._onStoreChange);
    chatStore.on('new_message', this._onNewMessage);
    chatStore.on('init', this._scrollChat);
  },
  componentWillUnmount: function() {
    chatStore.off('change', this._onStoreChange);
    chatStore.off('new_message', this._onNewMessage);
    chatStore.off('init', this._scrollChat);
  },
  //
  _onUserListToggle: function() {
    Dispatcher.sendAction('TOGGLE_CHAT_USERLIST');
  },
  _showChatUserList: function(){
    Dispatcher.sendAction('TOGGLE_CHAT_USERLIST');
  },
  render: function() {
      var userConected = el.div({className:"showUserList"},
            // After the chatbox panel
            el.p( null,
                'Users online: ' + Object.keys(chatStore.state.userList).length + ' '
                ),// Show/Hide userlist button
                el.input({
                    type: 'button',
                    className: 'blue',
                    value: 'show',
                    style: {width:'45%'},
                    onClick: this._onUserListToggle
                    })
                    
                // Show userlist
                
            );
      
      
	return el.div({className:'backgroundBlock'},
		el.ul({className:'row'},
			el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
				el.div({className:'chatContainer'},
					el.ul({className: 'chat-list list-unstyled', ref: 'chatListRef'},
						chatStore.state.messages.toArray().map(function(m) {
							return el.li({// Use message id as unique key 
											key: m.id
										},
										helpers.roleToLabelElement(m.user.role),
										' ',
										el.code(null, m.user.uname + ':'),
										el.span(null, ' ' + m.text)
							);
						})
					)
				)
			),
			el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
				React.createElement(ChatBoxInput, null)
			)
		),
		worldStore.state.user ? userConected : ''
		
            
	);
  }
});

var ChatUserList = React.createClass({
  displayName: 'ChatUserList',
  _disableModal :function(){
      Dispatcher.sendAction('TOGGLE_CHAT_USERLIST');
  },
    render: function() {
        return (
            el.div({className:'modalUserList'},
                el.div({className: 'modalBk', onClick:this._disableModal}
                ),
                el.div({className: 'modalCntnt'},
                    el.div(null,
                        el.h4(null,'ONLINE USERS'),
                        el.h5(null,el.br(null)),
                        el.div({className: 'panel-heading'},
                            el.ul(
                                {},
                                _.values(chatStore.state.userList).map(function(u) {
                                    return el.li(
                                        {
                                            key: u.uname
                                        },
                                        helpers.roleToLabelElement(u.role),
                                        ' ',
										el.code(null, u.uname)
                                    );
                                })
                            )
                        )
                    )
                )
                
            )
        );
    }
});

var NextHashPopup = React.createClass({
  displayName: 'NextHashPopup',
  _onChangeHash: function(){
    MoneyPot.generateBetHash({
        success: function(data) {
          Dispatcher.sendAction('SET_NEXT_HASH', data.hash);
        }  
    })  
  },
  _disableModal :function(){
      Dispatcher.sendAction('TOGGLE_NEXT_HASH_POPUP');
  },
    render: function() {
        return (
            el.div({className:'modalHashSection'},
                el.div({className: 'modalBk', onClick:this._disableModal}
                ),
                el.div({className: 'modalCntnt'},
                    el.div(null,
                        el.h4(null,'PROVABLY FAIR'),
                        el.h5(null,el.br(null)),
                        el.div(null,
                            el.ul(null,
                                el.li(null,
                                    el.a({
                						type:'button',
                						className:'dps-drw',
                						disabled: true,
                						href:'#',
                    				},
                    				'Actual Hash')
                    			),
                    			el.li(null,
            				        el.div({id:'hashBox'},
                				        betStore.state.nextHash
                				    )
                        		),
                        		el.li(null,
                        		    el.div(null,
                            		    el.a({
                        						type:'button',
                        						className:'dps-drw col-lg-5 col-md-5 col-xs-5 col-sm-5',
                        						disabled: true,
                        						href:'#',
                        						onClick: this._onChangeHash
                        				    },'Renew Hash'
                        				)
                        		    ),
                        		    el.div(null,
                        				el.div({
                        						className:'col-lg-2 col-md-2 col-xs-2 col-sm-2'
                            				}
                                		)
                        			),
                                    el.div(null,
                        				el.a({
                        						type:'button',
                        						className:'dps-drw col-lg-5 col-md-5 col-xs-5 col-sm-5',
                        						disabled: true,
                        						href:'#',
                        						onClick: this._disableModal
                            				},
                        				        'Close'
                                		)
                        			)
                        		)
                            )
                        )
                    )
                )
                
            )
        );
    }
});

var BetBoxChance = React.createClass({
  displayName: 'BetBoxChance',
  // Hookup to stores
  _onStoreChange: function() {
    helpers.calcHouseEdge();
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  render: function() {
    // 0.00 to 1.00
    var winProb = helpers.multiplierToWinProb(betStore.state.multiplier.num);

    var isError = betStore.state.multiplier.error || betStore.state.wager.error || !(worldStore.state.user);

    // Just show '--' if chance can't be calculated
    var innerNode;
    if (isError) {
		innerNode =	el.input({
						className: 'profit', 
						disabled:'true',
						value: '--'}
					);
    } 
	else {
		innerNode = el.input({
						className: 'profit', 
						disabled:'true',
						value: (helpers.roundDown(winProb, 4) * 100).toFixed(2).toString() + '%'}
					);
	}

    return el.ul(null,
		el.li(null,
			el.div({className:'contenedor'},
				el.label({className:'chanceLabel'},
					"chance"
				),
				innerNode
			)
		)
				 
	);
  }
});


var BetBoxProfit = React.createClass({
  displayName: 'BetBoxProfit',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  render: function() {
    var profit = betStore.state.wager.num * (betStore.state.multiplier.num - 1);

    var innerNode;
    if (betStore.state.multiplier.error || betStore.state.wager.error) {
		innerNode =	el.input({
						className: 'profit', 
						disabled:'true',
						value: '--'}
					);
    } 
	else {
		innerNode = el.input({
						className: 'profit', 
						style: { color: '#39b54a' },
						disabled:'true',
						value: '+' + profit.toFixed(2)}
					);
	}
	
    return el.ul(null,
		el.li(null,
			el.div({className:'contenedor'},
				el.label({className:'chanceLabel'},
					"profits"
				),
				innerNode
			)
		)
				 
	);
  }
});

var BetBoxMultiplier = React.createClass({
  displayName: 'BetBoxMultiplier',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  _validateMultiplier: function(newStr) {
    var num = parseFloat(newStr, 10);

    // If num is a number, ensure it's at least 0.01x
    // if (Number.isFinite(num)) {
    //   num = Math.max(num, 0.01);
    //   this.props.currBet.setIn(['multiplier', 'str'], num.toString());
    // }

    var isFloatRegexp = /^(\d*\.)?\d+$/;

    // Ensure str is a number
    if (isNaN(num) || !isFloatRegexp.test(newStr)) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'INVALID_MULTIPLIER' });
      // Ensure multiplier is >= 1.00x
    } else if (num < 1.01) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_LOW' });
      // Ensure multiplier is <= max allowed multiplier (100x for now)
    } else if (num > 9900) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_HIGH' });
      // Ensure no more than 2 decimal places of precision
    } else if (helpers.getPrecision(num) > 2) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_PRECISE' });
      // multiplier str is valid
    } else {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', {
        num: num,
        error: null
      });
    }
  },
  _onMultiplierChange: function(e) {
    console.log('Multiplier changed');
    var str = e.target.value;
    console.log('You entered', str, 'as your multiplier');
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { str: str });
    this._validateMultiplier(str);
  },
  render: function() {

  return el.div({className: 'boxCoin'},
		el.h3(null,"MULTIPLIER"),
		el.fieldset(null,
			el.ul(null,
				el.li(null,
					el.div({className:'centerContainer'},
						el.div({className:'buttonCoinCenter'},
							el.input(
								{
									type: 'text',
									value: betStore.state.multiplier.str,
									className: 'inputCoin',
									onChange: this._onMultiplierChange,
									disabled: !!worldStore.state.isLoading
								}
							),
							el.label({className:'inputCoinLabel'}, "X")
						)
					)
				)
			)
		)
    );
  }
});

var BetBoxButton = React.createClass({
  displayName: 'BetBoxButton',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
    betStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
    betStore.off('change', this._onStoreChange);
  },
  getInitialState: function() {
    return { waitingForServer: false };
  },
  // cond is '>' or '<'
  _makeBetHandler: function(cond) {
    var self = this;
    
    console.assert(cond === '<' || cond === '>');

    return function(e) {
        
            
                console.log('Placing bet...');
    
                // Indicate that we are waiting for server response
                self.setState({ waitingForServer: true });
                
                var hash = betStore.state.nextHash;
                console.assert(typeof hash === 'string');
                
                var wagerSatoshis = betStore.state.wager.num * 100;
                var multiplier = betStore.state.multiplier.num;
                var payoutSatoshis = wagerSatoshis * multiplier;
                
                var number = helpers.calcNumber(
                cond, helpers.multiplierToWinProb(multiplier)
                );
                
                var params = {
                    wager: wagerSatoshis,
                    client_seed: 0, // TODO
                    hash: hash,
                    cond: cond,
                    target: number,
                    payout: payoutSatoshis
                };
                
                $('#imagenGif').attr('src',"img/dice.gif");
                $('#numberRolled').attr('display','none');
                $('#numberRolled').fadeOut(0);
                
                MoneyPot.placeSimpleDiceBet(params, {
                success: function(bet) {
                  console.log('Successfully placed bet:', bet);
                  // Append to bet list
                  console.log('Successfully placed bet:', bet.profit);
                 
                  $('#numberRolled').text(bet.outcome);
                  // We don't get this info from the API, so assoc it for our use
                  bet.meta = {
                    cond: cond,
                    number: number,
                    hash: hash,
                    isFair: CryptoJS.SHA256(bet.secret + '|' + bet.salt).toString() === hash
                  };
                  
                  Dispatcher.sendAction('CHANGE_TAB', 'MY_BETS');
                  Dispatcher.sendAction('NEW_BET', bet);
                
                  // Update next bet hash
                  Dispatcher.sendAction('SET_NEXT_HASH', bet.next_hash);
                
                  // Update user balance
                  Dispatcher.sendAction('UPDATE_USER', {
                    balance: worldStore.state.user.balance + bet.profit
                  });
                },
                error: function(xhr) {
                  console.log('Error');
                  if (xhr.responseJSON && xhr.responseJSON) {
                    alert(xhr.responseJSON.error);
                  } else {
                    alert('Internal Error');
                  }
                },
                complete: function() {
                    $('#numberRolled').attr('display','block');
                    $('#numberRolled').delay(500).fadeIn(500);
                    setTimeout(function() {
                        
                        self.setState({ waitingForServer: false });
                   
                        // Force re-validation of wager
                        Dispatcher.sendAction('UPDATE_WAGER', {
                            str: betStore.state.wager.str
                        });
                    }.bind(this), 1000);
                    
                    
                }
                });
           
    };
  },
  render: function() {
    var innerNode;

    // TODO: Create error prop for each input
    var error = betStore.state.wager.error || betStore.state.multiplier.error;
	
    if (worldStore.state.isLoading) {
      // If app is loading, then just disable button until state change
      innerNode = el.button(
        {type: 'button', disabled: true, className: 'btn btn-lg btn-block btn-default'},
        'Loading...'
      );
    } else if (error) {
      // If there's a betbox error, then render button in error state

      var errorTranslations = {
        'CANNOT_AFFORD_WAGER': 'You cannot afford wager',
        'INVALID_WAGER': 'Invalid wager',
        'INVALID_MULTIPLIER': 'Invalid multiplier',
        'MULTIPLIER_TOO_PRECISE': 'Multiplier too precise',
        'MULTIPLIER_TOO_HIGH': 'Multiplier too high',
        'MULTIPLIER_TOO_LOW': 'Multiplier too low'
      };

      innerNode = el.button(
        {type: 'button',
         disabled: true,
         className: 'btn btn-lg btn-block btn-danger'},
        errorTranslations[error] || 'Invalid bet'
      );
    } else if (worldStore.state.user) {
      // If user is logged in, let them submit bet
        var winProb = helpers.multiplierToWinProb(betStore.state.multiplier.num);
        
		innerNode = 
			el.ul({className: 'row'},
				el.li({className: 'col-lg-6 col-md-6 col-sm-6 col-xs-6'},
					el.a(
						{
                        type:'button',
						className: 'blue',
						id: 'bet-hi',
						onClick: this._makeBetHandler('>'),
						disabled: !!this.state.waitingForServer
						},
						el.span(null,
							el.span({className: 'bet-high'}
							),
							el.span({className: 'bets unselectable'},
								"ROLL HIGH",
								el.span({className: 'unselectable rateWin'}, '>'+helpers.calcNumber('>',winProb).toFixed(2))
							),
							el.span({className: 'betHotKey'},
								worldStore.state.hotkeysEnabled ? el.kbd({className:'unselectable'}, 'H') : ''
							)
						)
					)
				),
				el.li({className: 'col-lg-6 col-md-6 col-sm-6 col-xs-6'},
					el.a(
						{
                        type:'button',
						className: 'blue',
						onClick: this._makeBetHandler('<'),
						disabled: !!this.state.waitingForServer,
						id: 'bet-lo'
						},
						el.span({className: 'bet-low'}
						),
						el.span({className: 'bets unselectable', style:{position:'relative'}},
							"ROLL LOW",
							el.span({className: 'unselectable rateWin'}, '<'+helpers.calcNumber('<',winProb).toFixed(2))
						),
						el.span({className: 'betHotKey'},
							worldStore.state.hotkeysEnabled ? el.kbd({className:'unselectable'}, 'L') : ''
						)
					)	
				)	
			);
    } else {
      // If user isn't logged in, give them link to /oauth/authorize
      innerNode = el.a(
        {
          href: config.mp_browser_uri + '/oauth/authorize' +
            '?app_id=' + config.app_id +
            '&redirect_uri=' + config.redirect_uri,
          className: 'btn btn-lg btn-block btn-success'
        },
        'Login with MoneyPot'
      );
    }
	//TODO: TERMINAR
    return el.div(null,
            (this.state.waitingForServer) ?
            el.div({className: 'row', style:{position:'relative;'}},
    			el.div({className: 'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                    
                        el.button(
                            {
                                className: ' btn btn-lg btn-block btn-danger',
                                disabled: 'true'
                            }, 
                            el.span(
                                {
                                  className: 'glyphicon glyphicon-refresh rotate'
                                }
                            )
                        )
                )
            ) : innerNode
            
    );
  }
});

var HotkeyToggle = React.createClass({
  displayName: 'HotkeyToggle',
  _onClick: function() {
    Dispatcher.sendAction('TOGGLE_HOTKEYS');
  },
  render: function() {
    return (
		el.ul(null,
			el.li(null,
				el.div({className:'contenedor'},
					el.label({className:'chanceLabel'},
						"Hotkeys"
					),
					el.a({
								type:"button",
								className:"profit btn btn-xs",
								onClick: this._onClick
							},
							worldStore.state.hotkeysEnabled ? el.span({className:'buttonActive'},'ON'): 'OFF'
					)
				)
			)
		)
    );
  }
});

var Tabs = React.createClass({
  displayName: 'Tabs',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  _makeTabChangeHandler: function(tabName) {
    var self = this;
    return function() {
      Dispatcher.sendAction('CHANGE_TAB', tabName);
    };
  },
  render: function() {
	return el.div(null,
		el.ul({className:'row'},
			el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
				el.div({className: 'tab-content', id:'myTabContent'},
					el.ul({className: 'nav nav-tabs'},
						el.li({className: worldStore.state.currTab === 'MY_BETS' ? 'active' : ''},
							el.a(
								{
									href: 'javascript:void(0)',
									onClick: this._makeTabChangeHandler('MY_BETS')
								},
							'My Bets'
							)
						),
						el.li({className: worldStore.state.currTab === 'ALL_BETS' ? 'active' : ''},
							el.a(
								{
									href: 'javascript:void(0)',
									onClick: this._makeTabChangeHandler('ALL_BETS')
								},
							'All Bets'
							)
						),
						!config.recaptcha_sitekey ? '' : 
							el.li({className: worldStore.state.currTab === 'FAUCET' ? 'active' : ''},
							el.a(
								{
									href: 'javascript:void(0)',
									onClick: this._makeTabChangeHandler('FAUCET')
								},
								el.span(null, 'Faucet ')
							)
						)
					)
				)
			)
		)
	);
  }
});

var MyBetsTabContent = React.createClass({
  displayName: 'MyBetsTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div({className:'backgroundBlock'},
		el.ul({className:'row'},
			el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', id:'tabsContent'},
				el.div({className:'tab-pane fade in active', id:'myBets'},
					el.ul({className:'row'},
						el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
							el.ul({className:'row'},
								el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
									"ID"
								),
								el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
									"Profit"
								),
								el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
									'Outcome'
								),
								el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
									'Target'
								)
							)
						)
					),
					el.ul({className:'row'},
						worldStore.state.bets.toArray().map(function(bet) {
							return el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', key: bet.bet_id},
								el.ul({className:'row'},
									el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
										el.a(
											{href: config.mp_browser_uri + '/bets/' + bet.bet_id},
											bet.bet_id
										)
									),
									el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3', style: {color: bet.profit > 0 ? 'green' : 'red'}},
										bet.profit > 0 ? '+' + bet.profit/100 : bet.profit/100
									),
									el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
										bet.outcome + ' ', bet.meta.isFair ?
											el.span(
											{className: 'label label-success'}, 'Verified') : ''
									),
									el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
										 bet.meta.cond + ' ' + bet.meta.number.toFixed(2)
									)
								)
							)
						}).reverse()
					)
				)
			)
				
		)
    );
  }
});

var MyAllBetsTabContent = React.createClass({
  displayName: 'MyAllBetsTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div({className:'backgroundBlock'},
		el.ul({className:'row'},
			el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', id:'tabsContent'},
				el.div({className:'tab-pane fade in active', id:'myBets'},
					el.ul({className:'row'},
						el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
							el.ul({className:'row'},
								el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
									"ID"
								),
								el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
									"Profit"
								),
								el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
									'Player'
								),
								el.li({className:'col-lg-2 col-md-2 col-sm-2 col-xs-2'},
									'Date'
								)
							)
						)
					),
					el.ul({className:'row'},
						worldStore.state.allBets.toArray().map(function(bet) {
						    return el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', key: bet.id},
								el.ul({className:'row'},
									el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
										el.a(
											{href: config.mp_browser_uri + '/bets/' + bet.id},
											bet.id
										)
									),
									el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3', style: {color: bet.profit > 0 ? 'green' : 'red'}},
										bet.profit > 0 ? '+' + bet.profit/100 : bet.profit/100
									),
									el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
										 bet.uname
									),
									el.li({className:'col-lg-3 col-md-3 col-sm-3 col-xs-3'},
									     (bet.created_at).substr(0,10)
									)
								)
							)
							return el.span(null,bet.id )
						})
					)
				)
			)
				
		)
    );
  }
});

var FaucetTabContent = React.createClass({
  displayName: 'FaucetTabContent',
  getInitialState: function() {
    return {
      // SHOW_RECAPTCHA | SUCCESSFULLY_CLAIM | ALREADY_CLAIMED | WAITING_FOR_SERVER
      faucetState: 'SHOW_RECAPTCHA',
      // :: Integer that's updated after the claim from the server so we
      // can show user how much the claim was worth without hardcoding it
      // - It will be in satoshis
      claimAmount: undefined
    };
  },
  // This function is extracted so that we can call it on update and mount
  // when the window.grecaptcha instance loads
  _renderRecaptcha: function() {
    worldStore.state.grecaptcha.render(
      'recaptcha-target',
      {
        sitekey: config.recaptcha_sitekey,
        callback: this._onRecaptchaSubmit
      }
    );
  },
  // `response` is the g-recaptcha-response returned from google
  _onRecaptchaSubmit: function(response) {
    var self = this;
    console.log('recaptcha submitted: ', response);

    self.setState({ faucetState: 'WAITING_FOR_SERVER' });

    MoneyPot.claimFaucet(response, {
      // `data` is { claim_id: Int, amount: Satoshis }
      success: function(data) {
        Dispatcher.sendAction('UPDATE_USER', {
          balance: worldStore.state.user.balance + data.amount
        });
        self.setState({
          faucetState: 'SUCCESSFULLY_CLAIMED',
          claimAmount: data.amount
        });
        // self.props.faucetClaimedAt.update(function() {
        //   return new Date();
        // });
      },
      error: function(xhr, textStatus, errorThrown) {
        if (xhr.responseJSON && xhr.responseJSON.error === 'FAUCET_ALREADY_CLAIMED') {
          self.setState({ faucetState: 'ALREADY_CLAIMED' });
        }
      }
    });
  },
  // This component will mount before window.grecaptcha is loaded if user
  // clicks the Faucet tab before the recaptcha.js script loads, so don't assume
  // we have a grecaptcha instance
  componentDidMount: function() {
    if (worldStore.state.grecaptcha) {
      this._renderRecaptcha();
    }

    worldStore.on('grecaptcha_loaded', this._renderRecaptcha);
  },
  componentWillUnmount: function() {
    worldStore.off('grecaptcha_loaded', this._renderRecaptcha);
  },
  render: function() {

    // If user is not logged in, let them know only logged-in users can claim
    if (!worldStore.state.user) {
      return el.p(
        {className: 'lead'},
        'You must login to claim faucet'
      );
    }

    var innerNode;
    // SHOW_RECAPTCHA | SUCCESSFULLY_CLAIMED | ALREADY_CLAIMED | WAITING_FOR_SERVER
    switch(this.state.faucetState) {
    case 'SHOW_RECAPTCHA':
      innerNode = el.div(
        { id: 'recaptcha-target' },
        !!worldStore.state.grecaptcha ? '' : 'Loading...'
      );
      break;
    case 'SUCCESSFULLY_CLAIMED':
      innerNode = el.div(
        null,
        'Successfully claimed ' + this.state.claimAmount/100 + ' bits.' +
          // TODO: What's the real interval?
          ' You can claim again in 5 minutes.'
      );
      break;
    case 'ALREADY_CLAIMED':
      innerNode = el.div(
        null,
        'ALREADY_CLAIMED'
      );
      break;
    case 'WAITING_FOR_SERVER':
      innerNode = el.div(
        null,
        'WAITING_FOR_SERVER'
      );
      break;
    default:
      alert('Unhandled faucet state');
      return;
    }

    return el.div(
      null,
      innerNode
    );
  }
});

var TabContent = React.createClass({
  displayName: 'TabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    switch(worldStore.state.currTab) {
      case 'FAUCET':
        return React.createElement(FaucetTabContent, null);
      case 'ALL_BETS':
          return React.createElement(MyAllBetsTabContent, null);
      case 'MY_BETS':
        return React.createElement(MyBetsTabContent, null);
      default:
        alert('Unsupported currTab value: ', worldStore.state.currTab);
        break;
    }
  }
});

var Footer = React.createClass({
  displayName: 'Footer',
  render: function() {
    return el.div(
      {
        className: 'text-center text-muted',
        style: {
          marginTop: '200px'
        }
      },
      'Powered by ',
      el.a(
        {
          href: 'https://www.moneypot.com'
        },
        'Moneypot'
      )
    );
  }
});

var BetBoxWager = React.createClass({
  displayName: 'BetBoxWager',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  _onBalanceChange: function(e) {
    
    // Force validation when user logs in
    // TODO: Re-force it when user refreshes
    Dispatcher.sendAction('UPDATE_WAGER', {});
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
    worldStore.on('user_update', this._onBalanceChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
    worldStore.off('user_update', this._onBalanceChange);
  },
  _onWagerChange: function(e) {
    var str = e.target.value;
    betStore.state.profitGained.num = Number(str);
    Dispatcher.sendAction('UPDATE_WAGER', { str: str });
  },
  _onHalveWager: function() {
    var newWager = Math.round(betStore.state.wager.num / 2);
    Dispatcher.sendAction('UPDATE_WAGER', { str: newWager.toString() });
  },
  _onDoubleWager: function() {
    var n = betStore.state.wager.num * 2;
    Dispatcher.sendAction('UPDATE_WAGER', { str: n.toString() });

  },
  _onMaxWager: function() {
    // If user is logged in, use their balance as max wager
    var balanceBits;
    if (worldStore.state.user) {
      balanceBits = Math.floor(worldStore.state.user.balance / 100);
    } else {
      balanceBits = 42000;
    }
    Dispatcher.sendAction('UPDATE_WAGER', { str: balanceBits.toString() });
  },
  //
  render: function() {
    var style1 = { borderBottomLeftRadius: '0', borderBottomRightRadius: '0' };
    var style2 = { borderTopLeftRadius: '0' };
    var style3 = { borderTopRightRadius: '0' };
	var style60 ={ width: '60%'}
	var style20 ={ width: '20%'}
		return el.div({className:"boxCoin"}, 
			el.h3(null, "WAGER"),
			el.fieldset(null,
				el.ul(null,
					el.li({id:'inputBtc'},
						el.div({className:'centerContainer'},
							el.div({className:'buttonCoinCenter'},
								el.input(
									{
									  value: betStore.state.wager.str,
									  type: 'text',
									  className: "inputCoin",
									  onChange: this._onWagerChange,
									  disabled: !!worldStore.state.isLoading,
									  placeholder: 'Bits',
									  id: 'wagerCoinState'
									}
								),
								el.label(
									{
									  value: "Bits",
									  className: "inputCoinLabel",
									  onChange: this._onWagerChange,
									  disabled: !!worldStore.state.isLoading,
									  placeholder: 'Bits'
									},"Bits"
								)
							)
						)
					),
					el.li({id:'BTCMultiplicator'},
						el.ul(null,
							el.li(null,
								el.label(null,
									el.button(
										{
										  id: 'btn12x',
										  type: 'button',
										  className:'botonesHotKey',
										  onClick: this._onHalveWager
										},
										'1/2x ', worldStore.state.hotkeysEnabled ? el.kbd({className:"botonHotKey"}, 'X') : ''
									)
								)
							),
							el.li(null,
								el.label(null,
									el.button(
										{
										  id: 'btn2x',
										  className:'botonesHotKey',
										  type: 'button',
										  onClick: this._onDoubleWager
										},
										'2x ', worldStore.state.hotkeysEnabled ? el.kbd({className:"botonHotKey"}, 'C') : ''
									)
								)
							),
							el.li(null,
								el.label(null,
									el.button(
										{
										  id: 'btnMax',
										  type: 'button',
										  className:'botonesHotKey',
										  onClick: this._onMaxWager
										},
										'Max ', worldStore.state.hotkeysEnabled ? el.kbd({className:"botonHotKey"}, 'V') : ''
									)
								)
							)
						
						)
					
					)
				)
			)
		);
	
	}
});

var BetBox = React.createClass({
  displayName: 'BetBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return 	el.div({className:'backgroundBlock'},
				el.form({id:"profitsBlock"},
					el.ul({className:'row'},
						el.li({className:'col-lg-6 col-md-6 col-sm-6 col-xs-12'},
							el.ul({className:'row'},
								el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
									React.createElement(BetBoxWager, null)
									
								),
								el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
									React.createElement(HotkeyToggle, null)
								)
							)
						),
						el.li({className:'col-lg-6 col-md-6 col-sm-6 col-xs-12'},
							el.ul({className:'row'},
								el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
									React.createElement(BetBoxMultiplier, null)
								),
								el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
									React.createElement(BetBoxChance, null)
								),
								el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
									React.createElement(BetBoxProfit, null)
								)
							)
						),
						el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
						    el.ul({className:'row'},
						        React.createElement(ToggleAutomaticRoll1, null)
						    )
						),
						el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', id:'automaticBet'},
						    el.ul({className:'row'},
                                betStore.state.showAutomaticRoll ? React.createElement(ToggleAutomaticRoll, null) : ''
						    )
						)
					)
				)
			);
  }
});

var ToggleAutomaticRoll1 = React.createClass({
	displayName: 'ToggleAutomaticRoll',
    getInitialState: function() {
        return { waitingForServer: false };
    },
	
    _onStoreChange: function() {
        this.forceUpdate();
    },
    componentDidMount: function() {
        worldStore.on('change', this._onStoreChange);
    },
    componentWillUnmount: function() {
        worldStore.off('change', this._onStoreChange);
    },
	_displayAutomatic: function(){
        Dispatcher.sendAction("TOGGLE_SHOW_AUTOMATIC_ROLL");
        this.forceUpdate();
	},
	render: function() { 
		return  el.div(null,
		            el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
		                el.h5(null,el.span(null, "Automated Betting"))
				    ),
		            el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
		                el.div({className:'buttonMoreCenter'},
		                    el.a(
                              {
                                    onClick: this._displayAutomatic,
                                    className: 'btn buttonMore',
                                    type: 'button',
                                    id: 'displayAutomatic'
                              },
                              !betStore.state.showAutomaticRoll ? '+' : '-'
                            )
		                )
				    )
				);
		}
});

var ToggleAutomaticRoll = React.createClass({
	displayName: 'ToggleAutomaticRoll',
    getInitialState: function() {
        return { waitingForServer: false };
    },
    _onStoreChange: function() {
        console.log("_onStoreChange");
        this.forceUpdate();
    },
    componentDidMount: function() {
        worldStore.on('change', this._onStoreChange);
    },
    componentWillUnmount: function() {
        worldStore.off('change', this._onStoreChange);
    },
	_AutomaticToggle: function(){
        Dispatcher.sendAction('AUTOMATIC_BET_WAGER_STATE');
        this.forceUpdate();
	},
	_numberOfBet: function(e){
	    console.log(e.currentTarget.value);
	    Dispatcher.sendAction("SET_AUTOMATIC_NUMBER_OF_BETS", e.currentTarget.value);
	    this.forceUpdate();
	},
	_increaseOnLose: function(e){
	    Dispatcher.sendAction("SET_INCREASE_ON_LOSE", e.currentTarget.value);
	    this.forceUpdate();
	},
    _increaseOnWin: function(e){
        Dispatcher.sendAction("SET_INCREASE_ON_WIN", e.currentTarget.value);
        this.forceUpdate();
	},
	_stopRoll: function(){
	    Dispatcher.sendAction("STOP_ROLL");
	},
	_setPercentOnWin: function(e){
	    Dispatcher.sendAction("SET_PERCENT_ON_WIN", e.currentTarget.value);
	},
	_setPercentOnLose: function(e){
	    Dispatcher.sendAction("SET_PERCENT_ON_LOSE", e.currentTarget.value);
	},
	_newLimitNumberOfBet: function(e){
	    console.log(betStore.state.disableNumberOfBet + "nuevo limite");
	    var str = e.currentTarget.value;
	    Dispatcher.sendAction("UPDATE_NUMBER_OF_BETS_LIMIT", {str: str});
	    
	    this.forceUpdate();
	},
    _makeBetHandler: function(cond) {
    var self = this;
    
    console.assert(cond === '<' || cond === '>');

        return function(e) {
                $('#wagerCoinState').attr('disabled','true');
                Dispatcher.sendAction('AUTOMATE_TOGGLE_ROLL');
                console.log('Placing bet...');
    
                // Indicate that we are waiting for server response
                self.setState({ waitingForServer: true });
                var profitBet;
                var hash = betStore.state.nextHash;
                console.assert(typeof hash === 'string');
                
                var wagerSatoshis = betStore.state.profitGained.num * 100;
                var multiplier = betStore.state.multiplier.num;
                var payoutSatoshis = wagerSatoshis * multiplier;
                
                var number = helpers.calcNumber(
                cond, helpers.multiplierToWinProb(multiplier)
                );
                
                var params = {
                    wager: wagerSatoshis,
                    client_seed: 0, // TODO
                    hash: hash,
                    cond: cond,
                    target: number,
                    payout: payoutSatoshis
                };

                MoneyPot.placeSimpleDiceBet(params, {
                success: function(bet) {
                  console.log('Successfully placed bet:', bet);
                  // Append to bet list
                  profitBet = bet.profit;
                  // We don't get this info from the API, so assoc it for our use
                  bet.meta = {
                    cond: cond,
                    number: number,
                    hash: hash,
                    isFair: CryptoJS.SHA256(bet.secret + '|' + bet.salt).toString() === hash
                  };
                  
                  Dispatcher.sendAction('CHANGE_TAB', 'MY_BETS');
                  Dispatcher.sendAction('NEW_BET', bet);
                
                  // Update next bet hash
                  Dispatcher.sendAction('SET_NEXT_HASH', bet.next_hash);
                
                  // Update user balance
                  Dispatcher.sendAction('UPDATE_USER', {
                    balance: worldStore.state.user.balance + bet.profit
                  });
                },
                error: function(xhr) {
                  console.log('Error');
                  if (xhr.responseJSON && xhr.responseJSON) {
                    alert(xhr.responseJSON.error);
                  } else {
                    alert('Internal Error');
                  }
                },
                complete: function() {
                        
                    self.setState({ waitingForServer: false });
                    $('#wagerCoinState').attr('disabled',false);
                    // Force re-validation of wager
                    Dispatcher.sendAction('UPDATE_WAGER', {
                        str: betStore.state.wager.str
                    });
                    if(betStore.state.automaticToggle){
                        if(profitBet > 0){
                            if(betStore.state.increaseOnWin == "true"){
                                Dispatcher.sendAction('AUGMENT_PROFIT', betStore.state.percentOnWin);
                            }else{
                                Dispatcher.sendAction('RETURN_BASE_BET');
                            }
                        }else{
                            if(betStore.state.increaseOnLose == "true"){
                                Dispatcher.sendAction('AUGMENT_PROFIT', betStore.state.percentOnLose);
                            }else{
                                Dispatcher.sendAction('RETURN_BASE_BET');
                            }
                        }
                        if(betStore.state.automaticToggle){
                            if(cond === '<'){
                                $('#automateBet-lo')[0].click();
                            }else if(cond === '>') {
                                $('#automateBet-hi')[0].click();
                            }
                        }
                        
                    }
                    
                    
                }
                });
           
        };
    },
	render: function() { 
	        var winProb = helpers.multiplierToWinProb(betStore.state.multiplier.num);
	        var error = betStore.state.wager.error || betStore.state.multiplier.error;
        	var betHiLowNode
            if (worldStore.state.isLoading) {
              // If app is loading, then just disable button until state change
                betHiLowNode = el.button(
                    {type: 'button', disabled: true, className: 'btn btn-lg btn-block btn-default'},
                    'Loading...'
                );
            } else if (error) {
              // If there's a betbox error, then render button in error state
            
              var errorTranslations = {
                'CANNOT_AFFORD_WAGER': 'You cannot afford wager',
                'INVALID_WAGER': 'Invalid wager',
                'INVALID_MULTIPLIER': 'Invalid multiplier',
                'MULTIPLIER_TOO_PRECISE': 'Multiplier too precise',
                'MULTIPLIER_TOO_HIGH': 'Multiplier too high',
                'MULTIPLIER_TOO_LOW': 'Multiplier too low'
              };
            
              betHiLowNode = el.button(
                {type: 'button',
                 disabled: true,
                 className: 'btn btn-lg btn-block btn-danger'},
                errorTranslations[error] || 'Invalid bet'
              );
            } else if (worldStore.state.user) {
                betHiLowNode =
                el.ul({className:'row'},
                    el.li({className: 'col-lg-6 col-md-6 col-sm-6 col-xs-6'},
                		el.a(
                			{
                            type:'button',
                			className: 'blue',
                			id: 'automateBet-hi',
                			onClick: this._makeBetHandler('<')
                			},
                			el.span({className: 'bets unselectable', style:{position:'relative'}},
                				el.span(null,"AUTOMATE HIGH"),
                				el.span({className: 'unselectable autoRateWin'}, '>'+helpers.calcNumber('>',winProb).toFixed(2))
                			)
                		)
                	),
                	el.li({className: 'col-lg-6 col-md-6 col-sm-6 col-xs-6'},
                		el.a(
                			{
                            type:'button',
                			className: 'blue',
                			id: 'automateBet-lo',
                			onClick: this._makeBetHandler('<')
                			},
                			el.span({className: 'bets unselectable', style:{position:'relative'}},
                				el.span(null,"AUTOMATE LOW"),
                				el.span({className: 'unselectable autoRateWin'}, '<'+helpers.calcNumber('<',winProb).toFixed(2))
                			)
                		)
                	)
                );
            }else {
            // If user isn't logged in, give them link to /oauth/authorize
                betHiLowNode = el.a(
                {
                  href: config.mp_browser_uri + '/oauth/authorize' +
                    '?app_id=' + config.app_id +
                    '&redirect_uri=' + config.redirect_uri,
                  className: 'btn btn-lg btn-block btn-success'
                },
                'Login with MoneyPot'
                );
            }
    	var buttonStopNode = 
    	        el.ul({className:'row'},
        			el.li({className: 'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                        
                        el.input(
                            {
                                type: 'button',
                                className: ' btn btn-lg btn-block btn-danger',
                                value: 'STOP ROLL',
                                onClick: this._stopRoll
                            }
                        )
                    )
                );
    	
		return  el.div(null,
		            el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
		                el.div({className:'automateBackground'},
                        		(this.state.waitingForServer) ? buttonStopNode : betHiLowNode
                		)
                	),
                	el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
	                    el.p(null, "Limit number of Bets")
	                ),
		            el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
		                el.div({className:'automateBackground'},
		                    el.ul({className:'row'},
		                        el.li({className:'col-lg-5 col-md-5 col-sm-6 col-xs-6'},
    		                        el.input(
    		                            {
                                            id: 'radioStyle',
                                            name: 'numberOfBet',
                                            type: 'radio',
                                            defaultChecked: "checked",
                                            onChange: this._numberOfBet,
                                            value: 'false'
    		                            }
                                    ),
                                    el.label({className:'radioPureCSS1'},
                                        el.span(null,
                                            el.span(null)
                                        ),
                                        el.label(null, "Unlimited")
                                       
                                    )
                                ),
                                el.li({className:'col-lg-7 col-md-7 col-sm-6 col-xs-6'},
    		                        el.input(
    		                            {
    		                               id: 'radioStyle',
    		                               name: 'numberOfBet',
    		                               type: 'radio',
    		                               onChange: this._numberOfBet,
    		                               value: 'true'
    		                            }
                                    ),
                                    el.label({className:'radioPureCSS1'},
                                        el.span(null,
                                            el.span(null)
                                        ),
                                        el.label(null, "Amount")
                                    ),
                                    el.input(
                                        {
                                            type:'text',
                                            className:'autoAmount',
                                            value: betStore.state.NumberOfBetLimit.str,
                                            onChange: this._newLimitNumberOfBet,
                                            disabled: betStore.state.disableNumberOfBet
                                        }
                                    )
                                )
                            )
	                    )   
	                ),
	                el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
	                    el.p(null, "On Lose")
	                ),
		            el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
		                el.div({className:'automateBackground'},
		                    el.ul({className:'row'},
		                        el.li({className:'col-lg-5 col-md-5 col-sm-6 col-xs-6'},
    		                        el.input(
    		                            {
    		                               id: 'radioStyle',
    		                               name: 'returnOnWin',
    		                               type: 'radio',
    		                               defaultChecked: "checked",
    		                               onChange: this._increaseOnLose,
    		                               value: false
    		                            }
                                    ),
                                    el.label({className:'radioPureCSS1'},
                                        el.span(null,
                                            el.span(null)
                                        ),
                                        el.label(null, "Return to Base")
                                       
                                    )
                                ),
                                el.li({className:'col-lg-7 col-md-7 col-sm-6 col-xs-6'},
    		                        el.input(
    		                            {
    		                               id: 'radioStyle',
    		                               name: 'returnOnWin',
    		                               type: 'radio',
    		                               onChange: this._increaseOnLose,
    		                               value: true
    		                            }
                                    ),
                                    el.label({className:'radioPureCSS1'},
                                        el.span(null,
                                            el.span(null)
                                        ),
                                        el.label(null, "Increase Bet")
                                    ),
                                    el.label({className:'autoRollInputLabel'}, "%"),
                                    el.input(
                                        {
                                            type:'text',
                                            className:'returnAmount',
                                            onChange: this._setPercentOnLose,
                                            value: betStore.state.percentOnLose
                                        }
                                    )
                                )
                            )
	                    )   
	                ),
	                el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
	                    el.p(null, "On Win")
	                ),
		            el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
		                el.div({className:'automateBackground'},
		                    el.ul({className:'row'},
		                        el.li({className:'col-lg-5 col-md-5 col-sm-6 col-xs-6'},
    		                        el.input(
    		                            {
    		                               id: 'radioStyle',
    		                               name: 'returnOnLose',
    		                               type: 'radio',
    		                               defaultChecked: "checked",
    		                               onChange: this._increaseOnWin,
    		                               value: false
    		                            }
                                    ),
                                    el.label({className:'radioPureCSS1'},
                                        el.span(null,
                                            el.span(null)
                                        ),
                                        el.label(null, "Return to Base")
                                       
                                    )
                                ),
                                el.li({className:'col-lg-7 col-md-7 col-sm-6 col-xs-6'},
    		                        el.input(
    		                            {
    		                               id: 'radioStyle',
    		                               name: 'returnOnLose',
    		                               type: 'radio',
    		                               onChange: this._increaseOnWin,
    		                               value: true
    		                            }
                                    ),
                                    el.label({className:'radioPureCSS1'},
                                        el.span(null,
                                            el.span(null)
                                        ),
                                        el.label(null, "Increase Bet")
                                    ),
                                    el.label({className:'autoRollInputLabel'}, "%"),
                                    el.input(
                                        {
                                            type:'text',
                                            className:'returnAmount',
                                            onChange: this._setPercentOnWin,
                                            value: betStore.state.percentOnWin
                                        }
                                    )
                                )
                            )
	                    )   
	                )
					
				);
		}
});


var BetBoxRoll = React.createClass({
	displayName: 'BetBoxRoll',
	render: function() { 
		return  el.div({className:'backgroundBlueSky', id: 'betBoxButton'},
					React.createElement(BetBoxButton, null)
					
				);
		}
});
			
var DiceAnimation = React.createClass({
	displayName: 'DiceAnimation',
	render: function() { 
		return  el.div({className:'backgroundBlock'},
				    el.div({className:'row'},
				        el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
				            el.div({className:'diceRollContainer'},
                                el.img({ id:'imagenGif', onerror:'this.style.display = "none"'},
                                    el.div({className:'numberRolled',id:'numberRolled'})
                                )
				            )    
                        )
                    )
				)
		}
});

var App = React.createClass({
    displayName: 'App',
    _onStoreChange: function() {
        console.log("_onStoreChange");
        this.forceUpdate();
    },
    componentDidMount: function() {
        betStore.on('change', this._onStoreChange);
        chatStore.on('change', this._onStoreChange);
    },
    componentWillUnmount: function() {
        betStore.off('change', this._onStoreChange);
        chatStore.off('change', this._onStoreChange);
    },
    render: function() {
			return el.div(null,
			    el.div(null,chatStore.state.showUserList ? React.createElement(ChatUserList, null) : ''),
			    el.div(null,betStore.state.showHashPopup ? React.createElement(NextHashPopup, null) : ''),
				el.header(null,
					el.div({className:'full-row'},
						el.div({className: 'container'},
							// Navbar
							React.createElement(Navbar, null)
						)
					)
				),
				
				el.div({className: 'container'},
					// BetBox & ChatBox
					el.div({className: 'row section'},
						el.div({className: 'col-lg-5 col-md-5 col-sm-12 col-xs-12 containBlock'},
							el.ul({className:'row'},
								el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', id:'roller'},
									React.createElement(BetBox, null),
									!betStore.state.showAutomaticRoll ? React.createElement(BetBoxRoll, null) : ''
								),
								el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', id:"diceBlock"},
									!betStore.state.showAutomaticRoll ? React.createElement(DiceAnimation, null) : ''
								)
								
							)
						),
						el.div({className: 'col-lg-7 col-md-7 col-sm-12 col-xs-12 containBlock'},
						    el.ul({className:'row'},
                                el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', id:"chatBox"},
									React.createElement(ChatBox, null)
								)
							),
							el.ul({className:'row'},
								el.li({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12', id:"tabsBox"},
									React.createElement(Tabs, null),
									React.createElement(TabContent, null)
								)
							)
						)
					)
				)
			);
  }
});


React.render(
  React.createElement(App, null),
  document.getElementById('app')
);

// If not accessToken,
// If accessToken, then
if (!worldStore.state.accessToken) {
  Dispatcher.sendAction('STOP_LOADING');
  connectToChatServer();
} else {
  // Load user from accessToken
  MoneyPot.getTokenInfo({
    success: function(data) {
      console.log('Successfully loaded user from tokens endpoint', data);
      var user = data.auth.user;
      Dispatcher.sendAction('USER_LOGIN', user);
    },
    error: function(err) {
      console.log('Error:', err);
    },
    complete: function() {
      Dispatcher.sendAction('STOP_LOADING');
      connectToChatServer();
    }
  });
  // Get next bet hash
  MoneyPot.generateBetHash({
    success: function(data) {
      Dispatcher.sendAction('SET_NEXT_HASH', data.hash);
    }
  });
}

////////////////////////////////////////////////////////////
// Hook up to chat server

function connectToChatServer() {
  console.log('Connecting to chat server. AccessToken:',
              worldStore.state.accessToken);

  socket = io(config.chat_uri);

  socket.on('connect', function() {
    console.log('[socket] Connected');

    socket.on('disconnect', function() {
      console.log('[socket] Disconnected');
    });

    socket.on('system_message', function(text) {
      console.log('[socket] Received system message:', text);
      Dispatcher.sendAction('NEW_SYSTEM_MESSAGE', text);
    });

    // message is { text: String, user: { role: String, uname: String} }
    socket.on('new_message', function(message) {
      console.log('[socket] Received chat message:', message);
      Dispatcher.sendAction('NEW_MESSAGE', message);
    });

    socket.on('user_muted', function(data) {
      console.log('[socket] User muted:', data);
    });

    socket.on('user_unmuted', function(data) {
      console.log('[socket] User unmuted:', data);
    });

    socket.on('user_joined', function(user) {
      console.log('[socket] User joined:', user);
      Dispatcher.sendAction('USER_JOINED', user);
    });

    socket.on('user_left', function(user) {
      console.log('[socket] User left:', user);
      Dispatcher.sendAction('USER_LEFT', user);
    });

    // Received when your client doesn't comply with chat-server api
    socket.on('client_error', function(text) {
      console.warn('[socket] Client error:', text);
    });

    // Once we connect to chat server, we send an auth message to join
    // this app's lobby channel.

    // A hash of the current user's accessToken is only sent if you have one
    var hashedToken;
    if (worldStore.state.accessToken) {
      hashedToken =  CryptoJS.SHA256(worldStore.state.accessToken).toString();
    }
    var authPayload = { app_id: config.app_id, hashed_token: hashedToken};
    socket.emit('auth', authPayload, function(err, data) {
      if (err) {
        console.log('[socket] Auth failure:', err);
        return;
      }
      console.log('[socket] Auth success:', data);
      Dispatcher.sendAction('INIT_CHAT', data);
    });
  });
}

// This function is passed to the recaptcha.js script and called when
// the script loads and exposes the window.grecaptcha object. We pass it
// as a prop into the faucet component so that the faucet can update when
// when grecaptcha is loaded.
function onRecaptchaLoad() {
  Dispatcher.sendAction('GRECAPTCHA_LOADED', grecaptcha);
}

$(document).on('keydown', function(e) {
  var H = 72, L = 76, C = 67, X = 88, V = 86, keyCode = e.which;

  // Bail is hotkeys aren't currently enabled to prevent accidental bets
  if (!worldStore.state.hotkeysEnabled) {
    return;
  }

  // Bail if it's not a key we care about
  if (keyCode !== H && keyCode !== L && keyCode !== X && keyCode !== C && keyCode !== V) {
    return;
  }

  // TODO: Remind self which one I need and what they do ^_^;;
  e.stopPropagation();
  e.preventDefault();

  switch(keyCode) {
    case C:  // Increase wager
      var upWager = betStore.state.wager.num * 2;
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: upWager,
        str: upWager.toString()
      });
      break;
    case X:  // Decrease wager
      var downWager = Math.floor(betStore.state.wager.num / 2);
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: downWager,
        str: downWager.toString()
      });
	  break;
	case V:  // Decrease wager
      var maxWager;
		if (worldStore.state.user) {
			maxWager = Math.floor(worldStore.state.user.balance / 100);
		} else {
			maxWager = 42000;
		}
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: maxWager,
        str: maxWager.toString()
      });
	  
      break;
    case L:  // Bet lo
      $('#bet-lo')[0].click();
      break;
    case H:  // Bet hi
      $('#bet-hi')[0].click();
      break;
    default:
      return;
  }
});
window.addEventListener('message', function(event) {
  if (event.origin === config.mp_browser_uri && event.data === 'UPDATE_BALANCE') {
    Dispatcher.sendAction('START_REFRESHING_USER');
  }
}, false);
