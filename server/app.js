const express 				=  require('express');
const app 					  =  express();
const cors					  =  require('cors');
const db  				  	=  require('./shared/databaseConnection');
const routes  				=  require('./routes/routes');
const path 					  = require('path');
const adminController     = require('./controller/adminController');
const key             = require('./shared/key');

process.NODE_ENV = 'development';


db.mongoSetup(function (dbError) {
    if (dbError) {
      process.exit()
      return;
  } else {
    console.log("create something at server start!");
    adminController.createAdmin(key.defaultAdmin);
  }

});

 app.use(express.static(path.join(__dirname, '../clientSide/policyApp/dist/policyApp')));
app.use(cors());
app.options('*', cors());
app.use('/api', routes)
 app.get('*', express.static(path.join(__dirname ,  '../clientSide/policyApp/dist/policyApp')));
app.use(/^((?!(api)).)*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../clientSide/policyApp/dist/policyApp/index.html'));
});
module.exports = app;