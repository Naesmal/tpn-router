# TPN Router

A dynamic routing tool for the TPN decentralized VPN network, inspired by Tor's circuit-based routing approach.

## Overview

TPN Router is a command-line tool that allows you to create anonymous, multi-hop VPN connections through the TPN network. It provides dynamic routing capabilities similar to Tor, allowing you to route your traffic through multiple VPN servers in different countries for enhanced privacy and security.

Key features:
- Create dynamic routing circuits with multiple hops
- Automatically rotate exit nodes
- Specify preferred countries for your VPN connections
- Clean and minimalist command-line interface
- Automatic connection management and renewal

## Installation

### Prerequisites

- Node.js 16 or higher
- WireGuard tools
  - Mac: `brew install wireguard-tools`
  - Linux (Debian/Ubuntu): `sudo apt update && sudo apt install -y wireguard wireguard-tools`

### Install from NPM

```bash
npm install -g tpn-router
```

### Install from source

```bash
# Clone the repository
git clone https://github.com/yourusername/tpn-router.git
cd tpn-router

# Install dependencies
npm install

# Build the project
npm run build

# Link the CLI globally
npm link
```

## Usage

### Quick Start

To start a routing circuit with default settings:

```bash
tpn-router start
```

This will create a routing circuit with three hops through random countries.

### Commands

#### `start`

Start a new routing circuit.

```bash
# Start with 3 hops through random countries
tpn-router start

# Start with a specific number of hops
tpn-router start --length 4

# Start with specific countries
tpn-router start --countries US,NL,BR
```

#### `stop`

Stop the current routing circuit.

```bash
tpn-router stop
```

#### `status`

Display the current routing status.

```bash
tpn-router status
```

This will show:
- If a circuit is active
- Number of hops in the circuit
- Current exit node country and endpoint
- Time remaining before the circuit expires
- Your current public IP address

#### `refresh`

Refresh the current routing circuit.

```bash
tpn-router refresh
```

#### `exit`

Change the exit node of the current circuit.

```bash
tpn-router exit
```

#### `configure`

Configure the application settings.

```bash
tpn-router configure
```

This will prompt you to set:
- Default circuit length
- Default lease duration
- Preferred countries
- Log level

#### `validator`

Manage validator endpoints.

```bash
# List all configured validators
tpn-router validator list

# Add a new validator
tpn-router validator add --ip 192.168.1.1 --port 3000

# Check all validators
tpn-router validator check
```

#### `countries`

List available countries in the TPN network.

```bash
tpn-router countries
```

## Architecture

TPN Router consists of several key components:

1. **Circuit Builder**: Creates and manages multi-hop routing circuits
2. **Route Manager**: Handles the dynamic routing and connection lifecycle
3. **Connection Handler**: Manages WireGuard VPN connections
4. **TPN Client**: Interfaces with the TPN network API
5. **Validator Endpoint Manager**: Manages TPN validator endpoints

## Contribution

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- TPN Network for providing the decentralized VPN infrastructure
- WireGuard for the secure VPN protocol
- The Tor Project for inspiration on circuit-based routing