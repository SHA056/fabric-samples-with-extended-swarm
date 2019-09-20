const app = require('./app');
const port = process.env.PORT || 3000;
const UserController         = require('./controller/userController');

var cron              =  require('node-cron');
cron.schedule('30 2 * * *', () => {
    console.log('running a task every two minutes');
    UserController.callRollClaim();
});
const server  = app.listen(port, function(){
	console.log("Server is running on port 3000");
});