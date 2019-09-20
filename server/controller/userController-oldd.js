const User = require('../models/userSchema');
const RefundGenerator = require('../models/RefundGenerator');
const TransectSchema = require('../models/TransectSchema');
const ForceRefundSchema = require('../models/ForceRefundSchema');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const key = require('../shared/key');
const crypto = require('crypto');
const async = require('async');
const path = require('path');
const Fabric_Client = require('fabric-client');
const https = require('https');
const util = require('util');
const os = require('os');
const nodemailer = require('nodemailer');
const hbs = require('nodemailer-express-handlebars');
const _ = require('lodash');
const email = "rahul.psq@gmail.com";//process.env.MAILER_EMAIL_ID || 'auth_email_address@gmail.com';
const pass = "rahul@123"//process.env.MAILER_PASSWORD || 'auth_email_pass';
const merchantkey = 'ufvZYWrt';
const merchantsalt = 'vuxvJKV5th';
var payumoney = require('payumoney-node');
const mongoose = require('mongoose');
var startTime = new Date(2019,05,20,27,80,30);
const UserController = {};
var smtpTransport = nodemailer.createTransport({
	service: process.env.MAILER_SERVICE_PROVIDER || 'Gmail',
	auth: {
		user: email,
		pass: pass,
	},
});

var handlebarsOptions = {
	viewEngine: 'handlebars',
	viewPath: path.resolve('./template/'),
	extName: '.html'
};

smtpTransport.use('compile', hbs(handlebarsOptions));

function randomNumber() {
	const min = 8;
	const max = 100;
	const random = Math.floor(Math.random() * (+max - +min)) + +min;
	return random;
}

//Creates a new user
UserController.create = function (req, res) {
	if (req.body.userName && req.body.firstName && req.body.lastName && req.body.email && req.body.phoneNumber && req.body.password && req.body.preferenceCurrency) {
		User.find({ "email": req.body.email, "userName": req.body.userName }, (err, user) => {
			if (err) {
				return res.json({ success: false, info: "Something went Wrong", result: err });
			}
			if (user.length > 0) {
				return res.json({ success: false, info: "User already exists with same email or username" });
			} else {
				var encryptedPassword = bcrypt.hashSync(req.body.password, 8);
				var key = randomNumber();
				var data = {
					userName: req.body.userName,
					firstName: req.body.firstName,
					lastName: req.body.lastName,
					email: req.body.email,
					phoneNumber: req.body.phoneNumber.toString(),
					preferenceCurrency: req.body.preferenceCurrency,
					password: encryptedPassword,
					key: key.toString(),
					category: 'User',
					role: 'Customer'
				};
				// fabric-client API starts here
				console.log('adding new record to fabric-client');
				console.log('add new record>>>>>>>>>>>>> Key, username, firstName, lastName, phoneNumber, email, category, preferenceCurrency', data.key, data.userName, data.firstName, data.lastName, data.phoneNumber, data.email, data.category, data.preferenceCurrency);
				let fabric_client = new Fabric_Client();
				let channel = fabric_client.newChannel('mychannel');
				let peer = fabric_client.newPeer('grpc://localhost:7051');
				channel.addPeer(peer);
				let order = fabric_client.newOrderer('grpc://localhost:7050');
				channel.addOrderer(order);
				let member_user = null;
				let store_path = path.join(os.homedir(), '.hfc-key-store');
				let tx_id = null;
				Fabric_Client.newDefaultKeyValueStore({ path: store_path }).then((state_store) => {
					// assign the store to the fabric client
					fabric_client.setStateStore(state_store);
					let crypto_suite = Fabric_Client.newCryptoSuite();
					// use the same location for the state store (where the users' certificate are kept)
					// and the crypto store (where the users' keys are kept)
					let crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
					crypto_suite.setCryptoKeyStore(crypto_store);
					fabric_client.setCryptoSuite(crypto_suite);

					// get the enrolled user from persistence, this user will sign all requests
					return fabric_client.getUserContext('user1', true);
				}).then((user_from_store) => {
					if (user_from_store && user_from_store.isEnrolled()) {
						console.log('Successfully loaded user1 from persistence');
						member_user = user_from_store;
					} else {
						throw new Error('Failed to get user1.... run registerUser.js');
					}
					// get a transaction id object based on the current user assigned to fabric client
					tx_id = fabric_client.newTransactionID();
					console.log("Assigning transaction_id: ", tx_id._transaction_id);
					// newUser - requires 5 args, ID, age, userid, name, email
					// send proposal to endorser
					const request = {
						//targets : --- letting this default to the peers assigned to the channel
						chaincodeId: 'policy-app',
						fcn: 'newRecord',
						args: [data.key, data.userName, data.firstName, data.lastName, data.phoneNumber, data.email, data.category],
						chainId: 'mychannel',
						txId: tx_id
					};
					// send the transaction proposal to the peers
					return channel.sendTransactionProposal(request);
				}).then((results) => {
					let proposalResponses = results[0];
					let proposal = results[1];
					let isProposalGood = false;
					if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
						isProposalGood = true;
						console.log('Transaction proposal was good');
					} else {
						console.error('Transaction proposal was bad');
					}
					if (isProposalGood) {
						console.log(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
							proposalResponses[0].response.status, proposalResponses[0].response.message));
						// build up the request for the orderer to have the transaction committed
						let request = {
							proposalResponses: proposalResponses,
							proposal: proposal
						};
						// set the transaction listener and set a timeout of 30 sec
						// if the transaction did not get committed within the timeout period,
						// report a TIMEOUT status
						let transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
						let promises = [];
						let sendPromise = channel.sendTransaction(request);
						promises.push(sendPromise); //we want the send transaction first, so that we know where to check status
						// get an eventhub once the fabric client has a user assigned. The user
						// is required bacause the event registration must be signed
						// let event_hub = fabric_client.newEventHub();
						let event_hub = channel.newChannelEventHub(peer);
						// event_hub.setPeerAddr('grpc://localhost:7053');
						// using resolve the promise so that result status may be processed
						// under the then clause rather than having the catch clause process
						// the status
						let txPromise = new Promise((resolve, reject) => {
							let handle = setTimeout(() => {
								event_hub.disconnect();
								resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
							}, 3000);
							event_hub.connect();
							event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
								// this is the callback for transaction event status
								// first some clean up of event listener
								clearTimeout(handle);
								event_hub.unregisterTxEvent(transaction_id_string);
								event_hub.disconnect();
								// now let the application know what happened
								let return_status = { event_status: code, tx_id: transaction_id_string };
								if (code !== 'VALID') {
									console.error('The transaction was invalid, code = ' + code);
									resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
								} else {
									// console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
									resolve(return_status);
								}
							}, (err) => {
								//this is the callback if something goes wrong with the event registration or processing
								reject(new Error('There was a problem with the eventhub ::' + err));
							});
						});
						promises.push(txPromise);
						return Promise.all(promises);
					} else {
						console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
						throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
					}
				}).then((results) => {
					console.log('Send transaction promise and event listener promise have completed');
					let statusFlag = false;
					// check the results in the order the promises were added to the promise all list
					if (results && results[0] && results[0].status === 'SUCCESS') {
						console.log('Successfully sent transaction to the orderer.');
						statusFlag = true;
						//res.send(tx_id.getTransactionID());
					} else {
						console.error('Failed to order the transaction. Error code: ' + response.status);
						statusFlag = false;
					}

					if (results && results[1] && results[1].event_status === 'VALID') {
						console.log('Successfully committed the change to the ledger by the peer');
						//res.json(tx_id.getTransactionID())
						statusFlag = true;

						// create user in mongodb
					} else {
						statusFlag = false;
						console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
					}
					if (statusFlag) {
						User.create(data, (err, User) => {
							if (err) {
								return res.json({ success: false, info: "Something went Wrong , unable to create", result: err });
							}
							return res.json({ success: true, info: "New user created", txId: tx_id.getTransactionID() });
						});
						// res.send(tx_id.getTransactionID());
					}
				}).catch((err) => {
					console.error('Failed to invoke successfully :: ' + err);
					return res.json({ success: false, info: "Failed to invoke successfully", result: err });
				});
			}
		});
	} else {
		return res.json({ success: false, info: "Please provide user complete detail" });
	}

}

//login user
UserController.login = function (req, res) {
	let email = req.body.email;
	User.findOne({ "email": email }, (err, user) => {
		if (err) {
			return res.json({ status: 500, success: false, info: "Error on the server" });
		}
		if (!user) {
			return res.json({ status: 404, success: false, info: "No user found" });
		}
		let passwordIsValid = bcrypt.compareSync(req.body.password, user.password);
		if (!passwordIsValid) {
			return res.json({ status: 401, success: false, token: null, info: "Incorrect Password" });
		}
		// user.lastLogin = Date.now();
		let query = { email: user.email };
		let lastLogin = Date.now();
		User.updateOne(query, { lastLogin: lastLogin }, function (err, res) {
			if (err) return res.send(500, { error: err });
		});
		console.log('user login', user);

		let LoginUser = _.pick(user, ['_id', 'firstName', 'lastName', 'email', 'role', 'key', 'phoneNumber', 'userName', 'lastLogin', 'preferenceCurrency', 'created_at']);
		//create token
		let token = jwt.sign({ id: user._id }, key.secretKey.secret, { expiresIn: "1 days" })
		res.json({ status: 200, info: "Login successful", success: true, token: token, user: LoginUser });
	});
}


//when user click on forgot password link
UserController.forgotPassword = function (req, res) {
	async.waterfall([
		function (done) {
			User.findOne({ email: req.body.email }).exec(function (err, user) {
				if (user) {
					done(err, user);
				} else {
					// done('User not found.');
					return res.json({info: "User not found."});
				}
			});
		},
		function (user, done) {
			// create the random token
			crypto.randomBytes(20, function (err, buffer) {
				var token = buffer.toString('hex');
				done(err, user, token);
			});
		},
		function (user, token, done) {
			User.findByIdAndUpdate({ _id: user._id }, { reset_password_token: token, reset_password_expires: Date.now() + 86400000 }, { upsert: true, new: true }).exec(function (err, new_user) {
				done(err, token, new_user);
			});
		},
		function (token, user, done) {
			var data = {
				to: user.email,
				from: email,
				template: 'forgot-password-email',
				subject: 'Password help has arrived!',
				context: {
					url: '/#/forgot-password?token' + token,
					name: user.firstName
				}
			};

			smtpTransport.sendMail(data, function (err) {
				if (!err) {
					return res.json({ info: 'We have sent a reset link to your email account.' });
				} else {
					res.json({info:"Something went wrong..."});
					return done(err);
				}
			});
		}
	], function (err) {
		return res.status(422).json({ info: err });
	});
}

//when user enter new password and click on reset button
UserController.resetPassword = function (req, res, next) {
	User.findOne({
		reset_password_token: req.body.token,
		reset_password_expires: { $gt: Date.now(), }
	}).exec((err, user) => {
		if (!err && user) {
			if (req.body.newPassword === req.body.verifyPassword) {
				user.hash_password = bcrypt.hashSync(req.body.newPassword, 8);
				user.reset_password_token = undefined;
				user.reset_password_expires = undefined;

				let query = { email: user.email };
				User.updateOne(query, { password: user.hash_password }, function (err) {
					if (err) {
						return res.send(500, { error: err });
					} else {
						// return res.json({ info: "User Password succesfully updated" });
						console.log("User Password has successfully updated..........");
					}
				});

				user.save((err) => {
					if (err) {
						return res.status(422).send({ info: err });
					} else {
						User.updateOne(query, { reset_password_token: req.body.token, reset_password_expires: Date.now() + 86400000 }, function (err, res) {
							if (err) return res.send(500, { error: err });
							var data = {
								to: user.email,
								from: email,
								template: 'reset-password-email',
								subject: 'Password Reset Confirmation',
								context: {
									name: user.firstName
								}
							};
	
							smtpTransport.sendMail(data, (err) => {
								if (!err) {
									return res.json({ message: 'Password reset' });
								} else {
									return res.json(err);
								}
							});
						});
					}
				});
			} else {
				return res.status(422).send({ message: 'Passwords do not match' });
			}
		} else {
			return res.status(400).send({ message: 'Password reset token is invalid or has expired.' });
		}
	});

}



//logout
UserController.logout = function (req, res) {
	res.json({ status: 200, auth: false, token: null });
}

//returns all the user
UserController.getAllUser = function (req, res) {
	console.log("getAllUser")
	let query = { role: { $ne: 'Admin' } };
	User.find(query, (err, user) => {
		if (err) {
			return res.send({ success: false, info: "Something went Wrong", result: err });
		} else {
			return res.json({ success: true, user: user });
		}
	});
},

	UserController.getUserById = function (req, res) {
		console.log("getuserById>>>>>>>>>>>", req.params.id);
		User.find({ "_id": req.params.id }, (err, user) => {
			if (err) {
				return res.send({ success: false, info: "Something went Wrong", result: err });
			} else {
				console.log('user by id>>>>>', user);
				return res.json({ success: true, user: user });
			}
		});
	},


	// DELETES A USER FROM THE DATABASE
	UserController.deleteUser = function (req, res) {
		User.findByIdAndRemove(req.params.id, function (err, user) {
			if (err) return res.status(500).send("There was a problem deleting the user.");
			res.status(200).send("User: " + user.name + " was deleted.");
		});
	}

UserController.queryRecords = function (req, res) {
	console.log("getting all records from database: ", req.body);
	let fabric_client = new Fabric_Client();
	// setup the fabric network
	let channel = fabric_client.newChannel('mychannel');
	let peer = fabric_client.newPeer('grpc://localhost:7051');
	channel.addPeer(peer);

	//
	let member_user = null;
	let store_path = path.join(os.homedir(), '.hfc-key-store');
	console.log('Store path:' + store_path);
	let tx_id = null;

	// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
	Fabric_Client.newDefaultKeyValueStore({ path: store_path }).then((state_store) => {
		// assign the store to the fabric client
		fabric_client.setStateStore(state_store);
		let crypto_suite = Fabric_Client.newCryptoSuite();
		// use the same location for the state store (where the users' certificate are kept)
		// and the crypto store (where the users' keys are kept)
		let crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
		crypto_suite.setCryptoKeyStore(crypto_store);
		fabric_client.setCryptoSuite(crypto_suite);
		// get the enrolled user from persistence, this user will sign all requests
		return fabric_client.getUserContext('user1', true);
	}).then((user_from_store) => {
		if (user_from_store && user_from_store.isEnrolled()) {
			console.log('Successfully loaded user1 from persistence');
			member_user = user_from_store;
		} else {
			throw new Error('Failed to get user1.... run registerUser.js');
		}

		function getRequestData(args) {
			var requestDefaultData = {
				chaincodeId: 'policy-app',
				txId: tx_id
			};
			return Object.assign(requestDefaultData, args);
		}
		let requestArgs = {};
		// viewLedger - requires no arguments , ex: args: [''],
		if (req.body.key) {
			console.log('querybyKey>>>>>>>>>>>>>>>>>>');
			let key = req.body.key.toString();
			requestArgs = {
				fcn: 'querybyKey',
				args: [key]
			};
		} else if (req.body.userpin) {
			console.log('querybyuser>>>>>>>>>>>>>>>>>>');
			let userpin = req.body.userpin;
			requestArgs = {
				fcn: 'querybyUser',
				args: [userpin]
			};
		} else if (req.body.name) {
			console.log('querybyname>>>>>>>>>>>>>>>>>>');
			let name = req.body.name;
			requestArgs = {
				fcn: 'querybyName',
				args: [name]
			};
		} else if (req.body.email) {
			console.log('querybyemail>>>>>>>>>>>>>>>>>>');
			let email = req.body.email;
			requestArgs = {
				fcn: 'querybyEmail',
				args: [email]
			};
		} else if (req.body.city) {
			console.log('querybycity>>>>>>>>>>>>>>>>>>');
			let city = req.body.city;
			requestArgs = {
				fcn: 'querybyCity',
				args: [city]
			};
		} else if (req.body.branch) {
			console.log('querybybranch>>>>>>>>>>>>>>>>>>');
			let branch = req.body.branch;
			requestArgs = {
				fcn: 'querybyBranch',
				args: [branch]
			};
		} else if (req.body.phonennumber) {
			console.log('querybyphonenumber>>>>>>>>>>>>>>>>>>');
			let phonennumber = req.body.phonennumber;
			requestArgs = {
				fcn: 'querybyPhonenum',
				args: [phonennumber]
			};
		} else if (req.body.category) {
			console.log('querybycategory>>>>>>>>>>>>>>>>>>');
			let category = req.body.category;
			requestArgs = {
				fcn: 'querybyCategory',
				args: [category]
			};
		} else if (req.body.idType && req.body.idNumber) {
			console.log('querybyid>>>>>>>>>>>>>>>>>>');
			let idType = req.body.idType;
			let idNumber = req.body.idNumber;
			requestArgs = {
				fcn: 'querybyId',
				args: [idType, idNumber]
			};
		} else if (req.body.planid) {
			console.log('querybyplan>>>>>>>>>>>>>>>>>>');
			let planid = req.body.planid;
			requestArgs = {
				fcn: 'querybyPlan',
				args: [planid]
			};
		} else if (req.body.status) {
			console.log('querybystatus>>>>>>>>>>>>>>>>>>');
			let status = req.body.status;
			requestArgs = {
				fcn: 'querybyStatus',
				args: [status]
			};
		} else if (req.body.provider) {
			console.log('querybyprovider>>>>>>>>>>>>>>>>>>');
			let provider = req.body.provider;
			requestArgs = {
				fcn: 'querybyProvider',
				args: [provider]
			};
		} else if (req.body.flightNum) {
			console.log('querybyflight>>>>>>>>>>>>>>>>>>');
			let flightNum = req.body.flightNum;
			requestArgs = {
				fcn: 'querybyFlight',
				args: [flightNum]
			};
		} else if (req.body.airline) {
			console.log('querybyairline>>>>>>>>>>>>>>>>>>');
			let airline = req.body.airline;
			requestArgs = {
				fcn: 'querybyAirline',
				args: [airline]
			};
		} else if (req.body.departureiata) {
			console.log('querybydeparture>>>>>>>>>>>>>>>>>>');
			let departureiata = req.body.departureiata;
			requestArgs = {
				fcn: 'querybyDeparture',
				args: [departureiata]
			};
		} else if (req.body.arrivaliata) {
			console.log('querybyarrival>>>>>>>>>>>>>>>>>>');
			let arrivaliata = req.body.arrivaliata;
			requestArgs = {
				fcn: 'querybyArrival',
				args: [arrivaliata]
			};
		} else {
			requestArgs = {
				fcn: 'queryAll',
				args: ['']
			};
		}
		// send the query proposal to the peer
		return channel.queryByChaincode(getRequestData(requestArgs));
	}).then((query_responses) => {
		console.log("Query has completed, checking results" + query_responses);
		// query_responses could have more than one  results if there multiple peers were used as targets
		if (query_responses && query_responses.length == 1) {
			if (query_responses[0] instanceof Error) {
				console.error("error from query = ", query_responses[0]);
			} else {
				console.log("Response is ", query_responses[0].toString());
				return res.json(JSON.parse(query_responses[0].toString()));
			}
		} else {
			console.log("No payloads were returned from query");
		}
	}).catch((err) => {
		console.error('Failed to query successfully :: ' + err);
	});
}

UserController.updateRecords = function (req, res) {
	// setup the fabric network
	let fabric_client = new Fabric_Client();
	var channel = fabric_client.newChannel('mychannel');
	var peer = fabric_client.newPeer('grpc://localhost:7051');
	channel.addPeer(peer);
	var order = fabric_client.newOrderer('grpc://localhost:7050')
	channel.addOrderer(order);

	var member_user = null;
	var store_path = path.join(os.homedir(), '.hfc-key-store');
	console.log('Store path:' + store_path);
	var tx_id = null;

	Fabric_Client.newDefaultKeyValueStore({ path: store_path }).then((state_store) => {
		// assign the store to the fabric client
		fabric_client.setStateStore(state_store);
		var crypto_suite = Fabric_Client.newCryptoSuite();
		// use the same location for the state store (where the users' certificate are kept)
		// and the crypto store (where the users' keys are kept)
		var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
		crypto_suite.setCryptoKeyStore(crypto_store);
		fabric_client.setCryptoSuite(crypto_suite);

		// get the enrolled user from persistence, this user will sign all requests
		return fabric_client.getUserContext('user1', true);
	}).then((user_from_store) => {
		if (user_from_store && user_from_store.isEnrolled()) {
			console.log('Successfully loaded user1 from persistence');
			member_user = user_from_store;
		} else {
			throw new Error('Failed to get user1.... run registerUser.js');
		}

		// get a transaction id object based on the current user assigned to fabric client
		tx_id = fabric_client.newTransactionID();
		console.log("Assigning transaction_id: ", tx_id._transaction_id);

		// changeTunaHolder - requires 2 args , ex: args: ['1', 'Barry'],
		// send proposal to endorser
		//		if (req.params.key && req.body.firstName && req.body.lastName && req.body.email && req.body.phoneNumber) {
		if (req.params.key && req.body.phoneNumber) {
			console.log('updateUserinfoinfo>>>>>>>>>>>>>>>>>>>>>>>>>>>');
			let key = req.params.key.toString();
			//	let firstName = req.body.firstName;
			//	let lastName = req.body.lastName
			//	let email = req.body.email.toString();
			let phoneNumber = req.body.phoneNumber.toString();

			var request = {
				//targets : --- letting this default to the peers assigned to the channel
				chaincodeId: 'policy-app',
				fcn: 'updateUserinfo',
				args: [key, phoneNumber],
				chainId: 'mychannel',
				txId: tx_id
			};
		} else if (req.params.key && req.body.accountNumber && req.body.accountIfscCode && req.body.accountHoldername && req.body.branchName && req.body.city) {
			console.log('update user bank info>>>>>>>>>>>>>>>>>>>>>>>>>>>');
			console.log('Expecting 6 values: KEY, Account number, IFSC Code, Account Holders Name, City, Branch', req.params, req.body);

			let key = req.params.key.toString();
			let accountNumber = req.body.accountNumber.toString();
			let IFSCCode = req.body.accountIfscCode.toString();
			let accountHoldername = req.body.accountHoldername;
			let branchName = req.body.branchName;
			let city = req.body.city
			var request = {
				//targets : --- letting this default to the peers assigned to the channel
				chaincodeId: 'policy-app',
				fcn: 'updateBankinfo',
				args: [key, accountNumber, IFSCCode, accountHoldername, city, branchName],
				chainId: 'mychannel',
				txId: tx_id
			};
			console.log('request', request.args);
			// res.json({ info: "Successfully Updated", tx_id: tx_id.getTransactionID() });
		}

		// send the transaction proposal to the peers
		return channel.sendTransactionProposal(request);
	}).then((results) => {
		var proposalResponses = results[0];
		var proposal = results[1];
		let isProposalGood = false;
		if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
			isProposalGood = true;
			console.log('Transaction proposal was good');
		} else {
			console.error('Transaction proposal was bad');
		}
		if (isProposalGood) {
			console.log(util.format(
				'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
				proposalResponses[0].response.status, proposalResponses[0].response.message));

			// build up the request for the orderer to have the transaction committed
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal
			};

			// set the transaction listener and set a timeout of 30 sec
			// if the transaction did not get committed within the timeout period,
			// report a TIMEOUT status
			var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
			var promises = [];
			var sendPromise = channel.sendTransaction(request);
			promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

			// get an eventhub once the fabric client has a user assigned. The user
			// is required bacause the event registration must be signed
			// let event_hub = fabric_client.newEventHub();
			let event_hub = channel.newChannelEventHub(peer);
			// event_hub.setPeerAddr('grpc://localhost:7053');
			// using resolve the promise so that result status may be processed
			// under the then clause rather than having the catch clause process
			// the status
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(() => {
					event_hub.disconnect();
					resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
				}, 3000);
				event_hub.connect();
				event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
					// this is the callback for transaction event status
					// first some clean up of event listener
					clearTimeout(handle);
					event_hub.unregisterTxEvent(transaction_id_string);
					event_hub.disconnect();
					// now let the application know what happened
					var return_status = { event_status: code, tx_id: transaction_id_string };
					if (code !== 'VALID') {
						console.error('The transaction was invalid, code = ' + code);
						resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
					} else {
						// console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
						resolve(return_status);
					}
				}, (err) => {
					//this is the callback if something goes wrong with the event registration or processing
					reject(new Error('There was a problem with the eventhub ::' + err));
				});
			});
			promises.push(txPromise);
			//return res.json({info: "Successfully Updated", Promise: Promise.all(promises)});
			return Promise.all(promises);
		} else {
			console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
			// res.send("Error: no tuna catch found");
			// throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	}).then((results) => {
		console.log('Send transaction promise and event listener promise have completed');
		// check the results in the order the promises were added to the promise all list
		if (results && results[0] && results[0].status === 'SUCCESS') {
			console.log('Successfully sent transaction to the orderer.');
			//	res.json(tx_id.getTransactionID())
		} else {
			console.error('Failed to order the transaction. Error code: ' + response.status);
			res.send("Error: no tuna catch found");
		}

		if (results && results[1] && results[1].event_status === 'VALID' && req.body.phoneNumber) {
			console.log('Successfully committed the change to the ledger by the peer');
			//update mongodb user
			let query = { key: req.params.key };
			User.update(query, { phoneNumber: req.body.phoneNumber }, function (err, success) {
				if (err) res.status(500).send({ error: err });
				return res.json({info: "Successfully Updated", tx_id: tx_id.getTransactionID()});
			});
			// res.json({ info: "Successfully Updated", tx_id: tx_id.getTransactionID() });
		} else if (results && results[1] && results[1].event_status === 'VALID' && req.body.accountNumber) {
			console.log('Successfully committed the change to the ledger by the peer');
			return res.json({ info: "Successfully Updated", tx_id: tx_id.getTransactionID() });
		} else {
			console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
		}
	}).catch((err) => {
		console.error('Failed to invoke successfully :: ' + err);
		res.send("Error: no tuna catch found");
	});
}



































// UserController.addId = function (req, res) {
// 	// setup the fabric network
// 	let fabric_client = new Fabric_Client();
// 	var channel = fabric_client.newChannel('mychannel');
// 	var peer = fabric_client.newPeer('grpc://localhost:7051');
// 	channel.addPeer(peer);
// 	var order = fabric_client.newOrderer('grpc://localhost:7050')
// 	channel.addOrderer(order);

// 	var member_user = null;
// 	var store_path = path.join(os.homedir(), '.hfc-key-store');
// 	console.log('Store path:' + store_path);
// 	var tx_id = null;

// 	Fabric_Client.newDefaultKeyValueStore({ path: store_path }).then((state_store) => {
// 		// assign the store to the fabric client
// 		fabric_client.setStateStore(state_store);
// 		var crypto_suite = Fabric_Client.newCryptoSuite();
// 		// use the same location for the state store (where the users' certificate are kept)
// 		// and the crypto store (where the users' keys are kept)
// 		var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
// 		crypto_suite.setCryptoKeyStore(crypto_store);
// 		fabric_client.setCryptoSuite(crypto_suite);

// 		// get the enrolled user from persistence, this user will sign all requests
// 		return fabric_client.getUserContext('user1', true);
// 	}).then((user_from_store) => {
// 		if (user_from_store && user_from_store.isEnrolled()) {
// 			console.log('Successfully loaded user1 from persistence');
// 			member_user = user_from_store;
// 		} else {
// 			throw new Error('Failed to get user1.... run registerUser.js');
// 		}

// 		// get a transaction id object based on the current user assigned to fabric client
// 		tx_id = fabric_client.newTransactionID();
// 		console.log("Assigning transaction_id: ", tx_id._transaction_id);

// 		// send proposal to endorser		
// 		// if (req.params.key && req.body.idType && req.body.idNumber) {
// 		// 	console.log('Add ID proof Info>>>>>>>>>>>>>>>>>>>>>>>>>>>');
// 		// 	let key = req.params.key.toString();
// 		// 	let idType = req.body.idType;
// 		// 	let idNumber = req.body.idNumber.toString();

// 		// 	var request = {
// 		// 		//targets : --- letting this default to the peers assigned to the channel
// 		// 		chaincodeId: 'policy-app',
// 		// 		fcn: 'addnewId',
// 		// 		args: [key, idType, idNumber],
// 		// 		chainId: 'mychannel',
// 		// 		txId: tx_id
// 		// 	};
// 		// } else 
// 		if (req.params.key && req.body.idType && req.body.idNumber) {
// 			console.log('Add ID proof info>>>>>>>>>>>>>>>>>>>>>>>>>>>');
// 			console.log('Expecting 3 values: KEY, ID Type, ID Number', req.params, req.body);

// 			let key = req.params.key.toString();
// 			let idType = req.body.idType;
// 			let idNumber = req.body.idNumber.toString();
// 			var request = {
// 				//targets : --- letting this default to the peers assigned to the channel
// 				chaincodeId: 'policy-app',
// 				fcn: 'addnewId',
// 				args: [key, idType, idNumber],
// 				chainId: 'mychannel',
// 				txId: tx_id
// 			};
// 			console.log('request', request.args);
// 			res.json({info: "Successfully Added", tx_id: tx_id.getTransactionID()});
// 		} else {
// 			res.json({info: "ID Not Added!", tx_id: tx_id.getTransactionID()});
// 		}

// 		// send the transaction proposal to the peers
// 		return channel.sendTransactionProposal(request);
// 	}).then((results) => {
// 		var proposalResponses = results[0];
// 		var proposal = results[1];
// 		let isProposalGood = false;
// 		if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
// 			isProposalGood = true;
// 			console.log('Transaction proposal was good');
// 		} else {
// 			console.error('Transaction proposal was bad');
// 		}
// 		if (isProposalGood) {
// 			console.log(util.format(
// 				'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
// 				proposalResponses[0].response.status, proposalResponses[0].response.message));

// 			// build up the request for the orderer to have the transaction committed
// 			var request = {
// 				proposalResponses: proposalResponses,
// 				proposal: proposal
// 			};

// 			// set the transaction listener and set a timeout of 30 sec
// 			// if the transaction did not get committed within the timeout period,
// 			// report a TIMEOUT status
// 			var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
// 			var promises = [];
// 			var sendPromise = channel.sendTransaction(request);
// 			promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

// 			// get an eventhub once the fabric client has a user assigned. The user
// 			// is required bacause the event registration must be signed
// 			// let event_hub = fabric_client.newEventHub();
// 			let event_hub = channel.newChannelEventHub(peer);
// 			// event_hub.setPeerAddr('grpc://localhost:7053');
// 			// using resolve the promise so that result status may be processed
// 			// under the then clause rather than having the catch clause process
// 			// the status
// 			let txPromise = new Promise((resolve, reject) => {
// 				let handle = setTimeout(() => {
// 					event_hub.disconnect();
// 					resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
// 				}, 3000);
// 				event_hub.connect();
// 				event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
// 					// this is the callback for transaction event status
// 					// first some clean up of event listener
// 					clearTimeout(handle);
// 					event_hub.unregisterTxEvent(transaction_id_string);
// 					event_hub.disconnect();
// 					// now let the application know what happened
// 					var return_status = { event_status: code, tx_id: transaction_id_string };
// 					if (code !== 'VALID') {
// 						console.error('The transaction was invalid, code = ' + code);
// 						resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
// 					} else {
// 						// console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
// 						resolve(return_status);
// 					}
// 				}, (err) => {
// 					//this is the callback if something goes wrong with the event registration or processing
// 					reject(new Error('There was a problem with the eventhub ::' + err));
// 				});
// 			});
// 			promises.push(txPromise);
// 			//return res.json({info: "Successfully Updated", Promise: Promise.all(promises)});
// 			return Promise.all(promises);
// 		} else {
// 			console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
// 			// res.send("Error: no tuna catch found");
// 			// throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
// 		}
// 	}).then((results) => {
// 		console.log('Send transaction promise and event listener promise have completed');
// 		// check the results in the order the promises were added to the promise all list
// 		if (results && results[0] && results[0].status === 'SUCCESS') {
// 			console.log('Successfully sent transaction to the orderer.');
// 		//	res.json(tx_id.getTransactionID())
// 		} else {
// 			console.error('Failed to order the transaction. Error code: ' + response.status);
// 			res.send("Error: no tuna catch found");
// 		}

// 		if (results && results[1] && results[1].event_status === 'VALID') {
// 			console.log('Successfully committed the change to the ledger by the peer');

// 			//update mongodb user
// 		// 	let query = { key: key };
// 		// 	User.update(query, {firstName: firstName, lastName: lastName, email: email, phoneNumber: phoneNumber}, function(err, res){
// 		// 		if (err) return res.send(500, { error: err });
// 		// 		return res.send({info: "successfully saved", tx_id: tx_id.getTransactionID()});
// 		// });
// 			// res.json(tx_id.getTransactionID())
// 			//res.json({info: "Successfully Updated",tx_id: tx_id.getTransactionID()});
// 		} else {
// 			console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
// 		}
// 	}).catch((err) => {
// 		console.error('Failed to invoke successfully :: ' + err);
// 		res.send("Error: no tuna catch found");
// 	});
// }
UserController.buynewPlan = function (req, res) {
	console.log('buynewPlan>>>>>>>>>>>>>>>>>>>>>>>>>', req.body.ticketPath);
	let key = req.body.formValue.key.toString();
	let planNumber = req.body.formValue.planNumber || '111';
	let tripId = req.body.formValue.tripId || randomNumber().toString(); //generate random id
	let pnr = req.body.formValue.ticketNumber.toString();
	let flightNumber = req.body.formValue.flightNumber.toString();
	let airlineName = req.body.formValue.airlineName || 'NA';
	let departureiata = req.body.formValue.leavingFrom; //leavingFrom
	let arrivaliata = req.body.formValue.arrivingAt; //arrinvingAt
	let timestamp = req.body.formValue.dateOfJourney;
	let pricePerPerson = req.body.formValue.amount.toString() || null; //amount
	let paymentTrackingId = req.body.formValue.paymentTrackingId || randomNumber().toString();
	let tranactionTimestamp = req.body.formValue.tranactionTimestamp || '2019-23-01T10:46:32';
	let gatewayProvider = req.body.formValue.gatewayProvider || 'payumoney';
	let totalPassenger = req.body.formValue.totalPassenger.toString();
	let requestSource=req.body.formValue.requestSource || 'web';
	let passengerId = _.map(req.body.formValue.passengers, 'passengerId').toString(); //randon generate id
	let firstName = _.map(req.body.formValue.passengers, 'firstName').toString(); // first name && last Name
	let lastName = _.map(req.body.formValue.passengers, 'lastName').toString();
	let passengerPhoneNumber = _.map(req.body.formValue.passengers, 'phoneNumber').toString();
	let passengerEmail = _.map(req.body.formValue.passengers, 'email').toString();
	let userEmail = req.body.email;
	let userPhoneNumber = req.body.phoneNumber;
	let uploadTicketPath = req.body.ticketPath.toString();
	let str = '';
	let data = req.body;
	let date = new Date();
	var refundAmount = null;
	var	handlingCharge = null;
	var paymentStatus = false;
	var totalHandlingCharge = null;
	
	console.log('Expecting values: KEY, Plan number, Trip ID, ticketNumber, Flight number, Airline Name, Departure IATA, Arrival IATA, Timestamp, Price per person, Payment Tracking ID, Transaction Timestamp, Gateway provider,Payment Bank, Payment Mode, Gateway Type, Card Type, Total Passengers, nth(Passenger ID, Passenger Name, Passenger Phonenum, Passenger Email)', key, planNumber, tripId, pnr, flightNumber, airlineName, departureiata, arrivaliata, timestamp, pricePerPerson, paymentTrackingId, tranactionTimestamp, gatewayProvider, totalPassenger, passengerId, firstName, lastName, passengerPhoneNumber, passengerEmail);
	var optionsget = {
		host: 'aviation-edge.com', // here only the domain name
		// (no http/https !)
		port: 443,
		path: '/v2/public/timetable?key=73a96e-e3e7e8-3b6580-f37bdf-94c179&iataCode=' + departureiata + '&type=departure', // the rest of the url with parameters if needed
		method: 'GET' // do GET
	};
	var reqGet = https.request(optionsget, function (resp) {
		resp.on('data', function (d) {
			str += d;
//			console.info('\n\nCall completed');
		});
		resp.on('end', function () {
			objflight = JSON.parse(str);
			let myString;
			let myReg = new RegExp(timestamp + ".*");
			let myMatch;
			let isFound = false;

			for (i = 0; i < objflight.length; i++) {
				myString = objflight[i].departure.scheduledTime;
				myMatch = myString.match(myReg);
//				console.log('myMatch', myMatch);

//				console.log(objflight[i].flight.iataNumber, typeof objflight[i].flight.iataNumber);
				if ((objflight[i].flight.iataNumber === flightNumber.toUpperCase()) && (objflight[i].arrival.iataCode === arrivaliata.toUpperCase()) && myMatch !== null) {
					//cbSuccess();
					isFound = true;
					break;
				}
			}
//			console.log(flightNumber.toUpperCase(), typeof flightNumber.toUpperCase());
			if (isFound) {
				//call payment gatways

				var cryp = crypto.createHash('sha256');
				var ord = JSON.stringify(Math.random() * 1000);
				// var i = ord.indexOf('.');
				// ord = 'ORD' + ord.substr(0, i);
				var min_diff = Math.floor((date - startTime)/(1000*60));
				let day_diff = Math.floor((date - startTime)/(1000*3600*24));
				min_diff = min_diff - (day_diff * 24 * 60);
				ord = 'ORD' + key +'T' + day_diff + min_diff;

				var text = key + '|' + ord + '|' + pricePerPerson + '|' + planNumber + '|' + 'Wahid' + '|' + lastName + '|||||' + data.udf5 + '||||||' + merchantsalt;
				cryp.update(text);
				var hash = cryp.digest('hex');
				payumoney.setKeys(merchantkey, merchantsalt, 'kSLFegfhomMfzGbuvb8LHiTKnlDrGkhAemYC73Y29zo=');
				payumoney.isProdMode(false);

				RefundGenerator.find({ updatedbyCategory: 'Admin' }, function (err, doc) {
                    console.log(doc);
                    console.log("Calling Refund values>>>>>>>" );
                    if (err) {
                        console.log("\n>>>>>>>>>>>>>>>>>Error:>>>>>>>>>>>>>>>>>> ",err);
                    } else {
                        if (doc && doc.length > 0) {
                            var refund = doc[0];
                            console.log('\n\n\n\nValue of Refund is >>>>>>>>>>>>>>>>>>>>>>',refund,'\n\n\n\n\n\n');
                            refundAmount = (Number(refund.credit) * Number(refund.limit) / 100) + '';
                            handlingCharge = refund.handlingCharge;
							totalHandlingCharge = Number(totalPassenger) * Number(refund.handlingCharge);
							console.log('Total Handling Charge is : ', totalHandlingCharge);
							console.log("Hello World>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
							console.log('User Email', userEmail, 'User Phone Number', userPhoneNumber);
							// amount: pricePerPerson,
							var paymentData = {
								productinfo: planNumber,
								txnid: ord,
								amount: totalHandlingCharge,
								email: userEmail,
								phone: userPhoneNumber,
								lastname: lastName,
								firstname: firstName,
								surl: "http://localhost:3000/api/initpaySuccess/" + ord,
								furl: "http://localhost:3000/api/initpayFail/" + ord
							};
							console.log('Payment Request body-----> ', paymentData)
							// payumoney.makePayment(paymentData, function (error, response, next) {
							payumoney.makePayment(paymentData, function (error, response) {
							console.log('Payment gateway response : ', response, 'Error : ', error)
							if (error) {
								console.log(error)
								paymentStatus = false;
								res.status(500).json({
									statusCode: 500,
									error: error
								});
							} else {
								var data = {
									key: key,
									planNumber: planNumber,
									txid: ord,
									tripId: tripId,
									pnr: pnr,
									flightNumber: flightNumber,
									airlineName: airlineName,
									departureiata: departureiata,
									arrivaliata: arrivaliata,
									timestamp: timestamp,
									pricePerPerson: pricePerPerson,
									uploadTicketPath: uploadTicketPath,
									paymentTrackingId: paymentTrackingId,
									tranactionTimestamp: tranactionTimestamp,
									gatewayProvider: gatewayProvider,
									totalPassenger: totalPassenger,
									passengerId: passengerId,
									firstName: firstName,
									lastName: lastName,
									passengerPhoneNumber: passengerPhoneNumber,
									passengerEmail: passengerEmail,
									refundAmt: refundAmount,
									handlingChargeAmt: totalHandlingCharge,
									paymentStatus: paymentStatus,
								    requestSource: requestSource
								};
								TransectSchema.create(data, (err, TransectSchema) => {
									if (err) {
										return res.json({ success: false, info: "Something went Wrong , unable to create", result: err });
									}
									paymentStatus = true;
									console.log(response)
									return res.json({
										success: true,
										location: response
									});
									//	return res.json({ success: true, info: "New user created", txId: tx_id.getTransactionID()});
								});

							}
							});
				
                        }
                    } 
				});
					

			} else {
				console.log('Flight not found')
				return res.json({
					success: false,
					info: 'Flight not found'
				});
			}
		});
	});
	req = reqGet.end();
	reqGet.on('error', function (e) {
		console.error(e);
	});

}

// UserController.rollClaimCronjob = function () {
// 	forceRollClaim();

// }

UserController.rollClaim = function (req, res) {
	//checking password
	console.log('req.body>>>>>', req.body);
	if ((req.body.password && req.body.email)) {
		User.findOne({ "email": req.body.email }, (err, user) => {
			if (err) {
				return res.json({ status: 500, success: false, info: "Error on the server" });
			}
			if (!user) {
				return res.json({ status: 404, success: false, info: "No user found" });
			}
			let passwordIsValid = bcrypt.compareSync(req.body.password, user.password);
			if (!passwordIsValid) {
				return res.json({ status: 401, success: false, token: null, info: "Incorrect Password" });
			}
			// rollClaim starts here
			//forceRollClaim();


			console.log("rolling all unclaimed records from database: ");
			var fabric_client = new Fabric_Client();
			// setup the fabric network
			var channel = fabric_client.newChannel('mychannel');
			var peer = fabric_client.newPeer('grpc://localhost:7051');
			channel.addPeer(peer);
			var order = fabric_client.newOrderer('grpc://localhost:7050')
			channel.addOrderer(order);
			var member_user = null;
			var store_path = path.join(os.homedir(), '.hfc-key-store');
			console.log('Store path:' + store_path);
			var tx_id = null;

			// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
			Fabric_Client.newDefaultKeyValueStore({
				path: store_path
			}).then((state_store) => {
				// assign the store to the fabric client
				fabric_client.setStateStore(state_store);
				var crypto_suite = Fabric_Client.newCryptoSuite();
				// use the same location for the state store (where the users' certificate are kept)
				// and the crypto store (where the users' keys are kept)
				var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
				crypto_suite.setCryptoKeyStore(crypto_store);
				fabric_client.setCryptoSuite(crypto_suite);

				// get the enrolled user from persistence, this user will sign all requests
				return fabric_client.getUserContext('user1', true);
			}).then((user_from_store) => {
				if (user_from_store && user_from_store.isEnrolled()) {
					console.log('Successfully loaded user1 from persistence');
					member_user = user_from_store;
				} else {
					throw new Error('Failed to get user1.... run registerUser.js');
				}

				tx_id = fabric_client.newTransactionID();
				console.log("Assigning transaction_id: ", tx_id._transaction_id);

				console.log("roll claim txid is ===" + tx_id._transaction_id);
				// viewLedger - requires no arguments , ex: args: [''],
				const request = {
					chaincodeId: 'policy-app',
					txId: tx_id,
					chainId: 'mychannel',
					fcn: 'rollClaim',
					args: ['']
				};


				// send the transaction proposal to the peers
				return channel.sendTransactionProposal(request);
			}).then((results) => {
				console.log('result>>>>>>', results)
				var proposalResponses = results[0];
				var proposal = results[1];
				let isProposalGood = false;
				if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
					isProposalGood = true;
					console.log('Transaction proposal was good');
				} else {
					console.error('Transaction proposal was bad');
				}
				if (isProposalGood) {
					console.log(util.format(
						'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
						proposalResponses[0].response.status, proposalResponses[0].response.message));

					// build up the request for the orderer to have the transaction committed
					var request = {
						proposalResponses: proposalResponses,
						proposal: proposal
					};

					// set the transaction listener and set a timeout of 30 sec
					// if the transaction did not get committed within the timeout period,
					// report a TIMEOUT status
					var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
					var promises = [];

					// console.log("flow 1----");
					var sendPromise = channel.sendTransaction(request);
					// console.log("flow 2----");
					promises.push(sendPromise); //we want the send transaction first, so that we know where to check status
					// console.log("flow 3----");
					// get an eventhub once the fabric client has a user assigned. The user
					// is required bacause the event registration must be signed
					// let event_hub = fabric_client.newEventHub();
					// event_hub.setPeerAddr('grpc://localhost:7053');
					let event_hub = channel.newChannelEventHub(peer);
					// using resolve the promise so that result status may be processed
					// under the then clause rather than having the catch clause process
					// the status
					// console.log("flow 4----");
					let txPromise = new Promise((resolve, reject) => {
						let handle = setTimeout(() => {
							event_hub.disconnect();
							resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
						}, 3000);
						event_hub.connect();
						// console.log("flow 5----");
						event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
							// this is the callback for transaction event status
							// first some clean up of event listener
							// console.log("flow 6----");
							clearTimeout(handle);
							event_hub.unregisterTxEvent(transaction_id_string);
							event_hub.disconnect();

							// now let the application know what happened
							var return_status = { event_status: code, tx_id: transaction_id_string };
							// console.log("flow 7----");
							if (code !== 'VALID') {
								console.error('The transaction was invalid, code = ' + code);
								resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
							} else {
								// console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
								resolve(return_status);
							}
						}, (err) => {
							//this is the callback if something goes wrong with the event registration or processing
							// console.log("flow 8----");
							reject(new Error('There was a problem with the eventhub ::' + err));
						});
					});
					promises.push(txPromise);

					return Promise.all(promises);
				} else {
					console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
					res.send("Error: no data found");
					// throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200200200200200200200200200200200. exiting...');
				}
			}).then((results) => {
				console.log('Send transaction promise and event listener promise have completed');
				var flag = false;
				// check the results in the order the promises were added to the promise all list
				if (results && results[0] && results[0].status === 'SUCCESS') {
					console.log('Successfully sent transaction to the orderer.');
					flag = true;
					//res.json(tx_id.getTransactionID())
				} else {
					console.error('Failed to order the transaction. Error code: ' + response.status);
					res.send("Error: no data found");
				}

				if (results && results[1] && results[1].event_status === 'VALID') {
					console.log('Successfully committed the change to the ledger by the peer');
					flag = true;
					//res.json(tx_id.getTransactionID())
				} else {
					console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
				}
				if (flag) {
					res.json(tx_id.getTransactionID());
				}
			}).catch((err) => {
				console.error('Failed to invoke successfully :: ' + err);
				res.send("Error: no data found");
			});



		});
	} else {
		return res.json({ success: false, info: "Please complete the mandatory fields" })
	}
}
UserController.callRollClaim = function () {
	//checking password
	//console.log('req.body>>>>>', req.body);

	console.log("rolling all unclaimed records from database: ");
	var fabric_client = new Fabric_Client();
	// setup the fabric network
	var channel = fabric_client.newChannel('mychannel');
	var peer = fabric_client.newPeer('grpc://localhost:7051');
	channel.addPeer(peer);
	var order = fabric_client.newOrderer('grpc://localhost:7050')
	channel.addOrderer(order);
	var member_user = null;
	var store_path = path.join(os.homedir(), '.hfc-key-store');
	console.log('Store path:' + store_path);
	var tx_id = null;

	// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
	Fabric_Client.newDefaultKeyValueStore({
		path: store_path
	}).then((state_store) => {
		// assign the store to the fabric client
		fabric_client.setStateStore(state_store);
		var crypto_suite = Fabric_Client.newCryptoSuite();
		// use the same location for the state store (where the users' certificate are kept)
		// and the crypto store (where the users' keys are kept)
		var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
		crypto_suite.setCryptoKeyStore(crypto_store);
		fabric_client.setCryptoSuite(crypto_suite);

		// get the enrolled user from persistence, this user will sign all requests
		return fabric_client.getUserContext('user1', true);
	}).then((user_from_store) => {
		if (user_from_store && user_from_store.isEnrolled()) {
			console.log('Successfully loaded user1 from persistence');
			member_user = user_from_store;
		} else {
			throw new Error('Failed to get user1.... run registerUser.js');
		}

		tx_id = fabric_client.newTransactionID();
		console.log("Assigning transaction_id: ", tx_id._transaction_id);

		console.log("roll claim txid is ===" + tx_id._transaction_id);
		// viewLedger - requires no arguments , ex: args: [''],
		const request = {
			chaincodeId: 'policy-app',
			txId: tx_id,
			chainId: 'mychannel',
			fcn: 'rollClaim',
			args: ['']
		};


		// send the transaction proposal to the peers
		return channel.sendTransactionProposal(request);
	}).then((results) => {
		console.log('result>>>>>>', results)
		var proposalResponses = results[0];
		var proposal = results[1];
		let isProposalGood = false;
		if (proposalResponses && proposalResponses[0].response &&
			proposalResponses[0].response.status === 200) {
			isProposalGood = true;
			console.log('Transaction proposal was good');
		} else {
			console.error('Transaction proposal was bad');
		}
		if (isProposalGood) {
			console.log(util.format(
				'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
				proposalResponses[0].response.status, proposalResponses[0].response.message));

			// build up the request for the orderer to have the transaction committed
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal
			};

			// set the transaction listener and set a timeout of 30 sec
			// if the transaction did not get committed within the timeout period,
			// report a TIMEOUT status
			var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
			var promises = [];

			// console.log("flow 1----");
			var sendPromise = channel.sendTransaction(request);
			// console.log("flow 2----");
			promises.push(sendPromise); //we want the send transaction first, so that we know where to check status
			// console.log("flow 3----");
			// get an eventhub once the fabric client has a user assigned. The user
			// is required bacause the event registration must be signed
			// let event_hub = fabric_client.newEventHub();
			// event_hub.setPeerAddr('grpc://localhost:7053');
			let event_hub = channel.newChannelEventHub(peer);
			// using resolve the promise so that result status may be processed
			// under the then clause rather than having the catch clause process
			// the status
			// console.log("flow 4----");
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(() => {
					event_hub.disconnect();
					resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
				}, 3000);
				event_hub.connect();
				// console.log("flow 5----");
				event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
					// this is the callback for transaction event status
					// first some clean up of event listener
					// console.log("flow 6----");
					clearTimeout(handle);
					event_hub.unregisterTxEvent(transaction_id_string);
					event_hub.disconnect();

					// now let the application know what happened
					var return_status = { event_status: code, tx_id: transaction_id_string };
					// console.log("flow 7----");
					if (code !== 'VALID') {
						console.error('The transaction was invalid, code = ' + code);
						resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
					} else {
						// console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
						resolve(return_status);
					}
				}, (err) => {
					//this is the callback if something goes wrong with the event registration or processing
					// console.log("flow 8----");
					reject(new Error('There was a problem with the eventhub ::' + err));
				});
			});
			promises.push(txPromise);

			return Promise.all(promises);
		} else {
			console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
			//res.send("Error: no data found");
			// throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200200200200200200200200200200200. exiting...');
		}
	}).then((results) => {
		console.log('Send transaction promise and event listener promise have completed');
		var flag = false;
		// check the results in the order the promises were added to the promise all list
		if (results && results[0] && results[0].status === 'SUCCESS') {
			console.log('Successfully sent transaction to the orderer.');
			flag = true;
			//res.json(tx_id.getTransactionID())
		} else {
			console.error('Failed to order the transaction. Error code: ' + response.status);
			//res.send("Error: no data found");
		}

		if (results && results[1] && results[1].event_status === 'VALID') {
			console.log('Successfully committed the change to the ledger by the peer');
			flag = true;
			//res.json(tx_id.getTransactionID())
		} else {
			console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
		}
		if (flag) {
			console.error('Transaction ID :: ', tx_id.getTransactionID);
			//res.json(tx_id.getTransactionID());
		}
	}).catch((err) => {
		console.error('Failed to invoke successfully :: ' + err);
		//res.send("Error: no data found");
	});
}
UserController.forceRefund = function (req, res) {
	console.log('forceRefund api>>>>>>>>>>>>>>>>>>>>>>>>>>');
	let adminPassword = req.body.password;
	let adminEmail = req.body.adminEmail;
	let customerEmail = req.body.email;
	let bookingId = req.body.tripId;
	let planNumber = '111';//req.body.formValue.planNumber || '111';
	let paymentTrackingId = randomNumber().toString();
	let tranactionTimestamp = '2019-23-01T10:46:32';//req.body.formValue.tranactionTimestamp || '2019-23-01T10:46:32';
	let gatewayProvider = 'payumoney';//req.body.formValue.gatewayProvider || 'payumoney';
	let firstName = null;
	let lastName = null;
	let userPhoneNumber = null;
	var refundAmount = 0;
	let date;
	let pay = false;
	let refundStatus = false;
	console.log('req.body>>>>>', req.body);
	if (adminPassword && adminEmail) {
		User.findOne({ "email": adminEmail }, (err, admin) => {
			if (err) {
				return res.json({ status: 500, success: false, info: "Error on the server" });
			}
			if (!admin) {
				return res.json({ status: 404, success: false, info: "No Admin found" });
			}
			let passwordIsValid = bcrypt.compareSync(adminPassword, admin.password);
			
			if (!passwordIsValid) {
				console.log('Invald Password...');
				return res.json({ status: 401, success: false, token: null, info: "Incorrect Password" });
			} 

			User.findOne({ "email": customerEmail }, (err, customer) => {
				if (err) {
					return res.json({ status: 500, success: false, info: "Error on the server" });
				}
				if (!customer) {
					return res.json({ status: 404, success: false, info: "No user found" });
				} else {
					let key = customer.key;
					let fabric_client = new Fabric_Client();
					// setup the fabric network
					let channel = fabric_client.newChannel('mychannel');
					let peer = fabric_client.newPeer('grpc://localhost:7051');
					channel.addPeer(peer);
				
					//
					let member_user = null;
					let store_path = path.join(os.homedir(), '.hfc-key-store');
					console.log('Store path:' + store_path);
					let tx_id = null;
				
					// create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
					Fabric_Client.newDefaultKeyValueStore({ path: store_path }).then((state_store) => {
						// assign the store to the fabric client
						fabric_client.setStateStore(state_store);
						let crypto_suite = Fabric_Client.newCryptoSuite();
						// use the same location for the state store (where the users' certificate are kept)
						// and the crypto store (where the users' keys are kept)
						let crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
						crypto_suite.setCryptoKeyStore(crypto_store);
						fabric_client.setCryptoSuite(crypto_suite);
						// get the enrolled user from persistence, this user will sign all requests
						return fabric_client.getUserContext('user1', true);
					}).then((user_from_store) => {
						if (user_from_store && user_from_store.isEnrolled()) {
							console.log('Successfully loaded user1 from persistence');
							member_user = user_from_store;
						} else {
							throw new Error('Failed to get user1.... run registerUser.js');
						}
				
						function getRequestData(args) {
							var requestDefaultData = {
								chaincodeId: 'policy-app',
								txId: tx_id
							};
							return Object.assign(requestDefaultData, args);
						}
				
						let requestArgs = {};

							requestArgs = {
								fcn: 'queryAll',
								args: ['']
							};
				
						console.log('==========>>>>',getRequestData(requestArgs))
						// send the query proposal to the peer
						return channel.queryByChaincode(getRequestData(requestArgs));
					}).then((query_responses) => {
						console.log("Query has completed, checking results" + query_responses);
						// query_responses could have more than one  results if there multiple peers were used as targets
						if (query_responses && query_responses.length == 1) {
							if (query_responses[0] instanceof Error) {
								console.error("error from query = ", query_responses[0]);
							} else {
								var refundList = JSON.parse(query_responses[0].toString());
								let count = 0;
								for(const refundItem of refundList) {
									if(refundItem.Record.userinfo.email === customerEmail) {
										//console.log('User Item found',refundItem)
										console.log('User Item found',refundItem.Record,'\n\n\n\n')
										console.log(customerEmail,'\n\n\n');
										userPhoneNumber = refundItem.Record.userinfo.phone;
										firstName = refundItem.Record.userinfo.fname;
										lastName = refundItem.Record.userinfo.lname;
										for(const tripInfoItem of refundItem.Record.tripinfo) {
											console.log('Trip Information >>>>>>>>>>>', tripInfoItem.tripid,tripInfoItem.claimstatus, bookingId);
											if(tripInfoItem.claimstatus == 'processing' && tripInfoItem.tripid.toUpperCase() == bookingId.toUpperCase()) {
												console.log('Refund Item found',tripInfoItem);
												pay = true;
												refundAmount = tripInfoItem.coverageinfo.amount;
												break;
											} 
										}
										console.log(">>>>>>>>>>>>First name",firstName);
									}
								}
								if(count === 0) {
									return res.json({ success: false, info: 'Invalid Booking ID' });
								}
								if(pay) {
									date = new Date();
									var cryp = crypto.createHash('sha256');
									var ref = null;
									ref = 'REF' + key + date.getDate() + (date.getMonth() + 1) + date.getFullYear() + date.getHours() + date.getMinutes() + date.getSeconds();
									payumoney.setKeys(merchantkey, merchantsalt, 'kSLFegfhomMfzGbuvb8LHiTKnlDrGkhAemYC73Y29zo=');
									payumoney.isProdMode(false);

									TransectSchema.find({txid: bookingId}, function(err,tabval) {
										console.log(tabval);
										console.log("Calling Refund values>>>>>>>" );
										if (err) {
											console.log("\n>>>>>>>>>>>>>>>>>Error:>>>>>>>>>>>>>>>>>> ",err);
										} else {
											if (tabval && tabval.length > 0) {
											var refund = tabval[0];
											console.log('\n\n\n\n\nRefund Values are------------>\n\n', refund, '\n\n\n\n\n\n')
											}
										}
									});
									var paymentData = {
										productinfo: planNumber,
										txnid: ref,
										amount: refundAmount,
										email: customerEmail,
										phone: userPhoneNumber,
										lastname: lastName,
										firstname: firstName,
										surl: "http://localhost:3000/api/paySuccess/" + ref,
										furl: "http://localhost:3000/api/payFail/" + ref
									};
									console.log('Payment Request body-----> ', paymentData);
									payumoney.makePayment(paymentData, function (error, response) {
										console.log('Payment gateway response : ', response, 'Error : ', error)
										if (error) {
											console.log(error);
											refundStatus = false;
											res.status(500).json({
												statusCode: 500,
												error: error
											});
										} else {

											refundStatus = true;
											console.log("Refund values>>>>>>>", refundAmount);
											var data = {
												key: key,
												bookingId: bookingId,
												paymentTrackingId: paymentTrackingId,
												tranactionTimestamp: tranactionTimestamp,
												gatewayProvider: gatewayProvider,
												userEmail: customerEmail,
												refundAmt: refundAmount,
												refundStatus: refundStatus,
												txid: ref
											};
											ForceRefundSchema.create(data, (err, ForceRefundSchema) => {
												if (err) {
													return res.json({ success: false, info: "Something went Wrong , unable to create", result: err });
												}
												console.log(response);
												console.log('\n\n\n\n\n',ForceRefundSchema);
												return res.json({
													success: true,
													info: 'Processing...',
													location: response
												});
											});

										}
									});
								
								}
								// return res.json({success: false, data: JSON.parse(query_responses[0].toString())});
							}
						} else {
							console.log("No payloads were returned from query");
						}
					}).catch((err) => {
						console.error('Failed to query successfully :: ' + err);
					});
				}
			});
	
			console.log("No payloads were returned from query=================>>>");
		});
	} else {
		// console.log('Hello World..........')
		return res.json({ success: false, info: "Please complete the mandatory fields" })
	}
}


UserController.uploadTicket = function (req, res) {
	const file = req.file

	if (!file) {
		return res.json({ status: 400, info: 'Please upload a file' });
	}
	return res.json({ file: file, info: 'File Uploaded Successfully' })

}

UserController.updateUserPassword = function (req, res) {
	let id = req.body.id;
	let isMatched = false;
	User.findOne({ "_id": id }, (err, user) => {
		if (err) {
			return res.json({ status: 500, success: false, info: "Error on the server" });
		}
		if (!user) {
			return res.json({ status: 404, success: false, info: "No user found" });
		}
		let passwordIsValid = bcrypt.compareSync(req.body.oldPassword, user.password);
		if (!passwordIsValid) {
			return res.json({ status: 401, success: false, token: null, info: "Old Password is incorrect" });
		}
		if (req.body.newPassword != req.body.confirmPassword) {
			isMatched = true;
		}

		if (isMatched) {
			return res.json({ status: 404, success: false, info: "Passwords do not match" });
		} else {
			let query = { _id: id };
			let encryptedPassword = bcrypt.hashSync(req.body.newPassword, 8);
			User.update(query, { password: encryptedPassword }, function (err) {
				if (err) {
					return res.send(500, { error: err });
				} else {
					return res.json({ info: "Password successfully updated" });
				}
			});
		}
	});

}

// function forceRollClaim() {}

UserController.initiatePayment = function (req, res) {
	var data = req.body;
	var cryp = crypto.createHash('sha256');
	var text = data.key + '|' + data.txnid + '|' + data.amount + '|' + data.pinfo + '|' + data.fname + '|' + data.email + '|||||' + data.udf5 + '||||||' + data.salt;
	cryp.update(text);
	var hash = cryp.digest('hex');
	payumoney.setKeys(merchantkey, merchantsalt, hash);
	payumoney.isProdMode(false);
	var ord = JSON.stringify(Math.random() * 1000);
	var i = ord.indexOf('.');
	ord = 'ORD' + ord.substr(0, i);
	var paymentData = {
		productinfo: data.productinfo,
		txnid: ord,
		amount: data.amount,
		email: data.email,
		phone: data.phone,
		lastname: data.lastname,
		firstname: data.firstname,
		surl: "http://localhost:3000/api/initpaySuccess",
		furl: "http://localhost:3000/api/initpayFail"
	};
	var response;
	payumoney.makePayment(paymentData, function (error, response, next) {
		if (error) {
			res.status(500).json({
				statusCode: 500,
				error: error
			});
		} else {
			res.status(200).json({
				location: response
			});
		}
	});
}

UserController.initpaySuccess = function (req, res) {
	// setup the fabric network
	const transectId = req.params.txid;

	//var json=JSON.stringify(res.req);
	//console.log('Transaction header---------->',res.headers['origin']);

	console.log('Payment Gateway Response -------->  ', req.body)
	//	console.log('Transaction ID ---------> ',transectId)
	var tranaction = null;
	let payumoneyResponse = req.body;


	let fabric_client = new Fabric_Client();
	var channel = fabric_client.newChannel('mychannel');
	var peer = fabric_client.newPeer('grpc://localhost:7051');
	channel.addPeer(peer);
	var order = fabric_client.newOrderer('grpc://localhost:7050')
	channel.addOrderer(order);

	var member_user = null;
	var store_path = path.join(os.homedir(), '.hfc-key-store');
	console.log('Store path:' + store_path);
	var tx_id = null;
	var refund = null;
	var refundAmount = 'NA';
	var handlingCharge = 'NA';
	TransectSchema.findOne({ "txid": transectId }, (err, transect) => {

		if (err) {
			return res.json({ status: 500, success: false, info: "Error on the server" });
		}
		tranaction = transect;
		//if (!transect) {
		console.log('Transaction Details : ', transect)
		

		// return res.json({ status: 404, success: false, info: "No user found" });
		//}
	});

	RefundGenerator.find({ updatedbyCategory: 'Admin' }, function (err, doc) {
		console.log(doc);

		if (err) {

		} else {
			if (doc && doc.length > 0) {
				refund = doc[0];
				refundAmount = Number(refund.credit) * Number(refund.limit) / 100 + '';
				handlingCharge = refund.handlingCharge;
			}
		}
		//return res.status(200).json(doc);  
	});

	Fabric_Client.newDefaultKeyValueStore({ path: store_path }).then((state_store) => {
		// assign the store to the fabric client
		fabric_client.setStateStore(state_store);
		var crypto_suite = Fabric_Client.newCryptoSuite();
		// use the same location for the state store (where the users' certificate are kept)
		// and the crypto store (where the users' keys are kept)
		var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
		crypto_suite.setCryptoKeyStore(crypto_store);
		fabric_client.setCryptoSuite(crypto_suite);

		// get the enrolled user from persistence, this user will sign all requests
		return fabric_client.getUserContext('user1', true);
	}).then((user_from_store) => {
		if (user_from_store && user_from_store.isEnrolled()) {
			console.log('Successfully loaded user1 from persistence');
			member_user = user_from_store;
		} else {
			throw new Error('Failed to get user1.... run registerUser.js');
		}

		// get a transaction id object based on the current user assigned to fabric client
		tx_id = fabric_client.newTransactionID();
		console.log("Assigning transaction_id: ", tx_id._transaction_id);



		var request = {
			//targets : --- letting this default to the peers assigned to the channel
			chaincodeId: 'policy-app',
			fcn: 'buynewPlan',
			args: [tranaction.key, tranaction.planNumber, payumoneyResponse.txnid, tranaction.pnr,
			tranaction.flightNumber, tranaction.airlineName, tranaction.departureiata,
			tranaction.arrivaliata, tranaction.timestamp, tranaction.pricePerPerson, handlingCharge, refundAmount,
			tranaction.uploadTicketPath, payumoneyResponse.txnid, payumoneyResponse.addedon,
			tranaction.gatewayProvider, payumoneyResponse.PG_TYPE, payumoneyResponse.mode, 'payumoney', payumoneyResponse.bankcode,
			tranaction.totalPassenger, tranaction.passengerId, tranaction.firstName, tranaction.lastName,
			tranaction.passengerPhoneNumber, tranaction.passengerEmail],
			chainId: 'mychannel',
			txId: tx_id
		};

		console.log('Backend Request ==============>', request);
		// send the transaction proposal to the peers
		return channel.sendTransactionProposal(request);
	}).then((results) => {
		var proposalResponses = results[0];
		var proposal = results[1];
		let isProposalGood = false;
		if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
			isProposalGood = true;
			console.log('Transaction proposal was good');
		} else {
			console.error('Transaction proposal was bad');
		}
		if (isProposalGood) {
			console.log(util.format(
				'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
				proposalResponses[0].response.status, proposalResponses[0].response.message));

			// build up the request for the orderer to have the transaction committed
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal
			};

			// set the transaction listener and set a timeout of 30 sec
			// if the transaction did not get committed within the timeout period,
			// report a TIMEOUT status
			var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
			var promises = [];
			var sendPromise = channel.sendTransaction(request);
			promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

			// get an eventhub once the fabric client has a user assigned. The user
			// is required bacause the event registration must be signed
			// let event_hub = fabric_client.newEventHub();
			let event_hub = channel.newChannelEventHub(peer);
			// event_hub.setPeerAddr('grpc://localhost:7053');
			// using resolve the promise so that result status may be processed
			// under the then clause rather than having the catch clause process
			// the status
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(() => {
					event_hub.disconnect();
					resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
				}, 3000);
				event_hub.connect();
				event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
					// this is the callback for transaction event status
					// first some clean up of event listener
					clearTimeout(handle);
					event_hub.unregisterTxEvent(transaction_id_string);
					event_hub.disconnect();
					// now let the application know what happened
					var return_status = { event_status: code, tx_id: transaction_id_string };
					if (code !== 'VALID') {
						console.error('The transaction was invalid, code = ' + code);
						resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
					} else {
						// console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
						resolve(return_status);
					}
				}, (err) => {
					//this is the callback if something goes wrong with the event registration or processing
					reject(new Error('There was a problem with the eventhub ::' + err));
				});
			});
			promises.push(txPromise);
			return Promise.all(promises);
		} else {
			console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
			res.send("Error: no tuna catch found");
			// throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	}).then((results) => {
		console.log('result', results);
		console.log('Send transaction promise and event listener promise have completed');
		// check the results in the order the promises were added to the promise all list
		if (results && results[0] && results[0].status === 'SUCCESS') {
			console.log('Successfully sent transaction to the orderer.');
		//	res.json(tx_id.getTransactionID())
	
		} else {
			// console.error('Failed to order the transaction. Error code: ' + response.status);
			res.send("Error: no tuna catch found");
		}

		if (results && results[1] && results[1].event_status === 'VALID') {
			console.log('Successfully committed the change to the ledger by the peer', results);
			if(tranaction.requestSource == 'mobile'){
				res.redirect('http://localhost:3000/mobile/success')
			}else if(tranaction.requestSource== 'web'){
				res.redirect('http://localhost:3000')
			}
			
			//res.json({ tx_id: tx_id.getTransactionID(), info: 'Transaction successful' })
		} else {
			console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
		}
	}).catch((err) => {
		console.error('Failed to invoke successfully :: ' + err);
		res.send("Error: no tuna catch found");
	});
	//console.log(res);
}

UserController.paySuccess = function (req, res) {
	// setup the fabric network
	const transectId = req.params.txid;

	//var json=JSON.stringify(res.req);
	//console.log('Transaction header---------->',res.headers['origin']);

	console.log('Payment Gateway Response -------->  ', req.body)
	//	console.log('Transaction ID ---------> ',transectId)
	var tranaction = null;
	let payumoneyResponse = req.body;


	let fabric_client = new Fabric_Client();
	var channel = fabric_client.newChannel('mychannel');
	var peer = fabric_client.newPeer('grpc://localhost:7051');
	channel.addPeer(peer);
	var order = fabric_client.newOrderer('grpc://localhost:7050')
	channel.addOrderer(order);

	var member_user = null;
	var store_path = path.join(os.homedir(), '.hfc-key-store');
	console.log('Store path:' + store_path);
	var tx_id = null;
	var refund = null;
	var refundAmount = 'NA';
	var handlingCharge = 'NA';
		ForceRefundSchema.findOne({ "txid": transectId }, (err, transect) => {

			if (err) {
				return res.json({ status: 500, success: false, info: "Error on the server" });
			}
			tranaction = transect;
			console.log('Transaction Details : ', transect)
		});

	Fabric_Client.newDefaultKeyValueStore({ path: store_path }).then((state_store) => {
		// assign the store to the fabric client
		fabric_client.setStateStore(state_store);
		var crypto_suite = Fabric_Client.newCryptoSuite();
		// use the same location for the state store (where the users' certificate are kept)
		// and the crypto store (where the users' keys are kept)
		var crypto_store = Fabric_Client.newCryptoKeyStore({ path: store_path });
		crypto_suite.setCryptoKeyStore(crypto_store);
		fabric_client.setCryptoSuite(crypto_suite);

		// get the enrolled user from persistence, this user will sign all requests
		return fabric_client.getUserContext('user1', true);
	}).then((user_from_store) => {
		if (user_from_store && user_from_store.isEnrolled()) {
			console.log('Successfully loaded user1 from persistence');
			member_user = user_from_store;
		} else {
			throw new Error('Failed to get user1.... run registerUser.js');
		}

		// get a transaction id object based on the current user assigned to fabric client
		tx_id = fabric_client.newTransactionID();
		console.log("Assigning transaction_id: ", tx_id._transaction_id);

			var request = {
				chaincodeId: 'policy-app',
				txId: tx_id,
				chainId: 'mychannel',
				fcn: 'rollRefund',
				args: [tranaction.key, tranaction.bookingId]
			};

		console.log('Backend Request ==============>', request);
		// send the transaction proposal to the peers
		return channel.sendTransactionProposal(request);
	}).then((results) => {
		var proposalResponses = results[0];
		var proposal = results[1];
		let isProposalGood = false;
		if (proposalResponses && proposalResponses[0].response && proposalResponses[0].response.status === 200) {
			isProposalGood = true;
			console.log('Transaction proposal was good');
		} else {
			console.error('Transaction proposal was bad');
		}
		if (isProposalGood) {
			console.log(util.format(
				'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
				proposalResponses[0].response.status, proposalResponses[0].response.message));

			// build up the request for the orderer to have the transaction committed
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal
			};

			// set the transaction listener and set a timeout of 30 sec
			// if the transaction did not get committed within the timeout period,
			// report a TIMEOUT status
			var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
			var promises = [];
			var sendPromise = channel.sendTransaction(request);
			promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

			// get an eventhub once the fabric client has a user assigned. The user
			// is required bacause the event registration must be signed
			// let event_hub = fabric_client.newEventHub();
			let event_hub = channel.newChannelEventHub(peer);
			// event_hub.setPeerAddr('grpc://localhost:7053');
			// using resolve the promise so that result status may be processed
			// under the then clause rather than having the catch clause process
			// the status
			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(() => {
					event_hub.disconnect();
					resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
				}, 3000);
				event_hub.connect();
				event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
					// this is the callback for transaction event status
					// first some clean up of event listener
					clearTimeout(handle);
					event_hub.unregisterTxEvent(transaction_id_string);
					event_hub.disconnect();
					// now let the application know what happened
					var return_status = { event_status: code, tx_id: transaction_id_string };
					if (code !== 'VALID') {
						console.error('The transaction was invalid, code = ' + code);
						resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
					} else {
						// console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
						resolve(return_status);
					}
				}, (err) => {
					//this is the callback if something goes wrong with the event registration or processing
					reject(new Error('There was a problem with the eventhub ::' + err));
				});
			});
			promises.push(txPromise);
			return Promise.all(promises);
		} else {
			console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
			res.send("Error: no tuna catch found");
			// throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
		}
	}).then((results) => {
		console.log('result', results);
		console.log('Send transaction promise and event listener promise have completed');
		// check the results in the order the promises were added to the promise all list
		if (results && results[0] && results[0].status === 'SUCCESS') {
			console.log('Successfully sent transaction to the orderer.');
		//	res.json(tx_id.getTransactionID())
	
		} else {
			// console.error('Failed to order the transaction. Error code: ' + response.status);
			res.send("Error: no tuna catch found");
		}

		 if (results && results[1] && results[1].event_status === 'VALID') {
			console.log('Successfully committed the change to the ledger by the peer', results);
			res.redirect('http://localhost:3000/')
			//res.json({ tx_id: tx_id.getTransactionID(), info: 'Transaction successful' })
		} else {
			console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
		}
	}).catch((err) => {
		console.error('Failed to invoke successfully :: ' + err);
		res.send("Error: no tuna catch found");
	});
	//console.log(res);
}

UserController.initpayFail = function (req, res) {
	console.log(res);
	res.redirect('http://localhost:3000')
}

UserController.payFail = function (req, res) {
	console.log(res);
	res.redirect('http://localhost:3000')
}

UserController.updateRefund = function (req, res) {
	const id = req.body.id;
	console.log(id);
    /*const updateOps={};
    for(const ops of req.body){
        updateOps[ops.propName] = ops.value;
    }*/
    /*"credit": "5566",
    "limit": "5000",
    "updatedbyCategory": "Admin",*/
	RefundGenerator.update({ _id: id }, { $set: { credit: req.body.credit, limit: req.body.limit, handlingCharge: req.body.handlingCharge, updatedbyCategory: req.body.updatedbyCategory } }, { upsert: true })
		.exec()
		.then(result => {
			//console.log(res);
			res.status(200).json({
				data: result,
				info: 'Successfully updated '
			}
			);
		}).catch(err => {
			error: err
			info: 'Error while updating refund'
		});
}
///refundGenerator/:id
UserController.getRefund = function (req, res) {
	//const id = req.params.id;
	RefundGenerator.find({ updatedbyCategory: 'Admin' }, function (err, doc) {
		console.log(doc);
		if (err) {
			resp.status(500).json({
				error: err
			});
		}
		return res.status(200).json(doc);
	});
	// RefundGenerator.findById(id).exec().then(doc => {

	// }).catch(err => {
	//     console.log(err);
	//     resp.status(500).json({
	//         error: err
	//     });
	// });
}
///refundGenerator/create
UserController.createRefund = function (req, resp) {
	const refundGenerator = new RefundGenerator({
		_id: new mongoose.Types.ObjectId(),
		credit: req.body.credit,
		limit: req.body.limit,
		updatedbyCategory: req.body.updatedbyCategory
	});
	refundGenerator.save().then(result => {
		console.log(result);
		resp.status(200).json({
			message: 'SUCCESS',
			createdRefund: result
		});
	}).catch(err => {
		console.log(err);
		resp.status(500).json({
			error: err
		});
	}
	);
}

//Update Preference Currency
UserController.updateCurrencyPreference = function (req, res) {
	let query = { _id: req.body.id };
	User.findByIdAndUpdate(query, { preferenceCurrency: req.body.preferenceCurrency }, function (err, result) {
		if (err) {
			return res.send(500, { error: err });
		} else {
			console.log('response update', result);
			return res.json({ result: result, info: "Currency Preference successfully updated" });
		}
	});
}

//Update Admin Phone Number
UserController.updateAdminPhone = function (req, res) {
	let id = req.body.id;
	User.findOne({ "_id": id }, (err, user) => {
		if (err) {
			return res.json({ status: 500, success: false, info: "Error on the server" });
		}
		if (!user) {
			return res.json({ status: 404, success: false, info: "No user found" });
		} else {
			let query = { _id: id };
			User.update(query, { phoneNumber: req.body.phoneNumber }, function (err) {
				if (err) {
					return res.send(500, { error: err });
				} else {

					console.log("Updated Phone Number is ...................>>>>>>>>>>", req.body.phoneNumber);
					return res.json({ info: "Successfully updated" });
				}
			});
		}
	});
}

//Refresh login
UserController.refreshLogin = function (req, res) {
	let email = req.body.email;
	User.findOne({ "email": email }, (err, user) => {
		if (err) {
			return res.json({ status: 500, success: false, info: "Error on the server" });
		}
		console.log('user login', user);

		let LoginUser = _.pick(user, ['_id', 'firstName', 'lastName', 'email', 'role', 'key', 'phoneNumber', 'userName', 'lastLogin', 'preferenceCurrency', 'created_at']);
		//create token
		let token = jwt.sign({ id: user._id }, key.secretKey.secret, { expiresIn: "1 days" });
		res.json({ status: 200, success: true, token: token, user: LoginUser });
	});
}

module.exports = UserController;
