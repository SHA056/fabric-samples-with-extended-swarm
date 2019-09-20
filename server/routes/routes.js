const express 				= require('express');
const router  				= express.Router();
const bodyParser 			= require('body-parser');
const UserController 		= require('../controller/userController');
const checkAuth 			= require('../shared/verifyToken');
const multer 					= require('multer');
const config 					= require('../shared/key');
var storage = multer.diskStorage({destination: (req, file, cb) => {
		cb(null, config.upload.base)
	},
	filename: (req, file, cb) => {
		cb(null, file.originalname + '-' + Date.now())
	}
});
var upload = multer({storage: storage});


router.use(bodyParser.urlencoded({extended:true}));
router.use(bodyParser.json());

router.use(function(error, req,res, next) {
	if(error) {
		res.send('invalid json');
	}
})



router.post('/register', UserController.create);

router.post('/login', UserController.login);

router.post('/refreshLogin', UserController.refreshLogin);

router.post('/forgotPassword', UserController.forgotPassword);

router.post('/resetPassword', UserController.resetPassword);

router.get('/logout', UserController.logout);

router.get('/getUsers', UserController.getAllUser);

router.get('/getUserById/:id', checkAuth.authValidator, UserController.getUserById)

router.delete('/:id', checkAuth.authValidator, UserController.deleteUser);

// router.post('/addNewRecord', UserController.addNewRecords);

router.post('/queryRecords', UserController.queryRecords);

router.post('/updateUser/:key', UserController.updateRecords);

router.post('/buyNewPlan', UserController.buynewPlan);

router.post('/rollCliam', UserController.rollClaim);

router.post('/forceRefund', UserController.forceRefund);

router.post('/updateUserPassword', UserController.updateUserPassword);

router.post('/updateAdminPhone', UserController.updateAdminPhone);


router.post('/updateCurrencyPreference', UserController.updateCurrencyPreference);

router.post('/uploadTicket', upload.single('file'), UserController.uploadTicket);

router.post('/initiatePayment', UserController.initiatePayment);
router.post('/initpaySuccess/:txid', UserController.initpaySuccess);
router.post('/initpayFail/:txid', UserController.initpayFail);
router.post('/paySuccess/:txid', UserController.paySuccess);
router.post('/payFail/:txid', UserController.payFail);


router.post('/refundGenerator/create', UserController.createRefund);
router.get('/refundGenerator', UserController.getRefund);
router.post('/refundGenerator/update', UserController.updateRefund);


module.exports = router;