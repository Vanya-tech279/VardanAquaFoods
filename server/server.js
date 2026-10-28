const { OAuth2Client } = require("google-auth-library");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const { v2: cloudinary } = require("cloudinary");
const multer = require("multer");
const createOrderRoutes = require("./orderRoutes");
const createLocationRoutes = require("./locationRoutes");
const createPaymentRoutes = require("./paymentRoutes");
const createAdminOrderRoutes = require("./adminOrderRoutes");
const startOrderExpiry = require("./orderExpiry");
require("dotenv").config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

let db;
let ordersCollection;
let customerAddressesCollection;
function normalizeProduct(product) {
    const variants =
        Array.isArray(product.variants) && product.variants.length > 0
            ? product.variants
            : [
                {
                    size: "S",
                    pricePerKg: Number(product.pricePerKg) || 0,
                    stockKg: Number(product.stockKg) || 0,
                    available:
                        Number(product.stockKg) > 0 &&
                        product.available !== false,
                },
            ];

    const normalizedVariants = variants.map((variant) => ({
        ...variant,
        size: String(variant.size).trim().toUpperCase(),
        pricePerKg: Number(variant.pricePerKg) || 0,
        stockKg: Number(variant.stockKg) || 0,
        available:
            variant.available ??
            (Number(variant.stockKg) > 0),
    }));

    return {
        ...product,
        variants: normalizedVariants,
        pricePerKg: product.pricePerKg ?? normalizedVariants[0].pricePerKg,
        stockKg:
            normalizedVariants.reduce(
                (total, variant) => total + variant.stockKg,
                0
            ),
        available: normalizedVariants.some(
            (variant) => variant.available && variant.stockKg > 0
        ),
    };
}

const customerGoogleClient = () =>
    new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function createCustomerToken(customer) {
    if (!process.env.CUSTOMER_JWT_SECRET) {
        throw new Error("CUSTOMER_JWT_SECRET is missing.");
    }

    return jwt.sign(
        {
            customerId: customer._id.toString(),
            role: "customer",
        },
        process.env.CUSTOMER_JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function publicCustomer(customer) {
    return {
        id: customer._id.toString(),
        name: customer.name,
        email: customer.email,
    };
}

function requireCustomer(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Customer authentication required.",
        });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(
            token,
            process.env.CUSTOMER_JWT_SECRET
        );

        if (
            decoded.role !== "customer" ||
            !decoded.customerId ||
            !ObjectId.isValid(decoded.customerId)
        ) {
            return res.status(403).json({
                success: false,
                message: "Customer access denied.",
            });
        }

        req.customerId = new ObjectId(decoded.customerId);
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired customer token.",
        });
    }
}

// Customer registration
app.post("/api/customers/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            password.length < 8 ||
            password.length > 128
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter your name, a valid email, and a password of 8–128 characters.",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (
            normalizedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid email address.",
            });
        }

        const customers = db.collection("customers");

        const existing = await customers.findOne({
            email: normalizedEmail,
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists. Please log in.",
            });
        }

        const customer = {
            name: name.trim(),
            email: normalizedEmail,
            passwordHash: await bcrypt.hash(password, 12),
            createdAt: new Date(),
        };

        const result = await customers.insertOne(customer);
        customer._id = result.insertedId;

        return res.status(201).json({
            success: true,
            token: createCustomerToken(customer),
            user: publicCustomer(customer),
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        console.error("Customer registration failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to register right now.",
        });
    }
});

// Customer email/password login
app.post("/api/customers/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
        }

        const customer = await db.collection("customers").findOne({
            email: email.trim().toLowerCase(),
        });

        if (
            !customer ||
            !customer.passwordHash ||
            !(await bcrypt.compare(password, customer.passwordHash))
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        return res.json({
            success: true,
            token: createCustomerToken(customer),
            user: publicCustomer(customer),
        });
    } catch (error) {
        console.error("Customer login failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to log in right now.",
        });
    }
});

// Customer Google sign-in
app.post("/api/customers/google", async (req, res) => {
    try {
        const { credential } = req.body;

        if (
            typeof credential !== "string" ||
            !credential ||
            !process.env.GOOGLE_CLIENT_ID
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid Google sign-in credential is required.",
            });
        }

        const ticket = await customerGoogleClient().verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        if (
            !payload ||
            !payload.sub ||
            !payload.email ||
            payload.email_verified !== true
        ) {
            return res.status(401).json({
                success: false,
                message: "Google account verification failed.",
            });
        }

        const customers = db.collection("customers");
        const email = payload.email.toLowerCase();

        let customer = await customers.findOne({
            googleSub: payload.sub,
        });

        if (!customer) {
            customer = await customers.findOne({ email });

            if (customer) {
                if (
                    customer.googleSub &&
                    customer.googleSub !== payload.sub
                ) {
                    return res.status(409).json({
                        success: false,
                        message: "This email is linked to another Google account.",
                    });
                }

                await customers.updateOne(
                    { _id: customer._id },
                    {
                        $set: {
                            googleSub: payload.sub,
                            updatedAt: new Date(),
                        },
                    }
                );

                customer.googleSub = payload.sub;
            } else {
                const newCustomer = {
                    name: payload.name || email.split("@")[0],
                    email,
                    googleSub: payload.sub,
                    createdAt: new Date(),
                };

                const result = await customers.insertOne(newCustomer);
                customer = {
                    ...newCustomer,
                    _id: result.insertedId,
                };
            }
        }

        return res.json({
            success: true,
            token: createCustomerToken(customer),
            user: publicCustomer(customer),
        });
    } catch (error) {
        console.error("Google customer login failed:", error.message);

        return res.status(401).json({
            success: false,
            message: "Google sign-in could not be verified. Please try again.",
        });
    }
});

// Admin login
app.post("/api/admin/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !username ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required.",
            });
        }

        if (
            username !== process.env.ADMIN_USERNAME ||
            !(await bcrypt.compare(
                password,
                process.env.ADMIN_PASSWORD_HASH || ""
            ))
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password.",
            });
        }

        const token = jwt.sign(
            { username, role: "admin" },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        res.json({
            success: true,
            message: "Admin login successful.",
            token,
            expiresIn: "2h",
        });
    } catch (error) {
        console.error("Admin login failed:", error.message);

        res.status(500).json({
            success: false,
            message: "Unable to log in right now.",
        });
    }
});
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Admin authentication required.",
        });
    }

    const token = authHeader.slice(7);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin access denied.",
            });
        }

        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired login token.",
        });
    }
}

// Upload product image to Cloudinary
app.post(
    "/api/uploads",
    requireAdmin,
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Please select an image.",
                });
            }

            if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) {
                return res.status(400).json({
                    success: false,
                    message: "Only JPG, PNG, and WebP images are allowed.",
                });
            }

            const result = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: "vardan-aqua-foods/products",
                        resource_type: "image",
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );

                stream.end(req.file.buffer);
            });

            res.json({
                success: true,
                imageUrl: result.secure_url,
                publicId: result.public_id,
            });
        } catch (error) {
            console.error("Image upload failed:", error.message);
            res.status(500).json({
                success: false,
                message: "Image upload failed. Please try again.",
            });
        }
    }
);

// Fetch all products from MongoDB
app.get("/api/products", async (req, res) => {
    try {
        const products = await db
            .collection("products")
            .find({})
            .sort({ name: 1 })
            .toArray();

        res.json(products.map(normalizeProduct));
    } catch (error) {
        console.error("Fetch products error:", error);
        res.status(500).json({ message: "Failed to fetch products" });
    }
});

app.get("/api/addresses/my", requireCustomer, async (req, res) => {
    try {
        const addresses = await customerAddressesCollection
            .find({ customerId: req.customerId })
            .sort({ createdAt: -1 })
            .toArray();

        return res.json({
            success: true,
            addresses,
        });
    } catch (error) {
        console.error("Fetch customer addresses failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch your saved addresses.",
        });
    }
});

// ---------- Address helpers ----------

// Cleans and checks the text fields of an address.
// Returns { address } when valid, or { error } when not.
function cleanAddressInput(body) {
    const text = (value) => (typeof value === "string" ? value.trim() : "");

    const address = {
        label: text(body?.label) || "Home",
        recipientName: text(body?.recipientName),
        phone: text(body?.phone),
        houseNumber: text(body?.houseNumber),
        street: text(body?.street),
        locality: text(body?.locality),
        city: text(body?.city),
        state: text(body?.state),
        pinCode: text(String(body?.pinCode ?? "")),
        landmark: text(body?.landmark),
    };

    const requiredFields = [
        "recipientName",
        "houseNumber",
        "street",
        "locality",
        "city",
        "state",
    ];

    if (requiredFields.some((field) => !address[field])) {
        return { error: "Please fill in all required address details." };
    }

    if (!/^\d{10}$/.test(address.phone)) {
        return { error: "Enter a valid 10-digit phone number." };
    }

    if (!/^\d{6}$/.test(address.pinCode)) {
        return { error: "Enter a valid 6-digit PIN code." };
    }

    if (Object.values(address).some((value) => value.length > 120)) {
        return { error: "One of the address fields is too long." };
    }

    return { address };
}

// Checks GPS coordinates sent by the browser.
// Returns { latitude, longitude } or null when missing or invalid.
function parseCoordinates(latitude, longitude) {
    if (
        latitude === undefined ||
        latitude === null ||
        latitude === "" ||
        longitude === undefined ||
        longitude === null ||
        longitude === ""
    ) {
        return null;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
    ) {
        return null;
    }

    return { latitude: lat, longitude: lng };
}

// True when the browser sent coordinates (valid or not).
function coordinatesWereSent(body) {
    return (
        body?.latitude !== undefined &&
        body?.latitude !== null &&
        body?.latitude !== ""
    ) || (
            body?.longitude !== undefined &&
            body?.longitude !== null &&
            body?.longitude !== ""
        );
}

// ---------- Address helpers ----------

// Cleans and checks the text fields of an address.
// Returns { address } when valid, or { error } when not.
function cleanAddressInput(body) {
    const text = (value) => (typeof value === "string" ? value.trim() : "");

    const address = {
        label: text(body?.label) || "Home",
        recipientName: text(body?.recipientName),
        phone: text(body?.phone),
        houseNumber: text(body?.houseNumber),
        street: text(body?.street),
        locality: text(body?.locality),
        city: text(body?.city),
        state: text(body?.state),
        pinCode: text(String(body?.pinCode ?? "")),
        landmark: text(body?.landmark),
    };

    const requiredFields = [
        "recipientName",
        "houseNumber",
        "street",
        "locality",
        "city",
        "state",
    ];

    if (requiredFields.some((field) => !address[field])) {
        return { error: "Please fill in all required address details." };
    }

    if (!/^\d{10}$/.test(address.phone)) {
        return { error: "Enter a valid 10-digit phone number." };
    }

    if (!/^\d{6}$/.test(address.pinCode)) {
        return { error: "Enter a valid 6-digit PIN code." };
    }

    if (Object.values(address).some((value) => value.length > 120)) {
        return { error: "One of the address fields is too long." };
    }

    return { address };
}

// Checks GPS coordinates sent by the browser.
// Returns { latitude, longitude } or null when missing or invalid.
function parseCoordinates(latitude, longitude) {
    if (
        latitude === undefined ||
        latitude === null ||
        latitude === "" ||
        longitude === undefined ||
        longitude === null ||
        longitude === ""
    ) {
        return null;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
    ) {
        return null;
    }

    return { latitude: lat, longitude: lng };
}

// True when the browser sent coordinates (valid or not).
function coordinatesWereSent(body) {
    return (
        body?.latitude !== undefined &&
        body?.latitude !== null &&
        body?.latitude !== ""
    ) || (
            body?.longitude !== undefined &&
            body?.longitude !== null &&
            body?.longitude !== ""
        );
}

// Save a new address
app.post("/api/addresses", requireCustomer, async (req, res) => {
    try {
        const cleaned = cleanAddressInput(req.body);

        if (cleaned.error) {
            return res.status(400).json({
                success: false,
                message: cleaned.error,
            });
        }

        let coordinates = { latitude: null, longitude: null };

        if (coordinatesWereSent(req.body)) {
            const parsed = parseCoordinates(
                req.body.latitude,
                req.body.longitude
            );

            if (!parsed) {
                return res.status(400).json({
                    success: false,
                    message: "The location coordinates are not valid.",
                });
            }

            coordinates = parsed;
        }

        const address = {
            customerId: req.customerId,
            ...cleaned.address,
            ...coordinates,
            isDefault: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await customerAddressesCollection.insertOne(address);

        return res.status(201).json({
            success: true,
            message: "Address saved successfully.",
            address: {
                ...address,
                _id: result.insertedId,
            },
        });
    } catch (error) {
        console.error("Save customer address failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to save your address.",
        });
    }
});

// Update an existing address
app.patch("/api/addresses/:id", requireCustomer, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid address ID.",
            });
        }

        const cleaned = cleanAddressInput(req.body);

        if (cleaned.error) {
            return res.status(400).json({
                success: false,
                message: cleaned.error,
            });
        }

        const updates = {
            ...cleaned.address,
            updatedAt: new Date(),
        };

        // Coordinates are updated only when the browser sends them.
        if (coordinatesWereSent(req.body)) {
            const parsed = parseCoordinates(
                req.body.latitude,
                req.body.longitude
            );

            if (!parsed) {
                return res.status(400).json({
                    success: false,
                    message: "The location coordinates are not valid.",
                });
            }

            updates.latitude = parsed.latitude;
            updates.longitude = parsed.longitude;
        }

        const result = await customerAddressesCollection.updateOne(
            {
                _id: new ObjectId(id),
                customerId: req.customerId,
            },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Address not found.",
            });
        }

        return res.json({
            success: true,
            message: "Address updated successfully.",
        });
    } catch (error) {
        console.error("Update customer address failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to update your address.",
        });
    }
});
app.delete("/api/addresses/:id", requireCustomer, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid address ID.",
            });
        }

        const result = await customerAddressesCollection.deleteOne({
            _id: new ObjectId(id),
            customerId: req.customerId,
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Address not found.",
            });
        }

        return res.json({
            success: true,
            message: "Address deleted successfully.",
        });
    } catch (error) {
        console.error("Delete customer address failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to delete your address.",
        });
    }
});


app.get("/api/orders/my", requireCustomer, async (req, res) => {
    try {
        const orders = await ordersCollection
            .find({ customerId: req.customerId })
            .sort({ createdAt: -1 })
            .toArray();

        return res.json({
            success: true,
            orders,
        });
    } catch (error) {
        console.error("Fetch customer orders failed:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch your orders.",
        });
    }
});
app.use(createOrderRoutes({ getDb: () => db, requireCustomer }));
app.use(createLocationRoutes());
app.use(createPaymentRoutes({ getDb: () => db, requireCustomer }));
app.use(createAdminOrderRoutes({ getDb: () => db, requireAdmin }));
// Add a new product


app.post("/api/products", requireAdmin, async (req, res) => {
    try {
        const {
            name,
            category,
            pricePerKg,
            stockKg,
            imageUrl,
            variants,
        } = req.body;

        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof category !== "string" ||
            !category.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid name and category.",
            });
        }

        // Support both the existing form and the new variants format.
        let normalizedVariants;

        if (variants !== undefined) {
            if (
                !Array.isArray(variants) ||
                variants.length === 0 ||
                variants.some(
                    (variant) =>
                        !variant ||
                        typeof variant.size !== "string" ||
                        !variant.size.trim() ||
                        typeof variant.pricePerKg !== "number" ||
                        !Number.isFinite(variant.pricePerKg) ||
                        variant.pricePerKg < 0 ||
                        typeof variant.stockKg !== "number" ||
                        !Number.isFinite(variant.stockKg) ||
                        variant.stockKg < 0
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Each variant needs a size, valid price, and valid stock.",
                });
            }

            const sizes = variants.map((variant) =>
                variant.size.trim().toUpperCase()
            );

            if (new Set(sizes).size !== sizes.length) {
                return res.status(400).json({
                    success: false,
                    message: "Variant sizes must be unique.",
                });
            }

            normalizedVariants = variants.map((variant) => ({
                size: variant.size.trim().toUpperCase(),
                pricePerKg: variant.pricePerKg,
                stockKg: variant.stockKg,
            }));
        } else {
            if (
                typeof pricePerKg !== "number" ||
                !Number.isFinite(pricePerKg) ||
                pricePerKg < 0 ||
                typeof stockKg !== "number" ||
                !Number.isFinite(stockKg) ||
                stockKg < 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Provide a valid price and stock, or valid product variants.",
                });
            }

            normalizedVariants = [
                {
                    size: "S",
                    pricePerKg,
                    stockKg,
                },
            ];
        }

        if (
            imageUrl !== undefined &&
            (typeof imageUrl !== "string" ||
                (imageUrl !== "" &&
                    (!imageUrl.startsWith("https://res.cloudinary.com/") ||
                        imageUrl.length > 2048)))
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid Cloudinary image URL.",
            });
        }

        const totalStock = normalizedVariants.reduce(
            (total, variant) => total + variant.stockKg,
            0
        );

        const product = {
            name: name.trim(),
            category: category.trim(),
            variants: normalizedVariants,

            // Keep legacy fields for compatibility with the current frontend.
            pricePerKg: normalizedVariants[0].pricePerKg,
            stockKg: totalStock,

            imageUrl: imageUrl || "",
            available: totalStock > 0,
            createdAt: new Date(),
        };

        const result = await db.collection("products").insertOne(product);

        res.status(201).json({
            success: true,
            product: normalizeProduct({
                _id: result.insertedId,
                ...product,
            }),
        });
    } catch (error) {
        console.error("Failed to add product:", error.message);
        res.status(500).json({
            success: false,
            message: "Unable to add product.",
        });
    }
});




app.patch("/api/products/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {};

        const {
            name,
            category,
            pricePerKg,
            stockKg,
            imageUrl,
            available,
            variants,
        } = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID.",
            });
        }

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Product name cannot be empty.",
                });
            }
            updates.name = name.trim();
        }

        if (category !== undefined) {
            if (typeof category !== "string" || !category.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Category cannot be empty.",
                });
            }
            updates.category = category.trim();
        }

        // Update all variants together when the variants array is supplied.

        if (variants !== undefined) {
            if (
                !Array.isArray(variants) ||
                variants.length === 0 ||
                variants.some(
                    (variant) =>
                        !variant ||
                        typeof variant.size !== "string" ||
                        !variant.size.trim() ||
                        typeof variant.pricePerKg !== "number" ||
                        !Number.isFinite(variant.pricePerKg) ||
                        variant.pricePerKg < 0 ||
                        typeof variant.stockKg !== "number" ||
                        !Number.isFinite(variant.stockKg) ||
                        variant.stockKg < 0 ||
                        (variant.available !== undefined &&
                            typeof variant.available !== "boolean")
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Each variant needs a size, valid price, valid stock, and valid availability.",
                });
            }

            const normalizedVariants = variants.map((variant) => ({
                size: variant.size.trim().toUpperCase(),
                pricePerKg: variant.pricePerKg,
                stockKg: variant.stockKg,
                available:
                    variant.available ?? variant.stockKg > 0,
            }));

            const sizes = normalizedVariants.map((variant) => variant.size);

            if (new Set(sizes).size !== sizes.length) {
                return res.status(400).json({
                    success: false,
                    message: "Variant sizes must be unique.",
                });
            }

            const totalStock = normalizedVariants.reduce(
                (total, variant) => total + variant.stockKg,
                0
            );

            updates.variants = normalizedVariants;
            updates.pricePerKg = normalizedVariants[0].pricePerKg;
            updates.stockKg = totalStock;
            updates.available = normalizedVariants.some(
                (variant) => variant.available && variant.stockKg > 0
            );
        } else {
            // Backward compatibility with the existing admin form.
            if (pricePerKg !== undefined) {
                if (
                    typeof pricePerKg !== "number" ||
                    !Number.isFinite(pricePerKg) ||
                    pricePerKg < 0
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "Price must be a non-negative number.",
                    });
                }
                updates.pricePerKg = pricePerKg;
            }

            if (stockKg !== undefined) {
                if (
                    typeof stockKg !== "number" ||
                    !Number.isFinite(stockKg) ||
                    stockKg < 0
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "Stock must be a non-negative number.",
                    });
                }
                updates.stockKg = stockKg;
            }

            if (pricePerKg !== undefined || stockKg !== undefined) {
                const existing = await db.collection("products").findOne({
                    _id: new ObjectId(id),
                });

                if (!existing) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found.",
                    });
                }

                const currentVariants = normalizeProduct(existing).variants;

                if (currentVariants.length === 1) {
                    const current = currentVariants[0];

                    updates.variants = [
                        {
                            ...current,
                            pricePerKg:
                                pricePerKg !== undefined
                                    ? pricePerKg
                                    : current.pricePerKg,
                            stockKg:
                                stockKg !== undefined
                                    ? stockKg
                                    : current.stockKg,
                            available:
                                stockKg !== undefined
                                    ? stockKg > 0 && current.available
                                    : current.available,
                        },
                    ];
                }

                if (stockKg !== undefined) {
                    updates.available = stockKg > 0;
                }
            }

            if (available !== undefined && stockKg === undefined) {
                if (typeof available !== "boolean") {
                    return res.status(400).json({
                        success: false,
                        message: "Availability must be true or false.",
                    });
                }

                // The customer website reads availability from each SIZE, so
                // the switch must be applied to every size, not just the product.
                const existing = await db.collection("products").findOne({
                    _id: new ObjectId(id),
                });

                if (!existing) {
                    return res.status(404).json({
                        success: false,
                        message: "Product not found.",
                    });
                }

                const baseVariants =
                    updates.variants || normalizeProduct(existing).variants;

                updates.variants = baseVariants.map((variant) => ({
                    ...variant,
                    available,
                }));
                updates.available =
                    available &&
                    updates.variants.some((variant) => variant.stockKg > 0);
            }
        }


        if (imageUrl !== undefined) {
            if (
                typeof imageUrl !== "string" ||
                (imageUrl !== "" &&
                    (!imageUrl.startsWith("https://res.cloudinary.com/") ||
                        imageUrl.length > 2048))
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid Cloudinary image URL.",
                });
            }
            updates.imageUrl = imageUrl;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one field to update.",
            });
        }

        const result = await db.collection("products").updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found.",
            });
        }

        const updatedProduct = await db.collection("products").findOne({
            _id: new ObjectId(id),
        });

        res.json({
            success: true,
            message: "Product updated successfully.",
            product: normalizeProduct(updatedProduct),
        });
    } catch (error) {
        console.error("Failed to update product:", error.message);
        res.status(500).json({
            success: false,
            message: "Unable to update product.",
        });
    }
});


app.delete("/api/products/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID.",
            });
        }

        const result = await db.collection("products").deleteOne({
            _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found.",
            });
        }

        res.json({
            success: true,
            message: "Product deleted successfully.",
        });
    } catch (error) {
        console.error("Failed to delete product:", error.message);

        res.status(500).json({
            success: false,
            message: "Unable to delete product.",
        });
    }
});


app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "VARDAN AQUA FOODS API is running!",
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        database: db ? "connected" : "not connected",
    });
});

async function startServer() {
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI is missing from server/.env");
    }

    const client = new MongoClient(process.env.MONGODB_URI);

    await client.connect();

    db = client.db("vardan_aqua_foods");
    ordersCollection = db.collection("orders");
    customerAddressesCollection = db.collection("customer_addresses");
    console.log("MongoDB connected successfully!");
    startOrderExpiry({ getDb: () => db });
    app.listen(PORT, () => {
        console.log(`API running at http://localhost:${PORT}`);
    });
}

startServer().catch((error) => {
    console.error("Failed to start backend:", error.message);
    process.exit(1);
});
