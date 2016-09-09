var mongo = require('mongodb'),
    monk = require('monk');

var state = {
    db: null,
    mode: null,
}

var CUSTOMERS_COLLECTION_NAME = 'customers',
    PURCHASE_ORDERS_COLLECTION_NAME = 'purchase_order_details';

var PRODUCTION_URI = process.env.DB_CONNECTION_STRING || 'mongodb://127.0.0.1:27017/po_tracker',
    TEST_URI = process.env.DB_CONNECTION_STRING_TEST || 'mongodb://127.0.0.1:27017/po_tracker_test';

exports.MODE_TEST = 'mode_test'
exports.MODE_PRODUCTION = 'mode_production'

exports.connect = function (mode, done) {
    if (state.db) return done();

    var uri = mode === exports.MODE_TEST ? TEST_URI : PRODUCTION_URI

    state.db = monk(uri);
    state.mode = mode;

    var customersCollectionIndexes = ['emailAddress'];

    // Drop the indexing on the 'qtpayments' collection
    //console.log('indexes: ' + state.db.get('qtpayments').indexes(function () {}));
    /* state.db.get('qtpayments').dropIndex(qtpaymentsCollectionIndex, function () {});
     console.log('Dropped indexes on collection "qtpayments".');*/


    // And re-set up indexing on the 'customersCollection' collection
    customersCollectionIndexes.forEach(function (element) {
        state.db.get('customers').index(element, { unique: true });
        console.log('Begin indexing collection "' + CUSTOMERS_COLLECTION_NAME + '" on key "' + element + '"');
    }, this);

    done();

    /* MongoClient.connect(uri, function (err, db) {
         if (err) return done(err)
         state.db = db
         state.mode = mode
         done()
     })*/
}

exports.getDB = function () {
    return state.db
}

exports.drop = function (done) {
    if (!state.db) return done()
    // This is faster then dropping the database
    state.db.collections(function (err, collections) {
        async.each(collections, function (collection, cb) {
            if (collection.collectionName.indexOf('system') === 0) {
                return cb()
            }
            collection.remove(cb)
        }, done)
    })
}

exports.fixtures = function (data, done) {
    var db = state.db
    if (!db) {
        return done(new Error('Missing database connection.'))
    }

    var names = Object.keys(data.collections)
    async.each(name, function (name, cb) {
        db.createCollection(name, function (err, collection) {
            if (err) return cb(err)
            collection.insert(data.collections[name], cb)
        })
    }, done)
}
