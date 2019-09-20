const mongoose      = require('mongoose');
const devDatabase   =  require('./database.json')['development'];
const mongoUrl      = 'mongodb://' + devDatabase.host + ':' + devDatabase.dbPort + '/' + devDatabase.database;

module.exports = {
    mongoSetup: function(doneCB) {
        mongoose.Promise = global.Promise;
        mongoose.connect(mongoUrl, { useNewUrlParser: true }, function(err, database){
            if(err) {
                console.error(err);
                console.error("unable to connect Mongodb database on host: " + devDatabase.host + " port: " + devDatabase.dbPort);
            } else {
                console.error("Mongodb database connected to server on host:" + devDatabase.host + " port: " + devDatabase.dbPort);
            }
            doneCB(err);
        });
    }
}