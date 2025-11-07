#!/usr/bin/env node

/**
 * Generate an extra large CSV file with HIGH ENTROPY data for performance testing
 * Creates 30 million rows with 20 columns including GUIDs and unique values
 * This data will NOT compress well in QVD format, providing a worst-case scenario test
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Configuration
const NUM_ROWS = 30_000_000;
const OUTPUT_FILE = path.join(__dirname, "orders_30m_20col_high_entropy.csv");
const BATCH_SIZE = 50_000; // Smaller batches due to GUID generation overhead

// Data generators for realistic values
const firstNames = [
  "Emma",
  "Liam",
  "Olivia",
  "Noah",
  "Ava",
  "Ethan",
  "Sophia",
  "Mason",
  "Isabella",
  "William",
  "Mia",
  "James",
  "Charlotte",
  "Benjamin",
  "Amelia",
  "Lucas",
  "Harper",
  "Henry",
  "Evelyn",
  "Alexander",
  "Sofia",
  "Michael",
  "Ella",
  "Daniel",
  "Abigail",
  "Matthew",
  "Emily",
  "David",
  "Elizabeth",
  "Joseph",
];
const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Anderson",
  "Taylor",
  "Thomas",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Thompson",
  "White",
  "Harris",
  "Clark",
  "Lewis",
  "Robinson",
  "Walker",
  "Young",
  "Allen",
  "King",
  "Wright",
  "Scott",
  "Torres",
];
const products = [
  "Laptop",
  "Smartphone",
  "Tablet",
  "Headphones",
  "Monitor",
  "Keyboard",
  "Mouse",
  "Webcam",
  "Speaker",
  "Charger",
  "Cable",
  "Case",
  "Stand",
  "Adapter",
  "Battery",
  "Printer",
  "Router",
  "USB Drive",
  "External HDD",
  "SSD",
  "Graphics Card",
  "RAM Module",
  "Motherboard",
];
const statuses = [
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Returned",
  "On Hold",
];
const countries = [
  "USA",
  "Canada",
  "UK",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Japan",
  "Australia",
  "Brazil",
  "Mexico",
  "Netherlands",
  "Sweden",
  "Norway",
  "India",
  "China",
  "South Korea",
  "Singapore",
];
const paymentMethods = [
  "Credit Card",
  "PayPal",
  "Debit Card",
  "Bank Transfer",
  "Apple Pay",
  "Google Pay",
  "Crypto",
  "Cash on Delivery",
];
const shippingMethods = [
  "Standard",
  "Express",
  "Next Day",
  "International",
  "2-Day",
  "Ground",
];

// Helper functions for HIGH ENTROPY data
const generateGUID = () => {
  return crypto.randomUUID();
};

const generateTransactionHash = () => {
  // 64 character hex hash - very high entropy
  return crypto.randomBytes(32).toString("hex");
};

const generateSessionID = () => {
  // 40 character hex string
  return crypto.randomBytes(20).toString("hex");
};

const generateUniqueEmail = (orderId) => {
  // Each email is unique with timestamp and random component
  const domains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "company.com",
  ];
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `user_${orderId}_${randomPart}@${
    domains[Math.floor(Math.random() * domains.length)]
  }`;
};

const generateIPAddress = () => {
  // Random IPv4 address
  return `${Math.floor(Math.random() * 256)}.${Math.floor(
    Math.random() * 256
  )}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
};

const generateUserAgent = () => {
  // Random user agent string with version numbers - high entropy
  const browsers = ["Chrome", "Firefox", "Safari", "Edge", "Opera"];
  const os = [
    "Windows NT 10.0",
    "Macintosh; Intel Mac OS X 10_15_7",
    "X11; Linux x86_64",
    "iPhone; CPU iPhone OS 16_0",
  ];
  const version = `${Math.floor(Math.random() * 100)}.${Math.floor(
    Math.random() * 10
  )}.${Math.floor(Math.random() * 1000)}.${Math.floor(Math.random() * 100)}`;
  return `Mozilla/5.0 (${os[Math.floor(Math.random() * os.length)]}) ${
    browsers[Math.floor(Math.random() * browsers.length)]
  }/${version}`;
};

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (array) => array[Math.floor(Math.random() * array.length)];
const randomPrice = () => (Math.random() * 1000 + 10).toFixed(2);
const randomTimestamp = (startYear = 2020, endYear = 2025) => {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  const randomTime = start + Math.random() * (end - start);
  return new Date(randomTime).toISOString(); // Full timestamp with milliseconds
};

// Generate a single row of HIGH ENTROPY data
const generateRow = (orderId) => {
  const orderGUID = generateGUID(); // High entropy
  const customerGUID = generateGUID(); // High entropy
  const transactionHash = generateTransactionHash(); // Very high entropy
  const sessionID = generateSessionID(); // High entropy
  const orderTimestamp = randomTimestamp(); // High entropy with milliseconds

  const firstName = randomChoice(firstNames);
  const lastName = randomChoice(lastNames);
  const customerName = `${firstName} ${lastName}`;
  const customerEmail = generateUniqueEmail(orderId); // Unique per order - high entropy

  const product = randomChoice(products);
  const quantity = randomInt(1, 10);
  const unitPrice = randomPrice();
  const totalAmount = (quantity * parseFloat(unitPrice)).toFixed(2);
  const status = randomChoice(statuses);
  const country = randomChoice(countries);
  const paymentMethod = randomChoice(paymentMethods);
  const shippingMethod = randomChoice(shippingMethods);

  const ipAddress = generateIPAddress(); // High entropy
  const userAgent = generateUserAgent(); // Very high entropy

  // Random tracking number - high entropy
  const trackingNumber = `TRK-${crypto
    .randomBytes(8)
    .toString("hex")
    .toUpperCase()}`;

  // Random notes field with varying content - high entropy
  const notes = `Order processed at ${Date.now()}-${Math.random()
    .toString(36)
    .substring(2)}`;

  return [
    orderId,
    orderGUID,
    customerGUID,
    orderTimestamp,
    customerName,
    customerEmail,
    product,
    quantity,
    unitPrice,
    totalAmount,
    status,
    country,
    paymentMethod,
    shippingMethod,
    transactionHash,
    sessionID,
    ipAddress,
    userAgent,
    trackingNumber,
    notes,
  ]
    .map((field) => {
      // Escape commas and quotes in CSV
      const str = String(field);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(",");
};

// Main generation function
const generateCSV = () => {
  console.log("🚀 Starting HIGH ENTROPY CSV generation...");
  console.log(`   Target: ${NUM_ROWS.toLocaleString()} rows`);
  console.log(`   Columns: 20`);
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log("");
  console.log("⚡ High Entropy Fields:");
  console.log("   • OrderGUID (UUID v4)");
  console.log("   • CustomerGUID (UUID v4)");
  console.log("   • TransactionHash (64 char hex)");
  console.log("   • SessionID (40 char hex)");
  console.log("   • Unique CustomerEmail per order");
  console.log("   • Random IP Address");
  console.log("   • Random User Agent string");
  console.log("   • Tracking Number (hex)");
  console.log("   • Dynamic Notes field");
  console.log("");
  console.log("⚠️  This data will NOT compress well in QVD format!");
  console.log("");

  const startTime = Date.now();

  // Create write stream
  const stream = fs.createWriteStream(OUTPUT_FILE, { flags: "w" });

  // Write header (20 columns)
  const header =
    "OrderID,OrderGUID,CustomerGUID,OrderTimestamp,CustomerName,CustomerEmail,Product,Quantity,UnitPrice,TotalAmount,Status,Country,PaymentMethod,ShippingMethod,TransactionHash,SessionID,IPAddress,UserAgent,TrackingNumber,Notes\n";
  stream.write(header);

  let rowsWritten = 0;

  // Generate and write rows in batches
  const writeBatch = () => {
    let batch = "";
    const batchEnd = Math.min(rowsWritten + BATCH_SIZE, NUM_ROWS);

    for (let i = rowsWritten; i < batchEnd; i++) {
      batch += generateRow(i + 1) + "\n";
    }

    stream.write(batch);
    rowsWritten = batchEnd;

    // Progress reporting every 1M rows
    if (rowsWritten % 1_000_000 === 0 || rowsWritten === NUM_ROWS) {
      const now = Date.now();
      const elapsed = ((now - startTime) / 1000).toFixed(1);
      const rate = Math.round((rowsWritten / (now - startTime)) * 1000);
      const progress = ((rowsWritten / NUM_ROWS) * 100).toFixed(1);

      console.log(
        `   ${rowsWritten.toLocaleString()} rows (${progress}%) - ${elapsed}s elapsed - ${rate.toLocaleString()} rows/sec`
      );
    }

    if (rowsWritten < NUM_ROWS) {
      // Schedule next batch
      setImmediate(writeBatch);
    } else {
      // All done
      stream.end(() => {
        const endTime = Date.now();
        const totalTime = ((endTime - startTime) / 1000).toFixed(1);
        const fileSize = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(
          2
        );

        console.log("");
        console.log("✅ HIGH ENTROPY CSV generation complete!");
        console.log(`   Rows: ${NUM_ROWS.toLocaleString()}`);
        console.log(`   Columns: 20`);
        console.log(`   File size: ${fileSize} MB`);
        console.log(`   Time: ${totalTime} seconds`);
        console.log(
          `   Average rate: ${Math.round(
            NUM_ROWS / totalTime
          ).toLocaleString()} rows/sec`
        );
        console.log("");
        console.log("💡 Next steps:");
        console.log("   Convert to QVD using Qlik Sense or QlikView");
        console.log("   Expect larger QVD file size due to high entropy data");
        console.log("");
      });
    }
  };

  // Start writing
  writeBatch();
};

// Run the generator
console.log("");
console.log("═══════════════════════════════════════════");
console.log("  HIGH ENTROPY CSV Generator for QVD Testing");
console.log("═══════════════════════════════════════════");
console.log("");

generateCSV();
