var dotenv = require('dotenv');
dotenv.load();

var logger = require("./util/logger"),

    helmet = require('helmet'),

    express = require('express'),
    app = express(),
    favicon = require('serve-favicon'),
    path = require('path'),
    request = require('request'),
    validator = require('validator');

function initApp(port) {

    var port = normalizePort(port);

    // setup a logger
    app.use(require('morgan')(
        '{"remote_addr": ":remote-addr",'
        + '"remote_user": ":remote-user",'
        + '"date": ":date[clf]",'
        + '"method": ":method",'
        + '"url": ":url",'
        + '"http_version": ":http-version",'
        + '"status": ":status",'
        + '"result_length": ":res[content-length]",'
        + '"referrer": ":referrer",'
        + '"user_agent": ":user-agent",'
        + '"response_time": ":response-time"}', { stream: logger.stream }));

    app.use(helmet());

    app.all('/*', function (req, res, next) {
        // CORS headers
        res.header("Access-Control-Allow-Origin", "*"); // restrict it to the required domain
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        // Set custom headers for CORS
        res.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Access-Token,X-Key');
        if (req.method == 'OPTIONS') {
            res.status(200).end();
        } else {
            next();
        }
    });

    app.use(favicon(__dirname + '/public/images/favicon.ico'));

    // set the view engine to ejs
    app.set('view engine', 'ejs');
    app.engine('html', require('ejs').renderFile);
    app.set('views', __dirname + '/views');

    app.use(express.static(__dirname + '/public'));
    //app.use('/', express.static(__dirname + '/www')); // redirect root
    app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
    app.use('/js', express.static(__dirname + '/node_modules/material-design-lite/dist')); // redirect JS Material Design
    app.use('/css', express.static(__dirname + '/node_modules/material-design-lite/dist')); // redirect CSS Material Design
    app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
    app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap
    app.use('/fonts', express.static(__dirname + '/node_modules/bootstrap/fonts')); // redirect CSS bootstrap
    app.use('/js', express.static(__dirname + '/node_modules/vue/dist')); // redirect bootstrap JS

    // Include path to Semantic UI Framework dependencies
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-reset'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-site'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-grid'));
    app.use('/js', express.static(__dirname + '/node_modules/semantic-ui-transition'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-transition'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-input'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-dropdown'));
    app.use('/js', express.static(__dirname + '/node_modules/semantic-ui-dropdown'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-menu'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-container'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-header'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-form'));
    app.use('/css', express.static(__dirname + '/node_modules/semantic-ui-button'));

    app.use('/css', express.static(__dirname + '/bower_components/uikit/css'));
    app.use('/fonts', express.static(__dirname + '/bower_components/uikit/fonts'));
    app.use('/js', express.static(__dirname + '/bower_components/uikit/js'));

    app.use('/js', express.static(__dirname + '/public/js'));
    app.use('/css', express.static(__dirname + '/public/css'));

    var router = express.Router();

    app.locals.isDevEnvironment = process.env.NODE_ENV === 'development' || false;

    var ParseServer = require('parse-server').ParseServer,
        // TODO: The following config object can be externalised into a JS file and/or module-exported
        parseServerConfig = {
            databaseURI: process.env.PARSE_SERVER_DATABASE_URI || 'mongodb://vmhost/topup_dashboard',
            cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',
            appId: process.env.PARSE_SERVER_APPLICATION_ID || 'com.ugommirikwe.101ng',
            masterKey: process.env.PARSE_SERVER_MASTER_KEY || 'mySecretMasterKey',
            serverURL: 'http://' + process.env.HOSTNAME + ':' + port + '/parse',
            // fileKey: 'myFileKey',
            // push: { ... }, // See the Push wiki page
            // filesAdapter: ...,
            /*liveQuery: {
                classNames: ["Posts", "Comments"] // List of classes to support for query subscriptions
            }*/
        },
        api = new ParseServer(parseServerConfig);

    var ParseDashboard = require('parse-dashboard'),
        // TODO: The following config object can be externalised into a JS file and/or module-exported
        dashboardConfig = {
            'allowInsecureHTTP': true,
            'apps': [
                {
                    'serverURL': process.env.NODE_ENV === 'development' ?
                        'http://' + process.env.PARSE_SERVER_URL + ':' + port + '/parse' :
                        process.env.URL_SCHEME + '://' + process.env.PARSE_SERVER_URL + '/parse',
                    'appId': parseServerConfig.appId,
                    'masterKey': parseServerConfig.masterKey,
                    'appName': process.env.APP_NAME || 'Acumeni Feedback Service'
                }
            ],
            "users": [
                // When user1 logs in, he/she will be able to manage appId1 and appId2 from the dashboard.
                {
                    'user': 'ugo',
                    'pass': '07psnm7e1981@',
                    // "apps": [{ "appId1": parseServerConfig.appId }, { "appId2": "myAppId2" }]
                },
                // When user2 logs in, he/she will only be able to manage appId1 from the dashboard.
                {
                    'user': 'jeff',
                    'pass': 'Access2016!',
                    // "apps": [{ "appId1": "myAppId1" }]
                }
            ]
        },
        dashboard = new ParseDashboard(dashboardConfig, dashboardConfig.allowInsecureHTTP);

    // make the Parse Server available at /parse
    var mountPath = process.env.PARSE_MOUNT || '/parse';
    app.use(mountPath, api);

    // make the Parse Dashboard available at /dashboard
    app.use('/dashboard', dashboard);

    var bodyParser = require('body-parser');
    app.use(bodyParser.json()); // for parsing application/json -encoded bodies
    app.use(bodyParser.urlencoded({ // for parsing application/x-www-form-urlencoded
        extended: true
    }));
    // app.use(cookieParser());

    // include definition of other routes in this app
    require('./routes')(app);

    // Setup Keymetrics as a middleware to monitor and report errors
    var pmx = require('pmx');
    app.use(pmx.expressErrorHandler());

    app.use("*", function (req, res) {
        res.render('404');
    });

    // Production error handler -- no stacktraces leaked to user
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.sendStatus(500);
        /*res.render('error', {
            message: err.message,
            error: {}
        });*/
    });
}

function normalizePort(val) {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}

// TODO: refactor to return a Promise, instead of using the callback pattern
function retrieveAppConfig(callback) {
    Parse.Config.get().then(function (config) {
        var configItems = {};
        configItems.amount = config.get('amount');
        configItems.email = config.get('support_email_address');
        configItems.countryCodes = config.get('country_codes');
        configItems.topUpServiceAPILogin = config.get('topup_service_api_login');
        configItems.topUpServiceAPIPassword = config.get('topup_service_api_password');

        app.locals.appConfig = configItems;

        callback();

    }, function (error) {
        console.warn('Parse Config retrieval failed');
        callback(error);
    });
}

/**
 * Starts this web app.
 * @param {int}         An integer indicating port to start server with and listen on for traffic.
 * @param {HttpServer}  A Node JS HttpServer object which will be used in starting and serving the app
 * @param {boolean}     startLiveQueryServer True or false to start the Parse Live Query feature for websocket-based real-time data pub/sub.
 */
function start(port, startLiveQueryServer) {
    var fs = require('fs'),
        port = normalizePort(port || process.env.NODE_PORT || 3000),

        /*privateKey = fs.readFileSync('./ssl/server.key'),
        certificate = fs.readFileSync('./ssl/server.crt'),
        credentials = { key: privateKey, cert: certificate };*/

        httpServer = require('http').createServer(app),
        startLiveQueryServer = startLiveQueryServer || false;

    return httpServer.listen(port, function () {
        retrieveAppConfig(function (error) {
            if (error) {
                /*console.error('App couldn\'t retrieve configuration items; shutting down!');
                return httpServer.close();*/

                console.info('App couldn\'t retrieve configuration items from Parse Dashboard; pulling backup info from Config module.');

                var config = require('./util/config'),
                    configItems = {};

                configItems.amount = config.amount;
                configItems.email = config.emailAddress;
                configItems.countryCodes = config.countryCodes;
                configItems.topUpServiceAPILogin = config.topupServiceAPILogin;
                configItems.topUpServiceAPIPassword = config.topupServiceAPIPassword;

                app.locals.appConfig = configItems;
            }

            console.log(process.env.APP_NAME || 'Acumeni Feedback' + " App listening on port %d in %s mode", port, process.env.NODE_ENV);

            if (startLiveQueryServer) {
                ParseServer.createLiveQueryServer(httpServer);
                console.log(process.env.APP_NAME || 'Acumeni Feedback' + ' ParseLiveQueryServer started.');
            }

        })
    });
}

module.exports = {
    init: initApp,
    start: start,
    app: app
}