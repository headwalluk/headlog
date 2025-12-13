# Database Query Reference

## Ad-hoc Queries

When running ad-hoc database queries in this project, use one of these methods:

### Method 1: Helper Script (Recommended)
```bash
./scripts/db-query.sh "YOUR SQL QUERY"
```

Example:
```bash
./scripts/db-query.sh "SHOW TABLES;"
./scripts/db-query.sh "SELECT * FROM hosts LIMIT 5;"
./scripts/db-query.sh "DESCRIBE hosts;"
```

### Method 2: Direct Command
```bash
source .env && mysql -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -e "YOUR QUERY"
```

## Common Queries

### Show all tables
```bash
./scripts/db-query.sh "SHOW TABLES;"
```

### Describe table structure
```bash
./scripts/db-query.sh "DESCRIBE table_name;"
```

### Count records
```bash
./scripts/db-query.sh "SELECT COUNT(*) FROM table_name;"
```

### Show recent records
```bash
./scripts/db-query.sh "SELECT * FROM table_name ORDER BY created_at DESC LIMIT 10;"
```
