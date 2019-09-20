const User = require('../models/userSchema');
const bcrypt = require('bcryptjs');
const generator = require('generate-password');
const fs = require('fs');
const path = require('path');
const AdminController = {};


var generatePassword = function () {
  var password = generator.generate({
    length: 8,
    numbers: true,
    uppercase: true
  });
  return password;
}

AdminController.createAdmin = function (reqData) {
  let role = reqData.role;
  User.find({ "role": role }, (err, user) => {
    if (err) {
      console.log('Something went wrong');
    }
    if (user.length > 0) {
      console.log('Admin already exists');
    } else {
      let adminPassword = generatePassword();
      fs.writeFile(path.join(__dirname, 'password.txt'), adminPassword, (err) => {
        if (err) {
          console.log('error in generating folder')
        };
      });
      let encryptedPassword = bcrypt.hashSync(adminPassword, 8);
      let admindata = {
        userName: reqData.userName,
        firstName: reqData.firstName,
        lastName: reqData.lastName,
        email: reqData.email,
        phoneNumber: reqData.phoneNumber,
        password: encryptedPassword,
        role: reqData.role,
        key: reqData.key,
        category: reqData.category,
        preferenceCurrency: reqData.preferenceCurrency
      }
      User.create(admindata, (err, User) => {
        if (err) {
          console.log('Something went wrong. Unable to create admin', err);
        }
        console.log('Admin created')
        console.log('Admin Password', adminPassword);
      });
    }
  });
}

module.exports = AdminController;