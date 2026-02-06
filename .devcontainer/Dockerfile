FROM mcr.microsoft.com/devcontainers/javascript-node:20

# Switch to root to install system packages
USER root

# Install Xvfb and required X11/Electron dependencies in a single layer
# Clean up apt cache to reduce image size
RUN apt-get update && apt-get install -y \
    xvfb \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libnss3 \
    libxss1 \
    libatk-bridge2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Switch back to node user for development
USER node
