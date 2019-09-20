const config = {}

config.secretKey = {
    'secret' : 'supersecret'
}

config.defaultAdmin = {
    "userName": "admin",
    "firstName" : "Admin",
    "lastName" : "admin",
    "email" : "admin@psqit.com",
    "phoneNumber" : "123456789",
    "preferenceCurrency" : "INR",
    "role": "Admin",
    "category" : "Admin"

}

config.upload = {
    base: '/home/psq/blockchain/docs'
}

module.exports = config;