// Initial Data
const DEFAULT_PRODUCTS = [
    { id: 1, name: "Stellar Tee", price: 25.00, qty: 50, desc: "Cotton blend with reflective details.", image: null, category: "Tops", rating: 4.5, reviewCount: 2, reviews: [] },
    { id: 2, name: "Nebula Hoodie", price: 55.00, qty: 30, desc: "Warm, cozy, and out of this world.", image: null, category: "Outerwear", rating: 5, reviewCount: 4, reviews: [] },
    { id: 3, name: "Gravity Pants", price: 45.00, qty: 40, desc: "Comfortable fit for zero-g environments.", image: null, category: "Bottoms", rating: 4, reviewCount: 1, reviews: [] }
];

// Firebase Integration
let firebaseDb = null;
const firebaseConfig = {
    apiKey: "AIzaSyCFS6OWFP7YsQIBpPShNu34aOQLUBWwBHs",
    authDomain: "wkn-store.firebaseapp.com",
    databaseURL: "https://wkn-store-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "wkn-store",
    storageBucket: "wkn-store.firebasestorage.app",
    messagingSenderId: "637642044431",
    appId: "1:637642044431:web:7bc03d9111cfa9d6485f7a",
    measurementId: "G-P4E2Z024EL"
};

try {
    firebase.initializeApp(firebaseConfig);
    firebaseDb = firebase.database();
    console.log("Firebase Initialized with hardcoded config");
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// State Management with safety
const getStoredData = (key, fallback) => {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : fallback;
    } catch (e) {
        console.error(`Error loading ${key}:`, e);
        return fallback;
    }
};

const state = {
    products: getStoredData('products', DEFAULT_PRODUCTS),
    cart: [],
    orders: getStoredData('orders', []),
    adminPin: localStorage.getItem('adminPin') || '1022',
    settings: getStoredData('storeSettings', { name: 'AGStore', logo: null }),
    currentPage: 'home',
    currentAdminTab: 'products',
    isAdminLoggedIn: false,
    editingDetails: null,
    tempImage: null,
    tempVariantImage: null,
    tempVariants: {},
    tempReviewId: null
};

// Utils with Cloud Feedback
const saveProducts = () => {
    localStorage.setItem('products', JSON.stringify(state.products));
    if (firebaseDb) {
        firebaseDb.ref('products').set(state.products)
            .catch(e => showToast("Product Sync Failed: " + e.message, "error"));
    }
};
const saveOrders = () => {
    localStorage.setItem('orders', JSON.stringify(state.orders));
    if (firebaseDb) {
        return firebaseDb.ref('orders').set(state.orders)
            .then(() => console.log("Orders synced to cloud"))
            .catch(e => {
                showToast("Order Cloud Sync Failed!", "error");
                throw e; // Rethrow to handle in checkout logic
            });
    }
    return Promise.resolve();
};
const saveAdminPin = () => {
    localStorage.setItem('adminPin', state.adminPin);
    if (firebaseDb) {
        firebaseDb.ref('adminPin').set(state.adminPin)
            .catch(e => showToast("PIN Sync Failed", "error"));
    }
};
const saveSettings = () => {
    localStorage.setItem('storeSettings', JSON.stringify(state.settings));
    if (firebaseDb) {
        firebaseDb.ref('settings').set(state.settings)
            .catch(e => showToast("Settings Sync Failed", "error"));
    }
};

// Initial Cloud Load & Sync
if (firebaseDb) {
    firebaseDb.ref('/').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Safety: Firebase sometimes returns arrays as objects. Convert them back.
            if (data.products) {
                state.products = Array.isArray(data.products) ? data.products : Object.values(data.products);
            }
            if (data.orders) {
                const cloudOrders = Array.isArray(data.orders) ? data.orders : Object.values(data.orders);
                // Notification for admin if new orders arrive
                if (cloudOrders.length > state.orders.length && state.isAdminLoggedIn) {
                    showToast("New Order Received! 🚀", "success");
                    if (state.currentPage === 'admin' && state.currentAdminTab === 'orders') renderOrders();
                }
                state.orders = cloudOrders;
            }
            if (data.settings) state.settings = data.settings;
            if (data.adminPin) state.adminPin = data.adminPin;

            render();
            applySettings();
            console.log("Cloud Data Synced Successfully");
        } else {
            // First time setup: Push local data to cloud
            saveProducts();
            saveOrders();
            saveAdminPin();
            saveSettings();
        }
    });
}

const formatCurrency = (val) => `$${parseFloat(val).toFixed(2)}`;

// Router
const router = {
    navigate: (page) => {
        if (page === 'admin' && !state.isAdminLoggedIn) {
            checkAdminAccess();
            return;
        }
        state.currentPage = page;
        render();
        updateNav();
        applySettings();
        window.scrollTo(0, 0);
        closeModals();
        toggleCart(false, true);
    }
};

// Modal Logic
function checkAdminAccess() {
    if (state.isAdminLoggedIn) {
        router.navigate('admin');
    } else {
        openModal('login-modal');
        document.getElementById('admin-pin').value = '';
        document.getElementById('admin-pin').focus();
    }
}

function verifyAdmin(e) {
    e.preventDefault();
    const pin = document.getElementById('admin-pin').value;
    if (pin === state.adminPin) {
        state.isAdminLoggedIn = true;
        closeModals();
        router.navigate('admin');
        showToast('Welcome, Admin', 'success');
        e.target.reset();
    } else {
        showToast('Invalid PIN', 'error');
        const input = document.getElementById('admin-pin');
        input.value = '';
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 300);
    }
}

function adminLogout() {
    state.isAdminLoggedIn = false;
    router.navigate('home');
    showToast('Logged Out', 'info');
}

function openModal(id) {
    document.getElementById('overlay').classList.add('active');
    document.getElementById(id).classList.add('active');
}

function closeModals() {
    document.getElementById('overlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));

    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar.classList.contains('open')) {
        toggleCart();
    }
}

function openCheckoutModal() {
    if (state.cart.length === 0) {
        showToast('Cart is empty', 'error');
        return;
    }
    toggleCart();
    openModal('checkout-modal');
}

// Product Image & Form Handling
function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 800000) {
            alert("Image is too large. Keep it under 800KB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            state.tempImage = e.target.result;
            updateImagePreview(state.tempImage);
        };
        reader.readAsDataURL(file);
    }
}

function updateImagePreview(src) {
    const container = document.getElementById('image-preview');
    if (src) {
        container.innerHTML = `<img src="${src}" class="image-preview-img">`;
    } else {
        container.innerHTML = `
            <i class="ri-image-add-line"></i>
            <span>Click to Add Image</span>
        `;
    }
}

function saveProduct(e) {
    e.preventDefault();
    const name = document.getElementById('prod-name').value;
    const price = document.getElementById('prod-price').value;
    const qty = document.getElementById('prod-qty').value;
    const desc = document.getElementById('prod-desc').value;
    const cat = document.getElementById('prod-cat').value; // New Category

    const sizes = document.getElementById('prod-sizes').value.split(',').map(s => s.trim()).filter(s => s);
    const colors = document.getElementById('prod-colors').value.split(',').map(c => c.trim()).filter(c => c);

    if (state.editingDetails) {
        // Update Existing
        const product = state.products.find(p => p.id === state.editingDetails.id);
        if (product) {
            product.name = name;
            product.price = parseFloat(price);
            product.qty = parseInt(qty);
            product.desc = desc;
            product.category = cat;
            product.sizes = sizes;
            product.colors = colors;
            // Merge existing variant images with new ones if needed, or overwrite
            product.variantImages = { ...product.variantImages, ...state.tempVariants };

            if (state.tempImage) product.image = state.tempImage;

            showToast('Product Updated!', 'success');
        }
    } else {
        // Create New
        const newProduct = {
            id: Date.now(),
            name,
            price: parseFloat(price),
            qty: parseInt(qty),
            desc,
            category: cat || 'Uncategorized',
            image: state.tempImage,
            sizes,
            colors,
            variantImages: state.tempVariants,
            rating: 0,
            reviewCount: 0,
            reviews: []
        };
        state.products.push(newProduct);
        showToast('Product Added!', 'success');
    }

    saveProducts();
    resetProductForm();
    render();
}

function editProduct(id) {
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    state.editingDetails = product;

    // Switch to Products tab if not already
    adminView('products');

    // Scroll to top of form
    document.querySelector('.add-product-form').scrollIntoView({ behavior: 'smooth' });

    // Populate Form
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-price').value = product.price;
    document.getElementById('prod-qty').value = product.qty;
    document.getElementById('prod-desc').value = product.desc;
    const catInput = document.getElementById('prod-cat');
    if (catInput) catInput.value = product.category || '';

    document.getElementById('prod-sizes').value = product.sizes ? product.sizes.join(',') : '';
    document.getElementById('prod-colors').value = product.colors ? product.colors.join(',') : '';

    // Restore Variants
    state.tempVariants = product.variantImages || {};
    updateVariantOptions();
    updateVariantUI();

    updateImagePreview(product.image);

    // Change Button Text
    document.getElementById('save-btn').textContent = 'Update Item';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
}

function resetProductForm() {
    document.getElementById('product-form').reset();
    state.editingDetails = null;
    state.tempImage = null;
    updateImagePreview(null);
    document.getElementById('save-btn').textContent = 'Add Item';
    document.getElementById('save-btn').textContent = 'Add Item';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
    // Clear Variants UI
    state.tempVariants = {};
    updateVariantUI();
}

function updateVariantOptions() {
    const colors = document.getElementById('prod-colors').value.split(',').map(c => c.trim()).filter(c => c);
    const select = document.getElementById('variant-color-select');
    select.innerHTML = '<option value="">Select Color</option>' + colors.map(c => `<option value="${c}">${c}</option>`).join('');
}

function addVariantImage(event) {
    const file = event.target.files[0];
    const color = document.getElementById('variant-color-select').value;

    if (!color) {
        showToast('Select a color first', 'error');
        return;
    }

    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            state.tempVariants[color] = e.target.result;
            updateVariantUI();
        };
        reader.readAsDataURL(file);
    }
}

function updateVariantUI() {
    const container = document.getElementById('variant-list');
    container.innerHTML = Object.entries(state.tempVariants).map(([color, img]) => `
        <div style="position:relative; width:40px; height:40px;">
            <img src="${img}" style="width:100%; height:100%; object-fit:cover; border-radius:4px; border:1px solid #555;">
            <div style="font-size:0.6rem; text-align:center; color:white;">${color}</div>
            <button onclick="deleteVariant('${color}')" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:15px; height:15px; font-size:10px; cursor:pointer;">x</button>
        </div>
    `).join('');
}

function deleteVariant(color) {
    delete state.tempVariants[color];
    updateVariantUI();
}

function removeProduct(id) {
    if (confirm('Remove this item permanently?')) {
        state.products = state.products.filter(p => p.id !== id);
        saveProducts();

        // Also remove from cart if present
        state.cart = state.cart.filter(item => item.id !== id);

        render();
        showToast('Item Removed.', 'info');
    }
}

// Cart & Store Logic
// Cart & Store Logic
function addToCartWithType(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    // Get selected options
    const sizeSelect = document.getElementById(`size-select-${productId}`);
    const colorSelect = document.getElementById(`color-select-${productId}`);

    const size = sizeSelect ? sizeSelect.value : null;
    const color = colorSelect ? colorSelect.value : null;

    if (product.sizes && product.sizes.length > 0 && !size) {
        showToast('Please select a size', 'error');
        return;
    }

    if (product.colors && product.colors.length > 0 && !color) {
        showToast('Please select a color', 'error');
        return;
    }

    // Generate Unique ID for Cart Item based on variants
    const cartItemId = `${productId}-${size || 'na'}-${color || 'na'}`;

    const currentCartItem = state.cart.find(item => item.cartId === cartItemId);
    const currentQtyInCart = currentCartItem ? currentCartItem.qty : 0;

    if (product.qty <= currentQtyInCart) {
        showToast('Max stock reached!', 'error');
        return;
    }

    if (currentCartItem) {
        currentCartItem.qty += 1;
    } else {
        state.cart.push({ ...product, cartId: cartItemId, selectedSize: size, selectedColor: color, qty: 1 });
    }

    updateCartUI();
    toggleCart(true);
}

// Deprecated simple add
function addToCart(productId) {
    addToCartWithType(productId);
}


function changeCartQty(cartId, delta) {
    const item = state.cart.find(i => i.cartId === cartId);
    if (!item) return;

    const product = state.products.find(p => p.id === item.id); // Base product check

    const newQty = item.qty + delta;

    if (newQty <= 0) {
        removeFromCart(cartId);
        return;
    }

    if (product && newQty > product.qty) {
        showToast(`Only ${product.qty} left in stock!`, 'error');
        return;
    }

    item.qty = newQty;
    updateCartUI();
}

function removeFromCart(cartId) {
    state.cart = state.cart.filter(item => item.cartId !== cartId);
    updateCartUI();
}

function toggleCart(forceOpen = false, forceClose = false) {
    const sidebar = document.getElementById('cart-sidebar');
    const overlay = document.getElementById('overlay');

    if (forceClose) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        return;
    }

    if (forceOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
    } else {
        sidebar.classList.toggle('open');
        if (sidebar.classList.contains('open')) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }
}

function updateCartUI() {
    const cartContainer = document.getElementById('cart-items');
    const totalQty = state.cart.reduce((a, b) => a + b.qty, 0);
    document.getElementById('cart-count').textContent = totalQty;

    const total = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    document.getElementById('cart-total').textContent = formatCurrency(total);

    if (state.cart.length === 0) {
        cartContainer.innerHTML = '<p class="empty-cart-msg">Your space bag is empty.</p>';
        return;
    }

    cartContainer.innerHTML = state.cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-details">
                <h4>${item.name}</h4>
                <small>${item.selectedSize ? `Size: ${item.selectedSize} ` : ''}${item.selectedColor ? `Color: ${item.selectedColor}` : ''}</small>
                <div style="font-size:0.8rem; color:#aaa;">${formatCurrency(item.price)}</div>
            </div>
            <div class="cart-qty-controls">
                <button onclick="changeCartQty('${item.cartId}', -1)">-</button>
                <span>${item.qty}</span>
                <button onclick="changeCartQty('${item.cartId}', 1)">+</button>
            </div>
            <button onclick="removeFromCart('${item.cartId}')" class="delete-btn-icon"><i class="ri-delete-bin-line"></i></button>
        </div>
    `).join('');
}

function processCheckout(e) {
    if (e) e.preventDefault();
    try {
        const nameInput = document.getElementById('cust-name');
        const addrInput = document.getElementById('cust-address');
        const p1Input = document.getElementById('cust-phone1');
        const p2Input = document.getElementById('cust-phone2');

        if (!nameInput || !addrInput || !p1Input) {
            throw new Error("Checkout fields not found in the page. Please refresh.");
        }

        const name = nameInput.value.trim();
        const address = addrInput.value.trim();
        const phone1 = p1Input.value.trim();
        const phone2 = p2Input ? p2Input.value.trim() : '';

        if (!name || !address || !phone1) {
            throw new Error("Please fill in all required fields.");
        }

        if (!state.cart || state.cart.length === 0) {
            showToast('Your cart is empty!', 'error');
            return;
        }

        const orderItems = state.cart.map(item => ({
            id: Number(item.id),
            name: String(item.name || 'Item'),
            price: parseFloat(item.price) || 0,
            qty: parseInt(item.qty) || 1,
            selectedSize: item.selectedSize || '',
            selectedColor: item.selectedColor || ''
        }));

        const orderTotal = orderItems.reduce((sum, item) => sum + (item.price * item.qty), 0);

        const newOrder = {
            id: Date.now(),
            customer: { name, address, phone1, phone2 },
            items: orderItems,
            total: orderTotal,
            date: new Date().toLocaleString(),
            status: 'Pending'
        };

        if (!Array.isArray(state.orders)) state.orders = [];
        state.orders.unshift(newOrder);

        // Try to save to Cloud first to ensure it's not just local
        saveOrders().then(() => {
            // Inventory Deduct
            state.cart.forEach(c => {
                const product = state.products.find(prod => Number(prod.id) === Number(c.id));
                if (product) {
                    const deductQty = parseInt(c.qty) || 0;
                    product.qty -= deductQty;
                    if (product.qty < 0) product.qty = 0;
                }
            });
            saveProducts();

            state.cart = [];
            updateCartUI();
            closeModals();
            showToast('Order Placed Successfully! 🚀', 'success');

            setTimeout(() => {
                render();
            }, 100);
        }).catch(err => {
            alert("Order could not be sent to Cloud. Please check your internet or Firebase Rules. Error: " + err.message);
        });

    } catch (error) {
        console.error("Checkout Error:", error);
        alert("Checkout Error: " + error.message);
        showToast("Error: " + error.message, "error");
    }
}

// Review System
function openReviewModal(productId) {
    state.tempReviewId = productId;
    document.getElementById('review-prod-id').value = productId;
    document.getElementById('review-form').reset();
    setRating(0); // Reset stars
    openModal('review-modal');
}

function setRating(val) {
    document.getElementById('review-rating').value = val;
    const stars = document.querySelectorAll('.star-input');
    stars.forEach(s => {
        const rating = parseInt(s.dataset.val);
        if (rating <= val) {
            s.classList.add('ri-star-fill');
            s.classList.remove('ri-star-line');
            s.style.color = 'gold';
        } else {
            s.classList.remove('ri-star-fill');
            s.classList.add('ri-star-line');
            s.style.color = '#ccc';
        }
    });
}

function submitReview(e) {
    e.preventDefault();
    const name = document.getElementById('review-name').value;
    const rating = parseInt(document.getElementById('review-rating').value);
    const comment = document.getElementById('review-comment').value;

    if (!rating) {
        showToast('Please select a star rating', 'error');
        return;
    }

    const product = state.products.find(p => p.id === state.tempReviewId);
    if (product) {
        if (!product.reviews) product.reviews = [];
        product.reviews.push({ name, rating, comment, date: new Date().toLocaleDateString() });

        // Recalculate Average
        const totalStars = product.reviews.reduce((acc, r) => acc + r.rating, 0);
        product.rating = totalStars / product.reviews.length;
        product.reviewCount = product.reviews.length;

        saveProducts();
        showToast('Review Submitted!', 'success');
        closeModals();
        render(); // Update UI to show new stars
    }
}

// Admin Settings
function changeAdminPin(e) {
    e.preventDefault();
    const newPin = document.getElementById('new-pin').value;
    if (newPin && newPin.length >= 4) {
        state.adminPin = newPin;
        saveAdminPin();
        showToast('PIN Updated Successfully', 'success');
        document.getElementById('new-pin').value = '';
    } else {
        showToast('PIN must be at least 4 chars', 'error');
    }
}

function saveAppearanceSettings(e) {
    e.preventDefault();
    const name = document.getElementById('setting-store-name').value;
    const logo = document.getElementById('setting-logo-url').value;

    if (name) state.settings.name = name;
    state.settings.logo = logo; // Can be empty

    saveSettings();
    applySettings();
    showToast('Settings Saved', 'success');
}

function applySettings() {
    if (state.settings.name) {
        const brand = document.getElementById('nav-brand');
        if (brand) brand.textContent = state.settings.name;
        document.title = state.settings.name;
    }
    if (state.settings.logo) {
        const brand = document.getElementById('nav-brand');
        if (brand) {
            brand.textContent = ''; // Clear text if logic dictates, or append
            brand.innerHTML = `<img src="${state.settings.logo}" style="height:40px; vertical-align:middle; margin-right:10px;"> ${state.settings.name}`;
        }
    }
}

// View Logic & Updates
function acceptOrder(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
        order.status = 'Accepted';
        saveOrders();
        renderOrders(); // Only update order list
        showToast('Order Accepted.', 'success');
    }
}

function rejectOrder(orderId) {
    if (!confirm('Reject this order? Stock will be restored.')) return;

    const order = state.orders.find(o => o.id === orderId);
    if (order) {
        order.status = 'Rejected';

        // Restore Stock
        order.items.forEach(item => {
            const product = state.products.find(p => p.id === item.id);
            if (product) {
                product.qty += item.qty;
            }
        });

        saveOrders();
        saveProducts(); // Save restored stock
        render(); // Full render needed to update product stock counts
        showToast('Order Rejected & Stock Restored.', 'info');
    }
}

function printOrder(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Invoice #${order.id}</title>
            <style>
                body { font-family: sans-serif; padding: 40px; }
                .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
                .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #eee; text-align: left; padding: 10px; }
                td { padding: 10px; border-bottom: 1px solid #eee; }
                .total { text-align: right; font-size: 1.5rem; margin-top: 30px; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${state.settings.name} Invoice</h1>
                <p>Thank you for your purchase</p>
            </div>
            <div class="meta">
                <div>
                    <strong>Bill To:</strong><br>
                    ${order.customer.name}<br>
                    ${order.customer.address}<br>
                    ${order.customer.phone1} ${order.customer.phone2 ? '/ ' + order.customer.phone2 : ''}
                </div>
                <div style="text-align: right;">
                    <strong>Order #:</strong> ${order.id}<br>
                    <strong>Date:</strong> ${order.date}<br>
                    <strong>Status:</strong> ${order.status}
                </div>
            </div>
            <table>
                <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                <tbody>
                    ${order.items.map(i => `
                        <tr>
                            <td>${i.name}</td>
                            <td>${i.qty}</td>
                            <td>${formatCurrency(i.price)}</td>
                            <td>${formatCurrency(i.price * i.qty)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="total">Grand Total: ${formatCurrency(order.total)}</div>
            <script>window.print();</script>
        </body>
        </html>
    `);
}

function render() {
    const mainContent = document.getElementById('main-content');

    // Apply Global Settings
    applySettings();

    if (state.currentPage === 'home') {
        const storeTmpl = document.getElementById('store-template');
        if (storeTmpl) mainContent.innerHTML = storeTmpl.innerHTML;

        // Populate Categories in Filter
        const catSelect = document.getElementById('store-category');
        if (catSelect) {
            const categories = [...new Set(state.products.map(p => p.category || 'Uncategorized'))];
            categories.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                catSelect.appendChild(opt);
            });
        }

        renderProducts();
    } else if (state.currentPage === 'admin') {
        const adminTmpl = document.getElementById('admin-template');
        if (adminTmpl) mainContent.innerHTML = adminTmpl.innerHTML;

        // Populate DataList for Categories
        const dl = document.getElementById('cat-list');
        if (dl) {
            const categories = [...new Set(state.products.map(p => p.category || 'Uncategorized'))];
            dl.innerHTML = categories.map(c => `<option value="${c}">`).join('');
        }
        // Fill Settings
        document.getElementById('setting-store-name').value = state.settings.name || '';
        document.getElementById('setting-logo-url').value = state.settings.logo || '';

        // Fill Cloud Config
        const fbInput = document.getElementById('firebase-config');
        if (fbInput) fbInput.value = localStorage.getItem('firebaseConfig') || '';
        const cloudStatus = document.getElementById('cloud-status');
        if (cloudStatus) {
            cloudStatus.textContent = firebaseDb ? "Status: 🛰️ Online (Synced)" : "Status: 🏠 Offline (Local Only)";
            cloudStatus.style.color = firebaseDb ? "#00ff88" : "#888";
        }

        renderAdminProducts();
        renderOrders();
        adminView(state.currentAdminTab);

        // Restore Edit State if needed
        if (state.editingDetails) {
            editProduct(state.editingDetails.id);
        }
    }
}

function renderProducts() {
    const list = document.getElementById('product-list');
    if (!list) return;

    const searchTerm = (document.getElementById('store-search') ? document.getElementById('store-search').value.toLowerCase() : '');
    const categoryFilter = (document.getElementById('store-category') ? document.getElementById('store-category').value : 'all');

    const filtered = state.products.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(searchTerm) || (p.desc && p.desc.toLowerCase().includes(searchTerm)) || (p.category && p.category.toLowerCase().includes(searchTerm));
        const matchCat = categoryFilter === 'all' || p.category === categoryFilter;
        return matchSearch && matchCat;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:#888;">No items found.</p>';
        return;
    }

    list.innerHTML = filtered.map(p => {
        const stars = '⭐'.repeat(Math.round(p.rating || 0));
        return `
        <div class="product-card">
            <div class="product-image">
                ${p.image ? `<img id="img-${p.id}" src="${p.image}" alt="${p.name}">` : `<i class="ri-shopping-bag-3-line"></i>`}
            </div>
            <div class="product-info">
                <div style="display:flex; justify-content:space-between;">
                    <span style="font-size:0.7rem; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">${p.category || 'Item'}</span>
                    <span style="font-size:0.8rem; color:gold;">${p.rating ? p.rating.toFixed(1) : ''} <i class="ri-star-fill"></i> (${p.reviewCount || 0})</span>
                </div>
                <h3 style="margin-top:5px;">${p.name}</h3>
                
                <!-- Variants -->
                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    ${p.sizes && p.sizes.length ? `
                    <select id="size-select-${p.id}" style="width:100%; padding:5px; border-radius:4px; background:#222; color:#fff; border:1px solid #444;">
                        <option value="">Size</option>
                        ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>` : ''}
                    
                    ${p.colors && p.colors.length ? `
                    <select id="color-select-${p.id}" onchange="changeProductImage(${p.id}, this.value)" style="width:100%; padding:5px; border-radius:4px; background:#222; color:#fff; border:1px solid #444;">
                        <option value="">Color</option>
                        ${p.colors.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>` : ''}
                </div>

                <p style="color: #aaa; font-size: 0.9rem; margin-bottom: 10px; min-height: 20px;">${p.desc}</p>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="product-price" style="margin:0;">${formatCurrency(p.price)}</span>
                    <small class="${p.qty < 5 ? 'text-danger' : ''}">stock: ${p.qty}</small>
                </div>
            </div>
            <div style="display:flex; gap:5px; margin-top:10px;">
                <button onclick="addToCartWithType(${p.id})" class="add-to-cart-btn" ${p.qty <= 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    ${p.qty > 0 ? 'Add' : 'Empty'}
                </button>
                <button onclick="openReviewModal(${p.id})" class="add-to-cart-btn" style="background:#444; width:40px;"><i class="ri-chat-3-line"></i></button>
            </div>
        </div>
    `}).join('');
}

function changeProductImage(id, color) {
    const product = state.products.find(p => p.id === id);
    if (!product || !product.variantImages || !product.variantImages[color]) return;

    const img = document.getElementById(`img-${id}`);
    if (img) img.src = product.variantImages[color];
}

function renderAdminProducts() {
    const list = document.getElementById('admin-product-list');
    if (!list) return;

    const searchTerm = (document.getElementById('admin-search') ? document.getElementById('admin-search').value.toLowerCase() : '');

    const filtered = state.products.filter(p => {
        return p.name.toLowerCase().includes(searchTerm) || (p.desc && p.desc.toLowerCase().includes(searchTerm));
    });

    list.innerHTML = filtered.map(p => `
        <div class="admin-product-item">
            <div style="display:flex; align-items:center; gap: 15px;">
                ${p.image ? `<img src="${p.image}" style="width:50px; height:50px; border-radius:8px; object-fit:cover;">` : '<div style="width:50px; height:50px; background:#333; border-radius:8px;"></div>'}
                <div>
                    <strong>${p.name}</strong>
                    <div style="color:#888; font-size:0.8rem;">${formatCurrency(p.price)} | Stock: ${p.qty} | ${p.category || '-'}</div>
                </div>
            </div>
            <div class="admin-actions">
                <button class="edit-btn" onclick="editProduct(${p.id})"><i class="ri-pencil-line"></i> Edit</button>
                <button class="delete-btn" onclick="removeProduct(${p.id})"><i class="ri-delete-bin-line"></i></button>
            </div>
        </div>
    `).join('');
}

function renderOrders() {
    // Sync orders from storage to ensure we have the latest data
    try {
        const storedOrders = localStorage.getItem('orders');
        state.orders = storedOrders ? JSON.parse(storedOrders) : [];
        if (!Array.isArray(state.orders)) state.orders = [];
    } catch (e) {
        console.error("Error parsing orders:", e);
        state.orders = [];
    }

    const list = document.getElementById('orders-list');
    if (!list) return;

    if (state.orders.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#888;">No orders yet.</p>';
        return;
    }

    list.innerHTML = state.orders.map(o => {
        // Safety checks for malformed orders
        if (!o || !o.customer) return '<div class="order-card error-card">Invalid Order Data</div>';

        const customer = o.customer;
        const items = Array.isArray(o.items) ? o.items : [];
        const status = o.status || 'Pending';
        const total = o.total || 0;
        const date = o.date || 'Unknown Date';
        const id = o.id || 'Unknown ID';

        return `
        <div class="order-card">
            <div class="order-header">
                <div>
                    <strong>#${id}</strong> <small class="status-${status.toLowerCase()}">(${status})</small>
                    <div style="font-size:0.8rem; color:#aaa;">${date}</div>
                </div>
                <div class="order-actions">
                    ${status === 'Pending' ? `
                        <button onclick="acceptOrder(${id})" class="accept-btn">Accept</button>
                        <button onclick="rejectOrder(${id})" class="delete-btn" style="background:var(--danger); color:white; margin:0;">Reject</button>
                    ` : ''}
                    <button onclick="printOrder(${id})" class="print-btn">Invoice</button>
                </div>
            </div>
            <div class="order-items">
                <div style="background: rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:10px; font-size:0.9rem;">
                    <strong>Customer:</strong> ${customer.name || 'N/A'}<br>
                    <strong>Addr:</strong> ${customer.address || 'N/A'}<br>
                    <strong>Tel:</strong> ${customer.phone1 || 'N/A'}
                </div>
                ${items.map(i => `
                    <div class="order-item-row">
                        <span>${i.name} <small>x${i.qty}</small></span>
                        <small>${i.selectedSize ? `${i.selectedSize}/` : ''}${i.selectedColor || ''}</small>
                        <span>${formatCurrency((i.price || 0) * (i.qty || 0))}</span>
                    </div>
                `).join('')}
            </div>
            <div style="text-align: right; font-weight: bold; font-size:1.1rem; color: var(--secondary-accent);">
                ${formatCurrency(total)}
            </div>
        </div>
    `}).join('');
}

function adminView(viewName) {
    state.currentAdminTab = viewName;
    const prodView = document.getElementById('admin-products-view');
    const orderView = document.getElementById('admin-orders-view');
    const settingsView = document.getElementById('admin-settings-view');

    // Hide all
    if (prodView) prodView.classList.add('hidden');
    if (orderView) orderView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');

    // Deactivate tabs
    const tabs = document.querySelectorAll('.admin-tabs .tab-btn');
    if (tabs.length) tabs.forEach(b => b.classList.remove('active'));

    // Show selected
    if (viewName === 'products') {
        if (prodView) prodView.classList.remove('hidden');
        if (tabs[0]) tabs[0].classList.add('active');
    } else if (viewName === 'orders') {
        if (orderView) orderView.classList.remove('hidden');
        if (tabs[1]) tabs[1].classList.add('active');
        renderOrders(); // Re-render orders when tab is clicked
    } else if (viewName === 'settings') {
        if (settingsView) settingsView.classList.remove('hidden');
        if (tabs[2]) tabs[2].classList.add('active');
    }
}

function updateNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.target === state.currentPage) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}
const showToast = (message, type = 'info') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};

function clearAllOrders() {
    if (confirm("Are you sure? This will delete all order history and cannot be undone.")) {
        state.orders = [];
        saveOrders();
        showToast("Order history cleared.", "success");
        if (state.currentAdminTab === 'orders') renderOrders();
    }
}

function saveCloudConfig() {
    const configStr = document.getElementById('firebase-config').value.trim();
    if (!configStr) {
        localStorage.removeItem('firebaseConfig');
        showToast("Cloud Sync disabled. Reloading...", "info");
        setTimeout(() => location.reload(), 1500);
        return;
    }
    try {
        JSON.parse(configStr);
        localStorage.setItem('firebaseConfig', configStr);
        showToast("Cloud Sync Enabled! Reloading...", "success");
        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        showToast("Invalid JSON config format", "error");
    }
}

async function downloadUpdatedAppJs() {
    try {
        const response = await fetch('app.js');
        let content = await response.text();

        // Update DEFAULT_PRODUCTS block
        const productsJson = JSON.stringify(state.products, null, 4);
        content = content.replace(/const DEFAULT_PRODUCTS = \[[\s\S]*?\];/, `const DEFAULT_PRODUCTS = ${productsJson};`);

        // Update default state values if they exist in file or just the JSON blocks
        // This is a bit complex for regex, but let's at least update the products.

        const blob = new Blob([content], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'app.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Updated app.js downloaded! Now upload it to GitHub.", "success");
    } catch (e) {
        showToast("Error generating file", "error");
    }
}

window.addEventListener('DOMContentLoaded', () => {
    router.navigate('home');
});
