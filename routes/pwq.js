var express = require('express'),
    async = require('async'),
    PWQController = express.Router(),
    validator = require('validator'),
    app_config = require('../util/config'),
    randomNumberGenerator = require('../util/randomNumberGenerator');


function sendResponse(responseMessage, req, res) {
    if (req.xhr) {
        res.json(responseMessage)
    } else {
        res.render('qtpayment',
            {
                'message': responseMessage,
                'page_title': app_config.site_title_prefix + ' - Interswitch Payment Response'
            });
    }
};

/**
 * A middleware method to validate parameters returned by Interswitch before handing over to the route controller to process the reported payment.
 *
 * @param req ExpressJS HTTPRequest object encapsulating the data sent from the client (and possibly modified by any middleware before getting here).
 * @param res HTTPResponse object encapsulating the data that would be sent back to the client.
 * @param next Middleware callback function to be called to pass-on execution of this client request.
 */
function validateRequestParams(req, res, next) {

    var pwq_params = {};

    var refErrorMessage = ' If you are not sure what this means, send an email to our customer care center: '
        + app_config.emailAddress;

    if (!req.query.ref) return sendResponse("ERROR: 'ref' querystring param is expected but wasn't provided. " + refErrorMessage, req, res);
    if (req.query.ref.trim() == '') return sendResponse("ERROR: 'ref' querystring param value can't be an empty string. " + refErrorMessage, req, res);
    pwq_params['tx_id'] = req.query.ref;

    var errorContact = refErrorMessage + ' and include this transaction reference: ' + pwq_params.tx_id;

    pwq_params['resp_desc'] = req.body.resp_desc || '';

    if (!req.body.resp_code) return sendResponse("ERROR: 'resp_code' param is expected but wasn't provided." + errorContact, req, res);
    if (req.body.resp_code.trim() == '') return sendResponse("ERROR: 'resp_code' param can't be an empty string." + errorContact, req, res);
    pwq_params['resp_code'] = req.body.resp_code;

    if (pwq_params.resp_code == '00') {

        if (!req.body.amount) return sendResponse("ERROR: 'amount' param is expected but wasn't provided." + errorContact, req, res);
        if (req.body.amount.trim() == '') return sendResponse("ERROR: 'amount' param can't be an empty string." + errorContact, req, res);
        pwq_params['amount'] = req.body.amount;

        var tx_ref_error = 'We aren\'t sure what happened at Interswitch\'s servers, '
            + 'they didn\'t even provide a transaction reference, but returned this error: "'
            + pwq_params.resp_code + ': ' + pwq_params.resp_desc + '".';

        if (!req.body.tx_ref) return sendResponse(tx_ref_error, req, res);
        if (req.body.tx_ref.trim() == '') return sendResponse(tx_ref_error, req, res);
        pwq_params['tx_ref'] = req.body.tx_ref;

        // Pass in the validated params into the req object before passing control to the next middleware in this route
        req.pwq_params = pwq_params;

        next();

    } else
        return sendResponse(
            pwq_params.resp_desc.trim() != '' ?
                'Something happened at Interswitch\'s end and here\'s what they reported: "' + pwq_params.resp_desc + '".' + errorContact
                : 'We aren\'t sure what happened at Interswitch\'s servers and '
                + 'they didn\'t even provide any detail. ' + errorContact,
            req, res);
}

/**
 * Main route handler -- handles payments' processing respons from Interswitch and invokes the Top-Up online API service.
 */
var pwqPaymentController = function (req, res) {

    // Retrieve the following details from the req object as passed in from the middleware method that validated them
    var tx_id = req.pwq_params.tx_id,      // Transaction reference/id issued earlier for this transaction by this app and appended as a querystring appended to the callback URL sent to Interswitch
        resp_code = req.pwq_params.resp_code,  // A response code indicating the outcome/status of the payment processing
        resp_desc = req.pwq_params.resp_desc,  // A textual description of the response code
        tx_ref = req.pwq_params.tx_ref,     // An Interswitch-generated unique reference for the transaction
        amount = req.pwq_params.amount;     // Amount Interswitch reports to have processed

    var amountRetrievedFromDatabase, mobileNumberRetrievedFromDatabase;

    var errorContact = '\nPlease send an email to our customer care center: '
        + app_config.emailAddress + ' and include this transaction reference code in your subject line: '
        + tx_id + '. ';

    // A code that shows if the transaction was successful or not.
    switch (resp_code) {
        case '00': //‘00’ denotes successful; every other value indicates failure.
            paymentSuccessHandler();
            break;
        default:
            sendResponse('Payment failed for this reason: ' + resp_desc + '.' + errorContact, req, res);
            break;
    }

    function checkTransactionRecordExistsForPayment(tx_id, callback) {
        // var
        qtpayments
            .find({ 'requestReference': tx_id })
            .on('error', function transactionRecordExistsQueryError(e) {
                return callback(e.message);
            })
            .on('success', function transactionRecordExistsQueryResult(recordsFound) {
                if (recordsFound.length < 1) return callback('No transaction record exists in our database for this payment. '
                    + errorContact);

                callback(null, recordsFound, amount);
                // callback(null, tx_id, resp_code, resp_desc, tx_ref, amount);
            });
    }

    function paymentSuccessHandler() {
        async.waterfall(
            [
                async.apply(checkTransactionRecordExistsForPayment, tx_id),

                // If a transaction record is found, check that the amount returned from Interswitch matches what's in the database
                function checkAmountInDatabaseMatchesProcessedAmount(recordsFound, amount, callback) {
                    if (recordsFound[0]['amount'] == 'undefined') {
                        return callback('ERROR: No amount was recorded for the item purchased');
                    }
                    if (recordsFound[0]['amount'] * 100 != amount) {
                        return callback('ERROR: The amount processed by Interswitch doesn\'t match the price for the item purchased.' + errorContact);
                    }
                    amountRetrievedFromDatabase = amount / 100;
                    mobileNumberRetrievedFromDatabase = recordsFound[0]['mobileNumber'];
                    callback(null, tx_id, resp_code, resp_desc, tx_ref, amount);
                },

                function updateTransactionRecordWithInterswitchPostback(tx_id, resp_code, resp_desc, tx_ref, amount, callback) {
                    qtpayments.update(
                        { 'requestReference': tx_id  /*TODO: remember to refactor function to get this from its arguments, ala D.I.*/ },
                        {
                            $set: {
                                payment_status: 'pending verification',
                                payment_provider: 'Interswitch',
                                resp_code: resp_code,
                                resp_desc: resp_desc || '',
                                tx_ref: tx_ref,
                                amount_processed: amount,
                                updatedOn: new Date()
                            }
                        },
                        { upsert: true },
                        function (e, count, status) {
                            if (e) return callback(e);

                            if (count < 1) return callback('ERROR: No transaction exists in our record for this payment.');

                            // If the record updated successfully, call the next operation, with the right arguments:
                            callback(null, app_config.callBackUrl, tx_id, app_config.clientId, app_config.interswitchMerchantSecret);
                        }
                    );
                },

                // Then query Interswitch service endpoint to verify these transaction details
                // TODO: remember to pass-in all the dependencies of this function as arguments
                function queryInterswitchForVerfication(callBackUrl, tx_id, clientId, interswitchMerchantSecret, callback) {

                    var options = {
                        url: callBackUrl + tx_id + '?isRequestRef=true',
                        headers: {
                            'clientId': clientId,
                            'Hash': crypto.createHash('sha512').update(tx_id + interswitchMerchantSecret).digest('hex')
                        }
                    };

                    var handleQueryResponse = function (error, response, body) {
                        if (error) return callback('ERROR: ' + error);
                        if (typeof response == 'undefined' || response.statusCode != 200) return callback('ERROR: No response');
                        if (typeof body == 'undefined') return callback('ERROR: We aren\'t sure what happened at Interswitch\'s end, '
                            + 'but no information was provided. ' + errorContact);

                        body = JSON.parse(body);

                        if (typeof body.ResponseCode == 'undefined') {
                            return callback('ERROR: "ResponseCode" parameter is expected from Interswitch but is not provided.' + errorContact);
                        }

                        switch (body.ResponseCode) {
                            case '00':
                                if (typeof body.Amount == 'undefined') {
                                    return callback('ERROR: Verification of payment failed because Interswitch didn\'t provide us the "amount" they processed.'
                                        + errorContact);
                                }
                                var interswitchAmountNormalized = body.Amount / 100;
                                if (interswitchAmountNormalized != amountRetrievedFromDatabase) {
                                    return callback('ERROR: The amount processed by Interswitch: NGN' + interswitchAmountNormalized
                                        + ' does not match the value for the top-up purchased: NGN' + amountRetrievedFromDatabase
                                        + errorContact);
                                }

                                callback(null, body);
                                break;

                            default:
                                callback('ERROR: Interswitch reports your payment wasn\'t successful for this reason: "Error Code: '
                                    + body.ResponseCode + ' -- ' + body.ResponseDescription + '".');
                                break;
                        }
                    }

                    try {
                        request(options, handleQueryResponse);
                    } catch (interswitchQueryError) {
                        return callback(interswitchQueryError);
                    }

                },

                //update database with the payment status
                function updateDatabaseWithInterswitchRequeryResult(body, callback) {
                    var updateDate = new Date();
                    qtpayments.update(
                        {
                            'requestReference': tx_id
                        },
                        {
                            $set: {
                                payment_status: 'successful',
                                payment_provider: 'Interswitch',
                                resp_code: body.ResponseCode,
                                resp_desc: body.ResponseDescription || '',
                                tx_ref: body.PaymentReference || '',
                                amount_processed: body.Amount,
                                updatedOn: updateDate,
                                interswitchTransactionDate: body.TransactionDate || ''
                            }
                        },
                        {
                            upsert: true
                        },
                        function (e, count, status) {
                            if (e) return callback('ERROR: \n' + e.message);
                            callback();
                        });
                },

                // TODO: This function needs to be refactored into another module/file,
                // so it can be used with any other payment service handler module aside Interswitch
                /**
                 * Invoke remote service to directly top-up customer's account.
                 * @param callback A function to call after it's done handling the response from the remote service.
                 */
                function callTopUpAPI(callback) {
                    var login = app_config.topUpServiceAPILogin,
                        pass = app_config.topUpServiceAPIPassword,
                        mobileNumber = mobileNumberRetrievedFromDatabase,
                        amountToToup = amount / 100;

                    mobileNumber = mobilePhoneNumberParser.stripLeadingZero(mobileNumber);
                    mobileNumber = mobileNumber.length < 11 ? countryCode + mobileNumber : mobileNumber;

                    var options = {
                        // url: 'https://' + login + ':' + pass + '@' + 'portal.101ng.com/OnlineShop/common.api',
                        url: app_config.topUpServiceAPIURL,
                        method: 'POST',
                        headers: {
                            /*'X-JSON-RPC': 'balanceTransfer',
                            'Content-Type': 'text/plain; charset=utf-8'*/
                        },
                        json: true,
                        body: {
                            'jsonrpc': '2.0',
                            'id': tx_id,
                            'method': 'balanceTransfer',
                            'params': {
                                'fromLogin': login,
                                'fromPassword': pass,
                                'toLogin': mobileNumber,
                                'amount': amountToToup
                            }
                        },
                    };

                    var topUpAPIResponseHandler = function (error, response, body) {
                        if (error)
                            return callback(
                                'Payment was successful but the Top-up API call return the following error: \n'
                                + error.message
                            );

                        if (!response || typeof response.statusCode == 'undefined')
                            return callback('Payment was successful but the Top-up API call did not return any response at all.');

                        if (response.statusCode == 200) {
                            if (!body || typeof body.result == 'undefined')
                                return callback(
                                    'Payment was successful and the Top-up API call went through with a 200 OK response, '
                                    + 'but no detail of the top-up status was returned.'
                                );

                            return (body.result == '0') ?
                                // If everything went well, pass-on the returned code in the callback for it to be saved to DB
                                callback(null, body.result) :
                                callback(
                                    'Payment was successful and Top-up API call went through with a 200 OK response, '
                                    + 'but the top- up status/ result code was: "' + body.result + '"'
                                );
                        } else
                            callback('Payment was successful but the Top-Up API call don\'t seem to have gone well. '
                                + 'Here\'s the returned HTTP statusCode: "' + response.statusCode + '"');
                    }

                    try {
                        request(options, topUpAPIResponseHandler);
                    } catch (requestError) {
                        return callback('Payment was successful but the Top-up API call return the following error: \n'
                            + requestError.toString());
                    }
                }
            ],

            function purchaseOperationsCompleted(errorsEncountered, lastOperationResult /*expected to be '0'*/) {
                if (errorsEncountered) {
                    // TODO: refactor the following into a named function for easy unit testing
                    qtpayments_log.insert({
                        'log_type': 'error',
                        'log_time': new Date(),
                        'log_message': errorsEncountered,
                        'transaction_id': tx_id
                    }, function purchaseOperationsErrorsDBLogger(err, data) {
                        if (err) {
                            var summaryErrorMessage = 'The following errors were encountered: \n'
                                + ' - ' + errorsEncountered + '\n'
                                + ' - Issues encountered logging the errors to database: ' + err;

                            return sendResponse(summaryErrorMessage);
                        }

                    });
                }

                // TODO: refactor the following into a named function for easy unit testing
                /**
                 * If no errors were encountered in any of the operations above,
                 * then update transaction record with top- up result and show
                 * response message in browser
                 */
                qtpayments.update(
                    {
                        'requestReference': tx_id
                    },
                    {
                        $set: {
                            'topup_transaction_status': lastOperationResult == '0' ? 'successful' : 'failed',
                            'topup_response_code': lastOperationResult,
                            'topup_response_time': new Date()
                        }
                    },
                    {
                        upsert: true
                    },
                    function topUpAPIResponseDatabaseUpdateHandler(e, count, status) {
                        var msgToReturn;
                        // TODO: use the Winston logger to log this error instead
                        // TODO: set up error alerts in loggly.com account to enable notification)
                        // TODO: Or possibly implement an email notification functionality here, to notify admin on this error
                        if (e)
                            console.error('ERROR: \n' + e.message +
                                '.\n Payment completed successfully!\n \n Your 101 Comms account has been credited with the sum '
                                + 'of &#8358;' + amount / 100 + '.00');

                        return sendResponse('Payment completed successfully!\n \n Your 101 Comms account has been credited with the sum '
                            + 'of &#8358;' + amount / 100 + '.00. Thank you. \nIn case you encounter any issue, ' + errorContact,
                            req, res);
                    });

            }
        );
    }

}


/**
 * Handle a POST request to the ~/qtpayment route
 * @param  HTTPRequest req
 * @param  HTTPResponse res
 */
module.exports = PWQController
    .post('/', validateRequestParams, pwqPaymentController)
    .get('/', function (req, res) {
        res.send(200);
    });