#!/usr/bin/env node

/**
 * Generate an extra large CSV file for performance testing
 * Creates 30 million rows with 20 columns of realistic e-commerce order data
 */

const fs = require('fs');
const path = require('path');

// Configuration
const NUM_ROWS = 30_000_000;
const OUTPUT_FILE = path.join(__dirname, 'orders_30m_20col.csv');
const BATCH_SIZE = 100_000; // Write in batches to avoid memory issues

// Data generators for realistic values
const firstNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'William', 
                     'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia', 'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander',
                     'Sofia', 'Michael', 'Ella', 'Daniel', 'Abigail', 'Matthew', 'Emily', 'David', 'Elizabeth', 'Joseph'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
                   'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris',
                   'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres'];
const products = ['Laptop', 'Smartphone', 'Tablet', 'Headphones', 'Monitor', 'Keyboard', 'Mouse', 'Webcam', 
                  'Speaker', 'Charger', 'Cable', 'Case', 'Stand', 'Adapter', 'Battery', 'Printer', 'Router',
                  'USB Drive', 'External HDD', 'SSD', 'Graphics Card', 'RAM Module', 'Motherboard'];
const categories = ['Electronics', 'Computers', 'Audio', 'Accessories', 'Peripherals', 'Storage', 'Networking', 'Components'];
const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'On Hold'];
const countries = ['USA', 'Canada', 'UK', 'Germany', 'France', 'Spain', 'Italy', 'Japan', 'Australia', 'Brazil',
                   'Mexico', 'Netherlands', 'Sweden', 'Norway', 'India', 'China', 'South Korea', 'Singapore'];
const paymentMethods = ['Credit Card', 'PayPal', 'Debit Card', 'Bank Transfer', 'Apple Pay', 'Google Pay', 'Crypto', 'Cash on Delivery'];
const shippingMethods = ['Standard', 'Express', 'Next Day', 'International', '2-Day', 'Ground'];
const warehouses = ['US-East', 'US-West', 'EU-Central', 'EU-North', 'Asia-Pacific', 'South America', 'Canada'];
const customerTypes = ['Regular', 'Premium', 'VIP', 'New', 'Returning'];
const salesChannels = ['Website', 'Mobile App', 'Phone', 'In-Store', 'Marketplace', 'Partner'];

// Helper functions
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (array) => array[Math.floor(Math.random() * array.length)];
const randomPrice = () => (Math.random() * 1000 + 10).toFixed(2);
const randomDate = (startYear = 2020, endYear = 2025) => {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  const randomTime = start + Math.random() * (end - start);
  const date = new Date(randomTime);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD format
};
const randomEmail = (firstName, lastName) => {
  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'company.com'];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomChoice(domains)}`;
};
const randomPhone = () => {
  return `+1-${randomInt(200, 999)}-${randomInt(200, 999)}-${randomInt(1000, 9999)}`;
};
const randomDiscount = () => {
  const hasDiscount = Math.random() > 0.7; // 30% chance of discount
  return hasDiscount ? randomInt(5, 30) : 0;
};

// Generate a single row of data
const generateRow = (orderId) => {
  const firstName = randomChoice(firstNames);
  const lastName = randomChoice(lastNames);
  const customerName = `${firstName} ${lastName}`;
  const customerEmail = randomEmail(firstName, lastName);
  const customerPhone = randomPhone();
  const orderDate = randomDate();
  const product = randomChoice(products);
  const category = randomChoice(categories);
  const quantity = randomInt(1, 10);
  const unitPrice = randomPrice();
  const subtotal = (quantity * parseFloat(unitPrice)).toFixed(2);
  const discountPercent = randomDiscount();
  const discountAmount = (parseFloat(subtotal) * discountPercent / 100).toFixed(2);
  const taxAmount = ((parseFloat(subtotal) - parseFloat(discountAmount)) * 0.08).toFixed(2); // 8% tax
  const totalAmount = (parseFloat(subtotal) - parseFloat(discountAmount) + parseFloat(taxAmount)).toFixed(2);
  const status = randomChoice(statuses);
  const country = randomChoice(countries);
  const paymentMethod = randomChoice(paymentMethods);
  const shippingMethod = randomChoice(shippingMethods);
  const warehouse = randomChoice(warehouses);
  const customerType = randomChoice(customerTypes);
  const salesChannel = randomChoice(salesChannels);
  
  return [
    orderId,
    orderDate,
    customerName,
    customerEmail,
    customerPhone,
    product,
    category,
    quantity,
    unitPrice,
    subtotal,
    discountPercent,
    discountAmount,
    taxAmount,
    totalAmount,
    status,
    country,
    paymentMethod,
    shippingMethod,
    warehouse,
    customerType,
    salesChannel
  ].join(',');
};

// Main generation function
const generateCSV = () => {
  console.log('🚀 Starting EXTRA LARGE CSV generation...');
  console.log(`   Target: ${NUM_ROWS.toLocaleString()} rows`);
  console.log(`   Columns: 21 (including OrderID)`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log('');

  const startTime = Date.now();
  
  // Create write stream
  const stream = fs.createWriteStream(OUTPUT_FILE, { flags: 'w' });
  
  // Write header (21 columns total)
  const header = 'OrderID,OrderDate,CustomerName,CustomerEmail,CustomerPhone,Product,Category,Quantity,UnitPrice,Subtotal,DiscountPercent,DiscountAmount,TaxAmount,TotalAmount,Status,Country,PaymentMethod,ShippingMethod,Warehouse,CustomerType,SalesChannel\n';
  stream.write(header);
  
  let rowsWritten = 0;
  
  // Generate and write rows in batches
  const writeBatch = () => {
    let batch = '';
    const batchEnd = Math.min(rowsWritten + BATCH_SIZE, NUM_ROWS);
    
    for (let i = rowsWritten; i < batchEnd; i++) {
      batch += generateRow(i + 1) + '\n';
    }
    
    stream.write(batch);
    rowsWritten = batchEnd;
    
    // Progress reporting every 1M rows
    if (rowsWritten % 1_000_000 === 0 || rowsWritten === NUM_ROWS) {
      const now = Date.now();
      const elapsed = ((now - startTime) / 1000).toFixed(1);
      const rate = Math.round(rowsWritten / (now - startTime) * 1000);
      const progress = ((rowsWritten / NUM_ROWS) * 100).toFixed(1);
      
      console.log(`   ${rowsWritten.toLocaleString()} rows (${progress}%) - ${elapsed}s elapsed - ${rate.toLocaleString()} rows/sec`);
    }
    
    if (rowsWritten < NUM_ROWS) {
      // Schedule next batch
      setImmediate(writeBatch);
    } else {
      // All done
      stream.end(() => {
        const endTime = Date.now();
        const totalTime = ((endTime - startTime) / 1000).toFixed(1);
        const fileSize = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
        
        console.log('');
        console.log('✅ CSV generation complete!');
        console.log(`   Rows: ${NUM_ROWS.toLocaleString()}`);
        console.log(`   Columns: 21`);
        console.log(`   File size: ${fileSize} MB`);
        console.log(`   Time: ${totalTime} seconds`);
        console.log(`   Average rate: ${Math.round(NUM_ROWS / totalTime).toLocaleString()} rows/sec`);
        console.log('');
        console.log('💡 Next steps:');
        console.log('   Convert to QVD using Qlik Sense or QlikView');
        console.log('');
      });
    }
  };
  
  // Start writing
  writeBatch();
};

// Run the generator
console.log('');
console.log('═══════════════════════════════════════════');
console.log('  EXTRA LARGE CSV Generator for QVD Testing');
console.log('═══════════════════════════════════════════');
console.log('');

generateCSV();
