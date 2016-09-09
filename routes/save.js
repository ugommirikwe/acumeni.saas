var express = require('express'),
    SaveController = express.Router(),
    async = require('async'),
    request = require('request'),
    // router = express.Router(),
    app_config = require('../util/config'),
    randomNumberGenerator = require('../util/randomNumberGenerator'),
    mobilePhoneNumberParser = require('../util/mobilePhoneNumberParser')/*,
    dbInstance = require('../util/db'),
    qtpayments = dbInstance.getDB().get('qtpayments'),
    qtpayments_log = dbInstance.getDB().get('qtpayments_log')*/;

// TODO: Test without an "amount" field in the req.body object
// TODO: Test with empty string value for the "amount" field in the req.body object
// TODO: Test ...
function validateSubmittedParams(req, res, next) {
    if (req.body.amount == undefined || req.body.amount == '') {
        return sendResponse({ 'errorMsg': '"amount" field must be submitted' });
    }

    if (req.body.countryCode == undefined || req.body.countryCode == '') {
        return sendResponse({ 'errorMsg': '"countryCode" field must be submitted' });
    }

    if (req.body.mobileNumber == undefined ||
        req.body.mobileNumber == '' ||
        validateBeneficiaryPhoneNumber(req.body.mobileNumber) != '') {

        return sendResponse({ 'errorMsg': '"mobileNumber" field must be submitted with a valid value.' });
    }

    if (req.body.requestReference == undefined || req.body.requestReference == '') {
        return sendResponse({ 'errorMsg': '"requestReference" field must be submitted' });
    }

    // Let's pretend a currency field was submitted with 'NGN' value; then pass it to next middleware function
    // TODO: implement passing the currency field from the client-side.
    req.body.currency = 'NGN';

    next();
}

// TODO: Refactor this into a separate JS module file so it can be reused (in home page).
function validateBeneficiaryPhoneNumber(phoneNumber) {
    var validator = require('validator');
    if (!validator.isNumeric(phoneNumber.trim())) {
        return 'Mobile phone number can only be numbers';
    } else if (!validator.isLength(phoneNumber.trim(), { min: 10, max: 11 })) {
        return 'The beneficiary\'s mobile phone number can\'t be less than 10 digits long.';
    } else {
        return '';
    }
}

/**
 * A custom middleware function to handle the POST method request of the 'save' route
 * @param {Object}  req   An Express JS object, which is an enhanced version of Node JS’s own request object, and represents an in-progress request from a network client.
 * @param {Object}  res   An Express JS object, which is an enhanced version of Node JS’s own response object, and represents the HTTP response that an Express app sends when it gets an HTTP request.
 */
function handlePOSTMethod(req, res) {

    var submittedData = {};

    submittedData = {
        paymentCode: app_config.interswitchPaymentCode,
        currency: req.body.currency,
        // convert to lowest currency division (i.e. kobo) for more precise calculations
        // TODO: currency divisor/multiplier value should be gotten dynamically,
        // instead of assuming '100', depending on the currency
        amount: req.body.amount * 100,
        countryCode: req.body.countryCode,
        mobileNumber: mobilePhoneNumberParser.appendLeadingZero(req.body.mobileNumber),
        emailAddress: req.app.locals.appConfig.email,
        // Interswitch requires 'customerId' parameter
        customerId: app_config.interswitchCustomerId + ' (+' + req.body.countryCode + mobilePhoneNumberParser.stripLeadingZero(req.body.mobileNumber) + ')',
        requestReference: req.body.requestReference,
        gatewayUrl: app_config.interswitchBaseUrl
    };

    ensureTransactionRefIsUnique(submittedData.requestReference, function (data) {
        if (typeof data.errorMsg != 'undefined') {
            return sendResponse(data, req, res);
        }

        // Overwrite 'requestReference' data with validated unique value
        submittedData['requestReference'] = data;
        submittedData['redirectUrl'] = app_config.interswitchRedirectUrl + '?ref=' + data;
        saveTransactionToDatabase(submittedData, req, res);
    });

};

/**
 * Check that the transaction id/ref is unique in transaction records; generate another one if it isn't.
 * @param {Number}      initialTransactionRef
 * @param {Function}    callback
 */
function ensureTransactionRefIsUnique(initialTransactionRef, callback) {

    // Start the process:
    verifyIsUnique(initialTransactionRef);

    // NOTE: Place other variables here, and you can collect the results
    // within the closure, and send them as arguments to your callback

    /**
     * Recursively queries the database to verify uniqueness of ref, and generating new one if not.
     * @param {Number} transactionRefToTest
     */
    function verifyIsUnique(transactionRefToTest) {
        var Transaction = Parse.Object.extend('Transaction');
        var query = new Parse.Query(Transaction);
        query.equalTo('requestReference', transactionRefToTest);
        query.count().then(function (found) {

            // If transcation ref/id has been used by another transaction and logged in the database,
            if (found > 0) {

                // then generate another transaction ref/id and check for uniqueness in database;
                var newUniqueRef = app_config.interswitchReqRefCodePrefix
                    + randomNumberGenerator(app_config.interswitchReqRefCodeLength);

                // repeat the process until we get a transaction ref/id that's unique in database.
                verifyIsUnique(newUniqueRef);

            } else {
                // If current transaction ref/id is truly unique in the database, then move on to the next step.
                callback(transactionRefToTest);
            }

        }, function (e) {
            callback({
                'errorMsg': 'Encountered issue:\n ' + e.message + '\n while verifying that'
                + ' generated ref ID for this transaction is unique in our database.'
            });
        });
    }
}

/**
 * Save transaction details to database.
 * @param {Object}    transactionData         A valid object literal / JSON object containing data to be peristed.
 * @param {Object}  req   An Express JS object, which is an enhanced version of Node JS’s own request object, and represents an in-progress request from a network client.
 * @param {Object}  res   An Express JS object, which is an enhanced version of Node JS’s own response object, and represents the HTTP response that an Express app sends when it gets an HTTP request.
 */
function saveTransactionToDatabase(transactionData, req, res) {
    if (transactionData !== undefined) {
        if (typeof transactionData === 'object') {

            var dataToSave = {
                requestReference: transactionData.requestReference,
                mobileNumber: transactionData.countryCode + mobilePhoneNumberParser.stripLeadingZero(transactionData.mobileNumber),
                amount: transactionData.amount,
                // amount_in_small_division: transactionData.amount,
                currency: transactionData.currency,
                // interswitchPaymentCode: transactionData.paymentCode,
                // customerId: transactionData.customerId,
            };

            var Transaction = Parse.Object.extend("Transaction");
            var transaction = new Transaction();
            transaction.save(dataToSave).then(function (saveOutcome) {
                sendResponse(transactionData, req, res);
            }, function (error) {
                transactionData['errorMsg'] = error.message;
                sendResponse(transactionData, req, res);
            });

        } else {
            transactionData['errorMsg'] = 'The data provided isn\'t in a valid format.';
            return sendResponse(transactionData, req, res);
        }
    } else {
        transactionData['errorMsg'] = 'No data provided to save to database.';
        return sendResponse(transactionData, req, res);
    }
};

/**
 * Return a response to HTTP client.
 * @param {Object}  transactionData     Payload to send back to client.
 * @param {Object}  req                 An Express JS object, which is an enhanced version of Node JS’s own request object, and represents an in-progress request from a network client.
 * @param {Object}  res                 An Express JS object, which is an enhanced version of Node JS’s own response object, and represents the HTTP response that an Express app sends when it gets an HTTP request.
 * @returns {void}
 */
function sendResponse(transactionData, req, res) {
    if (req.xhr) res.json(transactionData);
    else {
        // If client is invoking this endpoint sans AJAX and errors where encountered in server-side,
        // render the homepage with the error encountered.
        if (transactionData.errorMsg != undefined && transactionData.errorMsg.trim() != '') {
            console.info(transactionData.errorMsg);
            return res.render('/', transactionData);
        }

        // TODO: Need to edit the "/save" page to show these details and ask user to "Confirm Purchase" by clicking a button,
        // which will then post the details to Interswitch.
        transactionData['page_title'] = 'Confirm and Submit Purchase Details - ' + page_title_prefix;
        res.render('save', { 'submittedData': transactionData });
    }
}

module.exports = SaveController
    .post('/', validateSubmittedParams, handlePOSTMethod)
    .get('/', function respondToGetRequest(req, res) {
        res.send(200);
    })