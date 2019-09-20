const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const adminSchema = new Schema({
  firstName: {
    type: String,
    required: 'Enter a first name'
  },
  lastName: {
    type: String,
    required: 'Enter a last name'
  },
  email: {
    type: String,
    required: 'Enter a email'
  },
  phoneNumber: {
    type: Number,
    required: 'Enter a Number'
  },
  dob: {
    type: String,
    required: 'Enter a Date of birth'
  },
  password: {
    type: String,
    required: 'Enter a password'
  },
  role: {
    type: String,
    required: 'Please provide a role to user'
  },
  created_at: {
		type: Date,
		default: function () {
			return Date.now();
		}
	},
	updated_at: {
		type: Date,
		default: function () {
			return Date.now();
		}
	},
});

module.exports = mongoose.model('Admin', adminSchema);