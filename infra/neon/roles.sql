-- Group roles for the hockey database. Run as hockey_owner, which owns the
-- database and every table (migrations run as it). Safe to run again.
--
-- These are NOLOGIN groups on purpose. Roles made through Neon's console or
-- API join neon_superuser and can always write, so the read-only role has to
-- be made here, in SQL. The login roles that join these groups are created at
-- deploy time, with passwords that go straight into Key Vault:
--
--   CREATE ROLE hockey_web LOGIN PASSWORD '...' IN ROLE hockey_read;
--   CREATE ROLE hockey_collector LOGIN PASSWORD '...' IN ROLE hockey_write;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hockey_read') THEN
    CREATE ROLE hockey_read NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hockey_write') THEN
    CREATE ROLE hockey_write NOLOGIN;
  END IF;
END
$$;

-- current_database(), so the same file sets up the local and test databases.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hockey_read, hockey_write', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO hockey_read, hockey_write;

-- The web app reads; only the collector writes. Neither can create or alter
-- tables: that is hockey_owner's, through migrations.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hockey_read;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hockey_write;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hockey_write;

-- And the same for every table migrations create from now on.
ALTER DEFAULT PRIVILEGES FOR ROLE hockey_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO hockey_read;
ALTER DEFAULT PRIVILEGES FOR ROLE hockey_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hockey_write;
ALTER DEFAULT PRIVILEGES FOR ROLE hockey_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hockey_write;
