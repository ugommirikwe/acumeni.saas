
/**
 * Takes a complex CSV string and parses it into an array that it returns.
 * @param   {String}    Valid CSV string
 * @returns {Array}
 *
 * TODO: Refactor to either take a
 */
function convertCsvToArray(str) {
    //split the str first
    //then merge the elments between two double quotes
    var delimiter = ',';
    var quotes = '"';
    var elements = str.split(delimiter);
    var newElements = [];
    for (var i = 0; i < elements.length; ++i) {
        if (elements[i].indexOf(quotes) >= 0) {//the left double quotes is found
            var indexOfRightQuotes = -1;
            var tmp = elements[i];
            //find the right double quotes
            for (var j = i + 1; j < elements.length; ++j) {
                if (elements[j].indexOf(quotes) >= 0) {
                    indexOfRightQuotes = j;
                }
            }
            //found the right double quotes
            //merge all the elements between double quotes
            if (-1 != indexOfRightQuotes) {
                for (var j = i + 1; j <= indexOfRightQuotes; ++j) {
                    tmp = tmp + delimiter + elements[j];
                }
                newElements.push(tmp);
                i = indexOfRightQuotes;
            }
            else { //right double quotes is not found
                newElements.push(elements[i]);
            }
        }
        else {//no left double quotes is found
            newElements.push(elements[i]);
        }
    }

    /*String.prototype.splitCSV = function (sep) {
        for (var foo = this.split(sep = sep || ","), x = foo.length - 1, tl; x >= 0; x--) {
            if (foo[x].replace(/"\s+$/, '"').charAt(foo[x].length - 1) == '"') {
                if ((tl = foo[x].replace(/^\s+"/, '"')).length > 1 && tl.charAt(0) == '"') {
                    foo[x] = foo[x].replace(/^\s*"|"\s*$/g, '').replace(/""/g, '"');
                } else if (x) {
                    foo.splice(x - 1, 2, [foo[x - 1], foo[x]].join(sep));
                } else foo = foo.shift().split(sep).concat(foo);
            } else foo[x].replace(/""/g, '"');
        } return foo;
    };*/

    return newElements;

}

module.exports = convertCsvToArray;