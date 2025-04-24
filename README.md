# TPN Router

A powerful, dynamic routing tool for the TPN decentralized VPN network, inspired by Tor's circuit-based routing approach.

> ⚠️ **Note**: This project was developed for the TPN Hackathon at Endgame Summit.

![TPN Router](https://via.placeholder.com/800x400?text=TPN+Router)

## Overview

TPN Router is a sophisticated command-line tool that enables you to create anonymous, multi-hop VPN connections through the TPN network. By implementing dynamic routing capabilities similar to the Tor network, TPN Router allows you to route your traffic through multiple VPN servers in different countries, significantly enhancing your privacy and security online.

### Key Features

- **Multi-hop Routing**: Create dynamic routing circuits with multiple hops to mask your origin
- **Automatic Node Rotation**: Regularly rotate exit nodes to prevent tracking
- **Geographic Control**: Specify preferred countries for each hop in your VPN connections
- **Interactive Country Selection**: Choose countries for each hop with an interactive interface
- **Intuitive CLI**: Clean and minimalist command-line interface for ease of use
- **Automatic Management**: Smart connection management with automatic renewal before expiration
- **Detailed Logging**: Comprehensive logging to track circuit status and connection details

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
sudo tpn-router start
```

### Using Local Installation

If you're running from a local installation:

```bash
# When running from the project directory
sudo npm start -- start

# Explanation:
# - "npm start" runs the Node.js application
# - "--" separates npm arguments from application arguments
# - "start" is the TPN Router command to start a circuit
```

## Usage Guide

### Quick Start

To create a routing circuit with default settings:

```bash
sudo tpn-router start
# or with local installation
sudo npm start -- start
```

This creates a circuit with three hops through random countries.

### Detailed Commands Reference

#### `start` - Start a new routing circuit

```bash
# Start with 3 hops through random countries
sudo tpn-router start

# Start with a specific number of hops
sudo tpn-router start --length 4

# Start with specific countries
sudo tpn-router start --countries US,NL,BR

# Start with interactive country selection
sudo tpn-router start --interactive

# With local installation
sudo npm start -- start --length 4
```

#### `stop` - Stop the current routing circuit

```bash
sudo tpn-router stop
# or
sudo npm start -- stop
```

#### `status` - Display current routing details

```bash
sudo tpn-router status
# or
sudo npm start -- status
```

This command shows:
- Active circuit status
- Number of hops in the circuit
- Creation and expiration timestamps
- Complete circuit path with countries for each hop
- Current exit node country and endpoint
- Remaining time before expiration
- Your current public IP address

#### `refresh` - Refresh the current routing circuit

```bash
sudo tpn-router refresh
# or
sudo npm start -- refresh
```

#### `exit` - Change the exit node of the circuit

```bash
sudo tpn-router exit
# or
sudo npm start -- exit
```

#### `configure` - Configure application settings

```bash
sudo tpn-router configure
# or
sudo npm start -- configure
```

You'll be prompted to set:
- Default circuit length
- Default lease duration (in minutes)
- Preferred countries (comma-separated country codes)
- Log level (debug, info, warn, error)

#### `validator` - Manage TPN validator endpoints

```bash
# List all configured validators
sudo tpn-router validator list
# or
sudo npm start -- validator list

# Add a new validator
sudo tpn-router validator add --ip 185.189.44.166 --port 3000
# or
sudo npm start -- validator add --ip 185.189.44.166 --port 3000

# Check all validators
sudo tpn-router validator check
# or
sudo npm start -- validator check
```

#### `countries` - List available countries in the TPN network

```bash
# List countries from a random validator
sudo tpn-router countries
# or
sudo npm start -- countries

# List all countries from all validators
sudo tpn-router countries --all
# or
sudo npm start -- countries --all
```

## Troubleshooting

### Common Issues

1. **Permission denied**: Make sure to run TPN Router with `sudo` or administrator privileges
   ```bash
   sudo tpn-router start
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

4. **Socket hang up or connection errors**: TPN validators might be temporarily unavailable. Try again later or use a different validator
   ```bash
   sudo tpn-router validator check
   ```

5. **Country selection issues**: If you experience problems with country selection, try the interactive mode
   ```bash
   sudo tpn-router start --interactive
   ```

6. **Expired configuration**: If you see errors about expired configurations, check your system clock synchronization

## Architecture

TPN Router implements a sophisticated architecture consisting of several key components:

1. **Circuit Builder**: Creates and manages multi-hop routing circuits
2. **Route Manager**: Handles dynamic routing and connection lifecycle
3. **Connection Handler**: Manages WireGuard VPN connections
4. **TPN Client**: Interfaces with the TPN network API
5. **Validator Endpoint Manager**: Manages TPN validator endpoints

![Architecture Diagram](https://via.placeholder.com/800x500?text=TPN+Router+Architecture)

## Security Considerations

- TPN Router provides enhanced privacy through multi-hop routing
- All traffic is encrypted using WireGuard's state-of-the-art cryptography
- Your original IP is masked from destination servers
- Multiple hops prevent any single node from knowing both source and destination

## About TPN Hackathon

This project was developed as part of the TPN Hackathon for the Endgame Summit. TPN is a decentralized VPN infrastructure that provides access to a diverse set of VPN server options around the world. The network incentivizes miners to run VPN servers in unique locations, creating a robust and distributed network.

## Contribution

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch: `git checkout -b new-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- TPN Network for providing the decentralized VPN infrastructure and hosting the Hackathon
- WireGuard for the secure VPN protocol
- The Tor Project for inspiration on circuit-based routing
- Endgame Summit for the Hackathon opportunity

---

*TPN Router - Enhancing your privacy through dynamic multi-hop routing*