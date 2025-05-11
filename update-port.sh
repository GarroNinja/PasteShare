#!/bin/bash

# This script copies the server port from server/server-port.txt to client/public/server-port.txt
# Run this script when the server port changes

# Path to the server port file
SERVER_PORT_FILE="server/server-port.txt"
CLIENT_PORT_FILE="client/public/server-port.txt"

if [ -f "$SERVER_PORT_FILE" ]; then
  # Extract only the numeric part
  PORT=$(grep -o '[0-9]\+' "$SERVER_PORT_FILE")
  
  if [ -n "$PORT" ]; then
    echo "$PORT" > "$CLIENT_PORT_FILE"
    echo "Server port $PORT copied to client public directory"
  else
    echo "No valid port found in $SERVER_PORT_FILE"
    exit 1
  fi
else
  echo "Server port file not found: $SERVER_PORT_FILE"
  exit 1
fi 