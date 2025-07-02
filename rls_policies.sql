-- =================================================================
-- Row Level Security (RLS) Policies for Face Swap Application
-- =================================================================
-- This file contains comprehensive RLS policies for all tables with RLS enabled
-- Users can only access their own data, with some exceptions for public tables

-- =================================================================
-- First, enable RLS for verification table (it was missing in schema)
-- =================================================================
ALTER TABLE public.verification ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- 1. User Table Policies
-- =================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public."user"
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = id );

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public."user"
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = id )
WITH CHECK ( (SELECT auth.uid()::text) = id );

-- Users can insert their own profile (for OAuth registration)
CREATE POLICY "Users can insert own profile" ON public."user"
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = id );

-- =================================================================
-- 2. Session Table Policies
-- =================================================================

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions" ON public.session
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own sessions
CREATE POLICY "Users can insert own sessions" ON public.session
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own sessions
CREATE POLICY "Users can update own sessions" ON public.session
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can delete their own sessions
CREATE POLICY "Users can delete own sessions" ON public.session
FOR DELETE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 3. Account Table Policies (OAuth accounts)
-- =================================================================

-- Users can view their own OAuth accounts
CREATE POLICY "Users can view own accounts" ON public.account
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own OAuth accounts
CREATE POLICY "Users can insert own accounts" ON public.account
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own OAuth accounts
CREATE POLICY "Users can update own accounts" ON public.account
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can delete their own OAuth accounts
CREATE POLICY "Users can delete own accounts" ON public.account
FOR DELETE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 4. Verification Table Policies (Email verification tokens)
-- =================================================================

-- Allow inserting verification tokens for any identifier
CREATE POLICY "Allow inserting verification tokens" ON public.verification
FOR INSERT 
TO authenticated, anon
WITH CHECK ( true );

-- Allow reading verification tokens by identifier and value for verification
CREATE POLICY "Allow reading verification tokens for validation" ON public.verification
FOR SELECT 
TO authenticated, anon 
USING ( true );

-- Allow updating verification tokens (for cleanup)
CREATE POLICY "Allow updating verification tokens" ON public.verification
FOR UPDATE 
TO authenticated, anon
USING ( true )
WITH CHECK ( true );

-- Allow deleting used verification tokens
CREATE POLICY "Allow deleting verification tokens" ON public.verification
FOR DELETE 
TO authenticated, anon
USING ( true );

-- =================================================================
-- 5. Two Factor Authentication Policies
-- =================================================================

-- Users can view their own 2FA settings
CREATE POLICY "Users can view own 2FA" ON public.two_factor
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own 2FA settings
CREATE POLICY "Users can insert own 2FA" ON public.two_factor
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own 2FA settings
CREATE POLICY "Users can update own 2FA" ON public.two_factor
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can delete their own 2FA settings
CREATE POLICY "Users can delete own 2FA" ON public.two_factor
FOR DELETE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 6. Credit Package Policies (Public tables)
-- =================================================================

-- Everyone can view active credit packages
CREATE POLICY "Anyone can view active credit packages" ON public.credit_package
FOR SELECT 
TO authenticated, anon 
USING ( is_active = true );

-- =================================================================
-- 7. User Credit Balance Policies
-- =================================================================

-- Users can view their own credit balance
CREATE POLICY "Users can view own credit balance" ON public.user_credit_balance
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own credit balance
CREATE POLICY "Users can insert own credit balance" ON public.user_credit_balance
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own credit balance
CREATE POLICY "Users can update own credit balance" ON public.user_credit_balance
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 8. Credit Recharge Policies
-- =================================================================

-- Users can view their own recharge records
CREATE POLICY "Users can view own recharge records" ON public.credit_recharge
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own recharge records
CREATE POLICY "Users can insert own recharge records" ON public.credit_recharge
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own recharge records
CREATE POLICY "Users can update own recharge records" ON public.credit_recharge
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 9. Credit Transaction Policies
-- =================================================================

-- Users can view their own transaction history
CREATE POLICY "Users can view own transactions" ON public.credit_transaction
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Only authenticated users can insert transactions (typically done by backend)
CREATE POLICY "Authenticated users can insert transactions" ON public.credit_transaction
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 10. Credit Consumption Config Policies (Public configuration)
-- =================================================================

-- Everyone can view active consumption configs
CREATE POLICY "Anyone can view consumption configs" ON public.credit_consumption_config
FOR SELECT 
TO authenticated, anon 
USING ( is_active = true );

-- =================================================================
-- 11. Uploads Policies
-- =================================================================

-- Users can view their own uploads
CREATE POLICY "Users can view own uploads" ON public.uploads
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own uploads
CREATE POLICY "Users can insert own uploads" ON public.uploads
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own uploads
CREATE POLICY "Users can update own uploads" ON public.uploads
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can delete their own uploads
CREATE POLICY "Users can delete own uploads" ON public.uploads
FOR DELETE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 12. Face Swap History Policies
-- =================================================================

-- Users can view their own face swap history
CREATE POLICY "Users can view own face swap history" ON public.face_swap_history
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own face swap records
CREATE POLICY "Users can insert own face swap records" ON public.face_swap_history
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own face swap records
CREATE POLICY "Users can update own face swap records" ON public.face_swap_history
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can delete their own face swap records
CREATE POLICY "Users can delete own face swap records" ON public.face_swap_history
FOR DELETE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 13. Stripe Customer Policies
-- =================================================================

-- Users can view their own Stripe customer info
CREATE POLICY "Users can view own Stripe customer" ON public.stripe_customer
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own Stripe customer info
CREATE POLICY "Users can insert own Stripe customer" ON public.stripe_customer
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own Stripe customer info
CREATE POLICY "Users can update own Stripe customer" ON public.stripe_customer
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 14. Stripe Subscription Policies
-- =================================================================

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions" ON public.stripe_subscription
FOR SELECT 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert own subscriptions" ON public.stripe_subscription
FOR INSERT 
TO authenticated 
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can update their own subscriptions
CREATE POLICY "Users can update own subscriptions" ON public.stripe_subscription
FOR UPDATE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id )
WITH CHECK ( (SELECT auth.uid()::text) = user_id );

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete own subscriptions" ON public.stripe_subscription
FOR DELETE 
TO authenticated 
USING ( (SELECT auth.uid()::text) = user_id );

-- =================================================================
-- 15. Performance Optimization Indexes
-- =================================================================

-- Add indexes for RLS policy performance optimization
CREATE INDEX IF NOT EXISTS idx_user_credit_balance_user_id ON public.user_credit_balance(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_recharge_user_id ON public.credit_recharge(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_user_id ON public.credit_transaction(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON public.uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_face_swap_history_user_id ON public.face_swap_history(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customer_user_id ON public.stripe_customer(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscription_user_id ON public.stripe_subscription(user_id);
CREATE INDEX IF NOT EXISTS idx_session_user_id ON public.session(user_id);
CREATE INDEX IF NOT EXISTS idx_account_user_id ON public.account(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON public.two_factor(user_id);

-- =================================================================
-- Notes:
-- 1. All policies use (SELECT auth.uid()::text) for type compatibility
-- 2. Public tables (credit_package, credit_consumption_config) allow both authenticated and anon access
-- 3. Verification table allows broader access since it's used for email verification workflows
-- 4. All user-specific data is restricted to the authenticated user who owns it
-- 5. Indexes are added on user_id columns for better RLS performance
-- 6. Policies are separated by operation type (SELECT, INSERT, UPDATE, DELETE) as recommended
-- ================================================================= 