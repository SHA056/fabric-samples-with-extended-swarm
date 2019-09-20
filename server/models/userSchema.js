const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const userSchema = new Schema({
    userName: {
        type: String,
        required: 'Enter a first name'

    },
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
    password: {
        type: String,
        required: 'Enter a password'
    },
    role: {
        type: String,
        required: 'Please provide a role to user'
    },
    key: {
        type: Number,
    },
    category: {
        type: String,
        required: 'Enter a category'
    },
    lastLogin: {
        type: Date,
        default: null
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
    reset_password_token: {
        type: String
    },
    reset_password_expires: {
        type: Date
    },
    preferenceCurrency: {
        type: String,
        required: 'Enter preference currency'
    }
});

module.exports = mongoose.model('User', userSchema);
// export const User = mongoose.model('User', userSchema);