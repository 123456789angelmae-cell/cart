const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const DB_URL = 'mongodb+srv://raven:12345@test.q3j1urd.mongodb.net/Cart';
const JWT_SECRET = '12345';

mongoose.connect(DB_URL)
    .then(() => console.log('✓ Cart Server Connected to Database'))
    .catch(err => console.log('✗ Database Error:', err));

// Cart Schema
const cartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        sku: String,
        name: String,
        quantity: { type: Number, required: true, default: 1 },
        unitPrice: Number,
        totalPrice: Number
    }],
    totalAmount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountCode: String,
    finalAmount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

// Wishlist Schema
const wishlistSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        sku: String,
        name: String,
        unitPrice: Number,
        addedAt: { type: Date, default: Date.now }
    }],
    updatedAt: { type: Date, default: Date.now }
});

// Saved Cart Schema (for "Save for Later")
const savedCartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: String,
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        sku: String,
        name: String,
        quantity: Number,
        unitPrice: Number,
        totalPrice: Number
    }],
    totalAmount: Number,
    savedAt: { type: Date, default: Date.now }
});

const Cart = mongoose.model('Cart', cartSchema);
const Wishlist = mongoose.model('Wishlist', wishlistSchema);
const SavedCart = mongoose.model('SavedCart', savedCartSchema);

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(403).json({
            success: false,
            message: 'No token provided'
        });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        req.userId = decoded.id;
        next();
    });
};

// Simple discount codes (for demo purposes)
const discountCodes = {
    'SAVE10': 0.10,
    'SAVE20': 0.20,
    'WELCOME': 0.15,
    'FIRSTORDER': 0.25
};

// ============================================
// CART ENDPOINTS
// ============================================

// Get user's cart
app.get('/api/cart', verifyToken, async (req, res) => {
    try {
        let cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            cart = new Cart({ userId: req.userId, items: [], totalAmount: 0 });
            await cart.save();
        }
        
        res.json({
            success: true,
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get cart item count
app.get('/api/cart/count', verifyToken, async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.userId });
        
        const count = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
        
        res.json({
            success: true,
            count: count
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add item to cart
app.post('/api/cart/add', verifyToken, async (req, res) => {
    try {
        const { productId, sku, name, quantity, unitPrice } = req.body;
        
        let cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            cart = new Cart({ userId: req.userId, items: [] });
        }
        
        const existingItemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId
        );
        
        if (existingItemIndex > -1) {
            cart.items[existingItemIndex].quantity += quantity;
            cart.items[existingItemIndex].totalPrice = 
                cart.items[existingItemIndex].quantity * unitPrice;
        } else {
            cart.items.push({
                productId,
                sku,
                name,
                quantity,
                unitPrice,
                totalPrice: quantity * unitPrice
            });
        }
        
        cart.totalAmount = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.finalAmount = cart.totalAmount - cart.discount;
        cart.updatedAt = Date.now();
        
        await cart.save();
        
        res.json({
            success: true,
            message: 'Item added to cart',
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Update cart item quantity
app.put('/api/cart/update/:productId', verifyToken, async (req, res) => {
    try {
        const { quantity } = req.body;
        const { productId } = req.params;
        
        const cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        const itemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId
        );
        
        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }
        
        if (quantity <= 0) {
            cart.items.splice(itemIndex, 1);
        } else {
            cart.items[itemIndex].quantity = quantity;
            cart.items[itemIndex].totalPrice = 
                quantity * cart.items[itemIndex].unitPrice;
        }
        
        cart.totalAmount = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.finalAmount = cart.totalAmount - cart.discount;
        cart.updatedAt = Date.now();
        
        await cart.save();
        
        res.json({
            success: true,
            message: 'Cart updated',
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Remove item from cart
app.delete('/api/cart/remove/:productId', verifyToken, async (req, res) => {
    try {
        const { productId } = req.params;
        
        const cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        cart.items = cart.items.filter(
            item => item.productId.toString() !== productId
        );
        
        cart.totalAmount = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.finalAmount = cart.totalAmount - cart.discount;
        cart.updatedAt = Date.now();
        
        await cart.save();
        
        res.json({
            success: true,
            message: 'Item removed from cart',
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Apply discount code
app.post('/api/cart/apply-discount', verifyToken, async (req, res) => {
    try {
        const { code } = req.body;
        
        const cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        const discountRate = discountCodes[code.toUpperCase()];
        
        if (!discountRate) {
            return res.status(400).json({
                success: false,
                message: 'Invalid discount code'
            });
        }
        
        cart.discount = cart.totalAmount * discountRate;
        cart.discountCode = code.toUpperCase();
        cart.finalAmount = cart.totalAmount - cart.discount;
        cart.updatedAt = Date.now();
        
        await cart.save();
        
        res.json({
            success: true,
            message: 'Discount applied successfully',
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Remove discount
app.delete('/api/cart/remove-discount', verifyToken, async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        cart.discount = 0;
        cart.discountCode = undefined;
        cart.finalAmount = cart.totalAmount;
        cart.updatedAt = Date.now();
        
        await cart.save();
        
        res.json({
            success: true,
            message: 'Discount removed',
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Validate cart (check stock availability)
app.post('/api/cart/validate', verifyToken, async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }
        
        // In a real app, you'd check against product inventory
        // For demo, we'll assume all items are available
        const unavailableItems = [];
        
        res.json({
            success: true,
            message: unavailableItems.length === 0 ? 'Cart is valid' : 'Some items are unavailable',
            isValid: unavailableItems.length === 0,
            unavailableItems
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Save cart for later
app.post('/api/cart/save', verifyToken, async (req, res) => {
    try {
        const { name } = req.body;
        
        const cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }
        
        const savedCart = new SavedCart({
            userId: req.userId,
            name: name || `Saved Cart ${Date.now()}`,
            items: cart.items,
            totalAmount: cart.totalAmount
        });
        
        await savedCart.save();
        
        res.json({
            success: true,
            message: 'Cart saved successfully',
            data: savedCart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get saved carts
app.get('/api/cart/saved', verifyToken, async (req, res) => {
    try {
        const savedCarts = await SavedCart.find({ userId: req.userId }).sort({ savedAt: -1 });
        
        res.json({
            success: true,
            data: savedCarts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Restore saved cart
app.post('/api/cart/restore/:savedCartId', verifyToken, async (req, res) => {
    try {
        const savedCart = await SavedCart.findById(req.params.savedCartId);
        
        if (!savedCart) {
            return res.status(404).json({
                success: false,
                message: 'Saved cart not found'
            });
        }
        
        if (savedCart.userId.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        let cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            cart = new Cart({ userId: req.userId });
        }
        
        cart.items = savedCart.items;
        cart.totalAmount = savedCart.totalAmount;
        cart.finalAmount = cart.totalAmount - cart.discount;
        cart.updatedAt = Date.now();
        
        await cart.save();
        
        res.json({
            success: true,
            message: 'Cart restored successfully',
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Delete saved cart
app.delete('/api/cart/saved/:savedCartId', verifyToken, async (req, res) => {
    try {
        const savedCart = await SavedCart.findById(req.params.savedCartId);
        
        if (!savedCart) {
            return res.status(404).json({
                success: false,
                message: 'Saved cart not found'
            });
        }
        
        if (savedCart.userId.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        await SavedCart.findByIdAndDelete(req.params.savedCartId);
        
        res.json({
            success: true,
            message: 'Saved cart deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Merge carts (useful after login)
app.post('/api/cart/merge', verifyToken, async (req, res) => {
    try {
        const { guestCart } = req.body; // Items from guest session
        
        let cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            cart = new Cart({ userId: req.userId, items: [] });
        }
        
        // Merge guest cart items
        guestCart.forEach(guestItem => {
            const existingItemIndex = cart.items.findIndex(
                item => item.productId.toString() === guestItem.productId
            );
            
            if (existingItemIndex > -1) {
                cart.items[existingItemIndex].quantity += guestItem.quantity;
                cart.items[existingItemIndex].totalPrice = 
                    cart.items[existingItemIndex].quantity * cart.items[existingItemIndex].unitPrice;
            } else {
                cart.items.push(guestItem);
            }
        });
        
        cart.totalAmount = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.finalAmount = cart.totalAmount - cart.discount;
        cart.updatedAt = Date.now();
        
        await cart.save();
        
        res.json({
            success: true,
            message: 'Carts merged successfully',
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Clear cart
app.delete('/api/cart/clear', verifyToken, async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        cart.items = [];
        cart.totalAmount = 0;
        cart.discount = 0;
        cart.discountCode = undefined;
        cart.finalAmount = 0;
        cart.updatedAt = Date.now();
        
        await cart.save();
        
        res.json({
            success: true,
            message: 'Cart cleared',
            data: cart
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================
// WISHLIST ENDPOINTS
// ============================================

// Get user's wishlist
app.get('/api/wishlist', verifyToken, async (req, res) => {
    try {
        let wishlist = await Wishlist.findOne({ userId: req.userId });
        
        if (!wishlist) {
            wishlist = new Wishlist({ userId: req.userId, items: [] });
            await wishlist.save();
        }
        
        res.json({
            success: true,
            data: wishlist
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add item to wishlist
app.post('/api/wishlist/add', verifyToken, async (req, res) => {
    try {
        const { productId, sku, name, unitPrice } = req.body;
        
        let wishlist = await Wishlist.findOne({ userId: req.userId });
        
        if (!wishlist) {
            wishlist = new Wishlist({ userId: req.userId, items: [] });
        }
        
        const existingItem = wishlist.items.find(
            item => item.productId.toString() === productId
        );
        
        if (existingItem) {
            return res.status(400).json({
                success: false,
                message: 'Item already in wishlist'
            });
        }
        
        wishlist.items.push({
            productId,
            sku,
            name,
            unitPrice
        });
        
        wishlist.updatedAt = Date.now();
        await wishlist.save();
        
        res.json({
            success: true,
            message: 'Item added to wishlist',
            data: wishlist
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Remove item from wishlist
app.delete('/api/wishlist/remove/:productId', verifyToken, async (req, res) => {
    try {
        const { productId } = req.params;
        
        const wishlist = await Wishlist.findOne({ userId: req.userId });
        
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        wishlist.items = wishlist.items.filter(
            item => item.productId.toString() !== productId
        );
        
        wishlist.updatedAt = Date.now();
        await wishlist.save();
        
        res.json({
            success: true,
            message: 'Item removed from wishlist',
            data: wishlist
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Move item from wishlist to cart
app.post('/api/wishlist/move-to-cart/:productId', verifyToken, async (req, res) => {
    try {
        const { productId } = req.params;
        const { quantity = 1 } = req.body;
        
        const wishlist = await Wishlist.findOne({ userId: req.userId });
        
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        const item = wishlist.items.find(
            item => item.productId.toString() === productId
        );
        
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in wishlist'
            });
        }
        
        let cart = await Cart.findOne({ userId: req.userId });
        
        if (!cart) {
            cart = new Cart({ userId: req.userId, items: [] });
        }
        
        const existingCartItemIndex = cart.items.findIndex(
            cartItem => cartItem.productId.toString() === productId
        );
        
        if (existingCartItemIndex > -1) {
            cart.items[existingCartItemIndex].quantity += quantity;
            cart.items[existingCartItemIndex].totalPrice = 
                cart.items[existingCartItemIndex].quantity * item.unitPrice;
        } else {
            cart.items.push({
                productId: item.productId,
                sku: item.sku,
                name: item.name,
                quantity,
                unitPrice: item.unitPrice,
                totalPrice: quantity * item.unitPrice
            });
        }
        
        cart.totalAmount = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);
        cart.finalAmount = cart.totalAmount - cart.discount;
        cart.updatedAt = Date.now();
        await cart.save();
        
        wishlist.items = wishlist.items.filter(
            item => item.productId.toString() !== productId
        );
        wishlist.updatedAt = Date.now();
        await wishlist.save();
        
        res.json({
            success: true,
            message: 'Item moved to cart',
            data: { cart, wishlist }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Clear wishlist
app.delete('/api/wishlist/clear', verifyToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ userId: req.userId });
        
        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }
        
        wishlist.items = [];
        wishlist.updatedAt = Date.now();
        await wishlist.save();
        
        res.json({
            success: true,
            message: 'Wishlist cleared',
            data: wishlist
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Server start
const PORT = 3002;
app.listen(PORT, () => {
    console.log('✓ Cart & Wishlist Server is running!');
    console.log('✓ http://localhost:' + PORT);

});
