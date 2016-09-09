var express = require('express'),
    PWQController = express.Router(),
    request = require('request'),

    app_config = require('../util/config'),
    mobilePhoneNumberParser = require('../util/mobilePhoneNumberParser'),
    httpReq, httpRes, thisTransactionRef;

/**
 * Sends back a response to the client making this call to this endpoint.
 *
 * @param {Object}      responseMessage         An object containing the message to be sent back. It'll contain the following properties:
 *                          {String} errorMsg   This represents a description of any error encountered in processing this client's call.
 *
 * @param {Object}      req                     Express Http Request object
 * @param {Object}      res                     Express Http Response object
 */
function sendResponse(responseMessage, req, res) {
    if (req.xhr) {
        res.json(responseMessage.errorMsg)
    } else {
        res.render('qtpayment',
            {
                'message': responseMessage.errorMsg,
                'page_title': app_config.site_title_prefix + ' - Interswitch Payment Response'
            });
    }
};


/**
 * A middleware method to validate parameters returned by Interswitch before handing over to the route controller to process the reported payment.
 *
 * @param {HTTPRequest}     req     ExpressJS HTTPRequest object encapsulating the data sent from the client (and possibly modified by any middleware before getting here).
 * @param {HTTPResponse}    res     HTTPResponse object encapsulating the data that would be sent back to the client.
 * @param {Function}        next    Middleware callback function to be called to pass-on execution of this client request.
 */
function validatePostParams(req, res, next) {

    var pwq_params = {};

    var refErrorMessage = ' If you are not sure what this means, send an email to our customer care center: '
        + req.app.locals.appConfig.email;
    // + app_config.emailAddress;

    // TODO: Test absence of querystring 'ref'
    if (!req.query.ref) return sendResponse("ERROR: 'ref' querystring param is expected but wasn't provided. " + refErrorMessage, req, res);

    // TODO: Test querystring 'ref' with empty string
    if (req.query.ref.trim() == '') return sendResponse("ERROR: 'ref' querystring param value can't be an empty string. " + refErrorMessage, req, res);
    pwq_params['tx_id'] = req.query.ref;

    var errorContact = refErrorMessage + ' and include this transaction reference: ' + pwq_params.tx_id;

    pwq_params['resp_desc'] = req.body.resp_desc || '';

    // TODO: Test absence of param 'resp_code'
    if (!req.body.resp_code) return sendResponse("ERROR: 'resp_code' param is expected but wasn't provided." + errorContact, req, res);

    // TODO: Test param 'resp_code' with empty string
    if (req.body.resp_code.trim() == '') return sendResponse("ERROR: 'resp_code' param can't be an empty string." + errorContact, req, res);
    pwq_params['resp_code'] = req.body.resp_code;

    // TODO: Test param 'resp_code' with value '00'
    if (pwq_params.resp_code == '00') {

        // TODO: Test absence of param 'amount', given existence of param 'resp_code'
        if (!req.body.amount) return sendResponse("ERROR: 'amount' param is expected but wasn't provided." + errorContact, req, res);

        // TODO: Test param 'amount' with empty string, given existence of param 'resp_code'
        if (req.body.amount.trim() == '') return sendResponse("ERROR: 'amount' param can't be an empty string." + errorContact, req, res);
        pwq_params['amount'] = req.body.amount;

        var tx_ref_error = 'We aren\'t sure what happened at Interswitch\'s servers, '
            + 'they didn\'t even provide a transaction reference, but returned this error: "'
            + pwq_params.resp_code + ': ' + pwq_params.resp_desc + '".';

        // TODO: Test absence of param 'tx_ref', given existence of param 'resp_code'
        if (!req.body.tx_ref) return sendResponse(tx_ref_error, req, res);

        // TODO: Test param 'tx_ref' with empty string, given existence of param 'resp_code'
        if (req.body.tx_ref.trim() == '') return sendResponse(tx_ref_error, req, res);
        pwq_params['tx_ref'] = req.body.tx_ref;

        req.pwq_params = pwq_params;

        // Move on to the next middleware hook for this route
        next();

    } else
        // TODO: Test param 'resp_code' with other values asides '00'
        return sendResponse(
            {
                'errorMsg':
                pwq_params.resp_desc.trim() != '' ?
                    'Something happened at Interswitch\'s end and here\'s what they reported: "' + pwq_params.resp_desc + '"' + errorContact
                    : 'We aren\'t sure what happened at Interswitch\'s servers and '
                    + 'they didn\'t even provide any detail. ' + errorContact
            },
            req, res);
}


/**
 * Main route handler -- handles payments' processing respons from Interswitch and invokes the Top-Up online API service.
 *
 * @param {HttpRequest}     req                         The Node HTTPRequest object, also containing a custom object 'pwq_params' with properties:
 *                              pwq_params.tx_id	    Transaction reference/id issued earlier for this transaction by this app and appended as a querystring appended to the callback URL sent to Interswitch
 *                              pwq_params.resp_code    A response code indicating the outcome/status of the payment processing
 *                              pwq_params.resp_desc    A textual description of the response code
 *                              pwq_params.tx_ref       An Interswitch-generated unique reference for the transaction
 *                              pwq_params.amount       Amount Interswitch reports to have processed
 *
 * @param {HttpResponse}    res                         The NodeJS HTTPResponse object.
 */
function routePOSTHandler(req, res) {

    var errorContact = '\nPlease send an email to our customer care center: '
        + req.app.locals.appConfig.email + ' and include this transaction reference code in your subject line: '
        // + app_config(req).emailAddress + ' and include this transaction reference code in your subject line: '
        // + tx_id + '. ';
        + req.pwq_params.tx_id + '. ';

    // Move the entire req object into the pwq_params object,
    // to be passed further on to other functions that'll need it.
    req.pwq_params['req'] = req;

    // A code that shows if the transaction was successful or not.
    switch (req.pwq_params.resp_code) {
        case '00': //‘00’ denotes successful; every other value indicates failure.
            httpReq = req;
            httpRes = res;
            thisTransactionRef = req.pwq_params.tx_id;

            paymentSuccessHandler(req.pwq_params);
            break;
        default:
            sendResponse({ 'errorMsg': 'Payment failed for this reason: ' + req.pwq_params.resp_desc + '.' + errorContact }, req, res);
            break;
    }

}


/**
 * Processes the response from Interswitch API service indicating payment was successful.
 *
 * @param {Object}      pwq_params      An object containing data received from the Interswitch API; it contains the following properties:
 *                          tx_id	    Transaction reference/id issued earlier for this transaction by this app and appended as a querystring appended to the callback URL sent to Interswitch
 *                          resp_code   A response code indicating the outcome/status of the payment processing
 *                          resp_desc   A textual description of the response code
 *                          tx_ref      An Interswitch-generated unique reference for the transaction
 *                          amount      Amount Interswitch reports to have processed
 */
function paymentSuccessHandler(pwq_params) {
    var async = require('async');
    async.waterfall(
        [
            async.apply(checkTransactionRecordExistsForPayment, pwq_params),
            checkAmountInDatabaseMatchesProcessedAmount,
            updateTransactionRecordWithInterswitchResponse,
            queryInterswitchForVerfication,
            updateDatabaseWithInterswitchRequeryResult,
            callTopUpAPI,
        ],
        function purchaseOperationsCompleted(errorsEncountered, lastOperationResult) {
            if (errorsEncountered) {
                markTransactionAsFailed(errorsEncountered);
            } else {
                markTransactionAsSuccessful(lastOperationResult);
            }
        }
    );
}


/**
 * Queries the database for record of transaction for which payment is being processed.
 *
 * @param {Object}      pwq_params      An object containing data received from the Interswitch API; it contains the following properties:
 *                          tx_id	    Transaction reference/id issued earlier for this transaction by this app and appended as a querystring appended to the callback URL sent to Interswitch
 *                          resp_code   A response code indicating the outcome/status of the payment processing
 *                          resp_desc   A textual description of the response code
 *                          tx_ref      An Interswitch-generated unique reference for the transaction
 *                          amount      Amount Interswitch reports to have processed
 *
 * @param {Function}    callback        A function to pass on control to after running the database query; it takes the following arguments: **TODO
 */
function checkTransactionRecordExistsForPayment(pwq_params, callback) {
    var Transaction = Parse.Object.extend('Transaction');
    var transaction = new Parse.Query(Transaction);
    transaction.equalTo('requestReference', pwq_params.tx_id);
    transaction.find().then(function transactionRecordExistsQueryResult(recordsFound) {
        if (recordsFound.length < 1) {
            return callback('No transaction record exists in our database for this payment. ');
        }

        // callback(null, recordsFound, amount);
        callback(null, pwq_params, recordsFound);

    }, function transactionRecordExistsQueryError(e) {
        return callback(e.message);
    });
}


/**
 * If a transaction record is found, check that the amount returned from Interswitch matches what's in the database.
 *
 * @param {Object}      pwq_params      An object containing data received from the Interswitch API; it contains the following properties:
 *                          tx_id	    Transaction reference/id issued earlier for this transaction by this app and appended as a querystring appended to the callback URL sent to Interswitch
 *                          resp_code   A response code indicating the outcome/status of the payment processing
 *                          resp_desc   A textual description of the response code
 *                          tx_ref      An Interswitch-generated unique reference for the transaction
 *                          amount      Amount Interswitch reports to have processed
 *
 * @param {Array}       recordsFound    Passed in from the previous function, this is the result of a query on the database for transaction being processed.
 * @param {Function}    callback        Function called at the end of this function.
*/
function checkAmountInDatabaseMatchesProcessedAmount(pwq_params, recordsFound, callback) {
    var amountRetrievedFromDatabase = recordsFound[0].get('amount');

    if (typeof amountRetrievedFromDatabase == 'undefined') {
        return callback('ERROR: No amount was recorded for the item purchased');
    }
    // if (mobileNumberRetrievedFromDatabase * 100 != amount) {
    if (amountRetrievedFromDatabase != pwq_params.amount) {
        return callback('ERROR: The amount processed by Interswitch doesn\'t match the price for the item purchased.');
    }
    // amountRetrievedFromDatabase = pwq_params.amount / 100;
    pwq_params['amountRetrievedFromDatabase'] = amountRetrievedFromDatabase;

    var mobileNumberRetrievedFromDatabase = recordsFound[0].get('mobileNumber');
    if (typeof mobileNumberRetrievedFromDatabase == 'undefined') {
        return callback('ERROR: No phone number was used for the topup purchased');
    }
    pwq_params['mobileNumberRetrievedFromDatabase'] = mobileNumberRetrievedFromDatabase;
    pwq_params['amountRetrievedFromDatabase'] = amountRetrievedFromDatabase;

    var countryCodeRetrievedFromDatabase = recordsFound[0].get('countryCode');
    if (typeof countryCodeRetrievedFromDatabase == 'undefined') {
        countryCodeRetrievedFromDatabase = '234';
        // return callback('ERROR: No country was used for the topup purchased');
    }
    pwq_params['countryCodeRetrievedFromDatabase'] = countryCodeRetrievedFromDatabase;

    callback(null, pwq_params);
}


/**
 * Updates the database with details of response from Interswitch.
 *
 * @param {Object}      pwq_params      An object containing data received from the Interswitch API; it contains the following properties:
 *                          tx_id	    Transaction reference/id issued earlier for this transaction by this app and appended as a querystring appended to the callback URL sent to Interswitch
 *                          resp_code   A response code indicating the outcome/status of the payment processing
 *                          resp_desc   A textual description of the response code
 *                          tx_ref      An Interswitch-generated unique reference for the transaction
 *                          amount      Amount Interswitch reports to have processed
 *
 * @param {Function}    callback        A function to be called on completion of this method.
 */
function updateTransactionRecordWithInterswitchResponse(pwq_params, callback) {

    var thisTransaction = new Parse.Query('Transaction');
    thisTransaction.equalTo('requestReference', pwq_params.tx_id);

    thisTransaction.first().then(

        function updateTransactionRecord(transactionMatched) {
            transactionMatched.set('payment_status', 'pending verification');
            transactionMatched.set('payment_provider', "Interswitch");
            transactionMatched.set('resp_code', pwq_params.resp_code);
            transactionMatched.set('resp_desc', pwq_params.resp_desc || '');
            transactionMatched.set('tx_ref', pwq_params.tx_ref);
            transactionMatched.set('amount_processed', pwq_params.amount);
            // transactionToUpdate.set("skills", ["pwnage", "flying"]);

            return transactionMatched.save();

        }).then(function (outcome) {

            callback(null, pwq_params);

        }, function (e) {
            // If an error was encountered while reading or updating the database,
            // terminate the entire process with an error message
            return callback(e.message);
        });
}


/**
 * Query Interswitch service API endpoint to verify these transaction details.
 *
 * @param {String}      tx_id
 * @param {String}      interswitchPaymentVerificationAPIEndPoint
 * @param {String}      clientId
 * @param {String}      interswitchMerchantSecret
 * @param {Function}    callback
 *
 * TODO: remember to pass-in all the dependencies of this function as arguments
 * TODO: Extract this function into an independent module, so it can be reused elsewhere
 */
function queryInterswitchForVerfication(pwq_params, callback) {
    var interswitchPaymentVerificationAPIEndPoint = app_config.interswitchCallBackUrl,
        clientId = app_config.interswitchClientId,
        interswitchMerchantSecret = app_config.interswitchMerchantSecret,
        crypto = require('crypto'),
        hash = crypto.createHash('sha512').update(pwq_params.tx_id + interswitchMerchantSecret).digest('hex');

    var options = {
        url: interswitchPaymentVerificationAPIEndPoint + pwq_params.tx_id + '?isRequestRef=true',
        headers: {
            'clientId': clientId,
            'Hash': hash
        }
    };

    // 'checkServerIdentity' property is used to handle issue with Interswitch using an invalid SSL cert for their test environment
    if (app_config.isDevEnvironment) {
        options['checkServerIdentity'] = function (host, cert) {
            return undefined;
        }
    }

    try {
        request(options, handleQueryResponse);
    } catch (interswitchQueryError) {
        return callback(interswitchQueryError);
    }

    function handleQueryResponse(error, response, body) {
        if (error) {
            return callback('ERROR: ' + error);
        }
        if (typeof response == 'undefined' || response.statusCode != 200) {
            return callback('ERROR: No response');
        }
        if (typeof body == 'undefined') {
            return callback('ERROR: We aren\'t sure what happened at Interswitch\'s end, '
                + 'but no information was provided. ');
        }

        body = JSON.parse(body);

        if (typeof body.ResponseCode == 'undefined') {
            return callback('ERROR: "ResponseCode" parameter is expected from Interswitch but is not provided.');
        }

        switch (body.ResponseCode) {
            case '00':
                if (typeof body.Amount == 'undefined') {
                    return callback('ERROR: Verification of payment failed because Interswitch didn\'t provide us the "amount" they processed.');
                }
                var amountNormalized = body.Amount / 100;
                if (body.Amount != pwq_params.amountRetrievedFromDatabase) {
                    return callback('ERROR: The amount processed by Interswitch: NGN' + amountNormalized
                        + ' does not match the value for the top-up purchased: NGN' + (pwq_params.amountRetrievedFromDatabase / 100));
                }

                pwq_params['amount_topup'] = amountNormalized;

                callback(null, body, pwq_params);
                break;

            default:
                callback('ERROR: Interswitch reports your payment wasn\'t successful for this reason: "Error Code: '
                    + body.ResponseCode + ' -- ' + body.ResponseDescription + '".');
                break;
        }
    }

}


/**
 * Update database with the payment status retrieved from the Interswitch Payment Verification API.
 *
 * @param {Object}      body
 * @param {Object}      pwq_params
 * @param {Function}    callback
 */
function updateDatabaseWithInterswitchRequeryResult(body, pwq_params, callback) {
    var thisTransaction = new Parse.Query('Transaction');
    thisTransaction.equalTo('requestReference', pwq_params.tx_id);
    thisTransaction.first().then(
        function updateTransactionRecord(transactionMatched) {
            transactionMatched.set('payment_status', 'successful');
            transactionMatched.set('payment_provider', 'Interswitch');
            transactionMatched.set('resp_code', body.ResponseCode);
            transactionMatched.set('resp_desc', body.ResponseDescription || '');
            transactionMatched.set('tx_ref', body.PaymentReference || '');
            transactionMatched.set('amount_processed', body.Amount);
            transactionMatched.set('interswitch_transactionDate', body.TransactionDate || '');
            // transactionToUpdate.set("skills", ["pwnage", "flying"]);

            return transactionMatched.save();

        }).then(function (outcome) {

            return callback(null, pwq_params);

        }, function transactionRecordExistsQueryError(e) {

            return callback('ERROR: \n' + e.message);

        });
}


/**
 * Invoke the 101Comms TopUp remote service API to directly top-up beneficiary's account.
 *
 * @param {Object}      pwq_params      An object containing the following properties:
 *                          tx_id
 * @param {Function}    callback        A function to call after it's done handling the response from the remote service.
 *
 * TODO: This function needs to be refactored into another module/file,
 * so it can be used with any other payment service handler module aside Interswitch
 */
function callTopUpAPI(pwq_params, callback) {
    // var login = app_config.topUpServiceAPILogin,
    var login = pwq_params.req.app.locals.appConfig.topUpServiceAPILogin,
        pass = pwq_params.req.app.locals.appConfig.topUpServiceAPIPassword,
        mobileNumber = pwq_params.mobileNumberRetrievedFromDatabase,
        amountToToup = pwq_params.amount_topup,
        topupFailErrorMessage = 'Payment was successful but the Top-up API call returned the following error: \n';

    mobileNumber = mobilePhoneNumberParser.stripLeadingZero(mobileNumber);
    mobileNumber = mobileNumber.length < 11 ? pwq_params.countryCodeRetrievedFromDatabase + mobileNumber : mobileNumber;

    var options = {
        // url: 'https://' + login + ':' + pass + '@' + 'portal.101ng.com/OnlineShop/common.api',
        url: app_config.topUpServiceAPIURL,
        method: 'POST',
        headers: {
            // 'X-JSON-RPC': 'balanceTransfer',
            // 'Content-Type': 'text/plain; charset=utf-8'
        },
        json: true,
        body: {
            'jsonrpc': '2.0',
            'id': pwq_params.tx_id, // TODO: DI this data point into the method as a function parameter
            'method': 'balanceTransfer',
            'params': {
                'fromLogin': login,
                'fromPassword': pass,
                'toLogin': mobileNumber,
                'amount': amountToToup
            }
        },
    };

    try {
        request(options, topUpAPIResponseHandler);
    } catch (requestError) {
        return callback(topupFailErrorMessage + requestError.toString());
    }

    function topUpAPIResponseHandler(error, response, body) {
        if (error) {
            return callback(topupFailErrorMessage + error.message);
        }

        if (!response || typeof response.statusCode == 'undefined') {
            return callback('Payment was successful but the Top-up system did not return any response at all.');
        }

        if (response.statusCode == 200) {
            if (!body || typeof body.result == 'undefined')
                return callback(
                    'Payment was successful and the Top-up went through with a 200 OK response, '
                    + 'but no detail of the top-up status was returned.'
                );

            // If everything went well, pass-on the returned code in the callback for it to be saved to DB
            if (body.result == '0') {
                pwq_params['topup_result'] = body.result
                return callback(null, pwq_params);
            }

            return callback(
                'Payment was successful and Top-up went through with a 200 OK response, '
                + 'but the top- up status/ result code was: "' + body.result + '"'
            );

        } else {
            callback('Payment was successful but the Top-Up doesn\'t seem to have gone well. '
                + 'Here\'s the returned HTTP statusCode: "' + response.statusCode + '"');
        }
    }
}


function markTransactionAsFailed(errorsEncountered) {
    var errorContact = '\nPlease send an email to our customer care center: '
        + app_config.emailAddress + ' and include this transaction reference code in your subject line: '
        + thisTransactionRef + '. ';;

    var TransactionError = Parse.Object.extend("TransactionError");
    var transactionError = new TransactionError();

    transactionError.save({
        'log_type': 'error',
        'log_message': errorsEncountered,
        'transaction_id': thisTransactionRef
    }).then(function (saveOutcome) {
        return sendResponse(
            {
                'errorMsg': 'The following errors were encountered: \n' + ' - ' + errorsEncountered + '\n' + errorContact,
            },
            httpReq,
            httpRes
        );
    }, function (error) {
        return sendResponse(
            {
                'errorMsg': 'The following errors were encountered: \n'
                + ' - ' + errorsEncountered + '\n'
                + ' - Issues encountered logging the errors to database: ' + error
                + '\n' + errorContact
            },
            httpReq,
            httpRes
        );
    });
}


/**
 * If no errors were encountered in any of the operations above,
 * then update transaction record with top- up result and show
 * response message in browser
 *
 * @param {Object}      pwq_params                      An object containing the following properties:
 *                          {String}    tx_id
 *                          {Number}    topup_result
 *
 */
function markTransactionAsSuccessful(pwq_params) {
    var errorContact = '\nPlease send an email to our customer care center: '
        + pwq_params.req.app.locals.appConfig.email + ' and include this transaction reference code in your subject line: '
        // + app_config(req).emailAddress + ' and include this transaction reference code in your subject line: '
        // + tx_id + '. ';
        + pwq_params.tx_id + '. ';

    var normalizedAmount = pwq_params.amount_topup / 100;

    var thisTransaction = new Parse.Query('Transaction');
    thisTransaction.equalTo('requestReference', pwq_params.tx_id);
    thisTransaction.first().then(
        function updateTransactionRecord(transactionMatched) {
            transactionMatched.set('topup_status', pwq_params.topup_result == '0' ? 'successful' : 'failed');
            transactionMatched.set('topup_response_code', pwq_params.topup_result);
            transactionMatched.set('topup_response_time', new Date());
            return transactionMatched.save();

        }).then(
        function (outcome) {
            return sendResponse(
                {
                    'errorMsg': 'Payment completed successfully and the beneficiary 101 Comms account has been credited with the sum '
                    + 'of &#8358;' + normalizedAmount + '.00. Thank you. \nIn case you encounter any issue, ' + errorContact
                },
                pwq_params.req, httpRes);

        },
        function transactionRecordExistsQueryError(e) {
            // TODO: use the Winston logger to log this error instead
            // TODO: set up error alerts in loggly.com account to enable notification)
            // TODO: Or possibly implement an email notification functionality here, to notify admin on this error
            console.error('ERROR: \n' + e.message +
                '.\n However, your payment completed successfully and the beneficiary 101 Comms account has been credited with the sum '
                + 'of &#8358;' + normalizedAmount + '.00');

            return sendResponse({
                'errorMsg': 'ERROR: \n' + e.message +
                '.\n However, your payment completed successfully and the beneficiary 101 Comms account has been credited with the sum '
                + 'of &#8358;' + normalizedAmount + '.00'
            }, pwq_params, httpRes);
        });
}


/**
 * Handle a POST request to the ~/qtpayment route
 * @param  HTTPRequest req
 * @param  HTTPResponse res
 */
module.exports = PWQController
    .post('/', validatePostParams, routePOSTHandler)
    .get('/', function (req, res) {
        res.send(200);
    });