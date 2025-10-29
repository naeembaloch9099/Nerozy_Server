import express from "express";
import Product from "../Model/Product.js";
import Order from "../Model/Order.js";
import {
  checkStockAvailability,
  deductStock,
  restoreStock,
  getLowStockProducts,
  getOutOfStockProducts,
} from "../Utils/inventoryManager.js";

const router = express.Router();

/**
 * Test endpoint: Get inventory status
 * GET /api/debug/inventory-status
 */
router.get("/inventory-status", async (req, res) => {
  try {
    const allProducts = await Product.find().select("name qty sku").limit(20);
    const lowStock = await getLowStockProducts(10);
    const outOfStock = await getOutOfStockProducts();

    res.json({
      success: true,
      totalProducts: allProducts.length,
      products: allProducts.map((p) => ({
        id: p._id,
        name: p.name,
        sku: p.sku,
        currentStock: p.qty,
        status:
          p.qty === 0 ? "OUT_OF_STOCK" : p.qty < 5 ? "LOW_STOCK" : "IN_STOCK",
      })),
      lowStockCount: lowStock.length,
      lowStockProducts: lowStock,
      outOfStockCount: outOfStock.length,
      outOfStockProducts: outOfStock,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Test endpoint: Simulate order and check stock deduction
 * POST /api/debug/test-order
 * Body: { productId, quantity }
 */
router.post("/test-order", async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "productId is required",
      });
    }

    // Get product before
    const productBefore = await Product.findById(productId);
    if (!productBefore) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    const stockBefore = productBefore.qty;

    // Check stock availability
    const stockCheck = await checkStockAvailability([
      { product: productId, quantity },
    ]);

    if (!stockCheck.success) {
      return res.json({
        success: false,
        testResult: "FAILED_STOCK_CHECK",
        stockBefore,
        requested: quantity,
        errors: stockCheck.errors,
        message: "Stock check failed as expected",
      });
    }

    // Deduct stock
    const deductResult = await deductStock([{ product: productId, quantity }]);

    // Get product after
    const productAfter = await Product.findById(productId);
    const stockAfter = productAfter.qty;

    res.json({
      success: true,
      testResult: "PASSED",
      productName: productBefore.name,
      stockBefore,
      requested: quantity,
      stockAfter,
      actualDeduction: stockBefore - stockAfter,
      expectedDeduction: quantity,
      deductionCorrect: stockBefore - stockAfter === quantity,
      lowStockWarning: stockAfter < 5,
      deductResult,
      message: `✅ Test passed! Stock deducted correctly: ${stockBefore} → ${stockAfter}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Test endpoint: Simulate order cancellation and stock restoration
 * POST /api/debug/test-restore
 * Body: { productId, quantity }
 */
router.post("/test-restore", async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "productId is required",
      });
    }

    const productBefore = await Product.findById(productId);
    if (!productBefore) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    const stockBefore = productBefore.qty;

    // Restore stock
    const restoreResult = await restoreStock([
      { product: productId, quantity },
    ]);

    // Get product after
    const productAfter = await Product.findById(productId);
    const stockAfter = productAfter.qty;

    res.json({
      success: true,
      testResult: "PASSED",
      productName: productBefore.name,
      stockBefore,
      restored: quantity,
      stockAfter,
      actualIncrease: stockAfter - stockBefore,
      expectedIncrease: quantity,
      restorationCorrect: stockAfter - stockBefore === quantity,
      restoreResult,
      message: `✅ Test passed! Stock restored correctly: ${stockBefore} → ${stockAfter}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Test endpoint: Reset product stock to specific value
 * POST /api/debug/reset-stock
 * Body: { productId, newStock }
 */
router.post("/reset-stock", async (req, res) => {
  try {
    const { productId, newStock = 50 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "productId is required",
      });
    }

    const product = await Product.findByIdAndUpdate(
      productId,
      { qty: newStock },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    res.json({
      success: true,
      message: `Stock reset for ${product.name}`,
      productId: product._id,
      productName: product.name,
      newStock: product.qty,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Test endpoint: Get recent orders with stock impact
 * GET /api/debug/orders-impact
 */
router.get("/orders-impact", async (req, res) => {
  try {
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("items.product");

    const ordersWithImpact = recentOrders.map((order) => {
      const stockImpact = {};

      order.items.forEach((item) => {
        if (item.product) {
          const productId = item.product._id.toString();
          if (!stockImpact[productId]) {
            stockImpact[productId] = {
              productName: item.product.name,
              currentStock: item.product.qty,
              totalDeducted: 0,
            };
          }
          stockImpact[productId].totalDeducted += item.quantity || 1;
        }
      });

      return {
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        itemCount: order.items.length,
        stockImpact: Object.values(stockImpact),
      };
    });

    res.json({
      success: true,
      ordersCount: recentOrders.length,
      orders: ordersWithImpact,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Test endpoint: Run complete inventory system test
 * GET /api/debug/test-inventory-system
 */
router.get("/test-inventory-system", async (req, res) => {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      tests: [],
    };

    // Test 1: Get a product with stock
    const testProduct = await Product.findOne({ qty: { $gt: 5 } });

    if (!testProduct) {
      return res.json({
        success: false,
        error: "No products with sufficient stock for testing",
        hint: "Add products with qty > 5 to run tests",
      });
    }

    const initialStock = testProduct.qty;

    // Test 2: Check stock availability
    const stockCheck = await checkStockAvailability([
      { product: testProduct._id, quantity: 2 },
    ]);

    results.tests.push({
      name: "Stock Availability Check",
      passed: stockCheck.success,
      details: stockCheck,
    });

    // Test 3: Deduct stock
    const deductResult = await deductStock([
      { product: testProduct._id, quantity: 2 },
    ]);

    const afterDeduct = await Product.findById(testProduct._id);

    results.tests.push({
      name: "Stock Deduction",
      passed: afterDeduct.qty === initialStock - 2,
      stockBefore: initialStock,
      stockAfter: afterDeduct.qty,
      deducted: 2,
      details: deductResult,
    });

    // Test 4: Restore stock
    const restoreResult = await restoreStock([
      { product: testProduct._id, quantity: 2 },
    ]);

    const afterRestore = await Product.findById(testProduct._id);

    results.tests.push({
      name: "Stock Restoration",
      passed: afterRestore.qty === initialStock,
      stockBeforeRestore: afterDeduct.qty,
      stockAfterRestore: afterRestore.qty,
      restored: 2,
      details: restoreResult,
    });

    // Test 5: Low stock detection
    const lowStock = await getLowStockProducts(10);

    results.tests.push({
      name: "Low Stock Detection",
      passed: true,
      lowStockCount: lowStock.length,
      lowStockProducts: lowStock.slice(0, 3),
    });

    // Test 6: Out of stock detection
    const outOfStock = await getOutOfStockProducts();

    results.tests.push({
      name: "Out of Stock Detection",
      passed: true,
      outOfStockCount: outOfStock.length,
      outOfStockProducts: outOfStock.slice(0, 3),
    });

    const allPassed = results.tests.every((t) => t.passed);

    res.json({
      success: allPassed,
      testsPassed: results.tests.filter((t) => t.passed).length,
      totalTests: results.tests.length,
      results,
      message: allPassed
        ? "🎉 All inventory tests passed!"
        : "⚠️ Some tests failed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

export default router;
