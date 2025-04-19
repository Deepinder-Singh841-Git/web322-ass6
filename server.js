//Name: Deepinder Singh
//Student ID: 159466234
//Date: 2021-08-15
//Purpose: Assignment 4
//class: web322 NII
//github: https://github.com/Deepinder-Singh841-Git/web322-Ass5.git
//vercel: https://web322-ass5-hakj.vercel.app/

require('dotenv').config();
require('pg');
const authData = require('./auth-service.js');
const express = require('express');
const path = require('path');
const storeService = require('./store-service');
const multer = require("multer");
const expHBS = require('express-handlebars');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const Handlebars = require('handlebars');
const clientSessions = require("client-sessions");

const app = express();
const HTTP_PORT = process.env.PORT || 8080;

const hbs = expHBS.create({
    extname: '.hbs',
    defaultLayout: 'main',
    helpers: {
        navLink: function (url, options) {
            return '<li' + ((url == app.locals.activeRoute) ? ' class="active"' : '') + '><a href="' + url + '">' + options.fn(this) + '</a></li>';
        },
        equal: function (lvalue, rvalue, options) {
            if (arguments.length < 3) throw new Error("Handlebars Helper equal needs 2 parameters");
            return (lvalue != rvalue) ? options.inverse(this) : options.fn(this);
        },
        safeHTML: function (html) {
            return new Handlebars.SafeString(html);
        },
        formatDate: function (dateObj) {
            if (!dateObj) return '';
            let year = dateObj.getFullYear();
            let month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            let day = dateObj.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        },
        truncate: function (str, len) {
            if (str.length > len) {
                return str.substring(0, len) + '...';
            }
            return str;
        }
    }
});

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME || 'dfst9j74g',
    api_key: process.env.CLOUDINARY_KEY || '332178947425628',
    api_secret: process.env.CLOUDINARY_SECRET || 'y7M6d7_J5Feh4jbgowjFyOT4pw8',
    secure: true
});

const upload = multer();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(function (req, res, next) {
    let route = req.path.substring(1);
    app.locals.activeRoute = '/' + (isNaN(route.split('/')[1]) ? route.replace(/\/(?!.*)/, '') : route.replace(/\/(.*)/, ''));
    app.locals.viewingCategory = req.query.category;
    next();
});

app.use(clientSessions({
    cookieName: "session",
    secret: process.env.SESSION_SECRET || "superSecretNovel123", 
    duration: 24 * 60 * 60 * 1000, 
    activeDuration: 1000 * 60 * 5,
    cookie: {
        ephemeral: false, 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production' 
    }
}));

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

function ensureLogin(req, res, next) {
    if (!req.session.user) {
        res.redirect("/login");
    } else {
        next();
    }
}

app.get('/', async (req, res) => {
    try {
        const featuredItems = await storeService.getPublishedItems();
        res.render('home', { featuredItems: featuredItems.slice(0, 3) });
    } catch (err) {
        res.render('home', { featuredItems: [], message: "Error loading featured items" });
    }
});

app.get('/about', (req, res) => {
    res.render('about');
});

app.get("/shop", async (req, res) => {
    let viewData = {};
    try {
        let items = req.query.category ? await storeService.getPublishedItemsByCategory(req.query.category) : await storeService.getPublishedItems();
        items.sort((a, b) => new Date(b.postDate) - new Date(a.postDate));
        let item = items[0];
        viewData.items = items;
        viewData.post = item;
    } catch (err) {
        viewData.message = "No results";
    }

    try {
        let categories = await storeService.getCategories();
        viewData.categories = categories;
    } catch (err) {
        viewData.categoriesMessage = "No results";
    }

    res.render("shop", { data: viewData });
});

app.get('/shop/:id', async (req, res) => {
    let viewData = {};
    try {
        let items = req.query.category ? await storeService.getPublishedItemsByCategory(req.query.category) : await storeService.getPublishedItems();
        items.sort((a, b) => new Date(b.postDate) - new Date(a.postDate));
        viewData.items = items;
    } catch (err) {
        viewData.message = "No results";
    }

    try {
        viewData.post = await storeService.getItemById(req.params.id);
    } catch (err) {
        viewData.message = "No results";
    }

    try {
        let categories = await storeService.getCategories();
        viewData.categories = categories;
    } catch (err) {
        viewData.categoriesMessage = "No results";
    }

    res.render("shop", { data: viewData });
});

app.get('/items', ensureLogin, async (req, res) => {
    try {
        const items = await storeService.getAllItems();
        console.log('Retrieved items:', items); // Add this for debugging
        res.render('items', { 
            items: items,
            categories: await storeService.getCategories() // If needed for your view
        });
    } catch (err) {
        console.error('Error fetching items:', err);
        res.render('items', { 
            items: [],
            message: "Error loading items"
        });
    }
});

app.get("/items/add", ensureLogin, async (req, res) => {
    try {
        const categories = await storeService.getCategories();
        res.render("addPost", { categories });
    } catch (err) {
        res.render("addPost", { categories: [] });
    }
});

app.post("/items/add", ensureLogin, upload.single("featureImage"), async (req, res) => {
    try {
        console.log('Received item data:', req.body);
        
        // Handle image upload
        let imageUrl = "";
        if (req.file) {
            console.log('Processing file upload');
            const uploaded = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'items' }, // Add folder for organization
                    (error, result) => error ? reject(error) : resolve(result)
                );
                streamifier.createReadStream(req.file.buffer).pipe(stream);
            });
            imageUrl = uploaded.secure_url;
            console.log('Image uploaded to:', imageUrl);
        }

        // Prepare item data
        const itemData = {
            ...req.body,
            featureImage: imageUrl,
            postDate: new Date(),
            published: req.body.published === 'on',
            price: parseFloat(req.body.price)
        };

        console.log('Final item data:', itemData);
        
        // Add to database
        const newItem = await storeService.addItem(itemData);
        console.log('Item created with ID:', newItem.id);
        
        // Verify the item exists
        const createdItem = await storeService.getItemById(newItem.id);
        console.log('Verified item:', createdItem);
        
        res.redirect("/items");
        
    } catch (err) {
        console.error('Error adding item:', err);
        try {
            const categories = await storeService.getCategories();
            res.render("addPost", {
                categories,
                errorMessage: "Failed to add item. Please try again.",
                formData: req.body // Preserve form input
            });
        } catch (categoriesError) {
            res.status(500).render("addPost", {
                categories: [],
                errorMessage: "System error"
            });
        }
    }
});

app.get("/items/delete/:id", ensureLogin, async (req, res) => {
    try {
        await storeService.deletePostById(req.params.id);
        res.redirect("/items");
    } catch (err) {
        res.status(500).send("Unable to Remove Post / Post not found");
    }
});

app.get('/categories', ensureLogin, async (req, res) => {
    try {
        const categories = await storeService.getCategories();
        res.render('categories', { categories: categories });
    } catch (err) {
        res.render('categories', { message: "No results" });
    }
});

app.get('/categories/add', ensureLogin, (req, res) => {
    res.render('addCategory');
});

app.post('/categories/add', ensureLogin, (req, res) => {
    storeService.addCategory(req.body)
        .then(() => res.redirect('/categories'))
        .catch(err => res.status(500).send("Unable to add category"));
});

app.get('/categories/delete/:id', ensureLogin, (req, res) => {
    storeService.deleteCategoryById(req.params.id)
        .then(() => res.redirect('/categories'))
        .catch(err => res.status(500).send("Unable to remove category"));
});

app.get('/login', (req, res) => {
    res.render('login', { 
        errorMessage: null, 
        userName: '',
        active: 'login'
    });
});

app.post('/login', async (req, res) => {
    try {
        req.body.userAgent = req.get('User-Agent');
        const user = await authData.checkUser(req.body);

        req.session.user = {
            userName: user.userName,
            email: user.email,
            loginHistory: user.loginHistory || []
        };

        res.redirect('/items');
    } catch (err) {
        res.render('login', { 
            errorMessage: err.message || 'Login failed', 
            userName: req.body.userName 
        });
    }
});

app.get('/register', (req, res) => {
    res.render('register', { 
        errorMessage: null, 
        successMessage: null, 
        userName: '',
        active: 'register'
    });
});

app.post('/register', async (req, res) => {
    try {
        if (!req.body.userName || !req.body.password || !req.body.email) {
            throw new Error('All fields are required');
        }
        
        if (req.body.password !== req.body.confirmPassword) {
            throw new Error('Passwords do not match');
        }

        await authData.registerUser(req.body);
        
        res.render('register', { 
            successMessage: "User created successfully!", 
            errorMessage: null, 
            userName: '' 
        });
    } catch (err) {
        res.render('register', { 
            errorMessage: err.message, 
            userName: req.body.userName, 
            successMessage: null 
        });
    }
});

app.get('/logout', (req, res) => {
    req.session.reset();
    res.clearCookie('session');
    res.redirect('/');
});
app.get('/userHistory', ensureLogin, (req, res) => {
    res.render('userHistory');
});

app.use((req, res) => {
    res.status(404).render("404");
});

storeService.initialize()
    .then(authData.initialize)
    .then(() => {
        app.listen(HTTP_PORT, () => {
            console.log("Server running on port: " + HTTP_PORT);
        });
    }).catch(err => {
        console.log("Unable to start server: " + err);
    });
module.exports = app;
