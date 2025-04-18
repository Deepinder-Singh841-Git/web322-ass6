const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('./path-to-your-sequelize-config'); // Import your existing Sequelize instance

// Define User model
const User = sequelize.define('User', {
    userName: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true
        }
    }
}, {
    timestamps: true
});

// Define LoginHistory model
const LoginHistory = sequelize.define('LoginHistory', {
    dateTime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
    },
    userAgent: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

// Set up associations
User.hasMany(LoginHistory);
LoginHistory.belongsTo(User);

module.exports.initialize = async function() {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ alter: true }); // Use { force: true } only in development if you need to reset tables
        console.log('Authentication service initialized');
        return Promise.resolve();
    } catch (err) {
        console.error('Error initializing auth service:', err);
        return Promise.reject("Error initializing authentication service");
    }
};

module.exports.registerUser = function(userData) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!userData.userName || !userData.password || !userData.email) {
                return reject("Missing required fields");
            }

            const hashedPassword = await bcrypt.hash(userData.password, 10);
            const user = await User.create({
                userName: userData.userName,
                password: hashedPassword,
                email: userData.email
            });

            resolve(user);
        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') {
                if (err.errors.some(e => e.path === 'userName')) {
                    reject("Username already taken");
                } else if (err.errors.some(e => e.path === 'email')) {
                    reject("Email already registered");
                }
            } else {
                reject("Error creating user: " + err.message);
            }
        }
    });
};

module.exports.checkUser = function(userData) {
    return new Promise(async (resolve, reject) => {
        try {
            const user = await User.findOne({
                where: { userName: userData.userName },
                include: [LoginHistory]
            });

            if (!user) {
                return reject(`Unable to find user: ${userData.userName}`);
            }

            const match = await bcrypt.compare(userData.password, user.password);
            if (!match) {
                return reject("Incorrect password");
            }

            await LoginHistory.create({
                dateTime: new Date(),
                userAgent: userData.userAgent,
                UserId: user.id
            });

            resolve(user);
        } catch (err) {
            reject("Error verifying user: " + err.message);
        }
    });
};
