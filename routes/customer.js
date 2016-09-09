var express = require('express'),
    CustomerController = express.Router(),
    validator = require('validator'),
    app_config = require('../util/config'),
    randomNumberGenerator = require('../util/randomNumberGenerator');

// module.exports = function () {
CustomerController.get('/', function (req, res) {

    var refCode = app_config.codePrefix + randomNumberGenerator(8);

    var dataBag = {
        page_title: app_config.site_title_prefix + ' - Welcome'
    };

    res.status(200).render('customer', dataBag);
})

    /**
     * Expect phone number to be "POSTed" for validation, and return the validation status message.
     */
    .post('/', function (req, res) {

        var dataBag = {};

        if (req.body.fullName == undefined || req.body.fullName.trim() == '') {
            return sendResponse({
                'errorMsg': 'Customer\'s "fullName" field cannot be null or an empty string'
            });
        }

        if (!validator.isLength(req.body.fullName, { min: 3, max: 50 })) {
            return sendResponse({
                'errorMsg': 'The customer\'s full name can\'t be less than 3 characters long.'
            });
        }

        /*if (!validator.isNumeric(req.body.tel_customer)) {
            dataBag['errorMsg'] = 'Mobile phone number can only be numbers';
            dataBag['phone'] = req.body.requestReference;
            dataBag['customerId'] = app_config.customerId;
        } else if (!validator.isLength(req.body.tel_customer, { min: 10, max: 11 })) {
            dataBag['errorMsg'] = 'The beneficiary\'s mobile phone number can\'t be less than 10 digits long.';
            dataBag['phone'] = app_config.phone;
            dataBag['customerId'] = app_config.customerId;
        } else {
            dataBag['phone'] = req.body.tel_customer;
            dataBag['errorMsg'] = '';
            dataBag['customerId'] = app_config.customerId + ' (' + req.body.tel_customer + ')';*/
        // TODO: query database for number of times phone number has topped up today and bar this request if it has hit a set limit

        /*database.find({}, {}, function (e, docs) {
            if (e) dataBag['errorMsg'] = e;
            else dataBag['userlist'] = docs;
        });*/
        // }

        /*dataBag['baseUrl'] = app_config.baseUrl;
        dataBag['paymentCode'] = app_config.paymentCode;
        dataBag['amount'] = app_config.amount;
        dataBag['requestReference'] = req.body.requestReference || app_config.codePrefix + randomNumberGenerator(8);
        dataBag['email'] = app_config.emailAddress;
        dataBag['redirectUrl'] = app_config.redirectUrl;*/

        console.log('Just before Parse save. Fullname: ' + req.body.fullName);

        var Customer = Parse.Object.extend('Customer'),
            newCustomer = new Customer();

        newCustomer.set("fullName", req.body.fullName);
        // newCustomer.set("fullName");

        newCustomer.save(null, {
            success: function (thisCustomer) {
                console.log('Parse save successful. Id: ' + thisCustomer.id + '; \n Other details: ' + thisCustomer);
                sendResponse({
                    result: 'success'
                });
            },
            error: function (thisCustomer, error) {
                console.error('Parse save error: ' + error.message);
                sendResponse({
                    errorMsg: error.message
                });
            }
        });

        function sendResponse(dataBag) {
            if (req.xhr) res.json(dataBag);
            else res.render('customer', dataBag);
        }

    });

module.exports = CustomerController;

// }