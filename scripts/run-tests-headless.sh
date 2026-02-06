#!/bin/bash
# Script to run VS Code extension tests in headless environment with xvfb

# Start Xvfb (X Virtual Framebuffer)
export DISPLAY=:99
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
XVFB_PID=$!

# Give Xvfb a moment to start
sleep 2

# Run the tests
cd /workspaces/ControlPanel
node ./test/runTest.js

# Capture the test exit code
TEST_EXIT_CODE=$?

# Clean up Xvfb
kill $XVFB_PID

# Exit with the test result
exit $TEST_EXIT_CODE