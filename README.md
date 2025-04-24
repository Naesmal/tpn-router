# TPN Router

A powerful, dynamic routing tool for the TPN decentralized VPN network, inspired by Tor's circuit-based routing approach.

> ⚠️ **Note**: This project was developed for the TPN Hackathon at Endgame Summit.

## Overview

TPN Router is a sophisticated command-line tool that enables you to create anonymous VPN connections through the TPN network. It supports both simple direct connections and advanced multi-hop routing similar to Tor, allowing you to route your traffic through different countries and significantly enhancing your privacy and security online.

### Key Features

- **Simple Mode**: Connect directly to a VPN server in your chosen country
- **Circuit Mode**: Create multi-hop routing circuits to mask your origin (advanced)
- **Geographic Control**: Specify preferred countries for your VPN connections
- **Interactive Country Selection**: Choose countries with an intuitive interface
- **Intuitive CLI**: Clean and minimalist command-line interface for ease of use
- **Detailed Logging**: Comprehensive logging to track connection status and details

## Installation

### Prerequisites

- **Node.js 16 or higher**
- **WireGuard Tools**
  - Mac: `brew install wireguard-tools`
  - Linux (Debian/Ubuntu): 
    ```bash
    sudo apt update
    sudo apt install -y wireguard wireguard-tools resolvconf
    ```
  - Note: `resolvconf` is required for DNS configuration with WireGuard

### Install from Source

```bash
# Clone the repository
git clone https://github.com/Naesmal/tpn-router.git
cd tpn-router

# Install dependencies
npm install

# Build the project
npm run build

# Link the CLI globally (optional)
npm link
```

## Getting Started

TPN Router requires root/administrator privileges to configure network interfaces. You can run commands in two ways:

### Using the Global Installation

If you've installed TPN Router globally:

```bash
sudo tpn-router connect --country FR
```

### Using Local Installation

If you're running from a local installation:

```bash
# When running from the project directory
sudo npm start -- connect --country FR

# Explanation:
# - "npm start" runs the Node.js application
# - "--" separates npm arguments from application arguments
# - "connect" is the TPN Router command to create a VPN connection
# - "--country FR" specifies you want to connect through a server in France
```

## Usage Guide

### Quick Start

The simplest and most reliable way to use TPN Router is through direct connection:

```bash
# Connect to a VPN server in France
sudo npm start -- connect --country FR

# Check the status of your connection
sudo npm start -- status

# Disconnect
sudo npm start -- stop

# Reconnect (to the same or different country)
sudo npm start -- reconnect --country US
```

### Detailed Commands Reference

#### `connect` - Connect directly to a VPN server

```bash
# Connect to a VPN server in a specific country
sudo tpn-router connect --country FR

# Connect to any country (random)
sudo tpn-router connect
```

#### `start` - Start a routing circuit

```bash
# Start with default settings (simple direct connection)
sudo tpn-router start

# Start in circuit mode with 3 hops through random countries
sudo tpn-router start --mode circuit

# Start with specific countries
sudo tpn-router start --countries US,NL,BR

# Start with interactive country selection
sudo tpn-router start --interactive
```

#### `stop` - Stop the current VPN connection

```bash
sudo tpn-router stop
```

#### `status` - Display current connection details

```bash
sudo tpn-router status
```

This command shows:
- Active connection status
- Country and endpoint information
- Expiration time and remaining time
- Your current public IP address

#### `reconnect` - Reconnect to VPN (replacing refresh and exit)

```bash
# Reconnect to a random country
sudo tpn-router reconnect

# Reconnect to a specific country
sudo tpn-router reconnect --country DE
```

#### `test` - Test a direct connection

```bash
# Test a connection to a specific country
sudo tpn-router test --country FR

# Test a connection to any random country
sudo tpn-router test
```

#### `configure` - Configure application settings

```bash
sudo tpn-router configure
```

You'll be prompted to set:
- Default circuit length
- Default lease duration (in minutes)
- Preferred countries (comma-separated country codes)
- Log level (debug, info, warn, error)

#### `countries` - List available countries in the TPN network

```bash
# List countries from a random validator
sudo tpn-router countries

# List all countries from all validators
sudo tpn-router countries --all
```

## Troubleshooting

### Common Issues

1. **Permission denied**: Make sure to run TPN Router with `sudo` or administrator privileges
   ```bash
   sudo tpn-router connect --country FR
   ```

2. **WireGuard not installed**: Ensure WireGuard tools are properly installed
   ```bash
   which wg
   which wg-quick
   ```

3. **resolvconf not found**: Install and enable resolvconf
   ```bash
   sudo apt install resolvconf
   sudo systemctl start resolvconf.service
   sudo systemctl enable resolvconf.service
   ```

4. **Connection not working (IP not changing)**: Try the `test` command to verify connectivity
   ```bash
   sudo tpn-router test --country FR
   ```

5. **Cannot determine IP address**: Sometimes IP checking services may be unreliable. Try manually checking your IP.

6. **Socket hang up or connection errors**: TPN validators might be temporarily unavailable. Try again later or use a different validator
   ```bash
   sudo tpn-router validator check
   ```

## Architecture

TPN Router implements a simplified architecture focused on reliable VPN connections:

1. **WireGuard Manager**: Handles WireGuard configurations and interfaces
2. **Connection Handler**: Manages VPN connections 
3. **TPN Client**: Interfaces with the TPN network API
4. **Validator Manager**: Manages the validator endpoints

## Security Considerations

- All traffic is encrypted using WireGuard's state-of-the-art cryptography
- Your original IP is masked from destination servers
- In circuit mode, multiple hops prevent any single node from knowing both source and destination

## About TPN Hackathon

This project was developed as part of the TPN Hackathon for the Endgame Summit. TPN is a decentralized VPN infrastructure that provides access to a diverse set of VPN server options around the world. The network incentivizes miners to run VPN servers in unique locations, creating a robust and distributed network.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- TPN Network for providing the decentralized VPN infrastructure and hosting the Hackathon
- WireGuard for the secure VPN protocol
- The Tor Project for inspiration on circuit-based routing
- Endgame Summit for the Hackathon opportunity

---

*TPN Router - Enhancing your privacy through TPN's decentralized VPN network*