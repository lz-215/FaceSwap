#!/bin/bash

# Face Swap Application - RLS Policy Application Script
# This script applies Row Level Security policies to the Supabase database

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required files exist
if [ ! -f "rls_policies.sql" ]; then
    print_error "rls_policies.sql file not found!"
    exit 1
fi

print_status "Face Swap Application - RLS Policy Application"
print_status "=============================================="

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    print_warning "Supabase CLI not found. Please install it first:"
    echo "npm install -g supabase"
    echo ""
    print_status "Alternatively, you can apply the policies manually:"
    echo "1. Copy the content of rls_policies.sql"
    echo "2. Go to your Supabase Dashboard -> SQL Editor"
    echo "3. Paste and execute the SQL"
    exit 1
fi

# Prompt for confirmation
print_warning "This script will apply RLS policies to your database."
print_warning "Make sure you have backed up your database before proceeding."
echo ""
read -p "Do you want to continue? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_status "Operation cancelled."
    exit 0
fi

# Check if we're in a Supabase project
if [ ! -f "supabase/config.toml" ]; then
    print_error "Not in a Supabase project directory!"
    print_status "Please run this script from your project root directory."
    exit 1
fi

# Apply the policies
print_status "Applying RLS policies..."

# Try to apply to local development database first
if supabase status | grep -q "API URL.*localhost"; then
    print_status "Applying to local development database..."
    
    # Get local database connection details
    DB_URL=$(supabase status | grep "DB URL" | awk '{print $3}')
    
    if [ -n "$DB_URL" ]; then
        print_status "Executing RLS policies on local database..."
        psql "$DB_URL" -f rls_policies.sql
        
        if [ $? -eq 0 ]; then
            print_status "✅ RLS policies applied successfully to local database!"
        else
            print_error "❌ Failed to apply RLS policies to local database."
            exit 1
        fi
    else
        print_warning "Could not detect local database URL."
        print_status "Please start your local Supabase instance with: supabase start"
        exit 1
    fi
else
    print_warning "Local Supabase not running or not found."
    print_status "You can apply the policies manually to your remote database:"
    echo "1. Go to your Supabase Dashboard"
    echo "2. Navigate to SQL Editor"
    echo "3. Copy and paste the content of rls_policies.sql"
    echo "4. Execute the SQL"
fi

# Verification
print_status ""
print_status "Verifying RLS policies..."
print_status "Run the following queries to verify the policies are applied:"
echo ""
echo "-- Check RLS enabled tables:"
echo "SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;"
echo ""
echo "-- Check policy count:"
echo "SELECT COUNT(*) as policy_count FROM pg_policies WHERE schemaname = 'public';"
echo ""
echo "-- List all policies:"
echo "SELECT schemaname, tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;"

print_status ""
print_status "✅ RLS policy application completed!"
print_status "Please verify the policies are working correctly before deploying to production."
print_status ""
print_status "Next steps:"
echo "1. Test your application functionality"
echo "2. Verify user data isolation"
echo "3. Check performance with the new indexes"
echo "4. Deploy to production when ready" 