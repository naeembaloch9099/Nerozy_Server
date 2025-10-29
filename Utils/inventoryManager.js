import Product from "../Model/Product.js";

/**
 * Check if products have sufficient stock for order
 * @param {Array} items - Array of items with product ID and quantity
 * @returns {Object} - { success: boolean, errors: Array, warnings: Array }
 */
export async function checkStockAvailability(items) {
  const errors = [];
  const warnings = [];
  const stockInfo = [];

  for (const item of items) {
    // Skip if no product ID (guest checkout with name only)
    if (!item.product) {
      continue;
    }

    try {
      const product = await Product.findById(item.product);

      if (!product) {
        errors.push({
          productId: item.product,
          message: "Product not found in database",
        });
        continue;
      }

      const requestedQty = item.quantity || 1;
      const availableQty = product.qty || 0;

      stockInfo.push({
        productId: product._id,
        productName: product.name,
        requested: requestedQty,
        available: availableQty,
        sufficient: availableQty >= requestedQty,
      });

      // Check if insufficient stock
      if (availableQty < requestedQty) {
        errors.push({
          productId: product._id,
          productName: product.name,
          message: `Insufficient stock: Only ${availableQty} available, requested ${requestedQty}`,
          available: availableQty,
          requested: requestedQty,
        });
      }
      // Warning for low stock (less than 5 remaining after order)
      else if (availableQty - requestedQty < 5) {
        warnings.push({
          productId: product._id,
          productName: product.name,
          message: `Low stock warning: Only ${
            availableQty - requestedQty
          } will remain after order`,
          remainingAfter: availableQty - requestedQty,
        });
      }
    } catch (error) {
      errors.push({
        productId: item.product,
        message: `Error checking stock: ${error.message}`,
      });
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    stockInfo,
  };
}

/**
 * Deduct stock for order items
 * @param {Array} items - Array of items with product ID and quantity
 * @returns {Object} - { success: boolean, updated: Array, failed: Array }
 */
export async function deductStock(items) {
  const updated = [];
  const failed = [];

  for (const item of items) {
    // Skip if no product ID
    if (!item.product) {
      continue;
    }

    try {
      const quantityToDeduct = item.quantity || 1;

      // Use atomic operation to prevent race conditions
      const updatedProduct = await Product.findByIdAndUpdate(
        item.product,
        { $inc: { qty: -quantityToDeduct } },
        { new: true, runValidators: true }
      );

      if (updatedProduct) {
        updated.push({
          productId: updatedProduct._id,
          productName: updatedProduct.name,
          deducted: quantityToDeduct,
          remaining: updatedProduct.qty,
          isLowStock: updatedProduct.qty < 5,
        });

        console.log(
          `📦 Stock updated: ${updatedProduct.name} -${quantityToDeduct} (remaining: ${updatedProduct.qty})`
        );
      } else {
        failed.push({
          productId: item.product,
          message: "Product not found",
        });
      }
    } catch (error) {
      failed.push({
        productId: item.product,
        message: `Stock deduction failed: ${error.message}`,
      });
      console.error(
        `❌ Failed to update stock for product ${item.product}:`,
        error
      );
    }
  }

  return {
    success: failed.length === 0,
    updated,
    failed,
  };
}

/**
 * Restore stock (for order cancellation or refund)
 * @param {Array} items - Array of items with product ID and quantity
 * @returns {Object} - { success: boolean, restored: Array, failed: Array }
 */
export async function restoreStock(items) {
  const restored = [];
  const failed = [];

  for (const item of items) {
    if (!item.product) {
      continue;
    }

    try {
      const quantityToRestore = item.quantity || 1;

      const updatedProduct = await Product.findByIdAndUpdate(
        item.product,
        { $inc: { qty: quantityToRestore } },
        { new: true }
      );

      if (updatedProduct) {
        restored.push({
          productId: updatedProduct._id,
          productName: updatedProduct.name,
          restored: quantityToRestore,
          newTotal: updatedProduct.qty,
        });

        console.log(
          `♻️ Stock restored: ${updatedProduct.name} +${quantityToRestore} (new total: ${updatedProduct.qty})`
        );
      } else {
        failed.push({
          productId: item.product,
          message: "Product not found",
        });
      }
    } catch (error) {
      failed.push({
        productId: item.product,
        message: `Stock restoration failed: ${error.message}`,
      });
      console.error(
        `❌ Failed to restore stock for product ${item.product}:`,
        error
      );
    }
  }

  return {
    success: failed.length === 0,
    restored,
    failed,
  };
}

/**
 * Get low stock products (qty < threshold)
 * @param {Number} threshold - Stock threshold (default: 10)
 * @returns {Array} - Array of low stock products
 */
export async function getLowStockProducts(threshold = 10) {
  try {
    const lowStockProducts = await Product.find({
      qty: { $lt: threshold },
    }).select("name qty sku price");

    return lowStockProducts.map((p) => ({
      id: p._id,
      name: p.name,
      sku: p.sku,
      currentStock: p.qty,
      price: p.price,
      severity: p.qty === 0 ? "out-of-stock" : p.qty < 5 ? "critical" : "low",
    }));
  } catch (error) {
    console.error("Failed to get low stock products:", error);
    return [];
  }
}

/**
 * Get out of stock products
 * @returns {Array} - Array of out of stock products
 */
export async function getOutOfStockProducts() {
  try {
    const outOfStock = await Product.find({ qty: { $lte: 0 } }).select(
      "name qty sku price"
    );

    return outOfStock.map((p) => ({
      id: p._id,
      name: p.name,
      sku: p.sku,
      currentStock: p.qty,
      price: p.price,
    }));
  } catch (error) {
    console.error("Failed to get out of stock products:", error);
    return [];
  }
}
