var winston = require('winston');
require('winston-loggly');
winston.emitErrs = true;

var fs = require('fs'),
    path = require('path'),
    logDir = 'logs'; // directory path you want to set

// ensure log directory exists
fs.existsSync('./' + logDir) || fs.mkdirSync('./' + logDir);

var logger = new winston.Logger({
    transports: [
        new winston.transports.File({
            level: 'info',
            filename: './' + logDir + '/all.log',
            handleExceptions: true,
            timestamp: true,
            json: true,
            tailable: true,
            zippedArchive: true,
            maxsize: 5242880, //5MB
            maxFiles: 5,
            colorize: true
        }),
        new winston.transports.Console({
            level: 'debug',
            handleExceptions: true,
            timestamp: true,
            prettyPrint: true,
            json: false,
            colorize: true
        }),
        new winston.transports.Loggly({
            level: 'warn',
            subdomain: 'esjinteracctive',
            inputToken: '9989a034-180a-43c7-9c42-a61f265761ec',
            auth: {
                'username': 'ugo',
                'password': 'Access2016!'
            },
            handleExceptions: true,
            json: true,
            tags: ['NodeJS', '101ng.com']
        })
    ],
    exitOnError: false
});

module.exports = logger;
module.exports.stream = {
    write: function (message, encoding) {
        logger.info(message);
    }
};