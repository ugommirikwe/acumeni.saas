module.exports = {
    // Add leading zero (if it's absent) to mobile phone number submitted by user -- an Interswitch requirement
    appendLeadingZero: function (number) {
        var number = number.trim();
        return number.trim().substring(0, 1) != '0' ? '0' + number : number
    },
    // Strip off the leading '0' from the phone number if one is there
    stripLeadingZero: function (number) {
        var number = number.trim();
        return number.substring(0, 1) === '0' ? number.substring(1, number.length) : number;
    }
}