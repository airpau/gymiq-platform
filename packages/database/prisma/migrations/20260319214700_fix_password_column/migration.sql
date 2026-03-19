-- Fix password column name from 'password' to 'passwordHash'
-- This handles the case where the database has old schema

DO $$
BEGIN
    -- Check if the 'password' column exists and rename it to 'passwordHash'
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'password'
    ) THEN
        ALTER TABLE "users" RENAME COLUMN "password" TO "passwordHash";
        RAISE NOTICE 'Renamed users.password to users.passwordHash';
    END IF;

    -- Ensure passwordHash column exists if neither password nor passwordHash exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'passwordHash'
    ) THEN
        ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
        RAISE NOTICE 'Added users.passwordHash column';
    END IF;
END $$;