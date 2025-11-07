#!/usr/bin/env node

/**
 * Generate a large CSV file for performance testing
 * Creates 20 million rows with 10 columns of realistic e-commerce order data
 */

const fs = require('fs');
const path = require('path');

// Configuration
const NUM_ROWS = 20_000_000;
const OUTPUT_FILE = path.join(__dirname, 'orders_20m.csv');
const BATCH_SIZE = 100_000; // Write in batches to avoid memory issues

// Data generators for realistic values
const firstNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'William', 
                     'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia', 'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
                   'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris'];
const products = ['Laptop', 'Smartphone', 'Tablet', 'Headphones', 'Monitor', 'Keyboard', 'Mouse', 'Webcam', 
                  'Speaker', 'Charger', 'Cable', 'Case', 'Stand', 'Adapter', 'Battery'];
const categories = ['Electronics', 'Computers', 'Audio', 'Accessories', 'Peripherals'];
const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const countries = ['USA', 'Canada', 'UK', 'Germany', 'France', 'Spain', 'Italy', 'Japan', 'Australia', 'Brazil'];
const paymentMethods = ['Credit Card', 'PayPal', 'Debit Card', 'Bank Transfer', 'Apple Pay', 'Google Pay'];

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

// Generate a single row of data
const generateRow = (orderId) => {
  const firstName = randomChoice(firstNames);
  const lastName = randomChoice(lastNames);
  const customerName = `${firstName} ${lastName}`;
  const orderDate = randomDate();
  const product = randomChoice(products);
  const category = randomChoice(categories);
  const quantity = randomInt(1, 10);
  const unitPrice = randomPrice();
  const totalAmount = (quantity * parseFloat(unitPrice)).toFixed(2);
  const status = randomChoice(statuses);
  const country = randomChoice(countries);
  const paymentMethod = randomChoice(paymentMethods);
  
  return [
    orderId,
    orderDate,
    customerName,
    product,
    category,
    quantity,
    unitPrice,
    totalAmount,
    status,
    country,
    paymentMethod
  ].join(',');
};

// Main generation function
const generateCSV = () => {
  console.log('🚀 Starting CSV generation...');
  console.log(`   Target: ${NUM_ROWS.toLocaleString()} rows`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log('');

  const startTime = Date.now();
  
  // Create write stream
  const stream = fs.createWriteStream(OUTPUT_FILE, { flags: 'w' });
  
  // Write header
  const header = 'OrderID,OrderDate,CustomerName,Product,Category,Quantity,UnitPrice,TotalAmount,Status,Country,PaymentMethod\n';
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
console.log('   Large CSV Generator for QVD Testing');
console.log('═══════════════════════════════════════════');
console.log('');

generateCSV();
