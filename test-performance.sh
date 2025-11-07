#!/bin/bash

# Performance Test Runner for Large QVD Files
# This script runs the performance tests and displays results

echo "================================"
echo "🚀 QVD Viewer Performance Test"
echo "================================"
echo ""
echo "Available tests:"
echo "  1. Small vs Large comparison (chicago_taxi_rides vs colors.qvd)"
echo "  2. Chicago Taxi detailed test (~38 MB, 1.7M rows)"
echo "  3. Component breakdown analysis"
echo "  4. All Large QVD files in test-data/fake_data/large_qvd"
echo ""

cd "$(dirname "$0")"

# Check what's available to test
echo "Checking for test files..."
LARGE_QVD_DIR="test-data/fake_data/large_qvd"
if [ -d "$LARGE_QVD_DIR" ]; then
    QVD_COUNT=$(ls -1 "$LARGE_QVD_DIR"/*.qvd 2>/dev/null | wc -l)
    if [ $QVD_COUNT -gt 0 ]; then
        echo "✓ Found $QVD_COUNT large QVD file(s) in $LARGE_QVD_DIR"
        ls -lh "$LARGE_QVD_DIR"/*.qvd | awk '{print "  - " $9 " (" $5 ")"}'
    else
        echo "⚠️  No QVD files found in $LARGE_QVD_DIR"
        echo "   Generate CSV and convert to QVD first"
    fi
else
    echo "⚠️  Directory $LARGE_QVD_DIR not found"
fi

echo ""
echo "Running all performance tests..."
echo ""

# Run all performance tests
TEST_OUTPUT=$(npm test -- --grep "Performance" 2>&1)
TEST_EXIT_CODE=$?

# Display the test output
echo "$TEST_OUTPUT"


# Parse the test results to extract timing information
echo ""
echo "================================"
echo "📊 Summary"
echo "================================"
echo ""

# Analyze and provide conclusion
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All performance tests passed!"
    echo ""
    echo "📝 See docs/PERFORMANCE_INVESTIGATION.md for:"
    echo "  • Detailed performance breakdown"
    echo "  • Root cause analysis"
    echo "  • Optimization recommendations"
else
    echo "❌ Some tests failed. Check the output above for details."
fi

echo ""

exit $TEST_EXIT_CODE
