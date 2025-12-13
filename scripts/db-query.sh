#!/bin/bash
# Database Query Helper
# Usage: ./scripts/db-query.sh "SELECT * FROM users LIMIT 5"

THIS_DIR=$(dirname "${BASH_SOURCE}")
PROJECT_DIR=$(realpath "${THIS_DIR}/..")
DOTENV_FILE="${PROJECT_DIR}/.env"

set -e

# Load environment variables
if [ -f "${DOTENV_FILE}" ]; then
  source "${DOTENV_FILE}"
else
  echo "Error: .env file not found"
  exit 1
fi

if [ -z "${DB_USER}" ] || [ -z "${DB_PASSWORD}" ] || [ -z "${DB_NAME}" ]; then
  echo "Error: Database configuration variables (DB_USER, DB_PASSWORD, DB_NAME) are not set in .env"
  exit 1
fi

# Check if query is provided
if [ -z "$1" ]; then
  echo "Usage: $0 \"YOUR SQL QUERY\""
  echo "Example: $0 \"SELECT * FROM users LIMIT 5\""
  exit 1
fi

# Execute query
mysql -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -e "$1"
