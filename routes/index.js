var _ = require('lodash'),
    fs = require('fs'),
    validFileTypes = ['js'],
    excluded = ['index'];

/**
 * Automatically and recursively require/load route files in the routes directory.
 * @param directory The directory to scan for files.
 * @param app       The app object passed in from the top-level module, for appending the discovered routes.
 */
var requireFiles = function (directory, app) {
    // Default to current directory, if directory parameter is null/undefined
    var directory = directory || ___dirname;

    // Loop through each item in the directory indicated
    fs.readdirSync(directory).forEach(function (file) {

        // If an item is a directory, recurse into it too and require the route definition files in it
        if (fs.lstatSync(directory + '/' + file).isDirectory()) {
            requireFiles(directory + '/' + file, app);
        } else {
            // Remove extension from file name
            var basename = file.split('.')[0];

            // Only load/require javascript (JS) files that also aren't blacklisted
            if (validFileTypes.indexOf(file.split('.').pop()) !== -1 && !_.includes(excluded, file)) {
                // We've mapped the homepage ('/') to the 'home.js' route file
                app.use('/', require('./home'));

                // Load-up everything else dynamically
                app.use('/' + basename, require(directory + '/' + file));
            }
        }
    });
}

module.exports = function (app) {
    requireFiles(__dirname, app)
}