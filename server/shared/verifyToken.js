const jwt 				= require('jsonwebtoken');
const config 			= require('./key');



//jwt token validator
exports.authValidator = function(req, res, next){
var token = req.headers['x-access-token'];
  if (!token) return res.json({status:401, auth:false, info: "No token provided"});
  jwt.verify(token, config.secretKey.secret, function(err, decoded) {
    if (err) return res.json({status:500, auth:false, info:"Failed to authenticate token."});
        req.decoded = decoded;
        next();
  });

}

//middleware to check user logged in or not
exports.loginRequired = function(req, res, next) {
  if (req.user) {
    next();
  } else {
    return res.json({status:401, info:"Unauthorized user!"});
  }
}