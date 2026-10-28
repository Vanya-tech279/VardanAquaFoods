import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    ShoppingCart,
    Package,
    Users,
    Settings,
    Bell,
    Menu,
    X,
    Fish,
    CheckCircle2,
} from "lucide-react";

import AdminLogin from "./AdminLogin";
import OrdersPanel from "./ordersPanel";
import { mapOrder } from "./orderUtils";

const API = "http://localhost:5000";

const navItems = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Orders", icon: ShoppingCart },
    { label: "Products & Stock", icon: Package },
    { label: "Customers", icon: Users },
    { label: "Settings", icon: Settings },
];

export default function AdminDashboard() {
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [ordersError, setOrdersError] = useState("");

    const [activeNav, setActiveNav] = useState("Overview");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const [products, setProducts] = useState([]);
    const [editingProduct, setEditingProduct] = useState(null);
    const [productsLoading, setProductsLoading] = useState(true);
    const [productsError, setProductsError] = useState("");
    const [adminToken, setAdminToken] = useState(
        () => sessionStorage.getItem("vafAdminToken") || ""
    );
    const [editValues, setEditValues] = useState({
        pricePerKg: "",
        stockKg: "",
    });

    function handleLogin(token) {
        sessionStorage.setItem("vafAdminToken", token);
        setAdminToken(token);
    }

    function handleLogout() {
        sessionStorage.removeItem("vafAdminToken");
        setAdminToken("");
        setOrders([]);
    }

    // quiet = true refreshes the list without the loading state.
    async function loadOrders({ quiet = false } = {}) {
        if (!adminToken) return;

        try {
            if (!quiet) setOrdersLoading(true);
            setOrdersError("");

            const response = await fetch(`${API}/api/admin/orders`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });

            // Expired or invalid admin session: back to the login screen.
            if (response.status === 401 || response.status === 403) {
                handleLogout();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success || !Array.isArray(data.orders)) {
                throw new Error(data.message || "Failed to load orders.");
            }

            setOrders(data.orders.map(mapOrder));
        } catch (error) {
            setOrdersError(error.message || "Could not connect to the backend.");
        } finally {
            setOrdersLoading(false);
        }
    }

    // Saves a new status on the server, then reloads the list to confirm it.
    async function updateOrderStatus(orderId, newStatus) {
        try {
            const response = await fetch(
                `${API}/api/admin/orders/${orderId}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminToken}`,
                    },
                    body: JSON.stringify({ status: newStatus }),
                }
            );

            if (response.status === 401 || response.status === 403) {
                handleLogout();
                return { ok: false, message: "Your admin session expired." };
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                // The list may be out of date, so refresh it too.
                await loadOrders({ quiet: true });
                return {
                    ok: false,
                    message: data.message || "Could not update the order.",
                };
            }

            await loadOrders({ quiet: true });
            return { ok: true };
        } catch {
            return {
                ok: false,
                message: "Could not reach the server. Check that the backend is running.",
            };
        }
    }

    // Load orders when signed in, then refresh every 30 seconds.
    useEffect(() => {
        if (!adminToken) return;

        loadOrders();
        const timer = setInterval(() => loadOrders({ quiet: true }), 30000);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [adminToken]);

    useEffect(() => {
        async function loadProducts() {
            try {
                setProductsLoading(true);
                setProductsError("");

                const response = await fetch(`${API}/api/products`);
                const data = await response.json();

                const fetchedProducts = Array.isArray(data)
                    ? data
                    : data.products;

                if (
                    !response.ok ||
                    (!Array.isArray(data) && !data.success) ||
                    !Array.isArray(fetchedProducts)
                ) {
                    throw new Error(data.message || "Failed to load products.");
                }

                setProducts(
                    fetchedProducts.map((product) => ({
                        ...product,
                        id: product._id,
                        available:
                            product.available ?? Number(product.stockKg) > 0,
                    }))
                );
            } catch (error) {
                setProductsError(
                    error.message || "Could not connect to the backend."
                );
            } finally {
                setProductsLoading(false);
            }
        }

        loadProducts();
    }, []);

    // Paid orders waiting for the shop to start preparing them.
    const pendingCount = orders.filter(
        (order) => order.status === "Confirmed"
    ).length;

    if (!adminToken) {
        return <AdminLogin onLogin={handleLogin} />;
    }

    return (
        <div className="min-h-screen bg-brand-50/60 text-slate-900">
            {sidebarOpen && (
                <button
                    aria-label="Close sidebar"
                    onClick={() => setSidebarOpen(false)}
                    className="fixed inset-0 z-40 bg-brand-900/40 lg:hidden"
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-brand-900 text-white transition-transform duration-200 lg:translate-x-0 ${
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-300 to-brand-600 text-white shadow-lg shadow-black/20">
                        <Fish size={25} />
                    </div>
                    <div>
                        <p className="font-display text-sm font-extrabold tracking-wide">
                            VARDAN
                        </p>
                        <p className="text-xs font-semibold tracking-[0.16em] text-brand-300">
                            AQUA FOODS
                        </p>
                    </div>
                    <button
                        aria-label="Close navigation"
                        onClick={() => setSidebarOpen(false)}
                        className="ml-auto rounded-lg p-2 text-brand-200 hover:bg-white/10 lg:hidden"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="px-4 pt-7">
                    <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">
                        Workspace
                    </p>

                    <nav className="space-y-1">
                        {navItems.map(({ label, icon: Icon }) => (
                            <button
                                key={label}
                                onClick={() => {
                                    setActiveNav(label);
                                    setSidebarOpen(false);
                                }}
                                className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition ${
                                    activeNav === label
                                        ? "bg-white text-brand-800 shadow-lg shadow-black/20"
                                        : "text-brand-100 hover:bg-white/10 hover:text-white"
                                }`}
                            >
                                <Icon size={19} />
                                {label}
                                {label === "Orders" && pendingCount > 0 && (
                                    <span
                                        className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
                                            activeNav === label
                                                ? "bg-brand-500 text-white"
                                                : "bg-white/15 text-white"
                                        }`}
                                    >
                                        {pendingCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="mt-auto p-4">
                    <div className="rounded-3xl bg-white/10 p-4">
                        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
                            <ShieldCheckIcon />
                        </div>
                        <p className="font-display text-sm font-bold">
                            Store control center
                        </p>
                        <p className="mt-1 text-xs leading-5 text-brand-100">
                            {pendingCount > 0
                                ? `${pendingCount} paid ${
                                      pendingCount === 1 ? "order is" : "orders are"
                                  } waiting to be prepared.`
                                : "No paid orders are waiting right now."}
                        </p>
                    </div>
                    <p className="mt-4 text-center text-[10px] text-brand-300">
                        VARDAN AQUA FOODS · ADMIN
                    </p>
                </div>
            </aside>

            <main className="min-h-screen lg:pl-64">
                <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-brand-100 bg-white/90 px-4 backdrop-blur-md sm:px-8">
                    <div className="flex items-center gap-3">
                        <button
                            aria-label="Open navigation"
                            onClick={() => setSidebarOpen(true)}
                            className="rounded-xl border border-brand-100 p-2.5 text-brand-700 lg:hidden"
                        >
                            <Menu size={19} />
                        </button>
                        <div>
                            <p className="text-xs font-medium text-slate-400">
                                Vardan Aqua Foods / Admin
                            </p>
                            <h1 className="mt-0.5 font-display text-lg font-extrabold text-brand-900 sm:text-2xl">
                                {activeNav}
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Live data
                        </span>
                        <button
                            aria-label="Notifications"
                            onClick={() => setActiveNav("Orders")}
                            className="relative rounded-full border border-brand-100 p-2.5 text-brand-600 transition hover:bg-brand-50"
                        >
                            <Bell size={19} />
                            {pendingCount > 0 && (
                                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                            )}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="rounded-full border border-brand-100 px-5 py-2.5 text-sm font-bold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50"
                        >
                            Log out
                        </button>
                    </div>
                </header>

                <div className="mx-auto max-w-[1500px] space-y-7 p-4 sm:p-8">
                    {activeNav === "Overview" ? (
                        <>
                            <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 p-6 text-white shadow-xl shadow-brand-500/20 sm:p-10">
                                <div className="relative z-10 max-w-xl">
                                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold">
                                        <span className="h-2 w-2 rounded-full bg-emerald-300" />
                                        Admin workspace
                                    </div>
                                    <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">
                                        Your seafood business,
                                        <br />
                                        <span className="text-amber-200">at a glance.</span>
                                    </h2>
                                    <p className="mt-3 max-w-md text-sm leading-6 text-brand-100">
                                        Keep track of incoming orders, payments and
                                        fulfilment from one simple dashboard.
                                    </p>
                                    <button
                                        onClick={() => setActiveNav("Orders")}
                                        className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-brand-700 shadow-lg shadow-black/20 transition hover:scale-105 active:scale-95"
                                    >
                                        View all orders <ShoppingCart size={17} />
                                    </button>
                                </div>
                                <div className="pointer-events-none absolute -right-12 -top-20 h-72 w-72 rounded-full border-[35px] border-white/10" />
                                <div className="pointer-events-none absolute -bottom-32 right-24 h-64 w-64 rounded-full bg-brand-300/20 blur-2xl" />
                                <Fish
                                    className="pointer-events-none absolute bottom-5 right-8 hidden text-white/20 sm:block"
                                    size={150}
                                    strokeWidth={1}
                                />
                            </section>

                            <OrdersPanel
                                mode="overview"
                                orders={orders}
                                loading={ordersLoading}
                                error={ordersError}
                                onReload={() => loadOrders()}
                                onUpdateStatus={updateOrderStatus}
                                onViewAll={() => setActiveNav("Orders")}
                            />
                        </>
                    ) : activeNav === "Orders" ? (
                        <OrdersPanel
                            mode="orders"
                            orders={orders}
                            loading={ordersLoading}
                            error={ordersError}
                            onReload={() => loadOrders()}
                            onUpdateStatus={updateOrderStatus}
                        />
                    ) : activeNav === "Products & Stock" ? (
                        productsLoading ? (
                            <section className="rounded-3xl border border-brand-100 bg-white p-10 text-center">
                                <p className="font-semibold text-slate-700">
                                    Loading products from MongoDB...
                                </p>
                            </section>
                        ) : productsError ? (
                            <section className="rounded-3xl border border-red-200 bg-white p-8">
                                <h2 className="text-lg font-bold text-red-700">
                                    Could not load inventory
                                </h2>
                                <p className="mt-2 text-sm text-slate-600">
                                    {productsError}
                                </p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="mt-4 rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-white"
                                >
                                    Retry
                                </button>
                            </section>
                        ) : (
                            <InventoryScreen
                                products={products}
                                setProducts={setProducts}
                                editingProduct={editingProduct}
                                setEditingProduct={setEditingProduct}
                                editValues={editValues}
                                setEditValues={setEditValues}
                                adminToken={adminToken}
                            />
                        )
                    ) : (
                        <section className="rounded-[2rem] border border-brand-100 bg-white p-8 shadow-soft sm:p-12">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                                {activeNav === "Customers" ? (
                                    <Users size={27} />
                                ) : (
                                    <Settings size={27} />
                                )}
                            </div>
                            <h2 className="mt-5 font-display text-2xl font-extrabold text-brand-900">
                                {activeNav}
                            </h2>
                            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                                This section will be developed in a later phase.
                            </p>
                            <button
                                onClick={() => setActiveNav("Overview")}
                                className="mt-6 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-6 py-3 text-sm font-bold text-white shadow-md shadow-brand-500/30 transition hover:opacity-90"
                            >
                                Back to overview
                            </button>
                        </section>
                    )}

                    <footer className="flex flex-col gap-2 pb-3 text-xs text-slate-400 sm:flex-row sm:justify-between">
                        <span>© VARDAN AQUA FOODS</span>
                        <span>Admin dashboard</span>
                    </footer>
                </div>
            </main>
        </div>
    );
}

function ShieldCheckIcon() {
    return <CheckCircle2 size={19} />;
}

function InventoryScreen({
    products,
    setProducts,
    editingProduct,
    setEditingProduct,
    editValues,
    setEditValues,
    adminToken,
}) {
    const [search, setSearch] = useState("");
    const [stockFilter, setStockFilter] = useState("All");
    const [categoryFilter, setCategoryFilter] = useState("All");
    const [showAddForm, setShowAddForm] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: "",
        category: "",
        variants: [
            { size: "S", pricePerKg: "", stockKg: "" },
            { size: "M", pricePerKg: "", stockKg: "" },
            { size: "L", pricePerKg: "", stockKg: "" },
        ],
        image: null,
    });
    const [addingProduct, setAddingProduct] = useState(false);
    function updateNewVariant(index, field, value) {
        setNewProduct((current) => ({
            ...current,
            variants: current.variants.map((variant, i) =>
                i === index ? { ...variant, [field]: value } : variant
            ),
        }));
    }

    function removeNewVariant(index) {
        setNewProduct((current) => ({
            ...current,
            variants: current.variants.filter((_, i) => i !== index),
        }));
    }

    function addNewVariant() {
        const availableSizes = ["S", "M", "L"].filter(
            (size) => !newProduct.variants.some((variant) => variant.size === size)
        );

        if (availableSizes.length === 0) return;

        setNewProduct((current) => ({
            ...current,
            variants: [
                ...current.variants,
                {
                    size: availableSizes[0],
                    pricePerKg: "",
                    stockKg: "",
                },
            ],
        }));
    }

    async function handleAddProduct(event) {
        event.preventDefault();

        const name = newProduct.name.trim();
        const category = newProduct.category;

        const variants = newProduct.variants.map((variant) => ({
            size: variant.size,
            pricePerKg: Number(variant.pricePerKg),
            stockKg: Number(variant.stockKg),
        }));

        if (!name || !category) {
            alert("Please enter the product name and category.");
            return;
        }

        if (
            variants.length === 0 ||
            newProduct.variants.some(
                (variant) =>
                    variant.pricePerKg === "" ||
                    variant.stockKg === "" ||
                    !Number.isFinite(Number(variant.pricePerKg)) ||
                    !Number.isFinite(Number(variant.stockKg)) ||
                    Number(variant.pricePerKg) < 0 ||
                    Number(variant.stockKg) < 0
            )
        ) {
            alert("Please enter a valid price and stock for every size.");
            return;
        }
        if (variants.some((variant) => !Number.isInteger(variant.stockKg))) {
            alert("Stock must be a whole number of kg.");
            return;
        }
        setAddingProduct(true);

        try {
            let imageUrl = "";

            // Step A: Upload the selected image to Cloudinary
            if (newProduct.image) {
                const imageFormData = new FormData();
                imageFormData.append("image", newProduct.image);

                const uploadResponse = await fetch(
                    "http://localhost:5000/api/uploads",
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${adminToken}`,
                        },
                        body: imageFormData,
                    }
                );

                const uploadData = await uploadResponse.json();

                if (!uploadResponse.ok || !uploadData.success) {
                    alert(uploadData.message || "Image upload failed.");
                    return;
                }

                imageUrl = uploadData.imageUrl;
            }

            // Step B: Save product details and image URL
            const response = await fetch(
                "http://localhost:5000/api/products",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminToken}`,
                    },
                    body: JSON.stringify({
                        name,
                        category,
                        variants,
                        imageUrl,
                    }),
                }
            );


            const data = await response.json();

            if (!response.ok || !data.success) {
                if (response.status === 401 || response.status === 403) {
                    alert("Your admin session may have expired. Please log in again.");
                } else {
                    alert(data.message || "Could not add the product.");
                }
                return;
            }

            const savedProduct = data.product;

            setProducts((current) => [
                ...current,
                {
                    ...savedProduct,
                    id: savedProduct._id,
                    available:
                        savedProduct.available ??
                        Number(savedProduct.stockKg) > 0,
                },
            ]);

            setNewProduct({
                name: "",
                category: "",
                variants: [
                    { size: "S", pricePerKg: "", stockKg: "" },
                    { size: "M", pricePerKg: "", stockKg: "" },
                    { size: "L", pricePerKg: "", stockKg: "" },
                ],
                image: null,
            });

            setShowAddForm(false);
            alert("Product added successfully!");
        } catch (error) {
            console.error("Add product error:", error);
            alert("Something went wrong. Check that your backend is running.");
        } finally {
            setAddingProduct(false);
        }
    }


    const money = (amount) =>
        new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
        }).format(amount);

    const visibleProducts = products.filter((product) => {
        const matchesSearch =
            product.name.toLowerCase().includes(search.toLowerCase()) ||
            product.category.toLowerCase().includes(search.toLowerCase());

        const matchesStock =
            stockFilter === "All" ||
            (stockFilter === "In Stock" && product.available) ||
            (stockFilter === "Out of Stock" && !product.available);

        const matchesCategory =
            categoryFilter === "All" ||
            product.category === categoryFilter;

        return matchesSearch && matchesStock && matchesCategory;
    });
    const inStockCount = products.filter((p) => p.available).length;
    const outOfStockCount = products.length - inStockCount;




    async function saveProduct(id) {
        const variants = editValues.variants?.map((variant) => ({
            size: variant.size,
            pricePerKg: Number(variant.pricePerKg),
            stockKg: Number(variant.stockKg),
            available: Boolean(variant.available),
        }));

        if (
            !variants ||
            variants.length === 0 ||
            editValues.variants.some(
                (variant) =>
                    variant.pricePerKg === "" ||
                    variant.stockKg === "" ||
                    !Number.isFinite(Number(variant.pricePerKg)) ||
                    !Number.isFinite(Number(variant.stockKg)) ||
                    Number(variant.pricePerKg) < 0 ||
                    Number(variant.stockKg) < 0
            )
        ) {
            alert("Enter a valid, non-negative price and stock for every size.");
            return;
        }

        if (variants.some((variant) => !Number.isInteger(variant.stockKg))) {
            alert("Stock must be a whole number of kg.");
            return;
        }

        try {
            const response = await fetch(
                `http://localhost:5000/api/products/${id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminToken}`,
                    },
                    body: JSON.stringify({ variants }),
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                if (response.status === 401 || response.status === 403) {
                    alert("Your admin session may have expired. Please log in again.");
                } else {
                    alert(data.message || "Could not save the product.");
                }
                return;
            }

            const updatedProduct = data.product;

            setProducts((current) =>
                current.map((product) =>
                    product.id === id
                        ? {
                            ...product,
                            ...updatedProduct,
                            id: updatedProduct._id || product.id,
                        }
                        : product
                )
            );

            setEditingProduct(null);
            alert("Product updated successfully!");
        } catch (error) {
            console.error("Save product error:", error);
            alert("Could not connect to the backend. Check that your server is running.");
        }
    }


    async function deleteProduct(product) {
        const confirmed = window.confirm(
            `Are you sure you want to delete "${product.name}"? This cannot be undone.`
        );

        if (!confirmed) return;

        try {
            const response = await fetch(
                `http://localhost:5000/api/products/${product.id}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${adminToken}`,
                    },
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                alert(data.message || "Could not delete product.");
                return;
            }

            setProducts((current) =>
                current.filter((item) => item.id !== product.id)
            );

            if (editingProduct === product.id) {
                setEditingProduct(null);
            }

            alert("Product deleted successfully!");
        } catch (error) {
            console.error("Delete product error:", error);
            alert("Could not connect to the backend. Check that your server is running.");
        }
    }




    async function toggleAvailability(product) {
        const nextAvailability = !product.available;

        try {
            const response = await fetch(
                `http://localhost:5000/api/products/${product.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminToken}`,
                    },
                    body: JSON.stringify({
                        available: nextAvailability,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Failed to update availability."
                );
            }

            const updatedProduct = data.product;

            setProducts((current) =>
                current.map((item) =>
                    item.id === product.id
                        ? {
                            ...item,
                            ...(updatedProduct || {}),
                            id: updatedProduct?._id || item.id,
                            available: nextAvailability,
                        }
                        : item
                )
            );

            alert(
                nextAvailability
                    ? "Product marked in stock!"
                    : "Product marked out of stock!"
            );
        } catch (error) {
            console.error("Availability update failed:", error);
            alert(error.message || "Could not update product availability.");
        }
    }


    return (
        <div className="space-y-7">

            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                        Store management
                    </p>
                    <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">
                        Products & Inventory
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                        Manage seafood prices, stock and availability.
                    </p>
                </div>

                <button
                    onClick={() => setShowAddForm((current) => !current)}
                    className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                    {showAddForm ? "Cancel" : "+ Add Product"}
                </button>
            </section>

            {showAddForm && (
                <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6">
                    <h3 className="text-lg font-extrabold">Add a seafood product</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        Enter the product details to add it to your inventory.
                    </p>

                    <form
                        className="mt-5 grid gap-4 sm:grid-cols-2"
                        onSubmit={handleAddProduct}
                    >
                        <div>
                            <label className="mb-2 block text-sm font-semibold">Product name</label>
                            <input
                                required
                                value={newProduct.name}
                                onChange={(event) =>
                                    setNewProduct((current) => ({
                                        ...current,
                                        name: event.target.value,
                                    }))
                                }
                                placeholder="e.g. Seer Fish"
                                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
                            />
                        </div>


                        <div>
                            <label className="mb-2 block text-sm font-semibold">
                                Category
                            </label>
                            <select
                                required
                                value={newProduct.category}
                                onChange={(event) =>
                                    setNewProduct((current) => ({
                                        ...current,
                                        category: event.target.value,
                                    }))
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
                            >
                                <option value="">Select a category</option>
                                <option value="Alive Fish">Alive Fish</option>
                                <option value="Chilled Fish">Chilled Fish</option>
                                <option value="Fresh Godavari Fish">Fresh Godavari Fish</option>
                                <option value="Crabs & Prawns">Crabs & Prawns</option>
                                <option value="Dried Seafood">Dried Seafood</option>
                                <option value="SPL Meat">SPL Meat</option>
                            </select>
                        </div>



                        <div className="sm:col-span-2">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h4 className="font-bold text-slate-800">
                                        Size-wise pricing & stock
                                    </h4>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Set a separate price and stock for each size.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={addNewVariant}
                                    disabled={newProduct.variants.length >= 3}
                                    className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                                >
                                    + Add Size
                                </button>
                            </div>

                            <div className="space-y-3">
                                {newProduct.variants.map((variant, index) => (
                                    <div
                                        key={variant.size}
                                        className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[0.7fr_1fr_1fr_auto] sm:items-end"
                                    >
                                        <div>
                                            <label className="mb-2 block text-sm font-semibold">
                                                Size
                                            </label>
                                            <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">
                                                {variant.size}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm font-semibold">
                                                Price per kg (₹)
                                            </label>
                                            <input
                                                required
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={variant.pricePerKg}
                                                onChange={(event) =>
                                                    updateNewVariant(index, "pricePerKg", event.target.value)
                                                }
                                                placeholder="e.g. 850"
                                                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm font-semibold">
                                                Stock (kg)
                                            </label>
                                            <input
                                                required
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={variant.stockKg}
                                                onChange={(event) =>
                                                    updateNewVariant(index, "stockKg", event.target.value)
                                                }
                                                placeholder="e.g. 10"
                                                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => removeNewVariant(index)}
                                            disabled={newProduct.variants.length <= 1}
                                            className="rounded-lg border border-red-200 px-3 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>


                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                                Product Image
                            </label>

                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(event) =>
                                    setNewProduct((current) => ({
                                        ...current,
                                        image: event.target.files?.[0] || null,
                                    }))
                                }
                                className="w-full rounded-lg border border-gray-300 p-3"
                            />

                            {newProduct.image && (
                                <p className="mt-2 text-sm text-green-700">
                                    Selected: {newProduct.image.name}
                                </p>
                            )}
                        </div>


                        <button
                            type="submit"
                            disabled={addingProduct}
                            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 sm:col-span-2"
                        >
                            {addingProduct ? "Adding..." : "Add to Inventory"}
                        </button>
                    </form>
                </section>
            )}


            <section className="grid gap-4 sm:grid-cols-3">
                <InventoryStat
                    label="Total products"
                    value={products.length}
                    description="Products in the demo catalogue"
                    color="blue"
                />
                <InventoryStat
                    label="Available"
                    value={inStockCount}
                    description="Marked available"
                    color="green"
                />
                <InventoryStat
                    label="Out of stock"
                    value={outOfStockCount}
                    description="Not available for sale"
                    color="red"
                />
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h3 className="text-lg font-extrabold">Seafood catalogue</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Edit a product to update its demo price and stock.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search seafood..."
                            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                        />

                        <select
                            value={stockFilter}
                            onChange={(event) => setStockFilter(event.target.value)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-400"
                        >
                            <option>All</option>
                            <option>In Stock</option>
                            <option>Out of Stock</option>
                        </select>
                        <select
                            value={categoryFilter}
                            onChange={(event) => setCategoryFilter(event.target.value)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-400"
                        >
                            <option value="All">All Categories</option>
                            <option value="Alive Fish">Alive Fish</option>
                            <option value="Chilled Fish">Chilled Fish</option>
                            <option value="Fresh Godavari Fish">Fresh Godavari Fish</option>
                            <option value="Crabs & Prawns">Crabs & Prawns</option>
                            <option value="Dried Seafood">Dried Seafood</option>
                            <option value="SPL Meat">SPL Meat</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Product</th>
                                <th className="px-6 py-4">Size-wise Price & Stock</th>
                                <th className="px-6 py-4">Availability</th>
                                <th className="px-6 py-4">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                            {visibleProducts.map((product) => {
                                const isEditing = editingProduct === product.id;

                                return (
                                    <tr key={product.id} className="hover:bg-slate-50/70">
                                        <td className="px-6 py-5">
                                            <p className="font-bold">{product.name}</p>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {product.id} · {product.category}
                                            </p>
                                        </td>


                                        <td className="px-6 py-5">
                                            {isEditing ? (

                                                <div className="min-w-[320px] space-y-3">
                                                    {editValues.variants.map((variant, index) => (
                                                        <div
                                                            key={variant.size}
                                                            className="grid grid-cols-[40px_1fr_1fr] items-center gap-2"
                                                        >
                                                            <span className="text-sm font-bold">
                                                                {variant.size}
                                                            </span>

                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                aria-label={`${variant.size} price per kg`}
                                                                value={variant.pricePerKg}
                                                                onChange={(event) =>
                                                                    setEditValues((current) => ({
                                                                        ...current,
                                                                        variants: current.variants.map((item, i) =>
                                                                            i === index
                                                                                ? { ...item, pricePerKg: event.target.value }
                                                                                : item
                                                                        ),
                                                                    }))
                                                                }
                                                                placeholder="Price ₹"
                                                                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-blue-400"
                                                            />

                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.5"
                                                                aria-label={`${variant.size} stock in kg`}
                                                                value={variant.stockKg}
                                                                onChange={(event) =>
                                                                    setEditValues((current) => ({
                                                                        ...current,
                                                                        variants: current.variants.map((item, i) =>
                                                                            i === index
                                                                                ? {
                                                                                    ...item,
                                                                                    stockKg: event.target.value,
                                                                                    available:
                                                                                        Number(event.target.value) > 0
                                                                                            ? true
                                                                                            : false,
                                                                                }
                                                                                : item
                                                                        ),
                                                                    }))
                                                                }
                                                                placeholder="Stock kg"
                                                                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-blue-400"
                                                            />

                                                            <span className="text-xs font-medium text-slate-500">
                                                                Availability
                                                            </span>

                                                            <select
                                                                aria-label={`${variant.size} availability`}
                                                                value={variant.available ? "in" : "out"}
                                                                onChange={(event) =>
                                                                    setEditValues((current) => ({
                                                                        ...current,
                                                                        variants: current.variants.map((item, i) =>
                                                                            i === index
                                                                                ? {
                                                                                    ...item,
                                                                                    available: event.target.value === "in",
                                                                                }
                                                                                : item
                                                                        ),
                                                                    }))
                                                                }
                                                                className="col-span-2 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-blue-400"
                                                            >
                                                                <option value="in">In Stock</option>
                                                                <option value="out">Out of Stock</option>
                                                            </select>
                                                        </div>
                                                    ))}
                                                </div>

                                            ) : (
                                                <div className="space-y-2">
                                                    {(product.variants?.length
                                                        ? product.variants
                                                        : [{
                                                            size: "S",
                                                            pricePerKg: product.pricePerKg ?? 0,
                                                            stockKg: product.stockKg ?? 0,
                                                        }]
                                                    ).map((variant) => (
                                                        <div
                                                            key={variant.size}
                                                            className="flex min-w-[220px] items-center justify-between gap-4 text-sm"
                                                        >
                                                            <span className="font-bold text-slate-700">
                                                                {variant.size}
                                                            </span>
                                                            <span className="text-slate-600">
                                                                {money(variant.pricePerKg)}/kg
                                                            </span>
                                                            <span className="text-slate-500">
                                                                {Number(variant.stockKg)} kg
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>


                                        <td className="px-6 py-5">
                                            <span
                                                className={`rounded-full px-3 py-1.5 text-xs font-bold ${product.available
                                                    ? "bg-emerald-50 text-emerald-700"
                                                    : "bg-red-50 text-red-700"
                                                    }`}
                                            >
                                                {product.available ? "In Stock" : "Out of Stock"}
                                            </span>
                                        </td>

                                        <td className="px-6 py-5">
                                            {isEditing ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => saveProduct(product.id)}
                                                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingProduct(null)}
                                                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditingProduct(product.id);

                                                            setEditValues({
                                                                variants: (
                                                                    product.variants?.length
                                                                        ? product.variants
                                                                        : [
                                                                            {
                                                                                size: "S",
                                                                                pricePerKg: product.pricePerKg ?? 0,
                                                                                stockKg: product.stockKg ?? 0,
                                                                            },
                                                                        ]
                                                                ).map((variant) => ({
                                                                    size: variant.size,
                                                                    pricePerKg: String(variant.pricePerKg ?? ""),
                                                                    stockKg: String(variant.stockKg ?? ""),
                                                                    available:
                                                                        variant.available ?? Number(variant.stockKg) > 0,
                                                                })),
                                                            });

                                                        }}
                                                        className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                                                    >
                                                        Edit
                                                    </button>

                                                    <button
                                                        onClick={() => toggleAvailability(product)}
                                                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                                                    >
                                                        {product.available ? "Mark out" : "Mark in"}
                                                    </button>

                                                    <button
                                                        onClick={() => deleteProduct(product)}
                                                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                                                    >
                                                        Delete
                                                    </button>

                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}

                            {visibleProducts.length === 0 && (
                                <tr>
                                    <td
                                        colSpan="5"
                                        className="px-6 py-12 text-center text-sm text-slate-400"
                                    >
                                        No matching products found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-400">
                    Showing {visibleProducts.length} of {products.length} demo products.
                    Changes are temporary and reset when the page reloads.
                </div>
            </section>
        </div>
    );
}

function InventoryStat({ label, value, description, color }) {
    const styles = {
        blue: "bg-blue-50 text-blue-600",
        green: "bg-emerald-50 text-emerald-600",
        red: "bg-red-50 text-red-600",
    };

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-extrabold">{value}</p>
            <p className="mt-2 text-xs text-slate-400">{description}</p>
            <div className={`mt-4 h-1.5 w-12 rounded-full ${styles[color].split(" ")[0]}`} />
        </div>
    );
}
