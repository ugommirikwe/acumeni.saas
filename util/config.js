var dotenv = require('dotenv');
dotenv.load();

/**
 * Defines config items for this app. Best define as a JS function rather than plain JSON,
 * so arguments can be passed into the function to modify them at runtime.
 *
 * Imported file above (using 'require') can be used to get in extra functionalities too.
 */
var config = function (/*TODO: args here, for Dependency Injection -- e.g. environment: dev || prod || staging || etc*/) {
    /**
     * The following uses the 'Revealing Module' pattern -- the following items are the equivalent
     * of using the 'public' keyword in Java to define class members; anything not inside of the curly
     * braces are the Java equivalent of 'private' declaration.
     */
    return {
        emailAddress: 'support@101nt.com',
        interswitchCustomerPhoneId: 'default',
        interswitchClientId: process.env.INTERSWITCH_CLIENT_ID || 'localhost',
        interswitchRedirectUrl: process.env.INTERSWITCH_REDIRECT_URL || 'http://parse:' + process.env.NODE_PORT +'/qtpayment',
        interswitchBaseUrl: process.env.INTERSWITCH_BASE_URL || 'https://stageserv.interswitchng.com/quicktellercheckout',
        interswitchCallBackUrl: process.env.INTERSWITCH_CALLBACK_URL || 'https://stageserv.interswitchng.com/quicktellercheckout/api/v2/transaction/',
        interswitchPaymentCode: process.env.INTERSWITCH_PAYMENT_CODE || '99401',
        interswitchReqRefCodePrefix: process.env.INTERSWITCH_CODE_PREFIX || '6002',
        interswitchReqRefCodeLength: process.env.INTERSWITCH_CODE_LENGTH || 8,
        interswitchMerchantSecret: process.env.INTERSWITCH_MERCHANT_SECRET || 'E9300DJLXKJLQJ2993N1190023',
        interswitchCustomerId: 'Anonymous',
        amount: ['50000', '25000', '10000', '5000', '2500', '1000'],
        countryCodes: ['234', '44', '27', '1'],
        isDevEnvironment: process.env.NODE_ENV == 'development' || false,
        site_title_prefix: process.env.topUpServiceAPIPassword || 'Acumeni Feedback Service',
        topUpServiceAPIURL: process.env.TOPUP_SERVICE_API_URL || 'https://portal.101ng.com/OnlineShop/common.api',
        topUpServiceAPILogin: process.env.TOPUP_SERVICE_API_LOGIN || '234234234',
        topUpServiceAPIPassword: process.env.TOPUP_SERVICE_API_LOGIN || '123456',
        topUpServiceAPICountryCodeTel: process.env.TOPUP_SERVICE_API_COUNTRY_CODE_TEL || '234'
    }
}

module.exports = config();