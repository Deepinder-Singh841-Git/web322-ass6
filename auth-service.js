const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Schema = mongoose.Schema;

let userSchema = new Schema({
    userName: { type: String, unique: true },
    password: String,
    email: String,
    loginHistory: [{
        dateTime: Date,
        userAgent: String
    }]
});

let User;

module.exports.initialize = function () {
    return new Promise(function (resolve, reject) {
        
        let db = mongoose.createConnection(
            "mongodb+srv://captainhero147:balebale%405002@cluster0.e5rvns3.mongodb.net/web322?retryWrites=true&w=majority",
            {
                useNewUrlParser: true,
                useUnifiedTopology: true
            }
        );

        db.on('error', (err) => {
            reject("MongoDB connection error: " + err);
        });

        db.once('open', () => {
            User = db.model("users", userSchema);
            resolve();
        });
    });
};

// Optional helper to register a user
module.exports.registerUser = function (userData) {
    return new Promise(async (resolve, reject) => {
        try {
            // Hash the password before saving
            const hashedPassword = await bcrypt.hash(userData.password, 10);
            const newUser = new User({
                userName: userData.userName,
                password: hashedPassword,
                email: userData.email,
                loginHistory: []
            });

            await newUser.save();
            resolve();
        } catch (err) {
            if (err.code === 11000) {
                reject("Username already taken");
            } else {
                reject("There was an error creating the user: " + err);
            }
        }
    });
};

// Optional helper to check login
module.exports.checkUser = function (userData) {
    return new Promise(async (resolve, reject) => {
        try {
            const user = await User.findOne({ userName: userData.userName });
            if (!user) return reject("Unable to find user: " + userData.userName);

            const match = await bcrypt.compare(userData.password, user.password);
            if (!match) return reject("Incorrect password");

            user.loginHistory.push({
                dateTime: new Date(),
                userAgent: userData.userAgent
            });

            await user.save();
            resolve(user);
        } catch (err) {
            reject("There was an error verifying the user: " + err);
        }
    });
};
