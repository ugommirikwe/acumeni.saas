var express = require('express'),
    HomeController = express.Router(),
    validator = require('validator'),
    app_config = require('../util/config'),
    randomNumberGenerator = require('../util/randomNumberGenerator');

// module.exports = function () {
function handleGetRequest(req, res) {
    var refcode = app_config.interswitchReqRefCodePrefix + randomNumberGenerator(8),
        dataBag = {
            errorMsg: '',
            page_title: app_config.site_title_prefix + ' - Welcome'
        };

    sendResponse(dataBag, req, res);
};

/**
 * Expect phone number to be "POSTed" for validation, and return the validation status message.
 */
function handlePostRequest(req, res) {
    // TODO: delegate 'req' object validation to a custom middleware.
    if (req.body.feedback_code == undefined || req.body.feedback_code.trim() == '') {
        return sendResponse({ 'errorMsg': '"feedback_code" parameter must be submitted and can\'t be an empty string.' });
    }

    var feedbackCode = req.body.feedback_code.trim(),
        dataBag = {};

    dataBag['errorMsg'] = validateFeedBackCode(feedbackCode);

    if (dataBag['errorMsg'].trim().length != 0) {
        return sendResponse(dataBag, req, res);
    }

    dataBag['feedbackCode'] = feedbackCode;

    // NOTE: just need to set these in case this endpoint wasn't invoked using AJAX;
    // that way the EJS template for this page will render properly using these data items.
    var refcode = app_config.interswitchReqRefCodePrefix + randomNumberGenerator(8);
    dataBag['page_title'] = app_config.site_title_prefix + ' - Welcome';

    // TODO: query database to check if code has been used already
    // and, if so, check if the session has ended; if not, bring up
    // the session to continue, else return 'Code Used' error message.
    /*var query = new Parse.Query('UsedInvitationCodes');
    query.equalTo('invitation_code', feedbackCode)
    query.find().then(function (count) {
        if (count.length > req.app.locals.appConfig.topup_frequecny_daily_max_limit) {
            dataBag['errorMsg'] = ''
        }
    }).catch(function (e) {

    });*/
    queryFeedbackHub(feedbackCode, req, res);

    //"000,OK,{"sessionId":"3680","status":1,"message":"What is your name?","questionType":"1","questionOptions":false,"sessionComplete":0}"

    /*var array = [
        '000',
        'OK',
        '{}'
    ]
    array[0]*/

    /*var arr = Object.keys(result).map(function (k) { return result[k] });

    console.log("converted to array: " + arr);

    // result.forEach(result, processFeedbackHubResponse);

    // Send the array for validation and response back to the API client
    // processFeedbackHubResponse(result, req, res);
});*/
};


// TODO: Test with string value
// TODO: Test with numeric value less than 4 digits
// TODO: Test with numeric value more than 11 digits
function validateFeedBackCode(feedbackCode) {
    if (!validator.isLength(feedbackCode.trim(), { min: 4, max: 11 })) {
        return 'The feedback code can\'t be less than 4, nor be longer than 11, characters long.';
    }
    return '';
    /*if (!validator.isNumeric(feedbackCode.trim())) {
        return 'Mobile phone number can only be numbers';
    } else if (!validator.isLength(feedbackCode.trim(), { min: 10, max: 11 })) {
        return 'The beneficiary\'s mobile phone number can\'t be less than 10 digits long.';
    } else {
        return '';
    }*/
}


/**
 * Sends a request to the Survey Hub to verify feedback code and pull-in questions for this survey.
 *
 * @param   {String}    feedbackCode    The unique invitation code provided by client for validation.
 * @param   {Object}    req             Express Js Request object
 * @param   {Object}    res             Express Js Response object
 * @returns {void}
 */
function queryFeedbackHub(feedbackCode, req, res) {

    var feedbackCode = '100001',
        feedbackHubEndPoint = 'https://surveynode.net/api.php?user=ugo1234.esjsoftware&pass=Test1234&cmd=apiSurvey&code=89027&customerId=' + feedbackCode,
        dataBag = {};

    var request = require('request');

    try {
        request(
            {
                method: 'POST',
                url: feedbackHubEndPoint
            },
            function (error, response, body) {
                if (error) {
                    dataBag['errorMsg'] = error;
                    return sendResponse(dataBag, req, res);
                }

                if (typeof response == 'undefined') {
                    dataBag['errorMsg'] = 'ERROR: No response from Survey Service';
                    return sendResponse(dataBag, req, res);
                }
                if (response.statusCode != 200) {
                    dataBag['errorMsg'] = 'ERROR: Survey Service returned a non-200 response code: ' + response.statusCode;
                    return sendResponse(dataBag, req, res);
                }

                // Process the data elements returned from the Survey Hub API service:
                processFeedbackHubResponse(body, req, res);
            }
        );
    } catch (surveyHubAPIQueryError) {
        dataBag['errorMsg'] = 'ERROR: Our server encountered this issue while sending/receiving data from the Survey Service: ' + surveyHubAPIQueryError
        return sendResponse(dataBag, req, res);
    }
}

function parseResultArray(csv, req, res) {
    var Converter = require("csvtojson").Converter;
    // grab out the first two array items:
    var item1 = csv.shift(),
        item2 = csv.shift();

    // count the size of the remaining array items:
    var item3Count = csv.length;

    var item3AsString = '';

    // loop over this remaining array items and concatenate them into a String object
    for (var index = 0; index < item3Count; index++) {
        if (0 === index) {
            item3AsString += csv[index];
        } else {
            item3AsString += ', ' + csv[index];
        }
    }

    // convert the concatenated string to a JSON object
    var conv = new Converter({
        noheader: true,
        quote: "off",
        delimiter: [',', '{', '}']
    }),
        parsedJson;
    conv.fromString(item3AsString, function (err, result) {
        if (typeof err != 'undefined') {
            console.error(err);
            return;
        }
        parsedJson = result;

        // result.forEach(result, processFeedbackHubResponse);

        // Push the cleaned up values into an array for further validation:
        var dataAsArray = [item1, item2, parsedJson];

        // Send the array for validation and response back to the API client
        processFeedbackHubResponse(dataAsArray, req, res);
    });
}

function processFeedbackHubResponse(returnedData, req, res) {
    // Expect each line in the returned CSV in the following form:
    // 000,
    // OK,
    // {
    //     "sessionId": "3609",
    //     "status": 1,
    //     "message": "How old are you?",
    //     "questionType": "4",
    //     "questionOptions": ["18 - 25", "26 - 40", "41 - 60", "61+"],
    //     "sessionComplete": 0
    // }

    // Convert content of the body, which should be a CSV string, into an array
    var csvToArrayConverter = require('../lib/csvToArrayConverter');
    returnedData = csvToArrayConverter(returnedData);

    if (returnedData.length !== 3) {
        return sendResponse({ 'errorMsg': 'ERROR: An incomplete dataset was received from the feedback service API. Here\'s the dataset returned: ' + returnedData[0] + ': ' + returnedData[1] });
    }

    if (returnedData[0] != 000 || returnedData[1] != 'OK') {
        return sendResponse({ 'errorMsg': 'Feedback service didn\'t respond with an OK. Here\'s the response returned: ' + returnedData[0] + ': ' + returnedData[1] });
    }

    var surveyQueryStatusCode = returnedData[0],
        surveyQueryStatus = returnedData[1],
        // be sure to convert this data element into a proper JS object:
        payload = JSON.parse(returnedData[2]);

    if (typeof payload == 'undefined') {
        return sendResponse({ errorMsg: 'The Feedback service didn\'t return any info...', req, res });
    }

    if (typeof payload != 'object') {
        return sendResponse({ errorMsg: 'Received an invalid dataset from the Feedback service.', req, res });
    }

    if (typeof payload.sessionComplete == 'undefined') {
        return sendResponse({ errorMsg: 'The Feedback service didn\'t return the status of this feedback session.', req, res });
    }

    if (payload.sessionComplete == 1) {
        return sendResponse({
            'errorMsg': 'This feedback survey has been completed already and cannot be restarted. '
            + 'Please enter another invitation code to take another survey.'
        }, req, res);
    }

    if (typeof payload.sessionId == 'undefined') {
        return sendResponse({ errorMsg: 'Expected "sessionId" info from Feedback service but got none...', req, res });
    }

    if (typeof payload.message == 'undefined') {
        return sendResponse({ errorMsg: 'Expected "question" info from Feedback service but got none...', req, res });
    }

    if (typeof payload.questionType == 'undefined') {
        return sendResponse({ errorMsg: 'Expected "questionType" info from Feedback service but got none...', req, res });
    }

    switch (payload.questionType) {
        // The following question types must have a valid 'questionOptions' value
        case 3: // 'Numeric range' type
        case 4: // 'Single choice':
        case 5: // 'Multiple choice':

            if (typeof payload.questionOptions == 'undefined') {
                return sendResponse({ errorMsg: 'Expected "questionOptions" info from Feedback service but got none...', req, res });
            }

            break;
    }

    sendResponse({
        sessionId: payload.sessionId,
        question: payload.message,
        questionType: payload.questionType,
        // For questionType 'Phone number', it is acceptable for the 'questionOptions' param to be empty
        questionOptions: payload.questionOptions || ''
    }, req, res);
}

function sendResponse(responsePayload, req, res) {
    if (req.xhr) res.json(responsePayload);
    else res.render('index', responsePayload);
}

module.exports = HomeController
    .get('/', handleGetRequest)
    .post('/', handlePostRequest);